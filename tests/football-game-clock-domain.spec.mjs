// #222 timed quarters: pure clock helpers, timed period planners, and the
// timed opponent basis. DOM-free; the UI adapter is covered separately in
// tests/football-game-clock.spec.mjs.
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

const realm = loadRealm();
const domain = realm.FOOTBALL_DOMAIN;
const opponent = vm.runInContext('FOOTBALL_OPPONENT', realm);
const plain = value => JSON.parse(JSON.stringify(value));
const TIMED = Object.freeze({ timing: 'clock' });
const MIN = 60000;

function matchState(overrides = {}) {
  return {
    gameId: 'game-1',
    possessionId: 'pos-1',
    possession: 'offense',
    phase: 'feedback',
    quarter: 1,
    quarterPossessions: 0,
    pendingNextPossession: null,
    pendingNextStartYardLine: null,
    pendingRestartReason: null,
    finalizedPossessionIds: [],
    periodEnd: null,
    carryDrive: false,
    conversionOwed: false,
    ...overrides,
  };
}

const PUNT = Object.freeze({ nextPossession: 'defense', nextStartYardLine: 63, restartReason: 'puntReturn' });

test('quarter-length choices are 3, 5 and 10 minutes with a 5-minute default', () => {
  assert.deepEqual(plain(domain.QUARTER_MINUTE_CHOICES), [3, 5, 10]);
  assert.equal(domain.DEFAULT_QUARTER_MINUTES, 5);
  for (const valid of [3, 5, 10, '3', '5', '10']) assert.equal(domain.normalizeQuarterMinutes(valid), Number(valid));
  for (const invalid of [null, undefined, '', 0, 4, 7, 5.5, '5 ', ' 5', '05x', -5, 300000, {}, []]) {
    assert.equal(domain.normalizeQuarterMinutes(invalid), null, String(invalid));
  }
});

test('the clock recomputes elapsed time from its start instant and never runs past zero', () => {
  const clock = domain.createGameClock({ gameId: 'g', quarter: 1, quarterLengthMs: 5 * MIN });
  assert.ok(Object.isFrozen(clock));
  assert.deepEqual(plain(clock), { gameId: 'g', quarter: 1, quarterLengthMs: 300000, remainingMs: 300000, runningSince: null });
  assert.equal(domain.clockRemainingMs(clock, 99999), 300000, 'a stopped clock ignores time');
  const running = domain.startGameClock(clock, 1000);
  assert.equal(running.runningSince, 1000);
  assert.equal(domain.startGameClock(running, 5000), running, 'starting twice is idempotent');
  assert.equal(domain.clockRemainingMs(running, 1000 + 61500), 238500);
  assert.equal(domain.clockRemainingMs(running, 500), 300000, 'a non-monotonic now counts as zero elapsed');
  const stopped = domain.stopGameClock(running, 1000 + 61500);
  assert.deepEqual(plain(stopped), { ...plain(clock), remainingMs: 238500 });
  assert.equal(domain.stopGameClock(stopped, 1e9), stopped, 'stopping twice is idempotent');
  const late = domain.startGameClock(stopped, 0);
  assert.equal(domain.clockRemainingMs(late, 10 * MIN), 0);
  const zero = domain.stopGameClock(late, 10 * MIN);
  assert.equal(zero.remainingMs, 0);
  assert.equal(domain.startGameClock(zero, 1), zero, 'a clock at zero cannot restart');
  const next = domain.nextQuarterClock(zero, 2);
  assert.deepEqual(plain(next), { gameId: 'g', quarter: 2, quarterLengthMs: 300000, remainingMs: 300000, runningSince: null });
  assert.throws(() => domain.clockRemainingMs(running, Number.NaN), /monotonic/);
  assert.throws(() => domain.createGameClock({ quarter: 1, quarterLengthMs: 0 }), domain.FootballDomainError);
  assert.throws(() => domain.validateGameClock({ ...plain(clock), remainingMs: 300001 }), domain.FootballDomainError);
});

