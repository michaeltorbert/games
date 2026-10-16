import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../football/season.js', import.meta.url), 'utf8');
const STORAGE_KEY = 'footballMathSeason:v1';
const SCHEDULE = ['unc', 'nc-state', 'wake-forest'];
const PLAYER_TEAMS = ['duke', 'virginia-tech', 'texas', 'georgia-tech'];
const LEGACY_FORMAT_ID = 'three-rival-schedule-v1';
const TEAM_FORMAT_ID = 'three-rival-team-schedule-v2';

function makeStorage(seed = null, options = {}) {
  const values = new Map();
  let setItemCalls = 0;
  let blockRead = Boolean(options.blockRead);
  let blockWrite = Boolean(options.blockWrite);
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
    removeItem(key) { values.delete(key); },
    raw(key = STORAGE_KEY) { return values.get(key) ?? null; },
    setRaw(value, key = STORAGE_KEY) {
      if (value == null) values.delete(key);
      else values.set(key, String(value));
    },
    setBlocked({ read = blockRead, write = blockWrite } = {}) {
      blockRead = read;
      blockWrite = write;
    },
    setCount() { return setItemCalls; },
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
      pending.push({ callback, resolve, reject });
      if (autoGrant) void manager.grantNext();
      return result;
    },
    requests,
    pendingCount: () => pending.length,
    async grantNext() {
      if (active) await active;
      const entry = pending.shift();
      if (!entry) return false;
      active = (async () => {
        try { entry.resolve(await entry.callback()); }
        catch (error) { entry.reject(error); }
      })();
      try { await active; } finally { active = null; }
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

function loadSeason({
  seed = null,
  storage = null,
  locks = makeLockManager(),
  storageOptions = {},
  uuidPrefix = 'uuid',
} = {}) {
  const localStorage = storage || makeStorage(seed, storageOptions);
  const windowListeners = new Map();
  const navigator = locks ? { locks } : {};
  let uuid = 0;
  let randomCalls = 0;
  const opponent = Object.freeze({
    RIVAL_ORDER: Object.freeze([...SCHEDULE]),
    PLAYER_TEAM_ORDER: Object.freeze([...PLAYER_TEAMS]),
    DEFAULT_PLAYER_TEAM_ID: 'duke',
    resolveRival(rivalId) {
      if (!SCHEDULE.includes(rivalId)) throw new RangeError('Unknown rival');
      return Object.freeze({ id: rivalId });
    },
  });
  const window = {
    localStorage,
    navigator,
    addEventListener(type, listener) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(listener);
    },
  };
  const context = vm.createContext({
    window,
    navigator,
    FOOTBALL_OPPONENT: opponent,
    crypto: { randomUUID: () => `${uuidPrefix}-${++uuid}` },
    Math: Object.freeze({ random: () => { randomCalls++; return 0.5; } }),
  });
  vm.runInContext(source, context, { filename: 'season.js' });
  return {
    season: vm.runInContext('FOOTBALL_SEASON', context),
    storage: localStorage,
    locks,
    navigator,
    randomCalls: () => randomCalls,
    dispatchStorage(key = STORAGE_KEY) {
      for (const listener of windowListeners.get('storage') || []) listener({ key });
    },
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function rawResult(gameNumber, playerScore, opponentScore, gameId = `game-${gameNumber}`) {
  return {
    gameNumber,
    gameId,
    rivalId: SCHEDULE[gameNumber - 1],
    playerScore,
    opponentScore,
    completedAt: `2026-07-${String(18 + gameNumber).padStart(2, '0')}T12:00:00.000Z`,
  };
}

function rawStore(results = [], seasonId = 'season-existing') {
  return JSON.stringify({
    schemaVersion: 1,
    currentSeason: {
      seasonId,
      formatId: 'three-rival-schedule-v1',
      playerId: 'duke',
      createdAt: '2026-07-19T12:00:00.000Z',
      schedule: [...SCHEDULE],
      results,
    },
  });
}

function rawTeamStore(playerId, results = [], seasonId = 'team-season-existing', overrides = {}) {
  return JSON.stringify({
    schemaVersion: 2,
    currentSeason: {
      seasonId,
      formatId: TEAM_FORMAT_ID,
      playerId,
      createdAt: '2026-07-19T12:00:00.000Z',
      schedule: [...SCHEDULE],
      results,
      ...overrides,
    },
  });
}

test('missing storage reads without writing and creates the exact three-game schema under the dedicated lock', async () => {
  const tab = loadSeason();
  assert.deepEqual(plain(tab.season.snapshot()), {
    status: 'missing', saveState: 'saved', playerId: null, gamesPlayed: 0, gameNumber: 1,
    schedule: [
      { gameNumber: 1, rivalId: 'unc', status: 'next' },
      { gameNumber: 2, rivalId: 'nc-state', status: 'open' },
      { gameNumber: 3, rivalId: 'wake-forest', status: 'open' },
    ],
    record: { wins: 0, losses: 0, ties: 0 }, nextRivalId: 'unc', complete: false,
    canPlaySeason: false, action: 'start', messageCode: null,
  });
  assert.equal(tab.storage.setCount(), 0, 'read must not repair or initialize');

  const created = await tab.season.startSeason();
  assert.equal(created.status, 'saved');
  assert.equal(tab.storage.setCount(), 1);
  assert.deepEqual(plain(tab.locks.requests), [{
    name: 'footballMathSeason:v1:central-write', options: { mode: 'exclusive' },
  }]);
  const stored = JSON.parse(tab.storage.raw());
  assert.deepEqual(stored.currentSeason.schedule, SCHEDULE);
  assert.deepEqual(stored.currentSeason.results, []);
  assert.equal(stored.currentSeason.seasonId, 'season-uuid-1');
  // An omitted team creates the default Duke season in the new team format.
  assert.equal(stored.schemaVersion, 2);
  assert.equal(stored.currentSeason.formatId, TEAM_FORMAT_ID);
  assert.equal(stored.currentSeason.playerId, 'duke');
  assert.deepEqual(Object.keys(stored.currentSeason), [
    'seasonId', 'formatId', 'playerId', 'createdAt', 'schedule', 'results',
  ]);
  assert.equal(tab.season.bindNextGame('game-live-1').rivalId, 'unc');
  assert.equal(tab.randomCalls(), 0);
});

test('a legacy schema-1 Duke season resumes, binds Duke, and appends results without migrating', async () => {
  const legacyRaw = rawStore([rawResult(1, 7, 3, 'legacy-game-1')], 'legacy-season');
  const storage = makeStorage(legacyRaw);
  const tab = loadSeason({ storage });
  const view = plain(tab.season.snapshot());
  assert.equal(view.status, 'active');
  assert.equal(view.playerId, 'duke');
  assert.equal(view.action, 'play');
  assert.equal(storage.raw(), legacyRaw, 'reads never rewrite legacy bytes');
  assert.equal(storage.setCount(), 0);

  const binding = tab.season.bindNextGame('legacy-game-2');
  assert.deepEqual(plain(binding), {
    seasonId: 'legacy-season', gameNumber: 2, rivalId: 'nc-state', playerId: 'duke', gameId: 'legacy-game-2',
  });
  assert.equal(storage.raw(), legacyRaw);
  assert.equal((await tab.season.settleGame(binding, { playerScore: 0, opponentScore: 10 })).status, 'saved');
  assert.equal(storage.setCount(), 1);

  const before = JSON.parse(legacyRaw);
  const after = JSON.parse(storage.raw());
  assert.equal(after.schemaVersion, 1, 'a legacy season keeps schema 1 on result appends');
  assert.deepEqual(Object.keys(after.currentSeason), Object.keys(before.currentSeason));
  for (const key of ['seasonId', 'formatId', 'playerId', 'createdAt', 'schedule']) {
    assert.deepEqual(after.currentSeason[key], before.currentSeason[key], `${key} is preserved`);
  }
  assert.equal(after.currentSeason.formatId, LEGACY_FORMAT_ID);
  assert.deepEqual(after.currentSeason.results[0], before.currentSeason.results[0]);
  assert.deepEqual(Object.keys(after.currentSeason.results[1]), Object.keys(before.currentSeason.results[0]));
  assert.equal(tab.season.hasExactSavedResult(binding, { playerScore: 0, opponentScore: 10 }), true);
  assert.equal(tab.season.hasExactSavedResult({ ...plain(binding), playerId: 'texas' }, {
    playerScore: 0, opponentScore: 10,
  }), false);
  assert.equal(tab.randomCalls(), 0);
});

test('every playable team creates, binds, completes, and replaces a schema-2 season with its locked team', async () => {
  for (const playerId of PLAYER_TEAMS) {
    const tab = loadSeason({ uuidPrefix: playerId });
    assert.equal((await tab.season.startSeason(playerId)).status, 'saved');
    const created = JSON.parse(tab.storage.raw());
    assert.equal(created.schemaVersion, 2);
    assert.equal(created.currentSeason.formatId, TEAM_FORMAT_ID);
    assert.equal(created.currentSeason.playerId, playerId);
    assert.equal(tab.season.snapshot().playerId, playerId);
    const scores = [
      { playerScore: 14, opponentScore: 7 },
      { playerScore: 3, opponentScore: 10 },
      { playerScore: 6, opponentScore: 6 },
    ];
    for (let index = 0; index < scores.length; index++) {
      const binding = tab.season.bindNextGame(`${playerId}-game-${index + 1}`);
      assert.equal(binding.playerId, playerId);
      assert.equal((await tab.season.settleGame(binding, scores[index])).status, 'saved');
    }
    const completed = JSON.parse(tab.storage.raw());
    assert.equal(completed.schemaVersion, 2);
    assert.equal(completed.currentSeason.playerId, playerId);
    assert.deepEqual(plain(tab.season.snapshot()).record, { wins: 1, losses: 1, ties: 1 });
    assert.equal(tab.season.snapshot().action, 'new');

    const nextTeam = PLAYER_TEAMS[(PLAYER_TEAMS.indexOf(playerId) + 1) % PLAYER_TEAMS.length];
    assert.equal((await tab.season.startNewSeason(nextTeam)).status, 'saved');
    const replaced = JSON.parse(tab.storage.raw());
    assert.equal(replaced.schemaVersion, 2);
    assert.equal(replaced.currentSeason.playerId, nextTeam);
    assert.deepEqual(replaced.currentSeason.results, []);
    assert.notEqual(replaced.currentSeason.seasonId, completed.currentSeason.seasonId);
    assert.equal(tab.randomCalls(), 0);
  }

  const legacyComplete = rawStore([rawResult(1, 7, 0), rawResult(2, 0, 7), rawResult(3, 3, 3)], 'legacy-complete');
  const legacyTab = loadSeason({ seed: legacyComplete });
  assert.equal((await legacyTab.season.startNewSeason('texas')).status, 'saved');
  const fromLegacy = JSON.parse(legacyTab.storage.raw());
  assert.equal(fromLegacy.schemaVersion, 2);
  assert.equal(fromLegacy.currentSeason.playerId, 'texas');

  const malformed = '{"schemaVersion":2,"currentSeason":{"broken":true}}';
  const freshTab = loadSeason({ seed: malformed });
  assert.equal(freshTab.season.snapshot().status, 'corrupt');
  assert.equal((await freshTab.season.startFreshSeason('georgia-tech')).status, 'saved');
  assert.equal(JSON.parse(freshTab.storage.raw()).currentSeason.playerId, 'georgia-tech');
});

test('team requests outside the catalog are rejected before any pending mutation or write', async () => {
  for (const invalid of [undefined, null, '', 'Duke', 'unc', 'wake-forest', 'virginia_tech', 7]) {
    const tab = loadSeason();
    assert.equal((await tab.season.startSeason(invalid)).status, 'invalid');
    assert.equal(tab.season.pendingKind(), null);
    assert.equal(tab.storage.setCount(), 0);
    assert.equal(tab.locks.requests.length, 0);

    const malformed = '{"schemaVersion":1,"currentSeason":{"broken":true}}';
    const freshTab = loadSeason({ seed: malformed });
    assert.equal((await freshTab.season.startFreshSeason(invalid)).status, 'invalid');
    assert.equal(freshTab.storage.raw(), malformed);

    const complete = rawStore([rawResult(1, 7, 0), rawResult(2, 0, 7), rawResult(3, 3, 3)]);
    const newTab = loadSeason({ seed: complete });
    assert.equal((await newTab.season.startNewSeason(invalid)).status, 'invalid');
    assert.equal(newTab.storage.raw(), complete);
    assert.equal(newTab.storage.setCount(), 0);
  }
});

test('each schema accepts only its own format and teams while reads stay byte-for-byte read-only', async () => {
  const supported = [
    rawStore(),
    ...PLAYER_TEAMS.map(playerId => rawTeamStore(playerId, [rawResult(1, 7, 0)])),
  ];
  for (const raw of supported) {
    const tab = loadSeason({ seed: raw });
    assert.equal(tab.season.snapshot().status, 'active');
    assert.equal(tab.season.snapshot().playerId, JSON.parse(raw).currentSeason.playerId);
    assert.equal(tab.storage.raw(), raw);
    assert.equal(tab.storage.setCount(), 0);
  }

  const legacyTexas = JSON.parse(rawStore());
  legacyTexas.currentSeason.playerId = 'texas';
  const legacyWithTeamFormat = JSON.parse(rawStore());
  legacyWithTeamFormat.currentSeason.formatId = TEAM_FORMAT_ID;
  const malformed = [
    JSON.stringify(legacyTexas),
    JSON.stringify(legacyWithTeamFormat),
    rawTeamStore('unc'),
    rawTeamStore('Duke'),
    rawTeamStore('texas', [], 'team-season', { formatId: LEGACY_FORMAT_ID }),
    rawTeamStore('texas', [], 'team-season', { extra: true }),
    rawTeamStore('texas', [rawResult(2, 7, 0)]),
    JSON.stringify({ ...JSON.parse(rawTeamStore('texas')), schemaVersion: '2' }),
  ];
  for (const raw of malformed) {
    const tab = loadSeason({ seed: raw });
    assert.equal(tab.season.snapshot().status, 'corrupt', raw);
    assert.equal(tab.season.snapshot().playerId, null);
    assert.equal(tab.season.bindNextGame('must-not-bind'), null);
    assert.equal((await tab.season.startSeason('texas')).status, 'malformed');
    assert.equal(tab.storage.raw(), raw);
    assert.equal(tab.storage.setCount(), 0);
  }
});

test('schema 2 is future to a schema-1 reader while unsupported schema 3 stays untouched here', async () => {
  const tab = loadSeason();
  assert.equal((await tab.season.startSeason('virginia-tech')).status, 'saved');
  const written = JSON.parse(tab.storage.raw());
  // The base-commit reader classified every finite schema above 1 as future,
  // preserving it byte-for-byte rather than offering a destructive fresh start.
  assert.ok(Number.isFinite(written.schemaVersion) && written.schemaVersion > 1);
  assert.equal(tab.season.SCHEMA_VERSION, 2);
  assert.equal(tab.season.LEGACY_SCHEMA_VERSION, 1);

  const unsupported = '{\n  "schemaVersion": 3,\n  "currentSeason": { "playerId": "texas" }\n}\n';
  const futureTab = loadSeason({ seed: unsupported });
  assert.equal(futureTab.season.snapshot().status, 'future');
  assert.equal(futureTab.season.snapshot().playerId, null);
  assert.equal((await futureTab.season.startSeason('texas')).status, 'future');
  assert.equal((await futureTab.season.startFreshSeason('texas')).status, 'future');
  assert.equal((await futureTab.season.startNewSeason('texas')).status, 'future');
  assert.equal(futureTab.season.bindNextGame('must-not-bind'), null);
  assert.equal(futureTab.storage.raw(), unsupported);
  assert.equal(futureTab.storage.setCount(), 0);
});

test('bindings carry the durable team and a mismatched or missing team never settles or attests', async () => {
  const raw = rawTeamStore('georgia-tech', [], 'team-binding-season');
  const storage = makeStorage(raw);
  const tab = loadSeason({ storage });
  const binding = plain(tab.season.bindNextGame('team-binding-game'));
  assert.deepEqual(binding, {
    seasonId: 'team-binding-season', gameNumber: 1, rivalId: 'unc', playerId: 'georgia-tech', gameId: 'team-binding-game',
  });
  const scores = { playerScore: 10, opponentScore: 3 };
  assert.equal((await tab.season.settleGame({ ...binding, playerId: 'texas' }, scores)).status, 'conflict');
  assert.equal(storage.raw(), raw);
  assert.equal(storage.setCount(), 0);
  const { playerId: omitted, ...withoutTeam } = binding;
  assert.equal(omitted, 'georgia-tech');
  assert.equal((await tab.season.settleGame(withoutTeam, scores)).status, 'invalid');
  assert.equal((await tab.season.settleGame({ ...binding, playerId: 'unc' }, scores)).status, 'invalid');
  assert.equal(storage.raw(), raw);
  assert.equal(storage.setCount(), 0);

  assert.equal((await tab.season.settleGame(binding, scores)).status, 'saved');
  assert.equal(tab.season.hasExactSavedResult(binding, scores), true);
  assert.equal(tab.season.hasExactSavedResult({ ...binding, playerId: 'duke' }, scores), false);
  assert.equal(tab.season.hasExactSavedResult(withoutTeam, scores), false);
  const stored = JSON.parse(storage.raw());
  assert.equal(stored.currentSeason.playerId, 'georgia-tech');
  assert.deepEqual(Object.keys(stored.currentSeason.results[0]), [
    'gameNumber', 'gameId', 'rivalId', 'playerScore', 'opponentScore', 'completedAt',
  ]);
});

test('pending team mutations expose only their public team while concurrent different-team creation keeps the first writer', async () => {
  const storage = makeStorage();
  const locks = makeLockManager({ autoGrant: false });
  const texasTab = loadSeason({ storage, locks, uuidPrefix: 'texas-tab' });
  const techTab = loadSeason({ storage, locks, uuidPrefix: 'tech-tab' });
  const texasCreate = texasTab.season.startSeason('texas');
  const techCreate = techTab.season.startSeason('virginia-tech');
  await Promise.resolve();
  const pendingView = plain(texasTab.season.snapshot());
  assert.equal(pendingView.saveState, 'pending');
  assert.equal(pendingView.playerId, 'texas');
  assert.ok(!JSON.stringify(pendingView).includes('season-texas-tab'));
  assert.equal(techTab.season.snapshot().playerId, 'virginia-tech');

  await locks.grantAll();
  assert.equal((await texasCreate).status, 'saved');
  assert.equal((await techCreate).status, 'ready');
  assert.equal(storage.setCount(), 1);
  const stored = JSON.parse(storage.raw()).currentSeason;
  assert.equal(stored.playerId, 'texas');
  assert.equal(stored.seasonId, 'season-texas-tab-1');
  // The losing tab reports the durable winner's team, never its own request.
  assert.equal(techTab.season.snapshot().playerId, 'texas');
  assert.equal(techTab.season.snapshot().action, 'play');
  assert.equal(techTab.season.bindNextGame('tech-tab-game').playerId, 'texas');

  const blocked = makeStorage(rawTeamStore('virginia-tech'), { blockWrite: true });
  const blockedTab = loadSeason({ storage: blocked });
  const binding = blockedTab.season.bindNextGame('pending-team-game');
  assert.equal((await blockedTab.season.settleGame(binding, { playerScore: 8, opponentScore: 7 })).status, 'pending');
  assert.equal(blockedTab.season.snapshot().playerId, 'virginia-tech');
  assert.equal((await blockedTab.season.settleGame({ ...plain(binding), playerId: 'texas' }, {
    playerScore: 8, opponentScore: 7,
  })).status, 'blocked');
});

test('exact saved-result attestation is read-only and rejects every nonmatching durable state', () => {
  const completedResults = [
    rawResult(1, 7, 0, 'exact-game-1'),
    rawResult(2, 0, 7, 'exact-game-2'),
    rawResult(3, 3, 3, 'exact-game-3'),
  ];
  const completedRaw = rawStore(completedResults, 'exact-season');
  const completed = loadSeason({ seed: completedRaw });
  const exactBinding = {
    seasonId: 'exact-season',
    gameNumber: 3,
    rivalId: 'wake-forest',
    playerId: 'duke',
    gameId: 'exact-game-3',
  };
  const exactScores = { playerScore: 3, opponentScore: 3 };
  assert.equal(completed.season.hasExactSavedResult(exactBinding, exactScores), true);
  const { playerId: _legacyTeam, ...bindingWithoutTeam } = exactBinding;
  assert.equal(completed.season.hasExactSavedResult(bindingWithoutTeam, exactScores), false);
  assert.equal(completed.season.hasExactSavedResult({
    ...exactBinding, playerId: 'virginia-tech',
  }, exactScores), false);
  assert.equal(completed.season.hasExactSavedResult({
    ...exactBinding, gameId: 'different-game',
  }, exactScores), false);
  assert.equal(completed.season.hasExactSavedResult(exactBinding, {
    playerScore: 4, opponentScore: 3,
  }), false);
  assert.equal(completed.season.hasExactSavedResult({
    ...exactBinding, rivalId: 'unc',
  }, exactScores), false);
  assert.equal(completed.season.hasExactSavedResult({
    ...exactBinding, seasonId: 'other-season',
  }, exactScores), false);
  assert.equal(completed.season.hasExactSavedResult({
    ...exactBinding, gameNumber: 2, rivalId: 'nc-state',
  }, exactScores), false);
  assert.equal(completed.storage.raw(), completedRaw);
  assert.equal(completed.storage.setCount(), 0);
  assert.equal(completed.randomCalls(), 0);

  const openRaw = rawStore([completedResults[0]], 'open-season');
  const open = loadSeason({ seed: openRaw });
  assert.equal(open.season.hasExactSavedResult({
    seasonId: 'open-season', gameNumber: 2, rivalId: 'nc-state', gameId: 'open-game-2',
  }, { playerScore: 10, opponentScore: 7 }), false);
  assert.equal(open.storage.raw(), openRaw);
  assert.equal(open.storage.setCount(), 0);
  assert.equal(open.randomCalls(), 0);

  const incompatible = [
    loadSeason(),
    loadSeason({ seed: '{"schemaVersion":1,"currentSeason":{"broken":true}}' }),
    loadSeason({ seed: '{"schemaVersion":99,"newer":true}' }),
    loadSeason({ storageOptions: { blockRead: true } }),
  ];
  for (const tab of incompatible) {
    assert.equal(tab.season.hasExactSavedResult(exactBinding, exactScores), false);
    assert.equal(tab.storage.setCount(), 0);
    assert.equal(tab.randomCalls(), 0);
  }
});

test('wins, losses, and ties fill one rung each and all derived views complete after three games', async () => {
  const tab = loadSeason();
  await tab.season.startSeason();
  const scores = [
    { playerScore: 14, opponentScore: 7 },
    { playerScore: 3, opponentScore: 10 },
    { playerScore: 6, opponentScore: 6 },
  ];
  for (let index = 0; index < scores.length; index++) {
    const binding = tab.season.bindNextGame(`game-live-${index + 1}`);
    assert.equal(binding.gameNumber, index + 1);
    assert.equal((await tab.season.settleGame(binding, scores[index])).status, 'saved');
  }
  const view = plain(tab.season.snapshot());
  assert.equal(view.status, 'complete');
  assert.equal(view.action, 'new');
  assert.deepEqual(view.record, { wins: 1, losses: 1, ties: 1 });
  assert.deepEqual(view.schedule.map(rung => rung.status), ['win', 'loss', 'tie']);
  assert.equal(view.nextRivalId, null);
  assert.equal(view.gameNumber, null);
  const stored = JSON.parse(tab.storage.raw());
  assert.ok(stored.currentSeason.results.every(result => !Object.hasOwn(result, 'outcome')));
  assert.equal(tab.randomCalls(), 0);
});

test('every W-L-T ordering derives the same one-win, one-loss, one-tie record', async () => {
  const permutations = [
    ['win', 'loss', 'tie'], ['win', 'tie', 'loss'],
    ['loss', 'win', 'tie'], ['loss', 'tie', 'win'],
    ['tie', 'win', 'loss'], ['tie', 'loss', 'win'],
  ];
  const scores = {
    win: { playerScore: 8, opponentScore: 7 },
    loss: { playerScore: 3, opponentScore: 10 },
    tie: { playerScore: 6, opponentScore: 6 },
  };
  for (const ordering of permutations) {
    const tab = loadSeason();
    await tab.season.startSeason();
    for (let index = 0; index < ordering.length; index++) {
      await tab.season.settleGame(
        tab.season.bindNextGame(`permutation-${ordering.join('-')}-${index + 1}`),
        scores[ordering[index]],
      );
    }
    const view = plain(tab.season.snapshot());
    assert.deepEqual(view.schedule.map(rung => rung.status), ordering);
    assert.deepEqual(view.record, { wins: 1, losses: 1, ties: 1 });
  }
});

test('strict malformed data is read-only until explicit fresh start and future bytes are never replaced', async () => {
  const malformed = rawStore([rawResult(2, 7, 0)]);
  const malformedTab = loadSeason({ seed: malformed });
  assert.equal(malformedTab.season.snapshot().status, 'corrupt');
  assert.equal(malformedTab.storage.raw(), malformed);
  assert.equal(malformedTab.storage.setCount(), 0);
  assert.equal((await malformedTab.season.startSeason()).status, 'malformed');
  assert.equal(malformedTab.storage.raw(), malformed);
  assert.equal((await malformedTab.season.startFreshSeason()).status, 'saved');
  assert.equal(malformedTab.season.snapshot().status, 'active');

  const futureRaw = '{\n  "schemaVersion": 99,\n  "future": { "preserve": true }\n}\n';
  const futureTab = loadSeason({ seed: futureRaw });
  assert.equal(futureTab.season.snapshot().status, 'future');
  assert.equal((await futureTab.season.startSeason()).status, 'future');
  assert.equal((await futureTab.season.startFreshSeason()).status, 'future');
  assert.equal(futureTab.storage.raw(), futureRaw);
  assert.equal(futureTab.storage.setCount(), 0);
});

test('timestamps must be exact canonical ISO instants before explicit fresh recovery may replace them', async () => {
  const invalidStores = [
    (() => {
      const value = JSON.parse(rawStore());
      value.currentSeason.createdAt = '1';
      return JSON.stringify(value);
    })(),
    (() => {
      const value = JSON.parse(rawStore());
      value.currentSeason.createdAt = '2026-02-30T12:00:00.000Z';
      return JSON.stringify(value);
    })(),
    (() => {
      const value = JSON.parse(rawStore([rawResult(1, 7, 0)]));
      value.currentSeason.results[0].completedAt = '1';
      return JSON.stringify(value);
    })(),
    (() => {
      const value = JSON.parse(rawStore([rawResult(1, 7, 0)]));
      value.currentSeason.results[0].completedAt = '2026-02-30T12:00:00.000Z';
      return JSON.stringify(value);
    })(),
  ];

  for (const invalidRaw of invalidStores) {
    const tab = loadSeason({ seed: invalidRaw });
    assert.equal(tab.season.snapshot().status, 'corrupt');
    assert.equal(tab.storage.raw(), invalidRaw);
    assert.equal(tab.storage.setCount(), 0, 'invalid timestamp reads must stay byte-preserving');
    assert.equal((await tab.season.startSeason()).status, 'malformed');
    assert.equal(tab.storage.raw(), invalidRaw);
    assert.equal((await tab.season.startFreshSeason()).status, 'saved');
    assert.equal(tab.season.snapshot().status, 'active');
  }
});

test('a future schema installed before a queued create callback remains byte-for-byte exact', async () => {
  const storage = makeStorage();
  const locks = makeLockManager({ autoGrant: false });
  const tab = loadSeason({ storage, locks });
  const creating = tab.season.startSeason();
  await Promise.resolve();
  assert.equal(tab.season.pendingKind(), 'create');
  assert.equal(locks.pendingCount(), 1);
  const futureRaw = '{\n  "schemaVersion": 88,\n  "newer": true\n}\n';
  storage.setRaw(futureRaw);
  await locks.grantAll();
  assert.equal((await creating).status, 'future');
  assert.equal(storage.raw(), futureRaw);
  assert.equal(storage.setCount(), 0);
  assert.equal(tab.season.pendingKind(), null);
  assert.equal(tab.season.snapshot().status, 'future');
});

test('lock absence and write failure retain only one retryable creation and start no game', async () => {
  const tab = loadSeason({ locks: null });
  const first = await tab.season.startSeason();
  const second = await tab.season.startSeason();
  assert.equal(first.status, 'pending');
  assert.equal(second.status, 'pending');
  assert.equal(tab.season.pendingKind(), 'create');
  assert.equal(tab.season.bindNextGame('must-not-bind'), null);
  assert.equal(tab.storage.raw(), null);
  assert.equal(tab.storage.setCount(), 0);

  const locks = makeLockManager();
  tab.navigator.locks = locks;
  assert.equal((await tab.season.retryPending()).status, 'saved');
  assert.equal(tab.season.pendingKind(), null);
  assert.equal(tab.season.snapshot().status, 'active');

  const blockedStorage = makeStorage(null, { blockWrite: true });
  const blockedTab = loadSeason({ storage: blockedStorage });
  assert.equal((await blockedTab.season.startSeason()).status, 'pending');
  assert.equal(blockedTab.season.pendingKind(), 'create');
  blockedStorage.setBlocked({ write: false });
  assert.equal((await blockedTab.season.retryPending()).status, 'saved');

  const rejectedTab = loadSeason({ locks: {
    request() { return Promise.reject(new Error('lock service failed')); },
  } });
  assert.equal((await rejectedTab.season.startSeason()).status, 'pending');
  assert.equal(rejectedTab.season.pendingKind(), 'create');
  rejectedTab.navigator.locks = makeLockManager();
  assert.equal((await rejectedTab.season.retryPending()).status, 'saved');
});

test('same-tab retries serialize behind the first lock callback and still write only once', async () => {
  const locks = makeLockManager({ autoGrant: false });
  const tab = loadSeason({ locks });
  const first = tab.season.startSeason();
  const queuedRetry = tab.season.retryPending();
  await Promise.resolve();
  assert.equal(locks.pendingCount(), 1);
  await locks.grantAll();
  assert.equal((await first).status, 'saved');
  assert.equal((await queuedRetry).status, 'none');
  assert.equal(tab.storage.setCount(), 1);
  assert.equal(locks.requests.length, 1);
});

test('a failed final keeps one immutable pending result, blocks another binding, and reload reopens the rung', async () => {
  const storage = makeStorage(rawStore());
  storage.setBlocked({ write: true });
  const tab = loadSeason({ storage });
  const binding = tab.season.bindNextGame('game-pending');
  assert.equal((await tab.season.settleGame(binding, { playerScore: 8, opponentScore: 7 })).status, 'pending');
  assert.equal(tab.season.pendingKind(), 'result');
  assert.equal(tab.season.snapshot().schedule[0].status, 'pending');
  assert.equal(tab.season.bindNextGame('game-two-must-not-start'), null);
  assert.equal((await tab.season.settleGame(binding, { playerScore: 8, opponentScore: 7 })).status, 'pending');
  assert.equal((await tab.season.settleGame(binding, { playerScore: 9, opponentScore: 7 })).status, 'blocked');
  assert.equal(JSON.parse(storage.raw()).currentSeason.results.length, 0);

  const reloaded = loadSeason({ storage });
  assert.equal(reloaded.season.pendingKind(), null);
  assert.equal(reloaded.season.snapshot().gameNumber, 1);
  assert.equal(reloaded.season.bindNextGame('game-after-reload').gameNumber, 1);

  storage.setBlocked({ write: false });
  assert.equal((await tab.season.retryPending()).status, 'saved');
  assert.equal(tab.season.snapshot().gameNumber, 2);
});

test('concurrent creation resumes the first durable season and concurrent slot settlement is first-writer-wins', async () => {
  const storage = makeStorage();
  const locks = makeLockManager({ autoGrant: false });
  const first = loadSeason({ storage, locks });
  const second = loadSeason({ storage, locks });
  const firstCreate = first.season.startSeason();
  const secondCreate = second.season.startSeason();
  await Promise.resolve();
  await locks.grantAll();
  assert.equal((await firstCreate).status, 'saved');
  assert.equal((await secondCreate).status, 'ready');
  assert.equal(storage.setCount(), 1);

  const firstBinding = first.season.bindNextGame('first-game');
  const secondBinding = second.season.bindNextGame('second-game');
  const firstSettle = first.season.settleGame(firstBinding, { playerScore: 7, opponentScore: 0 });
  const secondSettle = second.season.settleGame(secondBinding, { playerScore: 0, opponentScore: 7 });
  await Promise.resolve();
  await locks.grantAll();
  assert.equal((await firstSettle).status, 'saved');
  assert.equal((await secondSettle).status, 'conflict');
  const persisted = JSON.parse(storage.raw()).currentSeason.results;
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].gameId, 'first-game');
  assert.equal(second.season.pendingKind(), null);
  assert.equal(second.season.snapshot().saveState, 'conflict');
});

