// Runtime suite: the actual Wrangler dry-run bundle (dist/) in local workerd with a real
// local D1 database and rate-limit bindings. All data is synthetic. Outbound requests
// are intercepted: only the synthetic Access key URL answers; anything else is denied
// and fails the suite. No real account, Access team or database is read or touched.
// Test-only local adjustments (never production bindings): the enroll limiter's local
// limit is raised so this suite's many enrollments fit in one minute, and one case adds
// a local SQLite trigger to force a mid-batch failure.
import assert from 'node:assert/strict';
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const require = createRequire(`${root}/package.json`);
const { Miniflare, Response: MFResponse, Log, LogLevel, convertV4MiniflareOptions } = require('miniflare');
const { subtle } = webcrypto;
const enc = new TextEncoder();

const TEAM = 'https://synthetic-household.cloudflareaccess.com';
const AUD = 'c'.repeat(64);
const HOST = 'https://reports.synthetic.test';
const GAME = 'https://games.synthetic.test';
const LABELS = ['Synthetic Lark', 'Synthetic Wren'];
const logs = [], unexpected = [];
class CaptureLog extends Log { logWithLevel(level, message) { logs.push(String(message)); } }

const b64 = bytes => Buffer.from(bytes).toString('base64url');
let key, mf, db, worker, dir, bundlePath, bundleHash, bundle, session, A, B;

