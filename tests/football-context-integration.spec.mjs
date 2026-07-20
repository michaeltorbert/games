import { test, expect } from '@playwright/test';

function primaryOnly(testInfo) {
  test.skip(
    testInfo.project.name !== 'ipad-11-landscape',
    'Contextual football integration checks run once on the primary target.',
  );
}

const OFFENSE_SEED = Object.freeze({
  possession: 'offense',
  direction: 1,
  quarter: 2,
  down: 2,
  yardsToGo: 8,
  yardLine: 30,
  firstDownLine: 38,
  driveStart: 20,
  scores: { player: 7, opponent: 7 },
  totalYards: { player: 83, opponent: 71 },
  plays: 4,
  drivePlays: 2,
});

const DEFENSE_SEED = Object.freeze({
  possession: 'defense',
  direction: -1,
  quarter: 3,
  down: 2,
  yardsToGo: 10,
  yardLine: 70,
  firstDownLine: 60,
  driveStart: 80,
  scores: { player: 14, opponent: 7 },
  totalYards: { player: 83, opponent: 71 },
  plays: 9,
  drivePlays: 2,
});

async function cleanBoot(page, seed = 0x54c0de) {
  await page.addInitScript(() => {
    try { window.localStorage.removeItem('footballMathStats:v1'); } catch (error) {}
  });
  await page.goto('/football/?boot=offense-call');
  await page.evaluate((rootSeed) => {
    window.__footballTest.setQuestionFault(null);
    window.__footballTest.setRootSeed(rootSeed);
  }, seed);
}

async function seedDrive(page, overrides) {
  return page.evaluate((value) => window.__footballTest.seedDriveState(value), overrides);
}

async function chooseCall(page, label) {
  const button = page.locator('#call-grid .call-btn').filter({ hasText: label }).first();
  await expect(button).toBeVisible();
  await button.click();
}

async function activeContracts(page) {
  return page.evaluate(() => window.__footballTest.activeContracts());
}

async function answerChoice(page, choiceId) {
  return page.evaluate((id) => window.__footballTest.answerChoice(id), choiceId);
}

async function beginSpecialPlay(page, playType, possession, fault = null) {
  await page.evaluate(({ type, side, faultMode }) => {
    window.__footballTest.setQuestionFault(faultMode);
    const reverse = side === 'defense';
    const seed = type === 'fieldGoal'
      ? { yardLine: reverse ? 40 : 60, yardsToGo: 2 }
      : type === 'punt'
        ? { yardLine: reverse ? 80 : 50, yardsToGo: 10 }
        : { yardLine: reverse ? 80 : 20, yardsToGo: 10 };
    window.__footballTest.seedDriveState({
      possession: side,
      direction: reverse ? -1 : 1,
      quarter: 1,
      quarterPossessions: 0,
      down: type === 'conversion' ? 1 : 4,
      yardsToGo: seed.yardsToGo,
      yardLine: seed.yardLine,
      firstDownLine: seed.yardLine + (reverse ? -seed.yardsToGo : seed.yardsToGo),
      driveStart: reverse ? 80 : 20,
      scores: { player: 0, opponent: 0 },
      totalYards: { player: 0, opponent: 0 },
      plays: 0,
      drivePlays: 0,
    });
    if (type === 'conversion') showConversionDecision();
  }, { type: playType, side: possession, faultMode: fault });
  if (possession === 'offense') {
    const action = playType === 'conversion' ? 'pat' : playType;
    await page.locator(`#decision-grid .decision-btn[data-action="${action}"]`).click();
  }
  return activeContracts(page);
}

async function resolveSpecialPolicy(page, policy) {
  if (policy === 'questionBypass') return activeContracts(page);
  const before = await activeContracts(page);
  const wrongIds = before.questionInstance.choices
    .filter(choice => choice.id !== before.questionInstance.correctChoiceId)
    .map(choice => choice.id);
  if (policy === 'firstTryCorrect') return answerChoice(page, before.questionInstance.correctChoiceId);
  if (policy === 'retryCorrect') {
    await answerChoice(page, wrongIds[0]);
    return answerChoice(page, before.questionInstance.correctChoiceId);
  }
  await answerChoice(page, wrongIds[0]);
  await answerChoice(page, wrongIds[1]);
  await page.locator('#question-continue').click();
  return activeContracts(page);
}

function readPointer(root, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) return undefined;
  return pointer.slice(1).split('/').reduce((value, rawToken) => {
    if (value == null) return undefined;
    const token = rawToken.replace(/~1/g, '/').replace(/~0/g, '~');
    return value[token];
  }, root);
}

function assertQuestionGrounding(contracts, rules) {
  const snap = contracts.activeSnap;
  const question = contracts.questionInstance;

  expect(snap).toBeTruthy();
  expect(question).toBeTruthy();
  expect(question.contextId).toBe(snap.contextId);
  expect(question.familyId).toBe(question.id);
  expect(question.questionInstanceId).toEqual(expect.any(String));
  expect(question.questionInstanceId.length).toBeGreaterThan(0);

  const choiceIds = question.choices.map((choice) => choice.id);
  expect(new Set(choiceIds).size).toBe(choiceIds.length);
  expect(choiceIds.filter((id) => id === question.correctChoiceId)).toHaveLength(1);
  for (const choice of question.choices) {
    expect(choice).toEqual(expect.objectContaining({
      id: expect.any(String),
      value: expect.anything(),
      label: expect.any(String),
      ariaLabel: expect.any(String),
    }));
  }

  expect(question.bindings).toEqual(question.premises);
  const bindingIds = new Set(question.bindings.map((binding) => binding.id));
  for (const operandId of question.operation.operandIds) expect(bindingIds.has(operandId)).toBe(true);
  for (const binding of question.bindings) {
    const dereferenced = binding.source.kind === 'context'
      ? readPointer(snap, binding.source.path)
      : rules[binding.source.ruleId];
    expect(dereferenced, `binding ${binding.id} must dereference to its snap or football rule`)
      .toEqual(binding.value);
  }
}

async function missTwice(page, contracts) {
  const question = contracts.questionInstance;
  const wrongIds = question.choices
    .map((choice) => choice.id)
    .filter((choiceId) => choiceId !== question.correctChoiceId);
  expect(wrongIds.length).toBeGreaterThanOrEqual(2);
  const afterFirst = await answerChoice(page, wrongIds[0]);
  expect(afterFirst.render.mode).toBe('question');
  return answerChoice(page, wrongIds[1]);
}

async function continueAndRetryCommitSynchronously(page) {
  return page.evaluate(() => {
    let resultCount = 0;
    const countResult = () => { resultCount++; };
    window.addEventListener('football:result', countResult);
    const button = document.getElementById('question-continue');
    button.click();
    const duplicateCommit = commitPendingResolution();
    window.removeEventListener('football:result', countResult);
    return {
      duplicateCommit,
      resultCount,
      contracts: window.__footballTest.activeContracts(),
    };
  });
}

test('presented questions carry linked IDs, grounded bindings, and structured stable choices', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page);
  const rules = await page.evaluate(() => JSON.parse(JSON.stringify(FOOTBALL_CONTEXTUAL_QUESTIONS.RULES)));
  const cases = [
    { seed: OFFENSE_SEED, call: 'Short Run' },
    {
      seed: { ...OFFENSE_SEED, down: 3, yardsToGo: 7, yardLine: 48, firstDownLine: 55 },
      call: 'Medium Pass',
    },
    { seed: DEFENSE_SEED, call: 'Run Defense' },
    {
      seed: { ...DEFENSE_SEED, down: 3, yardsToGo: 6, yardLine: 46, firstDownLine: 40 },
      call: 'Deep Pass D',
    },
  ];
  const contextIds = new Set();
  const questionInstanceIds = new Set();

  for (const scenario of cases) {
    await seedDrive(page, scenario.seed);
    await chooseCall(page, scenario.call);
    const contracts = await activeContracts(page);
    assertQuestionGrounding(contracts, rules);
    contextIds.add(contracts.activeSnap.contextId);
    questionInstanceIds.add(contracts.questionInstance.questionInstanceId);
  }

  expect(contextIds.size).toBe(cases.length);
  expect(questionInstanceIds.size).toBe(cases.length);
});

test('approved past-100 team yards start visibly guided and commit the real total once', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x10054);
  const seeded = await seedDrive(page, {
    ...OFFENSE_SEED,
    totalYards: { player: 98, opponent: 71 },
  });

  const schedulerDraw = await page.evaluate(() => {
    const context = FOOTBALL_DOMAIN.normalizeContext({
      contextId: 'past-100-probe',
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
      if (FOOTBALL_LEARNING.weightedPick(entries, probeSession, () => candidate).familyId === 'team-yards-past-100') {
        draw = candidate;
        break;
      }
    }
    if (draw === null) throw new Error('Could not target team-yards-past-100 in the scheduler pool');
    window.__footballTest.setRngStreams({
      football: () => 0,
      scheduler: () => draw,
      presentation: () => 0.4,
    });
    return draw;
  });
  expect(schedulerDraw).not.toBeNull();

  await chooseCall(page, 'Short Run');
  const before = await activeContracts(page);
  expect(before.questionInstance.familyId).toBe('team-yards-past-100');
  expect(before.questionInstance.introducedOnPage).toBe(149);
  expect(before.questionUi.support).toBe('guided');
  expect(before.questionInstance.visuals.guided.result).toBeNull();
  await expect(page.locator('#feedback')).toContainText(before.questionInstance.hint.text);
  await expect(page.locator('#math-overlay')).toHaveAttribute('data-type', 'hundreds-move');
  await expect(page.locator('#math-overlay')).toContainText('98');
  await expect(page.locator('#math-overlay')).toContainText('99');
  await expect(page.locator('#math-overlay')).toContainText('?');
  await expect(page.locator('#math-overlay')).not.toContainText('100');

  const after = await answerChoice(page, before.questionInstance.correctChoiceId);
  expect(after.activeSnap.proposal.appliedGain).toBe(2);
  expect(after.render.totalYards).toEqual({ player: 100, opponent: 71 });
  expect(after.statsSession.completedPlays).toHaveLength(1);
  expect(after.statsSession.completedPlays[0].postPlay.totalYards).toEqual({ player: 100, opponent: 71 });
  expect(seeded.totalYards).toEqual({ player: 98, opponent: 71 });
});

test('next-down asks about the frozen play situation and commits the projected down once', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x790079);
  const seeded = await seedDrive(page, {
    ...OFFENSE_SEED,
    down: 2,
    yardsToGo: 7,
    yardLine: 30,
    firstDownLine: 37,
  });

  const schedulerDraw = await page.evaluate(() => {
    const context = FOOTBALL_DOMAIN.normalizeContext({
      contextId: 'next-down-probe',
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
    return draw;
  });
  expect(schedulerDraw).not.toBeNull();

  await chooseCall(page, 'Short Run');
  const before = await activeContracts(page);
  const question = before.questionInstance;
  expect(question.familyId).toBe('next-down');
  expect(question.concept).toBe('down-progression');
  expect(question.answer.value).toBe('3rd');
  expect(question.bindings.map((binding) => [binding.id, binding.source.path, binding.value])).toEqual([
    ['currentDown', '/context/down', 2],
    ['yardsToGo', '/context/yardsToGo', 7],
    ['proposedGain', '/proposal/appliedGain', 2],
    ['resultKind', '/proposal/resultKind', 'advance'],
    ['nextDown', '/proposal/newDown', 3],
  ]);
  assertQuestionGrounding(before, await page.evaluate(() => FOOTBALL_CONTEXTUAL_QUESTIONS.RULES));
  expect(question.visuals.initial.result).toBeNull();
  expect(question.visuals.guided.result).toBeNull();
  expect(question.visuals.worked.result.value).toBe('3rd');
  expect(question.prompt.text).toMatch(/2nd\s*&\s*7/i);
  expect(question.prompt.text).toMatch(/gains? 2 yards?/i);
  expect(question.prompt.text).toMatch(/what down would come next/i);
  expect(question.prompt.text).not.toMatch(/scoreboard (?:begins|starts) with|what down is it|ordinal|order number/i);
  await expect(page.locator('#math-overlay')).toHaveAttribute('data-type', 'down-progression');
  await expect(page.locator('#math-overlay')).toContainText('2ND & 7');
  await expect(page.locator('#math-overlay')).toContainText('PLAY +2');
  await expect(page.locator('#math-overlay')).toContainText('NEXT ?');
  await expect(page.locator('#math-overlay')).not.toContainText('NEXT 3RD');

  const correctChoice = question.choices.find((choice) => choice.id === question.correctChoiceId);
  expect(correctChoice.value).toBe('3rd');
  const after = await answerChoice(page, question.correctChoiceId);
  expect(after.render.down).toBe(3);
  expect(after.render.ytg).toBe(5);
  expect(after.render.plays).toBe(seeded.plays + 1);
  expect(after.learning.resolved).toBe(before.learning.resolved + 1);
  expect(after.statsSession.completedPlays).toHaveLength(1);
  expect(after.statsSession.completedPlays[0]).toMatchObject({
    instructionalStatus: 'presented',
    offeredYards: 2,
    actualYards: 2,
    links: {
      contextId: before.activeSnap.contextId,
      familyId: 'next-down',
      questionInstanceId: question.questionInstanceId,
    },
  });
});

test('pre-answer goal-distance place-value visuals hide the requested tens or ones count', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x10075);

  for (const distance of [11, 14, 20, 99]) {
    for (const familyId of ['goal-distance-tens', 'goal-distance-ones']) {
      const stages = await page.evaluate(({ id, requestedDistance }) => {
      const yardLine = 100 - requestedDistance;
      const yardsToGo = Math.min(10, requestedDistance);
      const snap = FOOTBALL_DOMAIN.createSnap({
        contextId: `answer-leak-${id}-${requestedDistance}`,
        match: state.match,
        possession: 'offense',
        direction: 1,
        quarter: 2,
        down: 2,
        yardsToGo,
        yardLine,
        firstDownLine: yardLine + yardsToGo,
        driveStart: Math.max(1, yardLine - 5),
        scores: { player: 7, opponent: 7 },
        totalYards: { player: 83, opponent: 71 },
        plays: 4,
        drivePlays: 2,
        calls: { offense: 'shortRun', defense: null, matchup: null },
        privateOpponentSnapshot: null,
      }, { gain: Math.min(3, requestedDistance), callKey: 'shortRun' });
      const built = FOOTBALL_CONTEXTUAL_QUESTIONS.build(snap, id, {
        support: 'initial',
        presentationRng: () => 0.5,
      });
      state.activeSnap = snap;
      state.questionInstance = FOOTBALL_DOMAIN.deepFreeze(FOOTBALL_DOMAIN.clone({
        ...built,
        contextId: snap.contextId,
        questionInstanceId: `answer-leak-${id}-${requestedDistance}`,
      }));
      state.questionUi = makeQuestionUiState();
      state.questionUi.support = 'initial';
      state.phase = 'question';
      syncQuestionMirrors();
      renderMathVisual();
      const initial = {
        text: document.getElementById('math-overlay').textContent,
        ariaLabel: document.getElementById('math-overlay').getAttribute('aria-label'),
      };
      state.questionUi.support = 'guided';
      syncQuestionMirrors();
      renderMathVisual();
      const guided = {
        text: document.getElementById('math-overlay').textContent,
        ariaLabel: document.getElementById('math-overlay').getAttribute('aria-label'),
      };
      state.questionUi.support = 'worked';
      syncQuestionMirrors();
      renderMathVisual();
      return {
        answer: built.answer.value,
        choices: built.choices.map((choice) => choice.value),
        distance: built.visuals.initial.data.distance,
        initial,
        guided,
        workedText: document.getElementById('math-overlay').textContent,
      };
    }, { id: familyId, requestedDistance: distance });

    const requestedLabel = familyId.endsWith('tens') ? 'TENS' : 'ONES';
    expect(stages.distance).toBe(distance);
    expect(stages.choices.every((choice) => Number.isInteger(choice) && choice >= 0 && choice <= 9)).toBe(true);
    expect(stages.initial.text).toContain(`? ${requestedLabel}`);
    const answerUnit = familyId.endsWith('tens')
      ? stages.answer === 1 ? 'TEN' : 'TENS'
      : stages.answer === 1 ? 'ONE' : 'ONES';
    expect(stages.initial.text).not.toContain(`${stages.answer} ${answerUnit}`);
    expect(stages.initial.text).not.toContain(`= ${distance}`);
    expect(stages.initial.ariaLabel).not.toMatch(new RegExp(`\\b${stages.answer}\\s+${answerUnit}s?\\b`, 'i'));
    expect(stages.guided.text).toContain(`? ${requestedLabel}`);
    expect(stages.guided.text).not.toContain(`${stages.answer} ${answerUnit}`);
    expect(stages.guided.text).not.toContain(`= ${distance}`);
    expect(stages.guided.ariaLabel).not.toMatch(new RegExp(`\\b${stages.answer}\\s+${answerUnit}s?\\b`, 'i'));
    const tens = Math.floor(distance / 10);
    const ones = distance % 10;
    expect(stages.workedText).toContain(`${tens} ${tens === 1 ? 'TEN' : 'TENS'}`);
    expect(stages.workedText).toContain(`${ones} ${ones === 1 ? 'ONE' : 'ONES'}`);
    expect(stages.workedText).toContain(`= ${distance}`);
    }
  }
});

