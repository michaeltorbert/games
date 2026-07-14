import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../football/football-domain.js', import.meta.url), 'utf8');

function loadDomain() {
  const context = vm.createContext({});
  vm.runInContext(source, context, { filename: 'football-domain.js' });
  return context.FOOTBALL_DOMAIN;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function context(overrides = {}) {
  return {
    contextId: 17,
    possession: 'offense',
    direction: 1,
    quarter: 2,
    down: 1,
    yardsToGo: 10,
    yardLine: 30,
    firstDownLine: 40,
    driveStart: 20,
    scores: { player: 7, opponent: 6 },
    plays: 8,
    drivePlays: 2,
    calls: { offense: 'shortRun', defense: null, matchup: null },
    ...overrides,
  };
}

function opponentSnapshot(plannedCallKey = 'shortPass') {
  return {
    profileKey: 'test',
    look: { key: 'balanced', label: 'Balanced set', alignment: 'Singleback', leanKeys: ['balanced'] },
    lean: { key: 'balanced', label: 'Run or pass', runWeight: 0.5, passWeight: 0.5 },
    weights: { shortRun: 0.2, shortPass: 0.2, longRun: 0.2, mediumPass: 0.2, longPass: 0.2 },
    plannedCallKey,
    tendency: { profileKey: 'test' },
  };
}

function defenseContext(overrides = {}) {
  return context({
    possession: 'defense',
    direction: -1,
    yardLine: 70,
    firstDownLine: 60,
    driveStart: 75,
    calls: { offense: 'shortPass', defense: 'zone', matchup: 'matched' },
    privateOpponentSnapshot: opponentSnapshot(),
    ...overrides,
  });
}

test('exports one frozen plain-global API in a Node/vm realm', () => {
  const domain = loadDomain();
  assert.ok(domain);
  assert.equal(Object.isFrozen(domain), true);
  assert.deepEqual(plain(domain.RESULT_KINDS), [
    'touchdown', 'firstDown', 'turnoverOnDowns', 'advance',
  ]);
  for (const method of [
    'clone', 'deepFreeze', 'normalizeContext', 'validateContext', 'projectGain',
    'createSnap', 'reprojectGain', 'validateTransition', 'assertValidTransition',
  ]) assert.equal(typeof domain[method], 'function', method);
});

test('normalizes current-game aliases into one frozen canonical context', () => {
  const domain = loadDomain();
  const input = {
    contextId: 'snap-12', possession: 'offense', quarter: 3, down: 2,
    ytg: 7, yd: 43, fdYd: 50, driveStart: 25,
    playerScore: 14, opponentScore: 12, plays: 9, drivePlays: 3,
    callKey: 'mediumPass', defenseCallKey: 'zone', matchup: 'mismatch',
  };
  const normalized = domain.normalizeContext(input);

  assert.deepEqual(plain(normalized), {
    contextId: 'snap-12',
    possession: 'offense',
    direction: 1,
    quarter: 3,
    down: 2,
    yardsToGo: 7,
    yardLine: 43,
    firstDownLine: 50,
    driveStart: 25,
    scores: { player: 14, opponent: 12 },
    plays: 9,
    drivePlays: 3,
    calls: { offense: 'mediumPass', defense: 'zone', matchup: 'mismatch' },
    privateOpponentSnapshot: null,
  });
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.scores), true);
  assert.equal(Object.isFrozen(normalized.calls), true);
});

test('clone is recursive and snapshots do not retain caller-owned references', () => {
  const domain = loadDomain();
  const original = context();
  const copied = domain.clone(original);
  copied.scores.player = 99;
  copied.calls.offense = 'longPass';
  assert.equal(original.scores.player, 7);
  assert.equal(original.calls.offense, 'shortRun');

  const snap = domain.createSnap(original, { gain: 6, callKey: 'shortRun', label: 'Short run' });
  original.scores.player = 77;
  original.calls.offense = 'longPass';
  assert.equal(snap.context.scores.player, 7);
  assert.equal(snap.context.calls.offense, 'shortRun');
  assert.equal(Object.isFrozen(snap), true);
  assert.equal(Object.isFrozen(snap.context), true);
  assert.equal(Object.isFrozen(snap.proposal), true);
  assert.equal(Object.isFrozen(snap.call), true);
  assert.throws(() => { snap.context.yardLine = 90; }, TypeError);
  assert.throws(() => { snap.proposal.endYardLine = 90; }, TypeError);
});

