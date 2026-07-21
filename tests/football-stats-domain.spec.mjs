import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../football/stats.js', import.meta.url), 'utf8');
const STORAGE_KEY = 'footballMathStats:v1';

function makeStorage(seed = null, { blockRead = false, blockWrite = false } = {}) {
  const values = new Map();
  let setItemCalls = 0;
  if (seed !== null) values.set(STORAGE_KEY, seed);
  return {
    getItem(key) {
      if (blockRead) throw new Error('storage read blocked');
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (blockWrite) throw new Error('storage write blocked');
      setItemCalls++;
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    raw(key = STORAGE_KEY) {
      return values.get(key) ?? null;
    },
    setCount() {
      return setItemCalls;
    },
  };
}

function makeLockManager({ autoGrant = true } = {}) {
  const pending = [];
  const requests = [];
  let active = null;

  const manager = {
    request(name, options, callback) {
      requests.push({ name, options });
      let resolve;
      let reject;
      const result = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      pending.push({ name, options, callback, resolve, reject });
      if (autoGrant) manager.grantNext();
      return result;
    },
    pendingCount() {
      return pending.length;
    },
    requests,
    async grantNext() {
      if (active) {
        await active;
        return false;
      }
      const entry = pending.shift();
      if (!entry) return false;
      active = (async () => {
        try {
          const value = await entry.callback({ name: entry.name, mode: 'exclusive' });
          entry.resolve(value);
        } catch (error) {
          entry.reject(error);
        }
      })();
      try {
        await active;
      } finally {
        active = null;
      }
      if (autoGrant && pending.length) manager.grantNext();
      await Promise.resolve();
      return true;
    },
    async grantAll() {
      while (active || pending.length) {
        if (active) await active;
        else await manager.grantNext();
      }
      await Promise.resolve();
    },
  };
  return manager;
}

function loadStats(seed = null, storageOptions = {}, sharedStorage = null, sharedLocks = makeLockManager()) {
  const localStorage = sharedStorage || makeStorage(seed, storageOptions);
  let uuid = 0;
  let monotonic = 0;
  const windowListeners = new Map();
  const testNavigator = sharedLocks ? { locks: sharedLocks } : {};
  const testWindow = {
    localStorage,
    navigator: testNavigator,
    addEventListener(type, listener) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(listener);
    },
  };
  const context = vm.createContext({
    window: testWindow,
    navigator: testNavigator,
    crypto: { randomUUID: () => `uuid-${++uuid}` },
    performance: { now: () => ++monotonic },
  });
  vm.runInContext(source, context, { filename: 'stats.js' });
  return {
    stats: vm.runInContext('FOOTBALL_STATS', context),
    localStorage,
    locks: sharedLocks,
    dispatchStorage(key = STORAGE_KEY) {
      for (const listener of windowListeners.get('storage') || []) listener({ key });
    },
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function playContext(overrides = {}) {
  return {
    quarter: 4,
    possession: 'offense',
    down: 4,
    yardsToGo: 2,
    yardLine: 88,
    firstDownLine: 90,
    direction: 1,
    score: { player: 0, opponent: 0 },
    totalYards: { player: 0, opponent: 0 },
    plays: 0,
    drivePlays: 0,
    ...overrides,
  };
}

function question(id, concept, evidenceClass = 'independent') {
  return {
    id,
    skill: 'addition',
    concept,
    purpose: 'coreReview',
    grading: 'gate',
    tier: 'within-10',
    evidenceClass,
  };
}

function legacyPayload(schemaVersion) {
  const preSnap = playContext({
    quarter: 2,
    down: 2,
    yardsToGo: 6,
    yardLine: 34,
    firstDownLine: 40,
    plays: 7,
    drivePlays: 2,
  });
  return JSON.stringify({
    schemaVersion,
    aggregates: {
      completedPlays: 1,
      actualYards: 4,
      byPossession: { offense: 1, defense: 0 },
      byOutcome: { gain: 1 },
      learning: {
        gradedPlays: 1,
        noStakesPlays: 0,
        firstTryCorrect: 1,
        retryCorrect: 0,
        secondMiss: 0,
      },
    },
    recentPlays: [{
      id: `legacy-v${schemaVersion}`,
      gameId: 'legacy-game',
      sequence: 1,
      completedAt: '2026-07-01T12:00:00.000Z',
      instructionalStatus: 'presented',
      preSnap,
      calls: { offense: 'shortRun' },
      offeredYards: 4,
      metrics: { attemptDistance: 57 },
      question: question('legacy-family', 'legacy-concept'),
      attempts: [{ number: 1, correct: true, elapsedMs: 10, support: 'none' }],
      resolution: 'firstTryCorrect',
      actualYards: 4,
      outcome: 'gain',
      postPlay: playContext({ ...preSnap, yardLine: 38, plays: 8, drivePlays: 3 }),
    }],
    mastery: {
      'legacy-concept': { resolved: 1, firstTryCorrect: 1, retryCorrect: 0, secondMiss: 0 },
    },
  });
}

for (const schemaVersion of [1, 2]) {
  test(`schema v${schemaVersion} normalizes in memory and writes v4 only after completion`, () => {
    const seededRaw = legacyPayload(schemaVersion);
    const { stats, localStorage } = loadStats(seededRaw);

    const history = plain(stats.history());
    assert.equal(stats.STORAGE_KEY, STORAGE_KEY);
    assert.equal(stats.SCHEMA_VERSION, 4);
    assert.equal(stats.TYPED_PLAY_SCHEMA_VERSION, 3);
    assert.equal(history.schemaVersion, 4);
    assert.equal(localStorage.raw(), seededRaw);
    assert.equal(history.aggregates.completedPlays, 1);
    assert.equal(history.aggregates.actualYards, 4);
    assert.deepEqual(history.aggregates.byPossession, { offense: 1, defense: 0 });
    assert.equal(history.aggregates.byOutcome.gain, 1);
    assert.deepEqual(history.aggregates.learning, {
      gradedPlays: 1,
      noStakesPlays: 0,
      firstTryCorrect: 1,
      retryCorrect: 0,
      secondMiss: 0,
    });
    assert.deepEqual(history.aggregates.byPlayType, {
      scrimmage: 1, conversion: 0, fieldGoal: 0, punt: 0,
    });
    assert.deepEqual(history.mastery, {
      'legacy-concept': {
        unclassified: { resolved: 1, firstTryCorrect: 1, retryCorrect: 0, secondMiss: 0 },
      },
    });
    const legacyRow = history.recentPlays[0];
    assert.equal(legacyRow.id, `legacy-v${schemaVersion}`);
    assert.equal(legacyRow.gameId, 'legacy-game');
    assert.equal(legacyRow.playId, `legacy-v${schemaVersion}`);
    assert.equal(legacyRow.playType, 'scrimmage');
    assert.equal(legacyRow.question.evidenceClass, 'unclassified');
    assert.deepEqual(legacyRow.metrics, { offeredYards: 4, actualYards: 4 });

    const session = stats.createSession(`new-game-v${schemaVersion}`);
    const draft = stats.beginPlayDraft(session, {
      possessionId: 'new-possession',
      playId: 'new-play',
      playType: 'scrimmage',
      preSnap: playContext(),
      calls: { offense: 'shortRun' },
      offeredYards: 2,
      links: { contextId: 'new-context' },
    });
    assert.ok(stats.markBypassed(draft));
    assert.ok(stats.completeBypassedPlay(session, draft, {
      actualYards: 2,
      outcome: 'gain',
      postPlay: playContext({ yardLine: 90, plays: 1, drivePlays: 1 }),
    }));

    const persisted = JSON.parse(localStorage.raw());
    assert.equal(persisted.schemaVersion, 4);
    assert.equal(persisted.aggregates.completedPlays, 2);
    assert.equal(persisted.aggregates.actualYards, 6);
    assert.equal(persisted.aggregates.byPlayType.scrimmage, 2);
    assert.equal(persisted.aggregates.byOutcome.gain, 2);
    assert.deepEqual(persisted.aggregates.learning, history.aggregates.learning);
    assert.deepEqual(persisted.mastery, history.mastery);
    assert.equal(persisted.recentPlays.length, 2);
  });
}

test('schema v3 typed evidence migrates to unclassified without a read write and round-trips on v4 write', () => {
  const completedAt = '2026-07-03T12:00:00.000Z';
  const seeded = JSON.stringify({
    schemaVersion: 3,
    aggregates: {
      completedPlays: 1,
      byPossession: { offense: 1, defense: 0 },
      byOutcome: { conversionMade: 1 },
      byPlayType: { scrimmage: 0, conversion: 1, fieldGoal: 0, punt: 0 },
      learning: { gradedPlays: 1, firstTryCorrect: 1 },
    },
    recentPlays: [{
      id: 'typed-v3-row',
      gameId: 'typed-v3-game',
      possessionId: 'typed-v3-possession',
      playId: 'typed-v3-play',
      playType: 'conversion',
      sequence: 1,
      completedAt,
      instructionalStatus: 'presented',
      preSnap: playContext(),
      question: { ...question('typed-v3-family', 'conversion-scoring'), evidenceClass: 'independent' },
      attempts: [{ number: 1, correct: true, elapsedMs: 4, support: 'none' }],
      resolution: 'firstTryCorrect',
      outcome: 'conversionMade',
      metrics: { attemptType: 'twoPoint', attemptValue: 2, tryYardLine: 98, pointsAwarded: 2 },
      postPlay: playContext({ score: { player: 2, opponent: 0 } }),
    }],
    mastery: {
      'conversion-scoring': { resolved: 1, firstTryCorrect: 1, retryCorrect: 0, secondMiss: 0 },
    },
    lastResolvedByConcept: {
      'conversion-scoring': { completedAt, resolution: 'firstTryCorrect' },
    },
  });
  const { stats, localStorage } = loadStats(seeded);
  const history = plain(stats.history());
  const learning = plain(stats.learningSnapshot());

  assert.equal(localStorage.raw(), seeded);
  assert.equal(history.schemaVersion, 4);
  assert.deepEqual(history.recentPlays[0], {
    ...history.recentPlays[0],
    playType: 'conversion',
    offeredYards: null,
    actualYards: null,
    calls: null,
    outcome: 'conversionMade',
    metrics: { attemptType: 'twoPoint', attemptValue: 2, tryYardLine: 98, pointsAwarded: 2 },
  });
  assert.equal(history.recentPlays[0].question.evidenceClass, 'unclassified');
  assert.deepEqual(learning.mastery, {
    'conversion-scoring': {
      unclassified: { resolved: 1, firstTryCorrect: 1, retryCorrect: 0, secondMiss: 0 },
    },
  });
  assert.deepEqual(learning.lastResolvedByConcept, {
    'conversion-scoring': { unclassified: { completedAt, resolution: 'firstTryCorrect' } },
  });

  assert.ok(completeBypassed(stats, {
    gameId: 'v4-trigger-game', possessionId: 'v4-trigger-possession', playId: 'v4-trigger-play',
  }));
  const persisted = JSON.parse(localStorage.raw());
  assert.equal(persisted.schemaVersion, 4);
  assert.equal(persisted.recentPlays[0].question.evidenceClass, 'unclassified');
  assert.deepEqual(persisted.mastery, learning.mastery);
  assert.deepEqual(persisted.lastResolvedByConcept, learning.lastResolvedByConcept);
});

test('schema v4 missing or unknown evidence class preserves safe rows but grants no mastery or latest credit', () => {
  const row = (id, evidenceClass) => {
    const rowQuestion = question(`${id}-family`, 'line-to-gain');
    if (evidenceClass === undefined) delete rowQuestion.evidenceClass;
    else rowQuestion.evidenceClass = evidenceClass;
    return {
      id,
      gameId: 'malformed-class-game',
      possessionId: 'malformed-class-possession',
      playId: `${id}-play`,
      playType: 'scrimmage',
      sequence: id === 'missing-class' ? 1 : 2,
      completedAt: `2026-07-04T12:0${id === 'missing-class' ? 0 : 1}:00.000Z`,
      instructionalStatus: 'presented',
      preSnap: playContext(),
      calls: { offense: 'shortRun' },
      question: rowQuestion,
      attempts: [{ number: 1, correct: true, elapsedMs: 5, support: 'none' }],
      resolution: 'firstTryCorrect',
      outcome: 'gain',
      metrics: { offeredYards: 3, actualYards: 3 },
      postPlay: playContext({ yardLine: 91, plays: 1, drivePlays: 1 }),
    };
  };
  const seeded = JSON.stringify({
    schemaVersion: 4,
    aggregates: { completedPlays: 2, actualYards: 6 },
    recentPlays: [row('missing-class', undefined), row('unknown-class', 'invented')],
    mastery: {},
    lastResolvedByConcept: {
      'line-to-gain': { invented: { completedAt: '2026-07-04T12:01:00.000Z', resolution: 'firstTryCorrect' } },
    },
  });
  const { stats, localStorage } = loadStats(seeded);

  assert.equal(localStorage.raw(), seeded);
  assert.deepEqual(plain(stats.history().recentPlays.map(item => item.question.evidenceClass)), [null, null]);
  assert.deepEqual(plain(stats.learningSnapshot()), { mastery: {}, lastResolvedByConcept: {} });

  const session = stats.createSession('current-class-validation');
  const details = {
    possessionId: 'current-class-possession',
    playId: 'current-class-play',
    playType: 'scrimmage',
    preSnap: playContext(),
    calls: { offense: 'shortRun' },
    offeredYards: 3,
    question: { ...question('current-class-family', 'line-to-gain'), evidenceClass: 'unclassified' },
  };
  assert.equal(stats.beginPlay(session, details), false);
  const draft = stats.beginPlayDraft(session, details);
  assert.ok(draft);
  assert.equal(stats.markPresented(draft, { question: details.question }), false);
  assert.ok(stats.markBypassed(draft));
});

test('typed special rows retain their metrics and never enter scrimmage yard aggregates', () => {
  const { stats } = loadStats();
  const session = stats.createSession('typed-game');
  const base = playContext();
  assert.equal(stats.beginPlayDraft(session, {
    playId: 'unsupported-play', playType: 'kickoff', preSnap: base,
  }), false);
  const afterTouchdown = playContext({
    score: { player: 6, opponent: 0 },
    totalYards: { player: 12, opponent: 0 },
    plays: 1,
    drivePlays: 1,
  });

  const touchdown = stats.beginPlayDraft(session, {
    possessionId: 'touchdown-possession',
    playId: 'touchdown-play',
    playType: 'scrimmage',
    preSnap: base,
    calls: { offense: 'shortRun' },
    offeredYards: 12,
    metrics: { offeredYards: 12, actualYards: 12 },
    links: { contextId: 'touchdown-context' },
  });
  assert.equal(stats.completePlay(session, touchdown, {
    actualYards: 12, outcome: 'touchdown', postPlay: afterTouchdown,
  }), false);
  assert.ok(stats.markPresented(touchdown, {
    question: question('touchdown-family', 'touchdown-base-points'),
    links: { familyId: 'touchdown-family', questionInstanceId: 'touchdown-question' },
  }));
  assert.equal(touchdown.links.contextId, 'touchdown-context');
  assert.equal(stats.recordAttempt(touchdown, { number: 1, correct: true, support: 'none' }), true);
  assert.equal(stats.recordResolution(touchdown, 'firstTryCorrect'), true);
  const touchdownRow = stats.completePlay(session, touchdown, {
    actualYards: 12,
    outcome: 'touchdown',
    postPlay: afterTouchdown,
  });
  assert.ok(touchdownRow);

  const completeBypassed = ({ possessionId, playId, playType, outcome, metrics }) => {
    const draft = stats.beginPlayDraft(session, {
      possessionId,
      playId,
      playType,
      preSnap: afterTouchdown,
      metrics,
      links: { contextId: `${playId}-context` },
    });
    assert.ok(stats.markBypassed(draft));
    return stats.completeBypassedPlay(session, draft, {
      outcome,
      metrics,
      postPlay: afterTouchdown,
    });
  };

  const conversionRow = completeBypassed({
    possessionId: 'touchdown-possession',
    playId: 'conversion-play',
    playType: 'conversion',
    outcome: 'conversionMade',
    metrics: { attemptType: 'twoPoint', attemptValue: 2, tryYardLine: 98, pointsAwarded: 2 },
  });
  const fieldGoalRow = completeBypassed({
    possessionId: 'field-goal-possession',
    playId: 'field-goal-play',
    playType: 'fieldGoal',
    outcome: 'fieldGoalBlocked',
    metrics: { attemptDistance: 57, pointsAwarded: 3 },
  });
  const puntRow = completeBypassed({
    possessionId: 'punt-possession',
    playId: 'punt-play',
    playType: 'punt',
    outcome: 'puntTouchback',
    metrics: { travelDistance: 45, landingYardLine: 80, touchback: false, travelClass: 'normal' },
  });

  const wrongType = stats.beginBypassedPlay(session, {
    possessionId: 'invalid-possession',
    playId: 'invalid-play',
    playType: 'conversion',
    preSnap: afterTouchdown,
    metrics: { attemptType: 'pat', attemptValue: 1, tryYardLine: 98, pointsAwarded: 0 },
  });
  assert.equal(stats.completeBypassedPlay(session, wrongType, {
    outcome: 'gain', postPlay: afterTouchdown,
  }), false);

  const duplicateSession = stats.createSession('typed-game');
  const duplicate = stats.beginBypassedPlay(duplicateSession, {
    possessionId: 'touchdown-possession',
    playId: 'conversion-play',
    playType: 'conversion',
    preSnap: afterTouchdown,
    metrics: { attemptType: 'twoPoint', attemptValue: 2, tryYardLine: 98, pointsAwarded: 2 },
  });
  assert.equal(stats.completeBypassedPlay(duplicateSession, duplicate, {
    outcome: 'conversionMade', postPlay: afterTouchdown,
  }), false);

  assert.deepEqual(plain(touchdownRow.metrics), { offeredYards: 12, actualYards: 12 });
  assert.deepEqual(plain(conversionRow.metrics), {
    attemptType: 'twoPoint', attemptValue: 2, tryYardLine: 98, pointsAwarded: 2,
  });
  assert.deepEqual(plain(fieldGoalRow.metrics), { attemptDistance: 57, pointsAwarded: 0 });
  assert.deepEqual(plain(puntRow.metrics), {
    travelDistance: 45, landingYardLine: 80, touchback: true, travelClass: 'normal',
  });
  for (const row of [conversionRow, fieldGoalRow, puntRow]) {
    assert.equal(row.offeredYards, null);
    assert.equal(row.actualYards, null);
    assert.equal(row.calls, null);
    assert.equal(row.preSnap.totalYards.player, 12);
    assert.equal(row.postPlay.totalYards.player, 12);
  }

  const history = plain(stats.history());
  assert.equal(history.recentPlays.length, 4);
  assert.deepEqual(history.aggregates.byPlayType, {
    scrimmage: 1, conversion: 1, fieldGoal: 1, punt: 1,
  });
  assert.equal(history.aggregates.actualYards, 12);
  assert.deepEqual(history.aggregates.specialTeams, {
    conversions: { attempts: 1, made: 1, missed: 0, denied: 0, points: 2 },
    fieldGoals: { attempts: 1, made: 0, missed: 0, blocked: 1, points: 0 },
    punts: { attempts: 1, touchbacks: 1, totalTravelDistance: 45 },
  });
  assert.deepEqual(
    history.recentPlays.slice(0, 2).map(row => [row.possessionId, row.playId, row.playType]),
    [
      ['touchdown-possession', 'touchdown-play', 'scrimmage'],
      ['touchdown-possession', 'conversion-play', 'conversion'],
    ],
  );
  assert.equal(plain(stats.sessionSnapshot(session)).completedPlays.length, 4);
  assert.equal(plain(stats.sessionSnapshot(duplicateSession)).completedPlays.length, 0);
});

test('an unknown future schema remains byte-for-byte untouched after a local completion', () => {
  const futureRaw = JSON.stringify({ schemaVersion: 99, future: { preserve: true } });
  const { stats, localStorage } = loadStats(futureRaw);
  assert.deepEqual(plain(stats.history()), {
    schemaVersion: 4,
    aggregates: {
      completedPlays: 0,
      actualYards: 0,
      byPossession: { offense: 0, defense: 0 },
      byOutcome: {
        touchdown: 0, firstDown: 0, turnoverOnDowns: 0, turnover: 0,
        stop: 0, gain: 0, loss: 0, noGain: 0,
        conversionMade: 0, conversionMissed: 0, conversionDenied: 0,
        fieldGoalMade: 0, fieldGoalMissed: 0, fieldGoalBlocked: 0,
        puntLanded: 0, puntTouchback: 0,
      },
      byPlayType: { scrimmage: 0, conversion: 0, fieldGoal: 0, punt: 0 },
      specialTeams: {
        conversions: { attempts: 0, made: 0, missed: 0, denied: 0, points: 0 },
        fieldGoals: { attempts: 0, made: 0, missed: 0, blocked: 0, points: 0 },
        punts: { attempts: 0, touchbacks: 0, totalTravelDistance: 0 },
      },
      learning: {
        gradedPlays: 0, noStakesPlays: 0, firstTryCorrect: 0, retryCorrect: 0, secondMiss: 0,
      },
    },
    recentPlays: [],
    mastery: {},
  });

  const session = stats.createSession('future-game');
  const pending = stats.beginBypassedPlay(session, {
    possessionId: 'future-possession',
    playId: 'future-play',
    playType: 'scrimmage',
    preSnap: playContext(),
    calls: { offense: 'shortRun' },
    offeredYards: 3,
  });
  assert.ok(stats.completeBypassedPlay(session, pending, {
    actualYards: 3,
    outcome: 'gain',
    postPlay: playContext({ yardLine: 91, plays: 1, drivePlays: 1 }),
  }));
  assert.equal(localStorage.raw(), futureRaw);
  assert.equal(plain(stats.sessionSnapshot(session)).completedPlays.length, 1);
});

test('a future schema installed before an old queued lock callback remains byte-for-byte untouched', async () => {
  const locks = makeLockManager({ autoGrant: false });
  const { stats, localStorage } = loadStats(null, {}, null, locks);
  assert.equal(stats.history().recentPlays.length, 0);

  const session = stats.createSession('stale-tab-game');
  const pending = stats.beginBypassedPlay(session, {
    possessionId: 'stale-tab-possession',
    playId: 'stale-tab-play',
    playType: 'scrimmage',
    preSnap: playContext(),
    calls: { offense: 'shortRun' },
    offeredYards: 3,
  });
  assert.ok(stats.completeBypassedPlay(session, pending, {
    actualYards: 3,
    outcome: 'gain',
    postPlay: playContext({ yardLine: 91, plays: 1, drivePlays: 1 }),
  }));

  assert.equal(localStorage.raw(), null);
  assert.equal(locks.pendingCount(), 1);
  const futureRaw = '{\n  "schemaVersion": 99,\n  "future": { "fromNewerTab": true }\n}\n';
  localStorage.setItem(STORAGE_KEY, futureRaw);
  await locks.grantAll();

  assert.equal(localStorage.raw(), futureRaw);
  assert.equal(localStorage.setCount(), 1);
  assert.equal(plain(stats.sessionSnapshot(session)).completedPlays.length, 1);
  assert.deepEqual(plain(stats.history().recentPlays.map(row => row.playId)), ['stale-tab-play']);
});

test('schema v3 drops rows with a missing or unknown play type instead of guessing scrimmage', () => {
  const malformed = JSON.stringify({
    schemaVersion: 3,
    aggregates: {},
    recentPlays: [
      { id: 'missing-type', gameId: 'malformed-game', instructionalStatus: 'bypassed' },
      { id: 'unknown-type', gameId: 'malformed-game', playType: 'kickoff', instructionalStatus: 'bypassed' },
    ],
    mastery: {},
  });
  const { stats, localStorage } = loadStats(malformed);

  assert.deepEqual(plain(stats.history().recentPlays), []);
  assert.equal(localStorage.raw(), malformed);
});

test('schema v3 drops rows missing any stable game, row, or play identity', () => {
  const base = {
    id: 'stable-row',
    gameId: 'stable-game',
    playId: 'stable-play',
    playType: 'scrimmage',
    instructionalStatus: 'bypassed',
    outcome: 'gain',
    metrics: { offeredYards: 3, actualYards: 3 },
  };
  const malformed = JSON.stringify({
    schemaVersion: 3,
    aggregates: {},
    recentPlays: [
      { ...base, gameId: undefined, id: 'missing-game-id' },
      { ...base, id: undefined, playId: 'missing-row-id' },
      { ...base, playId: undefined, id: 'missing-play-id' },
    ],
    mastery: {},
  });
  const { stats, localStorage } = loadStats(malformed);

  assert.deepEqual(plain(stats.history().recentPlays), []);
  assert.equal(localStorage.raw(), malformed);
});

for (const schemaVersion of [1, 2]) {
  test(`schema v${schemaVersion} retains legacy stable identity fallbacks`, () => {
    const legacy = JSON.stringify({
      schemaVersion,
      aggregates: { completedPlays: 1, actualYards: 3 },
      recentPlays: [{
        sequence: 7,
        instructionalStatus: 'bypassed',
        preSnap: playContext(),
        offeredYards: 3,
        actualYards: 3,
        outcome: 'gain',
        postPlay: playContext({ yardLine: 91, plays: 1, drivePlays: 1 }),
      }],
      mastery: {},
    });
    const { stats, localStorage } = loadStats(legacy);

    assert.deepEqual(
      plain(stats.history().recentPlays.map(row => [row.gameId, row.id, row.playId])),
      [['unknown-game', 'unknown-game-legacy-7', 'unknown-game-legacy-7']],
    );
    assert.equal(localStorage.raw(), legacy);
  });
}

test('schema v3 drops invalid outcomes instead of inventing plausible results', () => {
  const malformed = JSON.stringify({
    schemaVersion: 3,
    aggregates: {},
    recentPlays: ['scrimmage', 'conversion', 'fieldGoal', 'punt'].map((playType, index) => ({
      id: `invalid-outcome-${index}`,
      gameId: 'malformed-game',
      playId: `invalid-play-${index}`,
      playType,
      instructionalStatus: 'bypassed',
      outcome: 'not-a-football-result',
    })),
    mastery: {},
  });
  const { stats, localStorage } = loadStats(malformed);

  assert.deepEqual(plain(stats.history().recentPlays), []);
  assert.equal(localStorage.raw(), malformed);
});

function completeBypassed(stats, { gameId, possessionId, playId, id = null }) {
  const session = stats.createSession(gameId);
  const pending = stats.beginBypassedPlay(session, {
    ...(id ? { id } : {}),
    possessionId,
    playId,
    playType: 'scrimmage',
    preSnap: playContext(),
    calls: { offense: 'shortRun' },
    offeredYards: 3,
  });
  return stats.completeBypassedPlay(session, pending, {
    actualYards: 3,
    outcome: 'gain',
    postPlay: playContext({ yardLine: 91, plays: 1, drivePlays: 1 }),
  });
}

function completePresented(stats, {
  gameId,
  possessionId,
  playId,
  id = null,
  concept = 'field-distance',
  evidenceClass = 'independent',
  resolution = 'firstTryCorrect',
}) {
  const session = stats.createSession(gameId);
  const pending = stats.beginPlay(session, {
    ...(id ? { id } : {}),
    possessionId,
    playId,
    playType: 'scrimmage',
    preSnap: playContext(),
    calls: { offense: 'shortRun' },
    offeredYards: 3,
    question: question(`${playId}-question`, concept, evidenceClass),
  });
  stats.recordAttempt(pending, {
    number: 1,
    correct: resolution === 'firstTryCorrect',
    support: 'none',
  });
  if (resolution !== 'firstTryCorrect') {
    stats.recordAttempt(pending, {
      number: 2,
      correct: resolution === 'retryCorrect',
      support: 'coachedRetry',
    });
  }
  stats.recordResolution(pending, resolution);
  return stats.completePlay(session, pending, {
    actualYards: 3,
    outcome: 'gain',
    postPlay: playContext({ yardLine: 91, plays: 1, drivePlays: 1 }),
  });
}

test('exclusive origin lock preserves two tab completions queued before either callback runs', async () => {
  const sharedStorage = makeStorage();
  const sharedLocks = makeLockManager({ autoGrant: false });
  const firstTab = loadStats(null, {}, sharedStorage, sharedLocks);
  const secondTab = loadStats(null, {}, sharedStorage, sharedLocks);

  assert.ok(completeBypassed(firstTab.stats, {
    gameId: 'first-game', possessionId: 'first-possession', playId: 'first-play', id: 'first-row',
  }));
  assert.ok(completeBypassed(secondTab.stats, {
    gameId: 'second-game', possessionId: 'second-possession', playId: 'second-play', id: 'second-row',
  }));

  assert.equal(sharedStorage.raw(), null);
  assert.equal(sharedLocks.pendingCount(), 2);
  assert.deepEqual(sharedLocks.requests.map(request => [request.name, request.options.mode]), [
    [`${STORAGE_KEY}:central-write`, 'exclusive'],
    [`${STORAGE_KEY}:central-write`, 'exclusive'],
  ]);
  await sharedLocks.grantAll();

  const persisted = JSON.parse(sharedStorage.raw());
  assert.equal(persisted.aggregates.completedPlays, 2);
  assert.equal(sharedStorage.setCount(), 2);
  assert.deepEqual(
    persisted.recentPlays.map(row => [row.gameId, row.playId]),
    [['first-game', 'first-play'], ['second-game', 'second-play']],
  );
});

test('concurrent tabs preserve separate literacy and independent mastery, recency, and unrelated season bytes', async () => {
  const seasonKey = 'footballMathSeason:v1';
  const seasonRaw = '{\n  "schemaVersion": 1,\n  "season": "leave-me-byte-identical"\n}\n';
  const sharedStorage = makeStorage();
  sharedStorage.setItem(seasonKey, seasonRaw);
  const sharedLocks = makeLockManager({ autoGrant: false });
  const firstTab = loadStats(null, {}, sharedStorage, sharedLocks);
  const secondTab = loadStats(null, {}, sharedStorage, sharedLocks);

  assert.ok(completePresented(firstTab.stats, {
    gameId: 'independent-game', possessionId: 'independent-possession', playId: 'independent-play',
    concept: 'shared-concept', evidenceClass: 'independent', resolution: 'firstTryCorrect',
  }));
  assert.ok(completePresented(secondTab.stats, {
    gameId: 'literacy-game', possessionId: 'literacy-possession', playId: 'literacy-play',
    concept: 'shared-concept', evidenceClass: 'literacy', resolution: 'retryCorrect',
  }));

  assert.equal(sharedLocks.pendingCount(), 2);
  await sharedLocks.grantAll();

  const persisted = JSON.parse(sharedStorage.raw());
  assert.equal(persisted.schemaVersion, 4);
  assert.deepEqual(persisted.mastery['shared-concept'], {
    independent: { resolved: 1, firstTryCorrect: 1, retryCorrect: 0, secondMiss: 0 },
    literacy: { resolved: 1, firstTryCorrect: 0, retryCorrect: 1, secondMiss: 0 },
  });
  assert.equal(persisted.lastResolvedByConcept['shared-concept'].independent.resolution, 'firstTryCorrect');
  assert.equal(persisted.lastResolvedByConcept['shared-concept'].literacy.resolution, 'retryCorrect');
  assert.deepEqual(
    persisted.recentPlays.map(row => [row.playId, row.question.evidenceClass]),
    [['independent-play', 'independent'], ['literacy-play', 'literacy']],
  );
  assert.equal(sharedStorage.raw(seasonKey), seasonRaw);
});

test('the same stable play completed in two tabs persists and aggregates once', async () => {
  const sharedStorage = makeStorage();
  const sharedLocks = makeLockManager({ autoGrant: false });
  const firstTab = loadStats(null, {}, sharedStorage, sharedLocks);
  const secondTab = loadStats(null, {}, sharedStorage, sharedLocks);

  assert.ok(completeBypassed(firstTab.stats, {
    gameId: 'shared-game', possessionId: 'first-possession', playId: 'shared-play', id: 'first-row',
  }));
  assert.ok(completeBypassed(secondTab.stats, {
    gameId: 'shared-game', possessionId: 'second-possession', playId: 'shared-play', id: 'second-row',
  }));

  await sharedLocks.grantNext();
  secondTab.dispatchStorage();
  assert.equal(secondTab.stats.history().aggregates.completedPlays, 1);
  assert.deepEqual(plain(secondTab.stats.history().recentPlays.map(row => row.id)), ['first-row']);
  await sharedLocks.grantAll();

  const persisted = JSON.parse(sharedStorage.raw());
  assert.equal(persisted.aggregates.completedPlays, 1);
  assert.deepEqual(persisted.recentPlays.map(row => row.id), ['first-row']);
  assert.equal(sharedStorage.setCount(), 1);
});

test('a same-stable-play race grants mastery to only the class on the winning canonical row', async () => {
  const sharedStorage = makeStorage();
  const sharedLocks = makeLockManager({ autoGrant: false });
  const firstTab = loadStats(null, {}, sharedStorage, sharedLocks);
  const secondTab = loadStats(null, {}, sharedStorage, sharedLocks);

  assert.ok(completePresented(firstTab.stats, {
    gameId: 'shared-class-game', possessionId: 'first-possession', playId: 'same-classified-play',
    id: 'independent-row', concept: 'shared-concept', evidenceClass: 'independent', resolution: 'firstTryCorrect',
  }));
  assert.ok(completePresented(secondTab.stats, {
    gameId: 'shared-class-game', possessionId: 'second-possession', playId: 'same-classified-play',
    id: 'literacy-row', concept: 'shared-concept', evidenceClass: 'literacy', resolution: 'retryCorrect',
  }));

  await sharedLocks.grantAll();

  const persisted = JSON.parse(sharedStorage.raw());
  assert.equal(persisted.aggregates.completedPlays, 1);
  assert.deepEqual(persisted.recentPlays.map(row => [row.id, row.question.evidenceClass]), [
    ['independent-row', 'independent'],
  ]);
  assert.deepEqual(persisted.mastery['shared-concept'], {
    independent: { resolved: 1, firstTryCorrect: 1, retryCorrect: 0, secondMiss: 0 },
  });
  assert.deepEqual(Object.keys(persisted.lastResolvedByConcept['shared-concept']), ['independent']);
});

test('stable-play replay remains deduplicated after its history row is evicted', async () => {
  const sharedStorage = makeStorage();
  const sharedLocks = makeLockManager({ autoGrant: false });
  const originalTab = loadStats(null, {}, sharedStorage, sharedLocks);

  for (let index = 1; index <= 201; index++) {
    assert.ok(completeBypassed(originalTab.stats, {
      gameId: 'archive-game',
      possessionId: `archive-possession-${index}`,
      playId: `archive-game-play-${index}`,
      id: `archive-row-${index}`,
    }));
  }
  await sharedLocks.grantAll();

  const beforeReplay = JSON.parse(sharedStorage.raw());
  assert.equal(beforeReplay.aggregates.completedPlays, 201);
  assert.equal(beforeReplay.recentPlays.length, 200);
  assert.equal(beforeReplay.recentPlays.some(row => row.playId === 'archive-game-play-1'), false);
  assert.deepEqual(beforeReplay.archivedPlayIndex['archive-game'], { through: 1, ids: [] });

  const replayTab = loadStats(null, {}, sharedStorage, sharedLocks);
  assert.equal(completeBypassed(replayTab.stats, {
    gameId: 'archive-game',
    possessionId: 'replayed-possession',
    playId: 'archive-game-play-1',
    id: 'replayed-row',
  }), false);
  await sharedLocks.grantAll();

  const afterReplay = JSON.parse(sharedStorage.raw());
  assert.equal(afterReplay.aggregates.completedPlays, 201);
  assert.equal(afterReplay.recentPlays.length, 200);
  assert.equal(sharedStorage.setCount(), 1);
  assert.equal(Object.hasOwn(plain(replayTab.stats.history()), 'archivedPlayIndex'), false);
});

test('legacy archive migration preserves retired production gaps and exact fallback identities', async () => {
  const seed = JSON.stringify({
    schemaVersion: 3,
    aggregates: {},
    recentPlays: [],
    archivedPlayKeys: [
      JSON.stringify(['migration-game', 'migration-game-play-3']),
      JSON.stringify(['fallback-game', 'custom-play']),
      'not-json',
      JSON.stringify(['only-one']),
      JSON.stringify([7, 'bad']),
    ],
    mastery: {},
  });
  const sharedStorage = makeStorage(seed);
  const sharedLocks = makeLockManager({ autoGrant: false });
  const tab = loadStats(null, {}, sharedStorage, sharedLocks);

  // Production sequences are allocated once and never reused, so migrating
  // sequence 3 permanently retires lower gaps as well as sequence 3 itself.
  assert.equal(completeBypassed(tab.stats, {
    gameId: 'migration-game', possessionId: 'retired-gap', playId: 'migration-game-play-2',
  }), false);
  assert.equal(completeBypassed(tab.stats, {
    gameId: 'migration-game', possessionId: 'retired-sequence', playId: 'migration-game-play-3',
  }), false);
  assert.equal(completeBypassed(tab.stats, {
    gameId: 'fallback-game', possessionId: 'archived-fallback', playId: 'custom-play',
  }), false);

  // Non-production identities remain exact: a different ID in the same game
  // is not hidden by the compact production watermark.
  assert.ok(completeBypassed(tab.stats, {
    gameId: 'fallback-game', possessionId: 'new-fallback', playId: 'other-custom', id: 'other-row',
  }));
  assert.ok(completeBypassed(tab.stats, {
    gameId: 'migration-game', possessionId: 'next-sequence', playId: 'migration-game-play-4', id: 'next-row',
  }));
  await sharedLocks.grantAll();

  const persisted = JSON.parse(sharedStorage.raw());
  assert.equal(Object.hasOwn(persisted, 'archivedPlayKeys'), false);
  assert.deepEqual(persisted.archivedPlayIndex['migration-game'], { through: 3, ids: [] });
  assert.deepEqual(persisted.archivedPlayIndex['fallback-game'], { through: 0, ids: ['custom-play'] });
  assert.deepEqual(Object.keys(persisted.archivedPlayIndex).sort(), ['fallback-game', 'migration-game']);
  assert.equal(persisted.aggregates.completedPlays, 2);
  assert.deepEqual(persisted.recentPlays.map(row => row.playId), [
    'other-custom',
    'migration-game-play-4',
  ]);
});

test('a stale tab cannot repersist an evicted stable play after its lock-time fresh read', async () => {
  const sharedStorage = makeStorage();
  const sharedLocks = makeLockManager({ autoGrant: false });
  const staleTab = loadStats(null, {}, sharedStorage, sharedLocks);
  assert.equal(staleTab.stats.history().aggregates.completedPlays, 0);

  const currentTab = loadStats(null, {}, sharedStorage, sharedLocks);
  for (let index = 1; index <= 201; index++) {
    assert.ok(completeBypassed(currentTab.stats, {
      gameId: 'stale-archive-game',
      possessionId: `stale-archive-possession-${index}`,
      playId: `stale-archive-game-play-${index}`,
      id: `stale-archive-row-${index}`,
    }));
  }
  await sharedLocks.grantAll();
  assert.equal(JSON.parse(sharedStorage.raw()).aggregates.completedPlays, 201);

  // The stale tab has not received a storage event, so it initially stages the
  // old identity. The exclusive callback must reject it against a fresh read.
  assert.ok(completeBypassed(staleTab.stats, {
    gameId: 'stale-archive-game',
    possessionId: 'stale-replay-possession',
    playId: 'stale-archive-game-play-1',
    id: 'stale-replay-row',
  }));
  await sharedLocks.grantAll();

  const persisted = JSON.parse(sharedStorage.raw());
  assert.equal(persisted.aggregates.completedPlays, 201);
  assert.equal(persisted.recentPlays.some(row => row.id === 'stale-replay-row'), false);
  assert.equal(sharedStorage.setCount(), 1);
  assert.equal(staleTab.stats.history().aggregates.completedPlays, 201);
});

test('without a lock manager completion stays synchronous and central storage is unchanged', () => {
  const storage = makeStorage();
  const tab = loadStats(null, {}, storage, null);

  const row = completeBypassed(tab.stats, {
    gameId: 'memory-game', possessionId: 'memory-possession', playId: 'memory-play',
  });

  assert.ok(row);
  assert.equal(storage.raw(), null);
  assert.equal(storage.setCount(), 0);
  assert.deepEqual(plain(tab.stats.history().recentPlays.map(item => item.playId)), ['memory-play']);
  assert.equal(tab.stats.history().aggregates.completedPlays, 1);
});

test('a storage event refreshes persisted cache without dropping a pending local row', () => {
  const remoteStorage = makeStorage();
  const remoteTab = loadStats(null, {}, remoteStorage);
  assert.ok(completeBypassed(remoteTab.stats, {
    gameId: 'remote-game', possessionId: 'remote-possession', playId: 'remote-play', id: 'remote-row',
  }));
  const remoteRaw = remoteStorage.raw();

  const sharedStorage = makeStorage();
  const sharedLocks = makeLockManager({ autoGrant: false });
  const localTab = loadStats(null, {}, sharedStorage, sharedLocks);
  assert.equal(localTab.stats.history().recentPlays.length, 0);
  assert.ok(completeBypassed(localTab.stats, {
    gameId: 'local-game', possessionId: 'local-possession', playId: 'local-play', id: 'local-row',
  }));
  assert.equal(sharedLocks.pendingCount(), 1);

  sharedStorage.setItem(STORAGE_KEY, remoteRaw);
  localTab.dispatchStorage();
  const merged = plain(localTab.stats.history());
  assert.deepEqual(merged.recentPlays.map(row => row.playId), ['remote-play', 'local-play']);
  assert.equal(merged.aggregates.completedPlays, 2);
});

test('learning recency follows completion time when an older staged row is appended last', async () => {
  const sharedStorage = makeStorage();
  const sharedLocks = makeLockManager({ autoGrant: false });
  const localTab = loadStats(null, {}, sharedStorage, sharedLocks);
  const localRow = completePresented(localTab.stats, {
    gameId: 'local-learning-game',
    possessionId: 'local-learning-possession',
    playId: 'local-learning-play',
    id: 'local-learning-row',
    resolution: 'firstTryCorrect',
  });
  assert.ok(localRow);

  const remoteStorage = makeStorage();
  const remoteTab = loadStats(null, {}, remoteStorage);
  assert.ok(completePresented(remoteTab.stats, {
    gameId: 'remote-learning-game',
    possessionId: 'remote-learning-possession',
    playId: 'remote-learning-play',
    id: 'remote-learning-row',
    resolution: 'secondMiss',
  }));
  const remoteStore = JSON.parse(remoteStorage.raw());
  const remoteCompletedAt = new Date(Date.parse(localRow.completedAt) + 60_000).toISOString();
  remoteStore.recentPlays[0].completedAt = remoteCompletedAt;

  sharedStorage.setItem(STORAGE_KEY, JSON.stringify(remoteStore));
  localTab.dispatchStorage();
  assert.deepEqual(
    plain(localTab.stats.history().recentPlays.map(row => row.playId)),
    ['remote-learning-play', 'local-learning-play'],
  );
  assert.deepEqual(
    plain(localTab.stats.learningSnapshot().lastResolvedByConcept['field-distance']),
    { independent: { completedAt: remoteCompletedAt, resolution: 'secondMiss' } },
  );

  await sharedLocks.grantAll();
  assert.deepEqual(
    JSON.parse(sharedStorage.raw()).recentPlays.map(row => row.playId),
    ['remote-learning-play', 'local-learning-play'],
  );
  assert.deepEqual(
    plain(localTab.stats.learningSnapshot().lastResolvedByConcept['field-distance']),
    { independent: { completedAt: remoteCompletedAt, resolution: 'secondMiss' } },
  );
});

test('learning recency survives when a delayed row displaces newer evidence from the capped journal', async () => {
  const sharedStorage = makeStorage();
  const sharedLocks = makeLockManager({ autoGrant: false });
  const localTab = loadStats(null, {}, sharedStorage, sharedLocks);
  const delayedRow = completePresented(localTab.stats, {
    gameId: 'delayed-cap-game',
    possessionId: 'delayed-cap-possession',
    playId: 'delayed-cap-play',
    id: 'delayed-cap-row',
    concept: 'field-distance',
    resolution: 'firstTryCorrect',
  });
  assert.ok(delayedRow);

  const remoteStorage = makeStorage();
  const remoteTab = loadStats(null, {}, remoteStorage);
  for (let index = 1; index <= 200; index++) {
    assert.ok(completePresented(remoteTab.stats, {
      gameId: `remote-cap-game-${index}`,
      possessionId: `remote-cap-possession-${index}`,
      playId: `remote-cap-play-${index}`,
      id: `remote-cap-row-${index}`,
      concept: index <= 2 ? 'field-distance' : 'cap-filler',
      evidenceClass: index === 2 ? 'literacy' : 'independent',
      resolution: index === 1 ? 'secondMiss' : index === 2 ? 'retryCorrect' : 'firstTryCorrect',
    }));
  }
  await remoteTab.locks.grantAll();
  const remoteStore = JSON.parse(remoteStorage.raw());
  const futureStart = Date.parse('2099-01-01T00:00:00.000Z');
  remoteStore.recentPlays.forEach((row, index) => {
    row.completedAt = new Date(futureStart + (index * 1000)).toISOString();
  });
  const newestFieldDistance = remoteStore.recentPlays[0].completedAt;
  const newestLiteracyFieldDistance = remoteStore.recentPlays[1].completedAt;

  sharedStorage.setItem(STORAGE_KEY, JSON.stringify(remoteStore));
  localTab.dispatchStorage();
  const mergedHistory = plain(localTab.stats.history());
  assert.equal(mergedHistory.recentPlays.length, 200);
  assert.equal(mergedHistory.recentPlays.some(row => row.playId === 'remote-cap-play-1'), false);
  assert.equal(mergedHistory.recentPlays.at(-1).playId, 'delayed-cap-play');
  assert.equal(Object.hasOwn(mergedHistory, 'lastResolvedByConcept'), false);
  assert.deepEqual(
    plain(localTab.stats.learningSnapshot().lastResolvedByConcept['field-distance']),
    {
      independent: { completedAt: newestFieldDistance, resolution: 'secondMiss' },
      literacy: { completedAt: newestLiteracyFieldDistance, resolution: 'retryCorrect' },
    },
  );

  await sharedLocks.grantAll();
  const persisted = JSON.parse(sharedStorage.raw());
  assert.deepEqual(
    persisted.lastResolvedByConcept['field-distance'],
    {
      independent: { completedAt: newestFieldDistance, resolution: 'secondMiss' },
      literacy: { completedAt: newestLiteracyFieldDistance, resolution: 'retryCorrect' },
    },
  );
  assert.deepEqual(
    plain(localTab.stats.learningSnapshot().lastResolvedByConcept['field-distance']),
    {
      independent: { completedAt: newestFieldDistance, resolution: 'secondMiss' },
      literacy: { completedAt: newestLiteracyFieldDistance, resolution: 'retryCorrect' },
    },
  );
});
