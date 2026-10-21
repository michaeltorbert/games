// Domain checks for shared/learning-outbox.js (#199). Each "tab" is a separate VM
// context running the unchanged source against one shared localStorage (the hint and
// legacy key) and one shared fake IndexedDB (tests/learning-outbox-fixture.mjs). The
// fake models transaction order, abort rollback and missing-database upgrade aborts
// for orchestration checks only; it is NOT evidence of real IndexedDB behavior, which
// the browser specs exercise.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { consentRecord, createFakeIndexedDB } from './learning-outbox-fixture.mjs';

const SOURCE = await readFile(new URL('../shared/learning-outbox.js', import.meta.url), 'utf8');
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const DB = 'learningReporting', STORE = 'records';
const HINT = 'learningReporting:enrollment:v1';
const LEGACY = 'learningReporting:outbox:v1';
const GENERATION = randomUUID(), DEVICE = randomUUID(), P1 = randomUUID(), P2 = randomUUID();
const META = Object.freeze({ familyId: 'line-to-gain-exact', concept: 'line-to-gain', purpose: 'weakSpot', tier: 'within-10', grading: 'gate', evidenceClass: 'independent' });
const LONG_META = Object.freeze({ familyId: 'line-to-gain-surplus-ch8-ones-subtract', concept: 'line-to-gain', purpose: 'approvedExtension', tier: 'chapter-8-arithmetic', grading: 'gate', evidenceClass: 'independent' });

function makeStorage() {
  const values = new Map();
  const writes = [];
  let readFailure = false, removeFailure = false;
  return {
    getItem(key) {
      if (readFailure) throw new Error('storage read blocked');
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) { writes.push(key); values.set(key, String(value)); },
    removeItem(key) {
      if (removeFailure) throw new Error('storage remove blocked');
      values.delete(key);
    },
    raw: key => values.has(key) ? values.get(key) : null,
    put: (key, value) => values.set(key, value),
    keys: () => [...values.keys()].sort(),
    writes,
    blockReads(value) { readFailure = value; },
    blockRemoves(value) { removeFailure = value; },
  };
}

function makeEnv() {
  return { storage: makeStorage(), idb: createFakeIndexedDB(), uuids: { count: 0 } };
}

// No Web Locks in any tab: the outbox protocol no longer uses them.
function openTab(env, { indexedDB = env.idb.factory, crypto = 'default' } = {}) {
  const uuidSource = crypto === 'default' ? { randomUUID: () => { env.uuids.count++; return randomUUID(); } } : crypto;
  const globals = { localStorage: env.storage, navigator: {}, crypto: uuidSource };
  if (indexedDB) globals.indexedDB = indexedDB;
  const context = vm.createContext(globals);
  vm.runInContext(SOURCE, context, { filename: 'learning-outbox.js' });
  return context.LEARNING_OUTBOX;
}

// Values returned from a VM context have that realm's prototypes; compare plain copies.
const plain = value => JSON.parse(JSON.stringify(value));
const hint = (overrides = {}) => JSON.stringify({ schemaVersion: 1, generation: GENERATION, deviceId: DEVICE, profileIds: [P1], activeProfileId: null, ...overrides });
// Synthetic enrollment as #200 will install it: authoritative consent first, then the hint.
function enroll(env, overrides = {}, { consent = true } = {}) {
  const value = JSON.parse(hint(overrides));
  if (consent) env.idb.seed(DB, STORE, { enrollment: consentRecord(value) });
  env.storage.put(HINT, JSON.stringify(value));
}
const outboxRaw = env => env.idb.peek(DB, STORE, 'outbox');
const consentRaw = env => env.idb.peek(DB, STORE, 'enrollment');
const envelope = env => JSON.parse(outboxRaw(env));
const putOutbox = (env, bytes) => env.idb.poke(DB, STORE, 'outbox', bytes);
const settle = async predicate => { for (let index = 0; index < 1000 && !predicate(); index++) await new Promise(resolve => setImmediate(resolve)); };
const football = (kind, fields, questionInstanceId, meta = META) => ({ game: 'football', gameVersion: '1.34.22', kind, questionInstanceId, ...meta, ...fields });
// Live Football stages: an unsupported first attempt is 'initial', the retry is 'guided'.
const attempt = (questionInstanceId, number = 1, correct = false, meta = META) =>
  football('attempt', { number, correct, support: number === 1 ? 'initial' : 'guided' }, questionInstanceId, meta);
async function recordAttempts(tab, count, meta = META) {
  const questionInstanceId = randomUUID();
  for (let index = 0; index < count; index++) assert.equal(tab.record(tab.capture(), attempt(questionInstanceId, 1, false, meta)), true);
  await tab.idle();
}
const progress = (nonce, serial, misses = 0, helped = false, firstCorrect = null, complete = false, factId = 'add:7:6') =>
  ({ nonce, factId, serial, misses, helped, firstCorrect, complete });
const FACT = { factId: 'add:7:6', family: 'family:6:7:13' };
function factsOp(before, after, observations, { durable = true, adoptable = false } = {}) {
  return { gameVersion: '1.9.2', durable, adoptable, before, after, replaced: false, observations };
}
function leaveOp(before, { durable = true, adoptable = false } = {}) {
  return { gameVersion: '1.9.2', durable, adoptable, before, after: before, replaced: true, observations: [{ kind: 'leftUnfinished', fields: { ...FACT } }] };
}
const factsAttempt = (number, correct, helped = false) => ({ kind: 'attempt', fields: { ...FACT, number, correct, helped } });

function baseEvent(overrides = {}) {
  return {
    schemaVersion: 1, eventId: randomUUID(), deviceId: DEVICE, epochId: randomUUID(), seq: 1, profileId: P1,
    game: 'football', gameVersion: '1.34.22', recordedAt: '2026-10-21T04:00:00.000Z', kind: 'attempt', questionInstanceId: randomUUID(),
    ...META, number: 1, correct: true, support: 'initial', ...overrides,
  };
}
function factsEvent(kind, fields) {
  const { familyId, concept, purpose, tier, grading, evidenceClass, number, correct, support, ...common } = baseEvent({ game: 'facts', gameVersion: '1.9.2', kind });
  return { ...common, ...FACT, ...fields };
}

async function liveCatalogs() {
  const context = vm.createContext({});
  for (const path of ['../shared/curriculum.js', '../football/opponent.js', '../football/football-domain.js', '../football/copy.js', '../football/contextual-questions.js']) {
    vm.runInContext(await read(path), context, { filename: path });
  }
  const facts = vm.createContext({});
  vm.runInContext(await read('../place-value-practice/fact-practice-domain.js'), facts, { filename: 'fact-practice-domain.js' });
  return { registry: vm.runInContext('FOOTBALL_CONTEXTUAL_QUESTIONS.FAMILY_REGISTRY', context), facts: facts.PLACE_FACTS };
}