test('a completed defensive snap owns one private frozen copy of the exact opponent plan', () => {
  const domain = loadDomain();
  const sourceSnapshot = opponentSnapshot();
  const input = defenseContext({ privateOpponentSnapshot: sourceSnapshot });
  const snap = domain.createSnap(input, { gain: 6, callKey: 'shortPass', label: 'Short pass' });

  sourceSnapshot.plannedCallKey = 'longPass';
  sourceSnapshot.look.label = 'Mutated';
  assert.equal(snap.context.privateOpponentSnapshot.plannedCallKey, 'shortPass');
  assert.equal(snap.context.privateOpponentSnapshot.look.label, 'Balanced set');
  assert.equal(Object.isFrozen(snap.context.privateOpponentSnapshot), true);
  assert.equal(Object.isFrozen(snap.context.privateOpponentSnapshot.look), true);
  assert.throws(() => { snap.context.privateOpponentSnapshot.plannedCallKey = 'longPass'; }, TypeError);

  const missing = domain.validateContext(defenseContext({ privateOpponentSnapshot: null }));
  assert.equal(missing.ok, false);
  assert.ok(missing.diagnostics.some(item => item.code === 'MISSING_PRIVATE_OPPONENT_SNAPSHOT'));

  const mismatched = domain.validateContext(defenseContext({
    privateOpponentSnapshot: opponentSnapshot('longPass'),
  }));
  assert.equal(mismatched.ok, false);
  assert.ok(mismatched.diagnostics.some(item => item.code === 'MISMATCHED_PRIVATE_OPPONENT_CALL'));
  const serializedMismatch = JSON.stringify(mismatched.diagnostics);
  assert.equal(serializedMismatch.includes('shortPass'), false);
  assert.equal(serializedMismatch.includes('longPass'), false);

  const unexpected = domain.validateContext(context({
    privateOpponentSnapshot: opponentSnapshot('shortRun'),
  }));
  assert.equal(unexpected.ok, false);
  assert.ok(unexpected.diagnostics.some(item => item.code === 'UNEXPECTED_PRIVATE_OPPONENT_SNAPSHOT'));
});

test('projects gains in both canonical directions', () => {
  const domain = loadDomain();
  const offense = domain.projectGain(context(), 6);
  const defense = domain.projectGain(defenseContext(), 6);

  assert.deepEqual(plain(offense), {
    contextId: 17,
    requestedGain: 6,
    appliedGain: 6,
    startYardLine: 30,
    endYardLine: 36,
    direction: 1,
    possession: 'offense',
    oldDown: 1,
    newDown: 2,
    oldYardsToGo: 10,
    newYardsToGo: 4,
    oldFirstDownLine: 40,
    newFirstDownLine: 40,
    resultKind: 'advance',
    crossedMidfield: false,
    driveTotal: 16,
    distanceToGoalBefore: 70,
    distanceToGoalAfter: 64,
  });
  assert.deepEqual(plain(defense), {
    contextId: 17,
    requestedGain: 6,
    appliedGain: 6,
    startYardLine: 70,
    endYardLine: 64,
    direction: -1,
    possession: 'defense',
    oldDown: 1,
    newDown: 2,
    oldYardsToGo: 10,
    newYardsToGo: 4,
    oldFirstDownLine: 60,
    newFirstDownLine: 60,
    resultKind: 'advance',
    crossedMidfield: false,
    driveTotal: 11,
    distanceToGoalBefore: 70,
    distanceToGoalAfter: 64,
  });
});

test('handles zero, exact-marker, goal-line, and over-goal boundary gains', () => {
  const domain = loadDomain();
  const noGain = domain.projectGain(context({ down: 3 }), 0);
  assert.equal(noGain.endYardLine, 30);
  assert.equal(noGain.newDown, 4);
  assert.equal(noGain.newYardsToGo, 10);
  assert.equal(noGain.resultKind, 'advance');

  const firstDown = domain.projectGain(context(), 10);
  assert.equal(firstDown.endYardLine, 40);
  assert.equal(firstDown.resultKind, 'firstDown');
  assert.equal(firstDown.newDown, 1);
  assert.equal(firstDown.newFirstDownLine, 50);
  assert.equal(firstDown.newYardsToGo, 10);

  const touchdownContext = context({ yardLine: 95, firstDownLine: 100, yardsToGo: 5, driveStart: 80, down: 4 });
  const exactGoal = domain.projectGain(touchdownContext, 5);
  const overGoal = domain.projectGain(touchdownContext, 100);
  assert.equal(exactGoal.resultKind, 'touchdown');
  assert.equal(exactGoal.endYardLine, 100);
  assert.equal(exactGoal.appliedGain, 5);
  assert.equal(exactGoal.newYardsToGo, 0);
  assert.equal(overGoal.resultKind, 'touchdown');
  assert.equal(overGoal.endYardLine, 100);
  assert.equal(overGoal.requestedGain, 100);
  assert.equal(overGoal.appliedGain, 5);

  const reverseGoal = domain.projectGain(defenseContext({
    yardLine: 4, firstDownLine: 0, yardsToGo: 4, driveStart: 20, down: 4,
  }), 4);
  assert.equal(reverseGoal.resultKind, 'touchdown');
  assert.equal(reverseGoal.endYardLine, 0);
  assert.equal(reverseGoal.appliedGain, 4);
});

