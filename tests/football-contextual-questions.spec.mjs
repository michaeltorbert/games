import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const domainSource = await readFile(new URL('../football/football-domain.js', import.meta.url), 'utf8');
const questionsSource = await readFile(new URL('../football/contextual-questions.js', import.meta.url), 'utf8');

function loadModules() {
  const context = vm.createContext({});
  vm.runInContext(domainSource, context, { filename: 'football-domain.js' });
  vm.runInContext(questionsSource, context, { filename: 'contextual-questions.js' });
  return {
    domain: context.FOOTBALL_DOMAIN,
    questions: context.FOOTBALL_CONTEXTUAL_QUESTIONS,
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.values(value).every((child) => deepFrozen(child, seen));
}

function context(overrides = {}) {
  const direction = overrides.direction ?? (overrides.possession === 'defense' ? -1 : 1);
  const possession = overrides.possession ?? (direction === -1 ? 'defense' : 'offense');
  const yardLine = overrides.yardLine ?? (direction === 1 ? 30 : 70);
  const yardsToGo = overrides.yardsToGo ?? 10;
  const driveStart = overrides.driveStart ?? (direction === 1 ? Math.max(0, yardLine - 5) : Math.min(100, yardLine + 5));
  const calls = overrides.calls ?? {
    offense: possession === 'offense' ? 'shortRun' : 'shortPass',
    defense: possession === 'defense' ? 'run' : null,
    matchup: possession === 'defense' ? 'matched' : null,
  };
  return {
    contextId: overrides.contextId ?? 41,
    possession,
    direction,
    quarter: overrides.quarter ?? 2,
    down: overrides.down ?? 2,
    yardsToGo,
    yardLine,
    firstDownLine: overrides.firstDownLine ?? yardLine + (direction * yardsToGo),
    driveStart,
    scores: overrides.scores ?? { player: 3, opponent: 4 },
    totalYards: overrides.totalYards ?? { player: 83, opponent: 71 },
    plays: overrides.plays ?? 6,
    drivePlays: overrides.drivePlays ?? 2,
    calls,
    privateOpponentSnapshot: overrides.privateOpponentSnapshot ?? (possession === 'defense' ? {
      profileKey: 'test',
      look: { key: 'balanced', label: 'Balanced set', alignment: 'Singleback', leanKeys: ['balanced'] },
      lean: { key: 'balanced', label: 'Run or pass', runWeight: 0.5, passWeight: 0.5 },
      weights: { shortRun: 0.2, shortPass: 0.2, longRun: 0.2, mediumPass: 0.2, longPass: 0.2 },
      plannedCallKey: calls.offense,
      tendency: { profileKey: 'test' },
    } : null),
  };
}

function makeSnap(domain, overrides = {}, gain = 4) {
  return domain.createSnap(context(overrides), {
    gain,
    callKey: overrides.possession === 'defense' ? 'shortPass' : 'shortRun',
    label: 'Test call',
  });
}

function pointer(root, path) {
  return path.slice(1).split('/').reduce((value, token) => value[token.replace(/~1/g, '/').replace(/~0/g, '~')], root);
}

function bindingValues(question) {
  return Object.fromEntries(question.bindings.map((binding) => [binding.id, binding.value]));
}

function recompute(question) {
  const values = bindingValues(question);
  const operands = question.operation.operandIds.map((id) => values[id]);
  switch (question.operation.type) {
    case 'read': return operands[0];
    case 'ordinal': return ({ 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' })[operands[0]];
    case 'nextOrdinal': {
      const value = operands[0] + 1;
      const suffix = value === 1 ? 'st' : value === 2 ? 'nd' : value === 3 ? 'rd' : 'th';
      return `${value}${suffix}`;
    }
    case 'missingPart':
    case 'exactRemainder':
    case 'factFamilyMissingPart': return operands[0] - operands[1];
    case 'surplus': return operands[0] - operands[1];
    case 'distance': return Math.abs(operands[0] - operands[1]);
    case 'tensOfDistance': return Math.floor(Math.abs(operands[0] - operands[1]) / 10);
    case 'onesOfDistance': return Math.abs(operands[0] - operands[1]) % 10;
    case 'absoluteDifference': return Math.abs(operands[0] - operands[1]);
    case 'add': return operands[0] + operands[1];
    case 'compare': return operands[0] < operands[1] ? '<' : operands[0] > operands[1] ? '>' : '=';
    case 'goalDistanceAfterGain': return Math.abs(operands[0] - operands[1]) - operands[2];
    case 'driveDistancePlusGain': return Math.abs(operands[1] - operands[0]) + operands[2];
    case 'ruleValue': return operands[0];
    default: throw new Error(`Unknown operation ${question.operation.type}`);
  }
}

function verifyGrounding(questions, snap, question) {
  assert.equal(question.id, question.familyId);
  assert.equal(question.bindings, question.premises, 'premises must alias canonical bindings');
  assert.ok(questions.OPERATION_TYPES.includes(question.operation.type));
  assert.ok(questions.ANSWER_EXPOSURE_POLICIES.includes(question.answerExposure));

  for (const binding of question.bindings) {
    if (binding.source.kind === 'context') {
      assert.equal(binding.source.path.startsWith('/context/privateOpponentSnapshot'), false);
      assert.deepEqual(plain(binding.value), plain(pointer(snap, binding.source.path)), `${question.familyId}:${binding.id}`);
    } else {
      assert.equal(binding.source.kind, 'rule');
      assert.ok(Object.hasOwn(questions.RULES, binding.source.ruleId));
      assert.deepEqual(plain(binding.value), plain(questions.RULES[binding.source.ruleId]));
    }
  }

  assert.deepEqual(recompute(question), question.answer.value, question.familyId);
  assert.equal(question.result.id, question.answer.id);
  assert.deepEqual(question.result.value, question.answer.value);
  assert.equal(question.operation.outputId, question.answer.id);
  assert.equal(new Set(question.operation.operandIds).size, question.operation.operandIds.length);
  assert.ok(question.operation.operandIds.every((id) => question.grounding.bindingIds.includes(id)));

  const correct = question.choices.filter((choice) => choice.id === question.correctChoiceId);
  assert.equal(correct.length, 1, `${question.familyId}: one correct choice ID`);
  assert.deepEqual(correct[0].value, question.answer.value, `${question.familyId}: correct choice value`);
  assert.equal(new Set(question.choices.map((choice) => choice.id)).size, question.choices.length);
  assert.equal(new Set(question.choices.map((choice) => `${typeof choice.value}:${String(choice.value)}`)).size, question.choices.length);

  for (const copy of [question.prompt, question.hint, question.workedExplanation]) {
    assert.equal(copy.answerId, question.answer.id);
    assert.deepEqual(plain(copy.bindingIds), plain(question.grounding.bindingIds));
    assert.ok(copy.text.length > 0);
    assert.ok(copy.ariaLabel.length > 0);
  }
  for (const stage of ['initial', 'guided', 'worked']) {
    const visual = question.visuals[stage];
    assert.equal(visual.stage, stage);
    assert.equal(visual.answerId, question.answer.id);
    assert.deepEqual(plain(visual.bindingIds), plain(question.grounding.bindingIds));
    assert.ok(visual.ariaLabel.length > 0);
  }
  assert.equal(question.visuals.worked.revealsAnswer, true);
  assert.deepEqual(question.visuals.worked.result.value, question.answer.value);
  if (question.answerExposure !== 'source-visible') {
    for (const stage of ['initial', 'guided']) {
      assert.equal(question.visuals[stage].revealsAnswer, false, `${question.familyId}:${stage}`);
      assert.equal(question.visuals[stage].result, null, `${question.familyId}:${stage}`);
    }
  }
}

function expectComparisonChoiceLabels(question) {
  const labels = Object.fromEntries(question.choices.map((choice) => [choice.value, choice.ariaLabel]));
  assert.deepEqual(labels, {
    '<': 'less than',
    '=': 'equal to',
    '>': 'greater than',
  });
}

test('exports one deeply frozen plain-global API with a closed contract', () => {
  const { questions } = loadModules();
  assert.ok(questions);
  assert.equal(questions.CURRENT_COMPLETED_PAGE, 145);
  assert.equal(questions.INCLUDED_THROUGH_PAGE, 179);
  assert.equal(deepFrozen(questions), true);
  assert.deepEqual(plain(questions.DEFAULT_PROFILE), {
    completedThroughPage: 145,
    includedThroughPage: 179,
    computationMax: 10,
    displayMax: 120,
  });
  assert.equal(typeof questions.inspect, 'function');
  assert.equal(typeof questions.build, 'function');
  assert.ok(questions.OPERATION_TYPES.length > 0);
  assert.ok(questions.ANSWER_EXPOSURE_POLICIES.includes('hidden-until-worked'));
  assert.deepEqual(plain(questions.CURRICULUM_SOURCES), ['workbook', 'football-only']);
});

test('inspect preserves page-145 completion while capping approved question content at page 179', () => {
  const { domain, questions } = loadModules();
  const snap = makeSnap(domain, { driveStart: 27 }, 4);
  const first = questions.inspect(snap, { completedThroughPage: 999, includedThroughPage: 999, computationMax: 99, displayMax: 999 });
  const second = questions.inspect(snap, { completedThroughPage: 999, includedThroughPage: 999, computationMax: 99, displayMax: 999 });
  assert.deepEqual(plain(first), plain(second));
  assert.equal(deepFrozen(first), true);
  assert.deepEqual(plain(first.profile), { completedThroughPage: 145, includedThroughPage: 179, computationMax: 10, displayMax: 120 });
  assert.ok(first.eligible.length > 0);
  assert.ok(first.declined.length > 0);
  assert.equal(new Set(first.eligible.map((candidate) => candidate.familyId)).size, first.eligible.length);
  for (const candidate of first.eligible) {
    assert.equal(candidate.id, candidate.familyId);
    assert.equal(candidate.grading, 'gate');
    assert.ok(candidate.skill && candidate.concept && candidate.purpose && candidate.tier);
    assert.ok(candidate.weight > 0);
    assert.ok(questions.CURRICULUM_SOURCES.includes(candidate.curriculumSource));
    if (candidate.curriculumSource === 'workbook') {
      assert.ok(Number.isInteger(candidate.introducedOnPage));
      assert.ok(candidate.introducedOnPage >= 1 && candidate.introducedOnPage <= 179);
    } else {
      assert.equal(candidate.introducedOnPage, null);
    }
    assert.ok(questions.OPERATION_TYPES.includes(candidate.operationType));
    assert.ok(questions.ANSWER_EXPOSURE_POLICIES.includes(candidate.answerExposure));
  }
  for (const diagnostic of first.declined) {
    assert.ok(diagnostic.familyId);
    assert.ok(diagnostic.reason.code);
    assert.ok(diagnostic.reason.detail);
  }
});

test('every inspected candidate builds, dereferences, and recomputes across both directions and legal boundaries', () => {
  const { domain, questions } = loadModules();
  let built = 0;
  for (const direction of [1, -1]) {
    for (const down of [1, 2, 3, 4]) {
      for (let yardsToGo = 1; yardsToGo <= 10; yardsToGo++) {
        const yardLine = direction === 1 ? 40 : 60;
        const driveStart = direction === 1 ? Math.max(0, yardLine - Math.min(5, yardsToGo)) : Math.min(100, yardLine + Math.min(5, yardsToGo));
        const gains = new Set([1, yardsToGo, Math.min(10, yardsToGo + 1), 10, 20]);
        for (const gain of gains) {
          const snap = makeSnap(domain, {
            possession: direction === 1 ? 'offense' : 'defense',
            direction, down, yardsToGo, yardLine, driveStart,
            scores: { player: down, opponent: Math.max(0, 4 - down) },
          }, gain);
          const inspection = questions.inspect(snap, questions.DEFAULT_PROFILE);
          assert.ok(inspection.eligible.some((candidate) => candidate.familyId === 'yards-to-go-read'));
          for (const candidate of inspection.eligible) {
            const question = questions.build(snap, candidate.familyId, { support: 'initial', presentationRng: () => 0.37 });
            verifyGrounding(questions, snap, question);
            assert.equal(deepFrozen(question), true);
            built++;
          }
        }
      }
    }
  }
  assert.ok(built > 1000, `expected broad property coverage, built ${built}`);
});

test('short, exact, surplus, fact-family, fourth-down, and touchdown facts use the frozen old marker', () => {
  const { domain, questions } = loadModules();
  const cases = [
    [makeSnap(domain, { down: 4, yardsToGo: 10, firstDownLine: 40 }, 4), ['line-to-gain-missing-part', 'line-to-gain-fact-family']],
    [makeSnap(domain, { down: 4, yardsToGo: 10, firstDownLine: 40 }, 10), ['line-to-gain-exact']],
    [makeSnap(domain, { down: 4, yardsToGo: 4, firstDownLine: 34 }, 7), ['line-to-gain-surplus']],
    [makeSnap(domain, { yardLine: 95, firstDownLine: 100, yardsToGo: 5, driveStart: 90, down: 4 }, 20), ['line-to-gain-exact', 'touchdown-points']],
    [makeSnap(domain, { possession: 'defense', direction: -1, yardLine: 5, firstDownLine: 0, yardsToGo: 5, driveStart: 10, down: 4 }, 20), ['line-to-gain-exact', 'touchdown-points']],
  ];
  for (const [snap, expectedFamilies] of cases) {
    const ids = questions.inspect(snap, questions.DEFAULT_PROFILE).eligible.map((candidate) => candidate.familyId);
    for (const familyId of expectedFamilies) {
      assert.ok(ids.includes(familyId), `${familyId} for ${snap.context.possession}`);
      verifyGrounding(questions, snap, questions.build(snap, familyId));
    }
  }
});

test('goal distance, drive movement, place value, whole tens, committed scores, quarter, and down stay contextual', () => {
  const { domain, questions } = loadModules();
  const forward = makeSnap(domain, {
    quarter: 3, down: 4, yardLine: 30, firstDownLine: 35, yardsToGo: 5,
    driveStart: 20, scores: { player: 3, opponent: 4 },
  }, 10);
  const reverse = makeSnap(domain, {
    possession: 'defense', direction: -1, quarter: 1, down: 1,
    yardLine: 70, firstDownLine: 65, yardsToGo: 5, driveStart: 80,
    scores: { player: 7, opponent: 0 },
  }, 10);
  const required = [
    'goal-distance-read', 'goal-distance-tens', 'goal-distance-ones',
    'drive-distance-scaffolded', 'committed-score-total', 'committed-score-difference',
    'quarter-read', 'down-read', 'goal-distance-minus-whole-tens',
    'drive-distance-plus-whole-tens',
  ];
  for (const snap of [forward, reverse]) {
    const ids = questions.inspect(snap, questions.DEFAULT_PROFILE).eligible.map((candidate) => candidate.familyId);
    for (const familyId of required) {
      assert.ok(ids.includes(familyId), `${snap.context.possession}:${familyId}`);
      verifyGrounding(questions, snap, questions.build(snap, familyId));
    }
  }
});

test('live comparison and approved later pages stay source-accurate and snap-grounded', () => {
  const { domain, questions } = loadModules();
  const comparison = makeSnap(domain, {
    yardsToGo: 7, firstDownLine: 37, totalYards: { player: 83, opponent: 71 },
  }, 12);
  const past100 = makeSnap(domain, {
    totalYards: { player: 98, opponent: 71 },
  }, 3);
  const reversePast100 = makeSnap(domain, {
    possession: 'defense', direction: -1, yardLine: 70, firstDownLine: 60,
    driveStart: 80, totalYards: { player: 91, opponent: 118 },
  }, 2);

  const cases = [
    [comparison, ['gain-vs-needed-comparison', 'drive-play-ordinal']],
    [past100, ['team-yards-past-100']],
    [reversePast100, ['team-yards-past-100']],
  ];
  for (const [snap, familyIds] of cases) {
    const inspection = questions.inspect(snap, questions.DEFAULT_PROFILE);
    for (const familyId of familyIds) {
      const candidate = inspection.eligible.find((entry) => entry.familyId === familyId);
      assert.ok(candidate, `${familyId} should be eligible`);
      assert.equal(candidate.curriculumSource, 'workbook');
      if (familyId === 'gain-vs-needed-comparison') assert.equal(candidate.introducedOnPage, 39);
      else assert.ok(candidate.introducedOnPage > questions.CURRENT_COMPLETED_PAGE);
      verifyGrounding(questions, snap, questions.build(snap, familyId, { support: 'guided' }));
    }
  }

  for (const [gain, expected] of [[4, '<'], [7, '='], [12, '>']]) {
    const snap = makeSnap(domain, { yardsToGo: 7, firstDownLine: 37 }, gain);
    const question = questions.build(snap, 'gain-vs-needed-comparison', { support: 'guided' });
    expectComparisonChoiceLabels(question);
    assert.equal(question.answer.value, expected);
    verifyGrounding(questions, snap, question);
  }

  const beyondSourceBand = makeSnap(domain, { yardsToGo: 7, firstDownLine: 37 }, 17);
  assert.equal(
    questions.inspect(beyondSourceBand, questions.DEFAULT_PROFILE).eligible
      .some((entry) => entry.familyId === 'gain-vs-needed-comparison'),
    false,
  );
  assert.throws(
    () => questions.build(beyondSourceBand, 'gain-vs-needed-comparison'),
    (error) => error.code === 'family-not-eligible' && /outside-comparison-source-band/.test(error.message),
  );

  for (const [drivePlays, expected] of [[4, '5th'], [10, '11th'], [15, '16th']]) {
    const snap = makeSnap(domain, { drivePlays }, 4);
    const question = questions.build(snap, 'drive-play-ordinal', { support: 'guided' });
    assert.equal(question.answer.value, expected);
    verifyGrounding(questions, snap, question);
  }

  const narrowProfile = {
    completedThroughPage: 145,
    includedThroughPage: 145,
    computationMax: 10,
    displayMax: 120,
  };
  const narrow = questions.inspect(past100, narrowProfile);
  assert.equal(narrow.eligible.some((entry) => entry.familyId === 'gain-vs-needed-comparison'), true);
  assert.equal(narrow.eligible.some((entry) => entry.familyId === 'team-yards-past-100'), false);
  assert.ok(narrow.declined.some((entry) => entry.familyId === 'team-yards-past-100'
    && entry.reason.code === 'curriculum-not-included'));
  assert.throws(
    () => questions.build(past100, 'team-yards-past-100', { profile: narrowProfile }),
    (error) => error.code === 'curriculum-not-included',
  );
});

test('high committed-score relations and ungrounded clock or calendar work stay unavailable', () => {
  const { domain, questions } = loadModules();
  const snap = makeSnap(domain, { scores: { player: 14, opponent: 7 }, driveStart: 30 }, 4);
  const inspection = questions.inspect(snap, questions.DEFAULT_PROFILE);
  const eligibleIds = inspection.eligible.map((candidate) => candidate.familyId);
  assert.equal(eligibleIds.includes('committed-score-total'), false);
  assert.equal(eligibleIds.includes('committed-score-difference'), false);
  for (const forbidden of ['compare-two-digit-preview', 'hundred-chart-small-move', 'add-within-10', 'clock-read', 'am-pm', 'calendar-read', 'sack-loss']) {
    assert.equal(eligibleIds.includes(forbidden), false);
    assert.throws(() => questions.build(snap, forbidden), (error) => error.code === 'unknown-family');
  }
  const allFamilyIds = [...inspection.eligible, ...inspection.declined].map((item) => item.familyId);
  assert.equal(allFamilyIds.some((id) => /preview|clock|calendar|am-pm|sack|loss|trivia/i.test(id)), false);
});

test('non-source-visible initial and guided models never contain a result slot', () => {
  const { domain, questions } = loadModules();
  const snaps = [
    makeSnap(domain, { driveStart: 27, scores: { player: 3, opponent: 4 } }, 4),
    makeSnap(domain, { yardLine: 30, firstDownLine: 35, yardsToGo: 5, driveStart: 20 }, 10),
    makeSnap(domain, { yardLine: 95, firstDownLine: 100, yardsToGo: 5, driveStart: 90 }, 5),
  ];
  let hiddenFamilies = 0;
  for (const snap of snaps) {
    for (const candidate of questions.inspect(snap, questions.DEFAULT_PROFILE).eligible) {
      const question = questions.build(snap, candidate.familyId);
      if (question.answerExposure === 'source-visible') continue;
      hiddenFamilies++;
      for (const stage of ['initial', 'guided']) {
        assert.equal(question.visuals[stage].revealsAnswer, false);
        assert.equal(question.visuals[stage].result, null);
      }
      assert.equal(question.visuals.worked.revealsAnswer, true);
      assert.deepEqual(question.visuals.worked.result.value, question.answer.value);
    }
  }
  assert.ok(hiddenFamilies > 5);
});

test('presentation RNG can only reorder stable choices', () => {
  const { domain, questions } = loadModules();
  const snap = makeSnap(domain, { driveStart: 27 }, 4);
  const low = questions.build(snap, 'line-to-gain-missing-part', { support: 'guided', presentationRng: () => 0 });
  const high = questions.build(snap, 'line-to-gain-missing-part', { support: 'guided', presentationRng: () => 0.999999 });
  assert.notDeepEqual(low.choices.map((choice) => choice.id), high.choices.map((choice) => choice.id));

  const normalized = (question) => ({
    ...plain(question),
    choices: plain(question.choices).sort((left, right) => left.id.localeCompare(right.id)),
  });
  assert.deepEqual(normalized(low), normalized(high));
  assert.equal(low.correctChoiceId, high.correctChoiceId);
  assert.deepEqual(low.operation, high.operation);
  assert.deepEqual(low.answer, high.answer);
  assert.deepEqual(low.visuals, high.visuals);
});

test('build snapshots inputs and recursively freezes question, bindings, choices, copy, and visuals', () => {
  const { domain, questions } = loadModules();
  const snap = makeSnap(domain, { driveStart: 27 }, 4);
  const before = plain(snap);
  const question = questions.build(snap, 'line-to-gain-missing-part', { support: 'guided' });
  assert.deepEqual(plain(snap), before);
  assert.equal(deepFrozen(question), true);
  assert.equal(question.bindings, question.premises);
  assert.equal(question.math.stage, 'guided');
  assert.equal(question.math.support, 'guided');
  assert.throws(() => { question.bindings[0].value = 99; }, TypeError);
  assert.throws(() => { question.choices[0].label = 'changed'; }, TypeError);
  assert.throws(() => { question.visuals.initial.data.total = 99; }, TypeError);
  assert.throws(() => { question.prompt.text = 'changed'; }, TypeError);
});

test('malformed or contradictory snaps fail closed with deterministic diagnostics', () => {
  const { domain, questions } = loadModules();
  const valid = makeSnap(domain, {}, 4);
  const malformed = [
    null,
    { context: valid.context },
    { ...plain(valid), context: { ...plain(valid.context), yardsToGo: 11 } },
    { ...plain(valid), context: { ...plain(valid.context), firstDownLine: 41 } },
    { ...plain(valid), proposal: { ...plain(valid.proposal), endYardLine: 99 } },
    { ...plain(valid), proposal: { ...plain(valid.proposal), resultKind: 'maybe' } },
  ];
  for (const snap of malformed) {
    const first = questions.inspect(snap, questions.DEFAULT_PROFILE);
    const second = questions.inspect(snap, questions.DEFAULT_PROFILE);
    assert.deepEqual(plain(first), plain(second));
    assert.equal(first.eligible.length, 0);
    assert.equal(first.declined.length > 0, true);
    assert.throws(() => questions.build(snap, 'yards-to-go-read'));
  }
});
