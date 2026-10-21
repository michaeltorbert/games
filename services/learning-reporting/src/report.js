// Pure parent-report builder over reported events (no storage, no clock beyond `now`).
// Every outcome class stays separate; nothing is combined into one score. Literacy,
// no-stakes and legacy evidence never counts as independent. Football has no timing.
// Number facts describes reported eligible checks without the on-device
// "quick and accurate on the latest two checks" label: the protocol does not carry the
// device's saved-versus-memory provenance or its exact latest-check view, so that label's
// semantics cannot be guaranteed from reported events (the issue's "otherwise" branch).
import { RULES } from './config.js';

// The existing on-device caveat, verbatim (place-value-practice/fact-practice.js).
export const TIMING_CAVEAT = 'Entry time includes reading and tapping. It cannot tell us whether an answer was recalled, counted, or calculated. Quick entry means within 8 seconds for a one-digit answer or 10 seconds for two digits; it is a practice guide, not a mastery measure.';
export const SHARED_DEVICE_NOTE = 'On a shared device, the game’s practice schedule and its “another try” choices are shared by everyone who plays there.';
export const COVERAGE_EXCLUSIONS = 'Not included: practice before a device was connected, practice not yet sent, and practice removed by the retention window.';
export const SUGGESTION_NOTE = 'Suggestions come only from the reported results in this range. They are not a diagnosis and do not show what any device will ask next.';
export const ABSENT = 'No reported practice in this range';
export const SPARSE = 'Not enough reported evidence yet';

const DAY_MS = 86400000;
const SUPPORTED = ['guidedFirstTry', 'retryAfterHint', 'guidedRetry', 'secondMiss'];
const RESOLVED = ['firstTry', ...SUPPORTED];
const FOOTBALL_COUNTS = ['firstTry', 'guidedFirstTry', 'retryAfterHint', 'guidedRetry', 'secondMiss', 'secondMissWorked',
  'helpWithoutAnswer', 'pending', 'leftUnfinished', 'partial'];
export const FOOTBALL_LABELS = Object.freeze({
  firstTry: 'Correct on the first try, no help',
  guidedFirstTry: 'Correct on the first try after help shown first',
  retryAfterHint: 'Correct on the retry, after a hint on the retry',
  guidedRetry: 'Correct on the retry, with help from the start',
  secondMiss: 'Second miss',
  secondMissWorked: 'Second miss, then the worked explanation',
  helpWithoutAnswer: 'Help shown, no answer after it yet',
  pending: 'Started, no result reported yet',
  leftUnfinished: 'Left unfinished',
  partial: 'Partly reported',
});

