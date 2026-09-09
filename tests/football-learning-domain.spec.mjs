import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const context = vm.createContext({});
for (const name of ['learning', 'copy', 'contextual-questions']) {
  vm.runInContext(readFileSync(new URL(`../football/${name}.js`, import.meta.url), 'utf8'), context);
}
const L = vm.runInContext('FOOTBALL_LEARNING', context);
const Q = vm.runInContext('FOOTBALL_CONTEXTUAL_QUESTIONS', context);
const now = Date.now();
const families = Object.values(Q.FAMILY_REGISTRY).flat();
const entry = id => families.find(e => e.familyId === id);
const core = 'line-to-gain-missing-part';
const stretch = 'line-to-gain-fact-family';
function row(i, resolution = 'firstTryCorrect', familyId = core, support = 'initial') {
  const e = entry(familyId);
  return { gameId: 'game', playId: `play-${i}`, playType: 'scrimmage', instructionalStatus: 'presented',
    completedAt: new Date(now - 100000 + i * 1000).toISOString(), familyId, concept: e.concept,
    evidenceClass: e.evidenceClass, grading: 'gate', resolution,
    attempts: resolution === 'firstTryCorrect' ? [{ number: 1, correct: true, support }]
      : [{ number: 1, correct: false, support }, { number: 2, correct: resolution === 'retryCorrect', support: 'guided' }] };
}
const session = rows => L.createSession({}, {}, now, rows);
const state = rows => L.challengeStateFor(session(rows), 'line-to-gain');
const successes = n => Array.from({ length: n }, (_, i) => row(i));

