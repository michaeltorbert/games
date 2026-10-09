// Issue #161 evidence check for one run-arm directory. Writes only to its own
// new directory (the checked run stays immutable). Each check is PASS, FAIL or
// INCONCLUSIVE; exit 0 = all PASS, 1 = any FAIL, 4 = INCONCLUSIVE without FAIL.
// Observer availability is checked positively; target observations (e.g. a
// request that never reached the server, an unanswered deleteContext) are
// reported as observations, never folded into an observer pass/fail.
//   node scripts/diag-161/check-run.mjs tests/artifacts.nosync/issue-161/<runId>
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {
  PROJECTS, REPO, newRunDir, readJsonl, sha256File, summarizeRun, walk, writeManifest, writeOnce, zipEntryNames,
} from './lib.mjs';

const runDir = path.resolve(process.argv[2] ?? '');
if (!fs.existsSync(path.join(runDir, 'meta.json'))) {
  console.error('Usage: check-run.mjs <run dir containing meta.json>');
  process.exit(2);
}
const { id, dir } = newRunDir('check');
writeOnce(path.join(dir, 'target.txt'), `${runDir}\n`);
const results = [];
const PASS = true, FAIL = false, INCONCLUSIVE = 'inconclusive', NOTE = null;
const check = (name, verdict, detail = null) => {
  const v = verdict === NOTE ? NOTE : verdict === INCONCLUSIVE ? INCONCLUSIVE : !!verdict;
  results.push({ name, verdict: v === NOTE ? 'NOTE' : v === INCONCLUSIVE ? 'INCONCLUSIVE' : v ? 'PASS' : 'FAIL', detail });
  const tag = results.at(-1).verdict.padEnd(12);
  console.log(`${tag}${name}${detail && v !== true ? `\n            ${JSON.stringify(detail).slice(0, 900)}` : ''}`);
};
const read = f => JSON.parse(fs.readFileSync(path.join(runDir, f), 'utf8'));
const has = f => fs.existsSync(path.join(runDir, f));
const ms = t => Date.parse(t);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const meta = read('meta.json');
const status = has('status.json') ? read('status.json') : null;
const arm = meta.arm;
const workers = meta.armDefinition.workers;
check(`run status ${status?.status ?? 'missing'}`, NOTE, status?.exposure ?? null);

// --- Integrity: the run's own index covers every file, and nothing was written after it.
if (has('MANIFEST.sha256')) {
  const lines = fs.readFileSync(path.join(runDir, 'MANIFEST.sha256'), 'utf8').split('\n').filter(Boolean);
  const listed = new Set(lines.map(l => l.slice(66)));
  const bad = [];
  for (const line of lines) {
    const abs = path.join(runDir, line.slice(66));
    if (!fs.existsSync(abs) || await sha256File(abs) !== line.slice(0, 64)) bad.push(line.slice(66));
  }
  const unindexed = walk(runDir).map(f => path.relative(runDir, f)).filter(r => r !== 'MANIFEST.sha256' && !listed.has(r));
  check(`MANIFEST matches ${lines.length} files; nothing changed or added after sealing`, bad.length === 0 && unindexed.length === 0, { bad, unindexed });
} else check('MANIFEST.sha256 present', FAIL);
const runner = readJsonl(path.join(runDir, 'runner.jsonl'));
const finalizeIdx = runner.findIndex(e => e.ev === 'finalize');
check('runner log ends with finalize (no observer write after sealing)', finalizeIdx >= 0 && finalizeIdx === runner.length - 1,
  runner.slice(finalizeIdx + 1).map(e => e.ev));
const aborts = runner.filter(e => e.ev.startsWith('abort.'));
if (aborts.length) {
  const begin = aborts.find(e => e.ev === 'abort.begin');
  const signalled = aborts.some(e => e.ev === 'abort.signal.sent');
  check(`abort (${begin?.reason}): owned task ${status?.collection?.abortTask ?? 'unrecorded'}; no signal after CLI exit; all abort events before finalize`,
    ['settled', 'unsettled-at-seal'].includes(status?.collection?.abortTask) && !(begin?.cliExited && signalled)
      && runner.findLastIndex(e => e.ev.startsWith('abort.')) < finalizeIdx,
    aborts.map(e => e.ev));
}
if (status?.collection) {
  check('evidence collection complete (observer drains, server exit, CLI group, snapshots)', status.collection.complete ? PASS : INCONCLUSIVE, status.collection);
} else check('evidence collection status recorded (pre-v2 runs lack it)', INCONCLUSIVE);

