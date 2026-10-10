// Runs the unchanged scripts/serve-root.mjs in this process and observes it
// passively through node:diagnostics_channel. It adds no server 'request',
// 'clientError', 'error', 'uncaughtException' or 'unhandledRejection'
// listener, so serve-root's responses and crash behaviour stay its own; it adds
// only per-socket 'close' listeners to read byte counts, and observes crashes
// through 'uncaughtExceptionMonitor'. Liveness is proven by run-arm's marked
// probes appearing here, never assumed.
// Env: PORT (as serve-root), DIAG161C_SERVER_LOG (new file, created exclusively).
import fs from 'node:fs';
import path from 'node:path';
import dc from 'node:diagnostics_channel';
import { pathToFileURL, fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fd = fs.openSync(process.env.DIAG161C_SERVER_LOG, 'wx');
const w = rec => fs.writeSync(fd, JSON.stringify({ t: new Date().toISOString(), mono: process.hrtime.bigint().toString(), ...rec }) + '\n');

let seq = 0;
const ids = new WeakMap();
dc.subscribe('net.server.socket', ({ socket }) => {
  const id = ++seq;
  ids.set(socket, id);
  w({ ev: 'socket.open', sock: id, remotePort: socket.remotePort });
  socket.once('close', hadError => w({ ev: 'socket.close', sock: id, hadError, bytesRead: socket.bytesRead, bytesWritten: socket.bytesWritten }));
});
dc.subscribe('http.server.request.start', ({ request, socket }) => {
  w({ ev: 'request.start', sock: ids.get(socket) ?? null, method: request.method, url: request.url, ua: request.headers['user-agent'] ?? null });
});
dc.subscribe('http.server.response.finish', ({ request, response, socket }) => {
  w({ ev: 'response.finish', sock: ids.get(socket) ?? null, url: request.url, status: response.statusCode });
});
process.on('uncaughtExceptionMonitor', (error, origin) => w({ ev: 'uncaught', origin, error: String(error?.stack ?? error) }));
process.on('exit', code => w({ ev: 'exit', code }));
w({ ev: 'observer.ready', node: process.version, pid: process.pid });

await import(pathToFileURL(path.join(REPO, 'scripts', 'serve-root.mjs')).href);
