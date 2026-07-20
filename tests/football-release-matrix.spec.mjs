import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const EPS = 1;
const pageErrors = new WeakMap();
const PHONE_PROJECTS = new Set(['iphone-15-portrait', 'iphone-17-pro-max-portrait']);

function phonesOnly(testInfo) {
  test.skip(
    !PHONE_PROJECTS.has(testInfo.project.name),
    'Pending-result recovery layouts are canonical on the two phone targets.',
  );
}

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
  return page.evaluate(() => {
    const contracts = window.__footballTest.activeContracts();
    return {
      ...contracts.render,
      playIsTouchdown: contracts.activeSnap?.proposal?.resultKind === 'touchdown',
    };
  });
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

async function assertVisibleOverlayCardBounds(page, label) {
  const metrics = await assertViewport(page, label);
  const card = await page.locator('.overlay.show .overlay-card').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    };
  });
  expect(card.top, `${label}: card clipped above viewport`).toBeGreaterThanOrEqual(-EPS);
  expect(card.left, `${label}: card clipped left of viewport`).toBeGreaterThanOrEqual(-EPS);
  expect(card.right, `${label}: card clipped right of viewport`).toBeLessThanOrEqual(metrics.width + EPS);
  expect(card.bottom, `${label}: card below viewport`).toBeLessThanOrEqual(metrics.height + EPS);
  expect(card.scrollHeight, `${label}: card content clipped internally`)
    .toBeLessThanOrEqual(card.clientHeight + EPS);
  return { ...metrics, card };
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
  await expect(overlay.locator('.ov-btn:visible').first()).toBeVisible();
  expect((await renderedState(page)).mode, `${label}: rendered phase`).toBe(phase);
  if (id === 'ov-quarter' || id === 'ov-halftime') {
    await page.waitForTimeout(950);
  }
  const metrics = await assertViewport(page, label);
  const cta = await overlay.locator('.ov-btn:visible').first().boundingBox();
  expect(cta.y + cta.height, `${label}: CTA below fold`).toBeLessThanOrEqual(metrics.height + EPS);
  await shot(page, testInfo, label);
}

async function liveChoiceId(page, kind, excluded = []) {
  const choiceId = await page.evaluate(({ answerKind, excludedChoiceIds }) => {
    const { questionInstance } = window.__footballTest.activeContracts();
    if (!questionInstance) return null;
    return answerKind === 'correct'
      ? questionInstance.correctChoiceId
      : questionInstance.choices.find(choice => (
        choice.id !== questionInstance.correctChoiceId
        && !excludedChoiceIds.includes(choice.id)
      ))?.id || null;
  }, { answerKind: kind, excludedChoiceIds: excluded });
  expect(choiceId, `${kind} stable choice ID`).toEqual(expect.any(String));
  return choiceId;
}

async function answerChoice(page, choiceId) {
  const contracts = await page.evaluate(
    id => window.__footballTest.answerChoice(id),
    choiceId,
  );
  expect(contracts, `answer choice ${choiceId}`).not.toBe(false);
  return contracts;
}

async function pauseClockBeforeAnswer(page) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 100));
}

