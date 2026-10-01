import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, stat, readdir, rm, symlink, realpath, chmod, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { authorize, parseClient, parseArguments, SCOPES, saveCredentials, checkDestination, readClient } from '../scripts/authorize-google.mjs';

const exec = promisify(execFile);
const client = { client_id: 'fixture.apps.googleusercontent.com', client_secret: 'synthetic-client-secret' };
const successfulTokens = { scope: SCOPES.join(' '), refresh_token: 'synthetic-refresh-token' };
const response = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
function callbackFor(authorizationUrl) {
  const auth = new URL(authorizationUrl);
  const callback = new URL(auth.searchParams.get('redirect_uri'));
  callback.searchParams.set('state', auth.searchParams.get('state'));
  callback.searchParams.set('code', 'synthetic-code');
  return callback;
}
async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'kayak-oauth-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return await realpath(directory);
}

test('validates Desktop credentials and CLI input without echoing secrets', () => {
  assert.deepEqual(parseClient({ installed: client }), client);
  assert.throws(() => parseClient({ web: client }), /Desktop/);
  assert.throws(() => parseArguments(['--email', 'bad\r\nBcc:other@example.com']), /Provide/);
  assert.throws(() => parseArguments(['--client', 'a', '--client', 'b']), /Usage/);
  const options = parseArguments(['--client', '/private/client.json', '--email', 'owner@example.com', '--spreadsheet', 'syntheticSheetId', '--output', '/private/credentials/output.json']);
  assert.equal(options.email, 'owner@example.com');
});

test('loopback callback exchanges one code with matching S256 verifier and both scopes', async () => {
  let auth;
  let calls = 0;
  let callbackUrl;
  const tokens = await authorize({ client, timeoutMs: 2000,
    onReady: async url => {
      auth = new URL(url);
      callbackUrl = callbackFor(url);
      assert.equal(auth.origin, 'https://accounts.google.com');
      assert.equal(auth.searchParams.get('access_type'), 'offline');
      assert.equal(auth.searchParams.get('prompt'), 'consent');
      assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
      assert.equal(callbackUrl.hostname, '127.0.0.1');
      assert.ok(callbackUrl.port);
      const result = await fetch(callbackUrl);
      assert.equal(result.status, 200);
      assert.doesNotMatch(await result.text(), /synthetic/);
    },
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://oauth2.googleapis.com/token');
      assert.equal(options.redirect, 'error');
      assert.equal(options.body.get('code'), 'synthetic-code');
      assert.equal(options.body.get('client_secret'), client.client_secret);
      assert.equal(options.body.get('redirect_uri'), auth.searchParams.get('redirect_uri'));
      assert.equal(createHash('sha256').update(options.body.get('code_verifier')).digest('base64url'), auth.searchParams.get('code_challenge'));
      return response(successfulTokens);
    } });
  assert.deepEqual(tokens, { refreshToken: 'synthetic-refresh-token' });
  assert.equal(calls, 1);
  await assert.rejects(fetch(callbackUrl));
});

test('invalid state, duplicate state/code, wrong path and method cannot consume authorization', async () => {
  let calls = 0;
  const tokens = await authorize({ client, timeoutMs: 3000,
    fetchImpl: async () => { calls++; return response(successfulTokens); },
    onReady: async url => {
      const valid = callbackFor(url);
      const badState = new URL(valid); badState.searchParams.set('state', 'wrong');
      assert.equal((await fetch(badState)).status, 400);
      const duplicateState = new URL(valid); duplicateState.searchParams.append('state', 'wrong');
      assert.equal((await fetch(duplicateState)).status, 400);
      const duplicateCode = new URL(valid); duplicateCode.searchParams.append('code', 'another');
      assert.equal((await fetch(duplicateCode)).status, 400);
      const wrongPath = new URL(valid); wrongPath.pathname = '/unrelated';
      assert.equal((await fetch(wrongPath)).status, 404);
      assert.equal((await fetch(valid, { method: 'POST' })).status, 400);
      assert.equal(calls, 0);
      assert.equal((await fetch(valid)).status, 200);
    } });
  assert.equal(tokens.refreshToken, successfulTokens.refresh_token);
  assert.equal(calls, 1);
});

test('rejects partial consent and missing refresh token', async () => {
  for (const [fixture, message] of [
    [{ ...successfulTokens, scope: SCOPES[0] }, /both required scopes/],
    [{ scope: SCOPES.join(' ') }, /offline refresh token/],
    [{ ...successfulTokens, scope: undefined }, /both required scopes/],
  ]) {
    await assert.rejects(authorize({ client, timeoutMs: 2000,
      onReady: url => fetch(callbackFor(url)), fetchImpl: async () => response(fixture) }), message);
  }
});

test('token exchange failures never expose Google response or thrown secret data', async () => {
  for (const fetchImpl of [
    async () => new Response('synthetic-secret-error', { status: 400 }),
    async () => { throw new Error('synthetic-secret-error'); },
  ]) {
    await assert.rejects(authorize({ client, timeoutMs: 2000, onReady: url => fetch(callbackFor(url)), fetchImpl }),
      error => error.message.includes('token exchange failed') && !error.message.includes('synthetic'));
  }
});

