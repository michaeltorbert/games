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
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Pixel size from a PNG's leading IHDR chunk; fails on anything else.
function pngSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24
    || PNG_SIGNATURE.some((byte, index) => buffer[index] !== byte)
    || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Screenshot is not a PNG with a leading IHDR chunk');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

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
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      lastBottom: Math.ceil(lastBottom),
      cards: cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      }),
    };
  });

  expect(metrics.scrollY, `${label}: did not auto-scroll to find cards`).toBe(0);
  expect(
    metrics.lastBottom,
    `${label}: last call card bottom ${metrics.lastBottom}px exceeds viewport ${metrics.innerHeight}px`,
  ).toBeLessThanOrEqual(metrics.innerHeight + EPSILON);
  for (const card of metrics.cards) {
    expect(card.left, `${label}: call target left bound`).toBeGreaterThanOrEqual(-EPSILON);
    expect(card.right, `${label}: call target right bound`).toBeLessThanOrEqual(metrics.innerWidth + EPSILON);
    expect(card.width, `${label}: call target width`).toBeGreaterThanOrEqual(44);
    expect(card.height, `${label}: call target height`).toBeGreaterThanOrEqual(44);
  }
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
    await expect(page.locator('#question')).toBeVisible();
    await expect(page.locator('#question')).toContainText('Make the fourth-down decision.');
    await assertChoiceGridAboveFold(page, '1024px fourth-down decision', '#decision-grid .decision-btn', 3);

    await page.evaluate(() => showConversionDecision());
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'conversion-decision');
    await expect(page.locator('#question')).toBeVisible();
    await expect(page.locator('#question')).toContainText('Choose one point or two points.');
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

// Issue #140: each limb pivots at its joint, so no animation frame detaches it.
async function freezePlayerPose(page, poseClass, fraction) {
  await page.evaluate(({ poseClass, fraction }) => {
    const player = document.getElementById('player');
    player.classList.remove('player-running', 'player-celebrating');
    if (poseClass) player.classList.add(poseClass);
    for (const animation of document.getAnimations()) {
      const target = animation.effect?.target;
      if (!target || !(target === player || player.contains(target))) continue;
      const timing = animation.effect.getComputedTiming();
      animation.pause();
      animation.currentTime = timing.delay + timing.duration * fraction;
    }
  }, { poseClass, fraction });
}

function playerGeometry(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(`#player ${selector}`).getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    return {
      hips: rect('.pl-hips'),
      pads: rect('.pl-pads'),
      legs: [rect('.pl-leg-l'), rect('.pl-leg-r')],
      arms: [rect('.pl-arm-l'), rect('.pl-arm-r')],
      gloves: [rect('.pl-arm-l .pl-glove'), rect('.pl-arm-r .pl-glove')],
    };
  });
}

function gapBetween(a, b) {
  const dx = Math.max(0, a.left - b.right, b.left - a.right);
  const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
  return Math.hypot(dx, dy);
}

