// Issue #161 whole-file partitioned release gate (coverage evidence, NOT a
// monolithic browser-lifetime pass and NOT a stall fix).
//   node scripts/diag-161/gate.mjs --engine webkit|chromium [--workers N]
// Steps, all inside one new evidence dir, stopping at the first failure:
//   1. fresh `--list` enumeration of the current release browser selection
//   2. release-artifact preparation once (run-local cwd, never the repo's)
//   3. domain/registry `node --test` checks once
//   4. each release browser file in its own fresh Playwright CLI/browser,
//      package.json order, all six projects, retries 0, unchanged deadlines
//   5. exact case-union validation against the enumeration
//   6. the strict release-artifact verifier once
// A failed step is final for this gate run; rerunning creates a separate run
// and never replaces this failure.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  CONFIG, PORT, PROJECTS, PW_CLI, REPO, envRecord, hostInfo, jsonl, newRunDir, parseArgs, portFree,
  releaseSelection, scrubbedEnv, sourceFingerprint, toolVersions, writeManifest, writeOnce,
} from './lib.mjs';

const opts = parseArgs(process.argv.slice(2));
const engine = opts.engine;
if (!['webkit', 'chromium'].includes(engine)) {
  console.error('Usage: gate.mjs --engine webkit|chromium [--workers N]');
  process.exit(2);
}
const workers = opts.workers ? [`--workers=${Number(opts.workers)}`] : [];
const { id, dir } = newRunDir(`gate-${engine}`);
const cwd = path.join(dir, 'cwd');
const stepsDir = path.join(dir, 'steps');
fs.mkdirSync(cwd);
fs.mkdirSync(stepsDir);
const log = jsonl(path.join(dir, 'gate.jsonl'));
const sel = releaseSelection();
const pwEnv = (runDir, json) => scrubbedEnv({ DIAG161_MODE: 'gate', DIAG161_RUN_DIR: runDir, DIAG161_JSON: json, DIAG161_ENGINE: engine });
const abs = f => path.join(REPO, f);
const steps = [];

function step(name, args, { cwd: stepCwd, env = scrubbedEnv({}) }) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const out = fs.openSync(path.join(stepsDir, `${name}.out.log`), 'a');
    const err = fs.openSync(path.join(stepsDir, `${name}.err.log`), 'a');
    log.write('step.begin', { name, argv: [process.execPath, ...args], cwd: stepCwd });
    const child = spawn(process.execPath, args, { cwd: stepCwd, env, stdio: ['ignore', out, err] });
    child.on('exit', (code, signal) => {
      const result = { name, code, signal, ms: Date.now() - t0 };
      log.write('step.end', result);
      steps.push(result);
      console.log(`[diag-161 gate] ${name}: ${code === 0 ? 'ok' : `FAILED (code ${code ?? signal})`} in ${(result.ms / 1000).toFixed(1)}s`);
      resolve(result);
    });
  });
}

async function finish(status, extra = {}) {
  writeOnce(path.join(dir, 'status.json'), { gateId: id, engine, status, steps, ...extra });
  log.close();
  await writeManifest(dir);
  console.log(`\n[diag-161 gate] ${engine} ${status}\n[diag-161 gate] run dir: ${dir}`);
  process.exit(status === 'PASS' ? 0 : 1);
}

async function needFreePort(name) {
  const port = await portFree(PORT);
  if (!port.free) await finish(`STOPPED-port-${PORT}-in-use-before-${name}`, { port });
}

const [fingerprint, host] = await Promise.all([sourceFingerprint(), hostInfo()]);
writeOnce(path.join(dir, 'meta.json'), {
  gateId: id, engine, workers: workers[0] ?? 'playwright default', selection: sel, versions: toolVersions(), host,
  parentEnv: envRecord(process.env), fingerprint, started: new Date().toISOString(),
  limits: 'Whole-file partitions bound browser lifetime to one file; this is coverage evidence, not a monolithic pass or a stall fix.',
});

// 1. Enumeration.
await needFreePort('enumerate');
const enumJson = path.join(dir, 'enumeration.json');
if ((await step('00-enumerate', [PW_CLI, 'test', '--config', CONFIG, '--list', ...sel.browser.map(abs)], { cwd, env: pwEnv(path.join(dir, 'enumerate'), enumJson) })).code !== 0) await finish('FAILED-enumerate');

