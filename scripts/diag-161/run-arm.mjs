// Issue #161 bounded diagnostic arm runner.
//   node scripts/diag-161/run-arm.mjs --arm <selfcheck|smoke|serial|workers2>
//   node scripts/diag-161/run-arm.mjs --arm serial-trace-off --question "<parent-recorded question>"
// Every arm: new immutable run dir, runner-owned logged server on 8090 (never a
// reused or foreign listener), WebKit on all six projects, --retries=0,
// --max-failures=1, unchanged test deadlines, outer budget <= 15 min and a
// 2 GiB debug/protocol cap. Budget or cap exhaustion signals only this run's own
// process group/tree and is recorded INCOMPLETE, never as a pass.
//
// Sealing order (nothing may write after MANIFEST.sha256):
//   stop timers and refuse new observer work -> drain in-flight probes/ps
//   (bounded) -> stop the server and wait for its exit -> wait for, then kill,
//   any process left in the CLI's own process group (e.g. post-onset sample)
//   -> summary/status -> close runner log -> manifest.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import {
  CONFIG, DIAG_DIR, PORT, PROBE_UA, PW_CLI, REPO, descendants, envRecord, hostInfo, jsonl, newRunDir,
  parseArgs, portFree, processSummary, psSnapshot, readJsonl, releaseSelection, scrubbedEnv, sleep,
  sourceFingerprint, summarizeRun, toolVersions, within, writeManifest, writeOnce,
} from './lib.mjs';

const SMOKE_FILE = 'tests/football-opponent-tendencies.spec.mjs';
const SMOKE_TITLE = 'fourth-quarter boundary catches up when behind and protects a lead';
const MAX_BUDGET_MIN = 15;
const PROTOCOL_CAP_BYTES = 2 * 1024 ** 3;
const SIGINT_GRACE_MS = 60_000;
const OBSERVER_DRAIN_MS = 40_000;
const GROUP_DRAIN_MS = 30_000;
const ARMS = {
  selfcheck: { mode: 'selfcheck', workers: 1, trace: 'on', budgetMin: 5 },
  smoke: { mode: 'arm', workers: 1, trace: 'on', budgetMin: 5, files: [SMOKE_FILE], grep: SMOKE_TITLE },
  serial: { mode: 'arm', workers: 1, trace: 'on', release: true },
  workers2: { mode: 'arm', workers: 2, trace: 'on', release: true },
  // Optional matched pair; only after analysis and a parent-recorded question.
  'serial-trace-off': { mode: 'arm', workers: 1, trace: 'off', release: true, needsQuestion: true },
  'workers2-trace-off': { mode: 'arm', workers: 2, trace: 'off', release: true, needsQuestion: true },
  // The single conditional matched differential pair (synthetic; see differential/lifecycle.spec.mjs).
  // Identical cycles; only the number of contexts per browser lifetime differs.
  'diff-single': { mode: 'differential', diff: 'single', workers: 1, trace: 'on', needsQuestion: true },
  'diff-relaunch': { mode: 'differential', diff: 'relaunch', workers: 1, trace: 'on', needsQuestion: true },
};

const opts = parseArgs(process.argv.slice(2));
const armName = opts.arm;
const arm = ARMS[armName];
if (!arm) {
  console.error(`Usage: run-arm.mjs --arm <${Object.keys(ARMS).join('|')}> [--budget-min N<=15] [--question "..."] [--no-samples] [--synthetic-abort-race <delayMs> (selfcheck only)]`);
  process.exit(2);
}
if (arm.needsQuestion && (typeof opts.question !== 'string' || !opts.question.trim())) {
  console.error(`${armName} requires --question with the parent-recorded instrumentation question.`);
  process.exit(2);
}
const budgetMin = Math.min(Number(opts['budget-min'] ?? arm.budgetMin ?? MAX_BUDGET_MIN), arm.budgetMin ?? MAX_BUDGET_MIN);
if (!(budgetMin > 0)) throw new Error('Invalid --budget-min');
// Harness-only check of the abort/natural-exit overlap: when the CLI exits,
// start an abort whose work is delayed by N ms so it overlaps finalize.
const raceDelayMs = opts['synthetic-abort-race'] === undefined ? null : Number(opts['synthetic-abort-race']);
if (raceDelayMs !== null && (armName !== 'selfcheck' || !(raceDelayMs >= 0))) {
  console.error('--synthetic-abort-race <delayMs> is only valid with --arm selfcheck');
  process.exit(2);
}

