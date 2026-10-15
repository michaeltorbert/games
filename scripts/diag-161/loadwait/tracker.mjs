// Issue #161 load-wait: pure request/lifecycle state over projected protocol
// records (project.mjs). Used live by the worker observer to take pending
// snapshots at boundaries, and offline by analysis to replay a sink.
//
// Identity: a request is (conn, pageProxyId, targetId, requestId, hop). WebKit
// reuses requestId across redirects (wkPage.js:959-991 closes the old hop
// before starting the new one), so each redirect increments `hop`. A response
// record means headers were received, not that the body finished; only
// loadingFinished / loadingFailed / memory-cache are terminal. Requests left on
// a destroyed or swapped target are marked `target-gone` (inferred, not a
// protocol terminal), never silently dropped.
import { urlKey } from './project.mjs';

const TERMINAL = new Set(['finished', 'failed', 'redirected', 'memory-cache', 'target-gone', 'superseded']);
export const SNAPSHOT_LIMIT = 300;

export class Tracker {
  constructor() {
    this.requests = new Map(); // key -> current hop
    this.done = [];            // terminal hops, bounded by caller via drainDone()
    this.pages = new Map();    // conn|pp -> page
    this.contexts = new Map(); // conn|ctx -> context
    this.anomalies = [];
  }

  static reqKey(conn, pp, tgt, rid) { return `${conn}|${pp ?? ''}|${tgt ?? ''}|${rid}`; }

  page(conn, pp) {
    const k = `${conn}|${pp ?? ''}`;
    let p = this.pages.get(k);
    if (!p) { p = { conn, pp, ctx: null, mainFrame: null, nav: null, targets: new Set(), closed: false }; this.pages.set(k, p); }
    return p;
  }

  // Every anomaly is counted (anomalyCount); only the first 200 are itemized.
  anomaly(kind, rec) {
    this.anomalyCount = (this.anomalyCount ?? 0) + 1;
    if (this.anomalies.length < 200) this.anomalies.push({ kind, seq: rec.seq ?? null, m: rec.m ?? null });
  }

  finish(req, state, rec, extra = {}) {
    Object.assign(req, { state, endSeq: rec.seq ?? null, endMono: rec.mono ?? null, endTs: rec.p?.ts ?? null, ...extra });
    this.requests.delete(req.key);
    this.done.push(req);
  }

