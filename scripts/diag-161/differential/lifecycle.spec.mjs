// Issue #161 conditional matched differential pair (synthetic, not a release
// test). Question: is the WebKit stall associated with state accumulated
// within one browser lifetime under a minimal workload without Football content?
//   diff-single:   150 identical cycles in ONE launched browser
//   diff-relaunch: the same 150 cycles, relaunching the browser every 50
// A cycle: newContext(project device options) -> newPage -> goto
// /version.json (load) -> context.close. Every stage, including browser
// launch and close, is bounded at 30 s and logged (begin/end/ok/timeout/error).
// Racing does not cancel an operation, so after any unsuccessful stage the
// project stops: no further cycle and no new launch (no overlapping browsers).
// The first failure is kept; owned-browser cleanup is bounded and can never
// replace it. The test passes only after 150 successful cycles and a
// confirmed close of every launched browser. Release deadlines are unchanged;
// the 10-minute bound applies to this synthetic test only.
import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';

const CYCLES = 150;
const RELAUNCH_EVERY = 50;
const STEP_MS = 30_000;
const mode = process.env.DIAG161_DIFF;

// Fixtures verified in installed Playwright 1.56.1 (lib/index.js:65-71): playwright,
// browserName, headless, launchOptions. Launch options mirror the `_browserOptions`
// the stock `browser` fixture uses (lines 78-89), identically in both arms.
test('browser-lifetime context cycles', async ({ playwright, browserName, headless, launchOptions, baseURL }, testInfo) => {
  if (!['single', 'relaunch'].includes(mode)) throw new Error(`DIAG161_DIFF must be single or relaunch, got "${mode}"`);
  if (browserName !== 'webkit') throw new Error(`differential requires webkit, got "${browserName}"`);
  const browserType = playwright[browserName];
  const browserLaunchOptions = { handleSIGINT: false, ...launchOptions, ...(headless !== undefined ? { headless } : {}) };
  test.setTimeout(10 * 60_000);
  const { viewport, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
  const dir = path.join(process.env.DIAG161_RUN_DIR, 'differential');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${testInfo.project.name}.jsonl`);
  const log = rec => fs.appendFileSync(file, JSON.stringify({ t: new Date().toISOString(), mode, project: testInfo.project.name, ...rec }) + '\n');
  const perBrowser = mode === 'single' ? CYCLES : RELAUNCH_EVERY;
  const plan = { cycles: CYCLES, perBrowser, expectedLaunches: Math.ceil(CYCLES / perBrowser), stepMs: STEP_MS };
  log({ ev: 'plan', ...plan, browserName, launchOptions: browserLaunchOptions });

  let failure = null; // first unsuccessful stage; never overwritten
  let browser = null;
  let launches = 0;
  let closesOk = 0;
  let completed = 0;
  const stage = async (name, where, fn) => {
    log({ ev: 'stage.begin', stage: name, ...where });
    let timer;
    const r = await Promise.race([
      Promise.resolve().then(fn).then(value => ({ ok: true, value }), error => ({ ok: false, error: String(error).slice(0, 300) })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ ok: false, timeout: true }), STEP_MS); }),
    ]);
    clearTimeout(timer);
    log({ ev: 'stage.end', stage: name, ...where, ok: r.ok, timeout: !!r.timeout, error: r.error ?? null });
    if (!r.ok && !failure) failure = { stage: name, ...where, timeout: !!r.timeout, error: r.error ?? null };
    return r;
  };
  const closeBrowser = async (name, where) => {
    const r = await stage(name, where, () => browser.close());
    if (r.ok) { closesOk++; browser = null; }
    return r.ok;
  };

  try {
    let inBrowser = 0;
    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      if (!browser || inBrowser === perBrowser) {
        // A browser whose close is unconfirmed is never followed by another launch.
        if (browser && !await closeBrowser('browser.close', { cycle, launches })) break;
        const launched = await stage('browser.launch', { cycle, launches: launches + 1 }, () => browserType.launch(browserLaunchOptions));
        if (!launched.ok) break;
        browser = launched.value;
        launches++;
        inBrowser = 0;
        log({ ev: 'browser.version', launches, version: browser.version() });
      }
      inBrowser++;
      const where = { cycle, launches, contextInBrowser: inBrowser };
      const context = await stage('newContext', where, () => browser.newContext({ viewport, deviceScaleFactor, isMobile, hasTouch, baseURL }));
      if (!context.ok) break;
      const page = await stage('newPage', where, () => context.value.newPage());
      if (!page.ok) break;
      if (!(await stage('goto', where, () => page.value.goto('/version.json', { timeout: STEP_MS }))).ok) break;
      if (!(await stage('context.close', where, () => context.value.close())).ok) break;
      completed++;
      log({ ev: 'cycle.ok', ...where });
    }
    if (!failure && browser) await closeBrowser('browser.close.final', { launches });
  } finally {
    // Exceptional exit or failed stage: bounded owned cleanup; the first failure stands.
    if (browser) await closeBrowser('browser.cleanup', { launches });
    log({ ev: 'summary', ...plan, completed, launches, closesOk, failure, browserLeftOpen: !!browser });
  }

  if (failure) throw new Error(`diag-161 differential: ${failure.stage} ${failure.timeout ? 'timed out' : 'failed'} at cycle ${failure.cycle ?? '-'} (context ${failure.contextInBrowser ?? '-'} of browser ${failure.launches})`);
  if (completed !== CYCLES || launches !== plan.expectedLaunches || closesOk !== launches) {
    throw new Error(`diag-161 differential incomplete: ${completed}/${CYCLES} cycles, ${launches}/${plan.expectedLaunches} launches, ${closesOk} confirmed closes`);
  }
});
