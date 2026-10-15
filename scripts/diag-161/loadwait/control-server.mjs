// Issue #161 load-wait: synthetic routes for collector sensitivity controls
// only (port 8094). Never used by the faithful arm. Run through
// serve-observed.mjs with LOADWAIT_SERVER=control so it is observed exactly
// like the faithful server. Synthetic behaviour here is sensitivity evidence,
// never a reproduction of N, L or T.
import { createServer } from 'node:http';
import zlib from 'node:zlib';

const PORT = Number(process.env.PORT);
const HOLD_MAX_MS = 90_000;

// Held image (C5). Control 1 sent headers plus a 28-byte PNG prefix: the server
// recorded headersSent and the socket byte counters fit headers + 28 bytes, yet
// WebKit surfaced no Network.responseReceived for ~13 s. Candidate fixture
// change (no cause is claimed): send a well-formed PNG stream prefix — signature,
// a complete IHDR chunk with a correct CRC, and the first HOLD_SENT bytes of a
// tEXt chunk of declared length HOLD_TEXT_LEN — far beyond any small
// content-sniffing/first-bytes window, with X-Content-Type-Options: nosniff and
// headers flushed first. Content-Length declares the complete PNG, whose
// remainder (rest of tEXt, IDAT, IEND) is never sent, so the body never ends.
const HOLD_TEXT_LEN = 65_536;
const HOLD_SENT = 16_384;
const chunkHead = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32BE(len, 0); b.write(type, 4, 'ascii'); return b; };
const IHDR_DATA = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]); // 1x1 RGBA
const IHDR_CRC = Buffer.alloc(4); IHDR_CRC.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from('IHDR'), IHDR_DATA])) >>> 0, 0);
const HOLD_PREFIX = Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'),
  chunkHead(13, 'IHDR'), IHDR_DATA, IHDR_CRC,
  chunkHead(HOLD_TEXT_LEN, 'tEXt'), Buffer.from('loadwait\0'), Buffer.alloc(HOLD_SENT - 9, 0x78),
]);
const HOLD_TOTAL = 8 + 25 + 12 + HOLD_TEXT_LEN + 12 + 12; // through tEXt CRC, a minimal IDAT header/CRC and IEND (never sent)

const page = body => `<!doctype html><html><head><meta charset="utf-8"><title>loadwait control</title></head><body>${body}</body></html>`;
const PAGES = {
  '/ctl/page/normal.html': page('<p>normal</p><img src="/ctl/ok.svg" alt="">'),
  '/ctl/page/errors.html': page('<img src="/ctl/status/404" alt=""><img src="/ctl/reset" alt="">'),
  // Two same-URL uncached fetches, with canary query values that must never reach evidence.
  '/ctl/page/repeat.html': page(`<script>
    window.__done = (async () => {
      for (let i = 0; i < 2; i++) await fetch('/ctl/repeat.json?token=CANARYQ7Z1&n=CANARYQ7Z2', { cache: 'no-store' }).then(r => r.text());
      return true;
    })();
  </script>`),
  // DOMContentLoaded fires; load waits on an image whose headers arrive and whose body never completes.
  '/ctl/page/held.html': page('<p>held</p><img src="/ctl/hold.png" alt="">'),
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = url.pathname;
  if (PAGES[p]) return void res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(PAGES[p]);
  if (p === '/ctl/ok.svg') return void res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }).end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
  if (p === '/ctl/repeat.json') return void res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end('{"ok":true}');
  const redirect = p.match(/^\/ctl\/redirect\/([0-3])$/);
  if (redirect) {
    const n = Number(redirect[1]);
    if (n === 0) return void res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(page('<p>redirect end</p>'));
    return void res.writeHead(302, { Location: `/ctl/redirect/${n - 1}`, 'Cache-Control': 'no-store' }).end();
  }
  if (p === '/ctl/status/404') return void res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('not found');
  if (p === '/ctl/reset') return void req.socket.destroy();
  if (p === '/ctl/hold.png') {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': String(HOLD_TOTAL), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.flushHeaders();
    res.write(HOLD_PREFIX);
    const timer = setTimeout(() => req.socket.destroy(), HOLD_MAX_MS);
    req.socket.once('close', () => clearTimeout(timer));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`loadwait control server listening on http://127.0.0.1:${PORT}`);
});