const { id, dir } = newRunDir(armName);
const runner = jsonl(path.join(dir, 'runner.jsonl'));
const procDir = path.join(dir, 'proc');
const cwd = path.join(dir, 'cwd'); // spec-relative artifact writes land here, not in the repo
fs.mkdirSync(procDir);
fs.mkdirSync(cwd);
const outFd = name => fs.openSync(path.join(dir, name), 'a');
const probeUa = `${PROBE_UA}/${id}`;

const files = arm.release ? releaseSelection().browser : (arm.files ?? []);
const cliArgs = [
  PW_CLI, 'test', '--config', CONFIG, `--workers=${arm.workers}`, '--retries=0', '--max-failures=1',
  ...(arm.grep ? ['--grep', arm.grep] : []),
  ...files.map(f => path.join(REPO, f)),
];
if (cliArgs.some(a => a.startsWith('--browser'))) throw new Error('--browser would replace the six projects');
const childEnv = scrubbedEnv({
  DEBUG: 'pw:api,pw:browser,pw:protocol', DEBUG_COLORS: 'no',
  // Workers inherit the CLI stderr fd instead of forwarding stderr over IPC,
  // so protocol logs go straight to cli-stderr.log, not into reports or traces.
  PW_RUNNER_DEBUG: '1',
  DIAG161_MODE: arm.mode, DIAG161_RUN_DIR: dir, DIAG161_RUN_ID: id, DIAG161_TRACE: arm.trace,
  DIAG161_SAMPLES: opts['no-samples'] ? '0' : '1',
  DIAG161_DIFF: arm.diff ?? '',
});

let status = null;
let cli = null;
let cliExit = null;
let server = null;
let serverExited = null;
let serverExit = null;
let sealing = false;
let cliDone = false;
let abortTask = null; // the single owned abort; tracked so finalize drains it
let abortSettled = false;
let budgetTimer = null;
const known = new Map(); // every descendant pid ever seen -> command
const timers = [];
const inflight = new Set();
const track = promise => {
  inflight.add(promise);
  promise.finally(() => inflight.delete(promise)).catch(() => {});
  return promise;
};
// Periodic observer work; refused once sealing starts.
const every = (ms, fn) => timers.push(setInterval(() => {
  if (!sealing) track(Promise.resolve().then(fn)).catch(e => runner.write('observer.error', { error: String(e) }));
}, ms));

