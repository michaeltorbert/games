import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const opponentSource = await readFile(new URL('../football/opponent.js', import.meta.url), 'utf8');
const source = await readFile(new URL('../football/football-domain.js', import.meta.url), 'utf8');

function loadRealm() {
  const context = vm.createContext({});
  vm.runInContext(opponentSource, context, { filename: 'opponent.js' });
  vm.runInContext(source, context, { filename: 'football-domain.js' });
  return context;
}

function loadDomain() {
  return loadRealm().FOOTBALL_DOMAIN;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function match({ opponentId = 'unc', opponentName = 'UNC' } = {}) {
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
  return {
    contextId: 17,
    match: match(),
    possession: 'offense',
    direction: 1,
    quarter: 2,
    down: 1,
    yardsToGo: 10,
    yardLine: 30,
    firstDownLine: 40,
    driveStart: 20,
    scores: { player: 7, opponent: 6 },
    totalYards: { player: 83, opponent: 71 },
    plays: 8,
    drivePlays: 2,
    calls: { offense: 'shortRun', defense: null, matchup: null },
    ...overrides,
  };
}

function opponentSnapshot(plannedCallKey = 'shortPass', overrides = {}) {
  return {
    opponentId: 'unc',
    profileKey: 'balanced',
    look: { key: 'balanced', label: 'Balanced set', alignment: 'Singleback', leanKeys: ['balanced'] },
    lean: { key: 'balanced', label: 'Run or pass', runWeight: 0.5, passWeight: 0.5 },
    weights: { shortRun: 0.2, shortPass: 0.2, longRun: 0.2, mediumPass: 0.2, longPass: 0.2 },
    plannedCallKey,
    tendency: { profileKey: 'balanced' },
    ...overrides,
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

function specialContext(playType, overrides = {}) {
  const possession = overrides.possession ?? 'offense';
  const direction = overrides.direction ?? (possession === 'offense' ? 1 : -1);
  return {
    schemaVersion: 1,
    playType,
    contextId: `${playType}-context`,
    match: match(),
    possession,
    direction,
    quarter: 2,
    scores: { player: 13, opponent: 10 },
  };
}

function puntContext(overrides = {}) {
  return {
    ...specialContext('punt', overrides),
    yardLine: overrides.yardLine ?? 30,
    ...overrides,
  };
}

function fieldGoalContext(overrides = {}) {
  const possession = overrides.possession ?? 'offense';
  const direction = overrides.direction ?? (possession === 'offense' ? 1 : -1);
  const yardLine = overrides.yardLine ?? (direction === 1 ? 60 : 40);
  return {
    ...specialContext('fieldGoal', { ...overrides, possession, direction }),
    yardLine,
    attemptDistance: overrides.attemptDistance ?? (direction === 1 ? 100 - yardLine : yardLine) + 17,
    ...overrides,
  };
}

function conversionContext(overrides = {}) {
  const possession = overrides.possession ?? 'offense';
  const direction = overrides.direction ?? (possession === 'offense' ? 1 : -1);
  const attemptType = overrides.attemptType ?? 'pat';
  return {
    ...specialContext('conversion', { ...overrides, possession, direction }),
    tryYardLine: overrides.tryYardLine ?? (direction === 1 ? 98 : 2),
    attemptType,
    attemptValue: overrides.attemptValue ?? (attemptType === 'pat' ? 1 : 2),
    ...overrides,
  };
}

function specialActiveInput(playType, specialContextValue, proposal, overrides = {}) {
  return {
    schemaVersion: 1,
    playType,
    gameId: overrides.gameId ?? 'game-special',
    possessionId: overrides.possessionId ?? 'possession-special',
    playId: overrides.playId ?? `play-${playType}`,
    contextId: specialContextValue.contextId,
    context: specialContextValue,
    proposal,
  };
}

test('exports one frozen plain-global API in a Node/vm realm', () => {
  const domain = loadDomain();
  assert.ok(domain);
  assert.equal(Object.isFrozen(domain), true);
  assert.deepEqual(plain(domain.RESULT_KINDS), [
    'touchdown', 'firstDown', 'turnoverOnDowns', 'turnover', 'advance',
  ]);
  assert.deepEqual(plain(domain.PLAY_TYPES), [
    'scrimmage', 'punt', 'fieldGoal', 'conversion',
  ]);
  for (const method of [
    'clone', 'deepFreeze', 'normalizeContext', 'validateContext', 'projectGain',
    'createSnap', 'reprojectGain', 'validateTransition', 'assertValidTransition',
    'normalizeSpecialContext', 'validateSpecialContext', 'projectPunt',
    'reprojectPunt', 'validatePuntTransition', 'projectFieldGoal',
    'reprojectFieldGoal', 'validateFieldGoalTransition', 'projectConversion',
    'reprojectConversion', 'validateConversionTransition', 'createActivePlay',
    'activeSnapFromPlay', 'validatePlayTransition', 'terminalPlacementForScrimmage',
  ]) assert.equal(typeof domain[method], 'function', method);
});

test('normalizes current-game aliases into one frozen canonical context', () => {
  const domain = loadDomain();
  const input = {
    contextId: 'snap-12', possession: 'offense', quarter: 3, down: 2,
    match: match(),
    ytg: 7, yd: 43, fdYd: 50, driveStart: 25,
    playerScore: 14, opponentScore: 12, playerTotalYards: 103, opponentTotalYards: 88,
    plays: 9, drivePlays: 3,
    callKey: 'mediumPass', defenseCallKey: 'zone', matchup: 'mismatch',
  };
  const normalized = domain.normalizeContext(input);

  assert.deepEqual(plain(normalized), {
    contextId: 'snap-12',
    match: match(),
    possession: 'offense',
    direction: 1,
    quarter: 3,
    down: 2,
    yardsToGo: 7,
    yardLine: 43,
    firstDownLine: 50,
    driveStart: 25,
    scores: { player: 14, opponent: 12 },
    totalYards: { player: 103, opponent: 88 },
    plays: 9,
    drivePlays: 3,
    calls: { offense: 'mediumPass', defense: 'zone', matchup: 'mismatch' },
    privateOpponentSnapshot: null,
  });
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.scores), true);
  assert.equal(Object.isFrozen(normalized.totalYards), true);
  assert.equal(Object.isFrozen(normalized.calls), true);
});

test('serializes every public match descriptor without private behavior identifiers', () => {
  const realm = loadRealm();
  const descriptors = vm.runInContext(
    'FOOTBALL_OPPONENT.RIVAL_ORDER.map((id) => FOOTBALL_OPPONENT.createMatch(id))',
    realm,
  );
  const serialized = JSON.stringify(descriptors);

  assert.deepEqual(plain(descriptors.map(descriptor => descriptor.opponent.id)), [
    'unc', 'nc-state', 'wake-forest',
  ]);
  assert.doesNotMatch(serialized, /opponentProfileKey|profileKey/);
});

test('clone is recursive and snapshots do not retain caller-owned references', () => {
  const domain = loadDomain();
  const original = context();
  const copied = domain.clone(original);
  copied.scores.player = 99;
  copied.totalYards.player = 999;
  copied.calls.offense = 'longPass';
  assert.equal(original.scores.player, 7);
  assert.equal(original.totalYards.player, 83);
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

test('scrimmage construction rejects call keys that disagree with the frozen context', () => {
  const domain = loadDomain();
  assert.throws(
    () => domain.createSnap(context(), { gain: 4, callKey: 'longRun', label: 'Long run' }),
    (error) => error.name === 'FootballDomainError'
      && error.code === 'INVALID_PROPOSAL'
      && error.diagnostics.some(item => item.code === 'MISMATCHED_CALL_KEY'
        && item.path === '/proposal/callKey')
      && !JSON.stringify(error.diagnostics).includes('shortRun')
      && !JSON.stringify(error.diagnostics).includes('longRun'),
  );

  const snap = domain.createSnap(context(), { gain: 4, callKey: 'shortRun', label: 'Short run' });
  assert.throws(
    () => domain.createActivePlay({
      schemaVersion: 1,
      playType: 'scrimmage',
      gameId: 'game-call-mismatch',
      possessionId: 'possession-call-mismatch',
      playId: 'play-call-mismatch',
      contextId: snap.contextId,
      context: snap.context,
      proposal: snap.proposal,
      call: { key: 'longRun', label: 'Long run' },
    }),
    (error) => error.name === 'FootballDomainError'
      && error.code === 'INVALID_ACTIVE_PLAY'
      && error.diagnostics.some(item => item.code === 'MISMATCHED_CALL_KEY'
        && item.path === '/call/key')
      && !JSON.stringify(error.diagnostics).includes('shortRun')
      && !JSON.stringify(error.diagnostics).includes('longRun'),
  );
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

  const wrongOpponent = domain.validateContext(defenseContext({
    privateOpponentSnapshot: opponentSnapshot('shortPass', { opponentId: 'wake-forest-private' }),
  }));
  assert.equal(wrongOpponent.ok, false);
  assert.ok(wrongOpponent.diagnostics.some(item => item.code === 'MISMATCHED_PRIVATE_OPPONENT_ID'));

  const wrongProfile = domain.validateContext(defenseContext({
    privateOpponentSnapshot: opponentSnapshot('shortPass', { profileKey: 'quickPass' }),
  }));
  assert.equal(wrongProfile.ok, false);
  assert.ok(wrongProfile.diagnostics.some(item => item.code === 'MISMATCHED_PRIVATE_OPPONENT_PROFILE'));
  const privateDiagnostics = JSON.stringify([...wrongOpponent.diagnostics, ...wrongProfile.diagnostics]);
  assert.equal(privateDiagnostics.includes('wake-forest-private'), false);
  assert.equal(privateDiagnostics.includes('quickPass'), false);

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
    resultReason: null,
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
    resultReason: null,
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

test('a snap accepts an alternate gain only when the caller supplies that exact expectation', () => {
  const domain = loadDomain();
  const snap = domain.createSnap(context({
    calls: { offense: 'longRun', defense: null, matchup: null },
  }), { gain: 8, callKey: 'longRun' });
  const capped = domain.reprojectGain(snap, 3);
  const stopped = domain.reprojectGain(snap, 0);

  assert.equal(domain.validateTransition(snap, capped).ok, false);
  assert.equal(domain.validateTransition(snap, capped, { expectedRequestedGain: 3 }).ok, true);
  assert.equal(domain.validateTransition(snap, capped, { expectedRequestedGain: 2 }).ok, false);
  assert.equal(domain.validateTransition(snap, stopped, { expectedRequestedGain: 0 }).ok, true);
  assert.equal(domain.validateTransition(snap, capped, { allowReprojection: true }).ok, false);
  assert.equal(domain.validateTransition(snap.context, capped).ok, true);
});

test('near-goal validation distinguishes the authorized request before both gains clip', () => {
  const domain = loadDomain();
  const snap = domain.createSnap(defenseContext({
    yardLine: 2,
    firstDownLine: 0,
    yardsToGo: 2,
    driveStart: 20,
  }), { gain: 8, callKey: 'shortPass' });
  const authorized = domain.reprojectGain(snap, 2);
  const neighboring = domain.reprojectGain(snap, 3);

  assert.equal(snap.proposal.requestedGain, 8);
  assert.equal(snap.proposal.appliedGain, 2);
  assert.equal(authorized.appliedGain, 2);
  assert.equal(neighboring.appliedGain, 2);
  assert.equal(authorized.endYardLine, neighboring.endYardLine);
  assert.equal(domain.validateTransition(snap, authorized, { expectedRequestedGain: 2 }).ok, true);
  assert.equal(domain.validateTransition(snap, neighboring, { expectedRequestedGain: 2 }).ok, false);
});

test('returns structured diagnostics for malformed and contradictory contexts', () => {
  const domain = loadDomain();
  const cases = [
    [context({ match: null }), '/match'],
    [context({ match: { ...match(), schemaVersion: 2 } }), '/match/schemaVersion'],
    [context({ match: { ...match(), privateProfile: 'balanced' } }), '/match/privateProfile'],
    [context({ match: { ...match(), opponent: { ...match().opponent, profileKey: 'balanced' } } }), '/match/opponent/profileKey'],
    [context({ match: { ...match(), opponent: { ...match().opponent, shortName: '' } } }), '/match/opponent/shortName'],
    [context({ contextId: null }), '/contextId'],
    [context({ contextId: 0 }), '/contextId'],
    [context({ contextId: '   ' }), '/contextId'],
    [context({ possession: 'specialTeams' }), '/possession'],
    [context({ direction: -1 }), '/direction'],
    [context({ quarter: 5 }), '/quarter'],
    [context({ down: 0 }), '/down'],
    [context({ yardsToGo: 100, firstDownLine: 100 }), '/yardsToGo'],
    [context({ yardLine: 0, firstDownLine: 10 }), '/yardLine'],
    [context({ firstDownLine: 41 }), '/firstDownLine'],
    [context({ driveStart: 101 }), '/driveStart'],
    [context({ scores: { player: -1, opponent: 6 } }), '/scores/player'],
    [context({ totalYards: { player: 1.5, opponent: 71 } }), '/totalYards/player'],
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

test('rejects fractional and oversized net yards with structured errors', () => {
  const domain = loadDomain();
  for (const gain of [-101, 1.5, 101, NaN, '3']) {
    assert.throws(
      () => domain.projectGain(context(), gain),
      (error) => error.name === 'FootballDomainError'
        && error.code === 'INVALID_GAIN'
        && error.diagnostics[0].path === '/requestedGain',
      String(gain),
    );
  }
});

test('negative outcomes clip at the offense own 1 and keep directional drive totals signed', () => {
  const domain = loadDomain();
  const forward = domain.projectGain(context({ yardLine: 2, driveStart: 20, firstDownLine: 12 }), -7, { resultReason: 'sack' });
  const reverse = domain.projectGain(defenseContext({ yardLine: 98, driveStart: 80, firstDownLine: 88 }), -7, { resultReason: 'sack' });
  assert.deepEqual([forward.appliedGain, forward.endYardLine, forward.driveTotal], [-1, 1, -19]);
  assert.deepEqual([reverse.appliedGain, reverse.endYardLine, reverse.driveTotal], [-1, 99, -19]);
});

test('fumbles are independently validated as generic turnovers', () => {
  const domain = loadDomain();
  const snap = domain.createSnap(context({
    calls: { offense: 'longRun', defense: null, matchup: null },
  }), { gain: 8, callKey: 'longRun' });
  const turnover = domain.reprojectGain(snap, -2, { resultKind: 'turnover', resultReason: 'fumble' });
  assert.equal(turnover.resultKind, 'turnover');
  assert.equal(turnover.resultReason, 'fumble');
  assert.equal(domain.validateTransition(snap, turnover, {
    expectedRequestedGain: -2, expectedResultKind: 'turnover', expectedResultReason: 'fumble',
  }).ok, true);
  assert.equal(domain.validateTransition(snap, turnover, {
    expectedRequestedGain: -2, expectedResultKind: 'turnover', expectedResultReason: 'interception',
  }).ok, false);
});

test('own-1 clipping normalizes negative zero and works identically in both directions', () => {
  const domain = loadDomain();
  const forward = domain.projectGain(context({ yardLine: 1, firstDownLine: 11 }), -3, { resultReason: 'sack' });
  const reverse = domain.projectGain(defenseContext({ yardLine: 99, firstDownLine: 89 }), -3, { resultReason: 'sack' });
  for (const transition of [forward, reverse]) {
    assert.equal(transition.appliedGain, 0);
    assert.equal(Object.is(transition.appliedGain, -0), false);
    assert.equal(transition.requestedGain, -3);
  }
  assert.equal(forward.endYardLine, 1);
  assert.equal(reverse.endYardLine, 99);
});

test('zero-distance drive totals normalize negative zero in the reverse direction', () => {
  const domain = loadDomain();
  const transition = domain.projectGain(defenseContext({ driveStart: 70 }), 0);
  assert.equal(transition.driveTotal, 0);
  assert.equal(Object.is(transition.driveTotal, -0), false);
});

test('a fourth-down safe loss stays turnover on downs while a forced disaster is a turnover', () => {
  const domain = loadDomain();
  const snap = domain.createSnap(context({
    down: 4,
    calls: { offense: 'mediumPass', defense: null, matchup: null },
  }), { gain: 8, callKey: 'mediumPass' });
  const safeLoss = domain.reprojectGain(snap, -3, { resultReason: 'sack' });
  const disaster = domain.reprojectGain(snap, -2, { resultKind: 'turnover', resultReason: 'fumble' });
  assert.equal(safeLoss.resultKind, 'turnoverOnDowns');
  assert.equal(safeLoss.resultReason, 'sack');
  assert.equal(disaster.resultKind, 'turnover');
  assert.equal(disaster.resultReason, 'fumble');
});

test('losses produce valid next-snap long-distance contexts in both directions', () => {
  const domain = loadDomain();
  for (const source of [
    context({ down: 1, yardsToGo: 10, yardLine: 30, firstDownLine: 40 }),
    defenseContext({ down: 1, yardsToGo: 10, yardLine: 70, firstDownLine: 60 }),
  ]) {
    const loss = domain.projectGain(source, -3, { resultReason: 'sack' });
    assert.equal(loss.newDown, 2);
    assert.equal(loss.newYardsToGo, 13);
    const next = domain.validateContext({
      ...source,
      down: loss.newDown,
      yardsToGo: loss.newYardsToGo,
      yardLine: loss.endYardLine,
      firstDownLine: loss.newFirstDownLine,
      totalYards: {
        player: source.totalYards.player + (source.possession === 'offense' ? loss.appliedGain : 0),
        opponent: source.totalYards.opponent + (source.possession === 'defense' ? loss.appliedGain : 0),
      },
    });
    assert.equal(next.ok, true);
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

test('special-team contexts are frozen closed contracts with type-specific facts', () => {
  const domain = loadDomain();
  const inputs = {
    punt: puntContext(),
    fieldGoal: fieldGoalContext(),
    conversion: conversionContext(),
  };

  for (const [playType, input] of Object.entries(inputs)) {
    const normalized = domain.normalizeSpecialContext(playType, input);
    assert.equal(Object.isFrozen(normalized), true, playType);
    assert.equal(Object.isFrozen(normalized.scores), true, `${playType}:scores`);
    assert.deepEqual(
      Object.keys(normalized).sort(),
      plain(domain.SPECIAL_CONTEXT_KEYS[playType]).sort(),
      playType,
    );

    const extra = domain.validateSpecialContext(playType, { ...input, down: 4 });
    assert.equal(extra.ok, false, `${playType}:extra`);
    assert.ok(extra.diagnostics.some(item => item.code === 'UNKNOWN_CONTEXT_FIELD' && item.path === '/down'));

    const missingInput = { ...input };
    delete missingInput.quarter;
    const missing = domain.validateSpecialContext(playType, missingInput);
    assert.equal(missing.ok, false, `${playType}:missing`);
    assert.ok(missing.diagnostics.some(item => item.code === 'MISSING_CONTEXT_FIELD' && item.path === '/quarter'));
  }

  const contradictoryDistance = domain.validateSpecialContext('fieldGoal', fieldGoalContext({
    attemptDistance: 56,
  }));
  assert.equal(contradictoryDistance.ok, false);
  assert.ok(contradictoryDistance.diagnostics.some(item => item.code === 'CONTRADICTORY_ATTEMPT_DISTANCE'));

  const contradictoryTry = domain.validateSpecialContext('conversion', conversionContext({
    tryYardLine: 2,
  }));
  assert.equal(contradictoryTry.ok, false);
  assert.ok(contradictoryTry.diagnostics.some(item => item.code === 'CONTRADICTORY_TRY_MARKER'));

  for (const [input, path] of [
    [puntContext({ match: { ...match(), privateProfile: 'balanced' } }), '/match/privateProfile'],
    [puntContext({ match: { ...match(), player: { ...match().player, privateRating: 99 } } }), '/match/player/privateRating'],
    [puntContext({ match: { ...match(), opponent: { ...match().opponent, profileKey: 'balanced' } } }), '/match/opponent/profileKey'],
    [puntContext({ contextId: null }), '/contextId'],
    [puntContext({ contextId: 0 }), '/contextId'],
    [puntContext({ contextId: '   ' }), '/contextId'],
  ]) {
    const result = domain.validateSpecialContext('punt', input);
    assert.equal(result.ok, false, path);
    assert.ok(result.diagnostics.some(item => item.path === path), path);
  }
});

test('field-goal distance and legality honor the 57-yard edge in both directions', () => {
  const domain = loadDomain();
  assert.deepEqual([
    domain.fieldGoalDistance(60, 1),
    domain.isFieldGoalLegal(60, 1),
    domain.fieldGoalDistance(59, 1),
    domain.isFieldGoalLegal(59, 1),
  ], [57, true, 58, false]);
  assert.deepEqual([
    domain.fieldGoalDistance(40, -1),
    domain.isFieldGoalLegal(40, -1),
    domain.fieldGoalDistance(41, -1),
    domain.isFieldGoalLegal(41, -1),
  ], [57, true, 58, false]);

  assert.equal(domain.validateSpecialContext('fieldGoal', fieldGoalContext({ yardLine: 60 })).ok, true);
  assert.equal(domain.validateSpecialContext('fieldGoal', fieldGoalContext({
    possession: 'defense', direction: -1, yardLine: 40,
  })).ok, true);
  for (const input of [
    fieldGoalContext({ yardLine: 59 }),
    fieldGoalContext({ possession: 'defense', direction: -1, yardLine: 41 }),
  ]) {
    const result = domain.validateSpecialContext('fieldGoal', input);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some(item => item.code === 'ILLEGAL_FIELD_GOAL'));
  }
});

test('punt projection mirrors normal landings, touchbacks, and receiver-favorable caps', () => {
  const domain = loadDomain();
  const forward = domain.projectPunt(puntContext({ yardLine: 30 }), 35);
  const reverse = domain.projectPunt(puntContext({
    possession: 'defense', direction: -1, yardLine: 70,
  }), 35);
  assert.deepEqual(
    [forward.landingYardLine, forward.nextPossession, forward.nextStartYardLine, forward.restartReason],
    [65, 'defense', 65, 'punt'],
  );
  assert.deepEqual(
    [reverse.landingYardLine, reverse.nextPossession, reverse.nextStartYardLine, reverse.restartReason],
    [35, 'offense', 35, 'punt'],
  );

  const forwardTouchback = domain.projectPunt(puntContext({ yardLine: 65 }), 35);
  const reverseTouchback = domain.projectPunt(puntContext({
    possession: 'defense', direction: -1, yardLine: 35,
  }), 35);
  assert.deepEqual(
    [forwardTouchback.rawLandingYardLine, forwardTouchback.nextStartYardLine, forwardTouchback.restartReason],
    [100, 80, 'puntTouchback'],
  );
  assert.deepEqual(
    [reverseTouchback.rawLandingYardLine, reverseTouchback.nextStartYardLine, reverseTouchback.restartReason],
    [0, 20, 'puntTouchback'],
  );

  const favorable = [
    domain.projectPunt(puntContext({ yardLine: 70 }), 20, { mode: 'receiverFavorable' }),
    domain.projectPunt(puntContext({ possession: 'defense', direction: -1, yardLine: 30 }), 20, { mode: 'receiverFavorable' }),
    domain.projectPunt(puntContext({ yardLine: 85 }), 20, { mode: 'receiverFavorable' }),
    domain.projectPunt(puntContext({ possession: 'defense', direction: -1, yardLine: 15 }), 20, { mode: 'receiverFavorable' }),
  ];
  assert.deepEqual(favorable.map(item => item.requestedTravelYards), [20, 20, 20, 20]);
  assert.deepEqual(favorable.map(item => item.rawLandingYardLine), [90, 10, 100, 0]);
  assert.deepEqual(favorable.map(item => item.nextStartYardLine), [80, 20, 80, 20]);
  assert.deepEqual(favorable.map(item => item.resultKind), [
    'punt', 'punt', 'puntTouchback', 'puntTouchback',
  ]);
  assert.deepEqual(favorable.map(item => item.restartReason), [
    'punt', 'punt', 'puntTouchback', 'puntTouchback',
  ]);
});

test('initial special plays reject alternate proposals while valid threats accept resolution reprojections', () => {
  const domain = loadDomain();

  const puntSource = puntContext({ yardLine: 70 });
  const normalPunt = domain.projectPunt(puntSource, 35);
  const activePunt = domain.createActivePlay(specialActiveInput('punt', puntSource, normalPunt));
  const favorablePunt = domain.reprojectPunt(activePunt, 'receiverFavorable');
  assert.equal(domain.validatePlayTransition(activePunt, favorablePunt, {
    expectedMode: 'receiverFavorable',
  }).ok, true);
  assert.throws(
    () => domain.createActivePlay(specialActiveInput('punt', puntSource, favorablePunt)),
    error => error.name === 'FootballDomainError'
      && error.code === 'INVALID_ACTIVE_PLAY'
      && error.diagnostics.some(item => item.code === 'INVALID_INITIAL_SPECIAL_PROPOSAL'),
  );

  const fieldGoalSource = fieldGoalContext();
  const madeFieldGoal = domain.projectFieldGoal(fieldGoalSource, 'made');
  const activeFieldGoal = domain.createActivePlay(specialActiveInput('fieldGoal', fieldGoalSource, madeFieldGoal));
  for (const outcome of ['missed', 'blocked']) {
    const alternate = domain.reprojectFieldGoal(activeFieldGoal, outcome);
    assert.equal(domain.validatePlayTransition(activeFieldGoal, alternate, {
      expectedResultKind: alternate.resultKind,
    }).ok, true, outcome);
    assert.throws(
      () => domain.createActivePlay(specialActiveInput('fieldGoal', fieldGoalSource, alternate, {
        playId: `play-fieldGoal-${outcome}`,
      })),
      error => error.name === 'FootballDomainError'
        && error.code === 'INVALID_ACTIVE_PLAY'
        && error.diagnostics.some(item => item.code === 'INVALID_INITIAL_SPECIAL_PROPOSAL'),
      outcome,
    );
  }

  const conversionSource = conversionContext();
  const madeConversion = domain.projectConversion(conversionSource, 'made');
  const activeConversion = domain.createActivePlay(specialActiveInput('conversion', conversionSource, madeConversion));
  const missedConversion = domain.reprojectConversion(activeConversion, 'missed');
  assert.equal(domain.validatePlayTransition(activeConversion, missedConversion, {
    expectedResultKind: 'conversionMissed',
  }).ok, true);
  assert.throws(
    () => domain.createActivePlay(specialActiveInput('conversion', conversionSource, missedConversion)),
    error => error.name === 'FootballDomainError'
      && error.code === 'INVALID_ACTIVE_PLAY'
      && error.diagnostics.some(item => item.code === 'INVALID_INITIAL_SPECIAL_PROPOSAL'),
  );
});

test('field-goal and conversion projections preserve scoring and handoff polarity', () => {
  const domain = loadDomain();
  const madeForward = domain.projectFieldGoal(fieldGoalContext(), 'made');
  const missedForward = domain.projectFieldGoal(fieldGoalContext(), 'missed');
  const blockedForward = domain.projectFieldGoal(fieldGoalContext(), 'blocked');
  assert.deepEqual(
    [madeForward.points, madeForward.nextPossession, madeForward.nextStartYardLine, madeForward.restartReason],
    [3, 'defense', 80, 'automaticTouchback'],
  );
  assert.deepEqual(
    [missedForward.points, missedForward.nextStartYardLine, missedForward.restartReason],
    [0, 60, 'missedFieldGoal'],
  );
  assert.deepEqual(
    [blockedForward.points, blockedForward.nextStartYardLine, blockedForward.restartReason],
    [0, 60, 'blockedFieldGoal'],
  );

  const reverseContext = fieldGoalContext({
    possession: 'defense', direction: -1, yardLine: 40,
  });
  const madeReverse = domain.projectFieldGoal(reverseContext, 'made');
  const missedReverse = domain.projectFieldGoal(reverseContext, 'missed');
  assert.deepEqual(
    [madeReverse.points, madeReverse.nextPossession, madeReverse.nextStartYardLine],
    [3, 'offense', 20],
  );
  assert.deepEqual(
    [missedReverse.points, missedReverse.nextPossession, missedReverse.nextStartYardLine],
    [0, 'offense', 40],
  );

  const pat = domain.projectConversion(conversionContext(), 'made');
  const two = domain.projectConversion(conversionContext({
    possession: 'defense', direction: -1, attemptType: 'twoPoint', attemptValue: 2,
  }), 'made');
  const missedTwo = domain.projectConversion(conversionContext({
    attemptType: 'twoPoint', attemptValue: 2,
  }), 'missed');
  assert.deepEqual(
    [pat.tryYardLine, pat.points, pat.nextPossession, pat.nextStartYardLine, pat.restartReason],
    [98, 1, 'defense', 80, 'automaticTouchback'],
  );
  assert.deepEqual(
    [two.tryYardLine, two.points, two.nextPossession, two.nextStartYardLine],
    [2, 2, 'offense', 20],
  );
  assert.deepEqual([missedTwo.points, missedTwo.resultKind], [0, 'conversionMissed']);
});

test('special projections reject missing, extra, and tampered fields by independent reprojection', () => {
  const domain = loadDomain();
  const cases = [
    {
      projection: domain.projectPunt(puntContext(), 40),
      validate: candidate => domain.validatePuntTransition(puntContext(), candidate),
      tamper: ['landingYardLine', 99],
    },
    {
      projection: domain.projectFieldGoal(fieldGoalContext(), 'made'),
      validate: candidate => domain.validateFieldGoalTransition(fieldGoalContext(), candidate, {
        expectedResultKind: 'fieldGoalMade',
      }),
      tamper: ['points', 0],
    },
    {
      projection: domain.projectConversion(conversionContext(), 'made'),
      validate: candidate => domain.validateConversionTransition(conversionContext(), candidate, {
        expectedResultKind: 'conversionMade',
      }),
      tamper: ['nextStartYardLine', 20],
    },
  ];

  for (const { projection, validate, tamper } of cases) {
    assert.equal(validate(projection).ok, true, projection.playType);

    const extra = validate({ ...plain(projection), secret: true });
    assert.equal(extra.ok, false, `${projection.playType}:extra`);
    assert.ok(extra.diagnostics.some(item => item.code === 'UNKNOWN_TRANSITION_FIELD'));

    const missingCandidate = plain(projection);
    delete missingCandidate.resultKind;
    const missing = validate(missingCandidate);
    assert.equal(missing.ok, false, `${projection.playType}:missing`);
    assert.ok(missing.diagnostics.some(item => item.code === 'MISSING_TRANSITION_FIELD'));

    const contradictory = validate({ ...plain(projection), [tamper[0]]: tamper[1] });
    assert.equal(contradictory.ok, false, `${projection.playType}:tampered`);
    assert.ok(contradictory.diagnostics.some(item => (
      item.code === 'CONTRADICTORY_TRANSITION' && item.path === `/${tamper[0]}`
    )));
  }
});

test('special transition validators reject unknown expected discriminants', () => {
  const domain = loadDomain();
  const cases = [
    {
      validation: domain.validatePuntTransition(
        puntContext(),
        domain.projectPunt(puntContext(), 40),
        { expectedMode: 'unknown' },
      ),
      code: 'INVALID_PUNT_MODE',
      path: '/expectedMode',
    },
    {
      validation: domain.validateFieldGoalTransition(
        fieldGoalContext(),
        domain.projectFieldGoal(fieldGoalContext(), 'missed'),
        { expectedResultKind: 'unknown' },
      ),
      code: 'INVALID_FIELD_GOAL_RESULT_KIND',
      path: '/expectedResultKind',
    },
    {
      validation: domain.validateConversionTransition(
        conversionContext(),
        domain.projectConversion(conversionContext(), 'missed'),
        { expectedResultKind: 'unknown' },
      ),
      code: 'INVALID_CONVERSION_RESULT_KIND',
      path: '/expectedResultKind',
    },
  ];

  for (const { validation, code, path } of cases) {
    assert.equal(validation.ok, false, code);
    assert.equal(validation.value, null, code);
    assert.ok(validation.diagnostics.some(item => item.code === code && item.path === path), code);
  }
});

test('special transition validators retain explicit null expectations and identify candidate paths', () => {
  const domain = loadDomain();
  const punt = domain.projectPunt(puntContext(), 40);
  const nullTravel = domain.validatePuntTransition(puntContext(), punt, {
    expectedTravelYards: null,
  });
  assert.equal(nullTravel.ok, false);
  assert.ok(nullTravel.diagnostics.some(item => item.code === 'INVALID_PUNT_TRAVEL'));

  const cases = [
    {
      validation: domain.validatePuntTransition(puntContext(), { ...plain(punt), mode: 'unknown' }),
      code: 'INVALID_PUNT_MODE',
      path: '/mode',
    },
    {
      validation: domain.validateFieldGoalTransition(fieldGoalContext(), {
        ...plain(domain.projectFieldGoal(fieldGoalContext(), 'missed')),
        resultKind: 'unknown',
      }),
      code: 'INVALID_FIELD_GOAL_RESULT_KIND',
      path: '/resultKind',
    },
    {
      validation: domain.validateConversionTransition(conversionContext(), {
        ...plain(domain.projectConversion(conversionContext(), 'missed')),
        resultKind: 'unknown',
      }),
      code: 'INVALID_CONVERSION_RESULT_KIND',
      path: '/resultKind',
    },
  ];

  for (const { validation, code, path } of cases) {
    assert.equal(validation.ok, false, code);
    assert.ok(validation.diagnostics.some(item => item.code === code && item.path === path), code);
  }
});

test('tagged active plays validate type-specific proposals and derive only scrimmage snapshots', () => {
  const domain = loadDomain();
  const fgContext = fieldGoalContext();
  const proposal = domain.projectFieldGoal(fgContext, 'made');
  const activeFieldGoal = domain.createActivePlay({
    schemaVersion: 1,
    playType: 'fieldGoal',
    gameId: 'game-1',
    possessionId: 'possession-2',
    playId: 'play-3',
    contextId: fgContext.contextId,
    context: fgContext,
    proposal,
  });
  assert.equal(Object.isFrozen(activeFieldGoal), true);
  assert.equal(Object.isFrozen(activeFieldGoal.context), true);
  assert.equal(Object.isFrozen(activeFieldGoal.proposal), true);
  assert.equal(domain.activeSnapFromPlay(activeFieldGoal), null);
  assert.equal(domain.validatePlayTransition(activeFieldGoal, proposal).ok, true);
  assert.throws(
    () => domain.createActivePlay({ ...plain(activeFieldGoal), extraAuthority: true }),
    error => error.name === 'FootballDomainError' && error.code === 'INVALID_ACTIVE_PLAY',
  );

  const scrimmage = domain.createSnap(context(), { gain: 6, callKey: 'shortRun', label: 'Short run' });
  const activeScrimmage = domain.createActivePlay({
    schemaVersion: 1,
    playType: 'scrimmage',
    gameId: 'game-1',
    possessionId: 'possession-2',
    playId: 'play-4',
    contextId: scrimmage.contextId,
    context: scrimmage.context,
    proposal: scrimmage.proposal,
    call: scrimmage.call,
  });
  const derivedSnap = domain.activeSnapFromPlay(activeScrimmage);
  assert.deepEqual(plain(derivedSnap), plain(scrimmage));
  assert.equal(derivedSnap.context, activeScrimmage.context);
  assert.equal(derivedSnap.proposal, activeScrimmage.proposal);
  assert.equal(derivedSnap.call, activeScrimmage.call);
  assert.equal(Object.isFrozen(derivedSnap), true);
  assert.equal(domain.validatePlayTransition(activeScrimmage, scrimmage.proposal).ok, true);
});

test('scrimmage terminal placement is explicit without changing the closed projection keys', () => {
  const domain = loadDomain();
  assert.deepEqual(plain(domain.PROJECTION_KEYS), [
    'contextId', 'requestedGain', 'appliedGain', 'startYardLine', 'endYardLine',
    'direction', 'possession', 'oldDown', 'newDown', 'oldYardsToGo',
    'newYardsToGo', 'oldFirstDownLine', 'newFirstDownLine', 'resultKind',
    'resultReason', 'crossedMidfield', 'driveTotal', 'distanceToGoalBefore',
    'distanceToGoalAfter',
  ]);

  const failed = domain.createSnap(context({ down: 4 }), { gain: 4, callKey: 'shortRun' });
  assert.deepEqual(plain(domain.terminalPlacementForScrimmage(failed, failed.proposal)), {
    nextPossession: 'defense',
    nextStartYardLine: 34,
    restartReason: 'turnoverOnDowns',
  });

  const defensive = domain.createSnap(defenseContext({ down: 4 }), {
    gain: 4, callKey: 'shortPass',
  });
  assert.deepEqual(plain(domain.terminalPlacementForScrimmage(defensive, defensive.proposal)), {
    nextPossession: 'offense',
    nextStartYardLine: 66,
    restartReason: 'turnoverOnDowns',
  });

  const fumble = domain.reprojectGain(failed, -2, {
    resultKind: 'turnover',
    resultReason: 'fumble',
  });
  assert.throws(
    () => domain.terminalPlacementForScrimmage(failed, fumble),
    error => error.name === 'FootballDomainError' && error.code === 'INVALID_TRANSITION',
  );
  assert.deepEqual(plain(domain.terminalPlacementForScrimmage(failed, fumble, {
    expectedRequestedGain: -2,
    expectedResultKind: 'turnover',
    expectedResultReason: 'fumble',
  })), {
    nextPossession: 'defense',
    nextStartYardLine: 80,
    restartReason: 'turnoverReset',
  });

  const interception = domain.reprojectGain(defensive, 0, {
    resultKind: 'turnover',
    resultReason: 'interception',
  });
  assert.deepEqual(plain(domain.terminalPlacementForScrimmage(defensive, interception, {
    expectedRequestedGain: 0,
    expectedResultKind: 'turnover',
    expectedResultReason: 'interception',
  })), {
    nextPossession: 'offense',
    nextStartYardLine: 20,
    restartReason: 'turnoverReset',
  });

  assert.equal(domain.terminalPlacementForScrimmage(
    domain.createSnap(context(), { gain: 4, callKey: 'shortRun' }),
    domain.projectGain(context(), 4),
  ), null);
});
