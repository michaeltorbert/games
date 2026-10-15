// Issue #161 load-wait: pure analysis of one run directory. Reads only; the
// caller (run.mjs --mode check) writes results to its own new directory.
//
// Evidence validity is graded separately from what the tests did. Controls
// pass only when every validity check and every declared expectation holds.
// The faithful arm is never graded pass/fail for cause: it gets validity plus
// observed per-case shapes, and every label is an observation, not a cause.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FORBIDDEN_KEYS, LOSS_COUNTERS, urlKey } from './project.mjs';
import { Tracker } from './tracker.mjs';
import { checkInventory } from './inventory.mjs';

const readJsonl = file => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line, i) => {
  try { return JSON.parse(line); } catch { return { ev: '#unparsed', line: i + 1 }; }
});
const readJson = file => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);

export const CANARIES = ['CANARYQ7Z'];
const PROTOCOL_EVS = new Set(['cmd', 'evt', 'reply']);
const BOUNDARIES = ['test.functions.finished', 'context.close.entry', 'deleteContext.send', 'deleteContext.reply', 'context.public.close', 'connection.close', 'observer.exit'];

export function loadRun(dir) {
  const obsDir = path.join(dir, 'observer');
  const sinks = fs.existsSync(obsDir) ? fs.readdirSync(obsDir).filter(f => f.endsWith('.jsonl')).sort().map(f => ({ file: `observer/${f}`, recs: readJsonl(path.join(obsDir, f)) })) : [];
  const servers = {};
  for (const name of ['app', 'control']) {
    const f = path.join(dir, `server-${name}.jsonl`);
    if (fs.existsSync(f)) servers[name] = readJsonl(f);
  }
  return {
    dir, sinks, servers,
    meta: readJson(path.join(dir, 'meta.json')),
    status: readJson(path.join(dir, 'status.json')),
    report: readJson(path.join(dir, 'report.json')),
    effective: readJson(path.join(dir, 'effective-config.json')),
    runner: fs.existsSync(path.join(dir, 'runner.jsonl')) ? readJsonl(path.join(dir, 'runner.jsonl')) : [],
    sealed: fs.existsSync(path.join(dir, 'MANIFEST.sha256')),
    unsealedMarker: fs.existsSync(path.join(dir, 'UNSEALED-INCOMPLETE.txt')),
  };
}

// ---------------------------------------------------------------- report
export function reportCases(report) {
  const out = [];
  const visit = (suite, titles) => {
    for (const spec of suite.specs ?? []) for (const t of spec.tests ?? []) {
      for (const r of t.results ?? [{ status: 'not-run', retry: 0 }]) {
        out.push({ file: path.basename(spec.file ?? ''), title: spec.title, describe: titles, project: t.projectName, outcome: t.status, status: r.status, retry: r.retry ?? 0, workerIndex: r.workerIndex ?? null, durationMs: r.duration ?? null, skipReasons: (t.annotations ?? []).filter(a => a.type === 'skip').map(a => a.description ?? '') });
      }
    }
    for (const child of suite.suites ?? []) visit(child, [...titles, child.title]);
  };
  for (const s of report?.suites ?? []) visit(s, []);
  return out;
}
const caseKey = c => `${c.file}::${c.title}::${c.project}::${c.retry}`;

// ---------------------------------------------------------------- per sink
export function replaySink(recs) {
  const tracker = new Tracker();
  const terminals = new Map();
  for (const rec of recs) {
    if (!PROTOCOL_EVS.has(rec.ev)) continue;
    tracker.apply(rec);
    for (const d of tracker.drainDone()) terminals.set(`${d.key}#${d.hop}`, d);
  }
  return { tracker, terminals, pendingAtEnd: tracker.pendingList() };
}

const pendKey = p => `${p.conn}|${p.pp ?? ''}|${p.tgt ?? ''}|${p.rid}#${p.hop}`;