async function finalize(exitCode) {
  if (sealing) return;
  sealing = true;
  for (const t of timers) clearInterval(t);
  clearTimeout(budgetTimer);
  const collection = {};
  const pending = [...inflight];
  collection.runnerObservers = { pendingAtSeal: pending.length, drained: pending.length === 0 || await within(Promise.allSettled(pending), OBSERVER_DRAIN_MS) };
  // An abort that outlived the bounded drain re-checks `sealing` after every
  // await and stops before any write or signal; it is recorded, not hidden.
  collection.abortTask = !abortTask ? 'none' : abortSettled ? 'settled' : 'unsettled-at-seal';

  if (server && !serverExit) {
    server.kill('SIGTERM');
    if (!await within(serverExited, 5000)) {
      server.kill('SIGKILL');
      collection.serverSigkill = true;
      await within(serverExited, 5000);
    }
  }
  collection.serverExited = !!serverExit;

  // Collectors spawned by the reporter (lsof, sample) inherit the CLI's process
  // group and can outlive the CLI. Wait for them, then end only that group.
  if (cli) {
    const groupLeft = async () => (await psSnapshot()).rows.filter(r => r.pgid === cli.pid);
    let left = await groupLeft();
    for (const t0 = Date.now(); left.length && Date.now() - t0 < GROUP_DRAIN_MS; left = await groupLeft()) await sleep(1000);
    collection.cliGroupRemaining = left.map(r => ({ pid: r.pid, command: r.command.slice(0, 120) }));
    if (left.length) {
      try { process.kill(-cli.pid, 'SIGKILL'); } catch {}
      await sleep(1000);
      collection.cliGroupAfterKill = (await groupLeft()).map(r => r.pid);
    }
  }

  const events = readJsonl(path.join(dir, 'events.jsonl'));
  const reporterDrain = events.filter(e => e.ev === 'collector.drain').at(-1) ?? null;
  const captures = events.filter(e => e.ev === 'stall.onset' && e.capture).map(e => e.label);
  const outcomes = new Set(events.filter(e => e.ev === 'stall.snapshot' || e.ev === 'stall.snapshot.error').map(e => e.label));
  collection.reporterDrain = reporterDrain;
  collection.snapshotsWithoutOutcome = captures.filter(l => !outcomes.has(l));
  collection.complete = collection.runnerObservers.drained && collection.abortTask !== 'unsettled-at-seal' && collection.serverExited
    && !collection.cliGroupRemaining?.length && (cli ? reporterDrain?.complete === true : true)
    && collection.snapshotsWithoutOutcome.length === 0;

  const summary = summarizeRun(dir);
  writeOnce(path.join(dir, 'summary.json'), summary);
  const sizes = Object.fromEntries(['cli-stderr.log', 'cli-stdout.log', 'server.jsonl', 'events.jsonl']
    .map(f => [f, fs.existsSync(path.join(dir, f)) ? fs.statSync(path.join(dir, f)).size : null]));
  writeOnce(path.join(dir, 'status.json'), {
    runId: id, arm: armName, status, serverExit, budgetMin, protocolCapBytes: PROTOCOL_CAP_BYTES, sizes, collection,
    exposure: `${summary.endedCases} ended cases (${summary.totals.passed} passed, ${summary.totals.skipped} skipped, `
      + `${summary.failures.length} not passed); ${summary.startedNotEnded.length} started-not-ended; `
      + `${summary.totals.notRun} not run of ${summary.totals.enumerated} enumerated`,
  });
  runner.write('finalize', { status, collectionComplete: collection.complete });
  runner.close();
  const count = await writeManifest(dir);
  console.log(`\n[diag-161] ${armName} ${status}${collection.complete ? '' : ' (evidence collection INCOMPLETE, see status.json)'}`
    + `\n[diag-161] run dir: ${dir}\n[diag-161] ${count} files indexed in MANIFEST.sha256`);
  process.exit(exitCode);
}

function probe() {
  return new Promise(resolve => {
    const t0 = process.hrtime.bigint();
    const ms = () => Number(process.hrtime.bigint() - t0) / 1e6;
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/version.json', agent: false, headers: { 'user-agent': probeUa } }, res => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, ms: ms() }));
    });
    req.setTimeout(3000, () => req.destroy(new Error('timeout')));
    req.on('error', e => resolve({ error: e.message, ms: ms() }));
  });
}

async function snapshot(tag) {
  const ps = await psSnapshot();
  if (sealing) return ps; // no evidence write of any kind once sealing began
  fs.appendFileSync(path.join(procDir, 'ps-periodic.txt'), `=== ${new Date().toISOString()} ${tag} ===\n${ps.raw}`);
  if (cli) for (const r of descendants(ps.rows, cli.pid)) known.set(r.pid, r.command);
  runner.write('proc', { tag, summary: cli ? processSummary(ps.rows, cli.pid) : null });
  return ps;
}

function stillOurs(rows, pid) {
  const row = rows.find(r => r.pid === pid);
  return row && row.command === known.get(pid);
}

