/**
 * Servidor estático mínimo para probar el juego original con Ruffle.
 * Sirve la raíz del repositorio para que /blockparty/ y /content/ estén en el
 * mismo origen (el juego pide sus assets por rutas relativas).
 *
 * Uso (desde la raíz del repo):  node blockparty/serve.mjs
 */
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT ?? 8090);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.swf': 'application/x-shockwave-flash',
  '.xml': 'text/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

http
  .createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = normalize(join(root, pathname));
    if (!file.startsWith(normalize(root + sep))) {
      res.statusCode = 403;
      return res.end('forbidden');
    }
    let st;
    try {
      st = statSync(file);
    } catch {
      res.statusCode = 404;
      return res.end('not found');
    }
    if (st.isDirectory()) {
      res.statusCode = 404;
      return res.end('not found');
    }
    res.setHeader('content-type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('content-length', st.size);
    createReadStream(file).pipe(res);
  })
  .listen(port, () => {
    console.log(`[servidor] http://localhost:${port}/blockparty/index.html`);
  });