test('the outbox source has no network, timer, lock, installer or localStorage-write API', () => {
  const code = SOURCE.replace(/\/\/.*$/gm, '');
  for (const api of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'importScripts', 'sessionStorage',
    'setTimeout', 'setInterval', 'Math.random', 'document.', 'addEventListener', 'navigator.locks', 'locks.request',
    'setItem', 'createObjectStore', 'deleteObjectStore']) {
    assert.equal(code.includes(api), false, api);
  }
});

test('the shared closed catalog equals the live Football registry and Facts catalog in both directions', async () => {
  const outbox = openTab(makeEnv());
  const { registry, facts } = await liveCatalogs();
  const live = Object.values(registry).flat();
  assert.ok(outbox.validateCatalog(outbox.CATALOG));
  assert.deepEqual([...outbox.CATALOG.historicalFootball], []);
  const contract = outbox.CATALOG.football;
  for (const entry of live) {
    assert.deepEqual({ ...contract[entry.familyId] }, {
      concept: entry.concept, purpose: entry.purpose, tier: entry.tier, grading: entry.grading, evidenceClass: entry.evidenceClass,
    }, entry.familyId);
  }
  const liveIds = new Set(live.map(entry => entry.familyId));
  assert.equal(liveIds.size, live.length);
  for (const familyId of Object.keys(contract)) {
    if (!outbox.CATALOG.historicalFootball.includes(familyId)) assert.ok(liveIds.has(familyId), `${familyId} is live`);
  }
  assert.deepEqual(Object.entries(outbox.CATALOG.facts).sort(), Array.from(facts.catalog, fact => [fact.id, fact.family]).sort());
  assert.equal(Object.keys(outbox.CATALOG.facts).length, facts.catalog.length);
  // No live no-stakes producer exists at this base; the contract still keeps the axis.
  assert.equal(Object.values(contract).filter(entry => entry.grading === 'noStakes').length, 0);
  assert.equal(live.filter(entry => entry.grading === 'noStakes').length, 0);
});

test('events validate against exact per-game, per-kind allowlists and the status record validates separately', () => {
  const outbox = openTab(makeEnv());
  const valid = [
    baseEvent(),
    baseEvent({ kind: 'attempt', number: 2, correct: false, support: 'guided' }),
    (({ correct, ...rest }) => ({ ...rest, kind: 'help', number: 1, support: 'guided' }))(baseEvent()),
    (({ correct, ...rest }) => ({ ...rest, kind: 'help', number: 2, support: 'worked' }))(baseEvent()),
    (({ correct, number, support, ...rest }) => ({ ...rest, kind: 'resolution', resolution: 'secondMiss' }))(baseEvent()),
    (({ correct, number, support, ...rest }) => ({ ...rest, kind: 'leftUnfinished' }))(baseEvent()),
    factsEvent('attempt', { number: 1, correct: false, helped: false }),
    factsEvent('help', { number: 3, helped: true }),
    factsEvent('resolution', { outcome: 'first-correct', eligibleCheck: true, timingMs: 1200, helped: false }),
    factsEvent('resolution', { outcome: 'retry', eligibleCheck: false, timingMs: null, helped: false }),
    factsEvent('resolution', { outcome: 'shown', eligibleCheck: false, timingMs: null, helped: true }),
    factsEvent('leftUnfinished', {}),
  ];
  for (const event of valid) assert.equal(outbox.validateEvent(event), true, JSON.stringify(event));
  const invalid = {
    footballTiming: baseEvent({ elapsedMs: 900 }),
    footballTimingMs: baseEvent({ timingMs: null }),
    selectedChoice: baseEvent({ selectedChoiceId: 'line-to-gain-exact--choice-6' }),
    prompt: baseEvent({ prompt: 'How many yards?' }),
    answer: baseEvent({ answer: 6 }),
    opponentPlan: baseEvent({ opponentPlan: 'longPass' }),
    name: baseEvent({ name: 'Synthetic child' }),
    counters: baseEvent({ droppedLocal: 0 }),
    statusCounter: baseEvent({ writeFailures: 1 }),
    wrongConcept: baseEvent({ concept: 'place-value' }),
    unknownFamily: baseEvent({ familyId: 'free-text-family' }),
    legacyClass: baseEvent({ evidenceClass: 'unclassified' }),
    workedAttempt: baseEvent({ support: 'worked' }),
    legacyNoneStage: baseEvent({ support: 'none' }),
    unsupportedRetry: baseEvent({ number: 2, correct: true, support: 'initial' }),
    thirdAttempt: baseEvent({ number: 3 }),
    helpOneWorked: (({ correct, ...rest }) => ({ ...rest, kind: 'help', number: 1, support: 'worked' }))(baseEvent()),
    missingField: (({ support, ...rest }) => rest)(baseEvent()),
    badUuid: baseEvent({ eventId: 'event-1' }),
    badSeq: baseEvent({ seq: 0 }),
    factsAttemptTiming: factsEvent('attempt', { number: 1, correct: true, helped: false, timingMs: null }),
    factsAttemptEligible: factsEvent('attempt', { number: 1, correct: true, helped: false, eligibleCheck: false }),
    factsHelpEligible: factsEvent('help', { number: 1, helped: true, eligibleCheck: false }),
    factsLeftTiming: factsEvent('leftUnfinished', { timingMs: null }),
    factsWrongFamily: factsEvent('leftUnfinished', { family: 'family:1:1:2' }),
    factsValue: factsEvent('attempt', { number: 1, correct: false, helped: false, value: 12 }),
    shownTimed: factsEvent('resolution', { outcome: 'shown', eligibleCheck: false, timingMs: 1200, helped: true }),
    retryEligible: factsEvent('resolution', { outcome: 'retry', eligibleCheck: true, timingMs: null, helped: false }),
    shownUnhelped: factsEvent('resolution', { outcome: 'shown', eligibleCheck: false, timingMs: null, helped: false }),
    fastTiming: factsEvent('resolution', { outcome: 'first-correct', eligibleCheck: true, timingMs: 200, helped: false }),
    slowTiming: factsEvent('resolution', { outcome: 'first-correct', eligibleCheck: true, timingMs: 60100, helped: false }),
    unroundedTiming: factsEvent('resolution', { outcome: 'first-correct', eligibleCheck: true, timingMs: 1250, helped: false }),
  };
  for (const [name, event] of Object.entries(invalid)) assert.equal(outbox.validateEvent(event), false, name);
  const status = { schemaVersion: 1, deviceId: DEVICE, epochId: randomUUID(), highestSeq: 3, droppedLocal: 0, writeFailures: 0 };
  assert.equal(outbox.validateStatus(status), true);
  assert.equal(outbox.validateStatus({ ...status, kind: 'attempt' }), false);
  assert.equal(outbox.validateStatus({ ...status, highestSeq: -1 }), false);
  assert.equal(outbox.validateEvent(status), false);
});