export function sinkFacts(sink) {
  const recs = sink.recs;
  const install = recs[0]?.ev === 'observer.install' ? recs[0] : null;
  const hooks = recs.find(r => r.ev === 'observer.hooks') ?? null;
  const exit = recs.find(r => r.ev === 'observer.exit') ?? null;
  const conns = new Set(recs.filter(r => PROTOCOL_EVS.has(r.ev) || r.ev === 'connection.first-seen').map(r => r.conn));
  const firstProtocol = recs.findIndex(r => PROTOCOL_EVS.has(r.ev));
  const replay = replaySink(recs);
  const tests = new Map();
  const touch = id => {
    if (!id) return null;
    const k = caseKey({ file: id.file, title: id.title, project: id.project, retry: id.retry });
    if (!tests.has(k)) tests.set(k, { key: k, id, sink: sink.file, registered: null, snapshots: {}, api: [], closeEnd: null });
    return tests.get(k);
  };
  let lastTest = null;
  const apiBegins = new Map();
  for (const r of recs) {
    if (r.ev === 'test.registered') { const t = touch(r.test); if (t) t.registered = r.seq; lastTest = t; }
    if (r.ev === 'snapshot') {
      const t = touch(r.test) ?? lastTest;
      if (t && !t.snapshots[r.boundary]) t.snapshots[r.boundary] = r;
      if (t) lastTest = t;
    }
    if (r.ev === 'api.begin') { const t = touch(r.test); apiBegins.set(r.seq, r); if (t) t.api.push({ api: r.api, begin: r.seq, end: null, ok: null, errorName: null }); }
    if (r.ev === 'api.end') {
      const b = apiBegins.get(r.beginSeq);
      const t = b && touch(b.test);
      const a = t?.api.find(x => x.begin === r.beginSeq);
      if (a) Object.assign(a, { end: r.seq, ok: r.ok, errorName: r.errorName });
    }
    if (r.ev === 'context.close.end' && lastTest && !lastTest.closeEnd) lastTest.closeEnd = r;
  }
  return { file: sink.file, install, hooks, exit, conns: [...conns], firstProtocol, replay, tests: [...tests.values()], recs };
}

// What happened later to each request listed in a boundary snapshot.
export function laterOutcomes(snapshot, replay) {
  return (snapshot?.pending ?? []).map(p => {
    const d = replay.terminals.get(pendKey(p));
    const later = d && (d.endSeq ?? 0) > snapshot.seq;
    return {
      url: p.url, type: p.type, stage: p.state, hop: p.hop,
      after: !d ? 'no-terminal-observed' : !later ? 'terminal-before-snapshot?' : d.state === 'failed' ? (d.canceled || d.errorCls === 'cancelled' ? 'cancelled-after-snapshot' : 'failed-after-snapshot') : `${d.state}-after-snapshot`,
      endSeq: d?.endSeq ?? null, goneReason: d?.goneReason ?? null,
    };
  });
}

// A definite later outcome: a protocol terminal after the snapshot, or the
// explicitly inferred loss of the request's target/page proxy reported by a
// protocol destroy event (tracker dropTarget). Absence is never an outcome.
export const DEFINITE_LATER = new Set(['cancelled-after-snapshot', 'failed-after-snapshot', 'finished-after-snapshot', 'memory-cache-after-snapshot', 'target-gone-after-snapshot']);

// Server observation completeness: consecutive seq from 1, the runner's ready
// and final probes recorded, no unparsed line, no injected fault.
export function serverCompleteness(recs) {
  const issues = [];
  if (!recs?.length) return { ok: false, issues: ['no server log records'] };
  if (recs[0].ev !== 'observer.ready') issues.push('first record is not observer.ready');
  recs.forEach((r, i) => { if (r.seq !== i + 1) issues.push(`seq gap at line ${i + 1}`); });
  if (recs.some(r => r.ev === '#unparsed')) issues.push('unparsed line');
  if (!recs.some(r => r.ev === 'request.start' && r.probe?.endsWith('-ready'))) issues.push('ready probe not recorded');
  if (!recs.some(r => r.ev === 'request.start' && r.probe?.endsWith('-final'))) issues.push('final probe not recorded');
  if (recs[0].faultInjected !== null && recs[0].faultInjected !== undefined) issues.push('fault injected');
  if (recs.some(r => r.ev === 'uncaught')) issues.push('server reported an uncaught exception');
  const exit = recs.find(r => r.ev === 'exit');
  if (exit?.writeFailures) issues.push(`${exit.writeFailures} write failure(s)`);
  return { ok: issues.length === 0, issues: issues.slice(0, 20), records: recs.length };
}

