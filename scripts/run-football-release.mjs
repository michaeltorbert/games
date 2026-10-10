// Football release gate: `npm run test:football:release [-- --engine=webkit]`.
// Chromium is the default engine. Each release browser file runs in its own
// fresh Playwright CLI, and so its own browsers, on all six projects. A single
// long-lived WebKit browser stalls (issue #161, scripts/diag-161/FINDINGS.md);
// bounding browser lifetime to one file works around that and does not fix it.
// Steps, all inside one new run directory, stopping at the first failure:
//   1. `--list` enumeration of the release browser selection
//   2. release-artifact preparation once (run-local cwd)
//   3. domain/registry `node --test` checks once (repository cwd)
//   4. each release browser file in its own Playwright CLI (run-local cwd)
//   5. exact case-union and skip-reason validation against the enumeration
//   6. the strict release-artifact verifier once (run-local cwd)
// A failed run is final; running again creates a separate run directory and
// never retries, replaces or removes an earlier one.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import base from '../playwright.config.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(REPO, 'scripts', 'football-release.config.mjs');
const PW_CLI = path.join(REPO, 'node_modules', '@playwright', 'test', 'cli.js');
const RUNS_ROOT = path.join(REPO, 'tests', 'artifacts.nosync', 'football-release');
const PORT = Number(new URL(base.use.baseURL).port);
const PROJECTS = base.projects.map(project => project.name);

const DOMAIN = [
  'tests/curriculum-domain.spec.mjs',
  'tests/football-domain.spec.mjs',
  'tests/football-learning-domain.spec.mjs',
  'tests/football-contextual-questions.spec.mjs',
  'tests/football-stats-domain.spec.mjs',
  'tests/football-season-domain.spec.mjs',
  'tests/football-time-lab-domain.spec.mjs',
  'tests/game-registry.spec.mjs',
];
const BROWSER = [
  'tests/curriculum-ui.spec.mjs',
  'tests/football-challenge.spec.mjs',
  'tests/football-arithmetic-ui.spec.mjs',
  'tests/football-call-layout.spec.mjs',
  'tests/football-marker-layout.spec.mjs',
  'tests/football-audio.spec.mjs',
  'tests/football-particles.spec.mjs',
  'tests/football-copy-contract.spec.mjs',
  'tests/football-fireworks.spec.mjs',
  'tests/football-overlay-accessibility.spec.mjs',
  'tests/football-overlay-contract.spec.mjs',
  'tests/football-context-integration.spec.mjs',
  'tests/football-learning.spec.mjs',
  'tests/football-stats.spec.mjs',
  'tests/football-coach-report.spec.mjs',
  'tests/football-opponent-tendencies.spec.mjs',
  'tests/football-presnap-hints.spec.mjs',
  'tests/football-rivals.spec.mjs',
  'tests/football-season.spec.mjs',
  'tests/football-time-lab-ui.spec.mjs',
  'tests/football-release-matrix.spec.mjs',
];
const PLANNED = ['enumerate', 'prepare', 'domain', ...BROWSER, 'case-union', 'verify'];

function usage(message) {
  console.error(`${message}\nUsage: npm run test:football:release [-- --engine=chromium|webkit]`);
  process.exitCode = 2;
}

// True unless both loopback families refuse the connection.
function listening(host) {
  return new Promise(resolve => {
    const socket = net.connect({ port: PORT, host });
    socket.setTimeout(1500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(true); });
    socket.once('error', e => resolve(!['ECONNREFUSED', 'EADDRNOTAVAIL'].includes(e.code)));
  });
}
const portBusy = async () => (await listening('127.0.0.1')) || (await listening('::1'));

