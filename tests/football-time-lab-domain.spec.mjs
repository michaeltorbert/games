import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../football/time-lab.js', import.meta.url), 'utf8');

function loadTimeLab() {
  const context = vm.createContext({});
  Object.defineProperty(context, 'Date', { get() { throw new Error('Time Lab touched Date'); } });
  Object.defineProperty(context, 'Intl', { get() { throw new Error('Time Lab touched Intl'); } });
  Object.defineProperty(context, 'localStorage', { get() { throw new Error('Time Lab touched storage'); } });
  vm.runInContext(source, context, { filename: 'time-lab.js' });
  return context.FOOTBALL_TIME_LAB;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.values(value).every(child => deepFrozen(child, seen));
}

function current(session) {
  return session.slots[session.index];
}

function wrongChoice(slot, offset = 0) {
  return slot.question.choices.filter(choice => choice.id !== slot.question.correctChoiceId)[offset];
}

function resolveCorrect(lab, session) {
  const slot = current(session);
  const answered = lab.answerSession(
    session,
    slot.question.questionInstanceId,
    slot.question.correctChoiceId,
    slot.attempt,
  );
  return lab.nextSession(answered, slot.question.questionInstanceId);
}

function answerCorrect(lab, session) {
  const slot = current(session);
  return lab.answerSession(
    session,
    slot.question.questionInstanceId,
    slot.question.correctChoiceId,
    slot.attempt,
  );
}

function answerWrong(lab, session, offset = 0) {
  const slot = current(session);
  return lab.answerSession(
    session,
    slot.question.questionInstanceId,
    wrongChoice(slot, offset).id,
    slot.attempt,
  );
}

function reachScheduledCalendarSlot(lab, sessionId) {
  let session = lab.createSession('calendar', { sessionId, rootSeed: 92 });
  const original = current(session);
  session = answerWrong(lab, session);
  const scheduledIndex = session.slots.findIndex((slot, index) => (
    index > session.index && slot.supportReason === 'related-miss'
  ));
  assert.ok(scheduledIndex > session.index);
  const scheduledQuestionId = session.slots[scheduledIndex].question.questionInstanceId;
  session = answerCorrect(lab, session);
  assert.equal(current(session).resolution, 'retryCorrect');
  assert.equal(session.slots[scheduledIndex].supportReason, 'related-miss');
  assert.equal(session.slots[scheduledIndex].question.questionInstanceId, scheduledQuestionId);
  session = lab.nextSession(session, original.question.questionInstanceId);
  while (session.index < scheduledIndex) session = resolveCorrect(lab, session);
  assert.equal(current(session).supportReason, 'related-miss');
  assert.equal(current(session).supportLevel, 'heightened');
  return session;
}

test('registers exactly eight frozen curriculum families with the approved evidence map', () => {
  const lab = loadTimeLab();
  const expected = [
    ['time-read-whole-hour', 164, 'literacy', 'source-visible'],
    ['time-read-half-hour', 164, 'literacy', 'source-visible'],
    ['time-match-analog-digital', 167, 'literacy', 'source-visible'],
    ['time-one-hour-later', 164, 'independent', 'modeled-with-result-hidden'],
    ['time-half-hour-later', 164, 'independent', 'modeled-with-result-hidden'],
    ['time-am-or-pm', 172, 'independent', 'modeled-with-result-hidden'],
    ['calendar-find-date-day', 175, 'literacy', 'source-visible'],
    ['calendar-month-neighbor', 175, 'independent', 'modeled-with-result-hidden'],
  ];
  assert.deepEqual(
    plain(lab.FAMILY_REGISTRY.map(meta => [meta.familyId, meta.introducedOnPage, meta.evidenceClass, meta.answerExposure])),
    expected,
  );
  assert.equal(deepFrozen(lab.FAMILY_REGISTRY), true);
  assert.equal(lab.COMPLETED_THROUGH_PAGE, 145);
  assert.equal(lab.INCLUDED_THROUGH_PAGE, 179);
});

