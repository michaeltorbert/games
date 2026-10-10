// Issue #161 continuation synthetic lifecycle lanes (never a release test).
// Each lane owns ONE browser it launches itself, as the historical diff-single
// arm did, and runs 150 cycles in it:
//   nav:   newContext(project options) -> newPage -> goto /version.json (load)
//          -> context.close                       (the diff-single recipe)
//   blank: newContext(project options) -> newPage (left on about:blank)
//          -> page.screenshot -> page.evaluate -> context.close
//          (approximates the historical skipped-test teardown path; it is not
//          a replica of the Time Lab case)
// Neither workload loads Football or any page with audio, so the Football test
// mute does not apply; the spec refuses any other URL.
//
// Every stage, including browser launch and close, is bounded at 30 s and
// marked begin/end in this process's protocol sink, in the same ordered stream
// as the protocol lines. A race does not cancel the losing operation, so after
// any unsuccessful stage the lane stops: no further cycle and no new launch, so
// browsers never overlap. The first failure is kept; owned-browser cleanup is
// bounded, recorded separately and can never replace it.
import path from 'node:path';
import { test } from '@playwright/test';
import { installSink } from '../sink.mjs';

const CYCLES = 150;
const STEP_MS = 30_000;
const NAV_PATH = '/version.json';
const workload = process.env.DIAG161C_WORKLOAD;
const lanes = Number(process.env.DIAG161C_LANES);

for (const lane of ['a', 'b'].slice(0, lanes)) {
  test(`${workload} lane ${lane}`, async ({ playwright, browserName, headless, launchOptions, baseURL }, testInfo) => {
    if (!['nav', 'blank'].includes(workload) || ![1, 2].includes(lanes)) throw new Error(`bad DIAG161C_WORKLOAD/LANES ${workload}/${lanes}`);
    if (browserName !== 'webkit') throw new Error(`continuation requires webkit, got "${browserName}"`);
    test.setTimeout(10 * 60_000); // synthetic lane only; below run-arm's CLI budget
    const sink = installSink(path.join(process.env.DIAG161C_RUN_DIR, 'sinks'), {
      runId: path.basename(process.env.DIAG161C_RUN_DIR),
      workerIndex: testInfo.workerIndex,
      parallelIndex: testInfo.parallelIndex,
    });
    const { viewport, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
    const browserLaunchOptions = { handleSIGINT: false, ...launchOptions, ...(headless !== undefined ? { headless } : {}) };
    const base = { lane, workerIndex: testInfo.workerIndex, parallelIndex: testInfo.parallelIndex };
    sink.mark('lane.begin', {
      ...base, workload, cycles: CYCLES, stepMs: STEP_MS, project: testInfo.project.name,
      trace: process.env.DIAG161C_TRACE, contextOptions: { viewport, deviceScaleFactor, isMobile, hasTouch }, launchOptions: browserLaunchOptions,
    });

    let failure = null; // first unsuccessful stage; never overwritten
    let cleanup = null;
    let browser = null;
    let launches = 0;
    let closesOk = 0;
    let completed = 0;
    const stage = async (name, where, fn) => {
      sink.mark('stage.begin', { ...base, stage: name, ...where });
      let timer;
      const r = await Promise.race([
        Promise.resolve().then(fn).then(value => ({ ok: true, value }), error => ({ ok: false, error: String(error).slice(0, 300) })),
        new Promise(resolve => { timer = setTimeout(() => resolve({ ok: false, timeout: true }), STEP_MS); }),
      ]);
      clearTimeout(timer);
      sink.mark('stage.end', { ...base, stage: name, ...where, ok: r.ok, timeout: !!r.timeout, error: r.error ?? null });
      if (!r.ok && !failure && name !== 'browser.cleanup') failure = { stage: name, ...where, timeout: !!r.timeout, error: r.error ?? null };
      return r;
    };
    const closeBrowser = async (name, where) => {
      const r = await stage(name, where, () => browser.close());
      if (r.ok) { closesOk++; browser = null; sink.closed(); }
      return r;
    };

    try {
      // Ownership: this process must hold no other live browser before launching.
      if (sink.liveBrowsers() !== 0) {
        failure = { stage: 'ownership', error: `${sink.liveBrowsers()} browser(s) from an earlier lane still live in this worker` };
      } else {
        const launched = await stage('browser.launch', { launches: 1 }, () => playwright[browserName].launch(browserLaunchOptions));
        if (launched.ok) {
          browser = launched.value;
          launches = 1;
          sink.launched();
          sink.mark('browser.version', { ...base, version: browser.version() });
          for (let cycle = 1; cycle <= CYCLES; cycle++) {
            const where = { cycle, contextInBrowser: cycle };
            const context = await stage('newContext', where, () => browser.newContext({ viewport, deviceScaleFactor, isMobile, hasTouch, baseURL }));
            if (!context.ok) break;
            const page = await stage('newPage', where, () => context.value.newPage());
            if (!page.ok) break;
            if (workload === 'nav') {
              const nav = await stage('goto', where, async () => {
                const response = await page.value.goto(NAV_PATH, { timeout: STEP_MS });
                if (new URL(page.value.url()).pathname !== NAV_PATH || response?.status() !== 200) throw new Error(`unexpected navigation result ${page.value.url()} ${response?.status()}`);
              });
              if (!nav.ok) break;
            } else {
              if (!(await stage('screenshot', where, () => page.value.screenshot())).ok) break;
              const ev = await stage('evaluate', where, async () => {
                const state = await page.value.evaluate(() => ({ href: location.href, w: innerWidth, h: innerHeight }));
                if (state.href !== 'about:blank') throw new Error(`blank lane left about:blank: ${state.href}`);
                return state;
              });
              if (!ev.ok) break;
            }
            if (!(await stage('context.close', where, () => context.value.close())).ok) break;
            completed++;
            sink.mark('cycle.ok', { ...base, ...where });
          }
          if (!failure) await closeBrowser('browser.close', { launches });
        }
      }
    } finally {
      // Exceptional exit or failed stage: bounded owned cleanup; the first failure stands.
      if (browser) {
        const r = await closeBrowser('browser.cleanup', { launches });
        cleanup = { ok: r.ok, timeout: !!r.timeout, error: r.error ?? null };
      }
      sink.mark('lane.summary', { ...base, cycles: CYCLES, completed, launches, closesOk, failure, cleanup, browserLeftOpen: !!browser });
    }

    if (failure) throw new Error(`diag-161 continuation: ${failure.stage} ${failure.timeout ? 'timed out' : 'failed'} at cycle ${failure.cycle ?? '-'} (lane ${lane})`);
    if (completed !== CYCLES || launches !== 1 || closesOk !== 1) {
      throw new Error(`diag-161 continuation incomplete: ${completed}/${CYCLES} cycles, ${launches} launches, ${closesOk} confirmed closes`);
    }
  });
}