test.describe('football player sprite', () => {
  test('arms and legs stay attached while running and celebrating', async ({ page }) => {
    const { pageErrors, consoleErrors } = attachErrorListeners(page);
    await page.goto('/football/?boot=offense-call');
    await expect(page.locator('#player')).toBeVisible();

    const poses = [
      ['standing', null, 0],
      ...[0, 0.25, 0.5, 0.75].map(f => [`running ${f}`, 'player-running', f]),
      ...[0.15, 0.3, 0.45, 0.6, 0.8].map(f => [`celebrating ${f}`, 'player-celebrating', f]),
    ];
    for (const [label, poseClass, fraction] of poses) {
      await freezePlayerPose(page, poseClass, fraction);
      const geometry = await playerGeometry(page);
      for (const leg of geometry.legs) expect(gapBetween(leg, geometry.hips), `${label}: leg meets hips`).toBeLessThanOrEqual(0.5);
      for (const arm of geometry.arms) expect(gapBetween(arm, geometry.pads), `${label}: arm meets shoulders`).toBeLessThanOrEqual(0.5);
    }

    // Mid-celebration both gloves are raised above the shoulder pads.
    await freezePlayerPose(page, 'player-celebrating', 0.45);
    const raised = await playerGeometry(page);
    for (const glove of raised.gloves) expect(glove.bottom).toBeLessThan(raised.pads.top);

    expect(pageErrors, 'page errors').toEqual([]);
    expect(consoleErrors, 'console errors').toEqual([]);
  });

  test('player stands just behind the ball without being hidden by it', async ({ page }) => {
    await page.goto('/football/?boot=offense-call');
    await expect(page.locator('#player')).toBeVisible();
    const boxes = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
      return { ball: rect('#ball'), jersey: rect('#player .pl-jersey'), helmet: rect('#player .pl-helmet'), field: rect('#field-wrap') };
    });
    // The jersey and helmet stay left of the rotated ball's box (within its empty corner), so the ball never covers the body.
    expect(boxes.jersey.right).toBeLessThanOrEqual(boxes.ball.left + 3);
    expect(boxes.helmet.right).toBeLessThanOrEqual(boxes.ball.left + 3);
    expect(boxes.ball.left - boxes.jersey.right).toBeLessThan(12);
    expect(boxes.jersey.left).toBeGreaterThanOrEqual(boxes.field.left);
  });

  // Codex review of #141: the fixed gap pushed the sprite past the clipped field edge near its own goal line.
  test('player stays inside the field near its own goal line', async ({ page }, testInfo) => {
    const { pageErrors, consoleErrors } = attachErrorListeners(page);
    await page.goto('/football/?boot=offense-call');
    await expect(page.locator('#player')).toBeVisible();

    const seedAt = (yardLine) => page.evaluate((yardLine) => {
      window.__footballTest.seedDriveState({ possession: 'offense', direction: 1, quarter: 1, down: 1,
        yardLine, firstDownLine: yardLine + 10, yardsToGo: 10 });
      updateField(false);
    }, yardLine);
    const assertInsideField = async (label) => {
      const result = await page.evaluate(() => {
        const field = document.getElementById('field-wrap');
        const box = field.getBoundingClientRect();
        const inner = { left: box.left + field.clientLeft, right: box.left + field.clientLeft + field.clientWidth };
        const parts = [...document.querySelectorAll('#player svg *')].map(node => node.getBoundingClientRect())
          .filter(rect => rect.width > 0 || rect.height > 0);
        return { inner, partCount: parts.length, left: Math.min(...parts.map(r => r.left)), right: Math.max(...parts.map(r => r.right)) };
      });
      // An empty sprite would make the bounds +/-Infinity and pass vacuously.
      expect(result.partCount, `${label}: player sprite has drawn parts`).toBeGreaterThan(0);
      expect(result.left, `${label}: player left edge inside the field`).toBeGreaterThanOrEqual(result.inner.left);
      expect(result.right, `${label}: player right edge inside the field`).toBeLessThanOrEqual(result.inner.right);
    };
    const poses = [
      ['standing', null, 0],
      ...[0, 0.25, 0.5, 0.75].map(f => [`running ${f}`, 'player-running', f]),
      ...[0.15, 0.3, 0.45, 0.6, 0.8].map(f => [`celebrating ${f}`, 'player-celebrating', f]),
    ];

    for (const yardLine of [1, 2]) {
      await seedAt(yardLine);
      await expect(page.locator('#player')).toBeVisible();
      for (const [label, poseClass, fraction] of poses) {
        await freezePlayerPose(page, poseClass, fraction);
        await assertInsideField(`own ${yardLine}, ${label}`);
      }
      await freezePlayerPose(page, null, 0);
      expect(await page.evaluate(() => parseFloat(document.getElementById('ball').style.left)), `own ${yardLine}: ball keeps its yard position`)
        .toBeCloseTo(await page.evaluate((y) => yardToPct(y), yardLine), 5);
    }

    // The clamp is recomputed when the field width changes, as on rotation.
    await seedAt(1);
    const { width, height } = page.viewportSize();
    await page.setViewportSize({ width: height, height: width });
    await page.waitForTimeout(100);
    await assertInsideField(`own 1 after rotating ${testInfo.project.name}`);

    expect(pageErrors, 'page errors').toEqual([]);
    expect(consoleErrors, 'console errors').toEqual([]);
  });

  // Issue #149: the resize correction itself must not slide the sprite in from
  // outside the narrowed field. These are engine-emulated viewport swaps, not
  // native Safari rotation; browser chrome and orientation events are not covered.
  for (const reducedMotion of [false, true]) {
    test(`phone rotation round trip keeps the player inside the field during correction${reducedMotion ? ' with reduced motion' : ''}`, async ({ page }, testInfo) => {
      const portrait = page.viewportSize();
      test.skip(portrait.width > 500, 'Phone portrait targets only');
      test.setTimeout(120_000);
      const { pageErrors, consoleErrors } = attachErrorListeners(page);
      if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/football/?boot=offense-call');
      await expect(page.locator('#player')).toBeVisible();
      const baselineTransition = await page.evaluate(() => {
        const style = getComputedStyle(document.getElementById('player'));
        return { property: style.transitionProperty, duration: style.transitionDuration };
      });
      expect(baselineTransition.property).toContain('left');

      const landscape = { width: portrait.height, height: portrait.width };
      const poses = reducedMotion
        ? [['standing', null, 0]]
        : [['standing', null, 0], ['running', 'player-running', 0.5], ['celebrating', 'player-celebrating', 0.45]];

      const swapAndSample = async (size, label) => {
        await page.evaluate(() => {
          window.__rotationSamples = [];
          window.__rotationDone = false;
          const measure = (elapsed) => {
            const field = document.getElementById('field-wrap');
            const player = document.getElementById('player');
            const box = field.getBoundingClientRect();
            const inner = { left: box.left + field.clientLeft, right: box.left + field.clientLeft + field.clientWidth };
            const parts = [...document.querySelectorAll('#player svg *')].map(node => node.getBoundingClientRect())
              .filter(rect => rect.width > 0 || rect.height > 0);
            const playerStyle = getComputedStyle(player);
            const playerBox = player.getBoundingClientRect();
            window.__rotationSamples.push({
              elapsed,
              inner,
              partCount: parts.length,
              playerShown: !player.classList.contains('player-hidden') && playerStyle.display !== 'none'
                && playerStyle.visibility === 'visible' && playerBox.width > 0 && playerBox.height > 0,
              left: parts.length ? Math.min(...parts.map(r => r.left)) : null,
              right: parts.length ? Math.max(...parts.map(r => r.right)) : null,
              inlineTransition: player.style.transition,
              leftTransitionRunning: player.getAnimations().some(animation => animation.transitionProperty === 'left'
                && animation.playState === 'running'),
              ballLeft: parseFloat(document.getElementById('ball').style.left),
              devicePixelRatio: window.devicePixelRatio,
            });
          };
          // Registered after the production handler, so the first sample is the corrected state.
          const onResize = () => {
            removeEventListener('resize', onResize);
            const start = performance.now();
            measure(0);
            window.__rotationStartEpoch = performance.timeOrigin + start;
            const tick = () => {
              const elapsed = performance.now() - start;
              measure(elapsed);
              if (elapsed < 900) requestAnimationFrame(tick);
              else window.__rotationDone = true;
            };
            requestAnimationFrame(tick);
          };
          addEventListener('resize', onResize);
        });
        await page.setViewportSize(size);
        // The early capture waits for the first resize callback, so it shows the corrected frame.
        // It is exported at CSS-pixel scale (one PNG pixel per CSS pixel) to shorten the
        // capture that overlaps the sampling window. Only the exported image is downscaled;
        // the page keeps its device pixel ratio, which every frame sample records.
        await page.waitForFunction(() => window.__rotationSamples.length > 0, null, { timeout: 5000 });
        const earlyShotStart = Date.now();
        const earlyShot = await page.screenshot({ path: testInfo.outputPath(`${label}-early-css-px.png`), scale: 'css' });
        const earlyShotEnd = Date.now();
        await page.waitForFunction(() => window.__rotationDone === true, null, { timeout: 5000 });
        const realized = await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          devicePixelRatio: window.devicePixelRatio,
        }));
        const samples = await page.evaluate(() => window.__rotationSamples);
        // Frame times and the early screenshot's approximate span, both relative to the resize,
        // so a short count shows where frames were missing. Wall clocks: approximate only.
        const startEpoch = await page.evaluate(() => window.__rotationStartEpoch);
        const timeline = `frames at ${samples.map(s => s.elapsed.toFixed(0)).join(', ')} ms; early screenshot ~${Math.round(earlyShotStart - startEpoch)}..${Math.round(earlyShotEnd - startEpoch)} ms`;
        const earlyShotSize = pngSize(earlyShot);
        const expectedDevicePixelRatio = testInfo.project.use.deviceScaleFactor;
        await testInfo.attach(`${label}-rotation-diagnostics.json`, {
          contentType: 'application/json',
          body: JSON.stringify({
            label,
            requestedViewport: size,
            earlyExport: { scale: 'css', units: 'CSS pixels', png: earlyShotSize },
            settledExport: { scale: 'device' },
            expectedDevicePixelRatio,
            realized,
            earlyShotWindowMs: [Math.round(earlyShotStart - startEpoch), Math.round(earlyShotEnd - startEpoch)],
            timeline,
            samples,
          }, null, 2),
        });
        expect(earlyShotSize, `${label}: early CSS-pixel export matches the viewport`).toEqual(size);
        expect(expectedDevicePixelRatio, `${label}: project device scale factor`).toEqual(expect.any(Number));
        expect(realized.devicePixelRatio, `${label}: runtime device pixel ratio after sampling`).toBe(expectedDevicePixelRatio);
        expect(samples.map(s => s.devicePixelRatio), `${label}: runtime device pixel ratio through the capture (${timeline})`)
          .toEqual(samples.map(() => expectedDevicePixelRatio));
        expect(realized.innerWidth, `${label}: realized viewport width`).toBe(size.width);
        expect(realized.innerHeight, `${label}: realized viewport height`).toBe(size.height);
        expect(realized.scrollWidth, `${label}: no horizontal overflow`).toBeLessThanOrEqual(realized.clientWidth + EPSILON);
        expect(samples.length, `${label}: sampled several frames (${timeline})`).toBeGreaterThan(5);
        expect(samples[0].elapsed).toBe(0);
        expect(samples.at(-1).elapsed, `${label}: sampled through 900ms (${timeline})`).toBeGreaterThanOrEqual(900);
        expect(samples[0].inlineTransition, `${label}: correction applied without the play transition`).toBe('none');
        for (const sample of samples) {
          // Empty or hidden geometry must fail rather than pass the bounds vacuously.
          expect(sample.playerShown, `${label} at ${sample.elapsed.toFixed(0)}ms: player shown`).toBe(true);
          expect(sample.partCount, `${label} at ${sample.elapsed.toFixed(0)}ms: player sprite has drawn parts`).toBeGreaterThan(0);
          expect(Number.isFinite(sample.left) && Number.isFinite(sample.right), `${label} at ${sample.elapsed.toFixed(0)}ms: finite sprite bounds`).toBe(true);
          expect(sample.right, `${label} at ${sample.elapsed.toFixed(0)}ms: nonempty sprite width`).toBeGreaterThan(sample.left);
          expect(sample.left, `${label} at ${sample.elapsed.toFixed(0)}ms: player left edge inside the field`)
            .toBeGreaterThanOrEqual(sample.inner.left);
          expect(sample.right, `${label} at ${sample.elapsed.toFixed(0)}ms: player right edge inside the field`)
            .toBeLessThanOrEqual(sample.inner.right);
          expect(sample.leftTransitionRunning, `${label} at ${sample.elapsed.toFixed(0)}ms: no left transition`).toBe(false);
        }
        await page.screenshot({ path: testInfo.outputPath(`${label}-settled.png`) });
        return samples;
      };

      for (const yardLine of [1, 2]) {
        for (const [poseLabel, poseClass, fraction] of poses) {
          await page.setViewportSize(portrait);
          await page.evaluate((yardLine) => {
            window.__footballTest.seedDriveState({ possession: 'offense', direction: 1, quarter: 1, down: 1,
              yardLine, firstDownLine: yardLine + 10, yardsToGo: 10 });
            updateField(false);
          }, yardLine);
          await page.waitForTimeout(100);
          await freezePlayerPose(page, poseClass, fraction);
          const expectedBall = await page.evaluate((y) => yardToPct(y), yardLine);
          const label = `own-${yardLine}-${poseLabel}${reducedMotion ? '-reduced' : ''}`;
          const toLandscape = await swapAndSample(landscape, `${label}-landscape`);
          const toPortrait = await swapAndSample(portrait, `${label}-portrait`);
          for (const sample of [...toLandscape, ...toPortrait]) {
            expect(sample.ballLeft, `${label}: ball keeps its yard position`).toBeCloseTo(expectedBall, 5);
          }
          const restored = await page.evaluate(() => {
            const player = document.getElementById('player');
            const style = getComputedStyle(player);
            return { inline: player.style.transition, property: style.transitionProperty, duration: style.transitionDuration };
          });
          expect(restored.inline, `${label}: inline transition override cleared`).toBe('');
          expect(restored.property, `${label}: ordinary transition restored`).toBe(baselineTransition.property);
          expect(restored.duration, `${label}: ordinary transition restored`).toBe(baselineTransition.duration);
          expect(await page.evaluate(() => state.yd), `${label}: canonical yard unchanged`).toBe(yardLine);
        }
      }

      // Ordinary play movement keeps its animated left transition after the corrections.
      await freezePlayerPose(page, null, 0);
      const moving = await page.evaluate(async () => {
        state.animYd = 30;
        updateField(true);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const player = document.getElementById('player');
        return player.getAnimations().some(animation => animation.transitionProperty === 'left');
      });
      expect(moving, 'normal play movement remains animated').toBe(true);

      expect(pageErrors, 'page errors').toEqual([]);
      expect(consoleErrors, 'console errors').toEqual([]);
    });
  }
});

