// Issue #161 continuation: structured extraction from the four retained runs.
//   node scripts/diag-161/continuation/extract-retained.mjs
// Read-only on tests/artifacts.nosync/issue-161/<run>/; writes one new sealed
// directory under .../issue-161/continuation/. Before reading, each used file
// is re-hashed against its run's MANIFEST.sha256; a mismatch aborts.
//
// Questions (descriptive extraction, no causal claims):
//  Q1 single-browser runs: is the WebKit context id a per-browser counter
//     (id = 0x8000000000000001 + ordinal, restarting per browser)? Are frame
//     ids 2^32 + ordinal?
//  Q2 per-ordinal round trips (createContext->reply is not logged by method;
//     deleteContext and navigate are) before the captured stalls: flat or rising?
//  Q3 the captured navigation stalls: protocol boundary per ordinal.
//  Q4 serial: which tests (including skipped ones) consumed context ordinals.
//  Q5 workers2: per-id creation counts across both browsers, every
//     deleteContext without any exact-form reply, and the stalled browser pid
//     named in the timed-out test's own Playwright error. Shared-stderr pairing
//     there is collision-aware only; nothing below is exact ownership.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { RETAINED_ROOT, newRunDir, seal, verifyManifestEntries, writeJson } from './lib.mjs';
import { createSinkAnalyzer, rttProfile } from './analyze.mjs';

const RUNS = {
  serial: '20261009T070207Z-serial-2d7c2a',
  workers2: '20261009T070457Z-workers2-0f4854',
  diffSingle: '20261009T072821Z-diff-single-631458',
  diffRelaunch: '20261009T072946Z-diff-relaunch-2bc089',
};
const ISO_LINE = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z) (.*)$/s;
const toMono = iso => BigInt(Date.parse(iso)) * 1000000n;

async function each(file, fn) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const l of rl) fn(l);
}
const readJsonl = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const stats = xs => {
  const v = xs.filter(x => x !== null && x !== undefined).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = p => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { n: v.length, min: v[0], median: q(0.5), p95: q(0.95), max: v[v.length - 1] };
};
// Bucketed profile so a rising trend or a cliff is visible without dumping every value.
const buckets = (pairs, size = 10) => {
  const out = {};
  for (const [ord, v] of pairs) { const k = `${Math.floor((ord - 1) / size) * size + 1}-${Math.floor((ord - 1) / size) * size + size}`; (out[k] ??= []).push(v); }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, stats(v)]));
};

// Single-browser runs: replay the shared stderr through the sink analyser.
// Exact pairing holds only while exactly one browser is live; overlaps are
// reported by the analyser and excluded from pairing.
async function replay(run) {
  const dir = path.join(RETAINED_ROOT, run);
  const a = createSinkAnalyzer(run);
  let n = 0;
  a.line(`0 1970-01-01T00:00:00.000Z #mark ${JSON.stringify({ ev: 'sink.open', debugProtocolEnabled: true, replay: true })}`);
  await each(path.join(dir, 'cli-stderr.log'), l => {
    const m = l.match(ISO_LINE);
    if (!m) { a.line(l); return; }
    if (/^pw:browser <launched> pid=/.test(m[2])) a.line(`${toMono(m[1])} ${m[1]} #mark ${JSON.stringify({ ev: 'stage.begin', stage: 'browser.launch', lane: `browser-${++n}` })}`);
    a.line(`${toMono(m[1])} ${m[1]} ${m[2]}`);
  });
  a.end({ tailTruncated: false });
  const r = a.result(false);
  const segs = r.segments.map(g => {
    const s = g._seg;
    const navs = [...s.navs.entries()].map(([page, nav]) => {
      const ctx = s.contexts.get(s.pageToCtx.get(page));
      return { ordinal: ctx?.ordinal ?? null, frameId: nav.frameId, replied: nav.replyMono !== undefined, events: Object.keys(nav.events) };
    });
    const frameOk = navs.filter(x => x.ordinal !== null && x.frameId !== null && BigInt(x.frameId) - 4294967296n === BigInt(x.ordinal)).length;
    const unreplied = navs.filter(x => !x.replied);
    const ctxList = [...s.contexts.values()];
    return {
      pid: g.pid, exit: g.exit, contexts: g.contexts, idSequential: g.idSequential,
      firstContextId: ctxList[0]?.id ?? null, lastContextId: ctxList.at(-1)?.id ?? null,
      frameIdEqualsTwoTo32PlusOrdinal: `${frameOk}/${navs.filter(x => x.frameId !== null).length}`,
      unrepliedNavigations: unreplied,
      deletesWithoutAck: ctxList.filter(c => c.deleteSend && !c.deleteAck).map(c => ({ ordinal: c.ordinal, id: c.id, deleteId: c.deleteSend.id })),
    };
  });
  const prof = rttProfile(r).map(p => ({ pid: p.pid, deleteContextMs: buckets(p.deleteContextMs), navigateReplyMs: buckets(p.navigateReplyMs) }));
  return { segments: segs, rttByOrdinalBucket: prof, analyserIssues: summarizeIssues(r.issues), _r: r };
}

