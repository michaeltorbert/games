import { test, expect } from './curriculum-fixture.mjs';

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

async function showNextDownQuestion(page, beforeCallLabel = null) {
  await page.addInitScript(() => {
    try { window.localStorage.removeItem('footballMathStats:v1'); } catch (error) {}
  });
  await page.goto('/football/?boot=offense-call');
  await page.evaluate(() => {
    window.__footballTest.setQuestionFault(null);
    window.__footballTest.setRootSeed(0x790079);
    window.__footballTest.seedDriveState({
      possession: 'offense',
      direction: 1,
      quarter: 2,
      down: 2,
      yardsToGo: 7,
      yardLine: 30,
      firstDownLine: 37,
      driveStart: 20,
      scores: { player: 7, opponent: 7 },
      totalYards: { player: 83, opponent: 71 },
      plays: 4,
      drivePlays: 2,
    });
    const context = FOOTBALL_DOMAIN.normalizeContext({
      contextId: 'next-down-layout-probe',
      match: state.match,
      possession: state.possession,
      direction: state.direction,
      quarter: state.quarter,
      down: state.down,
      yardsToGo: state.ytg,
      yardLine: state.yd,
      firstDownLine: state.fdYd,
      driveStart: state.driveStart,
      scores: { player: state.playerScore, opponent: state.opponentScore },
      totalYards: { player: state.playerTotalYards, opponent: state.opponentTotalYards },
      plays: state.plays,
      drivePlays: state.drivePlays,
      calls: { offense: 'shortRun', defense: null, matchup: null },
    });
    const snap = FOOTBALL_DOMAIN.createSnap(context, { gain: 2, callKey: 'shortRun', label: 'Short Run' });
    const entries = FOOTBALL_CONTEXTUAL_QUESTIONS.inspect(snap, {
      completedThroughPage: FOOTBALL_LEARNING.PROFILE.completedThroughPage,
      includedThroughPage: FOOTBALL_LEARNING.PROFILE.includedThroughPage,
      computationMax: FOOTBALL_LEARNING.PROFILE.computationMax,
      displayMax: FOOTBALL_LEARNING.PROFILE.displayMax,
    }).eligible.map((entry) => ({
      ...entry,
      selectionMultiplier: FOOTBALL_CONTEXTUAL_QUESTIONS.selectionFor(snap, entry.familyId).multiplier,
    }));
    const probeSession = FOOTBALL_LEARNING.createSession();
    let draw = null;
    for (let index = 0; index < 2000; index++) {
      const candidate = (index + 0.5) / 2000;
      if (FOOTBALL_LEARNING.weightedPick(entries, probeSession, () => candidate).familyId === 'next-down') {
        draw = candidate;
        break;
      }
    }
    if (draw === null) throw new Error('Could not target next-down in the scheduler pool');
    window.__footballTest.setRngStreams({
      football: () => 0,
      scheduler: () => draw,
      presentation: () => 0.4,
    });
  });
  const call = page.locator('#call-grid .call-btn').filter({ hasText: 'Short Run' }).first();
  await expect(call).toBeVisible();
  if (beforeCallLabel) await assertCallGridAboveFold(page, beforeCallLabel);
  await call.click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  const familyId = await page.evaluate(() => window.__footballTest.activeContracts().questionInstance?.familyId);
  expect(familyId).toBe('next-down');
}

async function assertNextDownQuestionAboveFold(page, label) {
  const prompt = page.locator('#question');
  const visual = page.locator('#math-overlay');
  const answerRow = page.locator('#btn-row');
  const answers = answerRow.locator('.ans-btn:not(.hidden)');
  await expect(prompt).toBeVisible();
  await expect(visual).toHaveAttribute('data-type', 'down-progression');
  await expect(visual).toContainText('NEXT ?');
  await expect(visual).not.toContainText('NEXT 3RD');
  await expect(answers).toHaveCount(4);

  const metrics = await page.evaluate(() => {
    const selectors = ['#question', '#math-overlay', '#btn-row'];
    const elements = selectors.map((selector) => document.querySelector(selector));
    const buttons = Array.from(document.querySelectorAll('#btn-row .ans-btn:not(.hidden)'));
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
    };
    return {
      scrollY: window.scrollY,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      regions: elements.map(rect),
      buttons: buttons.map(rect),
    };
  });

  expect(metrics.scrollY, `${label}: question view should not auto-scroll`).toBe(0);
  expect(metrics.scrollWidth, `${label}: question view should not overflow horizontally`)
    .toBeLessThanOrEqual(metrics.innerWidth + EPSILON);
  for (const region of metrics.regions) {
    expect(region.left, `${label}: region starts left of viewport`).toBeGreaterThanOrEqual(-EPSILON);
    expect(region.right, `${label}: region ends right of viewport`).toBeLessThanOrEqual(metrics.innerWidth + EPSILON);
    expect(region.top, `${label}: region starts above viewport`).toBeGreaterThanOrEqual(-EPSILON);
    expect(region.bottom, `${label}: region ends below viewport`).toBeLessThanOrEqual(metrics.innerHeight + EPSILON);
  }
  for (const button of metrics.buttons) {
    expect(button.width, `${label}: answer target width`).toBeGreaterThanOrEqual(44);
    expect(button.height, `${label}: answer target height`).toBeGreaterThanOrEqual(44);
    expect(button.bottom, `${label}: answer target below viewport`).toBeLessThanOrEqual(metrics.innerHeight + EPSILON);
  }
}

