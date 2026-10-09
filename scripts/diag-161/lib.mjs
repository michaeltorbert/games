// Shared helpers for the issue #161 diagnostic tooling. Observation only:
// nothing here changes the game, the server handler, specs, or fixtures.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const DIAG_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(DIAG_DIR, '..', '..');
export const EVIDENCE_ROOT = path.join(REPO, 'tests', 'artifacts.nosync', 'issue-161');
export const CONFIG = path.join(DIAG_DIR, 'diag.config.mjs');
export const PW_CLI = path.join(REPO, 'node_modules', '@playwright', 'test', 'cli.js');
export const PORT = 8090;
export const PROBE_UA = 'diag-161-health-probe';
export const PROJECTS = [
  'iphone-15-portrait', 'iphone-17-pro-max-portrait', 'ipad-11-portrait',
  'ipad-pro-13-portrait', 'ipad-pro-13-landscape', 'ipad-11-landscape',
];

// Wall clock plus host monotonic clock (uv_hrtime is mach_absolute_time on
// macOS, so values from different processes on this host are comparable).
export function stamp() {
  return { t: new Date().toISOString(), mono: process.hrtime.bigint().toString() };
}

// Append-only, synchronous JSONL so a killed process still leaves its lines.
// After close, writes are dropped (never sent to a reused descriptor) and counted.
export function jsonl(file) {
  const fd = fs.openSync(file, 'a');
  let closed = false;
  const writer = {
    dropped: 0,
    write(ev, data = {}) {
      if (closed) { writer.dropped++; return; }
      fs.writeSync(fd, JSON.stringify({ ...stamp(), pid: process.pid, ev, ...data }) + '\n');
    },
    close() { if (!closed) { closed = true; try { fs.closeSync(fd); } catch {} } },
  };
  return writer;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
// Resolves true if `promise` settles within `ms`, false otherwise; the timer is cleared either way.
export async function within(promise, ms) {
  let timer;
  const result = await Promise.race([
    Promise.resolve(promise).then(() => true, () => true),
    new Promise(r => { timer = setTimeout(() => r(false), ms); }),
  ]);
  clearTimeout(timer);
  return result;
}

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return [{ ev: 'unparseable', line }]; }
  });
}

// Each run gets a new directory; mkdir without `recursive` refuses reuse.
export function newRunDir(kind) {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const id = `${ts}-${kind}-${crypto.randomBytes(3).toString('hex')}`;
  const dir = path.join(EVIDENCE_ROOT, id);
  fs.mkdirSync(dir);
  return { id, dir };
}

export function writeOnce(file, data) {
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
}

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file).on('error', reject).on('data', c => hash.update(c)).on('end', () => resolve(hash.digest('hex')));
  });
}

export function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile()) out.push(p);
  }
  return out.sort();
}

// Written last and exclusively, so an index is never replaced.
export async function writeManifest(dir) {
  const files = walk(dir).filter(f => path.relative(dir, f) !== 'MANIFEST.sha256');
  const lines = [];
  for (const f of files) lines.push(`${await sha256File(f)}  ${path.relative(dir, f)}`);
  writeOnce(path.join(dir, 'MANIFEST.sha256'), lines.join('\n') + '\n');
  return files.length;
}

export function run(cmd, args, { cwd = REPO, timeout = 30_000, env } = {}) {
  return new Promise(resolve => execFile(cmd, args, { cwd, timeout, env, maxBuffer: 256 << 20 }, (error, stdout, stderr) => resolve({
    cmd: [cmd, ...args].join(' '),
    code: error ? (typeof error.code === 'number' ? error.code : String(error.code ?? 'error')) : 0,
    signal: error?.signal ?? null,
    stdout: String(stdout ?? ''),
    stderr: String(stderr ?? ''),
  })));
}

export async function psSnapshot() {
  const r = await run('ps', ['-axww', '-o', 'pid=,ppid=,pgid=,rss=,etime=,stat=,command=']);
  const rows = r.stdout.split('\n').map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/))
    .filter(Boolean)
    .map(m => ({ pid: +m[1], ppid: +m[2], pgid: +m[3], rssKb: +m[4], etime: m[5], stat: m[6], command: m[7] }));
  return { raw: r.stdout, rows };
}

export function descendants(rows, rootPid) {
  const set = new Set([rootPid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const r of rows) if (!set.has(r.pid) && set.has(r.ppid)) { set.add(r.pid); grew = true; }
  }
  return rows.filter(r => set.has(r.pid));
}

