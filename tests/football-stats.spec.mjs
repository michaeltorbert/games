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

async function awaitStatsPersistence(page) {
  await page.evaluate(async () => {
    if (!navigator.locks || typeof navigator.locks.request !== 'function') return;
    await navigator.locks.request(
      `${FOOTBALL_STATS.STORAGE_KEY}:central-write`,
      { mode: 'exclusive' },
      () => {},
    );
  });
}

async function readPersistedStats(page, { completedPlays, recentPlays = completedPlays }) {
  await awaitStatsPersistence(page);
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem(FOOTBALL_STATS.STORAGE_KEY);
    if (!raw) return null;
    try {
      const store = JSON.parse(raw);
      return {
        schemaVersion: store.schemaVersion,
        completedPlays: store.aggregates?.completedPlays,
        recentPlays: store.recentPlays?.length,
      };
    } catch (error) {
      return null;
    }
  })).toEqual({
    schemaVersion: 3,
    completedPlays,
    recentPlays,
  });
  return page.evaluate(() => localStorage.getItem(FOOTBALL_STATS.STORAGE_KEY));
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
      session: FOOTBALL_STATS.sessionSnapshot(session),
    };
  });
  const persistedRaw = await readPersistedStats(page, { completedPlays: 2 });

  expect(result.history.schemaVersion).toBe(3);
  expect(result.history.recentPlays).toHaveLength(2);
  expect(result.history.aggregates).toMatchObject({
    completedPlays: 2,
    actualYards: 9,
    byPossession: { offense: 2, defense: 0 },
    byPlayType: { scrimmage: 2, conversion: 0, fieldGoal: 0, punt: 0 },
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
    playType: 'scrimmage',
    metrics: { offeredYards: 4, actualYards: 4 },
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
  expect(persistedRaw).not.toContain('How many yards are left?');
  expect(persistedRaw).not.toContain('choices');
  expect(persistedRaw).not.toContain('correctChoice');
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
      calls: { offense: 'longPass', defense: 'deepPass', opponent: 'longPass', matchup: 'mismatch' },
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
    };
  });
  const persistedRaw = await readPersistedStats(page, { completedPlays: 1 });

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
  expect(persistedRaw).not.toContain('This must never persist');
  expect(persistedRaw).not.toContain('secret');
  expect(errors).toEqual([]);
});

