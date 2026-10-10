// Issue #161 continuation: collector and checker sensitivity, no browser.
//   node scripts/diag-161/continuation/selfcheck.mjs
// Exit 0 only if every positive control is detected as declared. These cases
// test the harness; they establish nothing about WebKit or Playwright.
// Uses loopback ports 18091/18092 for server parity, never 8090.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { HERE, REPO, drainGroup, finalizeEvidence, newRunDir, verifyManifest, writeJson } from './lib.mjs';
import { CYCLES, STDERR_LAUNCH, STDERR_PROTOCOL, analyzeSinkText, failureBoundary, laneOutcomes, probeCoverage, resolveStockLane } from './analyze.mjs';

const SELF = fileURLToPath(import.meta.url);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Child mode: prove the real protocol logger path is routed by installSink.
if (process.argv[2] === '--child-sink') {
  const { installSink } = await import('./sink.mjs');
  const sink = installSink(process.argv[3], { selfcheck: true });
  const require = createRequire(import.meta.url);
  const { helper } = require(path.join(REPO, 'node_modules', 'playwright-core', 'lib', 'server', 'helper.js'));
  helper.debugProtocolLogger()('send', { id: 1, method: 'Selfcheck.probe' });
  helper.debugProtocolLogger()('receive', { id: 1, result: {} });
  sink.mark('selfcheck.done');
  process.exit(0);
}
// Child modes for the lingering-writer control (R5): a group leader that exits
// at once while its same-group child keeps appending to a file.
if (process.argv[2] === '--child-lingering-leader') {
  spawn(process.execPath, [SELF, '--child-lingering-writer', process.argv[3]], { stdio: 'ignore' });
  process.exit(0);
}
if (process.argv[2] === '--child-lingering-writer') {
  setInterval(() => fs.appendFileSync(process.argv[3], `${Date.now()}\n`), 50);
  await new Promise(() => {});
}

