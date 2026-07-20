import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const opponentSource = await readFile(new URL('../football/opponent.js', import.meta.url), 'utf8');
const domainSource = await readFile(new URL('../football/football-domain.js', import.meta.url), 'utf8');
const questionsSource = await readFile(new URL('../football/contextual-questions.js', import.meta.url), 'utf8');

function loadModules() {
  const context = vm.createContext({});
  vm.runInContext(opponentSource, context, { filename: 'opponent.js' });
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

function matchDescriptor(opponentId = 'unc', opponentName = 'UNC') {
  return {
    schemaVersion: 1,
    player: { id: 'duke', displayName: 'Duke', shortName: 'DUKE', endZoneName: 'DUKE' },
    opponent: {
      id: opponentId,
      displayName: opponentName,
      shortName: opponentName,
      endZoneName: opponentName,
    },
  };
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
  const match = overrides.match ?? matchDescriptor();
  return {
    contextId: overrides.contextId ?? 41,
    match,
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
      opponentId: match.opponent.id,
      profileKey: 'balanced',
      look: { key: 'balanced', label: 'Balanced set', alignment: 'Singleback', leanKeys: ['balanced'] },
      lean: { key: 'balanced', label: 'Run or pass', runWeight: 0.5, passWeight: 0.5 },
      weights: { shortRun: 0.2, shortPass: 0.2, longRun: 0.2, mediumPass: 0.2, longPass: 0.2 },
      plannedCallKey: calls.offense,
      tendency: { profileKey: 'balanced' },
    } : null),
  };
}

function makeSnap(domain, overrides = {}, gain = 4) {
  const sourceContext = context(overrides);
  return domain.createSnap(sourceContext, {
    gain,
    callKey: overrides.callKey ?? sourceContext.calls.offense,
    label: 'Test call',
  });
}

function makeSpecialPlay(domain, playType, overrides = {}) {
  const possession = overrides.possession ?? 'offense';
  const direction = possession === 'offense' ? 1 : -1;
  const contextId = overrides.contextId ?? `${playType}-${possession}`;
  const common = {
    schemaVersion: 1,
    playType,
    contextId,
    match: overrides.match ?? matchDescriptor(),
    possession,
    direction,
    quarter: overrides.quarter ?? 4,
    scores: overrides.scores ?? { player: 13, opponent: 12 },
  };
  let specialContext;
  let proposal;
  if (playType === 'conversion') {
    const attemptType = overrides.attemptType ?? 'pat';
    specialContext = domain.normalizeSpecialContext(playType, {
      ...common,
      tryYardLine: domain.tryYardLineFor(direction),
      attemptType,
      attemptValue: attemptType === 'pat' ? 1 : 2,
    });
    proposal = domain.projectConversion(specialContext, overrides.outcome ?? 'made');
  } else if (playType === 'fieldGoal') {
    const yardLine = overrides.yardLine ?? (direction === 1 ? 60 : 40);
    specialContext = domain.normalizeSpecialContext(playType, {
      ...common,
      yardLine,
      attemptDistance: domain.fieldGoalDistance(yardLine, direction),
    });
    proposal = domain.projectFieldGoal(specialContext, overrides.outcome ?? 'made');
  } else {
    const yardLine = overrides.yardLine ?? (direction === 1 ? 30 : 70);
    specialContext = domain.normalizeSpecialContext(playType, { ...common, yardLine });
    proposal = domain.projectPunt(specialContext, overrides.travelYards ?? 40, {
      mode: overrides.mode ?? 'normal',
    });
  }
  return domain.createActivePlay({
    schemaVersion: 1,
    playType,
    gameId: overrides.gameId ?? 'game-special',
    possessionId: overrides.possessionId ?? `possession-${possession}`,
    playId: overrides.playId ?? `play-${contextId}`,
    contextId,
    context: specialContext,
    proposal,
  });
}

function pointer(root, path) {
  return path.slice(1).split('/').reduce((value, token) => value[token.replace(/~1/g, '/').replace(/~0/g, '~')], root);
}

function bindingValues(question) {
  return Object.fromEntries(question.bindings.map((binding) => [binding.id, binding.value]));
}

test('long distance and signed team totals retain a nonempty buildable question pool', () => {
  const { domain, questions } = loadModules();
  for (const totalYards of [
    { player: -7, opponent: 12 },
    { player: 12, opponent: -7 },
  ]) {
    const snap = makeSnap(domain, {
      yardsToGo: 13,
      firstDownLine: 43,
      totalYards,
    }, 4);
    const inspection = questions.inspect(snap, questions.DEFAULT_PROFILE);
    assert.ok(inspection.eligible.length > 0);
    for (const candidate of inspection.eligible) {
      assert.doesNotThrow(() => questions.build(snap, candidate.familyId, {
        ...questions.DEFAULT_PROFILE,
        presentationRng: () => 0.5,
      }), candidate.familyId);
    }
    assert.ok(inspection.declined.some(item => item.familyId === 'yards-to-go-read'
      && item.reason.code === 'outside-read-band'));
  }
});

test('every reachable long-distance state, including fourth down, retains a nonempty fully buildable pool in both directions', () => {
  const { domain, questions } = loadModules();
  for (const direction of [1, -1]) {
    for (const down of [2, 4]) {
      for (let yardsToGo = 11; yardsToGo <= 19; yardsToGo++) {
        const possession = direction === 1 ? 'offense' : 'defense';
        const yardLine = direction === 1 ? 30 : 70;
        const snap = makeSnap(domain, {
          possession,
          direction,
          down,
          yardLine,
          yardsToGo,
          firstDownLine: yardLine + (direction * yardsToGo),
          totalYards: direction === 1 ? { player: -9, opponent: 4 } : { player: 4, opponent: -9 },
        }, 4);
        const inspection = questions.inspect(snap, questions.DEFAULT_PROFILE);
        assert.ok(inspection.eligible.length > 0, `${direction}:${down}:${yardsToGo}`);
        for (const candidate of inspection.eligible) {
          assert.doesNotThrow(() => questions.build(snap, candidate.familyId, {
            ...questions.DEFAULT_PROFILE,
            presentationRng: () => 0.5,
          }), `${direction}:${down}:${yardsToGo}:${candidate.familyId}`);
        }
      }
    }
  }
});

