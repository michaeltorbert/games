// Tool test for scripts/hosted-check.mjs. Its target, drift, budget, input and output
// guards, and its receipts against the actual Wrangler-built Worker in local workerd with
// a migrated local D1, served on a loopback port. Synthetic Access JWT and data only; the
// Worker's only permitted outbound request is the synthetic key set, and the tool's only
// peers are that loopback Worker and loopback stub servers. This verifies the tool, not
// hosted Cloudflare, Access, CPU, quotas, a household or a real game client. It uploads a
// few batches of the corpus, never the whole corpus, and repeats no growth experiment.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildCorpus, LIMITS, originKind, PROBES } from '../scripts/hosted-check.mjs';
import { validateEvent } from '../src/validator.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const repo = resolve(root, '../..');
// Same isolated-runtime pattern as dashboard-startup.test.mjs. No production config changes.
const require = createRequire(resolve(process.env.LR_RUNTIME_ROOT || root, 'package.json'));
const { Miniflare, Response: MFResponse, convertV4MiniflareOptions } = require('miniflare');
const bundlePath = resolve(process.env.LR_DASHBOARD_BUNDLE || resolve(root, 'dist/worker.js'));
const SCRIPT = resolve(root, 'scripts/hosted-check.mjs');
const HOST = 'https://reports.synthetic.test';
const TEAM = 'https://hosted-check-fixture.cloudflareaccess.com';
const AUD = 'c'.repeat(64);
// Sent as the device Origin header only; nothing listens there.
const GAME = 'http://127.0.0.1:9';
const LABELS = { A: 'Synthetic Hot', B: 'Synthetic Cold', P: 'Synthetic Pine', Q: 'Synthetic Quail' };
const PAYLOAD_MARKERS = ['add:7:6', 'sub:13:6', 'score-total-ch8', 'family:', 'questionInstanceId', 'Synthetic'];

const hash = data => createHash('sha256').update(data).digest('hex');
const b64 = data => Buffer.from(data).toString('base64url');
const key = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await webcrypto.subtle.exportKey('jwk', key.publicKey), kid: 'fixture', alg: 'RS256' };
const now = Math.floor(Date.now() / 1000);
const signing = `${b64(JSON.stringify({ alg: 'RS256', kid: 'fixture' }))}.${b64(JSON.stringify({ iss: TEAM, aud: [AUD], sub: 'synthetic-owner', iat: now - 5, exp: now + 3600 }))}`;
const jwt = `${signing}.${b64(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, Buffer.from(signing)))}`;
const toolSha = hash(await readFile(SCRIPT));
const contractSha = hash(await readFile(resolve(repo, 'shared/learning-outbox.js')));