  apply(rec) {
    const { conn } = rec;
    if (rec.ev === 'cmd' && rec.dir === 'send') {
      if (rec.m === 'Playwright.deleteContext' && rec.p?.ctx !== undefined) {
        const c = this.contexts.get(`${conn}|${rec.p.ctx}`) ?? { conn, ctx: rec.p.ctx, created: false };
        c.state = 'deleting'; c.deleteSeq = rec.seq ?? null;
        this.contexts.set(`${conn}|${rec.p.ctx}`, c);
      }
      return;
    }
    if (rec.ev === 'reply') {
      if (rec.m === 'Playwright.createContext' && rec.ok && rec.p?.ctx !== undefined) {
        this.contexts.set(`${conn}|${rec.p.ctx}`, { conn, ctx: rec.p.ctx, created: true, state: 'open', createSeq: rec.seq ?? null });
      }
      if (rec.m === 'Playwright.deleteContext') {
        // Exact: the reply carries its own command's projected browserContextId (conn + cid).
        const c = rec.cmdP?.ctx === undefined ? null : this.contexts.get(`${conn}|${rec.cmdP.ctx}`);
        if (!c || c.state !== 'deleting') { this.anomaly('delete-reply-without-deleting-context', rec); return; }
        c.acked = rec.ok ? 'ok' : 'error'; c.state = rec.ok ? 'deleted' : 'delete-error'; c.replySeq = rec.seq ?? null;
      }
      return;
    }
    if (rec.ev !== 'evt') return;
    const p = rec.p ?? {};
    if (rec.m?.startsWith('Network.') && (p.rid === undefined || String(p.rid).startsWith('<redacted'))) { this.anomaly('malformed-identity', rec); return; }
    switch (rec.m) {
      case 'Playwright.pageProxyCreated': { const pg = this.page(conn, p.pp ?? rec.pp); pg.ctx = p.ctx ?? null; return; }
      case 'Playwright.pageProxyDestroyed': { const pg = this.page(conn, p.pp ?? rec.pp); pg.closed = true; this.dropTarget(conn, p.pp ?? rec.pp, null, rec, 'page-proxy-destroyed'); return; }
      case 'Target.targetCreated': { this.page(conn, rec.pp).targets.add(p.tgt); return; }
      case 'Target.targetDestroyed': { this.dropTarget(conn, rec.pp, p.tgt, rec, 'target-destroyed'); return; }
      case 'Target.didCommitProvisionalTarget': {
        // Process swap. The navigation request continues on the new target under a
        // new requestId (wkPage.js:939-948); the old-target hop is left as
        // target-gone when the old target is destroyed. Any link is inferred.
        const pg = this.page(conn, rec.pp);
        pg.swaps = (pg.swaps ?? 0) + 1;
        return;
      }
      case 'Page.frameNavigated': {
        if (p.parent !== undefined) return;
        const pg = this.page(conn, rec.pp);
        pg.mainFrame = p.frame ?? null;
        pg.nav = { tgt: rec.tgt ?? null, loader: p.loader ?? null, url: p.url ?? null, navSeq: rec.seq ?? null, dcl: null, load: null };
        return;
      }
      case 'Page.domContentEventFired':
      case 'Page.loadEventFired': {
        const pg = this.page(conn, rec.pp);
        if (!pg.nav || (pg.mainFrame !== null && p.frame !== undefined && p.frame !== pg.mainFrame)) return;
        pg.nav[rec.m === 'Page.loadEventFired' ? 'load' : 'dcl'] = { ts: p.ts ?? null, seq: rec.seq ?? null, mono: rec.mono ?? null };
        return;
      }
      case 'Network.requestWillBeSent': {
        const key = Tracker.reqKey(conn, rec.pp, rec.tgt, p.rid);
        const prev = this.requests.get(key);
        let hop = 0;
        if (prev) {
          if (p.redirect) { hop = prev.hop + 1; this.finish(prev, 'redirected', rec, { redirectStatus: p.redirect.status ?? null }); }
          else { this.anomaly('request-reused-without-redirect', rec); this.finish(prev, 'superseded', rec); hop = prev.hop + 1; }
        } else if (p.redirect) this.anomaly('redirect-without-prior-hop', rec);
        this.requests.set(key, {
          key, conn, pp: rec.pp ?? null, tgt: rec.tgt ?? null, rid: p.rid, hop, state: 'sent', url: p.url ?? null, urlKey: urlKey(p.url), type: p.type ?? null,
          frame: p.frame ?? null, loader: p.loader ?? null, method: p.method ?? null, sentTs: p.ts ?? null, sentSeq: rec.seq ?? null, sentMono: rec.mono ?? null,
        });
        return;
      }
      case 'Network.responseReceived': {
        const req = this.requests.get(Tracker.reqKey(conn, rec.pp, rec.tgt, p.rid));
        if (!req) { this.anomaly('response-without-request', rec); return; }
        Object.assign(req, { state: 'headers', status: p.status ?? null, source: p.source ?? null, respTs: p.ts ?? null, respSeq: rec.seq ?? null });
        return;
      }
      case 'Network.loadingFinished':
      case 'Network.loadingFailed':
      case 'Network.requestServedFromMemoryCache': {
        const req = this.requests.get(Tracker.reqKey(conn, rec.pp, rec.tgt, p.rid));
        if (!req) {
          if (rec.m === 'Network.requestServedFromMemoryCache') {
            this.done.push({ key: Tracker.reqKey(conn, rec.pp, rec.tgt, p.rid), conn, pp: rec.pp ?? null, tgt: rec.tgt ?? null, rid: p.rid, hop: 0, state: 'memory-cache', url: p.url ?? null, urlKey: urlKey(p.url), status: p.status ?? null, endSeq: rec.seq ?? null });
          } else this.anomaly('terminal-without-request', rec);
          return;
        }
        if (rec.m === 'Network.loadingFinished') this.finish(req, 'finished', rec, { bodyBytes: p.bodyBytes ?? null });
        else if (rec.m === 'Network.loadingFailed') this.finish(req, 'failed', rec, { canceled: p.canceled ?? null, errorCls: p.error?.cls ?? null, hadHeaders: req.state === 'headers' });
        else this.finish(req, 'memory-cache', rec);
        return;
      }
      default:
    }
  }

  dropTarget(conn, pp, tgt, rec, reason) {
    for (const req of [...this.requests.values()]) {
      if (req.conn === conn && req.pp === (pp ?? null) && (tgt === null || req.tgt === tgt)) this.finish(req, 'target-gone', rec, { goneReason: reason, hadHeaders: req.state === 'headers' });
    }
  }

  pendingList() {
    return [...this.requests.values()].filter(r => !TERMINAL.has(r.state));
  }

  // Bounded, serializable snapshot of everything still outstanding.
  snapshot() {
    const pending = this.pendingList();
    const pages = [...this.pages.values()].filter(p => !p.closed).map(p => ({
      conn: p.conn, pp: p.pp, ctx: p.ctx, mainFrame: p.mainFrame, swaps: p.swaps ?? 0,
      nav: p.nav ? { loader: p.nav.loader, url: p.nav.url, dcl: !!p.nav.dcl, load: !!p.nav.load, dclTs: p.nav.dcl?.ts ?? null, loadTs: p.nav.load?.ts ?? null } : null,
    }));
    const contexts = [...this.contexts.values()].filter(c => c.state !== 'deleted').map(c => ({ conn: c.conn, ctx: c.ctx, state: c.state, created: c.created }));
    return {
      pendingCount: pending.length,
      anomaliesSoFar: this.anomalyCount ?? 0,
      truncated: Math.max(0, pending.length - SNAPSHOT_LIMIT),
      pending: pending.slice(0, SNAPSHOT_LIMIT).map(r => ({
        conn: r.conn, pp: r.pp, tgt: r.tgt, rid: r.rid, hop: r.hop, state: r.state, url: r.url, type: r.type, frame: r.frame, loader: r.loader,
        status: r.status ?? null, sentSeq: r.sentSeq, respSeq: r.respSeq ?? null, sentTs: r.sentTs, respTs: r.respTs ?? null,
      })),
      pages, contexts,
    };
  }

  drainDone() { const d = this.done; this.done = []; return d; }
}
