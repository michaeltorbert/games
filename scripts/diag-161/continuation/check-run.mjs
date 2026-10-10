// Issue #161 continuation checker. Read-only on the run directory; writes its
// own new sealed check directory.
//   node scripts/diag-161/continuation/check-run.mjs <runDir> [--historical-meta <meta.json>]
// Exit 0 = evidence PASS, 1 = FAIL (broken observation/ownership/binding),
// 4 = INCONCLUSIVE. Evidence PASS says the collection is valid; it says
// nothing about whether the arm's lanes completed or failed.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { args, newRunDir, seal, verifyManifest, versions, writeJson } from './lib.mjs';
import { STDERR_LAUNCH, STDERR_PROTOCOL, createSinkAnalyzer, failureBoundary, grade, intervalsOverlapMs, laneOutcomes, probeCoverage, resolveStockLane, rttProfile } from './analyze.mjs';

async function streamLines(file, onLine) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const l of rl) onLine(l);
}

function endsWithNewline(file) {
  const { size } = fs.statSync(file);
  if (!size) return true;
  const fd = fs.openSync(file, 'r');
  const b = Buffer.alloc(1);
  fs.readSync(fd, b, 0, 1, size - 1);
  fs.closeSync(fd);
  return b[0] === 0x0a;
}

