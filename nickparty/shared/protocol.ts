import type { RoomState } from './game';

/** Mensajes cliente -> servidor. */
export type ClientMsg =
  | { t: 'join'; room: string; playerId: string; name: string; avatar: string; sessionToken: string }
  | { t: 'start'; rounds?: number; boardTheme?: string; withCpu?: boolean }
  | { t: 'roll' }
  | { t: 'path:choose'; target: number }
  | { t: 'mg:input'; gameId: number; input: import('./minigames').MiniInput }
  | { t: 'mg:claim'; coinId: number }
  | { t: 'mg:flip'; cardId: number }
  | { t: 'store:buy'; item: import('./game').StoreItemId }
  | { t: 'store:close' }
  | { t: 'gold:buy' }
  | { t: 'gold:pass' }
  | { t: 'item:use'; item: import('./game').StoreItemId; targetId?: string }
  | { t: 'trivia:answer'; answer: number }
  | { t: 'chat'; text: string }
  | { t: 'ping' };

/** Mensajes servidor -> cliente. */
export type ServerMsg =
  | { t: 'welcome'; playerId: string; room: string }
  | { t: 'state'; state: RoomState }
  | { t: 'error'; message: string }
  | { t: 'pong' };

export function parseClientMsg(raw: string): ClientMsg | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const msg = data as Record<string, unknown>;
  const text = (key: string, max: number) => typeof msg[key] === 'string' && (msg[key] as string).length <= max;
  const integer = (key: string) => Number.isSafeInteger(msg[key]) && (msg[key] as number) >= 0;
  let valid = false;
  switch (msg.t) {
    case 'join': valid = text('room', 32) && text('name', 80) && text('avatar', 40) && typeof msg.sessionToken === 'string' && /^[a-f0-9-]{36,128}$/i.test(msg.sessionToken); break;
    case 'start': valid = (msg.rounds === undefined || integer('rounds')) && (msg.boardTheme === undefined || text('boardTheme', 32)) && (msg.withCpu === undefined || typeof msg.withCpu === 'boolean'); break;
    case 'path:choose': valid = integer('target'); break;
    case 'mg:input': {
      const input = msg.input as Record<string, unknown> | null;
      valid = integer('gameId') && !!input && typeof input === 'object' && ['left', 'right', 'up', 'down', 'action', 'select', 'drop', 'aim'].includes(String(input.key))
        && (input.target === undefined || Number.isSafeInteger(input.target) && Number(input.target) >= 0 && Number(input.target) <= 1000)
        && (input.value === undefined || typeof input.value === 'number' && Number.isFinite(input.value) && input.value >= 0 && input.value <= 100);
      break;
    }
    case 'mg:claim': valid = integer('coinId'); break;
    case 'mg:flip': valid = integer('cardId'); break;
    case 'trivia:answer': valid = integer('answer'); break;
    case 'store:buy':
    case 'item:use': valid = text('item', 20) && ['double', 'triple', 'thief', 'random', 'freeze', 'block'].includes(String(msg.item)) && (msg.targetId === undefined || text('targetId', 64)); break;
    case 'chat': valid = text('text', 500); break;
    case 'roll': case 'store:close': case 'gold:buy': case 'gold:pass': case 'ping': valid = true; break;
  }
  return valid ? data as ClientMsg : null;
}

export function encode(msg: ServerMsg): string {
  return JSON.stringify(msg);
}
