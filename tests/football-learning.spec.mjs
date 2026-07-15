import { test, expect } from '@playwright/test';

function primaryOnly(testInfo) {
  test.skip(testInfo.project.name !== 'ipad-11-landscape', 'Learning contract checks run once on the primary target.');
}

async function rendered(page) {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}

async function contracts(page) {
  return page.evaluate(() => window.__footballTest.activeContracts());
}

async function answerChoice(page, choiceId) {
  const result = await page.evaluate((id) => window.__footballTest.answerChoice(id), choiceId);
  expect(result).not.toBe(false);
  return result;
}

async function seedDrive(page, possession = 'offense', overrides = {}) {
  const direction = possession === 'offense' ? 1 : -1;
  const yardLine = overrides.yardLine ?? (direction === 1 ? 30 : 70);
  const yardsToGo = overrides.yardsToGo ?? 10;
  const driveStart = overrides.driveStart ?? (direction === 1 ? 20 : 80);
  return page.evaluate((drive) => window.__footballTest.seedDriveState(drive), {
    possession,
    direction,
    quarter: overrides.quarter ?? 2,
    down: overrides.down ?? 2,
    yardsToGo,
    yardLine,
    firstDownLine: overrides.firstDownLine ?? yardLine + (direction * yardsToGo),
    driveStart,
    scores: overrides.scores ?? { player: 7, opponent: 0 },
    plays: overrides.plays ?? 4,
    drivePlays: overrides.drivePlays ?? 1,
  });
}

async function beginSnap(page, possession = 'offense', overrides = {}) {
  await seedDrive(page, possession, overrides);
  await page.locator('#call-grid .call-btn').first().click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  const active = await contracts(page);
  expect(active.activeSnap).not.toBeNull();
  expect(active.questionInstance).not.toBeNull();
  expect(active.pendingResolution).toEqual({
    schemaVersion: 1,
    policy: 'awaitingAnswer',
    contextId: active.activeSnap.contextId,
    questionInstanceId: active.questionInstance.questionInstanceId,
    transitionToCommit: null,
  });
  return active;
}

function wrongChoiceIds(question) {
  return question.choices
    .filter((choice) => choice.id !== question.correctChoiceId)
    .map((choice) => choice.id);
}

test('runtime keeps factual page-145 completion with a separate page-179 question ceiling', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?boot=offense-call');

  const result = await page.evaluate(async () => {
    const progress = await fetch('./curriculum-progress.json').then((response) => response.json());
    const profile = window.__footballTest.learningProfile();
    const entries = [
      {
        id: 'recent-family', familyId: 'recent-family', skill: 'difference', concept: 'line-to-gain',
        purpose: 'weakSpot', grading: 'gate', weight: 1,
      },
      {
        id: 'fresh-family', familyId: 'fresh-family', skill: 'difference', concept: 'line-to-gain',
        purpose: 'weakSpot', grading: 'gate', weight: 1,
      },
    ];
    const session = FOOTBALL_LEARNING.createSession();
    session.recentFamilyIds.push('recent-family');
    const counts = { 'recent-family': 0, 'fresh-family': 0 };
    for (let index = 0; index < 2000; index++) {
      const draw = (index + 0.5) / 2000;
      counts[FOOTBALL_LEARNING.weightedPick(entries, session, () => draw).familyId]++;
    }
    const onlyRecent = FOOTBALL_LEARNING.weightedPick([entries[0]], session, () => 0.999999).familyId;
    return { progress, profile, counts, onlyRecent };
  });

  expect(result.profile.schemaVersion).toBe(2);
  expect(result.profile.completedThroughPage).toBe(145);
  expect(result.profile.completedThroughPage).toBe(result.progress.learner.completedThroughPage);
  expect(result.profile.includedThroughPage).toBe(179);
  expect(result.profile.includedThroughPage).toBe(result.progress.footballQuestionPlan.includedThroughPage);
  expect(result.profile.computationMax).toBe(10);
  expect(result.profile.displayMax).toBe(120);
  expect(result.profile.recencyWindow).toBe(3);
  expect(result.profile.recencyMultiplier).toBeGreaterThan(0);
  expect(result.profile.recencyMultiplier).toBeLessThan(1);
  expect(result.profile.masteryMinResolved).toBe(4);
  expect(result.profile.masteryMinFirstTryRate).toBe(0.8);
  expect(result.profile.masteryMaxSecondMissRate).toBe(0.1);
  expect(result.profile.freshMasteryMultiplier).toBe(0.25);
  expect(result.profile.masteryRestoreDays).toBe(30);
  expect(result.profile.recentSupportMultiplier).toBe(1.25);
  expect(result.profile.purposeWeights).toEqual({
    weakSpot: 0.38,
    coreReview: 0.32,
    completedPlaceValue: 0.30,
    approvedExtension: 0.18,
  });
  expect(result.profile.purposeWeights).not.toHaveProperty('currentSupported');
  expect(result.counts['recent-family']).toBeGreaterThan(0);
  expect(result.counts['fresh-family']).toBeGreaterThan(result.counts['recent-family']);
  expect(result.onlyRecent).toBe('recent-family');
});

