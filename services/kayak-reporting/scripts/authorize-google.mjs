#!/usr/bin/env node
import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile, open, link, unlink, lstat, realpath } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve, isAbsolute, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const SERVICE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.send',
]);

export function parseClient(document) {
  const client = document?.installed;
  if (!client || typeof client.client_id !== 'string' || !client.client_id.endsWith('.apps.googleusercontent.com') ||
      typeof client.client_secret !== 'string' || !client.client_secret.trim()) {
    throw new Error('Use the downloaded Google OAuth Desktop app client JSON.');
  }
  return { client_id: client.client_id, client_secret: client.client_secret };
}

export function parseArguments(args) {
  const allowed = new Set(['--client', '--email', '--spreadsheet', '--output']);
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!allowed.has(key) || result[key] || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error('Usage: node scripts/authorize-google.mjs --client /private/path/client.json --email owner@example.com --spreadsheet SHEET_ID --output /private/credentials/kayak.json');
    }
    result[key] = args[i + 1];
  }
  if (allowed.size !== Object.keys(result).length || !isAbsolute(result['--client']) || !isAbsolute(result['--output']) ||
      !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(result['--email']) ||
      !/^[A-Za-z0-9_-]{10,200}$/.test(result['--spreadsheet'])) {
    throw new Error('Provide absolute client/output JSON paths outside the checkout, a valid notification email, and spreadsheet ID.');
  }
  return { clientPath: resolve(result['--client']), outputPath: resolve(result['--output']), email: result['--email'], spreadsheetId: result['--spreadsheet'] };
}

function equalState(actual, expected) {
  if (typeof actual !== 'string') return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function authorize({ client, onReady, fetchImpl = globalThis.fetch, timeoutMs = 300_000 }) {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(64).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  let redirectUri;
  let busy = false;
  let completed = false;
  let timer;
  let resolveResult;
  let rejectResult;
  const controller = new AbortController();
  const result = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  // Attach immediately: a short timeout or browser failure must not produce an unhandled rejection.
  result.catch(() => {});
  const finish = (error, value) => {
    if (completed) return;
    completed = true;
    clearTimeout(timer);
    controller.abort();
    server.close();
    server.closeAllConnections();
    if (error) rejectResult(error);
    else resolveResult(value);
  };
  const server = createServer(async (request, response) => {
    const reply = (status, text) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'", 'Connection': 'close' });
      response.end(text);
    };
    if (request.method !== 'GET' || !request.url || request.url.length > 8192 || request.headers.host !== new URL(redirectUri).host) {
      reply(400, 'Invalid authorization response.'); return;
    }
    let callback;
    try { callback = new URL(request.url, redirectUri); } catch { reply(400, 'Invalid authorization response.'); return; }
    if (callback.pathname !== '/oauth/callback' || callback.origin !== new URL(redirectUri).origin) {
      reply(404, 'Not found.'); return;
    }
    if (callback.searchParams.getAll('state').length !== 1 || !equalState(callback.searchParams.get('state'), state)) {
      reply(400, 'Invalid authorization state. Return to the original Google consent page.'); return;
    }
    if (busy || completed) { reply(409, 'Authorization already received.'); return; }
    if (callback.searchParams.has('error')) {
      reply(400, 'Google authorization was not granted. Return to the terminal.');
      finish(new Error('Google authorization was not granted.')); return;
    }
    const codes = callback.searchParams.getAll('code');
    if (codes.length !== 1 || !codes[0] || codes[0].length > 4096) {
      reply(400, 'Invalid authorization response.'); return;
    }
    busy = true;
    reply(200, 'Authorization received. Close this tab and return to the terminal for the result.');
    try {
      const tokenResponse = await fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret,
          code: codes[0], code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirectUri }),
      });
      if (!tokenResponse.ok) throw new Error('exchange');
      const tokens = await tokenResponse.json();
      const granted = typeof tokens.scope === 'string' ? new Set(tokens.scope.split(/\s+/)) : new Set();
      if (!SCOPES.every(scope => granted.has(scope))) {
        finish(new Error('Google did not confirm both required scopes. Grant Sheets and Gmail send access.')); return;
      }
      if (typeof tokens.refresh_token !== 'string' || !tokens.refresh_token.trim()) {
        finish(new Error('Google did not return an offline refresh token. Reauthorize with consent.')); return;
      }
      finish(null, { refreshToken: tokens.refresh_token });
    } catch {
      finish(new Error('Google token exchange failed. No credentials were saved; retry authorization.'));
    }
  });
  server.on('error', () => finish(new Error('The local authorization listener failed.')));
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  }).catch(() => { throw new Error('Unable to open the local authorization listener.'); });
  redirectUri = `http://127.0.0.1:${server.address().port}/oauth/callback`;
  const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorizationUrl.search = new URLSearchParams({ client_id: client.client_id, redirect_uri: redirectUri,
    response_type: 'code', scope: SCOPES.join(' '), state, code_challenge: challenge,
    code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent' }).toString();
  timer = setTimeout(() => finish(new Error('Google authorization timed out. Run the helper again.')), timeoutMs);
  try { await onReady(authorizationUrl.toString()); }
  catch { finish(new Error('Unable to open the system browser. No credentials were saved.')); }
  return result;
}

async function privateExternalPath(path) {
  if (!isAbsolute(path)) throw new Error('Credential paths must be absolute and outside Git checkouts.');
  const directory = await realpath(dirname(path));
  if (directory !== resolve(dirname(path))) throw new Error('Credential paths must not traverse symbolic links. Use the canonical path.');
  const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: SERVICE_DIR });
  const checkout = await realpath(stdout.trim());
  const inside = relative(checkout, directory);
  if (inside === '' || (!inside.startsWith('..' + '/') && inside !== '..' && !isAbsolute(inside))) {
    throw new Error('Credential files must remain outside the game checkout.');
  }
  for (let ancestor = directory; ; ancestor = dirname(ancestor)) {
    let markerExists = false;
    try {
      await lstat(join(ancestor, '.git'));
      markerExists = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Unable to verify that credentials are outside Git checkouts.');
    }
    if (markerExists) throw new Error('Credential files must remain outside Git checkouts.');
    if (dirname(ancestor) === ancestor) break;
  }
  return { path: join(directory, path.slice(path.lastIndexOf('/') + 1)), directory };
}

