// Synthetic harness check for issue #161 tooling, run only by
// `run-arm.mjs --arm selfcheck`. It proves the evidence streams can see
// controlled requests, a manually created context's trace and close, a long
// API step, and records load-time environment metadata. It is not evidence
// about the real stall, and none of its metadata is usable-viewport, layout
// or playability evidence for Football.
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { expectFootballTestMuted, muteFootballForTests } from '../../../tests/football-test-mute.mjs';

const environment = page => page.evaluate(() => ({
  userAgent: navigator.userAgent,
  viewportMeta: document.querySelector('meta[name="viewport"]')?.content ?? null,
  viewport: { width: innerWidth, height: innerHeight },
  screen: { width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight },
  devicePixelRatio,
  maxTouchPoints: navigator.maxTouchPoints,
  coarsePointer: matchMedia('(pointer: coarse)').matches,
}));

const record = (testInfo, suffix, data) => {
  const dir = path.join(process.env.DIAG161_RUN_DIR, 'selfcheck');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${testInfo.project.name}${suffix}`), JSON.stringify(data, null, 2), { flag: 'wx' });
};

test('harness observes requests, a manual context close and device metadata', async ({ page, browser, baseURL }, testInfo) => {
  expect((await page.goto('/version.json')).status()).toBe(200);
  // A JSON resource has no viewport meta, so WebKit lays it out at its 980px
  // default on mobile projects: harness metadata only.
  const env = await environment(page);
  const manual = await browser.newContext();
  const manualPage = await manual.newPage();
  expect((await manualPage.goto(`${baseURL}/version.json`)).status()).toBe(200);
  await manual.close();

  record(testInfo, '.json', {
    scope: 'harness-only: /version.json document, not Football',
    project: testInfo.project.name,
    use: testInfo.project.use,
    browserName: browser.browserType().name(),
    browserVersion: browser.version(),
    executablePath: browser.browserType().executablePath(),
    environment: env,
    workerIndex: testInfo.workerIndex,
    parallelIndex: testInfo.parallelIndex,
    workerPid: process.pid,
  });
  expect(browser.browserType().name()).toBe(process.env.DIAG161_ENGINE || 'webkit');
});

// Load-time environment of the real Football document under the existing
// session mute, with no input of any kind. This only records what the engine
// reports after `load`; it does not verify usable viewport, layout or play.
test('Football document load-time environment under the existing session mute', async ({ page, context }, testInfo) => {
  await muteFootballForTests(context);
  await page.goto('/football/');
  const mute = await expectFootballTestMuted(page);
  record(testInfo, '.football.json', {
    scope: 'harness observation: Football document after load, no interaction; not usable-viewport/layout evidence',
    project: testInfo.project.name,
    interactions: 0,
    mute: { applied: mute.proof.applied, soundOn: mute.soundOn, pressed: mute.pressed, prefUnchanged: JSON.stringify(mute.pref) === JSON.stringify(mute.proof.prefBefore) },
    environment: await environment(page),
  });
});

test('watchdog records an API step open past its threshold', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-11-landscape', 'One synthetic watchdog check is enough.');
  await page.waitForTimeout(12_000);
});
