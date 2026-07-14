// Bounded, browser-local play history for Football Math.
// Plain global, loaded after learning.js and before football.js.

const FOOTBALL_STATS = (() => {
  const STORAGE_KEY = 'footballMathStats:v1';
  const SCHEMA_VERSION = 1;
  const MAX_RECENT_PLAYS = 200;
  const OUTCOMES = ['touchdown', 'firstDown', 'turnoverOnDowns', 'stop', 'gain', 'noGain'];
  const RESOLUTIONS = ['firstTryCorrect', 'retryCorrect', 'secondMiss'];
  let idSequence = 0;
  let storeCache;
  let storageWritable = true;

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function safeString(value, fallback = null) {
    return typeof value === 'string' && value.length ? value : fallback;
  }

  function safeInteger(value, fallback = 0) {
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
  }

  function safeNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function emptyCounts(keys) {
    return Object.fromEntries(keys.map(key => [key, 0]));
  }

  function emptyStore() {
    return {
      schemaVersion: SCHEMA_VERSION,
      aggregates: {
        completedPlays: 0,
        actualYards: 0,
        byPossession: { offense: 0, defense: 0 },
        byOutcome: emptyCounts(OUTCOMES),
        learning: {
          gradedPlays: 0,
          noStakesPlays: 0,
          firstTryCorrect: 0,
          retryCorrect: 0,
          secondMiss: 0,
        },
      },
      recentPlays: [],
      // Reserved for a later mastery model. Issue #8 does not infer mastery.
      mastery: {},
    };
  }

  function normalizeCounts(source, keys) {
    const input = isRecord(source) ? source : {};
    return Object.fromEntries(keys.map(key => [key, safeInteger(input[key])]));
  }

  function normalizeAggregates(source) {
    const input = isRecord(source) ? source : {};
    const possession = isRecord(input.byPossession) ? input.byPossession : {};
    const learning = isRecord(input.learning) ? input.learning : {};
    return {
      completedPlays: safeInteger(input.completedPlays),
      actualYards: Math.max(0, safeNumber(input.actualYards)),
      byPossession: {
        offense: safeInteger(possession.offense),
        defense: safeInteger(possession.defense),
      },
      byOutcome: normalizeCounts(input.byOutcome, OUTCOMES),
      learning: {
        gradedPlays: safeInteger(learning.gradedPlays),
        noStakesPlays: safeInteger(learning.noStakesPlays),
        firstTryCorrect: safeInteger(learning.firstTryCorrect),
        retryCorrect: safeInteger(learning.retryCorrect),
        secondMiss: safeInteger(learning.secondMiss),
      },
    };
  }

  function normalizeScore(value) {
    const score = isRecord(value) ? value : {};
    return {
      player: safeInteger(score.player),
      opponent: safeInteger(score.opponent),
    };
  }

  function normalizeContext(value) {
    const context = isRecord(value) ? value : {};
    return {
      quarter: Math.max(1, safeInteger(context.quarter, 1)),
      possession: context.possession === 'defense' ? 'defense' : 'offense',
      down: Math.max(1, safeInteger(context.down, 1)),
      yardsToGo: safeInteger(context.yardsToGo),
      yardLine: safeNumber(context.yardLine),
      firstDownLine: safeNumber(context.firstDownLine),
      direction: context.direction === -1 ? -1 : 1,
      score: normalizeScore(context.score),
      plays: safeInteger(context.plays),
      drivePlays: safeInteger(context.drivePlays),
    };
  }

  function normalizeCalls(value) {
    const calls = isRecord(value) ? value : {};
    return {
      offense: safeString(calls.offense),
      defense: safeString(calls.defense),
      opponent: safeString(calls.opponent),
      matchup: calls.matchup === 'matched' || calls.matchup === 'mismatch' ? calls.matchup : null,
    };
  }

  function normalizeQuestion(value) {
    const question = isRecord(value) ? value : {};
    return {
      id: safeString(question.id, 'unknown'),
      skill: safeString(question.skill, 'unknown'),
      purpose: safeString(question.purpose, 'unknown'),
      grading: question.grading === 'noStakes' ? 'noStakes' : 'gate',
      tier: safeString(question.tier, 'unknown'),
    };
  }

  function normalizeAttempt(value, fallbackNumber) {
    const attempt = isRecord(value) ? value : {};
    return {
      number: Math.max(1, safeInteger(attempt.number, fallbackNumber)),
      correct: Boolean(attempt.correct),
      elapsedMs: Math.max(0, Math.round(safeNumber(attempt.elapsedMs))),
      support: safeString(attempt.support, 'none'),
    };
  }

  function normalizeRow(value) {
    if (!isRecord(value)) return null;
    const attempts = Array.isArray(value.attempts)
      ? value.attempts.slice(0, 2).map((attempt, index) => normalizeAttempt(attempt, index + 1))
      : [];
    const outcome = OUTCOMES.includes(value.outcome) ? value.outcome : 'noGain';
    const resolution = RESOLUTIONS.includes(value.resolution) ? value.resolution : 'secondMiss';
    return {
      id: safeString(value.id, makeId('play')),
      gameId: safeString(value.gameId, 'unknown-game'),
      sequence: Math.max(1, safeInteger(value.sequence, 1)),
      completedAt: safeString(value.completedAt, new Date().toISOString()),
      preSnap: normalizeContext(value.preSnap),
      calls: normalizeCalls(value.calls),
      offeredYards: Math.max(0, safeNumber(value.offeredYards)),
      question: normalizeQuestion(value.question),
      attempts,
      resolution,
      actualYards: Math.max(0, safeNumber(value.actualYards)),
      outcome,
      postPlay: normalizeContext(value.postPlay),
    };
  }

  function normalizeStore(value) {
    const recent = Array.isArray(value.recentPlays)
      ? value.recentPlays.map(normalizeRow).filter(Boolean).slice(-MAX_RECENT_PLAYS)
      : [];
    return {
      schemaVersion: SCHEMA_VERSION,
      aggregates: normalizeAggregates(value.aggregates),
      recentPlays: recent,
      mastery: isRecord(value.mastery) ? JSON.parse(JSON.stringify(value.mastery)) : {},
    };
  }

  function loadStore() {
    if (storeCache) return storeCache;
    let raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      // Reading may fail in private/locked-down contexts. Avoid a blind overwrite.
      storageWritable = false;
      storeCache = emptyStore();
      return storeCache;
    }
    if (!raw) {
      storeCache = emptyStore();
      return storeCache;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      // Corrupt JSON at our known key is recoverable. Keep storage writable so
      // the next completed play can replace it with a valid v1 payload.
      storeCache = emptyStore();
      return storeCache;
    }
    if (isRecord(parsed) && Number.isFinite(parsed.schemaVersion) && parsed.schemaVersion > SCHEMA_VERSION) {
      // Never replace a store written by code with a schema this build does not know.
      storageWritable = false;
      storeCache = emptyStore();
      return storeCache;
    }
    storeCache = isRecord(parsed) && parsed.schemaVersion === SCHEMA_VERSION
      ? normalizeStore(parsed)
      : emptyStore();
    return storeCache;
  }

  function saveStore(store) {
    if (!storageWritable) return false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch (error) {
      storageWritable = false;
      return false;
    }
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

  function monotonicNow() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  function createSession() {
    return {
      gameId: makeId('game'),
      startedAt: new Date().toISOString(),
      nextSequence: 1,
      completedPlays: [],
    };
  }

  function beginPlay(session, details) {
    const startedAtMs = monotonicNow();
    return {
      id: makeId('play'),
      gameId: session.gameId,
      sequence: session.nextSequence++,
      preSnap: details.preSnap,
      calls: details.calls,
      offeredYards: details.offeredYards,
      question: details.question,
      attempts: [],
      resolution: null,
      startedAtMs,
      attemptStartedAtMs: startedAtMs,
      finalized: false,
    };
  }

  function recordAttempt(pending, details) {
    if (!pending || pending.finalized || pending.attempts.length >= 2) return false;
    const now = monotonicNow();
    pending.attempts.push({
      number: details.number,
      correct: details.correct,
      elapsedMs: Math.max(0, now - pending.attemptStartedAtMs),
      support: details.support,
    });
    pending.attemptStartedAtMs = now;
    return true;
  }

  function recordResolution(pending, resolution) {
    if (!pending || pending.finalized || !RESOLUTIONS.includes(resolution)) return false;
    pending.resolution = resolution;
    return true;
  }

  function updateAggregates(aggregates, row) {
    aggregates.completedPlays++;
    aggregates.actualYards += row.actualYards;
    aggregates.byPossession[row.preSnap.possession]++;
    aggregates.byOutcome[row.outcome]++;
    if (row.question.grading === 'noStakes') {
      aggregates.learning.noStakesPlays++;
      return;
    }
    aggregates.learning.gradedPlays++;
    aggregates.learning[row.resolution]++;
  }

  function appendRow(value) {
    const row = normalizeRow(value);
    if (!row) return false;
    const store = loadStore();
    if (!storageWritable || store.recentPlays.some(existing => existing.id === row.id)) return false;
    updateAggregates(store.aggregates, row);
    store.recentPlays.push(row);
    store.recentPlays = store.recentPlays.slice(-MAX_RECENT_PLAYS);
    return saveStore(store);
  }

  function completePlay(session, pending, details) {
    if (!pending || pending.finalized || !pending.resolution) return false;
    pending.finalized = true;
    const row = normalizeRow({
      ...pending,
      completedAt: new Date().toISOString(),
      actualYards: details.actualYards,
      outcome: details.outcome,
      postPlay: details.postPlay,
    });
    session.completedPlays.push(row);
    appendRow(row);
    return row;
  }

  function snapshot(value) {
    return JSON.parse(JSON.stringify(value));
  }

  return Object.freeze({
    STORAGE_KEY,
    SCHEMA_VERSION,
    MAX_RECENT_PLAYS,
    createSession,
    beginPlay,
    recordAttempt,
    recordResolution,
    completePlay,
    history: () => snapshot(loadStore()),
    sessionSnapshot: session => snapshot(session),
  });
})();