test('builds every family as a recursively frozen question with stable unique choices', () => {
  const lab = loadTimeLab();
  for (const [index, meta] of lab.FAMILY_REGISTRY.entries()) {
    const streams = lab.createRngStreams(100 + index);
    const question = lab.buildQuestion(meta.familyId, {
      instanceId: `contract-question-${index + 1}`,
      contentRng: streams.content,
      presentationRng: streams.presentation,
    });
    assert.equal(deepFrozen(question), true, meta.familyId);
    assert.equal(question.familyId, meta.familyId);
    assert.equal(new Set(question.choices.map(choice => choice.id)).size, question.choices.length);
    assert.equal(new Set(question.choices.map(choice => choice.label)).size, question.choices.length);
    assert.equal(question.choices.filter(choice => choice.id === question.correctChoiceId).length, 1);
    if (meta.evidenceClass === 'independent') {
      for (const stage of ['initial', 'guided']) {
        assert.equal(question.visuals[stage].revealsAnswer, false, `${meta.familyId} ${stage}`);
        assert.equal(question.visuals[stage].result, null, `${meta.familyId} ${stage}`);
      }
    }
    assert.equal(question.visuals.worked.revealsAnswer, true);
    assert.deepEqual(question.visuals.worked.result.value, question.answer.value);
  }
});

test('covers all twelve whole and half-hour positions and wraps elapsed time across 12', () => {
  const lab = loadTimeLab();
  for (let hour = 1; hour <= 12; hour++) {
    const whole = lab.buildQuestion('time-read-whole-hour', { instanceId: `whole-${hour}`, fact: { hour, minute: 0 } });
    const half = lab.buildQuestion('time-read-half-hour', { instanceId: `half-${hour}`, fact: { hour, minute: 30 } });
    assert.equal(whole.answer.value, `${hour}:00`);
    assert.equal(half.answer.value, `${hour}:30`);
  }
  assert.deepEqual(plain(lab.addClockMinutes({ hour: 11, minute: 30 }, 60)), { hour: 12, minute: 30 });
  assert.deepEqual(plain(lab.addClockMinutes({ hour: 12, minute: 30 }, 60)), { hour: 1, minute: 30 });
  assert.deepEqual(plain(lab.addClockMinutes({ hour: 11, minute: 30 }, 30)), { hour: 12, minute: 0 });
  assert.deepEqual(plain(lab.addClockMinutes({ hour: 12, minute: 30 }, 30)), { hour: 1, minute: 0 });
  assert.equal(lab.buildQuestion('time-one-hour-later', {
    instanceId: 'one-hour-wrap', fact: { hour: 12, minute: 30 },
  }).answer.value, '1:30');
  assert.equal(lab.buildQuestion('time-half-hour-later', {
    instanceId: 'half-hour-wrap', fact: { hour: 11, minute: 30 },
  }).answer.value, '12:00');
});

test('validates Gregorian fixtures, leap centuries, all weekday starts, and year boundaries without Date or Intl', () => {
  const lab = loadTimeLab();
  assert.equal(lab.daysInMonth(2024, 1), 29);
  assert.equal(lab.daysInMonth(2025, 1), 28);
  assert.equal(lab.daysInMonth(1900, 1), 28);
  assert.equal(lab.daysInMonth(2000, 1), 29);
  assert.equal(lab.daysInMonth(2100, 1), 28);
  assert.deepEqual(new Set(lab.CALENDAR_FIXTURES.map(fixture => fixture.firstWeekday)), new Set([0, 1, 2, 3, 4, 5, 6]));
  for (const fixture of lab.CALENDAR_FIXTURES) {
    assert.equal(lab.calendarGrid(fixture).filter(Number.isInteger).length, fixture.monthLength);
    assert.equal(lab.weekdayForDate(fixture.year, fixture.monthIndex, 1), fixture.firstWeekday);
  }
  const calendarQuestion = lab.buildQuestion('calendar-find-date-day', {
    instanceId: 'calendar-visual-contract', fixture: lab.CALENDAR_FIXTURES[0], targetDate: 15,
  });
  assert.deepEqual(plain(calendarQuestion.visuals.initial.data.weekdayNames), plain(lab.WEEKDAY_NAMES));
  assert.throws(() => lab.validateCalendarFixture({
    id: 'bad-february', year: 2025, monthIndex: 1, monthLength: 29, firstWeekday: 6,
  }), /length or weekday alignment/);
  const december = lab.buildQuestion('calendar-month-neighbor', {
    instanceId: 'december-next', sourceMonthIndex: 11, direction: 'after',
  });
  const january = lab.buildQuestion('calendar-month-neighbor', {
    instanceId: 'january-before', sourceMonthIndex: 0, direction: 'before',
  });
  assert.equal(december.answer.value, 'January');
  assert.equal(january.answer.value, 'December');
});