// Gate on a prerequisite directory's recorded result (pure). Every gate needs
// a verifying manifest, a PASS result and both pre- and post-run fingerprints
// equal to the expected candidate.
export function gateDecision(kind, { manifestOk, payload, expected }) {
  if (!manifestOk) return `${kind}: manifest does not verify`;
  if (!payload) return `${kind}: result missing`;
  const [verdict, pre, post] = kind === 'control'
    ? [payload.analysis?.kind === 'control' ? payload.verdict : `not a control check (${payload.analysis?.kind})`, payload.runFingerprint, payload.runPostFingerprint]
    : [payload.verdict, payload.fingerprint, payload.postFingerprint];
  if (verdict !== 'PASS') return `${kind}: verdict ${verdict}`;
  if (pre !== expected || post !== expected) return `${kind}: fingerprint ${pre}/${post} is not the expected ${expected}`;
  return null;
}

// Pre- and post-run identity: both must equal the expected candidate.
export function identityCheck(status) {
  const pre = status?.fingerprint?.match === true;
  const post = status?.postFingerprint?.match;
  if (pre && post === true) return { ok: true, severity: 'ok' };
  if (post === false || status?.fingerprint?.match === false) return { ok: false, severity: 'fail', detail: 'fingerprint drift before or after the run' };
  return { ok: false, severity: 'incomplete', detail: 'post-run fingerprint not recorded' };
}

// ---------------------------------------------------------------- privacy
function deepKeys(value, found, pathSoFar = '') {
  if (Array.isArray(value)) { value.forEach((v, i) => deepKeys(v, found, `${pathSoFar}[${i}]`)); return; }
  if (!value || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(k)) found.push(`${pathSoFar}.${k}`);
    deepKeys(v, found, `${pathSoFar}.${k}`);
  }
}

// Collector-owned files only. Stock Playwright outputs (report.json, cli logs,
// pw-output/) are retained as the release runner retains them and are listed,
// not scanned as collector output.
export function privacyScan(dir, extraCanaries = []) {
  const files = [];
  const walk = rel => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!['pw-output', 'cwd'].includes(p)) walk(p); continue; }
      if (/^(report\.json|cli-std(out|err)\.log|server-.*-std(out|err)\.log)$/.test(p) || p === 'MANIFEST.sha256') continue;
      files.push(p);
    }
  };
  walk('');
  const needles = [...CANARIES, ...extraCanaries, os.homedir(), path.resolve(dir, '..', '..', '..', '..', '..')].filter(n => n && n.length > 3);
  const hits = [];
  const forbidden = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const n of needles) if (text.includes(n)) hits.push({ file: f, needle: n === os.homedir() ? '<home>' : n.startsWith('/') ? '<repo-path>' : n });
    if (/\.(jsonl|json)$/.test(f)) {
      const found = [];
      for (const rec of f.endsWith('.jsonl') ? readJsonl(path.join(dir, f)) : [JSON.parse(text)]) deepKeys(rec, found);
      if (found.length) forbidden.push({ file: f, keys: [...new Set(found)].slice(0, 20) });
    }
  }
  return { ok: !hits.length && !forbidden.length, scanned: files.length, hits, forbidden };
}

// ---------------------------------------------------------------- validity
const check = (id, ok, detail = null, severity = 'fail') => ({ id, ok: !!ok, severity: ok ? 'ok' : severity, detail });

