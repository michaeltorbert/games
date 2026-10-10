// Issue #160 diagnostic runner: `node scripts/diag-160/run.mjs <phase>`.
// Phases (arms.json is the predeclared manifest; run them in this order):
//   selfcheck  classifier node:test, instrumentation counts + compile, generation round trip
//   controls   SYNTHETIC sensitivity arms, one Playwright CLI each
//   isolated   3 instrumented + 3 unmodified target runs, alternating
//   file       the generated full context-integration copy (only the target instrumented)
//   combined   the current release browser selection with context-integration replaced
// Each invocation writes a new output/issue-160/runs/<stamp>-<phase>-<hex>/ that is
// never reused, stops at the first anomaly, then hashes every retained file and
// makes it read-only. Guarded sources must equal HEAD. Workers are never set.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import base from '../../playwright.config.mjs';
import { instrument, INSERTIONS, sha256 } from './instrument.mjs';
import { generate, CANONICAL, TARGET_TITLE, FULL_COPY } from './gen-spec.mjs';
import { classify } from './classify.mjs';
import { coverage } from './coverage.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const PW_CLI = path.join(REPO, 'node_modules', '@playwright', 'test', 'cli.js');
const CONFIG = path.join(HERE, 'config.mjs');
const ARMS = JSON.parse(fs.readFileSync(path.join(HERE, 'arms.json'), 'utf8'));
const PORT = Number(new URL(base.use.baseURL).port);
const PHASES = ARMS.phases.map(p => p.phase);
const PROJECTS = base.projects.map(project => project.name);
const GUARDED = ['football/football.js', CANONICAL, 'tests/curriculum-fixture.mjs', 'tests/football-test-mute.mjs',
  'playwright.config.mjs', 'scripts/football-release.config.mjs', 'scripts/run-football-release.mjs'];
const rel = p => path.relative(REPO, p);
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const git = (...args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const phase = process.argv[2];
if (process.argv.length !== 3 || !PHASES.includes(phase)) {
  console.error(`Usage: node scripts/diag-160/run.mjs <${PHASES.join('|')}>`);
  process.exit(2);
}
for (const name of ['ISSUE49_CAPTURE_STAGE', 'PLAYWRIGHT_JSON_OUTPUT_FILE', 'DIAG160_MODE', 'DIAG160_CONTROL', 'DIAG160_OUT', 'DIAG160_SOURCE_MANIFEST']) {
  if (process.env[name] !== undefined) {
    console.error(`${name} is set; unset it before a diagnostic run.`);
    process.exit(2);
  }
}

const RUNS = path.join(REPO, 'output', 'issue-160', 'runs');
fs.mkdirSync(RUNS, { recursive: true });
const stampText = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const dir = path.join(RUNS, `${stampText}-${phase}-${crypto.randomBytes(3).toString('hex')}`);
fs.mkdirSync(dir); // exclusive
const CWD = path.join(dir, 'cwd');
const GEN = path.join(dir, 'gen');
fs.mkdirSync(CWD);
fs.mkdirSync(GEN);
const write = (file, value) => fs.writeFileSync(path.join(dir, file), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const steps = [];
const started = new Date().toISOString();

function finish(status, extra = {}) {
  write('status.json', { phase, status, started, finished: new Date().toISOString(), ...extra, steps });
  const files = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => (e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.join(d, e.name))));
  walk(dir);
  const hashes = Object.fromEntries(files.sort().map(f => [path.relative(dir, f), sha256(fs.readFileSync(f))]));
  write('files.sha256.json', hashes);
  for (const f of [...files, path.join(dir, 'files.sha256.json')]) fs.chmodSync(f, 0o444);
  console.log(`[diag-160] ${phase} ${status}\n[diag-160] run dir: ${rel(dir)}`);
  process.exitCode = status.startsWith('PASS') ? 0 : 1;
}

// --- provenance and guards -------------------------------------------------
const dirty = git('status', '--porcelain', '--untracked-files=all', '--', 'football', 'tests', 'scripts',
  'playwright.config.mjs', 'package.json', 'package-lock.json', ':(exclude)scripts/diag-160');
