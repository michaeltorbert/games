// Issue #161 load-wait: passive per-worker observer, installed by
// loadwait.config.mjs during config evaluation inside each Playwright Test
// worker, before the test file and any fixture (workerMain.js:60-61 sets
// TEST_WORKER_INDEX, then _loadIfNeeded -> deserializeConfig -> loadConfig ->
// loadUserConfig -> requireOrImport imports this .mjs config, workerMain.js
// 165-182; configLoader.js:101-135; transform.js:209-226).
//
// Hooks (all pass-through: original receiver, arguments, return value and
// thrown errors are preserved; observation failures become counted gaps):
//  H1 WKConnection.prototype.rawSend / _dispatchMessage / _onClose
//     (wkConnection.js:35-73). The constructor binds _dispatchMessage and
//     _onClose, so they are wrapped here before any browser launches. The
//     structured message is projected (project.mjs) before the original runs;
//     no raw or truncated debug text is used and pw:protocol stays disabled.
//     Each connection object gets an exact WeakMap identity.
//  H2 client BrowserContext.prototype.close (browserContext.js:422-449):
//     synchronous entry snapshot before request.dispose / runBeforeClose /
//     channel close. The original promise is returned unchanged.
//  H3 client BrowserContext.prototype._onClose (browserContext.js:81,410-418):
//     the public close event, recorded before the original emits it.
//  H4 one client-instrumentation listener on require('playwright-core')
//     ._instrumentation (index.js:41,66-68,235-295; clientInstrumentation.js).
//     Its on* methods only read apiName/type/method and never touch data,
//     userData, stepId or params. It defines no run* methods.
//  H5 once per test, a synchronous callback unshifted onto the existing
//     TestInfo._onDidFinishTestFunctions (testInfo.js:53; index.js:383 does
//     the same), which workerMain.js:321-324 runs before afterEach and fixture
//     teardown. Its snapshot is post-detection and approximate, never an exact
//     timeout instant. Current TestInfo comes from the public test.info().
// document.fonts readiness is UNOBSERVED by design: no page script, binding,
// polling or extra protocol command is added.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { test as pwTest } from '@playwright/test';
import { newConnState, newCounters, projectMessage } from './project.mjs';
import { Tracker } from './tracker.mjs';

const API_ALLOW = /^(browserType\.launch|browser\.(newContext|newPage|close)|browserContext\.(newPage|close)|page\.(goto|reload|close|waitForLoadState))$/;
let installed = null;