const humanize = id => id.replace(/-ch8$/, '').replace(/-/g, ' ').replace(/^./, char => char.toUpperCase());
export function factEquation(factId) {
  const [op, a, b] = factId.split(':');
  return op === 'add' ? `${a} + ${b}` : `${a} − ${b}`;
}
const byTime = (a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

function groupQuestions(events) {
  const questions = new Map();
  for (const event of events) {
    const key = `${event.deviceId}:${event.questionInstanceId}`;
    if (!questions.has(key)) questions.set(key, { key, events: [] });
    questions.get(key).events.push(event);
  }
  for (const question of questions.values()) question.events.sort((a, b) => (a.epochId === b.epochId ? a.seq - b.seq : byTime(a, b)));
  return [...questions.values()];
}

// One Football question's outcome. A first-try success counts as unsupported only when
// its own attempt 1 was reported with support 'initial'. Missing pieces make it partial,
// never wrong. No resolution means pending (or help without an answer), never wrong.
export function footballOutcome(events) {
  const attempts = new Map(), helps = [];
  let resolution = null, left = null;
  for (const event of events) {
    if (event.kind === 'attempt' && !attempts.has(event.number)) attempts.set(event.number, event);
    else if (event.kind === 'help') helps.push(event);
    else if (event.kind === 'resolution') resolution = resolution ?? event;
    else if (event.kind === 'leftUnfinished') left = left ?? event;
  }
  const first = attempts.get(1), second = attempts.get(2);
  if (resolution) {
    if (resolution.resolution === 'firstTryCorrect') {
      if (!first || !first.correct || second) return 'partial';
      return first.support === 'initial' ? 'firstTry' : 'guidedFirstTry';
    }
    if (resolution.resolution === 'retryCorrect') {
      if (!first || first.correct || !second || !second.correct) return 'partial';
      return first.support === 'initial' ? 'retryAfterHint' : 'guidedRetry';
    }
    if (!first || first.correct || !second || second.correct) return 'partial';
    return helps.some(help => help.number === 2 && help.support === 'worked') ? 'secondMissWorked' : 'secondMiss';
  }
  if (left) return 'leftUnfinished';
  const lastHelp = helps.at(-1), lastAttempt = [...attempts.values()].at(-1);
  if (lastHelp && (!lastAttempt || lastHelp.seq > lastAttempt.seq || lastHelp.epochId !== lastAttempt.epochId)) return 'helpWithoutAnswer';
  return 'pending';
}
const axisOf = event => (event.grading === 'noStakes' ? 'noStakes' : event.evidenceClass === 'literacy' ? 'literacy' : 'independent');
const resolvedClass = outcome => (outcome === 'secondMissWorked' ? 'secondMiss' : outcome);

function footballSection(events, catalog) {
  const concepts = new Map();
  for (const entry of Object.values(catalog.football)) {
    if (!concepts.has(entry.concept)) concepts.set(entry.concept, { concept: entry.concept, name: humanize(entry.concept), questions: [] });
  }
  for (const question of groupQuestions(events.filter(event => event.game === 'football'))) {
    const head = question.events[0];
    const concept = concepts.get(head.concept);
    if (!concept) continue;
    const resolution = question.events.find(event => event.kind === 'resolution');
    concept.questions.push({
      key: question.key, axis: axisOf(head), outcome: footballOutcome(question.events),
      recordedAt: (resolution ?? question.events.at(-1)).recordedAt, familyId: head.familyId,
    });
  }
  const rows = [], absent = [], recent = [];
  for (const concept of [...concepts.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!concept.questions.length) { absent.push(concept.name); continue; }
    const counts = {};
    for (const axis of ['independent', 'literacy', 'noStakes']) counts[axis] = Object.fromEntries(FOOTBALL_COUNTS.map(name => [name, 0]));
    for (const question of concept.questions) {
      counts[question.axis][question.outcome]++;
      if (SUPPORTED.includes(resolvedClass(question.outcome))) recent.push({ concept: concept.concept, name: concept.name, axis: question.axis, outcome: question.outcome, recordedAt: question.recordedAt, key: question.key });
    }
    const independent = concept.questions.filter(question => question.axis === 'independent' && RESOLVED.includes(resolvedClass(question.outcome))).sort(byTime);
    const latest = independent.slice(-RULES.recentWindow);
    rows.push({
      concept: concept.concept, name: concept.name, counts,
      independentResults: independent.length,
      status: independent.length < RULES.sparseMinimum ? 'sparse' : 'reported',
      statusLabel: independent.length < RULES.sparseMinimum ? SPARSE : null,
      latestIndependentAt: independent.at(-1)?.recordedAt ?? null,
      recentSupported: latest.filter(question => SUPPORTED.includes(resolvedClass(question.outcome))).length,
      recentWindow: latest.length,
      latestAllFirstTry: independent.length >= RULES.sparseMinimum && independent.slice(-3).every(question => question.outcome === 'firstTry'),
      onlyLiteracyOrNoStakes: independent.length === 0 && concept.questions.every(question => question.axis !== 'independent'),
    });
  }
  recent.sort(byTime).reverse();
  return { rows, absent, recent: recent.slice(0, RULES.recentSupported).map(({ key, ...item }) => item), labels: FOOTBALL_LABELS };
}

function factsSection(events, catalog) {
  const facts = Object.keys(catalog.facts).sort((a, b) => {
    const [opA, xA, yA] = a.split(':'), [opB, xB, yB] = b.split(':');
    return opA !== opB ? (opA < opB ? -1 : 1) : Number(xA) - Number(xB) || Number(yA) - Number(yB);
  });
  const perFact = new Map(facts.map(id => [id, { factId: id, questions: [] }]));
  for (const question of groupQuestions(events.filter(event => event.game === 'facts'))) {
    const fact = perFact.get(question.events[0].factId);
    if (fact) fact.questions.push(question);
  }
  const rows = [], absent = [], noEligible = [];
  for (const fact of perFact.values()) {
    const resolutions = [], left = [], pending = [];
    let helpShown = 0;
    for (const question of fact.questions) {
      const resolution = question.events.find(event => event.kind === 'resolution');
      if (question.events.some(event => event.kind === 'help')) helpShown++;
      if (resolution) resolutions.push({ ...resolution, key: question.key });
      else if (question.events.some(event => event.kind === 'leftUnfinished')) left.push(question);
      else pending.push(question);
    }
    resolutions.sort(byTime);
    const eligible = resolutions.filter(item => item.eligibleCheck);
    if (!eligible.length) noEligible.push(factEquation(fact.factId));
    if (!fact.questions.length) { absent.push(factEquation(fact.factId)); continue; }
    const latest = resolutions.at(-1) ?? null, latestEligible = eligible.at(-1) ?? null;
    // Another try: the latest reported completion needed a retry or a shown answer, and no
    // later eligible check followed. Reported observations only; never the device's ticket.
    const anotherTry = Boolean(latest && latest.outcome !== 'first-correct');
    rows.push({
      factId: fact.factId, equation: factEquation(fact.factId), family: catalog.facts[fact.factId],
      completed: resolutions.length,
      firstTry: resolutions.filter(item => item.outcome === 'first-correct').length,
      afterRetry: resolutions.filter(item => item.outcome === 'retry').length,
      answerShown: resolutions.filter(item => item.outcome === 'shown').length,
      helpShown, leftUnfinished: left.length, pending: pending.length,
      eligibleChecks: eligible.length,
      // Timing is summarized over eligible checks only; null is "not timed", never slow.
      latestEligibleTiming: latestEligible ? (latestEligible.timingMs === null ? 'not timed' : `${(latestEligible.timingMs / 1000).toFixed(1)} s entry`) : null,
      eligibleTimed: eligible.filter(item => item.timingMs !== null).length,
      eligibleNotTimed: eligible.filter(item => item.timingMs === null).length,
      latestOutcome: latest?.outcome ?? null,
      latestAt: latest?.recordedAt ?? null,
      anotherTry,
      anotherTryLabel: anotherTry ? 'Another try due, from the reported checks' : null,
      // The sparse minimum counts independent evidence only: reported eligible checks (an
      // unsupported first-try completion the game counted as a check). Completions after a
      // retry or a shown answer stay counted above, but never satisfy this minimum.
      status: eligible.length < RULES.sparseMinimum ? 'sparse' : 'reported',
      statusLabel: eligible.length < RULES.sparseMinimum ? SPARSE : null,
    });
  }
  return {
    caveat: TIMING_CAVEAT, sharedDeviceNote: SHARED_DEVICE_NOTE, rows, absent, noEligibleCheck: noEligible,
    totals: { eligibleChecks: rows.reduce((sum, row) => sum + row.eligibleChecks, 0), completed: rows.reduce((sum, row) => sum + row.completed, 0) },
  };
}

// Deterministic suggestions: the same reported events always give the same list.
//  1. Practice: facts whose latest reported completion needed a retry or help, and Football
//     concepts with supported outcomes among their latest independent results. Newest first.
//  2. Easy review (only when available): facts with 2+ eligible checks whose latest result
//     was first-try, and concepts whose latest three independent results were first-try,
//     last seen at least RULES.reviewAgeDays before the range end. Oldest first.
// At most RULES.reviewLimit review items; RULES.suggestionLimit items in total.
export function suggestions(facts, football, rangeEnd) {
  const reviewBefore = new Date(rangeEnd.getTime() - RULES.reviewAgeDays * DAY_MS).toISOString();
  const practice = [], review = [];
  for (const row of facts.rows) {
    if (row.anotherTry) {
      practice.push({ key: `facts:${row.factId}`, recordedAt: row.latestAt, item: row.equation, place: 'Number facts', kind: 'practice',
        reason: row.latestOutcome === 'shown' ? 'The latest reported completion used a shown answer.' : 'The latest reported completion needed another try.' });
    } else if (row.eligibleChecks >= 2 && row.latestOutcome === 'first-correct' && row.latestAt <= reviewBefore) {
      review.push({ key: `facts:${row.factId}`, recordedAt: row.latestAt, item: row.equation, place: 'Number facts', kind: 'review',
        reason: 'Correct on reported eligible checks, last reported over a week ago.' });
    }
  }
  for (const row of football.rows) {
    if (row.recentSupported > 0) {
      practice.push({ key: `football:${row.concept}`, recordedAt: row.latestIndependentAt, item: row.name, place: 'a Football game', kind: 'practice',
        reason: `${row.recentSupported} of the latest ${row.recentWindow} reported work-it-out questions needed help or a second try.` });
    } else if (row.latestAllFirstTry && row.latestIndependentAt <= reviewBefore) {
      review.push({ key: `football:${row.concept}`, recordedAt: row.latestIndependentAt, item: row.name, place: 'a Football game', kind: 'review',
        reason: 'The latest reported work-it-out questions were correct on the first try without help, last reported over a week ago.' });
    }
  }
  practice.sort((a, b) => byTime(b, a));
  review.sort(byTime);
  const chosenReview = review.slice(0, RULES.reviewLimit);
  const chosen = [...practice.slice(0, RULES.suggestionLimit - chosenReview.length), ...chosenReview];
  return chosen.map(({ key, recordedAt, ...item }) => item);
}

// `events` are parsed payloads of this profile within [from, to) with their deviceId.
// The range is the inclusive day span [from, to].
export function buildReport({ profile, devices, events, from, to, truncated, catalog, retentionDays, timeZone, now }) {
  const rangeEnd = new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY_MS);
  const facts = factsSection(events, catalog);
  const football = footballSection(events, catalog);
  const lastSyncAt = devices.reduce((latest, device) => (device.lastSyncAt && (!latest || device.lastSyncAt > latest) ? device.lastSyncAt : latest), null);
  return {
    generatedAt: new Date(now).toISOString(),
    profile: { profileId: profile.profileId, label: profile.label },
    range: { from, to, timeZone, note: 'Dates use each device’s clock.' },
    coverage: {
      devices: devices.map(device => ({ deviceId: device.deviceId, name: device.name, lastSyncAt: device.lastSyncAt, revoked: device.revokedAt !== null, shared: device.shared })),
      lastSyncAt, retentionDays, exclusions: COVERAGE_EXCLUSIONS, truncated: Boolean(truncated),
      undetectable: 'Practice after a device’s last received event, and practice on devices that never sent anything, cannot be detected.',
    },
    rules: { ...RULES },
    facts,
    football,
    suggestions: suggestions(facts, football, rangeEnd),
    suggestionNote: SUGGESTION_NOTE,
    absentLabel: ABSENT,
  };
}