test('Football attempt stages are the live domain stages: unsupported initial, retry guided, worked after both misses', async () => {
  const outbox = openTab(makeEnv());
  const context = vm.createContext({});
  for (const path of ['../shared/curriculum.js', '../football/copy.js', '../football/learning.js', '../football/opponent.js',
    '../football/football-domain.js', '../football/contextual-questions.js']) {
    vm.runInContext(await read(path), context, { filename: path });
  }
  const stages = JSON.parse(vm.runInContext(`(() => {
    const live = FOOTBALL_DOMAIN.normalizeContext({ contextId: 'stage-probe', match: FOOTBALL_OPPONENT.createMatch(), possession: 'offense',
      direction: 1, quarter: 2, down: 2, yardsToGo: 8, yardLine: 30, firstDownLine: 38, driveStart: 20, scores: { player: 7, opponent: 7 },
      totalYards: { player: 83, opponent: 71 }, plays: 4, drivePlays: 2, calls: { offense: 'shortRun', defense: null, matchup: null } });
    const snap = FOOTBALL_DOMAIN.createSnap(live, { gain: 2, callKey: 'shortRun', label: 'Short Run' });
    const P = FOOTBALL_LEARNING.PROFILE;
    const entry = FOOTBALL_CONTEXTUAL_QUESTIONS.inspect(snap, { completedThroughPage: P.completedThroughPage,
      includedThroughPage: P.includedThroughPage, computationMax: P.computationMax, displayMax: P.displayMax }).eligible[0];
    const question = FOOTBALL_CONTEXTUAL_QUESTIONS.build(snap, entry.familyId, {});
    return JSON.stringify({ meta: { familyId: question.familyId, concept: question.concept, purpose: question.purpose, tier: question.tier,
      grading: question.grading, evidenceClass: question.evidenceClass }, initial: question.support,
      retry: FOOTBALL_LEARNING.nextSupport(question.support), guidedRetry: FOOTBALL_LEARNING.nextSupport('guided') });
  })()`, context));
  assert.equal(stages.initial, 'initial', 'an unsupported live question starts at the initial stage');
  assert.deepEqual([stages.retry, stages.guidedRetry], ['guided', 'guided']);
  const event = fields => baseEvent({ ...stages.meta, ...fields });
  assert.equal(outbox.validateEvent(event({ number: 1, correct: false, support: stages.initial })), true);
  assert.equal(outbox.validateEvent(event({ number: 2, correct: true, support: stages.retry })), true);
  assert.equal(outbox.validateEvent((({ correct, ...rest }) => ({ ...rest, kind: 'help', number: 2, support: 'worked' }))(event({}))), true);
  // Stage names are recorded as-is; no alias or remapping is accepted.
  for (const support of ['none', 'worked', 'Initial']) assert.equal(outbox.validateEvent(event({ number: 1, support })), false, support);
});

test('no-stakes stays a distinct, never-independent axis through an isolated synthetic catalog fixture', () => {
  const outbox = openTab(makeEnv());
  const fixture = JSON.parse(JSON.stringify(outbox.CATALOG));
  fixture.football['synthetic-preview'] = { concept: 'synthetic-preview', purpose: 'coreReview', tier: 'within-10', grading: 'noStakes', evidenceClass: 'literacy' };
  assert.equal(outbox.validateCatalog(fixture), true);
  const meta = { familyId: 'synthetic-preview', concept: 'synthetic-preview', purpose: 'coreReview', tier: 'within-10', grading: 'noStakes', evidenceClass: 'literacy' };
  const preview = baseEvent({ ...meta, kind: 'attempt' });
  assert.equal(outbox.validateEvent(preview, fixture), true);
  // The production catalog stays closed: the synthetic family is never accepted there.
  assert.equal(outbox.validateEvent(preview), false);
  assert.equal(outbox.validateEvent(baseEvent({ ...meta, grading: 'gate' }), fixture), false);
  const broken = JSON.parse(JSON.stringify(fixture));
  broken.football['synthetic-preview'].evidenceClass = 'unclassified';
  assert.equal(outbox.validateCatalog(broken), false);
  // The six outcomes are separate fields, never one score.
  const resolution = (resolution, extra = {}) => (({ correct, number, support, ...rest }) => ({ ...rest, kind: 'resolution', resolution, ...extra }))(baseEvent());
  const literacyMeta = { familyId: 'yards-to-go-read', concept: 'line-to-gain', purpose: 'coreReview', tier: 'within-10', grading: 'gate', evidenceClass: 'literacy' };
  const outcomes = {
    independentFirstTry: resolution('firstTryCorrect'),
    retry: resolution('retryCorrect'),
    secondMiss: resolution('secondMiss'),
    help: (({ correct, ...rest }) => ({ ...rest, kind: 'help', number: 2, support: 'worked' }))(baseEvent()),
    literacy: resolution('firstTryCorrect', literacyMeta),
    noStakes: resolution('firstTryCorrect', meta),
  };
  const axes = Object.values(outcomes).map(event => {
    assert.equal(outbox.validateEvent(event, fixture), true);
    return JSON.stringify([event.kind, event.grading, event.evidenceClass, event.resolution ?? event.support]);
  });
  assert.equal(new Set(axes).size, 6);
  assert.notEqual(outcomes.noStakes.grading, 'gate');
  assert.notEqual(outcomes.literacy.evidenceClass, 'independent');
});

test('without a valid hint, capture reads only the hint: no UUID, IndexedDB open, key or write', async () => {
  for (const value of [null, '{bad json', hint({ schemaVersion: 2 }), hint({ profileIds: [P1, P2], activeProfileId: null }),
    hint({ activeProfileId: P2 }), hint({ deviceId: 'device-1' }), hint({ extra: true })]) {
    const env = makeEnv();
    if (value !== null) env.storage.put(HINT, value);
    const before = env.storage.keys();
    const tab = openTab(env);
    assert.equal(tab.capture(), null, String(value));
    assert.equal(tab.record(tab.capture(), attempt(randomUUID())), false);
    await tab.idle();
    assert.deepEqual(env.storage.keys(), before);
    assert.equal(env.storage.writes.length, 0);
    assert.equal(env.idb.log.opens, 0, 'no IndexedDB open while disabled');
    assert.equal(env.idb.exists(DB), false);
    assert.equal(env.uuids.count, 0);
    if (value !== null) assert.equal(env.storage.raw(HINT), value);
    // Two profiles with no selection is a valid hint that records nothing. The read-only
    // snapshot then probes and finds no consent, creating nothing. Every other case is off.
    const unselected = value === hint({ profileIds: [P1, P2], activeProfileId: null });
    assert.deepEqual(plain(await tab.snapshot()), { state: unselected ? 'no-consent' : 'disabled' });
    assert.equal(env.idb.exists(DB), false, 'a snapshot never creates a database');
  }
  const env = makeEnv();
  enroll(env);
  assert.equal(openTab(env, { indexedDB: null }).capture(), null, 'no IndexedDB: nothing recorded');
  assert.equal(openTab(env, { crypto: {} }).capture(), null, 'no randomUUID: nothing recorded');
  env.storage.blockReads(true);
  assert.equal(openTab(env).capture(), null, 'unreadable storage: nothing recorded');
  assert.equal(env.idb.log.opens, 0);
});