// Budget, cap, signal and harness-error aborts all go through here: at most one
// abort exists and it is owned (tracked) work, so finalize drains it. No cycle:
// abort waits only on cliExit (bounded), and finalize starts only after cliExit.
function requestAbort(reason, delayMs = 0) {
  // After a natural CLI exit only the synthetic race check may start an abort.
  if (abortTask || sealing || !cli || (cliDone && !delayMs)) return abortTask;
  abortTask = abort(reason, delayMs).catch(e => { if (!sealing) runner.write('abort.error', { error: String(e) }); })
    .finally(() => { abortSettled = true; });
  track(abortTask);
  return abortTask;
}

// `sealing` is re-checked after every await; once set, no write and no signal.
async function abort(reason, delayMs) {
  status = reason;
  runner.write('abort.begin', { reason, cliExited: cliDone, syntheticDelayMs: delayMs || null });
  if (delayMs) await sleep(delayMs);
  if (sealing) return;
  await snapshot('abort');
  if (sealing) return;
  if (cliDone) { runner.write('abort.signal.skipped', { reason: 'CLI already exited' }); return; }
  try { process.kill(-cli.pid, 'SIGINT'); runner.write('abort.signal.sent', { signal: 'SIGINT' }); } catch (e) { runner.write('abort.signal.error', { error: String(e) }); }
  if (await within(cliExit, SIGINT_GRACE_MS) || sealing || cliDone) return;
  runner.write('abort.signal.sent', { signal: 'SIGKILL' });
  try { process.kill(-cli.pid, 'SIGKILL'); } catch {}
}