export const isWebKit = r => /ms-playwright\/webkit-\d+/.test(r.command);

// Host-wide WebKit plus our own tree. WebKit XPC helpers are launchd children
// (ppid 1), so they are attributed to us only when no foreign WebKit tree exists.
export function processSummary(rows, rootPid) {
  const ours = descendants(rows, rootPid);
  const ourPids = new Set(ours.map(r => r.pid));
  const webkit = rows.filter(isWebKit);
  const foreignTrees = webkit.filter(r => r.ppid !== 1 && !ourPids.has(r.pid));
  const xpc = webkit.filter(r => r.ppid === 1);
  const sum = list => list.reduce((n, r) => n + r.rssKb, 0);
  return {
    ours: ours.map(({ pid, ppid, pgid, rssKb, etime, stat, command }) => ({ pid, ppid, pgid, rssKb, etime, stat, command: command.slice(0, 200) })),
    ourCount: ours.length, ourRssKb: sum(ours),
    webkitHostCount: webkit.length, webkitHostRssKb: sum(webkit),
    webkitXpcCount: xpc.length, foreignWebKitTreeCount: foreignTrees.length,
    attributableXpc: foreignTrees.length === 0 ? xpc.map(r => r.pid) : [],
  };
}

// Post-onset evidence. `sample` pauses the sampled process for its duration and
// lsof walks descriptors: both are declared perturbations after stall onset.
export async function onsetSnapshot(dir, label, rootPid, { sample = true } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, label);
  const ps = await psSnapshot();
  fs.writeFileSync(`${base}.ps.txt`, ps.raw);
  const summary = processSummary(ps.rows, rootPid);
  const ourPids = summary.ours.map(r => r.pid);
  const jobs = [
    run('netstat', ['-anv', '-p', 'tcp']).then(r => fs.writeFileSync(`${base}.netstat.txt`, r.stdout + r.stderr)),
    run('vm_stat', []).then(r => fs.writeFileSync(`${base}.vm_stat.txt`, r.stdout + r.stderr)),
  ];
  if (ourPids.length) {
    jobs.push(run('lsof', ['-nP', '-p', ourPids.join(',')], { timeout: 20_000 }).then(r => {
      fs.writeFileSync(`${base}.lsof.txt`, r.stdout + r.stderr);
      const counts = {};
      for (const line of r.stdout.split('\n').slice(1)) {
        const pid = line.trim().split(/\s+/)[1];
        if (pid) counts[pid] = (counts[pid] || 0) + 1;
      }
      summary.fdCounts = counts;
    }));
  }
  const sampled = sample
    ? [...summary.ours.filter(isWebKit).map(r => r.pid), ...summary.attributableXpc].slice(0, 8)
    : [];
  for (const pid of sampled) {
    jobs.push(run('sample', [String(pid), '2', '-file', `${base}.sample-${pid}.txt`], { timeout: 30_000 })
      .then(r => { if (r.code) fs.writeFileSync(`${base}.sample-${pid}.error.txt`, `${r.code}\n${r.stderr}`); }));
  }
  await Promise.allSettled(jobs);
  summary.sampled = sampled;
  summary.perturbation = sampled.length ? 'post-onset: sample paused listed pids ~2s; lsof walked fds' : 'post-onset: lsof walked fds';
  fs.writeFileSync(`${base}.summary.json`, JSON.stringify(summary, null, 2));
  return summary;
}

export function portInUse(port, host) {
  return new Promise(resolve => {
    const socket = net.connect({ port, host });
    socket.setTimeout(1500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(true); });
    socket.once('error', e => resolve(e.code === 'ECONNREFUSED' || e.code === 'EADDRNOTAVAIL' ? false : `error:${e.code}`));
  });
}

export async function portFree(port) {
  const v4 = await portInUse(port, '127.0.0.1');
  const v6 = await portInUse(port, '::1');
  return { free: v4 === false && v6 === false, v4, v6 };
}

// The release browser/domain selection, read fresh from package.json.
export function releaseSelection() {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  const script = pkg.scripts['test:football:release'];
  const parts = script.split('&&').map(s => s.trim());
  if (parts.length !== 2 || !parts[0].startsWith('node --test ') || !parts[1].startsWith('playwright test ')) {
    throw new Error(`Unexpected test:football:release shape: ${script}`);
  }
  const files = s => s.split(/\s+/).filter(t => t.endsWith('.spec.mjs'));
  return {
    script,
    pre: pkg.scripts['pretest:football:release'],
    post: pkg.scripts['posttest:football:release'],
    domain: files(parts[0]),
    browser: files(parts[1]),
  };
}