test('a hint without a database or consent records nothing and never creates the database', async () => {
  const env = makeEnv();
  enroll(env, {}, { consent: false });
  const tab = openTab(env);
  assert.equal(tab.record(tab.capture(), attempt(randomUUID())), true);
  await tab.idle();
  assert.equal(env.idb.exists(DB), false);
  assert.equal(env.idb.log.opens, 0, 'the metadata-only databases() preflight never opens a missing database');
  assert.equal(tab.diagnostics().state, 'no-consent');
  assert.equal(tab.diagnostics().pendingWriteFailures, 0);
  // Without databases(), the fallback open aborts its upgrade and still creates nothing.
  const { databases, ...withoutList } = env.idb.factory;
  const fallback = openTab(env, { indexedDB: withoutList });
  assert.equal(fallback.record(fallback.capture(), attempt(randomUUID())), true);
  await fallback.idle();
  assert.equal(env.idb.log.opens, 1);
  assert.equal(env.idb.exists(DB), false, 'the fallback upgrade was aborted');
  assert.equal(fallback.diagnostics().state, 'no-consent');
  // A schema without the consent record (for example after another tab's Stop): still nothing.
  env.idb.seed(DB, STORE, {});
  assert.equal(tab.record(tab.capture(), attempt(randomUUID())), true);
  await tab.idle();
  assert.equal(outboxRaw(env), null);
  assert.equal(tab.diagnostics().counts.stored, 0);
});

test('one accepted action is one atomic transaction, and two tabs answering rapidly never share a seq', async () => {
  const env = makeEnv();
  enroll(env);
  const a = openTab(env), b = openTab(env);
  const qa = randomUUID(), qb = randomUUID();
  assert.equal(a.record(a.capture(), attempt(qa, 1, false)), true);
  assert.equal(a.record(a.capture(), football('help', { number: 2, support: 'guided' }, qa)), true);
  await a.idle();
  assert.equal(env.idb.log.transactions, 1, 'attempt plus help commit in one transaction');
  for (let index = 0; index < 60; index++) {
    a.record(a.capture(), attempt(qa, 2, true));
    b.record(b.capture(), attempt(qb, 1, index % 2 === 0));
    if (index % 7 === 0) await Promise.resolve();
  }
  await Promise.all([a.idle(), b.idle()]);
  const stored = envelope(env);
  assert.equal(stored.events.length, 122);
  assert.deepEqual(stored.events.map(event => event.seq), Array.from({ length: 122 }, (_, index) => index + 1));
  assert.equal(new Set(stored.events.map(event => event.eventId)).size, 122);
  assert.ok(stored.events.every(event => event.epochId === stored.status.epochId && event.deviceId === DEVICE && event.profileId === P1));
  assert.equal(stored.status.highestSeq, 122);
  assert.equal(a.validateEnvelope(stored), true);
  // Every event a tab's (bounded, last-8) commit trace reports as completed is stored, and
  // the stored count equals everything both tabs queued.
  const ids = new Set(stored.events.map(event => event.eventId));
  const completed = [...a.diagnostics().commits, ...b.diagnostics().commits].flatMap(commit => commit.eventIds);
  assert.ok(completed.length > 0 && completed.every(id => ids.has(id)));
  assert.equal(a.diagnostics().counts.queued + b.diagnostics().counts.queued, stored.events.length);
  assert.equal(a.diagnostics().counts.stored + b.diagnostics().counts.stored, stored.events.length);
});

test('a held readwrite transaction makes the other tab wait and then see its commit', async () => {
  const env = makeEnv();
  enroll(env);
  const a = openTab(env), b = openTab(env);
  let release;
  env.idb.faults.hold = new Promise(resolve => { release = resolve; });
  a.record(a.capture(), attempt(randomUUID()));
  await new Promise(resolve => setImmediate(resolve));
  b.record(b.capture(), attempt(randomUUID()));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(outboxRaw(env), null, 'neither batch is visible while the first transaction is held');
  release();
  await Promise.all([a.idle(), b.idle()]);
  const commits = [...a.diagnostics().commits, ...b.diagnostics().commits];
  assert.deepEqual(envelope(env).events.map(event => event.seq), [1, 2]);
  assert.deepEqual(plain(b.diagnostics().commits[0].read), { epochId: envelope(env).status.epochId, highestSeq: 1 });
  assert.equal(commits.length, 2);
});

test('an abort after a successful put keeps nothing: no event, seq or stored count', async () => {
  const env = makeEnv();
  enroll(env);
  const tab = openTab(env);
  await recordAttempts(tab, 1);
  const before = outboxRaw(env);
  env.idb.faults.abortAfterPut = 1;
  tab.record(tab.capture(), attempt(randomUUID()));
  await tab.idle();
  const after = envelope(env);
  assert.deepEqual(after.events, JSON.parse(before).events, 'the aborted put rolled back');
  assert.equal(after.status.highestSeq, 1);
  assert.equal(after.status.writeFailures, 1, 'one separate status-only transaction counted it');
  assert.equal(tab.diagnostics().counts.stored, 1);
});

test('failed transactions leave no orphan seq or event and count writeFailures where persistable', async () => {
  const env = makeEnv();
  enroll(env);
  const tab = openTab(env);
  const question = randomUUID();
  env.idb.faults.abortNext = 1;
  tab.record(tab.capture(), attempt(question));
  await tab.idle();
  assert.equal(outboxRaw(env), null, 'first transaction aborted: no envelope is created by the status path');
  assert.equal(tab.diagnostics().pendingWriteFailures, 1, 'counted in memory');
  tab.record(tab.capture(), attempt(question, 2, true));
  await tab.idle();
  let stored = envelope(env);
  assert.deepEqual(stored.events.map(event => [event.seq, event.number]), [[1, 2]]);
  assert.equal(stored.status.writeFailures, 1, 'pending count persisted with the next commit');
  // Event transaction aborts, status-only transaction completes: no event, no seq, one more failure.
  env.idb.faults.abortNext = 1;
  tab.record(tab.capture(), attempt(randomUUID()));
  await tab.idle();
  stored = envelope(env);
  assert.equal(stored.events.length, 1);
  assert.equal(stored.status.highestSeq, 1);
  assert.equal(stored.status.writeFailures, 2);
  // Both abort: counted in memory, then folded into the next commit.
  env.idb.faults.abortNext = 2;
  tab.record(tab.capture(), attempt(randomUUID()));
  await tab.idle();
  assert.equal(envelope(env).status.writeFailures, 2);
  assert.equal(tab.diagnostics().pendingWriteFailures, 1);
  tab.record(tab.capture(), attempt(randomUUID()));
  await tab.idle();
  stored = envelope(env);
  assert.deepEqual(stored.events.map(event => event.seq), [1, 2]);
  assert.equal(stored.status.writeFailures, 3);
  assert.equal(tab.diagnostics().pendingWriteFailures, 0);
  // A failed open is counted in memory; there is no localStorage fallback.
  const other = openTab(env);
  env.idb.faults.openError = 1;
  const transactions = env.idb.log.transactions;
  other.record(other.capture(), attempt(randomUUID()));
  await other.idle();
  assert.equal(env.idb.log.transactions, transactions);
  assert.equal(other.diagnostics().pendingWriteFailures, 1);
  assert.equal(env.storage.writes.length, 0);
});