test('mastered concepts age back into refreshers while the latest supported result takes priority', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?boot=offense-call');

  const result = await page.evaluate(() => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const nowMs = Date.parse('2026-07-14T12:00:00.000Z');
    const entry = {
      id: 'adaptive-family', familyId: 'adaptive-family', skill: 'difference',
      concept: 'adaptive-concept', purpose: 'weakSpot', grading: 'gate', weight: 1,
    };
    const question = { ...entry, contextId: 1, questionInstanceId: 1 };
    const mastery = (firstTryCorrect, retryCorrect = 0, secondMiss = 0) => ({
      'adaptive-concept': { firstTryCorrect, retryCorrect, secondMiss },
    });
    const latest = (resolution, ageDays) => ({
      'adaptive-concept': {
        completedAt: new Date(nowMs - (ageDays * DAY_MS)).toISOString(),
        resolution,
      },
    });
    const multiplier = (historicalMastery, historicalLatest, ageNow = nowMs) => {
      const session = FOOTBALL_LEARNING.createSession(historicalMastery, historicalLatest, ageNow);
      return FOOTBALL_LEARNING.adaptiveNeedMultiplier(session, entry);
    };

    const mastered = mastery(4);
    const boundaryMastered = mastery(8, 1, 1);
    const supportedSession = FOOTBALL_LEARNING.createSession(mastered, latest('firstTryCorrect', 0), nowMs);
    FOOTBALL_LEARNING.recordResolved(supportedSession, question, 'retryCorrect', { support: 'guided' });
    const afterSupport = FOOTBALL_LEARNING.adaptiveNeedMultiplier(supportedSession, entry);
    FOOTBALL_LEARNING.recordResolved(supportedSession, question, 'firstTryCorrect', { support: 'none' });
    const afterLaterFirstTry = FOOTBALL_LEARNING.adaptiveNeedMultiplier(supportedSession, entry);

    const noStakesEntry = { ...entry, grading: 'noStakes' };
    const noStakesSession = FOOTBALL_LEARNING.createSession(mastered, latest('firstTryCorrect', 0), nowMs);
    const reachableSession = FOOTBALL_LEARNING.createSession(mastered, latest('firstTryCorrect', 0), nowMs);
    reachableSession.recentFamilyIds.push(entry.familyId);
    const reachableEntries = [entry, {
      ...entry, id: 'fresh-other-family', familyId: 'fresh-other-family', concept: 'fresh-other-concept',
    }];
    const reachableCounts = { 'adaptive-family': 0, 'fresh-other-family': 0 };
    for (let index = 0; index < 2000; index++) {
      const selected = FOOTBALL_LEARNING.weightedPick(
        reachableEntries,
        reachableSession,
        () => (index + 0.5) / 2000,
      );
      reachableCounts[selected.familyId]++;
    }

    return {
      minimumFresh: multiplier(mastered, latest('firstTryCorrect', 0)),
      exactRateFresh: multiplier(boundaryMastered, latest('firstTryCorrect', 0)),
      fifteenDays: multiplier(mastered, latest('firstTryCorrect', 15)),
      thirtyDays: multiplier(mastered, latest('firstTryCorrect', 30)),
      olderThanWindow: multiplier(mastered, latest('firstTryCorrect', 45)),
      futureTimestamp: multiplier(mastered, latest('firstTryCorrect', -2)),
      tooFewResults: multiplier(mastery(3), latest('firstTryCorrect', 0)),
      belowFirstTryRate: multiplier(mastery(7, 2, 1), latest('firstTryCorrect', 0)),
      aboveSecondMissRate: multiplier(mastery(8, 0, 2), latest('firstTryCorrect', 0)),
      latestRetry: multiplier(mastered, latest('retryCorrect', 1)),
      latestSecondMiss: multiplier(mastered, latest('secondMiss', 1)),
      missingLatest: multiplier(mastered, {}),
      invalidLatest: multiplier(mastered, {
        'adaptive-concept': { completedAt: 'not-a-date', resolution: 'firstTryCorrect' },
      }),
      afterSupport,
      afterLaterFirstTry,
      noStakes: FOOTBALL_LEARNING.adaptiveNeedMultiplier(noStakesSession, noStakesEntry),
      sessionLatest: supportedSession.latestResolvedByConcept,
      reachableCounts,
    };
  });

  expect(result.minimumFresh).toBeCloseTo(0.25, 8);
  expect(result.exactRateFresh).toBeCloseTo(0.25, 8);
  expect(result.fifteenDays).toBeCloseTo(0.625, 8);
  expect(result.thirtyDays).toBeCloseTo(1, 8);
  expect(result.olderThanWindow).toBeCloseTo(1, 8);
  expect(result.futureTimestamp).toBeCloseTo(0.25, 8);
  expect(result.tooFewResults).toBeCloseTo(1, 8);
  expect(result.belowFirstTryRate).toBeCloseTo(1.075, 8);
  expect(result.aboveSecondMissRate).toBeCloseTo(1.05, 8);
  expect(result.latestRetry).toBeCloseTo(1.25, 8);
  expect(result.latestSecondMiss).toBeCloseTo(1.25, 8);
  expect(result.missingLatest).toBeCloseTo(1, 8);
  expect(result.invalidLatest).toBeCloseTo(1, 8);
  expect(result.afterSupport).toBeCloseTo(2.125, 8);
  expect(result.afterLaterFirstTry).toBeCloseTo(0.25, 8);
  expect(result.noStakes).toBe(1);
  expect(result.sessionLatest).toEqual({ 'adaptive-concept': { resolution: 'firstTryCorrect' } });
  expect(result.reachableCounts['adaptive-family']).toBeGreaterThan(0);
  expect(result.reachableCounts['fresh-other-family']).toBeGreaterThan(result.reachableCounts['adaptive-family']);
});

