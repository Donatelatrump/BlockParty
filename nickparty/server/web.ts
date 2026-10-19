import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { attachHub } from './hub.js';

// Standalone production/local preview: HTTP assets and WS share one origin.
const root = path.resolve('dist');
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  void (async () => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('Not found'); }
  })().catch(() => { res.writeHead(400); res.end('Bad request'); });
});
attachHub(server);
server.listen(Number(process.env.PORT ?? 5173), process.env.HOST ?? '127.0.0.1', () => console.log(`Game: http://localhost:${process.env.PORT ?? 5173}`));