// Issue #155: rotating while a committed play animates must not stop the player
// while the ball is still travelling. These drive the real call tap, the
// correct-answer tap that commits through commitPendingResolution() and
// updateField(true), and a real viewport swap on the wall clock. Samples come
// from resize and frame callbacks, so they check style and transition state,
// not painted pixels. Engine-emulated viewport swaps are not native Safari
// rotation.
const ROTATION_155_PROJECTS = ['ipad-11-landscape', 'ipad-11-portrait', 'iphone-15-portrait'];
const ROTATION_155_SEED = 0x155155;
const INTERIOR_155 = { possession: 'offense', direction: 1, quarter: 1, down: 1,
  yardLine: 30, yardsToGo: 10, firstDownLine: 40, driveStart: 20 };
const OWN_GOAL_155 = { possession: 'offense', direction: 1, quarter: 1, down: 1,
  yardLine: 1, yardsToGo: 10, firstDownLine: 11, driveStart: 1 };

function markersAtRest(page) {
  return page.waitForFunction(() => ['ball', 'player'].every((id) => {
    const element = document.getElementById(id);
    return element.style.transition === ''
      && !element.getAnimations().some(animation => animation.transitionProperty === 'left');
  }), null, { timeout: 5000 });
}

async function tapOffenseCall(page, callKey) {
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call', { timeout: 6000 });
  const index = await page.evaluate((key) => window.__footballTest.callKeys().offense.indexOf(key), callKey);
  expect(index, `${callKey} is an offense call`).toBeGreaterThanOrEqual(0);
  await page.locator('#call-grid .call-btn').nth(index).tap();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  return page.evaluate(() => {
    const { activePlay, questionInstance } = window.__footballTest.activeContracts();
    return {
      callKey: activePlay.call?.key ?? null,
      appliedGain: activePlay.proposal.appliedGain,
      endYardLine: activePlay.proposal.endYardLine,
      resultKind: activePlay.proposal.resultKind,
      familyId: questionInstance.familyId,
      choiceCount: questionInstance.choices.length,
      correctIndex: questionInstance.choices.findIndex(choice => choice.id === questionInstance.correctChoiceId),
      draws: { ...window.__draws155 },
    };
  });
}

