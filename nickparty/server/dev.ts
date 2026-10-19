import http from 'node:http';
import { attachHub } from './hub.js';

const port = Number(process.env.PORT ?? 8787);

const server = http.createServer((req, res) => {
  // Endpoint de diagnóstico solo disponible en desarrollo.
  if (req.url?.startsWith('/debug/rooms')) {
    const dump = [...hub.rooms.entries()].map(([id, room]) => ({
      id,
      phase: room.state.phase,
      players: room.state.players.map((p) => ({ name: p.name, connected: p.connected })),
    }));
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(dump));
    return;
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.end('nickparty ws dev server');
});

const hub = attachHub(server);

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[ws] servidor de juego en ws://localhost:${port}`);
});
