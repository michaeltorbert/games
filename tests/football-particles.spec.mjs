import { test, expect } from '@playwright/test';

async function openGame(page, reducedMotion = 'no-preference') {
  await page.emulateMedia({ reducedMotion });
  await page.goto('/football/?boot=offense-call');
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
}

async function runOffenseGain(page, { gain, yd = 20, fdYd = 30 }) {
  return page.evaluate(({ gain, yd, fdYd }) => {
    clearTimeout(advTimer);
    document.querySelectorAll('.field-particle').forEach((node) => node.remove());
    startDrive('offense');
    Object.assign(state, { yd, animYd: yd, fdYd, down: 1, ytg: Math.max(fdYd - yd, 0), driveStart: yd });
    updateField(false);
    const play = makePlaySnapshot(state, gain, OFFENSE_CALLS.shortRun);
    state.play = play;
    resolveOffensePlay();
    clearTimeout(advTimer);
    return {
      count: document.querySelectorAll('.field-particle').length,
      gain: play.gain,
      gotFirstDown: play.gotFirstDown,
      isTouchdown: play.isTouchdown,
    };
  }, { gain, yd, fdYd });
}

test('particles are limited to explosive offense plays and clean up', async ({ page }) => {
  await openGame(page);

  expect(await runOffenseGain(page, { gain: 2 })).toEqual({
    count: 0,
    gain: 2,
    gotFirstDown: false,
    isTouchdown: false,
  });

  expect(await runOffenseGain(page, { gain: 8 })).toMatchObject({
    count: 5,
    gain: 8,
    gotFirstDown: false,
    isTouchdown: false,
  });
  await page.waitForTimeout(560);
  await expect(page.locator('.field-particle')).toHaveCount(5);
  await page.waitForTimeout(140);
  await expect(page.locator('.field-particle')).toHaveCount(0);

  expect(await runOffenseGain(page, { gain: 2, yd: 28, fdYd: 30 })).toMatchObject({
    count: 5,
    gain: 2,
    gotFirstDown: true,
    isTouchdown: false,
  });

  expect(await runOffenseGain(page, { gain: 2, yd: 98, fdYd: 100 })).toMatchObject({
    count: 5,
    gain: 2,
    gotFirstDown: false,
    isTouchdown: true,
  });

  await page.evaluate(() => {
    clearTimeout(advTimer);
    document.querySelectorAll('.field-particle').forEach((node) => node.remove());
    startDrive('defense');
    const play = makePlaySnapshot(state, 12, OFFENSE_CALLS.longRun);
    state.play = play;
    resolveDefenseGain('Review defense gain.');
    clearTimeout(advTimer);
  });
  await expect(page.locator('.field-particle')).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await runOffenseGain(page, { gain: 12 })).toMatchObject({ count: 0, gain: 12 });
});

test('a real 0% player position is preserved when spawning', async ({ page }) => {
  await openGame(page);
  const left = await page.evaluate(() => {
    const player = document.getElementById('player');
    player.style.left = '0%';
    startPlayerRun(true);
    clearTimeout(playerRunTimer);
    const particle = document.querySelector('.field-particle');
    const result = particle?.style.left;
    document.querySelectorAll('.field-particle').forEach((node) => node.remove());
    return result;
  });
  expect(left).toBe('0%');
});