// The correct-answer tap commits the play, which starts the ball's left transition.
async function tapCorrectAndAwaitMovement(page, correctIndex) {
  await markersAtRest(page);
  await page.locator(`#b${correctIndex}`).tap();
  await page.waitForFunction(() => document.getElementById('ball').getAnimations()
    .some(animation => animation.transitionProperty === 'left' && animation.playState === 'running'),
  null, { timeout: 5000 });
}

function sampleAfterNextResize(page) {
  return page.evaluate(() => {
    const record = { samples: [], ballEnds: [], resizeAt: null, done: false };
    window.__motion155 = record;
    const ball = document.getElementById('ball');
    ball.addEventListener('transitionend', (event) => {
      if (event.target === ball && event.propertyName === 'left') record.ballEnds.push(performance.now());
    });
    const leftRunning = (element) => element.getAnimations().some(animation =>
      animation.transitionProperty === 'left' && animation.playState === 'running');
    const measure = (elapsed) => {
      const field = document.getElementById('field-wrap');
      const player = document.getElementById('player');
      const box = field.getBoundingClientRect();
      const inner = { left: box.left + field.clientLeft, right: box.left + field.clientLeft + field.clientWidth };
      const parts = [...player.querySelectorAll('svg *')].map(node => node.getBoundingClientRect())
        .filter(rect => rect.width > 0 || rect.height > 0);
      record.samples.push({
        elapsed,
        innerWidth: window.innerWidth,
        inner,
        partCount: parts.length,
        spriteLeft: parts.length ? Math.min(...parts.map(rect => rect.left)) : null,
        spriteRight: parts.length ? Math.max(...parts.map(rect => rect.right)) : null,
        ballRunning: leftRunning(ball),
        playerRunning: leftRunning(player),
        ballLeftPx: parseFloat(getComputedStyle(ball).left),
        playerLeftPx: parseFloat(getComputedStyle(player).left),
        ballInlinePct: parseFloat(ball.style.left),
        playerInlinePct: parseFloat(player.style.left),
        ballTargetPct: yardToPct(state.animYd),
        playerTargetPct: playerLeftPct(player, field),
      });
    };
    // Registered after the production handler, so the first sample follows it.
    const onResize = () => {
      removeEventListener('resize', onResize);
      const start = performance.now();
      record.resizeAt = start;
      measure(0);
      const tick = () => {
        const elapsed = performance.now() - start;
        measure(elapsed);
        if (elapsed < 1000) requestAnimationFrame(tick);
        else record.done = true;
      };
      requestAnimationFrame(tick);
    };
    addEventListener('resize', onResize);
  });
}