test('concurrent fresh and new-season resets keep the first locked replacement without a second write', async () => {
  const malformed = '{"schemaVersion":1,"currentSeason":{"broken":true}}';
  const freshStorage = makeStorage(malformed);
  const freshLocks = makeLockManager({ autoGrant: false });
  const firstFreshTab = loadSeason({
    storage: freshStorage, locks: freshLocks, uuidPrefix: 'fresh-first',
  });
  const secondFreshTab = loadSeason({
    storage: freshStorage, locks: freshLocks, uuidPrefix: 'fresh-second',
  });
  const firstFresh = firstFreshTab.season.startFreshSeason();
  const secondFresh = secondFreshTab.season.startFreshSeason();
  await Promise.resolve();
  await freshLocks.grantAll();
  assert.equal((await firstFresh).status, 'saved');
  assert.equal((await secondFresh).status, 'ready');
  assert.equal(freshStorage.setCount(), 1);
  assert.equal(JSON.parse(freshStorage.raw()).currentSeason.seasonId, 'season-fresh-first-1');
  assert.equal(firstFreshTab.season.snapshot().status, 'active');
  assert.equal(secondFreshTab.season.snapshot().status, 'active');

  const completed = rawStore([
    rawResult(1, 7, 0), rawResult(2, 0, 7), rawResult(3, 3, 3),
  ], 'completed-before-reset');
  const newStorage = makeStorage(completed);
  const newLocks = makeLockManager({ autoGrant: false });
  const firstNewTab = loadSeason({
    storage: newStorage, locks: newLocks, uuidPrefix: 'new-first',
  });
  const secondNewTab = loadSeason({
    storage: newStorage, locks: newLocks, uuidPrefix: 'new-second',
  });
  const firstNew = firstNewTab.season.startNewSeason();
  const secondNew = secondNewTab.season.startNewSeason();
  await Promise.resolve();
  await newLocks.grantAll();
  assert.equal((await firstNew).status, 'saved');
  assert.equal((await secondNew).status, 'ready');
  assert.equal(newStorage.setCount(), 1);
  assert.equal(JSON.parse(newStorage.raw()).currentSeason.seasonId, 'season-new-first-1');
  assert.equal(firstNewTab.season.snapshot().status, 'active');
  assert.equal(secondNewTab.season.snapshot().status, 'active');
});