try {
  const [fingerprint, host] = await Promise.all([sourceFingerprint(), hostInfo()]);
  const { webkit } = await import('playwright-core');
  writeOnce(path.join(dir, 'meta.json'), {
    runId: id, arm: armName, armDefinition: arm, question: opts.question ?? null, budgetMin, syntheticAbortRaceDelayMs: raceDelayMs,
    protocolCapBytes: PROTOCOL_CAP_BYTES, started: new Date().toISOString(),
    command: [process.execPath, ...cliArgs], cliCwd: cwd, files, probeUa,
    parentEnv: envRecord(process.env), childEnv: envRecord(childEnv),
    versions: toolVersions(), webkitExecutable: webkit.executablePath(),
    webkitExecutableExists: fs.existsSync(webkit.executablePath()),
    host, fingerprint,
    bounds: { sigintGraceMs: SIGINT_GRACE_MS, observerDrainMs: OBSERVER_DRAIN_MS, groupDrainMs: GROUP_DRAIN_MS, reporterDrainMs: 40_000 },
    perturbations: [
      `trace=${arm.trace}`, 'DEBUG=pw:api,pw:browser,pw:protocol to cli-stderr.log', 'PW_RUNNER_DEBUG=1 (worker stderr bypasses IPC)',
      'runner-owned server (not Playwright webServer); sync JSONL write per server event',
      `health probe GET /version.json every 5s (UA ${probeUa})`, 'host ps every 30s',
      `post-onset lsof${opts['no-samples'] ? '' : ' + sample'} for first 4 watched steps open >10s`,
      'reporter drains onset collectors (<=40s) after the last test ends; no test deadline changes',
      'spec cwd is run-local cwd/ so relative artifact writes stay in this run',
    ],
  });

  const port = await portFree(PORT);
  runner.write('port.check', port);
  if (!port.free) {
    status = 'ABORTED-port-8090-in-use';
    console.error(`[diag-161] 127.0.0.1/::1:${PORT} already has a listener; nothing was reused or killed.`);
    await finalize(2);
  }

  const serverLog = path.join(dir, 'server.jsonl');
  server = spawn(process.execPath, [path.join(DIAG_DIR, 'serve-logged.mjs'), `--diag161-run=${id}`], {
    cwd: REPO,
    env: scrubbedEnv({ PORT: String(PORT), DIAG161_SERVER_LOG: serverLog }),
    stdio: ['ignore', outFd('server-stdout.log'), outFd('server-stderr.log')],
  });
  serverExited = new Promise(resolve => server.on('exit', (code, signal) => {
    serverExit = { code, signal, t: new Date().toISOString() };
    runner.write('server.exit', serverExit);
    resolve(serverExit);
  }));
  runner.write('server.spawn', { pid: server.pid });

  let ready = null;
  let attempts = 0;
  for (; attempts < 60 && !ready && !serverExit; attempts++) {
    const r = await probe();
    if (r.status === 200) ready = r; else await sleep(250);
  }
  // Positive observer evidence: check-run requires the server to log this request.
  runner.write('probe.ready', { ...(ready ?? { error: 'not ready' }), attempts, ua: probeUa });
  const stdout = fs.readFileSync(path.join(dir, 'server-stdout.log'), 'utf8');
  const identity = { ready: !!ready, rootLine: stdout.includes(`(root=${REPO})`), pid: server.pid };
  runner.write('server.identity', identity);
  if (!identity.ready || !identity.rootLine) {
    status = 'ABORTED-server-identity';
    await finalize(2);
  }

  cli = spawn(process.execPath, cliArgs, {
    cwd, env: childEnv, detached: true, stdio: ['ignore', outFd('cli-stdout.log'), outFd('cli-stderr.log')],
  });
  cliExit = new Promise(resolve => cli.on('exit', (code, signal) => {
    cliDone = true;
    runner.write('cli.exit', { code, signal });
    resolve({ code, signal });
    if (raceDelayMs !== null) requestAbort('INCOMPLETE-synthetic-abort-race', Math.max(1, raceDelayMs));
  }));
  runner.write('cli.spawn', { pid: cli.pid, pgid: cli.pid, argv: cliArgs, cwd });
  console.log(`[diag-161] ${armName} running (cli pid ${cli.pid}); run dir ${dir}`);

  let probing = false;
  every(5000, async () => {
    if (probing) return;
    probing = true;
    try {
      const r = await probe();
      if (!sealing) runner.write('probe', { ...r, ua: probeUa });
    } finally { probing = false; }
  });
  every(30_000, () => snapshot('periodic'));
  every(5000, () => {
    if (fs.statSync(path.join(dir, 'cli-stderr.log')).size > PROTOCOL_CAP_BYTES) requestAbort('INCOMPLETE-protocol-cap');
  });
  budgetTimer = setTimeout(() => requestAbort('INCOMPLETE-budget'), budgetMin * 60_000);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => requestAbort('INCOMPLETE-operator-interrupt'));
  await snapshot('start');

  const { code, signal } = await cliExit;
  clearTimeout(budgetTimer);
  const ps = await snapshot('end');
  const leftovers = [...known.keys()].filter(pid => pid !== cli.pid && stillOurs(ps.rows, pid));
  for (const pid of leftovers) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  runner.write('leftovers', { pids: leftovers.map(pid => ({ pid, command: known.get(pid) })), guard: 'pid+command match against recorded descendants only' });
  runner.write('probe.final', { ...(await probe()), ua: probeUa });

  if (!status) {
    const failed = summarizeRun(dir).failures.length;
    status = code === 0 ? 'COMPLETED-PASS' : code === 1 && failed ? 'FAILED' : `CLI-EXIT-${code ?? signal}`;
  }
  if (serverExit) status += '+SERVER-EXITED-DURING-RUN';
  await finalize(status === 'COMPLETED-PASS' ? 0 : status === 'FAILED' ? 1 : status.startsWith('INCOMPLETE') ? 3 : 2);
} catch (error) {
  runner.write('harness.error', { error: String(error?.stack || error) });
  console.error(error);
  status = status ?? 'HARNESS-ERROR';
  // Waits only on the CLI (bounded by the SIGINT grace and then SIGKILL).
  await requestAbort('HARNESS-ERROR');
  if (cli && !cliDone) await within(cliExit, 10_000);
  await finalize(2);
}
