// #200 client domain checks. Each "tab" is a VM context running the unchanged
// shared/learning-outbox.js and shared/learning-sync.js against one shared localStorage
// and one fake IndexedDB (tests/learning-outbox-fixture.mjs; orchestration only, NOT
// evidence of real IndexedDB behavior, which the browser specs exercise). The transport
// is a stub for a loopback service origin; nothing leaves the process.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { consentRecord, createFakeIndexedDB } from './learning-outbox-fixture.mjs';

const OUTBOX = await readFile(new URL('../shared/learning-outbox.js', import.meta.url), 'utf8');
const SYNC = await readFile(new URL('../shared/learning-sync.js', import.meta.url), 'utf8');
const ORIGIN = 'http://127.0.0.1:8199';
const DB = 'learningReporting', STORE = 'records', HINT = 'learningReporting:enrollment:v1';
const META = Object.freeze({ familyId: 'line-to-gain-exact', concept: 'line-to-gain', purpose: 'weakSpot', tier: 'within-10', grading: 'gate', evidenceClass: 'independent' });
const token = (installation = 'ab'.repeat(16)) => `lr1_${installation}_${randomBytes(32).toString('base64url')}`;
const plain = value => JSON.parse(JSON.stringify(value));

function makeStorage() {
  const values = new Map(), failing = new Set();
  return {
    getItem: key => (values.has(key) ? values.get(key) : null),
    // `failSet(key)` makes setItem for that key throw, as a refused browser write would.
    setItem: (key, value) => { if (failing.has(key)) throw new Error('setItem refused'); values.set(key, String(value)); },
    removeItem: key => values.delete(key), raw: key => values.get(key) ?? null,
    failSet: (key, on = true) => (on ? failing.add(key) : failing.delete(key)),
  };
}
function makeEnv() {
  return { storage: makeStorage(), idb: createFakeIndexedDB(), timers: [], requests: [], respond: null };
}
function openTab(env, { serviceUrl = ORIGIN } = {}) {
  const session = makeStorage();
  const globals = {
    localStorage: env.storage, sessionStorage: session, crypto: { randomUUID, getRandomValues: array => { array.set(randomBytes(array.length)); return array; } },
    indexedDB: env.idb.factory, navigator: { onLine: true }, TextEncoder, AbortController, Date, Promise, JSON, Math, console,
    LEARNING_REPORTING_CONFIG: Object.freeze({ serviceUrl }),
    setTimeout: (fn, ms) => { env.timers.push({ fn, ms }); return env.timers.length; }, clearTimeout: () => {},
    addEventListener: () => {}, document: { readyState: 'complete', visibilityState: 'visible', addEventListener: () => {} },
    fetch: async (url, init) => { env.requests.push({ url, init, body: JSON.parse(init.body) }); return env.respond(url, init, JSON.parse(init.body)); },
  };
  const context = vm.createContext(globals);
  vm.runInContext(OUTBOX, context, { filename: 'learning-outbox.js' });
  vm.runInContext(SYNC, context, { filename: 'learning-sync.js' });
  return { O: context.LEARNING_OUTBOX, S: context.LEARNING_SYNC, session };
}
const reply = (status, body) => ({ status, json: async () => body });
const enrollReply = (profileIds, deviceId = randomUUID(), tok = token()) => reply(200, { schemaVersion: 1, token: tok, deviceId, profileIds });
async function enroll(env, tab, profileIds = [randomUUID()]) {
  const tok = token();
  env.respond = () => enrollReply(profileIds, randomUUID(), tok);
  const result = await tab.S.enroll('0123-4567-89AB-CDEF-GHJK-MNPQ-RS');
  assert.equal(result.ok, true, JSON.stringify(result));
  return { token: tok, profileIds };
}
const attempt = qid => ({ game: 'football', gameVersion: '1.34.22', kind: 'attempt', questionInstanceId: qid, ...META, number: 1, correct: true, support: 'initial' });
async function record(tab, count, profileId) {
  for (let i = 0; i < count; i++) assert.equal(tab.O.record(tab.O.capture(profileId), attempt(randomUUID())), true);
  await tab.O.idle();
}
const envelope = env => JSON.parse(env.idb.peek(DB, STORE, 'outbox'));
const syncRecord = env => JSON.parse(env.idb.peek(DB, STORE, 'sync'));
const accepting = (pick = () => 'accepted') => (url, init, body) => reply(200, { schemaVersion: 1, results: body.events.map((event, index) => ({ eventId: event.eventId, outcome: pick(event, index) })) });

