// Issue #220 difficulty floor and #219 Grade 2-A alternate eligibility,
// exercised on real legal scrimmage snaps through the production modules.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const context = vm.createContext({});
for (const file of ['shared/curriculum.js', 'shared/grade2a-curriculum.js', 'football/learning.js', 'football/opponent.js',
  'football/football-domain.js', 'football/copy.js', 'football/contextual-questions.js']) {
  vm.runInContext(read(file), context, { filename: file });
}
const L = vm.runInContext('FOOTBALL_LEARNING', context);
const Q = vm.runInContext('FOOTBALL_CONTEXTUAL_QUESTIONS', context);
const D = vm.runInContext('FOOTBALL_DOMAIN', context);
const C2 = vm.runInContext('MATH_CURRICULUM_2A', context);
const now = Date.now();
const DAY = 86400000;
const plain = value => JSON.parse(JSON.stringify(value));
const families = Object.values(Q.FAMILY_REGISTRY).flat();
const meta = id => families.find(e => e.familyId === id);

function snap({ yardLine = 30, yardsToGo = 10, driveStart = 25, scores = { player: 3, opponent: 4 }, totalYards = { player: 83, opponent: 71 }, down = 2 } = {}, gain = 4) {
  const match = { schemaVersion: 1, player: { id: 'duke', displayName: 'Duke', shortName: 'DUKE', endZoneName: 'DUKE' },
    opponent: { id: 'unc', displayName: 'UNC', shortName: 'UNC', endZoneName: 'UNC' } };
  return D.createSnap({ contextId: 41, match, possession: 'offense', direction: 1, quarter: 2, down, yardsToGo, yardLine,
    firstDownLine: yardLine + yardsToGo, driveStart, scores, totalYards, plays: 6, drivePlays: 2,
    calls: { offense: 'shortRun', defense: null, matchup: null }, privateOpponentSnapshot: null },
  { gain, callKey: 'shortRun', label: 'Test call' });
}
const profile = (page1b = 187, page2a = null) => ({
  worktexts: { 'Math Mammoth Grade 1-B': { edition: 2026, completedThroughPage: page1b },
    ...(page2a === null ? {} : { [C2.BOOK]: { edition: C2.EDITION, completedThroughPage: page2a } }) } });
const pool = (play, p = profile()) => Q.inspect(play, p).eligible.filter(e => !Q.IN_GAME_TIME_FAMILIES.includes(e.familyId)
  && !Q.IN_GAME_COIN_FAMILIES.includes(e.familyId)).map(e => ({ ...e }));

// One committed floor-evidence row in the stats projection shape.
function row(i, familyId, magnitude, resolution = 'firstTryCorrect', { support = 'initial', ageMs = 0, difficulty } = {}) {
  const e = meta(familyId);
  return { gameId: 'g', playId: `p-${familyId}-${i}`, playType: 'scrimmage', instructionalStatus: 'presented',
    completedAt: new Date(now - 200000 - ageMs + i * 1000).toISOString(), familyId, concept: e.concept,
    evidenceClass: e.evidenceClass, grading: 'gate', resolution,
    attempts: resolution === 'firstTryCorrect' ? [{ number: 1, correct: true, support }]
      : [{ number: 1, correct: false, support }, { number: 2, correct: resolution === 'retryCorrect', support: 'guided' }],
    ...(difficulty === undefined ? { difficulty: { version: Q.DIFFICULTY_VERSION, group: Q.FLOOR_GROUPS[familyId], magnitude } }
      : difficulty === null ? {} : { difficulty }) };
}
// Ten first-try score-group results, four of them unsupported substantial.
const readyScore = () => Array.from({ length: 10 }, (_, i) => i < 4 ? row(i, 'score-total-ch8-within-20', 'substantial')
  : row(i, 'committed-score-difference', 'tiny'));
const session = (rows, lastResolved = {}) => L.createSession({}, lastResolved, now, rows);
const weights = (entries, s) => Object.fromEntries(L.selectionWeights(entries, s).map(item => [item.entry.familyId, item.weight]));
const sum = (w, ids) => ids.reduce((total, id) => total + w[id], 0);

// challenge-baseline-v1 helpers. `list` keeps entry order (synthetic pools may
// repeat a family). `reference` marks every floor-family entry source-guided,
// which protects every group, so it returns the exact pre-floor weights.
const list = (entries, s) => L.selectionWeights(entries, s);
const isFloorFamily = e => Boolean(Q.FLOOR_GROUPS[e.familyId]);
const reference = (entries, s) => list(entries.map(e => isFloorFamily(e) ? { ...e, sourceGuided: true } : e), s).map(i => i.weight);
const close = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const total = values => values.reduce((s, v) => s + v, 0);
const lowerOf = i => i.baseline.band === 'lower';
// One synthetic floor entry: a registered family with an explicit v1 projection.
const synth = (id, magnitude, extra = {}) => ({ ...meta(id), difficulty: { version: Q.DIFFICULTY_VERSION,
  group: Q.FLOOR_GROUPS[id], magnitude }, ...extra });