// --- Parse gaps in JSONL streams.
const events = readJsonl(path.join(runDir, 'events.jsonl'));
const server = readJsonl(path.join(runDir, 'server.jsonl'));
const gaps = { events: events.filter(e => e.ev === 'unparseable').length, server: server.filter(e => e.ev === 'unparseable').length, runner: runner.filter(e => e.ev === 'unparseable').length };
check('JSONL streams fully parseable', Object.values(gaps).every(n => n === 0) ? PASS : INCONCLUSIVE, gaps);

// --- Effective config and selection binding.
const begin = events.find(e => e.ev === 'run.begin');
check('reporter run.begin present', !!begin);
const enumeration = has('enumeration.json') ? read('enumeration.json') : [];
if (begin) {
  check('six projects, WebKit on each, retries 0', same(begin.projects.map(p => p.name), PROJECTS)
    && begin.projects.every(p => p.use?.browserName === 'webkit' && p.retries === 0), begin.projects.map(p => [p.name, p.use?.browserName, p.retries]));
  check(`workers=${workers}, maxFailures=1`, begin.workers === workers && begin.maxFailures === 1, { workers: begin.workers, maxFailures: begin.maxFailures });
  check('enumeration size equals reporter total', enumeration.length === begin.total, { enumerated: enumeration.length, total: begin.total });
}
const expectedFiles = arm === 'selfcheck' ? ['scripts/diag-161/selfcheck/harness.spec.mjs']
  : meta.armDefinition.mode === 'differential' ? ['scripts/diag-161/differential/lifecycle.spec.mjs'] : meta.files;
const enumFiles = [...new Set(enumeration.map(t => t.file))].sort();
check(`selected files match the arm's declared selection (${expectedFiles.length})`, same(enumFiles, [...expectedFiles].sort()),
  { missing: expectedFiles.filter(f => !enumFiles.includes(f)), extra: enumFiles.filter(f => !expectedFiles.includes(f)) });
const byCase = new Map();
for (const t of enumeration) {
  const caseId = t.key.split('::').slice(0, 2).join('::');
  byCase.set(caseId, [...(byCase.get(caseId) ?? []), t.project]);
}
const notSix = [...byCase].filter(([, projects]) => !same([...projects].sort(), [...PROJECTS].sort()));
check(`every selected case enumerated once on each of the six projects (${byCase.size} cases)`, notSix.length === 0
  && new Set(enumeration.map(t => t.id)).size === enumeration.length, notSix.slice(0, 10));
if (arm === 'smoke') check('smoke selection is exactly the opponent case on six projects', enumeration.length === 6
  && enumeration.every(t => t.key.includes(meta.armDefinition.grep)));
const enumIds = new Set(enumeration.map(t => t.id));
const strays = events.filter(e => (e.ev === 'test.begin' || e.ev === 'test.end') && !enumIds.has(e.test));
check('every reported test belongs to the enumeration', strays.length === 0, strays.slice(0, 5));
const summary = summarizeRun(runDir);
check('exposure by project (ended / started-not-ended / not run)', NOTE, summary.byProject);
if (has('report.json')) {
  const report = read('report.json');
  const statuses = [];
  const visit = s => { for (const spec of s.specs ?? []) for (const t of spec.tests ?? []) statuses.push(t.results?.at(-1)?.status ?? 'notRun'); for (const c of s.suites ?? []) visit(c); };
  for (const s of report.suites ?? []) visit(s);
  const ended = events.filter(e => e.ev === 'test.end');
  const count = st => statuses.filter(x => x === st).length;
  check('JSON report agrees with reporter events', statuses.length === enumeration.length
    && ['passed', 'skipped', 'failed', 'timedOut', 'interrupted'].every(st => count(st) === ended.filter(e => e.status === st).length),
  { reportCases: statuses.length, reportPassed: count('passed'), eventsEnded: ended.length });
} else check('JSON report present (absent if the CLI was killed)', INCONCLUSIVE);

