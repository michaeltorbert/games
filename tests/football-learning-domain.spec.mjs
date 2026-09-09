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
    if (e.evidenceClass === 'independent'
      && ['line-to-gain', 'drive-distance'].includes(e.concept)) {
      assert.ok(Object.hasOwn(Q.CHALLENGE_MAP, e.familyId), `${e.familyId} must belong to its concept's challenge map`);
      assert.deepEqual(e.challenge, Q.CHALLENGE_MAP[e.familyId]);
    }
    if (e.challenge) {
      assert.ok(Object.isFrozen(e.challenge));
      assert.equal(e.playType, 'scrimmage');
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

test('prerequisite failures guide immediately and prerequisite successes stay neutral across reload', () => {
  const prerequisite = 'line-to-gain-exact';
  const assertParity = (rows, preference, guided) => {
    const current = session(rows);
    const latest = rows.at(-1);
    const reloaded = L.createSession({}, { 'line-to-gain': { independent: {
      completedAt: latest.completedAt, resolution: latest.resolution,
    } } }, now, rows);
    const a = L.challengeStateFor(current, 'line-to-gain');
    assert.equal(a.preference, preference);
    assert.equal(a.guided, guided);
    assert.deepEqual(L.challengeStateFor(reloaded, 'line-to-gain'), a);
    assert.equal(L.supportFor(current, entry(core), 'initial'), guided ? 'guided' : 'initial');
  };
  const base = successes(8);
  assertParity([...base, row(8, 'firstTryCorrect', prerequisite)], 'promoted', false);
  assertParity([...base, row(8, 'retryCorrect', prerequisite)], 'promoted', true);
  assertParity([...base, row(8, 'secondMiss', prerequisite)], 'downshifted', true);
  assertParity([...base, row(8, 'retryCorrect', prerequisite), row(9, 'retryCorrect', prerequisite)], 'downshifted', true);
  const failed = [...base, row(8, 'secondMiss', prerequisite)];
  assertParity([...failed, ...Array.from({ length: 15 }, (_, i) => row(9 + i, 'firstTryCorrect', prerequisite))], 'downshifted', true);
  assertParity([...failed, row(9), row(10, 'firstTryCorrect', prerequisite), row(11)], 'downshifted', true);
  assertParity([...failed, row(9), row(10, 'firstTryCorrect', prerequisite), row(11), row(12)], 'promoted', false);
  assert.equal(state([row(0, 'retryCorrect', prerequisite), row(1, 'firstTryCorrect', prerequisite)]).guided, true);
});

test('committed prerequisite ingestion and historical index use the same support evidence', () => {
  const s = session(successes(8));
  for (const [i, resolution] of [[8, 'retryCorrect'], [9, 'secondMiss']]) {
    const r = row(i, resolution, 'line-to-gain-exact');
    assert.equal(L.recordCommitted(s, { ...r, links: { familyId: r.familyId }, question: entry(r.familyId) }), true);
    assert.equal(L.challengeStateFor(s, 'line-to-gain').guided, true);
  }
  assert.equal(L.challengeStateFor(s, 'line-to-gain').preference, 'downshifted');
  const missing = L.createSession({}, { 'line-to-gain': { independent: {
    completedAt: row(20).completedAt, resolution: 'secondMiss',
  } } }, now, successes(8));
  assert.equal(L.challengeStateFor(missing, 'line-to-gain').preference, 'downshifted');
});

test('newer index-only history conservatively suppresses promotion and guides only a retry', () => {
  const retained = successes(8);
  assert.equal(state(retained).preference, 'promoted');
  for (const resolution of ['retryCorrect', 'firstTryCorrect']) {
    const s = L.createSession({}, { 'line-to-gain': { independent: {
      completedAt: row(20).completedAt, resolution,
    } } }, now, retained);
    const challenge = L.challengeStateFor(s, 'line-to-gain');
    assert.equal(challenge.preference, 'initial', resolution);
    assert.equal(challenge.guided, resolution === 'retryCorrect', resolution);
    assert.equal(L.supportFor(s, entry(core), 'initial'), resolution === 'retryCorrect' ? 'guided' : 'initial');
  }
});

test('real mapped families retain fresh, aged, historical-support and session-need budgets with one draw', () => {
  const coreEntry = entry(core), stretchEntry = entry(stretch), literacy = entry('yards-to-go-read');
  const mastery = { 'line-to-gain': { independent: { firstTryCorrect: 8, retryCorrect: 0, secondMiss: 0 } } };
  const make = (days, resolution = 'firstTryCorrect', evidence = []) => L.createSession(mastery,
    { 'line-to-gain': { independent: { resolution, completedAt: new Date(now - days * 86400000).toISOString() } } }, now, evidence);
  const counts = (s, entries) => {
    const totals = {}; let draws = 0;
    for (let i = 0; i < 10000; i++) {
      const id = L.weightedPick(entries, s, () => { draws++; return (i + .5) / 10000; }).familyId;
      totals[id] = (totals[id] || 0) + 1;
    }
    assert.equal(draws, 10000);
    return totals;
  };
  const pair = [coreEntry, literacy];
  const fresh = counts(make(0), pair)[core];
  const aged = counts(make(30), pair)[core];
  const supported = counts(make(0, 'secondMiss'), pair)[core];
  assert.ok(fresh < aged && aged < supported);
  const currentNeed = make(30);
  L.recordResolved(currentNeed, coreEntry, 'secondMiss');
  assert.ok(counts(currentNeed, pair)[core] > supported);
  // With identical baseline mastery/recency, promotion only reallocates the
  // challenge concept's budget; it cannot change literacy's share.
  const pool = [coreEntry, stretchEntry, literacy];
  const initial = counts(make(30), pool);
  const promoted = counts(make(30, 'firstTryCorrect', successes(8)), pool);
  assert.equal(initial[literacy.familyId], promoted[literacy.familyId]);
  assert.ok(promoted[stretch] > initial[stretch]);
  const down = session([row(0, 'secondMiss')]);
  const only = L.weightedPick([stretchEntry], down, () => .5);
  assert.equal(only.familyId, stretch);
  assert.equal(L.supportFor(down, only, 'initial'), 'guided');
});

test('index-only second miss requires three post-index core successes, with prerequisites neutral', () => {
  const index = { 'line-to-gain': { independent: {
    completedAt: row(10).completedAt, resolution: 'secondMiss',
  } } };
  for (let count = 0; count <= 3; count++) {
    const recoveries = Array.from({ length: count }, (_, i) => row(12 + i * 2));
    const prerequisites = Array.from({ length: 4 }, (_, i) => row(11 + i * 2, 'firstTryCorrect', 'line-to-gain-exact'));
    const retained = [...successes(8), ...recoveries, ...prerequisites];
    const s = L.createSession({}, index, now, retained);
    const result = L.challengeStateFor(s, 'line-to-gain');
    assert.equal(result.preference, count < 3 ? 'downshifted' : 'promoted', `recoveries=${count}`);
    assert.equal(result.guided, count < 3, `recoveries=${count}`);
    const reload = L.createSession({}, index, now, s.challengeEvidence);
    assert.deepEqual(L.challengeStateFor(reload, 'line-to-gain'), result);
  }
  const interrupted = L.createSession({}, index, now,
    [...successes(8), row(12), row(13), row(14, 'retryCorrect'), row(15), row(16)]);
  assert.equal(L.challengeStateFor(interrupted, 'line-to-gain').preference, 'downshifted');
});

test('retained and index-only failures obey the same final twelve-result support window', () => {
  const failure = row(0, 'secondMiss');
  const index = { 'line-to-gain': { independent: {
    completedAt: failure.completedAt, resolution: failure.resolution,
  } } };
  // No pair of retries within three results and no three consecutive successes:
  // only an in-window earlier second miss can keep this sequence downshifted.
  const mixed = Array.from({ length: 12 }, (_, i) => row(i + 1,
    i % 3 === 0 ? 'retryCorrect' : 'firstTryCorrect'));
  for (const count of [11, 12]) {
    const newer = mixed.slice(0, count);
    const baseline = state(newer);
    assert.equal(baseline.preference, 'initial');
    const omitted = L.challengeStateFor(L.createSession({}, index, now, newer), 'line-to-gain');
    const retained = L.challengeStateFor(L.createSession({}, index, now, [failure, ...newer]), 'line-to-gain');
    assert.deepEqual(omitted, retained, `newer rows=${count}`);
    assert.equal(omitted.preference, count === 11 ? 'downshifted' : 'initial');
    assert.equal(omitted.guided, count === 11);
    if (count === 12) assert.deepEqual(omitted, baseline);
  }
});
