import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const HOST = '127.0.0.1';
const PORT = 4173;
const ROOT = process.cwd();

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

function resolvePath(requestUrl) {
  const url = new URL(requestUrl, `http://${HOST}:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const fsPath = path.resolve(ROOT, `.${pathname}`);
  if (!fsPath.startsWith(ROOT)) return null;
  if (!existsSync(fsPath)) return null;
  const stats = statSync(fsPath);
  if (stats.isDirectory()) return resolvePath(`${pathname}/`);
  return fsPath;
}

const server = createServer((req, res) => {
  const fsPath = resolvePath(req.url || '/');
  if (!fsPath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = path.extname(fsPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  createReadStream(fsPath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`Serving ${ROOT} at http://${HOST}:${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
