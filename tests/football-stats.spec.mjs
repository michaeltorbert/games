import { test, expect } from '@playwright/test';

function primaryOnly(testInfo) {
  test.skip(testInfo.project.name !== 'ipad-11-landscape', 'Persistent stats checks run once on the primary target.');
}

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

test('presented rows preserve learning semantics, link IDs, and private content boundaries', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const errors = trackErrors(page);
  await page.goto('/football/');

  const result = await page.evaluate(() => {
    localStorage.removeItem(FOOTBALL_STATS.STORAGE_KEY);
    const context = (plays, score = { player: 0, opponent: 0 }) => ({
      quarter: 1,
      possession: 'offense',
      down: 1,
      yardsToGo: 10,
      yardLine: 20,
      firstDownLine: 30,
      direction: 1,
      score,
      plays,
      drivePlays: plays,
    });
    const session = FOOTBALL_STATS.createSession();
    const gate = FOOTBALL_STATS.beginPlay(session, {
      preSnap: context(0),
      calls: { offense: 'shortRun' },
      offeredYards: 4,
      links: {
        familyId: 'line-to-gain-remainder',
        contextId: 'context-1',
        questionInstanceId: 'question-1',
      },
      question: {
        id: 'legacy-family-alias',
        skill: 'difference',
        concept: 'line-to-gain',
        purpose: 'weakSpot',
        grading: 'gate',
        tier: 'within-10',
        prompt: 'How many yards are left?',
        choices: [4, 5, 6, 7],
        correct: 6,
      },
    });
    FOOTBALL_STATS.recordAttempt(gate, { number: 1, correct: true, support: 'none', selectedChoiceId: 'choice-a' });
    FOOTBALL_STATS.recordResolution(gate, 'firstTryCorrect');
    const gateRow = FOOTBALL_STATS.completePlay(session, gate, {
      actualYards: 4,
      outcome: 'gain',
      postPlay: context(1),
    });

    const preview = FOOTBALL_STATS.beginPlay(session, {
      preSnap: context(1),
      calls: { offense: 'shortPass' },
      offeredYards: 5,
      question: {
        id: 'preview-family',
        skill: 'comparison',
        concept: 'two-digit-comparison',
        purpose: 'currentSupported',
        grading: 'noStakes',
        tier: 'supported',
      },
    });
    FOOTBALL_STATS.recordAttempt(preview, { number: 1, correct: false, support: 'guided' });
    FOOTBALL_STATS.recordResolution(preview, 'secondMiss');
    FOOTBALL_STATS.completePlay(session, preview, {
      actualYards: 5,
      outcome: 'gain',
      postPlay: context(2),
    });

    return {
      gateRow,
      duplicate: FOOTBALL_STATS.completePlay(session, gate, {
        actualYards: 4,
        outcome: 'gain',
        postPlay: context(1),
      }),
      history: FOOTBALL_STATS.history(),
      raw: localStorage.getItem(FOOTBALL_STATS.STORAGE_KEY),
      session: FOOTBALL_STATS.sessionSnapshot(session),
    };
  });

  expect(result.history.schemaVersion).toBe(2);
  expect(result.history.recentPlays).toHaveLength(2);
  expect(result.history.aggregates).toMatchObject({
    completedPlays: 2,
    actualYards: 9,
    byPossession: { offense: 2, defense: 0 },
    learning: {
      gradedPlays: 1,
      noStakesPlays: 1,
      firstTryCorrect: 1,
      retryCorrect: 0,
      secondMiss: 0,
    },
  });
  expect(result.history.mastery).toEqual({
    'line-to-gain': { resolved: 1, firstTryCorrect: 1, retryCorrect: 0, secondMiss: 0 },
  });
  expect(result.gateRow).toMatchObject({
    instructionalStatus: 'presented',
    links: {
      familyId: 'line-to-gain-remainder',
      contextId: 'context-1',
      questionInstanceId: 'question-1',
    },
    resolution: 'firstTryCorrect',
  });
  expect(result.gateRow.question).toEqual({
    id: 'legacy-family-alias',
    skill: 'difference',
    concept: 'line-to-gain',
    purpose: 'weakSpot',
    grading: 'gate',
    tier: 'within-10',
  });
  expect(result.gateRow.attempts).toEqual([
    expect.objectContaining({ number: 1, correct: true, elapsedMs: expect.any(Number), support: 'none' }),
  ]);
  expect(result.gateRow.attempts[0]).not.toHaveProperty('selectedChoiceId');
  expect(result.duplicate).toBe(false);
  expect(result.session.completedPlays).toHaveLength(2);
  expect(result.raw).not.toContain('How many yards are left?');
  expect(result.raw).not.toContain('choices');
  expect(result.raw).not.toContain('correctChoice');
  expect(errors).toEqual([]);
});