// Independent re-derivation of C2 from each item's own pre-floor weight and
// direct recency factor: b = w / r, 20/80 band targets, r reapplied once,
// one common rescale to the original unprotected total.
function expectC2(items, label = '') {
  const floor = items.filter(i => i.baseline);
  const open = floor.filter(i => !i.baseline.protected);
  const b = open.map(i => i.baseline.before / i.recency);
  const U = total(b), Lw = total(b.filter((_, k) => lowerOf(open[k]))), H = U - Lw;
  const capped = Lw > 0 && H > 0 && Lw / U > 0.2;
  for (const i of floor) assert.equal(i.baseline.reason === 'capped', capped && !i.baseline.protected, `${label} reason ${i.entry.familyId}`);
  if (!capped) { for (const i of floor) assert.equal(i.weight, i.baseline.before, `${label} unchanged ${i.entry.familyId}`); return { capped }; }
  const adjusted = open.map((i, k) => b[k] * (lowerOf(i) ? 0.2 * U / Lw : 0.8 * U / H) * i.recency);
  const common = total(open.map(i => i.baseline.before)) / total(adjusted);
  open.forEach((i, k) => assert.ok(close(i.weight, adjusted[k] * common), `${label} C2 weight ${i.entry.familyId}`));
  for (const i of floor.filter(i => i.baseline.protected)) assert.equal(i.weight, i.baseline.before, `${label} protected ${i.entry.familyId}`);
  return { capped, preShare: total(open.filter(lowerOf).map(i => i.baseline.before)) / total(open.map(i => i.baseline.before)),
    share: total(open.filter(lowerOf).map(i => i.weight)) / total(open.map(i => i.weight)) };
}

test('effective-fact classifier: identity, small steps, small facts, crossing ten, and two-place work', () => {
  const k = Q.classifyComputation;
  for (const [args, expected] of [
    [['add', 9, 9], 'substantial'], [['subtract', 9, 9], 'tiny'], [['add', 4, 4], 'neutral'], [['add', 8, 7], 'substantial'],
    [['add', 43, 1], 'tiny'], [['add', 40, 10], 'tiny'], [['add', 3, 10], 'tiny'], [['subtract', 75, 72, 'count'], 'tiny'],
    [['subtract', 80, 72, 'count'], 'substantial'], [['add', 23, 45], 'substantial'], [['add', 45, 12], 'tiny'],
    [['add', 63, 5], 'neutral'], [['subtract', 40, 3], 'substantial'], [['subtract', 10, 3], 'neutral'],
    [['add', 9, 2], 'substantial'], [['add', 21, 12], 'tiny'], [['subtract', 57, 2], 'tiny'], [['add', 0, 37], 'tiny'],
    // challenge-baseline-v1 keeps this v1 classifier; these are its lower/higher examples.
    [['add', 6, 3], 'neutral'], [['subtract', 10, 4], 'neutral'], [['subtract', 15, 8], 'substantial'],
    [['add', 7, 7], 'substantial'], [['subtract', 21, 0], 'tiny'], [['add', 21, 0], 'tiny'],
  ]) assert.equal(k(...args), expected, args.join(' '));
  // The projection version is unchanged and stays distinct from the selection policy.
  assert.equal(Q.DIFFICULTY_VERSION, 'difficulty-floor-v1');
  assert.equal(L.FLOOR_POLICY.version, Q.DIFFICULTY_VERSION);
  assert.equal(L.BASELINE_POLICY.version, 'challenge-baseline-v1');
  assert.equal(L.BASELINE_POLICY.lowerCap, 0.2);
  assert.deepEqual(plain(L.BASELINE_POLICY.lowerMagnitudes), ['tiny', 'neutral']);
  assert.equal('tinyFactor' in L.FLOOR_POLICY, false, 'the retired #220 factor cannot stack');
  assert.deepEqual(plain(Q.DIFFICULTY_MAGNITUDES), ['tiny', 'neutral', 'substantial']);
});

test('difficulty rides on inspected entries and built questions from trusted play facts only', () => {
  const play = snap({ scores: { player: 9, opponent: 9 } });
  const entries = pool(play);
  const total = entries.find(e => e.familyId === 'score-total-ch8-within-20');
  const difference = entries.find(e => e.familyId === 'committed-score-difference');
  assert.deepEqual({ ...total.difficulty }, { version: Q.DIFFICULTY_VERSION, group: 'score', magnitude: 'substantial' });
  assert.deepEqual({ ...difference.difficulty }, { version: Q.DIFFICULTY_VERSION, group: 'score', magnitude: 'tiny' });
  const built = Q.build(play, 'score-total-ch8-within-20', { profile: profile() });
  assert.deepEqual({ ...built.difficulty }, { ...total.difficulty });
  assert.deepEqual(Object.keys(built.difficulty).sort(), ["group", "magnitude", "version"], "no operands in the projection");
  // Literacy and non-arithmetic families carry no difficulty.
  for (const e of entries.filter(e => e.evidenceClass === 'literacy' || !Q.FLOOR_GROUPS[e.familyId])) assert.equal(e.difficulty, undefined);
});

