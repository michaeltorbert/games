// Bounded, browser-local play history for Football Math.
// Plain global, loaded after learning.js and before football.js.

const FOOTBALL_STATS = (() => {
  const STORAGE_KEY = 'footballMathStats:v1';
  const STORAGE_LOCK_NAME = `${STORAGE_KEY}:central-write`;
  const SCHEMA_VERSION = 3;
  const LEGACY_SCHEMA_VERSIONS = Object.freeze([1, 2]);
  const MAX_RECENT_PLAYS = 200;
  const PLAY_TYPES = Object.freeze(['scrimmage', 'conversion', 'fieldGoal', 'punt']);
  const SCRIMMAGE_OUTCOMES = Object.freeze([
    'touchdown', 'firstDown', 'turnoverOnDowns', 'turnover', 'stop', 'gain', 'loss', 'noGain',
  ]);
  const OUTCOMES_BY_PLAY_TYPE = Object.freeze({
    scrimmage: SCRIMMAGE_OUTCOMES,
    conversion: Object.freeze(['conversionMade', 'conversionMissed', 'conversionDenied']),
    fieldGoal: Object.freeze(['fieldGoalMade', 'fieldGoalMissed', 'fieldGoalBlocked']),
    punt: Object.freeze(['puntLanded', 'puntTouchback']),
  });
  const OUTCOMES = Object.freeze(PLAY_TYPES.flatMap(playType => OUTCOMES_BY_PLAY_TYPE[playType]));
  const RESOLUTIONS = ['firstTryCorrect', 'retryCorrect', 'secondMiss'];
  const INSTRUCTIONAL_STATUSES = Object.freeze(['presented', 'bypassed']);
  let idSequence = 0;
  let storeCache;
  const stagedRows = new Map();
  let stagedRevision = 0;
  let persistenceRequestPending = false;
  let retryPersistenceAfterPending = false;

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

  function safeSignedInteger(value, fallback = 0) {
    return Number.isSafeInteger(value) ? value : fallback;
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
        byPlayType: emptyCounts(PLAY_TYPES),
        specialTeams: {
          conversions: { attempts: 0, made: 0, missed: 0, denied: 0, points: 0 },
          fieldGoals: { attempts: 0, made: 0, missed: 0, blocked: 0, points: 0 },
          punts: { attempts: 0, touchbacks: 0, totalTravelDistance: 0 },
        },
        learning: {
          gradedPlays: 0,
          noStakesPlays: 0,
          firstTryCorrect: 0,
          retryCorrect: 0,
          secondMiss: 0,
        },
      },
      recentPlays: [],
      // Compact exact replay protection for rows that have aged out of
      // recentPlays. Production IDs use one monotonic watermark per game;
      // non-production IDs retain an exact per-game fallback list.
      archivedPlayIndex: Object.create(null),
      // Bounded by the curriculum's concept registry. Keeping the latest valid
      // evidence here prevents journal capping or delayed writes from making
      // adaptive scheduling use an older resolution.
      lastResolvedByConcept: Object.create(null),
      // Per-concept graded resolutions; no-stakes previews never enter mastery.
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
    const byPlayType = isRecord(input.byPlayType)
      ? normalizeCounts(input.byPlayType, PLAY_TYPES)
      : { ...emptyCounts(PLAY_TYPES), scrimmage: safeInteger(input.completedPlays) };
    const special = isRecord(input.specialTeams) ? input.specialTeams : {};
    const conversions = isRecord(special.conversions) ? special.conversions : {};
    const fieldGoals = isRecord(special.fieldGoals) ? special.fieldGoals : {};
    const punts = isRecord(special.punts) ? special.punts : {};
    return {
      completedPlays: safeInteger(input.completedPlays),
      // Net outcome yards are signed even though today's live play domain only
      // proposes non-negative gains. Preserve future sacks/losses faithfully.
      actualYards: safeNumber(input.actualYards),
      byPossession: {
        offense: safeInteger(possession.offense),
        defense: safeInteger(possession.defense),
      },
      byOutcome: normalizeCounts(input.byOutcome, OUTCOMES),
      byPlayType,
      specialTeams: {
        conversions: {
          attempts: safeInteger(conversions.attempts),
          made: safeInteger(conversions.made),
          missed: safeInteger(conversions.missed),
          denied: safeInteger(conversions.denied),
          points: safeInteger(conversions.points),
        },
        fieldGoals: {
          attempts: safeInteger(fieldGoals.attempts),
          made: safeInteger(fieldGoals.made),
          missed: safeInteger(fieldGoals.missed),
          blocked: safeInteger(fieldGoals.blocked),
          points: safeInteger(fieldGoals.points),
        },
        punts: {
          attempts: safeInteger(punts.attempts),
          touchbacks: safeInteger(punts.touchbacks),
          totalTravelDistance: safeInteger(punts.totalTravelDistance),
        },
      },
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

  function normalizeTotalYards(value) {
    const totals = isRecord(value) ? value : {};
    return {
      player: safeSignedInteger(totals.player),
      opponent: safeSignedInteger(totals.opponent),
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
      totalYards: normalizeTotalYards(context.totalYards),
      plays: safeInteger(context.plays),
      drivePlays: safeInteger(context.drivePlays),
    };
  }

  function normalizeCalls(value) {
    const calls = isRecord(value) ? value : {};
    return {
      // `offense` is the call made by the team with possession. On player-
      // defense rows it intentionally equals `opponent`, the compatibility
      // alias retained for player-perspective history consumers.
      offense: safeString(calls.offense),
      defense: safeString(calls.defense),
      opponent: safeString(calls.opponent),
      matchup: calls.matchup === 'matched' || calls.matchup === 'mismatch' ? calls.matchup : null,
    };
  }

  function normalizeQuestion(value) {
    if (!isRecord(value)) return null;
    const question = value;
    return {
      id: safeString(question.id, 'unknown'),
      skill: safeString(question.skill, 'unknown'),
      concept: safeString(question.concept, 'unknown'),
      purpose: safeString(question.purpose, 'unknown'),
      grading: question.grading === 'noStakes' ? 'noStakes' : 'gate',
      tier: safeString(question.tier, 'unknown'),
    };
  }

  function normalizeLinks(value, question = null) {
    const source = isRecord(value) ? value : {};
    const links = isRecord(source.links) ? source.links : {};
    const sourceQuestion = isRecord(question) ? question : {};
    return {
      familyId: safeString(links.familyId ?? source.familyId ?? sourceQuestion.familyId ?? sourceQuestion.id),
      contextId: safeString(links.contextId ?? source.contextId ?? sourceQuestion.contextId),
      questionInstanceId: safeString(
        links.questionInstanceId ?? source.questionInstanceId ?? sourceQuestion.questionInstanceId,
      ),
    };
  }

  function normalizeMastery(value) {
    const input = isRecord(value) ? value : {};
    return Object.fromEntries(Object.entries(input).map(([concept, raw]) => {
      const mastery = isRecord(raw) ? raw : {};
      const firstTryCorrect = safeInteger(mastery.firstTryCorrect);
      const retryCorrect = safeInteger(mastery.retryCorrect);
      const secondMiss = safeInteger(mastery.secondMiss);
      return [concept, {
        resolved: firstTryCorrect + retryCorrect + secondMiss,
        firstTryCorrect,
        retryCorrect,
        secondMiss,
      }];
    }));
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

  function normalizeOutcome(playType, value, sourceSchema = SCHEMA_VERSION) {
    const outcomes = OUTCOMES_BY_PLAY_TYPE[playType];
    if (outcomes.includes(value)) return value;
    // Legacy rows had only scrimmage semantics and were intentionally lenient.
    // A malformed current-schema outcome must be dropped, not rewritten into
    // a plausible football result that never happened.
    if (sourceSchema >= SCHEMA_VERSION) return null;
    if (playType === 'scrimmage') return 'noGain';
    if (playType === 'conversion') return 'conversionMissed';
    if (playType === 'fieldGoal') return 'fieldGoalMissed';
    return 'puntLanded';
  }

  function normalizeMetrics(playType, value, outcome) {
    const source = isRecord(value) ? value : {};
    if (playType === 'scrimmage') {
      return {
        offeredYards: Math.max(0, safeNumber(source.offeredYards)),
        actualYards: safeNumber(source.actualYards),
      };
    }
    if (playType === 'conversion') {
      const attemptValue = source.attemptType === 'twoPoint' || source.attemptValue === 2 ? 2 : 1;
      return {
        attemptType: attemptValue === 2 ? 'twoPoint' : 'pat',
        attemptValue,
        tryYardLine: safeInteger(source.tryYardLine),
        pointsAwarded: outcome === 'conversionMade' ? attemptValue : 0,
      };
    }
    if (playType === 'fieldGoal') {
      return {
        attemptDistance: safeInteger(source.attemptDistance),
        pointsAwarded: outcome === 'fieldGoalMade' ? 3 : 0,
      };
    }
    return {
      travelDistance: safeInteger(source.travelDistance),
      landingYardLine: safeInteger(source.landingYardLine),
      touchback: outcome === 'puntTouchback',
      travelClass: source.travelClass === 'receiverFavorable' ? 'receiverFavorable' : 'normal',
    };
  }

  function normalizeRow(value, sourceSchema = SCHEMA_VERSION) {
    if (!isRecord(value)) return null;
    const playType = sourceSchema < SCHEMA_VERSION
      ? 'scrimmage'
      : PLAY_TYPES.includes(value.playType) ? value.playType : null;
    // Only legacy schemas lack a type and are intentionally interpreted as
    // scrimmage. A malformed schema-3 row must not be silently reclassified
    // into scrimmage yards or outcomes.
    if (!playType) return null;
    const instructionalStatus = value.instructionalStatus === 'bypassed' ? 'bypassed' : 'presented';
    const question = instructionalStatus === 'presented' ? normalizeQuestion(value.question) : null;
    const resolution = instructionalStatus === 'presented' && RESOLUTIONS.includes(value.resolution)
      ? value.resolution
      : null;
    if (instructionalStatus === 'presented' && (!question || !resolution)) return null;
    const attempts = instructionalStatus === 'presented' && Array.isArray(value.attempts)
      ? value.attempts.slice(0, 2).map((attempt, index) => normalizeAttempt(attempt, index + 1))
      : [];
    const outcome = normalizeOutcome(playType, value.outcome, sourceSchema);
    if (!outcome) return null;
    const sequence = Math.max(1, safeInteger(value.sequence, 1));
    const isCurrentSchema = sourceSchema >= SCHEMA_VERSION;
    const gameId = safeString(value.gameId, isCurrentSchema ? null : 'unknown-game');
    if (!gameId) return null;
    const rowId = safeString(value.id, isCurrentSchema ? null : `${gameId}-legacy-${sequence}`);
    if (!rowId) return null;
    const playId = safeString(value.playId, isCurrentSchema ? null : rowId);
    if (!playId) return null;
    const metricsSource = sourceSchema >= SCHEMA_VERSION && isRecord(value.metrics)
      ? value.metrics
      : { offeredYards: value.offeredYards, actualYards: value.actualYards };
    const metrics = normalizeMetrics(playType, metricsSource, outcome);
    return {
      id: rowId,
      gameId,
      possessionId: safeString(value.possessionId),
      playId,
      playType,
      sequence,
      // Preserve historical uncertainty. A missing or malformed timestamp must
      // never be made to look freshly practiced merely because it was read.
      completedAt: safeString(value.completedAt),
      instructionalStatus,
      links: normalizeLinks(value, value.question),
      preSnap: normalizeContext(value.preSnap),
      calls: playType === 'scrimmage' ? normalizeCalls(value.calls) : null,
      offeredYards: playType === 'scrimmage' ? metrics.offeredYards : null,
      question,
      attempts,
      resolution,
      // Offered yards stay nonnegative; actual outcome yards are signed.
      actualYards: playType === 'scrimmage' ? metrics.actualYards : null,
      outcome,
      metrics,
      postPlay: normalizeContext(value.postPlay),
    };
  }

  function normalizeStore(value) {
    const sourceSchema = safeInteger(value.schemaVersion, SCHEMA_VERSION);
    const normalizedRows = Array.isArray(value.recentPlays)
      ? value.recentPlays.map(row => normalizeRow(row, sourceSchema)).filter(Boolean)
      : [];
    const recent = normalizedRows.slice(-MAX_RECENT_PLAYS);
    const archivedPlayIndex = normalizeArchivedPlayIndex(value.archivedPlayIndex);
    migrateArchivedPlayKeys(archivedPlayIndex, value.archivedPlayKeys);
    for (const row of normalizedRows.slice(0, -MAX_RECENT_PLAYS)) {
      archivePlayIdentity(archivedPlayIndex, row);
    }
    const lastResolvedByConcept = normalizeLastResolved(value.lastResolvedByConcept);
    for (const row of normalizedRows) updateLastResolved(lastResolvedByConcept, row);
    return {
      schemaVersion: SCHEMA_VERSION,
      aggregates: normalizeAggregates(value.aggregates),
      recentPlays: recent,
      archivedPlayIndex,
      lastResolvedByConcept,
      mastery: normalizeMastery(value.mastery),
    };
  }

  function loadStore() {
    if (storeCache) return storeCache;
    let raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      // Reading may fail in private/locked-down contexts. Local staged rows
      // remain available to this session, but cannot be written blindly.
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
      // the next completed play can replace it with a valid current payload.
      storeCache = emptyStore();
      return storeCache;
    }
    if (isRecord(parsed) && Number.isFinite(parsed.schemaVersion) && parsed.schemaVersion > SCHEMA_VERSION) {
      // Never replace a store written by code with a schema this build does not know.
      storeCache = emptyStore();
      return storeCache;
    }
    const supportedSchema = isRecord(parsed)
      && (parsed.schemaVersion === SCHEMA_VERSION || LEGACY_SCHEMA_VERSIONS.includes(parsed.schemaVersion));
    storeCache = supportedSchema ? normalizeStore(parsed) : emptyStore();
    return storeCache;
  }

  function readLiveStoreForWrite() {
    let raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
    if (!raw) return emptyStore();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return emptyStore();
    }
    if (isRecord(parsed) && Number.isFinite(parsed.schemaVersion)
      && parsed.schemaVersion > SCHEMA_VERSION) {
      return null;
    }
    const supportedSchema = isRecord(parsed)
      && (parsed.schemaVersion === SCHEMA_VERSION || LEGACY_SCHEMA_VERSIONS.includes(parsed.schemaVersion));
    return supportedSchema ? normalizeStore(parsed) : emptyStore();
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

  function createSession(gameId = null) {
    return {
      gameId: safeString(gameId) || makeId('game'),
      startedAt: new Date().toISOString(),
      nextSequence: 1,
      completedPlays: [],
      completedPlayKeys: [],
    };
  }

  function beginPendingPlay(session, details, instructionalStatus) {
    if (!isRecord(session) || !safeString(session.gameId) || !isRecord(details)
      || !Number.isSafeInteger(session.nextSequence) || session.nextSequence < 1
      || !Array.isArray(session.completedPlays) || !Array.isArray(session.completedPlayKeys)) return false;
    const startedAtMs = monotonicNow();
    const question = instructionalStatus === 'presented' ? details.question : null;
    const playType = details.playType == null ? 'scrimmage' : details.playType;
    if (!PLAY_TYPES.includes(playType)) return false;
    const id = safeString(details.id) || makeId('play');
    return {
      id,
      gameId: session.gameId,
      possessionId: safeString(details.possessionId),
      playId: safeString(details.playId, id),
      playType,
      sequence: session.nextSequence++,
      instructionalStatus,
      links: normalizeLinks(details, question),
      preSnap: details.preSnap,
      calls: playType === 'scrimmage' ? details.calls : null,
      offeredYards: playType === 'scrimmage' ? details.offeredYards : null,
      metrics: details.metrics,
      question,
      attempts: [],
      resolution: null,
      startedAtMs,
      attemptStartedAtMs: startedAtMs,
      finalized: false,
    };
  }

  function beginPlay(session, details) {
    return beginPendingPlay(session, details, 'presented');
  }

  function beginBypassedPlay(session, details) {
    return beginPendingPlay(session, details, 'bypassed');
  }

  function beginPlayDraft(session, details) {
    return beginPendingPlay(session, details, 'pending');
  }

  function markPresented(pending, details) {
    if (!pending || pending.finalized || pending.instructionalStatus !== 'pending'
      || !isRecord(details?.question)) return false;
    const links = normalizeLinks(details, details.question);
    pending.instructionalStatus = 'presented';
    pending.question = details.question;
    pending.links = {
      familyId: links.familyId ?? pending.links.familyId,
      contextId: links.contextId ?? pending.links.contextId,
      questionInstanceId: links.questionInstanceId ?? pending.links.questionInstanceId,
    };
    pending.attemptStartedAtMs = monotonicNow();
    return pending;
  }

  function markBypassed(pending, details = {}) {
    if (!pending || pending.finalized || pending.instructionalStatus !== 'pending') return false;
    const links = normalizeLinks(details);
    pending.instructionalStatus = 'bypassed';
    pending.question = null;
    pending.links = {
      familyId: links.familyId,
      contextId: links.contextId ?? pending.links.contextId,
      questionInstanceId: links.questionInstanceId,
    };
    pending.attempts = [];
    pending.resolution = null;
    return pending;
  }

  function discardPlay(pending) {
    if (!pending || pending.finalized) return false;
    pending.finalized = true;
    return true;
  }

  function recordAttempt(pending, details) {
    if (!pending || pending.finalized || pending.instructionalStatus !== 'presented'
      || !isRecord(details) || pending.attempts.length >= 2) return false;
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
    if (!pending || pending.finalized || pending.instructionalStatus !== 'presented'
      || !RESOLUTIONS.includes(resolution)) return false;
    pending.resolution = resolution;
    return true;
  }

  function updateAggregates(aggregates, row) {
    aggregates.completedPlays++;
    aggregates.byPlayType[row.playType]++;
    if (row.playType === 'scrimmage') aggregates.actualYards += row.actualYards;
    aggregates.byPossession[row.preSnap.possession]++;
    aggregates.byOutcome[row.outcome]++;
    if (row.playType === 'conversion') {
      const bucket = aggregates.specialTeams.conversions;
      bucket.attempts++;
      if (row.outcome === 'conversionMade') bucket.made++;
      else if (row.outcome === 'conversionDenied') bucket.denied++;
      else bucket.missed++;
      bucket.points += row.metrics.pointsAwarded;
    } else if (row.playType === 'fieldGoal') {
      const bucket = aggregates.specialTeams.fieldGoals;
      bucket.attempts++;
      if (row.outcome === 'fieldGoalMade') bucket.made++;
      else if (row.outcome === 'fieldGoalBlocked') bucket.blocked++;
      else bucket.missed++;
      bucket.points += row.metrics.pointsAwarded;
    } else if (row.playType === 'punt') {
      const bucket = aggregates.specialTeams.punts;
      bucket.attempts++;
      if (row.metrics.touchback) bucket.touchbacks++;
      bucket.totalTravelDistance += row.metrics.travelDistance;
    }
    if (row.instructionalStatus === 'bypassed') return;
    if (row.question.grading === 'noStakes') {
      aggregates.learning.noStakesPlays++;
      return;
    }
    aggregates.learning.gradedPlays++;
    aggregates.learning[row.resolution]++;
  }

  function updateMastery(mastery, row) {
    if (row.instructionalStatus === 'bypassed' || row.question.grading === 'noStakes') return;
    const concept = row.question.concept;
    if (!mastery[concept]) {
      mastery[concept] = { resolved: 0, firstTryCorrect: 0, retryCorrect: 0, secondMiss: 0 };
    }
    mastery[concept].resolved++;
    mastery[concept][row.resolution]++;
  }

  function normalizeLastResolved(value) {
    const normalized = Object.create(null);
    if (!isRecord(value)) return normalized;
    for (const [conceptValue, evidence] of Object.entries(value)) {
      const concept = safeString(conceptValue);
      const completedAt = isRecord(evidence) ? safeString(evidence.completedAt) : null;
      const resolution = isRecord(evidence) && RESOLUTIONS.includes(evidence.resolution)
        ? evidence.resolution
        : null;
      if (!concept || concept === 'unknown' || !resolution
        || !Number.isFinite(Date.parse(completedAt))) continue;
      normalized[concept] = { completedAt, resolution };
    }
    return normalized;
  }

  function updateLastResolved(lastResolvedByConcept, row) {
    if (row.instructionalStatus !== 'presented'
      || !row.question
      || row.question.grading === 'noStakes'
      || !RESOLUTIONS.includes(row.resolution)
      || !row.question.concept
      || row.question.concept === 'unknown') return;
    const completedAtMs = Date.parse(row.completedAt);
    if (!Number.isFinite(completedAtMs)) return;
    const concept = row.question.concept;
    const previous = lastResolvedByConcept[concept];
    const previousAtMs = previous ? Date.parse(previous.completedAt) : Number.NEGATIVE_INFINITY;
    // A later journal entry wins an exact timestamp tie, matching the prior
    // reverse-scan behavior while still rejecting genuinely older evidence.
    if (Number.isFinite(previousAtMs) && previousAtMs > completedAtMs) return;
    lastResolvedByConcept[concept] = {
      completedAt: row.completedAt,
      resolution: row.resolution,
    };
  }

  function stablePlayKey(row) {
    return JSON.stringify([row.gameId, row.playId]);
  }

  function productionPlaySequence(row) {
    const prefix = `${row.gameId}-play-`;
    if (!row.playId.startsWith(prefix)) return null;
    const suffix = row.playId.slice(prefix.length);
    if (!/^[1-9]\d*$/.test(suffix)) return null;
    const sequence = Number(suffix);
    return Number.isSafeInteger(sequence) ? sequence : null;
  }

  function normalizeArchivedPlayIndex(value) {
    const normalized = Object.create(null);
    if (!isRecord(value)) return normalized;
    for (const [gameIdValue, rawEntry] of Object.entries(value)) {
      const gameId = safeString(gameIdValue);
      if (!gameId || !isRecord(rawEntry)) continue;
      const through = Number.isSafeInteger(rawEntry.through) && rawEntry.through > 0
        ? rawEntry.through
        : 0;
      const ids = [];
      const idSet = new Set();
      for (const candidate of Array.isArray(rawEntry.ids) ? rawEntry.ids : []) {
        const playId = safeString(candidate);
        if (!playId || idSet.has(playId)) continue;
        idSet.add(playId);
        ids.push(playId);
      }
      if (through || ids.length) normalized[gameId] = { through, ids };
    }
    return normalized;
  }

  function archivedEntry(index, gameId, create = false) {
    if (Object.prototype.hasOwnProperty.call(index, gameId)) return index[gameId];
    if (!create) return null;
    index[gameId] = { through: 0, ids: [] };
    return index[gameId];
  }

  function archivePlayIdentity(index, row) {
    const entry = archivedEntry(index, row.gameId, true);
    const sequence = productionPlaySequence(row);
    if (sequence !== null) entry.through = Math.max(entry.through, sequence);
    else if (!entry.ids.includes(row.playId)) entry.ids.push(row.playId);
  }

  function migrateArchivedPlayKeys(index, value) {
    if (!Array.isArray(value)) return;
    for (const candidate of value) {
      if (typeof candidate !== 'string') continue;
      let identity;
      try {
        identity = JSON.parse(candidate);
      } catch (error) {
        continue;
      }
      if (!Array.isArray(identity) || identity.length !== 2
        || !safeString(identity[0]) || !safeString(identity[1])) continue;
      archivePlayIdentity(index, { gameId: identity[0], playId: identity[1] });
    }
  }

  function isArchivedPlay(index, row) {
    const entry = archivedEntry(index, row.gameId);
    if (!entry) return false;
    const sequence = productionPlaySequence(row);
    return (sequence !== null && sequence <= entry.through) || entry.ids.includes(row.playId);
  }

  function hasStablePlay(store, row) {
    const playKey = stablePlayKey(row);
    return isArchivedPlay(store.archivedPlayIndex, row)
      || store.recentPlays.some(existing => stablePlayKey(existing) === playKey);
  }

  function appendUniqueRow(store, row) {
    if (hasStablePlay(store, row)) return false;
    updateAggregates(store.aggregates, row);
    updateMastery(store.mastery, row);
    updateLastResolved(store.lastResolvedByConcept, row);
    store.recentPlays.push(row);
    const evictedRows = store.recentPlays.splice(0, Math.max(0, store.recentPlays.length - MAX_RECENT_PLAYS));
    for (const evictedRow of evictedRows) archivePlayIdentity(store.archivedPlayIndex, evictedRow);
    return true;
  }

  function mergedStore() {
    // normalizeStore creates a detached copy, preserving lifetime aggregates
    // while allowing local staged rows to appear in synchronous public views.
    const store = normalizeStore(loadStore());
    for (const row of stagedRows.values()) appendUniqueRow(store, row);
    return store;
  }

  function persistStagedRows() {
    // This function is called only from the exclusive Web Lock callback. Keep
    // the localStorage read/merge/write synchronous so no writer can interleave.
    const store = readLiveStoreForWrite();
    if (!store) return false;
    const entries = Array.from(stagedRows.entries());
    let changed = false;
    for (const [, row] of entries) {
      if (appendUniqueRow(store, row)) changed = true;
    }
    if (changed) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      } catch (error) {
        // Never fall back to an unlocked write. Retain every staged row so the
        // current session and public views remain complete in memory.
        return false;
      }
    }
    storeCache = store;
    for (const [playKey, row] of entries) {
      if (stagedRows.get(playKey) === row) stagedRows.delete(playKey);
    }
    return true;
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

  function requestPersistence() {
    if (!stagedRows.size) return;
    if (persistenceRequestPending) return;
    const locks = lockManager();
    if (!locks) return;

    persistenceRequestPending = true;
    retryPersistenceAfterPending = false;
    const requestRevision = stagedRevision;
    let callbackRevision = null;
    let request;
    try {
      request = locks.request(STORAGE_LOCK_NAME, { mode: 'exclusive' }, () => {
        callbackRevision = stagedRevision;
        return persistStagedRows();
      });
    } catch (error) {
      persistenceRequestPending = false;
      return;
    }

    const finishRequest = () => {
      const rowsArrivedAfterAttempt = callbackRevision === null
        ? stagedRevision !== requestRevision
        : stagedRevision !== callbackRevision;
      const shouldRetry = retryPersistenceAfterPending || rowsArrivedAfterAttempt;
      persistenceRequestPending = false;
      retryPersistenceAfterPending = false;
      if (shouldRetry && stagedRows.size) requestPersistence();
    };
    Promise.resolve(request).then(finishRequest, finishRequest);
  }

  function completePlay(session, pending, details) {
    if (!pending || pending.finalized || pending.instructionalStatus !== 'presented'
      || !isRecord(details) || !isRecord(pending.question) || !pending.resolution) return false;
    return completePendingPlay(session, pending, details);
  }

  function completeBypassedPlay(session, pending, details) {
    if (!pending || pending.finalized || pending.instructionalStatus !== 'bypassed'
      || !isRecord(details)) return false;
    return completePendingPlay(session, pending, details);
  }

  function completePendingPlay(session, pending, details) {
    if (!isRecord(session) || !Array.isArray(session.completedPlayKeys)
      || !Array.isArray(session.completedPlays) || !pending || pending.finalized
      || pending.gameId !== session.gameId || !safeString(pending.playId)
      || !PLAY_TYPES.includes(pending.playType)
      || !OUTCOMES_BY_PLAY_TYPE[pending.playType].includes(details.outcome)) return false;
    const playKey = stablePlayKey(pending);
    if (session.completedPlayKeys.includes(playKey)) return false;
    const providedMetrics = isRecord(details.metrics) ? details.metrics : null;
    const pendingMetrics = isRecord(pending.metrics) ? pending.metrics : {};
    const metrics = pending.playType === 'scrimmage'
      ? {
          ...pendingMetrics,
          ...(providedMetrics || {}),
          offeredYards: providedMetrics?.offeredYards ?? pendingMetrics.offeredYards ?? pending.offeredYards,
          actualYards: details.actualYards,
        }
      : providedMetrics || pendingMetrics;
    const row = normalizeRow({
      ...pending,
      completedAt: new Date().toISOString(),
      actualYards: details.actualYards,
      outcome: details.outcome,
      metrics,
      postPlay: details.postPlay,
    }, SCHEMA_VERSION);
    if (!row) return false;
    if (stagedRows.has(playKey)) return false;
    const store = mergedStore();
    if (hasStablePlay(store, row)) return false;
    pending.finalized = true;
    session.completedPlayKeys.push(playKey);
    session.completedPlays.push(row);
    stagedRows.set(playKey, row);
    stagedRevision++;
    requestPersistence();
    return row;
  }

  function snapshot(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function learningSnapshot() {
    const store = mergedStore();
    return snapshot({
      mastery: store.mastery,
      lastResolvedByConcept: store.lastResolvedByConcept,
    });
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      storeCache = undefined;
      if (persistenceRequestPending) retryPersistenceAfterPending = true;
      else requestPersistence();
    });
  }

  return Object.freeze({
    STORAGE_KEY,
    SCHEMA_VERSION,
    MAX_RECENT_PLAYS,
    INSTRUCTIONAL_STATUSES,
    createSession,
    beginPlay,
    beginBypassedPlay,
    beginPlayDraft,
    markPresented,
    markBypassed,
    discardPlay,
    recordAttempt,
    recordResolution,
    completePlay,
    completeBypassedPlay,
    history: () => {
      const store = mergedStore();
      // The archived replay index is an internal persistence detail, not play
      // history. Keep the longstanding public history shape stable.
      return snapshot({
        schemaVersion: store.schemaVersion,
        aggregates: store.aggregates,
        recentPlays: store.recentPlays,
        mastery: store.mastery,
      });
    },
    masterySnapshot: () => snapshot(mergedStore().mastery),
    learningSnapshot,
    sessionSnapshot: session => snapshot(session),
  });
})();