export function validity(run, { requireSealed = true } = {}) {
  const facts = run.sinks.map(sinkFacts);
  const checks = [];
  const st = run.status;
  checks.push(check('V0-run-status', st && st.writersExited === true && st.collection?.complete === true && !/^(INCOMPLETE|STOPPED|HARNESS)/.test(String(st.status ?? '')),
    st ? { status: st.status, writersExited: st.writersExited, collection: st.collection ?? null } : 'status.json missing', st ? 'incomplete' : 'fail'));
  const id = identityCheck(st);
  checks.push(check('V0-identity-before-after', id.ok, id.detail ?? null, id.severity));
  checks.push(check('V1-sinks-present', facts.length > 0, { sinks: facts.length }));
  const INCOMPLETE_GAPS = new Set(['sink-cap-dropped', 'test-info', 'sink-write-failed']);
  for (const f of facts) {
    const hooksOk = f.hooks && ['H1', 'H2', 'H3', 'H4'].every(h => f.hooks.hooks?.[h] === 'installed');
    checks.push(check(`V2-install-first:${f.file}`, f.install && f.install.workerIndex !== null && (f.firstProtocol === -1 || f.firstProtocol > 0) && hooksOk, { install: !!f.install, hooks: f.hooks?.hooks ?? null, firstProtocol: f.firstProtocol }));
    checks.push(check(`V3-observer-exit:${f.file}`, !!f.exit, f.exit ? { code: f.exit.code } : 'no observer.exit: observer interrupted; sink is incomplete', 'incomplete'));
    const gaps = f.exit?.gaps ?? {};
    const hard = Object.keys(gaps).filter(k => !INCOMPLETE_GAPS.has(k));
    checks.push(check(`V4-collector-gaps:${f.file}`, !hard.length, { gaps }));
    const soft = Object.keys(gaps).filter(k => INCOMPLETE_GAPS.has(k) && k !== 'test-info');
    checks.push(check(`V4-collection-loss:${f.file}`, !soft.length, { gaps: Object.fromEntries(soft.map(k => [k, gaps[k]])) }, 'incomplete'));
    // Possibly relevant protocol data not observed (any oversized nested payload,
    // undecodable or non-string nested messages, malformed identities).
    const loss = Object.fromEntries(LOSS_COUNTERS.map(k => [k, f.exit?.counters?.[k] ?? 0]).filter(([, n]) => n));
    checks.push(check(`V4-protocol-loss:${f.file}`, !Object.keys(loss).length, { loss, innerOversizedSkippedBytes: f.exit?.counters?.innerOversizedSkippedBytes ?? 0 }, 'incomplete'));
    const anomalies = f.replay.tracker.anomalyCount ?? 0;
    checks.push(check(`V4-tracker-anomalies:${f.file}`, anomalies === 0, { count: anomalies, first: f.replay.tracker.anomalies.slice(0, 10) }, 'incomplete'));
    const truncated = f.recs.filter(r => r.ev === 'snapshot' && r.truncated > 0).map(r => r.seq);
    checks.push(check(`V4-snapshot-truncation:${f.file}`, !truncated.length, { truncatedSnapshots: truncated }, 'incomplete'));
    const seqGaps = f.recs.filter((r, i) => i > 0 && r.seq !== f.recs[i - 1].seq + 1).length + f.recs.filter(r => r.ev === '#unparsed').length;
    checks.push(check(`V4-sink-continuity:${f.file}`, seqGaps === 0, { seqGaps }, 'incomplete'));
    const pid = f.install?.pid;
    checks.push(check(`V5-connection-ownership:${f.file}`, f.conns.every(c => typeof c === 'string' && c.startsWith(`p${pid}c`)), { conns: f.conns }));
  }
  const pids = facts.map(f => f.install?.pid);
  checks.push(check('V5-one-sink-per-process', new Set(pids).size === pids.length, { pids }));
  const workers = new Set(facts.map(f => f.install?.workerIndex));
  const cases = reportCases(run.report);
  const ranWorkers = new Set(cases.filter(c => c.workerIndex !== null && c.workerIndex >= 0).map(c => c.workerIndex));
  checks.push(check('V6-report-present', !!run.report, run.report ? { cases: cases.length } : 'report.json missing'));
  checks.push(check('V6-every-worker-observed', [...ranWorkers].every(w => workers.has(w)), { ranWorkers: [...ranWorkers], observedWorkers: [...workers] }));
  // Every executed (non-skipped) result has an observed pre-after-hooks boundary.
  const tests = new Map(facts.flatMap(f => f.tests.map(t => [t.key, t])));
  const executed = cases.filter(c => !['skipped', 'not-run'].includes(c.status));
  const missingH5 = executed.filter(c => !tests.get(caseKey(c))?.snapshots['test.functions.finished']).map(caseKey);
  checks.push(check('V7-pre-after-hooks-boundary', !missingH5.length, { executed: executed.length, missing: missingH5 }, facts.some(f => !f.exit) ? 'incomplete' : 'fail'));
  const missingClose = executed.filter(c => !tests.get(caseKey(c))?.snapshots['context.close.entry']).map(caseKey);
  checks.push(check('V7-close-entry-boundary', !missingClose.length, { missing: missingClose }, facts.some(f => !f.exit) ? 'incomplete' : 'fail'));
  // Servers: observer ready, runner ready probe seen, every request answered or closed.
  const expectedServers = run.meta?.mode === 'control' ? ['app', 'control'] : ['app'];
  for (const name of expectedServers) {
    const recs = run.servers[name];
    const sc = serverCompleteness(recs);
    const starts = (recs ?? []).filter(r => r.ev === 'request.start');
    const closed = new Set((recs ?? []).filter(r => r.ev === 'response.finish' || r.ev === 'response.close').map(r => r.req));
    checks.push(check(`V8-server-${name}`, sc.ok, { ...sc, requests: starts.length, unanswered: starts.filter(r => !closed.has(r.req)).length }, 'incomplete'));
  }
  const privacy = privacyScan(run.dir);
  checks.push(check('V9-privacy', privacy.ok, privacy));
  if (requireSealed) checks.push(check('V10-sealed', run.sealed && !run.unsealedMarker, { sealed: run.sealed, unsealedMarker: run.unsealedMarker }, 'incomplete'));
  const failed = checks.filter(c => c.severity === 'fail');
  const incomplete = checks.filter(c => c.severity === 'incomplete');
  return { verdict: failed.length ? 'INVALID' : incomplete.length ? 'INCOMPLETE' : 'VALID', checks, facts, cases, tests, servers: run.servers };
}

