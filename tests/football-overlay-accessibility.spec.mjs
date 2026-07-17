import { test, expect } from '@playwright/test';

const overlayIds = ['ov-start', 'ov-td', 'ov-defense', 'ov-offense', 'ov-quarter', 'ov-halftime', 'ov-end'];

test('all overlays expose one modal dialog and contain keyboard focus', async ({ page }) => {
  await page.goto('/football/');

  for (const id of overlayIds) {
    await page.evaluate(overlayId => activateOverlay(overlayId), id);
    const overlay = page.locator(`#${id}`);
    await expect(overlay).toHaveClass(/show/);
    await expect(overlay).toHaveAttribute('role', 'dialog');
    await expect(overlay).toHaveAttribute('aria-modal', 'true');
    await expect(overlay).toHaveAttribute('aria-hidden', 'false');
    expect(await overlay.getAttribute('aria-labelledby')).toBeTruthy();
    expect(await overlay.getAttribute('aria-describedby')).toBeTruthy();
    await expect(page.locator('#wrap')).toHaveAttribute('aria-hidden', 'true');
    expect(await page.locator('#wrap').evaluate(element => element.inert)).toBe(true);

    await expect.poll(() => page.evaluate(overlayId => document.activeElement?.closest('.overlay')?.id === overlayId, id)).toBe(true);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(overlayId => document.activeElement?.closest('.overlay')?.id === overlayId, id)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(overlay).toHaveClass(/show/);

    for (const hiddenId of overlayIds.filter(otherId => otherId !== id)) {
      const hidden = page.locator(`#${hiddenId}`);
      await expect(hidden).toHaveAttribute('aria-hidden', 'true');
      expect(await hidden.evaluate(element => element.inert)).toBe(true);
    }
  }
});

test('start overlay traps focus around the selected native radio tab stop', async ({ page }) => {
  await page.goto('/football/');
  const wakeForest = page.locator('input[name="rival"][value="wake-forest"]');
  const start = page.locator('#start-game-btn');

  await wakeForest.check();
  await wakeForest.focus();
  await expect(wakeForest).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(start).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(wakeForest).toBeFocused();
});

test('closing an overlay restores the game UI and focuses the next control', async ({ page }) => {
  await page.goto('/football/');
  await page.locator('#ov-start .ov-btn').click();
  await expect(page.locator('.overlay.show')).toHaveCount(0);
  await expect(page.locator('#wrap')).not.toHaveAttribute('aria-hidden', 'true');
  expect(await page.locator('#wrap').evaluate(element => element.inert)).toBe(false);
  await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('call-btn'))).toBe(true);
});
