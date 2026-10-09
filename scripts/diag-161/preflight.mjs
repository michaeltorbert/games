// Issue #161 preflight. No browser is launched. Checks tool versions, diagnostic
// config parity with the base config, the fresh release selection, static mute
// coverage, port/origin assumptions, and that the logged server is byte- and
// error-path identical to scripts/serve-root.mjs (including the default 400
// clientError reply and the default malformed-URI crash).
//   node scripts/diag-161/preflight.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  CONFIG, DIAG_DIR, PORT, PROJECTS, PW_CLI, REPO, envRecord, newRunDir, portFree, readJsonl, run,
  releaseSelection, scrubbedEnv, sha256File, sourceFingerprint, toolVersions, writeManifest, writeOnce,
} from './lib.mjs';

const RAW_PORT = 18161;
const LOGGED_PORT = 18162;
const { id, dir } = newRunDir('preflight');
const results = [];
const check = (name, ok, detail = null) => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `\n      ${JSON.stringify(detail).slice(0, 800)}` : ''}`);
};
const note = (name, detail) => { results.push({ name, ok: null, detail }); console.log(`NOTE  ${name}: ${JSON.stringify(detail).slice(0, 400)}`); };
const strip = (o, keys) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !keys.includes(k)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 1. Versions and executables.
const versions = toolVersions();
const { webkit } = await import('playwright-core');
check('Playwright packages are 1.56.1', [versions.playwrightTest, versions.playwright, versions.playwrightCore].every(v => v === '1.56.1'), versions);
check('installed WebKit revision is 2215', versions.webkitRevision === '2215', versions.webkitRevision);
check('WebKit executable present', fs.existsSync(webkit.executablePath()), webkit.executablePath());
check('Playwright CLI present', fs.existsSync(PW_CLI), PW_CLI);
check('ISSUE49_CAPTURE_STAGE unset (children scrub it regardless)', !process.env.ISSUE49_CAPTURE_STAGE, envRecord(process.env));

// 2. Config parity.
process.env.DIAG161_MODE = 'arm';
process.env.DIAG161_RUN_DIR = dir;
process.env.DIAG161_TRACE = 'on';
const base = (await import(pathToFileURL(path.join(REPO, 'playwright.config.mjs')).href)).default;
const diag = (await import(pathToFileURL(CONFIG).href)).default;
const changed = ['testDir', 'outputDir', 'reporter', 'use', 'projects', 'webServer'];
check('six projects, same names and order', same(diag.projects.map(p => p.name), PROJECTS) && same(base.projects.map(p => p.name), PROJECTS));
check('each project unchanged except use.browserName=webkit', diag.projects.every((p, i) =>
  p.use.browserName === 'webkit' && same(strip(p.use, ['browserName']), base.projects[i].use) && same(strip(p, ['use']), strip(base.projects[i], ['use']))));
check('global use unchanged except browserName=webkit and trace', diag.use.browserName === 'webkit' && same(strip(diag.use, ['browserName', 'trace']), strip(base.use, ['trace'])));
check('retries/fullyParallel/timeouts/workers/other top-level fields unchanged', same(strip(diag, changed), strip(base, changed)), { base: strip(base, changed), diag: strip(diag, changed) });
check('retries is 0', base.retries === 0 && diag.retries === 0);
check('testDir resolves to the same tests/ directory', diag.testDir === path.resolve(REPO, base.testDir), diag.testDir);
check('arms do not use Playwright webServer reuse (runner owns server)', !('webServer' in diag));
note('normal config browser selection', base.projects.some(p => p.use?.browserName) || base.use?.browserName
  ? 'browserName set in base config' : 'base config sets no browserName: the normal gate uses Playwright\'s default (chromium)');
note('base webServer (gate mode reuses it with reuseExistingServer:false)', base.webServer);

// 3. Fresh release selection.
const sel = releaseSelection();
check('release browser files all exist', sel.browser.every(f => fs.existsSync(path.join(REPO, f))), sel.browser);
check('release domain files all exist', sel.domain.every(f => fs.existsSync(path.join(REPO, f))), sel.domain);
note('release selection (dynamic)', { browserFiles: sel.browser.length, domainFiles: sel.domain.length, pre: sel.pre, post: sel.post });

// 4. Static mute coverage. Runtime proof comes from the fixture's own
// expectFootballTestMuted assertions on every Football goto in the smoke arm.
const mute = sel.browser.map(rel => {
  const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
  const imp = src.match(/^import\s*\{([^}]*)\}\s*from\s*'\.\/curriculum-fixture\.mjs'/m);
  const manual = [...src.matchAll(/(\w+)\s*=\s*await\s+browser\.newContext\(/g)].map(m => ({
    name: m[1], muted: new RegExp(`muteFootballForTests\\(\\s*${m[1]}\\s*\\)`).test(src),
  }));
  const row = {
    file: rel,
    viaMuteFixture: !!imp && /\btest\b/.test(imp[1]),
    directPlaywrightImport: /from\s*'@playwright\/test'/.test(src),
    optOut: /footballMute\s*:\s*false/.test(src),
    manualContexts: manual,
    extraPagesOnFixtureContext: (src.match(/\.newPage\(\)/g) || []).length - manual.length,
    audible: path.basename(rel) === 'football-audio.spec.mjs',
  };
  row.ok = row.viaMuteFixture && !row.directPlaywrightImport && !row.optOut && manual.every(c => c.muted);
  return row;
});
check('every release file uses the mute fixture with no opt-out; manual contexts call muteFootballForTests', mute.every(r => r.ok), mute.filter(r => !r.ok));
check('football-audio.spec.mjs remains the only audible (fixture-exempt) file', mute.filter(r => r.audible).length === 1);
note('mute coverage table', mute.map(({ file, manualContexts, extraPagesOnFixtureContext, audible }) => ({ file, manual: manualContexts.length, extraPages: extraPagesOnFixtureContext, audible })));
const pinned = {};
for (const rel of ['tests/curriculum-fixture.mjs', 'tests/football-test-mute.mjs', 'tests/football-audio.spec.mjs', 'scripts/serve-root.mjs', 'playwright.config.mjs']) {
  pinned[rel] = await sha256File(path.join(REPO, rel));
}
note('pinned harness/mute/audio file hashes', pinned);

// 5. Port/origin assumptions.
const hard = sel.browser.filter(rel => /8090|127\.0\.0\.1|localhost/.test(fs.readFileSync(path.join(REPO, rel), 'utf8')));
check('no release spec hardcodes the port or origin', hard.length === 0, hard);
note(`port ${PORT} currently`, await portFree(PORT));

// 6. Server parity: unchanged serve-root vs logged wrapper on two private ports.
for (const p of [RAW_PORT, LOGGED_PORT]) check(`parity port ${p} free`, (await portFree(p)).free);
const serverLog = path.join(dir, 'parity-server.jsonl');
const startServer = (script, port, name, extra = {}) => {
  const out = fs.openSync(path.join(dir, `${name}.log`), 'a');
  const child = spawn(process.execPath, [script], { cwd: REPO, env: scrubbedEnv({ PORT: String(port), ...extra }), stdio: ['ignore', out, out] });
  child.exited = new Promise(resolve => child.on('exit', (code, signal) => resolve({ code, signal })));
  return child;
};
const get = (port, p, method = 'GET') => new Promise(resolve => {
  const req = http.request({ host: '127.0.0.1', port, path: p, method, agent: false, headers: { 'user-agent': 'diag-161-parity' } }, res => {
    const hash = crypto.createHash('sha256');
    let length = 0;
    res.on('data', c => { hash.update(c); length += c.length; });
    res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] ?? null, length, sha256: hash.digest('hex') }));
  });
  req.setTimeout(5000, () => req.destroy(new Error('timeout')));
  req.on('error', e => resolve({ error: e.code || e.message }));
  req.end();
});
const raw = (port, payload) => new Promise(resolve => {
  const socket = net.connect(port, '127.0.0.1');
  const chunks = [];
  let done = false;
  const finish = how => {
    if (done) return;
    done = true;
    socket.destroy();
    const text = Buffer.concat(chunks).toString('latin1').replace(/\r\nDate: [^\r]*/g, '');
    resolve({ how, text: text.slice(0, 400) });
  };
  socket.on('connect', () => socket.write(payload));
  socket.on('data', c => chunks.push(c));
  socket.on('close', () => finish('close'));
  socket.on('error', e => finish(`error:${e.code}`));
  socket.setTimeout(3000, () => finish('timeout'));
});
const ready = async port => {
  for (let i = 0; i < 40; i++) {
    if ((await get(port, '/version.json')).status === 200) return true;
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
};

const rawServer = startServer(path.join(REPO, 'scripts', 'serve-root.mjs'), RAW_PORT, 'parity-raw');
const loggedServer = startServer(path.join(DIAG_DIR, 'serve-logged.mjs'), LOGGED_PORT, 'parity-logged', { DIAG161_SERVER_LOG: serverLog });
try {
  check('both parity servers ready', (await ready(RAW_PORT)) && (await ready(LOGGED_PORT)));
  const html = fs.readFileSync(path.join(REPO, 'football', 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1])
    .filter(u => !/^(https?:)?\/\//.test(u) && !/^(#|data:|mailto:)/.test(u))
    .map(u => { const url = new URL(u, 'http://local/football/'); return url.pathname + url.search; });
  const paths = [...new Set([...refs, '/', '/football/', '/football', '/version.json', '/games.js', '/shared/fonts.css',
    '/does-not-exist-diag161', '/football/../shared/reset.css', '/%2e%2e/%2e%2e/etc/hosts', '/football/?boot=defense-call'])];
  const rows = [];
  for (const p of paths) rows.push({ path: p, raw: await get(RAW_PORT, p), logged: await get(LOGGED_PORT, p) });
  rows.push({ path: 'HEAD /football/', raw: await get(RAW_PORT, '/football/', 'HEAD'), logged: await get(LOGGED_PORT, '/football/', 'HEAD') });
  writeOnce(path.join(dir, 'parity-responses.json'), rows);
  check(`identical status/type/bytes for ${rows.length} requests`, rows.every(r => same(r.raw, r.logged) && !r.raw.error), rows.filter(r => !same(r.raw, r.logged)));
  const garbage = 'GARBAGE\r\n\r\n';
  const g = { raw: await raw(RAW_PORT, garbage), logged: await raw(LOGGED_PORT, garbage) };
  check('malformed HTTP gets the identical default reply', same(g.raw, g.logged) && g.raw.text.startsWith('HTTP/1.1 400'), g);

  const events = readJsonl(serverLog);
  const starts = events.filter(e => e.ev === 'req.start' && e.ua === 'diag-161-parity');
  const mode = events.find(e => e.ev === 'startup')?.mode;
  check(`server observation stream delivers events (mode=${mode})`, starts.length >= rows.length && events.some(e => e.ev === 'socket.open'),
    { reqStart: starts.length, expected: rows.length, hint: 'if dc delivered nothing, rerun with DIAG161_SERVER_OBSERVE=wrap and use the same env for every arm' });
  const finished = new Set(events.filter(e => e.ev === 'res.finish').map(e => e.req));
  check('every logged request has a logged finish', starts.every(e => finished.has(e.req)));

  // Default crash path: the unchanged handler rejects on a malformed URI escape.
  const crashReq = 'GET /% HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n';
  const c = { raw: await raw(RAW_PORT, crashReq), logged: await raw(LOGGED_PORT, crashReq) };
  const timeout = new Promise(r => setTimeout(() => r('still-running'), 5000));
  const exits = { raw: await Promise.race([rawServer.exited, timeout]), logged: await Promise.race([loggedServer.exited, timeout]) };
  check('malformed URI: identical client view and identical process exit', same(c.raw, c.logged) && same(exits.raw, exits.logged), { c, exits });
  note('malformed URI default behavior', { client: c.raw, exit: exits.raw });
  const monitor = readJsonl(serverLog).find(e => e.ev === 'process.uncaughtExceptionMonitor');
  check('crash observed by uncaughtExceptionMonitor without suppressing it', monitor?.origin === 'unhandledRejection' && exits.logged !== 'still-running', monitor);
} finally {
  for (const s of [rawServer, loggedServer]) if (s.exitCode === null && s.signalCode === null) s.kill('SIGTERM');
}

// 7. No-browser discovery of both differential modes: the actual CLI must
// collect exactly one lifecycle case on each of the six projects, with no
// collection error (e.g. an unknown fixture parameter yields 0 tests).
for (const diff of ['single', 'relaunch']) {
  const discoveryDir = path.join(dir, `discovery-${diff}`);
  fs.mkdirSync(path.join(discoveryDir, 'cwd'), { recursive: true });
  const r = await run(process.execPath, [PW_CLI, 'test', '--config', CONFIG, '--list', '--reporter=json'], {
    cwd: path.join(discoveryDir, 'cwd'), timeout: 120_000,
    env: scrubbedEnv({ DIAG161_MODE: 'differential', DIAG161_RUN_DIR: discoveryDir, DIAG161_DIFF: diff, DIAG161_TRACE: 'on' }),
  });
  fs.writeFileSync(path.join(discoveryDir, 'stdout.json'), r.stdout);
  fs.writeFileSync(path.join(discoveryDir, 'stderr.log'), r.stderr);
  let report = null;
  try { report = JSON.parse(r.stdout); } catch {}
  const cases = [];
  const visit = s => { for (const spec of s.specs ?? []) for (const t of spec.tests ?? []) cases.push({ file: path.basename(spec.file), title: spec.title, project: t.projectName }); for (const c of s.suites ?? []) visit(c); };
  for (const s of report?.suites ?? []) visit(s);
  const detail = { exitCode: r.code, errors: (report?.errors ?? []).map(e => String(e.message ?? '').slice(0, 300)), cases: cases.length, projects: cases.map(c => c.project) };
  check(`differential ${diff} discovery: CLI exit 0, no errors, exactly one lifecycle case on each of six projects`,
    r.code === 0 && report && detail.errors.length === 0 && cases.length === 6
      && same(cases.map(c => c.project).sort(), [...PROJECTS].sort())
      && cases.every(c => c.file === 'lifecycle.spec.mjs' && c.title === 'browser-lifetime context cycles'), detail);
}

const fingerprint = await sourceFingerprint();
writeOnce(path.join(dir, 'preflight.json'), { runId: id, versions, webkitExecutable: webkit.executablePath(), selection: sel, mute, pinned, results, fingerprint });
await writeManifest(dir);
const failed = results.filter(r => r.ok === false);
console.log(`\n[diag-161] preflight ${failed.length ? `FAIL (${failed.length})` : 'PASS'}; HEAD ${fingerprint.head}; scope manifest ${fingerprint.manifestSha256} (${fingerprint.entryCount} entries; not clean: ${fingerprint.notClean.length})\n[diag-161] run dir: ${dir}`);
await new Promise(r => setTimeout(r, 300));
process.exit(failed.length ? 1 : 0);
