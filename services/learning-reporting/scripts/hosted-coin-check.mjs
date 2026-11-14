#!/usr/bin/env node
// One narrowly reviewed production catalog trial; never a growth/retention qualifier.
// No owner API, cookies, retries, deletion, billing, plan or quota-reset operations.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CATALOG, validateEvent } from '../src/validator.js';
import { CODE, normalizeCode, TOKEN } from '../src/tokens.js';
import { isUuid } from '../src/http.js';

const SELF = fileURLToPath(import.meta.url), ROOT = resolve(dirname(SELF), '../../..');
const CONTRACT = resolve(ROOT, 'shared/learning-outbox.js');
export const LIMITS = Object.freeze({ unique: 84, stored: 82, transmissions: 104, batch: 20, requests: 10,
  plannedRequests: 7, ownerRequests: 20, responseBytes: 65536, bodyBytes: 65536, timeoutMs: 20000, paceMs: 3000 });
// Conservative incremental forecast, not a meter, hard D1 limit or shared-account headroom proof.
export const FORECAST = Object.freeze({ rowsWritten: 5000, rowsRead: 250000, cleanupRowsWritten: 2000, cleanupRowsRead: 100000 });
export const sha = value => createHash('sha256').update(value).digest('hex');
export class Stop extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new Stop(code); };
const exact = (o, keys) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).sort().join() === [...keys].sort().join();
const hash = s => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
const sleep = ms => new Promise(done => setTimeout(done, ms));
const origin = value => { try { const u = new URL(value); return u.protocol === 'https:' && u.origin === value && !u.username && !u.password; } catch { return false; } };

export function validateManifest(m, target, bindings, now = Date.now()) {
  if (!exact(m, ['schemaVersion','target','gameOrigin','profileId','createdAt','expiresAt','expected','exception','ownerOperations','forecast'])
    || m.schemaVersion !== 1 || !origin(m.target) || !origin(m.gameOrigin) || target !== m.target || !isUuid(m.profileId)) fail('MANIFEST');
  const start = Date.parse(m.createdAt), end = Date.parse(m.expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > now || now >= end || end - start > 3 * 3600000 || end <= start) fail('EXPIRED');
  const e = m.expected;
  if (!exact(e, ['sourceCommit','sourceSha256','toolSha256','contractSha256','bundleSha256','configSha256','workerVersion'])
    || !/^[0-9a-f]{40}$/.test(e.sourceCommit) || !isUuid(e.workerVersion)
    || !Object.entries(e).filter(([k]) => k.endsWith('Sha256')).every(([,v]) => hash(v))) fail('BINDING');
  for (const key of ['sourceCommit','sourceSha256','toolSha256','contractSha256','bundleSha256','configSha256']) if (e[key] !== bindings[key]) fail('DRIFT');
  if (!exact(m.exception, ['recordSha256','accepted','scope','currentPlan','currentUsage']) || !hash(m.exception.recordSha256)
    || m.exception.recordSha256 !== bindings.exceptionSha256 || m.exception.accepted !== true || m.exception.scope !== 'issue215-additive-catalog-only'
    || m.exception.currentPlan !== 'UNVERIFIED' || m.exception.currentUsage !== 'UNVERIFIED') fail('EXCEPTION');
  const o = m.ownerOperations;
  if (!exact(o, ['used','reserve','cap']) || o.cap !== 20 || !Number.isInteger(o.used) || o.used < 0 || !Number.isInteger(o.reserve)
    || o.reserve < 6 || o.used + o.reserve > o.cap) fail('OWNER_CAP');
  if (!exact(m.forecast, Object.keys(FORECAST)) || Object.keys(FORECAST).some(k => m.forecast[k] !== FORECAST[k])) fail('FORECAST');
  return m;
}