// --- Server stream: identity and positive availability via marked probes.
const spawnEv = runner.find(e => e.ev === 'server.spawn');
const startup = server.find(e => e.ev === 'startup');
check('server identity: startup pid = runner-spawned pid, root line matched', startup && spawnEv && startup.pid === spawnEv.pid
  && runner.find(e => e.ev === 'server.identity')?.rootLine === true, { startup, spawnEv });
const runnerProbeOk = runner.filter(e => ['probe.ready', 'probe', 'probe.final'].includes(e.ev) && e.status === 200);
const serverProbe = server.filter(e => e.ev === 'req.start' && e.probe && e.ua === meta.probeUa);
check(`server logged every successful runner probe (${serverProbe.length} logged / ${runnerProbeOk.length} ok)`,
  meta.probeUa && runnerProbeOk.length > 0 && serverProbe.length >= runnerProbeOk.length
    && runner.some(e => e.ev === 'probe.ready' && e.status === 200) && runner.some(e => e.ev === 'probe.final' && e.status === 200),
  { probeUa: meta.probeUa ?? 'missing (pre-v2 run)' });
const badProbes = runner.filter(e => e.ev === 'probe' && e.status !== 200);
check(`periodic probes: ${runner.filter(e => e.ev === 'probe').length}, non-200 ${badProbes.length}`, badProbes.length ? NOTE : PASS, badProbes.slice(0, 10));
const browserReqs = server.filter(e => e.ev === 'req.start' && !e.probe);
const ends = new Map();
for (const e of server) if (e.ev === 'res.finish' || e.ev === 'res.close') ends.set(e.req, ends.get(e.req) ?? e);
const openReqs = server.filter(e => e.ev === 'req.start' && !ends.has(e.req));
check(`observation: ${browserReqs.length} browser requests at server; ${openReqs.length} without finish/close`, NOTE, openReqs.slice(0, 20));

// --- Debug/protocol stream.
// WebKit message ids restart per browser connection (wkConnection `_lastId = 0`),
// so pairing is namespaced by browser segment: protocol lines are attributed to
// a browser only while exactly one launched browser is live (launch line ..
// `[pid=N] <process did exit`). With two or more live browsers (two workers, or
// overlapping launches) the owner and the pairing are AMBIGUOUS. A response is
// never matched across a browser boundary.
const windows = [...summary.failures, ...summary.startedNotEnded].map(f => {
  const b = events.find(e => e.ev === 'test.begin' && e.test === f.test);
  const end = events.find(e => e.ev === 'test.end' && e.test === f.test);
  return { test: f.test, key: f.key, from: ms(b?.t ?? f.t) - 1000, to: ms(end?.t ?? events.at(-1)?.t ?? f.t) + 5000, lines: [], dropped: 0 };
});
const proto = { lines: 0, untimed: 0, sends: 0, recvs: 0, parseGaps: [], launches: [], exits: [], creates: 0, deletes: [] };
const live = new Map(); // browser pid -> launch time
const pending = []; // deletes awaiting a response
const stderrPath = path.join(runDir, 'cli-stderr.log');
if (fs.existsSync(stderrPath)) {
  let lastT = null;
  const rl = readline.createInterface({ input: fs.createReadStream(stderrPath), crlfDelay: Infinity });
  for await (const line of rl) {
    proto.lines++;
    const m = line.match(/^(\d{4}-\d\d-\d\dT[\d:.]+Z) (pw:[\w:]+) (.*)$/);
    if (m) lastT = ms(m[1]); else proto.untimed++;
    if (lastT !== null) for (const w of windows) {
      if (lastT < w.from || lastT > w.to) continue;
      if (w.lines.length < 4000) w.lines.push(line.slice(0, 600)); else w.dropped++;
    }
    if (!m) continue;
    const [, t, ns, msg] = m;
    if (ns === 'pw:browser') {
      const launched = msg.match(/^<launched> pid=(\d+)/);
      const exited = msg.match(/^\[pid=(\d+)\] <process did exit/);
      if (launched) { live.set(launched[1], t); proto.launches.push({ pid: launched[1], t }); }
      if (exited) {
        proto.exits.push({ pid: exited[1], t });
        for (const d of pending.filter(x => x.owner === exited[1])) { d.outcome = 'unanswered-before-browser-exit'; d.at = t; pending.splice(pending.indexOf(d), 1); }
        live.delete(exited[1]);
      }
      continue;
    }
    if (ns !== 'pw:protocol') continue;
    const pm = msg.match(/^(SEND ►|◀ RECV) (.*)$/);
    if (!pm) continue;
    let payload;
    try { payload = JSON.parse(pm[2]); } catch { proto.parseGaps.push({ t, head: pm[2].slice(0, 120) }); continue; }
    const owner = live.size === 1 ? [...live.keys()][0] : null;
    const certainty = live.size === 1 ? 'exact' : live.size === 0 ? 'no-live-browser' : 'ambiguous';
    if (pm[1] === 'SEND ►') {
      proto.sends++;
      if (payload.method === 'Playwright.createContext') proto.creates++;
      if (payload.method === 'Playwright.deleteContext') {
        const d = { id: payload.id, contextId: payload.params?.browserContextId ?? null, t, owner, certainty, outcome: 'pending' };
        proto.deletes.push(d);
        pending.push(d);
      }
    } else if (payload.id !== undefined && (payload.pageProxyId !== undefined || payload.browserContextId !== undefined)) {
      // Page-proxy-scoped reply: never a Playwright.deleteContext response
      // (observed v3 workers2: id 25085 reply carried another context's pageProxyId).
      proto.recvs++;
    } else if (payload.id !== undefined) {
      proto.recvs++;
      const candidates = pending.filter(d => d.id === payload.id && (owner ? d.owner === owner : d.owner === null || live.has(d.owner)));
      if (!candidates.length) continue;
      const d = candidates[0];
      const exact = owner && d.certainty === 'exact' && candidates.length === 1;
      d.outcome = payload.error ? 'protocol-error' : exact ? 'answered' : 'answered-ambiguous';
      d.error = payload.error ?? undefined;
      d.recv = t;
      d.ms = ms(t) - ms(d.t);
      pending.splice(pending.indexOf(d), 1);
    } else proto.recvs++;
  }
  for (const d of pending) d.outcome = 'unanswered-at-end-of-log';
}
const tally = Object.groupBy(proto.deletes, d => d.outcome);
const n = k => (tally[k] ?? []).length;
const anyTestRan = events.some(e => e.ev === 'test.begin');
check(`protocol stream available: ${proto.launches.length} launches, ${proto.sends} SEND, ${proto.recvs} RECV parsed`,
  !anyTestRan || (proto.launches.length > 0 && proto.sends > 0 && proto.recvs > 0),
  { executables: 'see cli-stderr.log <launching> lines' });