async function expectQuestionPlayType(page, playType, label) {
  const actual = await page.evaluate(() => {
    const contracts = window.__footballTest.activeContracts();
    return {
      activePlay: contracts.activePlay?.playType || null,
      question: contracts.questionInstance?.playType || null,
      pending: contracts.pendingResolution?.playType || null,
    };
  });
  expect(actual, `${label}: tagged play/question/pending types`).toEqual({
    activePlay: playType,
    question: playType,
    pending: playType,
  });
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
  let game;

  await assertOverlay(page, testInfo, 'ov-start', 'start', '01-start');

  await page.locator('#ov-start .ov-btn').click();
  await expect(page.locator('#call-grid .call-btn')).toHaveCount(5);
  let metrics = await assertPhaseAndShot(page, testInfo, 'call', '02-offense-call');
  expect(metrics.scrollY).toBe(0);

  await page.evaluate(() => window.__footballTest.seedDriveState({
    possession: 'offense',
    direction: 1,
    quarter: 1,
    down: 1,
    yardsToGo: 1,
    yardLine: 99,
    firstDownLine: 100,
    driveStart: 99,
    scores: { player: 0, opponent: 0 },
    plays: 0,
    drivePlays: 0,
    quarterPossessions: 0,
    tds: 0,
    opponentTds: 0,
    correctAnswers: 0,
    gradedQuestions: 0,
  }));
  await page.locator('#call-grid .call-btn').first().click();
  expect((await renderedState(page)).playIsTouchdown, 'seeded offense play reaches the end zone').toBe(true);
  await assertPhaseAndShot(page, testInfo, 'question', '03-offense-question');

  await pauseClockBeforeAnswer(page);
  const offenseWrong = await liveChoiceId(page, 'wrong');
  await answerChoice(page, offenseWrong);
  game = await renderedState(page);
  expect(game.score).toEqual({ player: 0, opponent: 0 });
  expect(game.plays).toBe(0);
  expect(game.attempt).toBe(2);
  expect(game.retryAvailable).toBe(true);
  await assertPhaseAndShot(page, testInfo, 'question', '03b-offense-retry');

  await answerChoice(page, await liveChoiceId(page, 'correct'));
  game = await renderedState(page);
  expect(game.score).toEqual({ player: 6, opponent: 0 });
  expect(game.playerTouchdowns).toBe(1);
  expect(game.plays).toBe(1);
  expect(game.correctAnswers).toBe(1);
  await assertPhaseAndShot(page, testInfo, 'feedback', '04-offense-feedback');

  await page.clock.runFor(950);
  await assertOverlay(page, testInfo, 'ov-td', 'touchdown', '05-player-td');
  await page.locator('#ov-td .ov-btn').click();
  await expect(page.locator('#decision-grid .decision-btn')).toHaveCount(2);
  await expect(page.locator('#decision-grid .decision-btn').first()).toBeFocused();
  await expect(page.locator('#s-down')).toHaveText('TRY');
  await expect(page.locator('#s-yd-label')).toHaveText('Try Spot');
  await expect(page.locator('#s-yd')).toHaveText('2-yard line');
  await assertPhaseAndShot(page, testInfo, 'conversion-decision', '05a-player-conversion-decision');

  await page.locator('#decision-grid .decision-btn[data-action="pat"]').click();
  await expectQuestionPlayType(page, 'conversion', 'player conversion');
  await expect(page.locator('#special-action-live')).toContainText('PAT');
  await assertPhaseAndShot(page, testInfo, 'question', '05b-player-conversion-question');

  await answerChoice(page, await liveChoiceId(page, 'correct'));
  game = await renderedState(page);
  expect(game.score).toEqual({ player: 7, opponent: 0 });
  expect(game.correctAnswers).toBe(2);
  expect(game.gradedQuestions).toBe(2);
  expect(game.quarterPossessions).toBe(1);
  await assertPhaseAndShot(page, testInfo, 'feedback', '05c-player-conversion-feedback');

  await page.clock.runFor(1450);
  await assertOverlay(page, testInfo, 'ov-defense', 'transition', '06-defense-transition');

  await page.locator('#ov-defense .ov-btn').click();
  await expect(page.locator('#call-grid .call-btn')).toHaveCount(4);
  expect((await renderedState(page)).possession).toBe('defense');
  const defenseCallState = await renderedState(page);
  await expect(page.locator('#defense-read')).toBeVisible();
  await expect(page.locator('#defense-read')).toHaveAttribute('aria-live', 'polite');
  expect(defenseCallState.opponentCall).toBeNull();
  expect(defenseCallState.opponentSnapshot).not.toBeNull();
  expect(defenseCallState.defenseRead).toContain(defenseCallState.opponentSnapshot.look.label);
  expect(defenseCallState.defenseRead).toContain(defenseCallState.opponentSnapshot.lean.label);
  metrics = await assertPhaseAndShot(page, testInfo, 'call', '07-defense-call');
  expect(metrics.scrollY).toBe(0);

  await page.evaluate(() => window.__footballTest.seedDriveState({
    possession: 'defense',
    direction: -1,
    quarter: 1,
    down: 1,
    yardsToGo: 1,
    yardLine: 1,
    firstDownLine: 0,
    driveStart: 1,
    scores: { player: 7, opponent: 0 },
    plays: 1,
    drivePlays: 0,
    quarterPossessions: 1,
    tds: 1,
    opponentTds: 0,
    correctAnswers: 2,
    gradedQuestions: 2,
  }));
  await page.locator('#call-grid .call-btn').first().click();
  expect((await renderedState(page)).playIsTouchdown, 'seeded opponent play reaches the end zone').toBe(true);
  await assertPhaseAndShot(page, testInfo, 'question', '08-defense-question');

  await pauseClockBeforeAnswer(page);
  const defenseWrongOne = await liveChoiceId(page, 'wrong');
  await answerChoice(page, defenseWrongOne);
  game = await renderedState(page);
  expect(game.score).toEqual({ player: 7, opponent: 0 });
  expect(game.plays).toBe(1);
  expect(game.attempt).toBe(2);
  await assertPhaseAndShot(page, testInfo, 'question', '08b-defense-retry');

  const defenseWrongTwo = await liveChoiceId(page, 'wrong', [defenseWrongOne]);
  await answerChoice(page, defenseWrongTwo);
  game = await renderedState(page);
  expect(game.score).toEqual({ player: 7, opponent: 0 });
  expect(game.plays).toBe(1);
  expect(game.continueRequired).toBe(true);
  expect(game.outcomeCommitted).toBe(false);
  await assertPhaseAndShot(page, testInfo, 'explanation', '08c-defense-explanation');

  await page.locator('#question-continue').click();
  game = await renderedState(page);
  expect(game.score).toEqual({ player: 7, opponent: 6 });
  expect(game.opponentTouchdowns).toBe(1);
  expect(game.plays).toBe(2);
  expect(game.correctAnswers).toBe(2);
  expect(game.gradedQuestions).toBe(3);
  await assertPhaseAndShot(page, testInfo, 'feedback', '09-defense-feedback');

  await page.clock.runFor(950);
  await assertOverlay(page, testInfo, 'ov-td', 'touchdown', '10-opponent-td');
  await page.locator('#ov-td .ov-btn').click();
  await expectQuestionPlayType(page, 'conversion', 'opponent conversion');
  await expect(page.locator('#special-action-live')).toContainText('PAT');
  await assertPhaseAndShot(page, testInfo, 'question', '10a-opponent-conversion-question');

  const conversionWrongOne = await liveChoiceId(page, 'wrong');
  await answerChoice(page, conversionWrongOne);
  await assertPhaseAndShot(page, testInfo, 'question', '10b-opponent-conversion-retry');

  await answerChoice(page, await liveChoiceId(page, 'wrong', [conversionWrongOne]));
  game = await renderedState(page);
  expect(game.continueRequired).toBe(true);
  expect(game.outcomeCommitted).toBe(false);
  await assertPhaseAndShot(page, testInfo, 'explanation', '10c-opponent-conversion-explanation');

  await page.locator('#question-continue').click();
  game = await renderedState(page);
  expect(game.score).toEqual({ player: 7, opponent: 7 });
  expect(game.correctAnswers).toBe(2);
  expect(game.gradedQuestions).toBe(4);
  expect(game.quarterPossessions).toBe(2);
  await assertPhaseAndShot(page, testInfo, 'feedback', '10d-opponent-conversion-feedback');

  await page.clock.runFor(1450);
  await assertOverlay(page, testInfo, 'ov-offense', 'transition', '11-offense-transition');

  await page.locator('#ov-offense .ov-btn').click();
  await page.evaluate(() => {
    window.__footballTest.seedDriveState({
      possession: 'offense',
      direction: 1,
      quarter: 1,
      down: 1,
      yardsToGo: 10,
      yardLine: 20,
      firstDownLine: 30,
      driveStart: 20,
      scores: { player: 7, opponent: 7 },
      plays: 2,
      drivePlays: 0,
      quarterPossessions: POSSESSIONS_PER_QUARTER - 1,
      tds: 1,
      opponentTds: 1,
      correctAnswers: 2,
      gradedQuestions: 4,
    });
    finishPossession('Quarter complete.');
  });
  game = await renderedState(page);
  expect(game.quarter).toBe(1);
  expect(game.pendingNextPossession).toBe('defense');
  await assertOverlay(page, testInfo, 'ov-quarter', 'quarter', '12-quarter-end');

  await page.locator('#ov-quarter .ov-btn').click();
  expect((await renderedState(page)).possession).toBe('defense');
  await page.evaluate(() => {
    window.__footballTest.seedDriveState({
      possession: 'defense',
      direction: -1,
      quarter: 2,
      down: 1,
      yardsToGo: 10,
      yardLine: 80,
      firstDownLine: 70,
      driveStart: 80,
      scores: { player: 7, opponent: 7 },
      plays: 2,
      drivePlays: 0,
      quarterPossessions: POSSESSIONS_PER_QUARTER - 1,
      tds: 1,
      opponentTds: 1,
      correctAnswers: 2,
      gradedQuestions: 4,
    });
    finishPossession('First half complete.');
  });
  game = await renderedState(page);
  expect(game.quarter).toBe(2);
  expect(game.pendingNextPossession).toBe('defense');
  await assertOverlay(page, testInfo, 'ov-halftime', 'halftime', '13-halftime');

  await page.locator('#ov-halftime .ov-btn').click();
  expect((await renderedState(page)).possession).toBe('defense');
  await page.evaluate(() => {
    window.__footballTest.seedDriveState({
      possession: 'defense',
      direction: -1,
      quarter: 4,
      down: 1,
      yardsToGo: 10,
      yardLine: 80,
      firstDownLine: 70,
      driveStart: 80,
      scores: { player: 7, opponent: 7 },
      plays: 2,
      drivePlays: 0,
      quarterPossessions: POSSESSIONS_PER_QUARTER - 1,
      tds: 1,
      opponentTds: 1,
      correctAnswers: 2,
      gradedQuestions: 4,
    });
    finishPossession('Game complete.');
  });
  game = await renderedState(page);
  expect(game.quarter).toBe(4);
  expect(game.score).toEqual({ player: 7, opponent: 7 });
  await assertOverlay(page, testInfo, 'ov-end', 'final', '14-final');
  await expect(page.locator('#ov-end-stats')).toContainText('2 / 4');
  await expect(page.locator('#ov-end-stats')).toContainText('50%');

  await page.evaluate(() => restart());
  await page.getByRole('radio', { name: /WAKE FOREST/i }).check();
  const wakeNameMetrics = await page.locator('[data-rival-id="wake-forest"] .rival-option-name').evaluate((element) => {
    const style = getComputedStyle(element);
    const range = document.createRange();
    range.selectNodeContents(element);
    const lineTops = Array.from(range.getClientRects(), rect => rect.top)
      .filter((top, index, tops) => tops.findIndex(candidate => Math.abs(candidate - top) < 0.5) === index);
    const box = element.getBoundingClientRect();
    return {
      boxHeight: box.height,
      lineCount: lineTops.length,
      lineHeight: Number.parseFloat(style.lineHeight),
      wordCount: element.textContent.trim().split(/\s+/).length,
    };
  });
  expect(
    wakeNameMetrics.lineCount,
    'WAKE FOREST name breaks inside a word',
  ).toBeLessThanOrEqual(wakeNameMetrics.wordCount);
  expect(
    wakeNameMetrics.boxHeight,
    'WAKE FOREST name box exceeds two rendered lines',
  ).toBeLessThanOrEqual((wakeNameMetrics.lineHeight * wakeNameMetrics.wordCount) + EPS);
  await expect(page.locator('#rival-preview-matchup')).toHaveText('DUKE VS WAKE FOREST');
  await assertOverlay(page, testInfo, 'ov-start', 'start', '16-wake-forest-start');
  await page.locator('#start-game-btn').click();
  await page.evaluate(() => window.__footballTest.seedDriveState({
    rivalId: 'wake-forest',
    possession: 'defense',
    direction: -1,
    quarter: 1,
    down: 1,
    yardsToGo: 10,
    yardLine: 80,
    firstDownLine: 70,
    driveStart: 80,
    scores: { player: 0, opponent: 0 },
    plays: 0,
    drivePlays: 0,
  }));
  await expect(page.locator('#defense-read')).toContainText('WAKE FOREST shows');
  await assertPhaseAndShot(page, testInfo, 'call', '17-wake-forest-read');
});