function canonicalAfterCommit(page) {
  return page.evaluate(() => ({
    results: window.__results155,
    state: {
      possession: state.possession, yd: state.yd, animYd: state.animYd, fdYd: state.fdYd, down: state.down,
      ytg: state.ytg, playerScore: state.playerScore, opponentScore: state.opponentScore,
      playerTotalYards: state.playerTotalYards,
    },
  }));
}

// One fresh seeded game: a committed play, optionally with a viewport swap while
// it moves, then the next call and its committed movement on the same page.
async function runCommittedPlay155(page, { size, drive, call, swapTo = null }) {
  await page.setViewportSize(size);
  await page.goto('/football/?boot=offense-call');
  await expect(page.locator('#player')).toBeVisible();
  await page.evaluate(({ seed, seeded }) => {
    window.__footballTest.setQuestionFault(null);
    window.__footballTest.setRootSeed(seed);
    // Count draws per stream without changing the seeded sequences.
    const streams = { football: footballRng, scheduler: schedulerRng, presentation: presentationRng };
    window.__draws155 = { football: 0, scheduler: 0, presentation: 0 };
    window.__footballTest.setRngStreams(Object.fromEntries(Object.entries(streams).map(([name, draw]) => [name, () => {
      window.__draws155[name] += 1;
      return draw();
    }])));
    window.__results155 = [];
    addEventListener('football:result', ({ detail }) => {
      const { transition } = detail;
      window.__results155.push({
        playType: detail.playType, familyId: detail.familyId, policy: detail.policy, outcome: detail.outcome,
        appliedGain: transition.appliedGain, startYardLine: transition.startYardLine,
        endYardLine: transition.endYardLine, resultKind: transition.resultKind, newDown: transition.newDown,
        newYardsToGo: transition.newYardsToGo, newFirstDownLine: transition.newFirstDownLine,
        draws: { ...window.__draws155 },
      });
    });
    window.__footballTest.seedDriveState(seeded);
  }, { seed: ROTATION_155_SEED, seeded: drive });
  // Seeding places the markers without a transition and restores it a frame later.
  await markersAtRest(page);
  const durations = await page.evaluate(() => {
    const duration = (id) => getComputedStyle(document.getElementById(id)).transitionDuration;
    return { ball: duration('ball'), player: duration('player') };
  });

  const first = await tapOffenseCall(page, call);
  if (swapTo) await sampleAfterNextResize(page);
  await tapCorrectAndAwaitMovement(page, first.correctIndex);
  let motion = null;
  if (swapTo) {
    await page.setViewportSize(swapTo);
    await page.waitForFunction(() => window.__motion155.done === true, null, { timeout: 5000 });
    motion = await page.evaluate(() => window.__motion155);
  }
  await markersAtRest(page);
  const afterFirst = await canonicalAfterCommit(page);

  const next = await tapOffenseCall(page, 'shortRun');
  const nextPlayerStartPct = await page.evaluate(() => parseFloat(document.getElementById('player').style.left));
  await tapCorrectAndAwaitMovement(page, next.correctIndex);
  const nextMotion = await page.evaluate((playerStartPct) => {
    const leftRunning = (element) => element.getAnimations().some(animation =>
      animation.transitionProperty === 'left' && animation.playState === 'running');
    const ball = document.getElementById('ball');
    const player = document.getElementById('player');
    return {
      ballRunning: leftRunning(ball),
      playerRunning: leftRunning(player),
      ballInlineTransition: ball.style.transition,
      playerInlineTransition: player.style.transition,
      ballLeftPx: parseFloat(getComputedStyle(ball).left),
      playerLeftPx: parseFloat(getComputedStyle(player).left),
      playerStartPct,
      playerTargetPct: parseFloat(player.style.left),
    };
  }, nextPlayerStartPct);
  await markersAtRest(page);
  const afterNext = await canonicalAfterCommit(page);
  return { durations, motion, nextMotion, canonical: { first, afterFirst, next, afterNext } };
}