test('touchdown takes precedence over first down and fourth-down turnover', () => {
  const domain = loadDomain();
  const proposal = domain.projectGain(context({
    yardLine: 95, firstDownLine: 100, yardsToGo: 5, driveStart: 85, down: 4,
  }), 5);
  assert.equal(proposal.resultKind, 'touchdown');
  assert.equal(Object.hasOwn(proposal, 'isTouchdown'), false);
  assert.equal(Object.hasOwn(proposal, 'gotFirstDown'), false);
  assert.equal(Object.hasOwn(proposal, 'isTurnoverOnDowns'), false);
  assert.equal(Object.keys(proposal).filter((key) => key === 'resultKind').length, 1);
});

test('fourth down distinguishes a first down from turnover and preserves the old marker when short', () => {
  const domain = loadDomain();
  const fourth = context({ down: 4, yardLine: 37, firstDownLine: 43, yardsToGo: 6 });
  const conversion = domain.projectGain(fourth, 6);
  const stopped = domain.projectGain(fourth, 5);

  assert.equal(conversion.resultKind, 'firstDown');
  assert.equal(conversion.newDown, 1);
  assert.equal(conversion.newFirstDownLine, 53);
  assert.equal(stopped.resultKind, 'turnoverOnDowns');
  assert.equal(stopped.newDown, 4);
  assert.equal(stopped.oldFirstDownLine, 43);
  assert.equal(stopped.newFirstDownLine, 43);
  assert.equal(stopped.newYardsToGo, 1);

  const reverseFourth = defenseContext({ down: 4, yardLine: 63, firstDownLine: 57, yardsToGo: 6 });
  assert.equal(domain.projectGain(reverseFourth, 6).resultKind, 'firstDown');
  assert.equal(domain.projectGain(reverseFourth, 5).resultKind, 'turnoverOnDowns');
  assert.equal(domain.projectGain(reverseFourth, 5).newFirstDownLine, 57);
});

test('reports midfield crossing consistently in both directions', () => {
  const domain = loadDomain();
  assert.equal(domain.projectGain(context({ yardLine: 45, firstDownLine: 50, yardsToGo: 5 }), 5).crossedMidfield, true);
  assert.equal(domain.projectGain(context({ yardLine: 50, firstDownLine: 60, yardsToGo: 10 }), 1).crossedMidfield, false);
  assert.equal(domain.projectGain(defenseContext({ yardLine: 55, firstDownLine: 50, yardsToGo: 5 }), 5).crossedMidfield, true);
  assert.equal(domain.projectGain(defenseContext({ yardLine: 50, firstDownLine: 40, yardsToGo: 10 }), 1).crossedMidfield, false);
});

test('reprojects exclusively from the frozen pre-snap context', () => {
  const domain = loadDomain();
  const callerContext = context({ down: 4 });
  const snap = domain.createSnap(callerContext, { gain: 10, callKey: 'shortRun' });
  callerContext.down = 1;
  callerContext.yardLine = 90;
  callerContext.firstDownLine = 100;

  const setback = domain.reprojectGain(snap, 3);
  assert.equal(setback.startYardLine, 30);
  assert.equal(setback.endYardLine, 33);
  assert.equal(setback.oldDown, 4);
  assert.equal(setback.resultKind, 'turnoverOnDowns');
  assert.equal(setback.newFirstDownLine, 40);
});

