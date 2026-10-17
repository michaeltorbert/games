import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';
import { createFootballResourceDiagnostics } from '../../../tests/football-resource-diagnostics.mjs';
import { expectFootballTestMuted, muteFootballForTests } from '../../../tests/football-test-mute.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CONSOLE_SOURCE = await readFile(path.join(ROOT, 'scripts/issue-175/probes/console-source.js'));

const test = base.extend({
  context: async ({ context }, use) => {
    await muteFootballForTests(context);
    await use(context);
  },
  diagnostics: async ({ context }, use, testInfo) => {
    const diagnostics = createFootballResourceDiagnostics(testInfo);
    diagnostics.registerContext(context);
    try { await use(diagnostics); }
    finally {
      diagnostics.close();
      const artifactPath = testInfo.outputPath('football-resource-diagnostics.json');
      await writeFile(artifactPath, `${JSON.stringify(diagnostics.artifact(), null, 2)}\n`);
      await testInfo.attach('football-resource-diagnostics.json', { path: artifactPath, contentType: 'application/json' });
    }
  },
  page: async ({ diagnostics, page }, use) => use(page),
});

async function installFootballEvents(page, baseURL, distinctive) {
  await page.route(`**/${distinctive}.png*`, route => route.abort('failed'));
  await page.route(`${baseURL}/football/issue-175-console-source.js`, route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: CONSOLE_SOURCE,
  }));
}

async function triggerFootballEvents(page, baseURL, distinctive) {
  await installFootballEvents(page, baseURL, distinctive);
  await page.goto('/football/');
  await expectFootballTestMuted(page);
  await page.addScriptTag({ url: `${baseURL}/football/issue-175-console-source.js` });
  const failed = page.waitForEvent('requestfailed', request => request.url().includes(`/${distinctive}.png`));
  await page.evaluate(name => {
    const image = new Image();
    image.src = `/football/${name}.png?private-canary`;
    document.body.append(image);
  }, distinctive);
  await failed;
}