// Superseded: the #220 version of this case asserted a ready group's exact
// 0.25 tiny factor inside the score group. challenge-baseline-v1 replaces that
// rule intentionally (it needs no readiness and also covers neutral work), so
// the case now asserts the baseline policy on the same real legal play.
test('9-9 scores: fresh and ready histories get the same baseline cap; non-floor weights are exact', () => {
  const entries = pool(snap({ scores: { player: 9, opponent: 9 } }));
  const ids = entries.filter(e => e.difficulty?.group === 'score').map(e => e.familyId);
  assert.ok(ids.includes('score-total-ch8-within-20') && ids.includes('committed-score-difference'));
  const fresh = list(entries, session([]));
  const ready = session(readyScore());
  assert.equal(L.floorStateFor(ready, 'score', entries.filter(e => ids.includes(e.familyId))).ready, true);
  // Readiness neither protects nor is required: identical weights.
  assert.deepEqual(list(entries, ready).map(i => i.weight), fresh.map(i => i.weight));
  const result = expectC2(fresh, '9-9');
  const pre = reference(entries, session([]));
  assert.ok(close(total(fresh.map(i => i.weight)), total(pre)), 'whole-pool budget preserved');
  fresh.forEach((i, k) => { if (!i.baseline) assert.equal(i.weight, pre[k], `non-floor ${i.entry.familyId}`); });
  fresh.forEach((i, k) => { if (i.baseline) assert.equal(i.baseline.before, pre[k], `before ${i.entry.familyId}`); });
  if (result.capped) {
    assert.ok(result.share < result.preShare && result.share > 0, 'review lowered but kept');
    assert.ok(close(result.share, 0.2), 'no recency: exactly 20% of the unprotected slice');
  }
});

test('drive count 3 and future total 3 + 10 are both tiny, so a ready group stays at baseline', () => {
  const play = snap({ yardLine: 30, driveStart: 27 }, 10);
  const entries = pool(play);
  const drive = entries.filter(e => e.difficulty?.group === 'drive-distance');
  assert.deepEqual(plain(drive.map(e => [e.familyId, e.difficulty.magnitude]).sort()),
    [['drive-distance-plus-whole-tens', 'tiny'], ['drive-distance-scaffolded', 'tiny']]);
  const rows = Array.from({ length: 10 }, (_, i) => row(i, 'drive-distance-scaffolded', i < 4 ? 'substantial' : 'tiny'));
  assert.deepEqual(weights(entries, session(rows)), weights(entries, session(rows.map(r => ({ ...r, difficulty: undefined })))));
});

test('drive 26 to 34 counted across a ten is a genuine substantial alternative to a tiny whole-ten total', () => {
  // Real legal play: drive started at 26, ball now at 34, a 10-yard run proposed.
  const entries = pool(snap({ yardLine: 34, driveStart: 26 }, 10));
  const drive = entries.filter(e => e.difficulty?.group === 'drive-distance');
  assert.deepEqual(plain(drive.map(e => [e.familyId, e.difficulty.magnitude]).sort()),
    [['drive-distance-plus-whole-tens', 'tiny'], ['drive-distance-scaffolded', 'substantial']]);
  const ids = drive.map(e => e.familyId);
  // Ready drive-distance history: unsupported substantial counts and small counts.
  // Alternating core/stretch so the ladder's refresh rule does not apply.
  const rows = Array.from({ length: 10 }, (_, i) => i % 2 === 0 ? row(i, 'drive-distance-scaffolded', 'substantial')
    : row(i, 'drive-distance-plus-whole-tens', 'tiny'));
  // Superseded #220 assertion (exact 0.25 tiny odds in a ready group) is
  // intentionally replaced: the baseline applies whether or not the group is
  // ready, and moves mass across the whole unprotected floor slice.
  const ready = session(rows);
  assert.equal(L.floorStateFor(ready, 'drive-distance', drive).active, true, 'legacy diagnostic still computed');
  const inert = session(rows.map(r => ({ ...r, difficulty: null })));
  assert.equal(L.floorStateFor(inert, 'drive-distance', drive).ready, false);
  for (const [label, s] of [['ready', ready], ['inert', inert], ['fresh', session([])]]) {
    const items = list(entries, s);
    const drives = items.filter(i => ids.includes(i.entry.familyId));
    assert.ok(drives.every(i => i.baseline && !i.baseline.protected), `${label}: readiness never protects`);
    const pre = reference(entries, s);
    expectC2(items, label);
    assert.ok(close(total(items.map(i => i.weight)), total(pre)), `${label}: total budget`);
    items.forEach((i, k) => { if (!i.baseline) assert.equal(i.weight, pre[k], `${label} non-floor ${i.entry.familyId}`); });
    // Within the lower band the current ratios are kept.
    const lows = items.filter(i => i.baseline && lowerOf(i) && i.baseline.before > 0);
    for (const i of lows.slice(1)) assert.ok(close(i.weight / lows[0].weight, i.baseline.before / lows[0].baseline.before), `${label} ratio`);
  }
});

test('4 + 4 is neutral, not substantial, and cannot promote a group', () => {
  const entries = pool(snap({ scores: { player: 4, opponent: 4 } }));
  assert.equal(entries.find(e => e.familyId === 'committed-score-total').difficulty.magnitude, 'neutral');
  const neutral = Array.from({ length: 12 }, (_, i) => row(i, 'committed-score-total', 'neutral'));
  assert.equal(L.floorStateFor(session(neutral), 'score').ready, false);
});

