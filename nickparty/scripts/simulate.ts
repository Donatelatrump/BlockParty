import { cpuInput } from '../server/minigames.js';
import { randomUUID } from 'node:crypto';
/**
 * Simula una partida completa contra el servidor de juego.
 * Uso:  npx tsx scripts/simulate.ts [numJugadores] [ws://host/path]
 */
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import type { RoomState } from '../shared/game';

const COUNT = Math.max(2, Math.min(8, Number(process.argv[2] ?? 8)));
const URL = process.argv[3] ?? process.env.WS_URL ?? 'ws://localhost:8787/api/ws';
const ROOM = `SIM${Math.floor(Math.random() * 90 + 10)}`;

interface Client {
  id: string;
  name: string;
  ws: WebSocket;
  state: RoomState | null;
  lastVersion: number;
}

const clients: Client[] = [];
let failures = 0;

function log(...args: unknown[]): void {
  console.log('[sim]', ...args);
}

function fail(msg: string): void {
  failures += 1;
  console.error('[sim] ❌', msg);
}

function send(c: Client, msg: ClientMsg): void {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
}

function connect(id: string, name: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const client: Client = { id, name, ws, state: null, lastVersion: -1 };
    ws.on('open', () => {
      send(client, { t: 'join', room: ROOM, playerId: '', sessionToken: randomUUID(), name, avatar: '🦄' });
    });
    ws.on('message', (raw) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(raw.toString()) as ServerMsg;
      } catch {
        return;
      }
      if (msg.t === 'welcome') client.id = msg.playerId;
      if (msg.t === 'state') {
        client.state = msg.state;
        client.lastVersion = msg.state.version;
      } else if (msg.t === 'error') {
        fail(`${name} recibió error: ${msg.message}`);
      }
    });
    ws.on('error', reject);
    setTimeout(() => resolve(client), 400);
  });
}

function consensus(): RoomState | null {
  const withState = clients.filter((c) => c.state);
  if (!withState.length) return null;
  return withState[0].state;
}

async function main(): Promise<void> {
  log(`conectando ${COUNT} clientes a ${URL} (sala ${ROOM})`);
  for (let i = 0; i < COUNT; i++) {
    clients.push(await connect(`p${i}`, `Jugador${i}`));
  }

  await waitFor(() => consensus()?.players.length === COUNT, 4000, 'todos se unieron');
  const lobby = consensus();
  if (!lobby) throw new Error('sin estado de sala');
  log(`lobby con ${lobby.players.length} jugadores y código ${lobby.id}`);

  const host = clients[0];
  send(host, { t: 'start', rounds: 4 });

  await waitFor(() => consensus()?.phase === 'playing', 4000, 'partida iniciada');

  const deadline = Date.now() + 600_000;
  let rolls = 0;
  let claims = 0;
  const sequences = new Map<number, number[]>();
  // Con latencia real, el estado que ve el simulador va por detrás del servidor:
  // si no esperamos, reintenta la tirada antes de que se procese la anterior.
  let rollCooldown = 0;

  while (Date.now() < deadline) {
    const st = consensus();
    if (!st) break;
    if (st.phase === 'ended') break;

    if (st.phase === 'playing' && st.dice === null) {
      const turnPlayer = st.players[st.turn];
      const actor = clients.find((c) => c.id === turnPlayer?.id);
      if (actor && Date.now() >= rollCooldown) {
        send(actor, { t: 'roll' });
        rolls += 1;
        rollCooldown = Date.now() + 1500;
      }
    } else if (['choosingPath', 'store', 'goldCoin', 'trivia'].includes(st.phase)) {
      const actor = clients.find((c) => c.id === st.players[st.turn]?.id);
      if (actor) {
        if (st.phase === 'choosingPath' && st.pathChoice) send(actor, { t: 'path:choose', target: st.pathChoice.options[0] });
        if (st.phase === 'store') send(actor, { t: 'store:close' });
        if (st.phase === 'goldCoin') send(actor, { t: 'gold:pass' });
        if (st.phase === 'trivia') send(actor, { t: 'trivia:answer', answer: 0 });
      }
    } else if (st.phase === 'minigame' && st.minigame) {
      const mg = st.minigame;
      if (mg.arena) {
        const sequence = sequences.get(mg.id) ?? [];
        mg.arena.sequence.forEach((color, i) => { if (color >= 0) sequence[i] = color; });
        sequences.set(mg.id, sequence);
        const view = { ...mg, arena: { ...mg.arena, sequence } };
        for (const c of clients) {
          const input = cpuInput(view, c.id, Date.now());
          if (input) { send(c, { t: 'mg:input', gameId: mg.id, input }); claims++; }
        }
      }
      for (const c of clients) {
        const free = st.minigame.coins.filter((coin) => coin.by === null);
        if (!free.length) break;
        const coin = free[Math.floor(Math.random() * free.length)];
        send(c, { t: 'mg:claim', coinId: coin.id });
        claims += 1;
      }
    }
    await sleep(60);
  }

  const final = consensus();
  if (!final) throw new Error('sin estado final');
  log(`fin: phase=${final.phase} winner=${final.winnerId} rolls=${rolls} claims=${claims}`);

  if (final.phase !== 'ended') fail(`la partida no terminó (phase=${final.phase})`);

  // El último estado tarda en propagarse por la red: esperamos a que todos
  // los clientes converjan antes de comparar (no relajamos la comprobación).
  await waitFor(
    () => new Set(clients.map((c) => c.state?.version ?? -1)).size === 1,
    8000,
    'convergencia de todos los clientes',
  );

  // Todos los clientes deben haber visto el mismo estado final.
  const versions = new Set(clients.filter((c) => c.state).map((c) => c.state!.version));
  if (versions.size > 1) fail(`los clientes divergen: versiones ${[...versions].join(', ')}`);
  const winners = new Set(clients.filter((c) => c.state).map((c) => c.state!.winnerId));
  if (winners.size > 1) fail(`ganadores inconsistentes: ${[...winners].join(', ')}`);

  const winnerName = final.players.find((p) => p.id === final.winnerId)?.name ?? '—';
  log(`🏆 ganador: ${winnerName} · marcador: ${final.players.map((p) => `${p.name}=${p.coins}c/${p.gold}*`).join(' ')}`);

  for (const c of clients) c.ws.close();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(pred: () => boolean, timeout: number, label: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (pred()) return;
    await sleep(50);
  }
  fail(`timeout esperando: ${label}`);
}

main()
  .then(() => {
    if (failures) {
      console.error(`[sim] falló con ${failures} problema(s)`);
      process.exit(1);
    }
    console.log('[sim] ✅ OK');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[sim] error fatal:', err);
    process.exit(1);
  });
