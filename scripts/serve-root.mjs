import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

async function resolvePath(urlPath) {
  const cleaned = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = normalize(cleaned).replace(/^(\.\.[\/\\])+/, '');
  let abs = join(ROOT, rel);
  if (!abs.startsWith(ROOT)) return null;
  try {
    const s = await stat(abs);
    if (s.isDirectory()) abs = join(abs, 'index.html');
    return abs;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const path = await resolvePath(req.url || '/');
  if (!path) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`serve-root listening on http://127.0.0.1:${PORT} (root=${ROOT})`);
});