check(`protocol payloads parseable (${proto.parseGaps.length} gaps)`, proto.parseGaps.length === 0 ? PASS : INCONCLUSIVE, proto.parseGaps.slice(0, 10));
const ambiguous = proto.deletes.filter(d => d.certainty !== 'exact' || d.outcome === 'answered-ambiguous');
check(`deleteContext pairing namespaced by browser segment (${proto.deletes.length} deletes, ${ambiguous.length} ambiguous)`,
  ambiguous.length === 0 ? PASS : INCONCLUSIVE,
  ambiguous.length ? { reason: workers > 1 ? 'two workers: overlapping live browsers' : 'overlapping or unbounded browser segments', sample: ambiguous.slice(0, 10) } : null);
check('observation: deleteContext outcomes', NOTE, {
  creates: proto.creates, answered: n('answered'), answeredAmbiguous: n('answered-ambiguous'), protocolError: n('protocol-error'),
  unansweredBeforeBrowserExit: tally['unanswered-before-browser-exit'] ?? [], unansweredAtEndOfLog: tally['unanswered-at-end-of-log'] ?? [],
  slowestExactMs: Math.max(0, ...proto.deletes.filter(d => d.outcome === 'answered').map(d => d.ms)),
  over5sExact: proto.deletes.filter(d => d.outcome === 'answered' && d.ms > 5000),
});

// --- Watchdog collection outcomes.
const captures = events.filter(e => e.ev === 'stall.onset' && e.capture);
const outcome = label => events.find(e => (e.ev === 'stall.snapshot' || e.ev === 'stall.snapshot.error') && e.label === label)?.ev ?? null;
const drain = events.filter(e => e.ev === 'collector.drain').at(-1);
const missing = captures.filter(c => !outcome(c.label)).map(c => ({ label: c.label, drainedPending: drain?.stillPending?.includes(c.label) ?? 'no drain record' }));
check(`onset snapshots: ${captures.length} captured, ${missing.length} without outcome`, missing.length === 0 ? PASS : INCONCLUSIVE, missing);