test('keeps AM/PM situations inferential, choices neutral, and audit rationale private', () => {
  const lab = loadTimeLab();
  for (const fixture of lab.AM_PM_FIXTURES) {
    assert.ok(fixture.unambiguityRationale.length > 0);
    assert.equal(/\b(?:am|pm|morning|afternoon|evening|night)\b/iu.test(fixture.situation), false);
    const question = lab.buildQuestion('time-am-or-pm', {
      instanceId: `ampm-${fixture.id}`,
      fixture,
    });
    assert.equal(question.answer.value, fixture.period);
    assert.deepEqual(plain(question.choices.map(choice => choice.label).sort()), ['AM', 'PM']);
    assert.equal(question.visuals.initial.result, null);
    assert.equal(question.visuals.guided.result, null);
    assert.equal(question.visuals.initial.data.targetPeriod, null);
    assert.equal(question.visuals.guided.data.targetPeriod, null);
    assert.equal('scene' in question.visuals.initial.data, false);
    const learnerFacing = JSON.stringify({
      prompt: question.prompt,
      initial: question.visuals.initial,
      guided: question.visuals.guided,
      guidance: question.guidance,
      workedExplanation: question.workedExplanation,
    });
    assert.equal(learnerFacing.includes(fixture.unambiguityRationale), false);
  }
  assert.throws(() => lab.validateAmPmFixture({
    id: 'ambiguous', hour: 7, minute: 0, period: 'PM', illustrationCue: 'after-dinner', situation: 'It is 7:00.',
  }), /rationale/);
});

test('builds deterministic two-stream sessions whose presentation cannot perturb content', () => {
  const lab = loadTimeLab();
  const contentA = lab.createRngStreams(77).content;
  const contentB = lab.createRngStreams(77).content;
  const presentationA = lab.createRngStreams(10).presentation;
  const presentationB = lab.createRngStreams(999).presentation;
  const first = lab.createSession('mixed', {
    sessionId: 'two-stream-first', contentRng: contentA, presentationRng: presentationA,
  });
  const second = lab.createSession('mixed', {
    sessionId: 'two-stream-second', contentRng: contentB, presentationRng: presentationB,
  });
  assert.deepEqual(
    plain(first.slots.map(slot => [slot.familyId, slot.question.facts])),
    plain(second.slots.map(slot => [slot.familyId, slot.question.facts])),
  );
  assert.equal(deepFrozen(first), true);
});

test('creates exactly eight coverage-first questions in Clocks, Calendar, and Mixed', () => {
  const lab = loadTimeLab();
  const allFamilies = new Set(lab.FAMILY_REGISTRY.map(meta => meta.familyId));
  const clockFamilies = new Set(lab.FAMILY_REGISTRY.filter(meta => meta.group === 'clocks').map(meta => meta.familyId));
  const calendarFamilies = new Set(lab.FAMILY_REGISTRY.filter(meta => meta.group === 'calendar').map(meta => meta.familyId));
  for (const mode of lab.MODES) {
    const session = lab.createSession(mode, { sessionId: `coverage-${mode}`, rootSeed: 45 });
    assert.equal(session.total, 8);
    assert.equal(session.slots.length, 8);
    const families = new Set(session.slots.map(slot => slot.familyId));
    if (mode === 'mixed') assert.deepEqual(families, allFamilies);
    if (mode === 'clocks') assert.deepEqual(new Set(session.slots.slice(0, 6).map(slot => slot.familyId)), clockFamilies);
    if (mode === 'calendar') assert.deepEqual(new Set(session.slots.slice(0, 2).map(slot => slot.familyId)), calendarFamilies);
  }
});