test('field-goal distance visual renders only the bound kick-card distance', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x570023);

  for (const possession of ['offense', 'defense']) {
    const rendered = await page.evaluate((side) => {
      const direction = side === 'offense' ? 1 : -1;
      const yardLine = direction === 1 ? 60 : 40;
      window.__footballTest.seedDriveState({
        possession: side,
        direction,
        quarter: 2,
        quarterPossessions: 0,
        down: 4,
        yardsToGo: 2,
        yardLine,
        firstDownLine: yardLine + (direction * 2),
        driveStart: direction === 1 ? 20 : 80,
        scores: { player: 7, opponent: 7 },
        totalYards: { player: 83, opponent: 71 },
        plays: 4,
        drivePlays: 2,
      });
      const activePlay = makeFieldGoalActivePlay();
      const built = FOOTBALL_CONTEXTUAL_QUESTIONS.build(activePlay, 'field-goal-attempt-distance', {
        support: 'initial',
        presentationRng: () => 0.5,
      });
      const question = FOOTBALL_DOMAIN.deepFreeze(FOOTBALL_DOMAIN.clone({
        ...built,
        contextId: activePlay.contextId,
        questionInstanceId: `field-goal-distance-${side}`,
      }));
      activatePlayMirrors(activePlay, question);
      state.phase = 'question';
      syncQuestionMirrors();
      renderMathVisual();
      const overlay = document.getElementById('math-overlay');
      return {
        text: overlay.textContent,
        ariaLabel: overlay.getAttribute('aria-label'),
        visualData: question.visuals.initial.data,
      };
    }, possession);

    expect(rendered.visualData).toEqual({ attemptDistance: 57 });
    expect(rendered.text).toContain('57-YARD FIELD GOAL');
    expect(rendered.text).not.toContain('undefined');
    expect(rendered.text).not.toContain('TOWARD');
    expect(rendered.ariaLabel).toBe('Kick card says 57-yard field goal.');
  }
});

test('teen-score visuals use the real scoreboard 14 while hiding its requested place until worked', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x12114);

  for (const familyId of ['committed-score-tens', 'committed-score-ones']) {
    const stages = await page.evaluate((id) => {
      const snap = FOOTBALL_DOMAIN.createSnap({
        contextId: `teen-score-${id}`,
        match: state.match,
        possession: 'offense', direction: 1, quarter: 3, down: 2,
        yardsToGo: 6, yardLine: 34, firstDownLine: 40, driveStart: 27,
        scores: { player: 14, opponent: 7 },
        totalYards: { player: 83, opponent: 71 },
        plays: 4, drivePlays: 2,
        calls: { offense: 'shortRun', defense: null, matchup: null },
        privateOpponentSnapshot: null,
      }, { gain: 4, callKey: 'shortRun' });
      const built = FOOTBALL_CONTEXTUAL_QUESTIONS.build(snap, id, {
        support: 'initial', presentationRng: () => 0.5,
      });
      state.activeSnap = snap;
      state.questionInstance = FOOTBALL_DOMAIN.deepFreeze(FOOTBALL_DOMAIN.clone({
        ...built, contextId: snap.contextId, questionInstanceId: `teen-score-${id}`,
      }));
      state.questionUi = makeQuestionUiState();
      state.phase = 'question';
      const render = (support) => {
        state.questionUi.support = support;
        syncQuestionMirrors();
        renderMathVisual();
        return {
          text: document.getElementById('math-overlay').textContent,
          ariaLabel: document.getElementById('math-overlay').getAttribute('aria-label'),
        };
      };
      return { answer: built.answer.value, initial: render('initial'), guided: render('guided'), worked: render('worked') };
    }, familyId);

    const requested = familyId.endsWith('tens') ? 'TENS' : 'ONES';
    expect(stages.initial.text).toContain('DUKE 14');
    expect(stages.initial.text).toContain(`? ${requested}`);
    expect(stages.initial.text).not.toContain('1 TEN');
    expect(stages.initial.text).not.toContain('4 ONES');
    expect(stages.initial.text).not.toContain('= DUKE 14');
    expect(stages.guided.text).toContain('DUKE 14');
    expect(stages.guided.text).toContain(`? ${requested}`);
    expect(stages.guided.text).not.toContain('1 TEN');
    expect(stages.guided.text).not.toContain('4 ONES');
    expect(stages.initial.ariaLabel).not.toMatch(/1 ten|4 ones/i);
    expect(stages.guided.ariaLabel).not.toMatch(/1 ten|4 ones/i);
    expect(stages.worked.text).toContain('1 TEN');
    expect(stages.worked.text).toContain('4 ONES');
    expect(stages.worked.text).toContain('= DUKE 14');
  }
});

test('a correct offense answer commits the frozen proposal exactly once', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x10154);
  const seeded = await seedDrive(page, OFFENSE_SEED);
  await chooseCall(page, 'Short Run');
  const before = await activeContracts(page);
  const snap = before.activeSnap;
  const question = before.questionInstance;

  const after = await answerChoice(page, question.correctChoiceId);
  expect(after.render.plays).toBe(seeded.plays + 1);
  expect(after.render.absoluteYard).toBe(snap.proposal.endYardLine);
  expect(after.render.absoluteYard - seeded.absoluteYard)
    .toBe(snap.context.direction * snap.proposal.appliedGain);
  expect(after.render.totalYards).toEqual({
    player: seeded.totalYards.player + snap.proposal.appliedGain,
    opponent: seeded.totalYards.opponent,
  });

  expect(after.statsSession.completedPlays).toHaveLength(1);
  const [row] = after.statsSession.completedPlays;
  expect(row).toMatchObject({
    instructionalStatus: 'presented',
    offeredYards: snap.proposal.appliedGain,
    actualYards: snap.proposal.appliedGain,
    links: {
      contextId: snap.contextId,
      familyId: question.familyId,
      questionInstanceId: question.questionInstanceId,
    },
  });
  expect(after.learning.resolved).toBe(before.learning.resolved + 1);
});

test('a rejected late commit abandons its pending stats draft before the next call', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x11154);
  const seeded = await seedDrive(page, OFFENSE_SEED);
  await chooseCall(page, 'Short Run');
  const before = await activeContracts(page);
  const pendingBefore = await page.evaluate(() => pendingStatsPlay && ({
    sequence: pendingStatsPlay.sequence,
    finalized: pendingStatsPlay.finalized,
  }));

  expect(pendingBefore).toMatchObject({ sequence: 1, finalized: false });
  await page.evaluate(() => {
    window.__diagnostics = [];
    window.addEventListener('football:diagnostic', event => window.__diagnostics.push(event.detail));
    state.playerScore += 1;
  });
  const rejected = await answerChoice(page, before.questionInstance.correctChoiceId);

  expect(rejected.render.mode).toBe('call');
  expect(rejected.render.plays).toBe(seeded.plays);
  expect(rejected.statsSession).toEqual(before.statsSession);
  expect(rejected.statsSession.completedPlays).toHaveLength(0);
  expect(rejected.activeSnap).toBeNull();
  expect(rejected.questionInstance).toBeNull();
  expect(rejected.pendingResolution).toBeNull();
  expect(await page.evaluate(() => pendingStatsPlay)).toBeNull();
  expect(await page.evaluate(() => window.__diagnostics)).toEqual([
    expect.objectContaining({
      code: 'invalid-context',
      familyId: before.questionInstance.familyId,
      contextId: before.activePlay.contextId,
      questionInstanceId: before.questionInstance.questionInstanceId,
    }),
  ]);

  await chooseCall(page, 'Short Run');
  const retry = await activeContracts(page);
  const committed = await answerChoice(page, retry.questionInstance.correctChoiceId);
  expect(committed.statsSession.completedPlays).toHaveLength(1);
  expect(committed.statsSession.completedPlays[0]).toMatchObject({
    sequence: before.statsSession.nextSequence,
    links: {
      contextId: retry.activeSnap.contextId,
      questionInstanceId: retry.questionInstance.questionInstanceId,
    },
  });
  expect(await page.evaluate(() => pendingStatsPlay)).toBeNull();
});

test('a second short-pass miss freezes an incompletion until Continue and duplicate commit is idempotent', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x20254);
  const seeded = await seedDrive(page, OFFENSE_SEED);
  await chooseCall(page, 'Short Pass');
  const before = await activeContracts(page);

  const explanation = await missTwice(page, before);
  expect(explanation.render.mode).toBe('explanation');
  expect(explanation.render.plays).toBe(seeded.plays);
  expect(explanation.render.absoluteYard).toBe(seeded.absoluteYard);
  expect(explanation.pendingResolution).toBeTruthy();
  expect(explanation.activeSnap).toEqual(before.activeSnap);
  expect(explanation.statsSession.completedPlays).toHaveLength(0);
  expect(explanation.learning.resolved).toBe(before.learning.resolved);
  expect(explanation.questionUi.resolutionRecorded).toBe(false);
  expect(explanation.render.gradedQuestions).toBe(seeded.gradedQuestions);
  expect(await page.evaluate(() => pendingStatsPlay.resolution)).toBeNull();

  const duplicate = await continueAndRetryCommitSynchronously(page);
  const after = duplicate.contracts;
  expect(duplicate.duplicateCommit).toBe(false);
  expect(duplicate.resultCount).toBe(1);
  expect(after.render.plays).toBe(seeded.plays + 1);
  expect(after.render.absoluteYard).toBe(seeded.absoluteYard);
  expect(after.render.totalYards).toEqual(seeded.totalYards);
  expect(after.statsSession.completedPlays).toHaveLength(1);
  expect(after.statsSession.completedPlays[0]).toMatchObject({ actualYards: 0 });
  expect(after.learning.resolved).toBe(before.learning.resolved + 1);
  expect(after.render.gradedQuestions).toBe(seeded.gradedQuestions + 1);
});

test('a rejected second-miss Continue never records a learning or stats resolution', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x21254);
  const seeded = await seedDrive(page, OFFENSE_SEED);
  await chooseCall(page, 'Short Pass');
  const before = await activeContracts(page);
  const explanation = await missTwice(page, before);

  expect(explanation.learning.resolved).toBe(before.learning.resolved);
  expect(await page.evaluate(() => pendingStatsPlay.resolution)).toBeNull();
  await page.evaluate(() => { state.playerScore += 1; });
  const duplicate = await continueAndRetryCommitSynchronously(page);
  const committed = duplicate.contracts;

  expect(duplicate.duplicateCommit).toBe(false);
  expect(duplicate.resultCount).toBe(0);
  expect(committed.render.mode).toBe('call');
  expect(committed.render.plays).toBe(seeded.plays);
  expect(committed.render.absoluteYard).toBe(seeded.absoluteYard);
  expect(committed.render.gradedQuestions).toBe(seeded.gradedQuestions);
  expect(committed.learning.resolved).toBe(before.learning.resolved);
  expect(committed.learning.byConcept).toEqual(before.learning.byConcept);
  expect(committed.statsSession.completedPlays).toHaveLength(0);
  expect(await page.evaluate(() => pendingStatsPlay)).toBeNull();
});

test('an unresolvable terminal miss fails before mutating its second-choice UI state', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x21254);
  await seedDrive(page, OFFENSE_SEED);
  await chooseCall(page, 'Short Run');
  const before = await activeContracts(page);
  const wrongIds = before.questionInstance.choices
    .filter(choice => choice.id !== before.questionInstance.correctChoiceId)
    .map(choice => choice.id);
  await answerChoice(page, wrongIds[0]);

  const result = await page.evaluate((secondWrongId) => {
    const index = state.questionInstance.choices.findIndex(choice => choice.id === secondWrongId);
    const button = document.getElementById(`b${index}`);
    const alteredContext = FOOTBALL_DOMAIN.clone(state.activePlay.context);
    alteredContext.calls.offense = 'unknown-call';
    state.activePlay = FOOTBALL_DOMAIN.createActivePlay({
      ...FOOTBALL_DOMAIN.clone(state.activePlay),
      context: alteredContext,
      call: { ...FOOTBALL_DOMAIN.clone(state.activePlay.call), key: 'unknown-call' },
    });
    state.activeSnap = FOOTBALL_DOMAIN.activeSnapFromPlay(state.activePlay);
    const beforeUi = FOOTBALL_LEARNING.snapshot(state.questionUi);
    let code = null;
    try {
      handleAnswer(index);
    } catch (error) {
      code = error.code;
    }
    return {
      code,
      beforeUi,
      afterUi: FOOTBALL_LEARNING.snapshot(state.questionUi),
      phase: state.phase,
      buttonWrong: button.classList.contains('wrong'),
      buttonDisabled: button.disabled,
    };
  }, wrongIds[1]);

  expect(result.code).toBe('invalid-resolution-policy');
  expect(result.afterUi).toEqual(result.beforeUi);
  expect(result.phase).toBe('question');
  expect(result.buttonWrong).toBe(false);
  expect(result.buttonDisabled).toBe(false);
});

test('commit-time policy enforcement rejects a candidate-selected gain for every resolution path', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x22254);
  const cases = [
    { seed: OFFENSE_SEED, call: 'Short Run', policy: 'firstTryCorrect' },
    { seed: OFFENSE_SEED, call: 'Short Run', policy: 'retryCorrect' },
    { seed: OFFENSE_SEED, call: 'Short Run', policy: 'secondMiss' },
    { seed: OFFENSE_SEED, call: 'Short Run', policy: 'questionBypass' },
    { seed: DEFENSE_SEED, call: 'Run Defense', policy: 'firstTryCorrect' },
    { seed: DEFENSE_SEED, call: 'Run Defense', policy: 'retryCorrect' },
    { seed: DEFENSE_SEED, call: 'Run Defense', policy: 'secondMiss' },
    { seed: DEFENSE_SEED, call: 'Run Defense', policy: 'questionBypass' },
  ];

  for (const scenario of cases) {
    const seeded = await seedDrive(page, scenario.seed);
    await chooseCall(page, scenario.call);
    const before = await activeContracts(page);
    const rejected = await page.evaluate((policy) => {
      const snap = state.activeSnap;
      const expectedGain = expectedRequestedGainForResolution(snap, policy);
      const unauthorizedGain = expectedGain === 0 ? 1 : expectedGain - 1;
      state.pendingResolution = FOOTBALL_DOMAIN.deepFreeze({
        schemaVersion: 1,
        policy,
        contextId: snap.contextId,
        questionInstanceId: state.questionInstance.questionInstanceId,
        transitionToCommit: FOOTBALL_DOMAIN.reprojectGain(snap, unauthorizedGain),
      });
      return {
        committed: commitPendingResolution(),
        contracts: window.__footballTest.activeContracts(),
      };
    }, scenario.policy);

    expect(rejected.committed, `${scenario.seed.possession}:${scenario.policy}`).toBe(false);
    expect(rejected.contracts.render.mode).toBe('call');
    expect(rejected.contracts.render.plays).toBe(seeded.plays);
    expect(rejected.contracts.render.absoluteYard).toBe(seeded.absoluteYard);
    expect(rejected.contracts.learning.resolved).toBe(before.learning.resolved);
    expect(rejected.contracts.statsSession.completedPlays).toHaveLength(0);
  }
});

