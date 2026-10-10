// Issue #161 continuation: shared helpers. No browser, no network beyond the
// loopback server owned by run-arm.mjs. Every run, check, extraction and
// self-check writes a NEW directory under EVIDENCE_ROOT, sealed last by an
// exclusively created MANIFEST.sha256, after which its files are made read-only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..', '..', '..');
export const EVIDENCE_ROOT = path.join(REPO, 'tests', 'artifacts.nosync', 'issue-161', 'continuation');
export const RETAINED_ROOT = path.join(REPO, 'tests', 'artifacts.nosync', 'issue-161');
export const PORT = 8090;
export const STEP_MS = 30_000;
export const ARM_BUDGET_MS = 15 * 60_000;
export const ARM_BYTES_CAP = 2 * 1024 ** 3;
export const BATCH_BUDGET_MS = 90 * 60_000;
export const BATCH_BYTES_CAP = 12 * 1024 ** 3;

const require = createRequire(import.meta.url);

export const mono = () => process.hrtime.bigint().toString();
export const iso = () => new Date().toISOString();

export function newRunDir(kind) {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
  const ts = iso().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dir = path.join(EVIDENCE_ROOT, `${ts}-${kind}-${crypto.randomBytes(3).toString('hex')}`);
  fs.mkdirSync(dir); // exclusive: never reuses a directory
  return dir;
}

// Deliberate evidence serializer: monotonic BigInt values (at any depth) are
// written as decimal strings, and analyser-internal `_seg` state is omitted.
export const evidenceReplacer = (key, value) => (key === '_seg' ? undefined : typeof value === 'bigint' ? value.toString() : value);
export function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, evidenceReplacer, 2) + '\n', { flag: 'wx' });
}

// Synchronous, exclusively created JSONL stream: ordered and durable per write.
export function jsonl(file) {
  const fd = fs.openSync(file, 'wx');
  let open = true;
  return {
    write(rec) { if (open) fs.writeSync(fd, JSON.stringify({ t: iso(), mono: mono(), ...rec }) + '\n'); },
    close() { if (open) { open = false; fs.fsyncSync(fd); fs.closeSync(fd); } },
  };
}

export function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(1 << 20);
  try {
    for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) hash.update(buf.subarray(0, n));
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}

const byteOrder = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

export function listFiles(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).sort((a, b) => byteOrder(a.name, b.name))) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(dir, p));
    else out.push(p);
  }
  return out.sort(byteOrder);
}

export function dirBytes(dir) {
  let total = 0;
  const walk = d => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { try { total += fs.lstatSync(p).size; } catch { /* removed meanwhile */ } }
    }
  };
  walk(dir);
  return total;
}

// Seal: hash every file, write MANIFEST.sha256 exclusively, then make files read-only.
export function seal(dir) {
  const files = listFiles(dir).filter(f => f !== 'MANIFEST.sha256');
  const lines = files.map(f => `${sha256File(path.join(dir, f))}  ${f}`);
  fs.writeFileSync(path.join(dir, 'MANIFEST.sha256'), lines.join('\n') + '\n', { flag: 'wx' });
  for (const f of [...files, 'MANIFEST.sha256']) fs.chmodSync(path.join(dir, f), 0o444);
  return files.length;
}

