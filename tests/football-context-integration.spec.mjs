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

async function continueTwiceSynchronously(page) {
  return page.evaluate(() => {
    const button = document.getElementById('question-continue');
    button.click();
    button.click();
    return window.__footballTest.activeContracts();
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
    }).eligible;
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

test('a second offense miss freezes zero gain until Continue and double Continue is idempotent', async ({ page }, testInfo) => {
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

  const after = await continueTwiceSynchronously(page);
  expect(after.render.plays).toBe(seeded.plays + 1);
  expect(after.render.absoluteYard).toBe(seeded.absoluteYard);
  expect(after.render.totalYards).toEqual(seeded.totalYards);
  expect(after.statsSession.completedPlays).toHaveLength(1);
  expect(after.statsSession.completedPlays[0]).toMatchObject({ actualYards: 0 });
  expect(after.learning.resolved).toBe(before.learning.resolved + 1);
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

  const after = await continueTwiceSynchronously(page);
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