async function main(argv) {
  const engine = argv.length === 0 ? 'chromium' : argv.length === 1 && argv[0].match(/^--engine=(chromium|webkit)$/)?.[1];
  if (!engine) return usage(`Unsupported arguments: ${argv.join(' ')}`);
  // The overlay contract spec would write its capture stage outside the run.
  if (process.env.ISSUE49_CAPTURE_STAGE !== undefined) return usage('ISSUE49_CAPTURE_STAGE is set; unset it before a release run.');

  fs.mkdirSync(RUNS_ROOT, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dir = path.join(RUNS_ROOT, `${ts}-${engine}-${crypto.randomBytes(3).toString('hex')}`);
  fs.mkdirSync(dir); // exclusive: never reuses an existing run directory
  const cwd = path.join(dir, 'cwd');
  const logsDir = path.join(dir, 'logs');
  fs.mkdirSync(cwd);
  fs.mkdirSync(logsDir);
  const started = new Date().toISOString();
  const steps = [];
  const rel = p => path.relative(REPO, p);
  const browserEnv = (outDir, json) => ({
    ...process.env, FOOTBALL_RELEASE_ENGINE: engine, FOOTBALL_RELEASE_OUTPUT_DIR: outDir, FOOTBALL_RELEASE_JSON: json,
  });

  function step(name, logName, args, stepCwd, env = process.env) {
    return new Promise(resolve => {
      const t0 = Date.now();
      const logs = [`${logName}.out.log`, `${logName}.err.log`].map(f => path.join(logsDir, f));
      const fds = logs.map(f => fs.openSync(f, 'wx'));
      let settled = false;
      const done = (code, signal, error) => {
        if (settled) return;
        settled = true;
        for (const fd of fds) fs.closeSync(fd);
        const result = { name, ok: code === 0 && !error, code, signal, ...(error && { error: String(error.message ?? error) }), ms: Date.now() - t0, logs: logs.map(rel) };
        steps.push(result);
        console.log(`[football-release] ${name}: ${result.ok ? 'ok' : `FAILED (${result.error ?? signal ?? `code ${code}`})`} in ${(result.ms / 1000).toFixed(1)}s`);
        resolve(result);
      };
      try {
        const child = spawn(process.execPath, args, { cwd: stepCwd, env, stdio: ['ignore', fds[0], fds[1]] });
        child.once('error', error => done(null, null, error));
        child.once('exit', (code, signal) => done(code, signal));
      } catch (error) {
        done(null, null, error);
      }
    });
  }

  function finish(status, extra = {}) {
    const notRun = PLANNED.slice(steps.length);
    const failed = steps.find(s => !s.ok);
    fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({
      engine, status, started, finished: new Date().toISOString(), ...extra, failure: failed ?? null, notRun, steps,
    }, null, 2) + '\n', { flag: 'wx' });
    if (extra.domainCounts) console.log(`[football-release] domain: ${JSON.stringify(extra.domainCounts)}`);
    if (extra.counts) console.log(`[football-release] browser cases: ${JSON.stringify({ ...extra.counts, byProject: undefined })}`);
    if (extra.verifier) console.log(`[football-release] ${extra.verifier}`);
    if (notRun.length) console.log(`[football-release] not run: ${notRun.join(', ')}`);
    console.log(`\n[football-release] ${engine} ${status}\n[football-release] run dir: ${rel(dir)}`);
    process.exitCode = status === 'PASS' ? 0 : 1;
  }

  const portStop = async name => (await portBusy()) && `STOPPED-port-${PORT}-in-use-before-${name}`;
  let stop;

  // 1. Enumeration.
  if ((stop = await portStop('enumerate'))) return finish(stop);
  const enumJson = path.join(dir, 'enumeration.json');
  if (!(await step('enumerate', '00-enumerate', [PW_CLI, 'test', '--config', CONFIG, '--list', ...BROWSER.map(f => path.join(REPO, f))], cwd,
    browserEnv(path.join(dir, 'enumerate-output'), enumJson))).ok) return finish('FAILED-enumerate');

  // 2. Preparation, 3. domain checks.
  if (!(await step('prepare', '01-prepare', [path.join(REPO, 'scripts', 'prepare-football-release-artifacts.mjs')], cwd)).ok) return finish('FAILED-prepare');
  // TAP is Node's own non-TTY default; set explicitly so the counts parse.
  const domain = await step('domain', '02-domain', ['--test', '--test-reporter=tap', ...DOMAIN], REPO);
  const tap = fs.readFileSync(path.join(logsDir, '02-domain.out.log'), 'utf8');
  const domainCounts = Object.fromEntries(['tests', 'pass', 'fail', 'skipped', 'todo', 'cancelled']
    .map(k => [k, Number(tap.match(new RegExp(`^# ${k} (\\d+)`, 'm'))?.[1] ?? NaN)]));
  if (!domain.ok) return finish('FAILED-domain', { domainCounts });

  // 4. One fresh Playwright CLI per whole browser file.
  const parts = [];
  for (const [i, file] of BROWSER.entries()) {
    const name = `${String(i + 10).padStart(2, '0')}-${path.basename(file, '.spec.mjs')}`;
    const fileDir = path.join(dir, 'files', name);
    fs.mkdirSync(fileDir, { recursive: true });
    if ((stop = await portStop(file))) return finish(stop, { domainCounts });
    const json = path.join(fileDir, 'report.json');
    if (!(await step(file, name, [PW_CLI, 'test', '--config', CONFIG, path.join(REPO, file)], cwd,
      browserEnv(path.join(fileDir, 'output'), json))).ok) return finish(`FAILED-${file}`, { domainCounts });
    parts.push({ file, json });
  }

  // 5. Exact case union.
  let validation;
  try {
    const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
    validation = validate(read(enumJson), parts.map(p => ({ file: p.file, report: read(p.json) })), PROJECTS);
  } catch (error) {
    validation = { ok: false, error: String(error.message ?? error) };
  }
  fs.writeFileSync(path.join(dir, 'validation.json'), JSON.stringify(validation, null, 2) + '\n', { flag: 'wx' });
  steps.push({ name: 'case-union', ok: validation.ok, details: rel(path.join(dir, 'validation.json')) });
  if (!validation.ok) return finish('FAILED-case-union', { domainCounts, counts: validation.counts });

  // 6. Strict artifact verifier.
  if (!(await step('verify', '90-verify', [path.join(REPO, 'scripts', 'verify-football-release-artifacts.mjs')], cwd)).ok) {
    return finish('FAILED-verify', { domainCounts, counts: validation.counts });
  }
  const verifier = fs.readFileSync(path.join(logsDir, '90-verify.out.log'), 'utf8').trim();
  return finish('PASS', { domainCounts, counts: validation.counts, verifier });
}

