// Issue #161 load-wait: pure positive and negative controls for projection,
// privacy, request identity, boundaries, grading, gates and process
// observation. No browser, server or Playwright runtime. Synthetic inputs
// prove collector/analysis sensitivity only; they are never evidence about
// N, L or T. Negative cases are built as evidence inputs, not by calling the
// code under test with its own expected outputs.
import fs from 'node:fs';
import path from 'node:path';
import { classifyError, newConnState, newCounters, projectMessage, sanitizeUrl, INNER_PARSE_LIMIT } from './project.mjs';
import { Tracker } from './tracker.mjs';
import { CONTROL_EXPECT, analyzeControl, gateDecision, identityCheck, laterOutcomes, loadRun, replaySink, serverCompleteness, testShape, validity } from './analyze.mjs';
import { envMetadata, REFUSE, STRIP } from './lib.mjs';
import { drainGroupChecked, finalDecision, parsePs, preflightDecision } from './procs.mjs';
import { INVENTORY, checkInventory } from './inventory.mjs';

const nested = (pp, tgt, inner) => ({ method: 'Target.dispatchMessageFromTarget', pageProxyId: pp, params: { targetId: tgt, message: typeof inner === 'string' ? inner : JSON.stringify(inner) } });
const evt = (method, params) => ({ method, params });

function harness() {
  const conn = newConnState(), counters = newCounters(), recs = [];
  let seq = 0;
  const feed = (dir, message) => { for (const r of projectMessage(dir, message, conn, counters)) recs.push({ seq: ++seq, ...r, conn: 'p1c1' }); };
  return { conn, counters, recs, feed, next: () => ++seq };
}

const req = (rid, url, extra = {}) => evt('Network.requestWillBeSent', { requestId: rid, frameId: 'f1', loaderId: 'l1', type: 'Image', timestamp: 1, request: { url, method: 'GET', headers: { Cookie: 'CANARYH1', 'User-Agent': 'CANARYUA' }, postData: 'CANARYB' }, initiator: { stack: 'CANARYS' }, ...extra });
const resp = (rid, url, status) => evt('Network.responseReceived', { requestId: rid, frameId: 'f1', loaderId: 'l1', type: 'Image', timestamp: 2, response: { url, status, statusText: 'CANARYST', headers: { 'Set-Cookie': 'CANARYH2' }, mimeType: 'image/png', source: 'network', timing: { startTime: 1, responseStart: 2, secret: 'CANARYT' } } });
const fin = rid => evt('Network.loadingFinished', { requestId: rid, timestamp: 3, metrics: { responseBodyBytesReceived: 10, remoteAddress: '127.0.0.1:8090', securityConnection: { protocol: 'CANARYSEC' } } });
const fail = (rid, text, canceled) => evt('Network.loadingFailed', { requestId: rid, timestamp: 4, errorText: text, canceled });

const CASES = [];
const pure = (id, what, fn) => CASES.push({ id, what, fn });

pure('P1', 'projection drops headers/cookies/bodies/initiator/UA and strips userinfo, query values and fragment', () => {
  const h = harness();
  h.feed('recv', nested(5, 't1', req('r1', 'http://CANARYU:CANARYP@127.0.0.1:8090/football/?token=CANARYQ#CANARYF')));
  h.feed('recv', nested(5, 't1', resp('r1', 'http://127.0.0.1:8090/football/?token=CANARYQ', 200)));
  h.feed('recv', nested(5, 't1', fin('r1')));
  h.feed('recv', nested(5, 't1', req('r2', 'https://CANARYU@ex.example/CANARYPATH?x=CANARYQ#f')));
  h.feed('recv', nested(5, 't1', req('r3', 'http://127.0.0.1:8090/a b/<CANARYX>')));
  const text = JSON.stringify(h.recs);
  const u = h.recs[0].p.url, ext = h.recs[3].p.url, odd = h.recs[4].p.url;
  return { ok: !text.includes('CANARY') && !/headers|cookie|postData|initiator|statusText|remoteAddress/i.test(text) && u.path === '/football/' && u.userinfo && u.frag && u.qk.join() === 'token' && ext.cls === 'external' && ext.host === 'ex.example' && odd.path.startsWith('<redacted:'), detail: { u, ext, odd } };
});