test('quota exhaustion fails open and the status-only count still fits', async () => {
  const env = makeEnv();
  env.idb.faults.quotaChars = 2200;
  enroll(env);
  const tab = openTab(env);
  tab.record(tab.capture(), attempt(randomUUID()));
  await tab.idle();
  assert.ok(outboxRaw(env));
  tab.record(tab.capture(), attempt(randomUUID()));
  tab.record(tab.capture(), attempt(randomUUID()));
  await tab.idle();
  const stored = envelope(env);
  assert.equal(stored.events.length, 1, 'the over-quota batch is not kept');
  assert.equal(stored.status.highestSeq, 1);
  assert.equal(stored.status.writeFailures, 1);
});

test('the 500-event bound keeps the newest events and counts droppedLocal in the same transaction', async () => {
  const env = makeEnv();
  enroll(env);
  const tab = openTab(env);
  // Facts attempts are small enough that the event count bites before the code-unit bound.
  let nonce = 1, recorded = 0;
  while (recorded < 505) {
    for (let misses = 0; misses < 99 && recorded < 505; misses++, recorded++) {
      assert.equal(tab.recordFacts(tab.capture(), factsOp(progress(nonce, nonce - 1, misses, false, misses ? false : null), progress(nonce, nonce - 1, misses + 1, false, false), [factsAttempt(misses + 1, false)], { durable: false })), true);
    }
    nonce++;
  }
  await tab.idle();
  const stored = envelope(env);
  assert.equal(stored.events.length, 500);
  assert.equal(stored.status.droppedLocal, 5);
  assert.deepEqual([stored.events[0].seq, stored.events.at(-1).seq], [6, 505]);
  assert.ok(outboxRaw(env).length <= 262144);
});

test('the 262144 code-unit bound applies before the event count and keeps the newest events', async () => {
  const env = makeEnv();
  enroll(env);
  const tab = openTab(env);
  await recordAttempts(tab, 450, LONG_META);
  const raw = outboxRaw(env), stored = JSON.parse(raw);
  assert.ok(raw.length <= 262144, `${raw.length} code units`);
  assert.ok(stored.events.length < 500, `${stored.events.length} events`);
  assert.equal(stored.status.droppedLocal, 450 - stored.events.length);
  assert.ok(stored.status.droppedLocal > 0);
  assert.equal(stored.events.at(-1).seq, 450);
  assert.equal(stored.events[0].seq, 451 - stored.events.length);
});

test('newer-schema, malformed or foreign records are preserved byte-for-byte and pause every automatic path', async () => {
  const seedEnv = makeEnv();
  enroll(seedEnv);
  const writer = openTab(seedEnv);
  writer.record(writer.capture(), attempt(randomUUID()));
  await writer.idle();
  const current = envelope(seedEnv);
  const cases = {
    futureEnvelope: { outbox: JSON.stringify({ schemaVersion: 2, anything: ['opaque'] }), state: 'future' },
    futureStatus: { outbox: JSON.stringify({ ...current, status: { ...current.status, schemaVersion: 2, newField: 1 } }), state: 'future' },
    futureEvent: { outbox: JSON.stringify({ ...current, events: [{ ...current.events[0], schemaVersion: 2, newField: 'x' }] }), state: 'future' },
    malformedJson: { outbox: '{"schemaVersion":1,', state: 'malformed' },
    malformedCurrent: { outbox: JSON.stringify({ ...current, events: [{ ...current.events[0], seq: 99 }] }), state: 'malformed' },
    foreignGeneration: { outbox: JSON.stringify({ ...current, generation: randomUUID() }), state: 'foreign' },
    futureConsent: { consent: JSON.stringify({ schemaVersion: 2, opaque: true }), state: 'future' },
    malformedConsent: { consent: JSON.stringify({ schemaVersion: 1, generation: GENERATION, deviceId: DEVICE, profileIds: [P1], activeProfileId: P1 }), state: 'malformed' },
  };
  for (const [name, item] of Object.entries(cases)) {
    const env = makeEnv();
    enroll(env);
    if (item.outbox) putOutbox(env, item.outbox);
    if (item.consent) env.idb.poke(DB, STORE, 'enrollment', item.consent);
    const bytes = { outbox: outboxRaw(env), consent: consentRaw(env) };
    const tab = openTab(env);
    tab.record(tab.capture(), attempt(randomUUID()));
    await tab.idle();
    assert.deepEqual({ outbox: outboxRaw(env), consent: consentRaw(env) }, bytes, `${name}: append preserved`);
    assert.equal(tab.diagnostics().state, item.state, name);
    assert.equal((await tab.acknowledge([randomUUID()])).ok, false);
    assert.equal((await tab.startNewEpoch('seq-conflict')).ok, false);
    assert.deepEqual({ outbox: outboxRaw(env), consent: consentRaw(env) }, bytes, `${name}: maintenance preserved`);
    assert.equal(env.storage.writes.length, 0);
    // Explicit stop is the one intentional deletion path, without parsing.
    assert.deepEqual(plain(await tab.stop()), { ok: true });
    assert.deepEqual([outboxRaw(env), consentRaw(env), env.storage.raw(HINT)], [null, null, null]);
  }
});

test('a newer database version or unsupported layout pauses; explicit Stop deletes that opaque database', async () => {
  for (const layout of [{ version: 2, stores: [STORE] }, { version: 1, stores: [STORE, 'other'] }]) {
    const env = makeEnv();
    enroll(env);
    env.idb.seed(DB, STORE, { enrollment: consentRecord({ generation: GENERATION, deviceId: DEVICE, profileIds: [P1] }), outbox: 'opaque future bytes' }, layout);
    const tab = openTab(env);
    tab.record(tab.capture(), attempt(randomUUID()));
    await tab.idle();
    assert.equal(tab.diagnostics().state, 'future', JSON.stringify(layout));
    // A newer version is classified from metadata alone; an unsupported v1 layout needs one open.
    assert.equal(env.idb.log.opens, layout.version > 1 ? 0 : 1);
    assert.equal(outboxRaw(env), 'opaque future bytes');
    assert.equal(env.idb.version(DB), layout.version);
    assert.equal(tab.diagnostics().pendingWriteFailures, 0, 'a pause is not a write failure');
    assert.deepEqual(plain(await tab.stop()), { ok: true });
    assert.equal(env.idb.exists(DB), false, 'Stop deleted the owned opaque database');
    assert.equal(env.storage.raw(HINT), null);
    // Nothing recreates it automatically afterwards.
    tab.record(tab.capture(), attempt(randomUUID()));
    await tab.idle();
    assert.equal(env.idb.exists(DB), false);
  }
});

test('a legacy localStorage outbox key is preserved and pauses recording; only Stop removes it', async () => {
  const env = makeEnv();
  enroll(env);
  env.storage.put(LEGACY, '{"schemaVersion":9,"legacy":true}');
  const tab = openTab(env);
  assert.equal(tab.capture(), null);
  assert.equal(tab.diagnostics().state, 'legacy');
  assert.equal(env.storage.raw(LEGACY), '{"schemaVersion":9,"legacy":true}');
  assert.equal(outboxRaw(env), null, 'nothing migrated');
  assert.deepEqual(plain(await tab.stop()), { ok: true });
  assert.equal(env.storage.raw(LEGACY), null);
});

