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

  function createSession(historicalMastery = {}, historicalLastResolved = {}, nowMs = Date.now()) {
    return {
      schemaVersion: PROFILE.schemaVersion,
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

  function supportFor(session, entryOrSkill, evidenceClassOrInitial = 'none', explicitInitial = 'none') {
    const entry = isRecord(entryOrSkill) ? entryOrSkill : null;
    const skill = entry ? entry.skill : entryOrSkill;
    const evidenceClass = entry ? questionEvidenceClass(entry) : evidenceClassOrInitial;
    const initial = entry ? evidenceClassOrInitial : explicitInitial;
    if (typeof skill !== 'string' || !skill || !validEvidenceClass(evidenceClass)) {
      throw new TypeError('supportFor expects an entry or an explicit skill plus evidenceClass');
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
