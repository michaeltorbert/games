// Issue #161 load-wait collector sensitivity controls (synthetic; never N/L/T
// reproduction). Stock @playwright/test fixtures; pages come from the control
// server on 8094 and load no game, so the Football test mute does not apply.
// Expected per-case statuses and observations are declared in analyze.mjs
// (CONTROL_EXPECT); a passing CLI is not the acceptance criterion.
import { test, expect } from '@playwright/test';

const CTL = 'http://127.0.0.1:8094';

test('C1 normal load and normal close', async ({ page }) => {
  await page.goto(`${CTL}/ctl/page/normal.html`);
  await expect(page.locator('p')).toHaveText('normal');
});

test('C2 main-frame redirect hops', async ({ page }) => {
  await page.goto(`${CTL}/ctl/redirect/3`);
  await expect(page.locator('p')).toHaveText('redirect end');
});

test('C3 HTTP error versus network failure', async ({ page }) => {
  await page.goto(`${CTL}/ctl/page/errors.html`);
});

test('C4 repeated same-URL requests with canary query values', async ({ page }) => {
  await page.goto(`${CTL}/ctl/page/repeat.html`);
  expect(await page.evaluate(() => window.__done)).toBe(true);
});

// The control deadline is test-scoped and deliberately short; it is not the
// faithful arm's unchanged 30 s default. Expected status: timedOut.
test('C5 headers received, body held, load never fires', async ({ page }) => {
  test.setTimeout(8_000);
  await page.goto(`${CTL}/ctl/page/held.html`);
});
