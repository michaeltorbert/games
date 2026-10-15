// Issue #161 load-wait runner. One mode per invocation; every writing mode
// creates a NEW directory under tests/artifacts.nosync/issue-161/loadwait/,
// sealed last by MANIFEST.sha256 only after every writer is positively
// observed to have exited (otherwise UNSEALED-INCOMPLETE.txt, no manifest).
//
//   node scripts/diag-161/loadwait/run.mjs --mode fingerprint
//   node scripts/diag-161/loadwait/run.mjs --mode pure
//   node scripts/diag-161/loadwait/run.mjs --mode server-fault
//   node scripts/diag-161/loadwait/run.mjs --mode control  --expect-fingerprint <sha> --pure <dir> --server-fault <dir>
//   node scripts/diag-161/loadwait/run.mjs --mode check    --run <run dir>
//   node scripts/diag-161/loadwait/run.mjs --mode faithful --expect-fingerprint <sha> --control-check <check dir>
//   node scripts/diag-161/loadwait/run.mjs --mode batch    --expect-fingerprint <sha>
//
// Exit codes: 0 PASS (pure/server-fault/control check), VALID (faithful
// check), a live run complete with writers exited, or a batch whose faithful
// check is VALID; 1 FAIL/INVALID; 2 STOPPED, refused or harness error;
// 3 INCOMPLETE live run; 4 INCOMPLETE check.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  CEILINGS, FAITHFUL_SPEC, HERE, REFUSE, REPO, STRIP, args, dirBytes, envMetadata, evidenceDir, finalizeEvidence, fingerprint,
  iso, jsonl, newRunDir, sha256File, verifyManifest, versions, webkitExecutable, writeJson,
} from './lib.mjs';
import { APP_PORT, CONTROL_PORT, PROBE_QUERY_KEY } from './project.mjs';
import { analyzeControl, analyzeFaithful, gateDecision, loadRun, serverCompleteness } from './analyze.mjs';
import { runPureControls } from './pure-controls.mjs';
import { drainGroupChecked, finalDecision, isWebKit, observe, preflightDecision } from './procs.mjs';
import { INVENTORY } from './inventory.mjs';

const FAULT_PORT = CONTROL_PORT + 1; // 8095, server-fault mode only
const PW_CLI = path.join(REPO, 'node_modules', '@playwright', 'test', 'cli.js');
const CONFIG = path.join(HERE, 'loadwait.config.mjs');
const PERTURBATIONS = [
  'observer installed at config evaluation in each worker: WKConnection rawSend/_dispatchMessage/_onClose and client BrowserContext close/_onClose prototype wrappers, with synchronous projection and JSONL writes per tracked protocol message',
  'one extra client-instrumentation listener (first in the list) reading apiName/type/method on every API call and calling public test.info(); it defines no run* methods, but clientInstrumentation still awaits one undefined per run* call for it (one extra microtask)',
  'one synchronous callback unshifted onto each test\'s TestInfo._onDidFinishTestFunctions',
  'a second in-memory JSON.parse of every nested Target payload up to 16 MiB (bounded); larger payloads are never parsed and count as collection loss',
  'runner-owned servers with diagnostics_channel observation and one synchronous log write per socket/request event',
  'marked server probes every 5 s; ps census of processes every 5 s; run-directory size sampling every 5 s',
  'a separate pre-CLI node process that imports the configs to record effective settings',
  'webServer removed from the release config; the runner owns the unchanged serve-root on 8090',
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rel = p => path.relative(REPO, p);
const projectProc = p => ({ pid: p.pid, ppid: p.ppid, pgid: p.pgid, rssKb: p.rssKb, exe: path.basename(p.command.split(' ')[0]), argc: p.command.split(' ').length - 1 });

function listening(port, host) {
  return new Promise(resolve => {
    const s = net.connect({ port, host });
    s.setTimeout(1500);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(true); });
    s.once('error', e => resolve(!['ECONNREFUSED', 'EADDRNOTAVAIL'].includes(e.code)));
  });
}
const portBusy = async port => (await listening(port, '127.0.0.1')) || (await listening(port, '::1'));

