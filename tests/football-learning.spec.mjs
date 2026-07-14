import { test, expect } from '@playwright/test';

function primaryOnly(testInfo) {
  test.skip(testInfo.project.name !== 'ipad-11-landscape', 'Learning property checks run once on the primary target.');
}

async function answerIndex(page, kind, excluded = []) {
  return page.evaluate(({ answerKind, excludedIndexes }) => {
    const correct = state.choices.indexOf(state.correct);
    if (answerKind === 'correct') return correct;
    return state.choices.findIndex((choice, index) => choice !== state.correct && !excludedIndexes.includes(index));
  }, { answerKind: kind, excludedIndexes: excluded });
}

test('curriculum scheduler is deterministic, bounded, fresh, and call-independent in level', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?boot=offense-call');

  const result = await page.evaluate(() => {
    function makeRng(seedValue) {
      let seed = seedValue >>> 0;
      return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0x100000000;
      };
    }

    function sequence(calls) {
      window.__footballTest.resetLearning();
      window.__footballTest.setRng(makeRng(0x54c0de));
      return calls.map(call => window.__footballTest.buildPlayAt({
        possession: 'offense', direction: 1, yd: 30, fdYd: 40, down: 1, ytg: 10, driveStart: 20,
      }, call));
    }

    const calls = Array.from({ length: 240 }, (_, index) => Object.keys(OFFENSE_CALLS)[index % 5]);
    const first = sequence(calls);
    const second = sequence(calls);
    const metadata = window.__footballTest.questionBank();
    return {
      first,
      second,
      metadata,
      profile: window.__footballTest.learningProfile(),
    };
  });

  expect(result.first).toEqual(result.second);
  expect(result.profile.completedThroughPage).toBe(143);
  expect(result.profile.computationMax).toBe(10);
  expect(result.profile.displayMax).toBe(100);

  for (const meta of result.metadata) {
    expect(meta.id).toBeTruthy();
    expect(meta.skill).toBeTruthy();
    expect(meta.concept).toBeTruthy();
    expect(meta.purpose).toBeTruthy();
    expect(meta.grading).toMatch(/^(gate|noStakes)$/);
    expect(meta.tier).toBeTruthy();
    if (meta.grading === 'gate') expect(meta.minCompletedPage).toBeLessThanOrEqual(143);
  }

  for (let index = 0; index < result.first.length; index++) {
    const question = result.first[index];
    expect(new Set(question.choices).size, question.id).toBe(question.choices.length);
    expect(question.choices.filter(choice => choice === question.correct), question.id).toHaveLength(1);
    expect(question.learningTier, question.id).toBeTruthy();
    if (question.math) {
      expect(question.math.displayMin, question.id).toBeGreaterThanOrEqual(0);
      expect(question.math.displayMax, question.id).toBeLessThanOrEqual(100);
      if (question.math.delta != null && question.grading === 'gate') {
        expect(Math.abs(question.math.delta), question.id).toBeLessThanOrEqual(10);
      }
    }
    if (index >= 3) {
      expect(result.first.slice(index - 3, index).map(item => item.id), 'three-question recency window')
        .not.toContain(question.id);
    }
  }

  const purposeCounts = result.first.reduce((counts, question) => {
    counts[question.purpose] = (counts[question.purpose] || 0) + 1;
    return counts;
  }, {});
  const share = purpose => (purposeCounts[purpose] || 0) / result.first.length;
  expect(share('weakSpot')).toBeGreaterThanOrEqual(0.30);
  expect(share('weakSpot')).toBeLessThanOrEqual(0.48);
  expect(share('coreReview')).toBeGreaterThanOrEqual(0.15);
  expect(share('coreReview')).toBeLessThanOrEqual(0.30);
  expect(share('completedPlaceValue')).toBeGreaterThanOrEqual(0.22);
  expect(share('completedPlaceValue')).toBeLessThanOrEqual(0.40);
  expect(share('currentSupported')).toBeLessThanOrEqual(0.15);

  const tiersByCall = new Map();
  result.first.forEach((question, index) => {
    const call = ['shortRun', 'shortPass', 'longRun', 'mediumPass', 'longPass'][index % 5];
    if (!tiersByCall.has(call)) tiersByCall.set(call, new Set());
    tiersByCall.get(call).add(question.learningTier);
  });
  for (const tiers of tiersByCall.values()) {
    expect([...tiers].every(tier => ['within-10', 'two-digit-structure', 'supported-comparison', 'football'].includes(tier))).toBe(true);
  }
});