test('default off: with no service origin nothing reads storage, opens IndexedDB, sets a timer or requests', async () => {
  const env = makeEnv();
  let reads = 0;
  const counting = { ...env.storage, getItem: key => { reads++; return env.storage.getItem(key); } };
  const tab = openTab({ ...env, storage: counting }, { serviceUrl: '' });
  assert.equal(reads, 0);
  assert.deepEqual([env.timers.length, env.requests.length, env.idb.log.opens], [0, 0, 0]);
  assert.equal(tab.S.players(), null);
  assert.deepEqual(plain(await tab.S.enroll('0'.repeat(26))), { ok: false, reason: 'not-configured' });
  assert.equal(env.idb.log.opens, 0);
  // Configured but not enrolled: one hint read, then nothing.
  const env2 = makeEnv();
  openTab(env2);
  assert.deepEqual([env2.timers.length, env2.requests.length, env2.idb.log.opens], [0, 0, 0]);
});

test('enrollment installs consent, credential and sync state in one transaction, writes the hint last, and refuses a second install', async () => {
  const env = makeEnv(), tab = openTab(env);
  const { token: tok, profileIds } = await enroll(env, tab);
  assert.equal(env.requests[0].url, `${ORIGIN}/v1/enroll`);
  assert.equal(env.requests[0].init.credentials, 'omit');
  assert.equal(env.requests[0].init.headers.Authorization, undefined);
  const consent = JSON.parse(env.idb.peek(DB, STORE, 'enrollment')), credential = JSON.parse(env.idb.peek(DB, STORE, 'credential'));
  assert.deepEqual(consent.profileIds, profileIds);
  assert.deepEqual([credential.generation, credential.token, credential.serviceOrigin], [consent.generation, tok, ORIGIN]);
  assert.equal(JSON.parse(env.storage.raw(HINT)).generation, consent.generation);
  assert.equal(env.idb.peek(DB, STORE, 'outbox'), null, 'the recorder creates the outbox lazily');
  assert.deepEqual(plain(await tab.S.enroll('0'.repeat(26))), { ok: false, reason: 'already-enrolled' });
  // A consent-only #199 fixture is never uploaded: no credential, no request.
  const old = makeEnv(), dormant = openTab(old);
  const fixture = { generation: randomUUID(), deviceId: randomUUID(), profileIds: [randomUUID()] };
  old.idb.seed(DB, STORE, { enrollment: consentRecord(fixture) });
  old.storage.setItem(HINT, JSON.stringify({ schemaVersion: 1, ...fixture, activeProfileId: null }));
  await record(dormant, 2);
  assert.equal(plain(await dormant.O.syncView()).state, 'no-credential');
  old.respond = accepting();
  await dormant.S.syncNow();
  assert.equal(old.requests.length, 0);
});