test('readiness thresholds: count, first-try rate, recent window, unsupported substantial, age, and evidence class', () => {
  const state = rows => L.floorStateFor(session(rows), 'score');
  assert.equal(state(readyScore()).ready, true);
  assert.equal(state(readyScore().slice(-7)).ready, false, 'fewer than 8 results');
  assert.equal(state(Array.from({ length: 12 }, (_, i) => row(i, 'committed-score-difference', 'tiny'))).ready, false, 'tiny only');
  assert.equal(state(readyScore().map((r, i) => i < 4 ? { ...r, attempts: [{ number: 1, correct: true, support: 'guided' }] } : r)).ready, false, 'helped');
  assert.equal(state(readyScore().map((r, i) => i < 4 ? { ...r, completedAt: new Date(now - 31 * DAY).toISOString() } : r)).ready, false, 'stale');
  const twoRecentRetries = [...readyScore(), row(20, 'committed-score-difference', 'tiny', 'retryCorrect'), row(21, 'committed-score-difference', 'tiny')];
  assert.equal(state(twoRecentRetries).ready, true);
  assert.equal(state([...readyScore(), row(20, 'score-difference-ch8', 'tiny', 'secondMiss'), row(21, 'committed-score-difference', 'tiny')]).ready, false, 'recent miss');
  const lowRate = [...readyScore(), row(30, 'committed-score-difference', 'tiny', 'retryCorrect'), row(31, 'committed-score-difference', 'tiny', 'retryCorrect'), row(32, 'committed-score-difference', 'tiny'), row(33, 'committed-score-difference', 'tiny'), row(34, 'committed-score-difference', 'tiny'), row(35, 'committed-score-difference', 'tiny')];
  // 10 of 12 first try, but only 4 of the latest 6 and the substantial results aged out of the window.
  assert.equal(state(lowRate).ready, false, 'recent window and window cap');
  // Legacy rows without a projection are inert, except the crossing-ten-only family.
  const legacy = readyScore().map(r => ({ ...r, difficulty: undefined }));
  assert.equal(L.normalizeFloorEvidence(legacy, now).length, 4);
  assert.equal(state(legacy).ready, false);
  // Literacy and malformed projections never enter.
  assert.equal(L.normalizeFloorEvidence([{ ...readyScore()[0], evidenceClass: 'literacy' }], now).length, 0);
  assert.equal(L.normalizeFloorEvidence([{ ...readyScore()[0], difficulty: { version: 'x', group: 'score', magnitude: 'substantial' } }], now).length, 0);
  assert.equal(L.normalizeFloorEvidence([{ ...readyScore()[0], difficulty: { version: Q.DIFFICULTY_VERSION, group: 'drive-distance', magnitude: 'substantial' } }], now).length, 0);
});

test('a recent retry or miss, now or in saved history, keeps the whole group at baseline', () => {
  const entries = pool(snap({ scores: { player: 9, opponent: 9 } }));
  const ids = entries.filter(e => e.difficulty?.group === 'score').map(e => e.familyId);
  const group = entries.filter(e => ids.includes(e.familyId));
  const latestRetry = [...readyScore(), row(40, 'committed-score-total', 'neutral', 'retryCorrect')];
  assert.equal(L.floorStateFor(session(latestRetry), 'score', group).reason, 'recent-retry-or-miss');
  const live = session(readyScore());
  L.recordResolved(live, { ...meta('score-difference-ch8'), familyId: 'score-difference-ch8' }, 'secondMiss');
  assert.equal(L.floorStateFor(live, 'score', group).active, false);
  const saved = session(readyScore(), { 'committed-score': { independent: { completedAt: new Date(now - DAY).toISOString(), resolution: 'retryCorrect' } } });
  assert.equal(L.floorStateFor(saved, 'score', group).active, false);
  const old = session(readyScore(), { 'committed-score': { independent: { completedAt: new Date(now - 40 * DAY).toISOString(), resolution: 'retryCorrect' } } });
  assert.equal(L.floorStateFor(old, 'score', group).active, true);
  // Existing support weighting still applies; only the floor is withheld.
  const support = { 'committed-score': { independent: { completedAt: new Date(now - DAY).toISOString(), resolution: 'retryCorrect' } } };
  assert.deepEqual(weights(entries, saved), weights(entries, session([], support)));
});

test('the floor keeps exactly one scheduler draw and selects only from the truthful pool', () => {
  const entries = pool(snap({ scores: { player: 9, opponent: 9 } }));
  const s = session(readyScore());
  for (const draw of [0, 0.3, 0.7, 0.999999]) {
    let calls = 0;
    const picked = L.weightedPick(entries, s, () => { calls++; return draw; });
    assert.equal(calls, 1);
    assert.ok(entries.some(e => e.familyId === picked.familyId));
  }
});

test('committed rows feed the floor window through the versioned projection', () => {
  const s = session(readyScore().slice(0, 7));
  assert.equal(L.floorStateFor(s, 'score').ready, false);
  const committed = { gameId: 'g2', playId: 'live-1', playType: 'scrimmage', instructionalStatus: 'presented',
    completedAt: new Date(now - 1000).toISOString(), links: { familyId: 'score-total-ch8' },
    question: { concept: 'score-total-ch8', evidenceClass: 'independent', grading: 'gate',
      difficulty: { version: Q.DIFFICULTY_VERSION, group: 'score', magnitude: 'substantial' } },
    resolution: 'firstTryCorrect', attempts: [{ number: 1, correct: true, support: 'initial' }] };
  assert.equal(L.recordCommitted(s, committed), false, 'not a challenge-ladder family');
  assert.equal(s.floorEvidence.length, 8);
  assert.equal(L.floorStateFor(s, 'score').ready, true);
});