test('concept mastery counts only graded resolutions and historical need starts after three results', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/');

  const result = await page.evaluate(() => {
    const question = {
      id: 'concept-check', skill: 'difference', concept: 'line-to-gain',
      purpose: 'weakSpot', grading: 'gate',
    };
    const session = FOOTBALL_LEARNING.createSession({
      'line-to-gain': { firstTryCorrect: 0, retryCorrect: 0, secondMiss: 3 },
    });
    FOOTBALL_LEARNING.recordResolved(session, question, 'retryCorrect');
    FOOTBALL_LEARNING.recordResolved(session, { ...question, grading: 'noStakes' }, 'secondMiss');

    const entries = [
      { id: 'needs-practice', skill: 'difference', concept: 'line-to-gain', purpose: 'weakSpot', grading: 'gate', weight: 1 },
      { id: 'comparison', skill: 'difference', concept: 'field-distance', purpose: 'weakSpot', grading: 'gate', weight: 1 },
    ];
    const beforeThreshold = FOOTBALL_LEARNING.createSession({
      'line-to-gain': { firstTryCorrect: 0, retryCorrect: 0, secondMiss: 2 },
    });
    return {
      session,
      atThree: FOOTBALL_LEARNING.weightedPick(entries, session, () => 0.55).id,
      beforeThree: FOOTBALL_LEARNING.weightedPick(entries, beforeThreshold, () => 0.55).id,
    };
  });

  expect(result.session.byConcept).toEqual({
    'line-to-gain': { resolved: 1, firstTryCorrect: 0, retryCorrect: 1, secondMiss: 0 },
  });
  expect(result.session.historicalMastery['line-to-gain']).toEqual({
    resolved: 3, firstTryCorrect: 0, retryCorrect: 0, secondMiss: 3,
  });
  expect(result.session.events.map(event => event.concept)).toEqual(['line-to-gain', 'line-to-gain']);
  expect(result.atThree).toBe('needs-practice');
  expect(result.beforeThree).toBe('comparison');
});

test('first miss gives a same-question retry and retry correct resolves one play', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?boot=offense-call');
  await page.locator('#call-grid .call-btn').first().click();

  const before = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const wrong = await answerIndex(page, 'wrong');
  await page.locator(`#b${wrong}`).click();
  const retry = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

  expect(retry.mode).toBe('question');
  expect(retry.questionId).toBe(before.questionId);
  expect(retry.attempt).toBe(2);
  expect(retry.retryAvailable).toBe(true);
  expect(retry.plays).toBe(before.plays);
  expect(retry.absoluteYard).toBe(before.absoluteYard);
  expect(retry.outcomeCommitted).toBe(false);
  if (before.math) expect(retry.math?.visible).toBe(true);
  await expect(page.locator(`#b${wrong}`)).toBeDisabled();
  await expect(page.locator('#feedback')).toContainText(/Good try/);

  const correct = await answerIndex(page, 'correct');
  await page.locator(`#b${correct}`).click();
  const resolved = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(resolved.mode).toBe('feedback');
  expect(resolved.plays).toBe(before.plays + 1);
  expect(resolved.outcomeCommitted).toBe(true);
  expect(resolved.learning.resolved).toBe(1);
  expect(resolved.correctAnswers).toBe(before.questionGrading === 'noStakes' ? 0 : 1);
});