// Oversized counterexamples (each payload exceeds INNER_PARSE_LIMIT):
//  A: a nested untracked method at the head, the real tracked method mid-payload;
//  B: a real tracked event whose tail ends in a nested object's id;
//  C: a tracked method first (must still not be parsed: no unbounded parse).
let PAD = null;
const pad = () => (PAD ??= 'y'.repeat(INNER_PARSE_LIMIT));
const OVERSIZED = {
  A: () => JSON.stringify({ params: { method: 'Runtime.consoleAPICalled', requestId: 'rA', a: pad() }, method: 'Network.loadingFinished', z: pad() }),
  B: () => JSON.stringify({ method: 'Network.loadingFinished', params: { requestId: 'rB', a: pad(), meta: { id: 77 } } }),
  C: () => JSON.stringify({ method: 'Network.requestWillBeSent', params: { requestId: 'rC', frameId: 'f1', request: { url: 'http://127.0.0.1:8090/c', x: pad() } } }),
};

pure('P2', 'nested payloads within the limit project; every oversized payload (misleading head method, nested tail id, or tracked head) is skipped unparsed and counted as loss; invalid JSON counted', () => {
  const h = harness();
  h.feed('recv', nested(5, 't1', evt('Page.domContentEventFired', { frameId: 'f1', timestamp: 1 })));
  h.feed('recv', nested(5, 't1', req('small', 'http://127.0.0.1:8090/s')));
  for (const k of ['A', 'B', 'C']) h.feed('recv', nested(5, 't1', OVERSIZED[k]()));
  h.feed('recv', nested(5, 't1', '{not json'));
  const c = h.counters;
  const ms = h.recs.map(r => `${r.m}:${r.p?.rid ?? ''}`);
  return { ok: ms.join() === 'Page.domContentEventFired:,Network.requestWillBeSent:small' && c.innerOversizedSkipped === 3 && c.innerOversizedSkippedBytes > 3 * INNER_PARSE_LIMIT && c.innerParseError === 1, detail: { projected: ms, oversized: c.innerOversizedSkipped, parseErrors: c.innerParseError } };
});

pure('P3', 'reused requestId across redirects yields consecutive hops', () => {
  const h = harness(); const t = new Tracker();
  const u = n => `http://127.0.0.1:8094/ctl/redirect/${n}`;
  h.feed('recv', nested(5, 't1', req('r1', u(3), { type: 'Document' })));
  for (const n of [2, 1, 0]) h.feed('recv', nested(5, 't1', req('r1', u(n), { type: 'Document', redirectResponse: { status: 302, url: u(n + 1), headers: { Location: 'CANARYL' } } })));
  h.feed('recv', nested(5, 't1', resp('r1', u(0), 200)));
  h.feed('recv', nested(5, 't1', fin('r1')));
  for (const r of h.recs) t.apply(r);
  const d = t.drainDone().sort((a, b) => a.hop - b.hop);
  return { ok: d.length === 4 && d.every((x, i) => x.hop === i) && d.slice(0, 3).every(x => x.state === 'redirected' && x.redirectStatus === 302) && d[3].state === 'finished' && !JSON.stringify(h.recs).includes('CANARY'), detail: d.map(x => [x.hop, x.state]) };
});

pure('P4', 'HTTP error response is finished with status; network failure has no headers and a class only', () => {
  const h = harness(); const t = new Tracker();
  h.feed('recv', nested(5, 't1', req('a', 'http://127.0.0.1:8094/ctl/status/404')));
  h.feed('recv', nested(5, 't1', resp('a', 'http://127.0.0.1:8094/ctl/status/404', 404)));
  h.feed('recv', nested(5, 't1', fin('a')));
  h.feed('recv', nested(5, 't1', req('b', 'http://127.0.0.1:8094/ctl/reset')));
  h.feed('recv', nested(5, 't1', fail('b', 'The network connection was lost. CANARYE')));
  for (const r of h.recs) t.apply(r);
  const d = Object.fromEntries(t.drainDone().map(x => [x.rid, x]));
  return { ok: d.a.state === 'finished' && d.a.status === 404 && d.b.state === 'failed' && d.b.hadHeaders === false && d.b.errorCls === 'connection-lost' && !JSON.stringify(h.recs).includes('CANARY'), detail: { a: [d.a.state, d.a.status], b: [d.b.state, d.b.errorCls] } };
});