let mf, db, base, work, session;
const outbound = [];
const parse = text => { try { return JSON.parse(text); } catch (error) { return text; } };
async function admin(path, body) {
  const headers = { 'Cf-Access-Jwt-Assertion': jwt };
  if (body !== undefined) Object.assign(headers, { 'Content-Type': 'application/json', Origin: HOST, 'Sec-Fetch-Site': 'same-origin', 'X-CSRF-Token': session.csrf });
  const response = await mf.dispatchFetch(`${HOST}${path}`, body === undefined ? { headers } : { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, data: parse(await response.text()) };
}
const rows = async (sql, ...params) => (await db.prepare(sql).bind(...params).all()).results;
const profile = async label => (await admin('/api/profiles', { label })).data.profileId;
async function code(deviceName, profileIds) {
  const result = await admin('/api/codes', { deviceName, profileIds });
  assert.equal(result.status, 200);
  return result.data.code;
}
async function remove(action, target) {
  const preview = await admin('/api/preview', { action, target });
  assert.equal(preview.status, 200);
  assert.equal((await admin('/api/confirm', { confirmation: preview.data.confirmation })).status, 200);
}

before(async () => {
  const config = JSON.parse(await readFile(resolve(root, 'wrangler.jsonc'), 'utf8'));
  work = await mkdtemp(join(tmpdir(), 'hosted-check-'));
  mf = new Miniflare(convertV4MiniflareOptions({
    name: 'hosted-check', modules: true, scriptPath: bundlePath, rootPath: resolve(bundlePath, '..'), compatibilityDate: config.compatibility_date,
    cf: false, host: '127.0.0.1', port: 0,
    bindings: { REPORTING_ENABLED: 'true', ALLOWED_ORIGINS: GAME, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, RETENTION_DAYS: '90', DISPLAY_TIME_ZONE: 'UTC' },
    d1Databases: { DB: 'hosted-check' },
    // The committed limiter settings, unchanged.
    ratelimits: Object.fromEntries(config.ratelimits.map(item => [item.name, { namespace_id: item.namespace_id, simple: item.simple }])),
    outboundService: async request => {
      if (request.url === `${TEAM}/cdn-cgi/access/certs`) return new MFResponse(JSON.stringify({ keys: [jwk] }), { headers: { 'Content-Type': 'application/json' } });
      outbound.push(new URL(request.url).host);
      return new MFResponse('denied', { status: 403 });
    },
  }));
  base = new URL(String(await mf.ready)).origin;
  assert.equal(originKind(base), 'loopback', 'the built Worker listens on loopback only');
  db = (await mf.getBindings()).DB;
  const migration = (await readFile(resolve(root, 'migrations/0001_initial.sql'), 'utf8')).split('\n').filter(line => !line.trim().startsWith('--')).join('\n').split(';').map(sql => sql.trim()).filter(Boolean);
  await db.batch(migration.map(sql => db.prepare(sql)));
  session = (await admin('/api/session')).data;
});
after(async () => {
  assert.deepEqual(outbound, [], 'no Worker outbound request except the synthetic Access keys');
  await mf?.dispose();
  await rm(work, { recursive: true, force: true });
});

function manifest(overrides = {}) {
  return {
    schemaVersion: 1, target: base, gameOrigin: GAME, phase: 'qualification',
    expected: { sourceCommit: 'a'.repeat(40), workerVersion: randomUUID(), configSha256: 'b'.repeat(64), toolSha256: toolSha, contractSha256: contractSha },
    budget: { observedAtUtc: new Date().toISOString(), source: 'owner-dashboard', wholeAccount: true, remaining: { rowsWritten: 90000, rowsRead: 3000000, requests: 5000 } },
    ...overrides,
  };
}
let serial = 0;
async function inputFile(name, value) {
  const file = join(work, `input-${++serial}-${name}`);
  await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
}
async function networkArgs(mode, value, { target = value.target, loopback = true, out } = {}) {
  return [mode, '--manifest', await inputFile('manifest.json', value), '--target', target, '--out', out ?? join(work, `out-${++serial}`),
    ...(loopback ? ['--loopback-tool-test', '--loopback-pace-ms', '0'] : [])];
}

// Runs the tool as an operator would: answers each WAITING prompt on stdin only after it
// appears. `early` is written immediately, before any prompt.
function tool(args, prompts = {}, { early } = {}) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', partial = '', pending = Promise.resolve(), failure = null;
    if (early) child.stdin.write(early);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      const lines = (partial + chunk).split('\n');
      partial = lines.pop();
      for (const line of lines) {
        // The whole prompt name, up to the space before its text (names include X, Y, P).
        const name = /^WAITING:(\S+) /.exec(line)?.[1];
        if (!name) continue;
        pending = pending.then(async () => {
          assert.ok(prompts[name], `unexpected prompt ${name}`);
          child.stdin.write(await prompts[name]());
        }).catch(error => { failure ??= error; child.kill(); });
      }
    });
    child.on('error', fail);
    child.on('close', async exit => {
      await pending;
      if (failure) return fail(failure);
      const summary = parse(stdout.trim().split('\n').at(-1) ?? '');
      done({ exit, stdout, stderr, summary });
    });
  });
}
async function outputs(result, out) {
  const files = out ? await readdir(out) : [];
  const texts = await Promise.all(files.map(file => readFile(join(out, file), 'utf8')));
  return { files, text: [result.stdout, result.stderr, ...texts].join('\n'), json: Object.fromEntries(files.map((file, i) => [file, texts[i]])) };
}
// Nothing the tool prints or writes may hold a code, a device token, a profile label or
// an event payload field.
function assertNoLeak(text, secrets = []) {
  assert.doesNotMatch(text, /lr1_[0-9a-f]{32}_/, 'no device token');
  for (const secret of secrets) {
    for (const form of [secret, secret.replace(/-/g, '')]) assert.equal(text.includes(form), false, 'no one-time code');
  }
  for (const marker of PAYLOAD_MARKERS) assert.equal(text.includes(marker), false, `no payload or label: ${marker}`);
}
const receiptOf = files => JSON.parse(Object.entries(files.json).find(([file]) => file.startsWith('receipt-'))[1]);
const idLines = files => Object.entries(files.json).find(([file]) => file.startsWith('ids-'))[1].trim().split('\n').map(line => JSON.parse(line));