test('bypassed plays persist football results exactly once without learning or mastery', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const errors = trackErrors(page);
  await page.goto('/football/');

  const result = await page.evaluate(() => {
    localStorage.removeItem(FOOTBALL_STATS.STORAGE_KEY);
    const context = (plays, yardLine, opponentScore = 0) => ({
      quarter: 4,
      possession: 'defense',
      down: 2,
      yardsToGo: 6,
      yardLine,
      firstDownLine: 40,
      direction: -1,
      score: { player: 7, opponent: opponentScore },
      plays,
      drivePlays: plays,
    });
    const session = FOOTBALL_STATS.createSession();
    const pending = FOOTBALL_STATS.beginBypassedPlay(session, {
      preSnap: context(0, 17),
      calls: { defense: 'deepPass', opponent: 'longPass', matchup: 'mismatch' },
      offeredYards: 17,
      links: { contextId: 'context-9' },
      question: {
        prompt: 'This must never persist',
        choices: ['secret'],
        correct: 'secret',
      },
    });
    const attempted = FOOTBALL_STATS.recordAttempt(pending, {
      number: 1,
      correct: true,
      support: 'none',
    });
    const resolved = FOOTBALL_STATS.recordResolution(pending, 'firstTryCorrect');
    const wrongCompleter = FOOTBALL_STATS.completePlay(session, pending, {
      actualYards: 17,
      outcome: 'touchdown',
      postPlay: context(1, 0, 7),
    });
    const row = FOOTBALL_STATS.completeBypassedPlay(session, pending, {
      actualYards: 17,
      outcome: 'touchdown',
      postPlay: context(1, 0, 7),
    });
    const duplicate = FOOTBALL_STATS.completeBypassedPlay(session, pending, {
      actualYards: 17,
      outcome: 'touchdown',
      postPlay: context(1, 0, 7),
    });
    return {
      attempted,
      resolved,
      wrongCompleter,
      row,
      duplicate,
      history: FOOTBALL_STATS.history(),
      session: FOOTBALL_STATS.sessionSnapshot(session),
      raw: localStorage.getItem(FOOTBALL_STATS.STORAGE_KEY),
    };
  });

  expect(result.attempted).toBe(false);
  expect(result.resolved).toBe(false);
  expect(result.wrongCompleter).toBe(false);
  expect(result.duplicate).toBe(false);
  expect(result.row).toMatchObject({
    instructionalStatus: 'bypassed',
    links: { familyId: null, contextId: 'context-9', questionInstanceId: null },
    question: null,
    attempts: [],
    resolution: null,
    actualYards: 17,
    outcome: 'touchdown',
  });
  expect(result.history.recentPlays).toEqual([result.row]);
  expect(result.history.aggregates).toMatchObject({
    completedPlays: 1,
    actualYards: 17,
    byPossession: { offense: 0, defense: 1 },
    byOutcome: { touchdown: 1 },
    learning: {
      gradedPlays: 0,
      noStakesPlays: 0,
      firstTryCorrect: 0,
      retryCorrect: 0,
      secondMiss: 0,
    },
  });
  expect(result.history.mastery).toEqual({});
  expect(result.session.completedPlays).toEqual([result.row]);
  expect(result.raw).not.toContain('This must never persist');
  expect(result.raw).not.toContain('secret');
  expect(errors).toEqual([]);
});