// 2. Preparation, 3. domain checks.
if ((await step('01-prepare', [abs(sel.pre.replace(/^node\s+/, ''))], { cwd })).code !== 0) await finish('FAILED-prepare');
// TAP is Node's own non-TTY default; set explicitly so the counts parse.
if ((await step('02-domain', ['--test', '--test-reporter=tap', ...sel.domain], { cwd: REPO })).code !== 0) await finish('FAILED-domain');
const tap = fs.readFileSync(path.join(stepsDir, '02-domain.out.log'), 'utf8');
const domainCounts = Object.fromEntries(['tests', 'pass', 'fail', 'skipped', 'todo', 'cancelled'].map(k => [k, Number(tap.match(new RegExp(`^# ${k} (\\d+)`, 'm'))?.[1] ?? NaN)]));

// 4. Whole-file partitions.
const partitions = [];
for (const [i, file] of sel.browser.entries()) {
  const name = `${String(i + 10).padStart(2, '0')}-${path.basename(file, '.spec.mjs')}`;
  const partDir = path.join(dir, 'partitions', name);
  fs.mkdirSync(partDir, { recursive: true });
  await needFreePort(name);
  const json = path.join(partDir, 'report.json');
  const r = await step(name, [PW_CLI, 'test', '--config', CONFIG, ...workers, '--retries=0', abs(file)], { cwd, env: pwEnv(partDir, json) });
  partitions.push({ file, json });
  if (r.code !== 0) await finish(`FAILED-partition-${name}`, { notRun: sel.browser.slice(i + 1), domainCounts });
}

// 5. Exact case union.
const validation = validate(JSON.parse(fs.readFileSync(enumJson, 'utf8')), partitions);
writeOnce(path.join(dir, 'validation.json'), validation);
if (!validation.ok) await finish('FAILED-case-union', { domainCounts, counts: validation.counts });

// 6. Strict artifact verifier.
if ((await step('90-verify', [abs(sel.post.replace(/^node\s+/, ''))], { cwd })).code !== 0) await finish('FAILED-verify', { domainCounts, counts: validation.counts });
const verified = fs.readFileSync(path.join(stepsDir, '90-verify.out.log'), 'utf8').trim();
await finish('PASS', { domainCounts, counts: validation.counts, verifier: verified });

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

function validate(enumReport, parts) {
  const rootDir = enumReport.config.rootDir;
  const expected = collect(enumReport);
  const ran = [];
  const partitionProjects = [];
  for (const p of parts) {
    const report = JSON.parse(fs.readFileSync(p.json, 'utf8'));
    partitionProjects.push({ file: p.file, projects: report.config.projects.map(x => x.name), errors: report.errors?.length ?? 0 });
    for (const c of collect(report)) ran.push({ ...c, partition: p.file });
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
    projectsDiffer: partitionProjects.filter(p => JSON.stringify(p.projects) !== JSON.stringify(PROJECTS) || p.errors),
    notExactlyOnePassOrSkip: ran.filter(c => !(c.results.length === 1 && c.results[0].retry === 0
      && ((c.status === 'expected' && c.results[0].status === 'passed') || (c.status === 'skipped' && c.results[0].status === 'skipped'))))
      .map(c => ({ key: c.key, status: c.status, results: c.results.map(r => [r.status, r.retry]) })),
    // An intentional skip must carry a reason that already exists verbatim in its spec file.
    skipsWithoutExistingReason: skipped.filter(c => {
      const reasons = c.annotations.filter(a => a.type === 'skip').map(a => a.description).filter(Boolean);
      return reasons.length === 0 || !reasons.every(d => source(c.file).includes(d));
    }).map(c => ({ key: c.key, annotations: c.annotations })),
    fixmeOrExpectedFail: ran.filter(c => c.annotations.some(a => a.type === 'fixme' || a.type === 'fail')).map(c => c.key),
  };
  const byProject = Object.fromEntries(PROJECTS.map(p => [p, {
    cases: ran.filter(c => c.project === p).length,
    passed: ran.filter(c => c.project === p && c.status === 'expected').length,
    skipped: ran.filter(c => c.project === p && c.status === 'skipped').length,
  }]));
  const counts = { files: parts.length, enumerated: expected.length, ran: ran.length, passed: ran.filter(c => c.status === 'expected').length, skipped: skipped.length, byProject };
  return { ok: Object.values(issues).every(v => v.length === 0), counts, issues };
}
