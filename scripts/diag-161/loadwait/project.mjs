// Issue #161 load-wait: pure, allowlist-only projection of structured WebKit
// protocol messages. Nothing here touches Playwright, the file system or the
// network. Every projected record is built field by field from an allowlist;
// no header, cookie, body, post data, initiator, certificate, user agent or
// error text is ever copied. URLs are reduced to a class plus sanitized parts.
import crypto from 'node:crypto';

export const APP_PORT = 8090;
export const CONTROL_PORT = 8094;
export const PROBE_QUERY_KEY = 'loadwait-probe';

// Nested payloads up to this size are parsed (a second, bounded in-memory
// parse; Playwright parses them too, wkPage.js:329-336). Larger payloads are
// never parsed or classified: a substring cannot prove a top-level method or
// id, so every oversized payload counts as possibly relevant collection loss
// (innerOversizedSkipped), which makes the sink INCOMPLETE. The limit is sized
// to stay above ordinary protocol traffic, including failure-screenshot
// replies, so routine runs are not made incomplete by them.
export const INNER_PARSE_LIMIT = 16 * 1024 * 1024;

const shortHash = text => crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 12);
const SAFE_PATH = /^\/[A-Za-z0-9._~\-/]*$/;
const SAFE_KEY = /^[A-Za-z0-9._\-]{1,40}$/;
const SAFE_TOKEN = /^[A-Za-z0-9._:/+\-]{1,80}$/;
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const int = v => (Number.isInteger(v) ? v : undefined);
const bool = v => (typeof v === 'boolean' ? v : undefined);
const token = v => (typeof v === 'string' && SAFE_TOKEN.test(v) ? v : v === undefined || v === null ? undefined : `<redacted:${shortHash(v)}>`);
// Protocol identifiers (request/frame/loader/target/context ids) are opaque
// browser-local tokens; anything outside the expected shape is hashed.
const id = v => (typeof v === 'number' ? v : token(v));

function compact(obj) {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj;
}

