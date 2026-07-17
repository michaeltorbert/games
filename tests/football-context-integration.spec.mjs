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
  await page.evaluate(() => { state.playerScore += 1; });
  const rejected = await answerChoice(page, before.questionInstance.correctChoiceId);

  expect(rejected.render.mode).toBe('call');
  expect(rejected.render.plays).toBe(seeded.plays);
  expect(rejected.statsSession).toEqual(before.statsSession);
  expect(rejected.statsSession.completedPlays).toHaveLength(0);
  expect(rejected.activeSnap).toBeNull();
  expect(rejected.questionInstance).toBeNull();
  expect(rejected.pendingResolution).toBeNull();
  expect(await page.evaluate(() => pendingStatsPlay)).toBeNull();

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
    state.activeSnap = FOOTBALL_DOMAIN.deepFreeze({
      ...FOOTBALL_DOMAIN.clone(state.activeSnap),
      call: { ...FOOTBALL_DOMAIN.clone(state.activeSnap.call), key: 'unknown-call' },
    });
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
    const offenseSnap = FOOTBALL_DOMAIN.createSnap(base, { gain: 8, callKey: 'longRun' });
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
    });
    const nearGoalSnap = FOOTBALL_DOMAIN.createSnap({
      ...defenseContext,
      contextId: 'policy-probe-near-goal',
      yardLine: 2,
      firstDownLine: 0,
      yardsToGo: 2,
      driveStart: 20,
    }, { gain: 8, callKey: privateOpponentSnapshot.plannedCallKey });
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

    const previousSnap = state.activeSnap;
    const creationChecks = cases.map(([snap, policy, expectedGain, outcomeOptions]) => {
      const neighboringGain = expectedGain === 0 ? 1 : expectedGain - 1;
      state.activeSnap = snap;
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
      }, { gain: 8, callKey });
      const outcome = secondMissOutcomeForSnap(snap);
      const transition = FOOTBALL_DOMAIN.reprojectGain(snap, outcome.requestedGain,
        outcome.resultReason ? {
          resultKind: outcome.resultKind || undefined, resultReason: outcome.resultReason,
        } : null);
      return { callKey, ...outcome, transition, valid: validateResolutionTransition(snap, 'secondMiss', transition).ok };
    });
  });

  expect(outcomes.map(({ callKey, requestedGain, resultKind, resultReason, valid }) => ({
    callKey, requestedGain, resultKind, resultReason, valid,
  }))).toEqual([
    { callKey: 'shortRun', requestedGain: -1, resultKind: null, resultReason: 'stuff', valid: true },
    { callKey: 'shortPass', requestedGain: 0, resultKind: null, resultReason: 'incompletion', valid: true },
    { callKey: 'mediumPass', requestedGain: -3, resultKind: null, resultReason: 'sack', valid: true },
    { callKey: 'longRun', requestedGain: -2, resultKind: 'turnover', resultReason: 'fumble', valid: true },
    { callKey: 'longPass', requestedGain: 0, resultKind: 'turnover', resultReason: 'interception', valid: true },
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

for (const fault of ['empty-pool', 'build-throw', 'malformed']) {
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
    expect(row.links.familyId).toBeNull();
    expect(row.links.contextId).toEqual(expect.anything());
    expect(row.links.questionInstanceId).toBeNull();
    expect(after.learning).toEqual(before.learning);

    const diagnostics = await page.evaluate(() => window.__diagnostics);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toEqual(expect.objectContaining({
      schemaVersion: 1,
      code: fault === 'malformed' ? 'malformed-question' : fault,
      contextId: row.links.contextId,
    }));
    expect(diagnostics[0]).toHaveProperty('familyId');
    expect(diagnostics[0]).toHaveProperty('questionInstanceId');
    if (fault === 'empty-pool') {
      expect(diagnostics[0].familyId).toBeNull();
      expect(diagnostics[0].questionInstanceId).toBeNull();
    } else {
      expect(diagnostics[0].familyId).toEqual(expect.any(String));
      if (fault === 'malformed') expect(diagnostics[0].questionInstanceId).toEqual(expect.any(String));
    }
  });
}

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

test('late question preparation failure rolls back and never masquerades as a bypass', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await cleanBoot(page, 0x62654);
  const seeded = await seedDrive(page, DEFENSE_SEED);
  const exactSnapshot = await page.evaluate(() => window.__footballTest.opponentSnapshot());
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

  const pageError = page.waitForEvent('pageerror');
  await chooseCall(page, 'Run Defense');
  expect((await pageError).message).toMatch(/preparation failure/i);
  await page.evaluate(() => window.__footballTest.setQuestionFault(null));

  const after = await activeContracts(page);
  const preservedSnapshot = await page.evaluate(() => window.__footballTest.opponentSnapshot());
  const events = await page.evaluate(() => ({
    diagnostics: window.__diagnostics,
    results: window.__results,
    learning: window.__learningEvents,
  }));

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
  expect(events.results).toEqual([]);
  expect(events.learning).toEqual([]);
  expect(events.diagnostics).toHaveLength(1);
  expect(events.diagnostics[0]).toMatchObject({
    schemaVersion: 1,
    code: 'question-presentation-failure',
    familyId: expect.any(String),
    contextId: expect.any(String),
    questionInstanceId: expect.any(String),
  });
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
    frozen: Object.isFrozen(state.activeSnap.context.privateOpponentSnapshot)
      && Object.isFrozen(state.activeSnap.context.privateOpponentSnapshot.look),
  }));

  expect(before.activeSnap.context.privateOpponentSnapshot).toEqual(preSnap);
  expect(before.activeSnap.context.privateOpponentSnapshot.plannedCallKey)
    .toBe(before.activeSnap.context.calls.offense);
  expect(ownership).toEqual({ sameCanonicalReference: true, frozen: true });
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