test('validates transitions by independent reprojection and rejects tampering', () => {
  const domain = loadDomain();
  const snap = domain.createSnap(context(), { gain: 7, callKey: 'shortRun' });
  const valid = domain.validateTransition(snap, snap.proposal);
  assert.equal(valid.ok, true);
  assert.equal(Object.isFrozen(valid.value), true);

  for (const [field, value] of [
    ['endYardLine', 99],
    ['newYardsToGo', 1],
    ['newDown', 4],
    ['resultKind', 'touchdown'],
    ['appliedGain', 2],
  ]) {
    const candidate = { ...plain(snap.proposal), [field]: value };
    const result = domain.validateTransition(snap, candidate);
    assert.equal(result.ok, false, field);
    assert.ok(result.diagnostics.some((item) => item.code === 'CONTRADICTORY_TRANSITION' && item.path === `/${field}`));
  }

  const missing = plain(snap.proposal);
  delete missing.newFirstDownLine;
  assert.equal(domain.validateTransition(snap, missing).ok, false);

  const contradictoryFlags = { ...plain(snap.proposal), isTouchdown: false };
  const flagResult = domain.validateTransition(snap, contradictoryFlags);
  assert.equal(flagResult.ok, false);
  assert.ok(flagResult.diagnostics.some((item) => item.code === 'UNKNOWN_TRANSITION_FIELD'));
  assert.throws(
    () => domain.assertValidTransition(snap, contradictoryFlags),
    (error) => error.name === 'FootballDomainError' && error.code === 'INVALID_TRANSITION',
  );
});

test('a snap rejects a different gain unless reprojection is explicit', () => {
  const domain = loadDomain();
  const snap = domain.createSnap(context(), { gain: 8, callKey: 'longRun' });
  const capped = domain.reprojectGain(snap, 3);
  assert.equal(domain.validateTransition(snap, capped).ok, false);
  assert.equal(domain.validateTransition(snap, capped, { allowReprojection: true }).ok, true);
  assert.equal(domain.validateTransition(snap.context, capped).ok, true);
});

test('returns structured diagnostics for malformed and contradictory contexts', () => {
  const domain = loadDomain();
  const cases = [
    [context({ contextId: 0 }), '/contextId'],
    [context({ possession: 'specialTeams' }), '/possession'],
    [context({ direction: -1 }), '/direction'],
    [context({ quarter: 5 }), '/quarter'],
    [context({ down: 0 }), '/down'],
    [context({ yardsToGo: 11, firstDownLine: 41 }), '/yardsToGo'],
    [context({ yardLine: 0, firstDownLine: 10 }), '/yardLine'],
    [context({ firstDownLine: 41 }), '/firstDownLine'],
    [context({ driveStart: 31 }), '/driveStart'],
    [context({ scores: { player: -1, opponent: 6 } }), '/scores/player'],
    [context({ calls: { offense: '', defense: null, matchup: null } }), '/calls/offense'],
    [context({ calls: { offense: 'run', defense: 'zone', matchup: 'tie' } }), '/calls/matchup'],
  ];

  for (const [input, path] of cases) {
    const result = domain.validateContext(input);
    assert.equal(result.ok, false, path);
    assert.equal(result.value, null);
    assert.ok(result.diagnostics.some((item) => item.path === path), path);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.diagnostics), true);
  }
});

test('rejects fractional, negative, and oversized gains with structured errors', () => {
  const domain = loadDomain();
  for (const gain of [-1, 1.5, 101, NaN, '3']) {
    assert.throws(
      () => domain.projectGain(context(), gain),
      (error) => error.name === 'FootballDomainError'
        && error.code === 'INVALID_GAIN'
        && error.diagnostics[0].path === '/requestedGain',
      String(gain),
    );
  }
});

test('projection is deterministic and exposes exactly one exclusive result kind', () => {
  const domain = loadDomain();
  const inputs = [
    [context(), 4, 'advance'],
    [context(), 10, 'firstDown'],
    [context({ down: 4 }), 4, 'turnoverOnDowns'],
    [context({ yardLine: 99, firstDownLine: 100, yardsToGo: 1 }), 1, 'touchdown'],
  ];
  for (const [input, gain, kind] of inputs) {
    const first = domain.projectGain(input, gain);
    const second = domain.projectGain(input, gain);
    assert.deepEqual(plain(first), plain(second));
    assert.equal(first.resultKind, kind);
    assert.ok(domain.RESULT_KINDS.includes(first.resultKind));
    assert.equal(Object.hasOwn(first, 'isTouchdown'), false);
    assert.equal(Object.hasOwn(first, 'gotFirstDown'), false);
    assert.equal(Object.hasOwn(first, 'isTurnoverOnDowns'), false);
  }
});
