import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const opponentSource = await readFile(new URL('../football/opponent.js', import.meta.url), 'utf8');
const domainSource = await readFile(new URL('../football/football-domain.js', import.meta.url), 'utf8');
const copySource = await readFile(new URL('../football/copy.js', import.meta.url), 'utf8');
const questionsSource = await readFile(new URL('../football/contextual-questions.js', import.meta.url), 'utf8');

function loadModules() {
  const context = vm.createContext({});
  vm.runInContext(opponentSource, context, { filename: 'opponent.js' });
  vm.runInContext(domainSource, context, { filename: 'football-domain.js' });
  vm.runInContext(copySource, context, { filename: 'copy.js' });
  vm.runInContext(questionsSource, context, { filename: 'contextual-questions.js' });
  return {
    domain: context.FOOTBALL_DOMAIN,
    fieldPosition: context.FOOTBALL_FIELD_POSITION,
    opponent: vm.runInContext('FOOTBALL_OPPONENT', context),
    questions: context.FOOTBALL_CONTEXTUAL_QUESTIONS,
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// #51: the eight quarter and half families, all independent evidence.
const QUARTER_HALF_FAMILY_IDS = [
  'quarters-still-to-come', 'quarters-before-halftime', 'quarters-finished', 'quarters-in-half',
  'second-half-quarters', 'game-part-boundary', 'halves-make-whole', 'game-part-compare',
];

function completedArithmeticSnaps(domain) {
  return [
    makeSnap(domain, { yardLine: 53, yardsToGo: 17, firstDownLine: 70,
      scores: { player: 7, opponent: 6 }, totalYards: { player: 7, opponent: 6 } }, 6),
    makeSnap(domain, { yardLine: 53, yardsToGo: 17, firstDownLine: 70,
      scores: { player: 23, opponent: 4 }, totalYards: { player: 23, opponent: 14 } }, 4),
    makeSnap(domain, { scores: { player: 27, opponent: 4 } }, 4),
  ];
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
    case 'subtract': return operands[0] - operands[1];
    // #51 quarters and halves of one four-quarter game; halves split it in two.
    case 'quartersAfterCurrent': return operands[1] - operands[0];
    case 'quartersBeforeHalftime': return operands[1] / 2 - operands[0];
    case 'quartersFinished': return operands[0] - 1;
    case 'quartersInHalf': return operands[0] / 2;
    case 'secondHalfQuarters': return `${({ 3: '3rd' })[operands[0] / 2 + 1]} and ${({ 4: '4th' })[operands[0]]}`;
    case 'gamePartAtBoundary': {
      const [quarter, regulation] = operands;
      const counted = quarter === regulation - 1 ? regulation - quarter : quarter;
      return ({ 1: 'One quarter', 2: 'One half' })[counted * 4 / regulation];
    }
    case 'halvesMakeWhole': return 2 * (operands[0] / 2) === operands[0] ? 'One whole game' : null;
    case 'compareGameParts': {
      const [quarter, regulation] = operands;
      const half = regulation / 2;
      const [first, second] = quarter <= 2 ? [[half, 'One half'], [1, 'One quarter']]
        : quarter === 3 ? [[2, 'Two quarters'], [half, 'One half']] : [[half, 'One half'], [3, 'Three quarters']];
      return first[0] === second[0] ? 'Same size' : first[0] > second[0] ? first[1] : second[1];
    }
    default: throw new Error(`Unknown operation ${question.operation.type}`);
  }
}

function verifyGrounding(questions, snap, question) {
  assert.equal(question.schemaVersion, 3);
  assert.equal(question.id, question.familyId);
  assert.equal(question.bindings, question.premises, 'premises must alias canonical bindings');
  assert.ok(questions.OPERATION_TYPES.includes(question.operation.type));
  assert.ok(questions.ANSWER_EXPOSURE_POLICIES.includes(question.answerExposure));
  assert.ok(questions.EVIDENCE_CLASSES.includes(question.evidenceClass));
  if (question.answerExposure === 'source-visible') assert.equal(question.evidenceClass, 'literacy');
  if (question.evidenceClass === 'independent') {
    assert.notEqual(question.answerExposure, 'source-visible');
    for (const stage of ['initial', 'guided']) {
      assert.equal(question.visuals[stage].revealsAnswer, false, `${question.familyId}:${stage}`);
      assert.equal(question.visuals[stage].result, null, `${question.familyId}:${stage}`);
    }
  }

  for (const binding of question.bindings) {
    if (binding.source.kind === 'context') {
      assert.equal(binding.source.path.startsWith('/context/privateOpponentSnapshot'), false);
      assert.deepEqual(plain(binding.value), plain(pointer(snap, binding.source.path)), `${question.familyId}:${binding.id}`);
    } else if (binding.source.kind === 'challengeFixture') {
      // #186: generated operands dereference only into the fixture recomputed
      // from the same frozen play and family.
      const trusted = questions.twoPointChallengeFor(snap, question.familyId);
      assert.ok(trusted, `${question.familyId}:${binding.id} needs a trusted fixture`);
      assert.deepEqual(plain(binding.source), { kind: 'challengeFixture', path: binding.source.path });
      assert.deepEqual(plain(binding.value), plain(pointer(trusted, binding.source.path)), `${question.familyId}:${binding.id}`);
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
  assert.equal(questions.SCHEMA_VERSION, 3);
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
  assert.deepEqual(plain(questions.EVIDENCE_CLASSES), ['literacy', 'independent']);
  assert.deepEqual(plain(questions.CURRICULUM_SOURCES), ['workbook', 'football-only', 'requested-challenge']);
});

test('field-position copy strictly normalizes canonical coordinates for every public rival', () => {
  const { fieldPosition, opponent } = loadModules();
  const rivals = opponent.listRivals();
  assert.equal(Object.isFrozen(fieldPosition), true);
  assert.deepEqual(plain(rivals.map(rival => rival.endZoneName)), ['CAROLINA', 'NC STATE', 'WAKE']);
  for (const rival of rivals) {
    const match = opponent.createMatch(rival.id);
    const boundaries = [
      {
        absoluteYard: 0, territoryRole: 'player', yardNumber: 0, ownerRole: 'player',
        compact: 'DUKE GOAL LINE', full: "Duke's goal line",
        ownerAware: 'DUKE goal line', ball: 'Duke ball at DUKE goal line',
        namedGoalLine: 'DUKE goal line', namedEndZone: 'DUKE end zone',
      },
      {
        absoluteYard: 1, territoryRole: 'player', yardNumber: 1, ownerRole: 'player',
        compact: 'DUKE 1', full: "Duke's 1-yard line",
        ownerAware: "Duke's own 1-yard line", ball: "Duke ball at Duke's own 1-yard line",
        namedGoalLine: null, namedEndZone: null,
      },
      {
        absoluteYard: 49, territoryRole: 'player', yardNumber: 49, ownerRole: 'player',
        compact: 'DUKE 49', full: "Duke's 49-yard line",
        ownerAware: "Duke's own 49-yard line", ball: "Duke ball at Duke's own 49-yard line",
        namedGoalLine: null, namedEndZone: null,
      },
      {
        absoluteYard: 50, territoryRole: null, yardNumber: 50, ownerRole: 'player',
        compact: '50', full: 'the 50-yard line', ownerAware: 'the 50-yard line',
        ball: 'Duke ball at the 50-yard line', namedGoalLine: null, namedEndZone: null,
      },
      {
        absoluteYard: 51, territoryRole: 'opponent', yardNumber: 49, ownerRole: 'opponent',
        compact: `${rival.shortName} 49`, full: `${rival.displayName}'s 49-yard line`,
        ownerAware: `${rival.shortName}'s own 49-yard line`,
        ball: `${rival.displayName} ball at ${rival.shortName}'s own 49-yard line`,
        namedGoalLine: null, namedEndZone: null,
      },
      {
        absoluteYard: 99, territoryRole: 'opponent', yardNumber: 1, ownerRole: 'opponent',
        compact: `${rival.shortName} 1`, full: `${rival.displayName}'s 1-yard line`,
        ownerAware: `${rival.shortName}'s own 1-yard line`,
        ball: `${rival.displayName} ball at ${rival.shortName}'s own 1-yard line`,
        namedGoalLine: null, namedEndZone: null,
      },
      {
        absoluteYard: 100, territoryRole: 'opponent', yardNumber: 0, ownerRole: 'opponent',
        compact: `${rival.shortName} GOAL LINE`, full: `${rival.displayName}'s goal line`,
        ownerAware: `${rival.endZoneName} goal line`,
        ball: `${rival.displayName} ball at ${rival.endZoneName} goal line`,
        namedGoalLine: `${rival.endZoneName} goal line`, namedEndZone: `${rival.endZoneName} end zone`,
      },
    ];
    for (const expected of boundaries) {
      const position = fieldPosition.describe(expected.absoluteYard, match, expected.ownerRole);
      assert.deepEqual(plain(position), {
        absoluteYard: expected.absoluteYard,
        territoryRole: expected.territoryRole,
        yardNumber: expected.yardNumber,
        isMidfield: expected.absoluteYard === 50,
        isGoalLine: expected.absoluteYard === 0 || expected.absoluteYard === 100,
        compact: expected.compact,
        full: expected.full,
        midfield: 'the 50-yard line',
        namedGoalLine: expected.namedGoalLine,
        namedEndZone: expected.namedEndZone,
        ownerRole: expected.ownerRole,
        ownerAware: expected.ownerAware,
        ball: expected.ball,
      });
      assert.equal(deepFrozen(position), true);
      const { ownerRole, ownerAware, ball, ...expectedFacts } = plain(position);
      assert.deepEqual(plain(fieldPosition.facts(expected.absoluteYard, match)), expectedFacts);
      assert.equal(deepFrozen(fieldPosition.facts(expected.absoluteYard, match)), true);
    }
  }

  const match = opponent.createMatch('unc');
  assert.throws(() => fieldPosition.describe(-1, match), error => error?.name === 'RangeError');
  assert.throws(() => fieldPosition.describe(101, match), error => error?.name === 'RangeError');
  assert.throws(() => fieldPosition.describe(43.5, match), error => error?.name === 'TypeError');
  assert.throws(() => fieldPosition.describe('43', match), error => error?.name === 'TypeError');
  assert.throws(() => fieldPosition.describe(43, { ...match, extra: true }), error => error?.name === 'TypeError');
  assert.throws(() => fieldPosition.describe(43, match, 'offense'), error => error?.name === 'TypeError');
});

test('committed score difference orders player-high, opponent-high, and nonzero ties as high minus low', () => {
  const { domain, questions } = loadModules();
  const cases = [
    {
      scores: { player: 7, opponent: 3 }, answer: 4,
      data: { highLabel: 'Duke', highRole: 'player', highScore: 7, lowLabel: 'UNC', lowRole: 'opponent', lowScore: 3, difference: null },
      aria: 'Duke 7 minus UNC 3; the difference is hidden.',
    },
    {
      scores: { player: 3, opponent: 7 }, answer: 4,
      data: { highLabel: 'UNC', highRole: 'opponent', highScore: 7, lowLabel: 'Duke', lowRole: 'player', lowScore: 3, difference: null },
      aria: 'UNC 7 minus Duke 3; the difference is hidden.',
    },
    {
      scores: { player: 4, opponent: 4 }, answer: 0,
      data: { highLabel: 'Duke', highRole: 'player', highScore: 4, lowLabel: 'UNC', lowRole: 'opponent', lowScore: 4, difference: null },
      aria: 'Duke 4 minus UNC 4; the difference is hidden.',
    },
  ];
  for (const scenario of cases) {
    const snap = makeSnap(domain, { scores: scenario.scores }, 4);
    const question = questions.build(snap, 'committed-score-difference');
    assert.equal(question.answer.value, scenario.answer);
    assert.deepEqual(plain(question.visuals.initial.data), scenario.data);
    assert.equal(question.visuals.initial.ariaLabel, scenario.aria);
    assert.equal(question.visuals.initial.revealsAnswer, false);
    assert.equal(question.visuals.initial.result, null);
    verifyGrounding(questions, snap, question);
  }
});

test('every family authors the exact evidence class and independent families hide structural results', () => {
  const { domain, questions } = loadModules();
  const expected = {
    literacy: [
      'yards-to-go-read',
      'goal-distance-tens',
      'goal-distance-ones',
      'committed-score-tens',
      'committed-score-ones',
      'quarter-read',
      'conversion-attempt-value',
      'conversion-try-marker',
      'field-goal-attempt-distance',
      'field-goal-point-value',
      'punt-travel-distance',
      'punt-landing-spot',
    ],
    independent: [
      'score-total-ch8', 'score-difference-ch8', 'team-yards-add-ch8', 'line-remaining-ch8', 'goal-remaining-ch8',
      'score-total-ch8-within-20', 'score-total-ch8-ones-add',
      'team-yards-add-ch8-within-20', 'team-yards-add-ch8-ones-add',
      'score-difference-ch8-ones-subtract', 'line-remaining-ch8-ones-subtract', 'goal-remaining-ch8-ones-subtract',
      'line-to-gain-missing-part',
      'line-to-gain-exact',
      'line-to-gain-surplus',
      'line-to-gain-surplus-ch8',
      'line-to-gain-surplus-ch8-ones-subtract',
      'line-to-gain-fact-family',
      'gain-vs-needed-comparison',
      'team-yards-past-100',
      'drive-distance-scaffolded',
      'committed-score-total',
      'committed-score-difference',
      'half-read',
      'next-down',
      'goal-distance-minus-whole-tens',
      'drive-distance-plus-whole-tens',
      'touchdown-base-points',
      'two-point-three-digit-add',
      'two-point-three-digit-subtract',
      ...QUARTER_HALF_FAMILY_IDS,
    ],
  };
  const registry = Object.values(questions.FAMILY_REGISTRY).flat();
  for (const evidenceClass of questions.EVIDENCE_CLASSES) {
    assert.deepEqual(
      registry.filter((entry) => entry.evidenceClass === evidenceClass).map((entry) => entry.familyId).sort(),
      [...expected[evidenceClass]].sort(),
    );
  }
  // #186 deliberately adds the two player two-point challenge families; #51
  // adds the two wider past-marker yardage families and the eight quarter and
  // half families.
  assert.equal(registry.length, 50);
  assert.equal(Object.isFrozen(registry[0]), true);

  const comparisonSource = makeSnap(domain, { yardsToGo: 14, firstDownLine: 44, scores: { player: 14, opponent: 7 } }, 7);
  const scenarios = [
    ...completedArithmeticSnaps(domain),
    comparisonSource,
    makeSnap(domain, { quarter: 1 }, 4),
    makeSnap(domain, { down: 3, yardsToGo: 8, firstDownLine: 38 }, 13),
    makeSnap(domain, { down: 3, yardsToGo: 7, firstDownLine: 37 }, 18),
    makeSnap(domain, {
      quarter: 3, down: 2, yardLine: 30, firstDownLine: 35, yardsToGo: 5,
      driveStart: 25, scores: { player: 3, opponent: 4 }, totalYards: { player: 83, opponent: 71 },
    }, 3),
    makeSnap(domain, { down: 2, yardLine: 30, firstDownLine: 35, yardsToGo: 5, driveStart: 25 }, 5),
    makeSnap(domain, { down: 2, yardLine: 30, firstDownLine: 35, yardsToGo: 5, driveStart: 25 }, 7),
    makeSnap(domain, {
      down: 2, yardLine: 30, firstDownLine: 35, yardsToGo: 5,
      driveStart: 25, totalYards: { player: 99, opponent: 71 },
    }, 2),
    makeSnap(domain, {
      quarter: 3, down: 2, yardLine: 30, firstDownLine: 35, yardsToGo: 5,
      driveStart: 20, scores: { player: 14, opponent: 7 },
    }, 10),
    makeSnap(domain, {
      down: 2, yardLine: 95, firstDownLine: 100, yardsToGo: 5, driveStart: 90,
    }, 5),
    makeSpecialPlay(domain, 'conversion', { attemptType: 'pat' }),
    makeSpecialPlay(domain, 'conversion', { attemptType: 'twoPoint', possession: 'defense' }),
    makeSpecialPlay(domain, 'conversion', { attemptType: 'twoPoint', possession: 'offense' }),
    makeSpecialPlay(domain, 'fieldGoal'),
    makeSpecialPlay(domain, 'punt', { yardLine: 30, travelYards: 40 }),
  ];
  const builtById = new Map();
  for (const source of scenarios) {
    for (const candidate of questions.inspect(source).eligible) {
      if (!builtById.has(candidate.familyId)) {
        builtById.set(candidate.familyId, questions.build(source, candidate.familyId));
      }
    }
  }
  // #51: live inspection no longer offers the retired comparison or quarter
  // label reading, but their direct builds keep the same classification for
  // history and review.
  assert.deepEqual(plain(questions.RETIRED_LIVE_FAMILIES), ['gain-vs-needed-comparison', 'quarter-read']);
  assert.equal(builtById.has('quarter-read'), false);
  assert.equal(questions.build(comparisonSource, 'quarter-read').evidenceClass, 'literacy');
  assert.equal(builtById.has('gain-vs-needed-comparison'), false);
  builtById.set('gain-vs-needed-comparison', questions.build(comparisonSource, 'gain-vs-needed-comparison'));
  for (const familyId of expected.independent) {
    const question = builtById.get(familyId);
    assert.ok(question, `build independent family ${familyId}`);
    assert.equal(question.evidenceClass, 'independent');
    assert.notEqual(question.answerExposure, 'source-visible');
    for (const stage of ['initial', 'guided']) {
      assert.equal(question.visuals[stage].revealsAnswer, false, `${familyId}:${stage}`);
      assert.equal(question.visuals[stage].result, null, `${familyId}:${stage}`);
    }
    assert.throws(() => { question.evidenceClass = 'literacy'; }, TypeError);
  }
});

test('inspect preserves page-145 completion while capping approved question content at page 179', () => {
  const { domain, questions } = loadModules();
  const snap = makeSnap(domain, { driveStart: 27 }, 4);
  const first = questions.inspect(snap, { completedThroughPage: 999, includedThroughPage: 999, computationMax: 99, displayMax: 999 });
  const second = questions.inspect(snap, { completedThroughPage: 999, includedThroughPage: 999, computationMax: 99, displayMax: 999 });
  assert.deepEqual(plain(first), plain(second));
  assert.equal(first.schemaVersion, 3);
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

test('yards-to-go reading keeps the source value out of the prompt and in the accessible graphic', () => {
  const { domain, questions } = loadModules();
  const snap = makeSnap(domain, {
    down: 3,
    yardLine: 30,
    firstDownLine: 37,
    yardsToGo: 7,
  }, 3);
  const question = questions.build(snap, 'yards-to-go-read');

  assert.equal(question.answerExposure, 'source-visible');
  assert.equal(
    question.prompt.text,
    'Read the down-and-distance scoreboard. How many yards are needed for a first down?',
  );
  assert.doesNotMatch(question.prompt.text, /\b7\b/);
  assert.match(question.visuals.initial.ariaLabel, /\b7 yards?\b/i);
  assert.match(question.hint.text, /number after the & sign/i);
  assert.match(question.workedExplanation.text, /3rd & 7 means 7 yards are needed/i);
});

test('every exported family builds one exact, grounded, recursively frozen schema-3 worked review', () => {
  const { domain, questions } = loadModules();
  const scenarios = [
    ...completedArithmeticSnaps(domain),
    makeSnap(domain, { yardsToGo: 14, firstDownLine: 44, scores: { player: 14, opponent: 7 } }, 7),
    makeSnap(domain, { quarter: 1 }, 4),
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
    makeSnap(domain, { down: 3, yardsToGo: 8, firstDownLine: 38 }, 13),
    makeSnap(domain, { down: 3, yardsToGo: 7, firstDownLine: 37 }, 18),
    makeSpecialPlay(domain, 'conversion', { possession: 'offense', attemptType: 'pat' }),
    makeSpecialPlay(domain, 'conversion', { possession: 'offense', attemptType: 'twoPoint' }),
    makeSpecialPlay(domain, 'fieldGoal', { possession: 'offense', yardLine: 60 }),
    makeSpecialPlay(domain, 'punt', { possession: 'offense', yardLine: 30, travelYards: 40 }),
  ];
  const expected = {
    'score-total-ch8': ['score-total-ch8', 'add', ['playerScore', 'opponentScore']],
    'score-total-ch8-within-20': ['score-total-ch8', 'add', ['playerScore', 'opponentScore']],
    'score-total-ch8-ones-add': ['score-total-ch8', 'add', ['playerScore', 'opponentScore']],
    'team-yards-add-ch8-within-20': ['team-yards-add-ch8', 'add', ['teamTotalYards', 'proposedGain']],
    'team-yards-add-ch8-ones-add': ['team-yards-add-ch8', 'add', ['teamTotalYards', 'proposedGain']],
    'score-difference-ch8-ones-subtract': ['score-difference-ch8', 'absoluteDifference', ['playerScore', 'opponentScore']],
    'line-remaining-ch8-ones-subtract': ['line-remaining-ch8', 'missingPart', ['yardsToGo', 'proposedGain']],
    'goal-remaining-ch8-ones-subtract': ['goal-remaining-ch8', 'goalDistanceAfterGain', ['ballYardLine', 'goalLine', 'proposedGain']],
    'score-difference-ch8': ['score-difference-ch8', 'absoluteDifference', ['playerScore', 'opponentScore']],
    'team-yards-add-ch8': ['team-yards-add-ch8', 'add', ['teamTotalYards', 'proposedGain']],
    'line-remaining-ch8': ['line-remaining-ch8', 'missingPart', ['yardsToGo', 'proposedGain']],
    'goal-remaining-ch8': ['goal-remaining-ch8', 'goalDistanceAfterGain', ['ballYardLine', 'goalLine', 'proposedGain']],
    'yards-to-go-read': ['line-to-gain', 'read', ['yardsToGo']],
    'line-to-gain-missing-part': ['line-to-gain', 'missingPart', ['yardsToGo', 'proposedGain']],
    'line-to-gain-exact': ['line-to-gain', 'exactRemainder', ['yardsToGo', 'proposedGain']],
    'line-to-gain-surplus': ['line-to-gain', 'surplus', ['yardsToGo', 'proposedGain']],
    'line-to-gain-surplus-ch8': ['line-to-gain', 'surplus', ['yardsToGo', 'proposedGain']],
    'line-to-gain-surplus-ch8-ones-subtract': ['line-to-gain', 'surplus', ['yardsToGo', 'proposedGain']],
    'line-to-gain-fact-family': ['line-to-gain', 'factFamilyMissingPart', ['yardsToGo', 'proposedGain']],
    'gain-vs-needed-comparison': ['line-to-gain-comparison', 'compare', ['proposedGain', 'yardsToGo']],
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
    'quarters-still-to-come': ['quarter-half-structure', 'quartersAfterCurrent', ['quarter', 'regulationQuarters']],
    'quarters-before-halftime': ['quarter-half-structure', 'quartersBeforeHalftime', ['quarter', 'regulationQuarters']],
    'quarters-finished': ['quarter-half-structure', 'quartersFinished', ['quarter', 'regulationQuarters']],
    'quarters-in-half': ['quarter-half-structure', 'quartersInHalf', ['quarter', 'regulationQuarters']],
    'second-half-quarters': ['quarter-half-structure', 'secondHalfQuarters', ['quarter', 'regulationQuarters']],
    'game-part-boundary': ['quarter-half-structure', 'gamePartAtBoundary', ['quarter', 'regulationQuarters']],
    'halves-make-whole': ['quarter-half-structure', 'halvesMakeWhole', ['quarter', 'regulationQuarters']],
    'game-part-compare': ['quarter-half-structure', 'compareGameParts', ['quarter', 'regulationQuarters']],
    'next-down': ['down-progression', 'ordinal', ['currentDown', 'yardsToGo', 'proposedGain', 'resultKind', 'nextDown']],
    'goal-distance-minus-whole-tens': ['field-distance', 'goalDistanceAfterGain', ['ballYardLine', 'goalLine', 'proposedGain']],
    'drive-distance-plus-whole-tens': ['drive-distance', 'driveDistancePlusGain', ['driveStart', 'ballYardLine', 'proposedGain']],
    'touchdown-base-points': ['touchdown-base-scoring', 'ruleValue', ['resultKind', 'touchdownBasePoints']],
    'conversion-attempt-value': ['conversion-scoring', 'conversionValue', ['possessingTeamScore', 'attemptType', 'attemptValue']],
    'conversion-try-marker': ['conversion-placement', 'tryMarkerForDirection', ['direction', 'tryYardLine']],
    'two-point-three-digit-add': ['two-point-challenge', 'add', ['attemptType', 'attemptValue', 'challengeA', 'challengeB']],
    'two-point-three-digit-subtract': ['two-point-challenge', 'subtract', ['attemptType', 'attemptValue', 'challengeA', 'challengeB']],
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
    // A retired family is never live-eligible; its direct build still works.
    const retired = questions.RETIRED_LIVE_FAMILIES.includes(familyId);
    const source = scenarios.find((candidate) => (retired
      ? questions.inspect(candidate).declined.some((entry) => entry.familyId === familyId
        && entry.reason.code === 'retired-from-live-play')
        && (() => { try { questions.build(candidate, familyId); return true; } catch { return false; } })()
      : questions.inspect(candidate).eligible.some((entry) => entry.familyId === familyId)));
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
  // #186 deliberately registers the player two-point challenge families. The
  // PAT and opponent tries checked below keep exactly the two older families.
  const expectedIds = {
    conversion: ['conversion-attempt-value', 'conversion-try-marker', 'two-point-three-digit-add', 'two-point-three-digit-subtract'],
    fieldGoal: ['field-goal-attempt-distance', 'field-goal-point-value'],
    punt: ['punt-travel-distance', 'punt-landing-spot'],
  };
  const expectedEligible = {
    ...expectedIds,
    conversion: ['conversion-attempt-value', 'conversion-try-marker'],
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
      expectedEligible[play.playType],
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

  for (const [play, familyId] of [
    [pat, 'conversion-try-marker'],
    [twoPoint, 'conversion-try-marker'],
    [forwardPunt, 'punt-landing-spot'],
    [reversePunt, 'punt-landing-spot'],
  ]) {
    const question = questions.build(play, familyId, { presentationRng: () => 0.37 });
    assert.equal(question.choicePresentation, 'field-position');
    assert.ok(question.choices.every(choice => Number.isInteger(choice.value)));
    assert.equal(new Set(question.choices.map(choice => choice.label)).size, question.choices.length);
    assert.equal(new Set(question.choices.map(choice => choice.ariaLabel)).size, question.choices.length);
    assert.ok(question.choices.every(choice => /(?:DUKE|UNC|50|GOAL LINE)/.test(choice.label)));
    assert.ok(question.choices.every(choice => /yard line|goal line/i.test(choice.ariaLabel)));
    assert.equal(question.choices.find(choice => choice.id === question.correctChoiceId).value, question.answer.value);
  }

  for (const [play, familyId] of [
    [forwardFieldGoal, 'field-goal-attempt-distance'],
    [forwardPunt, 'punt-travel-distance'],
  ]) {
    const question = questions.build(play, familyId);
    assert.doesNotMatch(question.prompt.text, new RegExp(`\\b${question.answer.value}\\b`));
    assert.match(question.visuals.initial.ariaLabel, new RegExp(`\\b${question.answer.value}\\b`));
  }
  const landingQuestion = questions.build(forwardPunt, 'punt-landing-spot');
  const landingChoice = landingQuestion.choices.find(choice => choice.id === landingQuestion.correctChoiceId);
  assert.doesNotMatch(landingQuestion.prompt.text, /\b70\b/);
  assert.match(landingQuestion.visuals.initial.ariaLabel, new RegExp(landingChoice.ariaLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.throws(
    () => questions.build(pat, 'yards-to-go-read'),
    (error) => error.code === 'family-play-type-mismatch',
  );
  assert.throws(
    () => questions.build(forwardPunt, 'field-goal-attempt-distance'),
    (error) => error.code === 'family-play-type-mismatch',
  );
});

// Issue #186: the player's own two-point try uses requested three-digit work.
const CHALLENGE_FAMILIES = ['two-point-three-digit-add', 'two-point-three-digit-subtract'];
const OLD_CONVERSION_FAMILIES = ['conversion-attempt-value', 'conversion-try-marker'];

function columnDigits(value) {
  return [Math.floor(value / 100), Math.floor(value / 10) % 10, value % 10];
}

// Written independently of the module: three-digit operands with no carrying
// or borrowing in any column.
function noRegroupingThreeDigit(operation, a, b) {
  if (![a, b].every((value) => Number.isInteger(value) && value >= 100 && value <= 999)) return false;
  const top = columnDigits(a);
  const bottom = columnDigits(b);
  if (operation === 'add') return top.every((digit, index) => digit + bottom[index] <= 9);
  if (operation === 'subtract') return top[0] > bottom[0] && top.every((digit, index) => digit >= bottom[index]);
  return false;
}

function playerTwoPointPlay(domain, index = 0) {
  return makeSpecialPlay(domain, 'conversion', {
    possession: 'offense',
    attemptType: 'twoPoint',
    gameId: `sweep-game-${index % 37}`,
    possessionId: `sweep-game-${index % 37}-possession-${index}`,
    playId: `sweep-game-${index % 37}-play-${index * 3 + 1}`,
    contextId: `sweep-context-${index}`,
  });
}

test('player two-point tries present only the two challenge families while PAT and opponent tries keep theirs', () => {
  const { domain, questions } = loadModules();
  const challengeTry = makeSpecialPlay(domain, 'conversion', { possession: 'offense', attemptType: 'twoPoint' });
  const inspection = questions.inspect(challengeTry);
  assert.deepEqual(plain(inspection.eligible.map((entry) => entry.familyId)), CHALLENGE_FAMILIES);
  assert.deepEqual(
    plain(inspection.declined.map(({ familyId, reason }) => [familyId, reason.code])),
    OLD_CONVERSION_FAMILIES.map((familyId) => [familyId, 'player-two-point-challenge']),
  );
  for (const familyId of OLD_CONVERSION_FAMILIES) {
    assert.throws(() => questions.build(challengeTry, familyId), (error) => error.code === 'family-not-eligible');
  }

  for (const [possession, attemptType] of [['offense', 'pat'], ['defense', 'pat'], ['defense', 'twoPoint']]) {
    const play = makeSpecialPlay(domain, 'conversion', { possession, attemptType });
    const other = questions.inspect(play);
    assert.deepEqual(plain(other.eligible.map((entry) => entry.familyId)), OLD_CONVERSION_FAMILIES, `${possession}:${attemptType}`);
    assert.deepEqual(
      plain(other.declined.map(({ familyId, reason }) => [familyId, reason.code])),
      CHALLENGE_FAMILIES.map((familyId) => [familyId, 'not-player-two-point']),
    );
    for (const familyId of CHALLENGE_FAMILIES) {
      assert.equal(questions.twoPointChallengeFor(play, familyId), null);
      assert.throws(() => questions.build(play, familyId), (error) => error.code === 'family-not-eligible');
    }
  }

  for (const source of [
    makeSnap(domain, {}, 4),
    makeSnap(domain, { possession: 'defense', direction: -1 }, 4),
    makeSpecialPlay(domain, 'fieldGoal'),
    makeSpecialPlay(domain, 'punt', { yardLine: 30, travelYards: 40 }),
  ]) {
    const seen = questions.inspect(source);
    const ids = [...seen.eligible, ...seen.declined].map((entry) => entry.familyId);
    assert.equal(ids.some((familyId) => CHALLENGE_FAMILIES.includes(familyId)), false);
    for (const familyId of CHALLENGE_FAMILIES) assert.equal(questions.twoPointChallengeFor(source, familyId), null);
  }
  assert.equal(questions.twoPointChallengeFor(challengeTry, 'conversion-attempt-value'), null);

  const requested = Object.values(questions.FAMILY_REGISTRY).flat()
    .filter((entry) => entry.curriculumSource === 'requested-challenge');
  assert.deepEqual(requested.map((entry) => entry.familyId), CHALLENGE_FAMILIES);
  assert.deepEqual(requested.map((entry) => entry.skill), ['three-digit-addition', 'three-digit-subtraction']);
  assert.deepEqual(requested.map((entry) => entry.operationType), ['add', 'subtract']);
  for (const entry of requested) {
    assert.deepEqual({
      concept: entry.concept, purpose: entry.purpose, tier: entry.tier, evidenceClass: entry.evidenceClass,
      answerExposure: entry.answerExposure, introducedOnPage: entry.introducedOnPage, playType: entry.playType,
    }, {
      concept: 'two-point-challenge', purpose: 'requestedChallenge', tier: 'three-digit-no-regrouping',
      evidenceClass: 'independent', answerExposure: 'modeled-with-result-hidden', introducedOnPage: null,
      playType: 'conversion',
    });
    for (const key of ['worktext', 'edition', 'coverageThroughPage', 'challenge']) {
      assert.equal(Object.hasOwn(entry, key), false, `${entry.familyId} claims no ${key}`);
    }
    assert.deepEqual(plain(questions.sourceStatus(entry)), { included: true, guided: true });
  }
  assert.deepEqual(Object.keys(questions.CHALLENGE_MAP).sort(), [
    'drive-distance-plus-whole-tens', 'drive-distance-scaffolded', 'line-to-gain-exact',
    'line-to-gain-fact-family', 'line-to-gain-missing-part', 'line-to-gain-surplus',
    'line-to-gain-surplus-ch8', 'line-to-gain-surplus-ch8-ones-subtract',
  ]);
  assert.deepEqual(plain(questions.TWO_POINT_CHALLENGE), {
    schemaVersion: 1,
    generator: 'two-point-three-digit-v1',
    regrouping: 'none',
    families: { 'two-point-three-digit-add': 'add', 'two-point-three-digit-subtract': 'subtract' },
  });
});

// A bounded deterministic property sweep over 1,500 synthetic identities per
// family. It is evidence for the generator's domain, not an exhaustive proof
// over every possible identity hash.
test('a bounded identity sweep keeps every fixture three-digit, regrouping-free, and four-choice', () => {
  const { domain, questions } = loadModules();
  const SWEEP = 1500;
  for (const familyId of CHALLENGE_FAMILIES) {
    const operation = questions.TWO_POINT_CHALLENGE.families[familyId];
    const topValues = new Set();
    const answers = new Set();
    let possessionSensitive = 0;
    for (let index = 0; index < SWEEP; index++) {
      const play = playerTwoPointPlay(domain, index);
      const fixture = questions.twoPointChallengeFor(play, familyId);
      const label = `${familyId}:${index}`;
      assert.equal(deepFrozen(fixture), true, label);
      assert.deepEqual(plain(fixture), plain(questions.twoPointChallengeFor(play, familyId)), `${label}: deterministic`);
      assert.deepEqual(plain(fixture.identity), {
        gameId: play.gameId, possessionId: play.possessionId, playId: play.playId, contextId: play.contextId, familyId,
      });
      assert.equal(fixture.schemaVersion, 1);
      assert.equal(fixture.generator, 'two-point-three-digit-v1');
      assert.equal(fixture.regrouping, 'none');
      assert.equal(fixture.operation, operation);
      const { a, b, answer } = fixture;
      assert.equal(noRegroupingThreeDigit(operation, a, b), true, `${label}: ${a} ${operation} ${b}`);
      assert.notEqual(b % 100, 0, `${label}: second operand is never a whole hundred`);
      assert.equal(answer, operation === 'add' ? a + b : a - b, label);
      assert.ok(answer >= 100 && answer <= 999, `${label}: answer ${answer}`);
      if (operation === 'add') assert.ok(answer <= 999);
      else assert.ok(answer >= 100);

      const values = fixture.choiceValues;
      assert.equal(values.length, 4, label);
      assert.equal(values[0], answer);
      assert.equal(new Set(values).size, 4, `${label}: unique choices`);
      assert.equal(values.filter((value) => value === answer).length, 1, `${label}: one correct`);
      const answerDigits = columnDigits(answer);
      const changedPlaces = new Set();
      for (const value of values.slice(1)) {
        assert.ok(Number.isInteger(value) && value >= 100 && value <= 999, `${label}: slip ${value}`);
        const digits = columnDigits(value);
        const changed = digits.map((digit, place) => [place, digit - answerDigits[place]]).filter(([, delta]) => delta !== 0);
        assert.equal(changed.length, 1, `${label}: ${value} changes exactly one column of ${answer}`);
        assert.equal(Math.abs(changed[0][1]), 1, `${label}: ${value} is a one-step slip`);
        changedPlaces.add(changed[0][0]);
      }
      assert.equal(changedPlaces.size, 3, `${label}: one slip each in the ones, tens, and hundreds`);

      const otherPossession = questions.twoPointChallengeFor({ ...play, possessionId: `${play.possessionId}-other` }, familyId);
      if (otherPossession && JSON.stringify(plain(otherPossession).choiceValues) !== JSON.stringify(plain(values))) possessionSensitive++;
      topValues.add(a);
      answers.add(answer);
    }
    // Varied numbers, and the possession ID really is part of the identity.
    assert.ok(topValues.size > 300, `${familyId}: ${topValues.size} distinct first operands`);
    assert.ok(answers.size > 300, `${familyId}: ${answers.size} distinct answers`);
    assert.ok(possessionSensitive > SWEEP * 0.9, `${familyId}: possession-sensitive ${possessionSensitive}`);
  }
});

test('the independent column check rejects representative carrying and borrowing cases', () => {
  // Representative regrouping and boundary cases that the first delivery excludes.
  const rejected = [
    ['add', 158, 264], // ones carry
    ['add', 190, 120], // tens carry
    ['add', 620, 512], // hundreds carry past 999
    ['add', 99, 201], // two-digit operand
    ['subtract', 432, 157], // ones and tens borrow
    ['subtract', 305, 120], // tens borrow
    ['subtract', 245, 236], // same hundreds; difference below 100
    ['subtract', 1000, 300], // four-digit operand
  ];
  const accepted = [['add', 124, 353], ['add', 482, 517], ['subtract', 987, 321], ['subtract', 405, 103]];
  for (const [operation, a, b] of rejected) assert.equal(noRegroupingThreeDigit(operation, a, b), false, `${a} ${operation} ${b}`);
  for (const [operation, a, b] of accepted) assert.equal(noRegroupingThreeDigit(operation, a, b), true, `${a} ${operation} ${b}`);
});

test('the challenge question hides its answer until worked and explains every column without yardage', () => {
  const { domain, questions } = loadModules();
  for (const familyId of CHALLENGE_FAMILIES) {
    for (const index of [0, 1, 2, 3, 4, 5]) {
      const play = playerTwoPointPlay(domain, index);
      const fixture = questions.twoPointChallengeFor(play, familyId);
      const { a, b, answer, operation } = fixture;
      const operator = operation === 'add' ? '+' : '−';
      let presentationDraws = 0;
      const question = questions.build(play, familyId, {
        support: 'guided',
        presentationRng: () => { presentationDraws++; return 0.37; },
      });
      verifyGrounding(questions, play, question);
      assert.equal(presentationDraws, 3, 'four choices use the existing three presentation draws');
      assert.equal(deepFrozen(question), true);
      assert.deepEqual(plain(question.challengeFixture), plain(fixture));
      assert.equal(question.curriculumSource, 'requested-challenge');
      assert.equal(question.introducedOnPage, null);
      assert.equal(question.concept, 'two-point-challenge');
      assert.equal(question.evidenceClass, 'independent');
      assert.equal(question.support, 'guided');
      assert.equal(question.challenge, undefined);
      assert.deepEqual(plain(question.operation), { type: operation, operandIds: ['challengeA', 'challengeB'], outputId: question.answer.id });
      assert.equal(question.answer.value, answer);
      assert.deepEqual(plain(question.choices.map((choice) => choice.value)).sort(), plain(fixture.choiceValues).sort());
      assert.equal(question.choices.length, 4);
      assert.equal(question.choices.find((choice) => choice.id === question.correctChoiceId).value, answer);
      assert.deepEqual(plain(question.selection), {
        strategy: 'play-type-neutral-v1', role: 'offense', selectedCallId: null, multiplier: 1,
      });

      const equation = `${a} ${operator} ${b}`;
      assert.equal(question.prompt.text, `Two-point challenge! Solve ${equation} to make the try.`);
      const [ta, tt, to] = columnDigits(a);
      const [ba, bt, bo] = columnDigits(b);
      const [ra, rt, ro] = columnDigits(answer);
      assert.equal(question.hint.text, `Line up the hundreds, tens, and ones. Start with the ones: ${to} ${operator} ${bo}.`);
      assert.equal(question.workedExplanation.text,
        `Ones: ${to} ${operator} ${bo} = ${ro}. Tens: ${tt} ${operator} ${bt} = ${rt}. `
        + `Hundreds: ${ta} ${operator} ${ba} = ${ra}. So ${equation} = ${answer}.`);
      // Remove the shown operands first: a difference may equal its second operand.
      const withoutOperands = (text) => text.split(String(a)).join('').split(String(b)).join('');
      for (const text of [question.prompt.text, question.hint.text, question.prompt.ariaLabel]) {
        assert.equal(withoutOperands(text).includes(String(answer)), false, `${familyId}: ${text}`);
      }
      const copy = JSON.stringify(plain({
        prompt: question.prompt, hint: question.hint, worked: question.workedExplanation,
        review: question.workedReview, visuals: question.visuals,
      }));
      assert.doesNotMatch(copy, /yard|workbook|page|mammoth/i);

      for (const stage of ['initial', 'guided']) {
        const visual = question.visuals[stage];
        assert.equal(visual.type, 'column-arithmetic', stage);
        assert.equal(visual.revealsAnswer, false, stage);
        assert.equal(visual.result, null, stage);
        assert.deepEqual(plain(visual.data), { operation, operator, a, b }, stage);
        assert.equal(withoutOperands(visual.ariaLabel).includes(String(answer)), false, stage);
      }
      assert.equal(question.visuals.worked.type, 'column-arithmetic');
      assert.equal(question.visuals.worked.revealsAnswer, true);
      assert.deepEqual(plain(question.visuals.worked.result), { answerId: question.answer.id, value: answer });
      assert.equal(question.visuals.worked.ariaLabel, `${a} ${operation === 'add' ? 'plus' : 'minus'} ${b} equals ${answer}.`);
      assert.deepEqual(plain(question.workedReview.steps.map((step) => step.text)), [question.hint.text, question.workedExplanation.text]);
      assert.equal(question.workedReview.footballMeaning.text, 'A correct answer makes the two-point try good for two points.');
      assert.equal(question.math.support, 'guided');
      assert.equal(question.math.result, null);
    }
  }
});

test('punt touchbacks preserve direction polarity and retain a truthful travel family', () => {
  const { domain, opponent, questions } = loadModules();
  const match = opponent.createMatch('unc');
  const cases = [
    {
      play: makeSpecialPlay(domain, 'punt', { possession: 'offense', yardLine: 70, travelYards: 35, match }),
      data: {
        start: 'UNC 30', possibleGoalLine: 'CAROLINA goal line', possibleEndZone: 'CAROLINA end zone',
        possibleTouchback: true, restart: 'UNC 20', travelYards: 30,
      },
      aria: "Punt preview from UNC's 30-yard line toward the CAROLINA goal line and CAROLINA end zone; travel 30 yards. Possible touchback. North Carolina restarts at UNC's own 20-yard line.",
    },
    {
      play: makeSpecialPlay(domain, 'punt', { possession: 'defense', yardLine: 30, travelYards: 35, match }),
      data: {
        start: 'DUKE 30', possibleGoalLine: 'DUKE goal line', possibleEndZone: 'DUKE end zone',
        possibleTouchback: true, restart: 'DUKE 20', travelYards: 30,
      },
      aria: "Punt preview from Duke's 30-yard line toward the DUKE goal line and DUKE end zone; travel 30 yards. Possible touchback. Duke restarts at Duke's own 20-yard line.",
    },
  ];
  for (const { play, data, aria } of cases) {
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
    assert.doesNotMatch(question.prompt.text, /\b30\b/);
    assert.deepEqual(plain(question.visuals.initial.data), data);
    assert.equal(question.visuals.initial.ariaLabel, aria);
    for (const stage of ['guided', 'worked']) {
      assert.match(question.visuals[stage].ariaLabel, /touchback/i);
      assert.match(question.visuals[stage].ariaLabel, /restarting at .*own 20-yard line/i);
    }
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
    'goal-distance-tens', 'goal-distance-ones',
    'drive-distance-scaffolded', 'committed-score-total', 'committed-score-difference',
    'half-read', 'goal-distance-minus-whole-tens',
    'drive-distance-plus-whole-tens',
  ];
  for (const snap of [forward, reverse]) {
    const ids = questions.inspect(snap, questions.DEFAULT_PROFILE).eligible.map((candidate) => candidate.familyId);
    for (const familyId of required) {
      assert.ok(ids.includes(familyId), `${snap.context.possession}:${familyId}`);
      verifyGrounding(questions, snap, questions.build(snap, familyId));
    }
    // #51: quarter-label reading is retired from live play but still builds.
    assert.equal(ids.includes('quarter-read'), false);
    verifyGrounding(questions, snap, questions.build(snap, 'quarter-read'));
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
    evidenceClass: 'independent',
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

test('tautological ordinal families are retired, quarter reading leaves live play, and half reasoning stays scheduled', () => {
  const { domain, questions } = loadModules();
  const snap = makeSnap(domain, { quarter: 3, down: 2, yardsToGo: 8, firstDownLine: 38 }, 3);
  const inspection = questions.inspect(snap);
  const scheduled = [...inspection.eligible, ...inspection.declined].map((entry) => entry.familyId);
  assert.equal(scheduled.includes('down-read'), false);
  assert.equal(scheduled.includes('drive-play-ordinal'), false);
  assert.equal(inspection.eligible.some((entry) => entry.familyId === 'quarter-read'), false);
  assert.equal(inspection.declined.find((entry) => entry.familyId === 'quarter-read')?.reason.code, 'retired-from-live-play');
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

test('quarter reading keeps the Q3 source numeral in its visual and ARIA, not its prompt', () => {
  const { domain, questions } = loadModules();
  const snap = makeSnap(domain, { quarter: 3, down: 2, yardsToGo: 8, firstDownLine: 38 }, 3);
  const question = questions.build(snap, 'quarter-read');

  assert.equal(question.prompt.text, 'Read the quarter on the scoreboard. Which quarter is the game in?');
  assert.doesNotMatch(question.prompt.text, /Q3|\b3\b/);
  assert.equal(question.answer.value, '3rd');
  assert.deepEqual(plain(question.bindings), [{
    id: 'quarter', source: { kind: 'context', path: '/context/quarter' }, value: 3,
  }]);
  assert.deepEqual(plain(question.visuals.initial.data), { label: 'Q3' });
  assert.equal(question.visuals.initial.ariaLabel, 'Scoreboard quarter display Q3.');
});

test('half and teen-score families use only the frozen quarter and real committed scoreboard values', () => {
  const { domain, questions } = loadModules();
  const ordinarySnaps = [1, 2, 3, 4].map((quarter) => makeSnap(domain, { quarter }, 4));
  // The retired quarter-read entry keeps its registered weight for history.
  const quarterCandidate = questions.FAMILY_REGISTRY.scrimmage.find((candidate) => candidate.familyId === 'quarter-read');
  assert.ok(quarterCandidate);

  for (const [index, snap] of ordinarySnaps.entries()) {
    const quarter = index + 1;
    const candidate = questions.inspect(snap).eligible.find((entry) => entry.familyId === 'half-read');
    assert.ok(candidate, `half-read should be available during an ordinary Q${quarter} snap`);
    assert.ok(candidate.weight < quarterCandidate.weight);
    const question = questions.build(snap, 'half-read');
    assert.equal(question.answer.value, quarter <= 2 ? '1st half' : '2nd half');
    assert.match(question.hint.text, /split the four quarters into two equal groups in order/i);
    assert.doesNotMatch(question.hint.text, /1st half|2nd half/i);
    assert.doesNotMatch(question.visuals.guided.ariaLabel, /1st half|2nd half/i);
    assert.equal(question.choices.length, 4);
    assert.ok(question.choices.filter((choice) => choice.id !== question.correctChoiceId).length >= 2);
    assert.deepEqual(plain(question.bindings), [{
      id: 'quarter', source: { kind: 'context', path: '/context/quarter' }, value: quarter,
    }]);
    verifyGrounding(questions, snap, question);
  }

  for (const score of [10, 11, 14, 19]) {
    const snap = makeSnap(domain, { scores: { player: score, opponent: 7 } }, 4);
    for (const familyId of ['committed-score-tens', 'committed-score-ones']) {
      const question = questions.build(snap, familyId);
      const targetPlace = familyId.endsWith('tens') ? 'tens' : 'ones';
      assert.equal(question.evidenceClass, 'literacy');
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

test('the retired comparison stays buildable but never live, and approved later pages stay source-accurate and snap-grounded', () => {
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
    [past100, ['team-yards-past-100']],
    [reversePast100, ['team-yards-past-100']],
  ];
  for (const [snap, familyIds] of cases) {
    const inspection = questions.inspect(snap, questions.DEFAULT_PROFILE);
    for (const familyId of familyIds) {
      const candidate = inspection.eligible.find((entry) => entry.familyId === familyId);
      assert.ok(candidate, `${familyId} should be eligible`);
      assert.equal(candidate.curriculumSource, 'workbook');
      assert.ok(candidate.introducedOnPage > questions.CURRENT_COMPLETED_PAGE);
      verifyGrounding(questions, snap, questions.build(snap, familyId, { support: 'guided' }));
    }
  }

  // #51: inspection declines the comparison before deriving it, on offense,
  // defense and either objective. The registry entry, source page and a direct
  // build stay valid, so old history and review still decode.
  const comparisonEntry = questions.FAMILY_REGISTRY.scrimmage.find((entry) => entry.familyId === 'gain-vs-needed-comparison');
  assert.equal(comparisonEntry.introducedOnPage, 39);
  for (const snap of [
    comparison,
    makeSnap(domain, { possession: 'defense', direction: -1, yardLine: 50, yardsToGo: 10, firstDownLine: 40, driveStart: 50 }, 5),
    makeSnap(domain, { yardLine: 92, yardsToGo: 8, firstDownLine: 100 }, 5),
  ]) {
    const inspection = questions.inspect(snap, questions.DEFAULT_PROFILE);
    assert.equal(inspection.eligible.some((entry) => entry.familyId === 'gain-vs-needed-comparison'), false);
    assert.deepEqual(plain(inspection.declined.find((entry) => entry.familyId === 'gain-vs-needed-comparison')?.reason.code), 'retired-from-live-play');
    verifyGrounding(questions, snap, questions.build(snap, 'gain-vs-needed-comparison', { support: 'guided' }));
  }
  // Malformed sources still report their shape problem first.
  const malformed = { ...plain(comparison), proposal: { ...plain(comparison.proposal), resultKind: 'maybe' } };
  assert.equal(questions.inspect(malformed).declined.find((entry) => entry.familyId === 'gain-vs-needed-comparison').reason.code, 'invalid-result-kind');
  for (const familyIds of Object.values(questions.CALL_AFFINITIES)) {
    assert.equal(familyIds.includes('gain-vs-needed-comparison'), false);
    assert.equal(new Set(familyIds).size, familyIds.length);
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
  assert.equal(narrow.eligible.some((entry) => entry.familyId === 'gain-vs-needed-comparison'), false);
  assert.equal(narrow.declined.find((entry) => entry.familyId === 'gain-vs-needed-comparison').reason.code, 'retired-from-live-play');
  assert.equal(narrow.eligible.some((entry) => entry.familyId === 'team-yards-past-100'), false);
  assert.ok(narrow.declined.some((entry) => entry.familyId === 'team-yards-past-100'
    && entry.reason.code === 'curriculum-not-included'));
  assert.throws(
    () => questions.build(past100, 'team-yards-past-100', { profile: narrowProfile }),
    (error) => error.code === 'curriculum-not-included',
  );
});

// #51: "Play 5? Need 10?" named neither amount, unit, owner nor objective. Each
// expectation here comes from the raw snap: the relation from the two numbers,
// the owner from possession, and the objective from whether the old marker is
// the attacking goal line. Copy may only describe a gain of the compared size.
test('comparison copy names amounts, units, team and objective without leaking the relation', () => {
  const { domain, questions } = loadModules();
  const longMatch = {
    schemaVersion: 1,
    player: { id: 'virginia-tech', displayName: 'Virginia Tech', shortName: 'VA TECH', endZoneName: 'VIRGINIA TECH' },
    opponent: { id: 'wake-forest', displayName: 'Wake Forest', shortName: 'WAKE FOREST', endZoneName: 'WAKE FOREST' },
  };
  const defense = { possession: 'defense', direction: -1, yardLine: 50, yardsToGo: 10, firstDownLine: 40, driveStart: 50 };
  const cases = [
    ['offense short', {}, 4],
    ['offense equal', {}, 7],
    ['offense greater', {}, 12],
    ['defense short (#188 5 vs 10)', defense, 5],
    ['defense equal', defense, 10],
    ['defense greater teen', defense, 13],
    ['offense zero vs one yard', { yardsToGo: 1 }, 0],
    ['offense one yard equal', { yardsToGo: 1 }, 1],
    ['offense teen equal', { yardsToGo: 16 }, 16],
    ['offense end zone short', { yardLine: 92, yardsToGo: 8, firstDownLine: 100 }, 5],
    ['offense end zone equal', { yardLine: 92, yardsToGo: 8, firstDownLine: 100 }, 8],
    ['defense end zone equal', { ...defense, yardLine: 6, yardsToGo: 6, firstDownLine: 0, driveStart: 30 }, 6],
    ['fourth down defense short', { ...defense, down: 4 }, 5],
    ['long player name greater', { match: longMatch, yardsToGo: 3 }, 12],
    ['long opponent name end zone equal', {
      ...defense, match: longMatch, yardLine: 16, yardsToGo: 16, firstDownLine: 0, driveStart: 40,
      privateOpponentSnapshot: {
        opponentId: 'wake-forest', profileKey: 'quickPass', plannedCallKey: 'shortPass', tendency: { profileKey: 'quickPass' },
      },
    }, 16],
  ];
  const relationWords = /less than|greater than|equal to|the same as|fall short|go past|would reach|would pass/i;
  for (const [label, overrides, requested] of cases) {
    const snap = makeSnap(domain, { yardsToGo: 7, firstDownLine: overrides.yardsToGo === undefined ? 37 : undefined, ...overrides }, requested);
    const c = snap.context;
    const gain = snap.proposal.appliedGain;
    const needed = c.yardsToGo;
    assert.equal(gain, requested, `${label}: fixture gain is not capped`);
    const symbol = gain < needed ? '<' : gain > needed ? '>' : '=';
    const endZone = c.firstDownLine === (c.direction === 1 ? 100 : 0);
    const team = c.possession === 'offense' ? c.match.player.displayName : c.match.opponent.shortName;
    const other = c.possession === 'offense' ? c.match.opponent.shortName : c.match.player.displayName;
    const unit = value => `${value} ${value === 1 ? 'yard' : 'yards'}`;
    const objective = endZone ? 'to reach the end zone' : 'for a first down';
    const place = endZone ? 'the end zone' : 'the first-down marker';
    const word = { '<': 'less than', '=': 'equal to', '>': 'greater than' }[symbol];
    const consequence = { '<': 'fall short of', '=': 'reach', '>': 'go past' }[symbol];

    for (const support of ['initial', 'guided', 'worked']) {
      const question = questions.build(snap, 'gain-vs-needed-comparison', { support, presentationRng: () => 0.5 });
      verifyGrounding(questions, snap, question);
      expectComparisonChoiceLabels(question);
      // Math, choices, bindings and metadata are unchanged by the copy.
      assert.equal(question.answer.value, symbol, label);
      assert.deepEqual(plain(question.choices.map(choice => choice.id)).sort(), [
        'gain-vs-needed-comparison--choice-s-3c',
        'gain-vs-needed-comparison--choice-s-3d',
        'gain-vs-needed-comparison--choice-s-3e',
      ], label);
      assert.deepEqual(plain(question.bindings), [
        { id: 'proposedGain', source: { kind: 'context', path: '/proposal/appliedGain' }, value: gain },
        { id: 'yardsToGo', source: { kind: 'context', path: '/context/yardsToGo' }, value: needed },
      ], label);
      assert.deepEqual(plain(question.operation), { type: 'compare', operandIds: ['proposedGain', 'yardsToGo'], outputId: 'gain-vs-needed-comparison--answer' });
      assert.deepEqual(
        [question.concept, question.skill, question.tier, question.weight, question.answerExposure, question.evidenceClass, question.curriculumSource, question.introducedOnPage],
        ['line-to-gain-comparison', 'comparison', 'within-16', 2.4, 'modeled-with-result-hidden', 'independent', 'workbook', 39],
        label,
      );
      assert.equal(question.math.stage, support);
    }
    const question = questions.build(snap, 'gain-vs-needed-comparison', { presentationRng: () => 0.5 });
    const prompt = question.prompt.text;
    const hint = question.hint.text;
    const worked = question.workedExplanation.text;

    // The prompt names the team with the ball, both amounts with units and
    // the objective, and keeps the gain conditional.
    assert.ok(prompt.includes(`${team} could gain ${unit(gain)}`), `${label}: ${prompt}`);
    assert.ok(prompt.includes(`needs ${unit(needed)} ${objective}`), `${label}: ${prompt}`);
    assert.ok(prompt.endsWith(`Which symbol makes ${gain} ? ${needed} true?`), `${label}: ${prompt}`);
    assert.equal(prompt.includes(other), false, `${label}: prompt names only the team with the ball`);
    assert.doesNotMatch(prompt, /\byou\b|\byour\b/i, `${label}: no player-perspective need`);
    if (endZone) assert.doesNotMatch(`${prompt} ${worked}`, /first.down/i, `${label}: end-zone target is not a first down`);
    assert.doesNotMatch(`${prompt} ${hint} ${worked}`, /\b1 yards\b|\b(?:[02-9]|1\d) yard\b(?!-)/, `${label}: unit agrees with its number`);

    // No evaluated relation for these operands before the worked stage. The
    // three symbol answers and general strategy words remain.
    for (const [stage, text] of [
      ['prompt', prompt],
      ['hint', hint],
      ['initial aria', question.visuals.initial.ariaLabel],
      ['guided aria', question.visuals.guided.ariaLabel],
    ]) {
      assert.doesNotMatch(text, relationWords, `${label}: ${stage} leaks the relation: ${text}`);
      assert.equal(text.includes(`${gain} ${symbol} ${needed}`), false, `${label}: ${stage} leaks the solved symbol`);
    }
    for (const stage of ['initial', 'guided']) {
      assert.equal(question.visuals[stage].result, null);
      assert.deepEqual(plain(question.visuals[stage].data), {
        leftCaption: 'POSSIBLE GAIN', leftValue: gain,
        rightCaption: endZone ? 'TO THE END ZONE' : 'FOR A FIRST DOWN', rightValue: needed,
      }, `${label}: ${stage} picture carries captions and amounts only`);
    }
    assert.ok(question.visuals.initial.ariaLabel.includes(`Possible gain: ${unit(gain)}`), label);
    assert.ok(question.visuals.initial.ariaLabel.includes(`${team} needs ${unit(needed)} ${objective}`), label);
    assert.ok(question.visuals.guided.ariaLabel.includes(`${unit(needed)} ${team} needs ${objective}`), label);

    // The hint keeps the comparison strategy and names both amounts.
    assert.ok(hint.startsWith(`Compare the possible gain, ${unit(gain)}, with the ${unit(needed)} needed.`), `${label}: ${hint}`);
    assert.ok(hint.endsWith('The open side points to the greater number.'), `${label}: ${hint}`);
    assert.equal(hint.includes('Compare the tens first. If they match, compare the ones.'), gain >= 10 || needed >= 10, label);

    // The worked text states the relation and what a gain of that size would
    // do, never what this play did or a promised first down.
    assert.equal(worked, `${gain} ${symbol} ${needed}. A gain of ${unit(gain)} is ${word} the ${unit(needed)} needed, so it would ${consequence} ${place}.`, label);
    assert.doesNotMatch(worked, /this play|earn|first down\b|touchdown|stopped/i, `${label}: ${worked}`);
    assert.deepEqual(plain(question.visuals.worked.result.value), symbol);
    assert.ok(question.visuals.worked.ariaLabel.startsWith(`${gain} ${word} ${needed}:`), label);
    assert.ok(question.visuals.worked.ariaLabel.includes(`${team} needs ${objective}, so it would ${consequence} ${place}.`), label);

    // Coach Replay: a renamed, generic static frame around this play's hint
    // and worked sentence.
    const review = question.workedReview;
    assert.equal(review.title, 'Compare the Yards');
    assert.deepEqual(plain(review.steps.map(step => step.text)), [hint, worked]);
    for (const copy of [review.title, review.goal.text, review.footballMeaning.text]) {
      assert.doesNotMatch(copy, /\bplay\b|\bneed\b|past the end zone|go past the end zone/i, `${label}: ${copy}`);
    }
    assert.match(review.goal.text, /possible gain/);
    assert.match(review.goal.text, /first-down marker or the end zone/);
  }

  // A gain toward the goal line is capped at the end zone, so an end-zone
  // comparison can never be greater than the yards needed.
  const capped = makeSnap(domain, { yardLine: 92, yardsToGo: 8, firstDownLine: 100 }, 14);
  assert.equal(capped.proposal.appliedGain, 8);
  const cappedQuestion = questions.build(capped, 'gain-vs-needed-comparison');
  assert.equal(cappedQuestion.answer.value, '=');
  assert.match(cappedQuestion.workedExplanation.text, /would reach the end zone\.$/);
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
    assert.equal(question.evidenceClass, 'literacy');
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

  for (const distance of [70, 77]) {
    const digitSnap = makeSnap(domain, {
      yardLine: 100 - distance,
      firstDownLine: 110 - distance,
      yardsToGo: 10,
      driveStart: 90 - distance,
    }, 3);
    const tens = questions.build(digitSnap, 'goal-distance-tens');
    const ones = questions.build(digitSnap, 'goal-distance-ones');
    assert.equal(tens.evidenceClass, 'literacy');
    assert.equal(ones.evidenceClass, 'literacy');
    assert.equal(tens.answer.value, Math.floor(distance / 10));
    assert.equal(ones.answer.value, distance % 10);
    assert.equal(tens.visuals.initial.data.tens, null);
    assert.equal(ones.visuals.initial.data.ones, null);
    assert.equal(tens.visuals.guided.result, null);
    assert.equal(ones.visuals.guided.result, null);
  }

  assert.throws(
    () => questions.build(snap, 'goal-distance-read'),
    error => error?.code === 'unknown-family',
  );

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
  assert.match(oneYardMissingPart.prompt.text, /If you gain 1 yard,/);
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


test('Chapter 8 arithmetic respects source identity, full-domain inclusion and explicit borrowing boundaries', () => {
  const { questions, domain } = loadModules();
  const snap = makeSnap(domain, { scores: { player: 17, opponent: 6 } }, 4);
  const family = questions.FAMILY_REGISTRY.scrimmage.find(x => x.familyId === 'score-total-ch8');
  assert.deepEqual(plain(questions.sourceStatus(family)), { included: true, guided: true });
  for (const source of [{ worktext: 'unknown' }, { edition: 2025 }]) {
    assert.equal(questions.sourceStatus({ ...family, ...source }).included, false);
  }
  const narrowed = { worktexts: { 'Math Mammoth Grade 1-B': { edition: 2026, includedThroughPage: 122 } } };
  assert.equal(questions.inspect(snap, narrowed).eligible.some(x => x.familyId === family.familyId), false);
  const diagnostic = questions.inspect(snap, narrowed).declined.find(x => x.familyId === family.familyId).reason.detail;
  assert.match(diagnostic, /Math Mammoth Grade 1-B \(2026\) through page 123/);
  assert.doesNotMatch(diagnostic, /179/);
  assert.throws(() => questions.build(snap, family.familyId, { profile: narrowed }), /Grade 1-B \(2026\) through page 123/);
  assert.equal(questions.build(snap, family.familyId).answer.value, 23);
  assert.equal(questions.DEFAULT_PROFILE.computationMax, 10);
  for (const [a, b, allowed] of [[14,7,true], [20,16,true], [67,24,true], [100,7,true], [40,7,true], [21,14,false], [52,18,false], [43,7,false], [101,1,false]]) {
    assert.equal(questions.arithmeticAllowed('subtract',a,b), allowed, `${a}-${b}`);
    const source = makeSnap(domain, { scores: { player:a, opponent:b } }, 4);
    assert.equal(questions.inspect(source).eligible.some(x => x.concept === 'score-difference-ch8'), allowed, `${a}-${b} scoreboard`);
  }
  for (let a = 0; a <= 110; a++) for (let b = 0; b <= 110; b++) {
    const expected = a <= 100 && b <= a && (a <= 20 || (a < 100 && Math.floor(a/10) >= Math.floor(b/10) && a%10 >= b%10) || (a%10 === 0 && b < 10));
    assert.equal(questions.arithmeticAllowed('subtract',a,b), expected, `${a}-${b}`);
  }
  const signed = makeSnap(domain, { totalYards: { player: -3, opponent: 83 }, driveStart: 40 }, 4);
  assert.equal(questions.inspect(signed).eligible.some(x => x.familyId === 'team-yards-add-ch8'), false);
});


test('completed arithmetic variants are disjoint, sourced and balanced on offense and defense', () => {
  const { questions, domain } = loadModules();
  const cases = [
    ['score-total-ch8', 7, 6, 'within-20'],
    ['score-total-ch8', 9, 9, 'within-20'],
    ['score-total-ch8', 10, 9, 'ones-add'],
    ['score-total-ch8', 23, 4, 'ones-add'],
    ['score-total-ch8', 4, 23, 'ones-add'],
    ['score-total-ch8', 99, 0, 'ones-add'],
    ['score-total-ch8', 27, 5, null],
    ['score-total-ch8', 23, 14, null],
    ['score-total-ch8', 10, 10, null],
    ['score-difference-ch8', 47, 5, 'ones-subtract'],
    ['score-difference-ch8', 14, 2, 'ones-subtract'],
    ['score-difference-ch8', 19, 9, 'ones-subtract'],
    ['score-difference-ch8', 99, 9, 'ones-subtract'],
    ['score-difference-ch8', 14, 7, null],
    ['score-difference-ch8', 20, 7, null],
    ['score-difference-ch8', 100, 7, null],
    ['score-difference-ch8', 67, 24, null],
  ];
  for (const possession of ['offense', 'defense']) for (const [concept, a, b, suffix] of cases) {
    const snap = makeSnap(domain, { possession, scores: { player: a, opponent: b } }, 4);
    const before = JSON.stringify(snap);
    const variants = questions.inspect(snap).eligible.filter(row => row.concept === concept);
    assert.equal(variants.length, 1, `${possession} ${concept} ${a},${b}`);
    const entry = variants[0];
    assert.equal(entry.familyId, suffix ? `${concept}-${suffix}` : concept);
    assert.deepEqual(plain(questions.sourceStatus(entry)), { included: true, guided: !suffix });
    assert.equal(entry.weight, 2);
    assert.equal(entry.purpose, 'approvedExtension');
    const q = questions.build(snap, entry.familyId);
    assert.equal(q.answer.value, concept === 'score-total-ch8' ? a + b : a - b);
    for (const stage of ['initial', 'guided']) {
      assert.equal(q.visuals[stage].revealsAnswer, false);
      assert.equal(q.visuals[stage].result, null);
    }
    assert.equal(JSON.stringify(snap), before);
  }
  const snap = makeSnap(domain, { scores: { player: 7, opponent: 6 } }, 4);
  for (const [page, included] of [[106, false], [107, true], [113, true]]) {
    const profile = { worktexts: { 'Math Mammoth Grade 1-B': { edition: 2026, includedThroughPage: page } } };
    assert.equal(questions.inspect(snap, profile).eligible.some(row => row.familyId === 'score-total-ch8-within-20'), included);
  }
  assert.equal(questions.inspect(snap, { worktexts: { 'Math Mammoth Grade 1-B': { edition: 2025, includedThroughPage: 149 } } }).eligible.some(row => row.concept === 'score-total-ch8'), false);
});

test('ordered team yardage and unordered score addition retain one correctly supported relation', () => {
  const { questions, domain } = loadModules();
  for (const possession of ['offense', 'defense']) {
    for (const [a, b, suffix] of [[4, 13, null], [13, 4, 'ones-add'], [7, 6, 'within-20'], [27, 5, null]]) {
      const snap = makeSnap(domain, { possession, yardLine: 50, driveStart: 50,
        totalYards: { player: a, opponent: a }, scores: { player: a, opponent: b } }, b);
      for (const concept of ['team-yards-add-ch8', 'score-total-ch8']) {
        const wanted = concept === 'score-total-ch8' && a === 4 ? 'ones-add' : suffix;
        const entries = questions.inspect(snap).eligible.filter(row => row.concept === concept);
        assert.equal(entries.length, 1, `${possession} ${concept} ${a}+${b}`);
        const entry = entries[0];
        assert.equal(entry.familyId, wanted ? `${concept}-${wanted}` : concept);
        assert.equal(entry.purpose, 'approvedExtension');
        assert.equal(entry.weight, 2);
        const status = questions.sourceStatus(entry);
        assert.deepEqual(plain(status), { included: true, guided: !wanted });
        const q = questions.build(snap, entry.familyId, { support: status.guided ? 'guided' : 'initial' });
        assert.equal(q.concept, concept);
        assert.equal(q.support, wanted ? 'initial' : 'guided');
        assert.equal(q.answer.value, a + b);
        assert.equal(q.visuals[q.support].result, null);
      }
    }
  }
});

test('line and goal remainder variants respect the completed ones-subtraction boundary in both directions', () => {
  const { questions, domain } = loadModules();
  const cases = [[14, 2, 'ones-subtract'], [19, 9, 'ones-subtract'], [47, 5, 'ones-subtract'],
    [99, 9, 'ones-subtract'], [14, 7, null], [20, 7, null], [40, 7, null], [43, 7, 'excluded']];
  for (const possession of ['offense', 'defense']) for (const [a, b, suffix] of cases) {
    for (const concept of ['line-remaining-ch8', 'goal-remaining-ch8']) {
      const yardLine = concept === 'goal-remaining-ch8'
        ? (possession === 'offense' ? 100 - a : a)
        : (possession === 'offense' ? 1 : 99);
      const snap = makeSnap(domain, { possession, yardLine, driveStart: yardLine, yardsToGo: a }, b);
      const entries = questions.inspect(snap).eligible.filter(row => row.concept === concept);
      // #51: 99 to go from the 1 is goal to go, so the goal family owns it.
      const goalToGoLine = concept === 'line-remaining-ch8' && a === 99;
      assert.equal(entries.length, suffix === 'excluded' || goalToGoLine ? 0 : 1, `${possession} ${concept} ${a}-${b}`);
      if (goalToGoLine) {
        assert.equal(snap.context.firstDownLine, possession === 'offense' ? 100 : 0);
        assert.deepEqual(plain(questions.inspect(snap).eligible.filter(row => row.concept === 'goal-remaining-ch8').map(row => row.familyId)),
          ['goal-remaining-ch8-ones-subtract'], `${possession} goal owns ${a}-${b}`);
      }
      if (suffix === 'excluded' || goalToGoLine) continue;
      const entry = entries[0];
      assert.equal(entry.familyId, suffix ? `${concept}-${suffix}` : concept);
      assert.equal(entry.weight, 2);
      assert.equal(entry.purpose, 'approvedExtension');
      const status = questions.sourceStatus(entry);
      assert.deepEqual(plain(status), { included: true, guided: !suffix });
      const q = questions.build(snap, entry.familyId, { support: status.guided ? 'guided' : 'initial' });
      assert.equal(q.answer.value, a - b);
      assert.equal(q.visuals[q.support].result, null);
      assert.equal(q.visuals[q.support].revealsAnswer, false);
    }
  }
});

test('within-20 retry hints use one make-ten strategy without revealing the result', () => {
  const { questions, domain } = loadModules();
  for (const [a, b, caption] of [[7, 6, '7 + 3 makes 10. Then 3 more.'], [9, 9, '9 + 1 makes 10. Then 8 more.']]) {
    const snap = makeSnap(domain, { scores: { player: a, opponent: b } }, 4);
    const q = questions.build(snap, 'score-total-ch8-within-20', { support: 'guided' });
    assert.equal(q.hint.text, 'Make ten first, then add the rest.');
    assert.equal(q.visuals.guided.type, 'arithmetic-model');
    assert.equal(q.visuals.guided.data.caption, caption);
    assert.match(q.visuals.guided.ariaLabel, new RegExp(`^${a} \\+ ${b}\\. Two ten-frames: .* Make ten first, then add the rest\\. The answer is hidden\\.$`));
    assert.equal(q.visuals.guided.result, null);
    assert.equal(q.visuals.guided.revealsAnswer, false);
    assert.doesNotMatch(q.visuals.guided.ariaLabel, /tens and ones|double you know|Work out/);
  }
});

// Issue #138: guided models for every operand pair the completed families accept.
const COMPLETED_MODEL_BY_SUFFIX = { 'within-20': 'make-ten', 'ones-add': 'tens-add', 'ones-subtract': 'tens-subtract' };
const COMPLETED_HINT_BY_MODEL = {
  'make-ten': 'Make ten first, then add the rest.',
  'tens-add': 'Keep the tens. Add the ones.',
  'tens-subtract': 'Keep the tens. Take away the ones.',
};

function loadCurriculumModules() {
  return readFile(new URL('../shared/curriculum.js', import.meta.url), 'utf8').then((curriculumSource) => {
    const ctx = vm.createContext({});
    vm.runInContext(curriculumSource, ctx, { filename: 'curriculum.js' });
    vm.runInContext(opponentSource, ctx, { filename: 'opponent.js' });
    vm.runInContext(domainSource, ctx, { filename: 'football-domain.js' });
    vm.runInContext(copySource, ctx, { filename: 'copy.js' });
    vm.runInContext(questionsSource, ctx, { filename: 'contextual-questions.js' });
    return { questions: ctx.FOOTBALL_CONTEXTUAL_QUESTIONS, domain: ctx.FOOTBALL_DOMAIN };
  });
}

function containsNumberToken(text, value) {
  return new RegExp(`(^|[^0-9])${value}([^0-9]|$)`).test(text);
}

function numericLeaves(value, path = '') {
  if (typeof value === 'number') return [[path, value]];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => numericLeaves(child, `${path}/${key}`));
}

function countingRng() {
  const rng = () => { rng.draws++; return 0.4; };
  rng.draws = 0;
  return rng;
}

function assertCompletedModel(questions, snap, row, profile, label) {
  const suffix = Object.keys(COMPLETED_MODEL_BY_SUFFIX).find(name => row.familyId.endsWith(`-${name}`));
  const kind = COMPLETED_MODEL_BY_SUFFIX[suffix];
  const before = JSON.stringify(snap);
  const initialRng = countingRng();
  const guidedRng = countingRng();
  const initial = questions.build(snap, row.familyId, { support: 'initial', profile, presentationRng: initialRng });
  const guided = questions.build(snap, row.familyId, { support: 'guided', profile, presentationRng: guidedRng });
  assert.equal(JSON.stringify(snap), before, `${label}: snapshot unchanged`);
  // Support changes only the selected stage; identity, choices and RNG use stay frozen.
  assert.equal(initialRng.draws, guidedRng.draws, `${label}: presentation draws`);
  assert.deepEqual(plain({ ...initial, support: null, math: null }), plain({ ...guided, support: null, math: null }), `${label}: support-invariant question`);
  assert.equal(guided.math.type, 'arithmetic-model', label);

  const answer = initial.answer.value;
  const { a, b, operator } = initial.visuals.initial.data;
  const equation = `${a} ${operator} ${b}`;
  assert.deepEqual(plain(initial.visuals.initial.data), { a, b, operator }, `${label}: initial equation`);
  assert.equal(initial.visuals.initial.type, 'arithmetic-equation');
  assert.equal(initial.visuals.initial.result, null);
  assert.equal(initial.visuals.worked.type, 'arithmetic-equation');
  assert.deepEqual(plain(initial.visuals.worked.data), { a, b, operator }, `${label}: worked equation`);
  assert.equal(initial.visuals.worked.result.value, answer);
  assert.equal(initial.visuals.worked.ariaLabel, `${equation} equals ${answer}.`);
  // #51: yardage relations follow the equation with one football sentence
  // about the question's hypothetical gain; other relations stay bare.
  const yardage = /^(?:line-remaining|goal-remaining|line-to-gain-surplus)-ch8-/.test(row.familyId);
  if (yardage) {
    assert.ok(initial.explain.startsWith(`${equation} = ${answer}. `), `${label}: ${initial.explain}`);
    assert.match(initial.explain.slice(`${equation} = ${answer}. `.length), / would (?:leave|take|reach) /, label);
  } else {
    assert.equal(initial.explain, `${equation} = ${answer}.`);
  }

  const visual = initial.visuals.guided;
  const data = visual.data;
  assert.equal(visual.type, 'arithmetic-model', label);
  assert.equal(visual.result, null, label);
  assert.equal(visual.revealsAnswer, false, label);
  assert.equal(data.model, kind, label);
  assert.deepEqual([data.a, data.b, data.operator], [a, b, operator], `${label}: equation order unchanged`);
  for (const key of ['result', 'answer', 'total', 'sum', 'difference']) assert.equal(key in data, false, `${label}: no ${key} field`);
  // Only the genuine original operands may equal the answer (zero addends/subtrahends).
  for (const [path, value] of numericLeaves(data)) {
    if (path === '/a' || path === '/b') continue;
    assert.notEqual(value, answer, `${label}: ${path} carries the computed result`);
  }

  if (kind === 'make-ten') {
    const larger = Math.max(a, b);
    const other = a + b - larger;
    assert.equal(data.largerOperand, b > a ? 'b' : 'a', `${label}: larger first, first on ties`);
    assert.equal(data.larger, larger);
    assert.equal(data.other, other);
    assert.equal(data.completeTen, 10 - larger);
    assert.equal(data.rest, other - (10 - larger));
    assert.ok(data.completeTen >= 1 && data.rest >= 1, `${label}: crosses ten`);
    assert.deepEqual(plain(data.frames), [{ source: larger, added: 10 - larger }, { source: 0, added: data.rest }]);
    assert.equal(data.caption, `${larger} + ${10 - larger} makes 10. Then ${data.rest} more.`);
  } else {
    const ordered = row.familyId.startsWith('team-yards') || operator === '−';
    const baseOperand = ordered || a >= 10 ? 'a' : 'b';
    if (ordered) assert.equal(data.baseOperand, 'a', `${label}: ordered relation never swaps`);
    assert.equal(data.baseOperand, baseOperand, `${label}: two-digit rod base`);
    const base = baseOperand === 'a' ? a : b;
    const part = baseOperand === 'a' ? b : a;
    assert.ok(base >= 10 && base <= 99 && part <= 9, label);
    assert.equal(data.tens * 10 + data.sourceOnes, base, `${label}: rods and white ones rebuild the base`);
    if (kind === 'tens-add') {
      assert.equal(data.addedOnes, part);
      assert.ok(data.sourceOnes + data.addedOnes <= 9, `${label}: no regrouping`);
    } else {
      assert.equal(data.removedOnes, part);
      assert.ok(data.removedOnes <= data.sourceOnes, `${label}: no borrowing`);
    }
  }

  // New explanatory copy never names the computed result; the guided label
  // may repeat the original equation, which can legitimately equal it.
  const hint = COMPLETED_HINT_BY_MODEL[kind];
  // A yardage hint leads with its football givens, then the same strategy.
  const strategyText = yardage ? initial.hint.text.slice(-hint.length) : initial.hint.text;
  assert.equal(strategyText, hint, label);
  assert.doesNotMatch(strategyText, /Work out/);
  if (yardage) {
    const lead = initial.hint.text.slice(0, -hint.length - 1);
    assert.equal(`${lead} ${hint}`, initial.hint.text, label);
    assert.ok(containsNumberToken(lead, a) && containsNumberToken(lead, b), `${label}: hint lead names both givens: ${lead}`);
    // Only the givens may appear; the lead never states the result.
    const withoutGivens = lead.replace(new RegExp(`(^|[^0-9])(?:${a}|${b})(?=[^0-9]|$)`, 'g'), '$1');
    assert.equal(containsNumberToken(withoutGivens, answer), false, `${label}: hint lead names ${answer}: ${lead}`);
  }
  for (const [name, text] of [['caption', data.caption], ['description', data.description], ['hint', strategyText]]) {
    assert.equal(containsNumberToken(text, answer), false, `${label}: ${name} names ${answer}: ${text}`);
  }
  const prefix = `${equation}. `;
  assert.ok(visual.ariaLabel.startsWith(prefix), `${label}: guided label starts with the equation`);
  assert.equal(visual.ariaLabel, `${prefix}${data.description} ${hint} The answer is hidden.`);
  assert.equal(containsNumberToken(visual.ariaLabel.slice(prefix.length), answer), false, `${label}: guided label names ${answer}`);
  assert.equal(initial.visuals.initial.ariaLabel, `${equation} equals an unknown number.`);

  // Coach Replay: the strategy sentence, then the unchanged full worked result.
  assert.deepEqual(plain(initial.workedReview.steps.map(step => step.text)), [initial.hint.text, initial.explain]);
  if (yardage) assert.match(initial.workedReview.footballMeaning.text, /^For the question's \d+-yard (?:run|pass|gain), /, label);
  return { kind, key: `${row.familyId}:${a},${b}` };
}

// Independent expected pairs, written from the published Grade 1-B pages rather
// than the production derive. Sums 11-18 follow the make-ten pages (11 on p. 102,
// near doubles p. 103, with 9 p. 104, with 8 p. 106, the rest p. 119); tens and
// ones without regrouping open on p. 108 (add) and p. 110 (subtract). A relation
// already inside 10 (10 + 0, 10 - b) stays a within-10 fact.
const ORIGINAL_COMPLETED_FAMILIES = ['score-total-ch8-within-20', 'team-yards-add-ch8-within-20',
  'score-total-ch8-ones-add', 'team-yards-add-ch8-ones-add', 'score-difference-ch8-ones-subtract'];
const LINE_GOAL_COMPLETED_FAMILIES = ['line-remaining-ch8-ones-subtract', 'goal-remaining-ch8-ones-subtract'];

function makeTenPage(a, b) {
  if (a + b === 11) return 102;
  if (Math.abs(a - b) <= 1) return 103;
  if (a === 9 || b === 9) return 104;
  if (a === 8 || b === 8) return 106;
  return 119;
}

function completedPairOracle(page) {
  const expected = Object.fromEntries([...ORIGINAL_COMPLETED_FAMILIES, ...LINE_GOAL_COMPLETED_FAMILIES].map(id => [id, new Set()]));
  const add = (familyId, a, b) => expected[familyId].add(`${familyId}:${a},${b}`);
  for (let a = 0; a <= 9; a++) for (let b = 0; b <= 9; b++) {
    if (a + b < 11 || makeTenPage(a, b) > page) continue;
    add('score-total-ch8-within-20', a, b);
    add('team-yards-add-ch8-within-20', a, b);
  }
  for (let base = 10; base <= 99; base++) for (let part = 0; part <= 9; part++) {
    if (page >= 108 && base % 10 + part <= 9 && !(base === 10 && part === 0)) {
      // Score totals are unordered, so the ones may come first; team yards never swap.
      add('score-total-ch8-ones-add', base, part);
      add('score-total-ch8-ones-add', part, base);
      add('team-yards-add-ch8-ones-add', base, part);
    }
    if (page >= 110 && base > 10 && part <= base % 10) {
      for (const familyId of ['score-difference-ch8-ones-subtract', ...LINE_GOAL_COMPLETED_FAMILIES]) add(familyId, base, part);
    }
  }
  return expected;
}

function keysFor(keys, familyId) {
  return [...keys].filter(key => key.startsWith(`${familyId}:`)).sort();
}

test('every accepted completed-arithmetic pair builds a matching result-free guided model at pages 113 and 187', async () => {
  const { questions, domain } = await loadCurriculumModules();
  const profile = page => ({ worktexts: { 'Math Mammoth Grade 1-B': { edition: 2026, completedThroughPage: page } } });
  const pairs = [];
  for (let a = 0; a <= 99; a++) for (let b = 0; b <= 9; b++) pairs.push([a, b, b]);
  for (let a = 0; a <= 9; a++) for (let b = 10; b <= 99; b++) pairs.push([a, b, 4]);
  const seen = {};
  for (const page of [113, 187]) {
    const keys = new Set();
    for (const [a, b, gain] of pairs) {
      const snap = makeSnap(domain, { scores: { player: a, opponent: b },
        totalYards: { player: gain === b ? a : 71, opponent: 71 } }, gain);
      for (const row of questions.inspect(snap, profile(page)).eligible) {
        if (!/-(within-20|ones-add|ones-subtract)$/.test(row.familyId)) continue;
        keys.add(assertCompletedModel(questions, snap, row, profile(page), `p${page} ${row.familyId} ${a},${b}`).key);
      }
    }
    seen[page] = keys;
  }
  const count = (page, familyId) => keysFor(seen[page], familyId).length;
  for (const page of [113, 187]) {
    const expected = completedPairOracle(page);
    for (const familyId of ORIGINAL_COMPLETED_FAMILIES) {
      assert.deepEqual(keysFor(seen[page], familyId), [...expected[familyId]].sort(), `p${page} ${familyId} accepted pairs`);
    }
    // These snaps fix yards to go at 10 and the ball at its own 30, so the only
    // line or goal pair they reach is 70 - 0 to the goal.
    assert.deepEqual([...seen[page]].filter(key => !ORIGINAL_COMPLETED_FAMILIES.some(id => key.startsWith(`${id}:`))),
      ['goal-remaining-ch8-ones-subtract:70,0'], `p${page} line and goal pairs`);
  }
  // Page 187 accepts every no-regrouping pair: 36 within-20 sums and 494 ones pairs per order.
  assert.equal(count(187, 'score-total-ch8-within-20'), 36);
  assert.equal(count(187, 'team-yards-add-ch8-within-20'), 36);
  assert.equal(count(187, 'score-total-ch8-ones-add'), 988);
  assert.equal(count(187, 'team-yards-add-ch8-ones-add'), 494);
  assert.equal(count(187, 'score-difference-ch8-ones-subtract'), 494);
  // Page 113 keeps the completed tens-and-ones pages; only 5 + 7 and 7 + 5 (p. 119) wait.
  for (const familyId of ['score-total-ch8-ones-add', 'team-yards-add-ch8-ones-add', 'score-difference-ch8-ones-subtract']) {
    assert.equal(count(113, familyId), count(187, familyId), familyId);
  }
  assert.equal(count(113, 'score-total-ch8-within-20'), 34);
  assert.equal(count(113, 'team-yards-add-ch8-within-20'), 34);
  for (const key of seen[113]) assert.ok(seen[187].has(key), `${key} at 113 is also accepted at 187`);
  for (const key of ['score-total-ch8-within-20:7,6', 'score-total-ch8-within-20:9,9', 'score-total-ch8-ones-add:4,23',
    'score-total-ch8-ones-add:23,0', 'score-total-ch8-ones-add:0,23', 'score-total-ch8-ones-add:99,0',
    'team-yards-add-ch8-ones-add:23,2', 'score-difference-ch8-ones-subtract:36,4', 'score-difference-ch8-ones-subtract:36,6',
    'score-difference-ch8-ones-subtract:30,0', 'score-difference-ch8-ones-subtract:99,9']) {
    assert.ok(seen[113].has(key), `${key} at 113`);
  }
  for (const key of ['score-total-ch8-within-20:7,5', 'score-total-ch8-within-20:5,7', 'score-total-ch8-within-20:6,6']) {
    assert.ok(seen[187].has(key), `${key} at 187`);
  }
});

test('every accepted line and goal remainder pair builds its guided model on both possessions at pages 113 and 187', async () => {
  const { questions, domain } = await loadCurriculumModules();
  const profile = page => ({ worktexts: { 'Math Mammoth Grade 1-B': { edition: 2026, completedThroughPage: page } } });
  // Legal field states only: yards to go never passes the goal, and gains run
  // from 0 up to the goal without clamping.
  const states = [];
  for (const possession of ['offense', 'defense']) {
    // Every yards to go, with a goal distance varied at or beyond the marker.
    // #51: goal to go belongs to the goal family, so a varied goal that lands
    // on the marker also gets the 99-yard field, short of the goal.
    for (let toGo = 1; toGo <= 99; toGo++) {
      const varied = toGo + (toGo * 37) % (100 - toGo);
      for (const goal of varied === toGo && toGo < 99 ? [varied, 99] : [varied]) {
        for (let gain = 0; gain <= goal; gain++) states.push({ possession, goal, toGo, gain });
      }
    }
    // Every goal distance, with yards to go varied up to it.
    for (let goal = 1; goal <= 99; goal++) {
      const toGo = 1 + (goal * 13 + 5) % goal;
      for (let gain = 0; gain <= goal; gain++) states.push({ possession, goal, toGo, gain });
    }
  }
  const snaps = states.map(({ possession, goal, toGo, gain }) => {
    const yardLine = possession === 'offense' ? 100 - goal : goal;
    const snap = makeSnap(domain, { possession, yardLine, driveStart: yardLine, yardsToGo: toGo }, gain);
    assert.equal(snap.proposal.appliedGain, gain, `${possession} ${goal}/${toGo}+${gain}: unclamped gain`);
    return { possession, snap, label: `${possession} goal ${goal} to go ${toGo} gain ${gain}` };
  });
  for (const page of [113, 187]) {
    const seen = { offense: new Set(), defense: new Set() };
    for (const { possession, snap, label } of snaps) {
      for (const row of questions.inspect(snap, profile(page)).eligible) {
        if (!LINE_GOAL_COMPLETED_FAMILIES.includes(row.familyId)) continue;
        seen[possession].add(assertCompletedModel(questions, snap, row, profile(page), `p${page} ${row.familyId} ${label}`).key);
      }
    }
    const expected = completedPairOracle(page);
    for (const possession of ['offense', 'defense']) for (const familyId of LINE_GOAL_COMPLETED_FAMILIES) {
      const keys = keysFor(seen[possession], familyId);
      // 99 to go is always goal to go, which only the goal family measures.
      const line = familyId === 'line-remaining-ch8-ones-subtract';
      const wanted = [...expected[familyId]].filter(key => !line || !key.startsWith(`${familyId}:99,`)).sort();
      assert.deepEqual(keys, wanted, `p${page} ${possession} ${familyId} accepted pairs`);
      assert.equal(keys.length, line ? 484 : 494, `p${page} ${possession} ${familyId} count`);
      for (const key of [':11,1', ':20,0', ':30,0', ':36,6', ...(line ? [] : [':99,9'])]) assert.ok(keys.includes(`${familyId}${key}`), `${familyId}${key}`);
      for (const key of [':10,0', ':36,7', ':40,1', ':19,10', ...(line ? [':99,9'] : [])]) assert.ok(!keys.includes(`${familyId}${key}`), `${familyId}${key} excluded`);
    }
  }
});

test('guided models keep operand order, normalize the rod base, and work on both possessions', () => {
  const { questions, domain } = loadModules();
  const cases = [
    ['score-total-ch8-within-20', { scores: { player: 6, opponent: 8 } }, 4,
      { model: 'make-ten', largerOperand: 'b', frames: [{ source: 8, added: 2 }, { source: 0, added: 4 }], caption: '8 + 2 makes 10. Then 4 more.' }],
    ['score-total-ch8-within-20', { scores: { player: 7, opponent: 7 } }, 4,
      { model: 'make-ten', largerOperand: 'a', frames: [{ source: 7, added: 3 }, { source: 0, added: 4 }], caption: '7 + 3 makes 10. Then 4 more.' }],
    ['score-total-ch8-ones-add', { scores: { player: 4, opponent: 23 } }, 4,
      { model: 'tens-add', baseOperand: 'b', tens: 2, sourceOnes: 3, addedOnes: 4, caption: '2 tens stay. 3 ones + 4 ones.' }],
    ['score-total-ch8-ones-add', { scores: { player: 13, opponent: 0 } }, 4,
      { model: 'tens-add', baseOperand: 'a', tens: 1, sourceOnes: 3, addedOnes: 0, caption: '1 ten stays. 3 ones + 0 ones.' }],
    ['team-yards-add-ch8-ones-add', { totalYards: { player: 23, opponent: 23 }, scores: { player: 3, opponent: 4 } }, 2,
      { model: 'tens-add', baseOperand: 'a', tens: 2, sourceOnes: 3, addedOnes: 2, caption: '2 tens stay. 3 ones + 2 ones.' }],
    ['score-difference-ch8-ones-subtract', { scores: { player: 4, opponent: 36 } }, 4,
      { model: 'tens-subtract', baseOperand: 'a', tens: 3, sourceOnes: 6, removedOnes: 4, caption: '3 tens stay. 6 ones take away 4.' }],
    ['score-difference-ch8-ones-subtract', { scores: { player: 21, opponent: 1 } }, 4,
      { model: 'tens-subtract', baseOperand: 'a', tens: 2, sourceOnes: 1, removedOnes: 1, caption: '2 tens stay. 1 one take away 1.' }],
  ];
  for (const possession of ['offense', 'defense']) for (const [familyId, overrides, gain, expected] of cases) {
    const fixture = { ...overrides };
    if (possession === 'defense' && overrides.totalYards) fixture.totalYards = { player: 71, opponent: overrides.totalYards.player };
    const snap = makeSnap(domain, { possession, ...fixture }, gain);
    assert.ok(questions.inspect(snap).eligible.some(row => row.familyId === familyId), `${possession} ${familyId}`);
    const q = questions.build(snap, familyId, { support: 'guided' });
    for (const [key, value] of Object.entries(expected)) {
      assert.deepEqual(plain(q.visuals.guided.data[key]), value, `${possession} ${familyId} ${key}`);
    }
    assert.equal(q.math.type, 'arithmetic-model');
    assert.equal(q.visuals.initial.type, 'arithmetic-equation');
    assert.equal(q.visuals.worked.type, 'arithmetic-equation');
  }
  // Families outside the completed domains keep their original guided equation.
  const later = makeSnap(domain, { scores: { player: 27, opponent: 5 } }, 4);
  const q = questions.build(later, 'score-total-ch8', { support: 'guided' });
  assert.equal(q.visuals.guided.type, 'arithmetic-equation');
  assert.equal(q.hint.text, 'Work out 27 + 5. Use the tens and ones or count on or back.');
  assert.equal(q.visuals.guided.ariaLabel, 'Use the tens and ones: 27 + 5; the answer is hidden.');
});

test('published Grade 1-B source map matches every runtime family coordinate', async () => {
  const { questions } = loadModules();
  const progress = JSON.parse(await readFile(new URL('../football/curriculum-progress.json', import.meta.url), 'utf8'));
  const source = progress.additionalWorktexts.find(book => book.title === 'Math Mammoth Grade 1-B');
  assert.equal(source.completedThroughPage, 113);
  assert.equal(source.asOfDate, '2026-09-18');
  assert.equal(source.completedThroughPage, questions.WORKTEXTS[source.title].completedThroughPage);
  assert.equal(source.runtimeCatalogThroughPage, questions.WORKTEXTS[source.title].includedThroughPage);
  const entries = source.sourceMap.flatMap(row => row.families.map(familyId => ({ familyId, row })));
  const runtime = questions.FAMILY_REGISTRY.scrimmage.filter(family => family.worktext === source.title);
  assert.deepEqual(entries.map(entry => entry.familyId).sort(), plain(runtime.map(family => family.familyId)).sort());
  for (const family of runtime) {
    const { row } = entries.find(entry => entry.familyId === family.familyId);
    assert.equal(row.introducedOnPage, family.introducedOnPage, family.familyId);
    assert.equal(row.coverageThroughPage, family.coverageThroughPage, family.familyId);
    assert.equal(source.edition, family.edition);
  }
});

test('Grade 1-B contextual arithmetic is completion-gated by the shared curriculum authority', async () => {
  const curriculumSource = await readFile(new URL('../shared/curriculum.js', import.meta.url), 'utf8');
  const ctx = vm.createContext({});
  vm.runInContext(curriculumSource, ctx, { filename: 'curriculum.js' });
  vm.runInContext(opponentSource, ctx, { filename: 'opponent.js' });
  vm.runInContext(domainSource, ctx, { filename: 'football-domain.js' });
  vm.runInContext(copySource, ctx, { filename: 'copy.js' });
  vm.runInContext(questionsSource, ctx, { filename: 'contextual-questions.js' });
  const questions = ctx.FOOTBALL_CONTEXTUAL_QUESTIONS, domain = ctx.FOOTBALL_DOMAIN;
  const profile = page => ({ worktexts: { 'Math Mammoth Grade 1-B': { edition: 2026, completedThroughPage: page } } });
  const score = (a, b) => makeSnap(domain, { scores: { player: a, opponent: b } }, 4);
  // Later-page relations: two-digit plus two-digit, subtraction across ten, two-digit minus two-digit.
  for (const [a, b] of [[23, 14], [14, 7], [67, 24]]) {
    const at113 = questions.inspect(score(a, b), profile(113));
    assert.equal(at113.eligible.some(row => row.familyId.startsWith('score-')), false, `${a},${b} at 113`);
    assert.ok(at113.declined.filter(row => row.familyId.startsWith('score-')).every(row => row.reason.code === 'curriculum-not-completed'), `${a},${b} decline code`);
    assert.ok(questions.inspect(score(a, b), profile(187)).eligible.some(row => row.familyId.startsWith('score-')), `${a},${b} at 187`);
  }
  // Completed relations stay available at 113 with their exact completed variant.
  assert.ok(questions.inspect(score(7, 6), profile(113)).eligible.some(row => row.familyId === 'score-total-ch8-within-20'));
  assert.ok(questions.inspect(score(10, 9), profile(113)).eligible.some(row => row.familyId === 'score-total-ch8-ones-add'));
  assert.ok(questions.inspect(score(47, 5), profile(113)).eligible.some(row => row.familyId === 'score-difference-ch8-ones-subtract'));
  // Every eligible Grade 1-B workbook family at a page was introduced at or before that page.
  for (const page of [113, 120, 137, 187]) for (const [a, b] of [[23, 14], [14, 7], [67, 24], [7, 6], [47, 5]]) {
    for (const row of questions.inspect(score(a, b), profile(page)).eligible) {
      if (row.worktext === 'Math Mammoth Grade 1-B' && row.familyId.startsWith('score-difference')) assert.ok(row.introducedOnPage <= page, `${row.familyId} ${page}`);
    }
  }
});

// #51 natural yardage. Expected copy here is written from the football facts
// of each fixture, not read back from production.
const PASS = { offense: 'mediumPass', defense: null, matchup: null };
const RUN = { offense: 'shortRun', defense: null, matchup: null };
// Families measuring to the line to gain, and to the end zone. Goal to go, the
// two targets are the same line, so one family across both lists owns it.
const LINE_OWNERS = ['line-to-gain-missing-part', 'line-to-gain-exact', 'line-to-gain-surplus',
  'line-to-gain-surplus-ch8', 'line-to-gain-surplus-ch8-ones-subtract', 'line-remaining-ch8', 'line-remaining-ch8-ones-subtract'];
const GOAL_OWNERS = ['goal-remaining-ch8', 'goal-remaining-ch8-ones-subtract'];

async function loadSchedulerModules() {
  const [curriculumSource, learningSource] = await Promise.all([
    readFile(new URL('../shared/curriculum.js', import.meta.url), 'utf8'),
    readFile(new URL('../football/learning.js', import.meta.url), 'utf8'),
  ]);
  const ctx = vm.createContext({});
  for (const [source, filename] of [[curriculumSource, 'curriculum.js'], [opponentSource, 'opponent.js'],
    [domainSource, 'football-domain.js'], [copySource, 'copy.js'], [learningSource, 'learning.js'],
    [questionsSource, 'contextual-questions.js']]) vm.runInContext(source, ctx, { filename });
  return {
    questions: ctx.FOOTBALL_CONTEXTUAL_QUESTIONS,
    domain: ctx.FOOTBALL_DOMAIN,
    learning: vm.runInContext('FOOTBALL_LEARNING', ctx),
  };
}

const bookPage = page => ({ worktexts: { 'Math Mammoth Grade 1-B': { edition: 2026, completedThroughPage: page } } });

// Strips ordinals and every given number so only a stated result could remain.
function namesResult(text, givens, answer) {
  let rest = text.replace(/\b\d+(?:st|nd|rd|th)\b/g, ' ');
  for (const given of givens) rest = rest.replace(new RegExp(`(^|[^0-9])${given}(?=[^0-9]|$)`, 'g'), '$1');
  return containsNumberToken(rest, answer);
}

function expectNaturalYardage(questions, snap, familyId, expected, profile) {
  const ids = plain(questions.inspect(snap, profile).eligible.map(row => row.familyId));
  assert.ok(ids.includes(familyId), `${expected.label}: ${familyId} eligible in ${ids.join(', ')}`);
  // One owner for one target: no other yardage family measures the same line.
  const goalToGo = snap.context.firstDownLine === (snap.context.direction === 1 ? 100 : 0);
  const owners = goalToGo ? [...LINE_OWNERS, ...GOAL_OWNERS] : GOAL_OWNERS.includes(familyId) ? GOAL_OWNERS : LINE_OWNERS;
  assert.deepEqual(ids.filter(id => owners.includes(id)), [familyId], `${expected.label}: single owner`);
  assert.equal(goalToGo, Boolean(expected.endZone), `${expected.label}: fixture objective`);
  for (const support of ['initial', 'guided', 'worked']) {
    verifyGrounding(questions, snap, questions.build(snap, familyId, { support, profile, presentationRng: () => 0.37 }));
  }
  const q = questions.build(snap, familyId, { profile, presentationRng: () => 0.37 });
  assert.equal(q.answer.value, expected.answer, expected.label);
  assert.equal(q.prompt.text, expected.prompt, expected.label);
  if (expected.hint) assert.equal(q.hint.text, expected.hint, expected.label);
  if (expected.explanation) assert.equal(q.workedExplanation.text, expected.explanation, expected.label);
  if (expected.meaning) assert.equal(q.workedReview.footballMeaning.text, expected.meaning, expected.label);
  // Four unique legal numeric choices including the answer.
  assert.equal(q.choices.length, 4, expected.label);
  assert.equal(new Set(q.choices.map(choice => choice.value)).size, 4, expected.label);
  assert.ok(q.choices.every(choice => Number.isInteger(choice.value) && choice.value >= 0 && choice.value <= 100), expected.label);
  // Before evaluation nothing states the result or cues an exact reach.
  for (const [stage, text] of [['prompt', q.prompt.text], ['hint', q.hint.text],
    ['initial aria', q.visuals.initial.ariaLabel], ['guided aria', q.visuals.guided.ariaLabel]]) {
    assert.equal(namesResult(text, expected.givens, expected.answer), false, `${expected.label}: ${stage} names ${expected.answer}: ${text}`);
    assert.doesNotMatch(text, /exactly|line up|no yards? (?:is |are )?left|would reach|would score/i, `${expected.label}: ${stage} cues the result: ${text}`);
  }
  for (const stage of ['initial', 'guided']) {
    assert.equal(q.visuals[stage].result, null);
    assert.equal(q.visuals[stage].revealsAnswer, false);
  }
  // The conditional gain is never promised, and the end zone is never a first down.
  assert.match(q.prompt.text, /\bIf\b/);
  assert.doesNotMatch(`${q.prompt.text} ${q.hint.text}`, /\bwill\b|this play/i, expected.label);
  assert.match(q.workedExplanation.text, /\bwould\b/, expected.label);
  assert.match(q.workedReview.footballMeaning.text, /^For the question's \d+-yard (?:run|pass|gain), /, expected.label);
  assert.deepEqual(plain(q.workedReview.steps.map(step => step.text)), [q.hint.text, q.workedExplanation.text]);
  if (expected.endZone) {
    assert.doesNotMatch([q.prompt.text, q.hint.text, q.workedExplanation.text, q.workedReview.footballMeaning.text].join(' '), /first.down/i, expected.label);
  }
  assert.doesNotMatch(JSON.stringify(plain(q)), /past the end zone|beyond the end zone/i, expected.label);
  assert.doesNotMatch(`${q.prompt.text} ${q.hint.text} ${q.workedExplanation.text}`, /\b1 yards\b|\b(?:[02-9]|[1-9]\d) yard\b(?!-)/, `${expected.label}: unit agrees with its number`);
  return q;
}

test('#51 natural yardage asks one numeric football distance for short, exact, past and goal-to-go gains', async () => {
  const { questions, domain } = await loadSchedulerModules();
  const end = bookPage(187);
  // Opponent cases use the helper's default public match (UNC) with its
  // coherent private balanced snapshot; the copy names only the public UNC.
  const cases = [
    { familyId: 'line-to-gain-surplus-ch8', profile: bookPage(131), gain: 13,
      overrides: { down: 3, yardsToGo: 8, firstDownLine: 38, calls: PASS },
      expected: { label: 'approved 3rd and 8, 13-yard pass', answer: 5, givens: [13, 8],
        prompt: "It's 3rd and 8. If you complete a 13-yard pass, how far past the first-down marker would you get?",
        hint: 'The first 8 yards get you to the marker. Work out how much of the 13-yard pass is left. Use the tens and ones, or count on or back.',
        explanation: '13 − 8 = 5. A 13-yard completion on 3rd and 8 would take you 5 yards past the first-down marker.',
        meaning: "For the question's 13-yard pass, 8 yards reach the marker and 5 more go past it." } },
    { familyId: 'line-to-gain-missing-part', gain: 5,
      overrides: { down: 3, yardsToGo: 8, firstDownLine: 38, calls: RUN },
      expected: { label: 'short run', answer: 3, givens: [5, 8],
        prompt: "It's 3rd and 8. If you gain 5 yards, how many more yards would you need for a first down?",
        hint: 'You need 8 yards. Count on from 5 to 8.',
        explanation: '8 − 5 = 3. A 5-yard run on 3rd and 8 would leave you 3 yards short of the first-down marker.',
        meaning: "For the question's 5-yard run, start with the 8 yards needed for a first down and take away the 5 yards gained: 3 yards are left." } },
    { familyId: 'line-to-gain-exact', gain: 8,
      overrides: { down: 3, yardsToGo: 8, firstDownLine: 38, calls: RUN },
      expected: { label: 'exact run', answer: 0, givens: [8],
        prompt: "It's 3rd and 8. If you gain 8 yards, how many more yards would you need for a first down?",
        hint: 'You need 8 yards. Count on from 8 to 8.',
        explanation: '8 − 8 = 0. An 8-yard run on 3rd and 8 would reach the first-down marker exactly.' } },
    { familyId: 'line-to-gain-surplus-ch8-ones-subtract', profile: bookPage(110), gain: 18,
      overrides: { down: 3, yardsToGo: 7, firstDownLine: 37, calls: PASS },
      expected: { label: '3rd and 7, 18-yard pass', answer: 11, givens: [18, 7],
        prompt: "It's 3rd and 7. If you complete an 18-yard pass, how far past the first-down marker would you get?",
        hint: 'The first 7 yards get you to the marker. Work out how much of the 18-yard pass is left. Keep the tens. Take away the ones.' } },
    { familyId: 'line-to-gain-missing-part', gain: 4,
      overrides: { possession: 'defense', direction: -1, down: 2, yardLine: 60, yardsToGo: 9, firstDownLine: 51, driveStart: 70,
        calls: { offense: 'longPass', defense: 'run', matchup: 'mismatch' } },
      expected: { label: 'opponent 2nd and 9 keeps its call private', answer: 5, givens: [4, 9],
        prompt: 'UNC has 2nd and 9. If UNC gains 4 yards, how many more yards would UNC need for a first down?',
        hint: 'UNC needs 9 yards. Count on from 4 to 9.',
        explanation: '9 − 4 = 5. A 4-yard gain on 2nd and 9 would leave UNC 5 yards short of the first-down marker.' } },
    { familyId: 'line-to-gain-missing-part', gain: 4,
      overrides: { down: 2, yardLine: 93, yardsToGo: 7, firstDownLine: 100, driveStart: 80, calls: RUN },
      expected: { label: 'goal to go', answer: 3, givens: [4, 7], endZone: true,
        prompt: "It's 2nd and goal from the 7. If you gain 4 yards, how many yards would you be from the end zone?",
        hint: 'The end zone is 7 yards away. Count on from 4 to 7.',
        explanation: '7 − 4 = 3. A 4-yard run on 2nd and goal from the 7 would leave you 3 yards from the end zone.' } },
    { familyId: 'line-to-gain-surplus-ch8', profile: bookPage(137), gain: 24,
      overrides: { down: 1, yardsToGo: 10, firstDownLine: 40, calls: { offense: 'longPass', defense: null, matchup: null } },
      expected: { label: '1st and 10, 24-yard pass', answer: 14, givens: [24, 10],
        prompt: "It's 1st and 10. If you complete a 24-yard pass, how far past the first-down marker would you get?" } },
    { familyId: 'line-to-gain-missing-part', gain: 1,
      overrides: { down: 4, yardsToGo: 3, firstDownLine: 33, calls: RUN },
      expected: { label: 'fourth down never promises another down', answer: 2, givens: [1, 3],
        prompt: "It's 4th and 3. If you gain 1 yard, how many yards short of a first down would you be?",
        explanation: '3 − 1 = 2. A 1-yard run on 4th and 3 would leave you 2 yards short of the first-down marker.' } },
    { familyId: 'line-to-gain-exact', gain: 5,
      overrides: { down: 4, yardLine: 95, yardsToGo: 5, firstDownLine: 100, driveStart: 90, calls: RUN },
      expected: { label: 'exact goal-line touchdown', answer: 0, givens: [5], endZone: true,
        prompt: "It's 4th and goal from the 5. If you gain 5 yards, how many yards would you be from the end zone?",
        explanation: '5 − 5 = 0. A 5-yard run on 4th and goal from the 5 would reach the end zone for a touchdown.' } },
    { familyId: 'line-to-gain-surplus', gain: 9,
      overrides: { possession: 'defense', direction: -1, down: 1, yardLine: 50, yardsToGo: 1, firstDownLine: 49, driveStart: 60 },
      expected: { label: 'opponent past the marker by one-digit gains', answer: 8, givens: [9, 1],
        prompt: 'UNC has 1st and 1. If UNC gains 9 yards, how far past the first-down marker would UNC get?',
        hint: 'The first yard gets UNC to the marker. Work out how much of the 9-yard gain is left.',
        meaning: "For the question's 9-yard gain, 1 yard reaches the marker and 8 more go past it." } },
    { familyId: 'line-remaining-ch8-ones-subtract', gain: 2,
      overrides: { down: 2, yardsToGo: 14, firstDownLine: 44, calls: RUN },
      expected: { label: 'wider yards still needed', answer: 12, givens: [2, 14],
        prompt: "It's 2nd and 14. If you gain 2 yards, how many more yards would you need for a first down?",
        hint: 'You need 14 yards. Take the 2-yard run away from 14. Keep the tens. Take away the ones.' } },
    { familyId: 'goal-remaining-ch8-ones-subtract', gain: 3,
      overrides: { down: 2, yardLine: 86, yardsToGo: 14, firstDownLine: 100, driveStart: 70, calls: RUN },
      expected: { label: 'wider goal to go belongs to the goal family', answer: 11, givens: [3, 14], endZone: true,
        prompt: "It's 2nd and goal from the 14. If you gain 3 yards, how many yards would you be from the end zone?" } },
    { familyId: 'goal-remaining-ch8', gain: 7,
      overrides: { possession: 'defense', direction: -1, down: 1, yardLine: 40, yardsToGo: 10, firstDownLine: 30, driveStart: 60 },
      expected: { label: 'opponent distance to the end zone', answer: 33, givens: [7, 10, 40], endZone: false,
        prompt: 'UNC has 1st and 10, 40 yards from the end zone. If UNC gains 7 yards, how many yards would UNC be from the end zone?',
        explanation: '40 − 7 = 33. A 7-yard gain from 40 yards out would leave UNC 33 yards from the end zone.' } },
  ];
  for (const { familyId, profile = end, gain, overrides, expected } of cases) {
    const snap = makeSnap(domain, overrides, gain);
    assert.equal(snap.proposal.appliedGain, gain, `${expected.label}: uncapped fixture`);
    expectNaturalYardage(questions, snap, familyId, expected, profile);
  }
});

test('#51 past-marker questions decline scoring plays while the old marker and capped gain stay frozen', async () => {
  const { questions, domain } = await loadSchedulerModules();
  const surplus = ['line-to-gain-surplus', 'line-to-gain-surplus-ch8', 'line-to-gain-surplus-ch8-ones-subtract'];
  for (const [label, overrides, requested, applied] of [
    // The old marker sits short of the goal, but the capped gain scores.
    ['offense touchdown past an old marker', { yardLine: 93, yardsToGo: 3, firstDownLine: 96, driveStart: 80, calls: PASS }, 9, 7],
    ['offense wider touchdown', { yardLine: 82, yardsToGo: 5, firstDownLine: 87, driveStart: 70, calls: PASS }, 25, 18],
    ['defense touchdown past an old marker', { possession: 'defense', direction: -1, yardLine: 7, yardsToGo: 3, firstDownLine: 4, driveStart: 20 }, 9, 7],
  ]) {
    const snap = makeSnap(domain, overrides, requested);
    assert.equal(snap.proposal.resultKind, 'touchdown', label);
    assert.equal(snap.proposal.appliedGain, applied, `${label}: capped at the goal`);
    assert.equal(snap.context.firstDownLine, overrides.firstDownLine, `${label}: old marker`);
    const inspection = questions.inspect(snap, bookPage(187));
    assert.equal(inspection.eligible.some(row => surplus.includes(row.familyId)), false, label);
    if (applied <= 10) {
      assert.equal(inspection.declined.find(row => row.familyId === 'line-to-gain-surplus').reason.code, 'scoring-play-has-no-surplus', label);
    }
    assert.ok(inspection.eligible.some(row => row.familyId === 'touchdown-base-points'), `${label}: pool keeps a truthful question`);
  }
  // A non-scoring gain beyond the same marker still asks how far past it.
  const past = makeSnap(domain, { yardLine: 80, yardsToGo: 3, firstDownLine: 83, driveStart: 70, calls: PASS }, 9);
  assert.equal(past.proposal.resultKind, 'firstDown');
  assert.ok(questions.inspect(past, bookPage(187)).eligible.some(row => row.familyId === 'line-to-gain-surplus'));
});

test('#51 wider past-marker variants follow each operand pair page and leave within-10 work to the old family', async () => {
  const { questions, domain } = await loadSchedulerModules();
  const pass = (yardsToGo, gain) => makeSnap(domain, { down: 3, yardsToGo, firstDownLine: 30 + yardsToGo, calls: PASS }, gain);
  for (const [gain, toGo, familyId, page] of [
    [18, 7, 'line-to-gain-surplus-ch8-ones-subtract', 110],
    [13, 8, 'line-to-gain-surplus-ch8', 131],
    [20, 7, 'line-to-gain-surplus-ch8', 131],
    [24, 10, 'line-to-gain-surplus-ch8', 137],
    [30, 7, 'line-to-gain-surplus-ch8', 142],
  ]) {
    const snap = pass(toGo, gain);
    const label = `${gain} − ${toGo}`;
    const before = questions.inspect(snap, bookPage(page - 1));
    assert.equal(before.eligible.some(row => row.familyId.startsWith('line-to-gain-surplus-ch8')), false, `${label} before p${page}`);
    const reason = before.declined.find(row => row.familyId === familyId).reason.code;
    assert.ok(['curriculum-not-included', 'curriculum-not-completed'].includes(reason), `${label}: ${reason}`);
    const at = questions.inspect(snap, bookPage(page)).eligible.filter(row => row.familyId.startsWith('line-to-gain-surplus'));
    assert.deepEqual(plain(at.map(row => row.familyId)), [familyId], `${label} at p${page}`);
    const [entry] = at;
    assert.deepEqual([entry.concept, entry.operationType, entry.purpose, entry.weight, entry.worktext, entry.evidenceClass],
      ['line-to-gain', 'surplus', 'approvedExtension', 2, 'Math Mammoth Grade 1-B', 'independent']);
    assert.deepEqual(plain(entry.challenge), { concept: 'line-to-gain', role: 'core' });
    assert.deepEqual(plain(questions.sourceStatus(entry, bookPage(page))), { included: true, guided: false });
    assert.equal(questions.build(snap, familyId, { profile: bookPage(page) }).answer.value, gain - toGo);
  }
  // Borrowing past a ten is never taught here, at any page.
  assert.equal(questions.inspect(pass(7, 23), bookPage(187)).eligible.some(row => row.familyId.startsWith('line-to-gain-surplus')), false);
  // Within 10 stays with the original family and its legacy Grade 1-A page.
  for (const page of [113, 187]) {
    const ids = questions.inspect(pass(3, 9), bookPage(page)).eligible.map(row => row.familyId);
    assert.ok(ids.includes('line-to-gain-surplus'));
    assert.equal(ids.some(id => id.startsWith('line-to-gain-surplus-ch8')), false);
  }
  const legacy = questions.FAMILY_REGISTRY.scrimmage.find(row => row.familyId === 'line-to-gain-surplus');
  assert.deepEqual([legacy.worktext, legacy.introducedOnPage, legacy.tier, legacy.concept], ['Math Mammoth Grade 1-A', 110, 'within-10', 'line-to-gain']);
  assert.equal(questions.DEFAULT_PROFILE.computationMax, 10);
});

test('#51 the retired comparison never reaches the live pool or scheduler, even as a weak spot', async (t) => {
  const { questions, domain, learning } = await loadSchedulerModules();
  const now = Date.parse('2026-10-19T12:00:00Z');
  const snap = makeSnap(domain, { down: 3, yardsToGo: 8, firstDownLine: 38, calls: PASS }, 13);
  const profile = bookPage(131);
  const inspection = questions.inspect(snap, profile);
  assert.equal(inspection.declined.find(row => row.familyId === 'gain-vs-needed-comparison').reason.code, 'retired-from-live-play');
  // The pool production builds: every eligible family with its call weight.
  const pool = inspection.eligible.map(entry => ({ ...entry, selectionMultiplier: questions.selectionFor(snap, entry.familyId).multiplier }));
  assert.equal(pool.some(entry => entry.familyId === 'gain-vs-needed-comparison'), false);
  assert.equal(pool.find(entry => entry.familyId === 'line-to-gain-surplus-ch8').selectionMultiplier, questions.CALL_AFFINITY_MULTIPLIER);

  // Old comparison history decodes as a weak spot but is inert without a live entry.
  const weak = { 'line-to-gain-comparison': { independent: { firstTryCorrect: 0, retryCorrect: 1, secondMiss: 5 } } };
  const weakLast = { 'line-to-gain-comparison': { independent: { resolution: 'secondMiss', completedAt: new Date(now - 3600000).toISOString() } } };
  const oldRow = { gameId: 'old', playId: 'old-play-1', playType: 'scrimmage', instructionalStatus: 'presented',
    completedAt: new Date(now - 7200000).toISOString(), familyId: 'gain-vs-needed-comparison', concept: 'line-to-gain-comparison',
    evidenceClass: 'independent', grading: 'gate', resolution: 'secondMiss',
    attempts: [{ number: 1, correct: false, support: 'initial' }, { number: 2, correct: false, support: 'guided' }] };
  const downshiftRow = { ...oldRow, playId: 'old-play-2', familyId: 'line-to-gain-surplus-ch8', concept: 'line-to-gain' };

  const shares = (entries, session) => {
    const counts = {};
    const N = 20000;
    for (let i = 0; i < N; i++) {
      let draws = 0;
      const picked = learning.weightedPick(entries, session, () => { draws++; return (i + 0.5) / N; });
      assert.equal(draws, 1, 'one scheduler draw per pick');
      counts[picked.familyId] = (counts[picked.familyId] || 0) + 1 / N;
    }
    return counts;
  };
  const sum = (entries, counts, predicate) => Object.entries(counts)
    .filter(([id]) => predicate(entries.find(entry => entry.familyId === id)))
    .reduce((total, [, share]) => total + share, 0);
  assert.equal(learning.challengeStateFor(learning.createSession({}, {}, now, [oldRow, downshiftRow]), 'line-to-gain').preference, 'downshifted');
  const shortPool = (() => {
    const short = makeSnap(domain, { down: 3, yardsToGo: 8, firstDownLine: 38, calls: RUN }, 5);
    return questions.inspect(short, profile).eligible
      .map(entry => ({ ...entry, selectionMultiplier: questions.selectionFor(short, entry.familyId).multiplier }));
  })();
  for (const [label, entries] of [['13-yard pass', pool], ['5-yard run', shortPool]]) {
    assert.equal(entries.some(entry => entry.familyId === 'gain-vs-needed-comparison'), false, label);
    const baseline = shares(entries, learning.createSession(weak, weakLast, now, [oldRow]));
    const downshifted = shares(entries, learning.createSession(weak, weakLast, now, [oldRow, downshiftRow]));
    for (const counts of [baseline, downshifted]) assert.equal(counts['gain-vs-needed-comparison'], undefined, label);
    // A downshift redistributes only inside the ladder's own budget, so the
    // literacy share and the whole line-to-gain share stay put.
    const literacy = counts => sum(entries, counts, entry => entry.evidenceClass === 'literacy');
    const ladder = counts => sum(entries, counts, entry => entry.challenge?.concept === 'line-to-gain');
    assert.ok(literacy(baseline) > 0, label);
    assert.ok(Math.abs(literacy(baseline) - literacy(downshifted)) < 0.002, `${label}: literacy ${literacy(baseline)} vs ${literacy(downshifted)}`);
    assert.ok(Math.abs(ladder(baseline) - ladder(downshifted)) < 0.002, `${label}: ladder ${ladder(baseline)} vs ${ladder(downshifted)}`);
    t.diagnostic(`3rd and 8, ${label} at p131 baseline shares: ${JSON.stringify(Object.fromEntries(Object.entries(baseline).map(([id, share]) => [id, Number(share.toFixed(4))])))}`);
    if (label === '5-yard run') {
      // Inside the ladder, the downshift moves weight from stretch to core.
      assert.ok(downshifted['line-to-gain-fact-family'] < baseline['line-to-gain-fact-family'], `${label}: stretch share falls`);
      assert.ok(downshifted['line-to-gain-missing-part'] > baseline['line-to-gain-missing-part'], `${label}: core share rises`);
    }
  }
});

// #51 quarters and halves. Every expectation is written from the four-quarter
// game and the frozen live quarter, not read back from production. A worked
// row is [pieces, shaded quarters or halves, current quarter, halftime split,
// half labels]; guided rows have the same pieces with nothing shaded and no
// split or labels.
const QUARTER_WORD = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' };
const HALVES = ['1st half', '2nd half'];
const QH = {
  'quarters-still-to-come': {
    quarters: [1, 2, 3, 4], weight: 0.3, source: 'football-only',
    prompt: q => `It's the ${QUARTER_WORD[q]} quarter. How many more quarters come after this one?`,
    hint: () => "Count the quarters after the one we're playing. Don't include the current quarter.",
    cases: {
      1: { answer: 3, choices: [1, 2, 3, 4], explanation: 'The game has 4 quarters. After Q1 come Q2, Q3 and Q4, so 3 quarters come after this one.', rows: [[4, [2, 3, 4], 1]], caption: '3 quarters after Q1' },
      2: { answer: 2, choices: [0, 1, 2, 3], explanation: 'The game has 4 quarters. After Q2 come Q3 and Q4, so 2 quarters come after this one.', rows: [[4, [3, 4], 2]], caption: '2 quarters after Q2' },
      3: { answer: 1, choices: [0, 1, 2, 3], explanation: 'The game has 4 quarters. After Q3 comes Q4, so 1 quarter comes after this one.', rows: [[4, [4], 3]], caption: '1 quarter after Q3' },
      4: { answer: 0, choices: [0, 1, 2, 4], explanation: "Q4 is the last of the game's 4 quarters, so 0 quarters come after this one.", rows: [[4, [], 4]], caption: '0 quarters after Q4' },
    },
  },
  'quarters-before-halftime': {
    quarters: [1], weight: 0.15, source: 'football-only',
    prompt: () => "It's the first quarter. After this quarter, how many more quarters will be played before halftime?",
    hint: () => 'Halftime splits the four quarters into two equal halves. Count the quarters after this one that come before halftime.',
    cases: {
      1: { answer: 1, choices: [0, 1, 2, 3], explanation: 'Halftime comes after Q2. After Q1, only Q2 is played before halftime, so 1 quarter.', rows: [[4, [2], 1, true]], caption: '1 quarter before halftime' },
    },
  },
  'quarters-finished': {
    quarters: [3, 4], weight: 0.2, source: 'football-only',
    prompt: q => `We're playing the ${QUARTER_WORD[q]} quarter. How many quarters are completely finished?`,
    hint: () => "Count only the quarters before the one we're playing. The quarter we're playing isn't finished yet.",
    cases: {
      3: { answer: 2, choices: [0, 1, 2, 3], explanation: 'Q3 is still being played. Q1 and Q2 are finished, so 2 quarters are completely finished.', rows: [[4, [1, 2], 3]], caption: '2 quarters finished' },
      4: { answer: 3, choices: [1, 2, 3, 4], explanation: 'Q4 is still being played. Q1, Q2 and Q3 are finished, so 3 quarters are completely finished.', rows: [[4, [1, 2, 3], 4]], caption: '3 quarters finished' },
    },
  },
  'quarters-in-half': {
    quarters: [1, 2], weight: 0.15, source: 'football-only',
    prompt: () => 'How many quarters make the first half of this game?',
    hint: () => 'The game has four equal quarters. The first half is one of two equal parts of the game.',
    cases: Object.fromEntries([1, 2].map(q => [q, { answer: 2, choices: [1, 2, 3, 4],
      explanation: 'The 4 quarters split into two equal halves. Q1 and Q2 make the first half, so 2 quarters make the first half.',
      rows: [[4, [1, 2], null, true, HALVES]], guidedCurrent: [null], caption: '2 quarters in the first half' }])),
  },
  'second-half-quarters': {
    quarters: [3, 4], weight: 0.1, source: 'football-only',
    prompt: () => 'Which two quarters make the second half of this game?',
    hint: () => 'The game has four equal quarters. Split them in order into two equal halves. The second half comes after halftime.',
    cases: Object.fromEntries([3, 4].map(q => [q, { answer: '3rd and 4th', choices: ['1st and 2nd', '2nd and 3rd', '3rd and 4th'],
      explanation: 'Q1 and Q2 make the first half, and Q3 and Q4 make the second half: the 3rd and 4th quarters.',
      rows: [[4, [3, 4], null, true, HALVES]], guidedCurrent: [null], caption: 'The 3rd and 4th quarters' }])),
  },
  'game-part-boundary': {
    quarters: [1, 2, 3], weight: 0.2, source: 68,
    prompt: q => ({
      1: 'When the first quarter ends, what part of this four-quarter game is finished?',
      2: 'At halftime, what part of this four-quarter game is finished?',
      3: 'When the third quarter ends, what part of this four-quarter game is left?',
    })[q],
    hint: q => ({
      1: 'The game has four equal quarters. Count the quarters that are finished when this quarter ends, then name that part of the game.',
      2: 'Halftime comes when the second quarter ends. Count the finished quarters, then name that part of the four-quarter game.',
      3: 'The game has four equal quarters. Count the quarters still to play when this quarter ends, then name that part of the game.',
    })[q],
    cases: {
      1: { answer: 'One quarter', choices: ['One half', 'One quarter', 'The whole game', 'Three quarters'], explanation: 'When Q1 ends, 1 of the 4 equal quarters is finished. That is one quarter of the game.', rows: [[4, [1], 1]], caption: 'One quarter finished' },
      2: { answer: 'One half', choices: ['One half', 'One quarter', 'The whole game', 'Three quarters'], explanation: 'At halftime, Q1 and Q2 are finished: 2 of the 4 equal quarters. Two quarters make one half of the game.', rows: [[4, [1, 2], 2, true, HALVES]], caption: 'One half finished' },
      3: { answer: 'One quarter', choices: ['One half', 'One quarter', 'The whole game', 'Three quarters'], explanation: 'When Q3 ends, only Q4 is left: 1 of the 4 equal quarters. That is one quarter of the game.', rows: [[4, [4], 3]], caption: 'One quarter left' },
    },
  },
  'halves-make-whole': {
    quarters: [1, 2, 3, 4], weight: 0.1, source: 68,
    prompt: () => 'The first half and the second half together make what?',
    hint: () => 'A half is one of two equal parts. Put the first half and the second half together, then see how much of the game they cover.',
    cases: Object.fromEntries([1, 2, 3, 4].map(q => [q, { answer: 'One whole game', choices: ['One half', 'One quarter', 'One whole game'],
      explanation: 'The first half and the second half are the two equal parts of this game. Together they make one whole game.',
      rows: [[2, [1, 2], null]], guidedCurrent: [null], caption: 'One whole game' }])),
  },
  'game-part-compare': {
    quarters: [1, 2, 3, 4], weight: 0.2, source: 71,
    prompt: q => `Compare ${q <= 2 ? 'one half and one quarter' : q === 3 ? 'two quarters and one half' : 'one half and three quarters'} of this same game. Which is bigger, or are they the same size?`,
    hint: () => 'Picture this game split into two equal halves and into four equal quarters. Both strips are the same length. Compare how much of the game each part covers.',
    cases: {
      ...Object.fromEntries([1, 2].map(q => [q, { answer: 'One half', choices: ['One half', 'One quarter', 'Same size'],
        explanation: 'One half covers 2 of the 4 equal quarters. One quarter covers 1. One half is bigger.',
        rows: [[2, [1], null], [4, [1], null]], guidedCurrent: [null, null], caption: 'One half is bigger.' }])),
      3: { answer: 'Same size', choices: ['One half', 'Same size', 'Two quarters'],
        explanation: 'One half covers 2 of the 4 equal quarters, the same as two quarters. They are the same size.',
        rows: [[4, [1, 2], null], [2, [1], null]], guidedCurrent: [null, null], caption: 'They are the same size.' },
      4: { answer: 'Three quarters', choices: ['One half', 'Same size', 'Three quarters'],
        explanation: 'One half covers 2 of the 4 equal quarters. Three quarters covers 3. Three quarters is bigger.',
        rows: [[2, [1], null], [4, [1, 2, 3], null]], guidedCurrent: [null, null], caption: 'Three quarters is bigger.' },
    },
  },
};
const QH_HALF_READ = Object.fromEntries([1, 2, 3, 4].map(q => [q, {
  answer: q <= 2 ? '1st half' : '2nd half',
  rows: [[4, q <= 2 ? [1, 2] : [3, 4], q, true, HALVES]], caption: `Q${q} is in the ${q <= 2 ? '1st' : '2nd'} half`,
}]));

function rowFacts(row) {
  const indexes = predicate => row.pieces.flatMap((piece, index) => predicate(piece) ? [index + 1] : []);
  return [row.pieces.length, indexes(piece => piece.shaded), indexes(piece => piece.current)[0] ?? null, row.halftime, row.groups];
}

function expectedRow([pieces, shaded, current, halftime = false, groups = null]) {
  return [pieces, shaded, current, halftime, groups];
}

function expectStages(question, expected, label) {
  const { initial, guided, worked } = question.visuals;
  // The first try adds no picture and names nothing.
  assert.equal(initial.type, 'none', `${label}: initial adds no picture`);
  assert.deepEqual(plain(initial.data), {}, label);
  assert.equal(initial.result, null, label);
  // The retry shows the same equal pieces unsolved: no shading, split, half labels or caption.
  assert.equal(guided.type, 'game-parts', label);
  assert.equal(guided.result, null, label);
  assert.equal(guided.data.caption, null, `${label}: guided caption`);
  assert.deepEqual(plain(guided.data.rows.map(rowFacts)), expected.rows.map((row, index) => [
    row[0], [], (expected.guidedCurrent ?? [])[index] !== undefined ? expected.guidedCurrent[index] : row[2], false, null,
  ]), `${label}: guided pieces`);
  // Only the worked stage shades the answer and states it.
  assert.equal(worked.type, 'game-parts', label);
  assert.deepEqual(plain(worked.result.value), expected.answer, label);
  assert.deepEqual(plain(worked.data.rows.map(rowFacts)), expected.rows.map(expectedRow), `${label}: worked pieces`);
  assert.equal(worked.data.caption, expected.caption, `${label}: worked caption`);
  assert.equal(worked.data.model, expected.rows.length > 1 ? 'compare' : 'strip', label);
  // Stage ARIA never interprets the result before the worked stage. A part the
  // prompt itself names (a comparison's two parts) may be named again.
  const said = [expected.caption.toLowerCase()];
  if (typeof expected.answer === 'string' && !question.prompt.text.toLowerCase().includes(expected.answer.toLowerCase())) {
    said.push(expected.answer.toLowerCase());
  }
  for (const stage of [initial, guided]) {
    for (const text of said) assert.equal(stage.ariaLabel.toLowerCase().includes(text), false, `${label}: ${stage.stage} ARIA names "${text}"`);
    if (typeof expected.answer === 'number') {
      assert.doesNotMatch(stage.ariaLabel, new RegExp(`(^|[^0-9Q])${expected.answer} quarters?\\b`), `${label}: ${stage.stage} ARIA count`);
    }
  }
}

test('#51 quarter and half families: exact wording, eligibility, rule bindings, answers and choices in every quarter on both sides', () => {
  const { domain, questions } = loadModules();
  const ids = [...QUARTER_HALF_FAMILY_IDS, 'half-read'];
  const budgets = {};
  for (const possession of ['offense', 'defense']) {
    for (const q of [1, 2, 3, 4]) {
      const snap = makeSnap(domain, { possession, quarter: q }, 4);
      const inspection = questions.inspect(snap, questions.DEFAULT_PROFILE);
      // plain(): the inspection array comes from the VM realm.
      const eligibleIds = plain(inspection.eligible.map(entry => entry.familyId));
      assert.equal(eligibleIds.includes('quarter-read'), false, `Q${q}: quarter-read stays out of live play`);
      const expectedIds = [...QUARTER_HALF_FAMILY_IDS.filter(id => QH[id].quarters.includes(q)), 'half-read'];
      assert.deepEqual(eligibleIds.filter(id => ids.includes(id)).sort(), [...expectedIds].sort(), `${possession} Q${q}`);
      for (const id of QUARTER_HALF_FAMILY_IDS.filter(id => !QH[id].quarters.includes(q))) {
        assert.equal(inspection.declined.find(entry => entry.familyId === id)?.reason.code, 'quarter-not-eligible', `${id} Q${q}`);
        assert.throws(() => questions.build(snap, id), error => error.code === 'family-not-eligible', `${id} Q${q}`);
      }
      budgets[q] = Number(inspection.eligible.filter(entry => ids.includes(entry.familyId))
        .reduce((sum, entry) => sum + entry.weight, 0).toFixed(2));
      for (const id of QUARTER_HALF_FAMILY_IDS.filter(id => QH[id].quarters.includes(q))) {
        const spec = QH[id];
        const expected = spec.cases[q];
        const label = `${possession} Q${q} ${id}`;
        const question = questions.build(snap, id, { presentationRng: () => 0.37 });
        verifyGrounding(questions, snap, question);
        assert.equal(question.prompt.text, spec.prompt(q), label);
        assert.equal(question.hint.text, spec.hint(q), label);
        assert.equal(question.workedExplanation.text, expected.explanation, label);
        assert.deepEqual(plain(question.answer.value), expected.answer, label);
        assert.deepEqual(plain(question.choices.map(choice => choice.value)).sort(), [...expected.choices].sort(), label);
        assert.equal(new Set(question.choices.map(choice => choice.label)).size, question.choices.length, label);
        assert.deepEqual(plain(question.bindings), [
          { id: 'quarter', source: { kind: 'context', path: '/context/quarter' }, value: q },
          { id: 'regulationQuarters', source: { kind: 'rule', ruleId: 'game.regulationQuarters' }, value: 4 },
        ], label);
        assert.equal(question.evidenceClass, 'independent', label);
        assert.equal(question.answerExposure, 'modeled-with-result-hidden', label);
        assert.equal(question.concept, 'quarter-half-structure', label);
        assert.equal(question.skill, 'quarter-half-structure', label);
        assert.equal(question.purpose, 'coreReview', label);
        assert.equal(question.weight, spec.weight, label);
        if (spec.source === 'football-only') {
          assert.deepEqual([question.curriculumSource, question.introducedOnPage], ['football-only', null], label);
        } else {
          assert.deepEqual([question.curriculumSource, question.worktext, question.edition, question.introducedOnPage, question.coverageThroughPage],
            ['workbook', 'Math Mammoth Grade 1-B', 2026, spec.source, spec.source], label);
        }
        expectStages(question, expected, label);
      }
      // half-read keeps its identity, binding and choices with the staged picture.
      const half = questions.build(snap, 'half-read', { presentationRng: () => 0.37 });
      verifyGrounding(questions, snap, half);
      assert.deepEqual(plain(half.choices.map(choice => choice.value)).sort(), ['1st half', '2nd half', 'Final', 'Halftime']);
      assert.equal(half.prompt.text, `The scoreboard shows Q${q}. What part of the game is it?`);
      expectStages(half, QH_HALF_READ[q], `${possession} Q${q} half-read`);
    }
  }
  // The agreed shared quarter-half budget, with half-read at its existing 0.4.
  assert.deepEqual(budgets, { 1: 1.5, 2: 1.35, 3: 1.5, 4: 1.3 });
  assert.equal(questions.RULES['game.regulationQuarters'], 4);
  for (const familyIds of Object.values(questions.CALL_AFFINITIES)) {
    assert.equal(familyIds.some(id => ids.includes(id)), false, 'no call boosts the quarter-half budget');
  }
});

test('#51 numeric quarter counts offer four unique choices with the counting-the-current-quarter slip', () => {
  const { domain, questions } = loadModules();
  // Counting the quarter being played as well is the expected slip.
  for (const [id, q, answer, slip] of [
    ['quarters-still-to-come', 1, 3, 4], ['quarters-still-to-come', 2, 2, 3],
    ['quarters-still-to-come', 3, 1, 2], ['quarters-still-to-come', 4, 0, 1],
    ['quarters-before-halftime', 1, 1, 2],
    ['quarters-finished', 3, 2, 3], ['quarters-finished', 4, 3, 4],
  ]) {
    const question = questions.build(makeSnap(domain, { quarter: q }, 4), id);
    const values = question.choices.map(choice => choice.value);
    assert.equal(question.answer.value, answer, `${id} Q${q}`);
    assert.equal(values.length, 4, `${id} Q${q}`);
    assert.equal(new Set(values).size, 4, `${id} Q${q}`);
    assert.ok(values.includes(slip), `${id} Q${q} offers ${slip}`);
    assert.ok(values.every(value => Number.isInteger(value) && value >= 0 && value <= 4), `${id} Q${q}`);
  }
  // Comparisons always offer both named parts and Same size, so a retry still has a choice.
  for (const q of [1, 2, 3, 4]) {
    const question = questions.build(makeSnap(domain, { quarter: q }, 4), 'game-part-compare');
    assert.equal(question.choices.length, 3);
    assert.ok(question.choices.some(choice => choice.value === 'Same size'));
    assert.match(question.prompt.text, /Which is bigger, or are they the same size\?$/);
  }
});

test('#51 guided-first and guided support show the unsolved pieces from the first frame', () => {
  const { domain, questions } = loadModules();
  for (const id of [...QUARTER_HALF_FAMILY_IDS, 'half-read']) {
    const q = id === 'quarters-before-halftime' ? 1 : id === 'quarters-finished' || id === 'second-half-quarters' ? 3 : 2;
    const snap = makeSnap(domain, { quarter: q }, 4);
    const guided = questions.build(snap, id, { support: 'guided' });
    assert.equal(guided.support, 'guided', id);
    assert.equal(guided.math.type, 'game-parts', id);
    assert.equal(guided.math.result, null, id);
    assert.equal(guided.math.data.rows.some(row => row.pieces.some(piece => piece.shaded) || row.halftime || row.groups), false, id);
    const initial = questions.build(snap, id, { support: 'initial' });
    assert.equal(initial.math.type, 'none', id);
    const worked = questions.build(snap, id, { support: 'worked' });
    assert.equal(worked.math.revealsAnswer, true, id);
  }
});

test('#51 workbook game parts follow the Grade 1-B page; football-only quarter counts do not', async () => {
  const { questions, domain } = await loadSchedulerModules();
  const snap = makeSnap(domain, { quarter: 2 }, 4);
  const workbook = { 'game-part-boundary': 68, 'halves-make-whole': 68, 'game-part-compare': 71 };
  for (const page of [67, 68, 70, 71, 113]) {
    const inspection = questions.inspect(snap, bookPage(page));
    const ids = inspection.eligible.map(row => row.familyId);
    for (const [id, introduced] of Object.entries(workbook)) {
      assert.equal(ids.includes(id), page >= introduced, `${id} at p${page}`);
      if (page < introduced) {
        assert.equal(inspection.declined.find(row => row.familyId === id).reason.code, 'curriculum-not-included', `${id} at p${page}`);
        assert.throws(() => questions.build(snap, id, { profile: bookPage(page) }), error => error.code === 'curriculum-not-included');
      } else {
        assert.deepEqual(plain(questions.sourceStatus(questions.FAMILY_REGISTRY.scrimmage.find(row => row.familyId === id), bookPage(page))),
          { included: true, guided: false }, `${id} at p${page}`);
      }
    }
    for (const id of ['quarters-still-to-come', 'quarters-in-half', 'half-read']) assert.ok(ids.includes(id), `${id} at p${page}`);
  }
});

test('#51 quarter and half copy stays natural, structural and free of clock, overtime or invented history', () => {
  const { domain, questions } = loadModules();
  const jargon = /goal-distance (?:model|strip)|committed score|this exact play|proposed (?:gain|yard|play|move|addition)|overtime|minutes?|clock|seconds|ordinal|a half is two equal parts|it's halftime|fraction|1\/2|1\/4/i;
  for (const q of [1, 2, 3, 4]) {
    const snap = makeSnap(domain, { quarter: q }, 4);
    for (const id of [...QUARTER_HALF_FAMILY_IDS, 'half-read'].filter(id => id === 'half-read' || QH[id].quarters.includes(q))) {
      const question = questions.build(snap, id);
      const copy = [
        question.prompt.text, question.hint.text, question.workedExplanation.text,
        question.workedReview.title, question.workedReview.goal.text, question.workedReview.footballMeaning.text,
        ...question.workedReview.steps.map(step => step.text),
        ...Object.values(question.visuals).map(visual => visual.ariaLabel),
        ...question.choices.map(choice => choice.label),
      ].join(' ');
      assert.doesNotMatch(copy, jargon, `Q${q} ${id}`);
      assert.deepEqual(plain(question.workedReview.steps.map(step => step.text)), [question.hint.text, question.workedExplanation.text]);
    }
  }
});