test('identical settlement is idempotent while contradictory game reuse and unsafe bounds are rejected', async () => {
  const storage = makeStorage(rawStore());
  const tab = loadSeason({ storage });
  const binding = tab.season.bindNextGame('stable-game');
  assert.equal((await tab.season.settleGame(binding, { playerScore: 10, opponentScore: 3 })).status, 'saved');
  const writes = storage.setCount();
  assert.equal((await tab.season.settleGame(binding, { playerScore: 10, opponentScore: 3 })).status, 'ready');
  assert.equal(storage.setCount(), writes, 'identical replay must not rewrite');
  assert.equal((await tab.season.settleGame(binding, { playerScore: 11, opponentScore: 3 })).status, 'conflict');
  assert.equal(storage.setCount(), writes);
  const next = tab.season.bindNextGame('bounded-game');
  assert.equal((await tab.season.settleGame(next, { playerScore: 1000, opponentScore: 0 })).status, 'invalid');
  assert.equal((await tab.season.settleGame({ ...plain(next), gameId: 'x'.repeat(129) }, {
    playerScore: 1, opponentScore: 0,
  })).status, 'invalid');
  assert.equal(storage.setCount(), writes);
});

test('cross-slot game IDs and stale season bindings conflict without changing durable bytes or rung truth', async () => {
  const storage = makeStorage(rawStore());
  const tab = loadSeason({ storage });
  const first = tab.season.bindNextGame('shared-game-id');
  assert.equal((await tab.season.settleGame(first, { playerScore: 7, opponentScore: 0 })).status, 'saved');
  const durableAfterFirst = storage.raw();
  const writesAfterFirst = storage.setCount();

  const duplicateId = tab.season.bindNextGame('shared-game-id');
  assert.equal(duplicateId.gameNumber, 2);
  assert.equal((await tab.season.settleGame(duplicateId, {
    playerScore: 10, opponentScore: 3,
  })).status, 'conflict');
  assert.equal(storage.raw(), durableAfterFirst);
  assert.equal(storage.setCount(), writesAfterFirst);
  assert.deepEqual(
    plain(tab.season.snapshot().schedule).map(rung => rung.status),
    ['win', 'next', 'open'],
  );

  const current = tab.season.bindNextGame('second-game-id');
  assert.equal((await tab.season.settleGame({ ...plain(current), seasonId: 'stale-season-id' }, {
    playerScore: 10, opponentScore: 3,
  })).status, 'conflict');
  assert.equal(storage.raw(), durableAfterFirst);
  assert.equal(storage.setCount(), writesAfterFirst);
  assert.equal(tab.season.snapshot().gameNumber, 2);
  assert.deepEqual(
    plain(tab.season.snapshot().schedule).map(rung => rung.status),
    ['win', 'next', 'open'],
  );
});