test('bounds scheduled recurrence without displacing Clocks or Mixed coverage', () => {
  const lab = loadTimeLab();
  let clocks = lab.createSession('clocks', { sessionId: 'clock-recurrence', rootSeed: 91 });
  const originalClockFamilies = clocks.slots.map(slot => slot.familyId);
  const firstClock = current(clocks);
  clocks = answerWrong(lab, clocks);
  assert.equal(clocks.slots.length, 8);
  assert.deepEqual(clocks.slots.slice(0, 6).map(slot => slot.familyId), originalClockFamilies.slice(0, 6));
  const recurrenceIndex = clocks.slots.findIndex(slot => slot.recurrenceOf === firstClock.familyId);
  assert.ok(recurrenceIndex >= 6);
  assert.equal(clocks.slots[recurrenceIndex].supportLevel, 'heightened');
  assert.equal(clocks.slots[recurrenceIndex].supportReason, 'related-miss');
  const recurrenceQuestionId = clocks.slots[recurrenceIndex].question.questionInstanceId;

  clocks = answerCorrect(lab, clocks);
  assert.equal(clocks.tallies.supported, 1);
  assert.equal(clocks.slots[recurrenceIndex].supportReason, 'related-miss');
  clocks = lab.nextSession(clocks, firstClock.question.questionInstanceId);
  while (clocks.index < recurrenceIndex) clocks = resolveCorrect(lab, clocks);
  clocks = answerCorrect(lab, clocks);
  assert.equal(clocks.tallies.supported, 2);
  assert.equal(current(clocks).recurrenceOf, firstClock.familyId);
  assert.equal(current(clocks).question.questionInstanceId, recurrenceQuestionId);

  let mixed = lab.createSession('mixed', { sessionId: 'mixed-support', rootSeed: 92 });
  const originalFamilies = mixed.slots.map(slot => slot.familyId);
  mixed = answerWrong(lab, mixed);
  assert.deepEqual(mixed.slots.map(slot => slot.familyId), originalFamilies);
  assert.equal(mixed.slots.length, 8);
});

test('an original retry keeps its bounded scheduled revisit and counts one extra-support question', () => {
  const lab = loadTimeLab();
  let session = lab.createSession('calendar', { sessionId: 'original-retry', rootSeed: 92 });
  session = answerWrong(lab, session);
  const scheduled = session.slots.find(slot => slot.supportReason === 'related-miss');
  assert.ok(scheduled);
  const scheduledQuestionId = scheduled.question.questionInstanceId;
  session = answerCorrect(lab, session);
  assert.equal(current(session).resolution, 'retryCorrect');
  assert.equal(session.tallies.supported, 1);
  assert.equal(scheduled.supportReason, 'related-miss');
  const preserved = session.slots.find(slot => slot.question.questionInstanceId === scheduledQuestionId);
  assert.equal(preserved.supportLevel, 'heightened');
  assert.equal(preserved.supportReason, 'related-miss');
});