test('adaptation and schema-v2 learning events retain grounded question identity', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?boot=offense-call');

  const result = await page.evaluate(() => {
    const context = FOOTBALL_DOMAIN.normalizeContext({
      contextId: 77,
      possession: 'offense', direction: 1, quarter: 2, down: 2,
      yardsToGo: 10, yardLine: 30, firstDownLine: 40, driveStart: 27,
      scores: { player: 3, opponent: 4 }, plays: 5, drivePlays: 1,
      calls: { offense: 'shortRun', defense: null, matchup: null },
    });
    const snap = FOOTBALL_DOMAIN.createSnap(context, { gain: 4, callKey: 'shortRun' });
    const built = FOOTBALL_CONTEXTUAL_QUESTIONS.build(snap, 'line-to-gain-missing-part', {
      support: 'initial', presentationRng: () => 0.25,
    });
    const question = {
      ...built,
      contextId: snap.contextId,
      questionInstanceId: 19,
    };
    const session = FOOTBALL_LEARNING.createSession({
      'line-to-gain': { firstTryCorrect: 0, retryCorrect: 0, secondMiss: 3 },
    });
    const wrong = question.choices.find((choice) => choice.id !== question.correctChoiceId);
    FOOTBALL_LEARNING.recordPresented(session, question);
    FOOTBALL_LEARNING.recordAttempt(session, question, {
      attempt: 1, selectedChoiceId: wrong.id, correct: false, support: 'initial',
    });
    FOOTBALL_LEARNING.recordResolved(session, question, 'retryCorrect', { support: 'guided' });

    const entries = [
      {
        id: 'needs-practice', familyId: 'needs-practice', skill: 'difference',
        concept: 'line-to-gain', purpose: 'weakSpot', grading: 'gate', weight: 1,
      },
      {
        id: 'other-concept', familyId: 'other-concept', skill: 'difference',
        concept: 'field-distance', purpose: 'weakSpot', grading: 'gate', weight: 1,
      },
    ];
    const beforeThreshold = FOOTBALL_LEARNING.createSession({
      'line-to-gain': { firstTryCorrect: 0, retryCorrect: 0, secondMiss: 2 },
    });
    return {
      session,
      atThree: FOOTBALL_LEARNING.weightedPick(entries, session, () => 0.51).familyId,
      beforeThree: FOOTBALL_LEARNING.weightedPick(entries, beforeThreshold, () => 0.51).familyId,
      supportAfterPractice: FOOTBALL_LEARNING.supportFor({
        bySkill: { difference: { firstTryCorrect: 0, retryCorrect: 1, secondMiss: 1 } },
      }, 'difference', 'initial'),
      supportAfterGuidedMiss: FOOTBALL_LEARNING.nextSupport('guided'),
    };
  });

  expect(result.session.byConcept).toEqual({
    'line-to-gain': { resolved: 1, firstTryCorrect: 0, retryCorrect: 1, secondMiss: 0 },
  });
  expect(result.session.historicalMastery['line-to-gain']).toEqual({
    resolved: 3, firstTryCorrect: 0, retryCorrect: 0, secondMiss: 3,
  });
  expect(result.session.recentFamilyIds).toEqual(['line-to-gain-missing-part']);
  expect(result.session.events.map((event) => event.type)).toEqual(['presented', 'attempt', 'resolved']);
  for (const event of result.session.events) {
    expect(event.schemaVersion).toBe(2);
    expect(event.familyId).toBe('line-to-gain-missing-part');
    expect(event.contextId).toBe(77);
    expect(event.questionInstanceId).toBe(19);
    expect(event.bindings.length).toBeGreaterThan(0);
    expect(event).not.toHaveProperty('possession');
    expect(event).not.toHaveProperty('call');
  }
  expect(result.session.events[1].selectedChoiceId).toMatch(/^line-to-gain-missing-part--choice-/);
  expect(result.atThree).toBe('needs-practice');
  expect(result.beforeThree).toBe('other-concept');
  expect(result.supportAfterPractice).toBe('guided');
  expect(result.supportAfterGuidedMiss).toBe('guided');
});