test('Grade 2-A completion admits existing arithmetic only at its exact page; coins stay on Grade 1-B', () => {
  const ids = (play, p) => Q.inspect(play, p).eligible.map(e => e.familyId);
  const ones = snap({ scores: { player: 21, opponent: 5 } });
  assert.ok(!ids(ones, profile(50)).includes('score-total-ch8-ones-add'));
  assert.ok(!ids(ones, profile(50, 0)).includes('score-total-ch8-ones-add'));
  assert.ok(ids(ones, profile(50, 10)).includes('score-total-ch8-ones-add'));
  const crossing = snap({ scores: { player: 9, opponent: 9 } });
  assert.ok(!ids(crossing, profile(50, 13)).includes('score-total-ch8-within-20'));
  assert.ok(ids(crossing, profile(50, 14)).includes('score-total-ch8-within-20'));
  // Wrong revision is ignored rather than guessed.
  assert.ok(!ids(ones, { worktexts: { 'Math Mammoth Grade 1-B': { edition: 2026, completedThroughPage: 50 }, [C2.BOOK]: { edition: '2023', completedThroughPage: 32 } } }).includes('score-total-ch8-ones-add'));
  // General borrowing stays excluded for both books.
  assert.equal(C2.operationPage('subtract', 52, 18), Infinity);
  // A family admitted only through Grade 2-A cannot borrow a Grade 1-B operand check.
  const page1b = 120, small = snap({ yardsToGo: 10, scores: { player: 3, opponent: 4 }, totalYards: { player: 25, opponent: 71 } }, 3);
  assert.ok(!ids(small, profile(page1b, 10)).includes('team-yards-add-ch8-ones-add') || C2.operationPage('add', 25, 3) <= 10);
  // Coins remain governed by Grade 1-B alone.
  const coinIds = p => Q.inspect(snap(), p).eligible.filter(e => Q.IN_GAME_COIN_FAMILIES.includes(e.familyId)).length;
  assert.equal(coinIds(profile(113, 32)), 0);
  assert.equal(coinIds(profile(187, 0)), coinIds(profile(187, 32)));
  assert.ok(coinIds(profile(187, 0)) > 0);
});

test('#223: teen subtraction across ten opens only at Grade 2-A page 73, in the existing score-difference family', () => {
  const ids = (play, p) => Q.inspect(play, p).eligible.map(e => e.familyId);
  const teen = snap({ scores: { player: 15, opponent: 8 } });
  for (const page of [0, 32, 54, 72]) assert.ok(!ids(teen, profile(50, page)).includes('score-difference-ch8'), `page ${page}`);
  for (const page of [73, 97, 161]) assert.ok(ids(teen, profile(50, page)).includes('score-difference-ch8'), `page ${page}`);
  assert.equal(C2.operationPage('subtract', 15, 8), 73);
  // No new live family: the eligible family IDs at page 97 are a subset of those already registered.
  const registered = new Set(families.map(e => e.familyId));
  assert.ok(ids(teen, profile(50, 97)).every(id => registered.has(id)));
  // Borrowing beyond the teens and Book-only 20s facts stay closed.
  for (const [a, b] of [[24, 6], [52, 18], [31, 7]]) assert.equal(C2.operationPage('subtract', a, b), Infinity);
});

test('stats keep only a valid difficulty projection and pass it to learning history', () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
  const ctx = vm.createContext({ window: { localStorage: storage, navigator: {}, addEventListener() {} }, navigator: {}, performance: { now: () => 1 } });
  const base = (id, difficulty) => ({ id, gameId: 'g', possessionId: 'pos', playId: `${id}-play`, playType: 'scrimmage', sequence: 1,
    completedAt: new Date(now - 5000).toISOString(), instructionalStatus: 'presented',
    preSnap: {}, calls: { offense: 'shortRun' }, links: { familyId: 'score-total-ch8' },
    question: { id: 'score-total-ch8', skill: 'addition', concept: 'score-total-ch8', purpose: 'approvedExtension', grading: 'gate', tier: 'chapter-8-arithmetic', evidenceClass: 'independent', ...(difficulty ? { difficulty } : {}) },
    attempts: [{ number: 1, correct: true, elapsedMs: 5, support: 'initial' }], resolution: 'firstTryCorrect', outcome: 'gain',
    metrics: { offeredYards: 3, actualYards: 3 }, postPlay: {} });
  values.set('footballMathStats:v1', JSON.stringify({ schemaVersion: 4, aggregates: {}, recentPlays: [
    base('a', { version: Q.DIFFICULTY_VERSION, group: 'score', magnitude: 'substantial', operands: [9, 9] }),
    base('b', { version: Q.DIFFICULTY_VERSION, group: 'score', magnitude: 'huge' }), base('c', null)], mastery: {}, lastResolvedByConcept: {} }));
  vm.runInContext(read('football/stats.js'), ctx);
  const S = vm.runInContext('FOOTBALL_STATS', ctx);
  const rows = JSON.parse(JSON.stringify(S.learningSnapshot().challengeEvidence));
  assert.deepEqual(rows.map(r => r.difficulty ?? null), [{ version: Q.DIFFICULTY_VERSION, group: 'score', magnitude: 'substantial' }, null, null]);
});