// ---------------------------------------------------------------- shapes
// The test's page: the most recent page of a context still open (not
// deleting/deleted) in the snapshot; otherwise the most recent page listed.
export function pickPage(snap) {
  const pages = snap?.pages ?? [];
  const open = new Set((snap?.contexts ?? []).filter(c => c.state === 'open').map(c => `${c.conn}|${c.ctx}`));
  const live = pages.filter(p => open.has(`${p.conn}|${p.ctx}`));
  return (live.length ? live : pages)[(live.length ? live : pages).length - 1] ?? null;
}

// Observed shape of one test, from its own boundary snapshots. Labels name
// what was seen; none of them is a cause, and N/L/T stay separate.
export function testShape(t, facts) {
  const s = t.snapshots;
  const pre = s['test.functions.finished'];
  const replay = facts.find(f => f.file === t.sink)?.replay;
  const goto = t.api.filter(a => a.api === 'page.goto' || a.api === 'page.reload');
  const lastGoto = goto[goto.length - 1] ?? null;
  const page = pickPage(pre ?? s['context.close.entry']);
  const order = BOUNDARIES.filter(b => s[b]).map(b => ({ boundary: b, seq: s[b].seq }));
  const labels = [];
  if (lastGoto && lastGoto.ok !== true && pre && pre.seq > lastGoto.begin) {
    if (!page?.nav) labels.push('N-shape: navigation not committed by the pre-after-hooks boundary');
    else if (page.nav.dcl && !page.nav.load) labels.push('L-shape: main-frame DOMContentLoaded observed, load not observed');
    else if (!page.nav.dcl) labels.push('pre-DCL navigation wait');
  }
  if (s['context.close.entry'] && !s['context.public.close']) labels.push('T-shape: context close entered, public close not observed');
  if (s['deleteContext.send'] && !s['deleteContext.reply']) labels.push('T-shape: deleteContext sent, no reply observed');
  return {
    key: t.key, sink: t.sink, status: pre?.status ?? null, labels, order,
    goto: lastGoto, page,
    pendingAt: Object.fromEntries(['test.functions.finished', 'context.close.entry', 'deleteContext.send'].filter(b => s[b]).map(b => [b, { count: s[b].pendingCount, truncated: s[b].truncated, later: replay ? laterOutcomes(s[b], replay) : null }])),
    closeEnd: t.closeEnd ? { ok: t.closeEnd.ok, errorName: t.closeEnd.errorName ?? null } : null,
  };
}

