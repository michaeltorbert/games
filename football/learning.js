// Curriculum scheduling and session learning for Football Math.
// Plain global, loaded before football.js. This module deliberately knows
// nothing about field coordinates or football outcomes.

const FOOTBALL_LEARNING = (() => {
  const PROFILE = Object.freeze({
    schemaVersion: 2,
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

  function normalizeMasterySnapshot(value) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(Object.entries(input).map(([concept, raw]) => {
      const stats = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      const firstTryCorrect = Math.max(0, Math.floor(Number(stats.firstTryCorrect) || 0));
      const retryCorrect = Math.max(0, Math.floor(Number(stats.retryCorrect) || 0));
      const secondMiss = Math.max(0, Math.floor(Number(stats.secondMiss) || 0));
      const resolved = firstTryCorrect + retryCorrect + secondMiss;
      return [concept, { resolved, firstTryCorrect, retryCorrect, secondMiss }];
    }));
  }

  function normalizeLastResolvedSnapshot(value) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(Object.entries(input).flatMap(([concept, raw]) => {
      const evidence = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      const resolvedAtMs = Date.parse(evidence.completedAt);
      if (!Number.isFinite(resolvedAtMs)
        || !['firstTryCorrect', 'retryCorrect', 'secondMiss'].includes(evidence.resolution)) return [];
      return [[concept, { resolvedAtMs, resolution: evidence.resolution }]];
    }));
  }

  function createSession(historicalMastery = {}, historicalLastResolved = {}, nowMs = Date.now()) {
    return {
      recentFamilyIds: [],
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

  function skillState(session, skill) {
    if (!session.bySkill[skill]) {
      session.bySkill[skill] = { presented: 0, firstTryCorrect: 0, retryCorrect: 0, secondMiss: 0 };
    }
    return session.bySkill[skill];
  }

  function conceptState(session, concept) {
    if (!session.byConcept[concept]) {
      session.byConcept[concept] = { resolved: 0, firstTryCorrect: 0, retryCorrect: 0, secondMiss: 0 };
    }
    return session.byConcept[concept];
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
    session.presented++;
    skillState(session, question.skill).presented++;
    const identity = questionIdentity(question);
    session.recentFamilyIds.push(identity.familyId);
    session.recentFamilyIds = session.recentFamilyIds.slice(-PROFILE.recencyWindow);
    addEvent(session, 'presented', {
      ...identity,
      ...eventPlayScope(context),
      skill: question.skill,
      concept: question.concept || question.skill,
      purpose: question.purpose,
      grading: question.grading,
      support: question.math?.support || 'none',
      ...questionEvidence(question),
      ...questionSelection(question),
    });
  }

  function recordAttempt(session, question, context = {}) {
    addEvent(session, 'attempt', {
      ...questionIdentity(question),
      ...eventPlayScope(context),
      skill: question.skill,
      concept: question.concept || question.skill,
      purpose: question.purpose,
      grading: question.grading,
      attempt: context.attempt,
      selectedChoiceId: context.selectedChoiceId || null,
      correct: Boolean(context.correct),
      support: context.support || 'none',
      ...questionEvidence(question),
      ...questionSelection(question),
    });
  }

  function recordResolved(session, question, result, context = {}) {
    session.resolved++;
    if (question.grading !== 'noStakes') {
      const stats = skillState(session, question.skill);
      stats[result] = (stats[result] || 0) + 1;
      const mastery = conceptState(session, question.concept || question.skill);
      mastery.resolved++;
      mastery[result] = (mastery[result] || 0) + 1;
      session.latestResolvedByConcept[question.concept || question.skill] = { resolution: result };
    }
    addEvent(session, 'resolved', {
      ...questionIdentity(question),
      ...eventPlayScope(context),
      skill: question.skill,
      concept: question.concept || question.skill,
      purpose: question.purpose,
      grading: question.grading,
      result,
      support: context.support || 'none',
      ...questionEvidence(question),
      ...questionSelection(question),
    });
  }

  function needMultiplier(session, entry) {
    if (entry.grading === 'noStakes') return 1;
    const concept = entry.concept || entry.skill;
    const latest = session.latestResolvedByConcept[concept];
    if (latest?.resolution === 'firstTryCorrect') return 1;
    const stats = session.bySkill[entry.skill];
    if (!stats) {
      return Object.prototype.hasOwnProperty.call(session.historicalMastery, concept) ? 1 : 1.15;
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
    const concept = entry.concept || entry.skill;
    const current = session.latestResolvedByConcept[concept];
    const stats = session.historicalMastery[concept];
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

    const latest = session.historicalLastResolved[concept];
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
    const recent = new Set(session.recentFamilyIds);
    const purposeTotals = entries.reduce((totals, entry) => {
      totals[entry.purpose] = (totals[entry.purpose] || 0) + (entry.weight || 1);
      return totals;
    }, {});
    const weighted = entries.map((entry) => {
      const multiplier = entry.selectionMultiplier === undefined ? 1 : entry.selectionMultiplier;
      if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 2) {
        throw new TypeError('selectionMultiplier must be a finite number greater than 0 and at most 2');
      }
      const normalized = purposeWeight(entry) * ((entry.weight || 1) / purposeTotals[entry.purpose]);
      return {
        entry,
        weight: Math.max(
          0.0001,
          (multiplier === 1 ? normalized : normalized * multiplier)
            * adaptiveNeedMultiplier(session, entry)
            * (recent.has(entry.familyId || entry.id) ? PROFILE.recencyMultiplier : 1)
        ),
      };
    });
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let draw = rng() * total;
    for (const item of weighted) {
      draw -= item.weight;
      if (draw <= 0) return item.entry;
    }
    return weighted[weighted.length - 1]?.entry || null;
  }

  function supportFor(session, skill, initial = 'none') {
    const stats = session.bySkill[skill];
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