pure('P5', 'headers received with body held stays pending in the snapshot; a later cancel is reported after it', () => {
  const h = harness();
  h.feed('recv', nested(5, 't1', evt('Page.frameNavigated', { frame: { id: 'f1', loaderId: 'l1', url: 'http://127.0.0.1:8094/ctl/page/held.html' } })));
  h.feed('recv', nested(5, 't1', req('held', 'http://127.0.0.1:8094/ctl/hold.png')));
  h.feed('recv', nested(5, 't1', resp('held', 'http://127.0.0.1:8094/ctl/hold.png', 200)));
  h.feed('recv', nested(5, 't1', evt('Page.domContentEventFired', { frameId: 'f1', timestamp: 2 })));
  const live = new Tracker();
  for (const r of h.recs) live.apply(r);
  const snap = { seq: h.next(), ev: 'snapshot', boundary: 'context.close.entry', ...live.snapshot() };
  h.recs.push(snap);
  h.feed('recv', nested(5, 't1', fail('held', 'Load request cancelled', true)));
  const later = laterOutcomes(snap, replaySink(h.recs));
  const page = snap.pages[0];
  return { ok: snap.pendingCount === 1 && snap.pending[0].state === 'headers' && page.nav.dcl === true && page.nav.load === false && later[0].after === 'cancelled-after-snapshot', detail: { pending: snap.pending.map(p => [p.url.path, p.state]), later } };
});

pure('P6', 'the same URL twice gives two identities with one sanitized URL key', () => {
  const h = harness(); const t = new Tracker();
  for (const rid of ['x1', 'x2']) { h.feed('recv', nested(5, 't1', req(rid, 'http://127.0.0.1:8094/ctl/repeat.json?token=CANARYQ'))); h.feed('recv', nested(5, 't1', fin(rid))); }
  for (const r of h.recs) t.apply(r);
  const d = t.drainDone();
  return { ok: d.length === 2 && new Set(d.map(x => x.key)).size === 2 && new Set(d.map(x => x.urlKey)).size === 1, detail: d.map(x => x.key) };
});

pure('P7', 'records missing their request are anomalies, not silently dropped; target loss marks pending target-gone', () => {
  const h = harness(); const t = new Tracker();
  h.feed('recv', nested(5, 't1', resp('ghost', 'http://127.0.0.1:8090/x', 200)));
  h.feed('recv', nested(5, 't1', fin('ghost2')));
  h.feed('recv', nested(5, 't1', req('p', 'http://127.0.0.1:8090/y')));
  h.feed('recv', { method: 'Target.targetDestroyed', pageProxyId: 5, params: { targetId: 't1' } });
  for (const r of h.recs) t.apply(r);
  const d = t.drainDone();
  return { ok: t.anomalies.map(a => a.kind).join() === 'response-without-request,terminal-without-request' && t.anomalyCount === 2 && d.length === 1 && d[0].state === 'target-gone', detail: { anomalies: t.anomalies, done: d.map(x => x.state) } };
});

pure('P8', 'error text is classified, never stored', () => {
  const cases = [['Load request cancelled', 'cancelled'], ['The network connection was lost.', 'connection-lost'], ['Could not connect to the server.', 'connection-refused'], ['Timeout 30000ms exceeded.', 'timeout'], ['weird CANARYE', 'other']];
  const got = cases.map(([text]) => classifyError(text));
  return { ok: got.every((g, i) => g.cls === cases[i][1] && Object.keys(g).join() === 'cls,len') && !JSON.stringify(got).includes('CANARY'), detail: got };
});

pure('P9', 'context create/delete commands and replies, including the browser-close control reply', () => {
  const h = harness(); const t = new Tracker();
  h.feed('send', { id: 1, method: 'Playwright.createContext', params: { proxyServer: 'CANARYPROXY' } });
  h.feed('recv', { id: 1, result: { browserContextId: 'ctxA' } });
  h.feed('send', { id: 2, method: 'Playwright.deleteContext', params: { browserContextId: 'ctxA' } });
  const afterSend = (() => { const x = new Tracker(); for (const r of h.recs) x.apply(r); return x.snapshot().contexts; })();
  h.feed('recv', { id: 2, result: {} });
  h.feed('recv', { id: -9999, result: {} });
  h.feed('send', { id: 3, method: 'Browser.unrelated', params: { secret: 'CANARYPARAM' } });
  for (const r of h.recs) t.apply(r);
  return { ok: afterSend[0]?.state === 'deleting' && t.snapshot().contexts.length === 0 && h.recs.some(r => r.cid === -9999) && !JSON.stringify(h.recs).includes('CANARY') && h.counters.byMethod['send Browser.unrelated'] === 1, detail: { afterSend, recs: h.recs.map(r => [r.ev, r.m, r.p ?? null]) } };
});

