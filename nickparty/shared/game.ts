import { BOARD_PATHS } from './board-paths.js';
import customCharacters from './custom-characters.json' with { type: 'json' };
// Motor de dominio compartido entre el servidor autoritativo y el cliente.
// Aquí solo viven tipos puros y utilidades deterministas (sin red, sin DOM).

export type Phase = 'lobby' | 'playing' | 'resolving' | 'choosingPath' | 'store' | 'goldCoin' | 'trivia' | 'minigame' | 'ended';

export type TileType = 'red' | 'blue' | 'shop' | 'goodBad' | 'trivia' | 'surprise' | 'challenge' | 'extraRoll';
import { ORIGINAL_BOARD_LAYOUTS } from './original-board-layouts.js';
import ORIGINAL_RULES from './original-rules.json' with { type: 'json' };

export type StoreItemId = 'double' | 'triple' | 'thief' | 'random' | 'freeze' | 'block';
export interface TriviaQuestion { question: string; answers: Array<{ text: string; correct?: boolean }> }
const RULE_DATA = ORIGINAL_RULES as {
  themes: Record<string, { groups: Record<string, string>; outcomes: Array<{ group: string; effect: string; weight: number }> }>;
};
export const STORE_ITEMS: Array<{ id: StoreItemId; price: number; name: string; description: string }> = [
  { id: 'double', price: 10, name: 'Dado doble', description: 'Tira dos dados en tu próximo turno.' },
  { id: 'triple', price: 15, name: 'Dado triple', description: 'Tira tres dados en tu próximo turno.' },
  { id: 'thief', price: 2, name: 'Ladrón de monedas', description: 'Roba monedas al jugador que elijas.' },
  { id: 'random', price: 3, name: 'Cambio de suerte', description: 'Cambia de lugar la moneda dorada.' },
  { id: 'freeze', price: 2, name: 'Congelar', description: 'El rival elegido pierde su próximo turno.' },
  { id: 'block', price: 2, name: 'Bloqueo', description: 'Detiene al siguiente jugador que pase por la casilla.' },
];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export const BOARD_THEMES = [
  { id: 'spongeBob', name: 'Fondo de Bikini', file: 'spongeBob.jpg', imageWidth: 3680, imageHeight: 3190 },
  { id: 'fanboy', name: 'Fanboy y Chum Chum', file: 'fanboy.jpg', imageWidth: 4172, imageHeight: 2776 },
  { id: 'iCarly', name: 'iCarly', file: 'iCarly.jpg', imageWidth: 4000, imageHeight: 4000 },
  { id: 'madagascar', name: 'Madagascar', file: 'madagascar.jpg', imageWidth: 5000, imageHeight: 5000 },
  { id: 'samAndCat', name: 'Sam & Cat', file: 'samAndCat.jpg', imageWidth: 4000, imageHeight: 4000 },
  { id: 'sheen', name: 'Planet Sheen', file: 'sheen.jpg', imageWidth: 3500, imageHeight: 3500 },
  { id: 'tmnt', name: 'Tortugas Ninja', file: 'tmnt.jpg', imageWidth: 4000, imageHeight: 4000 },
  { id: 'tuffPuppy', name: 'T.U.F.F. Puppy', file: 'tuffPuppy.jpg', imageWidth: 3689, imageHeight: 2685 },
  { id: 'victorious', name: 'Victorious', file: 'victorious.jpg', imageWidth: 4000, imageHeight: 2667 },
] as const;

export type BoardThemeId = (typeof BOARD_THEMES)[number]['id'];
export const DEFAULT_BOARD_THEME: BoardThemeId = 'spongeBob';

// El tablero original tiene 45 casillas en su recorrido.
export const TILE_COUNT = 45;

export const DEFAULT_ROUNDS = 6;
export const ROUND_OPTIONS = [4, 6, 8, 10, 12, 15, 20] as const;

export const MINIGAME_DURATION_MS = 9000;
export const ROLL_DELAY_MS = 850;
export const MOVE_DELAY_MS = 480;
export const EFFECT_DELAY_MS = 650;

export interface Tile {
  i: number;
  type: TileType;
  group?: string;
}

export interface PlayerState {
  id: string;
  name: string;
  avatar: string;
  color: string;
  coins: number;
  gold: number;
  pos: number;
  acted: boolean;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
  items: StoreItemId[];
  diceCount: number;
  frozenTurns: number;
  stats?: { minigameCoins: number; blueSpaces: number; triviaCorrect: number };
}

export interface MiniCoin {
  id: number;
  x: number; // porcentaje 0-100
  y: number; // porcentaje 0-100
  value: number;
  by: string | null;
  appearsAt?: number;
  expiresAt?: number;
}