test('every resolution policy authorizes only its exact frozen requested gain', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x23254);
  await seedDrive(page, DEFENSE_SEED);

  const checks = await page.evaluate(() => {
    const privateOpponentSnapshot = state.opponentSnapshot;
    const base = {
      contextId: 'policy-probe',
      match: state.match,
      possession: 'offense',
      direction: 1,
      quarter: 2,
      down: 2,
      yardsToGo: 8,
      yardLine: 30,
      firstDownLine: 38,
      driveStart: 20,
      scores: { player: 7, opponent: 7 },
      totalYards: { player: 83, opponent: 71 },
      plays: 4,
      drivePlays: 2,
      calls: { offense: 'longRun', defense: null, matchup: null },
      privateOpponentSnapshot: null,
    };
    const offenseSnap = FOOTBALL_DOMAIN.createSnap(base, {
      gain: 8,
      callKey: 'longRun',
      label: 'Long Run',
    });
    const defenseContext = {
      ...base,
      contextId: 'policy-probe-defense',
      possession: 'defense',
      direction: -1,
      yardLine: 70,
      firstDownLine: 62,
      driveStart: 80,
      calls: { offense: privateOpponentSnapshot.plannedCallKey, defense: 'run', matchup: 'matched' },
      privateOpponentSnapshot,
    };
    const defenseSnap = FOOTBALL_DOMAIN.createSnap(defenseContext, {
      gain: 8,
      callKey: privateOpponentSnapshot.plannedCallKey,
      label: 'Opponent Call',
    });
    const nearGoalSnap = FOOTBALL_DOMAIN.createSnap({
      ...defenseContext,
      contextId: 'policy-probe-near-goal',
      yardLine: 2,
      firstDownLine: 0,
      yardsToGo: 2,
      driveStart: 20,
    }, {
      gain: 8,
      callKey: privateOpponentSnapshot.plannedCallKey,
      label: 'Opponent Call',
    });
    const cases = [
      [offenseSnap, 'firstTryCorrect', 8],
      [offenseSnap, 'retryCorrect', 8],
      [offenseSnap, 'secondMiss', -2, { resultKind: 'turnover', resultReason: 'fumble' }],
      [offenseSnap, 'questionBypass', 8],
      [defenseSnap, 'firstTryCorrect', 0],
      [defenseSnap, 'retryCorrect', 0],
      [defenseSnap, 'secondMiss', 3],
      [defenseSnap, 'questionBypass', 8],
      [nearGoalSnap, 'secondMiss', 2],
    ];

    const previousPlay = state.activePlay;
    const previousSnap = state.activeSnap;
    const creationChecks = cases.map(([snap, policy, expectedGain, outcomeOptions], index) => {
      const neighboringGain = expectedGain === 0 ? 1 : expectedGain - 1;
      state.activePlay = FOOTBALL_DOMAIN.createActivePlay({
        schemaVersion: 1,
        playType: 'scrimmage',
        gameId: state.gameId,
        possessionId: state.possessionId,
        playId: `policy-probe-play-${index}`,
        contextId: snap.contextId,
        context: snap.context,
        proposal: snap.proposal,
        call: snap.call,
      });
      state.activeSnap = FOOTBALL_DOMAIN.activeSnapFromPlay(state.activePlay);
      let exactPending = null;
      let neighboringRejected = false;
      try {
        exactPending = makePendingResolution(
          policy,
          FOOTBALL_DOMAIN.reprojectGain(snap, expectedGain, outcomeOptions),
        );
      } catch (error) {}
      try {
        makePendingResolution(
          policy,
          FOOTBALL_DOMAIN.reprojectGain(snap, neighboringGain),
        );
      } catch (error) {
        neighboringRejected = error.code === 'invalid-projection';
      }
      return {
        policy,
        possession: snap.context.possession,
        expectedGain,
        exactAccepted: exactPending?.transitionToCommit?.requestedGain === expectedGain,
        neighboringRejected,
      };
    });
    state.activePlay = previousPlay;
    state.activeSnap = previousSnap;

    return {
      cases: cases.map(([snap, policy, expectedGain, outcomeOptions]) => {
        const neighboringGain = expectedGain === 0 ? 1 : expectedGain - 1;
        return {
          policy,
          possession: snap.context.possession,
          expectedGain,
          derivedGain: expectedRequestedGainForResolution(snap, policy),
          exactAccepted: validateResolutionTransition(
            snap,
            policy,
            FOOTBALL_DOMAIN.reprojectGain(snap, expectedGain, outcomeOptions),
          ).ok,
          neighboringRejected: !validateResolutionTransition(
            snap,
            policy,
            FOOTBALL_DOMAIN.reprojectGain(snap, neighboringGain),
          ).ok,
        };
      }),
      creationChecks,
      unknownPolicyRejected: (() => {
        try {
          expectedRequestedGainForResolution(offenseSnap, 'awaitingAnswer');
          return false;
        } catch (error) {
          return error.code === 'invalid-resolution-policy';
        }
      })(),
    };
  });

  for (const result of checks.cases) {
    expect(result.derivedGain, `${result.possession}:${result.policy}`).toBe(result.expectedGain);
    expect(result.exactAccepted, `${result.possession}:${result.policy}`).toBe(true);
    expect(result.neighboringRejected, `${result.possession}:${result.policy}`).toBe(true);
  }
  for (const result of checks.creationChecks) {
    expect(result.exactAccepted, `pending:${result.possession}:${result.policy}`).toBe(true);
    expect(result.neighboringRejected, `pending:${result.possession}:${result.policy}`).toBe(true);
  }
  expect(checks.unknownPolicyRejected).toBe(true);
});

test('second-miss outcomes are deterministic by call family and only long calls turn over', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x29254);
  const outcomes = await page.evaluate(() => {
    const base = {
      contextId: 'bad-outcome-probe', possession: 'offense', direction: 1, quarter: 2,
      match: state.match,
      down: 2, yardsToGo: 8, yardLine: 30, firstDownLine: 38, driveStart: 20,
      scores: { player: 7, opponent: 7 }, totalYards: { player: 83, opponent: 71 },
      plays: 4, drivePlays: 2, calls: { offense: 'shortRun', defense: null, matchup: null },
      privateOpponentSnapshot: null,
    };
    return ['shortRun', 'shortPass', 'mediumPass', 'longRun', 'longPass'].map((callKey, index) => {
      const snap = FOOTBALL_DOMAIN.createSnap({
        ...base, contextId: `bad-outcome-${index}`, calls: { ...base.calls, offense: callKey },
      }, { gain: 8, callKey, label: OFFENSE_CALLS[callKey].label });
      const activePlay = FOOTBALL_DOMAIN.createActivePlay({
        schemaVersion: 1,
        playType: 'scrimmage',
        gameId: 'second-miss-policy-game',
        possessionId: 'second-miss-policy-possession',
        playId: `second-miss-policy-play-${index}`,
        contextId: snap.contextId,
        context: snap.context,
        proposal: snap.proposal,
        call: snap.call,
      });
      const outcome = secondMissOutcomeForSnap(snap);
      const transition = FOOTBALL_DOMAIN.reprojectGain(snap, outcome.requestedGain,
        outcome.resultReason ? {
          resultKind: outcome.resultKind || undefined, resultReason: outcome.resultReason,
        } : null);
      let fourthDown = null;
      if (!outcome.resultKind) {
        const fourthDownSnap = FOOTBALL_DOMAIN.createSnap({
          ...base,
          contextId: `bad-outcome-fourth-down-${index}`,
          down: 4,
          calls: { ...base.calls, offense: callKey },
        }, { gain: 8, callKey, label: OFFENSE_CALLS[callKey].label });
        const fourthDownPlay = FOOTBALL_DOMAIN.createActivePlay({
          schemaVersion: 1,
          playType: 'scrimmage',
          gameId: 'second-miss-policy-game',
          possessionId: 'second-miss-policy-possession',
          playId: `second-miss-fourth-down-play-${index}`,
          contextId: fourthDownSnap.contextId,
          context: fourthDownSnap.context,
          proposal: fourthDownSnap.proposal,
          call: fourthDownSnap.call,
        });
        const fourthDownTransition = FOOTBALL_DOMAIN.reprojectGain(
          fourthDownSnap,
          outcome.requestedGain,
          { resultReason: outcome.resultReason },
        );
        fourthDown = {
          resultKind: fourthDownTransition.resultKind,
          resultReason: fourthDownTransition.resultReason,
          taggedPlayValid: validateResolutionTransition(
            fourthDownPlay,
            'secondMiss',
            fourthDownTransition,
          ).ok,
        };
      }
      return {
        callKey,
        ...outcome,
        transition,
        fourthDown,
        snapValid: validateResolutionTransition(snap, 'secondMiss', transition).ok,
        taggedPlayValid: validateResolutionTransition(activePlay, 'secondMiss', transition).ok,
      };
    });
  });

  expect(outcomes.map(({ callKey, requestedGain, resultKind, resultReason, snapValid, taggedPlayValid }) => ({
    callKey, requestedGain, resultKind, resultReason, snapValid, taggedPlayValid,
  }))).toEqual([
    { callKey: 'shortRun', requestedGain: -1, resultKind: null, resultReason: 'stuff', snapValid: true, taggedPlayValid: true },
    { callKey: 'shortPass', requestedGain: 0, resultKind: null, resultReason: 'incompletion', snapValid: true, taggedPlayValid: true },
    { callKey: 'mediumPass', requestedGain: -3, resultKind: null, resultReason: 'sack', snapValid: true, taggedPlayValid: true },
    { callKey: 'longRun', requestedGain: -2, resultKind: 'turnover', resultReason: 'fumble', snapValid: true, taggedPlayValid: true },
    { callKey: 'longPass', requestedGain: 0, resultKind: 'turnover', resultReason: 'interception', snapValid: true, taggedPlayValid: true },
  ]);
  expect(outcomes.slice(0, 3).map(item => ({
    callKey: item.callKey,
    ...item.fourthDown,
  }))).toEqual([
    { callKey: 'shortRun', resultKind: 'turnoverOnDowns', resultReason: 'stuff', taggedPlayValid: true },
    { callKey: 'shortPass', resultKind: 'turnoverOnDowns', resultReason: 'incompletion', taggedPlayValid: true },
    { callKey: 'mediumPass', resultKind: 'turnoverOnDowns', resultReason: 'sack', taggedPlayValid: true },
  ]);
  expect(outcomes.slice(0, 3).every(item => item.transition.resultKind !== 'turnover')).toBe(true);
  expect(outcomes.slice(3).every(item => item.transition.resultKind === 'turnover')).toBe(true);
});

test('own-1 offensive second-miss loss validates with zero applied yards', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x2a254);
  const result = await page.evaluate(() => [
    { direction: 1, yardLine: 1, firstDownLine: 11, possession: 'offense' },
  ].map((spot, index) => {
    const snap = FOOTBALL_DOMAIN.createSnap({
      contextId: `own-one-${index}`, quarter: 1, down: 2, yardsToGo: 10,
      match: state.match,
      driveStart: spot.direction === 1 ? 20 : 80,
      scores: { player: 0, opponent: 0 }, totalYards: { player: 0, opponent: 0 },
      plays: 1, drivePlays: 1, calls: { offense: 'mediumPass', defense: null, matchup: null },
      privateOpponentSnapshot: null, ...spot,
    }, { gain: 8, callKey: 'mediumPass' });
    const outcome = secondMissOutcomeForSnap(snap);
    const transition = FOOTBALL_DOMAIN.reprojectGain(snap, outcome.requestedGain, {
      resultReason: outcome.resultReason,
    });
    return {
      valid: validateResolutionTransition(snap, 'secondMiss', transition).ok,
      appliedGain: transition.appliedGain,
      negativeZero: Object.is(transition.appliedGain, -0),
      endYardLine: transition.endYardLine,
    };
  }));
  expect(result).toEqual([
    { valid: true, appliedGain: 0, negativeZero: false, endYardLine: 1 },
  ]);
});

test('a long-run second miss commits one fumble and reaches the possession transition', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x2b254);
  const seeded = await seedDrive(page, OFFENSE_SEED);
  await chooseCall(page, 'Long Run');
  const before = await activeContracts(page);
  await missTwice(page, before);
  await page.evaluate(() => {
    window.__turnoverResults = [];
    window.addEventListener('football:result', event => window.__turnoverResults.push(event.detail));
    document.getElementById('question-continue').click();
    window.__turnoverFloat = document.querySelector('.field-float')?.textContent || '';
    commitPendingResolution();
  });
  await page.waitForTimeout(1650);
  const after = await activeContracts(page);
  const details = await page.evaluate(() => window.__turnoverResults);
  expect(await page.evaluate(() => window.__turnoverFloat)).toBe('FUMBLE!');

  expect(details).toHaveLength(1);
  expect(details[0]).toMatchObject({
    policy: 'secondMiss', outcome: 'turnover',
    transition: { appliedGain: -2, resultKind: 'turnover', resultReason: 'fumble' },
    placement: { nextPossession: 'defense', nextStartYardLine: 80, restartReason: 'turnoverReset' },
  });
  expect(after.statsSession.completedPlays).toHaveLength(1);
  expect(after.statsSession.completedPlays[0]).toMatchObject({
    resolution: 'secondMiss', actualYards: -2, outcome: 'turnover',
  });
  expect(after.render.plays).toBe(seeded.plays + 1);
  expect(after.render.absoluteYard).toBe(seeded.absoluteYard - 2);
  expect(after.render.mode).toBe('transition');
});

test('a medium-pass loss creates 2nd and 13 and the next snap still builds a question', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x2c254);
  await page.evaluate(() => {
    window.__lossDiagnostics = [];
    window.addEventListener('football:diagnostic', event => window.__lossDiagnostics.push(event.detail));
  });
  await seedDrive(page, {
    ...OFFENSE_SEED,
    down: 1,
    yardsToGo: 10,
    yardLine: 30,
    firstDownLine: 40,
    totalYards: { player: 0, opponent: 0 },
  });
  await chooseCall(page, 'Medium Pass');
  const before = await activeContracts(page);
  await missTwice(page, before);
  await page.evaluate(() => document.getElementById('question-continue').click());
  await page.waitForTimeout(1900);
  const between = await activeContracts(page);
  expect(between.render.mode).toBe('call');
  expect(between.render.down).toBe(2);
  expect(between.render.ytg).toBe(13);
  expect(between.render.totalYards.player).toBe(-3);

  await chooseCall(page, 'Short Run');
  const next = await activeContracts(page);
  expect(next.render.mode).toBe('question');
  expect(next.questionInstance).toBeTruthy();
  expect(await page.evaluate(() => window.__lossDiagnostics
    .filter(item => ['invalid-context', 'empty-pool'].includes(item.code)))).toEqual([]);
});

test('a correct defense answer commits a zero-yard stop', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x30354);
  const seeded = await seedDrive(page, DEFENSE_SEED);
  await chooseCall(page, 'Run Defense');
  const before = await activeContracts(page);
  expect(before.activeSnap.proposal.appliedGain).toBeGreaterThan(0);

  const after = await answerChoice(page, before.questionInstance.correctChoiceId);
  expect(after.render.plays).toBe(seeded.plays + 1);
  expect(after.render.absoluteYard).toBe(seeded.absoluteYard);
  expect(after.render.totalYards).toEqual(seeded.totalYards);
  expect(after.statsSession.completedPlays).toHaveLength(1);
  expect(after.statsSession.completedPlays[0]).toMatchObject({
    offeredYards: before.activeSnap.proposal.appliedGain,
    actualYards: 0,
    outcome: 'stop',
  });
});

test('a retry-correct defense answer commits the policy-authorized zero-yard stop', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x31354);
  const seeded = await seedDrive(page, DEFENSE_SEED);
  await chooseCall(page, 'Short Pass D');
  const before = await activeContracts(page);
  const wrongChoiceId = before.questionInstance.choices
    .find(choice => choice.id !== before.questionInstance.correctChoiceId).id;

  await answerChoice(page, wrongChoiceId);
  const after = await answerChoice(page, before.questionInstance.correctChoiceId);

  expect(after.render.plays).toBe(seeded.plays + 1);
  expect(after.render.absoluteYard).toBe(seeded.absoluteYard);
  expect(after.learning.resolved).toBe(before.learning.resolved + 1);
  expect(after.statsSession.completedPlays).toHaveLength(1);
  expect(after.statsSession.completedPlays[0]).toMatchObject({
    resolution: 'retryCorrect',
    actualYards: 0,
    outcome: 'stop',
  });
});

test('a second defense miss caps the frozen result at min(proposal, 3)', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x40454);
  const seeded = await seedDrive(page, DEFENSE_SEED);
  await chooseCall(page, 'Deep Pass D');
  const before = await activeContracts(page);
  const proposal = before.activeSnap.proposal.appliedGain;

  const explanation = await missTwice(page, before);
  expect(explanation.render.plays).toBe(seeded.plays);
  expect(explanation.render.absoluteYard).toBe(seeded.absoluteYard);
  expect(explanation.pendingResolution).toBeTruthy();

  const duplicate = await continueAndRetryCommitSynchronously(page);
  const after = duplicate.contracts;
  expect(duplicate.duplicateCommit).toBe(false);
  expect(duplicate.resultCount).toBe(1);
  const cappedGain = Math.min(proposal, 3);
  expect(after.render.plays).toBe(seeded.plays + 1);
  expect(after.render.absoluteYard).toBe(seeded.absoluteYard - cappedGain);
  expect(after.render.totalYards).toEqual({
    player: seeded.totalYards.player,
    opponent: seeded.totalYards.opponent + cappedGain,
  });
  expect(after.statsSession.completedPlays).toHaveLength(1);
  expect(after.statsSession.completedPlays[0]).toMatchObject({
    offeredYards: proposal,
    actualYards: cappedGain,
  });
});