test('schema-v1 history normalizes without a read write and persists on the next real play', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.addInitScript(() => {
    const context = {
      quarter: 2,
      possession: 'offense',
      down: 3,
      yardsToGo: 4,
      yardLine: 46,
      firstDownLine: 50,
      direction: 1,
      score: { player: 7, opponent: 7 },
      plays: 8,
      drivePlays: 3,
    };
    const raw = JSON.stringify({
      schemaVersion: 1,
      aggregates: {
        completedPlays: 1,
        actualYards: 4,
        byPossession: { offense: 1, defense: 0 },
        byOutcome: { firstDown: 1 },
        learning: {
          gradedPlays: 1,
          noStakesPlays: 0,
          firstTryCorrect: 0,
          retryCorrect: 1,
          secondMiss: 0,
        },
      },
      recentPlays: [{
        id: 'play-legacy',
        gameId: 'game-legacy',
        sequence: 8,
        completedAt: '2026-07-13T12:00:00.000Z',
        preSnap: context,
        calls: { offense: 'shortPass' },
        offeredYards: 4,
        question: {
          id: 'legacy-family',
          skill: 'difference',
          concept: 'line-to-gain',
          purpose: 'weakSpot',
          grading: 'gate',
          tier: 'within-10',
        },
        attempts: [
          { number: 1, correct: false, elapsedMs: 500, support: 'none' },
          { number: 2, correct: true, elapsedMs: 600, support: 'guided' },
        ],
        resolution: 'retryCorrect',
        actualYards: 4,
        outcome: 'firstDown',
        postPlay: { ...context, down: 1, yardsToGo: 10, yardLine: 50, firstDownLine: 60, plays: 9 },
      }],
      mastery: {
        'line-to-gain': { resolved: 1, firstTryCorrect: 0, retryCorrect: 1, secondMiss: 0 },
      },
    });
    localStorage.setItem('footballMathStats:v1', raw);
    window.__legacyStatsRaw = raw;
  });
  await page.goto('/football/');

  const result = await page.evaluate(() => {
    const history = FOOTBALL_STATS.history();
    const rawBeforeWrite = localStorage.getItem(FOOTBALL_STATS.STORAGE_KEY);
    const preSnap = history.recentPlays[0].postPlay;
    const session = FOOTBALL_STATS.createSession();
    const pending = FOOTBALL_STATS.beginBypassedPlay(session, {
      preSnap,
      calls: { offense: 'shortRun' },
      offeredYards: 2,
      links: { familyId: null, contextId: 'context-next', questionInstanceId: null },
    });
    FOOTBALL_STATS.completeBypassedPlay(session, pending, {
      actualYards: 2,
      outcome: 'gain',
      postPlay: { ...preSnap, yardLine: preSnap.yardLine + 2, plays: preSnap.plays + 1 },
    });
    return {
      history,
      seededRaw: window.__legacyStatsRaw,
      rawBeforeWrite,
      rawAfterWrite: JSON.parse(localStorage.getItem(FOOTBALL_STATS.STORAGE_KEY)),
    };
  });

  expect(result.rawBeforeWrite).toBe(result.seededRaw);
  expect(JSON.parse(result.rawBeforeWrite).schemaVersion).toBe(1);
  expect(result.history.schemaVersion).toBe(2);
  expect(result.history.aggregates).toMatchObject({
    completedPlays: 1,
    actualYards: 4,
    byPossession: { offense: 1, defense: 0 },
    byOutcome: { firstDown: 1 },
    learning: { gradedPlays: 1, retryCorrect: 1 },
  });
  expect(result.history.mastery).toEqual({
    'line-to-gain': { resolved: 1, firstTryCorrect: 0, retryCorrect: 1, secondMiss: 0 },
  });
  expect(result.history.recentPlays).toHaveLength(1);
  expect(result.history.recentPlays[0]).toMatchObject({
    id: 'play-legacy',
    gameId: 'game-legacy',
    sequence: 8,
    instructionalStatus: 'presented',
    links: { familyId: 'legacy-family', contextId: null, questionInstanceId: null },
    resolution: 'retryCorrect',
  });
  expect(result.rawAfterWrite.schemaVersion).toBe(2);
  expect(result.rawAfterWrite.recentPlays).toHaveLength(2);
  expect(result.rawAfterWrite.recentPlays[1]).toMatchObject({
    instructionalStatus: 'bypassed',
    links: { familyId: null, contextId: 'context-next', questionInstanceId: null },
  });
});