test('read failures stay unavailable and never attempt a write', async () => {
  const storage = makeStorage(null, { blockRead: true });
  const tab = loadSeason({ storage });
  assert.equal(tab.season.snapshot().status, 'unavailable');
  assert.equal(tab.season.snapshot().action, 'unavailable');
  assert.equal(tab.season.snapshot().canPlaySeason, false);
  assert.equal((await tab.season.startSeason()).status, 'unavailable');
  assert.equal(tab.season.pendingKind(), null);
  assert.equal(storage.raw(), null);
  assert.equal(storage.setCount(), 0);
});

test('pending results encountering malformed or future storage preserve both pending truth and exact bytes', async () => {
  const incompatibleCases = [
    {
      expectedStatus: 'corrupt',
      raw: '{\n  "schemaVersion": 1,\n  "currentSeason": { "broken": true }\n}\n',
    },
    {
      expectedStatus: 'future',
      raw: '{\n  "schemaVersion": 99,\n  "newer": { "preserve": true }\n}\n',
    },
  ];

  for (const scenario of incompatibleCases) {
    const storage = makeStorage(rawStore());
    const locks = makeLockManager({ autoGrant: false });
    const tab = loadSeason({ storage, locks });
    const binding = tab.season.bindNextGame(`pending-${scenario.expectedStatus}`);
    const settling = tab.season.settleGame(binding, { playerScore: 8, opponentScore: 7 });
    await Promise.resolve();
    assert.equal(locks.pendingCount(), 1);
    storage.setRaw(scenario.raw);
    await locks.grantAll();
    assert.equal((await settling).status, scenario.expectedStatus);
    assert.equal(storage.raw(), scenario.raw);
    assert.equal(storage.setCount(), 0);
    assert.equal(tab.season.pendingKind(), 'result');
    assert.equal(tab.season.snapshot().status, scenario.expectedStatus);
    assert.equal(tab.season.snapshot().saveState, 'pending');
    assert.equal(tab.season.snapshot().action, 'retry');
    assert.deepEqual(
      plain(tab.season.snapshot().schedule).map(rung => rung.status),
      ['pending', 'open', 'open'],
    );

    const retry = tab.season.retryPending();
    await Promise.resolve();
    await locks.grantAll();
    assert.equal((await retry).status, scenario.expectedStatus);
    assert.equal(storage.raw(), scenario.raw);
    assert.equal(storage.setCount(), 0);
    assert.equal(tab.season.pendingKind(), 'result');
  }
});