function host() {
  const sh = (c, a) => spawnSync(c, a, { encoding: 'utf8' }).stdout?.trim() ?? null;
  return { platform: process.platform, release: os.release(), arch: process.arch, swVers: sh('sw_vers', []), bootTime: sh('sysctl', ['-n', 'kern.boottime']), cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, totalMemBytes: os.totalmem(), loadavg: os.loadavg(), uptimeSec: os.uptime() };
}

function get(port, pathname) {
  const t = Date.now();
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname, timeout: 5000 }, res => {
      const hash = crypto.createHash('sha256');
      res.on('data', c => hash.update(c));
      res.on('end', () => resolve({ status: res.statusCode, bodySha256: hash.digest('hex'), ms: Date.now() - t }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', e => resolve({ status: null, errorCode: typeof e?.code === 'string' ? e.code : 'error', ms: Date.now() - t }));
  });
}
const probe = async (port, pathname, token) => ({ ev: 'probe', port, token, ...(await get(port, `${pathname}?${PROBE_QUERY_KEY}=${token}`)) });

// ---------------------------------------------------------------- servers
function startServer(dir, name, port, runner, env, { kind = name, extraEnv = {} } = {}) {
  const out = fs.openSync(path.join(dir, `server-${name}-stdout.log`), 'wx');
  const err = fs.openSync(path.join(dir, `server-${name}-stderr.log`), 'wx');
  const child = spawn(process.execPath, [path.join(HERE, 'serve-observed.mjs')], {
    cwd: REPO, env: { ...env, ...extraEnv, PORT: String(port), LOADWAIT_SERVER: kind === 'control' ? 'control' : 'app', LOADWAIT_SERVER_LOG: path.join(dir, `server-${name}.jsonl`) }, stdio: ['ignore', out, err],
  });
  const s = { name, port, child, exit: null };
  s.exited = new Promise(r => child.once('exit', (code, signal) => { s.exit = { code, signal, t: iso() }; runner.write({ ev: 'server.exit', name, code, signal }); r(); }));
  runner.write({ ev: 'server.spawn', name, pid: child.pid, port });
  s.stop = async () => {
    if (!s.exit) { child.kill('SIGTERM'); await Promise.race([s.exited, sleep(10_000)]); }
    if (!s.exit) { child.kill('SIGKILL'); await Promise.race([s.exited, sleep(5_000)]); }
    for (const fd of [out, err]) { try { fs.closeSync(fd); } catch { /* already closed */ } }
    return !!s.exit; // a sent signal is not an observed exit
  };
  s.ready = async (identity, probePath, token) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && !s.exit && !fs.readFileSync(path.join(dir, `server-${name}-stdout.log`), 'utf8').includes(identity)) await sleep(100);
    const r = await probe(port, probePath, `${token}-ready`);
    runner.write({ ...r, server: name });
    await sleep(200);
    const log = path.join(dir, `server-${name}.jsonl`);
    const seen = fs.existsSync(log) && fs.readFileSync(log, 'utf8').includes(`"probe":"${token}-ready"`);
    return !s.exit && r.status === 200 && seen;
  };
  return s;
}

function effectiveConfig(childEnv) {
  const r = spawnSync(process.execPath, [path.join(HERE, 'effective-config.mjs')], { cwd: REPO, env: childEnv, encoding: 'utf8', timeout: 60_000 });
  if (r.error || r.signal || r.status !== 0) return null;
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return null; }
}