// ---- challenge-baseline-v1 (Football 1.39.0) --------------------------------
// Synthetic entries below are registered families with explicit v1
// projections; they prove the algebra. Real legal plays follow separately.
const CAP_POOL = () => [synth('committed-score-difference', 'tiny'), synth('committed-score-total', 'neutral'),
  synth('line-to-gain-missing-part', 'neutral'), synth('score-total-ch8-within-20', 'substantial')];
const withRecent = (s, ids) => { s.recentFamilyIdsByClass.independent = [...ids]; return s; };

test('baseline cap without recency: exactly 20% of the unprotected slice, budget, ratios, positive review', () => {
  const entries = CAP_POOL();
  const items = list(entries, session([]));
  const result = expectC2(items, 'cap');
  assert.ok(result.capped && result.preShare > 0.2, `precondition: review starts above 20% (${result.preShare})`);
  assert.ok(close(result.share, 0.2), `exact 20% (${result.share})`);
  assert.ok(close(total(items.map(i => i.weight)), total(reference(entries, session([])))), 'total budget');
  const lows = items.filter(lowerOf);
  assert.ok(lows.every(i => i.weight > 0), 'every review entry stays possible');
  assert.ok(close(lows[1].weight / lows[0].weight, lows[1].baseline.before / lows[0].baseline.before), 'within-band ratio');
  assert.ok(items.every(i => i.baseline.reason === 'capped' && i.baseline.policyVersion === 'challenge-baseline-v1'));
  // Cross-group movement is intentional: the yardage-marker review entry yields too.
  assert.ok(items[2].weight < items[2].baseline.before);
});

test('already-low review, review-only, and higher-only slices return exact current weights', () => {
  const low = [synth('committed-score-difference', 'tiny', { selectionMultiplier: 0.01 }), synth('score-total-ch8-within-20', 'substantial'),
    synth('committed-score-total', 'substantial'), synth('team-yards-add-ch8-within-20', 'substantial')];
  const lowItems = list(low, session([]));
  assert.ok(lowItems.every(i => i.baseline.reason === 'within-cap'));
  assert.deepEqual(lowItems.map(i => i.weight), reference(low, session([])), 'never raises review');
  const reviewOnly = [synth('committed-score-difference', 'tiny'), synth('committed-score-total', 'neutral')];
  assert.ok(list(reviewOnly, session([])).every(i => i.baseline.reason === 'no-higher-alternative'));
  assert.deepEqual(list(reviewOnly, session([])).map(i => i.weight), reference(reviewOnly, session([])));
  const higherOnly = [synth('score-total-ch8-within-20', 'substantial'), synth('committed-score-total', 'substantial')];
  assert.ok(list(higherOnly, session([])).every(i => i.baseline.reason === 'no-lower-review'));
  assert.deepEqual(list(higherOnly, session([])).map(i => i.weight), reference(higherOnly, session([])));
});

test('recency counterexample: a just-seen only higher family is not lifted back to 80%', () => {
  const entries = CAP_POOL();
  const s = withRecent(session([]), ['score-total-ch8-within-20']);
  const items = list(entries, s);
  assert.equal(items[3].recency, L.PROFILE.recencyMultiplier);
  const result = expectC2(items, 'recent-high');
  assert.ok(result.capped);
  const r = L.PROFILE.recencyMultiplier;
  assert.ok(close(result.share, 0.2 / (0.2 + 0.8 * r)), `review ${result.share}`);
  assert.ok(result.share > 0.5, 'review temporarily above 20% instead of forcing the recent family');
  assert.ok(result.share < result.preShare, 'still lower than before the floor');
  assert.ok(close(total(items.map(i => i.weight)), total(reference(entries, s))), 'budget');
});

test('recency counterexample: a just-seen review family falls below 20% and recency applies once', () => {
  const entries = [synth('committed-score-difference', 'tiny'), synth('score-total-ch8-within-20', 'substantial')];
  const fresh = expectC2(list(entries, session([])), 'pair-fresh');
  assert.ok(fresh.capped && fresh.preShare > 0.2, `precondition ${fresh.preShare}`);
  const s = withRecent(session([]), ['committed-score-difference']);
  const items = list(entries, s);
  const result = expectC2(items, 'recent-low');
  const r = L.PROFILE.recencyMultiplier;
  assert.ok(close(result.share, 0.2 * r / (0.2 * r + 0.8)), `review ${result.share}`);
  assert.ok(result.share < 0.2 && result.share > 0);
});

test('N1: b uses the clamped post-ladder weight divided by its recency factor', () => {
  const entries = [synth('committed-score-difference', 'tiny', { selectionMultiplier: 1e-6 }), ...CAP_POOL().slice(1)];
  const s = withRecent(session([]), ['committed-score-difference']);
  const items = list(entries, s);
  assert.equal(items[0].baseline.before, 0.0001, 'the existing 0.0001 clamp is reached');
  assert.equal(items[0].recency, L.PROFILE.recencyMultiplier);
  const result = expectC2(items, 'clamp');
  assert.ok(result.capped);
  assert.ok(items[0].weight > 0);
});