test('second miss blocks football until Continue and applies one modest setback', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?boot=defense-call');
  await page.locator('#call-grid .call-btn').first().click();
  await page.evaluate(() => { state.questionGrading = 'gate'; });
  const before = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

  const firstWrong = await answerIndex(page, 'wrong');
  await page.locator(`#b${firstWrong}`).click();
  const secondWrong = await answerIndex(page, 'wrong', [firstWrong]);
  await page.locator(`#b${secondWrong}`).click();

  const explanation = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(explanation.mode).toBe('explanation');
  expect(explanation.continueRequired).toBe(true);
  expect(explanation.outcomeCommitted).toBe(false);
  expect(explanation.plays).toBe(before.plays);
  expect(explanation.absoluteYard).toBe(before.absoluteYard);
  await expect(page.locator('#question-continue')).toBeVisible();
  await expect(page.locator('#question-continue')).toBeFocused();
  await page.waitForTimeout(500);
  expect(JSON.parse(await page.evaluate(() => window.render_game_to_text())).plays).toBe(before.plays);

  await page.locator('#question-continue').click();
  const resolved = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(resolved.mode).toBe('feedback');
  expect(resolved.outcomeCommitted).toBe(true);
  expect(resolved.plays).toBe(before.plays + 1);
  expect(resolved.gain).toBeLessThanOrEqual(3);
  expect(Math.abs(resolved.absoluteYard - before.absoluteYard)).toBeLessThanOrEqual(3);
  expect(resolved.learning.resolved).toBe(1);
});

test('all three visual model families render without mutating field state', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?boot=offense-call');
  const startYard = JSON.parse(await page.evaluate(() => window.render_game_to_text())).absoluteYard;
  const models = [
    { id: 'hops-test', q: 'Where do you land?', correct: 7, choices: [6, 7, 8, 9], hint: 'Hop.', explain: '3 + 4 = 7.', math: { type: 'hops', start: 3, delta: 4, target: 7, support: 'guided', displayMin: 3, displayMax: 7, ariaLabel: 'Hop from 3 to 7' } },
    { id: 'base-ten-test', q: 'How many tens?', correct: 4, choices: [3, 4, 5, 6], hint: 'Count tens.', explain: '42 has 4 tens.', math: { type: 'base-ten', tens: 4, ones: 2, target: 42, support: 'guided', displayMin: 2, displayMax: 42, ariaLabel: '42 as 4 tens and 2 ones' } },
    { id: 'compare-test', q: 'Choose the sign.', correct: '>', choices: ['<', '=', '>'], choiceType: 'category', hint: 'Compare tens.', explain: '54 > 49.', grading: 'noStakes', math: { type: 'comparison', left: 54, right: 49, target: '>', support: 'guided', displayMin: 49, displayMax: 54, ariaLabel: 'Compare 54 and 49' } },
  ];

  for (const model of models) {
    await page.evaluate(question => window.__footballTest.forceQuestion(question), model);
    await expect(page.locator('#math-overlay')).toBeVisible();
    await expect(page.locator('#math-overlay')).toHaveAttribute('data-type', model.math.type);
    expect(JSON.parse(await page.evaluate(() => window.render_game_to_text())).absoluteYard).toBe(startYard);
  }
});

test('supported preview never changes graded accuracy or applies a setback', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?boot=offense-call');
  await page.evaluate(() => window.__footballTest.forceQuestion({
    id: 'preview-test',
    skill: 'two-digit-comparison',
    purpose: 'currentSupported',
    grading: 'noStakes',
    tier: 'supported-comparison',
    q: 'Which sign is true? 54 ? 49',
    correct: '>',
    choices: ['<', '=', '>'],
    choiceType: 'category',
    hint: 'Compare tens first.',
    explain: '54 > 49.',
    math: { type: 'comparison', left: 54, right: 49, target: '>', support: 'guided', displayMin: 49, displayMax: 54, ariaLabel: 'Compare 54 and 49' },
  }));
  const before = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.locator('#b0').click();
  await page.locator('#b1').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');
  await page.locator('#question-continue').click();
  const after = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(after.plays).toBe(before.plays + 1);
  expect(after.absoluteYard).toBe(before.absoluteYard);
  expect(after.gradedQuestions).toBe(0);
  expect(after.correctAnswers).toBe(0);
});