test('the display rounds remaining whole seconds up and shows 0:00 only at zero', () => {
  assert.equal(domain.clockDisplay(300000), '5:00');
  assert.equal(domain.clockDisplay(299001), '5:00');
  assert.equal(domain.clockDisplay(299000), '4:59');
  assert.equal(domain.clockDisplay(60000), '1:00');
  assert.equal(domain.clockDisplay(59999), '1:00');
  assert.equal(domain.clockDisplay(9001), '0:10');
  assert.equal(domain.clockDisplay(1), '0:01');
  assert.equal(domain.clockDisplay(0), '0:00');
  assert.equal(domain.clockDisplay(600000), '10:00');
});

test('timed closure ends the period only when the clock already reached zero', () => {
  const running = domain.planPossessionClosure(matchState({ quarterPossessions: 9 }), 'pos-1', PUNT,
    { ...TIMED, periodExpired: false });
  assert.equal(running.periodEnd, null, 'no possession count ends a timed period');
  assert.deepEqual(plain(running.patch), {
    finalizedPossessionIds: ['pos-1'], quarterPossessions: 10,
    pendingNextPossession: 'defense', pendingNextStartYardLine: 63, pendingRestartReason: 'puntReturn',
    periodEnd: null, carryDrive: false, conversionOwed: false,
  });
  for (const quarter of [1, 3]) {
    const plan = domain.planPossessionClosure(matchState({ quarter }), 'pos-1', PUNT, { ...TIMED, periodExpired: true });
    assert.equal(plan.periodEnd, 'quarterEnd');
    assert.equal(plan.patch.pendingNextStartYardLine, 63, 'Q1/Q3 keep the real terminal placement');
  }
  const half = domain.planPossessionClosure(matchState({ quarter: 2 }), 'pos-1', PUNT, { ...TIMED, periodExpired: true });
  assert.equal(half.periodEnd, 'halftime');
  assert.deepEqual([half.patch.pendingNextPossession, half.patch.pendingNextStartYardLine, half.patch.pendingRestartReason],
    ['defense', 80, 'halftimeKickoff']);
  const final = domain.planPossessionClosure(matchState({ quarter: 4 }), 'pos-1', PUNT, { ...TIMED, periodExpired: true });
  assert.equal(final.periodEnd, 'final');
  assert.equal(final.patch.pendingNextPossession, null);
  assert.equal(domain.planPossessionClosure(matchState({ periodEnd: 'quarterEnd' }), 'pos-1', PUNT,
    { ...TIMED, periodExpired: true }).reason, 'already-expired');
  assert.equal(domain.planPossessionClosure(matchState({ finalizedPossessionIds: ['pos-1'] }), 'pos-1', PUNT,
    { ...TIMED, periodExpired: true }).reason, 'already-finalized');
  assert.throws(() => domain.planPossessionClosure(matchState(), 'pos-1', PUNT, TIMED), /boolean period expiry/);
  // Legacy count fixtures keep their original contract unchanged.
  assert.equal(domain.planPossessionClosure(matchState({ quarterPossessions: 3 }), 'pos-1', PUNT,
    { possessionsPerQuarter: 4 }).periodEnd, 'quarterEnd');
});