// Inferred only: server records whose sanitized URL equals a pending browser request's.
export function serverCandidates(pending, serverRecs) {
  if (!serverRecs) return [];
  const starts = serverRecs.filter(r => r.ev === 'request.start');
  const ends = new Map(serverRecs.filter(r => r.ev === 'response.finish' || r.ev === 'response.close').map(r => [r.req, r]));
  return pending.map(p => {
    const k = urlKey(p.url);
    const c = starts.filter(r => urlKey(r.url) === k);
    return { url: p.url, join: 'inferred-by-sanitized-url', candidates: c.length, outcomes: c.slice(-5).map(r => ({ req: r.req, end: ends.get(r.req)?.ev ?? 'none', finished: ends.get(r.req)?.finished ?? null, status: ends.get(r.req)?.status ?? null })) };
  });
}

// ---------------------------------------------------------------- controls
const byTitle = (v, prefix) => [...v.tests.values()].find(t => t.id.title.startsWith(prefix));
const caseBy = (v, prefix) => v.cases.find(c => c.title.startsWith(prefix));
const doneFor = (v, t) => [...(v.facts.find(f => f.file === t?.sink)?.replay.terminals.values() ?? [])];
const pathIs = (u, p) => u && u.path === p;

// Server-side record of the held image (inferred join by sanitized path).
function heldServer(recs) {
  const start = (recs ?? []).filter(r => r.ev === 'request.start' && pathIs(r.url, '/ctl/hold.png')).pop();
  if (!start) return null;
  const close = recs.find(r => r.ev === 'response.close' && r.req === start.req);
  const sock = recs.find(r => r.ev === 'socket.close' && r.sock === start.sock);
  return { join: 'inferred-by-sanitized-path', headersSent: close?.headersSent ?? null, finished: close?.finished ?? null, socketBytesWritten: sock?.bytesWritten ?? null };
}

function normalCloseOrder(t) {
  const s = t?.snapshots ?? {};
  const e = s['context.close.entry'], d = s['deleteContext.send'], r = s['deleteContext.reply'], pc = s['context.public.close'];
  return !!(e && d && r && pc && e.seq < d.seq && d.seq < r.seq && r.ok === true && t.closeEnd?.ok === true);
}

