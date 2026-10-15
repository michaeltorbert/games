// Issue #161 load-wait: checked process observation (replaces, for this
// namespace only, the continuation groupMembers/drainGroup, which read an
// empty `ps` stdout as "no processes"). An observation is positive only when
// `ps` exited 0 with no error or signal and listed this process itself; any
// other result is UNAVAILABLE, which can never prove absence: preflight
// refuses, and exit proof stays unknown (the run stays unsealed).
// Every function takes an injectable `runPs` so pure controls can feed
// failures deterministically.
import { spawnSync } from 'node:child_process';

export const realPs = () => spawnSync('ps', ['-axo', 'pid=,ppid=,pgid=,rss=,command='], { encoding: 'utf8' });

export function parsePs(result, selfPid = process.pid) {
  if (!result || result.error || result.signal || result.status !== 0 || typeof result.stdout !== 'string' || !result.stdout.trim()) {
    return { ok: false, reason: result?.error ? 'spawn-error' : result?.signal ? 'signal' : result?.status !== 0 ? 'nonzero-status' : 'empty-output', procs: [] };
  }
  const procs = result.stdout.split('\n').map(l => l.trim().split(/\s+/)).filter(t => t.length >= 5 && /^\d+$/.test(t[0]))
    .map(t => ({ pid: Number(t[0]), ppid: Number(t[1]), pgid: Number(t[2]), rssKb: Number(t[3]), command: t.slice(4).join(' ') }));
  if (!procs.some(p => p.pid === selfPid)) return { ok: false, reason: 'self-not-listed', procs: [] };
  return { ok: true, procs };
}

export const observe = (runPs = realPs, selfPid = process.pid) => parsePs(runPs(), selfPid);

export const isWebKit = (p, webkitDir) => p.command.includes('ms-playwright/webkit') || p.command.includes(webkitDir);

// Preflight: refuse unless a positive observation shows no WebKit process.
export function preflightDecision(obs, webkitDir) {
  if (!obs.ok) return { ok: false, status: 'STOPPED-census-unavailable', why: `process census unavailable (${obs.reason}); absence cannot be proven` };
  const foreign = obs.procs.filter(p => isWebKit(p, webkitDir));
  if (foreign.length) return { ok: false, status: 'STOPPED-foreign-webkit', why: `${foreign.length} WebKit process(es) already running`, foreign };
  return { ok: true };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Bounded drain of one process group. `exited` is true only after a positive
// observation shows no live (non-zombie) member; an unavailable observation
// leaves `exited` false with `unknown` set. SIGKILL is sent only to this group.
export async function drainGroupChecked(pgid, { graceMs = 30_000, killWaitMs = 10_000, runPs = () => realPsWithStat(), selfPid = process.pid, kill = (p, s) => process.kill(p, s), pollMs = 250 } = {}) {
  const members = () => {
    const r = runPs();
    const o = parsePs(r, selfPid);
    if (!o.ok) return null;
    const stat = new Map((r.statLines ?? []).map(x => [x.pid, x.stat]));
    return o.procs.filter(p => p.pgid === pgid && stat.get(p.pid) !== 'Z').map(p => p.pid);
  };
  let m = members(), unavailable = m === null ? 1 : 0;
  for (const t = Date.now(); (m === null || m.length) && Date.now() - t < graceMs;) { await sleep(pollMs); m = members(); if (m === null) unavailable++; }
  const lingeringBeforeKill = m;
  let killed = false;
  if (m === null || m.length) {
    try { kill(-pgid, 'SIGKILL'); killed = true; } catch { /* group gone meanwhile */ }
    for (const t = Date.now(); (m === null || m.length) && Date.now() - t < killWaitMs;) { await sleep(Math.min(pollMs, 100)); m = members(); if (m === null) unavailable++; }
  }
  return { lingeringBeforeKill, killed, remaining: m, unavailableObservations: unavailable, unknown: m === null, exited: Array.isArray(m) && m.length === 0 };
}

// ps with stat, for zombie filtering in drains (zombies cannot write).
export const realPsWithStat = () => {
  const r = spawnSync('ps', ['-axo', 'pid=,ppid=,pgid=,rss=,stat=,command='], { encoding: 'utf8' });
  if (r.status !== 0 || typeof r.stdout !== 'string') return r;
  const statLines = [];
  const stdout = r.stdout.split('\n').map(l => {
    const t = l.trim().split(/\s+/);
    if (t.length < 6) return l;
    statLines.push({ pid: Number(t[0]), stat: t[4].startsWith('Z') ? 'Z' : t[4] });
    return [t[0], t[1], t[2], t[3], ...t.slice(5)].join(' ');
  }).join('\n');
  return { ...r, stdout, statLines };
};

// Final writer/ownership decision. Pure; every input is an observation result.
export function finalDecision({ cliGroup, serversExited, ownedGroups, unresolvedWebKit, censusErrors, runnerDrained, postFingerprintMatch }) {
  const reasons = [];
  if (!cliGroup?.exited) reasons.push(cliGroup?.unknown ? 'cli group exit unknown (census unavailable)' : 'cli group not observed exited');
  if (!serversExited) reasons.push('server exit not observed');
  for (const g of ownedGroups ?? []) if (!g.exited) reasons.push(`owned browser group ${g.pgid} ${g.unknown ? 'exit unknown' : 'still alive'}`);
  if (unresolvedWebKit?.length) reasons.push(`${unresolvedWebKit.length} new WebKit process(es) of unresolved ownership still present`);
  const writersExited = reasons.length === 0;
  const gaps = [];
  if (censusErrors) gaps.push(`${censusErrors} census observation(s) unavailable during the run`);
  if (!runnerDrained) gaps.push('runner observers (probes/abort) not drained');
  if (postFingerprintMatch === false) gaps.push('post-run fingerprint drifted from the expected candidate');
  if (postFingerprintMatch === null) gaps.push('post-run fingerprint not computed');
  return { writersExited, writerReasons: reasons, collectionGaps: gaps, complete: writersExited && gaps.length === 0 };
}