// ---- synthetic sink builder (same line format as sink.mjs) ----
function builder(pid, workerIndex) {
  let t = BigInt(1_000_000_000 + workerIndex * 1000);
  const lines = [];
  const L = text => lines.push(`${(t += 1_000_000n)} 2026-10-10T00:00:00.000Z ${text}`);
  const mark = (ev, f = {}) => L(`#mark ${JSON.stringify({ ev, pid, ...f })}`);
  const send = (id, method, params, extra = {}) => L(`pw:protocol SEND ► ${JSON.stringify({ id, method, ...(params ? { params } : {}), ...extra })}`);
  const recv = obj => L(`pw:protocol ◀ RECV ${JSON.stringify(obj)}`);
  const ctxId = k => (0x8000000000000001n + BigInt(k)).toString(16).toUpperCase();
  const st = (lane, stage, where, fn, end = { ok: true }) => { mark('stage.begin', { lane, stage, ...where }); fn?.(); mark('stage.end', { lane, stage, ...where, timeout: false, error: null, ...end }); };
  return {
    lines, mark, send, recv, ctxId, L, advance: msAhead => { t += BigInt(msAhead) * 1_000_000n; },
    open(lane) {
      mark('sink.open', { workerIndex, parallelIndex: workerIndex, debugProtocolEnabled: true });
      mark('lane.begin', { lane, workerIndex, parallelIndex: workerIndex, workload: 'synthetic', project: 'iphone-15-portrait', trace: 'on' });
      st(lane, 'browser.launch', { launches: 1 }, () => L(`pw:browser <launched> pid=${pid + 100}`));
    },
    // opts.nav: 'ok' | 'stall' | 'stall-before-willCheck' | 'none'; opts.del: 'ack' | 'none'; opts.outOfOrder
    // opts.late: the failed operation's events arrive after its stage.end (during cleanup);
    // opts.garbled: a truncated, unrecoverable target record inside the failed stage.
    cycle(lane, k, opts = {}) {
      const { nav = 'ok', del = 'ack', outOfOrder = false, badId = false, late = false, garbled = false } = opts;
      const ctx = badId ? '8000000000000999' : ctxId(k), page = String(1000 + k), b = k * 100, where = { cycle: k, contextInBrowser: k };
      st(lane, 'newContext', where, () => {
        send(b + 1, 'Playwright.createContext');
        if (outOfOrder) { send(b + 5, 'Browser.getVersion'); recv({ result: {}, id: b + 5 }); }
        recv({ result: { browserContextId: ctx }, id: b + 1 });
      });
      st(lane, 'newPage', where, () => { send(b + 2, 'Playwright.createPage', { browserContextId: ctx }); recv({ result: { pageProxyId: page }, id: b + 2 }); });
      const target = method => recv({ method: 'Target.dispatchMessageFromTarget', params: { targetId: `page-${page}`, message: JSON.stringify({ method, params: { frameId: String(4294967296 + k) } }) }, browserContextId: ctx, pageProxyId: page });
      if (nav !== 'none') {
        const stalled = nav.startsWith('stall');
        st(lane, 'goto', where, () => {
          send(b + 3, 'Playwright.navigate', { url: 'http://127.0.0.1:8090/version.json', pageProxyId: page, frameId: String(4294967296 + k) });
          if (nav === 'stall-before-willCheck') return;
          target('Page.willCheckNavigationPolicy');
          if (garbled) L(`pw:protocol ◀ RECV {"method":"Target.dispatchMessageFromTarget","params":{"targetId":"page-${page}","message":"{\\"me <<<<<( LOG TRUNCATED )>>>>> ue}"}}`);
          if (stalled) return;
          recv({ result: { loaderId: String(k) }, id: b + 3 });
          target('Page.didCheckNavigationPolicy');
          target('Network.requestWillBeSent');
          target('Page.loadEventFired');
        }, stalled ? { ok: false, timeout: true } : { ok: true });
        if (stalled && late) { recv({ result: { loaderId: String(k) }, id: b + 3 }); target('Page.didCheckNavigationPolicy'); }
        if (stalled) return false;
      }
      const acked = del === 'ack';
      st(lane, 'context.close', where, () => {
        send(b + 4, 'Playwright.deleteContext', { browserContextId: ctx });
        if (acked) { recv({ method: 'Playwright.pageProxyDestroyed', params: { pageProxyId: page } }); recv({ result: {}, id: b + 4 }); }
      }, acked ? { ok: true } : { ok: false, timeout: true });
      if (!acked && late) { recv({ method: 'Playwright.pageProxyDestroyed', params: { pageProxyId: page } }); recv({ result: {}, id: b + 4 }); }
      if (!acked) return false;
      mark('cycle.ok', { lane, ...where });
      return true;
    },
    finish(lane, { completed, failure = null, cleanup = 'ok', summaryFailure, closeControl = 1 } = {}) {
      const name = failure ? 'browser.cleanup' : 'browser.close';
      const ok = !failure || cleanup === 'ok';
      // Source-faithful close: Playwright.close (id -9999) is sent unlogged; only its reply is logged.
      const control = () => { for (let i = 0; i < closeControl; i++) recv({ result: {}, id: -9999 }); };
      st(lane, name, { launches: 1 }, () => { if (ok) { control(); L(`pw:browser [pid=${pid + 100}] <process did exit: exitCode=0, signal=null>`); } }, ok ? { ok: true } : { ok: false, timeout: true });
      if (!ok) { control(); L(`pw:browser [pid=${pid + 100}] <process did exit: exitCode=0, signal=null>`); } // cleanup timed out; Playwright closes on worker exit
      mark('lane.summary', { lane, cycles: CYCLES, completed, launches: 1, closesOk: failure ? (ok ? 1 : 0) : 1, failure: summaryFailure ?? failure, cleanup: failure ? { ok, timeout: !ok, error: null } : null, browserLeftOpen: failure ? !ok : false });
      mark('sink.exit', { code: 0, liveBrowsers: 0 });
    },
    text() { return lines.join('\n') + '\n'; },
  };
}

function laneRun(pid, workerIndex, lane, plan) {
  const s = builder(pid, workerIndex);
  s.open(lane);
  let completed = 0, failure = null;
  for (let k = 1; k <= CYCLES; k++) {
    const opts = plan(k) ?? {};
    if (s.cycle(lane, k, opts)) { completed++; continue; }
    failure = { stage: opts.nav && opts.nav.startsWith('stall') ? 'goto' : 'context.close', cycle: k, contextInBrowser: k, timeout: true, error: null };
    break;
  }
  return { s, completed, failure };
}

const results = [];
const expect = (name, pass, detail) => results.push({ case: name, pass: !!pass, detail });
const fails = r => r.issues.filter(i => i.severity === 'FAIL').map(i => i.code);