export const CONTROL_EXPECT = [
  ['C1', 'normal load, no pending at close entry, ordered close', (v) => {
    const t = byTitle(v, 'C1'); const c = caseBy(v, 'C1');
    const pending = (t?.snapshots['context.close.entry']?.pending ?? []).filter(p => p.url?.path !== '/favicon.ico');
    return { ok: c?.status === 'passed' && normalCloseOrder(t) && pending.length === 0, detail: { status: c?.status, pending: pending.map(p => [p.url?.path, p.state]), order: t && testShape(t, v.facts).order } };
  }],
  ['C2', 'redirect hops share requestId with consecutive hop ordinals', (v) => {
    const t = byTitle(v, 'C2'); const done = doneFor(v, t);
    const docs = done.filter(d => d.type === 'Document' && d.url?.cls === 'local-control' && /^\/ctl\/redirect\/[0-3]$/.test(d.url.path ?? ''));
    const byRid = new Map(); for (const d of docs) byRid.set(`${d.conn}|${d.pp}|${d.tgt}|${d.rid}`, [...(byRid.get(`${d.conn}|${d.pp}|${d.tgt}|${d.rid}`) ?? []), d]);
    const chains = [...byRid.values()].map(ch => ch.sort((a, b) => a.hop - b.hop));
    // A process swap may move the navigation to a new target under a new
    // requestId (wkPage.js:939-948); the old chain then ends target-gone.
    const consecutive = chains.every(ch => ch.every((d, i) => d.hop === i));
    const redirected = docs.filter(d => d.state === 'redirected');
    const final = docs.filter(d => d.state === 'finished' && d.url.path === '/ctl/redirect/0');
    const good = consecutive && chains.some(ch => ch.length >= 2) && redirected.length >= 1 && redirected.every(d => d.redirectStatus === 302) && final.length === 1;
    return { ok: caseBy(v, 'C2')?.status === 'passed' && good, detail: { chains: chains.map(ch => ch.map(d => [d.hop, d.state, d.url?.path])), redirected: redirected.length } };
  }],
  ['C3', 'HTTP 404 is a finished response; reset is a failure without headers', (v) => {
    const t = byTitle(v, 'C3'); const done = doneFor(v, t);
    const e404 = done.find(d => pathIs(d.url, '/ctl/status/404'));
    const reset = done.find(d => pathIs(d.url, '/ctl/reset'));
    return { ok: caseBy(v, 'C3')?.status === 'passed' && e404?.state === 'finished' && e404.status === 404 && reset?.state === 'failed' && reset.hadHeaders === false && reset.errorCls !== 'cancelled', detail: { e404: e404 && [e404.state, e404.status], reset: reset && [reset.state, reset.errorCls, reset.hadHeaders] } };
  }],
  ['C4', 'same URL twice gives two request identities; canaries absent', (v) => {
    const t = byTitle(v, 'C4'); const done = doneFor(v, t).filter(d => pathIs(d.url, '/ctl/repeat.json'));
    const keys = new Set(done.map(d => `${d.key}#${d.hop}`));
    return { ok: caseBy(v, 'C4')?.status === 'passed' && keys.size >= 2 && new Set(done.map(d => d.urlKey)).size === 1 && done.every(d => d.state === 'finished' && d.url.qk?.includes('token')), detail: { identities: keys.size } };
  }],
  ['C5', 'held body: pending with headers at pre-after-hooks, close entry and the deleteContext send cutoff (in that order); DCL without load; a definite later outcome after the cutoff', (v) => {
    const t = byTitle(v, 'C5'); const c = caseBy(v, 'C5');
    if (!t) return { ok: false, detail: 'no observed test' };
    const s = t.snapshots;
    const shape = testShape(t, v.facts);
    const held = b => (s[b]?.pending ?? []).find(p => pathIs(p.url, '/ctl/hold.png') && p.state === 'headers');
    const pre = s['test.functions.finished'], entry = s['context.close.entry'], send = s['deleteContext.send'];
    const ordered = !!(pre && entry && send && pre.seq < entry.seq && entry.seq < send.seq);
    const later = shape.pendingAt['deleteContext.send']?.later?.find(l => pathIs(l.url, '/ctl/hold.png'));
    return {
      ok: c?.status === 'timedOut' && pre?.status === 'timedOut' && ordered && !!held('test.functions.finished') && !!held('context.close.entry') && !!held('deleteContext.send')
        && shape.page?.nav?.dcl === true && shape.page?.nav?.load === false && DEFINITE_LATER.has(later?.after),
      detail: {
        status: c?.status, ordered, labels: shape.labels, order: shape.order, laterOutcome: later?.after ?? null, goneReason: later?.goneReason ?? null,
        // Diagnostic only, never acceptance: the browser-side state of the held
        // request at each boundary, and the server's own record of it (a server
        // headersSent is not evidence that the browser surfaced a response).
        heldBrowserState: Object.fromEntries(['test.functions.finished', 'context.close.entry', 'deleteContext.send'].map(b => [b, (s[b]?.pending ?? []).find(p => pathIs(p.url, '/ctl/hold.png'))?.state ?? null])),
        heldServerSide: heldServer(v.servers?.control),
      },
    };
  }],
  ['C6', 'Football page via stock fixtures: DCL and load, real resources finished, ordered close', (v) => {
    const t = byTitle(v, 'C6'); const c = caseBy(v, 'C6');
    const done = doneFor(v, t).filter(d => d.url?.cls === 'local-app');
    const nav = pickPage(t?.snapshots['test.functions.finished'])?.nav;
    return { ok: c?.status === 'passed' && nav?.dcl === true && nav?.load === true && pathIs(nav?.url, '/football/') && done.filter(d => d.state === 'finished').length >= 5 && normalCloseOrder(t), detail: { status: c?.status, finished: done.filter(d => d.state === 'finished').length, nav } };
  }],
];