test('late defensive rejection restores only the frozen snap-owned opponent plan', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x41454);
  const seeded = await seedDrive(page, DEFENSE_SEED);
  await chooseCall(page, 'Deep Pass D');
  const before = await activeContracts(page);
  const explanation = await missTwice(page, before);
  const frozenSnapshot = explanation.activeSnap.context.privateOpponentSnapshot;

  const rejected = await page.evaluate(() => {
    const snap = state.activeSnap;
    const unauthorizedGain = Math.min(snap.proposal.appliedGain, 3) + 1;
    state.opponentSelectionSnapshot = FOOTBALL_DOMAIN.deepFreeze({
      ...FOOTBALL_DOMAIN.clone(snap.context.privateOpponentSnapshot),
      plannedCallKey: snap.context.privateOpponentSnapshot.plannedCallKey === 'shortRun'
        ? 'longPass'
        : 'shortRun',
    });
    state.pendingResolution = FOOTBALL_DOMAIN.deepFreeze({
      ...FOOTBALL_DOMAIN.clone(state.pendingResolution),
      transitionToCommit: FOOTBALL_DOMAIN.reprojectGain(snap, unauthorizedGain),
    });
    document.getElementById('question-continue').click();
    return window.__footballTest.activeContracts();
  });

  expect(rejected.render.mode).toBe('call');
  expect(rejected.render.plays).toBe(seeded.plays);
  expect(rejected.render.absoluteYard).toBe(seeded.absoluteYard);
  expect(rejected.learning.resolved).toBe(before.learning.resolved);
  expect(rejected.statsSession.completedPlays).toHaveLength(0);
  expect(await page.evaluate(() => window.__footballTest.opponentSnapshot())).toEqual(frozenSnapshot);
  expect(await page.evaluate(() => pendingStatsPlay)).toBeNull();
});

test('a valid defense question bypass commits the exact frozen opponent proposal', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x43454);
  const seeded = await seedDrive(page, DEFENSE_SEED);
  const learningBefore = await page.evaluate(() => window.__footballTest.learningState());
  await page.evaluate(() => window.__footballTest.setQuestionFault('empty-pool'));

  await chooseCall(page, 'Medium Pass D');
  const after = await activeContracts(page);
  const [row] = after.statsSession.completedPlays;

  expect(after.render.plays).toBe(seeded.plays + 1);
  expect(row).toMatchObject({
    instructionalStatus: 'bypassed',
    resolution: null,
    actualYards: row.offeredYards,
  });
  expect(after.render.absoluteYard).toBe(seeded.absoluteYard - row.offeredYards);
  expect(after.render.totalYards).toEqual({
    player: seeded.totalYards.player,
    opponent: seeded.totalYards.opponent + row.offeredYards,
  });
  expect(after.learning).toEqual(learningBefore);
});

test('late defensive live-state mismatch also restores the frozen snap-owned opponent plan', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x42454);
  const seeded = await seedDrive(page, DEFENSE_SEED);
  await chooseCall(page, 'Run Defense');
  const before = await activeContracts(page);
  const frozenSnapshot = before.activeSnap.context.privateOpponentSnapshot;

  const rejected = await page.evaluate((correctChoiceId) => {
    const snap = state.activeSnap;
    state.opponentSelectionSnapshot = FOOTBALL_DOMAIN.deepFreeze({
      ...FOOTBALL_DOMAIN.clone(snap.context.privateOpponentSnapshot),
      plannedCallKey: snap.context.privateOpponentSnapshot.plannedCallKey === 'shortRun'
        ? 'longPass'
        : 'shortRun',
    });
    state.playerScore += 1;
    return window.__footballTest.answerChoice(correctChoiceId);
  }, before.questionInstance.correctChoiceId);

  expect(rejected.render.mode).toBe('call');
  expect(rejected.render.plays).toBe(seeded.plays);
  expect(rejected.render.absoluteYard).toBe(seeded.absoluteYard);
  expect(rejected.learning.resolved).toBe(before.learning.resolved);
  expect(rejected.statsSession.completedPlays).toHaveLength(0);
  expect(await page.evaluate(() => window.__footballTest.opponentSnapshot())).toEqual(frozenSnapshot);
  expect(await page.evaluate(() => pendingStatsPlay)).toBeNull();
});

test('an unknown pending policy fails closed and restores the frozen defense plan', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x44454);
  const seeded = await seedDrive(page, DEFENSE_SEED);
  await chooseCall(page, 'Run Defense');
  const before = await activeContracts(page);
  const frozenSnapshot = before.activeSnap.context.privateOpponentSnapshot;

  const rejected = await page.evaluate(() => {
    const snap = state.activeSnap;
    let resultCount = 0;
    const countResult = () => { resultCount++; };
    window.addEventListener('football:result', countResult);
    state.opponentSelectionSnapshot = FOOTBALL_DOMAIN.deepFreeze({
      ...FOOTBALL_DOMAIN.clone(snap.context.privateOpponentSnapshot),
      plannedCallKey: snap.context.privateOpponentSnapshot.plannedCallKey === 'shortRun'
        ? 'longPass'
        : 'shortRun',
    });
    state.pendingResolution = FOOTBALL_DOMAIN.deepFreeze({
      schemaVersion: 1,
      policy: 'awaitingAnswer',
      contextId: snap.contextId,
      questionInstanceId: state.questionInstance.questionInstanceId,
      transitionToCommit: snap.proposal,
    });
    const committed = commitPendingResolution();
    window.removeEventListener('football:result', countResult);
    return {
      committed,
      resultCount,
      contracts: window.__footballTest.activeContracts(),
    };
  });

  expect(rejected.committed).toBe(false);
  expect(rejected.resultCount).toBe(0);
  expect(rejected.contracts.render.mode).toBe('call');
  expect(rejected.contracts.render.plays).toBe(seeded.plays);
  expect(rejected.contracts.render.absoluteYard).toBe(seeded.absoluteYard);
  expect(rejected.contracts.learning.resolved).toBe(before.learning.resolved);
  expect(rejected.contracts.statsSession.completedPlays).toHaveLength(0);
  expect(await page.evaluate(() => window.__footballTest.opponentSnapshot())).toEqual(frozenSnapshot);
  expect(await page.evaluate(() => pendingStatsPlay)).toBeNull();
});

for (const fault of ['empty-pool', 'build-throw', 'malformed', 'schema-mismatch']) {
  test(`a valid ${fault} question failure bypasses instruction and commits the exact proposal`, async ({ page }, testInfo) => {
    primaryOnly(testInfo);
    await cleanBoot(page, 0x50554);
    const seeded = await seedDrive(page, OFFENSE_SEED);
    const before = await activeContracts(page);
    await page.evaluate((mode) => {
      window.__diagnostics = [];
      window.addEventListener('football:diagnostic', event => window.__diagnostics.push(event.detail));
      window.__footballTest.setQuestionFault(mode);
    }, fault);
    await chooseCall(page, 'Short Run');
    const after = await activeContracts(page);

    expect(after.render.plays).toBe(seeded.plays + 1);
    expect(after.statsSession.completedPlays).toHaveLength(1);
    const [row] = after.statsSession.completedPlays;
    expect(row).toMatchObject({
      instructionalStatus: 'bypassed',
      question: null,
      attempts: [],
      resolution: null,
    });
    expect(row.actualYards).toBe(row.offeredYards);
    expect(after.render.absoluteYard - seeded.absoluteYard)
      .toBe(OFFENSE_SEED.direction * row.offeredYards);
    expect(after.render.totalYards).toEqual({
      player: seeded.totalYards.player + row.offeredYards,
      opponent: seeded.totalYards.opponent,
    });
    expect(row.links.contextId).toEqual(expect.anything());
    expect(after.learning).toEqual(before.learning);

    const diagnostics = await page.evaluate(() => window.__diagnostics);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toEqual(expect.objectContaining({
      schemaVersion: 1,
      code: ['malformed', 'schema-mismatch'].includes(fault) ? 'malformed-question' : fault,
      contextId: row.links.contextId,
    }));
    expect(diagnostics[0]).toHaveProperty('familyId');
    expect(diagnostics[0]).toHaveProperty('questionInstanceId');
    if (fault === 'empty-pool') {
      expect(diagnostics[0].familyId).toBeNull();
      expect(diagnostics[0].questionInstanceId).toBeNull();
    } else {
      expect(diagnostics[0].familyId).toEqual(expect.any(String));
      if (['malformed', 'schema-mismatch'].includes(fault)) {
        expect(diagnostics[0].questionInstanceId).toEqual(expect.any(String));
      }
    }
    expect(row.links).toMatchObject({
      familyId: diagnostics[0].familyId,
      contextId: diagnostics[0].contextId,
      questionInstanceId: diagnostics[0].questionInstanceId,
    });
  });
}

test('result dispatch observes settled first-down and defensive-stop counters', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x51554);
  await page.evaluate(() => {
    window.__settledCounterResults = [];
    window.__settledLearningResults = [];
    window.addEventListener('football:learning', event => {
      if (event.detail.type !== 'resolved') return;
      window.__settledLearningResults.push({
        firstDowns: state.firstDowns,
        defenseStops: state.defenseStops,
        correctAnswers: state.correctAnswers,
        gradedQuestions: state.gradedQuestions,
        quarterPossessions: state.quarterPossessions,
        committed: state.committedPlayIds.includes(state.activePlay.playId),
        resolutionRecorded: state.questionUi.resolutionRecorded,
      });
    });
    window.addEventListener('football:result', event => {
      window.__settledCounterResults.push({
        detail: event.detail,
        firstDowns: state.firstDowns,
        defenseStops: state.defenseStops,
        completedPlays: statsSession.completedPlays.length,
        committed: state.committedPlayIds.includes(event.detail.playId),
      });
    });
  });

  await seedDrive(page, {
    possession: 'offense', direction: 1, quarter: 1, down: 3,
    yardsToGo: 1, yardLine: 30, firstDownLine: 31, driveStart: 20,
    scores: { player: 0, opponent: 0 }, totalYards: { player: 0, opponent: 0 },
    plays: 0, drivePlays: 0,
  });
  await chooseCall(page, 'Short Run');
  let contracts = await activeContracts(page);
  await answerChoice(page, contracts.questionInstance.correctChoiceId);

  await seedDrive(page, {
    possession: 'defense', direction: -1, quarter: 1, down: 4,
    yardsToGo: 2, yardLine: 45, firstDownLine: 43, driveStart: 80,
    scores: { player: 0, opponent: 0 }, totalYards: { player: 0, opponent: 0 },
    plays: 0, drivePlays: 0,
  });
  await chooseCall(page, 'Run Defense');
  contracts = await activeContracts(page);
  await answerChoice(page, contracts.questionInstance.correctChoiceId);

  const { snapshots, learningSnapshots } = await page.evaluate(() => ({
    snapshots: window.__settledCounterResults,
    learningSnapshots: window.__settledLearningResults,
  }));
  expect(snapshots).toHaveLength(2);
  expect(snapshots[0]).toMatchObject({
    detail: { outcome: 'firstDown' },
    firstDowns: 1,
    defenseStops: 0,
    completedPlays: 1,
    committed: true,
  });
  expect(snapshots[1]).toMatchObject({
    detail: { outcome: 'turnoverOnDowns' },
    firstDowns: 0,
    defenseStops: 1,
    completedPlays: 2,
    committed: true,
  });
  expect(learningSnapshots).toEqual([
    {
      firstDowns: 1,
      defenseStops: 0,
      correctAnswers: 1,
      gradedQuestions: 1,
      quarterPossessions: 0,
      committed: true,
      resolutionRecorded: true,
    },
    {
      firstDowns: 0,
      defenseStops: 1,
      correctAnswers: 1,
      gradedQuestions: 1,
      quarterPossessions: 1,
      committed: true,
      resolutionRecorded: true,
    },
  ]);
});

test('special-team resolution policies preserve player-perspective polarity and typed stats', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x5a254);
  const policies = ['firstTryCorrect', 'retryCorrect', 'secondMiss', 'questionBypass'];
  const playTypes = ['conversion', 'fieldGoal', 'punt'];
  const possessions = ['offense', 'defense'];

  for (const playType of playTypes) {
    for (const possession of possessions) {
      for (const policy of policies) {
        const before = await beginSpecialPlay(
          page,
          playType,
          possession,
          policy === 'questionBypass' ? 'empty-pool' : null,
        );
        if (policy !== 'questionBypass') {
          expect(before.activePlay.playType, `${playType}:${possession}:${policy}`).toBe(playType);
          expect(before.questionInstance.playType).toBe(playType);
          expect(before.pendingResolution.playType).toBe(playType);
        }
        const after = await resolveSpecialPolicy(page, policy);
        await page.evaluate(() => window.__footballTest.setQuestionFault(null));
        const row = after.statsSession.completedPlays.at(-1);
        const proposalWins = policy === 'questionBypass'
          || (policy !== 'secondMiss' && possession === 'offense')
          || (policy === 'secondMiss' && possession === 'defense');

        expect(after.render.quarterPossessions, `${playType}:${possession}:${policy}:possession`).toBe(1);
        expect(after.render.plays, `${playType}:${possession}:${policy}:scrimmage plays`).toBe(0);
        expect(after.render.totalYards, `${playType}:${possession}:${policy}:team yards`).toEqual({ player: 0, opponent: 0 });
        expect(row.playType).toBe(playType);
        expect(row.offeredYards).toBeNull();
        expect(row.actualYards).toBeNull();
        expect(row.instructionalStatus).toBe(policy === 'questionBypass' ? 'bypassed' : 'presented');
        expect(row.resolution).toBe(policy === 'questionBypass' ? null : policy);
        expect(after.render.pendingNextPossession).toBe(possession === 'offense' ? 'defense' : 'offense');

        if (playType === 'conversion') {
          const made = proposalWins;
          expect(row.outcome).toBe(made
            ? 'conversionMade'
            : possession === 'defense' && policy !== 'secondMiss' ? 'conversionDenied' : 'conversionMissed');
          expect(after.render.score).toEqual({
            player: possession === 'offense' && made ? 1 : 0,
            opponent: possession === 'defense' && made ? 1 : 0,
          });
          expect(after.render.pendingNextStartYardLine).toBe(possession === 'offense' ? 80 : 20);
          expect(after.render.pendingRestartReason).toBe('automaticTouchback');
        } else if (playType === 'fieldGoal') {
          const made = proposalWins;
          expect(row.outcome).toBe(made
            ? 'fieldGoalMade'
            : possession === 'defense' && policy !== 'secondMiss' ? 'fieldGoalBlocked' : 'fieldGoalMissed');
          expect(after.render.score).toEqual({
            player: possession === 'offense' && made ? 3 : 0,
            opponent: possession === 'defense' && made ? 3 : 0,
          });
          expect(after.render.pendingNextStartYardLine).toBe(made
            ? possession === 'offense' ? 80 : 20
            : before.activePlay.context.yardLine);
          expect(after.render.pendingRestartReason).toBe(made
            ? 'automaticTouchback'
            : possession === 'defense' && policy !== 'secondMiss'
              ? 'blockedFieldGoal'
              : 'missedFieldGoal');
        } else {
          expect(row.outcome).toBe('puntLanded');
          expect(row.metrics.travelClass).toBe(proposalWins ? 'normal' : 'receiverFavorable');
          expect(after.render.score).toEqual({ player: 0, opponent: 0 });
          expect(after.render.pendingNextStartYardLine).toBe(row.metrics.landingYardLine);
          expect(after.render.pendingRestartReason).toBe(row.metrics.touchback ? 'puntTouchback' : 'punt');
        }

        const duplicate = await page.evaluate(() => ({
          commit: commitPendingResolution(),
          finalize: finalizePossessionState(state.possessionId, {
            nextPossession: state.pendingNextPossession,
            nextStartYardLine: state.pendingNextStartYardLine,
            restartReason: state.pendingRestartReason,
          }),
          contracts: window.__footballTest.activeContracts(),
        }));
        expect(duplicate.commit).toBe(false);
        expect(duplicate.finalize).toBe(false);
        expect(duplicate.contracts.render.quarterPossessions).toBe(1);
        expect(duplicate.contracts.statsSession.completedPlays).toHaveLength(after.statsSession.completedPlays.length);
      }
    }
  }
});