test('restored events keep their IDs, a known rewind and a seq conflict start new epochs, and ack never renumbers', async () => {
  const env = makeEnv();
  enroll(env);
  const tab = openTab(env);
  await recordAttempts(tab, 3);
  const snapshotBytes = outboxRaw(env), snapshot = JSON.parse(snapshotBytes);
  await recordAttempts(tab, 2);
  const later = envelope(env);
  assert.equal(later.status.highestSeq, 5);
  // Restore the older snapshot: the counters rewind.
  putOutbox(env, snapshotBytes);
  await recordAttempts(tab, 1);
  let stored = envelope(env);
  assert.notEqual(stored.status.epochId, snapshot.status.epochId, 'a known rewind rotates before allocating');
  assert.deepEqual(stored.events.slice(0, 3), snapshot.events, 'restored events keep eventId, payload and seq');
  assert.deepEqual([stored.events[3].epochId, stored.events[3].seq], [stored.status.epochId, 1]);
  const oldSlots = new Map(later.events.map(event => [`${event.epochId}:${event.seq}`, event.eventId]));
  for (const event of stored.events) {
    const prior = oldSlots.get(`${event.epochId}:${event.seq}`);
    if (prior) assert.equal(prior, event.eventId, 'no seq is knowingly reused for another event');
  }
  // A simulated server conflict starts a new epoch for new allocations only.
  const conflict = await tab.startNewEpoch('seq-conflict');
  assert.equal(conflict.ok, true);
  stored = envelope(env);
  assert.equal(stored.status.epochId, conflict.epochId);
  assert.equal(stored.events.length, 4);
  await recordAttempts(tab, 1);
  stored = envelope(env);
  assert.deepEqual([stored.events[4].epochId, stored.events[4].seq], [conflict.epochId, 1]);
  // Ack removes by exact eventId and never renumbers.
  const keep = stored.events.slice(1);
  assert.deepEqual(plain(await tab.acknowledge([stored.events[0].eventId, randomUUID()])), { ok: true, removed: 1 });
  assert.deepEqual(envelope(env).events, keep);
  assert.deepEqual(plain(await tab.rejectDeleted([keep[0].eventId])), { ok: true, removed: 1 });
  assert.deepEqual(envelope(env).events, keep.slice(1));
  assert.deepEqual(plain(await tab.acknowledge(['not-a-uuid'])), { ok: false, reason: 'invalid-ids' });
  assert.deepEqual(plain(await tab.startNewEpoch('because')), { ok: false, reason: 'invalid-reason' });
  // Replaying an unchanged envelope through another tab keeps every eventId.
  const ids = envelope(env).events.map(event => event.eventId);
  const other = openTab(env);
  await recordAttempts(other, 1);
  assert.deepEqual(envelope(env).events.slice(0, ids.length).map(event => event.eventId), ids);
});

test('Stop deletes consent and outbox transactionally; stale hints and queued items in other tabs never revive', async () => {
  const env = makeEnv();
  enroll(env);
  const a = openTab(env), b = openTab(env);
  await recordAttempts(a, 2);
  const firstEpoch = envelope(env).status.epochId;
  // Same tab: an item captured before stop is dropped.
  a.record(a.capture(), attempt(randomUUID()));
  const stopped = a.stop();
  await a.idle();
  assert.deepEqual(plain(await stopped), { ok: true });
  assert.deepEqual([outboxRaw(env), consentRaw(env), env.storage.raw(HINT)], [null, null, null]);
  assert.equal(env.idb.exists(DB), true, 'an empty supported schema may remain; it holds no reporting state');
  // Other tab still holding a stale hint, with its item queued behind a held transaction.
  env.storage.put(HINT, hint());
  let release;
  env.idb.faults.hold = new Promise(resolve => { release = resolve; });
  b.record(b.capture(), attempt(randomUUID()));
  await new Promise(resolve => setImmediate(resolve));
  release();
  await b.idle();
  assert.equal(outboxRaw(env), null, 'no consent, so no revival');
  assert.equal(b.diagnostics().state, 'no-consent');
  // Many stop/re-enroll cycles: no bounded list can be bypassed, because consent is authoritative.
  const generations = [];
  for (let cycle = 0; cycle < 20; cycle++) {
    const generation = randomUUID();
    generations.push(generation);
    enroll(env, { generation });
    await recordAttempts(a, 1);
    assert.deepEqual(plain(await a.stop()), { ok: true });
  }
  for (const generation of generations) {
    env.storage.put(HINT, hint({ generation }));
    b.record(b.capture(), attempt(randomUUID()));
  }
  await b.idle();
  assert.equal(outboxRaw(env), null);
  // A genuinely new enrollment starts a new epoch; an old-generation capture is dropped.
  enroll(env);
  const stale = b.capture();
  const generation = randomUUID();
  enroll(env, { generation });
  b.record(stale, attempt(randomUUID()));
  await b.idle();
  assert.equal(outboxRaw(env), null, 'old generation dropped');
  await recordAttempts(b, 1);
  const stored = envelope(env);
  assert.equal(stored.generation, generation);
  assert.notEqual(stored.status.epochId, firstEpoch);
  assert.deepEqual(stored.events.map(event => event.seq), [1]);
});

test('a failed Stop stays halted on the same persisted consent, and a blocked deletion stays honestly pending', async () => {
  // The delete transaction aborts: consent remains, this document never resumes it.
  let env = makeEnv();
  enroll(env);
  let tab = openTab(env);
  await recordAttempts(tab, 1);
  const bytes = outboxRaw(env);
  env.idb.faults.abortNext = 1;
  assert.deepEqual(plain(await tab.stop()), { ok: false, reason: 'delete-failed' });
  assert.ok(consentRaw(env), 'consent still persisted');
  assert.equal(tab.capture(), null);
  assert.deepEqual(plain(await tab.snapshot()), { state: 'stopped' });
  assert.deepEqual(plain(await tab.acknowledge([JSON.parse(bytes).events[0].eventId])), { ok: false, reason: 'stopped' });
  assert.equal(outboxRaw(env), bytes);
  assert.deepEqual(plain(await tab.stop()), { ok: true });
  enroll(env, { generation: randomUUID() });
  await recordAttempts(tab, 1);
  assert.deepEqual(envelope(env).events.map(event => event.seq), [1]);
  // IndexedDB unavailable: Stop reports failure honestly and removes the owned hint.
  env = makeEnv();
  enroll(env);
  tab = openTab(env, { indexedDB: null });
  assert.deepEqual(plain(await tab.stop()), { ok: false, reason: 'unavailable' });
  assert.equal(env.storage.raw(HINT), null);
  // A future database whose deletion is blocked by another open connection. A failure
  // counted in memory beforehand must be cleared when the late deletion succeeds.
  env = makeEnv();
  enroll(env);
  tab = openTab(env);
  env.idb.faults.abortNext = 1;
  tab.record(tab.capture(), attempt(randomUUID()));
  await tab.idle();
  assert.equal(tab.diagnostics().pendingWriteFailures, 1);
  env.idb.seed(DB, STORE, { outbox: 'future' }, { version: 3 });
  const holder = await new Promise(resolve => { const request = env.idb.factory.open(DB); request.onsuccess = () => resolve(request.result); });
  holder.onversionchange = () => {}; // another tab that does not close yet
  assert.deepEqual(plain(await tab.stop()), { ok: false, reason: 'blocked', pending: true });
  assert.equal(tab.diagnostics().pendingWriteFailures, 1, 'not cleared while the deletion is only pending');
  assert.equal(tab.deletionPending(), true);
  assert.equal(tab.capture(), null, 'no capture while deletion is pending');
  assert.deepEqual(plain(await tab.snapshot()), { state: 'stopping' });
  assert.deepEqual(plain(await tab.stop()), { ok: false, reason: 'pending', pending: true });
  assert.equal(env.idb.exists(DB), true);
  holder.close();
  await settle(() => !tab.deletionPending());
  assert.equal(tab.deletionPending(), false);
  assert.equal(env.idb.exists(DB), false, 'the live request completed once unblocked');
  assert.equal(env.storage.raw(HINT), null);
  assert.equal(tab.diagnostics().state, 'stopped');
  assert.equal(tab.diagnostics().pendingWriteFailures, 0, 'late success cleans up like an ordinary Stop');
});

