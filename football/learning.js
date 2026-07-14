// Curriculum scheduling and session learning for Football Math.
// Plain global, loaded before football.js. This module deliberately knows
// nothing about field coordinates or football outcomes.

const FOOTBALL_LEARNING = (() => {
  const PROFILE = Object.freeze({
    schemaVersion: 1,
    completedThroughPage: 143,
    computationMax: 10,
    displayMax: 100,
    recencyWindow: 3,
    maxEvents: 160,
    purposeWeights: Object.freeze({
      weakSpot: 0.38,
      coreReview: 0.22,
      completedPlaceValue: 0.30,
      currentSupported: 0.10,
    }),
  });

  function createSession() {
    return {
      recentIds: [],
      bySkill: {},
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
      window.dispatchEvent(new CustomEvent('football:learning', { detail: copy(event) }));
    }
    return event;
  }

  function recordPresented(session, question, context = {}) {
    session.presented++;
    skillState(session, question.skill).presented++;
    session.recentIds.push(question.id);
    session.recentIds = session.recentIds.slice(-PROFILE.recencyWindow);
    addEvent(session, 'presented', {
      questionId: question.id,
      skill: question.skill,
      purpose: question.purpose,
      grading: question.grading,
      possession: context.possession,
      call: context.call,
      support: question.math?.support || 'none',
    });
  }

  function recordAttempt(session, question, context = {}) {
    addEvent(session, 'attempt', {
      questionId: question.id,
      skill: question.skill,
      purpose: question.purpose,
      grading: question.grading,
      possession: context.possession,
      call: context.call,
      attempt: context.attempt,
      correct: Boolean(context.correct),
      support: context.support || 'none',
    });
  }

  function recordResolved(session, question, result, context = {}) {
    session.resolved++;
    if (question.grading !== 'noStakes') {
      const stats = skillState(session, question.skill);
      stats[result] = (stats[result] || 0) + 1;
    }
    addEvent(session, 'resolved', {
      questionId: question.id,
      skill: question.skill,
      purpose: question.purpose,
      grading: question.grading,
      possession: context.possession,
      call: context.call,
      result,
      support: context.support || 'none',
    });
  }

  function needMultiplier(session, entry) {
    if (entry.grading === 'noStakes') return 1;
    const stats = session.bySkill[entry.skill];
    if (!stats) return 1.15;
    const attempts = stats.firstTryCorrect + stats.retryCorrect + stats.secondMiss;
    if (!attempts) return 1.15;
    const supported = stats.retryCorrect + stats.secondMiss;
    const supportRate = supported / attempts;
    if (supportRate >= 0.6) return 1.7;
    if (supportRate >= 0.3) return 1.3;
    if (stats.firstTryCorrect >= 4 && supportRate === 0) return 0.8;
    return 1;
  }

  function purposeWeight(entry) {
    return PROFILE.purposeWeights[entry.purpose] || 0.12;
  }

  function weightedPick(entries, session, rng) {
    const recent = new Set(session.recentIds);
    const fresh = entries.filter((entry) => !recent.has(entry.id));
    const pool = fresh.length ? fresh : entries;
    const purposeTotals = pool.reduce((totals, entry) => {
      totals[entry.purpose] = (totals[entry.purpose] || 0) + (entry.weight || 1);
      return totals;
    }, {});
    const weighted = pool.map((entry) => ({
      entry,
      weight: Math.max(
        0.0001,
        purposeWeight(entry) * ((entry.weight || 1) / purposeTotals[entry.purpose]) * needMultiplier(session, entry)
      ),
    }));
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
    if (!current || current === 'none') return 'guided';
    return 'worked';
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