test('crossing receiver-favorable punts are touchbacks in both directions through telemetry, stats, and copy', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x5a854);
  await page.evaluate(() => {
    window.__crossingPuntResults = [];
    window.addEventListener('football:result', event => window.__crossingPuntResults.push(event.detail));
  });

  const cases = [
    { possession: 'offense', direction: 1, yardLine: 85, policy: 'secondMiss', landing: 80 },
    { possession: 'defense', direction: -1, yardLine: 15, policy: 'firstTryCorrect', landing: 20 },
  ];
  for (const scenario of cases) {
    await page.evaluate(({ possession, direction, yardLine }) => {
      window.__crossingPuntResults.length = 0;
      window.__footballTest.seedDriveState({
        possession,
        direction,
        quarter: 1,
        down: 1,
        yardsToGo: 10,
        yardLine,
        firstDownLine: yardLine + (direction * 10),
        driveStart: yardLine,
        scores: { player: 0, opponent: 0 },
        totalYards: { player: 0, opponent: 0 },
        plays: 0,
        drivePlays: 0,
      });
      startSpecialPlay(makePuntActivePlay({ travelYards: 35 }), 'Crossing punt preview.');
    }, scenario);
    const before = await activeContracts(page);
    expect(before.activePlay.proposal).toMatchObject({
      mode: 'normal',
      resultKind: 'puntTouchback',
      restartReason: 'puntTouchback',
    });

    const after = await resolveSpecialPolicy(page, scenario.policy);
    const row = after.statsSession.completedPlays.at(-1);
    const [result] = await page.evaluate(() => window.__crossingPuntResults);
    expect(row).toMatchObject({
      playType: 'punt',
      outcome: 'puntTouchback',
      metrics: {
        touchback: true,
        travelClass: 'receiverFavorable',
        landingYardLine: scenario.landing,
      },
    });
    expect(result).toMatchObject({
      outcome: 'puntTouchback',
      transition: {
        mode: 'receiverFavorable',
        resultKind: 'puntTouchback',
        restartReason: 'puntTouchback',
        landingYardLine: scenario.landing,
      },
      placement: {
        nextStartYardLine: scenario.landing,
        restartReason: 'puntTouchback',
      },
    });
    expect(after.render.pendingRestartReason).toBe('puntTouchback');
    await expect(page.locator('#feedback')).toContainText('The punt reaches the end zone. Touchback: the receiving team starts at its own 20.');
  }
});

test('special learning events retain only the closed outcome-independent binding allowlist', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x5a954);
  await page.evaluate(() => {
    window.__specialLearningEvents = [];
    window.addEventListener('football:learning', event => window.__specialLearningEvents.push(event.detail));
  });

  for (const playType of ['conversion', 'fieldGoal', 'punt']) {
    await page.evaluate(() => { window.__specialLearningEvents.length = 0; });
    const before = await beginSpecialPlay(page, playType, 'offense');
    await answerChoice(page, before.questionInstance.correctChoiceId);
    const snapshot = await page.evaluate((type) => ({
      events: FOOTBALL_DOMAIN.clone(window.__specialLearningEvents),
      allowed: FOOTBALL_DOMAIN.clone(FOOTBALL_CONTEXTUAL_QUESTIONS.SPECIAL_BINDING_PATHS[type]),
    }), playType);
    expect(snapshot.events.map(event => event.type)).toEqual(['presented', 'attempt', 'resolved']);
    const allowed = new Set(snapshot.allowed);
    for (const event of snapshot.events) {
      expect(event.gameId).toBe(before.activePlay.gameId);
      expect(event.possessionId).toBe(before.activePlay.possessionId);
      expect(event.playId).toBe(before.activePlay.playId);
      expect(event.playType).toBe(playType);
      expect(event.bindings.length).toBeGreaterThan(0);
      for (const binding of event.bindings) {
        if (binding.source.kind === 'context') {
          expect(allowed.has(binding.source.path), `${playType}:${event.type}:${binding.source.path}`).toBe(true);
          expect(binding.source.path).not.toMatch(
            /resultKind|points|made|restart|nextPossession|nextStart|mode|requestedTravel/i,
          );
        } else {
          expect(binding.source).toEqual({ kind: 'rule', ruleId: 'game.fieldGoalPoints' });
        }
      }
    }
  }
});

test('keyboard decisions synchronously move focus to the replacement call or answer grid', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x5aa54);

  const seedFourthDown = async (yardLine) => {
    await seedDrive(page, {
      possession: 'offense', direction: 1, quarter: 1, down: 4,
      yardsToGo: 10, yardLine, firstDownLine: yardLine + 10, driveStart: 20,
      scores: { player: 0, opponent: 0 }, totalYards: { player: 0, opponent: 0 },
      plays: 0, drivePlays: 0,
    });
    // seedDriveState closes any overlay and schedules its production focus
    // restoration for the next frame. Let that callback settle before this
    // test deliberately focuses a non-first decision card.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
  };
  const installFocusProbe = () => page.evaluate(() => {
    if (!window.__focusProbeInstalled) {
      window.__focusProbeInstalled = true;
      const originalFocus = HTMLElement.prototype.focus;
      HTMLElement.prototype.focus = function(options) {
        window.__focusCalls.push({
          id: this.id || null,
          className: this.className || '',
          preventScroll: options?.preventScroll === true,
        });
        return originalFocus.call(this, options);
      };
    }
    window.__focusCalls = [];
  });
  const expectFocusedReplacement = async (selector) => {
    await expect(page.locator(selector).first()).toBeFocused();
    const lastFocus = await page.evaluate(() => window.__focusCalls.at(-1));
    expect(lastFocus.preventScroll).toBe(true);
  };

  await seedFourthDown(50);
  await installFocusProbe();
  const goButton = page.locator('#decision-grid .decision-btn[data-action="go"]');
  await goButton.focus();
  await expect(goButton).toBeFocused();
  await page.evaluate(() => { window.__focusCalls = []; });
  await goButton.press('Enter');
  await expect(page.locator('#call-grid .call-btn')).toHaveCount(5);
  await expectFocusedReplacement('#call-grid .call-btn');

  for (const scenario of [
    { action: 'punt', yardLine: 50 },
    { action: 'fieldGoal', yardLine: 60 },
  ]) {
    await seedFourthDown(scenario.yardLine);
    await installFocusProbe();
    const decisionButton = page.locator(`#decision-grid .decision-btn[data-action="${scenario.action}"]`);
    await decisionButton.focus();
    await expect(decisionButton).toBeFocused();
    await page.evaluate(() => { window.__focusCalls = []; });
    await decisionButton.press('Enter');
    await expectFocusedReplacement('#btn-row .ans-btn:not(.hidden):not(:disabled)');
  }

  await page.evaluate(() => {
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 1, down: 1,
      yardsToGo: 10, yardLine: 20, firstDownLine: 30, driveStart: 20,
    });
    showConversionDecision();
  });
  await installFocusProbe();
  const patButton = page.locator('#decision-grid .decision-btn[data-action="pat"]');
  await patButton.focus();
  await expect(patButton).toBeFocused();
  await page.evaluate(() => { window.__focusCalls = []; });
  await patButton.press('Enter');
  await expectFocusedReplacement('#btn-row .ans-btn:not(.hidden):not(:disabled)');

  await seedFourthDown(60);
  await page.evaluate(() => window.__footballTest.setQuestionFault('invalid-context'));
  const invalidFieldGoalButton = page.locator('#decision-grid .decision-btn[data-action="fieldGoal"]');
  await invalidFieldGoalButton.focus();
  await expect(invalidFieldGoalButton).toBeFocused();
  await invalidFieldGoalButton.press('Enter');
  await expect(page.locator('#decision-grid .decision-btn')).toHaveCount(1);
  await expect(page.locator('#question')).toHaveText('Retry the same field-goal try.');
  await expect(page.locator('#decision-grid .decision-btn')).toBeFocused();
  await page.evaluate(() => {
    window.__footballTest.setQuestionFault(null);
    window.__focusCalls = [];
  });
  await page.locator('#decision-grid .decision-btn[data-action="fieldGoal"]').press('Enter');
  await expectFocusedReplacement('#btn-row .ans-btn:not(.hidden):not(:disabled)');
});

test('fourth-down and recovery copy matches the rendered action set and uses one live announcement source', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x5ab54);
  const seedFourthDown = async (yardLine) => seedDrive(page, {
    possession: 'offense', direction: 1, quarter: 1, down: 4,
    yardsToGo: 10, yardLine, firstDownLine: yardLine + 10, driveStart: 20,
  });
  const surfaces = () => page.evaluate(() => ({
    actions: window.__footballTest.decisionActions(),
    header: {
      chip: document.getElementById('desk-chip').textContent,
      kicker: document.getElementById('desk-kicker').textContent,
      action: document.getElementById('action-subcopy').textContent,
    },
    question: document.getElementById('question').textContent,
    feedback: document.getElementById('feedback').textContent,
    cards: document.getElementById('decision-grid').textContent,
    decisionAriaLabel: document.getElementById('decision-grid').getAttribute('aria-label'),
    decisionColumns: getComputedStyle(document.getElementById('decision-grid')).gridTemplateColumns.split(' ').length,
    activeLiveSources: Array.from(document.querySelectorAll('[aria-live="polite"]'))
      .filter(element => !element.hidden && element.textContent.trim() && element.getClientRects().length > 0)
      .map(element => element.id),
  }));

  await seedFourthDown(60);
  const legal = await surfaces();
  expect(legal.actions).toEqual(['go', 'punt', 'fieldGoal']);
  expect(legal.header.action).toBe('Choose go, punt, or the legal 57-yard field goal.');
  expect(legal.feedback).toBe('Choose go, punt, or the legal 57-yard field goal.');
  expect(legal.cards).toContain('Keep the drive alive');
  expect(legal.cards).not.toContain('Keep the offense out');
  expect(legal.activeLiveSources).toEqual(['feedback']);

  await seedFourthDown(50);
  const illegal = await surfaces();
  expect(illegal.actions).toEqual(['go', 'punt']);
  expect(illegal.header.action).toBe('Go for it or punt.');
  expect(illegal.feedback).toBe('Choose go or punt.');
  expect(`${illegal.header.action} ${illegal.feedback} ${illegal.cards}`).not.toMatch(/field goal/i);

  await expect(page.locator('#special-action-live')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#special-action-live')).not.toHaveAttribute('aria-live', /.+/);
  await expect(page.locator('#special-action-live')).not.toHaveAttribute('role', /.+/);
  await expect(page.locator('#feedback')).toHaveAttribute('role', 'status');
  await expect(page.locator('#feedback')).toHaveAttribute('aria-live', 'polite');

  await page.locator('#decision-grid .decision-btn[data-action="punt"]').click();
  expect((await surfaces()).activeLiveSources).toEqual(['feedback']);

  await beginSpecialPlay(page, 'punt', 'defense');
  expect((await surfaces()).activeLiveSources).toEqual(['feedback']);

  await seedFourthDown(60);
  await page.evaluate(() => window.__footballTest.setQuestionFault('invalid-context'));
  await page.locator('#decision-grid .decision-btn[data-action="fieldGoal"]').click();
  const fieldGoalRecovery = await surfaces();
  expect(fieldGoalRecovery.actions).toEqual(['fieldGoal']);
  expect(fieldGoalRecovery.decisionAriaLabel).toBe('Retry the same fourth-down action');
  expect(fieldGoalRecovery.decisionColumns).toBe(1);
  expect(`${fieldGoalRecovery.header.action} ${fieldGoalRecovery.question} ${fieldGoalRecovery.feedback} ${fieldGoalRecovery.cards}`)
    .toMatch(/same field-goal try/i);
  expect(`${fieldGoalRecovery.header.action} ${fieldGoalRecovery.question} ${fieldGoalRecovery.feedback} ${fieldGoalRecovery.cards}`)
    .not.toMatch(/punt|punt draw/i);

  await page.evaluate(() => {
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 1, down: 1,
      yardsToGo: 10, yardLine: 20, firstDownLine: 30, driveStart: 20,
    });
    showConversionDecision();
  });
  await page.locator('#decision-grid .decision-btn[data-action="pat"]').click();
  const conversionRecovery = await surfaces();
  expect(conversionRecovery.actions).toEqual(['pat']);
  expect(conversionRecovery.decisionAriaLabel).toBe('Retry the same conversion attempt');
  expect(conversionRecovery.decisionColumns).toBe(1);
  expect(`${conversionRecovery.header.action} ${conversionRecovery.question} ${conversionRecovery.cards}`)
    .toMatch(/retry the same PAT/i);
  expect(`${conversionRecovery.header.action} ${conversionRecovery.question} ${conversionRecovery.feedback} ${conversionRecovery.cards}`)
    .not.toMatch(/choose one point|choose.*one.*two/i);
  expect(conversionRecovery.activeLiveSources).toEqual(['feedback']);
  await page.evaluate(() => window.__footballTest.setQuestionFault(null));
});

test('production football RNG budgets stay exact across go, kick, punt, conversion, and resolution', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x5aa54);
  const installCounter = () => page.evaluate(() => {
    window.__footballDraws = 0;
    const football = () => { window.__footballDraws++; return 0.5; };
    const scheduler = () => 0.25;
    const presentation = () => 0.5;
    window.__footballTest.setRngStreams({ football, scheduler, presentation });
  });
  const draws = () => page.evaluate(() => window.__footballDraws);
  const resolveCorrect = async () => {
    const contracts = await activeContracts(page);
    await answerChoice(page, contracts.questionInstance.correctChoiceId);
  };

  await seedDrive(page, {
    possession: 'offense', direction: 1, quarter: 1, down: 4,
    yardsToGo: 10, yardLine: 50, firstDownLine: 60, driveStart: 20,
  });
  await installCounter();
  await page.locator('#decision-grid .decision-btn[data-action="go"]').click();
  expect(await draws()).toBe(0);
  await page.locator('#call-grid .call-btn').first().click();
  expect(await draws()).toBe(1);
  await resolveCorrect();
  expect(await draws()).toBe(1);

  await installCounter();
  await seedDrive(page, {
    possession: 'defense', direction: -1, quarter: 1, down: 4,
    yardsToGo: 2, yardLine: 45, firstDownLine: 43, driveStart: 80,
  });
  expect(await draws()).toBe(1);
  await page.locator('#call-grid .call-btn').first().click();
  expect(await draws()).toBe(2);
  await resolveCorrect();
  expect(await draws()).toBe(2);

  await seedDrive(page, {
    possession: 'offense', direction: 1, quarter: 1, down: 4,
    yardsToGo: 10, yardLine: 50, firstDownLine: 60, driveStart: 20,
  });
  await installCounter();
  await page.locator('#decision-grid .decision-btn[data-action="punt"]').click();
  expect(await draws()).toBe(1);
  await resolveCorrect();
  expect(await draws()).toBe(1);

  await installCounter();
  await seedDrive(page, {
    possession: 'defense', direction: -1, quarter: 1, down: 4,
    yardsToGo: 10, yardLine: 80, firstDownLine: 70, driveStart: 80,
  });
  expect(await draws()).toBe(1);
  await resolveCorrect();
  expect(await draws()).toBe(1);

  await seedDrive(page, {
    possession: 'offense', direction: 1, quarter: 1, down: 4,
    yardsToGo: 2, yardLine: 60, firstDownLine: 62, driveStart: 20,
  });
  await installCounter();
  await page.locator('#decision-grid .decision-btn[data-action="fieldGoal"]').click();
  expect(await draws()).toBe(0);
  await resolveCorrect();
  expect(await draws()).toBe(0);

  await installCounter();
  await seedDrive(page, {
    possession: 'defense', direction: -1, quarter: 1, down: 4,
    yardsToGo: 10, yardLine: 40, firstDownLine: 30, driveStart: 80,
  });
  expect(await draws()).toBe(0);
  await resolveCorrect();
  expect(await draws()).toBe(0);

  await seedDrive(page, {
    possession: 'defense', direction: -1, quarter: 1, down: 1,
    yardsToGo: 10, yardLine: 80, firstDownLine: 70, driveStart: 80,
  });
  await installCounter();
  await page.evaluate(() => showConversionDecision());
  expect(await draws()).toBe(0);
  await resolveCorrect();
  expect(await draws()).toBe(0);

  await seedDrive(page, {
    possession: 'offense', direction: 1, quarter: 1, down: 1,
    yardsToGo: 10, yardLine: 20, firstDownLine: 30, driveStart: 20,
  });
  await installCounter();
  await page.evaluate(() => showConversionDecision());
  await page.locator('#decision-grid .decision-btn[data-action="pat"]').click();
  expect(await draws()).toBe(0);
  await resolveCorrect();
  expect(await draws()).toBe(0);
});