const readJsonl = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
const stats = xs => {
  const v = xs.filter(x => x !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = p => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { n: v.length, median: q(0.5), p95: q(0.95), max: v[v.length - 1] };
};

function reportTests(report) {
  const out = [];
  const visit = s => {
    for (const spec of s.specs ?? []) for (const t of spec.tests ?? []) out.push({ title: spec.title, status: t.status, results: (t.results ?? []).map(r => r.status), error: String((t.results ?? []).at(-1)?.error?.message ?? '').slice(0, 300) || null });
    for (const c of s.suites ?? []) visit(c);
  };
  for (const s of report?.suites ?? []) visit(s);
  return out;
}

export async function checkRun(runDir, opts = {}) {
  const checks = [];
  const add = (name, result, detail) => checks.push({ name, result, detail });
  const meta = JSON.parse(fs.readFileSync(path.join(runDir, 'meta.json'), 'utf8'));
  const status = JSON.parse(fs.readFileSync(path.join(runDir, 'status.json'), 'utf8'));
  const arm = meta.arm;

  const manifest = verifyManifest(runDir);
  add('manifest', manifest.ok ? 'PASS' : 'FAIL', manifest);
  add('fingerprint-match', status.fingerprint?.match ? 'PASS' : 'FAIL', status.fingerprint);
  add('collection-complete', status.collection?.complete ? 'PASS' : 'INCONCLUSIVE', status.collection);
  if (!status.cliStarted) {
    add('cli-started', 'INCONCLUSIVE', { status: status.status, reason: status.reason ?? null });
    return { arm, status: status.status, checks, lanes: [], notes: {} };
  }

  // Server observer: positive liveness and crash monitor.
  const runner = readJsonl(path.join(runDir, 'runner.jsonl'));
  const server = readJsonl(path.join(runDir, 'server.jsonl'));
  const probes = probeCoverage(runner, server);
  add('server-observer-live', probes.ready && probes.final && probes.missing.length === 0 ? 'PASS' : 'FAIL', probes);
  const crashes = server.filter(r => r.ev === 'uncaught');
  add('server-no-crash', crashes.length ? 'FAIL' : 'PASS', { crashes });

  // Protocol ownership: nothing on the shared stderr; one closed sink per worker.
  let leaked = 0, leakedLaunch = 0;
  await streamLines(path.join(runDir, 'cli-stderr.log'), l => {
    if (STDERR_PROTOCOL.test(l)) leaked++;
    if (STDERR_LAUNCH.test(l)) leakedLaunch++;
  });
  const sinkDir = path.join(runDir, 'sinks');
  const sinkFiles = fs.existsSync(sinkDir) ? fs.readdirSync(sinkDir).filter(f => /^sink-\d+\.log$/.test(f)).sort() : [];
  const sinks = [];
  for (const f of sinkFiles) {
    const a = createSinkAnalyzer(f);
    const file = path.join(sinkDir, f);
    await streamLines(file, l => a.line(l));
    const { closed } = a.end({ tailTruncated: !endsWithNewline(file) });
    sinks.push(a.result(closed));
  }
  // Stage accounting and lane outcomes. Stock lanes whose stage end was not observed
  // in-test are resolved from the report (resolveStockLane) before any boundary.
  let report = null;
  try { report = JSON.parse(fs.readFileSync(path.join(runDir, 'report.json'), 'utf8')); } catch { /* recorded below */ }
  const tests = reportTests(report);
  const lanes = [];
  const laneIssues = [];
  for (const s of sinks) {
    const r = laneOutcomes(s);
    laneIssues.push(...r.issues);
    for (const L0 of r.lanes) {
      const L = resolveStockLane(L0, tests);
      lanes.push({ ...L, sink: s.sink, boundary: failureBoundary(s, L) });
    }
  }

  // A sink whose only lanes were CENSORED (stopped by --max-failures after the
  // other lane failed) may lack its exit mark; that limits only its own
  // exposure, so its INCONCLUSIVE issues are reported as notes. FAIL issues
  // (leaks, overlaps, collisions, orphans) always grade.
  const censoredOnly = s => { const own = lanes.filter(L => L.sink === s.sink); return own.length > 0 && own.every(L => L.outcome === 'CENSORED'); };
  const sinkIssues = sinks.flatMap(s => s.issues.filter(i => i.severity === 'FAIL' || !censoredOnly(s)));
  const censoredSinkNotes = sinks.filter(censoredOnly).flatMap(s => s.issues.filter(i => i.severity !== 'FAIL'));
  const ownership = sinkIssues.some(i => i.severity === 'FAIL') || leaked || leakedLaunch ? 'FAIL'
    : sinkIssues.length || sinks.length === 0 ? 'INCONCLUSIVE' : 'PASS';
  add('protocol-ownership', ownership, {
    sharedStderrProtocolLines: leaked, sharedStderrLaunchLines: leakedLaunch, sinks: sinks.length, expectedSinks: arm.lanes, issues: sinkIssues, censoredSinkNotes,
    perSink: sinks.map(s => ({ sink: s.sink, lines: s.lines, protocolLines: s.protocolLines, unparsed: s.unparsed, closed: s.closed, segments: s.segments.map(g => ({ pid: g.pid, lane: g.lane, contexts: g.contexts, idSequential: g.idSequential, exit: g.exit, closeControlReplies: g.controlReplies.length, unparsedProtocolLines: g.unparsedProtocolLines })) })),
  });
  // Batch-1 lanes are named a/b; the stock arm names lanes by worker parallelIndex (p0/p1).
  const stock = arm.workload === 'stock-skip';
  const expectedLanes = stock ? [] : ['a', 'b'].slice(0, arm.lanes);
  const missingLanes = stock
    ? (new Set(lanes.map(l => l.lane)).size < arm.lanes ? [`${arm.lanes - new Set(lanes.map(l => l.lane)).size} lane(s) not observed`] : [])
    : expectedLanes.filter(l => !lanes.some(x => x.lane === l));
  // Stock arm: each test creates exactly one context in its worker's browser, so cycle == context ordinal.
  if (stock) {
    for (const s of sinks) for (const g of s.segments) {
      const L = lanes.find(x => x.lane === g.lane);
      if (L && (g.contexts < L.completed || g.contexts > L.cyclesStarted)) laneIssues.push({ severity: 'INCONCLUSIVE', code: 'stock-context-count-outside-cycles', detail: { lane: g.lane, contexts: g.contexts, completed: L.completed, cyclesStarted: L.cyclesStarted } });
    }
  }
  add('stage-accounting', laneIssues.some(i => i.severity === 'FAIL') ? 'FAIL' : missingLanes.length || laneIssues.length ? 'INCONCLUSIVE' : 'PASS', { issues: laneIssues, missingLanes });

  // Topology actually observed (never assumed).
  const segs = sinks.flatMap(s => s.segments.map(g => ({ ...g, sink: s.sink, workerIndex: s.firstMark?.workerIndex, sinkPid: s.firstMark?.pid })));
  // Two-worker arms need two browsers in two distinct worker processes whose
  // lifetimes overlap; anything else is recorded as not obtained (INCONCLUSIVE).
  const workers = segs.map(g => ({ workerIndex: g.workerIndex, workerPid: g.sinkPid, browserPid: g.pid, lane: g.lane }));
  let topology;
  if (arm.lanes === 1) {
    topology = { result: segs.length === 1 && sinks.length === 1 ? 'PASS' : 'INCONCLUSIVE', browsers: segs.length, workers };
  } else {
    const [x, y] = segs;
    const distinct = segs.length === 2 && x.sinkPid !== y.sinkPid && x.pid !== y.pid && x.workerIndex !== y.workerIndex;
    const overlap = distinct ? intervalsOverlapMs(x, y) : null;
    topology = { result: distinct && overlap > 0 ? 'PASS' : 'INCONCLUSIVE', browsers: segs.length, overlapMs: overlap, workers };
  }
  add('topology', topology.result, topology);

  // Report consistency.
  const mismatches = [];
  if (stock) {
    // Stock tests are 'skipped' when their stock teardown completed; a failed lane needs an 'unexpected' test.
    const skipped = tests.filter(t => t.status === 'skipped').length;
    const unexpected = tests.filter(t => t.status === 'unexpected').length;
    const done = lanes.reduce((n, L) => n + L.completed, 0);
    if (skipped < done) mismatches.push({ reason: 'fewer skipped tests than completed cycles', skipped, done });
    if (lanes.some(L => L.outcome === 'FAILED') !== unexpected > 0) mismatches.push({ reason: 'failed lane and unexpected tests disagree', unexpected, lanes: lanes.map(L => [L.lane, L.outcome]) });
  }
  for (const L of stock ? [] : lanes) {
    const t = tests.find(x => x.title.endsWith(`lane ${L.lane}`));
    const want = { COMPLETED: ['expected'], FAILED: ['unexpected'], CENSORED: ['unexpected', 'skipped'] }[L.outcome] ?? [];
    if (!t || !want.includes(t.status)) mismatches.push({ lane: L.lane, outcome: L.outcome, report: t ?? null });
  }
  add('report-consistency', report === null ? 'INCONCLUSIVE' : mismatches.length ? 'FAIL' : 'PASS', { tests, mismatches });

  // Workload conformance: the synthetic lanes request only what they declare.
  const nonProbe = server.filter(r => r.ev === 'request.start' && !String(r.ua ?? '').startsWith('diag161c-probe/'));
  const bad = arm.workload === 'blank' || stock ? nonProbe : nonProbe.filter(r => r.method !== 'GET' || r.url !== '/version.json');
  add('workload-conformance', bad.length ? 'FAIL' : 'PASS', { nonProbeRequests: nonProbe.length, unexpected: bad.slice(0, 20) });

  // Run status agrees with lanes.
  const st = status.status;
  const consistent = st === 'COMPLETED-PASS' ? lanes.length === arm.lanes && lanes.every(L => L.outcome === 'COMPLETED')
    : st === 'FAILED' ? lanes.some(L => L.outcome === 'FAILED') : true;
  add('status-consistency', consistent ? 'PASS' : 'FAIL', { status: st, lanes: lanes.map(L => [L.lane, L.outcome]) });

  const leftovers = status.leftovers ?? [];
  add('owned-cleanup', leftovers.some(l => l.aliveAfter) ? 'FAIL' : 'PASS', { leftovers });

  // Notes (never graded): failure boundaries, time-joined server activity, RTT profile, runtime comparison.
  const notes = {};
  for (const L of lanes.filter(l => l.failedStageWindow)) {
    const [b, e] = [BigInt(L.failedStageWindow.beginMono), BigInt(L.failedStageWindow.endMono)];
    const within = server.filter(r => BigInt(r.mono) >= b && BigInt(r.mono) <= e + 1000000000n && !String(r.ua ?? '').startsWith('diag161c-probe/'));
    notes[`lane-${L.lane}-server-during-failed-stage`] = {
      join: arm.lanes === 1 ? 'time-joined; only one browser was live' : 'time-joined; two browsers live, not attributable',
      events: within.slice(0, 50),
    };
  }
  const rtt = sinks.flatMap(rttProfile);
  notes.rttSummary = rtt.map(r => ({ pid: r.pid, lane: r.lane, deleteContextMs: stats(r.deleteContextMs.map(x => x[1])), navigateReplyMs: stats(r.navigateReplyMs.map(x => x[1])) }));
  notes.pendingAtEnd = sinks.flatMap(s => s.segments.map(g => ({ sink: s.sink, pid: g.pid, pending: g.pendingAtEnd.filter(p => /^Playwright\./.test(p.method)) })));
  if (opts.historicalMeta) {
    const hist = JSON.parse(fs.readFileSync(opts.historicalMeta, 'utf8'));
    const now = meta.versions ?? versions();
    const keys = ['node', 'playwrightTest', 'playwright', 'playwrightCore', 'webkitRevision'];
    notes.runtimeVsHistorical = {
      historical: path.basename(path.dirname(opts.historicalMeta)),
      differences: keys.filter(k => String(hist.versions?.[k]) !== String(now[k])).map(k => ({ key: k, historical: hist.versions?.[k], current: now[k] })),
      hostHistorical: { release: hist.host?.release, swVers: hist.host?.swVers, cpuModel: hist.host?.cpuModel },
      hostCurrent: { release: meta.host?.release, swVers: meta.host?.swVers, cpuModel: meta.host?.cpuModel },
    };
  }
  return { arm, status: st, checks, lanes, notes, rtt };
}

async function main([target, ...rest]) {
  const opt = args(rest, { 'historical-meta': 'value' });
  const runDir = path.resolve(target ?? '');
  if (!target || !fs.existsSync(path.join(runDir, 'meta.json'))) {
    console.error('Usage: node check-run.mjs <runDir> [--historical-meta <meta.json>]');
    process.exit(2);
  }
  const out = newRunDir('check');
  fs.writeFileSync(path.join(out, 'target.txt'), runDir + '\n', { flag: 'wx' });
  let result;
  try {
    result = await checkRun(runDir, { historicalMeta: opt['historical-meta'] && path.resolve(opt['historical-meta']) });
  } catch (error) {
    result = { checks: [{ name: 'checker', result: 'FAIL', detail: String(error?.stack ?? error) }] };
  }
  const verdict = grade(result.checks);
  const { rtt, ...publicResult } = result;
  writeJson(path.join(out, 'check.json'), { checkId: path.basename(out), target: runDir, verdict, ...publicResult });
  if (rtt) writeJson(path.join(out, 'rtt.json'), rtt);
  seal(out);
  for (const c of result.checks) console.log(`[check] ${c.result.padEnd(12)} ${c.name}`);
  for (const L of result.lanes ?? []) console.log(`[check] lane ${L.lane}: ${L.outcome} completed=${L.completed}${L.firstFailure ? ` first=${L.firstFailure.stage}@${L.firstFailure.cycle ?? '-'}` : ''}${L.boundary ? ` boundary=${L.boundary.label}` : ''}`);
  console.log(`[check] verdict ${verdict} ${path.relative(process.cwd(), out)}`);
  process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 4);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) await main(process.argv.slice(2));