// ---------------------------------------------------------------- live run
async function runLive(mode, expected, { budgetMs, bytesCap }) {
  const ceil = CEILINGS[mode];
  budgetMs = Math.min(budgetMs ?? ceil.budgetMs, ceil.budgetMs);
  bytesCap = Math.min(bytesCap ?? ceil.bytesCap, ceil.bytesCap);
  const t0 = Date.now();
  const dir = newRunDir(mode);
  const runId = path.basename(dir);
  const token = crypto.randomBytes(4).toString('hex');
  const cwd = path.join(dir, 'cwd');
  fs.mkdirSync(cwd);
  const runner = jsonl(path.join(dir, 'runner.jsonl'));
  const log = text => console.log(`[loadwait ${mode}] ${text}`);
  const webkitDir = path.dirname(webkitExecutable());
  const fp = fingerprint();
  const fpStatus = { expected, actual: fp.sha256, match: fp.sha256 === expected };
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !STRIP.includes(k)));
  const childEnv = {
    ...env, NO_COLOR: '1', FOOTBALL_RELEASE_ENGINE: 'webkit', FOOTBALL_RELEASE_OUTPUT_DIR: path.join(dir, 'pw-output'), FOOTBALL_RELEASE_JSON: path.join(dir, 'report.json'),
    LOADWAIT_MODE: mode, LOADWAIT_RUN_DIR: dir, LOADWAIT_SINK_CAP: String(ceil.sinkCapBytes),
  };
  const cliArgs = [PW_CLI, 'test', '--config', CONFIG, ...(mode === 'faithful' ? [path.join(REPO, FAITHFUL_SPEC)] : [])];
  const ports = mode === 'control' ? [APP_PORT, CONTROL_PORT] : [APP_PORT];
  const specSha256 = mode === 'faithful' ? sha256File(path.join(REPO, FAITHFUL_SPEC)) : null;
  writeJson(path.join(dir, 'meta.json'), {
    runId, mode, started: iso(), command: ['node', ...cliArgs.slice(1).map(a => (path.isAbsolute(a) ? rel(a) : a))], cliCwd: rel(cwd), specSha256,
    parentEnv: envMetadata(process.env), childEnvSet: ['NO_COLOR', 'FOOTBALL_RELEASE_ENGINE=webkit', 'FOOTBALL_RELEASE_OUTPUT_DIR', 'FOOTBALL_RELEASE_JSON', `LOADWAIT_MODE=${mode}`, 'LOADWAIT_RUN_DIR', `LOADWAIT_SINK_CAP=${ceil.sinkCapBytes}`],
    versions: versions(), host: host(), ceilings: { budgetMs, reserveMs: ceil.reserveMs, bytesCap, sinkCapBytes: ceil.sinkCapBytes }, ports,
    fingerprint: { sha256: fp.sha256, baseSha256: fp.baseSha256, head: fp.head, extra: fp.extra, webkit: fp.webkit, node: fp.node, platform: fp.platform, arch: fp.arch },
    perturbations: PERTURBATIONS, fontsReady: 'UNOBSERVED by design (no page script, polling or extra protocol command)',
  });

  const stop = (status, why, extra = {}, writersExited = true) => {
    runner.write({ ev: 'stop', status, why });
    runner.close();
    writeJson(path.join(dir, 'status.json'), { runId, mode, status, why, cliStarted: false, writersExited, collection: { complete: false }, finished: iso(), fingerprint: fpStatus, ...extra });
    const fin = finalizeEvidence(dir, writersExited, 'server exit not observed before sealing');
    log(`${status}: ${why}${fin.sealed ? '' : ' (UNSEALED-INCOMPLETE)'}\n[loadwait ${mode}] run dir: ${rel(dir)}`);
    return { code: 2, dir, status };
  };
  if (!fpStatus.match) return stop('STOPPED-fingerprint', `fingerprint ${fp.sha256} != expected ${expected}`);
  const refused = REFUSE.filter(k => process.env[k] !== undefined);
  if (refused.length) return stop('STOPPED-environment', `unset ${refused.join(', ')} before running`);
  if (mode === 'faithful' && specSha256 !== INVENTORY.specSha256) return stop('STOPPED-spec', 'faithful spec bytes differ from the original inventory');
  const effective = effectiveConfig(childEnv);
  if (!effective) return stop('STOPPED-effective-config', 'effective config could not be resolved');
  writeJson(path.join(dir, 'effective-config.json'), effective);
  if (mode === 'faithful') {
    const bad = Object.entries(INVENTORY.effective).filter(([k, v]) => JSON.stringify(effective[k]) !== JSON.stringify(v)).map(([k]) => k);
    if (bad.length) return stop('STOPPED-effective-config', `effective settings differ from the original exposure: ${bad.join(', ')}`);
  }
  for (const port of ports) if (await portBusy(port)) return stop('STOPPED-port', `port ${port} in use; a foreign listener is never reused`);
  const pre = preflightDecision(observe(), webkitDir);
  if (!pre.ok) return stop(pre.status, pre.why, pre.foreign ? { foreign: pre.foreign.map(projectProc) } : {});

  const servers = [startServer(dir, 'app', APP_PORT, runner, env)];
  if (mode === 'control') servers.push(startServer(dir, 'control', CONTROL_PORT, runner, env));
  const stopServers = async () => (await Promise.all(servers.map(s => s.stop()))).every(Boolean);
  const readyApp = await servers[0].ready(`(root=${REPO})`, '/version.json', token);
  const readyCtl = mode === 'control' ? await servers[1].ready(`listening on http://127.0.0.1:${CONTROL_PORT}`, '/ctl/ok.svg', token) : true;
  if (!readyApp || !readyCtl) {
    const exited = await stopServers();
    return stop('STOPPED-observer', `server identity/observer not proven (app ${readyApp}, control ${readyCtl})`, {}, exited);
  }

  const cliOut = fs.openSync(path.join(dir, 'cli-stdout.log'), 'wx');
  const cliErr = fs.openSync(path.join(dir, 'cli-stderr.log'), 'wx');
  const cli = spawn(process.execPath, cliArgs, { cwd, env: childEnv, stdio: ['ignore', cliOut, cliErr], detached: true });
  let cliExit = null;
  const cliExited = new Promise(r => {
    cli.once('error', e => { cliExit ??= { code: null, signal: null, errorCode: typeof e?.code === 'string' ? e.code : 'spawn-error', t: iso() }; r(); });
    cli.once('exit', (code, signal) => { cliExit ??= { code, signal, t: iso() }; r(); });
  });
  runner.write({ ev: 'cli.spawn', pid: cli.pid });
  log(`CLI pid ${cli.pid}; run dir ${rel(dir)}`);

  // Owned browsers: WebKit processes whose parent is in the CLI process group
  // (a worker), and every process sharing such a browser's process group.
  // Every other WebKit process seen after preflight (which saw none) is "new";
  // it must be owned or be observed gone before the run can be complete.
  const owned = new Map(); // pgid -> first-seen projection
  const seenWebKit = new Map(); // pid -> projection
  let censusErrors = 0, lastCensus = '';
  const census = after => {
    const obs = observe();
    if (!obs.ok) { censusErrors++; runner.write({ ev: 'census.unavailable', reason: obs.reason, after: after ?? null }); return null; }
    const cliGroup = new Set(obs.procs.filter(p => p.pgid === cli.pid).map(p => p.pid));
    const wk = obs.procs.filter(p => isWebKit(p, webkitDir));
    for (const p of wk) {
      seenWebKit.set(p.pid, projectProc(p));
      if (cliGroup.has(p.ppid) && !owned.has(p.pgid)) { owned.set(p.pgid, projectProc(p)); runner.write({ ev: 'owned.browser', ...projectProc(p) }); }
    }
    const view = wk.map(p => ({ ...projectProc(p), owned: owned.has(p.pgid) }));
    const sig = JSON.stringify(view.map(v => [v.pid, v.owned]));
    if (sig !== lastCensus || after) { lastCensus = sig; runner.write({ ev: 'census', after: after ?? null, loadavg: os.loadavg(), webkit: view }); }
    return obs;
  };

  let aborting = null, sealing = false, probeN = 0;
  const inflight = new Set();
  const track = p => { inflight.add(p); p.finally(() => inflight.delete(p)); return p; };
  const abort = why => track((async () => {
    if (aborting || cliExit || sealing) return;
    aborting = why;
    runner.write({ ev: 'abort', why });
    try { process.kill(-cli.pid, 'SIGINT'); } catch { /* group gone */ }
    await Promise.race([cliExited, sleep(30_000)]);
    if (!cliExit && !sealing) { try { process.kill(-cli.pid, 'SIGKILL'); } catch { /* group gone */ } runner.write({ ev: 'abort.sigkill' }); }
    await Promise.race([cliExited, sleep(10_000)]);
  })());
  const timers = [
    setInterval(() => {
      const n = ++probeN;
      track(probe(APP_PORT, '/version.json', `${token}-p${n}`).then(r => runner.write({ ...r, server: 'app' })));
      if (mode === 'control') track(probe(CONTROL_PORT, '/ctl/ok.svg', `${token}-p${n}`).then(r => runner.write({ ...r, server: 'control' })));
    }, 5_000),
    setInterval(() => census(), 5_000),
    setInterval(() => { const bytes = dirBytes(dir); if (bytes > bytesCap) { runner.write({ ev: 'size', bytes }); abort('INCOMPLETE-size-cap'); } }, 5_000),
    setTimeout(() => abort('INCOMPLETE-budget'), budgetMs - ceil.reserveMs - (Date.now() - t0)),
  ];
  const onSignal = sig => abort(`INCOMPLETE-interrupted-${sig}`);
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  census('start');

  await cliExited;
  runner.write({ ev: 'cli.exit', ...cliExit });
  for (const t of timers) clearInterval(t);
  census('cli-exit');
  const drained = await Promise.race([Promise.allSettled([...inflight]).then(() => true), sleep(40_000).then(() => false)]);
  sealing = true;
  process.off('SIGINT', onSignal);
  process.off('SIGTERM', onSignal);
  const finals = [{ ...(await probe(APP_PORT, '/version.json', `${token}-final`)), server: 'app' }];
  if (mode === 'control') finals.push({ ...(await probe(CONTROL_PORT, '/ctl/ok.svg', `${token}-final`)), server: 'control' });
  for (const f of finals) runner.write(f);

  // Owned cleanup only: a group is signalled only if a positive observation
  // shows every live member is WebKit. Unrelated processes are never signalled.
  const ownedGroups = [];
  for (const [pgid, first] of owned) {
    if (pgid === cli.pid) { ownedGroups.push({ pgid, first, sharesCliGroup: true }); continue; } // drained with the CLI group
    const obs = observe();
    const members = obs.ok ? obs.procs.filter(p => p.pgid === pgid) : null;
    const allWebKit = !!members && members.length > 0 && members.every(p => isWebKit(p, webkitDir));
    if (allWebKit) { try { process.kill(-pgid, 'SIGKILL'); } catch { /* exited meanwhile */ } }
    ownedGroups.push({ pgid, first, live: members?.length ?? null, killed: allWebKit, refusedNonWebKit: !!members?.length && !allWebKit, censusUnavailable: !obs.ok });
  }
  const group = await drainGroupChecked(cli.pid, { graceMs: 30_000, killWaitMs: 10_000 });
  if (group.killed) runner.write({ ev: 'group.sigkill', lingeringBeforeKill: group.lingeringBeforeKill, remaining: group.remaining });
  for (const fd of [cliOut, cliErr]) fs.closeSync(fd);
  const serversExited = await stopServers();

  // Exit proof for owned groups and every new WebKit process: positive
  // observation only, bounded wait for natural exit, never a kill of unowned ones.
  let unresolved = null;
  for (const t = Date.now(); Date.now() - t < 15_000; await sleep(500)) {
    const obs = census('final');
    if (!obs) { unresolved = null; continue; }
    for (const g of ownedGroups) g.exited = !obs.procs.some(p => p.pgid === g.pgid);
    unresolved = obs.procs.filter(p => isWebKit(p, webkitDir) && !owned.has(p.pgid)).map(projectProc);
    if (ownedGroups.every(g => g.exited) && !unresolved.length) break;
  }
  for (const g of ownedGroups) if (unresolved === null) { g.exited = false; g.unknown = true; }
  const unresolvedWebKit = unresolved ?? [{ unknown: 'final census unavailable' }];

  const post = fingerprint();
  const postFingerprint = { actual: post.sha256, match: post.sha256 === expected };
  const decision = finalDecision({ cliGroup: group, serversExited, ownedGroups, unresolvedWebKit, censusErrors, runnerDrained: drained, postFingerprintMatch: postFingerprint.match });
  const outcome = aborting ?? (cliExit.errorCode ? 'HARNESS-ERROR' : cliExit.code === 0 ? 'COMPLETED-ALL-PASSED' : cliExit.code === 1 ? 'COMPLETED-WITH-FAILURES' : `HARNESS-ERROR-cli-${cliExit.code ?? cliExit.signal}`);
  const status = !postFingerprint.match ? 'STOPPED-fingerprint-drift'
    : !decision.writersExited ? 'INCOMPLETE-unsealed-writers'
      : !decision.complete && outcome.startsWith('COMPLETED') ? 'INCOMPLETE-collection' : outcome;
  runner.write({ ev: 'finalize', status, outcome });
  runner.close();
  writeJson(path.join(dir, 'status.json'), {
    runId, mode, status, outcomeBeforeSealCheck: outcome, cliStarted: true, cli: cliExit, servers: servers.map(s => ({ name: s.name, exit: s.exit })), abort: aborting,
    finished: iso(), elapsedMs: Date.now() - t0, fingerprint: fpStatus, postFingerprint, probes: { periodic: probeN, finals: finals.map(f => [f.server, f.status]) },
    ownedGroups, unresolvedWebKit, seenWebKit: [...seenWebKit.values()], writersExited: decision.writersExited,
    collection: { complete: decision.complete, writerReasons: decision.writerReasons, gaps: decision.collectionGaps, runnerObserversDrained: drained, censusErrors, cliGroup: group, serversExited },
    bytes: dirBytes(dir),
  });
  const fin = finalizeEvidence(dir, decision.writersExited, `writers not proven exited: ${decision.writerReasons.join('; ')}`);
  log(`${status}${fin.sealed ? '' : ' (UNSEALED-INCOMPLETE)'}\n[loadwait ${mode}] run dir: ${rel(dir)}`);
  return { code: status.startsWith('COMPLETED') ? 0 : status.startsWith('INCOMPLETE') ? 3 : 2, dir, status };
}