export interface MinigameState {
  id: number;
  name: string;
  desc: string;
  endsAt: number;
  coins: MiniCoin[];
  collected: Record<string, number>;
  kind: 'coin-rush' | 'memory' | 'whack' | import('./minigames').OriginalMinigame;
  startsAt?: number;
  resultsUntil?: number;
  rewards?: Record<string, number>;
  arena?: import('./minigames').ArenaState;
  cards: number[];
  revealed: number[];
  matched: number[];
  endsRound: boolean;
}

export interface TriviaState { playerId: string; question: TriviaQuestion }

export interface ChatMsg {
  id: number;
  name: string;
  text: string;
  at: number;
}

export interface RoomState {
  id: string;
  phase: Phase;
  round: number;
  maxRounds: number;
  boardTheme: BoardThemeId;
  turn: number;
  players: PlayerState[];
  board: Tile[];
  goldCoinPos: number;
  blockedTiles: number[];
  dice: number | null;
  diceRoll?: { values: number[]; startedAt: number; duration: number };
  minigame: MinigameState | null;
  trivia: TriviaState | null;
  log: string[];
  winnerId: string | null;
  chat: ChatMsg[];
  version: number;
  pathChoice: { playerId: string; options: number[]; remaining: number } | null;
  movement: { playerId: string; from: number; to: number; startedAt: number; duration: number } | null;
}

// Paleta y avatares genéricos (sin assets con licencia).
export const CHARACTERS = [
  { id: 'bob', name: 'Bob Esponja' },
  { id: 'mikey', name: 'Mikey' },
  { id: 'sam', name: 'Sam' },
  { id: 'cat', name: 'Cat' },
  { id: 'fanboy', name: 'Fanboy' },
  { id: 'skipper', name: 'Skipper' },
  { id: 'sheen', name: 'Sheen' },
  { id: 'tori', name: 'Tori' },
  ...Object.entries(customCharacters).map(([id, character]) => ({ id, name: character.name })),
] as const;

export const AVATARS: string[] = CHARACTERS.map((character) => character.id);

export const COLORS = [
  '#ff5a5f',
  '#f7b32b',
  '#4cc9f0',
  '#8ac926',
  '#c77dff',
  '#ff8fab',
  '#ffd166',
  '#06d6a0',
];

// Patrón determinista del tablero.
export function buildBoard(boardTheme: BoardThemeId = DEFAULT_BOARD_THEME): Tile[] {
  const layout = ORIGINAL_BOARD_LAYOUTS[boardTheme] ?? ORIGINAL_BOARD_LAYOUTS[DEFAULT_BOARD_THEME];
  const groups = RULE_DATA.themes[boardTheme]?.groups ?? {};
  return layout.map((type, i) => ({ i, type, group: groups[String(i)] }));
}

export function tileOutcomes(theme: BoardThemeId, group: string) {
  return RULE_DATA.themes[theme]?.outcomes.filter((outcome) => outcome.group === group) ?? [];
}

/** Celdas del anillo (borde) de la cuadrícula, en orden de recorrido. */
/** Posición (porcentaje) de la casilla `index` dentro del contenedor del tablero. */
export function ringPos(index: number, tileCount = TILE_COUNT): { x: number; y: number } {
  const angle = (index / tileCount) * Math.PI * 2 - Math.PI / 2;
  return {
    x: 50 + Math.cos(angle) * 44,
    y: 50 + Math.sin(angle) * 42,
  };
}

export function boardPathPos(theme: BoardThemeId, index: number, _tileCount = TILE_COUNT): { x: number; y: number } {
  return BOARD_PATHS[theme].nodes[index] ?? { x: 50, y: 50 };
}

export function tileLabel(type: TileType): string {
  switch (type) {
      case 'red': return '-5 monedas';
      case 'blue': return '+5 monedas';
    case 'shop': return 'Tienda';
    case 'goodBad': return 'Suerte o mala suerte';
    case 'trivia': return 'Trivia';
    case 'surprise': return 'Sorpresa';
    case 'challenge': return 'Desaf\u00edo';
    case 'extraRoll': return 'Tira otra vez';
  }
}

export function tileIcon(type: TileType): string {
    return { red: '-5', blue: '+5', shop: '\u{1F6D2}', goodBad: '\u00b1', trivia: '?', surprise: '\u{1F381}', challenge: '\u2694', extraRoll: '\u{1F3B2}' }[type];
}

export function sanitizeName(raw: string): string {
  const clean = raw.replace(/\s+/g, ' ').trim().slice(0, 14);
  return clean.length ? clean : 'Invitado';
}

export function sanitizeRoom(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);
}

export function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function makeChatText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 120);
}
