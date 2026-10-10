// Issue #161 continuation batch 2, arm T3 (synthetic; never a release test).
// Question: does the REAL stock skipped-test fixture path reproduce the
// historical teardown boundary (unacknowledged Playwright.deleteContext) when
// navigation cannot censor it?
//
// Each test uses the unchanged tests/curriculum-fixture.mjs `test` with the
// stock `page` fixture, exactly as the historical Time Lab case did:
//   stock worker-scoped `browser` (stock launch options) -> stock `context`
//   (_contextFactory) with the existing session-mute and curriculum init
//   scripts -> stock `page` left on about:blank -> test.skip() in the body ->
//   stock teardown: trace stopChunk + temporary screenshot
//   (ArtifactsRecorder.willCloseBrowserContext) -> context.close("Test ended.").
// No page navigates, so no Football document, audio or input is involved (the
// mute init script returns early off /football). Two `describe.serial` groups
// of 150 tests give one stock browser per native worker with 150 stock
// contexts each. Deadlines are the base 30 s test timeout; no retries.
//
// Observation only, no behaviour change. `playwright` is overridden as a
// passthrough to install the per-process sink before the stock browser
// launches. A test-scoped auto fixture (set up before, torn down after the
// stock context, per fixtureRunner ordering) and a passthrough `context`
// override mark the setup and close stages in the same ordered stream as the
// protocol.
//
// Timeout fidelity (Sol T3-R1). Installed Playwright 1.56.1 runs all test
// fixture teardowns in one shared After Hooks slot (workerMain.js:316-336) and
// SKIPS every later teardown once that slot is exhausted
// (fixtureRunner.js:111-124), so the auto fixture's end mark cannot record a
// close that timed out. Therefore, when each stage begins, the remaining time
// of the CURRENT shared slot is read (read-only) from the installed
// TimeoutManager (testInfo._timeoutManager.currentSlotDeadline(), the same
// value testInfo.js:137 uses, compared with playwright-core monotonicTime as
// timeoutManager.js:90 does), and an unref'd passive timer writes a
// `stage.deadline` mark at that instant. It changes no deadline and does not
// race, cancel or wait for anything. A close counts as completed only if the
// public BrowserContext 'close' event fired. A stage whose end is not observed
// in-test is left UNRESOLVED (fallback end mark at worker teardown, never a
// failure cutoff) and resolved by check-run only from the report: 'timedOut'
// -> failure cut off at the deadline mark (indeterminate if none or if relevant
// events lie near it); anything else, including an interrupted capture, ->
// CENSORED. If the internal deadline is unavailable no mark is written and
// such a timeout stays indeterminate.
import path from 'node:path';
import { createRequire } from 'node:module';
import { test as curriculumTest } from '../../../../tests/curriculum-fixture.mjs';
import { installSink } from '../sink.mjs';

const require = createRequire(import.meta.url);
const { monotonicTime } = require('playwright-core/lib/utils');
const NO_DEADLINE = 2147483647; // kMaxDeadline, playwright/lib/worker/timeoutManager.js:29

const CYCLES = 150;
const lanes = Number(process.env.DIAG161C_LANES);
const runDir = process.env.DIAG161C_RUN_DIR;
let w = null; // per-worker-process state

function slotRemainingMs(testInfo) {
  try {
    const deadline = testInfo._timeoutManager?.currentSlotDeadline?.();
    if (typeof deadline !== 'number' || deadline >= NO_DEADLINE) return null;
    return deadline - monotonicTime();
  } catch { return null; }
}

function beginStage(stage, where, testInfo, extra = {}) {
  const remaining = slotRemainingMs(testInfo);
  const open = { stage, where, closeEvent: false };
  w.sink.mark('stage.begin', { ...w.base, stage, ...where, slotRemainingMs: remaining, ...extra });
  if (remaining !== null) {
    open.timer = setTimeout(() => {
      if (w.open === open) w.sink.mark('stage.deadline', { ...w.base, stage, ...where, slotRemainingMsAtBegin: remaining });
    }, Math.max(0, remaining));
    open.timer.unref();
  }
  w.open = open;
}

// End the open stage. `failure` false records the end without creating a lane failure
// (interrupted or unresolved ends); those are classified by the checker, not here.
function endOpen(fields, { failure = true } = {}) {
  if (!w.open) return;
  const { stage, where, timer } = w.open;
  if (timer) clearTimeout(timer);
  w.sink.mark('stage.end', { ...w.base, stage, ...where, ...fields });
  if (failure && !fields.ok && !w.failure) w.failure = { stage, ...where, timeout: fields.timeout, error: fields.error };
  w.open = null;
}