test('explicit immutable two-ladder map covers only six of the 31 registered families', () => {
  assert.equal(families.length, 31);
  assert.equal(Object.keys(Q.CHALLENGE_MAP).length, 6);
  for (const e of families) {
    assert.ok(Object.isFrozen(e));
    if (e.challenge) {
      assert.ok(Object.isFrozen(e.challenge));
      assert.equal(e.evidenceClass, 'independent');
      assert.equal(e.concept, e.challenge.concept);
    }
  }
});
test('promotion boundaries require eight results, rate, recent success and unsupported core evidence', () => {
  assert.equal(state(successes(7)).preference, 'initial');
  assert.equal(state(successes(8)).preference, 'promoted');
  assert.equal(state(successes(8).map(r => ({ ...r, attempts: [{ number: 1, correct: true, support: 'guided' }] }))).preference, 'initial');
  assert.equal(state(successes(8).map((r, i) => row(i, 'firstTryCorrect', stretch))).preference, 'initial');
  assert.equal(state([row(0, 'retryCorrect'), ...successes(7).map((r, i) => row(i + 1))]).preference, 'promoted');
  assert.equal(state([row(0, 'retryCorrect'), row(1, 'retryCorrect'), ...successes(6).map((r, i) => row(i + 2))]).preference, 'initial');
});
test('retry guidance, second-miss and paired-retry downshift recover after three successes', () => {
  assert.equal(state([row(0, 'retryCorrect')]).guided, true);
  assert.equal(state([row(0, 'retryCorrect')]).preference, 'initial');
  for (const start of [[row(0, 'secondMiss')], [row(0, 'retryCorrect'), row(1, 'retryCorrect')]]) {
    assert.equal(state(start).preference, 'downshifted');
    assert.equal(state([...start, row(3), row(4)]).preference, 'downshifted');
    assert.equal(state([...start, row(3), row(4), row(5)]).preference, 'initial');
  }
});
test('malformed, expired, future, noncommitted and cross-class evidence cannot promote', () => {
  const invalid = [
    { evidenceClass: 'literacy' }, { evidenceClass: 'unclassified' }, { grading: 'noStakes' },
    { instructionalStatus: 'bypassed' }, { playType: 'conversion' }, { familyId: 'unknown' },
    { completedAt: 'bad' }, { completedAt: new Date(now + 1).toISOString() },
    { completedAt: new Date(now - 31 * 86400000).toISOString() }, { attempts: [] },
    { attempts: [{ number: 1, correct: false, support: 'initial' }] },
  ];
  for (const patch of invalid) assert.equal(state(successes(8).map(r => ({ ...r, ...patch }))).preference, 'initial');
  assert.equal(state(successes(12).map((r, i) => row(i, 'firstTryCorrect', 'line-to-gain-exact'))).preference, 'initial');
  assert.equal(state(successes(12).map((r, i) => row(i, 'firstTryCorrect', 'drive-distance-scaffolded'))).preference, 'initial');
});
test('stable order, duplicates, conflicting rows, latest twelve and privacy projection', () => {
  const rows = successes(8);
  assert.equal(state([...rows].reverse()).preference, 'promoted');
  assert.equal(state(Array(8).fill(rows[0])).preference, 'initial');
  assert.equal(L.normalizeChallengeEvidence([...rows, { ...rows[0], resolution: 'retryCorrect', attempts: row(0, 'retryCorrect').attempts }], now).length, 7);
  assert.equal(state([...successes(8), ...Array.from({ length: 12 }, (_, i) => row(i + 8, 'retryCorrect'))]).preference, 'downshifted');
  const clean = L.normalizeChallengeEvidence([{ ...rows[0], prompt: 'private', elapsedMs: 23, answer: 8 }], now);
  assert.doesNotMatch(JSON.stringify(clean), /private|elapsed|answer|prompt/);
});
test('four stretch commits require lower refresh when available; higher-only is guided and stays due', () => {
  const s = session(Array.from({ length: 4 }, (_, i) => row(i, 'firstTryCorrect', stretch)));
  assert.equal(L.challengeStateFor(s, 'line-to-gain').refreshDue, true);
  const entries = [entry(core), entry(stretch)];
  for (const draw of [0, .25, .999999]) assert.equal(L.weightedPick(entries, s, () => draw).familyId, core);
  const only = L.weightedPick([entry(stretch)], s, () => .8);
  assert.equal(only.challengeGuided, true);
  assert.equal(only.challengeSelection.fallback, 'higher-guided');
  assert.equal(L.challengeStateFor(s, 'line-to-gain').refreshDue, true);
  assert.equal(L.challengeStateFor(session([...s.challengeEvidence, row(5)]), 'line-to-gain').refreshDue, false);
});
test('one draw, deterministic selection, material stretch increase, unchanged literacy budget', () => {
  const entries = [entry(core), entry(stretch), entry('yards-to-go-read')];
  const initial = session([]), promoted = session(successes(8));
  const counts = s => {
    const result = {}; let calls = 0;
    for (let i = 0; i < 10000; i++) {
      const selected = L.weightedPick(entries, s, () => { calls++; return (i + .5) / 10000; });
      result[selected.familyId] = (result[selected.familyId] || 0) + 1;
    }
    assert.equal(calls, 10000); return result;
  };
  const a = counts(initial), b = counts(promoted);
  assert.ok(b[stretch] > a[stretch] * 2);
  assert.equal(a['yards-to-go-read'], b['yards-to-go-read']);
  assert.deepEqual(counts(promoted), b);
  assert.equal(L.weightedPick([], initial, () => { throw Error('draw'); }), null);
});
test('commit ingestion is exactly once, historical evidence is copied, and recency is class-local', () => {
  const original = successes(8), s = session(original);
  original[0].resolution = 'secondMiss';
  assert.equal(L.challengeStateFor(s, 'line-to-gain').preference, 'promoted');
  const r = row(20);
  const committed = { ...r, links: { familyId: core }, question: entry(core) };
  assert.equal(L.recordCommitted(s, committed), true);
  assert.equal(L.recordCommitted(s, committed), false);
  assert.equal(s.currentChallengeEvidence.length, 1);
  L.recordPresented(s, entry(core));
  assert.equal(s.recentFamilyIdsByClass.independent.length, 1);
  assert.equal(s.recentFamilyIdsByClass.literacy.length, 0);
});