function assertMotionSample155(sample, label, { inSync }) {
  const at = `${label} at ${sample.elapsed.toFixed(0)}ms`;
  expect(sample.partCount, `${at}: player sprite has drawn parts`).toBeGreaterThan(0);
  expect(sample.spriteLeft, `${at}: player left edge inside the field`).toBeGreaterThanOrEqual(sample.inner.left);
  expect(sample.spriteRight, `${at}: player right edge inside the field`).toBeLessThanOrEqual(sample.inner.right);
  expect(sample.playerRunning, `${at}: player moves exactly while the ball moves`).toBe(sample.ballRunning);
  if (sample.ballRunning && inSync) {
    expect(Math.abs(sample.playerLeftPx - sample.ballLeftPx), `${at}: player anchor tracks the ball`)
      .toBeLessThanOrEqual(1);
  }
  if (!sample.ballRunning) {
    expect(sample.ballInlinePct, `${at}: ball at its yard`).toBeCloseTo(sample.ballTargetPct, 3);
    expect(sample.playerInlinePct, `${at}: player at its clamped target`).toBeCloseTo(sample.playerTargetPct, 3);
  }
}

function clearStats155(page) {
  return page.addInitScript(() => {
    try { window.localStorage.removeItem('footballMathStats:v1'); } catch (error) {}
  });
}

