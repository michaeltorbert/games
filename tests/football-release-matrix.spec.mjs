import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const EPS = 1;
const pageErrors = new WeakMap();

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  pageErrors.set(page, watchErrors(page));
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page), 'uncaught browser errors').toEqual([]);
});

async function shot(page, testInfo, label) {
  const dir = path.join(process.cwd(), 'tests', 'artifacts', 'release-matrix', testInfo.project.name);
  const artifactPath = path.join(dir, `${label}.png`);
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: artifactPath, fullPage: false });
  await testInfo.attach(`${label}.png`, { path: artifactPath, contentType: 'image/png' });
}

async function renderedState(page) {
  return page.evaluate(() => ({
    ...JSON.parse(window.render_game_to_text()),
    correctAnswers: state.correctAnswers,
    playIsTouchdown: Boolean(state.play?.isTouchdown),
  }));
}

async function assertViewport(page, label) {
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollY,
    scrollWidth: document.documentElement.scrollWidth,
    buttons: Array.from(
      document.querySelector('.overlay.show')?.querySelectorAll('button')
        || document.querySelectorAll('button')
    ).filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }).map(element => {
      const rect = element.getBoundingClientRect();
      return {
        text: element.textContent.trim().slice(0, 40),
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    }),
  }));
  expect(metrics.scrollWidth, `${label}: horizontal overflow`).toBeLessThanOrEqual(metrics.width + EPS);
  for (const button of metrics.buttons) {
    expect(button.width, `${label}: narrow target ${button.text}`).toBeGreaterThanOrEqual(44);
    expect(button.height, `${label}: short target ${button.text}`).toBeGreaterThanOrEqual(44);
    expect(button.top, `${label}: top-clipped target ${button.text}`).toBeGreaterThanOrEqual(-EPS);
    expect(button.left, `${label}: left-clipped target ${button.text}`).toBeGreaterThanOrEqual(-EPS);
    expect(button.right, `${label}: right-clipped target ${button.text}`).toBeLessThanOrEqual(metrics.width + EPS);
    expect(button.bottom, `${label}: target below fold ${button.text}`).toBeLessThanOrEqual(metrics.height + EPS);
  }
  return metrics;
}

async function assertPhaseAndShot(page, testInfo, phase, label) {
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', phase);
  expect((await renderedState(page)).mode, `${label}: rendered phase`).toBe(phase);
  const metrics = await assertViewport(page, label);
  await shot(page, testInfo, label);
  return metrics;
}

async function assertOverlay(page, testInfo, id, phase, label) {
  const overlay = page.locator(`#${id}`);
  await expect(overlay).toHaveClass(/show/);
  await expect(overlay).toHaveAttribute('aria-hidden', 'false');
  await expect(overlay.locator('.ov-btn')).toBeVisible();
  expect((await renderedState(page)).mode, `${label}: rendered phase`).toBe(phase);
  if (id === 'ov-quarter' || id === 'ov-halftime') {
    await page.waitForTimeout(950);
  }
  const metrics = await assertViewport(page, label);
  const cta = await overlay.locator('.ov-btn').boundingBox();
  expect(cta.y + cta.height, `${label}: CTA below fold`).toBeLessThanOrEqual(metrics.height + EPS);
  await shot(page, testInfo, label);
}

async function liveAnswerIndex(page, kind) {
  const index = await page.evaluate(answerKind => {
    const correctIndex = state.choices.indexOf(state.correct);
    return answerKind === 'correct'
      ? correctIndex
      : state.choices.findIndex(choice => choice !== state.correct);
  }, kind);
  expect(index, `${kind} answer index`).toBeGreaterThanOrEqual(0);
  return index;
}

async function pauseClockBeforeAnswer(page) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 100));
}