// URL -> { cls, ... }. Local paths are kept only when they match SAFE_PATH;
// query values are never kept (key names that look safe plus a hash for
// equality). External URLs keep only scheme and host plus a path hash.
export function sanitizeUrl(raw) {
  if (typeof raw !== 'string') return { cls: 'none' };
  if (raw.startsWith('data:')) return { cls: 'data' };
  if (raw.startsWith('about:')) return { cls: 'about', path: raw === 'about:blank' ? 'about:blank' : undefined };
  if (raw.startsWith('blob:')) return { cls: 'blob' };
  let u;
  try { u = new URL(raw); } catch { return { cls: 'invalid', h: shortHash(raw) }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { cls: 'other-scheme', scheme: u.protocol.replace(/[^a-z0-9+.-]/g, '') };
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
  const userinfo = !!(u.username || u.password) || undefined;
  const frag = u.hash ? true : undefined;
  if (!loopback) return compact({ cls: 'external', scheme: u.protocol.slice(0, -1), host: /^[A-Za-z0-9.-]{1,253}$/.test(u.hostname) ? u.hostname : `<redacted:${shortHash(u.hostname)}>`, ph: shortHash(u.pathname), userinfo, frag, query: u.search ? true : undefined });
  const cls = port === APP_PORT ? 'local-app' : port === CONTROL_PORT ? 'local-control' : 'local-other';
  const out = { cls, port: cls === 'local-other' ? port : undefined, userinfo, frag };
  out.path = SAFE_PATH.test(u.pathname) && u.pathname.length <= 200 ? u.pathname : `<redacted:${shortHash(u.pathname)}>`;
  if (u.search) {
    const keys = [...new Set([...u.searchParams.keys()])].slice(0, 8);
    out.qk = keys.map(k => (SAFE_KEY.test(k) ? k : `<redacted:${shortHash(k)}>`));
    out.qh = shortHash(u.search);
  }
  return compact(out);
}

// Canonical string for equality/grouping of sanitized URLs (never the raw URL).
export const urlKey = s => (s ? [s.cls, s.port ?? '', s.host ?? '', s.path ?? s.ph ?? '', s.qh ?? ''].join('|') : 'none');

// Free text (error strings) is classified, never stored.
export function classifyError(text) {
  if (typeof text !== 'string' || !text) return { cls: 'none' };
  const t = text.toLowerCase();
  const cls = /cancel/.test(t) ? 'cancelled'
    : /timed? ?out|timeout/.test(t) ? 'timeout'
      : /refused|could not connect/.test(t) ? 'connection-refused'
        : /reset|lost|closed|network connection/.test(t) ? 'connection-lost'
          : /204 no content/.test(t) ? 'aborted-204'
            : /access control|cors|blocked|not allowed/.test(t) ? 'blocked'
              : /hostname|server with the specified|dns/.test(t) ? 'host-not-found'
                : /target closed|has been closed|browser has been closed/.test(t) ? 'target-closed'
                  : 'other';
  return { cls, len: text.length };
}

const numbersOnly = obj => {
  if (!obj || typeof obj !== 'object') return undefined;
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (SAFE_KEY.test(k) && num(v) !== undefined) out[k] = v;
  return Object.keys(out).length ? out : undefined;
};

// Event projections: method -> params -> projected fields.
const EVENTS = {
  'Network.requestWillBeSent': p => compact({
    rid: id(p.requestId), frame: id(p.frameId), loader: id(p.loaderId), type: token(p.type), ts: num(p.timestamp), wall: num(p.walltime),
    url: sanitizeUrl(p.request?.url), method: token(p.request?.method),
    redirect: p.redirectResponse ? compact({ status: int(p.redirectResponse.status), url: sanitizeUrl(p.redirectResponse.url) }) : undefined,
  }),
  'Network.responseReceived': p => compact({
    rid: id(p.requestId), frame: id(p.frameId), loader: id(p.loaderId), type: token(p.type), ts: num(p.timestamp),
    status: int(p.response?.status), source: token(p.response?.source), mime: token(p.response?.mimeType), url: sanitizeUrl(p.response?.url),
    timing: numbersOnly(p.response?.timing),
  }),
  'Network.loadingFinished': p => compact({
    rid: id(p.requestId), ts: num(p.timestamp),
    bodyBytes: num(p.metrics?.responseBodyBytesReceived), headerBytes: num(p.metrics?.responseHeaderBytesReceived), protocol: token(p.metrics?.protocol),
  }),
  'Network.loadingFailed': p => compact({ rid: id(p.requestId), ts: num(p.timestamp), canceled: bool(p.canceled), error: classifyError(p.errorText) }),
  'Network.requestServedFromMemoryCache': p => compact({
    rid: id(p.requestId), frame: id(p.frameId), loader: id(p.loaderId), ts: num(p.timestamp), url: sanitizeUrl(p.resource?.url), status: int(p.resource?.status),
  }),
  'Page.domContentEventFired': p => compact({ frame: id(p.frameId), ts: num(p.timestamp) }),
  'Page.loadEventFired': p => compact({ frame: id(p.frameId), ts: num(p.timestamp) }),
  'Page.frameNavigated': p => compact({ frame: id(p.frame?.id), parent: id(p.frame?.parentId), loader: id(p.frame?.loaderId), url: sanitizeUrl(p.frame?.url) }),
  'Page.frameStartedLoading': p => compact({ frame: id(p.frameId) }),
  'Page.frameStoppedLoading': p => compact({ frame: id(p.frameId) }),
  'Page.frameDetached': p => compact({ frame: id(p.frameId) }),
  'Target.targetCreated': p => compact({ tgt: id(p.targetInfo?.targetId), type: token(p.targetInfo?.type), provisional: bool(p.targetInfo?.isProvisional), paused: bool(p.targetInfo?.isPaused) }),
  'Target.targetDestroyed': p => compact({ tgt: id(p.targetId), crashed: bool(p.crashed) }),
  'Target.didCommitProvisionalTarget': p => compact({ oldTgt: id(p.oldTargetId), newTgt: id(p.newTargetId) }),
  'Playwright.pageProxyCreated': p => compact({
    pp: id(p.pageProxyInfo?.pageProxyId ?? p.pageProxyId), ctx: id(p.pageProxyInfo?.browserContextId ?? p.browserContextId), opener: id(p.pageProxyInfo?.openerId ?? p.openerId),
  }),
  'Playwright.pageProxyDestroyed': p => compact({ pp: id(p.pageProxyId) }),
  'Playwright.provisionalLoadFailed': p => compact({ pp: id(p.pageProxyId), loader: id(p.loaderId), error: classifyError(p.error) }),
};

// Commands whose send and reply are recorded (params projected, never raw).
const COMMANDS = {
  'Playwright.createContext': () => ({}),
  'Playwright.deleteContext': p => compact({ ctx: id(p?.browserContextId) }),
  'Playwright.createPage': p => compact({ ctx: id(p?.browserContextId) }),
  'Playwright.navigate': p => compact({ url: sanitizeUrl(p?.url), frame: id(p?.frameId), pp: id(p?.pageProxyId) }),
  'Playwright.close': () => ({}),
  'Page.navigate': p => compact({ url: sanitizeUrl(p?.url), frame: id(p?.frameId) }),
  'Page.reload': () => ({}),
  'Page.stopLoading': () => ({}),
};
const REPLIES = {
  'Playwright.createContext': r => compact({ ctx: id(r?.browserContextId) }),
  'Playwright.createPage': r => compact({ pp: id(r?.pageProxyId) }),
};

export const isTrackedEvent = method => Object.hasOwn(EVENTS, method);
export const isTrackedCommand = method => Object.hasOwn(COMMANDS, method);

const METHOD_RE = /^[A-Za-z]{1,40}\.[A-Za-z]{1,60}$/;
const methodName = m => (typeof m === 'string' && METHOD_RE.test(m) ? m : 'unknown');

// Oversized nested payloads are skipped unparsed and always counted as loss.
function decodeNested(text, counters) {
  if (typeof text !== 'string') { counters.innerNotString++; return null; }
  if (text.length > INNER_PARSE_LIMIT) { counters.innerOversizedSkipped++; counters.innerOversizedSkippedBytes += text.length; return null; }
  try { return JSON.parse(text); } catch { counters.innerParseError++; return null; }
}

export const newCounters = () => ({
  sent: 0, received: 0, projected: 0, innerNotString: 0, innerParseError: 0,
  innerOversizedSkipped: 0, innerOversizedSkippedBytes: 0,
  malformedIdentity: 0, byMethod: Object.create(null),
});

// Counters that mean possibly relevant protocol data was not observed.
export const LOSS_COUNTERS = ['innerNotString', 'innerParseError', 'innerOversizedSkipped', 'malformedIdentity'];

// Per-connection state needed to project replies: outer and inner command ids
// we chose to record. Ids are scoped by (pageProxyId, targetId) for inner ones.
export function newConnState() {
  return { outer: new Map(), inner: new Map() };
}

const innerKey = (pp, tgt, cid) => `${pp ?? ''}|${tgt ?? ''}|${cid}`;
const count = (counters, dir, method) => { const k = `${dir} ${method}`; counters.byMethod[k] = (counters.byMethod[k] ?? 0) + 1; };

// Project one structured message. Returns an array of records (possibly empty).
// `dir` is 'send' or 'recv'. The message object is only read, never modified.
export function projectMessage(dir, message, conn, counters) {
  const out = [];
  if (!message || typeof message !== 'object') return out;
  counters[dir === 'send' ? 'sent' : 'received']++;
  const pp = id(message.pageProxyId);
  const outerMethod = message.method === undefined ? undefined : methodName(message.method);

  const event = (nestedFlag, tgt, m, params) => {
    const p = EVENTS[m](params ?? {});
    // Request identity must be a plain protocol id; nested events need a target.
    if ((m.startsWith('Network.') && (p.rid === undefined || String(p.rid).startsWith('<redacted'))) || (nestedFlag && tgt === undefined)) counters.malformedIdentity++;
    return compact({ ev: 'evt', nested: nestedFlag || undefined, pp, tgt, m, p });
  };

  if (dir === 'send') {
    if (outerMethod === 'Target.sendMessageToTarget') {
      const tgt = id(message.params?.targetId);
      const inner = decodeNested(message.params?.message, counters);
      const im = inner ? methodName(inner.method) : 'unparsed';
      count(counters, 'send>', im);
      if (inner && isTrackedCommand(im)) {
        const p = COMMANDS[im](inner.params);
        conn.inner.set(innerKey(pp, tgt, inner.id), { m: im, p });
        out.push(compact({ ev: 'cmd', dir: 'send', nested: true, pp, tgt, cid: int(inner.id), m: im, p }));
      }
      return out;
    }
    count(counters, 'send', outerMethod ?? 'reply');
    if (outerMethod && isTrackedCommand(outerMethod)) {
      const p = COMMANDS[outerMethod](message.params);
      // The command's projected params travel with its id, so the reply is
      // correlated exactly by (connection, command id), never by order.
      conn.outer.set(message.id, { m: outerMethod, p });
      out.push(compact({ ev: 'cmd', dir: 'send', pp, cid: int(message.id), m: outerMethod, p }));
    }
    return out;
  }

  // recv
  if (outerMethod === 'Target.dispatchMessageFromTarget') {
    const tgt = id(message.params?.targetId);
    const inner = decodeNested(message.params?.message, counters);
    if (!inner) { count(counters, 'recv>', 'unparsed'); return out; }
    if (inner.method !== undefined) {
      const im = methodName(inner.method);
      count(counters, 'recv>', im);
      if (isTrackedEvent(im)) out.push(event(true, tgt, im, inner.params));
      return out;
    }
    count(counters, 'recv>', 'reply');
    const k = innerKey(pp, tgt, inner.id);
    const cmd = conn.inner.get(k);
    if (cmd) {
      conn.inner.delete(k);
      out.push(compact({ ev: 'reply', nested: true, pp, tgt, cid: int(inner.id), m: cmd.m, cmdP: cmd.p, ok: !inner.error, error: inner.error ? classifyError(inner.error.message) : undefined }));
    }
    return out;
  }
  if (outerMethod !== undefined) {
    count(counters, 'recv', outerMethod);
    if (isTrackedEvent(outerMethod)) out.push(event(false, undefined, outerMethod, message.params));
    return out;
  }
  count(counters, 'recv', 'reply');
  if (message.id === -9999) { out.push({ ev: 'reply', cid: -9999, m: 'Playwright.close', ok: !message.error, note: 'browser-close-control-reply' }); return out; }
  const cmd = conn.outer.get(message.id);
  if (cmd) {
    conn.outer.delete(message.id);
    out.push(compact({ ev: 'reply', pp, cid: int(message.id), m: cmd.m, cmdP: cmd.p, ok: !message.error, error: message.error ? classifyError(message.error.message) : undefined, p: !message.error && REPLIES[cmd.m] ? REPLIES[cmd.m](message.result) : undefined }));
  }
  return out;
}

// Keys that must never appear in any collector record (checked by analysis).
export const FORBIDDEN_KEYS = ['headers', 'requestHeaders', 'responseHeaders', 'cookie', 'cookies', 'set-cookie', 'postData', 'body', 'userAgent', 'user-agent', 'errorText', 'message', 'stack', 'initiator', 'security', 'certificate', 'remoteAddress', 'params'];