test('first miss keeps one frozen question and retry correct commits the full proposed offense play once', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?boot=offense-call');
  await page.evaluate(() => {
    window.__learningEvents = [];
    window.addEventListener('football:learning', (event) => window.__learningEvents.push(event.detail));
    window.__footballTest.setRootSeed(0x54c0de);
  });

  const beforeContracts = await beginSnap(page, 'offense');
  const before = await rendered(page);
  const question = beforeContracts.questionInstance;
  const wrongId = wrongChoiceIds(question)[0];

  await answerChoice(page, wrongId);
  const retryContracts = await contracts(page);
  const retry = await rendered(page);

  expect(retry.mode).toBe('question');
  expect(retryContracts.questionInstance).toEqual(question);
  expect(retryContracts.questionUi.attempt).toBe(2);
  expect(retryContracts.questionUi.missedChoiceIds).toEqual([wrongId]);
  expect(retry.plays).toBe(before.plays);
  expect(retry.absoluteYard).toBe(before.absoluteYard);
  expect(retry.outcomeCommitted).toBe(false);
  await expect(page.locator(`[data-choice-id="${wrongId}"]`)).toBeDisabled();
  await expect(page.locator('#feedback')).toContainText(/Good try/i);

  await answerChoice(page, question.correctChoiceId);
  const resolvedContracts = await contracts(page);
  const resolved = await rendered(page);
  const expectedYard = beforeContracts.activeSnap.proposal.endYardLine;

  expect(resolved.mode).toBe('feedback');
  expect(resolved.plays).toBe(before.plays + 1);
  expect(resolved.absoluteYard).toBe(expectedYard);
  expect(resolved.outcomeCommitted).toBe(true);
  expect(resolved.learning.resolved).toBe(1);
  expect(resolved.correctAnswers).toBe(before.correctAnswers + 1);
  expect(resolvedContracts.questionUi.outcomeCommitted).toBe(true);

  const events = await page.evaluate(() => window.__learningEvents);
  expect(events.map((event) => event.type)).toEqual(['presented', 'attempt', 'attempt', 'resolved']);
  expect(events.every((event) => event.schemaVersion === 2)).toBe(true);
  expect(events.every((event) => event.familyId === question.familyId)).toBe(true);
  expect(events.every((event) => event.contextId === question.contextId)).toBe(true);
  expect(events.every((event) => event.questionInstanceId === question.questionInstanceId)).toBe(true);
  expect(events[1].selectedChoiceId).toBe(wrongId);
  expect(events[2].selectedChoiceId).toBe(question.correctChoiceId);
  expect(events[3].result).toBe('retryCorrect');
  expect(events.every((event) => Array.isArray(event.bindings) && event.bindings.length > 0)).toBe(true);
});