test('denied consent and timeout produce no token request and close listener', async () => {
  let calls = 0;
  await assert.rejects(authorize({ client, timeoutMs: 2000,
    fetchImpl: async () => { calls++; return response(successfulTokens); },
    onReady: async url => {
      const denied = callbackFor(url); denied.searchParams.delete('code'); denied.searchParams.set('error', 'access_denied');
      await fetch(denied).catch(() => {});
    } }), /not granted/);
  let pendingUrl;
  await assert.rejects(authorize({ client, timeoutMs: 30, onReady: async url => { pendingUrl = callbackFor(url); },
    fetchImpl: async () => { calls++; return response(successfulTokens); } }), /timed out/);
  assert.equal(calls, 0);
  await assert.rejects(fetch(pendingUrl));
});

test('credential preflight rejects checkout paths, relative paths, and public directories', async t => {
  const directory = await temporaryDirectory(t);
  const destination = join(directory, 'credentials.json');
  assert.equal(await checkDestination(destination), destination);
  await assert.rejects(checkDestination('relative.json'), /absolute/);
  const service = dirname(dirname(fileURLToPath(import.meta.url)));
  await assert.rejects(checkDestination(join(service, 'credentials.json')), /outside the game checkout/);
  await chmod(directory, 0o755);
  await assert.rejects(checkDestination(destination), /0700/);
  await chmod(directory, 0o700);
  await exec('git', ['init', '--quiet', directory]);
  await assert.rejects(checkDestination(destination), /outside Git checkouts/);
});

test('credential files publish as external JSON at mode 0600 and refuse replacement', async t => {
  const directory = await temporaryDirectory(t);
  const destination = join(directory, 'credentials.json');
  const credentials = { GOOGLE_REFRESH_TOKEN: 'synthetic-refresh-token', NOTIFICATION_EMAIL: 'owner@example.com' };
  await saveCredentials(destination, credentials);
  assert.equal((await stat(destination)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(destination, 'utf8')), credentials);
  await assert.rejects(saveCredentials(destination, { GOOGLE_REFRESH_TOKEN: 'replacement' }), /already exists/);
  assert.match(await readFile(destination, 'utf8'), /synthetic-refresh-token/);
  assert.deepEqual((await readdir(directory)).filter(file => file.endsWith('.tmp')), []);
});

test('credential publication refuses destination and directory symlinks', async t => {
  const directory = await temporaryDirectory(t);
  const other = join(directory, 'other');
  await writeFile(other, 'untouched');
  await symlink(other, join(directory, 'credentials.json'));
  await assert.rejects(saveCredentials(join(directory, 'credentials.json'), { GOOGLE_REFRESH_TOKEN: 'synthetic' }), /already exists/);
  assert.equal(await readFile(other, 'utf8'), 'untouched');
  const nested = join(directory, 'private');
  await mkdir(nested, { mode: 0o700 });
  await symlink(nested, join(directory, 'alias'));
  await assert.rejects(checkDestination(join(directory, 'alias', 'output.json')), /symbolic links/);
});

test('client credential input must also remain outside the served checkout and avoid symlinks', async t => {
  const directory = await temporaryDirectory(t);
  const input = join(directory, 'client.json');
  await writeFile(input, JSON.stringify({ installed: client }), { mode: 0o600 });
  assert.deepEqual(await readClient(input), client);
  await symlink(input, join(directory, 'linked-client.json'));
  await assert.rejects(readClient(join(directory, 'linked-client.json')), /regular file/);
  await assert.rejects(readClient(fileURLToPath(import.meta.url)), /outside the game checkout/);
});

test('concurrent duplicate callback cannot exchange the same authorization code twice', async () => {
  let exchanges = 0;
  let release;
  let callbacksFinished;
  const callbackChecks = new Promise(resolve => { callbacksFinished = resolve; });
  const pendingTokens = new Promise(resolve => { release = resolve; });
  const tokens = await authorize({ client, timeoutMs: 2000,
    fetchImpl: async () => { exchanges++; await pendingTokens; return response(successfulTokens); },
    onReady: async url => {
      const callback = callbackFor(url);
      assert.equal((await fetch(callback)).status, 200);
      assert.equal((await fetch(callback)).status, 409);
      assert.equal(exchanges, 1);
      callbacksFinished();
      release();
    } });
  await callbackChecks;
  assert.equal(tokens.refreshToken, successfulTokens.refresh_token);
  assert.equal(exchanges, 1);
});

test('authorization deadline aborts a stalled token exchange', async () => {
  let receivedSignal;
  await assert.rejects(authorize({ client, timeoutMs: 40,
    onReady: url => fetch(callbackFor(url)),
    fetchImpl: async (_url, options) => {
      receivedSignal = options.signal;
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    } }), /timed out/);
  assert.ok(receivedSignal.aborted);
});