test('a sync removes only acknowledged or deleted IDs; refused events stay queued but suppressed, and later events are not starved', async () => {
  const env = makeEnv(), tab = openTab(env);
  const { token: tok } = await enroll(env, tab);
  await record(tab, 25);
  const ids = envelope(env).events.map(event => event.eventId);
  const verdict = { [ids[0]]: 'deleted', [ids[1]]: 'invalid', [ids[2]]: 'conflict', [ids[3]]: 'unassigned' };
  env.respond = accepting(event => verdict[event.eventId] ?? 'accepted');
  await tab.S.syncNow();
  // requests[0] is the enrollment exchange, which never carries a credential.
  assert.equal(env.requests[0].url, `${ORIGIN}/v1/enroll`);
  assert.equal(env.requests[0].init.headers.Authorization, undefined);
  const syncs = env.requests.filter(request => request.url === `${ORIGIN}/v1/sync`);
  assert.equal(syncs.length + 1, env.requests.length, 'only the enroll and sync endpoints are contacted');
  assert.ok(syncs.length >= 2);
  for (const request of syncs) {
    assert.equal(request.init.headers.Authorization, `Bearer ${tok}`, 'credential only in the header');
    assert.equal(request.url.includes(tok) || request.init.body.includes(tok), false, 'never in the URL or body');
    assert.deepEqual([request.init.credentials, request.init.method], ['omit', 'POST']);
  }
  assert.ok(syncs[0].body.events.length <= 20 && syncs[0].body.events.map(event => event.seq).every((seq, i, all) => i === 0 || seq > all[i - 1]), 'seq order');
  const left = envelope(env).events.map(event => event.eventId);
  assert.deepEqual(left, ids.slice(1, 4), 'only refused events remain; the second batch carried the rest');
  assert.deepEqual(syncRecord(env).suppressed.map(item => item.reason), ['invalid', 'conflict', 'unassigned']);
  // New events still sync past the suppressed ones.
  await record(tab, 2);
  env.requests.length = 0;
  await tab.S.syncNow();
  assert.deepEqual(env.requests[0].body.events.map(event => event.eventId).filter(id => left.includes(id)), [], 'suppressed events are not resent');
  assert.deepEqual(envelope(env).events.map(event => event.eventId), left);
  assert.ok(syncRecord(env).lastSuccessAt);
});

test('a seq conflict in the current epoch rotates once; an old epoch conflict does not; a delayed duplicate response cannot rotate again', async () => {
  const env = makeEnv(), tab = openTab(env);
  await enroll(env, tab);
  await record(tab, 2);
  const before = envelope(env).status.epochId;
  env.respond = accepting((event, index) => (index === 0 ? 'seq-conflict' : 'accepted'));
  await tab.S.syncNow();
  const rotated = envelope(env).status.epochId;
  assert.notEqual(rotated, before);
  assert.equal(envelope(env).status.highestSeq, 0);
  const view = plain(await tab.O.syncView());
  const expected = { generation: view.generation, deviceId: view.deviceId, token: view.token };
  const replay = await tab.O.applySync(expected, { submitted: [], remove: [], suppress: [], rotateEpoch: before, syncedAt: null, notice: null });
  assert.equal(replay.rotated, false);
  assert.equal(envelope(env).status.epochId, rotated);
});