const files = Object.fromEntries(GUARDED.map(p => [p, {
  sha256: sha256(fs.readFileSync(path.join(REPO, p))),
  blob: git('hash-object', p),
  headBlob: git('rev-parse', `HEAD:${p}`),
}]));
const manifestPath = path.join(dir, 'manifest.json');
write('manifest.json', {
  schema: 1,
  issue: 160,
  phase,
  dir: rel(dir),
  started,
  head: git('rev-parse', 'HEAD'),
  branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
  guardedDirty: dirty,
  files,
  tool: Object.fromEntries(fs.readdirSync(HERE).sort().map(f => [f, sha256(fs.readFileSync(path.join(HERE, f)))])),
  versions: {
    node: process.version,
    playwright: readJson(path.join(REPO, 'node_modules', '@playwright', 'test', 'package.json')).version,
    chromium: readJson(path.join(REPO, 'node_modules', 'playwright-core', 'browsers.json')).browsers.find(b => b.name === 'chromium') ?? null,
  },
  host: { platform: os.platform(), release: os.release(), cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model ?? null, totalmem: os.totalmem(), loadavg: os.loadavg() },
  env: { CI: process.env.CI ?? null },
  workers: 'unset',
  invariants: ARMS.invariants,
});
if (dirty || Object.values(files).some(f => f.blob !== f.headBlob)) {
  finish('STOPPED-guarded-source-differs-from-HEAD');
  process.exit();
}

// --- generation (every phase, fresh per run directory) ------------------------
const footballSource = fs.readFileSync(path.join(REPO, 'football', 'football.js'), 'utf8');
let inst;
let gen;
try {
  inst = instrument(footballSource);
  new vm.Script(footballSource, { filename: 'football.js' });
  new vm.Script(inst.code, { filename: 'football.instrumented.js' });
  gen = generate(fs.readFileSync(path.join(REPO, CANONICAL), 'utf8'), { genDir: GEN, fixturePath: path.join(HERE, 'fixture.mjs') });
} catch (error) {
  finish('STOPPED-tool-defect:generation', { error: String(error.message ?? error) });
  process.exit();
}
write('instrument-manifest.json', {
  originalSha256: inst.originalSha256,
  instrumentedSha256: inst.instrumentedSha256,
  counts: inst.counts,
  originalLines: inst.sites,
  insertedLines: inst.insertedLines,
  anchors: INSERTIONS.map(i => ({ name: i.name, expected: i.expected, anchorSha256: sha256(i.anchor) })),
});
if (phase === 'selfcheck') write('football.instrumented.js', inst.code);
for (const [name, text] of Object.entries(gen.files)) fs.writeFileSync(path.join(GEN, name), text, { flag: 'wx' });
write('gen-manifest.json', gen.manifest);

// --- child processes -------------------------------------------------------------
function portBusy() {
  const probe = host => new Promise((resolve) => {
    const socket = net.connect({ port: PORT, host });
    socket.setTimeout(1500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(true); });
    socket.once('error', e => resolve(!['ECONNREFUSED', 'EADDRNOTAVAIL'].includes(e.code)));
  });
  return probe('127.0.0.1').then(v4 => v4 || probe('::1'));
}

