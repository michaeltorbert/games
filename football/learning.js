// Curriculum scheduling and session learning for Football Math.
// Plain global, loaded before football.js. This module deliberately knows
// nothing about field coordinates or football outcomes.

const FOOTBALL_LEARNING = (() => {
  const EVIDENCE_CLASSES = Object.freeze(['literacy', 'independent']);
  const HISTORICAL_EVIDENCE_CLASSES = Object.freeze([...EVIDENCE_CLASSES, 'unclassified']);
  const RESOLUTIONS = Object.freeze(['firstTryCorrect', 'retryCorrect', 'secondMiss']);
  const PROFILE = Object.freeze({
    schemaVersion: 3,
    completedThroughPage: 145,
    includedThroughPage: 179,
    computationMax: 10,
    displayMax: 120,
    recencyWindow: 3,
    recencyMultiplier: 0.18,
    masteryMinResolved: 4,
    masteryMinFirstTryRate: 0.8,
    masteryMaxSecondMissRate: 0.1,
    freshMasteryMultiplier: 0.25,
    masteryRestoreDays: 30,
    recentSupportMultiplier: 1.25,
    maxEvents: 160,
    purposeWeights: Object.freeze({
      weakSpot: 0.38,
      coreReview: 0.32,
      completedPlaceValue: 0.30,
      approvedExtension: 0.18,
    }),
  });

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeCounts(raw) {
    const stats = isRecord(raw) ? raw : {};
    const firstTryCorrect = Math.max(0, Math.floor(Number(stats.firstTryCorrect) || 0));
    const retryCorrect = Math.max(0, Math.floor(Number(stats.retryCorrect) || 0));
    const secondMiss = Math.max(0, Math.floor(Number(stats.secondMiss) || 0));
    return {
      resolved: firstTryCorrect + retryCorrect + secondMiss,
      firstTryCorrect,
      retryCorrect,
      secondMiss,
    };
  }

  function normalizeMasterySnapshot(value) {
    const input = isRecord(value) ? value : {};
    return Object.fromEntries(Object.entries(input).flatMap(([concept, raw]) => {
      if (!isRecord(raw)) return [];
      const hasClassBuckets = HISTORICAL_EVIDENCE_CLASSES.some(evidenceClass => isRecord(raw[evidenceClass]));
      const buckets = hasClassBuckets
        ? Object.fromEntries(HISTORICAL_EVIDENCE_CLASSES.flatMap(evidenceClass => (
            isRecord(raw[evidenceClass]) ? [[evidenceClass, normalizeCounts(raw[evidenceClass])]] : []
          )))
        : { unclassified: normalizeCounts(raw) };
      return Object.keys(buckets).length ? [[concept, buckets]] : [];
    }));
  }

  function normalizeLastResolvedSnapshot(value) {
    const input = isRecord(value) ? value : {};
    const normalizeEvidence = (raw) => {
      const evidence = isRecord(raw) ? raw : {};
      const resolvedAtMs = Date.parse(evidence.completedAt);
      if (!Number.isFinite(resolvedAtMs) || !RESOLUTIONS.includes(evidence.resolution)) return null;
      return { resolvedAtMs, resolution: evidence.resolution };
    };
    return Object.fromEntries(Object.entries(input).flatMap(([concept, raw]) => {
      if (!isRecord(raw)) return [];
      const hasClassBuckets = HISTORICAL_EVIDENCE_CLASSES.some(evidenceClass => isRecord(raw[evidenceClass]));
      if (!hasClassBuckets) {
        const evidence = normalizeEvidence(raw);
        return evidence ? [[concept, { unclassified: evidence }]] : [];
      }
      const buckets = Object.fromEntries(HISTORICAL_EVIDENCE_CLASSES.flatMap(evidenceClass => {
        const evidence = normalizeEvidence(raw[evidenceClass]);
        return evidence ? [[evidenceClass, evidence]] : [];
      }));
      return Object.keys(buckets).length ? [[concept, buckets]] : [];
    }));
  }

  const CHALLENGE_POLICY = Object.freeze({ version: 'concept-challenge-v1', window: 12, days: 30 });

  function challengeMeta(entry) {
    const meta = typeof FOOTBALL_CONTEXTUAL_QUESTIONS === 'undefined' ? null
      : FOOTBALL_CONTEXTUAL_QUESTIONS.CHALLENGE_MAP[entry.familyId || entry.id];
    return meta && entry.evidenceClass === 'independent' && entry.concept === meta.concept
      && entry.grading === 'gate' ? meta : null;
  }

  // Accept only the closed projection of finalized stats rows. No question text,
  // operands, elapsed time, or presentation state enters this evidence window.
  function normalizeChallengeEvidence(rows, nowMs) {
    const seen = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const meta = row && challengeMeta(row);
      const time = typeof row?.completedAt === 'string' ? Date.parse(row.completedAt) : NaN;
      if (!meta || row.playType !== 'scrimmage' || row.instructionalStatus !== 'presented'
        || !Number.isFinite(time) || time > nowMs || nowMs - time > CHALLENGE_POLICY.days * 86400000
        || ![row.gameId, row.playId].every(id => typeof id === 'string' && id.length > 0)
        || !RESOLUTIONS.includes(row.resolution) || !Array.isArray(row.attempts)) continue;
      const attempts = row.attempts;
      const first = row.resolution === 'firstTryCorrect';
      if (attempts.length !== (first ? 1 : 2)
        || attempts.some((a, i) => !a || a.number !== i + 1 || typeof a.correct !== 'boolean'
          || !['none', 'initial', 'guided'].includes(a.support))
        || attempts[0].correct !== first
        || (!first && attempts[1].correct !== (row.resolution === 'retryCorrect'))) continue;
      const key = JSON.stringify([row.gameId, row.playId]);
      const clean = { gameId: row.gameId, playId: row.playId, familyId: row.familyId,
        concept: row.concept, evidenceClass: 'independent', grading: 'gate', playType: 'scrimmage',
        instructionalStatus: 'presented', completedAt: new Date(time).toISOString(), resolution: row.resolution,
        attempts: attempts.map(a => ({ number: a.number, correct: a.correct, support: a.support })) };
      // Conflicting duplicate evidence is unusable, independent of input order.
      if (seen.has(key) && JSON.stringify(seen.get(key)) !== JSON.stringify(clean)) seen.set(key, null);
      else if (!seen.has(key)) seen.set(key, clean);
    }
    return [...seen.values()].filter(Boolean).sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt)
      || (JSON.stringify([a.gameId, a.playId]) < JSON.stringify([b.gameId, b.playId]) ? -1 : 1));
  }

  function challengeStateFor(session, concept) {
    const all = session.challengeEvidence.filter(row => row.concept === concept);
    // Prerequisite successes are neutral; their failures still request support.
    const rows = all.filter(row => challengeMeta(row).role !== 'prerequisite').slice(-CHALLENGE_POLICY.window);
    const supportSequence = all.filter(row => challengeMeta(row).role !== 'prerequisite'
      || row.resolution !== 'firstTryCorrect');
    const indexed = session.historicalLastResolved[concept]?.independent;
    const validIndex = indexed && indexed.resolvedAtMs <= session.nowMs
      && session.nowMs - indexed.resolvedAtMs <= CHALLENGE_POLICY.days * 86400000;
    // The capped journal may omit a historical failure. Replay that failure in
    // time order before applying the same window cap as retained evidence.
    if (validIndex && indexed.resolution === 'secondMiss' && !all.some(row =>
      Date.parse(row.completedAt) === indexed.resolvedAtMs && row.resolution === indexed.resolution)) {
      const next = supportSequence.findIndex(row => Date.parse(row.completedAt) > indexed.resolvedAtMs);
      supportSequence.splice(next < 0 ? supportSequence.length : next, 0, {
        completedAt: new Date(indexed.resolvedAtMs).toISOString(), resolution: 'secondMiss',
      });
    }
    const supportRows = supportSequence.slice(-CHALLENGE_POLICY.window);
    let downshift = false;
    let recovery = 0;
    supportRows.forEach((row, i) => {
      const trigger = row.resolution === 'secondMiss'
        || (row.resolution === 'retryCorrect' && supportRows.slice(Math.max(0, i - 2), i + 1).filter(r => r.resolution === 'retryCorrect').length >= 2);
      if (trigger) { downshift = true; recovery = 0; }
      else if (downshift) {
        recovery = row.resolution === 'firstTryCorrect' ? recovery + 1 : 0;
        if (recovery >= 3) downshift = false;
      }
    });
    const firsts = rows.filter(row => row.resolution === 'firstTryCorrect');
    const lastSix = rows.slice(-6);
    const promoted = rows.length >= 8 && firsts.length / rows.length >= 0.8
      && lastSix.filter(row => row.resolution === 'firstTryCorrect').length >= 5
      && !lastSix.some(row => row.resolution === 'secondMiss')
      && firsts.filter(row => challengeMeta(row).role === 'core' && row.attempts[0].support !== 'guided').length >= 3;
    let stretchRun = 0;
    for (let i = all.length - 1; i >= 0 && challengeMeta(all[i]).role === 'stretch'; i--) stretchRun++;
    const latest = supportRows.at(-1);
    const latestCommitted = all.at(-1);
    const indexedNewer = validIndex
      && (!latestCommitted || indexed.resolvedAtMs > Date.parse(latestCommitted.completedAt));
    return { preference: downshift ? 'downshifted' : promoted && !indexedNewer ? 'promoted' : 'initial',
      guided: downshift || latest?.resolution === 'retryCorrect' || Boolean(indexedNewer && indexed.resolution === 'retryCorrect'),
      refreshDue: stretchRun >= 4 };
  }

  function recordCommitted(session, row) {
    const projected = projectCommitted(row);
    const clean = normalizeChallengeEvidence([projected], Math.max(session.nowMs, Date.now()));
    if (!clean.length || session.challengeEvidence.some(r => r.gameId === row.gameId && r.playId === row.playId)) return false;
    session.challengeEvidence.push(clean[0]);
    session.challengeEvidence = normalizeChallengeEvidence(session.challengeEvidence, Math.max(session.nowMs, Date.now()));
    session.currentChallengeEvidence.push(clean[0]);
    return true;
  }

  function projectCommitted(row) {
    return { gameId: row?.gameId, playId: row?.playId, playType: row?.playType,
      instructionalStatus: row?.instructionalStatus, completedAt: row?.completedAt,
      familyId: row?.links?.familyId, concept: row?.question?.concept,
      evidenceClass: row?.question?.evidenceClass, grading: row?.question?.grading,
      resolution: row?.resolution, attempts: row?.attempts?.map(a => ({ number: a.number, correct: a.correct, support: a.support })) };
  }

  function challengeOptions(entries, session) {
    const roles = ['prerequisite', 'core', 'stretch'];
    return entries.map(entry => {
      const meta = challengeMeta(entry);
      if (!meta) return { entry, factor: 1, diagnostic: null };
      const state = challengeStateFor(session, meta.concept);
      const available = entries.filter(e => challengeMeta(e)?.concept === meta.concept);
      const preferred = state.refreshDue || state.preference !== 'promoted' ? 'core' : 'stretch';
      const lower = available.filter(e => roles.indexOf(challengeMeta(e).role) < roles.indexOf(preferred));
      const targetExists = available.some(e => challengeMeta(e).role === preferred);
      const fallback = targetExists ? 'preferred-available' : lower.length ? 'nearest-lower' : 'higher-guided';
      const lowerAvailable = available.some(e => challengeMeta(e).role !== 'stretch');
      const table = state.preference === 'promoted' ? [0.25, 0.5, 2]
        : state.preference === 'downshifted' ? [2, 2, 0.125] : [1, 1, 0.25];
      const factor = state.refreshDue && lowerAvailable && meta.role === 'stretch' ? 0 : table[roles.indexOf(meta.role)];
      return { entry, factor, diagnostic: Object.freeze({ policyVersion: CHALLENGE_POLICY.version,
        concept: meta.concept, preferredRole: preferred, selectedRole: meta.role,
        reason: state.refreshDue ? 'lower-refresh-due' : state.preference, fallback }),
        guided: state.guided || fallback === 'higher-guided' };
    });
  }

  function createSession(historicalMastery = {}, historicalLastResolved = {}, nowMs = Date.now(), historicalEvidence = []) {
    return {
      schemaVersion: PROFILE.schemaVersion,
      recentFamilyIds: [],
      recentFamilyIdsByClass: { literacy: [], independent: [] },
      challengeEvidence: normalizeChallengeEvidence(historicalEvidence, nowMs),
      currentChallengeEvidence: [],
      bySkill: {},
      byConcept: {},
      latestResolvedByConcept: {},
      historicalMastery: normalizeMasterySnapshot(historicalMastery),
      historicalLastResolved: normalizeLastResolvedSnapshot(historicalLastResolved),
      nowMs: Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now(),
      presented: 0,
      resolved: 0,
      nextSequence: 1,
      events: [],
    };
  }

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function validEvidenceClass(value) {
    return EVIDENCE_CLASSES.includes(value);
  }

  function questionEvidenceClass(question) {
    const evidenceClass = question?.evidenceClass;
    if (!validEvidenceClass(evidenceClass)) throw new TypeError('Question evidenceClass must be literacy or independent');
    return evidenceClass;
  }

  function classState(container, key, evidenceClass, initial) {
    if (!container[key]) container[key] = {};
    if (!container[key][evidenceClass]) container[key][evidenceClass] = initial();
    return container[key][evidenceClass];
  }

  function skillState(session, skill, evidenceClass) {
    return classState(session.bySkill, skill, evidenceClass, () => (
      { presented: 0, firstTryCorrect: 0, retryCorrect: 0, secondMiss: 0 }
    ));
  }

  function conceptState(session, concept, evidenceClass) {
    return classState(session.byConcept, concept, evidenceClass, () => (
      { resolved: 0, firstTryCorrect: 0, retryCorrect: 0, secondMiss: 0 }
    ));
  }

  function addEvent(session, type, payload = {}) {
    const event = {
      schemaVersion: PROFILE.schemaVersion,
      type,
      sequence: session.nextSequence++,
      ...payload,
    };
    session.events.push(event);
    if (session.events.length > PROFILE.maxEvents) session.events.shift();
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('football:learning', { detail: copy(event) }));
      } catch (error) {
        // Observer delivery is non-authoritative and must not interrupt learning or gameplay.
      }
    }
    return event;
  }

  function questionIdentity(question) {
    return {
      familyId: question.familyId || question.id,
      contextId: question.contextId || null,
      questionInstanceId: question.questionInstanceId || null,
    };
  }

  function questionEvidence(question) {
    const bindings = question.bindings || question.premises;
    return bindings ? { bindings: copy(bindings) } : {};
  }

  function questionSelection(question) {
    const selection = question.selection;
    if (!selection || typeof selection !== 'object') return {};
    return { selection: copy(selection) };
  }

  function eventPlayScope(context = {}) {
    return Object.fromEntries(['gameId', 'possessionId', 'playId', 'playType'].flatMap((key) => (
      typeof context[key] === 'string' && context[key] ? [[key, context[key]]] : []
    )));
  }

  function recordPresented(session, question, context = {}) {
    const evidenceClass = questionEvidenceClass(question);
    session.presented++;
    skillState(session, question.skill, evidenceClass).presented++;
    const identity = questionIdentity(question);
    session.recentFamilyIds.push(identity.familyId);
    session.recentFamilyIds = session.recentFamilyIds.slice(-PROFILE.recencyWindow);
    session.recentFamilyIdsByClass[evidenceClass].push(identity.familyId);
    session.recentFamilyIdsByClass[evidenceClass] = session.recentFamilyIdsByClass[evidenceClass].slice(-PROFILE.recencyWindow);
    addEvent(session, 'presented', {
      ...identity,
      ...eventPlayScope(context),
      skill: question.skill,
      concept: question.concept || question.skill,
      purpose: question.purpose,
      grading: question.grading,
      evidenceClass,
      support: question.math?.support || 'none',
      ...questionEvidence(question),
      ...questionSelection(question),
    });
  }

  function recordAttempt(session, question, context = {}) {
    const evidenceClass = questionEvidenceClass(question);
    addEvent(session, 'attempt', {
      ...questionIdentity(question),
      ...eventPlayScope(context),
      skill: question.skill,
      concept: question.concept || question.skill,
      purpose: question.purpose,
      grading: question.grading,
      evidenceClass,
      attempt: context.attempt,
      selectedChoiceId: context.selectedChoiceId || null,
      correct: Boolean(context.correct),
      support: context.support || 'none',
      ...questionEvidence(question),
      ...questionSelection(question),
    });
  }

  function recordResolved(session, question, result, context = {}) {
    const evidenceClass = questionEvidenceClass(question);
    if (!RESOLUTIONS.includes(result)) throw new TypeError('Resolved result is not a supported learning outcome');
    session.resolved++;
    if (question.grading !== 'noStakes') {
      const stats = skillState(session, question.skill, evidenceClass);
      stats[result] = (stats[result] || 0) + 1;
      const concept = question.concept || question.skill;
      const mastery = conceptState(session, concept, evidenceClass);
      mastery.resolved++;
      mastery[result] = (mastery[result] || 0) + 1;
      if (!session.latestResolvedByConcept[concept]) session.latestResolvedByConcept[concept] = {};
      session.latestResolvedByConcept[concept][evidenceClass] = { resolution: result };
    }
    addEvent(session, 'resolved', {
      ...questionIdentity(question),
      ...eventPlayScope(context),
      skill: question.skill,
      concept: question.concept || question.skill,
      purpose: question.purpose,
      grading: question.grading,
      evidenceClass,
      result,
      support: context.support || 'none',
      ...questionEvidence(question),
      ...questionSelection(question),
    });
  }

  function needMultiplier(session, entry) {
    if (entry.grading === 'noStakes') return 1;
    const evidenceClass = questionEvidenceClass(entry);
    const concept = entry.concept || entry.skill;
    const latest = session.latestResolvedByConcept[concept]?.[evidenceClass];
    if (latest?.resolution === 'firstTryCorrect') return 1;
    const stats = session.bySkill[entry.skill]?.[evidenceClass];
    if (!stats) {
      return session.historicalMastery[concept]?.[evidenceClass] ? 1 : 1.15;
    }
    const attempts = stats.firstTryCorrect + stats.retryCorrect + stats.secondMiss;
    if (!attempts) return 1.15;
    const supported = stats.retryCorrect + stats.secondMiss;
    const supportRate = supported / attempts;
    if (supportRate >= 0.6) return 1.7;
    if (supportRate >= 0.3) return 1.3;
    if (stats.firstTryCorrect >= 4 && supportRate === 0) return 0.8;
    return 1;
  }

  function historicalNeedMultiplier(session, entry) {
    if (entry.grading === 'noStakes') return 1;
    const evidenceClass = questionEvidenceClass(entry);
    const concept = entry.concept || entry.skill;
    const current = session.latestResolvedByConcept[concept]?.[evidenceClass];
    const stats = session.historicalMastery[concept]?.[evidenceClass];
    const mastered = Boolean(stats)
      && stats.resolved >= PROFILE.masteryMinResolved
      && stats.firstTryCorrect / stats.resolved >= PROFILE.masteryMinFirstTryRate
      && stats.secondMiss / stats.resolved <= PROFILE.masteryMaxSecondMissRate;

    if (current?.resolution === 'retryCorrect' || current?.resolution === 'secondMiss') {
      return PROFILE.recentSupportMultiplier;
    }
    if (current?.resolution === 'firstTryCorrect') {
      return mastered ? PROFILE.freshMasteryMultiplier : 1;
    }

    const latest = session.historicalLastResolved[concept]?.[evidenceClass];
    if (latest?.resolution === 'retryCorrect' || latest?.resolution === 'secondMiss') {
      return PROFILE.recentSupportMultiplier;
    }
    if (mastered) {
      if (latest?.resolution !== 'firstTryCorrect') return 1;
      const restoreMs = PROFILE.masteryRestoreDays * 24 * 60 * 60 * 1000;
      const ageMs = Math.min(restoreMs, Math.max(0, session.nowMs - latest.resolvedAtMs));
      return PROFILE.freshMasteryMultiplier
        + ((1 - PROFILE.freshMasteryMultiplier) * ageMs / restoreMs);
    }
    if (!stats || stats.resolved < 3) return 1;
    const supported = stats.retryCorrect + stats.secondMiss;
    return Math.min(1.25, Math.max(1, 1 + 0.25 * (supported / stats.resolved)));
  }

  function adaptiveNeedMultiplier(session, entry) {
    if (entry.grading === 'noStakes') return 1;
    return needMultiplier(session, entry) * historicalNeedMultiplier(session, entry);
  }

  function purposeWeight(entry) {
    return PROFILE.purposeWeights[entry.purpose] || 0.12;
  }

  function weightedPick(entries, session, rng) {
    if (!entries.length) return null;
    const options = challengeOptions(entries, session);
    const purposeTotals = entries.reduce((totals, entry) => {
      totals[entry.purpose] = (totals[entry.purpose] || 0) + (entry.weight || 1);
      return totals;
    }, {});
    const weighted = options.map(({ entry, factor, diagnostic, guided }) => {
      const multiplier = entry.selectionMultiplier === undefined ? 1 : entry.selectionMultiplier;
      if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 2) {
        throw new TypeError('selectionMultiplier must be a finite number greater than 0 and at most 2');
      }
      const normalized = purposeWeight(entry) * ((entry.weight || 1) / purposeTotals[entry.purpose]);
      return {
        entry,
        diagnostic, guided, factor,
        weight: Math.max(
          0.0001,
          (multiplier === 1 ? normalized : normalized * multiplier)
            * adaptiveNeedMultiplier(session, entry)
            * (session.recentFamilyIdsByClass[entry.evidenceClass]?.includes(entry.familyId || entry.id) ? PROFILE.recencyMultiplier : 1)
        ),
      };
    });
    // Redistribute each ladder's need-adjusted budget without applying mastery
    // twice or changing another concept's probability through role preferences.
    for (const concept of ['line-to-gain', 'drive-distance']) {
      const group = weighted.filter(item => challengeMeta(item.entry)?.concept === concept);
      const budget = group.reduce((sum, item) => sum + item.weight, 0);
      const adjusted = group.reduce((sum, item) => sum + item.weight * item.factor, 0);
      if (adjusted > 0) group.forEach(item => { item.weight *= item.factor * budget / adjusted; });
    }
    const selected = item => item.diagnostic ? { ...item.entry, challengeSelection: item.diagnostic,
      challengeGuided: item.guided } : item.entry;
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let draw = rng() * total;
    for (const item of weighted) {
      draw -= item.weight;
      if (item.weight > 0 && draw <= 0) return selected(item);
    }
    return selected(weighted.filter(item => item.weight > 0).at(-1));
  }

  function supportFor(session, entryOrSkill, evidenceClassOrInitial = 'none', explicitInitial = 'none') {
    const entry = isRecord(entryOrSkill) ? entryOrSkill : null;
    const skill = entry ? entry.skill : entryOrSkill;
    const evidenceClass = entry ? questionEvidenceClass(entry) : evidenceClassOrInitial;
    const initial = entry ? evidenceClassOrInitial : explicitInitial;
    if (typeof skill !== 'string' || !skill || !validEvidenceClass(evidenceClass)) {
      throw new TypeError('supportFor expects an entry or an explicit skill plus evidenceClass');
    }
    if (entry && challengeMeta(entry)) {
      return entry.challengeGuided || challengeStateFor(session, entry.concept).guided ? 'guided' : initial;
    }
    const stats = session.bySkill[skill]?.[evidenceClass];
    if (!stats) return initial;
    const attempts = stats.firstTryCorrect + stats.retryCorrect + stats.secondMiss;
    if (attempts < 2) return initial;
    const supported = stats.retryCorrect + stats.secondMiss;
    return supported / attempts >= 0.5 ? 'guided' : initial;
  }

  function nextSupport(current) {
    // The in-snap retry is always guided. Worked support is reserved for the
    // explicit second-miss explanation so it can never reveal an answer before
    // the child has had both attempts.
    if (current === 'worked') return 'worked';
    return 'guided';
  }

  function fitsDisplay(value, min = 0, max = PROFILE.displayMax) {
    return Number.isFinite(value) && value >= min && value <= max;
  }

  function fitsDelta(value, max = PROFILE.computationMax) {
    return Number.isFinite(value) && Math.abs(value) <= max;
  }

  return Object.freeze({
    PROFILE,
    CHALLENGE_POLICY,
    normalizeChallengeEvidence,
    challengeStateFor,
    challengeOptions,
    projectCommitted,
    recordCommitted,
    EVIDENCE_CLASSES,
    HISTORICAL_EVIDENCE_CLASSES,
    createSession,
    adaptiveNeedMultiplier,
    weightedPick,
    supportFor,
    nextSupport,
    fitsDisplay,
    fitsDelta,
    recordPresented,
    recordAttempt,
    recordResolved,
    snapshot: copy,
  });
})();