function collect(report) {
  const out = [];
  const visit = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        out.push({
          key: `${spec.file}::${[...titles, spec.title].join(' > ')}::${t.projectName}`,
          file: spec.file, project: t.projectName, status: t.status, results: t.results ?? [],
          annotations: [...(t.annotations ?? []), ...(t.results ?? []).flatMap(r => r.annotations ?? [])],
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child, [...titles, child.title]);
  };
  for (const s of report.suites ?? []) visit(s, []);
  return out;
}

function duplicates(keys) {
  const seen = new Set();
  return [...new Set(keys.filter(k => seen.has(k) || !seen.add(k)))];
}

// Every enumerated case must run exactly once, in its own file's CLI, and
// either pass first time or skip with a reason already present in its spec.
export function validate(enumReport, parts, projects) {
  const rootDir = enumReport.config.rootDir;
  const expected = collect(enumReport);
  const ran = [];
  const partProjects = [];
  for (const p of parts) {
    partProjects.push({ file: p.file, projects: p.report.config.projects.map(x => x.name), errors: p.report.errors?.length ?? 0 });
    for (const c of collect(p.report)) ran.push({ ...c, partition: p.file });
  }
  const expectedKeys = new Set(expected.map(c => c.key));
  const ranKeys = new Set(ran.map(c => c.key));
  const sources = new Map();
  const source = file => {
    if (!sources.has(file)) sources.set(file, fs.readFileSync(path.resolve(rootDir, file), 'utf8'));
    return sources.get(file);
  };
  const skipped = ran.filter(c => c.status === 'skipped');
  const issues = {
    enumerationDuplicates: duplicates(expected.map(c => c.key)),
    duplicates: duplicates(ran.map(c => c.key)),
    missing: [...expectedKeys].filter(k => !ranKeys.has(k)),
    unexpected: [...ranKeys].filter(k => !expectedKeys.has(k)),
    wrongPartition: ran.filter(c => path.basename(c.file) !== path.basename(c.partition)).map(c => c.key),
    projectsDiffer: partProjects.filter(p => JSON.stringify(p.projects) !== JSON.stringify(projects) || p.errors),
    notExactlyOnePassOrSkip: ran.filter(c => !(c.results.length === 1 && c.results[0].retry === 0
      && ((c.status === 'expected' && c.results[0].status === 'passed') || (c.status === 'skipped' && c.results[0].status === 'skipped'))))
      .map(c => ({ key: c.key, status: c.status, results: c.results.map(r => [r.status, r.retry]) })),
    skipsWithoutExistingReason: skipped.filter(c => {
      const reasons = c.annotations.filter(a => a.type === 'skip').map(a => a.description).filter(Boolean);
      return reasons.length === 0 || !reasons.every(d => source(c.file).includes(d));
    }).map(c => ({ key: c.key, annotations: c.annotations })),
    fixmeOrExpectedFail: ran.filter(c => c.annotations.some(a => a.type === 'fixme' || a.type === 'fail')).map(c => c.key),
  };
  const byProject = Object.fromEntries(projects.map(p => [p, {
    cases: ran.filter(c => c.project === p).length,
    passed: ran.filter(c => c.project === p && c.status === 'expected').length,
    skipped: ran.filter(c => c.project === p && c.status === 'skipped').length,
  }]));
  const counts = { files: parts.length, enumerated: expected.length, ran: ran.length, passed: ran.filter(c => c.status === 'expected').length, skipped: skipped.length, byProject };
  return { ok: expected.length > 0 && Object.values(issues).every(v => v.length === 0), counts, issues };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