// ---------------------------------------------------------------- server fault
// Bounded sensitivity for the server observer (R1): the same requests against
// the observed serve-root on 8095 without and with an injected log-write
// failure. Stock responses must be identical and correct, the server must keep
// serving, the clean log must be complete and the faulted log must not be.
async function runServerFault() {
  const dir = newRunDir('server-fault');
  const runner = jsonl(path.join(dir, 'runner.jsonl'));
  const fp = fingerprint();
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !STRIP.includes(k) && !REFUSE.includes(k)));
  const versionSha = sha256File(path.join(REPO, 'version.json'));
  const notFoundSha = crypto.createHash('sha256').update('Not found').digest('hex');
  const variants = [];
  let exitedAll = true;
  for (const [name, extraEnv] of [['nofault', {}], ['fault', { LOADWAIT_SERVER_FAULT: 'write-fail-after:3' }]]) {
    if (await portBusy(FAULT_PORT)) { variants.push({ name, refused: `port ${FAULT_PORT} in use` }); continue; }
    const s = startServer(dir, name, FAULT_PORT, runner, env, { kind: 'app', extraEnv });
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && !s.exit && !fs.readFileSync(path.join(dir, `server-${name}-stdout.log`), 'utf8').includes(`(root=${REPO})`)) await sleep(100);
    const token = crypto.randomBytes(4).toString('hex');
    const ready = await probe(FAULT_PORT, '/version.json', `${token}-ready`);
    const ok = await get(FAULT_PORT, '/version.json');
    const missing = await get(FAULT_PORT, '/loadwait-no-such-file');
    const final = await probe(FAULT_PORT, '/version.json', `${token}-final`);
    await sleep(200);
    const aliveBeforeStop = !s.exit;
    exitedAll = (await s.stop()) && exitedAll;
    const log = path.join(dir, `server-${name}.jsonl`);
    const recs = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l, i) => { try { return JSON.parse(l); } catch { return { ev: '#unparsed', line: i + 1 }; } }) : [];
    variants.push({ name, responses: { ready: ready.status, version: [ok.status, ok.bodySha256 === versionSha], missing: [missing.status, missing.bodySha256 === notFoundSha], final: final.status }, aliveBeforeStop, completeness: serverCompleteness(recs.map(r => (r.ev === 'observer.ready' ? { ...r, faultInjected: null } : r))), faultInjectedRecorded: recs[0]?.faultInjected ?? null });
  }
  const [a, b] = variants;
  const same = a?.responses && b?.responses && JSON.stringify(a.responses) === JSON.stringify(b.responses);
  const correct = v => v?.responses && v.responses.ready === 200 && v.responses.version[0] === 200 && v.responses.version[1] && v.responses.missing[0] === 404 && v.responses.missing[1] && v.responses.final === 200;
  const verdict = same && correct(a) && correct(b) && a.aliveBeforeStop && b.aliveBeforeStop && a.completeness.ok && !b.completeness.ok ? 'PASS' : 'FAIL';
  runner.close();
  const post = fingerprint();
  writeJson(path.join(dir, 'results.json'), { mode: 'server-fault', verdict, fingerprint: fp.sha256, postFingerprint: post.sha256, variants, note: 'the faulted log is graded as server observation only (its injected-fault marker is masked so the seq/probe checks alone must detect the loss)' });
  writeJson(path.join(dir, 'status.json'), { mode: 'server-fault', status: verdict, writersExited: exitedAll, finished: iso() });
  finalizeEvidence(dir, exitedAll, 'server exit not observed before sealing');
  console.log(`[loadwait server-fault] verdict ${verdict}\n[loadwait server-fault] run dir: ${rel(dir)}`);
  return { code: verdict === 'PASS' && exitedAll ? 0 : 1, dir, status: verdict, fingerprint: fp.sha256 };
}