// --- Traces.
const traces = walk(path.join(runDir, 'pw-output')).filter(f => f.endsWith('trace.zip'));
check(`${traces.length} trace.zip files (trace=${meta.armDefinition.trace})`, meta.armDefinition.trace === 'off' ? traces.length === 0 : traces.length > 0);

if (arm === 'selfcheck') {
  const load = suffix => PROJECTS.map(p => path.join(runDir, 'selfcheck', `${p}${suffix}`)).filter(f => fs.existsSync(f)).map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
  const metas = load('.json');
  check('harness metadata for all six projects, all WebKit', metas.length === 6 && metas.every(m => m.browserName === 'webkit'));
  check('harness-only metadata from /version.json (no viewport meta: phone innerWidth 980 is expected; NOT game viewport/layout evidence)', NOTE,
    metas.map(m => ({ project: m.project, version: m.browserVersion, ...m.environment })));
  const football = load('.football.json');
  check('Football document observation on six projects with session mute applied and no input',
    football.length === 6 && football.every(f => f.mute?.applied === true && f.mute?.soundOn === false && f.interactions === 0), football.map(f => [f.project, f.mute]));
  check('Football document load-time environment (harness observation only; NOT usable-viewport, layout or playability evidence)', NOTE,
    football.map(f => ({ project: f.project, ...f.environment })));
  const harness = traces.filter(f => f.includes('harness-observes'));
  const chunks = harness.map(f => zipEntryNames(f).filter(x => x.endsWith('.trace')).length);
  check('manual browser.newContext() traced (>=2 trace chunks per harness trace)', harness.length === 6 && chunks.every(c => c >= 2), chunks);
  check('server saw fixture, manual-context and Football document requests',
    browserReqs.filter(r => r.url === '/version.json').length >= 12 && browserReqs.filter(r => r.url === '/football/').length >= 6);
  check('watchdog onset produced a completed snapshot that was drained before sealing',
    captures.length >= 1 && captures.every(c => outcome(c.label) === 'stall.snapshot')
      && fs.existsSync(path.join(runDir, 'onset', `${captures[0].label}.summary.json`)) && drain?.complete === true, { captures: captures.map(c => c.label), drain });
  check('every created context deleted and answered with exact browser attribution',
    proto.creates > 0 && n('answered') === proto.creates && ambiguous.length === 0, { creates: proto.creates, answered: n('answered') });
}

if (arm === 'smoke') {
  const ended = events.filter(e => e.ev === 'test.end');
  check('smoke: one passed case per project', same(ended.map(e => e.key.split('::').pop()).sort(), [...PROJECTS].sort()) && ended.every(e => e.status === 'passed'));
  for (const e of ended) {
    const b = events.find(x => x.ev === 'test.begin' && x.test === e.test);
    const steps = events.filter(x => x.test === e.test && x.ev === 'step.begin');
    const doc = browserReqs.find(r => r.url === '/football/' && ms(r.t) >= ms(b.t) && ms(r.t) <= ms(e.t));
    check(`smoke ${e.key.split('::').pop()}: underlying goto, server document 200, mute check, context teardown`,
      steps.some(s => s.cat === 'pw:api' && /^(Navigate|page\.goto)/.test(s.title) && /curriculum-fixture\.mjs/.test(s.loc ?? ''))
      && doc && ends.get(doc.req)?.status === 200 && !/HeadlessChrome|Chrome\//.test(doc.ua ?? '')
      && steps.some(s => s.cat === 'pw:api' && /football-test-mute\.mjs/.test(s.loc ?? ''))
      && steps.some(s => s.cat === 'fixture' && /context/.test(s.title)),
    { doc, stepTitles: steps.map(s => `${s.cat}:${s.title}@${s.loc}`).slice(0, 40) });
  }
}