test('special build and presentation faults bypass once, clear stale controls, and keep opponent surfaces private', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x5ab54);
  await page.evaluate(() => {
    window.__specialBypassDiagnostics = [];
    window.__specialBypassResults = [];
    window.addEventListener('football:diagnostic', event => window.__specialBypassDiagnostics.push(event.detail));
    window.addEventListener('football:result', event => window.__specialBypassResults.push(event.detail));
  });

  const scenarios = [
    { fault: 'build-throw', playType: 'punt', possession: 'offense' },
    { fault: 'malformed', playType: 'fieldGoal', possession: 'defense' },
    { fault: 'prepare-after-ui', playType: 'conversion', possession: 'defense' },
  ];
  for (const scenario of scenarios) {
    const baseline = await activeContracts(page);
    await page.evaluate(() => {
      window.__specialBypassDiagnostics.length = 0;
      window.__specialBypassResults.length = 0;
    });
    const after = await beginSpecialPlay(
      page,
      scenario.playType,
      scenario.possession,
      scenario.fault,
    );
    const surfaces = await page.evaluate(() => ({
      render: JSON.parse(render_game_to_text()),
      history: FOOTBALL_STATS.history(),
      rawHistory: localStorage.getItem('footballMathStats:v1'),
      diagnostics: window.__specialBypassDiagnostics,
      results: window.__specialBypassResults,
      controls: {
        calls: document.querySelectorAll('#call-grid .call-btn').length,
        decisions: document.querySelectorAll('#decision-grid .decision-btn').length,
        answerRowHidden: document.getElementById('btn-row').classList.contains('hidden'),
      },
      prompt: {
        phase: document.getElementById('ui-desk').dataset.phase,
        playLabel: document.getElementById('play-label').textContent,
        question: document.getElementById('question').textContent,
        mathOverlayHidden: document.getElementById('math-overlay').hidden,
      },
    }));
    const row = after.statsSession.completedPlays.at(-1);
    expect(after.render.mode).toBe('feedback');
    expect(after.render.quarterPossessions).toBe(1);
    expect(after.statsSession.completedPlays)
      .toHaveLength(baseline.statsSession.completedPlays.length + 1);
    expect(row).toMatchObject({
      playType: scenario.playType,
      instructionalStatus: 'bypassed',
      question: null,
      attempts: [],
      resolution: null,
    });
    expect(after.learning).toEqual(baseline.learning);
    expect(surfaces.controls).toEqual({ calls: 0, decisions: 0, answerRowHidden: true });
    expect(surfaces.prompt).toMatchObject({
      phase: 'feedback',
      question: 'No math question this time. The play still counts.',
      mathOverlayHidden: true,
    });
    expect(surfaces.prompt.playLabel).toContain(
      scenario.playType === 'punt' ? 'Punt preview'
        : scenario.playType === 'fieldGoal' ? 'field goal'
          : after.activePlay.context.attemptType === 'twoPoint' ? 'Two-point try' : 'PAT try',
    );
    expect(surfaces.diagnostics).toHaveLength(1);
    expect(surfaces.diagnostics[0].code).toBe(
      scenario.fault === 'malformed' ? 'malformed-question'
        : scenario.fault === 'prepare-after-ui' ? 'question-presentation-failure'
          : scenario.fault,
    );
    expect(surfaces.diagnostics[0].familyId).toEqual(expect.any(String));
    expect(surfaces.diagnostics[0].familyId.length).toBeGreaterThan(0);
    if (scenario.fault === 'build-throw') {
      expect(surfaces.diagnostics[0].questionInstanceId).toBeNull();
    } else {
      expect(surfaces.diagnostics[0].questionInstanceId).toEqual(expect.any(String));
      expect(surfaces.diagnostics[0].questionInstanceId.length).toBeGreaterThan(0);
    }
    expect(surfaces.results).toHaveLength(1);
    expect(surfaces.results[0]).toMatchObject({
      playId: after.activePlay.playId,
      playType: scenario.playType,
      familyId: surfaces.diagnostics[0].familyId,
      contextId: after.activePlay.contextId,
      questionInstanceId: surfaces.diagnostics[0].questionInstanceId,
      policy: 'questionBypass',
      transition: after.activePlay.proposal,
      placement: {
        nextPossession: after.render.pendingNextPossession,
        nextStartYardLine: after.render.pendingNextStartYardLine,
        restartReason: after.render.pendingRestartReason,
      },
    });
    expect(row.links).toEqual({
      familyId: surfaces.diagnostics[0].familyId,
      contextId: surfaces.diagnostics[0].contextId,
      questionInstanceId: surfaces.diagnostics[0].questionInstanceId,
    });

    if (scenario.possession === 'defense') {
      const serialized = JSON.stringify({
        render: surfaces.render,
        session: after.statsSession,
        history: surfaces.history,
        rawHistory: surfaces.rawHistory,
        diagnostics: surfaces.diagnostics,
        results: surfaces.results,
      });
      for (const forbidden of [
        'opponentDecisionSnapshot', 'privateOpponent', 'plannedCallKey',
        'decisionType', 'lastScheduledQ4Possession', 'offenseScoreMargin',
      ]) expect(serialized).not.toContain(forbidden);
    }
    await page.evaluate(() => window.__footballTest.setQuestionFault(null));
  }
});

test('invalid punt recovery preserves the frozen draw and only reuses identities for frozen facts', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x5b254);
  await page.evaluate(() => {
    window.__puntFootballDraws = 0;
    window.__puntRecoveryDiagnostics = [];
    window.addEventListener('football:diagnostic', event => {
      window.__puntRecoveryDiagnostics.push(event.detail);
    });
    const football = () => { window.__puntFootballDraws++; return 0.5; };
    const scheduler = () => 0.25;
    const presentation = () => 0.5;
    window.__footballTest.setRngStreams({ football, scheduler, presentation });
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 1, down: 4,
      yardsToGo: 10, yardLine: 50, firstDownLine: 60, driveStart: 20,
      scores: { player: 0, opponent: 0 }, totalYards: { player: 0, opponent: 0 },
      plays: 0, drivePlays: 0,
    });
    window.__footballTest.setQuestionFault('invalid-context');
  });
  await page.locator('#decision-grid .decision-btn[data-action="punt"]').click();
  const failedPlayer = await page.evaluate(() => ({
    draws: window.__puntFootballDraws,
    recovery: FOOTBALL_DOMAIN.clone(state.specialRecoveryPlay),
    diagnostic: FOOTBALL_DOMAIN.clone(window.__puntRecoveryDiagnostics.at(-1)),
    actions: window.__footballTest.decisionActions(),
    mode: JSON.parse(render_game_to_text()).mode,
    copy: {
      header: document.getElementById('action-subcopy').textContent,
      question: document.getElementById('question').textContent,
      feedback: document.getElementById('feedback').textContent,
      card: document.getElementById('decision-grid').textContent,
    },
  }));
  expect(failedPlayer.draws).toBe(1);
  expect(failedPlayer.actions).toEqual(['punt']);
  expect(failedPlayer.recovery).toMatchObject({ playType: 'punt', travelYards: 43 });
  expect(failedPlayer.recovery).not.toHaveProperty('playId');
  expect(failedPlayer.recovery).not.toHaveProperty('contextId');
  expect(failedPlayer.diagnostic).toMatchObject({
    code: 'INVALID_CONTEXT',
    playId: expect.any(String),
    contextId: expect.any(String),
  });
  expect(failedPlayer.mode).toBe('fourth-down-decision');
  for (const value of Object.values(failedPlayer.copy)) expect(value).toContain('43-yard punt');
  await expect(page.locator('#decision-grid .decision-btn[data-action="punt"]')).toBeFocused();

  await page.evaluate(() => window.__footballTest.setQuestionFault(null));
  await page.locator('#decision-grid .decision-btn[data-action="punt"]').click();
  const recoveredPlayer = await activeContracts(page);
  expect(await page.evaluate(() => window.__puntFootballDraws)).toBe(1);
  expect(recoveredPlayer.activePlay.playId).not.toBe(failedPlayer.diagnostic.playId);
  expect(recoveredPlayer.activePlay.contextId).not.toBe(failedPlayer.diagnostic.contextId);
  expect(recoveredPlayer.activePlay.proposal.requestedTravelYards).toBe(43);

  const failedOpponent = await page.evaluate(() => {
    window.__footballTest.setQuestionFault('invalid-projection');
    window.__footballTest.seedDriveState({
      possession: 'defense', direction: -1, quarter: 1, down: 4,
      yardsToGo: 10, yardLine: 80, firstDownLine: 70, driveStart: 80,
      scores: { player: 0, opponent: 0 }, totalYards: { player: 0, opponent: 0 },
      plays: 0, drivePlays: 0,
    });
    return {
      draws: window.__puntFootballDraws,
      recovery: FOOTBALL_DOMAIN.clone(state.specialRecoveryPlay),
      decision: FOOTBALL_DOMAIN.clone(state.opponentDecisionSnapshot),
      actions: window.__footballTest.decisionActions(),
      copy: {
        header: document.getElementById('action-subcopy').textContent,
        question: document.getElementById('question').textContent,
        feedback: document.getElementById('feedback').textContent,
        card: document.getElementById('decision-grid').textContent,
      },
    };
  });
  expect(failedOpponent.draws).toBe(2);
  expect(failedOpponent.actions).toEqual(['punt']);
  expect(failedOpponent.decision).toMatchObject({
    decisionType: 'fourthDown', action: 'punt',
    gameId: expect.any(String), possessionId: expect.any(String),
  });
  const failedOpponentTravel = failedOpponent.recovery.proposal?.requestedTravelYards
    ?? failedOpponent.recovery.travelYards;
  for (const value of Object.values(failedOpponent.copy)) {
    expect(value).toContain(`${failedOpponentTravel}-yard punt`);
  }

  await page.evaluate(() => window.__footballTest.setQuestionFault(null));
  await page.locator('#decision-grid .decision-btn[data-action="punt"]').click();
  const recoveredOpponent = await activeContracts(page);
  expect(await page.evaluate(() => window.__puntFootballDraws)).toBe(2);
  expect(recoveredOpponent.activePlay).toMatchObject({
    playId: failedOpponent.recovery.playId,
    contextId: failedOpponent.recovery.contextId,
  });
  const privacy = JSON.stringify(recoveredOpponent.render);
  expect(privacy).not.toContain('opponentDecisionSnapshot');
  expect(privacy).not.toContain('plannedCallKey');
});

test('commit-time special mismatches preserve the action but allocate fresh play and context identities', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x5b954);
  await page.evaluate(() => {
    window.__specialRecoveryResults = [];
    window.__specialRecoveryDiagnostics = [];
    window.addEventListener('football:result', event => window.__specialRecoveryResults.push(event.detail));
    window.addEventListener('football:diagnostic', event => window.__specialRecoveryDiagnostics.push(event.detail));
  });

  for (const playType of ['punt', 'fieldGoal', 'conversion']) {
    for (const possession of ['offense', 'defense']) {
      const original = await beginSpecialPlay(page, playType, possession);
      const originalDecision = await page.evaluate(() => (
        state.opponentDecisionSnapshot ? FOOTBALL_DOMAIN.clone(state.opponentDecisionSnapshot) : null
      ));
      await page.evaluate((type) => {
        window.__specialRecoveryResults.length = 0;
        window.__specialRecoveryDiagnostics.length = 0;
        if (type === 'conversion') state.playerScore += 1;
        else state.yd += state.direction;
      }, playType);

      await answerChoice(page, original.questionInstance.correctChoiceId);
      const rejected = await activeContracts(page);
      const recovery = await page.evaluate(() => ({
        mode: JSON.parse(render_game_to_text()).mode,
        actions: window.__footballTest.decisionActions(),
        spec: FOOTBALL_DOMAIN.clone(state.specialRecoveryPlay),
        decision: state.opponentDecisionSnapshot
          ? FOOTBALL_DOMAIN.clone(state.opponentDecisionSnapshot)
          : null,
        resultCount: window.__specialRecoveryResults.length,
        diagnostics: FOOTBALL_DOMAIN.clone(window.__specialRecoveryDiagnostics),
      }));
      const action = playType === 'conversion'
        ? original.activePlay.context.attemptType
        : playType;
      expect(recovery.mode, `${playType}:${possession}:phase`).toBe(
        playType === 'conversion' ? 'conversion-decision' : 'fourth-down-decision',
      );
      expect(recovery.actions).toEqual([action]);
      expect(recovery.spec).toMatchObject({ playType });
      expect(recovery.spec).not.toHaveProperty('playId');
      expect(recovery.spec).not.toHaveProperty('contextId');
      if (playType === 'punt') {
        expect(recovery.spec.travelYards).toBe(original.activePlay.proposal.requestedTravelYards);
      }
      if (playType === 'conversion') {
        expect(recovery.spec.attemptType).toBe(original.activePlay.context.attemptType);
      }
      expect(recovery.decision).toEqual(originalDecision);
      expect(recovery.resultCount).toBe(0);
      expect(recovery.diagnostics).toHaveLength(1);
      expect(recovery.diagnostics[0]).toMatchObject({
        code: 'invalid-context',
        playId: original.activePlay.playId,
        contextId: original.activePlay.contextId,
        familyId: original.questionInstance.familyId,
        questionInstanceId: original.questionInstance.questionInstanceId,
      });
      expect(rejected.statsSession.completedPlays)
        .toHaveLength(original.statsSession.completedPlays.length);
      expect(rejected.learning.resolved).toBe(original.learning.resolved);
      expect(rejected.render.quarterPossessions).toBe(0);

      if (possession === 'offense') {
        const staleAction = playType === 'conversion'
          ? (action === 'pat' ? 'twoPoint' : 'pat')
          : playType === 'punt' ? 'go' : 'punt';
        const staleAttempt = await page.evaluate((alternate) => ({
          accepted: window.__footballTest.selectDecision(alternate),
          mode: JSON.parse(render_game_to_text()).mode,
          actions: window.__footballTest.decisionActions(),
          recovery: FOOTBALL_DOMAIN.clone(state.specialRecoveryPlay),
        }), staleAction);
        expect(staleAttempt.accepted).toBe(false);
        expect(staleAttempt.mode).toBe(
          playType === 'conversion' ? 'conversion-decision' : 'fourth-down-decision',
        );
        expect(staleAttempt.actions).toEqual([action]);
        expect(staleAttempt.recovery).toEqual(recovery.spec);
      }

      await page.locator(`#decision-grid .decision-btn[data-action="${action}"]`).click();
      const retried = await activeContracts(page);
      expect(retried.activePlay).toMatchObject({
        playType,
      });
      expect(retried.activePlay.playId).not.toBe(original.activePlay.playId);
      expect(retried.activePlay.contextId).not.toBe(original.activePlay.contextId);
      if (playType === 'conversion') {
        expect(retried.activePlay.context.scores.player)
          .toBe(original.activePlay.context.scores.player + 1);
      } else {
        expect(retried.activePlay.context.yardLine)
          .toBe(original.activePlay.context.yardLine + original.activePlay.context.direction);
      }
      if (playType === 'punt') {
        expect(retried.activePlay.proposal.requestedTravelYards)
          .toBe(original.activePlay.proposal.requestedTravelYards);
      }

      await answerChoice(page, retried.questionInstance.correctChoiceId);
      const committed = await activeContracts(page);
      expect(committed.statsSession.completedPlays)
        .toHaveLength(original.statsSession.completedPlays.length + 1);
      expect(committed.learning.resolved).toBe(original.learning.resolved + 1);
      expect(committed.render.quarterPossessions).toBe(1);
      expect(await page.evaluate(() => window.__specialRecoveryResults)).toHaveLength(1);
    }
  }
});