const test = curriculumTest.extend({
  playwright: [async ({ playwright }, use, workerInfo) => {
    if (process.env.DIAG161C_WORKLOAD !== 'stock-skip' || ![1, 2].includes(lanes)) throw new Error('stock-skip spec must run through run-arm.mjs with the batch-2 manifest');
    const lane = `p${workerInfo.parallelIndex}`;
    const sink = installSink(path.join(runDir, 'sinks'), { runId: path.basename(runDir), workerIndex: workerInfo.workerIndex, parallelIndex: workerInfo.parallelIndex });
    w = { sink, lane, base: { lane, workerIndex: workerInfo.workerIndex, parallelIndex: workerInfo.parallelIndex }, cycle: 0, completed: 0, failure: null, interrupted: null, unresolved: null, open: null, browserUp: false, closeStage: null };
    sink.mark('lane.begin', { ...w.base, workload: 'stock-skip', cycles: CYCLES, project: workerInfo.project.name, trace: process.env.DIAG161C_TRACE });
    sink.mark('stage.begin', { ...w.base, stage: 'browser.launch', launches: 1 });
    await use(playwright);
    // The stock `browser` depends on `playwright`, so it has been torn down here.
    if (!w.browserUp) {
      sink.mark('stage.end', { ...w.base, stage: 'browser.launch', launches: 1, ok: false, timeout: false, error: 'stock browser fixture did not provide a browser' });
      w.failure ??= { stage: 'browser.launch', timeout: false, error: 'stock browser fixture did not provide a browser' };
    } else {
      sink.mark('stage.end', { ...w.base, stage: w.closeStage, launches: 1, ok: true, timeout: false, error: null });
    }
    sink.mark('lane.summary', {
      ...w.base, cycles: CYCLES, completed: w.completed, launches: w.browserUp ? 1 : 0, closesOk: w.browserUp ? 1 : 0, failure: w.failure,
      interrupted: w.interrupted, unresolved: w.unresolved,
      cleanup: (w.failure || w.unresolved) && w.browserUp ? { ok: true, timeout: false, error: null } : null, browserLeftOpen: false,
    });
  }, { scope: 'worker' }],

  browser: [async ({ browser }, use) => {
    w.browserUp = true;
    w.sink.mark('stage.end', { ...w.base, stage: 'browser.launch', launches: 1, ok: true, timeout: false, error: null });
    w.sink.mark('browser.version', { ...w.base, version: browser.version() });
    await use(browser);
    // A stage whose end was not observed in-test (its teardown skipped after the
    // shared slot ran out, or the worker stopped): record a FALLBACK end before the
    // stock browser closes. It is never a failure cutoff; check-run resolves it.
    if (w.open) {
      const { stage, where } = w.open;
      w.unresolved = { stage, ...where, test: w.open.test ?? w.currentTest ?? null, deadlineMarked: null };
      endOpen({ ok: false, fallback: true, timeout: null, error: 'stage end not observed in-test' }, { failure: false });
    }
    w.closeStage = w.failure || w.unresolved ? 'browser.cleanup' : 'browser.close';
    w.sink.mark('stage.begin', { ...w.base, stage: w.closeStage, launches: 1 });
  }, { scope: 'worker' }],

  // Auto, test-scoped, depends only on `playwright`: set up before the stock
  // context and torn down after it (unless the shared slot is exhausted).
  diagCycle: [async ({ playwright }, use, testInfo) => {
    void playwright;
    const cycle = ++w.cycle;
    const where = { cycle, contextInBrowser: cycle };
    w.currentTest = testInfo.title;
    beginStage('fixtures.setup', where, testInfo, { test: testInfo.title });
    w.open.test = testInfo.title;
    await use(where);
    // Reached only if the shared After Hooks slot was not exhausted.
    const closing = w.open?.stage === 'context.close';
    const ok = testInfo.status === 'skipped' && closing && w.open.closeEvent;
    const interrupted = testInfo._wasInterrupted === true; // testInfo.js:275; keeps status 'skipped'
    if (ok) {
      endOpen({ ok: true, timeout: false, error: null });
      w.completed++;
      w.sink.mark('cycle.ok', { ...w.base, ...where });
    } else if (interrupted) {
      w.interrupted ??= { stage: w.open?.stage ?? null, ...where, status: testInfo.status };
      endOpen({ ok: false, interrupted: true, timeout: false, error: `interrupted (status ${testInfo.status})` }, { failure: false });
    } else {
      endOpen({ ok: false, timeout: testInfo.status === 'timedOut', error: String(testInfo.errors[0]?.message ?? `status ${testInfo.status}, close event ${!!w.open?.closeEvent}`).slice(0, 300) });
    }
  }, { auto: true }],

  // Passthrough: its teardown runs immediately before the stock context closes.
  context: async ({ context, diagCycle }, use, testInfo) => {
    const markClose = () => {
      if (w.open?.stage === 'context.close' && w.open.where === diagCycle) {
        w.open.closeEvent = true;
        w.sink.mark('context.close.event', { ...w.base, ...diagCycle });
      }
    };
    context.once('close', markClose);
    await use(context);
    beginStage('context.close', diagCycle, testInfo);
    w.open.test = testInfo.title;
  },
});

for (const group of ['a', 'b'].slice(0, lanes)) {
  test.describe.serial(`stock ${group}`, () => {
    for (let i = 1; i <= CYCLES; i++) {
      test(`stock ${group} ${i}`, async ({ page, diagCycle }) => {
        void page; // stock page fixture: context + page created, left on about:blank
        void diagCycle;
        endOpen({ ok: true, timeout: false, error: null });
        test.skip(true, 'diag-161 synthetic: stock skipped-test fixture teardown exposure');
      });
    }
  });
}