async function stub(handler) {
  const hits = [];
  const server = createServer((req, res) => { hits.push(`${req.method} ${req.url}`); handler(req, res); });
  await new Promise(ready => server.listen(0, '127.0.0.1', ready));
  return { origin: `http://127.0.0.1:${server.address().port}`, hits, close: () => new Promise(closed => { server.closeAllConnections(); server.close(closed); }) };
}

test('the fixed corpus is the retained 3,600-event allocation: 3,000 hot and 600 cold, validated, in bounded batches', () => {
  const X = { deviceId: randomUUID(), epochId: randomUUID(), seq: 0 }, Y = { deviceId: randomUUID(), epochId: randomUUID(), seq: 0 };
  const A = randomUUID(), B = randomUUID(), at = Date.now();
  const corpus = buildCorpus({ generated: 0 }, { X, Y, A, B, now: at });
  const all = [...corpus.X, ...corpus.Y];
  assert.equal(all.length, LIMITS.corpusEvents);
  assert.equal(new Set(all.map(event => event.eventId)).size, all.length, 'unique event IDs');
  assert.deepEqual([all.filter(event => event.profileId === A).length, all.filter(event => event.profileId === B).length], [3000, 600]);
  assert.ok(corpus.Y.every(event => event.profileId === A), 'device Y carries only the hot profile');
  assert.deepEqual([all.filter(event => event.game === 'facts').length, all.filter(event => event.game === 'football').length], [1800, 1800]);
  for (const [dev, events] of [[X, corpus.X], [Y, corpus.Y]]) {
    assert.deepEqual(events.map(event => event.seq), events.map((_, i) => i + 1), 'seq 1..n per device');
    assert.ok(events.every(event => event.deviceId === dev.deviceId && event.epochId === dev.epochId));
  }
  assert.ok(all.every(event => validateEvent(event)), 'every event passes the shared #199 validator');
  assert.ok(all.every(event => { const t = Date.parse(event.recordedAt); return t >= at - LIMITS.corpusSpanMs && t <= at; }), 'inside the default report range');
  for (const events of [corpus.X, corpus.Y]) for (let i = 0; i < events.length; i += LIMITS.batch) {
    assert.ok(JSON.stringify({ schemaVersion: 1, status: {}, events: events.slice(i, i + LIMITS.batch) }).length < LIMITS.bodyBytes / 4, 'batch far below the body cap');
  }
  assert.throws(() => buildCorpus({ generated: 1 }, { X: { ...X, seq: 0 }, Y: { ...Y, seq: 0 }, A, B, now: at }), { code: 'EVENT_CAP' }, 'never more than 3,600 events per run');
});