test('idle and non-terminal expiry carry Q1/Q3 drives and close Q2/Q4 drives exactly once', () => {
  for (const quarter of [1, 3]) {
    for (const phase of ['call', 'fourth-down-decision']) {
      const input = matchState({ quarter, phase, possession: 'defense', quarterPossessions: 2 });
      const before = structuredClone(input);
      const plan = domain.planPeriodExpiry(input, { origin: 'idle' });
      assert.deepEqual(input, before, 'planners never mutate their input');
      assert.deepEqual(plain(plan), {
        accepted: true, periodEnd: 'quarterEnd', carry: true,
        patch: { periodEnd: 'quarterEnd', carryDrive: true, pendingNextPossession: null, pendingNextStartYardLine: null, pendingRestartReason: null },
      });
    }
  }
  const committed = domain.planPeriodExpiry(matchState({ quarter: 3, phase: 'feedback' }), { origin: 'committed' });
  assert.equal(committed.carry, true);
  const half = domain.planPeriodExpiry(matchState({ quarter: 2, phase: 'call', quarterPossessions: 5 }), { origin: 'idle' });
  assert.deepEqual(plain(half.patch), {
    finalizedPossessionIds: ['pos-1'], quarterPossessions: 6, periodEnd: 'halftime', carryDrive: false,
    pendingNextPossession: 'defense', pendingNextStartYardLine: 80, pendingRestartReason: 'halftimeKickoff',
  });
  const final = domain.planPeriodExpiry(matchState({ quarter: 4, phase: 'feedback' }), { origin: 'committed' });
  assert.deepEqual(plain(final.patch), {
    finalizedPossessionIds: ['pos-1'], quarterPossessions: 1, periodEnd: 'final', carryDrive: false,
    pendingNextPossession: null, pendingNextStartYardLine: null, pendingRestartReason: null,
  });
  const rejected = (overrides, origin = 'idle') => domain.planPeriodExpiry(matchState(overrides), { origin }).reason;
  assert.equal(rejected({ phase: 'call', periodEnd: 'quarterEnd' }), 'already-expired');
  assert.equal(rejected({ phase: 'question' }), 'phase', 'an accepted play always finishes');
  assert.equal(rejected({ phase: 'explanation' }, 'committed'), 'phase');
  assert.equal(rejected({ phase: 'call', possessionId: null }), 'missing-possession');
  assert.equal(rejected({ phase: 'call', finalizedPossessionIds: ['pos-1'] }), 'already-finalized');
  assert.throws(() => domain.planPeriodExpiry(matchState(), { origin: 'tick' }), domain.FootballDomainError);
});

test('an owed touchdown conversion always completes before any period expiry', () => {
  for (const quarter of [1, 2, 3, 4]) {
    for (const [phase, origin] of [['touchdown', 'idle'], ['conversion-decision', 'idle'], ['feedback', 'committed'], ['call', 'idle']]) {
      const plan = domain.planPeriodExpiry(matchState({ quarter, phase, conversionOwed: true }), { origin });
      assert.equal(plan.reason, 'conversion-owed', `Q${quarter} ${phase}`);
    }
    assert.equal(domain.planPeriodExpiry(matchState({ quarter, phase: 'conversion-decision' }), { origin: 'idle' }).reason,
      'conversion-owed');
    const presentation = domain.planPossessionPresentation(matchState({ quarter, conversionOwed: true }), TIMED);
    assert.equal(presentation.reason, 'conversion-owed');
  }
});

test('timed presentation and period advance follow the recorded period end', () => {
  const source = { gameId: 'game-1', possessionId: 'pos-1', quarter: 1 };
  assert.equal(domain.planPossessionPresentation(matchState({ pendingNextPossession: 'defense', quarterPossessions: 7 }), TIMED).kind,
    'defenseTransition', 'possession counts never end a timed quarter');
  const carried = matchState({ periodEnd: 'quarterEnd', carryDrive: true, possession: 'defense' });
  const route = domain.planPossessionPresentation(carried, { ...TIMED, expectedSource: source });
  assert.equal(route.kind, 'quarterEnd', 'a carried drive is routed although its possession stays open');
  assert.equal(route.nextPossession, 'defense');
  assert.equal(domain.planPossessionPresentation({ ...carried, phase: 'quarter' }, { ...TIMED, expectedSource: source }).reason, 'phase');
  assert.equal(domain.planPossessionPresentation(matchState({ periodEnd: 'halftime', quarter: 2,
    finalizedPossessionIds: ['pos-1'] }), { ...TIMED, expectedSource: { ...source, quarter: 2 } }).kind, 'halftime');
  assert.equal(domain.planPossessionPresentation(matchState({ periodEnd: 'final', quarter: 4 }), TIMED).kind, 'final');

  const advance = domain.planPeriodAdvance({ ...carried, phase: 'quarter' }, TIMED);
  assert.deepEqual(plain(advance), {
    accepted: true, carry: true,
    patch: { quarter: 2, quarterPossessions: 0, periodEnd: null, carryDrive: false },
    drive: { possession: 'defense', startYardLine: null, restartReason: null },
  });
  assert.equal(domain.planPeriodAdvance({ ...carried, phase: 'call' }, TIMED).accepted, false, 'advance applies once');
  assert.equal(domain.planPeriodAdvance({ ...carried, phase: 'quarter', finalizedPossessionIds: ['pos-1'] }, TIMED).reason,
    'invalid-carry');
  const half = domain.planPeriodAdvance(matchState({ phase: 'halftime', quarter: 2, periodEnd: 'halftime',
    pendingNextPossession: 'defense', pendingNextStartYardLine: 80, pendingRestartReason: 'halftimeKickoff' }), TIMED);
  assert.deepEqual(plain(half), {
    accepted: true, carry: false,
    patch: { quarter: 3, quarterPossessions: 0, periodEnd: null, carryDrive: false },
    drive: { possession: 'defense', startYardLine: 80, restartReason: 'halftimeKickoff' },
  });
  assert.equal(domain.planPeriodAdvance(matchState({ phase: 'quarter', quarter: 4 }), TIMED).accepted, false);
});