function syntheticCases() {
  // S0 healthy lane: complete, no issues, sequential ids, no boundary.
  {
    const { s, completed } = laneRun(1, 0, 'a', () => ({}));
    s.finish('a', { completed });
    const r = analyzeSinkText('healthy', s.text());
    const lo = laneOutcomes(r);
    expect('S0 healthy lane (with source-faithful -9999 close reply) completes with no issues', r.issues.length === 0 && lo.issues.length === 0 && lo.lanes[0].outcome === 'COMPLETED' && r.segments[0].idSequential && failureBoundary(r, lo.lanes[0]) === null
      && r.segments[0].controlReplies.length === 1 && r.segments[0].orphanReplies.length === 0,
      { issues: r.issues, laneIssues: lo.issues, outcome: lo.lanes[0]?.outcome, controlReplies: r.segments[0].controlReplies });
  }
  // S1 missing deleteContext acknowledgement.
  {
    const { s, completed, failure } = laneRun(2, 0, 'a', k => (k === 4 ? { del: 'none' } : {}));
    s.finish('a', { completed, failure });
    const r = analyzeSinkText('missing-ack', s.text());
    const lane = laneOutcomes(r).lanes[0];
    const b = failureBoundary(r, lane);
    const pend = r.segments[0].pendingAtEnd.filter(p => p.method === 'Playwright.deleteContext');
    expect('S1 missing deleteContext ack detected', lane.outcome === 'FAILED' && b?.label === 'deleteContext-unacknowledged' && b.contextOrdinalInBrowser === 4 && pend.length === 1 && pend[0].label === 'unanswered-before-browser-exit' && fails(r).length === 0,
      { boundary: b, pend });
  }
  // S2 colliding ids: separate sinks exact; a merged stream is refused.
  {
    const A = laneRun(10, 0, 'a', () => ({})); A.s.finish('a', { completed: A.completed });
    const B = laneRun(20, 1, 'b', () => ({})); B.s.finish('b', { completed: B.completed });
    const ra = analyzeSinkText('A', A.s.text()), rb = analyzeSinkText('B', B.s.text());
    const merged = [...A.s.lines, ...B.s.lines].sort((x, y) => (BigInt(x.split(' ')[0]) < BigInt(y.split(' ')[0]) ? -1 : 1)).join('\n') + '\n';
    const rm = analyzeSinkText('merged', merged);
    expect('S2 id collision: separate sinks exact, merged stream fails ownership', fails(ra).length === 0 && fails(rb).length === 0 && fails(rm).includes('overlapping-browsers') && fails(rm).includes('protocol-with-overlapping-browsers'),
      { merged: [...new Set(fails(rm))] });
  }
  // S3 out-of-order replies pair correctly.
  {
    const { s, completed } = laneRun(3, 0, 'a', k => (k % 2 ? { outOfOrder: true } : {}));
    s.finish('a', { completed });
    const r = analyzeSinkText('out-of-order', s.text());
    expect('S3 out-of-order replies paired', r.issues.length === 0 && r.segments[0].contexts === CYCLES && r.segments[0].orphanReplies.length === 0 && r.segments[0].pendingAtEnd.length === 0, { issues: r.issues });
  }
  // S4 collector interruption: no exit mark and a cut tail -> unobserved, never unanswered.
  {
    const { s, completed, failure } = laneRun(4, 0, 'a', k => (k === 4 ? { del: 'none' } : {}));
    const keep = s.lines.findIndex(l => l.includes('"stage":"context.close","cycle":4') && l.includes('stage.end'));
    const cut = s.lines.slice(0, keep).join('\n') + '\n' + s.lines[keep].slice(0, 30); // killed mid-write
    void completed; void failure;
    const r = analyzeSinkText('interrupted', cut);
    const lane = laneOutcomes(r).lanes[0];
    const b = failureBoundary(r, lane);
    const pend = r.segments[0].pendingAtEnd.filter(p => p.method === 'Playwright.deleteContext');
    expect('S4 interruption -> stream not closed, absence unobserved', !r.closed && r.issues.some(i => i.code === 'sink-not-positively-closed' && i.severity === 'INCONCLUSIVE') && lane.outcome === 'CENSORED' && pend[0]?.label === 'unobserved-stream-not-closed',
      { closed: r.closed, outcome: lane.outcome, pend, boundary: b });
  }
  // S5 first failure plus cleanup failure: first failure kept; a summary that replaced it is caught.
  {
    const { s, completed, failure } = laneRun(5, 0, 'a', k => (k === 2 ? { nav: 'stall' } : {}));
    s.finish('a', { completed, failure, cleanup: 'timeout' });
    const r = analyzeSinkText('first+cleanup', s.text());
    const lo = laneOutcomes(r);
    const L = lo.lanes[0];
    const X = laneRun(6, 0, 'a', k => (k === 2 ? { nav: 'stall' } : {}));
    X.s.finish('a', { completed: X.completed, failure: X.failure, cleanup: 'timeout', summaryFailure: { stage: 'browser.cleanup', timeout: true } });
    const lx = laneOutcomes(analyzeSinkText('replaced', X.s.text()));
    expect('S5 first failure kept over cleanup failure; replacement detected', L.outcome === 'FAILED' && L.firstFailure.stage === 'goto' && L.firstFailure.cycle === 2 && L.cleanup?.ok === false && lo.issues.length === 0
      && lx.issues.some(i => i.code === 'first-failure-mismatch' && i.severity === 'FAIL'), { lane: L, replacedIssues: lx.issues });
  }
  // S6 protocol on the shared stderr is an ownership leak.
  expect('S6 shared-stderr protocol/launch lines detected', STDERR_PROTOCOL.test('2026-10-09T07:28:22.488Z pw:protocol SEND ► {"id":2}') && STDERR_LAUNCH.test('2026-10-09T07:28:22.307Z pw:browser <launched> pid=1')
    && !STDERR_PROTOCOL.test('Running 1 test using 1 worker'), {});
  // S7 navigation boundary classification.
  {
    const gap = laneRun(7, 0, 'a', k => (k === 75 ? { nav: 'stall' } : {})); gap.s.finish('a', { completed: gap.completed, failure: gap.failure });
    const pre = laneRun(8, 0, 'a', k => (k === 3 ? { nav: 'stall-before-willCheck' } : {})); pre.s.finish('a', { completed: pre.completed, failure: pre.failure });
    const rg = analyzeSinkText('gap', gap.s.text()), rp = analyzeSinkText('pre', pre.s.text());
    const bg = failureBoundary(rg, laneOutcomes(rg).lanes[0]), bp = failureBoundary(rp, laneOutcomes(rp).lanes[0]);
    expect('S7 pre-request gap classified; other boundary not', bg?.label === 'pre-request-gap-after-willCheck' && bg.contextOrdinalInBrowser === 75 && bg.contextId === '800000000000004C' && bp?.label === 'after-navigate-send-before-willCheck',
      { gap: bg?.label, pre: bp?.label, ctx: bg?.contextId });
  }
  // S8 probe missing from the server log fails observer liveness.
  {
    const runner = [{ ev: 'probe', kind: 'ready', ua: 'u/ready', status: 200 }, { ev: 'probe', kind: 'probe-1', ua: 'u/1', status: 200 }, { ev: 'probe', kind: 'final', ua: 'u/final', status: 200 }];
    const ok = probeCoverage(runner, runner.map(r => ({ ev: 'request.start', ua: r.ua })));
    const bad = probeCoverage(runner, [{ ev: 'request.start', ua: 'u/ready' }, { ev: 'request.start', ua: 'u/final' }]);
    expect('S8 missing probe detected', ok.missing.length === 0 && bad.missing.length === 1 && bad.missing[0] === 'u/1', { ok, bad });
  }
  // S9 a non-sequential context id is flagged (guards the ordinal mapping).
  {
    const { s, completed } = laneRun(9, 0, 'a', k => (k === 5 ? { badId: true } : {}));
    s.finish('a', { completed });
    const r = analyzeSinkText('bad-id', s.text());
    expect('S9 non-sequential context id flagged', r.segments[0].idSequential === false, {});
  }
  // S12 R3: the -9999 disposition is exact; ordinary orphans and a second control reply still fail.
  {
    const A = laneRun(30, 0, 'a', () => ({}));
    A.s.recv({ result: {}, id: 77777 }); // reply with no logged send and no source-defined exemption
    A.s.finish('a', { completed: A.completed });
    const ra = analyzeSinkText('orphan', A.s.text());
    const B = laneRun(31, 0, 'a', () => ({}));
    B.s.finish('a', { completed: B.completed, closeControl: 2 });
    const rb = analyzeSinkText('double-control', B.s.text());
    expect('S12 ordinary orphan and duplicate -9999 still FAIL', fails(ra).includes('orphan-reply') && ra.segments[0].orphanReplies[0] === 77777 && ra.segments[0].controlReplies.length === 1
      && fails(rb).includes('duplicate-close-control-reply') && !fails(rb).includes('orphan-reply'), { a: fails(ra), b: fails(rb) });
  }
  // S13/S14 R4: events arriving after the failed stage's end never change its boundary.
  {
    const n = laneRun(32, 0, 'a', k => (k === 75 ? { nav: 'stall', late: true } : {})); n.s.finish('a', { completed: n.completed, failure: n.failure });
    const rn = analyzeSinkText('late-nav', n.s.text());
    const bn = failureBoundary(rn, laneOutcomes(rn).lanes[0]);
    expect('S13 late navigate reply/didCheck reported separately; boundary stays pre-request gap', bn?.label === 'pre-request-gap-after-willCheck' && bn.seenByStageEnd.navigateReply === false
      && bn.lateEvents.some(e => e.event === 'navigateReply') && bn.lateEvents.some(e => e.event === 'Page.didCheckNavigationPolicy') && fails(rn).length === 0, { boundary: bn });
    const c = laneRun(33, 0, 'a', k => (k === 76 ? { del: 'none', late: true } : {})); c.s.finish('a', { completed: c.completed, failure: c.failure });
    const rc = analyzeSinkText('late-ack', c.s.text());
    const bc = failureBoundary(rc, laneOutcomes(rc).lanes[0]);
    expect('S14 late deleteContext ack reported separately; boundary stays unacknowledged', bc?.label === 'deleteContext-unacknowledged' && bc.ackMs === null && bc.pagesDestroyedByStageEnd === 0
      && bc.lateEvents.some(e => e.event === 'deleteContextAck') && bc.lateEvents.some(e => e.event === 'pageProxyDestroyed'), { boundary: bc });
  }
  // S15 R4: an unparsed record inside the failed window makes an absence label indeterminate.
  {
    const g = laneRun(34, 0, 'a', k => (k === 75 ? { nav: 'stall', garbled: true } : {})); g.s.finish('a', { completed: g.completed, failure: g.failure });
    const rg = analyzeSinkText('garbled', g.s.text());
    const bg = failureBoundary(rg, laneOutcomes(rg).lanes[0]);
    expect('S15 unparsed record in failed window -> indeterminate, provisional label kept', bg?.label === 'indeterminate-unparsed-records' && bg.provisionalLabel === 'pre-request-gap-after-willCheck' && bg.unparsedInWindow === 1, { boundary: bg });
  }
}

