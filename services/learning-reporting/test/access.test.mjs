// Access session binding: the CSRF/confirmation session is derived from the verified JWT's
// sub and iat. One Access session (one JWT) must stay one session as time passes; a
// different sign-in (iat) or identity (sub) is a different session. Synthetic keys only;
// global fetch is a local key server that denies every other URL.
import assert from 'node:assert/strict';
import test from 'node:test';
import { resetAccessCache, verifyAccess } from '../src/access.js';
import { readConfig } from '../src/config.js';
import { base64url } from '../src/tokens.js';

const TEAM = 'https://synthetic-household.cloudflareaccess.com';
const AUD = 'e'.repeat(64);
const enc = new TextEncoder();
const config = readConfig({ REPORTING_ENABLED: 'true', ALLOWED_ORIGINS: 'https://games.synthetic.test', ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, RETENTION_DAYS: '90', DISPLAY_TIME_ZONE: 'UTC' });

const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
const denied = [];
globalThis.fetch = async (url, init = {}) => {
  if (init.redirect !== undefined && !['follow', 'manual'].includes(init.redirect)) throw new TypeError(`Invalid redirect value: ${init.redirect}`);
  if (String(url) === `${TEAM}/cdn-cgi/access/certs`) return new Response(JSON.stringify({ keys: [{ kty: 'RSA', kid: 's1', alg: 'RS256', n: jwk.n, e: jwk.e }] }));
  denied.push(String(url));
  return new Response('denied', { status: 403 });
};
async function sign(claims) {
  const head = base64url(enc.encode(JSON.stringify({ alg: 'RS256', kid: 's1', typ: 'JWT' })));
  const body = base64url(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${base64url(sig)}`;
}
const at = (token, now) => verifyAccess(new Request('https://reports.synthetic.test/', { headers: { 'Cf-Access-Jwt-Assertion': token } }), config, { now });

test('one Access JWT is one stable session across seconds and minutes; another iat or sub is another session', async () => {
  resetAccessCache();
  const start = Date.parse('2026-10-21T17:00:00.400Z'), iat = Math.floor(start / 1000) - 5;
  const claims = { iss: TEAM, aud: [AUD], sub: 'synthetic-grown-up', iat, exp: iat + 3600 };
  const token = await sign(claims);
  const sessions = [];
  // Across a second boundary, and much later within the token's life.
  for (const now of [start, start + 700, start + 1700, start + 30 * 60 * 1000]) {
    const result = await at(token, now);
    assert.equal(result.ok, true);
    sessions.push(result.session);
  }
  assert.equal(new Set(sessions).size, 1, 'the same session throughout');
  assert.match(sessions[0], /^[0-9a-f]{64}$/);
  assert.equal(sessions[0].includes('synthetic-grown-up'), false, 'the identity is hashed, not exposed');
  const later = await at(await sign({ ...claims, iat: iat + 1 }), start + 1700);
  const other = await at(await sign({ ...claims, sub: 'synthetic-other-grown-up' }), start);
  assert.equal(later.ok && other.ok, true);
  assert.notEqual(later.session, sessions[0], 'a new sign-in is a new session');
  assert.notEqual(other.session, sessions[0], 'another identity is another session');
  assert.deepEqual(denied, []);
});
