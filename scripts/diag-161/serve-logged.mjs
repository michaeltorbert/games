// Issue #161 diagnostic server. It imports the unchanged scripts/serve-root.mjs
// and only observes it, so responses, the default 400 clientError reply and the
// default unhandled-rejection crash all stay Node's own behavior.
//
// Observation source (DIAG161_SERVER_OBSERVE):
//   dc   (default) node:diagnostics_channel `net.server.socket` and
//        `http.server.request.start`; preflight verifies events actually arrive.
//   wrap fallback: wrap http.createServer and add passive `connection` and
//        `request` listeners. No `clientError` listener is ever added, because
//        any listener replaces Node's default 400-and-destroy handling.
// Only passive `close`/`finish` listeners are attached to sockets and responses.
import fs from 'node:fs';
import http from 'node:http';
import dc from 'node:diagnostics_channel';
import { syncBuiltinESMExports } from 'node:module';

const LOG = process.env.DIAG161_SERVER_LOG;
const MODE = process.env.DIAG161_SERVER_OBSERVE || 'dc';
if (!LOG) throw new Error('DIAG161_SERVER_LOG is required');
if (!['dc', 'wrap'].includes(MODE)) throw new Error(`DIAG161_SERVER_OBSERVE must be dc or wrap, got ${MODE}`);

// Synchronous append keeps lines across a crash; cost is one write per event.
const fd = fs.openSync(LOG, 'a');
const log = (ev, data = {}) => fs.writeSync(fd, JSON.stringify({
  t: new Date().toISOString(), mono: process.hrtime.bigint().toString(), pid: process.pid, ev, ...data,
}) + '\n');

const socketIds = new WeakMap();
const seenServers = new WeakSet();
let nextSocket = 0;
let nextRequest = 0;
const socketId = socket => {
  if (!socket) return null;
  let id = socketIds.get(socket);
  if (id === undefined) { id = ++nextSocket; socketIds.set(socket, id); }
  return id;
};

function onSocket(socket) {
  const id = socketId(socket);
  log('socket.open', { socket: id, remoteAddress: socket.remoteAddress, remotePort: socket.remotePort });
  socket.once('close', hadError => log('socket.close', {
    socket: id, hadError, bytesRead: socket.bytesRead, bytesWritten: socket.bytesWritten,
  }));
}

function onServer(server) {
  if (!server || seenServers.has(server)) return;
  seenServers.add(server);
  log('server.seen', {
    address: server.address(), keepAliveTimeout: server.keepAliveTimeout,
    headersTimeout: server.headersTimeout, requestTimeout: server.requestTimeout,
  });
  server.once('close', () => log('server.close'));
}

function onRequest(req, res, socket, server) {
  onServer(server);
  const id = ++nextRequest;
  const sid = socketId(socket);
  const ua = req.headers['user-agent'] ?? null;
  log('req.start', {
    req: id, socket: sid, method: req.method, url: req.url, httpVersion: req.httpVersion,
    ua, probe: typeof ua === 'string' && ua.startsWith('diag-161-health-probe'),
  });
  res.once('finish', () => log('res.finish', {
    req: id, socket: sid, status: res.statusCode, contentType: res.getHeader('content-type') ?? null,
  }));
  res.once('close', () => log('res.close', { req: id, socket: sid, finished: res.writableFinished }));
}

if (MODE === 'dc') {
  dc.subscribe('net.server.socket', ({ socket }) => onSocket(socket));
  dc.subscribe('http.server.request.start', ({ request, response, socket, server }) => onRequest(request, response, socket, server));
} else {
  const createServer = http.createServer;
  http.createServer = function (...args) {
    const server = createServer.apply(this, args);
    server.on('connection', onSocket);
    server.on('request', (req, res) => onRequest(req, res, req.socket, server));
    return server;
  };
  syncBuiltinESMExports();
}

// Monitor only: unlike an `unhandledRejection` or `uncaughtException`
// listener, this does not prevent Node's default crash.
process.on('uncaughtExceptionMonitor', (error, origin) => log('process.uncaughtExceptionMonitor', {
  origin, error: String(error?.stack || error),
}));
process.on('exit', code => log('process.exit', { code }));

log('startup', { mode: MODE, node: process.version, port: process.env.PORT ?? null, argv: process.argv, ppid: process.ppid, cwd: process.cwd() });
await import('../serve-root.mjs');
log('serve-root.imported');
