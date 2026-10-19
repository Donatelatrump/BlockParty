import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { attachHub } from '../server/hub.js';
import type { ServerMsg } from '../shared/protocol.js';

test('real sockets: identity cannot be stolen, reconnect replaces old socket, state stays synchronized', async (t) => {
  const server = http.createServer();
  const hub = attachHub(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const sockets: WebSocket[] = [];
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    for (const room of hub.rooms.values()) room.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  async function client() {
    const ws = new WebSocket(`ws://127.0.0.1:${(address as { port: number }).port}/api/ws`);
    sockets.push(ws);
    const messages: ServerMsg[] = [];
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString()) as ServerMsg));
    await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const wait = async (predicate: (msg: ServerMsg) => boolean) => {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const found = messages.find(predicate);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error('Expected websocket response was not received');
    };
    return { ws, messages, wait, send: (msg: unknown) => ws.send(JSON.stringify(msg)) };
  }
  const a = await client(); const token = randomUUID();
  a.send({ t: 'join', room: 'NET', playerId: 'claimed-id', sessionToken: token, name: 'Ana', avatar: 'bob' });
  const welcome = await a.wait((m) => m.t === 'welcome'); assert.equal(welcome.t, 'welcome');
  if (welcome.t !== 'welcome') throw new Error('welcome');
  assert.notEqual(welcome.playerId, token); assert.notEqual(welcome.playerId, 'claimed-id');
  const b = await client();
  b.send({ t: 'join', room: 'NET', playerId: welcome.playerId, sessionToken: randomUUID(), name: 'Beto', avatar: 'bob' });
  const wb = await b.wait((m) => m.t === 'welcome');
  assert.ok(wb.t === 'welcome' && wb.playerId !== welcome.playerId);
  b.send({ t: 'start', rounds: 4 });
  await b.wait((m) => m.t === 'error');
  assert.equal(hub.rooms.get('NET')!.state.phase, 'lobby');
  const reconnect = await client();
  const closed = new Promise<number>((resolve) => a.ws.once('close', resolve));
  reconnect.send({ t: 'join', room: 'NET', playerId: '', sessionToken: token, name: 'Ana', avatar: 'bob' });
  await reconnect.wait((m) => m.t === 'welcome');
  assert.equal(await closed, 4001);
  assert.equal(hub.rooms.get('NET')!.state.players.length, 2);
  reconnect.send({ t: 'start', rounds: 4 });
  const sa = await reconnect.wait((m) => m.t === 'state' && m.state.phase === 'playing');
  const sb = await b.wait((m) => m.t === 'state' && m.state.phase === 'playing');
  assert.deepEqual(sa, sb);
  b.send({ t: 'roll' });
  await b.wait((m) => m.t === 'error');
  assert.equal(hub.rooms.get('NET')!.state.dice, null);
});