test('receipts that name other events, extra IDs, malformed bodies, failures and timeouts remove nothing', async () => {
  const env = makeEnv(), tab = openTab(env);
  await enroll(env, tab);
  await record(tab, 3);
  const bytes = env.idb.peek(DB, STORE, 'outbox');
  for (const respond of [
    () => reply(200, { schemaVersion: 1, results: [{ eventId: randomUUID(), outcome: 'accepted' }] }),
    (url, init, body) => reply(200, { schemaVersion: 1, results: [...body.events, { eventId: randomUUID() }].map(event => ({ eventId: event.eventId, outcome: 'accepted' })) }),
    () => reply(200, { results: [] }),
    () => reply(500, { error: 'x' }),
    () => reply(503, { error: 'unavailable' }),
    () => { throw new TypeError('offline'); },
  ]) {
    env.respond = respond;
    await tab.S.syncNow();
    assert.equal(env.idb.peek(DB, STORE, 'outbox'), bytes);
  }
  // A hung request: the deadline aborts it and nothing changes.
  env.respond = (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const firstTimer = env.timers.length;
  const pending = tab.S.syncNow();
  const deadline = () => env.timers.slice(firstTimer).find(item => item.ms === 20000);
  for (let i = 0; i < 100 && !deadline(); i++) await new Promise(resolve => setImmediate(resolve));
  deadline().fn();
  await pending;
  assert.equal(env.idb.peek(DB, STORE, 'outbox'), bytes);
  assert.equal(tab.S.diagnostics().trace.at(-1).outcome, 'timeout');
});

test('an unrecognized credential keeps the queue and shows a notice; a proven revocation clears exactly that enrollment', async () => {
  const env = makeEnv(), tab = openTab(env);
  await enroll(env, tab);
  await record(tab, 2);
  const bytes = env.idb.peek(DB, STORE, 'outbox');
  env.respond = () => reply(401, { error: 'invalid-credential' });
  await tab.S.syncNow();
  assert.equal(env.idb.peek(DB, STORE, 'outbox'), bytes);
  assert.equal(syncRecord(env).notice, 'credential-not-recognized');
  assert.equal(plain(await tab.S.health()).notice, 'credential-not-recognized');
  env.respond = () => reply(403, { error: 'revoked' });
  await tab.S.syncNow();
  for (const key of ['enrollment', 'outbox', 'credential', 'sync', 'binding']) assert.equal(env.idb.peek(DB, STORE, key), null, key);
  assert.equal(env.storage.raw(HINT), null);
  assert.equal(tab.O.capture(), null);
});

test('a delayed response or revocation for an old enrollment never touches a new one (Stop, re-enroll, then release)', async () => {
  const env = makeEnv(), tab = openTab(env);
  await enroll(env, tab);
  await record(tab, 2);
  let release;
  env.respond = () => new Promise(resolve => { release = resolve; });
  const oldView = plain(await tab.O.syncView());
  const oldExpected = { generation: oldView.generation, deviceId: oldView.deviceId, token: oldView.token };
  const pending = tab.S.syncNow();
  for (let i = 0; i < 100 && !release; i++) await new Promise(resolve => setImmediate(resolve));
  const oldBody = env.requests.at(-1).body;
  assert.deepEqual(plain(await tab.S.stopThisDevice()), { ok: true });
  const other = openTab(env);
  await enroll(env, other);
  await record(other, 1);
  const fresh = env.idb.peek(DB, STORE, 'outbox');
  release(reply(200, { schemaVersion: 1, results: oldBody.events.map(event => ({ eventId: event.eventId, outcome: 'accepted' })) }));
  await pending;
  assert.equal(env.idb.peek(DB, STORE, 'outbox'), fresh, 'stale acknowledgement ignored');
  // A stale revocation for the old generation is also superseded.
  assert.equal(plain(await other.O.stopGeneration(oldExpected)).reason, 'superseded');
  assert.ok(env.idb.peek(DB, STORE, 'enrollment'));
  assert.ok(other.O.capture());
});

test('who is playing: per-tab choice pins new questions; an unlisted pin refuses; a resumed Facts question keeps its bound profile', async () => {
  const env = makeEnv(), tab = openTab(env);
  const [p1, p2] = [randomUUID(), randomUUID()];
  await enroll(env, tab, [p1, p2]);
  assert.deepEqual(plain(tab.S.players().list.map(item => item.label)), ['Player 1', 'Player 2']);
  assert.equal(tab.O.capture(), null, 'two profiles and no choice records nothing');
  assert.equal(tab.O.capture(randomUUID()), null, 'unlisted pin refuses');
  assert.equal(tab.S.choosePlayer(p2), true);
  assert.equal(tab.S.player(), p2);
  assert.equal(tab.O.capture(tab.S.player()).profileId, p2);
  // Facts: a durable question first recorded for p1 keeps p1 across a "reload" (a new tab
  // adopting the persisted attempt), even though that tab chose p2.
  const progress = (misses, firstCorrect = null, complete = false) => ({ nonce: 4, factId: 'add:7:6', serial: 3, misses, helped: false, firstCorrect, complete });
  const fact = { factId: 'add:7:6', family: 'family:6:7:13' };
  tab.O.recordFacts(tab.O.capture(p1), { gameVersion: '1.9.2', durable: true, adoptable: false, before: progress(0), after: progress(1, false), replaced: false,
    observations: [{ kind: 'attempt', fields: { ...fact, number: 1, correct: false, helped: false } }] });
  await tab.O.idle();
  assert.deepEqual(JSON.parse(env.idb.peek(DB, STORE, 'binding')).facts, { nonce: 4, factId: 'add:7:6', serial: 3, profileId: p1 });
  const reloaded = openTab(env);
  reloaded.O.recordFacts(reloaded.O.capture(p2), { gameVersion: '1.9.2', durable: true, adoptable: true, before: progress(1, false), after: progress(1, false, true), replaced: false,
    observations: [{ kind: 'attempt', fields: { ...fact, number: 2, correct: true, helped: false } },
      { kind: 'resolution', fields: { ...fact, outcome: 'retry', eligibleCheck: false, timingMs: null, helped: false } }] });
  await reloaded.O.idle();
  const events = envelope(env).events;
  assert.deepEqual(events.map(event => event.profileId), [p1, p1, p1]);
  assert.equal(new Set(events.map(event => event.questionInstanceId)).size, 1);
  assert.equal(JSON.parse(env.idb.peek(DB, STORE, 'binding')).facts, null, 'the binding retires with the link');
});

test('a resumed durable Facts link without its binding fails reporting closed; a memory tab never writes the binding', async () => {
  const env = makeEnv(), tab = openTab(env);
  const [p1] = [randomUUID()];
  await enroll(env, tab, [p1]);
  const progress = misses => ({ nonce: 9, factId: 'add:7:6', serial: 1, misses, helped: false, firstCorrect: misses ? false : null, complete: false });
  const fact = { factId: 'add:7:6', family: 'family:6:7:13' };
  const op = (before, after, durable, adoptable) => ({ gameVersion: '1.9.2', durable, adoptable, before, after, replaced: false,
    observations: [{ kind: 'attempt', fields: { ...fact, number: before.misses + 1, correct: false, helped: false } }] });
  tab.O.recordFacts(tab.O.capture(), op(progress(0), progress(1), true, false));
  await tab.O.idle();
  env.idb.remove(DB, STORE, 'binding');
  const reloaded = openTab(env);
  reloaded.O.recordFacts(reloaded.O.capture(), op(progress(1), progress(2), true, true));
  await reloaded.O.idle();
  assert.equal(envelope(env).events.length, 1, 'unknown binding: nothing recorded for that question');
  const memory = openTab(env);
  memory.O.recordFacts(memory.O.capture(), op(progress(2), progress(3), false, true));
  await memory.O.idle();
  assert.equal(env.idb.peek(DB, STORE, 'binding'), null);
  assert.equal(envelope(env).events.length, 2, 'the memory tab records its own question');
});

test('a lost first commit, a reload and another player: the started question records nothing; the next question records normally', async () => {
  const fact = { factId: 'add:7:6', family: 'family:6:7:13' };
  const progress = (nonce, misses, complete = false) => ({ nonce, factId: 'add:7:6', serial: nonce, misses, helped: false, firstCorrect: misses ? false : null, complete });
  const wrong = (before, after, adoptable) => ({ gameVersion: '1.9.2', durable: true, adoptable, before, after, replaced: false,
    observations: [{ kind: 'attempt', fields: { ...fact, number: before.misses + 1, correct: false, helped: false } }] });
  const correct = (before, adoptable) => ({ gameVersion: '1.9.2', durable: true, adoptable, before, after: { ...before, complete: true }, replaced: false,
    observations: [{ kind: 'attempt', fields: { ...fact, number: before.misses + 1, correct: true, helped: false } },
      { kind: 'resolution', fields: { ...fact, outcome: before.misses ? 'retry' : 'first-correct', eligibleCheck: false, timingMs: null, helped: false } }] });
  for (const profiles of [2, 1]) {
    const env = makeEnv(), tab = openTab(env);
    const ids = Array.from({ length: profiles }, () => randomUUID());
    await enroll(env, tab, ids);
    const first = ids[0], later = ids.at(-1);
    // The domain accepted and saved the miss, but the outbox transaction never committed.
    env.idb.faults.abortNext = 1;
    tab.O.recordFacts(tab.O.capture(first), wrong(progress(4, 0), progress(4, 1), false));
    await tab.O.idle();
    assert.equal(env.idb.peek(DB, STORE, 'outbox'), null, 'nothing of the lost commit survived');
    // Reload: the persisted attempt resumes, and the tab now chooses another player.
    const reloaded = openTab(env);
    reloaded.O.recordFacts(reloaded.O.capture(later), correct(progress(4, 1), true));
    await reloaded.O.idle();
    const afterLoss = env.idb.peek(DB, STORE, 'outbox');
    if (profiles > 1) {
      assert.equal(afterLoss, null, 'several profiles: the started question fails reporting closed');
      assert.equal(env.idb.peek(DB, STORE, 'binding'), null, 'and binds nothing');
    } else {
      // One consented profile: the question can only be that profile's (legacy #199 semantics).
      assert.deepEqual([...new Set(JSON.parse(afterLoss).events.map(event => event.profileId))], [first]);
    }
    // The next, pristine question records under the current choice.
    reloaded.O.recordFacts(reloaded.O.capture(later), correct(progress(5, 0), false));
    await reloaded.O.idle();
    const next = envelope(env).events.filter(event => event.factId === 'add:7:6').slice(-2);
    assert.deepEqual(next.map(event => [event.kind, event.profileId]), [['attempt', later], ['resolution', later]]);
  }
});

// ---- A failed final hint write: recover or Stop without another code (F6-2) ----
const OWNED = ['enrollment', 'outbox', 'credential', 'sync', 'binding'];
const ownedBytes = env => Object.fromEntries(OWNED.map(key => [key, env.idb.peek(DB, STORE, key)]));
const enrollRequests = env => env.requests.filter(request => request.url === `${ORIGIN}/v1/enroll`).length;
async function partialInstall(env, tab, profileIds = [randomUUID()]) {
  env.storage.failSet(HINT);
  env.respond = () => enrollReply(profileIds);
  const result = plain(await tab.S.enroll('0123456789ABCDEFGHJKMNPQRS'));
  assert.deepEqual([result.ok, result.reason, result.installed], [false, 'hint-failed', true]);
  assert.equal(env.storage.raw(HINT), null);
  return JSON.parse(env.idb.peek(DB, STORE, 'enrollment'));
}

test('a failed final hint leaves a verified partial enrollment that a reload can finish, without a second code', async () => {
  const env = makeEnv(), tab = openTab(env);
  const consent = await partialInstall(env, tab);
  const installed = ownedBytes(env);
  assert.ok(installed.enrollment && installed.credential && installed.sync);
  // Nothing records without the hint (fail closed).
  assert.equal(tab.O.capture(), null);
  // "Reload": a fresh document sees the partial enrollment, not a blank device.
  const reloaded = openTab(env);
  const found = plain(await reloaded.S.partialEnrollment());
  assert.equal(found.state, 'partial');
  assert.deepEqual([found.expected.generation, found.expected.deviceId], [consent.generation, consent.deviceId]);
  // A new code is refused before any exchange: no second code is spent.
  assert.deepEqual(plain(await reloaded.S.enroll('0123456789ABCDEFGHJKMNPQRS')), { ok: false, reason: 'partial-enrollment' });
  assert.equal(enrollRequests(env), 1);
  // Finishing while the browser still refuses the write: honest failure, records untouched.
  assert.deepEqual(plain(await reloaded.S.finishEnrollment()), { ok: false, reason: 'hint-failed' });
  assert.deepEqual(ownedBytes(env), installed);
  // The browser allows it again: the same enrollment is finished; generation and records unchanged.
  env.storage.failSet(HINT, false);
  assert.deepEqual(plain(await reloaded.S.finishEnrollment()), { ok: true });
  const hint = JSON.parse(env.storage.raw(HINT));
  assert.deepEqual([hint.generation, hint.deviceId, hint.profileIds], [consent.generation, consent.deviceId, consent.profileIds]);
  assert.deepEqual(ownedBytes(env), installed);
  assert.equal(enrollRequests(env), 1);
  // Recording now works under that one generation.
  await record(reloaded, 1);
  assert.equal(envelope(env).generation, consent.generation);
  assert.equal(plain(await reloaded.S.partialEnrollment()).state, 'hinted');
});

test('a partial enrollment can be stopped without a hint; a later enrollment then spends exactly one new code', async () => {
  const env = makeEnv(), tab = openTab(env);
  await partialInstall(env, tab);
  const reloaded = openTab(env);
  assert.deepEqual(plain(await reloaded.S.stopPartialEnrollment()), { ok: true });
  for (const key of OWNED) assert.equal(env.idb.peek(DB, STORE, key), null, key);
  assert.equal(plain(await reloaded.S.partialEnrollment()).state, 'none');
  env.storage.failSet(HINT, false);
  const fresh = openTab(env);
  await enroll(env, fresh);
  assert.equal(enrollRequests(env), 2);
});

test('unknown, mismatched, orphan or future records are never admitted, finished, stopped or overwritten, and spend no code', async () => {
  const cases = {
    'generation mismatch': env => {
      const consent = { schemaVersion: 1, generation: randomUUID(), deviceId: randomUUID(), profileIds: [randomUUID()] };
      env.idb.seed(DB, STORE, { enrollment: JSON.stringify(consent),
        credential: JSON.stringify({ schemaVersion: 1, generation: randomUUID(), deviceId: consent.deviceId, serviceOrigin: ORIGIN, token: token() }) });
    },
    'orphan credential': env => env.idb.seed(DB, STORE, { credential: JSON.stringify({ schemaVersion: 1, generation: randomUUID(), deviceId: randomUUID(), serviceOrigin: ORIGIN, token: token() }) }),
    'future credential': env => {
      const consent = { schemaVersion: 1, generation: randomUUID(), deviceId: randomUUID(), profileIds: [randomUUID()] };
      env.idb.seed(DB, STORE, { enrollment: JSON.stringify(consent),
        credential: JSON.stringify({ schemaVersion: 2, generation: consent.generation, deviceId: consent.deviceId, serviceOrigin: ORIGIN, token: token() }) });
    },
    'consent without credential': env => env.idb.seed(DB, STORE, { enrollment: JSON.stringify({ schemaVersion: 1, generation: randomUUID(), deviceId: randomUUID(), profileIds: [randomUUID()] }) }),
    'malformed sync': env => {
      const consent = { schemaVersion: 1, generation: randomUUID(), deviceId: randomUUID(), profileIds: [randomUUID()] };
      env.idb.seed(DB, STORE, { enrollment: JSON.stringify(consent), sync: '{bad',
        credential: JSON.stringify({ schemaVersion: 1, generation: consent.generation, deviceId: consent.deviceId, serviceOrigin: ORIGIN, token: token() }) });
    },
    'future database': env => env.idb.seed(DB, STORE, { outbox: 'opaque future bytes' }, { version: 2 }),
  };
  for (const [name, seed] of Object.entries(cases)) {
    const env = makeEnv();
    seed(env);
    const before = ownedBytes(env), version = env.idb.version(DB);
    const tab = openTab(env);
    assert.equal(plain(await tab.S.partialEnrollment()).state, 'unknown', name);
    assert.equal(plain(await tab.S.finishEnrollment()).reason, 'unknown', name);
    assert.equal(plain(await tab.S.stopPartialEnrollment()).reason, 'unknown', name);
    env.respond = () => enrollReply([randomUUID()]);
    assert.deepEqual(plain(await tab.S.enroll('0123456789ABCDEFGHJKMNPQRS')), { ok: false, reason: 'unknown-records' }, name);
    assert.equal(env.requests.length, 0, `${name}: no code exchange`);
    assert.equal(env.storage.raw(HINT), null, `${name}: never admitted`);
    assert.deepEqual(ownedBytes(env), before, `${name}: records untouched`);
    assert.equal(env.idb.version(DB), version, name);
  }
});

test('applySync rejects outcomes that are not subsets of the submitted snapshot', async () => {
  const env = makeEnv(), tab = openTab(env);
  await enroll(env, tab);
  await record(tab, 2);
  const view = plain(await tab.O.syncView());
  const expected = { generation: view.generation, deviceId: view.deviceId, token: view.token };
  const [a, b] = view.envelope.events.map(event => event.eventId);
  const base = { submitted: [a], remove: [], suppress: [], rotateEpoch: null, syncedAt: null, notice: null };
  for (const bad of [{ ...base, remove: [b] }, { ...base, suppress: [{ eventId: b, reason: 'invalid' }] }, { ...base, remove: [a], suppress: [{ eventId: a, reason: 'invalid' }] }, { ...base, extra: 1 }]) {
    assert.deepEqual(plain(await tab.O.applySync(expected, bad)), { ok: false, reason: 'invalid-outcome' });
  }
  assert.equal(envelope(env).events.length, 2);
  assert.deepEqual(plain(await tab.O.applySync({ ...expected, token: token() }, { ...base, remove: [a] })), { ok: false, reason: 'superseded' });
  assert.equal(envelope(env).events.length, 2);
});
