import { test, expect } from '@playwright/test';

/**
 * Minimum viable verifier for issue #36 that directly targets issue #43:
 * the play-call grid must be fully visible (above the fold) with no initial
 * scroll when the offense is about to snap the ball.
 *
 * Two passes cover the paths that regressed in PR #40:
 *  - opening snap (Start Game -> offense call)
 *  - post-transition re-entry (defense stop -> offense transition -> call)
 */

const EPSILON = 1;

function attachErrorListeners(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  return { pageErrors, consoleErrors };
}

async function assertCallGridAboveFold(page, label) {
  await expect(page.locator('#ov-start')).toBeHidden({ timeout: 5000 });
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
  const grid = page.locator('#call-grid');
  await expect(grid).toBeVisible();
  const cards = grid.locator('.call-btn');
  await expect(cards).toHaveCount(5);

  const metrics = await page.evaluate(() => {
    const grid = document.querySelector('#call-grid');
    const cards = Array.from(grid.querySelectorAll('.call-btn'));
    const lastBottom = Math.max(...cards.map(c => c.getBoundingClientRect().bottom));
    return {
      scrollY: window.scrollY,
      innerHeight: window.innerHeight,
      lastBottom: Math.ceil(lastBottom),
    };
  });

  expect(metrics.scrollY, `${label}: did not auto-scroll to find cards`).toBe(0);
  expect(
    metrics.lastBottom,
    `${label}: last call card bottom ${metrics.lastBottom}px exceeds viewport ${metrics.innerHeight}px`,
  ).toBeLessThanOrEqual(metrics.innerHeight + EPSILON);
}

test.describe('football call-layout above-the-fold', () => {
  test('opening snap (Start Game -> offense call)', async ({ page }, testInfo) => {
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await page.goto('/football/');
    await page.locator('#ov-start .ov-btn').click();
    await assertCallGridAboveFold(page, 'opening snap');

    await testInfo.attach('opening-snap.png', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });

    expect(pageErrors, 'page errors').toEqual([]);
    expect(consoleErrors, 'console errors').toEqual([]);
  });

  test('post-transition re-entry into call mode', async ({ page }, testInfo) => {
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await page.goto('/football/');
    await page.locator('#ov-start .ov-btn').click();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');

    // Exercise the real production path after a defense stop: the offense
    // transition overlay shows briefly, then startOffense() dismisses it and
    // re-enters call mode via startDrive('offense'). Same chain runs after
    // touchdowns, quarter breaks, and halftime.
    await page.evaluate(() => {
      window.showOffenseTransition('Back on offense after the stop.');
      window.startOffense();
    });
    await assertCallGridAboveFold(page, 'post-transition re-entry');

    await testInfo.attach('post-transition.png', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });

    expect(pageErrors, 'page errors').toEqual([]);
    expect(consoleErrors, 'console errors').toEqual([]);
  });
});