test('a Stop whose hint removal fails still reports the authority gone, honestly, and nothing revives', async () => {
  const env = makeEnv();
  enroll(env);
  const tab = openTab(env), other = openTab(env);
  await recordAttempts(tab, 1);
  env.storage.blockRemoves(true);
  assert.deepEqual(plain(await tab.stop()), { ok: true, hintRemoved: false });
  env.storage.blockRemoves(false);
  assert.deepEqual([outboxRaw(env), consentRaw(env)], [null, null]);
  assert.equal(env.storage.raw(HINT), hint(), 'the leftover hint is disclosed, not claimed removed');
  assert.equal(tab.capture(), null, 'this document stays halted');
  // Another tab acting on the leftover hint finds no consent.
  other.record(other.capture(), attempt(randomUUID()));
  await other.idle();
  assert.equal(outboxRaw(env), null);
  assert.equal(other.diagnostics().state, 'no-consent');
});

test('snapshot applies the mutation path coherence: stale hint, foreign envelope and legacy key never read as ok', async () => {
  const env = makeEnv();
  enroll(env);
  const writer = openTab(env);
  await recordAttempts(writer, 1);
  assert.equal(plain(await openTab(env).snapshot()).state, 'ok');
  // Foreign envelope (another generation).
  const current = envelope(env);
  putOutbox(env, JSON.stringify({ ...current, generation: randomUUID() }));
  assert.deepEqual(plain(await openTab(env).snapshot()), { state: 'foreign' });
  putOutbox(env, JSON.stringify(current));
  // Stale hint: consent now belongs to another generation.
  env.idb.poke(DB, STORE, 'enrollment', consentRecord({ generation: randomUUID(), deviceId: DEVICE, profileIds: [P1] }));
  assert.deepEqual(plain(await openTab(env).snapshot()), { state: 'revoked' });
  // Legacy localStorage outbox key pauses the read path too, without reading IndexedDB.
  enroll(env);
  env.storage.put(LEGACY, 'legacy bytes');
  const opens = env.idb.log.opens;
  assert.deepEqual(plain(await openTab(env).snapshot()), { state: 'legacy' });
  assert.equal(env.idb.log.opens, opens);
});

test('a version change from another document closes this connection; the next batch finds no consent', async () => {
  const env = makeEnv();
  enroll(env);
  const tab = openTab(env);
  await recordAttempts(tab, 1);
  assert.equal(env.idb.openConnections(DB), 1);
  await new Promise(resolve => { const request = env.idb.factory.deleteDatabase(DB); request.onsuccess = resolve; });
  assert.equal(env.idb.exists(DB), false);
  tab.record(tab.capture(), attempt(randomUUID()));
  await tab.idle();
  assert.equal(env.idb.exists(DB), false, 'never recreated');
  assert.equal(tab.diagnostics().state, 'no-consent');
});

test('a seq observed through a read-only snapshot makes a later restored rewind known', async () => {
  const env = makeEnv();
  enroll(env);
  const writer = openTab(env), reader = openTab(env);
  await recordAttempts(writer, 2);
  const older = outboxRaw(env);
  await recordAttempts(writer, 3);
  const observed = plain(await reader.snapshot());
  assert.equal(observed.state, 'ok');
  assert.equal(observed.envelope.status.highestSeq, 5);
  const current = outboxRaw(env);
  await reader.snapshot();
  assert.equal(outboxRaw(env), current, 'snapshot never writes');
  // Restore the older envelope; the reader never wrote seq 3..5 but saw them.
  putOutbox(env, older);
  await recordAttempts(reader, 1);
  const stored = envelope(env);
  const epoch = JSON.parse(older).status.epochId;
  assert.notEqual(stored.status.epochId, epoch);
  assert.deepEqual(stored.events.at(-1).seq, 1);
  assert.ok(stored.events.every(event => event.epochId !== epoch || event.seq <= 2), 'no observed seq is knowingly reused');
});

test('profile attribution is captured at acceptance; the consent fences unassigned profiles without re-attributing', async () => {
  const env = makeEnv();
  enroll(env, { profileIds: [P1, P2], activeProfileId: P1 });
  const tab = openTab(env);
  tab.record(tab.capture(), attempt(randomUUID()));
  // A normal switch before the transaction runs does not re-attribute the captured event.
  enroll(env, { profileIds: [P1, P2], activeProfileId: P2 });
  await tab.idle();
  tab.record(tab.capture(), attempt(randomUUID()));
  await tab.idle();
  enroll(env, { profileIds: [P1, P2], activeProfileId: null });
  assert.equal(tab.capture(), null, 'two profiles and no selection records nothing');
  assert.deepEqual(envelope(env).events.map(event => event.profileId), [P1, P2]);
  // The consent no longer assigns P1: its captured item is dropped, never re-attributed.
  enroll(env, { profileIds: [P1, P2], activeProfileId: P1 });
  const captured = tab.capture();
  env.idb.poke(DB, STORE, 'enrollment', consentRecord({ generation: GENERATION, deviceId: DEVICE, profileIds: [P2] }));
  tab.record(captured, attempt(randomUUID()));
  await tab.idle();
  assert.deepEqual(envelope(env).events.map(event => event.profileId), [P1, P2]);
  assert.equal(tab.diagnostics().state, 'revoked');
});