pure('P10', 'sanitizeUrl classes', () => {
  const got = ['data:text/plain,CANARY', 'about:blank', 'blob:http://127.0.0.1:8090/x', 'http://127.0.0.1:8094/ctl/ok.svg', 'http://localhost:9/x', 'chrome://x', 'not a url'].map(sanitizeUrl);
  return { ok: got.map(g => g.cls).join() === 'data,about,blob,local-control,local-other,other-scheme,invalid' && !JSON.stringify(got).includes('CANARY'), detail: got.map(g => g.cls) };
});

// ---------------------------------------------------------------- synthetic runs
const CONN = 'p100c1';
const writeJsonl = (file, recs) => fs.writeFileSync(file, recs.map(r => JSON.stringify(r)).join('\n') + '\n');
const numbered = recs => recs.map((r, i) => ({ seq: i + 1, ...r }));
const goodServer = () => numbered([{ ev: 'observer.ready', faultInjected: null }, { ev: 'request.start', req: 1, probe: 'x-ready', url: { cls: 'local-app', path: '/version.json' } }, { ev: 'response.finish', req: 1, status: 200 }, { ev: 'request.start', req: 2, probe: 'x-final', url: { cls: 'local-app', path: '/version.json' } }, { ev: 'response.finish', req: 2, status: 200 }]);
const goodStatus = (o = {}) => ({ status: 'COMPLETED', writersExited: true, collection: { complete: true }, fingerprint: { match: true }, ...(o.postMissing ? {} : { postFingerprint: { actual: 'x', match: o.post ?? true } }) });
const exitRec = counters => ({ ev: 'observer.exit', code: 0, counters: { innerParseError: 0, innerNotString: 0, innerOversizedSkipped: 0, malformedIdentity: 0, ...counters }, gaps: {} });
const header = [{ ev: 'observer.install', workerIndex: 0, parallelIndex: 0, pid: 100 }, { ev: 'observer.hooks', hooks: { H1: 'installed', H2: 'installed', H3: 'installed', H4: 'installed' } }];

function writeRun(dir, { sink, status, report, mode = 'synthetic' }) {
  fs.mkdirSync(path.join(dir, 'observer'), { recursive: true });
  writeJsonl(path.join(dir, 'observer', 'w0-p100.jsonl'), sink);
  fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify(status));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ mode }));
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report));
  writeJsonl(path.join(dir, 'server-app.jsonl'), goodServer());
  if (mode === 'control') writeJsonl(path.join(dir, 'server-control.jsonl'), goodServer());
  return loadRun(dir);
}
const oneCaseReport = (title, project, status) => ({ suites: [{ specs: [{ file: 's.spec.mjs', title, tests: [{ projectName: project, status: status === 'passed' ? 'expected' : 'unexpected', results: [{ status, retry: 0, workerIndex: 0 }] }] }] }] });

function syntheticRun(root, name, o = {}) {
  const { exit = true, protocolBeforeInstall = false, forbidden = false, h5 = true, status = 'passed', goto = 'ok', load = true, publicClose = true, extra = [], counters = {}, truncated = 0 } = o;
  const test = { testId: 't', title: 'S1 synthetic', project: 'p', retry: 0, worker: 0, file: 's.spec.mjs', line: 1 };
  const page = { conn: CONN, pp: 5, ctx: 'ctxA', mainFrame: 'f1', swaps: 0, nav: { loader: 'l1', url: { cls: 'local-app', path: '/football/' }, dcl: true, load, dclTs: 1, loadTs: load ? 2 : null } };
  const pending = load ? [] : [{ conn: CONN, pp: 5, tgt: 't1', rid: 'r9', hop: 0, state: 'headers', url: { cls: 'local-app', path: '/shared/x.woff2' } }];
  const snap = boundary => ({ ev: 'snapshot', boundary, test, pendingCount: pending.length + truncated, anomaliesSoFar: 0, truncated, pending, pages: [page], contexts: [{ conn: CONN, ctx: 'ctxA', state: 'open', created: true }], ...(boundary === 'test.functions.finished' ? { status } : {}) });
  const recs = [
    ...(protocolBeforeInstall ? [{ ev: 'evt', conn: CONN, m: 'Page.loadEventFired', p: {} }] : []),
    ...header,
    { ev: 'test.registered', test },
    { ev: 'api.begin', api: 'page.goto', test },
    { ev: 'evt', conn: CONN, pp: 5, tgt: 't1', m: 'Page.frameNavigated', p: { frame: 'f1', loader: 'l1', url: page.nav.url, ...(forbidden ? { headers: { a: 1 } } : {}) } },
    ...(goto === 'ok' ? [{ ev: 'api.end', api: 'page.goto', beginSeq: 4, ok: true }] : []),
    ...extra,
    ...(h5 ? [snap('test.functions.finished')] : []),
    snap('context.close.entry'),
    ...(publicClose ? [snap('context.public.close')] : []),
    { ev: 'context.close.end', ok: publicClose },
    ...(exit ? [exitRec(counters)] : []),
  ];
  return writeRun(path.join(root, name), { sink: numbered(recs), status: goodStatus(o), report: oneCaseReport('S1 synthetic', 'p', status) });
}
const verdictOf = (root, name, o) => validity(syntheticRun(root, name, o), { requireSealed: false }).verdict;