test('target, option, drift, budget, phase, output-path and input guards refuse before any request', async () => {
  const counting = await stub((req, res) => res.writeHead(500).end());
  try {
    const good = manifest({ target: counting.origin });
    const cases = [
      ['loopback target without the tool-test flag', await networkArgs('probe', good, { loopback: false }), 'TARGET'],
      ['remote target in tool-test mode', await networkArgs('probe', manifest({ target: 'https://reports.synthetic.test' })), 'LOOPBACK_ONLY'],
      ['target with a trailing slash', await networkArgs('probe', manifest({ target: 'https://reports.synthetic.test/' }), { loopback: false }), 'TARGET'],
      ['command-line target differs from the manifest', await networkArgs('probe', good, { target: base }), 'TARGET_MISMATCH'],
      ['tool bytes differ from the reviewed hash', await networkArgs('probe', manifest({ target: counting.origin, expected: { ...good.expected, toolSha256: 'f'.repeat(64) } })), 'DRIFT'],
      ['seed without a budget reading', await networkArgs('seed', manifest({ target: counting.origin, budget: undefined })), 'BUDGET'],
      ['stale budget reading', await networkArgs('seed', manifest({ target: counting.origin, budget: { ...good.budget, observedAtUtc: new Date(Date.now() - 4 * 3600000).toISOString() } })), 'BUDGET'],
      ['budget below the seed headroom', await networkArgs('seed', manifest({ target: counting.origin, budget: { ...good.budget, remaining: { ...good.budget.remaining, rowsWritten: 74999 } } })), 'BUDGET'],
      ['budget not read from the whole account', await networkArgs('seed', manifest({ target: counting.origin, budget: { ...good.budget, wholeAccount: false } })), 'BUDGET'],
      ['uploads in the production phase', await networkArgs('protocol', manifest({ target: counting.origin, phase: 'production' })), 'PHASE'],
      ['pacing override outside the tool test', ['probe', '--manifest', 'x', '--target', counting.origin, '--out', work, '--loopback-pace-ms', '0'], 'LOOPBACK_ONLY_OPTION'],
      ['output inside the tracked tree', await networkArgs('probe', good, { out: join(root, 'hosted-check-out') }), 'OUT_PATH'],
    ];
    for (const [name, args, stop] of cases) {
      const result = await tool(args);
      assert.equal(result.exit, 2, name);
      assert.equal(result.summary.stop?.code, stop, name);
    }
    await assert.rejects(readdir(join(root, 'hosted-check-out')), 'no directory created inside the tree');
    const pasted = 'ABCDEFGHJKMNPQRSTVWXYZ0123';
    const unknown = await tool(['probe', '--code', pasted]);
    assert.deepEqual([unknown.exit, unknown.summary.stop?.code], [2, 'USAGE']);
    assert.equal(unknown.stdout.includes(pasted) || unknown.stderr.includes(pasted), false, 'an argument is never echoed');
    const typedAhead = manifest({ target: counting.origin });
    const out = join(work, 'early');
    const early = await tool(await networkArgs('seed', typedAhead, { out }), {}, { early: `${pasted}\n` });
    assert.deepEqual([early.exit, early.summary.stop?.code], [1, 'INPUT_BEFORE_PROMPT'], 'input typed ahead of the prompt is refused');
    assertNoLeak((await outputs(early, out)).text, [pasted]);
    assert.deepEqual(counting.hits, [], 'no request reached the target');
  } finally { await counting.close(); }
});