test('Football and Facts observations from different tabs share one valid envelope and unique seq', async () => {
  const env = makeEnv();
  enroll(env);
  const footballTab = openTab(env), factsTab = openTab(env);
  for (let index = 0; index < 10; index++) {
    footballTab.record(footballTab.capture(), attempt(randomUUID()));
    factsTab.recordFacts(factsTab.capture(), factsOp(progress(index + 1, index), progress(index + 1, index, 1, false, false), [factsAttempt(1, false)]));
  }
  await Promise.all([footballTab.idle(), factsTab.idle()]);
  const stored = envelope(env);
  assert.equal(footballTab.validateEnvelope(stored), true);
  assert.deepEqual(stored.events.map(event => event.seq), Array.from({ length: 20 }, (_, index) => index + 1));
  assert.deepEqual([stored.events.filter(event => event.game === 'football').length, stored.events.filter(event => event.game === 'facts').length], [10, 10]);
});

test('Football templates outside the allowlist or catalog are never queued', async () => {
  const env = makeEnv();
  enroll(env);
  const tab = openTab(env);
  const question = randomUUID();
  for (const template of [
    { ...attempt(question), elapsedMs: 800 },
    { ...attempt(question), prompt: 'secret prompt' },
    { ...attempt(question), purpose: 'coreReview' },
    { ...attempt(question), familyId: 'unknown' },
    { ...attempt(question), game: 'facts' },
    { ...attempt(question), questionInstanceId: 'question-1' },
  ]) assert.equal(tab.record(tab.capture(), template), false);
  await tab.idle();
  assert.equal(outboxRaw(env), null);
});

test('Facts links resume only strict forward-matching persisted attempts; memory sessions stay isolated', async () => {
  const env = makeEnv();
  enroll(env);
  const a = openTab(env);
  // Tab A records a miss on nonce 4: the durable link is created.
  a.recordFacts(a.capture(), factsOp(progress(4, 3), progress(4, 3, 1, false, false), [factsAttempt(1, false)]));
  await a.idle();
  let stored = envelope(env);
  const linked = stored.events[0].questionInstanceId;
  assert.deepEqual(stored.links.facts, { questionInstanceId: linked, nonce: 4, factId: 'add:7:6', serial: 3, misses: 1, helped: false, firstCorrect: false });
  // A reloaded tab whose attempt came from the normalized save resumes the same ID.
  const reloaded = openTab(env);
  reloaded.recordFacts(reloaded.capture(), factsOp(progress(4, 3, 1, false, false), progress(4, 3, 2, true, false),
    [factsAttempt(2, false), { kind: 'help', fields: { ...FACT, number: 3, helped: true } }], { adoptable: true }));
  await reloaded.idle();
  stored = envelope(env);
  assert.deepEqual(stored.events.slice(1).map(event => [event.kind, event.questionInstanceId]), [['attempt', linked], ['help', linked]]);
  assert.equal(stored.links.facts.misses, 2);
  // A fresh create() model with the same nonce/fact/serial has zero progress: never adopted.
  const fresh = openTab(env);
  fresh.recordFacts(fresh.capture(), factsOp(progress(4, 3), progress(4, 3, 1, false, false), [factsAttempt(1, false)], { adoptable: true }));
  await fresh.idle();
  stored = envelope(env);
  assert.notEqual(stored.events[3].questionInstanceId, linked);
  assert.equal(stored.links.facts.questionInstanceId, linked, 'a backward capture never rewinds the link');
  assert.equal(stored.links.facts.misses, 2);
  // A non-restored tab never adopts even a forward match.
  const notRestored = openTab(env);
  notRestored.recordFacts(notRestored.capture(), factsOp(progress(4, 3, 2, true, false), progress(4, 3, 3, true, false), [factsAttempt(3, false, true)]));
  await notRestored.idle();
  assert.notEqual(envelope(env).events[4].questionInstanceId, linked);
  // A memory session with the same key never reads, writes or replaces the durable link.
  const linksBefore = envelope(env).links;
  const memory = openTab(env);
  memory.recordFacts(memory.capture(), factsOp(progress(4, 3, 2, true, false), progress(4, 3, 3, true, false), [factsAttempt(3, false, true)], { durable: false, adoptable: true }));
  await memory.idle();
  stored = envelope(env);
  assert.notEqual(stored.events[5].questionInstanceId, linked);
  assert.deepEqual(stored.links, linksBefore);
  // The resumed tab resolves: the link retires and its key is recorded.
  reloaded.recordFacts(reloaded.capture(), factsOp(progress(4, 3, 2, true, false), progress(4, 3, 2, true, false, true),
    [factsAttempt(3, true, true), { kind: 'resolution', fields: { ...FACT, outcome: 'shown', eligibleCheck: false, timingMs: null, helped: true } }]));
  await reloaded.idle();
  stored = envelope(env);
  assert.deepEqual(stored.events.slice(-2).map(event => event.questionInstanceId), [linked, linked]);
  assert.deepEqual([stored.links.facts, stored.links.factsRetired], [null, { nonce: 4, factId: 'add:7:6', serial: 3 }]);
  // A delayed observation of the retired key can neither recreate nor resolve the link.
  a.recordFacts(a.capture(), factsOp(progress(4, 3, 1, false, false), progress(4, 3, 2, true, false), [factsAttempt(2, false)], { adoptable: true }));
  await a.idle();
  stored = envelope(env);
  assert.equal(stored.links.facts, null);
  assert.notEqual(stored.events.at(-1).questionInstanceId, linked);
  assert.equal(a.validateEnvelope(stored), true);
});

test('Facts leaves are emitted only for a linked attempt, and an unlinked replacement writes nothing', async () => {
  const env = makeEnv();
  enroll(env);
  const tab = openTab(env);
  tab.recordFacts(tab.capture(), leaveOp(progress(7, 2, 1, false, false), { adoptable: true }));
  await tab.idle();
  assert.equal(outboxRaw(env), null, 'unknown, never an invented leave');
  tab.recordFacts(tab.capture(), factsOp(progress(8, 2), progress(8, 2, 1, false, false), [factsAttempt(1, false)]));
  await tab.idle();
  const question = envelope(env).events[0].questionInstanceId;
  tab.recordFacts(tab.capture(), leaveOp(progress(8, 2, 1, false, false)));
  await tab.idle();
  const stored = envelope(env);
  assert.deepEqual(stored.events.map(event => [event.kind, event.questionInstanceId]), [['attempt', question], ['leftUnfinished', question]]);
  assert.deepEqual(Object.keys(stored.events[1]).slice(11), ['factId', 'family']);
  assert.deepEqual([stored.links.facts, stored.links.factsRetired], [null, { nonce: 8, factId: 'add:7:6', serial: 2 }]);
  // recordFacts rejects malformed operations instead of repairing them.
  for (const bad of [
    { ...leaveOp(progress(9, 2)), observations: [] },
    factsOp(progress(9, 2, 0, false, null, true), progress(9, 2, 0, false, true, true), [factsAttempt(1, true)]),
    factsOp(progress(9, 2), progress(9, 2, 1), [{ kind: 'attempt', fields: { ...FACT, number: 1, correct: false, helped: false, timingMs: null } }]),
    factsOp(progress(9, 2), progress(9, 2, 1), [{ kind: 'attempt', fields: { ...FACT, family: 'family:1:1:2', number: 1, correct: false, helped: false } }]),
  ]) assert.equal(tab.recordFacts(tab.capture(), bad), false);
});