test('schema v3 records typed special plays without leaking their distances into scrimmage yards', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const errors = trackErrors(page);
  await page.goto('/football/');

  const result = await page.evaluate(() => {
    localStorage.removeItem(FOOTBALL_STATS.STORAGE_KEY);
    const context = (plays, totalYards = 0, score = { player: 0, opponent: 0 }) => ({
      quarter: 4,
      possession: 'offense',
      down: 4,
      yardsToGo: 2,
      yardLine: 88,
      firstDownLine: 90,
      direction: 1,
      score,
      totalYards: { player: totalYards, opponent: 0 },
      plays,
      drivePlays: plays,
    });
    const question = (id, concept) => ({
      id,
      skill: 'addition',
      concept,
      purpose: 'coreReview',
      grading: 'gate',
      tier: 'within-10',
    });
    const session = FOOTBALL_STATS.createSession('game-special');
    const touchdown = FOOTBALL_STATS.beginPlayDraft(session, {
      possessionId: 'possession-touchdown',
      playId: 'play-touchdown',
      playType: 'scrimmage',
      preSnap: context(0),
      calls: { offense: 'shortRun' },
      offeredYards: 12,
      metrics: { offeredYards: 12, actualYards: 12 },
      links: { contextId: 'context-touchdown' },
    });
    const unmarkedCompletion = FOOTBALL_STATS.completePlay(session, touchdown, {
      actualYards: 12,
      outcome: 'touchdown',
      postPlay: context(1, 12, { player: 6, opponent: 0 }),
    });
    const markedTouchdown = FOOTBALL_STATS.markPresented(touchdown, {
      question: question('touchdown-base-six', 'touchdown-base-points'),
      links: { familyId: 'touchdown-base-six', questionInstanceId: 'question-touchdown' },
    });
    FOOTBALL_STATS.recordAttempt(touchdown, { number: 1, correct: true, support: 'none' });
    FOOTBALL_STATS.recordResolution(touchdown, 'firstTryCorrect');
    const touchdownRow = FOOTBALL_STATS.completePlay(session, touchdown, {
      actualYards: 12,
      outcome: 'touchdown',
      postPlay: context(1, 12, { player: 6, opponent: 0 }),
    });

    const conversion = FOOTBALL_STATS.beginPlayDraft(session, {
      possessionId: 'possession-touchdown',
      playId: 'play-conversion',
      playType: 'conversion',
      preSnap: context(1, 12, { player: 6, opponent: 0 }),
      metrics: {
        attemptType: 'twoPoint', attemptValue: 2, tryYardLine: 98, pointsAwarded: 2,
      },
      links: { contextId: 'context-conversion' },
    });
    FOOTBALL_STATS.markPresented(conversion, {
      question: question('conversion-score', 'conversion-points'),
      links: { familyId: 'conversion-score', questionInstanceId: 'question-conversion' },
    });
    FOOTBALL_STATS.recordAttempt(conversion, { number: 1, correct: true, support: 'none' });
    FOOTBALL_STATS.recordResolution(conversion, 'firstTryCorrect');
    const conversionRow = FOOTBALL_STATS.completePlay(session, conversion, {
      outcome: 'conversionMade',
      metrics: {
        attemptType: 'twoPoint', attemptValue: 2, tryYardLine: 98, pointsAwarded: 2,
      },
      postPlay: context(1, 12, { player: 8, opponent: 0 }),
    });

    const fieldGoal = FOOTBALL_STATS.beginPlayDraft(session, {
      possessionId: 'possession-field-goal',
      playId: 'play-field-goal',
      playType: 'fieldGoal',
      preSnap: context(1, 12, { player: 8, opponent: 0 }),
      metrics: { attemptDistance: 57, pointsAwarded: 0 },
      links: { contextId: 'context-field-goal' },
    });
    const bypassedFieldGoal = FOOTBALL_STATS.markBypassed(fieldGoal);
    const fieldGoalRow = FOOTBALL_STATS.completeBypassedPlay(session, fieldGoal, {
      outcome: 'fieldGoalBlocked',
      metrics: { attemptDistance: 57, pointsAwarded: 3 },
      postPlay: context(1, 12, { player: 8, opponent: 0 }),
    });

    const punt = FOOTBALL_STATS.beginPlayDraft(session, {
      possessionId: 'possession-punt',
      playId: 'play-punt',
      playType: 'punt',
      preSnap: context(1, 12, { player: 8, opponent: 0 }),
      metrics: {
        travelDistance: 45, landingYardLine: 80, touchback: true, travelClass: 'normal',
      },
      links: { contextId: 'context-punt' },
    });
    const bypassedPunt = FOOTBALL_STATS.markBypassed(punt);
    const puntRow = FOOTBALL_STATS.completeBypassedPlay(session, punt, {
      outcome: 'puntTouchback',
      metrics: {
        travelDistance: 45, landingYardLine: 80, touchback: false, travelClass: 'normal',
      },
      postPlay: context(1, 12, { player: 8, opponent: 0 }),
    });

    const wrongType = FOOTBALL_STATS.beginBypassedPlay(session, {
      possessionId: 'possession-invalid',
      playId: 'play-invalid',
      playType: 'conversion',
      preSnap: context(1, 12, { player: 8, opponent: 0 }),
      metrics: { attemptType: 'pat', attemptValue: 1, tryYardLine: 98, pointsAwarded: 0 },
    });
    const wrongOutcome = FOOTBALL_STATS.completeBypassedPlay(session, wrongType, {
      outcome: 'gain',
      postPlay: context(1, 12, { player: 8, opponent: 0 }),
    });
    FOOTBALL_STATS.discardPlay(wrongType);

    const replaySession = FOOTBALL_STATS.createSession('game-special');
    const replay = FOOTBALL_STATS.beginBypassedPlay(replaySession, {
      possessionId: 'possession-touchdown',
      playId: 'play-conversion',
      playType: 'conversion',
      preSnap: context(1, 12, { player: 8, opponent: 0 }),
      metrics: { attemptType: 'twoPoint', attemptValue: 2, tryYardLine: 98, pointsAwarded: 2 },
    });
    const persistedDuplicate = FOOTBALL_STATS.completeBypassedPlay(replaySession, replay, {
      outcome: 'conversionMade',
      postPlay: context(1, 12, { player: 8, opponent: 0 }),
    });

    return {
      unmarkedCompletion,
      markedTouchdown: Boolean(markedTouchdown),
      bypassedFieldGoal: Boolean(bypassedFieldGoal),
      bypassedPunt: Boolean(bypassedPunt),
      wrongOutcome,
      persistedDuplicate,
      touchdownRow,
      conversionRow,
      fieldGoalRow,
      puntRow,
      history: FOOTBALL_STATS.history(),
      session: FOOTBALL_STATS.sessionSnapshot(session),
      replaySession: FOOTBALL_STATS.sessionSnapshot(replaySession),
    };
  });
  await readPersistedStats(page, { completedPlays: 4 });

  expect(result.unmarkedCompletion).toBe(false);
  expect(result.markedTouchdown).toBe(true);
  expect(result.bypassedFieldGoal).toBe(true);
  expect(result.bypassedPunt).toBe(true);
  expect(result.wrongOutcome).toBe(false);
  expect(result.persistedDuplicate).toBe(false);
  expect(result.history.schemaVersion).toBe(3);
  expect(result.history.recentPlays).toHaveLength(4);
  expect(result.history.aggregates).toMatchObject({
    completedPlays: 4,
    actualYards: 12,
    byPlayType: { scrimmage: 1, conversion: 1, fieldGoal: 1, punt: 1 },
    byOutcome: {
      touchdown: 1, conversionMade: 1, fieldGoalBlocked: 1, puntTouchback: 1,
    },
    specialTeams: {
      conversions: { attempts: 1, made: 1, missed: 0, denied: 0, points: 2 },
      fieldGoals: { attempts: 1, made: 0, missed: 0, blocked: 1, points: 0 },
      punts: { attempts: 1, touchbacks: 1, totalTravelDistance: 45 },
    },
  });
  expect(result.touchdownRow).toMatchObject({
    possessionId: 'possession-touchdown',
    playId: 'play-touchdown',
    playType: 'scrimmage',
    metrics: { offeredYards: 12, actualYards: 12 },
  });
  expect(result.touchdownRow.links.contextId).toBe('context-touchdown');
  expect(result.conversionRow).toMatchObject({
    possessionId: 'possession-touchdown',
    playId: 'play-conversion',
    playType: 'conversion',
    calls: null,
    offeredYards: null,
    actualYards: null,
    outcome: 'conversionMade',
    metrics: { attemptType: 'twoPoint', attemptValue: 2, tryYardLine: 98, pointsAwarded: 2 },
  });
  expect(result.fieldGoalRow).toMatchObject({
    playType: 'fieldGoal',
    offeredYards: null,
    actualYards: null,
    outcome: 'fieldGoalBlocked',
    metrics: { attemptDistance: 57, pointsAwarded: 0 },
    links: { familyId: null, contextId: 'context-field-goal', questionInstanceId: null },
  });
  expect(result.puntRow).toMatchObject({
    playType: 'punt',
    offeredYards: null,
    actualYards: null,
    outcome: 'puntTouchback',
    metrics: {
      travelDistance: 45, landingYardLine: 80, touchback: true, travelClass: 'normal',
    },
    links: { familyId: null, contextId: 'context-punt', questionInstanceId: null },
  });
  expect(result.history.recentPlays.slice(1).every(row => (
    row.preSnap.totalYards.player === 12 && row.postPlay.totalYards.player === 12
  ))).toBe(true);
  expect(result.session.completedPlays).toHaveLength(4);
  expect(result.replaySession.completedPlays).toHaveLength(0);
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
    };
  });
  const rawAfterWrite = JSON.parse(await readPersistedStats(page, { completedPlays: 2 }));

  expect(result.rawBeforeWrite).toBe(result.seededRaw);
  expect(JSON.parse(result.rawBeforeWrite).schemaVersion).toBe(1);
  expect(result.history.schemaVersion).toBe(3);
  expect(result.history.aggregates).toMatchObject({
    completedPlays: 1,
    actualYards: 4,
    byPossession: { offense: 1, defense: 0 },
    byOutcome: { firstDown: 1 },
    byPlayType: { scrimmage: 1, conversion: 0, fieldGoal: 0, punt: 0 },
    learning: { gradedPlays: 1, retryCorrect: 1 },
  });
  expect(result.history.mastery).toEqual({
    'line-to-gain': { resolved: 1, firstTryCorrect: 0, retryCorrect: 1, secondMiss: 0 },
  });
  expect(result.history.recentPlays).toHaveLength(1);
  expect(result.history.recentPlays[0]).toMatchObject({
    id: 'play-legacy',
    gameId: 'game-legacy',
    playId: 'play-legacy',
    playType: 'scrimmage',
    metrics: { offeredYards: 4, actualYards: 4 },
    sequence: 8,
    instructionalStatus: 'presented',
    links: { familyId: 'legacy-family', contextId: null, questionInstanceId: null },
    resolution: 'retryCorrect',
  });
  expect(rawAfterWrite.schemaVersion).toBe(3);
  expect(rawAfterWrite.recentPlays).toHaveLength(2);
  expect(rawAfterWrite.recentPlays[1]).toMatchObject({
    instructionalStatus: 'bypassed',
    links: { familyId: null, contextId: 'context-next', questionInstanceId: null },
  });
});

