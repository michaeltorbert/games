// Per-process protocol sink: exact browser ownership without changing the
// native worker topology or any installed file.
//
// Source basis (Playwright 1.56.1, fingerprinted by lib.mjs):
// - playwright-core/index.js -> lib/inprocess: every Playwright Test worker
//   hosts its own in-process browser server, so each WKConnection lives in the
//   worker process that launched the browser.
// - wkConnection.js rawSend/dispatch call the connection's _protocolLogger,
//   built by helper.debugProtocolLogger(), which writes through
//   debugLogger.log('protocol', ...) -> utilsBundle `debug`.
// - `debug` resolves its output at call time (`self.log || createDebug.log`).
//   DEBUG_FILE replaces `debug.log` once at module initialisation, and every
//   worker inherits the same path, so a shared DEBUG_FILE would be opened by
//   several processes (and, in 1.56.1, truncated by each). Replacing `debug.log`
//   at runtime inside one worker routes exactly that process's pw:* lines to
//   a file only that process writes.
// Ownership is therefore by construction: one sink per worker process, and
// the spec never has more than one live browser per process. check-run
// verifies it positively (launch lines present in the sink, no pw:protocol
// line on the shared stderr, no overlapping launches inside a sink).
//
// Writes are synchronous (as stderr-to-file writes were in the historical
// arms), so the sink needs no draining and survives a stalled event loop up to
// the last completed write. A `sink.exit` mark written from the process 'exit'
// handler positively closes the stream; without it the stream is incomplete.
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let sink = null;

export function installSink(dir, identity) {
  if (sink) return sink;
  const { debug } = require('playwright-core/lib/utilsBundle');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `sink-${process.pid}.log`);
  const fd = fs.openSync(file, 'wx');
  const write = text => fs.writeSync(fd, `${process.hrtime.bigint()} ${text}\n`);
  const mark = (ev, fields = {}) => write(`${new Date().toISOString()} #mark ${JSON.stringify({ ev, pid: process.pid, ...fields })}`);
  let live = 0;
  sink = {
    file,
    mark,
    liveBrowsers: () => live,
    launched: () => { live++; },
    closed: () => { live--; },
  };
  mark('sink.open', {
    ...identity,
    ppid: process.ppid,
    debugProtocolEnabled: debug.enabled('pw:protocol'),
    debugBrowserEnabled: debug.enabled('pw:browser'),
    debugApiEnabled: debug.enabled('pw:api'),
  });
  debug.log = (...args) => write(util.format(...args));
  process.on('exit', code => {
    try { mark('sink.exit', { code, liveBrowsers: live }); fs.fsyncSync(fd); } catch { /* nothing else to do at exit */ }
  });
  return sink;
}