async function assertAnswerPanelClearance(page, label, minimumClearance = 16) {
  const metrics = await page.evaluate(() => {
    const desk = document.querySelector('#ui-desk').getBoundingClientRect();
    const answers = Array.from(document.querySelectorAll('#btn-row .ans-btn:not(.hidden)'))
      .map(button => button.getBoundingClientRect());
    return {
      viewportHeight: window.innerHeight,
      deskBottom: desk.bottom,
      answerCount: answers.length,
      answerBottom: answers.length ? Math.max(...answers.map(answer => answer.bottom)) : null,
      answerHeights: answers.map(answer => answer.height),
    };
  });

  expect(metrics.answerCount, `${label}: visible answer choices`).toBeGreaterThan(0);
  expect(metrics.viewportHeight - metrics.deskBottom, `${label}: safe space below the answer panel`)
    .toBeGreaterThanOrEqual(minimumClearance);
  expect(metrics.viewportHeight - metrics.answerBottom, `${label}: safe space below answer controls`)
    .toBeGreaterThanOrEqual(minimumClearance);
  for (const height of metrics.answerHeights) {
    expect(height, `${label}: answer target height`).toBeGreaterThanOrEqual(44);
  }
}

async function assertQuestionFeedbackGeometry(page, label, minimumClearance = 16) {
  const phase = await page.locator('#ui-desk').getAttribute('data-phase');
  expect(['question', 'feedback'], `${label}: instructional phase`).toContain(phase);
  const selectors = ['#status', '#field-wrap', '#question', '#ui-desk', '#btn-row'];
  if (phase === 'feedback') selectors.push('#feedback');
  const metrics = await page.evaluate((regionSelectors) => {
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return {
        selector: element.id ? `#${element.id}` : element.tagName,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
        width: box.width,
        height: box.height,
      };
    };
    const buttons = Array.from(document.querySelectorAll('#btn-row .ans-btn:not(.hidden)'));
    return {
      scrollY: window.scrollY,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      regions: regionSelectors.map(selector => rect(document.querySelector(selector))),
      buttons: buttons.map(rect),
    };
  }, selectors);

  expect(metrics.scrollY, `${label}: view should not auto-scroll`).toBe(0);
  expect(metrics.scrollWidth, `${label}: view should not overflow horizontally`)
    .toBeLessThanOrEqual(metrics.innerWidth + EPSILON);
  for (const region of metrics.regions) {
    expect(region.width, `${label}: ${region.selector} should have width`).toBeGreaterThan(0);
    expect(region.height, `${label}: ${region.selector} should have height`).toBeGreaterThan(0);
    expect(region.left, `${label}: ${region.selector} starts left of viewport`).toBeGreaterThanOrEqual(-EPSILON);
    expect(region.right, `${label}: ${region.selector} ends right of viewport`).toBeLessThanOrEqual(metrics.innerWidth + EPSILON);
    expect(region.top, `${label}: ${region.selector} starts above viewport`).toBeGreaterThanOrEqual(-EPSILON);
    expect(region.bottom, `${label}: ${region.selector} ends below viewport`).toBeLessThanOrEqual(metrics.innerHeight + EPSILON);
  }
  for (const button of metrics.buttons) {
    expect(button.width, `${label}: answer target width`).toBeGreaterThanOrEqual(44);
    expect(button.height, `${label}: answer target height`).toBeGreaterThanOrEqual(44);
    expect(metrics.innerHeight - button.bottom, `${label}: answer target bottom clearance`)
      .toBeGreaterThanOrEqual(minimumClearance);
  }
}

