import { test, expect } from '@playwright/test';

test('firework runs cancel stale callbacks and keep opponent bursts subdued', async ({ page }) => {
  await page.goto('/football/');
  await page.evaluate(() => {
    Math.random = () => 0;
    window.__acceptedFireworkColors = [];
    const originalSpawnBurst = spawnBurst;
    spawnBurst = function(container, colors, runId) {
      window.__acceptedFireworkColors.push(colors[0]);
      return originalSpawnBurst(container, colors, runId);
    };

    activateOverlay('ov-td');
    spawnFireworks('ov-td-confetti', 'offense');
    hideOverlays();
    activateOverlay('ov-td');
    spawnFireworks('ov-td-confetti', 'defense');
  });

  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__acceptedFireworkColors)).toEqual(['#ff8c3c', '#ff8c3c']);

  await page.evaluate(() => {
    window.__acceptedFireworkColors = [];
    clearConfetti('ov-td-confetti');
    spawnFireworks('ov-td-confetti', 'offense');
  });
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__acceptedFireworkColors)).toEqual([
    '#ffd337', '#ffd337', '#ffd337', '#ffd337', '#ffd337',
  ]);
});