test('full football state matrix follows production transitions', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    let seed = 0x36f00d;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
  });
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await page.goto('/football/');

  await assertOverlay(page, testInfo, 'ov-start', 'start', '01-start');

  await page.locator('#ov-start .ov-btn').click();
  await expect(page.locator('#call-grid .call-btn')).toHaveCount(5);
  let metrics = await assertPhaseAndShot(page, testInfo, 'call', '02-offense-call');
  expect(metrics.scrollY).toBe(0);

  await page.evaluate(() => {
    Object.assign(state, { yd: 99, fdYd: 100, ytg: 1, animYd: 99, down: 1 });
    updateField(false);
    updateStatus();
    showCallPrompt();
  });
  await page.locator('#call-grid .call-btn').first().click();
  expect((await renderedState(page)).playIsTouchdown, 'seeded offense play reaches the end zone').toBe(true);
  await assertPhaseAndShot(page, testInfo, 'question', '03-offense-question');

  await pauseClockBeforeAnswer(page);
  await page.locator(`#b${await liveAnswerIndex(page, 'correct')}`).click();
  let game = await renderedState(page);
  expect(game.score).toEqual({ player: 7, opponent: 0 });
  expect(game.playerTouchdowns).toBe(1);
  expect(game.plays).toBe(1);
  expect(game.correctAnswers).toBe(1);
  await assertPhaseAndShot(page, testInfo, 'feedback', '04-offense-feedback');

  await page.clock.runFor(950);
  await assertOverlay(page, testInfo, 'ov-td', 'touchdown', '05-player-td');
  await page.clock.resume();
  await page.locator('#ov-td .ov-btn').click();
  game = await renderedState(page);
  expect(game.quarterPossessions).toBe(1);
  await assertOverlay(page, testInfo, 'ov-defense', 'transition', '06-defense-transition');

  await page.locator('#ov-defense .ov-btn').click();
  await expect(page.locator('#call-grid .call-btn')).toHaveCount(4);
  expect((await renderedState(page)).possession).toBe('defense');
  metrics = await assertPhaseAndShot(page, testInfo, 'call', '07-defense-call');
  expect(metrics.scrollY).toBe(0);

  await page.evaluate(() => {
    Object.assign(state, { yd: 1, fdYd: 0, ytg: 1, animYd: 1, down: 1 });
    updateField(false);
    updateStatus();
    showCallPrompt();
  });
  await page.locator('#call-grid .call-btn').first().click();
  expect((await renderedState(page)).playIsTouchdown, 'seeded opponent play reaches the end zone').toBe(true);
  await assertPhaseAndShot(page, testInfo, 'question', '08-defense-question');

  await pauseClockBeforeAnswer(page);
  await page.locator(`#b${await liveAnswerIndex(page, 'wrong')}`).click();
  game = await renderedState(page);
  expect(game.score).toEqual({ player: 7, opponent: 7 });
  expect(game.opponentTouchdowns).toBe(1);
  expect(game.plays).toBe(2);
  expect(game.correctAnswers).toBe(1);
  await assertPhaseAndShot(page, testInfo, 'feedback', '09-defense-feedback');

  await page.clock.runFor(950);
  await assertOverlay(page, testInfo, 'ov-td', 'touchdown', '10-opponent-td');
  await page.clock.resume();
  await page.locator('#ov-td .ov-btn').click();
  game = await renderedState(page);
  expect(game.quarterPossessions).toBe(2);
  await assertOverlay(page, testInfo, 'ov-offense', 'transition', '11-offense-transition');

  await page.locator('#ov-offense .ov-btn').click();
  await page.evaluate(() => {
    state.quarter = 1;
    state.quarterPossessions = POSSESSIONS_PER_QUARTER - 1;
    finishPossession('Quarter complete.');
  });
  game = await renderedState(page);
  expect(game.quarter).toBe(1);
  expect(game.pendingNextPossession).toBe('defense');
  await assertOverlay(page, testInfo, 'ov-quarter', 'quarter', '12-quarter-end');

  await page.locator('#ov-quarter .ov-btn').click();
  expect((await renderedState(page)).possession).toBe('defense');
  await page.evaluate(() => {
    state.quarter = 2;
    state.quarterPossessions = POSSESSIONS_PER_QUARTER - 1;
    finishPossession('First half complete.');
  });
  game = await renderedState(page);
  expect(game.quarter).toBe(2);
  expect(game.pendingNextPossession).toBe('defense');
  await assertOverlay(page, testInfo, 'ov-halftime', 'halftime', '13-halftime');

  await page.locator('#ov-halftime .ov-btn').click();
  expect((await renderedState(page)).possession).toBe('defense');
  await page.evaluate(() => {
    state.quarter = 4;
    state.quarterPossessions = POSSESSIONS_PER_QUARTER - 1;
    finishPossession('Game complete.');
  });
  game = await renderedState(page);
  expect(game.quarter).toBe(4);
  expect(game.score).toEqual({ player: 7, opponent: 7 });
  await assertOverlay(page, testInfo, 'ov-end', 'final', '14-final');
  await expect(page.locator('#ov-end-stats')).toContainText('1 / 2');
  await expect(page.locator('#ov-end-stats')).toContainText('50%');
});

test('post-game accuracy counts wrong offense and defense answers', async ({ page }) => {
  await page.goto('/football/?boot=offense-call');
  await page.locator('#call-grid .call-btn').first().click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  await page.locator(`#b${await liveAnswerIndex(page, 'wrong')}`).click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');

  await page.evaluate(() => {
    clearTimeout(advTimer);
    startDrive('defense');
  });
  await page.locator('#call-grid .call-btn').first().click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  await page.locator(`#b${await liveAnswerIndex(page, 'wrong')}`).click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');

  await page.evaluate(() => showGameOver());
  await expect(page.locator('#ov-end-stats')).toContainText('0 / 2');
  await expect(page.locator('#ov-end-stats')).toContainText('0%');
});

test('reduced motion freezes all new effects', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/football/');
  await page.evaluate(() => showQuarterEnd('Quarter complete.'));
  const styles = await page.evaluate(() => ({
    sweep: getComputedStyle(document.querySelector('.ov-sweep')).display,
    breakTitle: getComputedStyle(document.querySelector('.overlay.show .ov-title')).animationName,
    lights: getComputedStyle(document.body, '::before').animationName,
    crowd: getComputedStyle(document.body, '::after').animationName,
    stage: getComputedStyle(document.querySelector('#field-stage'), '::after').animationName,
  }));
  expect(styles.sweep).toBe('none');
  expect(styles.breakTitle).toBe('none');
  expect(styles.lights).toBe('none');
  expect(styles.crowd).toBe('none');
  expect(styles.stage).toBe('none');
  await page.evaluate(() => {
    Math.random = () => 0;
    activateOverlay('ov-td');
    spawnConfetti('ov-td-confetti', 40);
    spawnFireworks('ov-td-confetti', 'offense');
  });
  await page.waitForTimeout(200);
  await expect(page.locator('.confetti-piece')).toHaveCount(0);
  await expect(page.locator('.fw-burst')).toHaveCount(0);
  await shot(page, testInfo, '15-reduced-motion');
});