// ---- T3-R1: stock fixture timeout/accounting path ----
// Mirrors the mark order written by specs-stock/stock-skip.spec.mjs: lane.begin,
// browser.launch stage, per test fixtures.setup (begin in the auto fixture, end in the
// body), context.close (begin in the passthrough context override teardown; end in the
// auto fixture teardown only when the shared After Hooks slot is not exhausted),
// context.close.event on the public 'close' event, a passive stage.deadline at the
// slot deadline, and the worker-teardown fallback end for unobserved stage ends.
// mode: undefined (all normal) | 'exhausted' | 'exhausted-no-deadline' | 'interrupted-teardown'
function stockLane(pid, { failAt = null, mode, lateAckMs = null } = {}) {
  const s = builder(pid, 0);
  const lane = 'p0', base = { lane, workerIndex: 0, parallelIndex: 0 };
  s.mark('sink.open', { workerIndex: 0, parallelIndex: 0, debugProtocolEnabled: true });
  s.mark('lane.begin', { ...base, workload: 'stock-skip', cycles: CYCLES, project: 'iphone-15-portrait', trace: 'on' });
  s.mark('stage.begin', { ...base, stage: 'browser.launch', launches: 1 });
  s.L(`pw:browser <launched> pid=${pid + 100}`);
  s.mark('stage.end', { ...base, stage: 'browser.launch', launches: 1, ok: true, timeout: false, error: null });
  let completed = 0, interrupted = null, unresolved = null, fallbackMono = null;
  for (let k = 1; k <= CYCLES; k++) {
    const where = { cycle: k, contextInBrowser: k }, ctx = s.ctxId(k), page = String(1000 + k), b = k * 100, test = `stock a ${k}`;
    s.mark('stage.begin', { ...base, stage: 'fixtures.setup', ...where, slotRemainingMs: 29990, test });
    s.send(b + 1, 'Playwright.createContext'); s.recv({ result: { browserContextId: ctx }, id: b + 1 });
    s.send(b + 2, 'Playwright.createPage', { browserContextId: ctx }); s.recv({ result: { pageProxyId: page }, id: b + 2 });
    s.mark('stage.end', { ...base, stage: 'fixtures.setup', ...where, ok: true, timeout: false, error: null });
    s.mark('stage.begin', { ...base, stage: 'context.close', ...where, slotRemainingMs: 29980 });
    s.send(b + 4, 'Playwright.deleteContext', { browserContextId: ctx });
    const ack = () => {
      s.recv({ method: 'Playwright.pageProxyDestroyed', params: { pageProxyId: page } });
      s.recv({ result: {}, id: b + 4 });
      s.mark('context.close.event', { ...base, ...where });
    };
    if (k !== failAt) {
      ack();
      s.mark('stage.end', { ...base, stage: 'context.close', ...where, ok: true, timeout: false, error: null });
      completed++;
      s.mark('cycle.ok', { ...base, ...where });
      continue;
    }
    if (mode === 'interrupted-teardown') {
      // Sibling failure stops the worker: testInfo._interrupt(); status stays 'skipped' and
      // the slot is not exhausted, so the auto fixture teardown still runs.
      s.advance(2_000);
      interrupted = { stage: 'context.close', ...where, status: 'skipped' };
      s.mark('stage.end', { ...base, stage: 'context.close', ...where, ok: false, interrupted: true, timeout: false, error: 'interrupted (status skipped)' });
    } else {
      // Exhausted shared slot: the auto fixture teardown is skipped (fixtureRunner.js:114).
      s.advance(29_980);
      if (mode !== 'exhausted-no-deadline') s.mark('stage.deadline', { ...base, stage: 'context.close', ...where, slotRemainingMsAtBegin: 29_980 });
      if (lateAckMs !== null) { s.advance(lateAckMs); ack(); } // acknowledged after the timeout, before worker cleanup
      s.advance(3_000); // _setupArtifacts (timeout 0) and other teardown before the worker-scoped fallback
      unresolved = { stage: 'context.close', ...where, test, deadlineMarked: null };
      s.mark('stage.end', { ...base, stage: 'context.close', ...where, ok: false, fallback: true, timeout: null, error: 'stage end not observed in-test' });
      fallbackMono = s.lines.at(-1).split(' ')[0];
    }
    break;
  }
  const failed = !!(interrupted || unresolved);
  const closeStage = failed ? 'browser.cleanup' : 'browser.close';
  s.mark('stage.begin', { ...base, stage: closeStage, launches: 1 });
  s.recv({ result: {}, id: -9999 });
  s.L(`pw:browser [pid=${pid + 100}] <process did exit: exitCode=0, signal=null>`);
  s.mark('stage.end', { ...base, stage: closeStage, launches: 1, ok: true, timeout: false, error: null });
  s.mark('lane.summary', { ...base, cycles: CYCLES, completed, launches: 1, closesOk: 1, failure: null, interrupted, unresolved, cleanup: failed ? { ok: true, timeout: false, error: null } : null, browserLeftOpen: false });
  s.mark('sink.exit', { code: 0, liveBrowsers: 0 });
  const r = analyzeSinkText(`stock-${mode ?? 'normal'}`, s.text());
  return { r, lo: laneOutcomes(r), fallbackMono };
}