// Pure fixture construction when UUID/time providers are supplied. Each family has one
// coherent guided lifecycle: help -> first correct attempt -> supported resolution.
export function buildFixture(deviceId, profileId, { uuid = randomUUID, now = Date.now() } = {}) {
  if (!isUuid(deviceId) || !isUuid(profileId)) fail('IDENTITY');
  const families = Object.keys(CATALOG.football).filter(id => id.startsWith('coin-')).sort();
  if (families.length !== 26) fail('CATALOG');
  const epochId = uuid(), events = [];
  const make = (game, meta, kind, fields, question) => {
    const e = { schemaVersion: 1, eventId: uuid(), deviceId, epochId, seq: events.length + 1, profileId, game,
      gameVersion: game === 'football' ? '1.35.0' : '1.9.4', recordedAt: new Date(now).toISOString(), questionInstanceId: question, ...meta, kind, ...fields };
    if (!validateEvent(e)) fail('FIXTURE');
    events.push(e); return e;
  };
  for (const familyId of families) {
    const q = uuid(), meta = { familyId, ...CATALOG.football[familyId] };
    make('football', meta, 'help', { number: 1, support: 'guided' }, q);
    make('football', meta, 'attempt', { number: 1, correct: true, support: 'guided' }, q);
    make('football', meta, 'resolution', { resolution: 'firstTryCorrect' }, q);
  }
  let q = uuid(), meta = { familyId: 'score-total-ch8', ...CATALOG.football['score-total-ch8'] };
  make('football', meta, 'attempt', { number: 1, correct: true, support: 'initial' }, q);
  make('football', meta, 'resolution', { resolution: 'firstTryCorrect' }, q);
  q = uuid(); meta = { factId: 'add:7:6', family: CATALOG.facts['add:7:6'] };
  make('facts', meta, 'attempt', { number: 1, correct: true, helped: false }, q);
  make('facts', meta, 'resolution', { outcome: 'first-correct', eligibleCheck: true, timingMs: null, helped: false }, q);
  // Invalid records have a separate epoch; they do not inflate the valid device watermark.
  const negativeEpoch = uuid();
  const negative = { ...events[1], eventId: uuid(), epochId: negativeEpoch, seq: 1, questionInstanceId: uuid(), evidenceClass: events[1].evidenceClass === 'independent' ? 'literacy' : 'independent' };
  const privateFixture = { ...events[1], eventId: uuid(), epochId: negativeEpoch, seq: 2, questionInstanceId: uuid(), coinFixture: {} };
  if (validateEvent(negative) || validateEvent(privateFixture)) fail('NEGATIVE_FIXTURE');
  events.push(negative, privateFixture);
  if (new Set(events.map(e => e.eventId)).size !== 84) fail('IDENTITY');
  return { epochId, events, expected: events.map((_,i) => i < 82 ? 'accepted' : 'invalid') };
}

export async function runTrial({ manifest: m, request, readCode, note, now = Date.now, wait = sleep }) {
  let requests = 0, transmissions = 0, last = null, token = null;
  const call = async (path, body) => {
    if (Date.parse(m.expiresAt) <= now()) fail('EXPIRED');
    if (++requests > LIMITS.requests) fail('REQUEST_CAP');
    if (last !== null) await wait(Math.max(0, LIMITS.paceMs - (now() - last)));
    if (Date.parse(m.expiresAt) <= now()) fail('EXPIRED');
    const text = JSON.stringify(body);
    if (Buffer.byteLength(text) > LIMITS.bodyBytes) fail('BODY_CAP');
    last = now();
    // Durable ID-only intent precedes every request, including possible transport failure.
    await note({ kind: 'sent', request: requests, endpoint: path, eventIds: body.events?.map(e => e.eventId) ?? [] });
    let response;
    try { response = await request(`${m.target}${path}`, { method: 'POST', redirect: 'error', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Origin: m.gameOrigin, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: text,
      signal: AbortSignal.timeout(LIMITS.timeoutMs) }); } catch { fail('TRANSPORT'); }
    if (response.status !== 200 || !response.headers.get('content-type')?.startsWith('application/json')) fail('HTTP');
    let bytes = 0, chunks = [];
    try {
      for await (const chunk of response.body) { bytes += chunk.length; if (bytes > LIMITS.responseBytes) { await response.body.cancel?.().catch(() => {}); fail('RESPONSE_CAP'); } chunks.push(chunk); }
    } catch (error) { if (error instanceof Stop) throw error; fail('RESPONSE'); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('RESPONSE'); }
  };
  try {
    let code = normalizeCode(await readCode());
    if (!CODE.test(code)) fail('CODE_FORMAT');
    const enrollment = await call('/v1/enroll', { code }); code = null;
    if (!exact(enrollment, ['schemaVersion','token','deviceId','profileIds']) || enrollment.schemaVersion !== 1 || !TOKEN.test(enrollment.token)
      || !isUuid(enrollment.deviceId) || !Array.isArray(enrollment.profileIds) || enrollment.profileIds.length !== 1 || enrollment.profileIds[0] !== m.profileId) fail('ENROLLMENT');
    token = enrollment.token;
    await note({ kind: 'device', deviceId: enrollment.deviceId, profileId: m.profileId });
    const f = buildFixture(enrollment.deviceId, m.profileId, { now: now() });
    const batches = Array.from({ length: 5 }, (_,i) => ({ events: f.events.slice(i*20,i*20+20), expected: f.expected.slice(i*20,i*20+20) }));
    batches.push({ events: f.events.slice(0,20), expected: Array(20).fill('accepted') });
    for (const batch of batches) {
      transmissions += batch.events.length;
      if (batch.events.length > 20 || transmissions > 104) fail('EVENT_CAP');
      const status = { schemaVersion: 1, deviceId: enrollment.deviceId, epochId: f.epochId,
        highestSeq: transmissions > 84 ? 82 : Math.max(...batch.events.filter(e => e.epochId === f.epochId).map(e => e.seq)), droppedLocal: 0, writeFailures: 0 };
      const answer = await call('/v1/sync', { schemaVersion: 1, status, events: batch.events });
      if (!exact(answer, ['schemaVersion','results']) || answer.schemaVersion !== 1 || !Array.isArray(answer.results)
        || answer.results.length !== batch.events.length || answer.results.some((r,i) => !exact(r, ['eventId','outcome'])
          || r.eventId !== batch.events[i].eventId || r.outcome !== batch.expected[i])) fail('RECEIPT');
      await note({ kind: 'ack', results: answer.results });
    }
    await note({ kind: 'complete', requests, transmissions, uniqueEvents: 84, expectedStored: 82,
      limitations: ['synthetic-not-learner-or-device-proof','export-and-scoped-cleanup-pending','current-plan-and-usage-unverified','forecast-not-metered-cost'] });
    return { requests, transmissions, uniqueEvents: 84, expectedStored: 82 };
  } finally { token = null; }
}