// Writers must be observed to have exited before sealing. Live (non-zombie)
// members of a process group, from ps; zombies cannot write.
export function groupMembers(pgid) {
  const r = spawnSync('ps', ['-axo', 'pid=,pgid=,stat='], { encoding: 'utf8' });
  return r.stdout.split('\n').map(l => l.trim().split(/\s+/)).filter(t => t.length >= 3 && Number(t[1]) === pgid && !t[2].startsWith('Z')).map(t => Number(t[0]));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Bounded drain of a process group: wait for natural exit, then SIGKILL the
// group and wait again. `exited` is true only when no live member is observed.
export async function drainGroup(pgid, { graceMs = 30_000, killWaitMs = 10_000 } = {}) {
  let members = groupMembers(pgid);
  for (const t = Date.now(); members.length && Date.now() - t < graceMs;) { await sleep(250); members = groupMembers(pgid); }
  const lingeringBeforeKill = members;
  let killed = false;
  if (members.length) {
    try { process.kill(-pgid, 'SIGKILL'); killed = true; } catch { /* group gone meanwhile */ }
    for (const t = Date.now(); members.length && Date.now() - t < killWaitMs;) { await sleep(100); members = groupMembers(pgid); }
  }
  return { lingeringBeforeKill, killed, remaining: members, exited: members.length === 0 };
}

// Seal only when every writer is proven to have exited; otherwise leave the
// directory explicitly UNSEALED and incomplete (never claimed immutable).
export function finalizeEvidence(dir, writersExited, reason) {
  if (writersExited) return { sealed: true, files: seal(dir) };
  fs.writeFileSync(path.join(dir, 'UNSEALED-INCOMPLETE.txt'), `${reason}\n`, { flag: 'wx' });
  return { sealed: false, reason };
}

export function verifyManifest(dir) {
  const manifestPath = path.join(dir, 'MANIFEST.sha256');
  if (!fs.existsSync(manifestPath)) return { ok: false, error: 'MANIFEST.sha256 missing' };
  const listed = new Map(fs.readFileSync(manifestPath, 'utf8').split('\n').filter(Boolean).map(l => {
    const m = l.match(/^([0-9a-f]{64}) {2}(.+)$/);
    return m ? [m[2], m[1]] : [l, null];
  }));
  const present = listFiles(dir).filter(f => f !== 'MANIFEST.sha256');
  const missing = [...listed.keys()].filter(f => !present.includes(f));
  const extra = present.filter(f => !listed.has(f));
  const mismatched = present.filter(f => listed.has(f) && listed.get(f) !== sha256File(path.join(dir, f)));
  return { ok: !missing.length && !extra.length && !mismatched.length, entries: listed.size, missing, extra, mismatched };
}

// Verify only the named entries of a retained run's manifest (read-only).
export function verifyManifestEntries(dir, names) {
  const listed = new Map(fs.readFileSync(path.join(dir, 'MANIFEST.sha256'), 'utf8').split('\n').filter(Boolean)
    .map(l => l.match(/^([0-9a-f]{64}) {2}(.+)$/)).filter(Boolean).map(m => [m[2], m[1]]));
  return names.map(n => ({ file: n, listed: listed.has(n), ok: listed.has(n) && listed.get(n) === sha256File(path.join(dir, n)) }));
}

// ---------------------------------------------------------------------------
// Source/runtime fingerprint. Content-only entries (path, type, mode, size,
// sha256), so a reviewed byte set has one hash whether or not it is committed.
// HEAD and porcelain status are recorded beside it for provenance, unhashed.
// Scope limit: the WebKit hash covers only the pw_run.sh launcher, and
// EXTERNAL is a selected list of installed Playwright files; this is a
// declared runtime record, not a full installation byte hash.
const SCOPE_DIRS = ['scripts', 'tests', 'football', 'shared'];
const SCOPE_FILES = ['playwright.config.mjs', 'package.json', 'package-lock.json', 'version.json'];
const EXTERNAL = [
  'node_modules/@playwright/test/package.json',
  'node_modules/playwright/package.json',
  'node_modules/playwright-core/package.json',
  'node_modules/playwright-core/browsers.json',
  'node_modules/playwright-core/index.js',
  'node_modules/playwright-core/lib/utilsBundle.js',
  'node_modules/playwright-core/lib/server/helper.js',
  'node_modules/playwright-core/lib/server/utils/debugLogger.js',
  'node_modules/playwright-core/lib/server/utils/processLauncher.js',
  'node_modules/playwright-core/lib/server/webkit/wkConnection.js',
  'node_modules/playwright-core/lib/server/browserType.js',
  // Batch 2 (T3) observation relies on these installed behaviours: fixture ordering
  // and shared-slot teardown skipping, the slot deadline read-only accessor, the
  // interrupt flag, stock fixtures/ArtifactsRecorder, and close() awaiting 'close'.
  'node_modules/playwright/lib/index.js',
  'node_modules/playwright/lib/worker/fixtureRunner.js',
  'node_modules/playwright/lib/worker/workerMain.js',
  'node_modules/playwright/lib/worker/testInfo.js',
  'node_modules/playwright/lib/worker/timeoutManager.js',
  'node_modules/playwright-core/lib/client/browserContext.js',
  'node_modules/playwright-core/lib/utils/isomorphic/time.js',
];
const excluded = rel => rel.split('/').some(seg => seg.startsWith('artifacts') || seg === '.DS_Store');

function entry(rel) {
  const abs = path.join(REPO, rel);
  let st;
  try { st = fs.lstatSync(abs); } catch { return { path: rel, type: 'absent' }; }
  const mode = `0o${(st.mode & 0o777).toString(8)}`;
  if (st.isSymbolicLink()) return { path: rel, type: 'symlink', mode, target: fs.readlinkSync(abs) };
  return { path: rel, type: 'file', mode, bytes: st.size, sha256: sha256File(abs) };
}

function walkScope(rel, out) {
  for (const e of fs.readdirSync(path.join(REPO, rel), { withFileTypes: true })) {
    const p = `${rel}/${e.name}`;
    if (excluded(p)) continue;
    if (e.isDirectory()) walkScope(p, out);
    else out.push(p);
  }
}

export function webkitExecutable() {
  const { registry } = require('playwright-core/lib/server/registry/index');
  return registry.findExecutable('webkit').executablePath('javascript');
}

export function fingerprint() {
  const paths = [...SCOPE_FILES, ...EXTERNAL];
  for (const d of SCOPE_DIRS) walkScope(d, paths);
  const entries = [...new Set(paths)].sort(byteOrder).map(entry);
  const exe = webkitExecutable();
  const webkit = { executable: exe, sha256: fs.existsSync(exe) ? sha256File(exe) : null };
  const hashed = { entries, webkit, node: process.version, platform: process.platform, arch: process.arch };
  const sha256 = crypto.createHash('sha256').update(JSON.stringify(hashed)).digest('hex');
  const git = args => spawnSync('git', ['-C', REPO, ...args], { encoding: 'utf8' });
  return {
    sha256,
    entryCount: entries.length,
    head: git(['rev-parse', 'HEAD']).stdout.trim(),
    porcelainZ: git(['status', '--porcelain=v1', '-z', '--untracked-files=all']).stdout,
    ...hashed,
  };
}

export function versions() {
  const pkg = p => JSON.parse(fs.readFileSync(path.join(REPO, 'node_modules', p, 'package.json'), 'utf8')).version;
  const browsers = JSON.parse(fs.readFileSync(path.join(REPO, 'node_modules', 'playwright-core', 'browsers.json'), 'utf8')).browsers;
  const wk = browsers.find(b => b.name === 'webkit');
  return { node: process.version, playwrightTest: pkg('@playwright/test'), playwright: pkg('playwright'), playwrightCore: pkg('playwright-core'), webkitRevision: wk?.revision, webkitBrowserVersion: wk?.browserVersion };
}

export function args(argv, spec) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!m || !(m[1] in spec)) throw new Error(`unknown argument ${argv[i]}`);
    out[m[1]] = spec[m[1]] === 'flag' ? true : (m[2] ?? argv[++i]);
  }
  return out;
}

// Batch 1 is arms.json (frozen); later predeclared batches are separate manifests.
export function loadArms(file = 'arms.json') {
  return JSON.parse(fs.readFileSync(path.join(HERE, path.basename(file)), 'utf8'));
}