pure('P11', 'validity grading: complete run VALID; interrupted observer INCOMPLETE; protocol before install, forbidden key or missing boundary not VALID', (root) => {
  const got = { complete: verdictOf(root, 's-complete', {}), interrupted: verdictOf(root, 's-interrupted', { exit: false }), early: verdictOf(root, 's-early', { protocolBeforeInstall: true }), forbidden: verdictOf(root, 's-forbidden', { forbidden: true }), noH5: verdictOf(root, 's-noh5', { h5: false }) };
  return { ok: got.complete === 'VALID' && got.interrupted === 'INCOMPLETE' && got.early === 'INVALID' && got.forbidden === 'INVALID' && got.noH5 !== 'VALID', detail: got };
});

pure('P12', 'shape labels: L-shape and T-shape observed from boundaries; a normal close has neither', (root) => {
  const shapeOf = (name, o) => { const v = validity(syntheticRun(root, name, o), { requireSealed: false }); return testShape([...v.tests.values()][0], v.facts).labels; };
  const l = shapeOf('s-lshape', { status: 'timedOut', goto: 'pending', load: false, publicClose: false });
  const normal = shapeOf('s-normal', {});
  return { ok: l.some(x => x.startsWith('L-shape')) && l.some(x => x.startsWith('T-shape')) && normal.length === 0, detail: { l, normal } };
});

pure('P13', 'controls cannot pass vacuously: a run without the control cases is never PASS and meets no expectation', (root) => {
  const r = analyzeControl(syntheticRun(root, 's-vacuous', {}));
  return { ok: r.verdict !== 'PASS' && r.expectations.every(e => !e.ok), detail: { verdict: r.verdict } };
});

pure('P14', 'environment metadata records set/unset only: no stripped or refused value persists', () => {
  const env = Object.fromEntries([...STRIP, ...REFUSE, 'CI'].map(k => [k, `CANARYENV-${k}-https://user:pw@host/?token=x`]));
  const meta = envMetadata(env), empty = envMetadata({});
  const text = JSON.stringify(meta);
  return { ok: !text.includes('CANARY') && !text.includes('token') && Object.values(meta).every(v => v.set === true && Object.keys(v).join() === 'set,action') && Object.values(empty).every(v => v.set === false), detail: { keys: Object.keys(meta).length } };
});

pure('P15', 'a sink with either oversized counterexample (misleading head method + mid tracked method; nested tail id) or a malformed identity is INCOMPLETE; a clean sink stays VALID', (root) => {
  // Counters come from actually projecting each oversized counterexample.
  const countersFor = k => { const h = harness(); h.feed('recv', nested(5, 't1', OVERSIZED[k]())); return { innerOversizedSkipped: h.counters.innerOversizedSkipped, innerOversizedSkippedBytes: h.counters.innerOversizedSkippedBytes }; };
  const got = {
    headMethodMidTracked: verdictOf(root, 's-oversized-a', { counters: countersFor('A') }), nestedTailId: verdictOf(root, 's-oversized-b', { counters: countersFor('B') }),
    malformed: verdictOf(root, 's-malformed', { counters: { malformedIdentity: 1 } }), clean: verdictOf(root, 's-clean', { counters: {} }),
  };
  return { ok: got.headMethodMidTracked === 'INCOMPLETE' && got.nestedTailId === 'INCOMPLETE' && got.malformed === 'INCOMPLETE' && got.clean === 'VALID', detail: got };
});