function stockCases() {
  const timedOutReport = k => [{ title: `stock a ${k}`, status: 'unexpected', results: ['timedOut'], error: 'Tearing down "context" exceeded the test timeout of 30000ms.' }];
  // S18 normal skip completion: 150 stock cycles, close confirmed by the 'close' event.
  {
    const { r, lo } = stockLane(50);
    const L = resolveStockLane(lo.lanes[0], []);
    expect('S18 stock normal skip completion -> COMPLETED, no issues', L.outcome === 'COMPLETED' && L.completed === CYCLES && r.issues.length === 0 && lo.issues.length === 0
      && failureBoundary(r, L) === null && r.segments[0].contexts === CYCLES, { outcome: L.outcome, issues: r.issues, laneIssues: lo.issues });
  }
  // S19 exhausted close slot + ack between the timeout and worker cleanup: timeout retained,
  // boundary cut at the deadline mark; the late ack cannot become timely. Before resolution
  // the lane is UNRESOLVED with no boundary; the naive fallback cutoff would be wrong.
  {
    const { r, lo, fallbackMono } = stockLane(51, { failAt: 76, mode: 'exhausted', lateAckMs: 5_000 });
    const U = lo.lanes[0];
    const L = resolveStockLane(U, timedOutReport(76));
    const b = failureBoundary(r, L);
    const naive = failureBoundary(r, { ...L, cutoffToleranceMs: null, failedStageWindow: { beginMono: L.failedStageWindow.beginMono, endMono: fallbackMono } });
    expect('S19 exhausted slot: timeout kept, late ack stays late, cutoff = deadline mark', U.outcome === 'UNRESOLVED' && failureBoundary(r, U) === null
      && L.outcome === 'FAILED' && L.firstFailure.timeout === true && /exceeded the test timeout/.test(L.firstFailure.error) && L.failedStageWindow.cutoff === 'slot-deadline-mark'
      && b?.label === 'deleteContext-unacknowledged' && b.contextOrdinalInBrowser === 76 && b.lateEvents.some(e => e.event === 'deleteContextAck' && e.msAfterStageEnd >= 5_000)
      && naive?.label === 'after-deleteContext-ack' && fails(r).length === 0 && lo.issues.length === 0,
      { unresolved: U.unresolved, resolved: { outcome: L.outcome, firstFailure: L.firstFailure, window: L.failedStageWindow }, boundary: b, naiveFallbackLabel: naive?.label });
  }
  // S20 ack too close to the deadline mark to order against Playwright's own timeout -> indeterminate.
  {
    const { r, lo } = stockLane(52, { failAt: 76, mode: 'exhausted', lateAckMs: 300 });
    const b = failureBoundary(r, resolveStockLane(lo.lanes[0], timedOutReport(76)));
    expect('S20 ack within cutoff tolerance -> indeterminate-near-cutoff', b?.label === 'indeterminate-near-cutoff' && b.provisionalLabel === 'deleteContext-unacknowledged', { boundary: b });
  }
  // S21 interrupted or unobserved capture is never a definitive boundary.
  {
    const a = stockLane(53, { failAt: 40, mode: 'interrupted-teardown' });
    const La = resolveStockLane(a.lo.lanes[0], []);
    const bq = stockLane(54, { failAt: 40, mode: 'exhausted' });
    const Lb = resolveStockLane(bq.lo.lanes[0], [{ title: 'stock a 40', status: 'skipped', results: ['skipped'], error: null }]);
    const Lm = resolveStockLane(bq.lo.lanes[0], []);
    const c = stockLane(55, { failAt: 40, mode: 'exhausted-no-deadline' });
    const Lc = resolveStockLane(c.lo.lanes[0], timedOutReport(40));
    const bc = failureBoundary(c.r, Lc);
    expect('S21 interrupted/unobserved capture -> CENSORED or indeterminate, never definitive',
      La.outcome === 'CENSORED' && La.firstFailure === null && failureBoundary(a.r, La) === null && a.lo.issues.length === 0
      && Lb.outcome === 'CENSORED' && Lb.resolution === 'report-skipped' && Lm.outcome === 'CENSORED' && Lm.resolution === 'report-missing'
      && Lc.outcome === 'FAILED' && Lc.firstFailure.timeout === true && bc?.label === 'indeterminate-no-stage-window',
      { interrupted: La.outcome, skippedAfterExhaustion: Lb.resolution, missingReport: Lm.resolution, noDeadline: bc?.label });
  }
}