test('field-goal recovery reopens a legal path when live drift crosses the 57-yard boundary', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x5ba54);

  for (const possession of ['offense', 'defense']) {
    const original = await beginSpecialPlay(page, 'fieldGoal', possession);
    await page.evaluate(() => {
      state.yd -= state.direction;
      state.fdYd -= state.direction;
    });
    await answerChoice(page, original.questionInstance.correctChoiceId);

    const recovery = await page.evaluate(() => ({
      mode: JSON.parse(render_game_to_text()).mode,
      actions: window.__footballTest.decisionActions(),
      specialRecoveryPlay: state.specialRecoveryPlay,
      decision: state.opponentDecisionSnapshot
        ? FOOTBALL_DOMAIN.clone(state.opponentDecisionSnapshot)
        : null,
      fieldGoalLegal: FOOTBALL_DOMAIN.isFieldGoalLegal(state.yd, state.direction),
    }));
    expect(recovery.fieldGoalLegal).toBe(false);
    expect(recovery.specialRecoveryPlay).toBeNull();

    if (possession === 'offense') {
      expect(recovery.mode).toBe('fourth-down-decision');
      expect(recovery.actions).toEqual(['go', 'punt']);
      await page.locator('#decision-grid .decision-btn[data-action="punt"]').click();
      expect((await activeContracts(page)).activePlay).toMatchObject({ playType: 'punt' });
    } else {
      expect(recovery.mode).toBe('call');
      expect(recovery.actions).toEqual([]);
      expect(recovery.decision).toMatchObject({ action: 'go' });
      await chooseCall(page, 'Run Defense');
      expect((await activeContracts(page)).activePlay).toMatchObject({ playType: 'scrimmage' });
    }
  }
});

test('pending placement carries across quarters, resets at halftime, and disappears at the final', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x5c254);

  const carried = await page.evaluate(() => {
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 1, quarterPossessions: 3,
      down: 1, yardsToGo: 10, yardLine: 20, firstDownLine: 30, driveStart: 20,
    });
    finalizePossessionState(state.possessionId, {
      nextPossession: 'defense', nextStartYardLine: 67, restartReason: 'punt',
    });
    routePossessionPresentation('Quarter complete.');
    const before = JSON.parse(render_game_to_text());
    nextQuarter();
    return { before, after: JSON.parse(render_game_to_text()) };
  });
  expect(carried.before).toMatchObject({
    mode: 'quarter', pendingNextPossession: 'defense',
    pendingNextStartYardLine: 67, pendingRestartReason: 'punt',
  });
  expect(carried.after).toMatchObject({
    mode: 'call', quarter: 2, possession: 'defense', absoluteYard: 67, restartReason: 'punt',
  });

  const carriedIntoFourth = await page.evaluate(() => {
    window.__footballTest.seedDriveState({
      possession: 'defense', direction: -1, quarter: 3, quarterPossessions: 3,
      down: 1, yardsToGo: 10, yardLine: 80, firstDownLine: 70, driveStart: 80,
    });
    finalizePossessionState(state.possessionId, {
      nextPossession: 'offense', nextStartYardLine: 33, restartReason: 'punt',
    });
    routePossessionPresentation('Third quarter complete.');
    const before = JSON.parse(render_game_to_text());
    nextQuarter();
    return { before, after: JSON.parse(render_game_to_text()) };
  });
  expect(carriedIntoFourth.before).toMatchObject({
    mode: 'quarter', pendingNextPossession: 'offense',
    pendingNextStartYardLine: 33, pendingRestartReason: 'punt',
  });
  expect(carriedIntoFourth.after).toMatchObject({
    mode: 'call', quarter: 4, possession: 'offense', absoluteYard: 33, restartReason: 'punt',
  });

  const halftime = await page.evaluate(() => {
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 2, quarterPossessions: 3,
      down: 1, yardsToGo: 10, yardLine: 20, firstDownLine: 30, driveStart: 20,
    });
    finalizePossessionState(state.possessionId, {
      nextPossession: 'defense', nextStartYardLine: 61, restartReason: 'missedFieldGoal',
    });
    const settled = JSON.parse(render_game_to_text());
    routePossessionPresentation('Half complete.');
    const before = JSON.parse(render_game_to_text());
    nextQuarter();
    return { settled, before, after: JSON.parse(render_game_to_text()) };
  });
  expect(halftime.settled).toMatchObject({
    mode: 'call', pendingNextPossession: 'defense',
    pendingNextStartYardLine: 80, pendingRestartReason: 'halftimeKickoff',
  });
  expect(halftime.before).toMatchObject({
    mode: 'halftime', pendingNextPossession: 'defense',
    pendingNextStartYardLine: 80, pendingRestartReason: 'halftimeKickoff',
  });
  expect(halftime.after).toMatchObject({
    mode: 'call', quarter: 3, possession: 'defense', absoluteYard: 80,
    restartReason: 'halftimeKickoff',
  });

  const final = await page.evaluate(() => {
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 4, quarterPossessions: 3,
      down: 1, yardsToGo: 10, yardLine: 20, firstDownLine: 30, driveStart: 20,
    });
    finalizePossessionState(state.possessionId, {
      nextPossession: 'defense', nextStartYardLine: 80, restartReason: 'automaticTouchback',
    });
    routePossessionPresentation('Game complete.');
    return JSON.parse(render_game_to_text());
  });
  expect(final).toMatchObject({
    mode: 'final', pendingNextPossession: null,
    pendingNextStartYardLine: null, pendingRestartReason: null,
  });
});

test('result telemetry publishes settled halftime placement separately from the raw kick transition', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x5c954);
  await page.evaluate(() => {
    window.__halftimeResults = [];
    window.addEventListener('football:result', event => window.__halftimeResults.push(event.detail));
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 2, quarterPossessions: 3,
      down: 4, yardsToGo: 10, yardLine: 50, firstDownLine: 60, driveStart: 20,
    });
  });
  await page.locator('#decision-grid .decision-btn[data-action="punt"]').click();
  const question = await activeContracts(page);
  await answerChoice(page, question.questionInstance.correctChoiceId);
  const after = await activeContracts(page);
  const results = await page.evaluate(() => window.__halftimeResults);
  expect(results).toHaveLength(1);
  expect(results[0].transition.restartReason).toMatch(/^punt/);
  expect(results[0].placement).toEqual({
    nextPossession: 'defense', nextStartYardLine: 80, restartReason: 'halftimeKickoff',
  });
  expect(after.render).toMatchObject({
    quarterPossessions: 4,
    pendingNextPossession: 'defense',
    pendingNextStartYardLine: 80,
    pendingRestartReason: 'halftimeKickoff',
  });
});

test('a Q4 touchdown waits for its fresh conversion before finalizing the possession and game', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x5d254);
  await page.evaluate(() => {
    window.__q4Results = [];
    window.addEventListener('football:result', event => window.__q4Results.push(event.detail));
    const football = () => 0;
    const scheduler = () => 0.25;
    const presentation = () => 0.5;
    window.__footballTest.setRngStreams({ football, scheduler, presentation });
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 4, quarterPossessions: 3,
      down: 1, yardsToGo: 1, yardLine: 99, firstDownLine: 100, driveStart: 80,
      scores: { player: 0, opponent: 0 }, totalYards: { player: 0, opponent: 0 },
      plays: 0, drivePlays: 0,
    });
  });
  await chooseCall(page, 'Short Run');
  const touchdownQuestion = await activeContracts(page);
  expect(touchdownQuestion.activePlay.proposal.resultKind).toBe('touchdown');
  await answerChoice(page, touchdownQuestion.questionInstance.correctChoiceId);
  let game = (await activeContracts(page)).render;
  expect(game).toMatchObject({ mode: 'feedback', score: { player: 6, opponent: 0 }, quarterPossessions: 3 });
  expect(game.pendingNextPossession).toBeNull();

  await page.waitForTimeout(950);
  await expect(page.locator('#ov-td')).toBeVisible();
  await page.locator('#ov-td-btn').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'conversion-decision');
  expect((await activeContracts(page)).render.quarterPossessions).toBe(3);
  await page.locator('#decision-grid .decision-btn[data-action="pat"]').click();
  const conversionQuestion = await activeContracts(page);
  expect(conversionQuestion.activePlay.playType).toBe('conversion');
  expect(conversionQuestion.activePlay.playId).not.toBe(touchdownQuestion.activePlay.playId);
  expect(conversionQuestion.activePlay.contextId).not.toBe(touchdownQuestion.activePlay.contextId);
  expect(conversionQuestion.activePlay.possessionId).toBe(touchdownQuestion.activePlay.possessionId);
  await answerChoice(page, conversionQuestion.questionInstance.correctChoiceId);
  const converted = await activeContracts(page);
  expect(converted.render).toMatchObject({
    mode: 'feedback', score: { player: 7, opponent: 0 }, quarterPossessions: 4,
    pendingNextPossession: null, pendingNextStartYardLine: null, pendingRestartReason: null,
  });
  expect(converted.statsSession.completedPlays.map(row => row.playType)).toEqual(['scrimmage', 'conversion']);
  expect(new Set(converted.statsSession.completedPlays.map(row => row.playId)).size).toBe(2);
  const q4Results = await page.evaluate(() => window.__q4Results);
  expect(q4Results.map(result => result.playType)).toEqual(['scrimmage', 'conversion']);
  expect(q4Results.every(result => result.placement === null)).toBe(true);
  await expect(page.locator('#ov-end')).toBeHidden();
  await page.waitForTimeout(1450);
  await expect(page.locator('#ov-end')).toBeVisible();
  expect((await activeContracts(page)).render.mode).toBe('final');
});

test('production overlay handlers ignore repeated touchdown, transition, and period activation', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x5da54);

  const touchdown = await page.evaluate(() => {
    window.__footballTest.seedDriveState({
      possession: 'defense', direction: -1, quarter: 4, quarterPossessions: 2,
      down: 1, yardsToGo: 10, yardLine: 80, firstDownLine: 70, driveStart: 80,
      scores: { player: 7, opponent: 13 }, opponentTds: 1,
    });
    showTD('defense');
    const firstAccepted = afterTouchdown();
    const before = window.__footballTest.activeContracts();
    const secondAccepted = afterTouchdown();
    const after = window.__footballTest.activeContracts();
    return { firstAccepted, secondAccepted, before, after };
  });
  expect(touchdown.firstAccepted).toBe(true);
  expect(touchdown.secondAccepted).toBe(false);
  expect(touchdown.before.render.mode).toBe('question');
  expect(touchdown.after.activePlay.playId).toBe(touchdown.before.activePlay.playId);
  expect(touchdown.after.activePlay.contextId).toBe(touchdown.before.activePlay.contextId);
  expect(touchdown.after.questionInstance.questionInstanceId)
    .toBe(touchdown.before.questionInstance.questionInstanceId);
  expect(touchdown.after.learning.presented).toBe(touchdown.before.learning.presented);
  expect(touchdown.after.statsSession.completedPlays).toHaveLength(0);

  const transition = await page.evaluate(() => {
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 1, quarterPossessions: 1,
      down: 1, yardsToGo: 10, yardLine: 20, firstDownLine: 30, driveStart: 20,
      pendingNextPossession: 'defense', pendingNextStartYardLine: 64, pendingRestartReason: 'punt',
    });
    showDefenseTransition('Punt complete.');
    const firstAccepted = startDefense();
    const before = JSON.parse(render_game_to_text());
    const secondAccepted = startDefense();
    const after = JSON.parse(render_game_to_text());
    return { firstAccepted, secondAccepted, before, after };
  });
  expect(transition.firstAccepted).toBe(true);
  expect(transition.secondAccepted).toBe(false);
  expect(transition.before).toMatchObject({
    mode: 'call', possession: 'defense', absoluteYard: 64, restartReason: 'punt',
  });
  expect(transition.after.possessionId).toBe(transition.before.possessionId);

  const period = await page.evaluate(() => {
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 1, quarterPossessions: 3,
      down: 1, yardsToGo: 10, yardLine: 20, firstDownLine: 30, driveStart: 20,
    });
    finalizePossessionState(state.possessionId, {
      nextPossession: 'defense', nextStartYardLine: 67, restartReason: 'punt',
    });
    routePossessionPresentation('Quarter complete.');
    const firstAccepted = nextQuarter();
    const before = JSON.parse(render_game_to_text());
    const secondAccepted = nextQuarter();
    const after = JSON.parse(render_game_to_text());
    return { firstAccepted, secondAccepted, before, after };
  });
  expect(period.firstAccepted).toBe(true);
  expect(period.secondAccepted).toBe(false);
  expect(period.before).toMatchObject({
    mode: 'call', quarter: 2, possession: 'defense', absoluteYard: 67, restartReason: 'punt',
  });
  expect(period.after.possessionId).toBe(period.before.possessionId);
  expect(period.after.quarter).toBe(2);
});

test('a failed fourth-down go cannot create a fifth down and the receiving drive starts first-and-ten', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x5e254);
  await page.evaluate(() => {
    const football = () => 0;
    const scheduler = () => 0.25;
    const presentation = () => 0.5;
    window.__footballTest.setRngStreams({ football, scheduler, presentation });
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 1, quarterPossessions: 0,
      down: 4, yardsToGo: 10, yardLine: 50, firstDownLine: 60, driveStart: 20,
      scores: { player: 0, opponent: 0 }, totalYards: { player: 0, opponent: 0 },
      plays: 0, drivePlays: 0,
    });
  });
  await page.locator('#decision-grid .decision-btn[data-action="go"]').click();
  await expect(page.locator('#call-grid .call-btn')).toHaveCount(5);
  await chooseCall(page, 'Short Run');
  const question = await activeContracts(page);
  expect(question.activePlay.proposal.resultKind).toBe('turnoverOnDowns');
  await answerChoice(page, question.questionInstance.correctChoiceId);
  const turnover = await activeContracts(page);
  expect(turnover.render.down).toBe(4);
  expect(turnover.render.pendingRestartReason).toBe('turnoverOnDowns');
  expect(turnover.render.quarterPossessions).toBe(1);
  await page.waitForTimeout(1550);
  await expect(page.locator('#ov-defense')).toBeVisible();
  await page.locator('#ov-defense .ov-btn').click();
  const nextDrive = await activeContracts(page);
  expect(nextDrive.render).toMatchObject({
    mode: 'call', possession: 'defense', down: 1, ytg: 10,
    absoluteYard: turnover.render.pendingNextStartYardLine,
    restartReason: 'turnoverOnDowns',
  });
});

test('invalid context commits nothing and reopens the same defense call with its exact snapshot', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x60654);
  const seeded = await seedDrive(page, DEFENSE_SEED);
  const exactSnapshot = await page.evaluate(() => window.__footballTest.opponentSnapshot());
  const before = await activeContracts(page);
  await page.evaluate(() => window.__footballTest.setQuestionFault('invalid-context'));
  await chooseCall(page, 'Medium Pass D');
  const after = await activeContracts(page);
  const preservedSnapshot = await page.evaluate(() => window.__footballTest.opponentSnapshot());

  expect(after.render.mode).toBe('call');
  expect(after.render.possession).toBe('defense');
  expect(after.render.plays).toBe(seeded.plays);
  expect(after.render.absoluteYard).toBe(seeded.absoluteYard);
  expect(after.render.totalYards).toEqual(seeded.totalYards);
  expect(after.activeSnap).toBeNull();
  expect(after.questionInstance).toBeNull();
  expect(after.pendingResolution).toBeNull();
  expect(after.statsSession.completedPlays).toHaveLength(0);
  expect(after.learning).toEqual(before.learning);
  expect(preservedSnapshot).toEqual(exactSnapshot);
  expect(after.render.opponentSnapshot).toEqual(before.render.opponentSnapshot);
});

test('invalid projection commits nothing and reopens the same defense call with linked diagnostics', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x61654);
  const seeded = await seedDrive(page, DEFENSE_SEED);
  const exactSnapshot = await page.evaluate(() => window.__footballTest.opponentSnapshot());
  const before = await activeContracts(page);
  await page.evaluate(() => {
    window.__diagnostics = [];
    window.addEventListener('football:diagnostic', event => window.__diagnostics.push(event.detail));
    window.__footballTest.setQuestionFault('invalid-projection');
  });
  await chooseCall(page, 'Medium Pass D');
  const after = await activeContracts(page);
  const preservedSnapshot = await page.evaluate(() => window.__footballTest.opponentSnapshot());
  const diagnostics = await page.evaluate(() => window.__diagnostics);

  expect(after.render.mode).toBe('call');
  expect(after.render.plays).toBe(seeded.plays);
  expect(after.render.absoluteYard).toBe(seeded.absoluteYard);
  expect(after.render.totalYards).toEqual(seeded.totalYards);
  expect(after.activeSnap).toBeNull();
  expect(after.questionInstance).toBeNull();
  expect(after.pendingResolution).toBeNull();
  expect(after.statsSession).toEqual(before.statsSession);
  expect(after.learning).toEqual(before.learning);
  expect(preservedSnapshot).toEqual(exactSnapshot);
  expect(after.render.opponentSnapshot).toEqual(before.render.opponentSnapshot);
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]).toMatchObject({
    schemaVersion: 1,
    code: 'invalid-projection',
    familyId: null,
    contextId: expect.any(String),
    questionInstanceId: null,
  });
});