test('fourth-down and special-team states preserve decision and normal-call contracts', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    let seed = 0x25f00d;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
  });
  await page.clock.install({ time: new Date('2026-01-02T12:00:00Z') });
  await page.goto('/football/?boot=offense-call');
  await pauseClockBeforeAnswer(page);

  await page.evaluate(() => window.__footballTest.seedDriveState({
    possession: 'offense',
    direction: 1,
    quarter: 1,
    down: 4,
    yardsToGo: 2,
    yardLine: 60,
    firstDownLine: 62,
    driveStart: 20,
    scores: { player: 0, opponent: 0 },
  }));
  await expect(page.locator('#decision-grid .decision-btn')).toHaveCount(3);
  await expect(page.locator('#decision-grid .decision-btn').first()).toBeFocused();
  await expect(page.locator('#decision-grid .decision-btn[data-action="go"]')).toBeVisible();
  await expect(page.locator('#decision-grid .decision-btn[data-action="punt"]')).toBeVisible();
  await expect(page.locator('#decision-grid .decision-btn[data-action="fieldGoal"]')).toContainText('57-yard attempt');
  await expect(page.locator('#call-grid .call-btn')).toHaveCount(0);
  await assertPhaseAndShot(page, testInfo, 'fourth-down-decision', '18-offense-fourth-down-decision');

  await page.locator('#decision-grid .decision-btn[data-action="go"]').click();
  await expect(page.locator('#call-grid .call-btn')).toHaveCount(5);
  await expect(page.locator('#decision-grid .decision-btn')).toHaveCount(0);
  await assertPhaseAndShot(page, testInfo, 'call', '19-offense-fourth-down-go-call');

  await page.evaluate(() => window.__footballTest.seedDriveState({
    possession: 'offense',
    direction: 1,
    quarter: 1,
    down: 4,
    yardsToGo: 10,
    yardLine: 50,
    firstDownLine: 60,
    driveStart: 20,
    scores: { player: 0, opponent: 0 },
  }));
  await expect(page.locator('#decision-grid .decision-btn')).toHaveCount(2);
  await page.locator('#decision-grid .decision-btn[data-action="punt"]').click();
  await expectQuestionPlayType(page, 'punt', 'player punt');
  await expect(page.locator('#call-grid .call-btn')).toHaveCount(0);
  await expect(page.locator('#special-action-live')).toContainText('punt');
  await assertPhaseAndShot(page, testInfo, 'question', '20-offense-punt-question');

  await answerChoice(page, await liveChoiceId(page, 'correct'));
  let game = await renderedState(page);
  expect(game.quarterPossessions).toBe(1);
  await expect(page.locator('#feedback')).toContainText(/punt|touchback/i);
  await assertPhaseAndShot(page, testInfo, 'feedback', '20a-offense-punt-feedback');

  await page.evaluate(() => window.__footballTest.seedDriveState({
    possession: 'offense',
    direction: 1,
    quarter: 1,
    down: 4,
    yardsToGo: 2,
    yardLine: 60,
    firstDownLine: 62,
    driveStart: 20,
    scores: { player: 0, opponent: 0 },
  }));
  await page.locator('#decision-grid .decision-btn[data-action="fieldGoal"]').click();
  await expectQuestionPlayType(page, 'fieldGoal', 'player field goal');
  await expect(page.locator('#special-action-live')).toContainText('57-yard field goal');
  await assertPhaseAndShot(page, testInfo, 'question', '21-offense-field-goal-question');

  await answerChoice(page, await liveChoiceId(page, 'correct'));
  game = await renderedState(page);
  expect(game.score).toEqual({ player: 3, opponent: 0 });
  expect(game.quarterPossessions).toBe(1);
  await expect(page.locator('#feedback')).toContainText('Three points');
  await assertPhaseAndShot(page, testInfo, 'feedback', '21a-offense-field-goal-feedback');

  await page.evaluate(() => window.__footballTest.seedDriveState({
    possession: 'defense',
    direction: -1,
    quarter: 1,
    down: 4,
    yardsToGo: 10,
    yardLine: 80,
    firstDownLine: 70,
    driveStart: 80,
    scores: { player: 0, opponent: 0 },
  }));
  await expectQuestionPlayType(page, 'punt', 'opponent punt');
  await expect(page.locator('#call-grid .call-btn')).toHaveCount(0);
  await expect(page.locator('#special-action-live')).toContainText('chooses to punt');
  await assertPhaseAndShot(page, testInfo, 'question', '22-defense-punt-question');

  await answerChoice(page, await liveChoiceId(page, 'correct'));
  game = await renderedState(page);
  expect(game.quarterPossessions).toBe(1);
  await expect(page.locator('#feedback')).toContainText(/punt|touchback/i);
  await assertPhaseAndShot(page, testInfo, 'feedback', '22a-defense-punt-feedback');

  await page.evaluate(() => window.__footballTest.seedDriveState({
    possession: 'defense',
    direction: -1,
    quarter: 1,
    down: 4,
    yardsToGo: 10,
    yardLine: 40,
    firstDownLine: 30,
    driveStart: 80,
    scores: { player: 0, opponent: 0 },
  }));
  await expectQuestionPlayType(page, 'fieldGoal', 'opponent field goal');
  await expect(page.locator('#special-action-live')).toContainText('chooses a field goal');
  await assertPhaseAndShot(page, testInfo, 'question', '23-defense-field-goal-question');

  await answerChoice(page, await liveChoiceId(page, 'correct'));
  game = await renderedState(page);
  expect(game.score).toEqual({ player: 0, opponent: 0 });
  expect(game.quarterPossessions).toBe(1);
  await expect(page.locator('#feedback')).toContainText('blocked');
  await assertPhaseAndShot(page, testInfo, 'feedback', '23a-defense-field-goal-feedback');

  await page.evaluate(() => window.__footballTest.seedDriveState({
    possession: 'defense',
    direction: -1,
    quarter: 1,
    down: 4,
    yardsToGo: 2,
    yardLine: 45,
    firstDownLine: 43,
    driveStart: 80,
    scores: { player: 0, opponent: 0 },
  }));
  await expect(page.locator('#call-grid .call-btn')).toHaveCount(4);
  await expect(page.locator('#decision-grid .decision-btn')).toHaveCount(0);
  await expect(page.locator('#defense-read')).toBeVisible();
  await assertPhaseAndShot(page, testInfo, 'call', '24-defense-fourth-down-go-call');
});