test.describe('football committed play during a viewport swap (#155)', () => {
  for (const reducedMotion of [false, true]) {
    test(`interior play keeps the player moving with the ball${reducedMotion ? ' with reduced motion' : ''}`, async ({ page }, testInfo) => {
      test.skip(!ROTATION_155_PROJECTS.includes(testInfo.project.name), 'iPad 11 in both orientations and one phone');
      test.setTimeout(90_000);
      const { pageErrors, consoleErrors } = attachErrorListeners(page);
      await clearStats155(page);
      // Reduced motion freezes the poses but keeps the left movement.
      if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
      const size = page.viewportSize();
      const swapTo = { width: size.height, height: size.width };
      const label = `${testInfo.project.name} interior${reducedMotion ? ' reduced' : ''}`;

      const reference = await runCommittedPlay155(page, { size, drive: INTERIOR_155, call: 'mediumPass' });
      const rotated = await runCommittedPlay155(page, { size, drive: INTERIOR_155, call: 'mediumPass', swapTo });
      for (const run of [reference, rotated]) {
        expect(run.durations, `${label}: 0.75 s left transitions`).toEqual({ ball: '0.75s', player: '0.75s' });
      }
      expect(rotated.canonical.first.appliedGain, `${label}: the committed play moves the ball`).toBeGreaterThan(0);

      const { samples, ballEnds, resizeAt } = rotated.motion;
      expect(samples[0].innerWidth, `${label}: realized swapped viewport`).toBe(swapTo.width);
      expect(ballEnds.filter(time => time < resizeAt), `${label}: swap landed before the ball finished`).toEqual([]);
      expect(samples[0].ballRunning, `${label}: ball still moving after the resize handler`).toBe(true);
      expect(samples[0].playerRunning, `${label}: player still moving after the resize handler`).toBe(true);
      expect(samples.length, `${label}: sampled several frames`).toBeGreaterThan(5);
      expect(samples.at(-1).elapsed, `${label}: sampled through 1000ms`).toBeGreaterThanOrEqual(1000);
      for (const sample of samples) assertMotionSample155(sample, label, { inSync: true });
      expect(samples.at(-1).ballRunning, `${label}: movement settled`).toBe(false);

      // The next committed play still moves the player with the ball.
      const { nextMotion } = rotated;
      expect(nextMotion.ballRunning, `${label}: next ball movement animates`).toBe(true);
      expect(nextMotion.playerRunning, `${label}: next player movement animates`).toBe(true);
      expect(nextMotion.ballInlineTransition, `${label}: no leftover ball override`).toBe('');
      expect(nextMotion.playerInlineTransition, `${label}: no leftover player override`).toBe('');
      expect(Math.abs(nextMotion.playerLeftPx - nextMotion.ballLeftPx), `${label}: next movement in step`)
        .toBeLessThanOrEqual(1);

      // The swap changes no play, result, yard, score or RNG draw.
      expect(rotated.canonical, `${label}: canonical plays, results and RNG draws`).toEqual(reference.canonical);
      expect(pageErrors, 'page errors').toEqual([]);
      expect(consoleErrors, 'console errors').toEqual([]);
    });
  }

  // Near the own goal line the edge clamp can change with the field width. The
  // handler then settles the ball with the player instead of letting either jump.
  test('own-goal-line play stays inside the field and moves with the ball', async ({ page }, testInfo) => {
    test.skip(!ROTATION_155_PROJECTS.includes(testInfo.project.name), 'iPad 11 in both orientations and one phone');
    test.setTimeout(90_000);
    const { pageErrors, consoleErrors } = attachErrorListeners(page);
    await clearStats155(page);
    const size = page.viewportSize();
    const swapTo = { width: size.height, height: size.width };
    const label = `${testInfo.project.name} own goal line`;

    const reference = await runCommittedPlay155(page, { size, drive: OWN_GOAL_155, call: 'shortRun' });
    const rotated = await runCommittedPlay155(page, { size, drive: OWN_GOAL_155, call: 'shortRun', swapTo });
    expect(rotated.canonical.first.appliedGain, `${label}: the committed play moves the ball`).toBeGreaterThan(0);

    const { samples, ballEnds, resizeAt } = rotated.motion;
    expect(samples[0].innerWidth, `${label}: realized swapped viewport`).toBe(swapTo.width);
    expect(ballEnds.filter(time => time < resizeAt), `${label}: swap landed before the ball finished`).toEqual([]);
    expect(samples.length, `${label}: sampled several frames`).toBeGreaterThan(5);
    expect(samples.at(-1).elapsed, `${label}: sampled through 1000ms`).toBeGreaterThanOrEqual(1000);
    for (const sample of samples) assertMotionSample155(sample, label, { inSync: false });
    expect(samples.at(-1).ballRunning, `${label}: movement settled`).toBe(false);
    testInfo.annotations.push({
      type: 'issue-155-resize-path',
      description: samples[0].ballRunning ? 'ball and player kept moving' : 'ball and player settled together',
    });

    // Any settlement override is cleared before the next committed movement.
    // The clamped player target may sit apart from the ball here, but the next
    // play must carry it past the clamp so its movement is observable.
    expect(rotated.nextMotion.ballRunning, `${label}: next ball movement animates`).toBe(true);
    expect(rotated.nextMotion.playerTargetPct, `${label}: next play moves the player target`)
      .not.toBeCloseTo(rotated.nextMotion.playerStartPct, 3);
    expect(rotated.nextMotion.playerRunning, `${label}: next player movement animates`).toBe(true);
    expect(rotated.nextMotion.ballInlineTransition, `${label}: no leftover ball override`).toBe('');
    expect(rotated.nextMotion.playerInlineTransition, `${label}: no leftover player override`).toBe('');

    expect(rotated.canonical, `${label}: canonical plays, results and RNG draws`).toEqual(reference.canonical);
    expect(pageErrors, 'page errors').toEqual([]);
    expect(consoleErrors, 'console errors').toEqual([]);
  });
});