// One stable grown-up Access session for the whole suite, as a real Access cookie carries
// one JWT with a fixed iat. Candidate 3 minted a new iat per request (floor(now) - 5), so
// crossing a second boundary silently changed the session and its CSRF binding mid-suite.
// Other sessions are minted only where a test means to (see the CSRF/session case).
const SESSION_START = Math.floor(Date.now() / 1000);
const SESSION_CLAIMS = Object.freeze({ iss: TEAM, aud: [AUD], sub: 'synthetic-grown-up', iat: SESSION_START - 5, exp: SESSION_START + 3600 });
async function jwt(overrides = {}) {
  const head = b64(enc.encode(JSON.stringify({ alg: 'RS256', kid: 'runtime-k1', typ: 'JWT' })));
  const body = b64(enc.encode(JSON.stringify({ ...SESSION_CLAIMS, ...overrides })));
  const sig = new Uint8Array(await subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64(sig)}`;
}
const parse = text => { try { return JSON.parse(text); } catch (error) { return text; } };
async function admin(path, body, { claims = {}, csrf } = {}) {
  const headers = { 'Cf-Access-Jwt-Assertion': await jwt(claims) };
  if (body !== undefined) Object.assign(headers, { 'Content-Type': 'application/json', Origin: HOST, 'Sec-Fetch-Site': 'same-origin', 'X-CSRF-Token': csrf ?? session.csrf });
  const response = await mf.dispatchFetch(`${HOST}${path}`, body === undefined ? { headers } : { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, data: parse(await response.text()), headers: response.headers };
}
async function device(path, body, token, origin = GAME) {
  const headers = { 'Content-Type': 'application/json', Origin: origin };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await mf.dispatchFetch(`${HOST}${path}`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: response.status, data: parse(await response.text()) };
}
const rows = async (sql, ...params) => (await db.prepare(sql).bind(...params).all()).results;
const count = async (sql, ...params) => (await rows(sql, ...params))[0].n;

async function enrolledDevice(profileIds, name) {
  const code = await admin('/api/codes', { deviceName: name, profileIds });
  assert.equal(code.status, 200, JSON.stringify(code.data));
  const enrolled = await device('/v1/enroll', { code: code.data.code });
  assert.equal(enrolled.status, 200, JSON.stringify(enrolled.data));
  return { ...enrolled.data, epochId: randomUUID(), seq: 0 };
}
function factsEvent(dev, profileId, overrides = {}) {
  const seq = overrides.seq ?? ++dev.seq;
  return { schemaVersion: 1, eventId: randomUUID(), deviceId: dev.deviceId, epochId: dev.epochId, seq, profileId, game: 'facts', gameVersion: '1.9.2',
    recordedAt: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z'), kind: 'leftUnfinished', questionInstanceId: randomUUID(),
    factId: 'add:7:6', family: 'family:6:7:13', ...overrides };
}
const status = (dev, highestSeq = dev.seq) => ({ schemaVersion: 1, deviceId: dev.deviceId, epochId: dev.epochId, highestSeq, droppedLocal: 2, writeFailures: 1 });
const sync = (dev, events, highestSeq) => device('/v1/sync', { schemaVersion: 1, status: status(dev, highestSeq), events }, dev.token);
const outcomes = result => result.data.results.map(item => item.outcome);
const healthOf = async dev => (await admin('/api/devices')).data.devices.find(item => item.deviceId === dev.deviceId);

before(async () => {
  const dist = join(root, 'dist');
  const files = (await readdir(dist)).filter(file => file.endsWith('.js'));
  bundlePath = join(dist, files.includes('worker.js') ? 'worker.js' : files[0]);
  bundle = await readFile(bundlePath, 'utf8');
  bundleHash = createHash('sha256').update(bundle).digest('hex');
  const pair = await subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = await subtle.exportKey('jwk', pair.publicKey);
  key = { privateKey: pair.privateKey, jwk: { kty: 'RSA', kid: 'runtime-k1', alg: 'RS256', n: jwk.n, e: jwk.e } };
  const config = JSON.parse(await readFile(join(root, 'wrangler.jsonc'), 'utf8'));
  const ratelimits = Object.fromEntries(config.ratelimits.map(item => [item.name,
    { namespace_id: item.namespace_id, simple: item.name === 'ENROLL_LIMITER' ? { ...item.simple, limit: 1000 } : item.simple }]));
  dir = await mkdtemp(join(tmpdir(), 'learning-reporting-'));
  mf = new Miniflare(convertV4MiniflareOptions({
    name: 'learning-reporting-runtime', modules: true, scriptPath: bundlePath, compatibilityDate: config.compatibility_date,
    rootPath: dist, resourcePersistencePath: dir, cf: false, log: new CaptureLog(LogLevel.DEBUG),
    // Miniflare 5 routes workerd console output through structured logs, separately
    // from its host Log. Capture the actual runtime messages and retain raw stdout.
    handleStructuredLogs: entry => { logs.push(entry.message); console.log(entry.message); },
    bindings: { ...config.vars, REPORTING_ENABLED: 'true', ALLOWED_ORIGINS: GAME, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, RETENTION_DAYS: '30' },
    d1Databases: { DB: 'learning-reporting-runtime' },
    ratelimits,
    outboundService: async request => {
      if (request.url === `${TEAM}/cdn-cgi/access/certs`) return new MFResponse(JSON.stringify({ keys: [key.jwk] }), { headers: { 'Content-Type': 'application/json' } });
      unexpected.push(request.url);
      return new MFResponse('denied', { status: 403 });
    },
  }));
  await mf.ready;
  db = (await mf.getBindings()).DB;
  const migration = (await readFile(join(root, 'migrations/0001_initial.sql'), 'utf8'))
    .split('\n').filter(line => !line.trim().startsWith('--')).join('\n').split(';').map(sql => sql.trim()).filter(Boolean);
  await db.batch(migration.map(sql => db.prepare(sql)));
  worker = await mf.getWorker();
  session = (await admin('/api/session')).data;
  A = (await admin('/api/profiles', { label: LABELS[0] })).data;
  B = (await admin('/api/profiles', { label: LABELS[1] })).data;
});
after(async () => {
  assert.deepEqual(unexpected, [], 'no outbound request except the synthetic Access keys');
  assert.equal(createHash('sha256').update(await readFile(bundlePath, 'utf8')).digest('hex'), bundleHash, 'bundle unchanged during the suite');
  await mf?.dispose();
  await rm(dir, { recursive: true, force: true });
  console.log(JSON.stringify({ bundle: bundlePath.slice(root.length), bundle_sha256: bundleHash, node: process.version, miniflare: require('miniflare/package.json').version }));
});

test('the built bundle carries the one shared #199 validator and rejects what it rejects', async () => {
  assert.ok(bundle.includes('two-point-three-digit-subtract') && bundle.includes('LEARNING_OUTBOX'), 'shared catalog bundled');
  const dev = await enrolledDevice([A.profileId], 'Validator tablet');
  const bad = [factsEvent(dev, A.profileId, { factId: 'add:7:7' }), factsEvent(dev, A.profileId, { prompt: '7 + 6 = ?' }), { ...factsEvent(dev, A.profileId), deviceId: randomUUID() }];
  const result = await sync(dev, bad);
  assert.equal(result.status, 200);
  assert.deepEqual(outcomes(result), ['invalid', 'invalid', 'invalid']);
  assert.equal(await count('SELECT count(*) AS n FROM events WHERE device_id = ?1', dev.deviceId), 0, 'events that fail the allowlist are not retained');
  const unsupported = await device('/v1/sync', { schemaVersion: 2, status: status(dev), events: [] }, dev.token);
  assert.deepEqual([unsupported.status, unsupported.data.error], [422, 'unsupported-schema']);
});

test('dashboard, reads, export and admin are denied without a valid Access JWT; a forged header is denied', async () => {
  for (const path of ['/', '/app.js', '/app.css', '/api/session', '/api/report', '/api/export', '/api/devices', '/unknown']) {
    assert.equal((await mf.dispatchFetch(`${HOST}${path}`)).status, 401, path);
    assert.equal((await mf.dispatchFetch(`${HOST}${path}`, { headers: { 'Cf-Access-Jwt-Assertion': 'eyJhbGciOiJSUzI1NiJ9.e30.AAAA' } })).status, 401, path);
  }
  assert.equal((await mf.dispatchFetch(`${HOST}/`, { headers: { 'Cf-Access-Jwt-Assertion': await jwt({ aud: ['d'.repeat(64)] }) } })).status, 401);
  assert.equal((await mf.dispatchFetch(`${HOST}/`, { headers: { 'Cf-Access-Jwt-Assertion': await jwt({ iss: 'https://other.cloudflareaccess.com' }) } })).status, 401);
  const page = await admin('/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('Content-Security-Policy'), /default-src 'none'/);
  const crossSite = await mf.dispatchFetch(`${HOST}/api/preview`, { method: 'POST', body: JSON.stringify({ action: 'delete-all', target: null }),
    headers: { 'Cf-Access-Jwt-Assertion': await jwt(), 'Content-Type': 'application/json', Origin: 'https://evil.example', 'X-CSRF-Token': session.csrf } });
  assert.equal(crossSite.status, 403, 'cross-site delete refused');
  // The CSRF token is bound to one Access session: another valid session (a later sign-in,
  // or another grown-up) cannot use it, and receives its own token from /api/session.
  const preview = { action: 'delete-all', target: null };
  for (const claims of [{ iat: SESSION_CLAIMS.iat + 60 }, { sub: 'synthetic-other-grown-up' }]) {
    const reused = await admin('/api/preview', preview, { claims });
    assert.deepEqual([reused.status, reused.data.error], [403, 'csrf'], JSON.stringify(claims));
    const own = (await admin('/api/session', undefined, { claims })).data.csrf;
    assert.notEqual(own, session.csrf);
    assert.equal((await admin('/api/preview', preview, { claims, csrf: own })).status, 200);
    assert.deepEqual((await admin('/api/preview', preview, { csrf: own })).data, { error: 'csrf' }, 'and theirs is refused for this session');
  }
  assert.equal((await admin('/api/preview', preview)).status, 200, 'the stable session’s own token works');
  assert.equal((await device('/v1/enroll', { code: 'X' }, null, 'https://evil.example')).status, 403, 'foreign game origin');
});

test('an enrollment code works once, concurrently once, and expires; only the token hash is stored', async () => {
  const code = (await admin('/api/codes', { deviceName: 'Race tablet', profileIds: [A.profileId] })).data.code;
  const results = await Promise.all(Array.from({ length: 5 }, () => device('/v1/enroll', { code })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400, 400, 400, 400]);
  assert.equal((await device('/v1/enroll', { code })).status, 400, 'used');
  const late = (await admin('/api/codes', { deviceName: 'Late tablet', profileIds: [A.profileId] })).data.code;
  await db.prepare('UPDATE enrollment_codes SET expires_at = 1 WHERE claimed_by IS NULL').run();
  assert.equal((await device('/v1/enroll', { code: late })).status, 400, 'expired');
  const winner = results.find(r => r.status === 200).data;
  assert.deepEqual(winner.profileIds, [A.profileId]);
  assert.match(winner.token, /^lr1_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$/);
  const stored = JSON.stringify(await rows('SELECT * FROM devices'));
  assert.equal(stored.includes(winner.token), false);
  assert.ok(stored.includes(createHash('sha256').update(winner.token).digest('hex')));
});

test('a maximal 20-event batch sent three times is stored exactly once; a resend after a client timeout is acknowledged, not duplicated', async () => {
  const dev = await enrolledDevice([A.profileId], 'Batch tablet');
  const events = Array.from({ length: 20 }, () => factsEvent(dev, A.profileId));
  for (let round = 0; round < 3; round++) {
    const result = await sync(dev, events);
    assert.equal(result.status, 200);
    assert.deepEqual(outcomes(result), Array(20).fill('accepted'));
    assert.deepEqual(result.data.results.map(item => item.eventId), events.map(event => event.eventId));
  }
  assert.equal(await count('SELECT count(*) AS n FROM events WHERE device_id = ?1', dev.deviceId), 20);
  assert.deepEqual(outcomes(await sync(dev, events.slice(5, 9))), Array(4).fill('accepted'));
  assert.equal(await count('SELECT count(*) AS n FROM events WHERE device_id = ?1', dev.deviceId), 20);
  assert.equal((await device('/v1/sync', 'x'.repeat(70000), dev.token)).status, 413);
});

test('a mid-batch failure rolls back the whole batch; the resend then commits once', async () => {
  const dev = await enrolledDevice([A.profileId], 'Rollback tablet');
  const events = Array.from({ length: 3 }, () => factsEvent(dev, A.profileId));
  await db.prepare("CREATE TRIGGER synthetic_abort BEFORE INSERT ON epochs BEGIN SELECT RAISE(ABORT, 'synthetic'); END").run();
  let failed;
  try { failed = await sync(dev, events); } finally { await db.prepare('DROP TRIGGER synthetic_abort').run(); }
  assert.equal(failed.status, 503);
  assert.equal(await count('SELECT count(*) AS n FROM events WHERE device_id = ?1', dev.deviceId), 0, 'nothing of the failed batch committed');
  assert.equal((await rows('SELECT last_sync_at FROM devices WHERE device_id = ?1', dev.deviceId))[0].last_sync_at, null);
  assert.deepEqual(outcomes(await sync(dev, events)), ['accepted', 'accepted', 'accepted']);
  assert.equal(await count('SELECT count(*) AS n FROM events WHERE device_id = ?1', dev.deviceId), 3);
});

test('conflicts are anomalies with bounded metadata; withholding seq 5 of 1..10 shows one gap; a new epoch is a fresh log with no invented count', async () => {
  const dev = await enrolledDevice([A.profileId], 'Gap tablet');
  const events = Array.from({ length: 10 }, () => factsEvent(dev, A.profileId));
  assert.deepEqual(outcomes(await sync(dev, events.filter(event => event.seq !== 5))), Array(9).fill('accepted'));
  let health = await healthOf(dev);
  assert.deepEqual(health.epochs[0].unreceived, [{ first: 5, last: 5, count: 1 }]);
  assert.deepEqual([health.droppedLocal, health.writeFailures, typeof health.lastSyncAt], [2, 1, 'number']);
  const changed = { ...events[0], factId: 'sub:13:6' };
  const slot = factsEvent(dev, A.profileId, { seq: 2 });
  assert.deepEqual(outcomes(await sync(dev, [changed, slot])), ['conflict', 'seq-conflict']);
  const anomalies = await rows('SELECT * FROM anomalies WHERE device_id = ?1 ORDER BY reason', dev.deviceId);
  assert.deepEqual(anomalies.map(row => row.reason), ['payload-mismatch', 'seq-conflict']);
  assert.deepEqual(Object.keys(anomalies[0]).sort(), ['detected_at', 'device_id', 'epoch_id', 'event_id', 'other_event_id', 'reason', 'seq']);
  assert.equal(anomalies[1].other_event_id, events[1].eventId);
  assert.equal(JSON.stringify(anomalies).includes('sub:13:6'), false, 'never the conflicting payload');
  assert.equal(await count('SELECT count(*) AS n FROM events WHERE event_id = ?1 AND payload LIKE ?2', events[0].eventId, '%add:7:6%'), 1, 'stored event unchanged');
  await new Promise(done => setTimeout(done, 5));
  dev.epochId = randomUUID(); dev.seq = 0;
  assert.deepEqual(outcomes(await sync(dev, [factsEvent(dev, A.profileId)])), ['accepted']);
  health = await healthOf(dev);
  assert.deepEqual(health.epochs.map(epoch => [epoch.freshLog, epoch.current]), [[false, false], [true, true]]);
  assert.deepEqual(health.epochs[1].unreceived, []);
});

test('deleting one profile on a shared device: the other keeps reporting; queued old events cannot restore it; no gaps appear', async () => {
  const finch = (await admin('/api/profiles', { label: 'Synthetic Finch' })).data;
  const dev = await enrolledDevice([finch.profileId, B.profileId], 'Shared tablet');
  const old = [factsEvent(dev, finch.profileId), factsEvent(dev, B.profileId), factsEvent(dev, finch.profileId)];
  assert.deepEqual(outcomes(await sync(dev, old)), ['accepted', 'accepted', 'accepted']);
  const preview = await admin('/api/preview', { action: 'delete-profile', target: finch.profileId });
  assert.deepEqual(preview.data.affected.devices.map(item => item.name), ['Shared tablet']);
  assert.equal((await admin('/api/confirm', { confirmation: preview.data.confirmation })).status, 200);
  assert.deepEqual(outcomes(await sync(dev, old)), ['deleted', 'accepted', 'deleted']);
  const refusedEvent = factsEvent(dev, finch.profileId), laterB = factsEvent(dev, B.profileId);
  assert.deepEqual(outcomes(await sync(dev, [refusedEvent, laterB])), ['deleted', 'accepted']);
  assert.equal(await count('SELECT count(*) AS n FROM events WHERE profile_id = ?1', finch.profileId), 0);
  assert.equal(await count('SELECT count(*) AS n FROM events WHERE device_id = ?1 AND profile_id = ?2', dev.deviceId, B.profileId), 2);
  const health = await healthOf(dev);
  assert.deepEqual(health.epochs[0].unreceived, [], 'intentional deletion is never a gap');
  // N2: seqs 1 and 3 were stored then retired ('profile-deleted'); seq 4 was refused at
  // upload ('refused-deleted') and never stored. Received counts only stored events.
  assert.deepEqual((await rows('SELECT seq, reason FROM retired_events WHERE device_id = ?1 ORDER BY seq', dev.deviceId)),
    [{ seq: 1, reason: 'profile-deleted' }, { seq: 3, reason: 'profile-deleted' }, { seq: 4, reason: 'refused-deleted' }]);
  assert.deepEqual([health.received, health.retained, health.refusedDeleted], [4, 2, 1]);
  // A resend of the refused event stays 'deleted' and idempotent; a different event in its
  // slot is a seq conflict, never stored over it; an unauthenticated resend is refused.
  const replay = await sync(dev, [refusedEvent]);
  assert.deepEqual(outcomes(replay), ['deleted']);
  assert.equal(await count("SELECT count(*) AS n FROM retired_events WHERE device_id = ?1 AND seq = 4", dev.deviceId), 1);
  assert.deepEqual(outcomes(await sync(dev, [factsEvent(dev, B.profileId, { seq: 4 })])), ['seq-conflict']);
  assert.equal(await count('SELECT count(*) AS n FROM events WHERE device_id = ?1 AND seq = 4', dev.deviceId), 0);
  assert.equal((await sync({ ...dev, token: `${dev.token.slice(0, 37)}${'B'.repeat(43)}` }, [factsEvent(dev, finch.profileId)])).status, 401);
  assert.deepEqual(await rows('SELECT profile_id FROM profile_tombstones WHERE profile_id = ?1', finch.profileId), [{ profile_id: finch.profileId }]);
  assert.deepEqual(Object.keys((await rows('SELECT * FROM retired_events LIMIT 1'))[0]).sort(), ['device_id', 'epoch_id', 'event_id', 'reason', 'retired_at', 'seq']);
});

test('confirmations: a failed scope check at stored expected+1 deletes nothing; concurrent and replayed confirmations apply once', async () => {
  const dev = await enrolledDevice([A.profileId], 'Guard tablet');
  const stale = await admin('/api/preview', { action: 'delete-device', target: dev.deviceId });
  const scope = (await rows('SELECT scope_version AS v FROM system'))[0].v;
  const bump = (await admin('/api/profiles', { label: 'Synthetic Bump' })).data;
  assert.equal((await rows('SELECT scope_version AS v FROM system'))[0].v, scope + 1, 'stored version is exactly expected + 1');
  assert.equal((await admin('/api/confirm', { confirmation: stale.data.confirmation })).status, 409);
  assert.equal(await count('SELECT count(*) AS n FROM devices WHERE device_id = ?1', dev.deviceId), 1, 'nothing deleted');
  assert.equal(await count('SELECT count(*) AS n FROM operations'), 0);
  const [one, two] = await Promise.all([admin('/api/preview', { action: 'delete-device', target: dev.deviceId }), admin('/api/preview', { action: 'delete-device', target: dev.deviceId })]);
  const results = await Promise.all([admin('/api/confirm', { confirmation: one.data.confirmation }), admin('/api/confirm', { confirmation: two.data.confirmation }), admin('/api/confirm', { confirmation: one.data.confirmation })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409, 409]);
  assert.equal((await admin('/api/confirm', { confirmation: one.data.confirmation })).status, 409, 'replay');
  const revoked = await sync(dev, [factsEvent(dev, A.profileId)]);
  assert.deepEqual([revoked.status, revoked.data.error], [403, 'revoked'], 'issued then deleted: provably revoked');
  const unknown = await sync({ ...dev, token: `${dev.token.slice(0, 37)}${'A'.repeat(43)}` }, []);
  assert.deepEqual([unknown.status, unknown.data.error], [401, 'invalid-credential'], 'unknown current-installation token: invalid, never revoked');
  assert.deepEqual(await rows('SELECT device_id FROM device_tombstones WHERE device_id = ?1', dev.deviceId), [{ device_id: dev.deviceId }]);
  assert.equal(await count('SELECT count(*) AS n FROM events WHERE device_id = ?1', dev.deviceId), 0);
  const del = await admin('/api/preview', { action: 'delete-profile', target: bump.profileId });
  assert.equal((await admin('/api/confirm', { confirmation: del.data.confirmation })).status, 200);
});

test('revoking a device refuses its uploads as revoked and keeps its reported events', async () => {
  const dev = await enrolledDevice([A.profileId], 'Revoke tablet');
  await sync(dev, [factsEvent(dev, A.profileId)]);
  const preview = await admin('/api/preview', { action: 'revoke-device', target: dev.deviceId });
  assert.deepEqual(preview.data.affected.profiles.map(item => item.label), [LABELS[0]]);
  assert.equal((await admin('/api/confirm', { confirmation: preview.data.confirmation })).status, 200);
  const refused = await sync(dev, []);
  assert.deepEqual([refused.status, refused.data.error], [403, 'revoked']);
  assert.equal(await count('SELECT count(*) AS n FROM events WHERE device_id = ?1', dev.deviceId), 1);
});

test('the cron handler retires expired events by receipt time; a resend is deleted and never shown as a gap', async () => {
  const dev = await enrolledDevice([A.profileId], 'Retention tablet');
  const events = Array.from({ length: 4 }, () => factsEvent(dev, A.profileId));
  await sync(dev, events);
  await db.prepare('UPDATE events SET received_at = 1000 WHERE device_id = ?1 AND seq <= 2').bind(dev.deviceId).run();
  await worker.scheduled({ cron: '17 3 * * *' });
  assert.deepEqual((await rows('SELECT seq FROM events WHERE device_id = ?1 ORDER BY seq', dev.deviceId)).map(row => row.seq), [3, 4]);
  assert.deepEqual((await rows("SELECT seq FROM retired_events WHERE device_id = ?1 AND reason = 'retention' ORDER BY seq", dev.deviceId)).map(row => row.seq), [1, 2]);
  assert.deepEqual(outcomes(await sync(dev, events.slice(0, 2))), ['deleted', 'deleted']);
  const health = await healthOf(dev);
  assert.deepEqual(health.epochs[0].unreceived, []);
  assert.deepEqual([health.received, health.retained], [4, 2]);
});

test('a 15,001-event local D1 backlog continues after the bounded cron and completes on the next invocation', async () => {
  const dev = await enrolledDevice([A.profileId, B.profileId], 'Backlog tablet');
  assert.deepEqual(dev.profileIds, [A.profileId, B.profileId], 'enrollment preserves the code request’s profile order');
  assert.deepEqual(await rows('SELECT profile_id AS profileId, slot FROM device_profiles WHERE device_id = ?1 ORDER BY slot', dev.deviceId),
    [{ profileId: A.profileId, slot: 1 }, { profileId: B.profileId, slot: 2 }]);
  const first = factsEvent(dev, A.profileId);
  const tail = factsEvent(dev, A.profileId, { seq: 15002 });
  dev.seq = tail.seq;
  assert.deepEqual(outcomes(await sync(dev, [first, tail])), ['accepted', 'accepted']);
  // One local-only recursive INSERT creates the remaining 15,000 valid-shaped events.
  // No network uploads, live D1 writes or per-row setup requests are used. This tests
  // continuation and receipts, not hosted Free CPU or daily row allowance.
  await db.prepare(`WITH RECURSIVE backlog(seq) AS (
      SELECT 2 UNION ALL SELECT seq + 1 FROM backlog WHERE seq < 15001
    ) INSERT INTO events (event_id, device_id, epoch_id, seq, profile_id, game, kind, recorded_at, received_at, payload)
    SELECT printf('%08x-0000-4000-8000-%012x', seq, seq), ?1, ?2, seq, ?3,
      'facts', 'leftUnfinished', ?4, 1000 + seq,
      json_set(?5, '$.eventId', printf('%08x-0000-4000-8000-%012x', seq, seq), '$.seq', seq)
    FROM backlog`).bind(dev.deviceId, dev.epochId, A.profileId, first.recordedAt, JSON.stringify(first)).run();
  await db.prepare('UPDATE events SET received_at = 1001 WHERE event_id = ?1').bind(first.eventId).run();
  assert.equal(await count('SELECT count(*) AS n FROM events WHERE device_id = ?1', dev.deviceId), 15002);
  const logStart = logs.length;
  await worker.scheduled({ cron: '17 3 * * *' });
  assert.equal(await count('SELECT count(*) AS n FROM retired_events WHERE device_id = ?1', dev.deviceId), 15000);
  assert.deepEqual((await rows('SELECT seq FROM events WHERE device_id = ?1 ORDER BY seq', dev.deviceId)).map(row => row.seq), [15001, 15002]);
  assert.ok(logs.slice(logStart).some(line => {
    const entry = parse(line);
    return entry?.service === 'learning-reporting' && entry.route === 'scheduled'
      && entry.outcome === 'retention-continues' && entry.status === 15;
  }), 'the real runtime reports continuation after exactly 15 rounds');
  let health = await healthOf(dev);
  assert.deepEqual(health.epochs[0].unreceived, [], 'the bounded first run invents no gap');
  assert.deepEqual([health.received, health.retained], [15002, 2]);
  const last = JSON.parse((await rows('SELECT payload FROM events WHERE device_id = ?1 AND seq = 15001', dev.deviceId))[0].payload);
  await worker.scheduled({ cron: '17 3 * * *' });
  assert.deepEqual((await rows('SELECT seq FROM events WHERE device_id = ?1 ORDER BY seq', dev.deviceId)).map(row => row.seq), [15002]);
  const receipts = await rows('SELECT * FROM retired_events WHERE device_id = ?1 ORDER BY seq', dev.deviceId);
  assert.equal(receipts.length, 15001);
  assert.ok(receipts.every((row, i) => row.seq === i + 1 && row.device_id === dev.deviceId && row.epoch_id === dev.epochId && row.reason === 'retention'));
  assert.equal(receipts[0].event_id, first.eventId);
  assert.equal(receipts.at(-1).event_id, last.eventId);
  assert.ok(receipts.slice(1).every(row => row.event_id === `${row.seq.toString(16).padStart(8, '0')}-0000-4000-8000-${row.seq.toString(16).padStart(12, '0')}`), 'each receipt names exactly its original event');
  assert.deepEqual(Object.keys(receipts[0]).sort(), ['device_id', 'epoch_id', 'event_id', 'reason', 'retired_at', 'seq'], 'ID-only receipts');
  const replay = await sync(dev, [first, last, tail]);
  assert.deepEqual(outcomes(replay), ['deleted', 'deleted', 'accepted']);
  assert.deepEqual(replay.data.results.map(item => item.eventId), [first.eventId, last.eventId, tail.eventId]);
  assert.equal(await count('SELECT count(*) AS n FROM events WHERE device_id = ?1', dev.deviceId), 1, 'replays cannot resurrect expired data');
  assert.equal(await count('SELECT count(*) AS n FROM retired_events WHERE device_id = ?1', dev.deviceId), 15001, 'receipts remain idempotent');
  health = await healthOf(dev);
  assert.deepEqual(health.epochs[0].unreceived, []);
  assert.deepEqual([health.received, health.retained], [15002, 1]);
});

test('export holds only the selected profile’s retained events and its devices’ shared status', async () => {
  const dev = await enrolledDevice([A.profileId, B.profileId], 'Export tablet');
  await sync(dev, [factsEvent(dev, A.profileId), factsEvent(dev, B.profileId)]);
  const exported = await admin(`/api/export?profile=${A.profileId}`);
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('Content-Disposition'), /^attachment/);
  const text = JSON.stringify(exported.data);
  assert.equal(text.includes(B.profileId) || text.includes(LABELS[1]), false, 'no other profile ID or label');
  assert.ok(exported.data.events.length > 0 && exported.data.events.every(item => item.event.profileId === A.profileId));
  assert.equal(exported.data.devices.find(item => item.deviceId === dev.deviceId).shared, true);
});

test('the report endpoint serves the profile view; stored rows and logs hold no labels outside profiles, no content, IP or token', async () => {
  const report = await admin(`/api/report?profile=${A.profileId}`);
  assert.equal(report.status, 200);
  assert.equal(report.data.profile.label, LABELS[0]);
  assert.ok(report.data.coverage.devices.length > 0);
  assert.equal((await admin(`/api/report?profile=${A.profileId}&from=2026-10-30&to=2026-10-01`)).status, 400);
  const tables = (await rows("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf%' ESCAPE '\\' AND name NOT LIKE 'sqlite%' AND name <> 'profiles'")).map(row => row.name);
  assert.ok(tables.includes('events') && tables.includes('anomalies'));
  for (const table of tables) {
    const dump = JSON.stringify(await rows(`SELECT * FROM ${table}`));
    for (const forbidden of [...LABELS, 'Synthetic', 'prompt', 'answer', '127.0.0.1', '192.0.2', 'lr1_', 'synthetic-grown-up']) assert.equal(dump.includes(forbidden), false, `${table}: ${forbidden}`);
  }
  const logText = logs.join('\n');
  for (const forbidden of [...LABELS, 'lr1_', 'synthetic-grown-up', 'add:7:6']) assert.equal(logText.includes(forbidden), false, forbidden);
});

test('the sync rate limit answers 429', async () => {
  const dev = await enrolledDevice([A.profileId], 'Rate tablet');
  const statuses = [];
  for (let i = 0; i < 61; i++) statuses.push((await sync(dev, [])).status);
  assert.ok(statuses.slice(0, 60).every(code => code === 200), JSON.stringify(statuses));
  assert.equal(statuses[60], 429);
});

test('delete everything erases every user row, rotates the marker and keys, and old tokens are revoked', async () => {
  const dev = await enrolledDevice([A.profileId], 'Last tablet');
  const before = (await rows('SELECT installation FROM system'))[0].installation;
  const preview = await admin('/api/preview', { action: 'delete-all', target: null });
  assert.ok(preview.data.affected.profiles.length >= 2);
  assert.equal((await admin('/api/confirm', { confirmation: preview.data.confirmation })).status, 200);
  for (const table of ['events', 'retired_events', 'epochs', 'anomalies', 'device_profiles', 'devices', 'device_tombstones', 'revoked_credentials', 'enrollment_codes', 'profiles', 'profile_tombstones', 'operations']) {
    assert.equal(await count(`SELECT count(*) AS n FROM ${table}`), 0, table);
  }
  assert.notEqual((await rows('SELECT installation FROM system'))[0].installation, before);
  const old = await sync(dev, []);
  assert.deepEqual([old.status, old.data.error], [403, 'revoked']);
  assert.equal((await admin('/api/profiles', { label: 'Synthetic After' })).status, 403, 'old CSRF key rotated');
  session = (await admin('/api/session')).data;
  assert.equal((await admin('/api/profiles', { label: 'Synthetic After' })).status, 200);
});

test('a missing installation marker answers 503 and never initializes', async () => {
  await db.prepare('ALTER TABLE system RENAME TO system_hidden').run();
  try {
    assert.equal((await device('/v1/enroll', { code: '0'.repeat(26) })).status, 503);
    assert.equal((await admin('/api/session')).status, 503);
    assert.equal(await count("SELECT count(*) AS n FROM sqlite_master WHERE name = 'system'"), 0, 'nothing recreated');
  } finally {
    await db.prepare('ALTER TABLE system_hidden RENAME TO system').run();
  }
});

// #208: qualify the actual built consumer before publishing the new producer.
test('built Worker accepts four in-game time concepts beside an existing family and reports their separate evidence axes', async () => {
  const profile = (await admin('/api/profiles', { label: 'Synthetic Time' })).data;
  const dev = await enrolledDevice([profile.profileId], 'Time catalog tablet');
  const ids = ['time-read-one-minute', 'game-finish-time', 'time-read-one-second', 'game-halfway-time'];
  const metas = [...ids.map(familyId => ({ familyId, concept: familyId, purpose: 'requestedTime', tier: 'fictional-time', grading: 'gate', evidenceClass: familyId.startsWith('time-read') ? 'literacy' : 'independent' })),
    { familyId: 'line-to-gain-exact', concept: 'line-to-gain', purpose: 'weakSpot', tier: 'within-10', grading: 'gate', evidenceClass: 'independent' }];
  const events = metas.flatMap(meta => {
    const questionInstanceId = randomUUID();
    const event = fields => ({ schemaVersion: 1, eventId: randomUUID(), deviceId: dev.deviceId, epochId: dev.epochId,
      seq: ++dev.seq, profileId: profile.profileId, game: 'football', gameVersion: '1.34.25',
      recordedAt: new Date().toISOString(), questionInstanceId, ...meta, ...fields });
    return [event({ kind: 'attempt', number: 1, correct: true, support: 'guided' }), event({ kind: 'resolution', resolution: 'firstTryCorrect' })];
  });
  for (const id of ids) assert.ok(bundle.includes(id), `${id} in deployed bundle bytes`);
  const response = await sync(dev, events);
  assert.equal(response.status, 200); assert.deepEqual(outcomes(response), events.map(() => 'accepted'));
  assert.deepEqual(outcomes(await sync(dev, events)), events.map(() => 'accepted'), 'same exact events replay safely');
  assert.equal(await count('SELECT count(*) AS n FROM events WHERE device_id = ?1', dev.deviceId), events.length);
  const report = await admin(`/api/report?profile=${profile.profileId}`);
  assert.equal(report.status, 200);
  const text = JSON.stringify(report.data);
  for (const meta of metas) {
    const row=report.data.football.rows.find(row=>row.concept===meta.concept);
    assert.ok(row, `${meta.concept} retained as a distinct report concept`);
    assert.equal(row.counts[meta.evidenceClass].guidedFirstTry, 1);
    assert.equal(row.counts[meta.evidenceClass==='literacy'?'independent':'literacy'].guidedFirstTry, 0);
  }
  const invalid = { ...events[0], eventId: randomUUID(), seq: ++dev.seq, evidenceClass: 'independent' };
  assert.deepEqual(outcomes(await sync(dev, [invalid])), ['invalid'], 'reading cannot be relabelled calculation');
});

// #215 local real-runtime consumer qualification; this is not hosted acceptance.
test('built Worker accepts all 26 closed coin families and rejects private or altered metadata',async()=>{
 const {CATALOG}=await import('../src/validator.js');
 const ids=Object.keys(CATALOG.football).filter(id=>id.startsWith('coin-'));assert.equal(ids.length,26);
 const profile=(await admin('/api/profiles',{label:'Synthetic Coins'})).data;
 const dev=await enrolledDevice([profile.profileId],'Coin catalog tablet');
 const make=(id,fields)=>({schemaVersion:1,eventId:randomUUID(),deviceId:dev.deviceId,epochId:dev.epochId,seq:++dev.seq,profileId:profile.profileId,game:'football',gameVersion:'1.34.26',recordedAt:new Date().toISOString(),questionInstanceId:randomUUID(),familyId:id,...CATALOG.football[id],...fields});
 const events=ids.flatMap(id=>[{kind:'attempt',number:1,correct:false,support:'initial'},{kind:'help',number:2,support:'guided'},{kind:'resolution',resolution:'retryCorrect'}].map(fields=>make(id,fields)));
 for(const id of ids)assert.ok(bundle.includes(id),`${id} in actual dry-run bundle`);
 for(let offset=0;offset<events.length;offset+=20){const batch=events.slice(offset,offset+20),response=await sync(dev,batch);assert.equal(response.status,200);assert.deepEqual(outcomes(response),batch.map(()=>'accepted'));}
 assert.equal(await count('SELECT count(*) AS n FROM events WHERE device_id = ?1',dev.deviceId),events.length);
 const invalid=ids.flatMap(id=>[
  {...make(id,{kind:'resolution',resolution:'retryCorrect'}),evidenceClass:CATALOG.football[id].evidenceClass==='literacy'?'independent':'literacy'},
  {...make(id,{kind:'resolution',resolution:'retryCorrect'}),coinFixture:{coins:[25,10]}}
 ]);
 for(let offset=0;offset<invalid.length;offset+=20){const batch=invalid.slice(offset,offset+20),response=await sync(dev,batch);assert.equal(response.status,200);assert.deepEqual(outcomes(response),batch.map(()=>'invalid'));}
 assert.equal(await count('SELECT count(*) AS n FROM events WHERE device_id = ?1',dev.deviceId),events.length,'private/altered rows are never stored');
});
