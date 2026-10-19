import { WebSocket } from 'ws';
import { attachTransport, type Peer } from './transport.js';
import type { RawData } from 'ws';
import type { Server as HttpServer } from 'node:http';
// Imports con extensión `.js`: el runtime de Vercel ejecuta esto como ESM.
import { encode, parseClientMsg } from '../shared/protocol.js';
import { makeRoomCode, sanitizeRoom } from '../shared/game.js';
import { Room } from './room.js';
import { createHash } from 'node:crypto';
import { publicState } from './public-state.js';

const ROOM_IDLE_MS = 90_000;


/**
 * Enlaza el servidor HTTP con el WebSocketServer y la lógica de salas.
 * Se usa igual en dev (server/dev.ts) y en Vercel (api/ws.ts).
 */
export function attachHub(server: HttpServer): { rooms: Map<string, Room> } {
  const meta = new WeakMap<Peer, { roomId: string | null; playerId: string | null }>();
  const activeSocket = new Map<string, Peer>();
  const rooms = new Map<string, Room>();
  server.once('close', () => { for (const room of rooms.values()) room.close(); rooms.clear(); });
  // --- helpers -------------------------------------------------------------
  function send(ws: Peer, payload: string): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }

  function broadcastLocal(room: Room): void {
    const payload = encode({ t: 'state', state: publicState(room.state) });
    for (const client of wss.clients) {
      const m = meta.get(client);
      if (m && m.roomId === room.id) send(client, payload);
    }
  }

  function getRoom(id: string): Room {
    const existing = rooms.get(id);
    if (existing) return existing;
    const room = new Room(id);
    room.onChange = () => broadcastLocal(room);
    rooms.set(id, room);
    return room;
  }

  function roomOf(m: { roomId: string | null }): Room | undefined {
    return m.roomId ? rooms.get(m.roomId) : undefined;
  }

  // --- mensajes ------------------------------------------------------------
  async function handleMessage(ws: Peer, raw: RawData): Promise<void> {
    const m = meta.get(ws);
    if (!m) return;
    const msg = parseClientMsg(raw.toString());
    if (!msg) { send(ws, encode({ t: 'error', message: 'Mensaje no valido; recarga el juego' })); return; }
    if (msg.t !== 'join' && msg.t !== 'ping' && (!m.playerId || activeSocket.get(m.playerId) !== ws)) return;

    switch (msg.t) {
      case 'ping':
        send(ws, encode({ t: 'pong' }));
        return;

      case 'join': {
        let roomId = sanitizeRoom(msg.room);
        if (!roomId) do { roomId = makeRoomCode(); } while (rooms.has(roomId));
        const playerId = createHash('sha256').update(msg.sessionToken).digest('hex').slice(0, 32);
        const room = getRoom(roomId);
        const res = room.join(playerId, msg.name ?? '', msg.avatar ?? '');
        if (!res.ok) {
          send(ws, encode({ t: 'error', message: res.reason ?? 'No se pudo entrar a la sala' }));
          return;
        }
        if (m.roomId && (m.roomId !== roomId || m.playerId !== playerId)) {
          roomOf(m)?.disconnect(m.playerId ?? '');
          if (m.playerId && activeSocket.get(m.playerId) === ws) activeSocket.delete(m.playerId);
        }
        m.roomId = roomId;
        m.playerId = playerId;
        const previous = activeSocket.get(playerId);
        const previousMeta = previous ? meta.get(previous) : undefined;
        if (previousMeta?.roomId && previousMeta.roomId !== roomId) roomOf(previousMeta)?.disconnect(playerId);
        activeSocket.set(playerId, ws);
        if (previous && previous !== ws) previous.close(4001, 'Sesion reemplazada');
        send(ws, encode({ t: 'welcome', playerId, room: roomId }));
        broadcastLocal(room);
        return;
      }

      case 'start': {
        const room = roomOf(m);
        if (!room || !m.playerId) return;
        const res = room.start(
          m.playerId,
          typeof msg.rounds === 'number' ? msg.rounds : undefined,
          typeof msg.boardTheme === 'string' ? msg.boardTheme : undefined,
          msg.withCpu === true,
        );
        if (!res.ok) send(ws, encode({ t: 'error', message: res.reason ?? 'No se pudo iniciar' }));
        return;
      }

      case 'roll': {
        const room = roomOf(m);
        if (!room || !m.playerId) return;
        const res = room.roll(m.playerId);
        if (!res.ok) send(ws, encode({ t: 'error', message: res.reason ?? 'No puedes tirar' }));
        return;
      }

      case 'path:choose': {
        const room = roomOf(m);
        if (!room || !m.playerId || !Number.isInteger(msg.target)) return;
        const res = room.choosePath(m.playerId, msg.target);
        if (!res.ok) send(ws, encode({ t: 'error', message: res.reason ?? 'Camino no disponible' }));
        return;
      }

      case 'mg:input': {
        const room = roomOf(m);
        if (room && m.playerId && room.state.minigame?.id === msg.gameId) room.miniInput(m.playerId, msg.input);
        return;
      }
      case 'mg:claim': {
        const room = roomOf(m);
        if (!room || !m.playerId) return;
        if (typeof msg.coinId !== 'number') return;
        room.claim(m.playerId, msg.coinId);
        return;
      }

      case 'mg:flip': {
        const room = roomOf(m);
        if (!room || !m.playerId || typeof msg.cardId !== 'number') return;
        room.flipCard(m.playerId, msg.cardId);
        return;
      }

      case 'store:buy': {
        const room = roomOf(m);
        if (!room || !m.playerId || typeof msg.item !== 'string') return;
        const res = room.buyItem(m.playerId, msg.item);
        if (!res.ok) send(ws, encode({ t: 'error', message: res.reason ?? 'No se pudo comprar' }));
        return;
      }

      case 'store:close': {
        const room = roomOf(m);
        if (room && m.playerId) room.closeStore(m.playerId);
        return;
      }

      case 'gold:buy':
      case 'gold:pass': {
        const room = roomOf(m);
        if (room && m.playerId) room.resolveGoldCoin(m.playerId, msg.t === 'gold:buy');
        return;
      }

      case 'item:use': {
        const room = roomOf(m);
        if (!room || !m.playerId || typeof msg.item !== 'string') return;
        const res = room.useItem(m.playerId, msg.item, typeof msg.targetId === 'string' ? msg.targetId : undefined);
        if (!res.ok) send(ws, encode({ t: 'error', message: res.reason ?? 'No se pudo usar el objeto' }));
        return;
      }

      case 'trivia:answer': {
        const room = roomOf(m);
        if (room && m.playerId && typeof msg.answer === 'number') room.answerTrivia(m.playerId, msg.answer);
        return;
      }

      case 'chat': {
        const room = roomOf(m);
        if (!room || !m.playerId) return;
        if (typeof msg.text !== 'string') return;
        room.chat(m.playerId, msg.text);
        return;
      }
    }
  }

  // --- conexiones ----------------------------------------------------------
  const wss = attachTransport(server, (ws: Peer) => {
    meta.set(ws, { roomId: null, playerId: null });

    let windowStart = Date.now();
    let messages = 0;
    ws.on('message', (raw: RawData) => {
      if (Date.now() - windowStart >= 1000) { windowStart = Date.now(); messages = 0; }
      if (++messages > 80) { ws.close(1008, 'Demasiados mensajes'); return; }
      void handleMessage(ws, raw).catch((error) => { console.error('[hub]', error); });
    });

    ws.on('close', () => {
      const m = meta.get(ws);
      if (!m?.roomId || !m.playerId) return;
      const roomId = m.roomId;
      const playerId = m.playerId;
      if (activeSocket.get(playerId) === ws) {
        activeSocket.delete(playerId);
        rooms.get(roomId)?.disconnect(playerId);
      }
      setTimeout(() => {
        const room = rooms.get(roomId);
        if (room && room.connectedCount === 0) {
          room.close();
          rooms.delete(roomId);
        }
      }, ROOM_IDLE_MS).unref?.();
    });

    ws.on('error', () => undefined);
  }, () => {
    for (const room of rooms.values()) room.close();
    rooms.clear();
    activeSocket.clear();
  });

  return { rooms };
}