test('a missing defense snapshot rebuilds the visible read and absorbs the first tap', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x62554);
  const seeded = await seedDrive(page, DEFENSE_SEED);
  const before = await activeContracts(page);
  await page.evaluate(() => {
    window.__diagnostics = [];
    window.__results = [];
    window.__learningEvents = [];
    window.__missingSnapshotOriginal = state.opponentSnapshot;
    window.addEventListener('football:diagnostic', event => window.__diagnostics.push(event.detail));
    window.addEventListener('football:result', event => window.__results.push(event.detail));
    window.addEventListener('football:learning', event => window.__learningEvents.push(event.detail));
    state.opponentSnapshot = null;
  });

  await chooseCall(page, 'Run Defense');
  const recovered = await page.evaluate(() => ({
    contracts: window.__footballTest.activeContracts(),
    snapshot: window.__footballTest.opponentSnapshot(),
    newReference: state.opponentSnapshot !== window.__missingSnapshotOriginal,
    diagnostics: window.__diagnostics,
    results: window.__results,
    learningEvents: window.__learningEvents,
  }));

  expect(recovered.contracts.render.mode).toBe('call');
  expect(recovered.contracts.render.possession).toBe('defense');
  expect(recovered.contracts.render.plays).toBe(seeded.plays);
  expect(recovered.contracts.render.absoluteYard).toBe(seeded.absoluteYard);
  expect(recovered.contracts.render.totalYards).toEqual(seeded.totalYards);
  expect(recovered.contracts.activeSnap).toBeNull();
  expect(recovered.contracts.questionInstance).toBeNull();
  expect(recovered.contracts.pendingResolution).toBeNull();
  expect(recovered.contracts.statsSession).toEqual(before.statsSession);
  expect(recovered.contracts.learning).toEqual(before.learning);
  expect(recovered.snapshot).toBeTruthy();
  expect(recovered.newReference).toBe(true);
  expect(recovered.contracts.render.opponentSnapshot).toBeTruthy();
  expect(recovered.contracts.render.defenseRead).toMatch(/^Pre-snap read:/);
  expect(recovered.contracts.render.defenseRead).not.toContain('plannedCallKey');
  expect(recovered.diagnostics).toEqual([
    expect.objectContaining({ schemaVersion: 1, code: 'missing-opponent-snapshot' }),
  ]);
  expect(recovered.results).toEqual([]);
  expect(recovered.learningEvents).toEqual([]);

  await chooseCall(page, 'Run Defense');
  const afterSecondTap = await activeContracts(page);
  expect(afterSecondTap.render.mode).toBe('question');
  expect(afterSecondTap.activeSnap.context.privateOpponentSnapshot).toEqual(recovered.snapshot);
  expect(afterSecondTap.statsSession.completedPlays).toHaveLength(0);
});

test('late question preparation failure uses the same exact-proposal bypass contract', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x62654);
  const seeded = await seedDrive(page, DEFENSE_SEED);
  const before = await activeContracts(page);
  await page.evaluate(() => {
    window.__diagnostics = [];
    window.__results = [];
    window.__learningEvents = [];
    window.addEventListener('football:diagnostic', event => window.__diagnostics.push(event.detail));
    window.addEventListener('football:result', event => window.__results.push(event.detail));
    window.addEventListener('football:learning', event => window.__learningEvents.push(event.detail));
    window.__footballTest.setQuestionFault('prepare-after-ui');
  });

  await chooseCall(page, 'Run Defense');
  await page.evaluate(() => window.__footballTest.setQuestionFault(null));

  const after = await activeContracts(page);
  const events = await page.evaluate(() => ({
    diagnostics: window.__diagnostics,
    results: window.__results,
    learning: window.__learningEvents,
  }));

  expect(after.render.mode).toBe('feedback');
  expect(after.render.plays).toBe(seeded.plays + 1);
  expect(after.activeSnap).not.toBeNull();
  expect(after.questionInstance).toBeNull();
  expect(after.pendingResolution.policy).toBe('questionBypass');
  expect(after.questionUi.outcomeCommitted).toBe(true);
  expect(after.statsSession.completedPlays).toHaveLength(1);
  expect(after.statsSession.completedPlays[0]).toMatchObject({
    instructionalStatus: 'bypassed',
    question: null,
    resolution: null,
  });
  expect(after.learning).toEqual(before.learning);
  expect(events.results).toHaveLength(1);
  expect(events.results[0]).toMatchObject({
    schemaVersion: 2,
    policy: 'questionBypass',
    playType: 'scrimmage',
  });
  expect(events.learning).toEqual([]);
  expect(events.diagnostics).toHaveLength(1);
  expect(events.diagnostics[0]).toMatchObject({
    schemaVersion: 1,
    code: 'question-presentation-failure',
    familyId: expect.any(String),
    contextId: expect.any(String),
    questionInstanceId: expect.any(String),
  });
  const bypassLinks = {
    familyId: events.diagnostics[0].familyId,
    contextId: events.diagnostics[0].contextId,
    questionInstanceId: events.diagnostics[0].questionInstanceId,
  };
  expect(after.pendingResolution).toMatchObject(bypassLinks);
  expect(after.statsSession.completedPlays[0].links).toEqual(bypassLinks);
  expect(events.results[0]).toMatchObject(bypassLinks);
});

test('a throwing diagnostic observer cannot block deterministic question bypass', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x62655);
  const seeded = await seedDrive(page, OFFENSE_SEED);
  const before = await activeContracts(page);
  await page.evaluate(() => {
    const dispatch = window.dispatchEvent.bind(window);
    window.__thrownObserverEvents = [];
    window.dispatchEvent = (event) => {
      if (event?.type === 'football:diagnostic') {
        window.__thrownObserverEvents.push(event.type);
        throw new Error('Injected diagnostic observer failure.');
      }
      return dispatch(event);
    };
    window.__footballTest.setQuestionFault('empty-pool');
  });

  await chooseCall(page, 'Short Run');
  const after = await activeContracts(page);
  const thrown = await page.evaluate(() => window.__thrownObserverEvents);
  await page.evaluate(() => window.__footballTest.setQuestionFault(null));

  expect(thrown).toEqual(['football:diagnostic']);
  expect(after.render.mode).toBe('feedback');
  expect(after.render.plays).toBe(seeded.plays + 1);
  expect(after.pendingResolution.policy).toBe('questionBypass');
  expect(after.statsSession.completedPlays).toHaveLength(before.statsSession.completedPlays.length + 1);
  expect(after.statsSession.completedPlays.at(-1)).toMatchObject({
    instructionalStatus: 'bypassed',
    question: null,
    resolution: null,
  });
  expect(after.learning).toEqual(before.learning);
});

test('throwing learning and result observers cannot interrupt a committed play', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x62656);
  const seeded = await seedDrive(page, OFFENSE_SEED);
  const before = await activeContracts(page);
  await page.evaluate(() => {
    const dispatch = window.dispatchEvent.bind(window);
    window.__thrownObserverEvents = [];
    window.dispatchEvent = (event) => {
      if (event?.type === 'football:learning' || event?.type === 'football:result') {
        window.__thrownObserverEvents.push(
          event.type === 'football:learning' ? `${event.type}:${event.detail?.type}` : event.type,
        );
        throw new Error(`Injected ${event.type} observer failure.`);
      }
      return dispatch(event);
    };
  });

  await chooseCall(page, 'Short Run');
  const presented = await activeContracts(page);
  expect(presented.render.mode).toBe('question');
  expect(presented.render.plays).toBe(seeded.plays);
  expect(presented.pendingResolution.policy).toBe('awaitingAnswer');
  expect(await page.evaluate(() => pendingStatsPlay.instructionalStatus)).toBe('presented');

  await answerChoice(page, 'correct');
  const committed = await activeContracts(page);
  const surfaces = await page.evaluate(async () => {
    if (navigator.locks && typeof navigator.locks.request === 'function') {
      await navigator.locks.request(
        `${FOOTBALL_STATS.STORAGE_KEY}:central-write`,
        { mode: 'exclusive' },
        () => {},
      );
    }
    return {
      thrown: window.__thrownObserverEvents,
      history: FOOTBALL_STATS.history(),
      persisted: JSON.parse(localStorage.getItem(FOOTBALL_STATS.STORAGE_KEY)),
    };
  });
  const row = committed.statsSession.completedPlays.at(-1);

  expect(committed.render.mode).toBe('feedback');
  expect(committed.render.plays).toBe(seeded.plays + 1);
  expect(committed.statsSession.completedPlays).toHaveLength(before.statsSession.completedPlays.length + 1);
  expect(row).toMatchObject({
    instructionalStatus: 'presented',
    resolution: 'firstTryCorrect',
  });
  expect(committed.learning.events.slice(before.learning.events.length).map(event => event.type))
    .toEqual(['presented', 'attempt', 'resolved']);
  expect(surfaces.thrown).toEqual([
    'football:learning:presented',
    'football:learning:attempt',
    'football:learning:resolved',
    'football:result',
  ]);
  expect(surfaces.history.aggregates.completedPlays).toBe(1);
  expect(surfaces.history.recentPlays).toHaveLength(1);
  expect(surfaces.persisted.aggregates.completedPlays).toBe(1);
  expect(surfaces.persisted.recentPlays).toHaveLength(1);
  expect(surfaces.persisted.recentPlays[0].playId).toBe(row.playId);

  await expect.poll(() => page.evaluate(() => JSON.parse(render_game_to_text()).mode)).toBe('call');
  expect((await activeContracts(page)).render.plays).toBe(seeded.plays + 1);
});

test('a frozen defense snap owns the exact pre-snap plan without leaking it to public telemetry', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x63654);
  await seedDrive(page, DEFENSE_SEED);
  const preSnap = await page.evaluate(() => window.__footballTest.opponentSnapshot());
  await page.evaluate(() => {
    window.__publicEvents = { learning: [], result: [], diagnostic: [] };
    for (const type of Object.keys(window.__publicEvents)) {
      window.addEventListener(`football:${type}`, event => window.__publicEvents[type].push(event.detail));
    }
  });
  await chooseCall(page, 'Run Defense');
  const before = await activeContracts(page);
  const ownership = await page.evaluate(() => ({
    sameCanonicalReference: state.activeSnap.context.privateOpponentSnapshot === state.opponentSelectionSnapshot,
    sameActivePlayReference: state.activeSnap.context.privateOpponentSnapshot
      === state.activePlay.context.privateOpponentSnapshot,
    sameContextReference: state.activeSnap.context === state.activePlay.context,
    sameProposalReference: state.activeSnap.proposal === state.activePlay.proposal,
    sameCallReference: state.activeSnap.call === state.activePlay.call,
    frozen: Object.isFrozen(state.activeSnap.context.privateOpponentSnapshot)
      && Object.isFrozen(state.activeSnap.context.privateOpponentSnapshot.look),
  }));

  expect(before.activeSnap.context.privateOpponentSnapshot).toEqual(preSnap);
  expect(before.activeSnap.context.privateOpponentSnapshot.plannedCallKey)
    .toBe(before.activeSnap.context.calls.offense);
  expect(ownership).toEqual({
    sameCanonicalReference: true,
    sameActivePlayReference: true,
    sameContextReference: true,
    sameProposalReference: true,
    sameCallReference: true,
    frozen: true,
  });
  await answerChoice(page, before.questionInstance.correctChoiceId);

  const publicPayload = await page.evaluate(() => ({
    render: JSON.parse(window.render_game_to_text()),
    stats: window.__footballTest.statsSession(),
    events: window.__publicEvents,
  }));
  expect(publicPayload.stats.completedPlays[0].calls).toEqual({
    offense: before.activeSnap.context.calls.offense,
    defense: before.activeSnap.context.calls.defense,
    opponent: before.activeSnap.context.privateOpponentSnapshot.plannedCallKey,
    matchup: before.activeSnap.context.calls.matchup,
  });
  const serialized = JSON.stringify(publicPayload);
  expect(serialized).not.toContain('privateOpponentSnapshot');
  expect(serialized).not.toContain('plannedCallKey');
});

test('scheduler and presentation draw perturbations cannot alter the football trace', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page);

  async function runTrace({ schedulerBurn, presentationBurn }) {
    await page.evaluate(({ seed, schedulerBurnCount, presentationBurnCount, drive }) => {
      function makeRng(initialSeed) {
        let value = initialSeed >>> 0;
        return () => {
          value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
          return value / 0x100000000;
        };
      }
      const football = makeRng(seed);
      const schedulerSource = makeRng(0xa11ce);
      const presentationSource = makeRng(0xb00c5);
      const counts = { football: 0, scheduler: 0, presentation: 0 };
      const footballStream = () => { counts.football++; return football(); };
      const schedulerStream = () => { counts.scheduler++; return schedulerSource(); };
      const presentationStream = () => { counts.presentation++; return presentationSource(); };
      window.__footballDrawCounts = counts;
      window.__footballTest.setRngStreams({
        football: footballStream,
        scheduler: schedulerStream,
        presentation: presentationStream,
      });
      for (let index = 0; index < schedulerBurnCount; index++) schedulerStream();
      for (let index = 0; index < presentationBurnCount; index++) presentationStream();
      window.__footballTest.setQuestionFault(null);
      window.__footballTest.seedDriveState(drive);
    }, {
      seed: 0x70754,
      schedulerBurnCount: schedulerBurn,
      presentationBurnCount: presentationBurn,
      drive: DEFENSE_SEED,
    });
    await chooseCall(page, 'Short Pass D');
    return page.evaluate(() => ({
      contracts: window.__footballTest.activeContracts(),
      draws: { ...window.__footballDrawCounts },
    }));
  }

  function footballTrace(result) {
    const snap = structuredClone(result.contracts.activeSnap);
    delete snap.contextId;
    delete snap.context.contextId;
    delete snap.proposal.contextId;
    return snap;
  }

  const ordinary = await runTrace({ schedulerBurn: 0, presentationBurn: 0 });
  const perturbed = await runTrace({ schedulerBurn: 9, presentationBurn: 13 });

  expect(ordinary.draws.football).toBeGreaterThan(0);
  expect(ordinary.draws.scheduler).toBeGreaterThan(0);
  expect(ordinary.draws.presentation).toBeGreaterThan(0);
  expect(perturbed.draws.scheduler).toBeGreaterThan(ordinary.draws.scheduler);
  expect(perturbed.draws.presentation).toBeGreaterThan(ordinary.draws.presentation);
  expect(perturbed.draws.football).toBe(ordinary.draws.football);
  expect(footballTrace(perturbed)).toEqual(footballTrace(ordinary));
});

test('every entry path initializes one fresh learning/RNG session exactly once', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.addInitScript(() => {
    const original = Math.random.bind(Math);
    window.__rootRandomDraws = 0;
    Math.random = () => {
      window.__rootRandomDraws++;
      return original();
    };
  });

  await page.goto('/football/');
  expect(await page.evaluate(() => window.__footballTest.learningState())).toBeNull();
  expect(await page.evaluate(() => window.__rootRandomDraws)).toBe(0);
  await page.locator('#ov-start .ov-btn').click();
  expect(await page.evaluate(() => window.__footballTest.learningState())).not.toBeNull();
  expect(await page.evaluate(() => window.__rootRandomDraws)).toBe(1);
  const firstGameId = await page.evaluate(() => window.__footballTest.statsSession().gameId);
  expect(await page.evaluate(() => {
    try {
      initGameSession();
      return null;
    } catch (error) {
      return error.message;
    }
  })).toMatch(/already initialized/i);

  await page.evaluate(() => restart());
  expect(await page.evaluate(() => window.__footballTest.learningState())).toBeNull();
  expect(await page.evaluate(() => window.__rootRandomDraws)).toBe(1);
  await page.locator('#ov-start .ov-btn').click();
  expect(await page.evaluate(() => window.__footballTest.learningState())).not.toBeNull();
  expect(await page.evaluate(() => window.__rootRandomDraws)).toBe(2);
  expect(await page.evaluate(() => window.__footballTest.statsSession().gameId)).not.toBe(firstGameId);

  for (const boot of ['offense-call', 'defense-call']) {
    await page.goto(`/football/?boot=${boot}`);
    expect(await page.evaluate(() => window.__footballTest.learningState())).not.toBeNull();
    expect(await page.evaluate(() => window.__rootRandomDraws)).toBe(1);
  }
});