// ---------------------------------------------------------------- pure / check
async function runPure() {
  const dir = newRunDir('pure');
  const fp = fingerprint();
  const result = await runPureControls(path.join(dir, 'synthetic'));
  const post = fingerprint();
  writeJson(path.join(dir, 'results.json'), { mode: 'pure', fingerprint: fp.sha256, postFingerprint: post.sha256, ...result });
  writeJson(path.join(dir, 'status.json'), { mode: 'pure', status: result.verdict, writersExited: true, finished: iso(), fingerprint: fp.sha256 });
  finalizeEvidence(dir, true);
  for (const r of result.results) console.log(`[loadwait pure] ${r.ok ? 'ok  ' : 'FAIL'} ${r.id} ${r.what}`);
  console.log(`[loadwait pure] verdict ${result.verdict}\n[loadwait pure] run dir: ${rel(dir)}`);
  return { code: result.verdict === 'PASS' && fp.sha256 === post.sha256 ? 0 : 1, dir, status: result.verdict, fingerprint: fp.sha256 };
}

function runCheck(runDir) {
  const run = loadRun(runDir);
  const manifest = run.sealed ? verifyManifest(runDir) : { ok: false, error: 'not sealed' };
  const mode = run.meta?.mode;
  const analysis = mode === 'control' ? analyzeControl(run) : mode === 'faithful' ? analyzeFaithful(run) : { kind: 'unknown', verdict: 'FAIL' };
  const verdict = !manifest.ok ? (run.unsealedMarker ? 'INCOMPLETE' : 'FAIL') : mode === 'faithful' ? analysis.evidence : analysis.verdict;
  const dir = newRunDir(`check-${mode ?? 'unknown'}`);
  writeJson(path.join(dir, 'analysis.json'), { checked: rel(runDir), runFingerprint: run.meta?.fingerprint?.sha256 ?? null, runPostFingerprint: run.status?.postFingerprint?.actual ?? null, manifest, verdict, analysis });
  writeJson(path.join(dir, 'status.json'), { mode: 'check', status: verdict, writersExited: true, finished: iso() });
  finalizeEvidence(dir, true);
  console.log(`[loadwait check] ${mode}: ${verdict}\n[loadwait check] check dir: ${rel(dir)}`);
  const code = ['PASS', 'VALID'].includes(verdict) ? 0 : verdict === 'INCOMPLETE' ? 4 : 1;
  return { code, dir, status: verdict };
}