pure('P16', 'a response without its request, or a truncated pending snapshot, cannot be complete evidence', (root) => {
  const ghost = { ev: 'evt', conn: CONN, pp: 5, tgt: 't1', m: 'Network.responseReceived', p: { rid: 'ghost', status: 200 } };
  const got = { missingRequest: verdictOf(root, 's-missing-request', { extra: [ghost] }), truncated: verdictOf(root, 's-truncated', { load: false, truncated: 5 }) };
  return { ok: got.missingRequest === 'INCOMPLETE' && got.truncated === 'INCOMPLETE', detail: got };
});

pure('P17', 'post-run fingerprint drift is INVALID, a missing post fingerprint INCOMPLETE, and gates refuse either', (root) => {
  const e = 'a'.repeat(64), d = 'b'.repeat(64);
  const got = {
    drift: verdictOf(root, 's-drift', { post: false }), missing: verdictOf(root, 's-post-missing', { postMissing: true }),
    idOk: identityCheck({ fingerprint: { match: true }, postFingerprint: { match: true } }).ok,
    gatePureDrift: gateDecision('pure', { manifestOk: true, payload: { verdict: 'PASS', fingerprint: e, postFingerprint: d }, expected: e }),
    gatePureOk: gateDecision('pure', { manifestOk: true, payload: { verdict: 'PASS', fingerprint: e, postFingerprint: e }, expected: e }),
    gateControlDrift: gateDecision('control', { manifestOk: true, payload: { analysis: { kind: 'control' }, verdict: 'PASS', runFingerprint: e, runPostFingerprint: d }, expected: e }),
    gateControlNoPost: gateDecision('control', { manifestOk: true, payload: { analysis: { kind: 'control' }, verdict: 'PASS', runFingerprint: e }, expected: e }),
    gateBadManifest: gateDecision('control', { manifestOk: false, payload: { analysis: { kind: 'control' }, verdict: 'PASS', runFingerprint: e, runPostFingerprint: e }, expected: e }),
  };
  return { ok: got.drift === 'INVALID' && got.missing === 'INCOMPLETE' && got.idOk && got.gatePureDrift && got.gatePureOk === null && got.gateControlDrift && got.gateControlNoPost && got.gateBadManifest, detail: got };
});

pure('P18', 'process observation fails closed: ps error/status/signal/empty/self-missing is unavailable; preflight refuses; drain and final decision cannot prove exit', async () => {
  const self = 4242;
  const okOut = { status: 0, stdout: `${self} 1 ${self} 100 node run.mjs\n` };
  const bad = [{ error: new Error('x'), status: null, stdout: '' }, { status: 1, stdout: `${self} 1 ${self} 1 node\n` }, { status: null, signal: 'SIGKILL', stdout: '' }, { status: 0, stdout: '' }, { status: 0, stdout: '999 1 999 1 other\n' }];
  const parsed = bad.map(r => parsePs(r, self));
  const pre = preflightDecision(parsePs(bad[3], self), '/wk');
  const drainUnknown = await drainGroupChecked(77, { graceMs: 0, killWaitMs: 0, runPs: () => bad[0], selfPid: self, kill: () => {} });
  const drainOk = await drainGroupChecked(77, { graceMs: 0, killWaitMs: 0, runPs: () => okOut, selfPid: self, kill: () => {} });
  const base = { cliGroup: { exited: true }, serversExited: true, ownedGroups: [{ pgid: 9, exited: true }], unresolvedWebKit: [], censusErrors: 0, runnerDrained: true, postFingerprintMatch: true };
  const d = {
    clean: finalDecision(base), unknownGroup: finalDecision({ ...base, cliGroup: drainUnknown }), unresolved: finalDecision({ ...base, unresolvedWebKit: [{ pid: 5 }] }),
    ownedAlive: finalDecision({ ...base, ownedGroups: [{ pgid: 9, exited: false }] }), undrained: finalDecision({ ...base, runnerDrained: false }), censusGap: finalDecision({ ...base, censusErrors: 1 }),
  };
  return {
    ok: parsed.every(p => !p.ok) && parsePs(okOut, self).ok && pre.status === 'STOPPED-census-unavailable' && drainUnknown.exited === false && drainUnknown.unknown && drainOk.exited === true
      && d.clean.complete && !d.unknownGroup.writersExited && !d.unresolved.writersExited && !d.ownedAlive.writersExited && d.undrained.writersExited && !d.undrained.complete && !d.censusGap.complete,
    detail: { reasons: parsed.map(p => p.reason), pre: pre.status, drainUnknown: { exited: drainUnknown.exited, unknown: drainUnknown.unknown } },
  };
});

