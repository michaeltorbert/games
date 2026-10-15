// Issue #161 load-wait control C6: the real Football page through the
// unchanged stock curriculum fixture, which applies and verifies the existing
// session-only test mute (tests/football-test-mute.mjs) before any input and
// confirms the curriculum prompt. No input is sent here. Proves the observer
// composes with the stock fixtures and sees the app's real resource loads and
// a normal close. Sensitivity only.
import { test, expect } from '../../../../tests/curriculum-fixture.mjs';

test('C6 Football page via stock fixtures, normal close', async ({ page }) => {
  await page.goto('/football/');
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
});