// Gates fail closed on a sealed, verifying prerequisite of the right kind whose
// result is PASS with pre- and post-run fingerprints equal to the expected one.
function gate(dirArg, kind, expected) {
  let dir;
  try { dir = evidenceDir(dirArg); } catch (e) { return `gate: ${e.message}`; }
  const file = path.join(dir, kind === 'control' ? 'analysis.json' : 'results.json');
  const payload = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  if (payload && kind !== 'control' && payload.mode !== kind) return `gate: ${rel(dir)} is not a ${kind} run`;
  return gateDecision(kind, { manifestOk: verifyManifest(dir).ok, payload, expected });
}

// ---------------------------------------------------------------- batch
// Exit 0 only when the single faithful check is VALID; otherwise the first
// failing step's code (never 0).
async function runBatch(expected) {
  const t0 = Date.now();
  const { budgetMs, bytesCap } = CEILINGS.batch;
  const steps = [];
  const remaining = () => ({ budgetMs: budgetMs - (Date.now() - t0), bytesCap: bytesCap - steps.reduce((n, s) => n + (s.dir ? dirBytes(s.dir) : 0), 0) });
  const done = (why, code) => { console.log(`[loadwait batch] ${why}; steps: ${steps.map(s => `${s.step}=${s.status}`).join(', ')}`); return code; };
  const pureR = await runPure(); steps.push({ step: 'pure', ...pureR });
  if (pureR.code !== 0 || pureR.fingerprint !== expected) return done('stop: pure not PASS for this fingerprint', pureR.code || 2);
  const sf = await runServerFault(); steps.push({ step: 'server-fault', ...sf });
  if (sf.code !== 0 || sf.fingerprint !== expected) return done('stop: server-fault not PASS for this fingerprint', sf.code || 2);
  if (remaining().budgetMs < CEILINGS.control.budgetMs) return done('stop: batch budget', 3);
  const ctl = await runLive('control', expected, remaining()); steps.push({ step: 'control', ...ctl });
  if (ctl.code !== 0) return done('stop: control run not complete', ctl.code);
  const ctlCheck = runCheck(ctl.dir); steps.push({ step: 'control-check', ...ctlCheck });
  if (ctlCheck.code !== 0) return done('stop: control check not PASS; no faithful arm', ctlCheck.code);
  const g = gate(path.relative(REPO, ctlCheck.dir), 'control', expected);
  if (g) return done(`stop: ${g}`, 2);
  const r = remaining();
  if (r.budgetMs < CEILINGS.faithful.budgetMs || r.bytesCap < CEILINGS.faithful.bytesCap) return done('stop: batch budget/bytes insufficient for the faithful arm', 3);
  const fa = await runLive('faithful', expected, r); steps.push({ step: 'faithful', ...fa });
  if (!fa.dir || !fs.existsSync(path.join(fa.dir, 'status.json')) || JSON.parse(fs.readFileSync(path.join(fa.dir, 'status.json'), 'utf8')).cliStarted !== true) return done('stop: faithful did not start', fa.code || 2);
  const faCheck = runCheck(fa.dir); steps.push({ step: 'faithful-check', ...faCheck });
  return done(`one faithful attempt made; no further arms; faithful evidence ${faCheck.status}`, faCheck.code !== 0 ? faCheck.code : fa.code);
}