function summarizeIssues(issues) {
  const by = {};
  for (const i of issues) by[i.code] = (by[i.code] ?? 0) + 1;
  return by;
}

// Q4: ordinal -> test (time-joined from the reporter's events; single worker).
function ordinalTests(run, replayResult) {
  const ev = readJsonl(path.join(RETAINED_ROOT, run, 'events.jsonl'));
  const begins = ev.filter(e => e.ev === 'test.begin').map(e => ({ t: Date.parse(e.t), test: e.test, key: e.key, workerIndex: e.workerIndex }));
  const ends = new Map(ev.filter(e => e.ev === 'test.end').map(e => [e.test, e.status]));
  const out = [];
  for (const g of replayResult._r.segments) {
    for (const ctx of g._seg.contexts.values()) {
      const t = Number(ctx.createMono / 1000000n);
      const b = begins.filter(x => x.t <= t + 50).at(-1) ?? null; // reporter time can trail the worker slightly
      out.push({ pid: g.pid, ordinal: ctx.ordinal, test: b?.key ?? null, status: b ? ends.get(b.test) ?? null : null });
    }
  }
  const perBrowser = {};
  for (const o of out) {
    const p = (perBrowser[o.pid] ??= { contexts: 0, inSkippedTests: 0, inPassedTests: 0, other: 0 });
    p.contexts++;
    if (o.status === 'skipped') p.inSkippedTests++; else if (o.status === 'passed') p.inPassedTests++; else p.other++;
  }
  return { join: 'time-joined (test.begin <= createContext reply + 50 ms); approximate', perBrowser, ordinals: out };
}