test('a redirect is never followed, nothing is retried, and failures report no body or cause', async () => {
  const elsewhere = await stub((req, res) => res.writeHead(200).end());
  const redirect = await stub((req, res) => res.writeHead(302, { Location: `${elsewhere.origin}/login` }).end());
  const failing = await stub((req, res) => res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'unavailable', note: 'BODY-MARKER-7731' })));
  const reset = await stub(req => req.socket.destroy());
  try {
    for (const [server, layer] of [[redirect, 'redirect:other'], [failing, 'worker:unavailable']]) {
      const out = join(work, `fail-${++serial}`);
      const result = await tool(await networkArgs('probe', manifest({ target: server.origin }), { out }));
      assert.deepEqual([result.exit, result.summary.stop?.code, result.summary.requests], [1, 'UNEXPECTED', 1]);
      assert.equal(receiptOf(await outputs(result, out)).stop.detail.layer, layer);
      assert.equal(server.hits.length, 1, 'one request, no retry');
      assert.equal((await outputs(result, out)).text.includes('BODY-MARKER-7731'), false, 'no response body in output');
    }
    assert.deepEqual(elsewhere.hits, [], 'the redirect target was never contacted');
    const out = join(work, 'reset');
    const result = await tool(await networkArgs('probe', manifest({ target: reset.origin }), { out }));
    assert.deepEqual([result.exit, result.summary.stop?.code, result.summary.requests], [1, 'NETWORK', 1]);
    const text = (await outputs(result, out)).text;
    for (const leak of ['127.0.0.1', 'ECONN', 'socket', 'fetch failed']) assert.equal(text.includes(leak), false, `no error cause: ${leak}`);
    assert.equal(reset.hits.length, 1, 'no retry after a network failure');
  } finally { await Promise.all([elsewhere, redirect, failing, reset].map(server => server.close())); }
});

test('probe: every protected and nearby path is refused by the built Worker; exact device paths refuse a missing Origin', async () => {
  const out = join(work, 'probe');
  const result = await tool(await networkArgs('probe', manifest(), { out }));
  assert.equal(result.exit, 0, JSON.stringify(result.summary));
  const receipt = receiptOf(await outputs(result, out));
  assert.equal(receipt.requests, PROBES.length);
  assert.equal(receipt.steps.length, PROBES.length);
  for (const row of receipt.steps.filter(row => !['/v1/enroll', '/v1/sync'].includes(row.path))) {
    assert.deepEqual([row.status, row.layer], [401, 'worker:unauthorized'], `${row.method} ${row.path} forged=${row.forged}`);
  }
  assert.deepEqual(receipt.steps.filter(row => ['/v1/enroll', '/v1/sync'].includes(row.path)).map(row => [row.path, row.status, row.layer, row.cors]),
    [['/v1/enroll', 403, 'worker:origin', false], ['/v1/sync', 403, 'worker:origin', false]]);
  assert.equal(receipt.targetSha256, hash(base));
  assert.equal(JSON.stringify(receipt).includes(base), false, 'the target is recorded only as a hash');
});

