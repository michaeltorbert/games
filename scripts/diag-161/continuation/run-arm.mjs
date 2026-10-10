// Issue #161 continuation: one bounded, observed arm from arms.json.
//   node scripts/diag-161/continuation/run-arm.mjs --arm <id> --expect-fingerprint <sha256>
// Exit 0 COMPLETED-PASS, 1 FAILED (a lane failure was captured), 2 STOPPED or
// HARNESS-ERROR (nothing interpretable ran or the harness broke), 3 INCOMPLETE
// (budget, sampled 2 GiB cap, interrupt, or writers not proven exited). Always
// writes a new run directory; it is sealed only after every writer (CLI process
// group, server, owned browsers) is observed to have exited, and is otherwise
// left with UNSEALED-INCOMPLETE.txt and no MANIFEST.sha256.
//
// Order: fingerprint -> environment/port/foreign-WebKit preflight -> observed
// server + marked ready probe -> Playwright CLI in its own process group ->
// probes (5 s), WebKit census (30 s), size watch (5 s), budget -> CLI exit ->
// drain observers (<=40 s) -> marked final probe -> owned-browser and process
// group cleanup (observed exit) -> server stop (observed exit) -> status.json ->
// seal or explicit unsealed marker. Nothing is written after
// MANIFEST.sha256. Cleanup outcomes are recorded beside, never instead of, the
// first failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import { ARM_BUDGET_MS, ARM_BYTES_CAP, HERE, PORT, REPO, args, dirBytes, drainGroup, finalizeEvidence, fingerprint, iso, jsonl, loadArms, newRunDir, versions, webkitExecutable, writeJson } from './lib.mjs';

const PW_CLI = path.join(REPO, 'node_modules', '@playwright', 'test', 'cli.js');
const CONFIG = path.join(HERE, 'continuation.config.mjs');
const CLEANUP_RESERVE_MS = 150_000; // abort, drain, cleanup and sealing stay inside the arm ceiling
const STRIP = ['DEBUG', 'DEBUG_FILE', 'DEBUG_COLORS', 'DEBUG_HIDE_DATE', 'PWDEBUG', 'PW_RUNNER_DEBUG', 'NODE_OPTIONS', 'ISSUE49_CAPTURE_STAGE', 'PLAYWRIGHT_JSON_OUTPUT_FILE', 'CI', 'FORCE_COLOR'];
const REFUSE = ['PLAYWRIGHT_BROWSERS_PATH', 'SELENIUM_REMOTE_URL'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function listening(host) {
  return new Promise(resolve => {
    const s = net.connect({ port: PORT, host });
    s.setTimeout(1500);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(true); });
    s.once('error', e => resolve(!['ECONNREFUSED', 'EADDRNOTAVAIL'].includes(e.code)));
  });
}
const portBusy = async () => (await listening('127.0.0.1')) || (await listening('::1'));

// WebKit processes on the host, including launchd-parented XPC helpers.
function webkitProcesses(webkitDir) {
  const r = spawnSync('ps', ['-axo', 'pid=,ppid=,pgid=,rss=,lstart=,command='], { encoding: 'utf8' });
  return r.stdout.split('\n').map(l => l.trim().split(/\s+/)).filter(t => t.length >= 10).map(t => ({
    pid: Number(t[0]), ppid: Number(t[1]), pgid: Number(t[2]), rssKb: Number(t[3]), lstart: t.slice(4, 9).join(' '), command: t.slice(9).join(' ').slice(0, 300),
  })).filter(p => p.command.includes('ms-playwright/webkit') || p.command.includes(webkitDir));
}

function processInfo(pid) {
  const r = spawnSync('ps', ['-o', 'lstart=,command=', '-p', String(pid)], { encoding: 'utf8' });
  const t = r.stdout.trim().split(/\s+/);
  return t.length >= 6 ? { started: new Date(t.slice(0, 5).join(' ')), command: t.slice(5).join(' ') } : null;
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

function probe(runId, kind) {
  const ua = `diag161c-probe/${runId}/${kind}`;
  const t = Date.now();
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/version.json', headers: { 'user-agent': ua }, timeout: 5000 }, res => {
      res.resume();
      res.on('end', () => resolve({ ev: 'probe', kind, ua, status: res.statusCode, ms: Date.now() - t }));
    });
    req.on('timeout', () => req.destroy(new Error('probe timeout')));
    req.on('error', e => resolve({ ev: 'probe', kind, ua, status: null, error: String(e.message), ms: Date.now() - t }));
  });
}