function recompute(question) {
  const values = bindingValues(question);
  const operands = question.operation.operandIds.map((id) => values[id]);
  switch (question.operation.type) {
    case 'read': return operands[0];
    case 'ordinal': return ({ 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' })[operands[0]];
    case 'missingPart':
    case 'exactRemainder':
    case 'factFamilyMissingPart': return operands[0] - operands[1];
    case 'surplus': return operands[0] - operands[1];
    case 'distance': return Math.abs(operands[0] - operands[1]);
    case 'tensOfDistance': return Math.floor(Math.abs(operands[0] - operands[1]) / 10);
    case 'onesOfDistance': return Math.abs(operands[0] - operands[1]) % 10;
    case 'tensOfScore': return Math.floor(operands[0] / 10);
    case 'onesOfScore': return operands[0] % 10;
    case 'halfFromQuarter': return operands[0] <= 2 ? '1st half' : '2nd half';
    case 'absoluteDifference': return Math.abs(operands[0] - operands[1]);
    case 'add': return operands[0] + operands[1];
    case 'compare': return operands[0] < operands[1] ? '<' : operands[0] > operands[1] ? '>' : '=';
    case 'goalDistanceAfterGain': return Math.abs(operands[0] - operands[1]) - operands[2];
    case 'driveDistancePlusGain': return Math.abs(operands[1] - operands[0]) + operands[2];
    case 'ruleValue': return operands[0];
    case 'conversionValue': return operands[0] === 'pat' ? 1 : 2;
    case 'tryMarkerForDirection': return operands[0] === 1 ? 98 : 2;
    default: throw new Error(`Unknown operation ${question.operation.type}`);
  }
}

function verifyGrounding(questions, snap, question) {
  assert.equal(question.schemaVersion, 2);
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
  const canonicalBindingIds = new Set(question.bindings.map((binding) => binding.id));
  const review = question.workedReview;
  assert.equal(review.familyId, question.familyId);
  assert.equal(review.concept, question.concept);
  assert.ok(review.title.trim().length > 0);
  assert.ok([2, 3].includes(review.steps.length));
  assert.equal(new Set(review.steps.map((step) => step.id)).size, review.steps.length);
  for (const copy of [review.goal, ...review.steps, review.footballMeaning]) {
    assert.ok(copy.text.trim().length > 0);
    assert.ok(copy.ariaLabel.trim().length > 0);
    assert.equal(copy.answerId, question.answer.id);
    assert.ok(copy.bindingIds.length > 0);
    assert.ok(copy.bindingIds.every((bindingId) => canonicalBindingIds.has(bindingId)));
  }
  assert.equal(deepFrozen(review), true);
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
  assert.equal(questions.SCHEMA_VERSION, 2);
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
  assert.deepEqual(plain(questions.PLAY_TYPES), ['scrimmage', 'punt', 'fieldGoal', 'conversion']);
  assert.deepEqual(Object.keys(questions.FAMILY_REGISTRY), plain(questions.PLAY_TYPES));
  assert.ok(questions.OPERATION_TYPES.length > 0);
  assert.equal(questions.OPERATION_TYPES.includes('nextOrdinal'), false);
  assert.ok(questions.ANSWER_EXPOSURE_POLICIES.includes('hidden-until-worked'));
  assert.deepEqual(plain(questions.CURRICULUM_SOURCES), ['workbook', 'football-only']);
});

test('inspect preserves page-145 completion while capping approved question content at page 179', () => {
  const { domain, questions } = loadModules();
  const snap = makeSnap(domain, { driveStart: 27 }, 4);
  const first = questions.inspect(snap, { completedThroughPage: 999, includedThroughPage: 999, computationMax: 99, displayMax: 999 });
  const second = questions.inspect(snap, { completedThroughPage: 999, includedThroughPage: 999, computationMax: 99, displayMax: 999 });
  assert.deepEqual(plain(first), plain(second));
  assert.equal(first.schemaVersion, 2);
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

test('every exported family builds one exact, grounded, recursively frozen schema-2 worked review', () => {
  const { domain, questions } = loadModules();
  const scenarios = [
    makeSnap(domain, {
      quarter: 3, down: 2, yardLine: 30, firstDownLine: 35, yardsToGo: 5,
      driveStart: 25, scores: { player: 3, opponent: 4 },
    }, 3),
    makeSnap(domain, { down: 2, yardLine: 30, firstDownLine: 35, yardsToGo: 5, driveStart: 25 }, 5),
    makeSnap(domain, { down: 2, yardLine: 30, firstDownLine: 35, yardsToGo: 5, driveStart: 25 }, 7),
    makeSnap(domain, {
      down: 2, yardLine: 30, firstDownLine: 35, yardsToGo: 5, driveStart: 25,
      totalYards: { player: 99, opponent: 71 },
    }, 2),
    makeSnap(domain, {
      quarter: 3, down: 2, yardLine: 30, firstDownLine: 35, yardsToGo: 5,
      driveStart: 25, scores: { player: 14, opponent: 7 },
    }, 3),
    makeSnap(domain, {
      quarter: 3, down: 2, yardLine: 30, firstDownLine: 35, yardsToGo: 5,
      driveStart: 20, scores: { player: 3, opponent: 4 },
    }, 10),
    makeSnap(domain, {
      down: 4, yardLine: 95, firstDownLine: 100, yardsToGo: 5,
      driveStart: 90, scores: { player: 3, opponent: 4 },
    }, 10),
    makeSpecialPlay(domain, 'conversion', { possession: 'offense', attemptType: 'pat' }),
    makeSpecialPlay(domain, 'fieldGoal', { possession: 'offense', yardLine: 60 }),
    makeSpecialPlay(domain, 'punt', { possession: 'offense', yardLine: 30, travelYards: 40 }),
  ];
  const expected = {
    'yards-to-go-read': ['line-to-gain', 'read', ['yardsToGo']],
    'line-to-gain-missing-part': ['line-to-gain', 'missingPart', ['yardsToGo', 'proposedGain']],
    'line-to-gain-exact': ['line-to-gain', 'exactRemainder', ['yardsToGo', 'proposedGain']],
    'line-to-gain-surplus': ['line-to-gain', 'surplus', ['yardsToGo', 'proposedGain']],
    'line-to-gain-fact-family': ['line-to-gain', 'factFamilyMissingPart', ['yardsToGo', 'proposedGain']],
    'gain-vs-needed-comparison': ['line-to-gain-comparison', 'compare', ['proposedGain', 'yardsToGo']],
    'goal-distance-read': ['field-distance', 'distance', ['ballYardLine', 'goalLine']],
    'goal-distance-tens': ['place-value', 'tensOfDistance', ['ballYardLine', 'goalLine']],
    'goal-distance-ones': ['place-value', 'onesOfDistance', ['ballYardLine', 'goalLine']],
    'team-yards-past-100': ['team-total-yards', 'add', ['teamTotalYards', 'proposedGain']],
    'drive-distance-scaffolded': ['drive-distance', 'absoluteDifference', ['driveStart', 'ballYardLine']],
    'committed-score-total': ['committed-score', 'add', ['playerScore', 'opponentScore']],
    'committed-score-difference': ['committed-score', 'absoluteDifference', ['playerScore', 'opponentScore']],
    'committed-score-tens': ['teen-place-value', 'tensOfScore', ['committedScore']],
    'committed-score-ones': ['teen-place-value', 'onesOfScore', ['committedScore']],
    'quarter-read': ['quarter-read', 'ordinal', ['quarter']],
    'half-read': ['quarter-half-structure', 'halfFromQuarter', ['quarter']],
    'next-down': ['down-progression', 'ordinal', ['currentDown', 'yardsToGo', 'proposedGain', 'resultKind', 'nextDown']],
    'goal-distance-minus-whole-tens': ['field-distance', 'goalDistanceAfterGain', ['ballYardLine', 'goalLine', 'proposedGain']],
    'drive-distance-plus-whole-tens': ['drive-distance', 'driveDistancePlusGain', ['driveStart', 'ballYardLine', 'proposedGain']],
    'touchdown-base-points': ['touchdown-base-scoring', 'ruleValue', ['resultKind', 'touchdownBasePoints']],
    'conversion-attempt-value': ['conversion-scoring', 'conversionValue', ['possessingTeamScore', 'attemptType', 'attemptValue']],
    'conversion-try-marker': ['conversion-placement', 'tryMarkerForDirection', ['direction', 'tryYardLine']],
    'field-goal-attempt-distance': ['field-goal-distance', 'read', ['attemptDistance']],
    'field-goal-point-value': ['field-goal-scoring', 'ruleValue', ['possessingTeamScore', 'attemptDistance', 'fieldGoalPoints']],
    'punt-travel-distance': ['punt-distance', 'read', ['direction', 'puntStartYardLine', 'rawLandingYardLine', 'appliedTravelYards']],
    'punt-landing-spot': ['punt-placement', 'read', ['puntStartYardLine', 'direction', 'appliedTravelYards', 'landingYardLine']],
  };
  const exportedFamilyIds = Object.values(questions.FAMILY_REGISTRY)
    .flat()
    .map((entry) => entry.familyId)
    .sort();
  assert.deepEqual(Object.keys(expected).sort(), exportedFamilyIds);

  for (const [familyId, [concept, operation, bindingIds]] of Object.entries(expected)) {
    const source = scenarios.find((candidate) => questions.inspect(candidate).eligible
      .some((entry) => entry.familyId === familyId));
    assert.ok(source, `${familyId}: deterministic representative source`);
    const question = questions.build(source, familyId, { presentationRng: () => 0.37 });
    verifyGrounding(questions, source, question);
    assert.equal(question.schemaVersion, questions.SCHEMA_VERSION, familyId);
    assert.equal(question.familyId, familyId);
    assert.equal(question.workedReview.familyId, familyId);
    assert.equal(question.concept, concept);
    assert.equal(question.workedReview.concept, concept);
    assert.equal(question.operation.type, operation);
    assert.deepEqual(plain(question.bindings.map((binding) => binding.id)), bindingIds);
  }
});

test('short, exact, surplus, fact-family, fourth-down, and touchdown facts use the frozen old marker', () => {
  const { domain, questions } = loadModules();
  const cases = [
    [makeSnap(domain, { down: 4, yardsToGo: 10, firstDownLine: 40 }, 4), ['line-to-gain-missing-part', 'line-to-gain-fact-family']],
    [makeSnap(domain, { down: 4, yardsToGo: 10, firstDownLine: 40 }, 10), ['line-to-gain-exact']],
    [makeSnap(domain, { down: 4, yardsToGo: 4, firstDownLine: 34 }, 7), ['line-to-gain-surplus']],
    [makeSnap(domain, { yardLine: 95, firstDownLine: 100, yardsToGo: 5, driveStart: 90, down: 4 }, 20), ['line-to-gain-exact', 'touchdown-base-points']],
    [makeSnap(domain, { possession: 'defense', direction: -1, yardLine: 5, firstDownLine: 0, yardsToGo: 5, driveStart: 10, down: 4 }, 20), ['line-to-gain-exact', 'touchdown-base-points']],
  ];
  for (const [snap, expectedFamilies] of cases) {
    const ids = questions.inspect(snap, questions.DEFAULT_PROFILE).eligible.map((candidate) => candidate.familyId);
    for (const familyId of expectedFamilies) {
      assert.ok(ids.includes(familyId), `${familyId} for ${snap.context.possession}`);
      verifyGrounding(questions, snap, questions.build(snap, familyId));
    }
  }
});

test('touchdown scoring retires the automatic-seven identity and teaches the touchdown-only six', () => {
  const { domain, questions } = loadModules();
  const snap = makeSnap(domain, {
    yardLine: 95,
    firstDownLine: 100,
    yardsToGo: 5,
    driveStart: 90,
    down: 4,
  }, 20);
  const question = questions.build(snap, 'touchdown-base-points');
  verifyGrounding(questions, snap, question);
  assert.equal(question.playType, 'scrimmage');
  assert.equal(question.concept, 'touchdown-base-scoring');
  assert.equal(question.answer.value, 6);
  assert.match(question.prompt.text, /touchdown itself/i);
  assert.match(question.workedExplanation.text, /separate conversion/i);
  assert.equal(Object.hasOwn(questions.RULES, 'game.touchdownPoints'), false);
  assert.throws(
    () => questions.build(snap, 'touchdown-points'),
    (error) => error.code === 'unknown-family',
  );
  const registry = Object.values(questions.FAMILY_REGISTRY).flat();
  assert.equal(registry.some((entry) => entry.familyId === 'touchdown-points'), false);
  assert.equal(registry.some((entry) => entry.concept === 'scoring-rule'), false);
  for (const callFamilies of Object.values(questions.CALL_AFFINITIES)) {
    assert.equal(callFamilies.includes('touchdown-points'), false);
  }
  assert.ok(Object.values(questions.CALL_AFFINITIES).some((families) => families.includes('touchdown-base-points')));
});

test('special-team registries are closed, buildable, neutral, and grounded in each public active play', () => {
  const { domain, questions } = loadModules();
  const expectedIds = {
    conversion: ['conversion-attempt-value', 'conversion-try-marker'],
    fieldGoal: ['field-goal-attempt-distance', 'field-goal-point-value'],
    punt: ['punt-travel-distance', 'punt-landing-spot'],
  };
  for (const [playType, ids] of Object.entries(expectedIds)) {
    assert.deepEqual(plain(questions.FAMILY_REGISTRY[playType].map((entry) => entry.familyId)), ids);
    assert.ok(questions.FAMILY_REGISTRY[playType].every((entry) => entry.playType === playType));
  }
  assert.deepEqual(plain(questions.SPECIAL_BINDING_PATHS), {
    conversion: [
      '/context/scores/player', '/context/scores/opponent',
      '/context/attemptType', '/context/attemptValue',
      '/context/direction', '/context/tryYardLine',
    ],
    fieldGoal: [
      '/context/scores/player', '/context/scores/opponent',
      '/context/attemptDistance',
    ],
    punt: [
      '/context/direction', '/proposal/startYardLine',
      '/proposal/rawLandingYardLine', '/proposal/appliedTravelYards',
      '/proposal/landingYardLine',
    ],
  });

  const plays = [
    makeSpecialPlay(domain, 'conversion', { possession: 'offense', attemptType: 'pat' }),
    makeSpecialPlay(domain, 'conversion', { possession: 'defense', attemptType: 'twoPoint' }),
    makeSpecialPlay(domain, 'fieldGoal', { possession: 'offense', yardLine: 60 }),
    makeSpecialPlay(domain, 'fieldGoal', { possession: 'defense', yardLine: 40 }),
    makeSpecialPlay(domain, 'punt', { possession: 'offense', yardLine: 30, travelYards: 40 }),
    makeSpecialPlay(domain, 'punt', { possession: 'defense', yardLine: 70, travelYards: 40 }),
  ];

  for (const play of plays) {
    const inspection = questions.inspect(play);
    assert.equal(inspection.playType, play.playType);
    assert.deepEqual(
      plain(inspection.eligible.map((entry) => entry.familyId)),
      expectedIds[play.playType],
      `${play.playType}:${play.context.possession}`,
    );
    assert.ok([...inspection.eligible, ...inspection.declined]
      .every((entry) => expectedIds[play.playType].includes(entry.familyId)));
    for (const candidate of inspection.eligible) {
      const question = questions.build(play, candidate.familyId, { presentationRng: () => 0.37 });
      verifyGrounding(questions, play, question);
      assert.equal(question.playType, play.playType);
      assert.equal(question.choices.length, 4);
      assert.ok(question.choices.filter((choice) => choice.id !== question.correctChoiceId).length >= 2);
      assert.deepEqual(plain(question.selection), {
        strategy: 'play-type-neutral-v1',
        role: play.context.possession,
        selectedCallId: null,
        multiplier: 1,
      });
      const allowedPaths = new Set(questions.SPECIAL_BINDING_PATHS[play.playType]);
      for (const binding of question.bindings) {
        if (binding.source.kind === 'context') {
          assert.ok(allowedPaths.has(binding.source.path), `${candidate.familyId}:${binding.source.path}`);
          assert.doesNotMatch(
            binding.source.path,
            /resultKind|points|made|restart|nextPossession|nextStart|mode|requestedTravel/i,
          );
        } else {
          assert.deepEqual(plain(binding.source), {
            kind: 'rule',
            ruleId: 'game.fieldGoalPoints',
          });
        }
      }
      assert.equal(JSON.stringify(question).includes('privateOpponent'), false);
      assert.equal(deepFrozen(question), true);
    }
  }

  const [pat, twoPoint, forwardFieldGoal, reverseFieldGoal, forwardPunt, reversePunt] = plays;
  assert.equal(questions.build(pat, 'conversion-attempt-value').answer.value, 1);
  assert.equal(questions.build(pat, 'conversion-try-marker').answer.value, 98);
  assert.equal(questions.build(twoPoint, 'conversion-attempt-value').answer.value, 2);
  assert.equal(questions.build(twoPoint, 'conversion-try-marker').answer.value, 2);
  assert.equal(questions.build(forwardFieldGoal, 'field-goal-attempt-distance').answer.value, 57);
  assert.equal(questions.build(reverseFieldGoal, 'field-goal-attempt-distance').answer.value, 57);
  assert.equal(questions.build(forwardFieldGoal, 'field-goal-point-value').answer.value, 3);
  assert.equal(questions.build(reverseFieldGoal, 'field-goal-point-value').answer.value, 3);
  assert.equal(questions.build(forwardPunt, 'punt-travel-distance').answer.value, 40);
  assert.equal(questions.build(forwardPunt, 'punt-landing-spot').answer.value, 70);
  assert.equal(questions.build(reversePunt, 'punt-travel-distance').answer.value, 40);
  assert.equal(questions.build(reversePunt, 'punt-landing-spot').answer.value, 30);

  assert.throws(
    () => questions.build(pat, 'yards-to-go-read'),
    (error) => error.code === 'family-play-type-mismatch',
  );
  assert.throws(
    () => questions.build(forwardPunt, 'field-goal-attempt-distance'),
    (error) => error.code === 'family-play-type-mismatch',
  );
});

test('punt touchbacks preserve direction polarity and retain a truthful travel family', () => {
  const { domain, questions } = loadModules();
  const cases = [
    makeSpecialPlay(domain, 'punt', { possession: 'offense', yardLine: 70, travelYards: 35 }),
    makeSpecialPlay(domain, 'punt', { possession: 'defense', yardLine: 30, travelYards: 35 }),
  ];
  for (const play of cases) {
    assert.equal(play.proposal.resultKind, 'puntTouchback');
    assert.equal(play.proposal.appliedTravelYards, 30);
    assert.equal(play.proposal.landingYardLine, play.context.possession === 'offense' ? 80 : 20);
    const inspection = questions.inspect(play);
    assert.deepEqual(plain(inspection.eligible.map((entry) => entry.familyId)), ['punt-travel-distance']);
    assert.equal(
      inspection.declined.find((entry) => entry.familyId === 'punt-landing-spot')?.reason.code,
      'punt-touchback-placement',
    );
    const question = questions.build(play, 'punt-travel-distance');
    verifyGrounding(questions, play, question);
    assert.equal(question.answer.value, 30);
  }
});

test('contextual punt validation gives goal crossing precedence over receiver-favorable caps in both directions', () => {
  const { domain, questions } = loadModules();
  const cases = [
    { possession: 'offense', yardLine: 70, resultKind: 'punt', raw: 90 },
    { possession: 'defense', yardLine: 30, resultKind: 'punt', raw: 10 },
    { possession: 'offense', yardLine: 85, resultKind: 'puntTouchback', raw: 100 },
    { possession: 'defense', yardLine: 15, resultKind: 'puntTouchback', raw: 0 },
  ];
  for (const row of cases) {
    const activeThreat = makeSpecialPlay(domain, 'punt', {
      possession: row.possession,
      yardLine: row.yardLine,
      travelYards: 35,
    });
    const alternate = {
      ...plain(activeThreat),
      proposal: plain(domain.reprojectPunt(activeThreat, 'receiverFavorable')),
    };
    assert.equal(alternate.proposal.rawLandingYardLine, row.raw);
    assert.equal(alternate.proposal.resultKind, row.resultKind);
    assert.equal(
      alternate.proposal.restartReason,
      row.resultKind === 'puntTouchback' ? 'puntTouchback' : 'punt',
    );
    const inspection = questions.inspect(alternate);
    assert.equal(inspection.eligible.length, 0);
    assert.ok(inspection.declined.every(entry => entry.reason.code === 'alternate-initial-proposal'));

    if (row.resultKind === 'puntTouchback') {
      const stalePrecedence = plain(alternate);
      stalePrecedence.proposal.resultKind = 'punt';
      stalePrecedence.proposal.restartReason = 'punt';
      const rejected = questions.inspect(stalePrecedence);
      assert.equal(rejected.eligible.length, 0);
      assert.ok(rejected.declined.every(entry => entry.reason.code === 'invalid-punt-proposal'));
    }
  }
});

test('contextual special boundary rejects every alternate initial proposal', () => {
  const { domain, questions } = loadModules();
  const fieldGoal = makeSpecialPlay(domain, 'fieldGoal');
  const conversion = makeSpecialPlay(domain, 'conversion');
  const candidates = [
    {
      ...plain(fieldGoal),
      proposal: plain(domain.reprojectFieldGoal(fieldGoal, 'missed')),
    },
    {
      ...plain(fieldGoal),
      proposal: plain(domain.reprojectFieldGoal(fieldGoal, 'blocked')),
    },
    {
      ...plain(conversion),
      proposal: plain(domain.reprojectConversion(conversion, 'missed')),
    },
  ];
  for (const candidate of candidates) {
    const inspection = questions.inspect(candidate);
    assert.equal(inspection.eligible.length, 0, candidate.proposal.resultKind);
    assert.ok(
      inspection.declined.every(entry => entry.reason.code === 'alternate-initial-proposal'),
      candidate.proposal.resultKind,
    );
    assert.throws(
      () => questions.build(candidate, questions.FAMILY_REGISTRY[candidate.playType][0].familyId),
      error => error.code === 'alternate-initial-proposal',
    );
  }
});

test('special-team inspection rejects extra private or contradictory fields deterministically', () => {
  const { domain, questions } = loadModules();
  const valid = makeSpecialPlay(domain, 'fieldGoal', { possession: 'defense', yardLine: 40 });
  const privateContext = plain(valid);
  privateContext.context.privateOpponentDecision = { action: 'fieldGoal', secret: 'do-not-leak' };
  const privateInspection = questions.inspect(privateContext);
  assert.equal(privateInspection.eligible.length, 0);
  assert.ok(privateInspection.declined.every((entry) => entry.reason.code === 'invalid-context-shape'));
  assert.throws(
    () => questions.build(privateContext, 'field-goal-attempt-distance'),
    (error) => error.code === 'invalid-context-shape',
  );

  const extraProposal = plain(valid);
  extraProposal.proposal.plannedCallKey = 'longPass';
  const first = questions.inspect(extraProposal);
  const second = questions.inspect(extraProposal);
  assert.deepEqual(plain(first), plain(second));
  assert.equal(first.eligible.length, 0);
  assert.ok(first.declined.every((entry) => entry.reason.code === 'invalid-proposal-shape'));

  const contradictory = plain(valid);
  contradictory.context.attemptDistance = 56;
  contradictory.proposal.attemptDistance = 56;
  const contradiction = questions.inspect(contradictory);
  assert.equal(contradiction.eligible.length, 0);
  assert.ok(contradiction.declined.every((entry) => entry.reason.code === 'invalid-field-goal'));

  for (const invalidId of [null, 0, '   ']) {
    const invalidIdentity = plain(valid);
    invalidIdentity.contextId = invalidId;
    invalidIdentity.context.contextId = invalidId;
    invalidIdentity.proposal.contextId = invalidId;
    const inspection = questions.inspect(invalidIdentity);
    assert.equal(inspection.eligible.length, 0, String(invalidId));
    assert.ok(inspection.declined.every(entry => entry.reason.code === 'invalid-context-identity'));
  }

  for (const alteredMatch of [
    { ...matchDescriptor(), privateProfile: 'balanced' },
    { ...matchDescriptor(), player: { ...matchDescriptor().player, privateRating: 99 } },
    { ...matchDescriptor(), opponent: { ...matchDescriptor().opponent, profileKey: 'balanced' } },
  ]) {
    const nestedExtra = plain(valid);
    nestedExtra.context.match = alteredMatch;
    const inspection = questions.inspect(nestedExtra);
    assert.equal(inspection.eligible.length, 0);
    assert.ok(inspection.declined.every(entry => entry.reason.code === 'invalid-match'));
  }
});

test('goal distance, drive movement, place value, whole tens, committed scores, quarter, and half stay contextual', () => {
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
    'quarter-read', 'half-read', 'goal-distance-minus-whole-tens',
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

test('next-down is grounded in the frozen proposal and hides the projected result until worked support', () => {
  const { domain, questions } = loadModules();
  const snap = makeSnap(domain, {
    down: 2,
    yardsToGo: 8,
    firstDownLine: 38,
  }, 3);
  assert.equal(snap.proposal.resultKind, 'advance');
  assert.equal(snap.proposal.newDown, 3);

  const candidate = questions.inspect(snap).eligible.find((entry) => entry.familyId === 'next-down');
  assert.ok(candidate);
  assert.deepEqual(plain(candidate), {
    id: 'next-down',
    familyId: 'next-down',
    skill: 'football-number-sense',
    concept: 'down-progression',
    purpose: 'coreReview',
    grading: 'gate',
    tier: 'football-context',
    curriculumSource: 'football-only',
    introducedOnPage: null,
    weight: 1.1,
    operationType: 'ordinal',
    answerExposure: 'modeled-with-result-hidden',
    playType: 'scrimmage',
  });

  const question = questions.build(snap, 'next-down', {
    support: 'initial',
    presentationRng: () => 0.5,
  });
  assert.deepEqual(plain(question.bindings), [
    { id: 'currentDown', source: { kind: 'context', path: '/context/down' }, value: 2 },
    { id: 'yardsToGo', source: { kind: 'context', path: '/context/yardsToGo' }, value: 8 },
    { id: 'proposedGain', source: { kind: 'context', path: '/proposal/appliedGain' }, value: 3 },
    { id: 'resultKind', source: { kind: 'context', path: '/proposal/resultKind' }, value: 'advance' },
    { id: 'nextDown', source: { kind: 'context', path: '/proposal/newDown' }, value: 3 },
  ]);
  assert.deepEqual(plain(question.operation), {
    type: 'ordinal',
    operandIds: ['nextDown'],
    outputId: 'next-down--answer',
  });
  assert.deepEqual(plain(question.grounding), {
    bindingIds: ['currentDown', 'yardsToGo', 'proposedGain', 'resultKind', 'nextDown'],
    answerId: 'next-down--answer',
  });
  assert.equal(question.answer.value, '3rd');
  assert.deepEqual(
    [...question.choices].map((choice) => choice.value).sort(),
    ['1st', '2nd', '3rd', '4th'],
  );
  for (const stage of ['initial', 'guided', 'worked']) {
    assert.equal(question.visuals[stage].type, 'down-progression');
    assert.deepEqual(plain(question.visuals[stage].data), {
      currentDown: 2,
      yardsToGo: 8,
      proposedGain: 3,
    });
  }
  for (const stage of ['initial', 'guided']) {
    assert.equal(question.visuals[stage].revealsAnswer, false);
    assert.equal(question.visuals[stage].result, null);
  }
  assert.equal(question.visuals.worked.revealsAnswer, true);
  assert.deepEqual(plain(question.visuals.worked.result), {
    answerId: 'next-down--answer',
    value: '3rd',
  });
  const copy = [
    question.prompt.text,
    question.hint.text,
    question.workedExplanation.text,
    ...Object.values(question.visuals).map((visual) => visual.ariaLabel),
  ].join(' ');
  assert.doesNotMatch(copy, /scoreboard begins|ordinal|order number|before the (?:&|and) sign/i);
  verifyGrounding(questions, snap, question);
});

test('next-down covers advances in both directions and first-down resets after 2nd, 3rd, and 4th down', () => {
  const { domain, questions } = loadModules();
  const cases = [
    {
      label: 'forward 2nd-down advance',
      snap: makeSnap(domain, { down: 2, yardsToGo: 8, firstDownLine: 38 }, 3),
      resultKind: 'advance',
      answer: '3rd',
    },
    {
      label: 'reverse 3rd-down advance',
      snap: makeSnap(domain, {
        possession: 'defense', direction: -1, down: 3,
        yardLine: 70, yardsToGo: 8, firstDownLine: 62, driveStart: 80,
      }, 3),
      resultKind: 'advance',
      answer: '4th',
    },
    ...[2, 3, 4].map((down) => ({
      label: `${down} down first-down reset`,
      snap: makeSnap(domain, { down, yardsToGo: 7, firstDownLine: 37 }, 7),
      resultKind: 'firstDown',
      answer: '1st',
    })),
  ];

  for (const { label, snap, resultKind, answer } of cases) {
    assert.equal(snap.proposal.resultKind, resultKind, label);
    const candidate = questions.inspect(snap).eligible.find((entry) => entry.familyId === 'next-down');
    assert.ok(candidate, label);
    const question = questions.build(snap, 'next-down');
    assert.equal(question.answer.value, answer, label);
    assert.equal(bindingValues(question).nextDown, snap.proposal.newDown, label);
    verifyGrounding(questions, snap, question);
  }
});

test('next-down excludes unchanged 1st-down resets, touchdowns, and fourth-down failures', () => {
  const { domain, questions } = loadModules();
  const cases = [
    {
      label: '1st-down conversion stays 1st',
      snap: makeSnap(domain, { down: 1, yardsToGo: 5, firstDownLine: 35 }, 5),
      resultKind: 'firstDown',
      reason: 'next-down-unchanged',
    },
    {
      label: 'touchdown has no next down',
      snap: makeSnap(domain, {
        down: 2, yardLine: 95, yardsToGo: 5, firstDownLine: 100, driveStart: 90,
      }, 10),
      resultKind: 'touchdown',
      reason: 'no-next-down',
    },
    {
      label: 'failed fourth down changes possession',
      snap: makeSnap(domain, { down: 4, yardsToGo: 6, firstDownLine: 36 }, 3),
      resultKind: 'turnoverOnDowns',
      reason: 'no-next-down',
    },
  ];

  for (const { label, snap, resultKind, reason } of cases) {
    assert.equal(snap.proposal.resultKind, resultKind, label);
    const inspection = questions.inspect(snap);
    assert.equal(inspection.eligible.some((entry) => entry.familyId === 'next-down'), false, label);
    assert.equal(
      inspection.declined.find((entry) => entry.familyId === 'next-down')?.reason.code,
      reason,
      label,
    );
    assert.throws(
      () => questions.build(snap, 'next-down'),
      (error) => error.code === 'family-not-eligible' && error.message.includes(reason),
      label,
    );
  }
});

test('tautological ordinal families are retired while quarter and half families remain scheduled', () => {
  const { domain, questions } = loadModules();
  const snap = makeSnap(domain, { quarter: 3, down: 2, yardsToGo: 8, firstDownLine: 38 }, 3);
  const inspection = questions.inspect(snap);
  const scheduled = [...inspection.eligible, ...inspection.declined].map((entry) => entry.familyId);
  assert.equal(scheduled.includes('down-read'), false);
  assert.equal(scheduled.includes('drive-play-ordinal'), false);
  assert.equal(inspection.eligible.some((entry) => entry.familyId === 'quarter-read'), true);
  assert.equal(inspection.eligible.some((entry) => entry.familyId === 'half-read'), true);
  assert.equal(questions.build(snap, 'quarter-read').answer.value, '3rd');
  assert.equal(questions.build(snap, 'half-read').answer.value, '2nd half');
  for (const familyId of ['down-read', 'drive-play-ordinal']) {
    assert.throws(
      () => questions.build(snap, familyId),
      (error) => error.code === 'unknown-family',
      familyId,
    );
  }
});

test('half and teen-score families use only the frozen quarter and real committed scoreboard values', () => {
  const { domain, questions } = loadModules();
  const ordinarySnaps = [1, 2, 3, 4].map((quarter) => makeSnap(domain, { quarter }, 4));
  const quarterCandidate = questions.inspect(ordinarySnaps[0]).eligible
    .find((candidate) => candidate.familyId === 'quarter-read');
  assert.ok(quarterCandidate);

  for (const [index, snap] of ordinarySnaps.entries()) {
    const quarter = index + 1;
    const candidate = questions.inspect(snap).eligible.find((entry) => entry.familyId === 'half-read');
    assert.ok(candidate, `half-read should be available during an ordinary Q${quarter} snap`);
    assert.ok(candidate.weight < quarterCandidate.weight);
    const question = questions.build(snap, 'half-read');
    assert.equal(question.answer.value, quarter <= 2 ? '1st half' : '2nd half');
    assert.equal(question.choices.length, 4);
    assert.ok(question.choices.filter((choice) => choice.id !== question.correctChoiceId).length >= 2);
    assert.deepEqual(plain(question.bindings), [{
      id: 'quarter', source: { kind: 'context', path: '/context/quarter' }, value: quarter,
    }]);
    verifyGrounding(questions, snap, question);
  }

  for (const score of [10, 14, 19]) {
    const snap = makeSnap(domain, { scores: { player: score, opponent: 7 } }, 4);
    for (const familyId of ['committed-score-tens', 'committed-score-ones']) {
      const question = questions.build(snap, familyId);
      const targetPlace = familyId.endsWith('tens') ? 'tens' : 'ones';
      assert.equal(question.bindings[0].source.path, '/context/scores/player');
      assert.equal(question.bindings[0].value, score);
      assert.equal(question.answer.value, targetPlace === 'tens' ? Math.floor(score / 10) : score % 10);
      assert.equal(question.visuals.initial.data.score, score);
      assert.equal(question.visuals.initial.data[targetPlace], null);
      assert.equal(question.visuals.guided.data[targetPlace], null);
      assert.equal(question.visuals.worked.data[targetPlace], question.answer.value);
      assert.doesNotMatch([
        question.prompt.text,
        question.hint.text,
        question.workedExplanation.text,
      ].join(' '), /7\s*\+\s*7|two touchdowns/i);
      verifyGrounding(questions, snap, question);
    }
  }

  const playerPreferred = makeSnap(domain, { scores: { player: 14, opponent: 19 } }, 4);
  assert.equal(
    questions.build(playerPreferred, 'committed-score-ones').bindings[0].source.path,
    '/context/scores/player',
  );
  const opponentFallback = makeSnap(domain, {
    possession: 'defense', direction: -1, yardLine: 70, firstDownLine: 60,
    driveStart: 80, scores: { player: 7, opponent: 14 },
  }, 4);
  const fallback = questions.build(opponentFallback, 'committed-score-ones');
  assert.equal(fallback.bindings[0].source.path, '/context/scores/opponent');
  assert.equal(fallback.visuals.initial.data.team, 'UNC');
  const fallbackTens = questions.build(opponentFallback, 'committed-score-tens');
  assert.equal(fallbackTens.bindings[0].source.path, '/context/scores/opponent');
  assert.equal(fallbackTens.answer.value, 1);
  assert.equal(fallbackTens.visuals.initial.data.team, 'UNC');

  for (const scores of [{ player: 9, opponent: 7 }, { player: 20, opponent: 21 }]) {
    const snap = makeSnap(domain, { scores }, 4);
    const inspection = questions.inspect(snap);
    for (const familyId of ['committed-score-tens', 'committed-score-ones']) {
      assert.equal(inspection.eligible.some((entry) => entry.familyId === familyId), false);
      assert.equal(
        inspection.declined.find((entry) => entry.familyId === familyId)?.reason.code,
        'no-committed-teen-score',
      );
    }
  }

  const touchdownWithFourteen = makeSnap(domain, {
    yardLine: 95, firstDownLine: 100, yardsToGo: 5, driveStart: 90,
    scores: { player: 14, opponent: 7 },
  }, 20);
  const touchdownQuestion = questions.build(touchdownWithFourteen, 'committed-score-ones');
  assert.equal(touchdownQuestion.bindings[0].value, 14);
  assert.equal(touchdownQuestion.answer.value, 4);
  assert.doesNotMatch(touchdownQuestion.prompt.text, /21|7\s*\+\s*7/i);
});

test('every team-labelled question path derives names only from the public match descriptor', () => {
  const { domain, questions } = loadModules();
  const customMatch = {
    schemaVersion: 1,
    player: { id: 'duke', displayName: 'Blue Devils', shortName: 'BLUE DEVILS', endZoneName: 'DUKE' },
    opponent: { id: 'wake-forest', displayName: 'Wake Forest', shortName: 'WAKE FOREST', endZoneName: 'WAKE' },
  };
  const scoreSnap = makeSnap(domain, {
    match: customMatch,
    scores: { player: 3, opponent: 4 },
  }, 4);
  const total = questions.build(scoreSnap, 'committed-score-total');
  const difference = questions.build(scoreSnap, 'committed-score-difference');
  const teenSnap = makeSnap(domain, {
    match: customMatch,
    scores: { player: 7, opponent: 14 },
  }, 4);
  const teen = questions.build(teenSnap, 'committed-score-ones');
  const opponentYardsSnap = makeSnap(domain, {
    match: customMatch,
    possession: 'defense', direction: -1, yardLine: 70, firstDownLine: 60,
    driveStart: 80, totalYards: { player: 83, opponent: 99 },
    privateOpponentSnapshot: {
      opponentId: 'wake-forest',
      profileKey: 'quickPass',
      plannedCallKey: 'shortPass',
    },
  }, 2);
  const opponentYards = questions.build(opponentYardsSnap, 'team-yards-past-100');

  const publicCopy = JSON.stringify({ total, difference, teen, opponentYards });
  assert.match(publicCopy, /Blue Devils/);
  assert.match(publicCopy, /WAKE FOREST/);
  assert.doesNotMatch(publicCopy, /\bUNC\b|\bDuke\b/);
  assert.equal(teen.bindings[0].source.path, '/context/scores/opponent');
  assert.deepEqual(plain(total.bindings.map(binding => binding.source.path)), [
    '/context/scores/player', '/context/scores/opponent',
  ]);
  assert.deepEqual(plain(difference.bindings.map(binding => binding.source.path)), [
    '/context/scores/player', '/context/scores/opponent',
  ]);
  assert.equal(teen.visuals.initial.data.team, 'WAKE FOREST');
  assert.equal(teen.visuals.initial.data.teamRole, 'opponent');
  assert.equal(opponentYards.visuals.initial.data.team, 'WAKE FOREST');
  assert.equal(opponentYards.visuals.initial.data.teamRole, 'opponent');
});

test('whole-ten movement families accept exact 10 and 20 yard moves but never by-five moves', () => {
  const { domain, questions } = loadModules();
  for (const direction of [1, -1]) {
    const base = direction === 1
      ? { possession: 'offense', direction: 1, yardLine: 30, firstDownLine: 35, yardsToGo: 5, driveStart: 20 }
      : { possession: 'defense', direction: -1, yardLine: 70, firstDownLine: 65, yardsToGo: 5, driveStart: 80 };
    for (const gain of [10, 20]) {
      const snap = makeSnap(domain, base, gain);
      const ids = questions.inspect(snap).eligible.map((entry) => entry.familyId);
      for (const familyId of ['goal-distance-minus-whole-tens', 'drive-distance-plus-whole-tens']) {
        assert.ok(ids.includes(familyId), `${familyId} should accept ${gain} yards in direction ${direction}`);
        verifyGrounding(questions, snap, questions.build(snap, familyId));
      }
    }
    for (const gain of [5, 15, 25]) {
      const snap = makeSnap(domain, base, gain);
      const ids = questions.inspect(snap).eligible.map((entry) => entry.familyId);
      assert.equal(ids.includes('goal-distance-minus-whole-tens'), false);
      assert.equal(ids.includes('drive-distance-plus-whole-tens'), false);
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
    [comparison, ['gain-vs-needed-comparison']],
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
  assert.equal(eligibleIds.includes('committed-score-tens'), true);
  assert.equal(eligibleIds.includes('committed-score-ones'), true);
  for (const forbidden of [
    'compare-two-digit-preview',
    'hundred-chart-small-move',
    'add-within-10',
    'clock-read',
    'am-pm',
    'calendar-read',
    'sack-loss',
    'down-read',
    'drive-play-ordinal',
  ]) {
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

test('goal-distance place-value questions use plain football copy and hide the requested digit count', () => {
  const { domain, questions } = loadModules();
  const snap = makeSnap(domain, {
    yardLine: 86,
    firstDownLine: 96,
    yardsToGo: 10,
    driveStart: 80,
  }, 3);

  for (const familyId of ['goal-distance-tens', 'goal-distance-ones']) {
    const question = questions.build(snap, familyId);
    assert.equal(question.answerExposure, 'modeled-with-result-hidden');
    assert.equal(question.visuals.initial.revealsAnswer, false);
    assert.equal(question.visuals.initial.result, null);
    assert.equal(question.visuals.guided.revealsAnswer, false);
    assert.equal(question.visuals.guided.result, null);
    const requestedField = familyId.endsWith('tens') ? 'tens' : 'ones';
    assert.equal(question.visuals.initial.data[requestedField], null);
    assert.equal(question.visuals.guided.data[requestedField], null);
    assert.equal(question.visuals.worked.data[requestedField], question.answer.value);
    assert.doesNotMatch(question.prompt.text, /goal-distance (model|strip)/i);
    assert.doesNotMatch(question.hint.text, /goal-distance (model|strip)/i);
    assert.match(question.prompt.text, new RegExp(`What digit is in the ${familyId.endsWith('tens') ? 'tens' : 'ones'} place`, 'i'));
    assert.doesNotMatch(question.prompt.text, /How many (?:tens|ones) are in/i);
  }

  const readQuestion = questions.build(snap, 'goal-distance-read');
  const readCopy = [
    readQuestion.prompt.text,
    readQuestion.hint.text,
    ...Object.values(readQuestion.visuals).map(visual => visual.ariaLabel),
  ].join(' ');
  assert.doesNotMatch(readCopy, /goal-distance (model|strip)/i);

  const oneYardSnap = makeSnap(domain, {
    yardLine: 99,
    firstDownLine: 100,
    yardsToGo: 1,
    driveStart: 90,
  }, 1);
  const oneYardRead = questions.build(oneYardSnap, 'goal-distance-read');
  assert.match(oneYardRead.visuals.initial.ariaLabel, /1 yard,/i);
  assert.doesNotMatch(oneYardRead.visuals.initial.ariaLabel, /1 yards/i);
  assert.doesNotMatch(oneYardRead.visuals.guided.ariaLabel, /both digits/i);

  const maximumLegalDistance = makeSnap(domain, {
    yardLine: 1,
    firstDownLine: 11,
    yardsToGo: 10,
    driveStart: 1,
  }, 1);
  for (const familyId of ['goal-distance-tens', 'goal-distance-ones']) {
    const question = questions.build(maximumLegalDistance, familyId);
    assert.equal(question.visuals.initial.data.distance, 99);
    assert.ok(question.choices.every((choice) => Number.isInteger(choice.value)
      && choice.value >= 0 && choice.value <= 9));
    assert.ok(question.choices.some((choice) => choice.id === question.correctChoiceId));
  }

  const malformedHundredYardSnap = plain(maximumLegalDistance);
  malformedHundredYardSnap.context.yardLine = 0;
  malformedHundredYardSnap.context.driveStart = 0;
  malformedHundredYardSnap.context.firstDownLine = 10;
  malformedHundredYardSnap.proposal.startYardLine = 0;
  malformedHundredYardSnap.proposal.endYardLine = 1;
  const malformedInspection = questions.inspect(malformedHundredYardSnap);
  assert.equal(malformedInspection.eligible.length, 0);
  for (const familyId of ['goal-distance-tens', 'goal-distance-ones']) {
    assert.equal(
      malformedInspection.declined.find((entry) => entry.familyId === familyId)?.reason.code,
      'invalid-yard-line',
    );
  }
});

test('singular boundary states use child-facing yard and space grammar', () => {
  const { domain, questions } = loadModules();
  const oneYard = makeSnap(domain, {
    yardLine: 30,
    firstDownLine: 31,
    yardsToGo: 1,
    driveStart: 29,
  }, 1);
  const oneYardCopy = [
    'yards-to-go-read',
    'line-to-gain-exact',
    'gain-vs-needed-comparison',
    'drive-distance-scaffolded',
    'next-down',
  ].map((familyId) => {
    const question = questions.build(oneYard, familyId);
    return [
      question.prompt.text,
      question.hint.text,
      question.workedExplanation.text,
      ...Object.values(question.visuals).map((visual) => visual.ariaLabel),
    ].join(' ');
  }).join(' ');
  assert.match(oneYardCopy, /1 yard is needed/i);
  assert.match(oneYardCopy, /1 yard to go/i);

  const oneYardMissingPart = questions.build(makeSnap(domain, {
    yardLine: 30,
    firstDownLine: 32,
    yardsToGo: 2,
    driveStart: 29,
  }, 1), 'line-to-gain-missing-part');
  assert.match(oneYardMissingPart.prompt.text, /gains 1 yard/i);
  assert.match(oneYardMissingPart.visuals.initial.ariaLabel, /1 yard marked/i);

  const oneYardTeamGain = questions.build(makeSnap(domain, {
    totalYards: { player: 99, opponent: 71 },
  }, 1), 'team-yards-past-100');
  assert.match(oneYardTeamGain.prompt.text, /gains 1 yard/i);
  assert.match(oneYardTeamGain.visuals.initial.ariaLabel, /with 1 yard possible/i);

  const oneYardDrive = questions.build(oneYard, 'drive-distance-scaffolded');
  assert.match(oneYardDrive.workedExplanation.text, /There is 1 space.*moved 1 yard/i);
  assert.match(oneYardDrive.visuals.worked.ariaLabel, /1 yard apart/i);

  const oneYardFromGoal = questions.build(makeSnap(domain, {
    yardLine: 89,
    firstDownLine: 94,
    yardsToGo: 5,
    driveStart: 80,
  }, 10), 'goal-distance-minus-whole-tens');
  assert.match(oneYardFromGoal.workedExplanation.text, /leave 1 yard to the end zone/i);
  assert.match(oneYardFromGoal.visuals.worked.ariaLabel, /is 1 yard from the end zone/i);

  const allCopy = [
    oneYardCopy,
    oneYardMissingPart.prompt.text,
    oneYardMissingPart.visuals.initial.ariaLabel,
    oneYardTeamGain.prompt.text,
    oneYardTeamGain.visuals.initial.ariaLabel,
    oneYardDrive.workedExplanation.text,
    oneYardDrive.visuals.worked.ariaLabel,
    oneYardFromGoal.workedExplanation.text,
    oneYardFromGoal.visuals.worked.ariaLabel,
  ].join(' ');
  assert.doesNotMatch(allCopy, /\b1 (?:yards|spaces|yard spaces|single yards)\b|\b1 yard are\b|\bThere are 1\b/i);
});

test('child-facing contextual copy avoids implementation jargon', () => {
  const { domain, questions } = loadModules();
  const snap = makeSnap(domain, {
    quarter: 3,
    down: 4,
    yardLine: 30,
    firstDownLine: 35,
    yardsToGo: 5,
    driveStart: 20,
    drivePlays: 2,
    scores: { player: 3, opponent: 4 },
  }, 10);
  const familyIds = [
    'yards-to-go-read',
    'gain-vs-needed-comparison',
    'goal-distance-read',
    'goal-distance-tens',
    'goal-distance-ones',
    'drive-distance-scaffolded',
    'committed-score-total',
    'committed-score-difference',
    'half-read',
    'quarter-read',
    'next-down',
    'goal-distance-minus-whole-tens',
    'drive-distance-plus-whole-tens',
  ];
  const jargon = /goal-distance (?:model|strip)|committed score|committed points|drive-start marker|current-ball marker|separate drive strip|ampersand|down-and-distance display|ordinal(?: quarter)? name|this exact play|proposed (?:gain|yard|play|move|addition)|committed drive|drive model/i;

  for (const familyId of familyIds) {
    const question = questions.build(snap, familyId);
    const copy = [
      question.prompt.text,
      question.hint.text,
      question.workedExplanation.text,
      question.workedReview.title,
      question.workedReview.goal.text,
      ...question.workedReview.steps.flatMap((step) => [step.text, step.ariaLabel]),
      question.workedReview.footballMeaning.text,
      ...Object.values(question.visuals).map(visual => visual.ariaLabel),
    ].join(' ');
    assert.doesNotMatch(copy, jargon, familyId);
  }

  const teenSnap = makeSnap(domain, {
    quarter: 3,
    scores: { player: 14, opponent: 7 },
  }, 4);
  for (const familyId of ['committed-score-tens', 'committed-score-ones']) {
    const question = questions.build(teenSnap, familyId);
    const copy = [
      question.prompt.text,
      question.hint.text,
      question.workedExplanation.text,
      ...Object.values(question.visuals).map(visual => visual.ariaLabel),
    ].join(' ');
    assert.doesNotMatch(copy, jargon, familyId);
  }
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

  for (const invalidId of [null, 0, '   ']) {
    const invalidIdentity = plain(valid);
    invalidIdentity.contextId = invalidId;
    invalidIdentity.context.contextId = invalidId;
    invalidIdentity.proposal.contextId = invalidId;
    const inspection = questions.inspect(invalidIdentity);
    assert.equal(inspection.eligible.length, 0, String(invalidId));
    assert.ok(inspection.declined.every(entry => entry.reason.code === 'invalid-context-identity'));
  }

  for (const alteredMatch of [
    { ...matchDescriptor(), privateProfile: 'balanced' },
    { ...matchDescriptor(), player: { ...matchDescriptor().player, privateRating: 99 } },
    { ...matchDescriptor(), opponent: { ...matchDescriptor().opponent, profileKey: 'balanced' } },
  ]) {
    const nestedExtra = plain(valid);
    nestedExtra.context.match = alteredMatch;
    const inspection = questions.inspect(nestedExtra);
    assert.equal(inspection.eligible.length, 0);
    assert.ok(inspection.declined.every(entry => entry.reason.code === 'invalid-match'));
  }
});

test('selected-call affinity is possession-scoped, immutable, and independent of private opponent data', () => {
  const { domain, questions } = loadModules();
  const offense = makeSnap(domain, {
    possession: 'offense',
    calls: { offense: 'shortRun', defense: null, matchup: null },
  }, 4);
  const offenseSelection = questions.selectionFor(offense, 'line-to-gain-missing-part');
  assert.deepEqual(plain(offenseSelection), {
    strategy: 'selected-call-affinity-v1',
    role: 'offense',
    selectedCallId: 'offense:shortRun',
    multiplier: 1.75,
  });
  assert.equal(deepFrozen(offenseSelection), true);

  const defenseContext = {
    possession: 'defense',
    direction: -1,
    calls: { offense: 'longPass', defense: 'run', matchup: 'mismatch' },
  };
  const firstDefense = makeSnap(domain, {
    ...defenseContext,
    privateOpponentSnapshot: {
      opponentId: 'unc', profileKey: 'balanced', plannedCallKey: 'longPass', secret: 'first',
    },
  }, 4);
  const secondDefense = makeSnap(domain, {
    ...defenseContext,
    calls: { offense: 'shortPass', defense: 'run', matchup: 'matched' },
    privateOpponentSnapshot: {
      opponentId: 'unc', profileKey: 'balanced', plannedCallKey: 'shortPass', secret: 'second',
    },
  }, 4);
  assert.deepEqual(
    plain(questions.selectionFor(firstDefense, 'line-to-gain-missing-part')),
    plain(questions.selectionFor(secondDefense, 'line-to-gain-missing-part')),
  );
  assert.equal(questions.selectionFor(firstDefense, 'goal-distance-tens').multiplier, 1);

  const unknown = makeSnap(domain, {
    calls: { offense: 'unknown-call', defense: null, matchup: null },
  }, 4);
  assert.deepEqual(plain(questions.selectionFor(unknown, 'line-to-gain-missing-part')), {
    strategy: 'selected-call-affinity-v1',
    role: 'offense',
    selectedCallId: null,
    multiplier: 1,
  });
});

test('call affinity annotates but never filters the truthful eligible pool', () => {
  const { domain, questions } = loadModules();
  const shortRun = makeSnap(domain, {
    calls: { offense: 'shortRun', defense: null, matchup: null },
  }, 4);
  const unknown = makeSnap(domain, {
    calls: { offense: 'unknown-call', defense: null, matchup: null },
  }, 4);
  const boosted = questions.inspect(shortRun);
  const neutral = questions.inspect(unknown);
  assert.deepEqual(
    boosted.eligible.map((entry) => entry.familyId),
    neutral.eligible.map((entry) => entry.familyId),
  );
  assert.deepEqual(plain(boosted.declined), plain(neutral.declined));

  const candidate = boosted.eligible.find((entry) => entry.familyId === 'line-to-gain-missing-part');
  const question = questions.build(shortRun, candidate.familyId);
  assert.deepEqual(plain(question.selection), plain(questions.selectionFor(shortRun, candidate.familyId)));
  assert.equal(question.selection.multiplier, 1.75);
  assert.equal(deepFrozen(question.selection), true);
});
