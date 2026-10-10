// Issue #161 continuation: the predeclared first batch, strictly serial.
//   node scripts/diag-161/continuation/run-batch.mjs --expect-fingerprint <sha256>
// selfcheck -> for each arm in arms.json order: run-arm, then check-run.
// One child at a time; nothing runs concurrently. Stops on the conditions in
// arms.json execution.stopBatchOn. An arm starts only if a full per-arm
// ceiling (15 min / 2 GiB) still fits inside the batch ceiling (90 min / 12 GiB).
// Writes its own sealed batch directory with an ordered ledger.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ARM_BUDGET_MS, ARM_BYTES_CAP, BATCH_BUDGET_MS, BATCH_BYTES_CAP, EVIDENCE_ROOT, HERE, REPO, args, jsonl, loadArms, newRunDir, seal, writeJson } from './lib.mjs';

function child(script, argv, logFile) {
  return new Promise(resolve => {
    const fd = fs.openSync(logFile, 'wx');
    const c = spawn(process.execPath, [path.join(HERE, script), ...argv], { cwd: REPO, stdio: ['ignore', fd, fd] });
    c.once('exit', (code, signal) => { fs.closeSync(fd); resolve({ code, signal }); });
    c.once('error', e => { fs.closeSync(fd); resolve({ code: null, error: String(e.message) }); });
  });
}
const lastDir = (logFile, re) => fs.readFileSync(logFile, 'utf8').match(re)?.[1] ?? null;

async function main(argv) {
  const opt = args(argv, { 'expect-fingerprint': 'value' });
  if (!/^[0-9a-f]{64}$/.test(opt['expect-fingerprint'] ?? '')) {
    console.error('Usage: node run-batch.mjs --expect-fingerprint <sha256>');
    return 2;
  }
  const manifest = loadArms();
  const t0 = Date.now();
  const dir = newRunDir('batch');
  const ledger = jsonl(path.join(dir, 'ledger.jsonl'));
  const say = m => console.log(`[run-batch] ${m}`);
  const bytesOf = p => { let n = 0; const w = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, e.name); if (e.isDirectory()) w(q); else n += fs.lstatSync(q).size; } }; if (p && fs.existsSync(p)) w(p); return n; };
  let used = 0;
  const rows = [];
  let stopped = null;

  const sc = await child('selfcheck.mjs', [], path.join(dir, '00-selfcheck.log'));
  const scDir = lastDir(path.join(dir, '00-selfcheck.log'), /^\[selfcheck\] verdict \S+ (\S+)\s*$/m);
  ledger.write({ step: 'selfcheck', ...sc, dir: scDir });
  say(`selfcheck exit ${sc.code} ${scDir ?? ''}`);
  if (sc.code !== 0) stopped = 'selfcheck not PASS';

  for (const [i, id] of manifest.order.entries()) {
    if (stopped) break;
    const elapsed = Date.now() - t0;
    if (elapsed + ARM_BUDGET_MS > BATCH_BUDGET_MS || used + ARM_BYTES_CAP > BATCH_BYTES_CAP) { stopped = `batch ceiling: ${Math.round(elapsed / 60000)} min, ${used} bytes used before ${id}`; break; }
    const n = String(i + 1).padStart(2, '0');
    const armLog = path.join(dir, `${n}-${id}.run.log`);
    const r = await child('run-arm.mjs', ['--arm', id, '--expect-fingerprint', opt['expect-fingerprint']], armLog);
    const runDir = lastDir(armLog, /run dir: (\S+)\s*$/m);
    const absRun = runDir && path.join(REPO, runDir);
    used += bytesOf(absRun);
    let check = null, checkDir = null;
    if (absRun) {
      const checkLog = path.join(dir, `${n}-${id}.check.log`);
      const histMeta = path.join(path.dirname(EVIDENCE_ROOT), '20261009T072821Z-diff-single-631458', 'meta.json');
      check = await child('check-run.mjs', [absRun, ...(fs.existsSync(histMeta) ? ['--historical-meta', histMeta] : [])], checkLog);
      checkDir = lastDir(checkLog, /^\[check\] verdict \S+ (\S+)\s*$/m);
    }
    const row = { arm: id, runExit: r.code, runDir, checkExit: check?.code ?? null, checkDir };
    rows.push(row);
    ledger.write({ step: 'arm', ...row });
    say(`${id}: run exit ${r.code}, check exit ${check?.code ?? '-'} (${runDir ?? 'no run dir'})`);
    if (!absRun) stopped = `${id}: no run directory`;
    else if (![0, 1].includes(r.code)) stopped = `${id}: run-arm exit ${r.code}`;
    else if (check?.code !== 0) stopped = `${id}: check-run exit ${check?.code}`;
  }
  const notRun = manifest.order.filter(id => !rows.some(r => r.arm === id));
  const status = { batch: manifest.batch, status: stopped ? 'STOPPED' : 'COMPLETED', stopped, elapsedMs: Date.now() - t0, bytes: used, selfcheck: { exit: sc.code, dir: scDir }, arms: rows, notRun };
  ledger.write({ step: 'finalize', status: status.status });
  ledger.close();
  writeJson(path.join(dir, 'status.json'), status);
  seal(dir);
  say(`${status.status}${stopped ? `: ${stopped}` : ''}; not run: ${notRun.join(', ') || 'none'}\n[run-batch] batch dir: ${path.relative(REPO, dir)}`);
  return stopped ? 1 : 0;
}

process.exitCode = await main(process.argv.slice(2)).catch(e => { console.error(e); return 2; });