test('seed: real enrollment, exact acknowledgments for every uploaded ID, replays stored once, a retention replay, and offline export checks', async () => {
  const A = await profile(LABELS.A), B = await profile(LABELS.B);
  const codes = [await code('Seed X', [A, B]), await code('Seed Y', [A])];
  const out = join(work, 'seed');
  let aged = null;
  const result = await tool([...await networkArgs('seed', manifest(), { out }), '--loopback-max-batches', '2', '--await-retention'], {
    'code-X': async () => `${codes[0]}\n`, 'code-Y': async () => `${codes[1]}\n`,
    // Stands in for the reviewed aging SQL and one scheduled run: batch-1's 20 IDs only.
    'retention': async () => {
      const [first] = (await readdir(out)).filter(file => file.startsWith('ids-'));
      aged = (await readFile(join(out, first), 'utf8')).trim().split('\n').map(line => JSON.parse(line)).find(line => line.step === 'batch-1').events.map(event => event.eventId);
      const changed = await db.prepare('UPDATE events SET received_at = 1000 WHERE event_id IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(aged)).run();
      assert.equal(changed.meta.changes, 20);
      await (await mf.getWorker()).scheduled({ cron: '17 3 * * *' });
      return 'done\n';
    },
  });
  assert.equal(result.exit, 0, JSON.stringify(result.summary));
  const files = await outputs(result, out);
  assertNoLeak(files.text, codes);
  const receipt = receiptOf(files), lines = idLines(files);
  assert.equal(receipt.requests, 2 + 4 + LIMITS.replays + 2);
  assert.deepEqual(receipt.outcomes, { accepted: 80 + 20 * LIMITS.replays + 20, deleted: 20 });
  assert.deepEqual(lines.filter(line => line.kind === 'device').map(line => [line.label, line.profiles]), [['X', { A, B }], ['Y', { A }]]);
  const sent = lines.filter(line => line.kind === 'sent' && line.step.startsWith('batch-')).flatMap(line => line.events.map(event => ({ ...event, device: line.device })));
  const stored = await rows('SELECT event_id AS eventId, device_id AS deviceId, seq, profile_id AS profileId FROM events');
  assert.equal(stored.length, 60, 'replays stored nothing twice and the aged batch stayed retired');
  assert.deepEqual(stored.map(row => row.eventId).sort(), sent.map(event => event.eventId).filter(id => !aged.includes(id)).sort(), 'D1 holds exactly the listed IDs that were not aged');
  assert.deepEqual((await rows("SELECT event_id AS eventId FROM retired_events WHERE reason = 'retention'")).map(row => row.eventId).sort(), [...aged].sort(), 'ID-only receipts for exactly the aged IDs');
  assert.equal(receipt.idSetSha256, hash([...new Set(lines.filter(line => line.kind === 'ack').flatMap(line => line.results).map(item => item.eventId))].sort().join('\n')));
  // The manifest's device, seq and profile slot for each ID match what D1 stored.
  const devices = Object.fromEntries(lines.filter(line => line.kind === 'device').map(line => [line.label, line.deviceId]));
  for (const event of sent.filter(item => !aged.includes(item.eventId))) {
    const row = stored.find(item => item.eventId === event.eventId);
    assert.deepEqual([row.deviceId, row.seq, row.profileId], [devices[event.device], event.seq, { A, B }[event.profile]]);
  }
  const health = (await admin('/api/devices')).data.devices.find(item => item.deviceId === devices.X);
  assert.deepEqual(health.epochs[0].unreceived, [], 'retired IDs never show as a gap');

  // Offline export analysis of an actual protected export (written outside the output directory).
  const exported = await admin(`/api/export?profile=${A}`);
  assert.equal(exported.status, 200);
  const ids = join(out, receipt.ids);
  const live = sent.filter(event => event.profile === 'A' && !aged.includes(event.eventId)).map(event => event.eventId);
  const check = async (name, exportValue, extra = []) => {
    const verifyOut = join(work, `verify-${name}`);
    const verify = await tool(['verify-export', '--ids', ids, '--export', await inputFile(`${name}.json`, exportValue), '--profile', 'A', ...extra, '--out', verifyOut]);
    const files = await outputs(verify, verifyOut);
    assertNoLeak(files.text, codes);
    return { exit: verify.exit, stop: verify.summary.stop?.code, counts: receiptOf(files).counts };
  };
  const plain = await check('plain', exported.data);
  assert.equal(plain.exit, 0);
  assert.deepEqual([plain.counts.expected, plain.counts.matched, plain.counts.missing, plain.counts.unexpected, plain.counts.duplicates, plain.counts.foreignProfile],
    [live.length, live.length, 0, 0, 0, 0]);
  const agedList = await inputFile('aged.json', aged);
  const withAged = await check('aged', exported.data, ['--expect-missing', agedList]);
  assert.deepEqual([withAged.exit, withAged.counts.expectedAbsentPresent], [0, 0]);
  assert.equal(withAged.counts.expectedAbsent, sent.filter(event => event.profile === 'A' && aged.includes(event.eventId)).length);
  // Two live IDs dropped from the export are reported missing; a duplicated row is caught.
  const dropped = live.slice(0, 2);
  const trimmed = { ...exported.data, events: exported.data.events.filter(item => !dropped.includes(item.event.eventId)) };
  const short = await check('trimmed', trimmed);
  assert.deepEqual([short.exit, short.stop, short.counts.missing], [1, 'EXPORT_MISMATCH', 2]);
  assert.equal((await check('dup', { ...exported.data, events: [...exported.data.events, exported.data.events[0]] })).counts.duplicates, 1);
  // A foreign profile's export never passes as this one's.
  const foreign = await inputFile('foreign.json', (await admin(`/api/export?profile=${B}`)).data);
  assert.equal((await tool(['verify-export', '--ids', ids, '--export', foreign, '--profile', 'A', '--out', join(work, 'verify-foreign')])).exit, 1);
  await remove('delete-profile', A);
  await remove('delete-profile', B);
});

test('protocol: code reuse, withheld seq 5, invalid, conflicts, fresh epoch, shared-profile deletion, unknown and revoked tokens', async () => {
  const P = await profile(LABELS.P), Q = await profile(LABELS.Q);
  const secret = await code('Protocol D', [P, Q]);
  const out = join(work, 'protocol');
  let health = null, anomalies = null;
  const result = await tool(await networkArgs('protocol', manifest(), { out }), {
    'code-P': async () => `${secret}\n`,
    'delete-profile': async () => { await remove('delete-profile', Q); return 'done\n'; },
    'delete-device': async () => {
      const [{ deviceId }] = await rows('SELECT device_id AS deviceId FROM device_profiles WHERE profile_id = ?1', P);
      health = (await admin('/api/devices')).data.devices.find(item => item.deviceId === deviceId);
      anomalies = (await rows('SELECT reason FROM anomalies WHERE device_id = ?1 ORDER BY reason', deviceId)).map(row => row.reason);
      await remove('delete-device', deviceId);
      return 'done\n';
    },
  });
  assert.equal(result.exit, 0, JSON.stringify(result.summary));
  const files = await outputs(result, out);
  assertNoLeak(files.text, [secret]);
  const receipt = receiptOf(files);
  assert.deepEqual(receipt.steps.map(item => [item.step, item.status, item.error ?? item.outcomes ?? item.profiles]), [
    ['enroll-D', 200, 2], ['code-reuse', 400, 'invalid-code'], ['gap5', 200, { accepted: 9 }], ['invalid', 200, { invalid: 1 }],
    ['shared', 200, { accepted: 3 }], ['conflict', 200, { conflict: 1, 'seq-conflict': 1 }], ['new-epoch', 200, { accepted: 1 }],
    ['profile-deleted', 200, { deleted: 2, accepted: 1 }], ['unknown-token', 401, 'invalid-credential'], ['revoked', 403, 'revoked'],
  ]);
  assert.ok(receipt.generatedEvents <= LIMITS.protocolEvents);
  assert.deepEqual(health.epochs.map(epoch => [epoch.freshLog, epoch.current, epoch.unreceived]),
    [[false, false, [{ first: 5, last: 5, count: 1 }]], [true, true, []]], 'one possibly pending seq, then a fresh log with no invented count');
  assert.deepEqual(anomalies, ['payload-mismatch', 'seq-conflict']);
  assert.equal((await rows('SELECT count(*) AS n FROM events WHERE profile_id = ?1', Q))[0].n, 0, 'queued events cannot restore a deleted profile');
  await remove('delete-profile', P);
});

test('expiry: an expired code is refused once, and its exchange is the only request', async () => {
  const P = await profile(LABELS.P);
  const secret = await code('Expiry E', [P]);
  await db.prepare('UPDATE enrollment_codes SET expires_at = 1 WHERE claimed_by IS NULL').run();
  const out = join(work, 'expiry');
  const result = await tool(await networkArgs('expiry', manifest(), { out }), { 'code-expiry': async () => `${secret}\n` });
  assert.equal(result.exit, 0, JSON.stringify(result.summary));
  const files = await outputs(result, out);
  assertNoLeak(files.text, [secret]);
  assert.deepEqual(receiptOf(files).steps, [{ step: 'expired-code', status: 400, error: 'invalid-code' }]);
  assert.equal(receiptOf(files).requests, 1);
  assert.equal((await rows("SELECT count(*) AS n FROM devices WHERE name = 'Expiry E'"))[0].n, 0, 'nothing enrolled');
  await remove('delete-profile', P);
});
