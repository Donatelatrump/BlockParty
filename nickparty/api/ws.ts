import http from 'node:http';
// Nota: los imports relativos llevan extensión `.js` a propósito.
// El runtime de Vercel compila esta función como ESM (`"type": "module"`) y
// Node ESM no resuelve imports relativos sin extensión.
import { attachHub } from '../server/hub.js';

// Vercel Functions aceptan WebSocket devolviendo el `http.Server` como export por defecto.
// El endpoint queda disponible en wss://<dominio>/api/ws
const server = http.createServer((_req, res) => {
  res.statusCode = 200;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.end('nickparty websocket endpoint');
});

attachHub(server);

export default server;