// C5 inputs: held request pending with headers, snapshots in order, a later cancel.
function c5Run(root, name, { send = true, reorder = false, terminal = true, headers = true } = {}) {
  const test = { testId: 't5', title: 'C5 headers received, body held, load never fires', project: 'ipad-11-landscape', retry: 0, worker: 0, file: 'controls.spec.mjs', line: 1 };
  const hold = { cls: 'local-control', path: '/ctl/hold.png' };
  const pending = [{ conn: CONN, pp: 5, tgt: 't1', rid: 'h', hop: 0, state: headers ? 'headers' : 'sent', url: hold }];
  const pages = [{ conn: CONN, pp: 5, ctx: 'ctxA', mainFrame: 'f1', swaps: 0, nav: { loader: 'l1', url: { cls: 'local-control', path: '/ctl/page/held.html' }, dcl: true, load: false } }];
  const snap = (boundary, extra = {}) => ({ ev: 'snapshot', boundary, test, pendingCount: 1, anomaliesSoFar: 0, truncated: 0, pending, pages, contexts: [{ conn: CONN, ctx: 'ctxA', state: 'open', created: true }], ...extra });
  const entry = snap('context.close.entry'), sendSnap = snap('deleteContext.send', { ctx: 'ctxA' });
  const recs = [
    ...header, { ev: 'test.registered', test }, { ev: 'api.begin', api: 'page.goto', test },
    { ev: 'evt', conn: CONN, pp: 5, tgt: 't1', m: 'Network.requestWillBeSent', p: { rid: 'h', type: 'Image', url: hold } },
    ...(headers ? [{ ev: 'evt', conn: CONN, pp: 5, tgt: 't1', m: 'Network.responseReceived', p: { rid: 'h', status: 200 } }] : []),
    snap('test.functions.finished', { status: 'timedOut' }),
    ...(reorder ? [sendSnap, entry] : send ? [entry, sendSnap] : [entry]),
    ...(terminal ? [{ ev: 'evt', conn: CONN, pp: 5, tgt: 't1', m: 'Network.loadingFailed', p: { rid: 'h', canceled: true, error: { cls: 'cancelled', len: 22 } } }] : []),
    snap('context.public.close'), { ev: 'context.close.end', ok: true }, exitRec({}),
  ];
  const v = validity(writeRun(path.join(root, name), { sink: numbered(recs), status: goodStatus(), report: oneCaseReport(test.title, test.project, 'timedOut'), mode: 'control' }), { requireSealed: false });
  return CONTROL_EXPECT.find(([id]) => id === 'C5')[2](v);
}

pure('P19', 'C5 expectation needs protocol-observed headers (control-1 shape: held request still sent, no responseReceived, fails), the deleteContext send cutoff, entry-before-send order and a definite later terminal', (root) => {
  const got = { ok: c5Run(root, 's-c5-ok').ok, sentOnly: c5Run(root, 's-c5-sentonly', { headers: false }).ok, noSend: c5Run(root, 's-c5-nosend', { send: false }).ok, reordered: c5Run(root, 's-c5-reorder', { reorder: true }).ok, noTerminal: c5Run(root, 's-c5-noterminal', { terminal: false }).ok };
  return { ok: got.ok === true && !got.sentOnly && !got.noSend && !got.reordered && !got.noTerminal, detail: got };
});