test('season start, saved final, completed, and pending states remain compact', async ({ page }, testInfo) => {
  const schedule = ['unc', 'nc-state', 'wake-forest'];
  const result = (gameNumber, playerScore, opponentScore) => ({
    gameNumber,
    gameId: `release-season-game-${gameNumber}`,
    rivalId: schedule[gameNumber - 1],
    playerScore,
    opponentScore,
    completedAt: `2026-07-${String(18 + gameNumber).padStart(2, '0')}T12:00:00.000Z`,
  });
  const store = (results, seasonId) => JSON.stringify({
    schemaVersion: 1,
    currentSeason: {
      seasonId,
      formatId: 'three-rival-schedule-v1',
      playerId: 'duke',
      createdAt: '2026-07-19T12:00:00.000Z',
      schedule,
      results,
    },
  });

  await page.goto('/football/');
  await page.evaluate((key) => localStorage.removeItem(key), 'footballMathSeason:v1');
  await page.reload();
  await page.getByRole('radio', { name: /3-Game Season/ }).check();
  await expect(page.locator('#start-game-btn')).toHaveText('Start Season');
  await assertViewport(page, '25-season-start');
  await shot(page, testInfo, '25-season-start');

  const oneResult = store([result(1, 7, 0)], 'release-saved-season');
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: 'footballMathSeason:v1', raw: oneResult,
  });
  await page.reload();
  await page.evaluate(() => {
    activeSeasonBinding = Object.freeze({
      seasonId: 'release-saved-season', gameNumber: 1, rivalId: 'unc', gameId: 'release-season-game-1',
    });
    state = {
      ...state,
      match: FOOTBALL_OPPONENT.createMatch('unc'),
      playerScore: 7,
      opponentScore: 0,
    };
    showGameOver();
  });
  await expect(page.locator('#ov-end-season')).toContainText('Game 1 saved');
  await assertViewport(page, '26-season-final');
  await shot(page, testInfo, '26-season-final');

  const complete = store([
    result(1, 7, 0),
    result(2, 0, 7),
    result(3, 3, 3),
  ], 'release-complete-season');
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: 'footballMathSeason:v1', raw: complete,
  });
  await page.reload();
  await expect(page.locator('#season-progress')).toHaveText('Season complete');
  await expect(page.locator('#start-game-btn')).toHaveText('Start New Season');
  await assertViewport(page, '27-season-complete');
  await shot(page, testInfo, '27-season-complete');

  const empty = store([], 'release-pending-season');
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: 'footballMathSeason:v1', raw: empty,
  });
  await page.reload();
  await page.locator('#start-game-btn').click();
  await page.evaluate(async (key) => {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('blocked', 'QuotaExceededError');
      return nativeSetItem.call(this, name, value);
    };
    state.playerScore = 10;
    state.opponentScore = 7;
    await FOOTBALL_SEASON.settleGame(activeSeasonBinding, {
      playerScore: state.playerScore,
      opponentScore: state.opponentScore,
    });
    showGameOver();
  }, 'footballMathSeason:v1');
  await expect(page.locator('#ov-end-btn')).toHaveText('Retry Saving');
  await expect(page.locator('#ov-end-quick-btn')).toBeVisible();
  await assertViewport(page, '28-season-pending');
  await shot(page, testInfo, '28-season-pending');

  await page.reload();
  await expect(page.locator('#start-game-btn')).toHaveText('Play Game 1');
  await page.locator('#start-game-btn').click();
  await page.evaluate(() => {
    window.__footballTest.seedDriveState({
      gameId: 'release-mismatched-live-game',
      possession: 'offense', direction: 1, quarter: 4,
      down: 4, yardsToGo: 10, yardLine: 28, firstDownLine: 38, driveStart: 20,
      scores: { player: 10, opponent: 7 }, quarterPossessions: 3,
    });
    showGameOver();
  });
  await expect(page.locator('#ov-end-season')).toHaveText(
    'This game’s Season result could not be confirmed. This device’s saved Season is unchanged by this game.',
  );
  await expect(page.locator('#ov-end-btn')).toHaveText('Continue Season');
  await expect(page.locator('#ov-end-quick-btn')).toBeHidden();
  expect(await page.evaluate(() => FOOTBALL_SEASON.pendingKind())).toBeNull();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).currentSeason.results, 'footballMathSeason:v1'))
    .toEqual([]);
  await assertViewport(page, '29-season-unconfirmed');
  await shot(page, testInfo, '29-season-unconfirmed');
});