if (meta.armDefinition.mode === 'differential') {
  // A passed project must prove the whole plan; a failed project must carry its
  // first failing stage (valid even with zero completed cycles). No partial pass.
  const planned = { single: { perBrowser: 150, expectedLaunches: 1 }, relaunch: { perBrowser: 50, expectedLaunches: 3 } }[meta.armDefinition.diff];
  const rows = PROJECTS.map(p => {
    const recs = readJsonl(path.join(runDir, 'differential', `${p}.jsonl`));
    const end = events.find(e => e.ev === 'test.end' && e.key.endsWith(`::${p}`));
    const started = events.some(e => e.ev === 'test.begin' && e.key.endsWith(`::${p}`));
    const plan = recs.find(r => r.ev === 'plan');
    const summary = recs.find(r => r.ev === 'summary');
    const firstBad = recs.find(r => r.ev === 'stage.end' && !r.ok) ?? null;
    const okCycles = recs.filter(r => r.ev === 'cycle.ok').length;
    const row = { project: p, started, testStatus: end?.status ?? (started ? 'started-not-ended' : 'not-run'), okCycles,
      launches: summary?.launches ?? null, closesOk: summary?.closesOk ?? null, firstFailure: summary?.failure ?? firstBad, browserLeftOpen: summary?.browserLeftOpen ?? null };
    if (!started) row.verdict = 'not-run';
    else if (end?.status === 'passed') {
      row.verdict = plan?.cycles === 150 && plan.perBrowser === planned.perBrowser && summary && !summary.failure && !firstBad
        && okCycles === 150 && summary.completed === 150 && summary.launches === planned.expectedLaunches
        && summary.closesOk === summary.launches && !summary.browserLeftOpen ? 'complete-pass' : 'INVALID-pass';
    } else row.verdict = row.firstFailure?.stage ? `failure-captured:${row.firstFailure.stage}` : 'failure-without-stage-record';
    return row;
  });
  check(`differential ${meta.armDefinition.diff}: per-project stages, cycles, launches, closes, first failure`, NOTE, rows);
  check('differential: every passed project proves 150 successful cycles and confirmed closes of every browser',
    rows.every(r => r.verdict !== 'INVALID-pass'), rows.filter(r => r.verdict === 'INVALID-pass'));
  check('differential: every failed project records its first failing stage',
    rows.some(r => r.verdict === 'failure-without-stage-record' || r.testStatus === 'started-not-ended') ? INCONCLUSIVE : PASS,
    rows.filter(r => r.verdict === 'failure-without-stage-record' || r.testStatus === 'started-not-ended'));
}

// --- Correlated timelines for every failed or unfinished case.
windows.forEach((w, i) => {
  const inWindow = e => ms(e.t) >= w.from && ms(e.t) <= w.to;
  const merged = [
    ...events.filter(e => (e.test === w.test || e.ev.startsWith('stall') || e.ev.startsWith('run') || e.ev.startsWith('collector')) && inWindow(e)).map(e => [e.t, 'reporter', JSON.stringify({ ...e, t: undefined })]),
    ...server.filter(inWindow).map(e => [e.t, e.probe ? 'server(probe)' : 'server', JSON.stringify({ ...e, t: undefined })]),
    ...runner.filter(inWindow).map(e => [e.t, 'runner', JSON.stringify({ ...e, t: undefined })]),
    ...proto.deletes.filter(inWindow).map(d => [d.t, 'deleteContext', JSON.stringify({ ...d, t: undefined })]),
  ].sort((a, b) => a[0].localeCompare(b[0]));
  const name = `timeline-${String(i + 1).padStart(2, '0')}.txt`;
  writeOnce(path.join(dir, name), [`case ${w.key}\nwindow ${new Date(w.from).toISOString()} .. ${new Date(w.to).toISOString()}`,
    '\n== reporter/server/runner/deleteContext ==', ...merged.map(r => r.join('  ')),
    `\n== debug/protocol lines in window (${w.lines.length} kept, ${w.dropped} dropped; lines carry no worker id) ==`, ...w.lines].join('\n') + '\n');
  check(`timeline written for ${w.key}`, NOTE, name);
});

writeOnce(path.join(dir, 'check.json'), { checkId: id, target: runDir, repo: REPO, status, summary, protocol: { ...proto, deletes: proto.deletes }, results });
await writeManifest(dir);
const failed = results.filter(r => r.verdict === 'FAIL').length;
const inconclusive = results.filter(r => r.verdict === 'INCONCLUSIVE').length;
const verdict = failed ? `FAIL (${failed})` : inconclusive ? `INCONCLUSIVE (${inconclusive})` : 'PASS';
console.log(`\n[diag-161] check ${verdict} for ${path.basename(runDir)}\n[diag-161] check dir: ${dir}`);
process.exit(failed ? 1 : inconclusive ? 4 : 0);