test('a question that starts guided stays answer-hidden until the second miss', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?boot=offense-call');
  await page.evaluate(() => window.__footballTest.setRootSeed(1));

  const beforeContracts = await beginSnap(page, 'offense');
  const question = beforeContracts.questionInstance;
  expect(question.answerExposure).not.toBe('source-visible');

  await page.evaluate(() => {
    state.questionUi.support = 'guided';
    syncQuestionMirrors();
    renderMathVisual();
  });
  const guidedBefore = await rendered(page);
  expect(guidedBefore.math.support).toBe('guided');
  expect(guidedBefore.math.revealsAnswer).toBe(false);
  expect(guidedBefore.math.result).toBeNull();

  await answerChoice(page, wrongChoiceIds(question)[0]);

  const retryContracts = await contracts(page);
  const retry = await rendered(page);
  expect(retry.mode).toBe('question');
  expect(retry.retryAvailable).toBe(true);
  expect(retryContracts.questionInstance.questionInstanceId).toBe(question.questionInstanceId);
  expect(retryContracts.questionUi.support).toBe('guided');
  expect(retry.math.support).toBe('guided');
  expect(retry.math.revealsAnswer).toBe(false);
  expect(retry.math.result).toBeNull();
  await expect(page.locator(`[data-choice-id="${question.correctChoiceId}"]`)).toBeEnabled();
});

test('second defensive miss records learning only after Continue commits one frozen capped transition', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?boot=defense-call');
  await page.evaluate(() => window.__footballTest.setRootSeed(0xdefe115e));

  const beforeContracts = await beginSnap(page, 'defense');
  const before = await rendered(page);
  const question = beforeContracts.questionInstance;
  const wrongIds = wrongChoiceIds(question);
  expect(wrongIds.length).toBeGreaterThanOrEqual(2);

  await answerChoice(page, wrongIds[0]);
  await answerChoice(page, wrongIds[1]);

  const explanationContracts = await contracts(page);
  const explanation = await rendered(page);
  const proposedGain = beforeContracts.activeSnap.proposal.appliedGain;
  const expectedGain = Math.min(proposedGain, 3);

  expect(explanation.mode).toBe('explanation');
  expect(explanation.continueRequired).toBe(true);
  expect(explanation.outcomeCommitted).toBe(false);
  expect(explanation.plays).toBe(before.plays);
  expect(explanation.absoluteYard).toBe(before.absoluteYard);
  expect(explanation.learning.resolved).toBe(0);
  expect(explanation.gradedQuestions).toBe(before.gradedQuestions);
  expect(explanationContracts.questionUi.support).toBe('worked');
  expect(explanationContracts.questionUi.resolutionRecorded).toBe(false);
  expect(explanationContracts.pendingResolution.transitionToCommit.appliedGain).toBe(expectedGain);
  expect(await page.evaluate(() => pendingStatsPlay.resolution)).toBeNull();
  expect(explanationContracts.statsSession.completedPlays).toHaveLength(0);
  await expect(page.locator('#question-continue')).toBeVisible();
  await expect(page.locator('#question-continue')).toBeFocused();

  await page.locator('#question-continue').click();
  const committed = await rendered(page);
  expect(committed.mode).toBe('feedback');
  expect(committed.outcomeCommitted).toBe(true);
  expect(committed.plays).toBe(before.plays + 1);
  expect(Math.abs(committed.absoluteYard - before.absoluteYard)).toBe(expectedGain);
  expect(committed.learning.resolved).toBe(1);
  expect(committed.gradedQuestions).toBe(before.gradedQuestions + 1);

  await page.evaluate(() => document.getElementById('question-continue').click());
  const afterDoubleContinue = await rendered(page);
  expect(afterDoubleContinue.plays).toBe(committed.plays);
  expect(afterDoubleContinue.absoluteYard).toBe(committed.absoluteYard);
  expect(afterDoubleContinue.learning.resolved).toBe(1);
});

