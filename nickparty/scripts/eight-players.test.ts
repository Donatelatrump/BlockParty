import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { attachHub } from '../server/hub.js';
import { CHARACTERS, MAX_PLAYERS, type MinigameState } from '../shared/game.js';
import { MINIGAMES, type MiniInput } from '../shared/minigames.js';
import { createArena, cpuInput, tickArena } from '../server/minigames.js';
import type { ServerMsg } from '../shared/protocol.js';

test('eight real sockets play every minigame, stay synchronized, reject a ninth and reconnect without duplicating seats', async t => {
  const server = http.createServer(), hub = attachHub(server), sockets: WebSocket[] = [];
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    for (const room of hub.rooms.values()) room.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  async function client(token = randomUUID(), index = 0) {
    const ws = new WebSocket(`ws://127.0.0.1:${(address as { port: number }).port}/api/ws`); sockets.push(ws);
    const messages: ServerMsg[] = [];
    ws.on('message', raw => messages.push(JSON.parse(raw.toString()) as ServerMsg));
    await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const wait = async (predicate: (msg: ServerMsg) => boolean, label = 'message') => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const found = [...messages].reverse().find(predicate); if (found) return found;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      throw new Error(`Eight-player websocket response timed out: ${label}; errors=${JSON.stringify(messages.filter(m => m.t === 'error'))}`);
    };
    const send = (message: unknown) => ws.send(JSON.stringify(message));
    send({ t: 'join', room: 'EIGHT', sessionToken: token, playerId: '', name: `Jugador ${index + 1}`, avatar: CHARACTERS[(index + 8) % CHARACTERS.length].id });
    return { ws, token, messages, wait, send, id: '' };
  }
  const clients = [];
  for (let index = 0; index < MAX_PLAYERS; index++) {
    const c = await client(undefined, index); const welcome = await c.wait(m => m.t === 'welcome');
    assert.equal(welcome.t, 'welcome'); if (welcome.t !== 'welcome') throw new Error('welcome');
    c.id = welcome.playerId; clients.push(c);
  }
  const room = hub.rooms.get('EIGHT')!;
  assert.equal(room.state.players.length, 8); assert.equal(new Set(room.state.players.map(p => p.avatar)).size, 8);
  const ninth = await client(undefined, 8); await ninth.wait(m => m.t === 'error');
  assert.equal(room.state.players.length, 8); assert.equal(ninth.messages.some(m => m.t === 'welcome'), false);
  clients[0].send({ t: 'start', rounds: 4 });
  await Promise.all(clients.map(c => c.wait(m => m.t === 'state' && m.state.phase === 'playing' && m.state.players.length === 8)));
  for (const [index, def] of MINIGAMES.entries()) {
    const now = Date.now(), startsAt = now - 2500;
    const mg: MinigameState = { id: index + 1, kind: def.id, name: def.name, desc: def.desc, startsAt, endsAt: now + 60000, arena: createArena(clients.map(c => c.id), def.id, startsAt), coins: [], cards: [], revealed: [], matched: [], collected: {}, endsRound: false };
    room.state.phase = 'minigame'; room.state.minigame = mg;
    await Promise.all(clients.map(async (c, i) => {
      let input: MiniInput | null = cpuInput(mg, c.id, now);
      if (def.id === 'fleas') input = { key: 'drop', target: i, value: i % 4 };
      if (def.id === 'dodge') input = { key: 'select', target: i };
      input ??= { key: ['signal_sprint', 'color_crumble', 'escape'].includes(def.id) ? 'right' : 'action' };
      c.send({ t: 'mg:input', gameId: mg.id, input });
      await c.wait(m => m.t === 'state' && m.state.minigame?.id === mg.id && Math.max(m.state.minigame.arena!.players[c.id].lastInput, m.state.minigame.arena!.players[c.id].lastAction) >= now, `${def.id}, player ${i}, ${JSON.stringify(input)}`);
    }));
    tickArena(mg, room.state.players, Date.now());
    room.state.version = 10000 + index; room.onChange?.();
    const snapshots: ServerMsg[] = await Promise.all(clients.map(c => c.wait(m => m.t === 'state' && m.state.version === 10000 + index)));
    for (const snapshot of snapshots) assert.deepEqual(snapshot, snapshots[0], `${def.name}: all eight receive the same authoritative state`);
    assert.equal(Object.keys(mg.arena!.players).length, 8);
  }
  // Eight held controls at a realistic repeat rate must not trip the per-peer
  // limit or drop updates while broadcasting every action to all participants.
  const stressStart = Date.now();
  const stressGame: MinigameState = { id: 10000, kind: 'paint', name: 'Eight held controls', desc: '', startsAt: stressStart - 1000, endsAt: stressStart + 60000, arena: createArena(clients.map(c => c.id), 'paint', stressStart - 1000), coins: [], cards: [], revealed: [], matched: [], collected: {}, endsRound: false };
  room.state.minigame = stressGame;
  let lastSentAt = stressStart;
  for (let repeat = 0; repeat < 20; repeat++) {
    lastSentAt = Date.now();
    for (const c of clients) c.send({ t: 'mg:input', gameId: stressGame.id, input: { key: repeat % 2 ? 'left' : 'right' } });
    await new Promise(resolve => setTimeout(resolve, 90));
  }
  await Promise.all(clients.map(c => c.wait(m => m.t === 'state' && m.state.minigame?.id === stressGame.id && Object.values(m.state.minigame.arena!.players).every(p => p.lastInput >= lastSentAt), 'sustained eight-player input')));
  for (const c of clients) {
    assert.equal(c.ws.readyState, WebSocket.OPEN);
    assert.ok(c.messages.filter(m => m.t === 'state' && m.state.minigame?.id === stressGame.id).length >= 160, 'Every participant receives all 160 actions');
  }
  const old = clients[3], replaced = new Promise<number>(resolve => old.ws.once('close', resolve));
  const reconnect = await client(old.token, 3); const welcome = await reconnect.wait(m => m.t === 'welcome');
  assert.equal(await replaced, 4001); assert.ok(welcome.t === 'welcome' && welcome.playerId === old.id);
  assert.equal(room.state.players.length, 8); assert.equal(room.connectedCount, 8);
});