// S16 R2: deliberate serialization of nested BigInt evidence (and omission of _seg).
function serializationCase(dir) {
  const file = path.join(dir, 'serialization-probe.json');
  let parsed = null, error = null;
  try {
    writeJson(file, { detail: { nested: [{ mono: 123456789012345678901234567890n }] }, _seg: { m: 1n } });
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) { error = String(e); }
  expect('S16 nested BigInt serialized as decimal string; _seg omitted', parsed?.detail?.nested?.[0]?.mono === '123456789012345678901234567890' && !('_seg' in (parsed ?? {})), { error });
}

// S17 R5: a writer lingering in the process group after its leader exits is
// detected, killed and observed gone before sealing; an unproven exit leaves the
// directory explicitly unsealed.
async function lingeringWriterCase(dir) {
  const work = path.join(dir, 'lingering');
  fs.mkdirSync(work);
  const out = path.join(work, 'writer.log');
  const leader = spawn(process.execPath, [SELF, '--child-lingering-leader', out], { stdio: 'ignore', detached: true });
  await new Promise(r => leader.once('exit', r));
  for (let i = 0; i < 50 && !fs.existsSync(out); i++) await sleep(100);
  const grew = fs.existsSync(out);
  const group = await drainGroup(leader.pid, { graceMs: 1_000, killWaitMs: 5_000 });
  const size1 = grew ? fs.statSync(out).size : -1;
  await sleep(400);
  const stable = grew && fs.statSync(out).size === size1;
  const fin = finalizeEvidence(work, group.exited && stable, 'writer not proven exited');
  const neg = path.join(dir, 'unproven');
  fs.mkdirSync(neg);
  fs.writeFileSync(path.join(neg, 'partial.log'), 'x\n', { flag: 'wx' });
  const finNeg = finalizeEvidence(neg, false, 'selfcheck: writer exit deliberately unproven');
  expect('S17 lingering group writer detected, killed, observed exited before sealing; unproven -> UNSEALED',
    grew && group.lingeringBeforeKill.length >= 1 && group.killed && group.exited && stable && fin.sealed && verifyManifest(work).ok
      && !finNeg.sealed && !fs.existsSync(path.join(neg, 'MANIFEST.sha256')) && fs.existsSync(path.join(neg, 'UNSEALED-INCOMPLETE.txt')),
    { grew, group, stable, sealed: fin.sealed, negative: finNeg });
}