test('the opponent timed basis uses the final 25% of Q4 and drops the possession ceiling', () => {
  const state = (quarter, remainingMs, extra = {}) => ({
    possession: 'defense', direction: -1, quarter, yardLine: 30, yardsToGo: 5,
    scores: { player: 10, opponent: 7 }, clock: { quarterLengthMs: 300000, remainingMs }, ...extra,
  });
  const late = opponent.decideFourthDown(state(4, 75000));
  assert.equal(late.basis.timing, 'clock');
  assert.equal(late.basis.lateGame, true);
  assert.equal(late.action, 'fieldGoal', 'late and a field goal ties');
  assert.equal(opponent.decideFourthDown(state(4, 75001)).basis.lateGame, false);
  assert.equal(opponent.decideFourthDown(state(3, 1000)).basis.lateGame, false);
  assert.equal('quarterPossessions' in late.basis, false);
  const trailing = opponent.decideFourthDown(state(4, 10000, { yardLine: 70, scores: { player: 14, opponent: 0 } }));
  assert.equal(trailing.action, 'go');
  assert.equal(opponent.decideConversion({ possession: 'defense', quarter: 4,
    scores: { player: 8, opponent: 6 }, clock: { quarterLengthMs: 600000, remainingMs: 150000 } }).action, 'twoPoint');
  assert.equal(opponent.decideConversion({ possession: 'defense', quarter: 4,
    scores: { player: 8, opponent: 6 }, clock: { quarterLengthMs: 600000, remainingMs: 150001 } }).action, 'pat');
  assert.throws(() => opponent.decideFourthDown(state(4, 300001)), { name: 'RangeError' });
  assert.throws(() => opponent.decideFourthDown(state(4, 1, { clock: 'soon' })), { name: 'TypeError' });

  const tendency = opponent.getTendency({ quarter: 4, down: 1, ytg: 10, yd: 70, direction: -1,
    playerScore: 14, opponentScore: 0, clock: { quarterLengthMs: 180000, remainingMs: 45000 } }, 'balanced');
  assert.equal(tendency.context.timing, 'clock');
  assert.equal(tendency.context.quarterProgress, 0.75);
  assert.equal(tendency.context.lateGameBoundary, true);
  assert.ok(tendency.factors.some(factor => factor.key === 'lateGameCatchUp'));
  assert.equal('quarterPossessions' in tendency.context, false);
  const early = opponent.getTendency({ quarter: 4, clock: { quarterLengthMs: 180000, remainingMs: 45001 } }, 'balanced');
  assert.equal(early.context.lateGameBoundary, false);
  // Legacy count fixtures retain their exact original basis.
  const legacy = opponent.decideFourthDown({ possession: 'defense', quarter: 4, quarterPossessions: 3,
    possessionsPerQuarter: 4, yardLine: 30, yardsToGo: 5, scores: { player: 10, opponent: 7 } });
  assert.equal(legacy.basis.lastScheduledQ4Possession, true);
  assert.equal('timing' in legacy.basis, false);
  assert.equal(domain.clockLateGame(4, 75000, 300000), true);
  assert.equal(domain.clockLateGame(4, 75001, 300000), false);
  assert.equal(domain.LATE_GAME_FRACTION, 0.25);
});
