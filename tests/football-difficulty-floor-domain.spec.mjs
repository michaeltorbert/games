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

test('effective-fact classifier: identity, small steps, small facts, crossing ten, and two-place work', () => {
  const k = Q.classifyComputation;
  for (const [args, expected] of [
    [['add', 9, 9], 'substantial'], [['subtract', 9, 9], 'tiny'], [['add', 4, 4], 'neutral'], [['add', 8, 7], 'substantial'],
    [['add', 43, 1], 'tiny'], [['add', 40, 10], 'tiny'], [['add', 3, 10], 'tiny'], [['subtract', 75, 72, 'count'], 'tiny'],
    [['subtract', 80, 72, 'count'], 'substantial'], [['add', 23, 45], 'substantial'], [['add', 45, 12], 'tiny'],
    [['add', 63, 5], 'neutral'], [['subtract', 40, 3], 'substantial'], [['subtract', 10, 3], 'neutral'],
    [['add', 9, 2], 'substantial'], [['add', 21, 12], 'tiny'], [['subtract', 57, 2], 'tiny'], [['add', 0, 37], 'tiny'],
  ]) assert.equal(k(...args), expected, args.join(' '));
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

test('9-9 scores: a ready group lowers the zero difference, keeps its budget, and leaves other groups unchanged', () => {
  const entries = pool(snap({ scores: { player: 9, opponent: 9 } }));
  const ids = entries.filter(e => e.difficulty?.group === 'score').map(e => e.familyId);
  assert.ok(ids.includes('score-total-ch8-within-20') && ids.includes('committed-score-difference'));
  const baseline = weights(entries, session([]));
  const ready = session(readyScore());
  assert.equal(L.floorStateFor(ready, 'score', entries.filter(e => ids.includes(e.familyId))).active, true);
  const floored = weights(entries, ready);
  assert.ok(Math.abs(sum(baseline, ids) - sum(floored, ids)) < 1e-12, 'group budget preserved');
  const share = w => w['committed-score-difference'] / sum(w, ids);
  assert.ok(share(floored) < share(baseline) * 0.5, 'tiny share reduced');
  const odds = w => w['committed-score-difference'] / w['score-total-ch8-within-20'];
  assert.ok(Math.abs(odds(floored) - odds(baseline) * 0.25) < 1e-12, 'exact 0.25 tiny factor');
  for (const id of Object.keys(baseline).filter(id => !ids.includes(id))) assert.equal(floored[id], baseline[id], id);
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
  const ready = session(rows);
  const state = L.floorStateFor(ready, 'drive-distance', drive);
  assert.equal(state.active, true, state.reason);
  // Same session evidence with the floor projection stripped: identical ladder, no floor.
  const inert = session(rows.map(r => ({ ...r, difficulty: null })));
  assert.equal(L.floorStateFor(inert, 'drive-distance', drive).ready, false);
  const baseline = weights(entries, inert), floored = weights(entries, ready);
  assert.ok(Math.abs(sum(baseline, ids) - sum(floored, ids)) < 1e-12, 'group budget preserved');
  const tinyShare = w => w['drive-distance-plus-whole-tens'] / sum(w, ids);
  const odds = w => w['drive-distance-plus-whole-tens'] / w['drive-distance-scaffolded'];
  assert.ok(Math.abs(odds(floored) - odds(baseline) * L.FLOOR_POLICY.tinyFactor) < 1e-12, 'tiny odds scaled by exactly 0.25');
  assert.ok(tinyShare(floored) < tinyShare(baseline));
  for (const id of Object.keys(baseline).filter(id => !ids.includes(id))) assert.equal(floored[id], baseline[id], id);
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