test('first-try success on scheduled support counts once and clears only later pending support', () => {
  const lab = loadTimeLab();
  let session = reachScheduledCalendarSlot(lab, 'scheduled-first-try');
  const scheduled = current(session);
  const laterIndex = session.slots.findIndex((slot, index) => (
    index > session.index && slot.concept === scheduled.concept && slot.status === 'pending'
  ));
  assert.ok(laterIndex > session.index);
  const seeded = plain(session);
  seeded.slots[laterIndex].supportLevel = 'heightened';
  seeded.slots[laterIndex].supportReason = 'related-miss';
  const laterQuestion = plain(seeded.slots[laterIndex].question);
  const laterRecurrenceOf = seeded.slots[laterIndex].recurrenceOf;
  const supportedBefore = seeded.tallies.supported;

  session = answerCorrect(lab, seeded);

  assert.equal(current(session).resolution, 'firstTryCorrect');
  assert.equal(session.tallies.supported, supportedBefore + 1);
  assert.equal(current(session).supportReason, 'related-miss');
  assert.equal(session.slots[laterIndex].supportLevel, 'baseline');
  assert.equal(session.slots[laterIndex].supportReason, null);
  assert.equal(session.slots[laterIndex].recurrenceOf, laterRecurrenceOf);
  assert.deepEqual(plain(session.slots[laterIndex].question), laterQuestion);
});

test('retry success on scheduled support preserves its origin, counts once, and clears later pending support', () => {
  const lab = loadTimeLab();
  let session = reachScheduledCalendarSlot(lab, 'scheduled-retry');
  const supportedBefore = session.tallies.supported;
  const evidenceTally = current(session).question.evidenceClass === 'literacy' ? 'read' : 'solved';
  const evidenceBefore = session.tallies[evidenceTally];

  session = answerWrong(lab, session);
  assert.equal(current(session).supportLevel, 'retry');
  assert.equal(current(session).supportReason, 'related-miss');
  const laterIndex = session.slots.findIndex((slot, index) => (
    index > session.index
    && slot.concept === current(session).concept
    && slot.supportReason === 'related-miss'
  ));
  assert.ok(laterIndex > session.index);

  session = answerCorrect(lab, session);

  assert.equal(current(session).resolution, 'retryCorrect');
  assert.equal(current(session).supportReason, 'related-miss');
  assert.equal(session.tallies.supported, supportedBefore + 1);
  assert.equal(session.tallies[evidenceTally], evidenceBefore + 1);
  assert.equal(session.slots[laterIndex].supportLevel, 'baseline');
  assert.equal(session.slots[laterIndex].supportReason, null);
});

test('a scheduled second miss counts support once, claims no read or solve, and keeps later support', () => {
  const lab = loadTimeLab();
  let session = reachScheduledCalendarSlot(lab, 'scheduled-second-miss');
  const supportedBefore = session.tallies.supported;
  const readBefore = session.tallies.read;
  const solvedBefore = session.tallies.solved;

  session = answerWrong(lab, session);
  const laterIndex = session.slots.findIndex((slot, index) => (
    index > session.index
    && slot.concept === current(session).concept
    && slot.supportReason === 'related-miss'
  ));
  assert.ok(laterIndex > session.index);
  session = answerWrong(lab, session);

  assert.equal(current(session).resolution, 'secondMiss');
  assert.equal(current(session).supportReason, 'related-miss');
  assert.equal(session.tallies.supported, supportedBefore + 1);
  assert.equal(session.tallies.read, readBefore);
  assert.equal(session.tallies.solved, solvedBefore);
  assert.equal(session.slots[laterIndex].supportLevel, 'heightened');
  assert.equal(session.slots[laterIndex].supportReason, 'related-miss');
});