const SCOPE_DIRS = ['tests/', 'football/', 'shared/', 'scripts/'];
const SCOPE_FILES = ['playwright.config.mjs', 'package.json', 'package-lock.json'];
// Ignored by git, so recorded explicitly as `external`.
const EXTERNAL = [
  'node_modules/@playwright/test/package.json', 'node_modules/playwright/package.json',
  'node_modules/playwright-core/package.json', 'node_modules/playwright-core/browsers.json',
];
const inScope = p => (SCOPE_FILES.includes(p) || SCOPE_DIRS.some(d => p.startsWith(d)))
  && !/(^|\/)artifacts(\.nosync)?\//.test(p);

// HEAD plus a byte-sorted manifest of every in-scope path: git state
// (tracked/modified/untracked/deleted, index mode/oid), worktree type, mode,
// size and content hash or recorded absence. Git input is NUL-delimited, so
// quoted or unusual paths and renames survive. `manifestSha256` hashes the
// exact serialized manifest that is stored with it.
export async function sourceFingerprint() {
  const head = (await run('git', ['rev-parse', 'HEAD'])).stdout.trim();
  const split = s => s.split('\0').filter(Boolean);
  const index = new Map();
  for (const entry of split((await run('git', ['ls-files', '-z', '-s'])).stdout)) {
    const m = entry.match(/^(\d{6}) ([0-9a-f]+) (\d)\t([\s\S]*)$/);
    if (m) index.set(m[4], { indexMode: m[1], indexOid: m[2], stage: Number(m[3]) });
  }
  const porcelainZ = (await run('git', ['status', '--porcelain=v1', '-z', '-uall'])).stdout;
  const status = new Map();
  const tokens = split(porcelainZ);
  for (let i = 0; i < tokens.length; i++) {
    const xy = tokens[i].slice(0, 2);
    status.set(tokens[i].slice(3), xy);
    if (/[RC]/.test(xy) && i + 1 < tokens.length) status.set(tokens[++i], `${xy}:source`);
  }
  const untracked = split((await run('git', ['ls-files', '-z', '-o', '--exclude-standard'])).stdout);
  const paths = [...new Set([...index.keys(), ...untracked, ...status.keys()])].filter(inScope);
  const entries = [];
  for (const rel of [...paths, ...EXTERNAL]) {
    const abs = path.join(REPO, rel);
    const st = fs.lstatSync(abs, { throwIfNoEntry: false });
    const ix = index.get(rel);
    const state = EXTERNAL.includes(rel) ? 'external' : !st ? 'deleted' : !ix ? 'untracked' : status.has(rel) ? 'tracked-modified' : 'tracked';
    entries.push({
      path: rel, state, git: status.get(rel) ?? null,
      indexMode: ix?.indexMode ?? null, indexOid: ix?.indexOid ?? null,
      type: !st ? null : st.isSymbolicLink() ? 'symlink' : st.isFile() ? 'file' : st.isDirectory() ? 'dir' : 'other',
      mode: st ? `0o${(st.mode & 0o7777).toString(8)}` : null,
      bytes: st?.isFile() ? st.size : null,
      sha256: st?.isFile() ? await sha256File(abs) : st?.isSymbolicLink() ? `link:${fs.readlinkSync(abs)}` : null,
    });
  }
  entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const serialized = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  return {
    head,
    scopeRule: { dirs: SCOPE_DIRS, files: SCOPE_FILES, external: EXTERNAL, excluded: 'any artifacts/ or artifacts.nosync/ path' },
    entryCount: entries.length,
    manifestSha256: crypto.createHash('sha256').update(serialized).digest('hex'),
    notClean: entries.filter(e => e.state !== 'tracked' && e.state !== 'external').map(e => `${e.state} ${e.path}`),
    porcelainZ: JSON.stringify(porcelainZ),
    manifest: entries,
  };
}

export function toolVersions() {
  const read = rel => JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8'));
  const browsers = read('node_modules/playwright-core/browsers.json').browsers;
  return {
    node: process.version,
    playwrightTest: read('node_modules/@playwright/test/package.json').version,
    playwright: read('node_modules/playwright/package.json').version,
    playwrightCore: read('node_modules/playwright-core/package.json').version,
    webkitRevision: browsers.find(b => b.name === 'webkit')?.revision ?? null,
    browsersJson: browsers.map(({ name, revision, browserVersion }) => ({ name, revision, browserVersion })),
  };
}

