// Issue #161 load-wait: run directories, ceilings and the candidate
// fingerprint. Sealing, manifest verification, process-group draining and the
// base source/runtime fingerprint are the reviewed continuation exports, used
// unchanged; this namespace adds only its own evidence root and the extra
// installed Playwright files its hooks depend on.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  dirBytes, evidenceReplacer, finalizeEvidence, fingerprint as baseFingerprint, jsonl, listFiles,
  sha256File, verifyManifest, versions, webkitExecutable,
} from '../continuation/lib.mjs';

export { dirBytes, finalizeEvidence, jsonl, listFiles, sha256File, verifyManifest, versions, webkitExecutable };

// Inherited variables the runner strips from, or refuses for, the CLI.
export const STRIP = ['DEBUG', 'DEBUG_FILE', 'DEBUG_COLORS', 'DEBUG_HIDE_DATE', 'PWDEBUG', 'PW_RUNNER_DEBUG', 'NODE_OPTIONS', 'TEST_WORKER_INDEX', 'TEST_PARALLEL_INDEX', 'FORCE_COLOR'];
export const REFUSE = ['ISSUE49_CAPTURE_STAGE', 'PLAYWRIGHT_JSON_OUTPUT_FILE', 'PLAYWRIGHT_BROWSERS_PATH', 'SELENIUM_REMOTE_URL', 'PW_TEST_CONNECT_WS_ENDPOINT', 'PW_TEST_REUSE_CONTEXT', 'PW_CLOCK', 'LOADWAIT_MODE', 'LOADWAIT_RUN_DIR', 'LOADWAIT_SERVER_FAULT'];

// Metadata for inherited environment: set/unset and the runner's action only.
// Values are never read into evidence (they may carry credentials, tokens or
// private paths), including for refused variables.
export function envMetadata(env) {
  const out = {};
  for (const k of STRIP) out[k] = { set: env[k] !== undefined, action: 'stripped' };
  for (const k of REFUSE) out[k] = { set: env[k] !== undefined, action: 'refused-if-set' };
  out.CI = { set: env.CI !== undefined, action: 'passed-through' };
  return out;
}

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..', '..', '..');
export const EVIDENCE_ROOT = path.join(REPO, 'tests', 'artifacts.nosync', 'issue-161', 'loadwait');
export const FAITHFUL_SPEC = 'tests/football-overlay-accessibility.spec.mjs';

const MiB = 1024 ** 2;
export const CEILINGS = {
  control: { budgetMs: 5 * 60_000, reserveMs: 60_000, bytesCap: 64 * MiB, sinkCapBytes: 8 * MiB },
  faithful: { budgetMs: 10 * 60_000, reserveMs: 150_000, bytesCap: 256 * MiB, sinkCapBytes: 24 * MiB },
  batch: { budgetMs: 20 * 60_000, bytesCap: 512 * MiB },
};

export const iso = () => new Date().toISOString();

export function newRunDir(kind) {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
  const ts = iso().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dir = path.join(EVIDENCE_ROOT, `${ts}-${kind}-${crypto.randomBytes(3).toString('hex')}`);
  fs.mkdirSync(dir); // exclusive: never reuses a directory
  return dir;
}

export function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, evidenceReplacer, 2) + '\n', { flag: 'wx' });
}

export const readJsonl = file => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line, i) => {
  try { return JSON.parse(line); } catch { return { ev: '#unparsed', line: i + 1 }; }
});

// Installed files the hooks and their source proofs depend on, beyond the
// continuation EXTERNAL list (which the base fingerprint already covers).
const EXTRA = [
  'node_modules/playwright/lib/common/configLoader.js',
  'node_modules/playwright/lib/transform/transform.js',
  'node_modules/playwright/lib/runner/workerHost.js',
  'node_modules/playwright-core/lib/client/clientInstrumentation.js',
  'node_modules/playwright-core/lib/client/channelOwner.js',
  'node_modules/playwright-core/lib/client/page.js',
  'node_modules/playwright-core/lib/server/webkit/wkPage.js',
  'node_modules/@playwright/test/index.mjs',
];

function entry(rel) {
  const abs = path.join(REPO, rel);
  let st;
  try { st = fs.lstatSync(abs); } catch { return { path: rel, type: 'absent' }; }
  return { path: rel, type: st.isSymbolicLink() ? 'symlink' : 'file', bytes: st.size, sha256: st.isSymbolicLink() ? null : sha256File(abs) };
}

// Candidate fingerprint = sha256 over the continuation base fingerprint
// (scripts/, tests/, football/, shared/, root configs, selected installed
// Playwright files, the WebKit launcher, node/platform) plus EXTRA. Scope
// limit: a declared runtime record, not a full installation or WebKit
// framework byte hash.
export function fingerprint() {
  const base = baseFingerprint();
  const extra = EXTRA.map(entry);
  const sha256 = crypto.createHash('sha256').update(JSON.stringify({ base: base.sha256, extra })).digest('hex');
  return { sha256, baseSha256: base.sha256, head: base.head, porcelainZ: base.porcelainZ, baseEntryCount: base.entryCount, extra, webkit: { ...base.webkit, executable: path.relative(REPO, base.webkit.executable).startsWith('..') ? path.basename(path.dirname(base.webkit.executable)) + '/' + path.basename(base.webkit.executable) : path.relative(REPO, base.webkit.executable) }, node: base.node, platform: base.platform, arch: base.arch };
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

// Only directories inside this namespace's evidence root are accepted as inputs.
export function evidenceDir(p) {
  const abs = path.resolve(REPO, p ?? '');
  if (path.dirname(abs) !== EVIDENCE_ROOT || !fs.existsSync(abs)) throw new Error(`not a load-wait evidence directory: ${p}`);
  return abs;
}