test('learning snapshots select the newest valid graded evidence without mutating stored history', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.addInitScript(() => {
    const context = {
      quarter: 2, possession: 'offense', down: 2, yardsToGo: 6,
      yardLine: 34, firstDownLine: 40, direction: 1,
      score: { player: 14, opponent: 10 }, plays: 7, drivePlays: 2,
    };
    const question = (concept, grading = 'gate') => ({
      id: `family-${concept}-${grading}`, skill: 'difference', concept,
      purpose: 'weakSpot', grading, tier: 'within-10',
    });
    const row = (id, concept, resolution, completedAt, grading = 'gate') => ({
      id, gameId: 'game-history', sequence: Number(id.replace(/\D/g, '')) || 1,
      ...(completedAt === undefined ? {} : { completedAt }),
      instructionalStatus: 'presented',
      preSnap: context, calls: { offense: 'shortRun' }, offeredYards: 4,
      question: question(concept, grading), attempts: [], resolution,
      actualYards: 4, outcome: 'gain', postPlay: { ...context, yardLine: 38, plays: 8 },
    });
    const recentPlays = [
      row('row-1', 'line-to-gain', 'firstTryCorrect', '2026-06-01T12:00:00.000Z'),
      row('row-2', 'field-distance', 'secondMiss', '2026-06-02T12:00:00.000Z'),
      row('row-3', 'line-to-gain', 'retryCorrect', '2026-07-05T12:00:00.000Z'),
      row('row-4', 'line-to-gain', 'secondMiss', 'not-a-date'),
      row('row-5', 'line-to-gain', 'retryCorrect', undefined),
      row('row-6', 'line-to-gain', 'secondMiss', '2026-07-12T12:00:00.000Z', 'noStakes'),
      {
        id: 'row-7', gameId: 'game-history', sequence: 7,
        completedAt: '2026-07-13T12:00:00.000Z', instructionalStatus: 'bypassed',
        preSnap: context, calls: { offense: 'shortRun' }, offeredYards: 4,
        actualYards: 4, outcome: 'gain', postPlay: { ...context, yardLine: 38, plays: 8 },
      },
    ];
    const raw = JSON.stringify({
      schemaVersion: 2,
      aggregates: {},
      recentPlays,
      mastery: {
        'line-to-gain': { resolved: 5, firstTryCorrect: 4, retryCorrect: 1, secondMiss: 0 },
        'field-distance': { resolved: 1, firstTryCorrect: 0, retryCorrect: 0, secondMiss: 1 },
      },
    });
    localStorage.setItem('footballMathStats:v1', raw);
    window.__learningStatsRaw = raw;
  });
  await page.goto('/football/');

  const result = await page.evaluate(() => {
    const first = FOOTBALL_STATS.learningSnapshot();
    first.mastery['line-to-gain'].firstTryCorrect = 999;
    first.lastResolvedByConcept['line-to-gain'].resolution = 'secondMiss';
    const second = FOOTBALL_STATS.learningSnapshot();
    const history = FOOTBALL_STATS.history();
    return {
      seededRaw: window.__learningStatsRaw,
      rawAfterReads: localStorage.getItem(FOOTBALL_STATS.STORAGE_KEY),
      second,
      malformedDate: history.recentPlays.find(row => row.id === 'row-4').completedAt,
      missingDate: history.recentPlays.find(row => row.id === 'row-5').completedAt,
    };
  });

  expect(result.rawAfterReads).toBe(result.seededRaw);
  expect(result.second.mastery['line-to-gain']).toEqual({
    resolved: 5, firstTryCorrect: 4, retryCorrect: 1, secondMiss: 0,
  });
  expect(result.second.lastResolvedByConcept).toEqual({
    'field-distance': { completedAt: '2026-06-02T12:00:00.000Z', resolution: 'secondMiss' },
    'line-to-gain': { completedAt: '2026-07-05T12:00:00.000Z', resolution: 'retryCorrect' },
  });
  expect(result.malformedDate).toBe('not-a-date');
  expect(result.missingDate).toBeNull();
});

test('history remains capped, completion is deduplicated, and stats IDs consume no Math.random', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/');

  const result = await page.evaluate(() => {
    localStorage.removeItem(FOOTBALL_STATS.STORAGE_KEY);
    const context = sequence => ({
      quarter: 1,
      possession: sequence % 2 ? 'offense' : 'defense',
      down: 1,
      yardsToGo: 10,
      yardLine: 20,
      firstDownLine: 30,
      direction: sequence % 2 ? 1 : -1,
      score: { player: 0, opponent: 0 },
      plays: sequence,
      drivePlays: sequence,
    });
    const originalRandom = Math.random;
    let randomCalls = 0;
    Math.random = () => {
      randomCalls++;
      return 0.5;
    };
    try {
      const session = FOOTBALL_STATS.createSession();
      let firstPending;
      for (let sequence = 1; sequence <= 205; sequence++) {
        const pending = FOOTBALL_STATS.beginPlay(session, {
          preSnap: context(sequence),
          calls: { offense: 'shortRun' },
          offeredYards: 3,
          question: {
            id: `q-${sequence}`,
            skill: 'addition',
            concept: 'addition',
            purpose: 'coreReview',
            grading: 'gate',
            tier: 'within-10',
          },
        });
        FOOTBALL_STATS.recordAttempt(pending, { number: 1, correct: true, support: 'none' });
        FOOTBALL_STATS.recordResolution(pending, 'firstTryCorrect');
        FOOTBALL_STATS.completePlay(session, pending, {
          actualYards: 3,
          outcome: 'gain',
          postPlay: context(sequence),
        });
        if (sequence === 1) firstPending = pending;
      }
      const duplicate = FOOTBALL_STATS.completePlay(session, firstPending, {
        actualYards: 3,
        outcome: 'gain',
        postPlay: context(1),
      });
      return { history: FOOTBALL_STATS.history(), duplicate, randomCalls };
    } finally {
      Math.random = originalRandom;
    }
  });

  expect(result.history.recentPlays).toHaveLength(200);
  expect(result.history.recentPlays[0].sequence).toBe(6);
  expect(result.history.recentPlays.at(-1).sequence).toBe(205);
  expect(result.history.aggregates.completedPlays).toBe(205);
  expect(result.history.aggregates.actualYards).toBe(615);
  expect(result.history.aggregates.learning.firstTryCorrect).toBe(205);
  expect(result.history.mastery.addition).toEqual({
    resolved: 205,
    firstTryCorrect: 205,
    retryCorrect: 0,
    secondMiss: 0,
  });
  expect(result.duplicate).toBe(false);
  expect(result.randomCalls).toBe(0);
});