// Q5: workers2, collision-aware over the shared stderr.
async function workers2() {
  const dir = path.join(RETAINED_ROOT, RUNS.workers2);
  const launches = [], exits = [], creates = new Map(), deletes = [], emptyReplies = new Map();
  let lines = 0;
  await each(path.join(dir, 'cli-stderr.log'), l => {
    lines++;
    const m = l.match(ISO_LINE);
    if (!m) return;
    const [, iso, rest] = m;
    const t = Date.parse(iso);
    let x;
    if ((x = rest.match(/^pw:browser <launched> pid=(\d+)/))) launches.push({ pid: Number(x[1]), t: iso });
    else if ((x = rest.match(/^pw:browser \[pid=(\d+)\] <process did exit: (.*)>$/))) exits.push({ pid: Number(x[1]), t: iso, exit: x[2] });
    else if (rest.length < 300 && (x = rest.match(/^pw:protocol ◀ RECV \{"result":\{"browserContextId":"([0-9A-F]+)"\},"id":(\d+)\}$/))) {
      if (!creates.has(x[1])) creates.set(x[1], []);
      creates.get(x[1]).push({ t: iso, id: Number(x[2]) });
    } else if (rest.length < 300 && (x = rest.match(/^pw:protocol SEND ► \{"id":(\d+),"method":"Playwright\.deleteContext","params":\{"browserContextId":"([0-9A-F]+)"\}\}$/))) {
      deletes.push({ id: Number(x[1]), ctx: x[2], t: iso, ms: t });
    } else if (rest.length < 100 && (x = rest.match(/^pw:protocol ◀ RECV \{"result":\{\},"id":(\d+)\}$/))) {
      const id = Number(x[1]);
      if (!emptyReplies.has(id)) emptyReplies.set(id, []);
      emptyReplies.get(id).push(t);
    }
  });
  const ids = [...creates.keys()].sort();
  const counts = ids.map(id => ({ id, ordinalIfPerBrowserCounter: Number(BigInt(`0x${id}`) - 0x8000000000000001n), creations: creates.get(id).length, times: creates.get(id).map(c => c.t) }));
  const twice = counts.filter(c => c.creations >= 2).map(c => c.ordinalIfPerBrowserCounter);
  const once = counts.filter(c => c.creations === 1).map(c => c.ordinalIfPerBrowserCounter);
  const unanswered = deletes.filter(d => !(emptyReplies.get(d.id) ?? []).some(t => t >= d.ms)).map(({ ms, ...d }) => d);
  // The timed-out test's own Playwright error names the browser that owned the closing context.
  const ev = readJsonl(path.join(dir, 'events.jsonl'));
  const timedOut = ev.filter(e => e.ev === 'test.end' && e.status === 'timedOut').map(e => {
    const text = JSON.stringify(e);
    return { key: e.key, workerIndex: e.workerIndex, t: e.t, browserPidsInError: [...new Set([...text.matchAll(/<launched> pid=(\d+)/g)].map(z => Number(z[1])))] };
  });
  const reportText = fs.readFileSync(path.join(dir, 'report.json'), 'utf8');
  const closeErrorPids = [...new Set([...reportText.matchAll(/browserContext\.close[^"]*?<launched> pid=(\d+)/g)].map(z => Number(z[1])))];
  const begins = ev.filter(e => e.ev === 'test.begin');
  const near = iso => begins.filter(b => Math.abs(Date.parse(b.t) - Date.parse(iso)) <= 1500).map(b => ({ t: b.t, key: b.key, workerIndex: b.workerIndex }));
  const late = counts.filter(c => c.creations === 1 && c.ordinalIfPerBrowserCounter >= Math.max(0, ...twice) + 1);
  return {
    pairing: 'collision-aware over a shared stderr with two live browsers; not exact ownership',
    lines, launches, exits,
    contextIdCreationCounts: { createdTwice: twice.length ? [Math.min(...twice), Math.max(...twice)] : null, createdTwiceContiguous: twice.every((v, i) => i === 0 || v === twice[i - 1] + 1), createdOnce: once, idsCreatedMoreThanTwice: counts.filter(c => c.creations > 2).map(c => c.id) },
    createdOnceDetail: late.map(c => ({ ...c, testsBeginningWithin1500ms: near(c.times[0]) })),
    deleteContextSends: deletes.length,
    deleteContextWithoutAnyExactReplyAfterSend: unanswered,
    timedOutTests: timedOut,
    browserPidsInReportCloseErrors: closeErrorPids,
  };
}

const out = newRunDir('extract');
const integrity = {};
for (const [k, run] of Object.entries(RUNS)) {
  integrity[k] = verifyManifestEntries(path.join(RETAINED_ROOT, run), ['cli-stderr.log', 'events.jsonl', 'meta.json', ...(k === 'workers2' ? ['report.json'] : [])]);
  if (integrity[k].some(e => !e.ok)) { console.error(`retained integrity mismatch in ${run}`, integrity[k]); process.exit(1); }
}
const result = { runs: RUNS, integrity, note: 'Descriptive extraction only; interpretation belongs in the author report.' };
for (const k of ['diffSingle', 'diffRelaunch', 'serial']) {
  const r = await replay(RUNS[k]);
  if (k === 'serial') result.serialOrdinalTests = ordinalTests(RUNS.serial, r);
  delete r._r;
  result[k] = r;
}
result.workers2 = await workers2();
const meta = run => JSON.parse(fs.readFileSync(path.join(RETAINED_ROOT, run, 'meta.json'), 'utf8'));
result.historicalRuntime = Object.fromEntries(Object.entries(RUNS).map(([k, run]) => { const m = meta(run); return [k, { versions: m.versions && { node: m.versions.node, playwrightCore: m.versions.playwrightCore, webkitRevision: m.versions.webkitRevision }, head: m.fingerprint?.head, manifestSha256: m.fingerprint?.manifestSha256, arm: m.armDefinition ?? m.arm }]; }));
writeJson(path.join(out, 'extract.json'), result);
seal(out);
console.log(`[extract] wrote ${path.join(out, 'extract.json')}`);