export function analyzeControl(run) {
  const v = validity(run);
  const expectations = CONTROL_EXPECT.map(([id, what, fn]) => {
    let r;
    try { r = fn(v); } catch (e) { r = { ok: false, detail: `analysis error ${e?.name ?? 'Error'}` }; }
    return { id, what, ok: !!r.ok, detail: r.detail };
  });
  const verdict = v.verdict !== 'VALID' ? (v.verdict === 'INCOMPLETE' ? 'INCOMPLETE' : 'FAIL') : expectations.every(e => e.ok) ? 'PASS' : 'FAIL';
  return { kind: 'control', verdict, validity: { verdict: v.verdict, checks: v.checks }, expectations, workers: v.facts.map(f => f.install?.workerIndex) };
}

export function analyzeFaithful(run) {
  const v = validity(run);
  // The executed report and effective settings must match the original exposure.
  const inventory = checkInventory(run.report, run.effective, run.meta?.specSha256 ?? null);
  const evidence = [v.verdict, inventory.verdict].includes('INVALID') ? 'INVALID' : [v.verdict, inventory.verdict].includes('INCOMPLETE') ? 'INCOMPLETE' : 'VALID';
  const shapes = [...v.tests.values()].map(t => testShape(t, v.facts));
  const notPassed = v.cases.filter(c => !['passed', 'skipped'].includes(c.status));
  const details = notPassed.map(c => {
    const t = v.tests.get(caseKey(c));
    const shape = t ? testShape(t, v.facts) : null;
    const pre = t?.snapshots['test.functions.finished'];
    return { case: caseKey(c), status: c.status, workerIndex: c.workerIndex, shape, serverJoin: pre ? serverCandidates(pre.pending ?? [], run.servers.app) : null };
  });
  const counts = v.cases.reduce((m, c) => ({ ...m, [c.status]: (m[c.status] ?? 0) + 1 }), {});
  return {
    kind: 'faithful', evidence, validity: { verdict: v.verdict, checks: v.checks }, inventory, counts, workers: v.facts.map(f => f.install?.workerIndex),
    nonPassing: details,
    naturalSymptom: notPassed.length ? 'non-passing case(s) captured; see nonPassing shapes (observations, not causes)' : 'none captured in this one exposure (non-reproduction is not a fix)',
    shapesWithLabels: shapes.filter(s => s.labels.length),
    fontsReady: 'UNOBSERVED by design',
  };
}