async function launchedPids(sinkDir) {
  const pids = [];
  if (!fs.existsSync(sinkDir)) return pids;
  for (const f of fs.readdirSync(sinkDir)) {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(sinkDir, f)), crlfDelay: Infinity });
    for await (const l of rl) { const m = l.match(/ pw:browser <launched> pid=(\d+)/); if (m) pids.push({ sink: f, pid: Number(m[1]) }); }
  }
  return pids;
}

function host() {
  const sh = c => spawnSync('sh', ['-c', c], { encoding: 'utf8' }).stdout.trim();
  return { platform: process.platform, release: os.release(), arch: process.arch, swVers: sh('sw_vers'), cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, totalMemBytes: os.totalmem(), loadavg: os.loadavg(), uptimeSec: os.uptime(), bootTime: sh('sysctl -n kern.boottime'), ulimitN: sh('ulimit -n'), hostname: os.hostname() };
}

async function main(argv) {
  const opt = args(argv, { arm: 'value', 'expect-fingerprint': 'value', manifest: 'value' });
  const manifest = loadArms(opt.manifest ?? 'arms.json');
  const arm = manifest.arms.find(a => a.id === opt.arm);
  if (!arm || !/^[0-9a-f]{64}$/.test(opt['expect-fingerprint'] ?? '')) {
    console.error(`Usage: node run-arm.mjs [--manifest <arms*.json>] --arm <${manifest.order.join('|')}> --expect-fingerprint <sha256>`);
    return 2;
  }
  const t0 = Date.now();
  const dir = newRunDir(arm.id);
  const runId = path.basename(dir);
  const cwd = path.join(dir, 'cwd');
  fs.mkdirSync(cwd);
  const runner = jsonl(path.join(dir, 'runner.jsonl'));
  const log = msg => console.log(`[run-arm ${arm.id}] ${msg}`);
  const webkitExe = webkitExecutable();
  const webkitDir = path.dirname(webkitExe);

  const fp = fingerprint();
  const fpStatus = { expected: opt['expect-fingerprint'], actual: fp.sha256, match: fp.sha256 === opt['expect-fingerprint'] };
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !STRIP.includes(k)));
  const childEnv = {
    ...env, DEBUG: 'pw:api,pw:browser,pw:protocol', DEBUG_COLORS: 'no', PW_RUNNER_DEBUG: '1', NO_COLOR: '1',
    DIAG161C_RUN_DIR: dir, DIAG161C_TRACE: arm.trace, DIAG161C_WORKLOAD: arm.workload, DIAG161C_LANES: String(arm.lanes),
  };
  const cliArgs = [PW_CLI, 'test', '--config', CONFIG, `--project=${arm.project}`, `--workers=${arm.workers}`, '--retries=0', '--max-failures=1'];
  const pick = (e, keys) => Object.fromEntries(keys.map(k => [k, e[k] ?? null]));
  const envKeys = [...STRIP, ...REFUSE, 'NO_COLOR', 'DIAG161C_RUN_DIR', 'DIAG161C_TRACE', 'DIAG161C_WORKLOAD', 'DIAG161C_LANES'];
  writeJson(path.join(dir, 'meta.json'), {
    runId, batch: manifest.batch, arm, started: iso(), command: [process.execPath, ...cliArgs], cliCwd: cwd,
    parentEnv: pick(process.env, envKeys), childEnv: pick(childEnv, envKeys), versions: versions(), webkitExecutable: webkitExe,
    host: host(), budgetMs: ARM_BUDGET_MS, bytesCap: ARM_BYTES_CAP, fingerprint: fp,
  });

  const stop = (status, reason, extra = {}, serverExitObserved = true) => {
    runner.write({ ev: 'stop', status, reason });
    runner.close();
    writeJson(path.join(dir, 'status.json'), { runId, arm: arm.id, status, reason, cliStarted: false, finished: iso(), fingerprint: fpStatus, collection: { complete: serverExitObserved, serverExitObserved }, ...extra });
    const fin = finalizeEvidence(dir, serverExitObserved, 'server exit not observed before sealing');
    log(`${status}: ${reason}${fin.sealed ? '' : ' (UNSEALED-INCOMPLETE)'}\n[run-arm ${arm.id}] run dir: ${path.relative(REPO, dir)}`);
    return 2;
  };
  if (!fpStatus.match) return stop('STOPPED-fingerprint', `fingerprint ${fp.sha256} != expected ${opt['expect-fingerprint']}`);
  const refused = REFUSE.filter(k => process.env[k] !== undefined);
  if (refused.length) return stop('STOPPED-environment', `unset ${refused.join(', ')} before running`);
  // Optional predeclared host-load gate (batch 2): a harness stop, never an outcome.
  if (arm.maxLoadAvg1 !== undefined && os.loadavg()[0] > arm.maxLoadAvg1) {
    return stop('STOPPED-host-load', `1-min load average ${os.loadavg()[0].toFixed(2)} > ${arm.maxLoadAvg1}; rerun when the host is quiet`, { loadavg: os.loadavg() });
  }
  if (await portBusy()) return stop('STOPPED-port', `port ${PORT} in use`);
  const foreign = webkitProcesses(webkitDir);
  if (foreign.length) return stop('STOPPED-foreign-webkit', `${foreign.length} WebKit process(es) already running`, { foreign });

  // Observed server, owned by this runner.
  const serverOut = fs.openSync(path.join(dir, 'server-stdout.log'), 'wx');
  const serverErr = fs.openSync(path.join(dir, 'server-stderr.log'), 'wx');
  const server = spawn(process.execPath, [path.join(HERE, 'serve-logged.mjs')], {
    cwd: REPO, env: { ...env, PORT: String(PORT), DIAG161C_SERVER_LOG: path.join(dir, 'server.jsonl') }, stdio: ['ignore', serverOut, serverErr],
  });
  let serverExit = null;
  const serverExited = new Promise(r => server.once('exit', (code, signal) => { serverExit = { code, signal, t: iso() }; runner.write({ ev: 'server.exit', code, signal }); r(); }));
  runner.write({ ev: 'server.spawn', pid: server.pid });
  const stopServer = async () => {
    if (!serverExit) { server.kill('SIGTERM'); await Promise.race([serverExited, sleep(10_000)]); }
    if (!serverExit) { server.kill('SIGKILL'); await Promise.race([serverExited, sleep(5_000)]); }
    for (const fd of [serverOut, serverErr]) fs.closeSync(fd);
    return !!serverExit; // a sent signal is not an observed exit
  };
  const deadline = Date.now() + 10_000;
  const ident = `root=${REPO})`;
  while (Date.now() < deadline && !serverExit && !fs.readFileSync(path.join(dir, 'server-stdout.log'), 'utf8').includes(ident)) await sleep(100);
  const ready = await probe(runId, 'ready');
  runner.write(ready);
  const serverSaw = ua => fs.existsSync(path.join(dir, 'server.jsonl')) && fs.readFileSync(path.join(dir, 'server.jsonl'), 'utf8').includes(JSON.stringify(ua));
  if (serverExit || ready.status !== 200 || !serverSaw(ready.ua)) {
    const exited = await stopServer();
    return stop('STOPPED-observer', `server identity/observer not proven (exit=${JSON.stringify(serverExit)}, ready=${ready.status})`, {}, exited);
  }

  // Playwright CLI in its own process group.
  const cliOut = fs.openSync(path.join(dir, 'cli-stdout.log'), 'wx');
  const cliErr = fs.openSync(path.join(dir, 'cli-stderr.log'), 'wx');
  const cli = spawn(process.execPath, cliArgs, { cwd, env: childEnv, stdio: ['ignore', cliOut, cliErr], detached: true });
  let cliExit = null;
  const cliExited = new Promise(r => {
    cli.once('error', e => { cliExit ??= { code: null, signal: null, error: String(e.message), t: iso() }; r(); });
    cli.once('exit', (code, signal) => { cliExit ??= { code, signal, t: iso() }; r(); });
  });
  runner.write({ ev: 'cli.spawn', pid: cli.pid, args: cliArgs });
  log(`CLI pid ${cli.pid}; run dir ${path.relative(REPO, dir)}`);

  let aborting = null, sealing = false, probeN = 0;
  const inflight = new Set();
  const track = p => { inflight.add(p); p.finally(() => inflight.delete(p)); return p; };
  const abort = reason => track((async () => {
    if (aborting || cliExit || sealing) return;
    aborting = reason;
    runner.write({ ev: 'abort', reason });
    try { process.kill(-cli.pid, 'SIGINT'); } catch { /* group gone */ }
    await Promise.race([cliExited, sleep(30_000)]);
    if (!cliExit && !sealing) { try { process.kill(-cli.pid, 'SIGKILL'); } catch { /* group gone */ } runner.write({ ev: 'abort.sigkill' }); }
    await Promise.race([cliExited, sleep(10_000)]);
  })());
  const timers = [
    setInterval(() => track(probe(runId, `probe-${++probeN}`).then(r => runner.write(r))), 5_000),
    setInterval(() => runner.write({ ev: 'census', loadavg: os.loadavg(), webkit: webkitProcesses(webkitDir) }), 30_000),
    setInterval(() => { const bytes = dirBytes(dir); if (bytes > ARM_BYTES_CAP) { runner.write({ ev: 'size', bytes }); abort('INCOMPLETE-size-cap'); } }, 5_000),
    setTimeout(() => abort('INCOMPLETE-budget'), ARM_BUDGET_MS - CLEANUP_RESERVE_MS - (Date.now() - t0)),
  ];
  const onSignal = sig => abort(`INCOMPLETE-interrupted-${sig}`);
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  runner.write({ ev: 'census', webkit: webkitProcesses(webkitDir) });

  await cliExited;
  runner.write({ ev: 'cli.exit', ...cliExit });
  for (const t of timers) clearInterval(t);
  // Drain in-flight observers and any abort task before sealing work starts.
  const drained = await Promise.race([Promise.allSettled([...inflight]).then(() => true), sleep(40_000).then(() => false)]);
  sealing = true;
  process.off('SIGINT', onSignal);
  process.off('SIGTERM', onSignal);
  const final = await probe(runId, 'final');
  runner.write(final);
  runner.write({ ev: 'census', webkit: webkitProcesses(webkitDir), after: 'cli-exit' });

  // Owned cleanup: only browsers this arm's sinks recorded launching, verified by
  // command and start time; WebKit XPC helpers (launchd children) are never signalled.
  const leftovers = [];
  for (const { sink, pid } of await launchedPids(path.join(dir, 'sinks'))) {
    if (!alive(pid)) continue;
    const info = processInfo(pid);
    const owned = info && info.command.includes(webkitDir) && info.started.getTime() >= t0 - 2_000;
    if (owned) { try { process.kill(pid, 'SIGKILL'); } catch { /* exited meanwhile */ } await sleep(2_000); }
    leftovers.push({ sink, pid, command: info?.command?.slice(0, 200) ?? null, owned: !!owned, killed: !!owned, aliveAfter: alive(pid) });
  }
  // Writers into the run directory: the CLI's process group (workers write sinks,
  // traces and reports) and the server (server.jsonl). Each must be OBSERVED to
  // have exited before hashing; a sent SIGKILL alone is not enough.
  const group = await drainGroup(cli.pid, { graceMs: 30_000, killWaitMs: 10_000 });
  if (group.killed) runner.write({ ev: 'group.sigkill', lingeringBeforeKill: group.lingeringBeforeKill, remaining: group.remaining });
  for (const fd of [cliOut, cliErr]) fs.closeSync(fd);
  const serverExitObserved = await stopServer();
  const writersExited = group.exited && serverExitObserved && !leftovers.some(l => l.aliveAfter);

  const outcome = aborting ?? (cliExit.error ? 'HARNESS-ERROR' : cliExit.code === 0 ? 'COMPLETED-PASS' : cliExit.code === 1 ? 'FAILED' : `HARNESS-ERROR-cli-${cliExit.code ?? cliExit.signal}`);
  // An unproven writer exit downgrades any outcome to an explicitly unsealed, incomplete run.
  const status = writersExited ? outcome : 'INCOMPLETE-unsealed-writers';
  const collection = {
    runnerObservers: { drained, pendingAtSeal: inflight.size },
    serverExited: serverExitObserved, cliGroup: group, writersExited,
  };
  collection.complete = drained && writersExited && final.status === 200;
  runner.write({ ev: 'finalize', status, outcome });
  runner.close();
  writeJson(path.join(dir, 'status.json'), {
    runId, arm: arm.id, status, outcomeBeforeSealCheck: outcome, cliStarted: true, cli: cliExit, server: serverExit, abort: aborting, finished: iso(), elapsedMs: Date.now() - t0,
    fingerprint: fpStatus, probes: { sent: probeN + 2 }, leftovers, collection, bytes: dirBytes(dir),
  });
  const fin = finalizeEvidence(dir, writersExited, `writers not proven exited: group remaining ${JSON.stringify(group.remaining)}, server exit observed ${serverExitObserved}, leftover browsers alive ${leftovers.filter(l => l.aliveAfter).map(l => l.pid).join(',') || 'none'}`);
  log(`${status}${fin.sealed ? '' : ' (UNSEALED-INCOMPLETE)'}\n[run-arm ${arm.id}] run dir: ${path.relative(REPO, dir)}`);
  return status === 'COMPLETED-PASS' ? 0 : status === 'FAILED' ? 1 : status.startsWith('INCOMPLETE') ? 3 : 2;
}

process.exitCode = await main(process.argv.slice(2)).catch(error => { console.error(error); return 2; });