// No typeahead/piped code is accepted before WAITING. A TTY disables echo only for this
// input; the code is never put into process arguments, environment, files or output.
export function stdinCode(input = process.stdin, output = process.stderr) {
  let pending = null, early = false, ended = false, buffer = '', timer;
  const finish = (error, value) => { clearTimeout(timer); if (input.isTTY) input.setRawMode(false); const p = pending; pending = null; buffer = ''; if (p) error ? p.reject(error) : p.resolve(value); };
  const data = chunk => {
    if (!pending) { early = true; return; }
    for (const [i,ch] of [...String(chunk)].entries()) {
      if (ch === '\x03') return finish(new Stop('INPUT'));
      if (ch === '\r' || ch === '\n') { if (String(chunk).slice(i+1).replace(/^\n/,'').length) early = true; return finish(early ? new Stop('INPUT') : null, buffer); }
      buffer = ch === '\x7f' || ch === '\b' ? buffer.slice(0,-1) : buffer + ch;
      if (buffer.length > 100) return finish(new Stop('INPUT'));
    }
  };
  input.setEncoding('utf8'); input.on('data', data);
  const end = () => { ended = true; finish(new Stop('INPUT')); }; input.on('end', end);
  return { async read() {
    await sleep(200);
    if (early || ended || pending) fail('INPUT');
    if (input.isTTY) input.setRawMode(true);
    return new Promise((resolveLine,reject) => { pending = { resolve: resolveLine,reject }; output.write('WAITING:code Enter the new single-profile synthetic device code.\n'); timer = setTimeout(() => finish(new Stop('INPUT')), 9*60000); });
  }, close() { finish(new Stop('INPUT')); input.off('data',data); input.off('end',end); input.pause(); } };
}

export async function localBindings(bundle, config, exceptionRecord) {
  const src = resolve(dirname(SELF), '../src');
  const names = (await readdir(src)).filter(n => n.endsWith('.js')).sort();
  const manifest = [];
  for (const n of names) manifest.push([n, sha(await readFile(resolve(src,n)))]);
  return { sourceCommit: execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(), sourceSha256: sha(JSON.stringify(manifest)),
    toolSha256: sha(await readFile(SELF)), contractSha256: sha(await readFile(CONTRACT)), bundleSha256: sha(await readFile(bundle)),
    configSha256: sha(await readFile(config)), exceptionSha256: sha(await readFile(exceptionRecord)) };
}

async function main(args) {
  let io, journal;
  try {
    const options = {};
    if (args.length !== 12) fail('USAGE');
    for (let i=0;i<args.length;i+=2) { if (!['--manifest','--target','--bundle','--config','--exception-record','--out'].includes(args[i]) || options[args[i]]) fail('USAGE'); options[args[i]] = args[i+1]; }
    if (Object.keys(options).length !== 6) fail('USAGE');
    const m = JSON.parse(await readFile(options['--manifest'],'utf8'));
    const bindings = await localBindings(options['--bundle'],options['--config'],options['--exception-record']);
    validateManifest(m,options['--target'],bindings);
    // New directory is a one-trial lock: never reuse an earlier evidence directory.
    await mkdir(options['--out'],{mode:0o700});
    journal = await open(resolve(options['--out'],'receipts.jsonl'),'wx',0o600);
    const note = async record => { await journal.write(`${JSON.stringify(record)}\n`); await journal.sync(); };
    await note({ kind:'binding', manifestSha256:sha(JSON.stringify(m)), targetSha256:sha(m.target), gameOriginSha256:sha(m.gameOrigin),
      expected:m.expected, exception:m.exception, ownerOperations:m.ownerOperations, forecast:FORECAST });
    io = stdinCode();
    try { await runTrial({manifest:m,request:fetch,readCode:()=>io.read(),note}); }
    catch (error) { await note({kind:'stopped',code:error instanceof Stop ? error.code : 'INTERNAL'}); throw error; }
    process.stdout.write('Catalog trial passed; synthetic export verification and scoped cleanup remain required.\n');
    return 0;
  } catch (error) { process.stderr.write(`Catalog trial stopped: ${error instanceof Stop ? error.code : 'INTERNAL'}. No automatic retry.\n`); return 1; }
  finally { io?.close(); await journal?.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === SELF) process.exitCode = await main(process.argv.slice(2));