function run(cmd, argv, env, timeoutMs = 20_000) {
  return new Promise(resolve => {
    const child = spawn(cmd, argv, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('exit', code => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

async function realSinkCase(dir) {
  const sinkDir = path.join(dir, 'child-sink');
  const env = { ...process.env, DEBUG: 'pw:api,pw:browser,pw:protocol', DEBUG_COLORS: 'no' };
  delete env.DEBUG_FILE;
  const r = await run(process.execPath, [SELF, '--child-sink', sinkDir], env);
  const files = fs.existsSync(sinkDir) ? fs.readdirSync(sinkDir) : [];
  const text = files.length === 1 ? fs.readFileSync(path.join(sinkDir, files[0]), 'utf8') : '';
  const routed = /^\d+ \S+ pw:protocol SEND ► \{"id":1,"method":"Selfcheck\.probe"\}$/m.test(text) && /pw:protocol ◀ RECV \{"id":1,"result":\{\}\}/.test(text);
  const closed = /#mark \{"ev":"sink\.exit"/.test(text.trim().split('\n').pop());
  expect('S10 real debugProtocolLogger routed to the sink, not stderr', r.code === 0 && files.length === 1 && routed && closed && !STDERR_PROTOCOL.test(r.err), { code: r.code, files, stderr: r.err.slice(0, 500) });
}

function fetch(port, p) {
  return new Promise(resolve => {
    http.get({ host: '127.0.0.1', port, path: p, headers: { 'user-agent': `diag161c-selfcheck${p}` }, timeout: 5000 }, res => {
      const h = crypto.createHash('sha256');
      res.on('data', d => h.update(d));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] ?? null, sha256: h.digest('hex') }));
    }).on('error', e => resolve({ error: e.code ?? String(e) }));
  });
}

async function serverParity(dir) {
  const log = path.join(dir, 'parity-server.jsonl');
  const start = (script, port, extra) => {
    const child = spawn(process.execPath, [script], { cwd: REPO, env: { ...process.env, PORT: String(port), ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    return { child, ready: async () => { for (let i = 0; i < 100 && !out.includes('listening'); i++) await sleep(100); return out; } };
  };
  const raw = start(path.join(REPO, 'scripts', 'serve-root.mjs'), 18091, {});
  const logged = start(path.join(HERE, 'serve-logged.mjs'), 18092, { DIAG161C_SERVER_LOG: log });
  try {
    const [o1, o2] = [await raw.ready(), await logged.ready()];
    const paths = ['/version.json', '/', '/football/', '/does-not-exist', '/scripts/../version.json'];
    const rows = [];
    for (const p of paths) rows.push({ path: p, raw: await fetch(18091, p), logged: await fetch(18092, p) });
    await sleep(300);
    const seen = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
    const observed = paths.every(p => seen.some(r => r.ev === 'request.start' && r.ua === `diag161c-selfcheck${p}`));
    const same = rows.every(r => !r.raw.error && JSON.stringify(r.raw) === JSON.stringify(r.logged));
    const closes = seen.filter(r => r.ev === 'socket.close').length;
    expect('S11 serve-logged parity with unchanged serve-root, all requests observed', same && observed && o1.includes('listening') && o2.includes('listening'), { rows, observed, socketCloses: closes });
  } finally {
    // The logged server writes into this directory: observe both exits before sealing.
    const exited = c => (c.exitCode !== null || c.signalCode !== null ? Promise.resolve(true) : Promise.race([new Promise(r => c.once('exit', () => r(true))), sleep(5_000).then(() => false)]));
    raw.child.kill('SIGTERM');
    logged.child.kill('SIGTERM');
    parityServersExited = (await exited(raw.child)) && (await exited(logged.child));
  }
}
let parityServersExited = false;

const dir = newRunDir('selfcheck');
syntheticCases();
stockCases();
serializationCase(dir);
await lingeringWriterCase(dir);
await realSinkCase(dir);
await serverParity(dir);
const ok = results.every(r => r.pass);
writeJson(path.join(dir, 'selfcheck.json'), { verdict: ok ? 'PASS' : 'FAIL', meaning: 'collector/checker sensitivity only; no WebKit evidence', results, parityServersExited });
const fin = finalizeEvidence(dir, parityServersExited, 'selfcheck parity server exit not observed');
const sealedOk = fin.sealed && verifyManifest(dir).ok;
for (const r of results) console.log(`[selfcheck] ${r.pass ? 'PASS' : 'FAIL'}  ${r.case}`);
// PASS requires every case PASS AND a sealed, verified selfcheck directory.
console.log(`[selfcheck] verdict ${ok && sealedOk ? 'PASS' : 'FAIL'} ${path.relative(REPO, dir)}${sealedOk ? '' : ' (UNSEALED-INCOMPLETE)'}`);
process.exit(ok && sealedOk ? 0 : 1);