test('storage events refresh subscribers without writing or revealing raw data', async () => {
  const storage = makeStorage(rawStore());
  const tab = loadSeason({ storage });
  const seen = [];
  const unsubscribe = tab.season.subscribe(value => seen.push(plain(value)));
  storage.setRaw(rawStore([rawResult(1, 7, 7)]));
  tab.dispatchStorage();
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].record, { wins: 0, losses: 0, ties: 1 });
  assert.equal(seen[0].nextRivalId, 'nc-state');
  assert.ok(!JSON.stringify(seen[0]).includes('season-existing'));
  assert.equal(storage.setCount(), 0);
  unsubscribe();
  tab.dispatchStorage();
  assert.equal(seen.length, 1);
});

test('completed season remains authoritative until a locked new-season write succeeds', async () => {
  const completed = rawStore([
    rawResult(1, 7, 0), rawResult(2, 0, 7), rawResult(3, 3, 3),
  ]);
  const storage = makeStorage(completed, { blockWrite: true });
  const tab = loadSeason({ storage });
  assert.equal(tab.season.snapshot().status, 'complete');
  assert.equal((await tab.season.startNewSeason()).status, 'pending');
  assert.equal(tab.season.bindNextGame('no-game-before-save'), null);
  assert.equal(storage.raw(), completed);
  storage.setBlocked({ write: false });
  assert.equal((await tab.season.retryPending()).status, 'saved');
  assert.equal(tab.season.snapshot().status, 'active');
  assert.equal(tab.season.snapshot().gamesPlayed, 0);
});