export async function checkDestination(outputPath) {
  const { path: destination, directory } = await privateExternalPath(outputPath);
  const parent = await lstat(directory);
  if (!parent.isDirectory() || (parent.mode & 0o777) !== 0o700 || parent.uid !== process.getuid()) {
    throw new Error('The output directory must be owned by you with mode 0700. Create a private directory outside the checkout.');
  }
  try { await lstat(destination); throw new Error('exists'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error('The output file already exists. Choose a new output path; existing files are never replaced.');
  }
  return destination;
}

export async function readClient(clientPath) {
  const { path } = await privateExternalPath(clientPath);
  const entry = await lstat(path);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('The Google client JSON must be a regular file outside Git checkouts.');
  try { return parseClient(JSON.parse(await readFile(path, 'utf8'))); }
  catch { throw new Error('Unable to read a valid Google OAuth Desktop app client JSON.'); }
}

export async function saveCredentials(outputPath, credentials) {
  const destination = await checkDestination(outputPath);
  // An owner-only external directory prevents the game server from serving credentials.
  // Link publishes atomically and cannot replace an existing file or symbolic link.
  const temporary = join(dirname(destination), `.kayak-credentials-${randomBytes(16).toString('hex')}.tmp`);
  let file;
  try {
    file = await open(temporary, 'wx', 0o600);
    await file.writeFile(JSON.stringify(credentials, null, 2) + '\n');
    await file.sync();
    await file.close();
    file = undefined;
    await link(temporary, destination);
  } catch {
    throw new Error('Unable to save credentials securely. Existing files were not replaced.');
  } finally {
    if (file) await file.close();
    await unlink(temporary).catch(() => {});
  }
}

function openBrowser(url) {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : null;
    if (!command) { reject(new Error('Unsupported system browser launcher.')); return; }
    const child = spawn(command, [url], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Browser launch failed.')));
  });
}

export async function main(args) {
  const options = parseArguments(args);
  const destination = await checkDestination(options.outputPath);
  const client = await readClient(options.clientPath);
  const { refreshToken } = await authorize({ client, onReady: url => {
    console.log('Opening Google consent in your system browser. The local listener is ready; do not paste codes into chat.');
    return openBrowser(url);
  } });
  await saveCredentials(destination, { GOOGLE_CLIENT_ID: client.client_id, GOOGLE_CLIENT_SECRET: client.client_secret,
    GOOGLE_REFRESH_TOKEN: refreshToken, NOTIFICATION_EMAIL: options.email, SPREADSHEET_ID: options.spreadsheetId });
  console.log('Saved credentials to the requested external JSON file with owner-only permissions. No spreadsheet row or email was sent.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
