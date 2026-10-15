// Issue #161 load-wait: runs the unchanged scripts/serve-root.mjs (or, with
// LOADWAIT_SERVER=control, control-server.mjs) in this process and observes it
// passively through node:diagnostics_channel, following the continuation
// serve-logged pattern but without user agent or any header capture.
//
// Passivity: it adds no server 'request', 'clientError' or 'error' listener and
// no uncaughtException/unhandledRejection handler, so responses, errors and
// crash behaviour remain the server's own. It adds only passive 'close'
// listeners on sockets and responses. Every observation path (channel
// callbacks, close listeners, the uncaughtExceptionMonitor and exit marks)
// runs inside a guard: serialization or write failure is never thrown into the
// server. Each record carries a consecutive `seq`; a failed write leaves a gap
// in seq, and analysis treats a gap, a missing ready/final probe or an
// unwritable log as an INCOMPLETE server observation. Opening the log is the
// only unguarded step and refuses startup before anything is served.
// Request and socket ids are server-local counters; nothing is added on the
// wire. Paths are sanitized with the collector's URL projection; only the
// runner's own `loadwait-probe` query value is recorded, to prove liveness.
// Env: PORT, LOADWAIT_SERVER_LOG (new file, created exclusively),
// LOADWAIT_SERVER_FAULT=write-fail-after:<n> (server-fault sensitivity mode
// only; run.mjs never sets it for control or faithful runs).
import fs from 'node:fs';
import path from 'node:path';
import dc from 'node:diagnostics_channel';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { PROBE_QUERY_KEY, sanitizeUrl } from './project.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const fd = fs.openSync(process.env.LOADWAIT_SERVER_LOG, 'wx');
const port = Number(process.env.PORT);
const fault = process.env.LOADWAIT_SERVER_FAULT?.match(/^write-fail-after:(\d+)$/);
const failAfter = fault ? Number(fault[1]) : Infinity;

let seq = 0, writeFailures = 0;
const w = rec => {
  const s = ++seq;
  try {
    if (s > failAfter) throw new Error('injected write failure');
    fs.writeSync(fd, JSON.stringify({ seq: s, t: new Date().toISOString(), mono: process.hrtime.bigint().toString(), ...rec }) + '\n');
  } catch { writeFailures++; }
};
const guard = fn => (...a) => { try { fn(...a); } catch { writeFailures++; } };

const probeOf = rawUrl => {
  const m = typeof rawUrl === 'string' && rawUrl.match(new RegExp(`[?&]${PROBE_QUERY_KEY}=([A-Za-z0-9._-]{1,120})(?:&|$)`));
  return m ? m[1] : undefined;
};

let sockSeq = 0, reqSeq = 0;
const sockIds = new WeakMap();
const reqIds = new WeakMap();
dc.subscribe('net.server.socket', guard(({ socket }) => {
  const id = ++sockSeq;
  sockIds.set(socket, id);
  w({ ev: 'socket.open', sock: id });
  socket.once('close', guard(hadError => w({ ev: 'socket.close', sock: id, hadError, bytesRead: socket.bytesRead, bytesWritten: socket.bytesWritten })));
}));
dc.subscribe('http.server.request.start', guard(({ request, response, socket }) => {
  const id = ++reqSeq;
  reqIds.set(request, id);
  const sock = sockIds.get(socket) ?? null;
  w({ ev: 'request.start', req: id, sock, method: /^[A-Z]{1,10}$/.test(request.method) ? request.method : 'other', url: sanitizeUrl(`http://127.0.0.1:${port}${request.url}`), probe: probeOf(request.url) });
  response.once('close', guard(() => w({ ev: 'response.close', req: id, sock, finished: response.writableFinished, headersSent: response.headersSent, status: response.statusCode })));
}));
dc.subscribe('http.server.response.finish', guard(({ request, response, socket }) => {
  w({ ev: 'response.finish', req: reqIds.get(request) ?? null, sock: sockIds.get(socket) ?? null, status: response.statusCode });
}));
process.on('uncaughtExceptionMonitor', guard((error, origin) => w({ ev: 'uncaught', origin: String(origin).slice(0, 40), errorName: typeof error?.name === 'string' ? error.name.slice(0, 40) : typeof error })));
process.on('exit', guard(code => w({ ev: 'exit', code, writeFailures })));
const target = process.env.LOADWAIT_SERVER === 'control' ? path.join(HERE, 'control-server.mjs') : path.join(REPO, 'scripts', 'serve-root.mjs');
w({ ev: 'observer.ready', node: process.version, pid: process.pid, port, server: path.relative(REPO, target), faultInjected: Number.isFinite(failAfter) ? failAfter : null });

await import(pathToFileURL(target).href);