test('malformed stores recover, future schemas remain untouched, and blocked storage does not break sessions', async ({ browser, baseURL }, testInfo) => {
  primaryOnly(testInfo);

  const completeOnePresentedPlay = async page => page.evaluate(() => {
    const context = {
      quarter: 1,
      possession: 'offense',
      down: 1,
      yardsToGo: 10,
      yardLine: 20,
      firstDownLine: 30,
      direction: 1,
      score: { player: 0, opponent: 0 },
      plays: 0,
      drivePlays: 0,
    };
    const session = FOOTBALL_STATS.createSession();
    const pending = FOOTBALL_STATS.beginPlay(session, {
      preSnap: context,
      calls: { offense: 'shortRun' },
      offeredYards: 3,
      question: {
        id: 'recovery-question',
        skill: 'addition',
        concept: 'addition',
        purpose: 'coreReview',
        grading: 'gate',
        tier: 'within-10',
      },
    });
    FOOTBALL_STATS.recordAttempt(pending, { number: 1, correct: true, support: 'none' });
    FOOTBALL_STATS.recordResolution(pending, 'firstTryCorrect');
    const row = FOOTBALL_STATS.completePlay(session, pending, {
      actualYards: 3,
      outcome: 'gain',
      postPlay: { ...context, yardLine: 23, plays: 1, drivePlays: 1 },
    });
    return { row, session: FOOTBALL_STATS.sessionSnapshot(session) };
  });

  const malformedContext = await browser.newContext();
  const malformedPage = await malformedContext.newPage();
  const malformedErrors = trackErrors(malformedPage);
  await malformedPage.addInitScript(() => {
    if (location.pathname.startsWith('/football')) localStorage.setItem('footballMathStats:v1', '{invalid-json');
  });
  await malformedPage.goto(`${baseURL}/football/`);
  await completeOnePresentedPlay(malformedPage);
  const repaired = await malformedPage.evaluate(() => JSON.parse(localStorage.getItem(FOOTBALL_STATS.STORAGE_KEY)));
  expect(repaired.schemaVersion).toBe(2);
  expect(repaired.recentPlays).toHaveLength(1);
  expect(malformedErrors).toEqual([]);
  await malformedContext.close();

  const futureContext = await browser.newContext();
  const futurePage = await futureContext.newPage();
  const futureErrors = trackErrors(futurePage);
  const futurePayload = JSON.stringify({ schemaVersion: 99, future: 'keep-me' });
  await futurePage.addInitScript(payload => {
    if (location.pathname.startsWith('/football')) localStorage.setItem('footballMathStats:v1', payload);
  }, futurePayload);
  await futurePage.goto(`${baseURL}/football/`);
  const futureSession = await completeOnePresentedPlay(futurePage);
  expect(await futurePage.evaluate(() => localStorage.getItem(FOOTBALL_STATS.STORAGE_KEY))).toBe(futurePayload);
  expect(futureSession.session.completedPlays).toHaveLength(1);
  expect(futureErrors).toEqual([]);
  await futureContext.close();

  const blockedContext = await browser.newContext();
  const blockedPage = await blockedContext.newPage();
  const blockedErrors = trackErrors(blockedPage);
  await blockedPage.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('storage read blocked'); };
    Storage.prototype.setItem = () => { throw new Error('storage write blocked'); };
  });
  await blockedPage.goto(`${baseURL}/football/`);
  const blockedSession = await completeOnePresentedPlay(blockedPage);
  expect(blockedSession.session.completedPlays).toHaveLength(1);
  expect(blockedErrors).toEqual([]);
  await blockedContext.close();
});