test('history preserves finite signed actual yards while offered gains stay non-negative', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.addInitScript(() => {
    const context = {
      quarter: 2,
      possession: 'defense',
      down: 2,
      yardsToGo: 8,
      yardLine: 70,
      firstDownLine: 62,
      direction: -1,
      score: { player: 7, opponent: 7 },
      totalYards: { player: -4, opponent: -9 },
      plays: 5,
      drivePlays: 2,
    };
    localStorage.setItem('footballMathStats:v1', JSON.stringify({
      schemaVersion: 2,
      aggregates: {
        completedPlays: 2,
        actualYards: -7,
        byPossession: { offense: 0, defense: 2 },
        byOutcome: { noGain: 2 },
        learning: {},
      },
      recentPlays: [
        {
          id: 'signed-row',
          gameId: 'signed-game',
          sequence: 1,
          completedAt: '2026-07-14T12:00:00.000Z',
          instructionalStatus: 'bypassed',
          preSnap: context,
          calls: { offense: 'shortRun', defense: 'runDefense', opponent: 'shortRun', matchup: 'matched' },
          offeredYards: 4,
          actualYards: -7,
          outcome: 'noGain',
          postPlay: context,
        },
        {
          id: 'malformed-row',
          gameId: 'signed-game',
          sequence: 2,
          completedAt: '2026-07-14T12:01:00.000Z',
          instructionalStatus: 'bypassed',
          preSnap: context,
          calls: { offense: 'shortRun', defense: 'runDefense', opponent: 'shortRun', matchup: 'matched' },
          offeredYards: -4,
          actualYards: 'not-a-number',
          outcome: 'noGain',
          postPlay: context,
        },
      ],
      mastery: {},
    }));
  });
  await page.goto('/football/');

  const result = await page.evaluate(() => {
    const before = FOOTBALL_STATS.history();
    const rawBeforeWrite = localStorage.getItem(FOOTBALL_STATS.STORAGE_KEY);
    const preSnap = before.recentPlays[0].postPlay;
    const session = FOOTBALL_STATS.createSession();
    const pending = FOOTBALL_STATS.beginBypassedPlay(session, {
      preSnap,
      calls: { offense: 'mediumPass' },
      offeredYards: 5,
      links: { contextId: 'signed-next' },
    });
    FOOTBALL_STATS.completeBypassedPlay(session, pending, {
      actualYards: -5,
      outcome: 'noGain',
      postPlay: { ...preSnap, yardLine: preSnap.yardLine + 5, plays: preSnap.plays + 1 },
    });
    let negativeGainError = null;
    try {
      FOOTBALL_DOMAIN.createSnap({
        contextId: 'negative-domain-probe',
        match: state.match,
        possession: 'offense',
        direction: 1,
        quarter: 1,
        down: 1,
        yardsToGo: 10,
        yardLine: 20,
        firstDownLine: 30,
        driveStart: 20,
        scores: { player: 0, opponent: 0 },
        totalYards: { player: 0, opponent: 0 },
        plays: 0,
        drivePlays: 0,
        calls: { offense: 'shortRun', defense: null, matchup: null },
      }, { gain: -1, callKey: 'shortRun' });
    } catch (error) {
      negativeGainError = error.code;
    }
    return {
      before,
      after: FOOTBALL_STATS.history(),
      rawBeforeWrite,
      negativeGainError,
    };
  });
  const rawAfterWrite = JSON.parse(await readPersistedStats(page, { completedPlays: 3 }));

  expect(result.before.schemaVersion).toBe(3);
  expect(JSON.parse(result.rawBeforeWrite).schemaVersion).toBe(2);
  expect(result.before.aggregates.actualYards).toBe(-7);
  expect(result.before.aggregates.byOutcome).toEqual(expect.objectContaining({
    turnover: 0,
    loss: 0,
    noGain: 2,
  }));
  expect(result.before.recentPlays[0].actualYards).toBe(-7);
  expect(result.before.recentPlays[0].preSnap.totalYards).toEqual({ player: -4, opponent: -9 });
  expect(result.before.recentPlays[0].postPlay.totalYards).toEqual({ player: -4, opponent: -9 });
  expect(result.before.recentPlays[0].offeredYards).toBe(4);
  expect(result.before.recentPlays[1].actualYards).toBe(0);
  expect(result.before.recentPlays[1].offeredYards).toBe(0);
  expect(result.after.schemaVersion).toBe(3);
  expect(rawAfterWrite.schemaVersion).toBe(3);
  expect(result.after.aggregates.actualYards).toBe(-12);
  expect(result.after.recentPlays.at(-1).actualYards).toBe(-5);
  expect(result.after.recentPlays.at(-1).preSnap.totalYards).toEqual({ player: -4, opponent: -9 });
  expect(result.after.recentPlays.at(-1).postPlay.totalYards).toEqual({ player: -4, opponent: -9 });
  expect(result.negativeGainError).toBe('INVALID_PROPOSAL');
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
      row('row-3', 'line-to-gain', 'retryCorrect', '2026-07-05T12:00:00.000Z'),
      row('row-1', 'line-to-gain', 'firstTryCorrect', '2026-06-01T12:00:00.000Z'),
      row('row-2', 'field-distance', 'secondMiss', '2026-06-02T12:00:00.000Z'),
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
      let firstPlayId;
      for (let sequence = 1; sequence <= 205; sequence++) {
        const pending = FOOTBALL_STATS.beginPlay(session, {
          playId: `${session.gameId}-play-${sequence}`,
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
        if (sequence === 1) firstPlayId = pending.playId;
      }
      return {
        history: FOOTBALL_STATS.history(),
        firstIdentity: { gameId: session.gameId, playId: firstPlayId },
        randomCalls,
      };
    } finally {
      Math.random = originalRandom;
    }
  });
  const persisted = JSON.parse(await readPersistedStats(page, {
    completedPlays: 205,
    recentPlays: 200,
  }));
  const replay = await page.evaluate(({ gameId, playId }) => {
    const context = {
      quarter: 1, possession: 'offense', down: 1, yardsToGo: 10,
      yardLine: 20, firstDownLine: 30, direction: 1,
      score: { player: 0, opponent: 0 }, plays: 1, drivePlays: 1,
    };
    const session = FOOTBALL_STATS.createSession(gameId);
    const pending = FOOTBALL_STATS.beginPlay(session, {
      playId,
      preSnap: context,
      calls: { offense: 'shortRun' },
      offeredYards: 3,
      question: {
        id: 'replayed-question', skill: 'addition', concept: 'addition',
        purpose: 'coreReview', grading: 'gate', tier: 'within-10',
      },
    });
    FOOTBALL_STATS.recordAttempt(pending, { number: 1, correct: true, support: 'none' });
    FOOTBALL_STATS.recordResolution(pending, 'firstTryCorrect');
    const duplicate = FOOTBALL_STATS.completePlay(session, pending, {
      actualYards: 3,
      outcome: 'gain',
      postPlay: context,
    });
    return {
      duplicate,
      rawAfterReplay: localStorage.getItem(FOOTBALL_STATS.STORAGE_KEY),
    };
  }, result.firstIdentity);

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
  expect(replay.duplicate).toBe(false);
  expect(result.randomCalls).toBe(0);
  expect(result.history.archivedPlayIndex).toBeUndefined();
  expect(persisted.recentPlays).toHaveLength(200);
  expect(persisted.archivedPlayIndex[result.firstIdentity.gameId]).toEqual({ through: 5, ids: [] });
  expect(persisted.aggregates.completedPlays).toBe(205);
  expect(persisted.aggregates.actualYards).toBe(615);
  expect(persisted.mastery.addition.resolved).toBe(205);
  expect(JSON.parse(replay.rawAfterReplay)).toEqual(persisted);
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
  const repaired = JSON.parse(await readPersistedStats(malformedPage, { completedPlays: 1 }));
  expect(repaired.schemaVersion).toBe(3);
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
  await awaitStatsPersistence(futurePage);
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
  await awaitStatsPersistence(blockedPage);
  expect(blockedSession.session.completedPlays).toHaveLength(1);
  expect(blockedErrors).toEqual([]);
  await blockedContext.close();
});