test('whole-group protection: a saved retry keeps every score entry exact; protected higher cannot trigger the cap', () => {
  const retry = { 'committed-score': { independent: { completedAt: new Date(now - DAY).toISOString(), resolution: 'retryCorrect' } } };
  const real = list(pool(snap({ scores: { player: 9, opponent: 9 } })), session([], retry));
  const score = real.filter(i => i.baseline?.group === 'score');
  assert.ok(score.length >= 2 && score.every(i => i.baseline.protected && i.baseline.reason === 'recent-retry-or-miss'));
  assert.ok(score.every(i => i.weight === i.baseline.before));
  expectC2(real, 'real-protected');
  // The only higher entry is protected: the unprotected review keeps its weight.
  const onlyProtectedHigh = [synth('committed-score-difference', 'tiny'), synth('score-total-ch8-within-20', 'substantial'),
    synth('line-to-gain-missing-part', 'neutral')];
  const a = list(onlyProtectedHigh, session([], retry));
  assert.equal(a[2].baseline.reason, 'no-higher-alternative');
  assert.deepEqual(a.map(i => i.weight), reference(onlyProtectedHigh, session([], retry)));
  // Mixed: protected absolute weights stay exact while the open slice is capped within its own budget.
  const mixed = [...onlyProtectedHigh, synth('drive-distance-scaffolded', 'substantial')];
  const m = list(mixed, session([], retry));
  const pre = reference(mixed, session([], retry));
  [0, 1].forEach(k => assert.equal(m[k].weight, pre[k], 'protected exact'));
  assert.ok(close(m[2].weight + m[3].weight, pre[2] + pre[3]), 'open slice budget');
  expectC2(m, 'mixed');
});

test('protection reasons: support due, downshift and recovery, refresh, challenge-guided, and source-guided', () => {
  const reasons = (entries, s) => Object.fromEntries(list(entries, s).filter(i => i.baseline).map(i => [i.entry.familyId, i.baseline.reason]));
  // Existing guided support from this game's skill record.
  const s1 = session([]);
  s1.bySkill[meta('committed-score-difference').skill] = { independent: { presented: 2, firstTryCorrect: 0, retryCorrect: 2, secondMiss: 0 } };
  assert.equal(reasons(CAP_POOL(), s1)['score-total-ch8-within-20'], 'support-due', 'support protects the whole group');
  // Ladder downshift (second miss, then only two first tries) and its established three-first-try recovery.
  const drivePool = [synth('drive-distance-scaffolded', 'substantial'), synth('committed-score-difference', 'tiny'), synth('committed-score-total', 'neutral')];
  const miss = [row(0, 'drive-distance-scaffolded', 'substantial', 'secondMiss'), row(1, 'drive-distance-scaffolded', 'substantial'), row(2, 'drive-distance-scaffolded', 'substantial')];
  assert.equal(reasons(drivePool, session(miss))['drive-distance-scaffolded'], 'downshift');
  const recovered = [...miss, row(3, 'drive-distance-scaffolded', 'substantial')];
  assert.notEqual(reasons(drivePool, session(recovered))['drive-distance-scaffolded'], 'downshift');
  assert.equal(list(drivePool, session(recovered))[0].baseline.protected, false, 'recovery clears protection');
  // A latest first try clears a retry block exactly as before.
  const retried = [...readyScore(), row(40, 'committed-score-total', 'neutral', 'retryCorrect')];
  assert.equal(reasons(CAP_POOL(), session(retried))['committed-score-total'], 'recent-retry-or-miss');
  assert.equal(reasons(CAP_POOL(), session([...retried, row(41, 'committed-score-total', 'neutral')]))['committed-score-total'], 'capped');
  // Four stretch completions: refresh due protects the drive group.
  const stretch = Array.from({ length: 4 }, (_, i) => row(i, 'drive-distance-plus-whole-tens', 'tiny'));
  const refreshPool = [synth('drive-distance-scaffolded', 'substantial'), synth('drive-distance-plus-whole-tens', 'tiny'), synth('committed-score-difference', 'tiny')];
  assert.equal(reasons(refreshPool, session(stretch))['drive-distance-scaffolded'], 'refresh-due');
  // Only a stretch entry available: the ladder presents it guided, so it is protected before the pick.
  const higherGuided = [synth('drive-distance-plus-whole-tens', 'substantial'), synth('committed-score-difference', 'tiny')];
  assert.equal(reasons(higherGuided, session([]))['drive-distance-plus-whole-tens'], 'challenge-guided');
  // Trusted source-guided annotation protects its whole group, and only an exact true counts.
  const guided = CAP_POOL().map((e, k) => k === 1 ? { ...e, sourceGuided: true } : e);
  const g = reasons(guided, session([]));
  assert.equal(g['committed-score-difference'], 'source-guided');
  assert.equal(g['score-total-ch8-within-20'], 'source-guided');
  assert.equal(g['line-to-gain-missing-part'], 'no-higher-alternative', 'other groups are unaffected by the guard');
  for (const value of [false, 'true', 1]) {
    assert.equal(reasons(CAP_POOL().map((e, k) => k === 1 ? { ...e, sourceGuided: value } : e), session([]))['committed-score-total'], 'capped');
  }
});