export async function hostInfo() {
  const sw = await run('sw_vers', []);
  const ulimit = await run('/bin/sh', ['-c', 'ulimit -n']);
  const os = await import('node:os');
  return {
    platform: process.platform, release: os.release(), arch: process.arch, swVers: sw.stdout.trim(),
    cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model ?? null, totalMemBytes: os.totalmem(),
    loadavg: os.loadavg(), ulimitN: ulimit.stdout.trim(), hostname: os.hostname(),
  };
}

export const ENV_ALLOWLIST = [
  'CI', 'DEBUG', 'DEBUG_COLORS', 'DEBUG_FILE', 'PW_RUNNER_DEBUG', 'PLAYWRIGHT_BROWSERS_PATH', 'NODE_OPTIONS',
  'ISSUE49_CAPTURE_STAGE', 'PWDEBUG', 'PLAYWRIGHT_NO_COPY_PROMPT', 'DIAG161_SERVER_OBSERVE',
  'FORCE_COLOR', 'NO_COLOR',
];
export const envRecord = env => Object.fromEntries(ENV_ALLOWLIST.map(k => [k, env[k] ?? null]));

// Child env: drop settings that would redirect evidence or change specs.
// ISSUE49_CAPTURE_STAGE would make the overlay spec write to /private/tmp.
export function scrubbedEnv(extra) {
  const env = { ...process.env };
  for (const k of ['ISSUE49_CAPTURE_STAGE', 'DEBUG_FILE', 'PWDEBUG', 'NODE_OPTIONS']) delete env[k];
  return { ...env, ...extra };
}

// Names of entries in a zip's central directory (enough to count trace chunks).
export function zipEntryNames(file) {
  const buf = fs.readFileSync(file);
  const names = [];
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) !== 0x06054b50) continue;
    let p = buf.readUInt32LE(i + 16);
    const count = buf.readUInt16LE(i + 10);
    for (let n = 0; n < count && buf.readUInt32LE(p) === 0x02014b50; n++) {
      const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
      names.push(buf.toString('utf8', p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
    }
    break;
  }
  return names;
}

// Exposure from the reporter's own events; works for interrupted runs too.
export function summarizeRun(runDir) {
  const events = readJsonl(path.join(runDir, 'events.jsonl'));
  const enumPath = path.join(runDir, 'enumeration.json');
  const enumeration = fs.existsSync(enumPath) ? JSON.parse(fs.readFileSync(enumPath, 'utf8')) : [];
  const begun = new Map();
  const ended = new Map();
  for (const e of events) {
    if (e.ev === 'test.begin') begun.set(e.test, e);
    if (e.ev === 'test.end') ended.set(e.test, e);
  }
  const blank = () => ({ enumerated: 0, passed: 0, skipped: 0, failed: 0, timedOut: 0, interrupted: 0, startedNotEnded: 0, notRun: 0 });
  const byProject = {};
  const totals = blank();
  for (const t of enumeration) {
    const p = byProject[t.project] ??= blank();
    const end = ended.get(t.id);
    const bucket = end ? end.status : begun.has(t.id) ? 'startedNotEnded' : 'notRun';
    for (const target of [p, totals]) { target.enumerated++; target[bucket] = (target[bucket] || 0) + 1; }
  }
  return {
    totals, byProject,
    endedCases: ended.size,
    failures: [...ended.values()].filter(e => !['passed', 'skipped'].includes(e.status))
      .map(({ t, test, key, status, workerIndex, parallelIndex, durationMs, errors }) => ({ t, test, key, status, workerIndex, parallelIndex, durationMs, errors: errors.map(m => m.slice(0, 600)) })),
    startedNotEnded: [...begun.values()].filter(b => !ended.has(b.test)).map(({ t, test, key, workerIndex }) => ({ t, test, key, workerIndex })),
    onsets: events.filter(e => e.ev === 'stall.onset').map(({ t, test, cat, title, openMs, label }) => ({ t, test, cat, title, openMs, label })),
    runEnd: events.find(e => e.ev === 'run.end') ?? null,
    runErrors: events.filter(e => e.ev === 'run.error').map(e => e.message),
    workerIndices: [...new Set([...begun.values()].map(b => b.workerIndex))].sort((a, b) => a - b),
  };
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) throw new Error(`Unexpected argument ${argv[i]}`);
    out[m[1]] = m[2] ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
  }
  return out;
}