async function main(argv) {
  const opt = args(argv, { mode: 'value', 'expect-fingerprint': 'value', run: 'value', pure: 'value', 'server-fault': 'value', 'control-check': 'value' });
  const expected = opt['expect-fingerprint'];
  const fpOk = /^[0-9a-f]{64}$/.test(expected ?? '');
  switch (opt.mode) {
    case 'fingerprint': { const fp = fingerprint(); console.log(JSON.stringify({ sha256: fp.sha256, baseSha256: fp.baseSha256, head: fp.head, extra: fp.extra }, null, 2)); return 0; }
    case 'pure': return (await runPure()).code;
    case 'server-fault': return (await runServerFault()).code;
    case 'check': { let dir; try { dir = evidenceDir(opt.run); } catch (e) { console.error(e.message); return 2; } return runCheck(dir).code; }
    case 'control': {
      if (!fpOk) break;
      const g = gate(opt.pure, 'pure', expected) ?? gate(opt['server-fault'], 'server-fault', expected);
      if (g) { console.error(`[loadwait control] REFUSED ${g}`); return 2; }
      return (await runLive('control', expected, {})).code;
    }
    case 'faithful': {
      if (!fpOk) break;
      const g = gate(opt['control-check'], 'control', expected);
      if (g) { console.error(`[loadwait faithful] REFUSED ${g}`); return 2; }
      return (await runLive('faithful', expected, {})).code;
    }
    case 'batch': if (fpOk) return runBatch(expected); break;
    default:
  }
  console.error('Usage: see the header of scripts/diag-161/loadwait/run.mjs');
  return 2;
}

process.exitCode = await main(process.argv.slice(2)).catch(error => { console.error(error); return 2; });
