// Access JWT verification, default-deny routing, Origin/CSRF, device-credential proofs,
// body caps and the fixed statement budget, against stub bindings. No network: global
// fetch is replaced by a synthetic Access key server that denies every other URL.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { resetAccessCache, verifyAccess } from '../src/access.js';
import { csrfToken, destructiveStatements } from '../src/admin.js';
import { LIMITS, readConfig } from '../src/config.js';
import { AUTH_SQL, SYNC_SQL, authenticateDevice, planSync } from '../src/device.js';
import { createDb, SYSTEM } from '../src/db.js';
import { base64url, newDeviceToken, newEnrollmentCode, sha256Hex, CODE } from '../src/tokens.js';
import { handle } from '../src/worker.js';
import { runRetention, RETENTION_SQL } from '../src/retention.js';

const TEAM = 'https://synthetic-household.cloudflareaccess.com';
const AUD = 'a'.repeat(64);
const HOST = 'https://reports.synthetic.test';
const GAME = 'https://games.synthetic.test';
const INSTALLATION = '0123456789abcdef0123456789abcdef';
const CONFIRM_KEY = 'f'.repeat(64);
const enc = new TextEncoder();

async function keyPair(kid) {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { kid, privateKey: pair.privateKey, jwk: { kty: 'RSA', kid, alg: 'RS256', n: jwk.n, e: jwk.e, use: 'sig' } };
}
async function sign(key, claims, header = {}) {
  const head = base64url(enc.encode(JSON.stringify({ alg: 'RS256', kid: key.kid, typ: 'JWT', ...header })));
  const body = base64url(enc.encode(JSON.stringify(claims)));
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${base64url(signature)}`;
}
const nowS = () => Math.floor(Date.now() / 1000);
const claims = (overrides = {}) => ({ iss: TEAM, aud: [AUD], sub: 'synthetic-grown-up', iat: nowS() - 10, exp: nowS() + 600, ...overrides });

const keyServer = { keys: [], fetches: 0, denied: [], redirect: false };
// Mirrors workerd's fetch option check (it accepts only redirect 'follow' or 'manual');
// candidate 1 passed a Node stub that ignored options and failed in the real runtime.
globalThis.fetch = async (url, init = {}) => {
  if (init.redirect !== undefined && !['follow', 'manual'].includes(init.redirect)) throw new TypeError(`Invalid redirect value: ${init.redirect}`);
  if (String(url) === `${TEAM}/cdn-cgi/access/certs`) {
    keyServer.fetches++;
    if (keyServer.redirect) return new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example/certs' } });
    return new Response(JSON.stringify({ keys: keyServer.keys.map(key => key.jwk) }), { headers: { 'Content-Type': 'application/json' } });
  }
  keyServer.denied.push(String(url));
  return new Response('denied', { status: 403 });
};

const ENV = { REPORTING_ENABLED: 'true', ALLOWED_ORIGINS: GAME, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, RETENTION_DAYS: '90', DISPLAY_TIME_ZONE: 'UTC' };
const config = readConfig(ENV);
const withJwt = (jwt, init = {}) => new Request(`${HOST}/api/session`, { ...init, headers: { ...(init.headers || {}), 'Cf-Access-Jwt-Assertion': jwt } });

// A stub D1 that answers the system row and records every statement it is given. Like
// SQLite, an aggregate count(*) query always returns exactly one row.
const COUNT = /^\s*SELECT count\(\*\) AS (\w+) FROM/;
function stubD1(answer = sql => (COUNT.test(sql) ? [{ [COUNT.exec(sql)[1]]: 0 }] : [])) {
  const log = [];
  const prepared = sql => ({
    bind: (...params) => ({
      sql, params,
      first: async () => { log.push(sql); return sql === SYSTEM ? { installation: INSTALLATION, confirmKey: CONFIRM_KEY, scopeVersion: 3 } : answer(sql, params)[0] ?? null; },
      all: async () => { log.push(sql); return { results: answer(sql, params) }; },
      run: async () => { log.push(sql); return { meta: { changes: 1 } }; },
    }),
  });
  return { log, prepare: prepared, batch: async statements => statements.map(statement => { log.push(statement.sql); return { results: answer(statement.sql, statement.params) }; }) };
}

test('Access JWT: valid passes; forged, wrong issuer, audience, expired, future and alg-none fail; key rotation refetches', async () => {
  resetAccessCache();
  const k1 = await keyPair('k1'), k2 = await keyPair('k2'), attacker = await keyPair('k1');
  keyServer.keys = [k1];
  const check = jwt => verifyAccess(withJwt(jwt), config);
  assert.equal((await check(await sign(k1, claims()))).ok, true);
  assert.equal((await verifyAccess(new Request(`${HOST}/`), config)).reason, 'missing');
  assert.equal((await check('forged-header-value')).reason, 'malformed');
  assert.equal((await check(await sign(attacker, claims()))).reason, 'signature', 'same kid, other key: forged');
  assert.equal((await check(await sign(k1, claims({ iss: 'https://other.cloudflareaccess.com' })))).reason, 'issuer');
  assert.equal((await check(await sign(k1, claims({ aud: ['b'.repeat(64)] })))).reason, 'audience');
  assert.equal((await check(await sign(k1, claims({ exp: nowS() - 120 })))).reason, 'expired');
  assert.equal((await check(await sign(k1, claims({ nbf: nowS() + 600 })))).reason, 'not-yet-valid');
  assert.equal((await check(await sign(k1, claims({ iat: nowS() + 600 })))).reason, 'issued-in-future');
  assert.equal((await check(await sign(k1, claims({ sub: '' })))).reason, 'subject');
  const none = `${base64url(enc.encode(JSON.stringify({ alg: 'none', kid: 'k1' })))}.${base64url(enc.encode(JSON.stringify(claims())))}.`;
  assert.equal((await check(none)).ok, false);
  assert.equal((await check(await sign(k1, claims(), { alg: 'HS256' }))).reason, 'algorithm');
  // Rotation: a new kid triggers one refetch; the retired key then stops verifying.
  keyServer.keys = [k2];
  const before = keyServer.fetches;
  assert.equal((await verifyAccess(withJwt(await sign(k2, claims())), config, { now: Date.now() + 31000 })).ok, true);
  assert.equal(keyServer.fetches, before + 1);
  // The retired kid is no longer published, so its tokens are refused as an unknown key.
  const retired = await verifyAccess(withJwt(await sign(k1, claims())), config, { now: Date.now() + 31000 });
  assert.deepEqual([retired.ok, retired.reason, retired.status], [false, 'unknown-key', 401]);
  assert.equal(keyServer.fetches, before + 1, 'a retired kid within the refresh interval causes no extra fetch');
  // A redirected key URL is never followed: with no usable cached keys, fail closed.
  resetAccessCache();
  keyServer.redirect = true;
  const redirected = await verifyAccess(withJwt(await sign(k2, claims())), config);
  keyServer.redirect = false;
  assert.deepEqual([redirected.ok, redirected.reason, redirected.status], [false, 'certs-unavailable', 503]);
  // Not configured: fail closed.
  assert.equal((await verifyAccess(withJwt('x.y.z'), readConfig({ ...ENV, ACCESS_AUD: '' }))).status, 503);
  assert.deepEqual(keyServer.denied, []);
});

test('every non-device route, including dashboard assets and unknown paths, is denied without a valid JWT', async () => {
  resetAccessCache();
  const env = { ...ENV, DB: stubD1() };
  for (const path of ['/', '/app.js', '/app.css', '/api/session', '/api/overview', '/api/report', '/api/export', '/api/devices', '/nope', '/v1/other']) {
    for (const method of ['GET', 'POST']) {
      const response = await handle(new Request(`${HOST}${path}`, { method, headers: { 'Cf-Access-Jwt-Assertion': 'forged.header.value', Origin: HOST } }), env);
      assert.equal(response.status, 401, `${method} ${path}`);
    }
  }
  assert.deepEqual(env.DB.log, [], 'rejected before any database access');
});

test('cookie mutations need the exact same Origin, same-origin fetch metadata and the session-bound CSRF token', async () => {
  resetAccessCache();
  const k1 = await keyPair('k1');
  keyServer.keys = [k1];
  const jwt = await sign(k1, claims());
  const session = await sha256Hex(`synthetic-grown-up|${claims().iat}`);
  const csrf = await csrfToken({ installation: INSTALLATION, confirmKey: CONFIRM_KEY }, session);
  const env = { ...ENV, DB: stubD1() };
  const post = headers => handle(new Request(`${HOST}/api/preview`, { method: 'POST', body: JSON.stringify({ action: 'delete-all', target: null }),
    headers: { 'Cf-Access-Jwt-Assertion': jwt, 'Content-Type': 'application/json', ...headers } }), env);
  assert.equal((await post({ Origin: 'https://evil.example', 'X-CSRF-Token': csrf })).status, 403, 'cross-site');
  assert.equal((await post({ 'X-CSRF-Token': csrf })).status, 403, 'no Origin');
  assert.equal((await post({ Origin: HOST, 'Sec-Fetch-Site': 'cross-site', 'X-CSRF-Token': csrf })).status, 403);
  assert.equal((await post({ Origin: HOST })).status, 403, 'no CSRF token');
  assert.equal((await post({ Origin: HOST, 'X-CSRF-Token': 'f'.repeat(64) })).status, 403, 'wrong CSRF token');
  const other = await csrfToken({ installation: INSTALLATION, confirmKey: CONFIRM_KEY }, await sha256Hex('someone-else|1'));
  assert.equal((await post({ Origin: HOST, 'X-CSRF-Token': other })).status, 403, 'another session’s token');
  assert.equal((await post({ Origin: HOST, 'Sec-Fetch-Site': 'same-origin', 'X-CSRF-Token': csrf })).status, 200);
  const form = await handle(new Request(`${HOST}/api/preview`, { method: 'POST', body: 'action=delete-all',
    headers: { 'Cf-Access-Jwt-Assertion': jwt, 'Content-Type': 'application/x-www-form-urlencoded', Origin: HOST, 'X-CSRF-Token': csrf } }), env);
  assert.equal(form.status, 415, 'a form post is not JSON');
});

test('device routes: disabled, missing or foreign Origin, preflight, and no read access with a token', async () => {
  const env = { ...ENV, DB: stubD1(), SYNC_LIMITER: { limit: async () => ({ success: true }) }, ENROLL_LIMITER: { limit: async () => ({ success: true }) } };
  const req = (path, init) => handle(new Request(`${HOST}${path}`, init), env);
  assert.equal((await handle(new Request(`${HOST}/v1/sync`, { method: 'POST', headers: { Origin: GAME } }), { ...env, REPORTING_ENABLED: 'false' })).status, 503);
  assert.equal((await req('/v1/sync', { method: 'POST' })).status, 403);
  assert.equal((await req('/v1/sync', { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
  const preflight = await req('/v1/sync', { method: 'OPTIONS', headers: { Origin: GAME, 'Access-Control-Request-Method': 'POST' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), GAME);
  assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal((await req('/v1/sync', { method: 'GET', headers: { Origin: GAME } })).status, 405);
  // A device token is not an Access JWT: every read route is denied.
  const token = newDeviceToken(INSTALLATION);
  for (const path of ['/api/report', '/api/export', '/api/devices', '/']) {
    assert.equal((await req(path, { headers: { Authorization: `Bearer ${token}` } })).status, 401, path);
  }
  const noLimiter = await handle(new Request(`${HOST}/v1/enroll`, { method: 'POST', headers: { Origin: GAME, 'Content-Type': 'application/json' }, body: '{}' }), { ...env, ENROLL_LIMITER: undefined });
  assert.equal(noLimiter.status, 503, 'a missing rate-limit binding fails closed');
});

test('device credentials: active authenticates; revoked hash and erased installation are revoked; anything else is invalid', async () => {
  const token = newDeviceToken(INSTALLATION), hash = await sha256Hex(token), deviceId = randomUUID();
  const rows = { active: { installation: INSTALLATION, deviceId, revoked: 0 }, revoked: { installation: INSTALLATION, deviceId: null, revoked: 1 }, unknown: { installation: INSTALLATION, deviceId: null, revoked: 0 } };
  const auth = async (row, header) => authenticateDevice(createDb(stubD1(sql => (sql === AUTH_SQL ? [row] : [])), 49), header);
  assert.deepEqual(await auth(rows.active, `Bearer ${token}`), { deviceId, tokenHash: hash, installation: INSTALLATION });
  assert.equal((await auth(rows.revoked, `Bearer ${token}`)).error, 'revoked');
  assert.equal((await auth(rows.unknown, `Bearer ${token}`)).error, 'invalid-credential', 'parseable is not proof of issuance');
  assert.equal((await auth(rows.unknown, `Bearer ${newDeviceToken('f'.repeat(32))}`)).error, 'revoked', 'an erased installation');
  assert.equal((await auth(rows.active, `Bearer ${token.slice(0, -1)}`)).error, 'invalid-credential', 'malformed');
  assert.equal((await auth(rows.active, token)).error, 'invalid-credential', 'no Bearer scheme');
  assert.equal((await auth(rows.active, null)).error, 'invalid-credential');
});

test('enrollment codes carry 130 random bits in 26 Crockford characters', () => {
  const codes = new Set(Array.from({ length: 200 }, newEnrollmentCode));
  assert.equal(codes.size, 200);
  for (const code of codes) assert.match(code, CODE);
});

test('sync plan: strict allowlist, device binding, unknown versions unsupported, duplicates and future seq invalid', () => {
  const deviceId = randomUUID(), epochId = randomUUID(), profileId = randomUUID();
  const event = (seq, extra = {}) => ({ schemaVersion: 1, eventId: randomUUID(), deviceId, epochId, seq, profileId, game: 'facts', gameVersion: '1.9.2',
    recordedAt: '2026-10-21T10:00:00.000Z', kind: 'leftUnfinished', questionInstanceId: randomUUID(), factId: 'add:7:6', family: 'family:6:7:13', ...extra });
  const status = { schemaVersion: 1, deviceId, epochId, highestSeq: 3, droppedLocal: 0, writeFailures: 0 };
  const good = event(1), dup = { ...event(2), eventId: good.eventId };
  const plan = planSync({ schemaVersion: 1, status, events: [good, event(2, { prompt: '7 + 6' }), event(3, { deviceId: randomUUID() }), dup, event(9)] }, deviceId);
  assert.equal(plan.status, 200);
  assert.deepEqual(plan.results.map(item => item?.outcome ?? 'pending'), ['pending', 'invalid', 'invalid', 'invalid', 'invalid']);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].row.payload.includes('prompt'), false);
  assert.equal(planSync({ schemaVersion: 2, status, events: [] }, deviceId).status, 422);
  assert.equal(planSync({ schemaVersion: 1, status, events: [{ ...good, schemaVersion: 3 }] }, deviceId).status, 422);
  assert.equal(planSync({ schemaVersion: 1, status: { ...status, deviceId: randomUUID() }, events: [] }, deviceId).status, 400);
  assert.equal(planSync({ schemaVersion: 1, status, events: Array.from({ length: 21 }, (_, i) => event(i + 1)) }, deviceId).status, 413);
  assert.equal(planSync({ schemaVersion: 1, status, events: [], extra: 1 }, deviceId).status, 400);
});

test('a maximal 20-event sync uses exactly 7 statements (1 auth + 6 in one batch) and at most 9 bound parameters each; oversized bodies stop at the cap', async () => {
  const token = newDeviceToken(INSTALLATION), deviceId = randomUUID(), epochId = randomUUID(), profileId = randomUUID();
  const events = Array.from({ length: 20 }, (_, i) => ({ schemaVersion: 1, eventId: randomUUID(), deviceId, epochId, seq: i + 1, profileId, game: 'facts',
    gameVersion: '1.9.2', recordedAt: '2026-10-21T10:00:00.000Z', kind: 'leftUnfinished', questionInstanceId: randomUUID(), factId: 'add:7:6', family: 'family:6:7:13' }));
  const d1 = stubD1((sql, params) => {
    if (sql === AUTH_SQL) return [{ installation: INSTALLATION, deviceId, revoked: 0 }];
    if (sql === SYNC_SQL.receipt) return JSON.parse(params[4]).map((row, i) => ({ i, eventId: row.eventId, outcome: 'accepted' }));
    return [];
  });
  const statements = [];
  const counting = { ...d1, batch: async list => { statements.push(...list.map(item => item.params.length)); return d1.batch(list); } };
  const env = { ...ENV, DB: counting, SYNC_LIMITER: { limit: async () => ({ success: true }) } };
  const body = JSON.stringify({ schemaVersion: 1, status: { schemaVersion: 1, deviceId, epochId, highestSeq: 20, droppedLocal: 0, writeFailures: 0 }, events });
  const response = await handle(new Request(`${HOST}/v1/sync`, { method: 'POST', body, headers: { Origin: GAME, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results.every(item => item.outcome === 'accepted'), true);
  assert.equal(d1.log.length, 7);
  assert.equal(statements.length, 6, 'one atomic batch');
  assert.ok(statements.every(count => count <= 9));
  const big = await handle(new Request(`${HOST}/v1/sync`, { method: 'POST', body: 'x'.repeat(70000), headers: { Origin: GAME, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }), env);
  assert.equal(big.status, 413);
});

test('every destructive statement after the guard requires this operation’s own guard row', () => {
  const op = randomUUID();
  for (const action of ['delete-profile', 'delete-device', 'revoke-device', 'delete-all']) {
    const list = destructiveStatements(action, action === 'delete-all' ? null : randomUUID(), op, 7, INSTALLATION, Date.now());
    assert.match(list[0][0], /scope_version = \?5 AND installation = \?6/);
    for (const [sql] of list.slice(1, -1)) assert.match(sql, /EXISTS \(SELECT 1 FROM operations WHERE op_id = \?1\)/, `${action}: ${sql}`);
    assert.match(list.at(-1)[0], /^DELETE FROM operations/);
    assert.ok(list.length < 49);
  }
});


test('scheduled retention shares the 49-statement budget, stops at 47 queries and reports continuation', async () => {
  const d1 = stubD1(sql => sql === RETENTION_SQL.remaining ? [{ remaining: 1 }] : []);
  const result = await runRetention({ ...ENV, DB: d1 }, Date.now());
  assert.deepEqual(result, { rounds: 15, remaining: 1 });
  assert.equal(d1.log.length, 47, '15 rounds of three queries plus two cleanup queries');
  assert.ok(d1.log.length <= LIMITS.statementBudget && LIMITS.statementBudget < 50);
  assert.equal(d1.log.filter(sql => sql === RETENTION_SQL.receipts).length, 15);
  assert.deepEqual(d1.log.slice(-2), [RETENTION_SQL.codes, RETENTION_SQL.operations]);
});