test('phone pending-result recovery keeps corrupt and future copy plus both actions fully in frame', async ({ page }, testInfo) => {
  phonesOnly(testInfo);
  await page.goto('/football/');
  await page.evaluate((key) => localStorage.removeItem(key), 'footballMathSeason:v1');
  await page.reload();
  await page.getByRole('radio', { name: /3-Game Season/ }).check();
  await page.locator('#start-game-btn').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');

  await page.evaluate((key) => {
    const nativeSetItem = Storage.prototype.setItem;
    window.__releaseNativeSeasonSetItem = nativeSetItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('blocked', 'QuotaExceededError');
      return nativeSetItem.call(this, name, value);
    };
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 4,
      down: 4, yardsToGo: 10, yardLine: 28, firstDownLine: 38, driveStart: 20,
      scores: { player: 3, opponent: 7 }, quarterPossessions: 3,
    });
  }, 'footballMathSeason:v1');
  await page.locator('#decision-grid .decision-btn[data-action="punt"]').click();
  await answerChoice(page, await liveChoiceId(page, 'correct'));
  await expect(page.locator('#ov-end')).toHaveClass(/show/);
  await expect(page.locator('#ov-end-btn')).toHaveText('Retry Saving');
  await expect(page.locator('#ov-end-quick-btn')).toHaveText('Play Quick Game');

  const scenarios = [
    {
      status: 'corrupt',
      raw: '{\n  "schemaVersion": 1,\n  "currentSeason": { "broken": true }\n}\n',
      copy: 'Season game 1 is final. Not saved—closing or reloading will lose this game’s season result. Saved progress is damaged or changed. Retry Saving or use Quick Game. Start Fresh after reloading only if needed; this result will be lost.',
      label: '30-season-pending-corrupt',
    },
    {
      status: 'future',
      raw: '{\n  "schemaVersion": 99,\n  "newer": { "preserve": true }\n}\n',
      copy: 'Season game 1 is final. Not saved—closing or reloading will lose this game’s season result. A newer game version saved this season. Retry Saving or use Quick Game. Reloading loses this result.',
      label: '31-season-pending-future',
    },
  ];

  for (const scenario of scenarios) {
    await page.evaluate(({ key, raw }) => {
      window.__releaseNativeSeasonSetItem.call(localStorage, key, raw);
      window.dispatchEvent(new StorageEvent('storage', {
        key,
        newValue: raw,
        storageArea: localStorage,
      }));
    }, { key: 'footballMathSeason:v1', raw: scenario.raw });
    await expect.poll(() => page.evaluate(() => FOOTBALL_SEASON.snapshot().status)).toBe(scenario.status);
    await expect.poll(() => page.evaluate(() => FOOTBALL_SEASON.pendingKind())).toBe('result');
    await expect(page.locator('#ov-end-season')).toHaveText(scenario.copy);
    await expect(page.locator('#ov-end-btn')).toHaveText('Retry Saving');
    await expect(page.locator('#ov-end-quick-btn')).toHaveText('Play Quick Game');
    expect(await page.evaluate((key) => localStorage.getItem(key), 'footballMathSeason:v1')).toBe(scenario.raw);
    const metrics = await assertVisibleOverlayCardBounds(page, scenario.label);
    expect(metrics.buttons.map(button => button.text)).toEqual(['Retry Saving', 'Play Quick Game']);
    await shot(page, testInfo, scenario.label);
  }
});

test('post-game accuracy counts wrong offense and defense answers', async ({ page }) => {
  await page.goto('/football/?boot=offense-call');
  await page.locator('#call-grid .call-btn').first().click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  let firstWrong = await liveChoiceId(page, 'wrong');
  await answerChoice(page, firstWrong);
  await answerChoice(page, await liveChoiceId(page, 'wrong', [firstWrong]));
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');
  await page.locator('#question-continue').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');

  await page.evaluate(() => window.__footballTest.seedDriveState({
    possession: 'defense',
    direction: -1,
    quarter: 1,
    down: 1,
    yardsToGo: 10,
    yardLine: 80,
    firstDownLine: 70,
    driveStart: 80,
    scores: { player: 0, opponent: 0 },
    plays: 1,
    drivePlays: 0,
    quarterPossessions: 0,
    tds: 0,
    opponentTds: 0,
    correctAnswers: 0,
    gradedQuestions: 1,
  }));
  await page.locator('#call-grid .call-btn').first().click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  firstWrong = await liveChoiceId(page, 'wrong');
  await answerChoice(page, firstWrong);
  await answerChoice(page, await liveChoiceId(page, 'wrong', [firstWrong]));
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');
  await page.locator('#question-continue').click();
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