test('a production snap exposes only approved, grounded, graded contextual content', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?boot=offense-call');
  await page.evaluate(() => window.__footballTest.setRootSeed(0xc011ab1e));
  const active = await beginSnap(page, 'offense', {
    quarter: 4, down: 4, yardsToGo: 7, yardLine: 43, firstDownLine: 50,
    driveStart: 40, scores: { player: 7, opponent: 7 },
  });
  const question = active.questionInstance;

  expect(question.id).toBe(question.familyId);
  expect(question.grading).toBe('gate');
  expect(['workbook', 'football-only']).toContain(question.curriculumSource);
  if (question.curriculumSource === 'workbook') {
    expect(question.introducedOnPage).toBeGreaterThanOrEqual(1);
    expect(question.introducedOnPage).toBeLessThanOrEqual(179);
  } else {
    expect(question.introducedOnPage).toBeNull();
  }
  expect(question.familyId).not.toMatch(/preview|clock|calendar|am-pm|sack|loss|trivia|add-within-10/i);
  expect(question.bindings).toEqual(question.premises);
  expect(question.bindings.length).toBeGreaterThan(0);
  expect(question.choices.filter((choice) => choice.id === question.correctChoiceId)).toHaveLength(1);
  expect(new Set(question.choices.map((choice) => choice.id)).size).toBe(question.choices.length);
  expect(['source-visible', 'modeled-with-result-hidden', 'hidden-until-worked']).toContain(question.answerExposure);
  expect(question.visuals.initial.ariaLabel).toBeTruthy();
  expect(question.visuals.guided.ariaLabel).toBeTruthy();
  expect(question.visuals.worked.ariaLabel).toBeTruthy();
  if (question.answerExposure !== 'source-visible') {
    expect(question.visuals.initial.result).toBeNull();
    expect(question.visuals.guided.result).toBeNull();
  }
  const curriculumAhead = question.curriculumSource === 'workbook'
    && question.introducedOnPage > 145;
  expect(active.questionUi.support).toBe(curriculumAhead ? 'guided' : 'initial');
  if (curriculumAhead) {
    await expect(page.locator('#feedback')).toContainText(question.hint.text);
  }

  const text = await rendered(page);
  expect(text.questionFamilyId ?? text.questionId).toBe(question.familyId);
  expect(text.contextId).toBe(question.contextId);
  expect(text.questionInstanceId).toBe(question.questionInstanceId);
});

test('Coach Report uses this game\'s real contextual resolution, not historical mastery', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.addInitScript(() => {
    localStorage.setItem('footballMathStats:v1', JSON.stringify({
      schemaVersion: 1,
      aggregates: {},
      recentPlays: [],
      mastery: {
        addition: { resolved: 8, firstTryCorrect: 8, retryCorrect: 0, secondMiss: 0 },
      },
    }));
  });
  await page.goto('/football/?boot=offense-call');
  await page.evaluate(() => window.__footballTest.setRootSeed(0xc0ac4));

  expect(await page.evaluate(() => window.__footballTest.learningState().historicalMastery.addition))
    .toEqual({ resolved: 8, firstTryCorrect: 8, retryCorrect: 0, secondMiss: 0 });
  expect(await page.evaluate(() => window.__footballTest.coachReport())).toEqual([
    { label: 'Learning today', value: 'Keep playing to build your learning recap' },
  ]);

  const active = await beginSnap(page, 'offense');
  await answerChoice(page, active.questionInstance.correctChoiceId);
  const learning = await page.evaluate(() => window.__footballTest.learningState());
  const report = await page.evaluate(() => window.__footballTest.coachReport());

  expect(Object.keys(learning.byConcept)).toEqual([active.questionInstance.concept]);
  expect(learning.byConcept[active.questionInstance.concept]).toEqual({
    resolved: 1, firstTryCorrect: 1, retryCorrect: 0, secondMiss: 0,
  });
  expect(report[0].label).toBe('Strong today');
  expect(report.map((row) => row.value)).not.toContain('Adding within 10');
  expect(report.every((row) => row.value !== 'Football math')).toBe(true);
});