test('the pre-pick source-guided annotation matches sourceStatus on the inspected profile', () => {
  // Mirrors football.js: the same authority that sets the post-pick firstSupport.
  for (const p of [profile(113), profile(187), profile(50, 32), profile(50, 97)]) {
    for (const scores of [{ player: 9, opponent: 9 }, { player: 21, opponent: 0 }, { player: 15, opponent: 8 }]) {
      const play = snap({ scores });
      const inspected = Q.inspect(play, p);
      const entries = pool(play, p).map(e => ({ ...e, sourceGuided: Q.sourceStatus(e, inspected.profile).guided === true }));
      const items = list(entries, session([]));
      for (const i of items.filter(i => i.baseline)) {
        const groupGuided = items.some(o => o.baseline?.group === i.baseline.group && o.entry.sourceGuided);
        // An earlier existing reason may name the protection; a guided group is always protected.
        if (groupGuided) assert.equal(i.baseline.protected, true, `${i.entry.familyId}`);
        if (i.baseline.reason === 'source-guided') assert.equal(groupGuided, true, `${i.entry.familyId}`);
      }
      expectC2(items, 'annotated');
    }
  }
});

test('literacy, no-stakes, and non-floor weights are exact; selection adds no new state', () => {
  const scrimmage = Q.FAMILY_REGISTRY.scrimmage;
  const literacy = scrimmage.find(e => e.evidenceClass === 'literacy');
  const nonFloor = scrimmage.find(e => e.evidenceClass === 'independent' && !Q.FLOOR_GROUPS[e.familyId]
    && !Q.IN_GAME_TIME_FAMILIES.includes(e.familyId) && !Q.IN_GAME_COIN_FAMILIES.includes(e.familyId));
  assert.ok(literacy && nonFloor);
  const entries = [...CAP_POOL(), { ...literacy }, { ...nonFloor }, { ...synth('committed-score-total', 'neutral'), grading: 'noStakes' }];
  const s = session([]);
  const before = JSON.stringify(s);
  const items = list(entries, s);
  const pre = reference(entries, s);
  [4, 5, 6].forEach(k => { assert.equal(items[k].weight, pre[k]); assert.equal(items[k].baseline, undefined); });
  expectC2(items, 'mixed-classes');
  assert.equal(JSON.stringify(s), before, 'session is not mutated by selection');
  // Literacy and no-stakes remain outside the slice even with recent same-class history.
  withRecent(s, ['committed-score-total']);
  assert.equal(list(entries, s)[6].baseline, undefined);
});

test('real legal plays: 21-0, 105-0, 7-7 and balanced scores across pages keep every C2 invariant', () => {
  const contexts = [
    { yardLine: 30, yardsToGo: 10, driveStart: 25, scores: { player: 21, opponent: 0 } },
    { yardLine: 62, yardsToGo: 7, driveStart: 40, scores: { player: 105, opponent: 0 } },
    { yardLine: 30, yardsToGo: 8, driveStart: 20, scores: { player: 7, opponent: 7 } },
    { yardLine: 34, yardsToGo: 6, driveStart: 26, scores: { player: 14, opponent: 10 } },
  ];
  for (const [ctx, gain] of contexts.flatMap(c => [[c, 3], [c, 13]])) {
    for (const p of [profile(113), profile(131), profile(187), profile(50, 32), profile(187, 97)]) {
      const entries = pool(snap(ctx, gain), p);
      for (const s of [session([]), session(readyScore()), withRecent(session([]), entries.slice(0, 2).map(e => e.familyId))]) {
        const items = list(entries, s);
        assert.equal(items.length, entries.length, 'selection never removes an eligible entry');
        const pre = reference(entries, s);
        const result = expectC2(items, JSON.stringify([ctx.scores, gain]));
        assert.ok(close(total(items.map(i => i.weight)), total(pre)), 'total budget');
        items.forEach((i, k) => { if (!i.baseline) assert.equal(i.weight, pre[k]); });
        if (result.capped) assert.ok(result.share < result.preShare && result.share > 0);
      }
    }
  }
});

test('one scheduler draw, frozen inputs, and no selection diagnostics on the picked entry', () => {
  const entries = CAP_POOL().map(e => ({ ...e, sourceGuided: false }));
  const frozen = JSON.stringify(entries);
  const s = session([]);
  for (const draw of [0, 0.19, 0.2, 0.5, 0.999999]) {
    let calls = 0;
    const picked = L.weightedPick(entries, s, () => { calls++; return draw; });
    assert.equal(calls, 1);
    const source = entries.find(e => e.familyId === picked.familyId);
    assert.ok(source);
    const extra = Object.keys(picked).filter(k => !(k in source));
    assert.ok(extra.every(k => ['challengeSelection', 'challengeGuided'].includes(k)), extra.join());
    assert.equal(picked.baseline, undefined);
    assert.equal(L.weightedPick(entries, s, () => draw).familyId, picked.familyId, 'deterministic');
  }
  assert.equal(JSON.stringify(entries), frozen);
});