test('session transitions are stable-id exact-once no-ops for repeated and stale input', () => {
  const lab = loadTimeLab();
  let session = lab.createSession('mixed', { sessionId: 'exact-once', rootSeed: 123 });
  const first = current(session);
  assert.strictEqual(lab.answerSession(session, 'stale-question', first.question.correctChoiceId, first.attempt), session);
  session = lab.answerSession(session, first.question.questionInstanceId, first.question.correctChoiceId, first.attempt);
  assert.equal(session.tallies.firstTryCorrect, 1);
  assert.strictEqual(
    lab.answerSession(session, first.question.questionInstanceId, first.question.correctChoiceId, first.attempt),
    session,
  );
  const advanced = lab.nextSession(session, first.question.questionInstanceId);
  assert.equal(advanced.index, 1);
  assert.strictEqual(lab.nextSession(advanced, first.question.questionInstanceId), advanced);

  let worked = advanced;
  const second = current(worked);
  const missedChoiceId = wrongChoice(second, 0).id;
  worked = lab.answerSession(worked, second.question.questionInstanceId, missedChoiceId, second.attempt);
  const retry = current(worked);
  assert.strictEqual(
    lab.answerSession(worked, retry.question.questionInstanceId, missedChoiceId, second.attempt),
    worked,
  );
  worked = lab.answerSession(worked, retry.question.questionInstanceId, missedChoiceId, retry.attempt);
  assert.equal(current(worked).status, 'worked');
  assert.equal(worked.tallies.secondMiss, 1);
  assert.strictEqual(
    lab.answerSession(worked, retry.question.questionInstanceId, retry.question.correctChoiceId, retry.attempt),
    worked,
  );
});

test('recap distinguishes facts read from problems solved and Done/Back are exact once', () => {
  const lab = loadTimeLab();
  let session = lab.createSession('mixed', { sessionId: 'recap-session', rootSeed: 8 });
  while (session.status === 'active') session = resolveCorrect(lab, session);
  assert.equal(session.status, 'recap');
  assert.deepEqual(plain(session.tallies), {
    read: 4,
    solved: 4,
    supported: 0,
    firstTryCorrect: 8,
    retryCorrect: 0,
    secondMiss: 0,
  });
  assert.deepEqual(plain(lab.publicSnapshot(session).recap), { read: 4, solved: 4, supported: 0 });
  const done = lab.doneSession(session);
  assert.equal(done.status, 'done');
  assert.strictEqual(lab.doneSession(done), done);
  const exited = lab.exitSession(lab.createSession('calendar', { sessionId: 'exit-session', rootSeed: 5 }));
  assert.equal(exited.status, 'exited');
  assert.strictEqual(lab.exitSession(exited), exited);
});

test('worked outcomes count as support without claiming literacy read or independent solved', () => {
  const lab = loadTimeLab();
  let session = lab.createSession('mixed', { sessionId: 'worked-recap-session', rootSeed: 16 });
  let workedLiteracy = false;
  let workedIndependent = false;
  while (session.status === 'active') {
    const slot = current(session);
    const needsWorked = slot.question.evidenceClass === 'literacy' ? !workedLiteracy : !workedIndependent;
    if (!needsWorked) {
      session = resolveCorrect(lab, session);
      continue;
    }
    const missedChoiceId = wrongChoice(slot).id;
    session = lab.answerSession(
      session,
      slot.question.questionInstanceId,
      missedChoiceId,
      slot.attempt,
    );
    const retry = current(session);
    session = lab.answerSession(
      session,
      retry.question.questionInstanceId,
      missedChoiceId,
      retry.attempt,
    );
    assert.equal(current(session).status, 'worked');
    if (slot.question.evidenceClass === 'literacy') workedLiteracy = true;
    else workedIndependent = true;
    session = lab.nextSession(session, slot.question.questionInstanceId);
  }
  assert.equal(workedLiteracy, true);
  assert.equal(workedIndependent, true);
  assert.deepEqual(plain(session.tallies), {
    read: 3,
    solved: 3,
    supported: 3,
    firstTryCorrect: 6,
    retryCorrect: 0,
    secondMiss: 2,
  });
  assert.deepEqual(plain(lab.publicSnapshot(session).recap), { read: 3, solved: 3, supported: 3 });
});

test('domain source has no live-game or persistence authority references', () => {
  for (const forbidden of [
    'localStorage.', 'sessionStorage.', 'FOOTBALL_DOMAIN', 'FOOTBALL_OPPONENT', 'FOOTBALL_LEARNING',
    'FOOTBALL_STATS', 'FOOTBALL_SEASON', 'state.questionInstance', 'state.pendingResolution', 'startGame(',
    'createGameState(',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