async function exec(name, args, { env = {}, cwd = CWD } = {}) {
  const out = path.join(dir, 'out', `${String(steps.length).padStart(2, '0')}-${name}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.mkdirSync(out);
  const fds = ['stdout.log', 'stderr.log'].map(f => fs.openSync(path.join(out, f), 'wx'));
  const load = [];
  const sampler = setInterval(() => load.push([Date.now(), os.loadavg()[0], os.freemem()]), 1000);
  const t0 = Date.now();
  const childEnv = { ...process.env, ...env };
  for (const key of Object.keys(env)) if (env[key] == null) delete childEnv[key];
  const result = await new Promise((resolve) => {
    let child;
    try {
      child = spawn(process.execPath, args, { cwd, env: childEnv, stdio: ['ignore', fds[0], fds[1]] });
    } catch (error) { resolve({ code: null, signal: null, error: String(error) }); return; }
    child.once('error', error => resolve({ code: null, signal: null, error: String(error) }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  clearInterval(sampler);
  fds.forEach(fd => fs.closeSync(fd));
  const record = { name, command: [process.execPath, ...args], cwd: rel(cwd), env: Object.fromEntries(Object.entries(env).filter(([, v]) => v != null)), ...result, ms: Date.now() - t0, out: rel(out) };
  fs.writeFileSync(path.join(out, 'cli.json'), JSON.stringify({ ...record, load }, null, 2) + '\n', { flag: 'wx' });
  steps.push(record);
  return { ...record, outDir: out };
}

// DIAG160_OUT is the step's own new directory (the name exec will create).
async function pw(name, specs, { mode = null, control = null, extra = [] } = {}) {
  if (await portBusy()) return { name, stop: `port-${PORT}-busy` };
  const out = path.join(dir, 'out', `${String(steps.length).padStart(2, '0')}-${name}`);
  return exec(name, [PW_CLI, 'test', '--config', CONFIG, ...specs, ...extra], {
    env: { DIAG160_OUT: out, DIAG160_SOURCE_MANIFEST: manifestPath, DIAG160_MODE: mode, DIAG160_CONTROL: control },
  });
}

// --- judging ---------------------------------------------------------------------
function summarize(run) {
  const file = path.join(run.outDir, 'report.json');
  if (!fs.existsSync(file)) return { error: 'no-report', tests: [] };
  const report = readJson(file);
  const tests = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) tests.push({ file: spec.file, title: spec.title, project: t.projectName, status: t.status, results: (t.results ?? []).map(r => r.status) });
    }
    (suite.suites ?? []).forEach(walk);
  };
  (report.suites ?? []).forEach(walk);
  return {
    stats: report.stats ?? null,
    workers: report.config?.workers ?? null,
    actualWorkers: report.config?.metadata?.actualWorkers ?? null,
    errors: (report.errors ?? []).map(e => String(e.message ?? e).slice(0, 500)),
    tests,
  };
}

function diagFiles(run) {
  const found = [];
  const walk = d => fs.existsSync(d) && fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'diag160.json') found.push(p);
  });
  walk(path.join(run.outDir, 'test-results'));
  return found;
}

// Ordinary (natural) runs: the executed report covers the canonical enumeration
// exactly (coverage.mjs), no page exception was captured and, when
// instrumented, the one target diag classifies PASS. Anything else is an anomaly.
// scope: { enumReport, files (canonical absolute paths), generated: { file, canonical } | null }
function judge(run, { instrumented, scope }) {
  if (run.stop) return { ok: false, anomalies: [run.stop] };
  const summary = summarize(run);
  const anomalies = [];
  if (summary.error) anomalies.push(summary.error);
  if (run.code !== 0) anomalies.push(`exit:${run.code ?? run.signal ?? run.error}`);
  if (summary.errors?.length) anomalies.push('report-errors');
  const bad = summary.tests.filter(t => !['expected', 'skipped'].includes(t.status));
  if (bad.length) anomalies.push(...bad.map(t => `test-${t.status}:${t.project}:${t.file}:${t.title}`));
  // Cases left unrun by fail-fast (or any interruption) are incomplete, never PASS;
  // coverage.mjs also rejects them as missing or not exactly one result.
  const notRun = summary.tests.filter(t => t.results.length === 0);
  if (notRun.length) anomalies.push(`not-run:${notRun.length}`);
  const target = summary.tests.filter(t => t.title === TARGET_TITLE && t.status !== 'skipped');
  if (target.length !== 1) anomalies.push(`target-executions:${target.length}`);
  let caseCoverage = null;
  if (!summary.error) {
    try {
      caseCoverage = coverage(scope.enumReport, readJson(path.join(run.outDir, 'report.json')), { files: scope.files, projects: PROJECTS, generated: scope.generated });
    } catch (error) {
      caseCoverage = { ok: false, error: String(error.message ?? error) };
    }
    if (!caseCoverage.ok) anomalies.push('case-coverage');
  }
  const classes = instrumented ? diagFiles(run).map(f => ({ file: rel(f), ...classify(readJson(f)) })) : [];
  if (instrumented && classes.length !== 1) anomalies.push(`diag-files:${classes.length}`);
  if (!instrumented && diagFiles(run).length) anomalies.push('unexpected-diag-in-unmodified-arm');
  for (const c of classes) {
    if (c.label !== 'PASS') anomalies.push(`label:${c.label}`);
    if (c.pageErrors?.length) anomalies.push(`page-errors:${c.pageErrors.length}`);
  }
  const result = { ok: !anomalies.length, anomalies, workers: summary.workers, actualWorkers: summary.actualWorkers, stats: summary.stats, caseCoverage, classes };
  fs.writeFileSync(path.join(run.outDir, 'judgement.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  return result;
}

function judgeControl(run, arm) {
  if (run.stop) return { ok: false, anomalies: [run.stop] };
  const summary = summarize(run);
  const target = summary.tests.filter(t => t.title === TARGET_TITLE && t.status !== 'skipped');
  const others = summary.tests.filter(t => t.title !== TARGET_TITLE && t.status !== 'skipped');
  const classes = diagFiles(run).map(f => ({ file: rel(f), ...classify(readJson(f)) }));
  const anomalies = [];
  if (summary.error) anomalies.push(summary.error);
  if (summary.errors?.length) anomalies.push('report-errors');
  if (others.length) anomalies.push(`unexpected-tests:${others.length}`);
  if (target.length !== 1) anomalies.push(`target-executions:${target.length}`);
  else if ((target[0].results[0] ?? null) !== arm.status || target[0].results.length !== 1) anomalies.push(`status:${target[0].results.join(',')}`);
  if (classes.length !== 1) anomalies.push(`diag-files:${classes.length}`);
  const c = classes[0];
  if (c) {
    if (c.synthetic !== Boolean(arm.control)) anomalies.push('synthetic-flag');
    const got = c.chains.map(ch => ch.label);
    if (JSON.stringify(got) !== JSON.stringify(arm.chains)) anomalies.push(`labels:${got.join(',')}`);
    const last = c.chains.at(-1);
    if (arm.detail?.reason && last?.facts?.reason !== arm.detail.reason) anomalies.push(`reason:${last?.facts?.reason}`);
    if (arm.detail?.sites && JSON.stringify(last?.facts?.sites) !== JSON.stringify(arm.detail.sites)) anomalies.push(`sites:${JSON.stringify(last?.facts?.sites)}`);
    if (arm.control && last?.facts?.control?.result?.applied !== true) anomalies.push('control-not-applied');
    if (c.pageErrors?.length) anomalies.push(`page-errors:${c.pageErrors.length}`);
  }
  const result = { ok: !anomalies.length, synthetic: true, arm: arm.name, expected: arm, anomalies, workers: summary.workers, stats: summary.stats, classes };
  fs.writeFileSync(path.join(run.outDir, 'judgement.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  return result;
}

// --- phases -------------------------------------------------------------------------
const genSpec = name => path.join(GEN, name);
const judgements = [];
// Natural execution arms (isolated, file, combined) fail fast: Playwright stops
// scheduling queued cases after the first test failure; workers already running
// may finish their current case. Workers, retries and every deadline stay
// unchanged. Controls fail on purpose and use pw() directly, without fail-fast,
// so their expected case always completes. Classifier anomalies in a passing
// case are judged only after the CLI exits (bounded batch limitation).
const FAIL_FAST = '--max-failures=1';
const natural = (name, specs, opts = {}) => pw(name, specs, { ...opts, extra: [FAIL_FAST, ...(opts.extra ?? [])] });
const stopped = (run, result) => `STOPPED-${result.classes?.some(c => c.label === 'TOOL-DEFECT') ? 'tool-defect' : 'anomaly'}:${run.name}`;

// `--list` of the unchanged canonical selection: the enumeration that the
// executed report must cover. Null if the enumeration itself failed.
async function enumerate(specs, extra = []) {
  const run = await pw('enumerate-canonical', specs, { extra: ['--list', ...extra] });
  const file = run.outDir && path.join(run.outDir, 'report.json');
  return !run.stop && run.code === 0 && fs.existsSync(file) ? readJson(file) : null;
}

async function selfcheck() {
  const runs = [];
  for (const test of ['classify.test.mjs', 'coverage.test.mjs']) {
    runs.push(await exec(`node-test-${test}`, ['--test', '--test-reporter=tap', path.join(HERE, test)], { cwd: REPO }));
  }
  for (const name of Object.keys(gen.files)) runs.push(await exec(`check-${name}`, ['--check', genSpec(name)], { cwd: REPO }));
  const failed = runs.filter(r => r.code !== 0).map(r => r.name);
  return failed.length ? `FAILED-selfcheck:${failed.join(',')}` : 'PASS-selfcheck';
}

async function controls() {
  for (const arm of ARMS.phases.find(p => p.phase === 'controls').arms) {
    const run = await pw(`control-${arm.name}`, [genSpec('control.spec.mjs')], { mode: 'instrumented', control: arm.control });
    const result = judgeControl(run, arm);
    judgements.push({ step: run.name, ...result });
    if (!result.ok) return result.classes?.some(c => c.label === 'TOOL-DEFECT') ? stopped(run, result) : `STOPPED-control-mislabel:${arm.name}`;
  }
  return 'PASS-controls-synthetic';
}

async function isolated() {
  const order = ARMS.phases.find(p => p.phase === 'isolated').order;
  const canonical = path.join(REPO, CANONICAL);
  const grep = `--grep=${escapeRegExp(TARGET_TITLE)}`;
  const enumReport = await enumerate([canonical], [grep]);
  if (!enumReport) return 'STOPPED-enumerate';
  for (const [i, arm] of order.entries()) {
    const instrumented = arm === 'instrumented';
    const run = instrumented
      ? await natural(`isolated-${i}-instrumented`, [genSpec('target.spec.mjs')], { mode: 'instrumented' })
      : await natural(`isolated-${i}-unmodified`, [canonical], { extra: [grep] });
    const generated = instrumented ? { file: genSpec('target.spec.mjs'), canonical } : null;
    const result = judge(run, { instrumented, scope: { enumReport, files: [canonical], generated } });
    judgements.push({ step: run.name, arm, ...result });
    if (!result.ok) return stopped(run, result);
  }
  return 'PASS-isolated';
}

async function file() {
  const canonical = path.join(REPO, CANONICAL);
  const enumReport = await enumerate([canonical]);
  if (!enumReport) return 'STOPPED-enumerate';
  const run = await natural('file', [genSpec(FULL_COPY)], { mode: 'instrumented' });
  const result = judge(run, { instrumented: true, scope: { enumReport, files: [canonical], generated: { file: genSpec(FULL_COPY), canonical } } });
  judgements.push({ step: run.name, ...result });
  return result.ok ? 'PASS-file' : stopped(run, result);
}

async function combined() {
  const runner = fs.readFileSync(path.join(REPO, 'scripts', 'run-football-release.mjs'), 'utf8');
  const browser = [...runner.match(/const BROWSER = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  if (browser.filter(f => f === CANONICAL).length !== 1) return 'STOPPED-selection-parse';
  const canonicalFiles = browser.map(f => path.join(REPO, f));
  const selection = browser.map(f => (f === CANONICAL ? genSpec(FULL_COPY) : path.join(REPO, f)));
  write('selection.json', { canonical: browser, substituted: selection.map(rel) });
  const enumReport = await enumerate(canonicalFiles);
  if (!enumReport) return 'STOPPED-enumerate';

  // Mirrors the release runner: artifact preparation once, run-local cwd.
  const prepare = await exec('prepare', [path.join(REPO, 'scripts', 'prepare-football-release-artifacts.mjs')]);
  if (prepare.code !== 0) return 'STOPPED-prepare';
  const run = await natural('combined', selection, { mode: 'instrumented' });
  // PASS-combined requires the executed report to cover the canonical enumeration.
  const result = judge(run, {
    instrumented: true,
    scope: { enumReport, files: canonicalFiles, generated: { file: genSpec(FULL_COPY), canonical: path.join(REPO, CANONICAL) } },
  });
  judgements.push({ step: run.name, ...result });
  return result.ok ? 'PASS-combined' : stopped(run, result);
}

const status = await { selfcheck, controls, isolated, file, combined }[phase]();
finish(status, { judgements });
