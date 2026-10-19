import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { attachHub } from '../server/hub.js';
import type { ServerMsg } from '../shared/protocol.js';
import { redisFixture } from './redis-fixture.js';

test('two gateways route both players to one room authority through Redis pub/sub', async (t) => {
  const redis = await redisFixture();
  const old = process.env.REDIS_URL;
  process.env.REDIS_URL = redis.url;
  const servers = [http.createServer(), http.createServer()];
  const hubs = servers.map((server) => attachHub(server));
  const sockets: WebSocket[] = [];
  t.after(async () => {
    if (old === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = old;
    for (const ws of sockets) ws.terminate();
    await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
    await redis.close();
  });
  await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve))));
  const clients = [];
  for (const server of servers) {
    const ws = new WebSocket(`ws://127.0.0.1:${(server.address() as { port: number }).port}`);
    sockets.push(ws);
    const messages: ServerMsg[] = [];
    ws.on('message', (data) => messages.push(JSON.parse(data.toString()) as ServerMsg));
    await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    ws.send(JSON.stringify({ t: 'join', room: 'MULTI', playerId: '', sessionToken: randomUUID(), name: 'Player', avatar: 'bob' }));
    clients.push({ ws, messages });
    const until = Date.now() + 3000;
    while (!messages.some((m) => m.t === 'welcome') && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(messages.some((m) => m.t === 'welcome'), 'gateway completes join');
  }
  assert.equal(hubs.reduce((count, hub) => count + hub.rooms.size, 0), 1);
  const room = hubs.flatMap((hub) => [...hub.rooms.values()])[0];
  assert.equal(room.state.players.length, 2);
  clients[0].ws.send(JSON.stringify({ t: 'start', rounds: 4 }));
  const until = Date.now() + 3000;
  while (clients.some((c) => !c.messages.some((m) => m.t === 'state' && m.state.phase === 'playing')) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 10));
  const states = clients.map((c) => c.messages.find((m) => m.t === 'state' && m.state.phase === 'playing'));
  assert.ok(states[0]); assert.deepEqual(states[0], states[1]);
});