pure('P20', 'faithful inventory: exact original union/skips/settings VALID with any captured outcome; missing or interrupted INCOMPLETE; extra/duplicate/retry/new or changed skip/settings/spec drift INVALID', () => {
  const inv = INVENTORY;
  const declared = (title, p) => inv.declaredSkip.titles.includes(title) && p !== inv.declaredSkip.exceptProject;
  const base = () => ({
    config: { ...inv.config, projects: inv.projects.map(name => ({ name, ...inv.project })) },
    suites: [{ title: 'f', specs: inv.titles.map(title => ({ title, file: 'football-overlay-accessibility.spec.mjs', tests: inv.projects.map(p => ({ projectName: p, annotations: declared(title, p) ? [{ type: 'skip', description: inv.declaredSkip.reason }] : [], results: [{ status: declared(title, p) ? 'skipped' : 'passed', retry: 0, workerIndex: 0 }] })) })) }],
  });
  const tests = r => r.suites[0].specs.flatMap(s => s.tests);
  const run = (mut, eff = inv.effective, sha = inv.specSha256) => { const r = base(); mut?.(r); return checkInventory(r, eff, sha).verdict; };
  const got = {
    base: run(), timedOut: run(r => { tests(r)[1].results[0].status = 'timedOut'; }),
    missing: run(r => { r.suites[0].specs[0].tests.pop(); }), interrupted: run(r => { tests(r)[0].results[0].status = 'interrupted'; }), noReport: checkInventory(null, inv.effective, inv.specSha256).verdict,
    extra: run(r => { r.suites[0].specs.push({ title: 'extra', tests: [{ projectName: inv.projects[0], results: [{ status: 'passed', retry: 0 }] }] }); }),
    duplicate: run(r => { r.suites[0].specs.push(r.suites[0].specs[0]); }),
    retry: run(r => { tests(r)[0].results.push({ status: 'passed', retry: 1 }); }),
    newSkip: run(r => { tests(r)[0].results[0].status = 'skipped'; }),
    changedReason: run(r => { r.suites[0].specs[3].tests[0].annotations[0].description = 'other'; r.suites[0].specs[3].tests[0].results[0].annotations = [{ type: 'skip', description: 'other' }]; }),
    declaredRan: run(r => { r.suites[0].specs[3].tests[0].results[0].status = 'passed'; }),
    workers: run(r => { r.config.workers = 6; }), projectTimeout: run(r => { r.config.projects[2].timeout = 60000; }),
    effective: run(null, { ...inv.effective, onlyDiffFromRelease: ['webServer', 'workers'] }), spec: run(null, inv.effective, 'c'.repeat(64)),
  };
  const invalid = ['extra', 'duplicate', 'retry', 'newSkip', 'changedReason', 'declaredRan', 'workers', 'projectTimeout', 'effective', 'spec'];
  return { ok: got.base === 'VALID' && got.timedOut === 'VALID' && got.missing === 'INCOMPLETE' && got.interrupted === 'INCOMPLETE' && got.noReport === 'INCOMPLETE' && invalid.every(k => got[k] === 'INVALID'), detail: got };
});

pure('P21', 'deleteContext replies correlate exactly by command id even out of order; an unmatched reply is an anomaly', () => {
  const h = harness(); const t = new Tracker();
  h.feed('send', { id: 1, method: 'Playwright.createContext', params: {} }); h.feed('recv', { id: 1, result: { browserContextId: 'ctxA' } });
  h.feed('send', { id: 2, method: 'Playwright.createContext', params: {} }); h.feed('recv', { id: 2, result: { browserContextId: 'ctxB' } });
  h.feed('send', { id: 3, method: 'Playwright.deleteContext', params: { browserContextId: 'ctxA' } });
  h.feed('send', { id: 4, method: 'Playwright.deleteContext', params: { browserContextId: 'ctxB' } });
  h.feed('recv', { id: 4, result: {} });
  for (const r of h.recs) t.apply(r);
  const afterB = t.snapshot().contexts.map(c => [c.ctx, c.state]);
  h.feed('recv', { id: 3, result: {} });
  t.apply(h.recs[h.recs.length - 1]);
  const afterA = t.snapshot().contexts.length;
  t.apply({ ev: 'reply', conn: 'p1c1', m: 'Playwright.deleteContext', cmdP: { ctx: 'ctxQ' }, ok: true, seq: 99 });
  return { ok: JSON.stringify(afterB) === JSON.stringify([['ctxA', 'deleting']]) && afterA === 0 && t.anomalies.map(a => a.kind).join() === 'delete-reply-without-deleting-context', detail: { afterB, afterA, anomalies: t.anomalies } };
});

pure('P22', 'server observation completeness: seq gap, missing final probe, unparsed line or uncaught exception is incomplete', () => {
  const good = goodServer();
  const gap = good.filter(r => r.seq !== 3);
  const noFinal = good.slice(0, 3);
  const uncaught = [...good, { seq: good.length + 1, ev: 'uncaught', errorName: 'Error' }];
  const unparsed = [...good, { ev: '#unparsed', seq: good.length + 1 }];
  const got = [good, gap, noFinal, uncaught, unparsed].map(r => serverCompleteness(r).ok);
  return { ok: JSON.stringify(got) === JSON.stringify([true, false, false, false, false]), detail: got };
});

export async function runPureControls(root) {
  const results = [];
  for (const c of CASES) {
    let r;
    try { r = await c.fn(root); } catch (e) { r = { ok: false, detail: `threw ${e?.name ?? 'Error'}` }; }
    results.push({ id: c.id, what: c.what, ok: !!r.ok, detail: r.detail });
  }
  return { verdict: results.every(r => r.ok) ? 'PASS' : 'FAIL', results };
}