const sha256File = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export function installObserver({ runDir, sinkCapBytes }) {
  if (installed) return installed;
  const workerIndex = process.env.TEST_WORKER_INDEX;
  const parallelIndex = process.env.TEST_PARALLEL_INDEX;
  const dir = path.join(runDir, 'observer');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `w${workerIndex}-p${process.pid}.jsonl`);
  const fd = fs.openSync(file, 'wx');
  let seq = 0, bytes = 0, capped = false, closed = false;
  const gaps = Object.create(null);
  const gap = kind => { gaps[kind] = (gaps[kind] ?? 0) + 1; };
  // Synchronous, ordered writes: everything up to the last completed write
  // survives a stalled event loop or a killed worker.
  // `force` (the exit mark only) bypasses the cap so a capped sink still closes positively.
  const write = (rec, force = false) => {
    if (closed) return null;
    const s = ++seq;
    const line = JSON.stringify({ seq: s, mono: process.hrtime.bigint().toString(), t: new Date().toISOString(), ...rec }) + '\n';
    if (capped && !force) { gap('sink-cap-dropped'); return s; }
    // A failed write is a counted gap; the missing seq stays detectable in the sink.
    const put = text => { try { fs.writeSync(fd, text); bytes += text.length; return true; } catch { gap('sink-write-failed'); return false; } };
    if (!force && bytes + line.length > sinkCapBytes) {
      capped = true;
      put(JSON.stringify({ seq: s, mono: process.hrtime.bigint().toString(), ev: 'observer.cap', bytes }) + '\n');
      gap('sink-cap-dropped');
      return s;
    }
    put(line);
    return s;
  };
  const guard = (kind, fn) => { try { return fn(); } catch { gap(kind); return undefined; } };

  // Same module resolution as the stock fixture's require('playwright-core').
  // playwright/lib/index.js requires 'playwright-core' from the playwright
  // package directory; resolving from that package reproduces it exactly.
  const requireFromPw = createRequire(createRequire(import.meta.url).resolve('playwright/package.json'));
  const coreDir = path.dirname(requireFromPw.resolve('playwright-core/package.json'));
  const modFile = rel => fs.realpathSync(path.join(coreDir, rel));
  const files = {
    wkConnection: modFile('lib/server/webkit/wkConnection.js'),
    clientBrowserContext: modFile('lib/client/browserContext.js'),
    coreIndex: fs.realpathSync(requireFromPw.resolve('playwright-core')),
  };
  const hooks = {};
  const identity = {
    workerIndex: workerIndex === undefined ? null : Number(workerIndex),
    parallelIndex: parallelIndex === undefined ? null : Number(parallelIndex),
    pid: process.pid, ppid: process.ppid, node: process.version,
  };
  const installSeq = write({ ev: 'observer.install', ...identity, files: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, { rel: path.relative(path.dirname(coreDir), f), sha256: sha256File(f) }])) });

  const tracker = new Tracker();
  const counters = newCounters();
  const conns = new WeakMap();
  let connSeq = 0;
  const connOf = c => {
    let s = conns.get(c);
    if (!s) { s = { id: `p${process.pid}c${++connSeq}`, state: newConnState() }; conns.set(c, s); write({ ev: 'connection.first-seen', conn: s.id }); }
    return s;
  };

  let currentTest = null; // identity of the test whose API call or hook ran last
  const testIdentity = () => guard('test-info', () => {
    let info;
    try { info = pwTest.info(); } catch { return null; }
    return { info, id: { testId: info.testId, title: info.title, project: info.project?.name ?? null, retry: info.retry, worker: info.workerIndex, file: path.basename(info.file ?? ''), line: info.line } };
  }) ?? null;

  const snapshot = (boundary, extra = {}) => guard('snapshot', () => {
    tracker.drainDone();
    return write({ ev: 'snapshot', boundary, test: currentTest, ...extra, ...tracker.snapshot() });
  });

  const record = (conn, recs) => {
    for (const rec of recs) {
      counters.projected++;
      const s = write({ ...rec, conn: conn.id });
      tracker.apply({ ...rec, conn: conn.id, seq: s });
      if (rec.ev === 'cmd' && rec.m === 'Playwright.deleteContext') snapshot('deleteContext.send', { conn: conn.id, ctx: rec.p?.ctx ?? null, cmdSeq: s });
      if (rec.ev === 'reply' && rec.m === 'Playwright.deleteContext') snapshot('deleteContext.reply', { conn: conn.id, ok: rec.ok, replySeq: s });
    }
    tracker.drainDone();
  };

  // H1 protocol.
  guard('install-H1', () => {
    const { WKConnection } = createRequire(import.meta.url)(files.wkConnection);
    const P = WKConnection.prototype;
    const orig = { rawSend: P.rawSend, dispatch: P._dispatchMessage, onClose: P._onClose };
    if (typeof orig.rawSend !== 'function' || typeof orig.dispatch !== 'function' || typeof orig.onClose !== 'function') throw new Error('shape');
    P.rawSend = function loadwaitRawSend(message) {
      guard('project-send', () => { const c = connOf(this); record(c, projectMessage('send', message, c.state, counters)); });
      return orig.rawSend.apply(this, arguments);
    };
    P._dispatchMessage = function loadwaitDispatch(message) {
      guard('project-recv', () => { const c = connOf(this); record(c, projectMessage('recv', message, c.state, counters)); });
      return orig.dispatch.apply(this, arguments);
    };
    P._onClose = function loadwaitConnClose() {
      guard('connection-close', () => { const c = connOf(this); write({ ev: 'connection.close', conn: c.id }); snapshot('connection.close', { conn: c.id }); });
      return orig.onClose.apply(this, arguments);
    };
    hooks.H1 = 'installed';
  });

  // H2/H3 client context close entry and public close.
  const ctxIds = new WeakMap();
  let ctxSeq = 0;
  const ctxOf = c => { let id = ctxIds.get(c); if (!id) { id = `p${process.pid}x${++ctxSeq}`; ctxIds.set(c, id); } return id; };
  guard('install-H2H3', () => {
    const { BrowserContext } = createRequire(import.meta.url)(files.clientBrowserContext);
    const P = BrowserContext.prototype;
    const origClose = P.close, origOnClose = P._onClose;
    if (typeof origClose !== 'function' || typeof origOnClose !== 'function') throw new Error('shape');
    P.close = function loadwaitContextClose() {
      let entrySeq = null;
      guard('context-close-entry', () => {
        const t = testIdentity();
        if (t) currentTest = t.id;
        entrySeq = snapshot('context.close.entry', { clientCtx: ctxOf(this), closingStatusBefore: typeof this._closingStatus === 'string' ? this._closingStatus : null, test: t?.id ?? null });
      });
      const result = origClose.apply(this, arguments);
      guard('context-close-settle', () => {
        if (result && typeof result.then === 'function') {
          result.then(
            () => guard('context-close-end', () => write({ ev: 'context.close.end', clientCtx: ctxOf(this), entrySeq, ok: true })),
            e => guard('context-close-end', () => write({ ev: 'context.close.end', clientCtx: ctxOf(this), entrySeq, ok: false, errorName: typeof e?.name === 'string' ? e.name.slice(0, 40) : null })),
          );
        }
      });
      return result;
    };
    P._onClose = function loadwaitContextPublicClose() {
      guard('context-public-close', () => { write({ ev: 'context.public.close', clientCtx: ctxOf(this) }); snapshot('context.public.close', { clientCtx: ctxOf(this) }); });
      return origOnClose.apply(this, arguments);
    };
    hooks.H2 = 'installed';
    hooks.H3 = 'installed';
  });

  // H4/H5 client instrumentation and the pre-after-hooks boundary.
  const registered = new WeakSet();
  const apiSeqs = new WeakMap();
  guard('install-H4', () => {
    const playwright = requireFromPw('playwright-core');
    const instrumentation = playwright._instrumentation;
    if (!instrumentation || typeof instrumentation.addListener !== 'function') throw new Error('shape');
    const register = t => {
      if (!t || registered.has(t.info)) return;
      const list = t.info._onDidFinishTestFunctions;
      if (!Array.isArray(list)) { gap('h5-shape'); return; }
      registered.add(t.info);
      const id = t.id, info = t.info;
      const fn = () => {
        guard('h5-callback', () => {
          currentTest = id;
          snapshot('test.functions.finished', {
            approximate: 'post-detection; after the test body settled or its deadline was detected, before afterEach and fixture teardown',
            status: typeof info.status === 'string' ? info.status : null, expectedStatus: info.expectedStatus ?? null,
            durationMs: typeof info.duration === 'number' ? info.duration : null, errorCount: Array.isArray(info.errors) ? info.errors.length : null,
            hookIndex: list.indexOf(fn), hookCount: list.length,
          });
        });
      };
      list.unshift(fn);
      write({ ev: 'test.registered', test: id });
      hooks.H5 = 'registered';
    };
    instrumentation.addListener({
      onApiCallBegin(data, channel) {
        guard('api-begin', () => {
          const t = testIdentity();
          if (t) { currentTest = t.id; register(t); }
          const api = typeof data?.apiName === 'string' ? data.apiName : '';
          if (!API_ALLOW.test(api)) return;
          apiSeqs.set(data, write({ ev: 'api.begin', api, ch: `${channel?.type ?? ''}.${channel?.method ?? ''}`.slice(0, 80), test: t?.id ?? null }));
        });
      },
      onApiCallEnd(data) {
        guard('api-end', () => {
          const begin = apiSeqs.get(data);
          if (begin === undefined) return;
          const e = data.error;
          write({ ev: 'api.end', api: String(data.apiName).slice(0, 80), beginSeq: begin, ok: !e, errorName: e && typeof e.name === 'string' ? e.name.slice(0, 40) : null });
        });
      },
    });
    hooks.H4 = 'installed';
  });

  write({ ev: 'observer.hooks', hooks, installSeq, gaps: { ...gaps } });
  process.on('exit', code => {
    try {
      snapshot('observer.exit');
      write({ ev: 'observer.exit', code, counters, gaps, hooks, bytes, capped, anomalies: tracker.anomalies }, true);
      closed = true;
      fs.fsyncSync(fd);
      fs.closeSync(fd);
    } catch { /* nothing else is possible at exit; absence of observer.exit marks the sink incomplete */ }
  });
  installed = { file, hooks };
  return installed;
}