test('mixed Place Football Place records only Football document metadata', async ({ browser, context, baseURL, diagnostics }, testInfo) => {
  const page = await context.newPage();
  await page.route(`${baseURL}/place-value-practice/place-unrelated.png`, route => route.abort('failed'));
  await page.goto('/place-value-practice/');
  const placeFailure = page.waitForEvent('requestfailed', request => request.url().includes('place-unrelated.png'));
  await page.evaluate(() => { const image = new Image(); image.src = '/place-value-practice/place-unrelated.png'; document.body.append(image); });
  await placeFailure;
  await page.addScriptTag({ content: "console.error('place-private-canary');" });

  await triggerFootballEvents(page, baseURL, 'football-only-canary');
  await page.route('**/shared/football-shared.png*', route => route.abort('failed'));
  await page.route('https://resource-diagnostics.invalid/external.png*', route => route.abort('failed'));
  const sharedFailure = page.waitForEvent('requestfailed', request => request.url().includes('/shared/football-shared.png'));
  const externalFailure = page.waitForEvent('requestfailed', request => request.url().includes('resource-diagnostics.invalid/external.png'));
  await page.evaluate(() => {
    for (const src of ['/shared/football-shared.png?private-canary', 'https://resource-diagnostics.invalid/external.png?private-canary']) {
      const image = new Image(); image.src = src; document.body.append(image);
    }
  });
  await Promise.all([sharedFailure, externalFailure]);
  await page.goto('/place-value-practice/');
  const finalPlaceFailure = page.waitForEvent('requestfailed', request => request.url().includes('place-unrelated.png'));
  await page.evaluate(() => { const image = new Image(); image.src = '/place-value-practice/place-unrelated.png'; document.body.append(image); });
  await finalPlaceFailure;
  await page.addScriptTag({ content: "console.error('place-after-private-canary');" });

  const artifact = diagnostics.artifact();
  expect(artifact.resourceFailures.some(event => event.url.endsWith('/football/football-only-canary.png'))).toBe(true);
  expect(artifact.resourceFailures.some(event => event.url.endsWith('/shared/football-shared.png'))).toBe(true);
  expect(artifact.resourceFailures.some(event => event.url === 'https://resource-diagnostics.invalid/external.png')).toBe(true);
  expect(artifact.resourceFailures.every(event => !event.url.includes('place-value-practice'))).toBe(true);
  expect(artifact.consoleErrors.some(event => event.source.endsWith('/football/issue-175-console-source.js')
    && Number.isInteger(event.line) && event.line >= 0 && Number.isInteger(event.column) && event.column >= 0)).toBe(true);
  const secondary = await context.newPage();
  await triggerFootballEvents(secondary, baseURL, 'same-context-canary');
  const helperContext = await browser.newContext();
  await muteFootballForTests(helperContext);
  diagnostics.registerContext(helperContext);
  const helperPage = await helperContext.newPage();
  await triggerFootballEvents(helperPage, baseURL, 'helper-context-canary');
  const pageEvents = diagnostics.artifact().resourceFailures.filter(event =>
    /football-only-canary|same-context-canary|helper-context-canary/.test(event.url));
  expect(pageEvents.map(event => event.url.match(/(football-only-canary|same-context-canary|helper-context-canary)/)?.[1]))
    .toEqual(['football-only-canary', 'same-context-canary', 'helper-context-canary']);
  expect(pageEvents[0].context).toBe(pageEvents[1].context);
  expect(pageEvents[0].page).not.toBe(pageEvents[1].page);
  expect(pageEvents[2].context).not.toBe(pageEvents[0].context);
  await helperContext.close();
  await secondary.close();
  const cleanup = diagnostics.close();
  expect(cleanup).toEqual({ contexts: 2, pages: 3, detachedContextListeners: 6, detachedPageListeners: 3 });
  const countAfterClose = diagnostics.artifact().resourceFailures.length;
  await page.goto('/football/');
  await expectFootballTestMuted(page);
  await page.route('**/football/after-close.png*', route => route.abort('failed'));
  const afterClose = page.waitForEvent('requestfailed', request => request.url().includes('/football/after-close.png'));
  await page.evaluate(() => { const image = new Image(); image.src = '/football/after-close.png'; document.body.append(image); });
  await afterClose;
  await page.addScriptTag({ content: "console.error('after-close-private-canary');" });
  expect(diagnostics.artifact().resourceFailures).toHaveLength(countAfterClose);
  expect(diagnostics.artifact().consoleErrors.some(event => event.source.includes('after-close'))).toBe(false);
  expect(JSON.stringify(artifact)).not.toMatch(/place-private-canary|place-after-private-canary|private-canary/);
  await page.close();
  expect(testInfo.project.name).toBeTruthy();
});

test('failed initial Football document navigation is retained from about blank', async ({ context, baseURL, diagnostics }) => {
  const page = await context.newPage();
  await page.route(`${baseURL}/football/issue-175-missing-document`, route => route.abort('failed'));
  await page.goto('/football/issue-175-missing-document').catch(() => {});
  const artifact = diagnostics.artifact();
  expect(artifact.resourceFailures.some(event => event.navigation && event.url.endsWith('/football/issue-175-missing-document'))).toBe(true);
  await page.close();
});

test('successful Football case has an empty diagnostic record', async ({ page, diagnostics }) => {
  await page.goto('/football/');
  await expectFootballTestMuted(page);
  await expect(page.locator('#start-game-btn')).toBeVisible();
  expect(diagnostics.artifact().resourceFailures).toEqual([]);
  expect(diagnostics.artifact().consoleErrors).toEqual([]);
});

test('intentional strict failure retains diagnostics and exits failed', async ({ context, baseURL, diagnostics }) => {
  const page = await context.newPage();
  await triggerFootballEvents(page, baseURL, 'intentional-negative');
  expect(diagnostics.artifact().resourceFailures.some(event => event.url.endsWith('/intentional-negative.png'))).toBe(true);
  await page.close();
  expect('deliberate probe failure').toBe('a passing test');
});