async function assertChoiceGridAboveFold(page, label, selector, expectedCount) {
  const choices = page.locator(selector);
  await expect(choices).toHaveCount(expectedCount);
  const metrics = await page.evaluate((choiceSelector) => {
    const targets = Array.from(document.querySelectorAll(choiceSelector));
    return {
      scrollY: window.scrollY,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      targets: targets.map((target) => {
        const box = target.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
      }),
    };
  }, selector);
  expect(metrics.scrollY, `${label}: no automatic scroll`).toBe(0);
  expect(metrics.scrollWidth, `${label}: no horizontal overflow`).toBeLessThanOrEqual(metrics.innerWidth + EPSILON);
  for (const target of metrics.targets) {
    expect(target.left, `${label}: target left`).toBeGreaterThanOrEqual(-EPSILON);
    expect(target.right, `${label}: target right`).toBeLessThanOrEqual(metrics.innerWidth + EPSILON);
    expect(target.top, `${label}: target top`).toBeGreaterThanOrEqual(-EPSILON);
    expect(target.bottom, `${label}: target bottom`).toBeLessThanOrEqual(metrics.innerHeight + EPSILON);
    expect(target.width, `${label}: target width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${label}: target height`).toBeGreaterThanOrEqual(44);
  }
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

  test('next-down question stays visible with four touch targets', async ({ page }, testInfo) => {
    const { pageErrors, consoleErrors } = attachErrorListeners(page);

    await showNextDownQuestion(page);
    await assertNextDownQuestionAboveFold(page, testInfo.project.name);

    await testInfo.attach(`next-down-${testInfo.project.name}.png`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });

    expect(pageErrors, 'page errors').toEqual([]);
    expect(consoleErrors, 'console errors').toEqual([]);
  });

  test('short iPad landscape keeps question and feedback clear of bottom browser chrome', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'ipad-11-landscape', 'Primary short-landscape compatibility check');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);
    await page.setViewportSize({ width: 1180, height: 740 });

    await showNextDownQuestion(page);
    await assertNextDownQuestionAboveFold(page, 'short iPad question');
    await assertAnswerPanelClearance(page, 'short iPad question');

    const correctChoiceId = await page.evaluate(
      () => window.__footballTest.activeContracts().questionInstance.correctChoiceId,
    );
    await page.evaluate(
      (choiceId) => window.__footballTest.answerChoice(choiceId),
      correctChoiceId,
    );
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
    await page.evaluate(() => clearTimeout(advTimer));
    await assertAnswerPanelClearance(page, 'short iPad feedback');

    expect(pageErrors, 'page errors').toEqual([]);
    expect(consoleErrors, 'console errors').toEqual([]);
  });

  test('1024px iPad landscape keeps question and feedback clear of bottom browser chrome', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'ipad-11-landscape', 'Older iPad landscape compatibility check');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);
    await page.setViewportSize({ width: 1024, height: 688 });

    await showNextDownQuestion(page, '1024px offense call');
    await assertNextDownQuestionAboveFold(page, '1024px iPad question');
    await assertQuestionFeedbackGeometry(page, '1024px iPad question');
    await assertAnswerPanelClearance(page, '1024px iPad question');

    await testInfo.attach('next-down-ipad-1024-question.png', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });

    const correctChoiceId = await page.evaluate(
      () => window.__footballTest.activeContracts().questionInstance.correctChoiceId,
    );
    await page.evaluate(
      (choiceId) => window.__footballTest.answerChoice(choiceId),
      correctChoiceId,
    );
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
    await page.evaluate(() => clearTimeout(advTimer));
    await assertQuestionFeedbackGeometry(page, '1024px iPad feedback');
    await assertAnswerPanelClearance(page, '1024px iPad feedback');

    await testInfo.attach('next-down-ipad-1024-feedback.png', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });

    expect(pageErrors, 'page errors').toEqual([]);
    expect(consoleErrors, 'console errors').toEqual([]);
  });

  test('1024px iPad landscape keeps call, decision, and explanation controls above the fold', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'ipad-11-landscape', 'Older iPad landscape compatibility check');
    const { pageErrors, consoleErrors } = attachErrorListeners(page);
    await page.setViewportSize({ width: 1024, height: 688 });

    await page.goto('/football/?boot=defense-call');
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
    await expect(page.locator('#call-grid')).toHaveAttribute('data-count', '4');
    await assertChoiceGridAboveFold(page, '1024px defense call', '#call-grid .call-btn', 4);

    await page.goto('/football/?boot=offense-call');
    await page.evaluate(() => {
      window.__footballTest.seedDriveState({
        possession: 'offense', direction: 1, quarter: 2, down: 4, yardsToGo: 2,
        yardLine: 70, firstDownLine: 72, driveStart: 45,
        scores: { player: 7, opponent: 7 }, totalYards: { player: 83, opponent: 71 },
        plays: 4, drivePlays: 3,
      });
      showPlayerFourthDownDecision();
    });
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'fourth-down-decision');
    await assertChoiceGridAboveFold(page, '1024px fourth-down decision', '#decision-grid .decision-btn', 3);

    await page.evaluate(() => showConversionDecision());
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'conversion-decision');
    await assertChoiceGridAboveFold(page, '1024px conversion decision', '#decision-grid .decision-btn', 2);

    await showNextDownQuestion(page);
    const wrongChoiceIds = await page.evaluate(() => {
      const question = window.__footballTest.activeContracts().questionInstance;
      return question.choices.filter(choice => choice.id !== question.correctChoiceId).slice(0, 2).map(choice => choice.id);
    });
    expect(wrongChoiceIds).toHaveLength(2);
    await page.evaluate((choiceId) => window.__footballTest.answerChoice(choiceId), wrongChoiceIds[0]);
    await page.evaluate((choiceId) => window.__footballTest.answerChoice(choiceId), wrongChoiceIds[1]);
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');
    await assertChoiceGridAboveFold(page, '1024px explanation', '#question-learn-why:not(.hidden)', 1);
    await expect(page.locator('#ui-desk')).toHaveCSS('grid-template-columns', /.+px .+px/);

    expect(pageErrors, 'page errors').toEqual([]);
    expect(consoleErrors, 'console errors').toEqual([]);
  });
});
