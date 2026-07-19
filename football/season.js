// Browser-local three-game season progression for Football Math.
// Plain global, loaded after opponent.js and before football-domain.js.

const FOOTBALL_SEASON = (() => {
  'use strict';

  const STORAGE_KEY = 'footballMathSeason:v1';
  const STORAGE_LOCK_NAME = `${STORAGE_KEY}:central-write`;
  const SCHEMA_VERSION = 1;
  const FORMAT_ID = 'three-rival-schedule-v1';
  const PLAYER_ID = 'duke';
  const MAX_ID_LENGTH = 128;
  const MAX_TIMESTAMP_LENGTH = 64;
  const MAX_SCORE = 999;
  const SCHEDULE = Object.freeze([...FOOTBALL_OPPONENT.RIVAL_ORDER]);
  const listeners = new Set();
  let idSequence = 0;
  let pendingMutation = null;
  let notice = null;
  let operationTail = Promise.resolve();

  if (SCHEDULE.length !== 3 || new Set(SCHEDULE).size !== 3) {
    throw new TypeError('Season v1 requires exactly three unique rivals');
  }
  for (const rivalId of SCHEDULE) FOOTBALL_OPPONENT.resolveRival(rivalId);

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function exactKeys(value, expected) {
    if (!isRecord(value)) return false;
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
  }

  function boundedString(value, max = MAX_ID_LENGTH) {
    return typeof value === 'string' && value.length > 0 && value.length <= max;
  }

  function validTimestamp(value) {
    if (!boundedString(value, MAX_TIMESTAMP_LENGTH)) return false;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
  }

  function validScore(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= MAX_SCORE;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const item of Object.values(value)) deepFreeze(item);
    return Object.freeze(value);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeId(prefix) {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
      }
      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const values = new Uint32Array(4);
        crypto.getRandomValues(values);
        return `${prefix}-${Array.from(values, value => value.toString(16).padStart(8, '0')).join('')}`;
      }
    } catch (error) {}
    idSequence++;
    return `${prefix}-${Date.now().toString(36)}-${idSequence.toString(36)}`;
  }

  function makeSeason() {
    return deepFreeze({
      seasonId: makeId('season'),
      formatId: FORMAT_ID,
      playerId: PLAYER_ID,
      createdAt: new Date().toISOString(),
      schedule: [...SCHEDULE],
      results: [],
    });
  }

  function normalizeResult(value, expectedGameNumber, expectedRivalId, gameIds) {
    if (!exactKeys(value, [
      'gameNumber', 'gameId', 'rivalId', 'playerScore', 'opponentScore', 'completedAt',
    ])) return null;
    if (value.gameNumber !== expectedGameNumber
      || value.rivalId !== expectedRivalId
      || !boundedString(value.gameId)
      || gameIds.has(value.gameId)
      || !validScore(value.playerScore)
      || !validScore(value.opponentScore)
      || !validTimestamp(value.completedAt)) return null;
    gameIds.add(value.gameId);
    return {
      gameNumber: value.gameNumber,
      gameId: value.gameId,
      rivalId: value.rivalId,
      playerScore: value.playerScore,
      opponentScore: value.opponentScore,
      completedAt: value.completedAt,
    };
  }

  function normalizeStore(value) {
    if (!exactKeys(value, ['schemaVersion', 'currentSeason']) || value.schemaVersion !== SCHEMA_VERSION) {
      return null;
    }
    const season = value.currentSeason;
    if (!exactKeys(season, [
      'seasonId', 'formatId', 'playerId', 'createdAt', 'schedule', 'results',
    ])
      || !boundedString(season.seasonId)
      || season.formatId !== FORMAT_ID
      || season.playerId !== PLAYER_ID
      || !validTimestamp(season.createdAt)
      || !Array.isArray(season.schedule)
      || season.schedule.length !== SCHEDULE.length
      || season.schedule.some((rivalId, index) => rivalId !== SCHEDULE[index])
      || !Array.isArray(season.results)
      || season.results.length > SCHEDULE.length) return null;

    const gameIds = new Set();
    const results = [];
    for (let index = 0; index < season.results.length; index++) {
      const result = normalizeResult(season.results[index], index + 1, SCHEDULE[index], gameIds);
      if (!result) return null;
      results.push(result);
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      currentSeason: {
        seasonId: season.seasonId,
        formatId: FORMAT_ID,
        playerId: PLAYER_ID,
        createdAt: season.createdAt,
        schedule: [...SCHEDULE],
        results,
      },
    };
  }

  function readStore() {
    let raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return { kind: 'unavailable', store: null };
    }
    if (raw == null) return { kind: 'missing', store: null };
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { kind: 'malformed', store: null, raw };
    }
    if (isRecord(parsed) && Number.isFinite(parsed.schemaVersion) && parsed.schemaVersion > SCHEMA_VERSION) {
      return { kind: 'future', store: null, raw };
    }
    const store = normalizeStore(parsed);
    return store ? { kind: 'supported', store, raw } : { kind: 'malformed', store: null, raw };
  }

  function outcomeFor(result) {
    if (result.playerScore > result.opponentScore) return 'win';
    if (result.playerScore < result.opponentScore) return 'loss';
    return 'tie';
  }

  function publicSeasonView(season) {
    const results = season.results;
    const record = { wins: 0, losses: 0, ties: 0 };
    const schedule = season.schedule.map((rivalId, index) => {
      const result = results[index] || null;
      const outcome = result ? outcomeFor(result) : null;
      if (outcome === 'win') record.wins++;
      else if (outcome === 'loss') record.losses++;
      else if (outcome === 'tie') record.ties++;
      return {
        gameNumber: index + 1,
        rivalId,
        status: outcome || (index === results.length ? 'next' : 'open'),
      };
    });
    const complete = results.length === season.schedule.length;
    return {
      gamesPlayed: results.length,
      gameNumber: complete ? null : results.length + 1,
      schedule,
      record,
      nextRivalId: complete ? null : season.schedule[results.length],
      complete,
    };
  }

  function snapshot() {
    const read = readStore();
    let base;
    if (read.kind === 'supported') {
      const season = publicSeasonView(read.store.currentSeason);
      base = {
        status: season.complete ? 'complete' : 'active',
        saveState: 'saved',
        ...season,
      };
    } else {
      base = {
        status: read.kind === 'malformed' ? 'corrupt' : read.kind,
        saveState: read.kind === 'missing' ? 'saved' : read.kind === 'malformed' ? 'corrupt' : read.kind,
        gamesPlayed: 0,
        gameNumber: read.kind === 'missing' ? 1 : null,
        schedule: SCHEDULE.map((rivalId, index) => ({
          gameNumber: index + 1,
          rivalId,
          status: read.kind === 'missing' && index === 0 ? 'next' : 'open',
        })),
        record: { wins: 0, losses: 0, ties: 0 },
        nextRivalId: read.kind === 'missing' ? SCHEDULE[0] : null,
        complete: false,
      };
    }

    if (pendingMutation) {
      base.saveState = 'pending';
      base.canPlaySeason = false;
      base.action = 'retry';
      if (pendingMutation.kind === 'result') {
        base.schedule = base.schedule.map(rung => (
          rung.gameNumber === pendingMutation.result.gameNumber
            ? { ...rung, status: 'pending' }
            : rung
        ));
      }
    } else {
      base.canPlaySeason = base.status === 'active';
      base.action = base.status === 'missing' ? 'start'
        : base.status === 'active' ? 'play'
        : base.status === 'complete' ? 'new'
        : base.status === 'corrupt' ? 'fresh'
        : 'unavailable';
      if (notice === 'conflict') base.saveState = 'conflict';
    }
    base.messageCode = notice;
    return deepFreeze(base);
  }

  function emitChange() {
    const value = snapshot();
    for (const listener of listeners) {
      try { listener(value); } catch (error) {}
    }
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Season subscriber must be a function');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function lockManager() {
    try {
      return typeof navigator !== 'undefined'
        && navigator.locks
        && typeof navigator.locks.request === 'function'
        ? navigator.locks
        : null;
    } catch (error) {
      return null;
    }
  }

  function writeStore(store) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch (error) {
      return false;
    }
  }

  function sameResult(left, right) {
    return left.gameNumber === right.gameNumber
      && left.gameId === right.gameId
      && left.rivalId === right.rivalId
      && left.playerScore === right.playerScore
      && left.opponentScore === right.opponentScore;
  }

  function storeForSeason(season) {
    return { schemaVersion: SCHEMA_VERSION, currentSeason: clone(season) };
  }

  function applyPendingUnderLock(token) {
    const read = readStore();
    if (read.kind === 'unavailable') return { status: 'pending' };
    if (read.kind === 'future') return { status: 'future' };

    if (token.kind === 'create') {
      if (read.kind === 'supported' && !publicSeasonView(read.store.currentSeason).complete) {
        return { status: 'ready' };
      }
      if (read.kind !== 'missing') return { status: read.kind === 'malformed' ? 'corrupt' : 'conflict' };
      return writeStore(storeForSeason(token.season)) ? { status: 'saved' } : { status: 'pending' };
    }

    if (token.kind === 'fresh') {
      if (read.kind === 'supported' && !publicSeasonView(read.store.currentSeason).complete) {
        return { status: 'ready' };
      }
      if (!['missing', 'malformed'].includes(read.kind)) return { status: 'conflict' };
      return writeStore(storeForSeason(token.season)) ? { status: 'saved' } : { status: 'pending' };
    }

    if (token.kind === 'new') {
      if (read.kind === 'supported') {
        const current = read.store.currentSeason;
        if (!publicSeasonView(current).complete) return { status: 'ready' };
        if (current.seasonId !== token.expectedSeasonId) return { status: 'conflict' };
      } else if (read.kind !== 'missing') {
        return { status: read.kind === 'malformed' ? 'corrupt' : 'conflict' };
      }
      return writeStore(storeForSeason(token.season)) ? { status: 'saved' } : { status: 'pending' };
    }

    if (read.kind !== 'supported') {
      return { status: read.kind === 'malformed' ? 'corrupt' : 'conflict' };
    }
    const season = read.store.currentSeason;
    const result = token.result;
    if (season.seasonId !== token.binding.seasonId
      || season.schedule[result.gameNumber - 1] !== result.rivalId) return { status: 'conflict' };
    const existing = season.results[result.gameNumber - 1];
    if (existing) return { status: sameResult(existing, result) ? 'ready' : 'conflict' };
    if (season.results.length !== result.gameNumber - 1) return { status: 'conflict' };
    if (season.results.some(row => row.gameId === result.gameId)) return { status: 'conflict' };
    season.results.push(clone(result));
    return writeStore(read.store) ? { status: 'saved' } : { status: 'pending' };
  }

  async function attemptPending() {
    const token = pendingMutation;
    if (!token) return { status: 'none', snapshot: snapshot() };
    const locks = lockManager();
    if (!locks) {
      notice = 'save-unavailable';
      emitChange();
      return { status: 'pending', snapshot: snapshot() };
    }
    let result;
    try {
      result = await locks.request(STORAGE_LOCK_NAME, { mode: 'exclusive' }, () => applyPendingUnderLock(token));
    } catch (error) {
      result = { status: 'pending' };
    }
    if (pendingMutation !== token) return { status: 'superseded', snapshot: snapshot() };

    if (['saved', 'ready'].includes(result?.status)) {
      pendingMutation = null;
      notice = null;
    } else if (result?.status === 'conflict') {
      pendingMutation = null;
      notice = 'conflict';
    } else if (result?.status === 'future') {
      if (token.kind !== 'result') pendingMutation = null;
      notice = 'future';
    } else if (result?.status === 'corrupt') {
      if (token.kind !== 'result') pendingMutation = null;
      notice = 'corrupt';
    } else {
      notice = 'save-unavailable';
    }
    emitChange();
    return { status: result?.status || 'pending', snapshot: snapshot() };
  }

  function enqueue(operation) {
    const run = operationTail.then(operation, operation);
    operationTail = run.catch(() => {});
    return run;
  }

  function stageSeasonMutation(kind, expectedSeasonId = null) {
    if (pendingMutation) return Promise.resolve({ status: 'pending', snapshot: snapshot() });
    notice = null;
    pendingMutation = deepFreeze({ kind, expectedSeasonId, season: makeSeason() });
    emitChange();
    return enqueue(attemptPending);
  }

  function startSeason() {
    const read = readStore();
    if (read.kind === 'supported' && !publicSeasonView(read.store.currentSeason).complete) {
      notice = null;
      emitChange();
      return Promise.resolve({ status: 'ready', snapshot: snapshot() });
    }
    if (read.kind !== 'missing') return Promise.resolve({ status: read.kind, snapshot: snapshot() });
    return stageSeasonMutation('create');
  }

  function startFreshSeason() {
    const read = readStore();
    if (read.kind !== 'malformed' && read.kind !== 'missing') {
      return Promise.resolve({ status: read.kind, snapshot: snapshot() });
    }
    return stageSeasonMutation('fresh');
  }

  function startNewSeason() {
    const read = readStore();
    if (read.kind !== 'supported') return Promise.resolve({ status: read.kind, snapshot: snapshot() });
    if (!publicSeasonView(read.store.currentSeason).complete) {
      return Promise.resolve({ status: 'ready', snapshot: snapshot() });
    }
    return stageSeasonMutation('new', read.store.currentSeason.seasonId);
  }

  function retryPending() {
    if (!pendingMutation) return Promise.resolve({ status: 'none', snapshot: snapshot() });
    notice = null;
    emitChange();
    return enqueue(attemptPending);
  }

  function bindNextGame(gameId) {
    if (pendingMutation || !boundedString(gameId)) return null;
    const read = readStore();
    if (read.kind !== 'supported') return null;
    const season = read.store.currentSeason;
    const view = publicSeasonView(season);
    if (view.complete) return null;
    return deepFreeze({
      seasonId: season.seasonId,
      gameNumber: view.gameNumber,
      rivalId: view.nextRivalId,
      gameId,
    });
  }

  function validResultFacts(binding, scores) {
    if (!isRecord(binding) || !isRecord(scores) || !boundedString(binding.seasonId)) return false;
    return Number.isInteger(binding.gameNumber)
      && binding.gameNumber >= 1
      && binding.gameNumber <= SCHEDULE.length
      && binding.rivalId === SCHEDULE[binding.gameNumber - 1]
      && boundedString(binding.gameId)
      && validScore(scores.playerScore)
      && validScore(scores.opponentScore);
  }

  function hasExactSavedResult(binding, scores) {
    if (!validResultFacts(binding, scores)) return false;
    const read = readStore();
    if (read.kind !== 'supported') return false;
    const season = read.store.currentSeason;
    if (season.seasonId !== binding.seasonId) return false;
    const saved = season.results[binding.gameNumber - 1];
    return Boolean(saved) && sameResult(saved, {
      gameNumber: binding.gameNumber,
      gameId: binding.gameId,
      rivalId: binding.rivalId,
      playerScore: scores.playerScore,
      opponentScore: scores.opponentScore,
    });
  }

  function settleGame(binding, scores) {
    if (!validResultFacts(binding, scores)) {
      return Promise.resolve({ status: 'invalid', snapshot: snapshot() });
    }
    const result = deepFreeze({
      gameNumber: binding.gameNumber,
      gameId: binding.gameId,
      rivalId: binding.rivalId,
      playerScore: scores.playerScore,
      opponentScore: scores.opponentScore,
      completedAt: new Date().toISOString(),
    });
    if (pendingMutation) {
      const identicalPending = pendingMutation.kind === 'result'
        && sameResult(pendingMutation.result, result);
      return Promise.resolve({ status: identicalPending ? 'pending' : 'blocked', snapshot: snapshot() });
    }
    notice = null;
    pendingMutation = deepFreeze({ kind: 'result', binding: clone(binding), result });
    emitChange();
    return enqueue(attemptPending);
  }

  function pendingKind() {
    return pendingMutation?.kind || null;
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', event => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      notice = null;
      // A cross-tab write can resolve or conflict with the one in-memory
      // mutation. Re-enter the same locked, callback-time fresh-read path so
      // durable first-writer truth is reflected immediately in this tab.
      if (pendingMutation) enqueue(attemptPending);
      else emitChange();
    });
  }

  return Object.freeze({
    STORAGE_KEY,
    STORAGE_LOCK_NAME,
    SCHEMA_VERSION,
    FORMAT_ID,
    PLAYER_ID,
    SCHEDULE,
    snapshot,
    subscribe,
    startSeason,
    startFreshSeason,
    startNewSeason,
    retryPending,
    bindNextGame,
    hasExactSavedResult,
    settleGame,
    pendingKind,
  });
})();
