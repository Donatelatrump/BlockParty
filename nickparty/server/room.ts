import { MINIGAMES, PREPARATION_MS, RESULTS_MS, type MiniInput, type OriginalMinigame } from '../shared/minigames.js';
import { createArena, arenaInput, tickArena, cpuInput } from './minigames.js';
import { randomTrivia } from './trivia.js';
import { BOARD_PATHS } from '../shared/board-paths.js';
import {
  AVATARS,
  COLORS,
  DEFAULT_ROUNDS,
  DEFAULT_BOARD_THEME,
  BOARD_THEMES,
  EFFECT_DELAY_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MOVE_DELAY_MS,
  ROLL_DELAY_MS,
  ROUND_OPTIONS,
  STORE_ITEMS,
  buildBoard,
  makeChatText,
  sanitizeName,
  tileOutcomes,
} from '../shared/game.js';
import type { MinigameState, PlayerState, RoomState, StoreItemId } from '../shared/game.js';

export interface JoinResult {
  ok: boolean;
  reason?: string;
  rejoined?: boolean;
}

export interface ActionResult {
  ok: boolean;
  reason?: string;
}

const MAX_LOG = 40;
const MAX_CHAT = 60;

/** Una sala: dueña autoritativa del estado de la partida y de sus temporizadores. */
export class Room {
  readonly id: string;
  state: RoomState;
  onChange: (() => void) | null = null;

  #seqTimers: Array<ReturnType<typeof setTimeout>> = [];
  #mgTimer: ReturnType<typeof setTimeout> | null = null;
  #minigameSeq = 0;
  #minigameBag: OriginalMinigame[] = [];
  #remainingSteps = 0;
  #pausedAt: number | null = null;

  constructor(id: string, initialState?: RoomState) {
    this.id = id;
    this.state =
      initialState ??
      ({
        id,
        phase: 'lobby',
        round: 0,
        maxRounds: DEFAULT_ROUNDS,
        boardTheme: DEFAULT_BOARD_THEME,
        turn: 0,
        players: [],
        board: buildBoard(),
        goldCoinPos: 0,
        blockedTiles: [],
        dice: null,
        minigame: null,
        trivia: null,
        log: [],
        winnerId: null,
        chat: [],
        version: 0,
        pathChoice: null,
        movement: null,
      } satisfies RoomState);
    this.#normalizeState();
    this.#scheduleCpuTurn();
  }

  // ---- consultas ---------------------------------------------------------

  get connectedCount(): number {
    return this.state.players.filter((p) => p.connected && !p.isBot).length;
  }

  hasPlayer(playerId: string): boolean {
    return this.state.players.some((p) => p.id === playerId);
  }

  #find(playerId: string): PlayerState | undefined {
    return this.state.players.find((p) => p.id === playerId);
  }

  #indexOf(playerId: string): number {
    return this.state.players.findIndex((p) => p.id === playerId);
  }

  #firstConnected(): number {
    const idx = this.state.players.findIndex((p) => p.connected);
    return idx === -1 ? 0 : idx;
  }

  // ---- mutaciones --------------------------------------------------------

  join(playerId: string, rawName: string, avatar: string): JoinResult {
    const st = this.state;
    const existing = this.#find(playerId);
    if (existing) {
      existing.connected = true;
      if (!st.players.some((p) => p.isHost && p.connected && !p.isBot)) existing.isHost = true;
      if (rawName) existing.name = sanitizeName(rawName);
      if (avatar) existing.avatar = avatar;
      this.#log(`${existing.name} se reconecta`);
      this.#changed();
      if (this.#pausedAt !== null) {
        const elapsed = Date.now() - this.#pausedAt;
        this.#pausedAt = null;
        if (st.phase === 'minigame' && st.minigame) {
          st.minigame.endsAt += elapsed;
          if (st.minigame.startsAt !== undefined) st.minigame.startsAt += elapsed;
          if (st.minigame.resultsUntil !== undefined) st.minigame.resultsUntil += elapsed;
          if (st.minigame.arena) {
            st.minigame.arena.lastTick += elapsed;
            for (const p of Object.values(st.minigame.arena.players)) { p.jumpUntil += elapsed; p.lastInput += elapsed; p.lastAction += elapsed; }
          }
          for (const coin of st.minigame.coins) {
            if (coin.appearsAt !== undefined) coin.appearsAt += elapsed;
            if (coin.expiresAt !== undefined) coin.expiresAt += elapsed;
          }
          this.#mgTimer = setTimeout(() => this.#endMinigame(), Math.max(0, (st.minigame.resultsUntil ?? st.minigame.endsAt) - Date.now()));
          this.#scheduleCpuMinigames();
          this.#tickMinigame(st.minigame.id);
          this.#changed();
        } else if (!['lobby', 'ended'].includes(st.phase)) this.#advance();
      }
      return { ok: true, rejoined: true };
    }
    if (st.phase !== 'lobby') {
      return { ok: false, reason: 'La partida ya comenzó' };
    }
    if (st.players.length >= MAX_PLAYERS) {
      return { ok: false, reason: 'Sala llena (máximo 8 jugadores)' };
    }
    const idx = st.players.length;
    const p: PlayerState = {
      id: playerId,
      name: sanitizeName(rawName),
      avatar: avatar || AVATARS[idx % AVATARS.length],
      color: COLORS[idx % COLORS.length],
      coins: 0,
      gold: 0,
      pos: 0,
      acted: false,
      connected: true,
      isHost: !st.players.some((player) => player.isHost && player.connected && !player.isBot),
      isBot: false,
      items: [],
      diceCount: 1,
      frozenTurns: 0,
    };
    st.players.push(p);
    this.#log(`${p.name} entra a la sala`);
    this.#changed();
    return { ok: true, rejoined: false };
  }

  disconnect(playerId: string): void {
    const p = this.#find(playerId);
    if (!p || !p.connected) return;
    p.connected = false;
    this.#log(`${p.name} se desconecta`);
    if (p.isHost) {
      p.isHost = false;
      const next = this.state.players.find((x) => x.connected && !x.isBot);
      if (next) next.isHost = true;
    }
    this.#changed();
    if (this.connectedCount === 0) {
      this.close();
      this.#pausedAt = Date.now();
      return;
    }
    if (this.state.players[this.state.turn]?.id === playerId && !['lobby', 'ended', 'minigame'].includes(this.state.phase)) {
      this.close();
      this.state.trivia = null;
      this.state.phase = 'resolving';
      this.#after(400, () => this.#advance());
    }
  }

  start(playerId: string, rounds?: number, boardTheme?: string, withCpu = false): ActionResult {
    const st = this.state;
    const p = this.#find(playerId);
    if (!p?.isHost || !p.connected) return { ok: false, reason: 'Solo el anfitrión puede iniciar' };
    if (st.phase !== 'lobby' && st.phase !== 'ended') {
      return { ok: false, reason: 'La partida ya comenzó' };
    }
    const humanCount = st.players.filter((player) => player.connected && !player.isBot).length;
    if (humanCount < 1 || (!withCpu && humanCount < MIN_PLAYERS)) {
      return { ok: false, reason: 'Invita a otro jugador o activa la partida contra CPU' };
    }
    this.close();
    this.#pausedAt = null;
    st.players = st.players.filter((player) => !player.isBot && player.connected);
    if (withCpu) {
      if (st.players.length >= MAX_PLAYERS) return { ok: false, reason: 'No hay lugar para otro jugador CPU' };
      const idx = st.players.length;
      st.players.push({
        id: `cpu-${Math.random().toString(36).slice(2, 10)}`,
        name: 'CPU', avatar: 'skipper', color: COLORS[idx % COLORS.length], coins: 0, gold: 0,
        pos: 0, acted: false, connected: true, isHost: false, isBot: true, items: [], diceCount: 1, frozenTurns: 0,
      });
    }
    st.maxRounds =
      rounds && (ROUND_OPTIONS as readonly number[]).includes(rounds) ? rounds : DEFAULT_ROUNDS;
    st.boardTheme = BOARD_THEMES.some((theme) => theme.id === boardTheme)
      ? (boardTheme as RoomState['boardTheme'])
      : DEFAULT_BOARD_THEME;
    st.board = buildBoard(st.boardTheme);
    st.goldCoinPos = Math.floor(Math.random() * st.board.length);
    st.blockedTiles = [];
    st.round = 1;
    st.phase = 'playing';
    st.winnerId = null;
    st.dice = null;
    st.minigame = null;
    this.#minigameBag = [];
    st.trivia = null;
    st.pathChoice = null;
    st.movement = null;
    for (const x of st.players) {
      x.coins = 0;
      x.gold = 0;
      x.stats = { minigameCoins: 0, blueSpaces: 0, triviaCorrect: 0 };
      x.pos = 0;
      x.acted = false;
      x.items = [];
      x.diceCount = 1;
      x.frozenTurns = 0;
    }
    st.turn = this.#firstConnected();
    this.#log('¡Empieza la partida!');
    this.#changed();
    this.#scheduleCpuTurn();
    return { ok: true };
  }

  roll(playerId: string): ActionResult {
    const st = this.state;
    if (st.phase !== 'playing') return { ok: false, reason: 'No es momento de tirar' };
    if (st.dice !== null) return { ok: false, reason: 'Ya se está tirando' };
    const idx = this.#indexOf(playerId);
    if (idx === -1) return { ok: false, reason: 'No estás en la partida' };
    if (idx !== st.turn) return { ok: false, reason: 'No es tu turno' };
    const p = st.players[idx];
    if (!p.connected) return { ok: false, reason: 'Estás desconectado' };
    if (p.frozenTurns > 0) {
      p.frozenTurns -= 1;
      st.phase = 'resolving';
      this.#changed();
      this.#after(EFFECT_DELAY_MS, () => this.#advance());
      return { ok: true };
    }

    const values = Array.from({ length: Math.max(1, Math.min(3, p.diceCount)) }, () => 1 + Math.floor(Math.random() * 6));
    const value = values.reduce((a, b) => a + b, 0);
    st.diceRoll = { values, startedAt: Date.now(), duration: ROLL_DELAY_MS };
    p.diceCount = 1;
    st.dice = value;
    st.phase = 'resolving';
    this.#log(`${p.name} saca un ${value}`);
    this.#changed();
    this.#after(ROLL_DELAY_MS, () => this.#move(p.id, value));
    return { ok: true };
  }

  claim(playerId: string, coinId: number): void {
    const st = this.state;
    if (st.phase !== 'minigame' || !st.minigame || st.minigame.kind === 'memory' || Date.now() >= st.minigame.endsAt) return;
    const coin = st.minigame.coins.find((c) => c.id === coinId);
    if (!coin || coin.by) return;
    if (Date.now() < (coin.appearsAt ?? 0) || Date.now() >= (coin.expiresAt ?? Infinity)) return;
    const p = this.#find(playerId);
    if (!p || !p.connected) return;
    coin.by = playerId;
    st.minigame.collected[playerId] = (st.minigame.collected[playerId] ?? 0) + coin.value;
    this.#changed();
  }

  flipCard(playerId: string, cardId: number): void {
    const mg = this.state.minigame;
    if (this.state.phase !== 'minigame' || !mg || mg.kind !== 'memory' || Date.now() >= mg.endsAt) return;
    if (!this.#find(playerId)?.connected || !Number.isInteger(cardId) || cardId < 0 || cardId >= mg.cards.length) return;
    if (mg.matched.includes(cardId) || mg.revealed.includes(cardId) || mg.revealed.length >= 2) return;
    mg.revealed.push(cardId);
    if (mg.revealed.length === 2) {
      const [a, b] = mg.revealed;
      if (mg.cards[a] === mg.cards[b]) {
        mg.matched.push(a, b);
        mg.collected[playerId] = (mg.collected[playerId] ?? 0) + 2;
        mg.revealed = [];
      } else {
        this.#after(750, () => {
          if (this.state.minigame?.id !== mg.id) return;
          mg.revealed = [];
          this.#changed();
        });
      }
    }
    this.#changed();
  }

  buyItem(playerId: string, itemId: string): ActionResult {
    const st = this.state;
    const player = this.#find(playerId);
    const item = STORE_ITEMS.find((entry) => entry.id === itemId);
    if (st.phase !== 'store' || st.players[st.turn]?.id !== playerId) return { ok: false, reason: 'La tienda no está abierta para ti' };
    if (!player || !item) return { ok: false, reason: 'Objeto no disponible' };
    if (player.coins < item.price) return { ok: false, reason: `Necesitas ${item.price} monedas` };
    if (player.items.length >= 3) return { ok: false, reason: 'Tu inventario está lleno (máximo 3 objetos)' };
    player.coins -= item.price;
    player.items.push(item.id);
    this.#log(`${player.name} compra ${item.name} por ${item.price} monedas`);
    this.#changed();
    return { ok: true };
  }

  closeStore(playerId: string): void {
    if (this.state.phase !== 'store' || this.state.players[this.state.turn]?.id !== playerId) return;
    this.state.phase = 'resolving';
    this.#changed();
    this.#after(EFFECT_DELAY_MS, () => this.#advance());
  }

  resolveGoldCoin(playerId: string, buy: boolean): void {
    const st = this.state;
    const player = this.#find(playerId);
    if (st.phase !== 'goldCoin' || st.players[st.turn]?.id !== playerId || !player) return;
    if (buy) {
      if (player.coins < 20) return;
      player.coins -= 20;
      player.gold += 1;
      st.goldCoinPos = Math.floor(Math.random() * st.board.length);
      this.#log(`${player.name} compra una moneda dorada por 20 monedas`);
    } else this.#log(`${player.name} deja pasar la moneda dorada`);
    st.phase = 'resolving';
    this.#changed();
    this.#after(EFFECT_DELAY_MS, () => this.#remainingSteps > 0 ? this.#move(playerId, this.#remainingSteps) : this.#resolveTile(playerId));
  }

  useItem(playerId: string, itemId: string, targetId?: string): ActionResult {
    const st = this.state;
    const player = this.#find(playerId);
    if (st.phase !== 'playing' || st.players[st.turn]?.id !== playerId || st.dice !== null) return { ok: false, reason: 'Usa los objetos durante tu turno antes de tirar' };
    const index = player?.items.indexOf(itemId as StoreItemId) ?? -1;
    if (!player || index < 0) return { ok: false, reason: 'No tienes ese objeto' };
    const target = targetId ? this.#find(targetId) : undefined;
    if ((itemId === 'thief' || itemId === 'freeze') && (!target || target.id === playerId || !target.connected)) return { ok: false, reason: 'Elige un rival conectado' };
    const blockedPosition = itemId === 'block' ? Number(targetId) : -1;
    if (itemId === 'block' && (!Number.isInteger(blockedPosition) || blockedPosition < 0 || blockedPosition >= st.board.length)) return { ok: false, reason: 'Elige una casilla válida para el bloqueo' };
    player.items.splice(index, 1);
    if (itemId === 'double') player.diceCount = 2;
    else if (itemId === 'triple') player.diceCount = 3;
    else if (itemId === 'thief' && target) {
      const stolen = Math.min(5, target.coins);
      target.coins -= stolen;
      player.coins += stolen;
      this.#log(`${player.name} roba ${stolen} monedas a ${target.name}`);
    } else if (itemId === 'freeze' && target) {
      target.frozenTurns += 1;
      this.#log(`${player.name} congela el próximo turno de ${target.name}`);
    } else if (itemId === 'random') {
      st.goldCoinPos = Math.floor(Math.random() * st.board.length);
      this.#log(`${player.name} cambia de lugar la moneda dorada`);
    } else if (itemId === 'block') {
      st.blockedTiles.push(blockedPosition);
      this.#log(`${player.name} bloquea la casilla ${blockedPosition + 1} hasta el final de la ronda`);
    } else if (itemId === 'double' || itemId === 'triple') {
      this.#log(`${player.name} prepara ${itemId === 'double' ? 'dos' : 'tres'} dados para su siguiente tirada`);
    }
    this.#changed();
    return { ok: true };
  }

  answerTrivia(playerId: string, answer: number): void {
    const trivia = this.state.trivia;
    const player = this.#find(playerId);
    if (this.state.phase !== 'trivia' || !trivia || trivia.playerId !== playerId || !player) return;
    const correct = trivia.question.answers[answer]?.correct === true;
    if (correct) {
      player.coins += 5;
      player.stats ??= { minigameCoins: 0, blueSpaces: 0, triviaCorrect: 0 };
      player.stats.triviaCorrect++;
      this.#log(`${player.name} responde correctamente a la trivia (+5 monedas)`);
    } else this.#log(`${player.name} falla la trivia`);
    this.state.trivia = null;
    this.state.phase = 'resolving';
    this.#changed();
    this.#after(EFFECT_DELAY_MS, () => this.#advance());
  }

  chat(playerId: string, raw: string): void {
    const p = this.#find(playerId);
    if (!p) return;
    const text = makeChatText(raw);
    if (!text) return;
    this.state.chat.push({ id: Date.now() * 1000 + this.state.chat.length, name: p.name, text, at: Date.now() });
    if (this.state.chat.length > MAX_CHAT) this.state.chat.splice(0, this.state.chat.length - MAX_CHAT);
    this.#changed();
  }

  // ---- secuencia de turno ------------------------------------------------

  choosePath(playerId: string, target: number): ActionResult {
    const choice = this.state.pathChoice;
    if (this.state.phase !== 'choosingPath' || !choice || choice.playerId !== playerId || !choice.options.includes(target)) {
      return { ok: false, reason: 'Elige uno de los caminos disponibles' };
    }
    this.state.pathChoice = null;
    this.state.phase = 'resolving';
    this.#move(playerId, choice.remaining, target);
    return { ok: true };
  }

  #move(playerId: string, remaining: number, selected?: number): void {
    const p = this.#find(playerId);
    if (!p || this.state.phase !== 'resolving') return;
    if (remaining <= 0) { this.#resolveTile(playerId); return; }
    const options = BOARD_PATHS[this.state.boardTheme].nodes[p.pos].next;
    if (options.length > 1 && selected === undefined) {
      this.state.phase = 'choosingPath';
      this.state.pathChoice = { playerId, options: [...options], remaining };
      this.#changed();
      if (p.isBot) this.#after(650, () => this.choosePath(playerId, options[Math.floor(Math.random() * options.length)]));
      return;
    }
    const target = selected ?? options[0];
    this.state.movement = { playerId, from: p.pos, to: target, startedAt: Date.now(), duration: MOVE_DELAY_MS };
    this.#changed();
    this.#after(MOVE_DELAY_MS, () => {
      p.pos = target;
      this.state.movement = null;
      const blocked = this.state.blockedTiles.indexOf(p.pos);
      if (blocked >= 0) {
        this.state.blockedTiles.splice(blocked, 1);
        remaining = 1;
        this.#log(`${p.name} encuentra un bloqueo y se detiene`);
      }
      this.#remainingSteps = remaining - 1;
      this.#changed();
      if (p.pos === this.state.goldCoinPos) this.#effect(playerId);
      else if (this.#remainingSteps > 0) this.#move(playerId, this.#remainingSteps);
      else this.#after(EFFECT_DELAY_MS, () => this.#resolveTile(playerId));
    });
  }

  #effect(playerId: string): void {
    const p = this.#find(playerId);
    if (!p) return;
    if (p.pos === this.state.goldCoinPos) {
      this.state.phase = 'goldCoin';
      this.#changed();
      this.#scheduleCpuTurn();
      return;
    }
    this.#resolveTile(playerId);
  }

  #resolveTile(playerId: string): void {
    const p = this.#find(playerId);
    if (!p) return;
    const tile = this.state.board[p.pos];
    this.state.dice = null;
    let extraRoll = false;
    switch (tile.type) {
      case 'blue':
        p.stats ??= { minigameCoins: 0, blueSpaces: 0, triviaCorrect: 0 };
        p.stats.blueSpaces++;
        p.coins += 5;
        this.#log(`${p.name} gana 5 monedas`);
        break;
      case 'red':
        p.coins = Math.max(0, p.coins - 5);
        this.#log(`${p.name} pierde 5 monedas`);
        break;
      case 'shop':
        this.state.phase = 'store';
        this.#log(`${p.name} visita la tienda`);
        this.#changed();
        this.#scheduleCpuTurn();
        return;
        break;
      case 'goodBad':
        extraRoll = this.#applyOriginalOutcome(p, tile.group ?? '', 'goodBad');
        break;
      case 'trivia':
        this.state.phase = 'trivia';
        this.state.trivia = { playerId: p.id, question: randomTrivia(this.state.boardTheme) };
        this.#changed();
        this.#scheduleCpuTurn();
        return;
      case 'surprise': {
        extraRoll = this.#applyOriginalOutcome(p, tile.group ?? '', 'surprise');
        break;
      }
      case 'challenge':
        this.#startMinigame(true);
        return;
      case 'extraRoll':
        extraRoll = true;
        this.#log(`${p.name} tira de nuevo`);
        break;
    }
    this.state.dice = null;
    this.#changed();
    if (extraRoll) {
      this.state.phase = 'playing';
      this.#changed();
      this.#scheduleCpuTurn();
      return;
    }
    this.#after(EFFECT_DELAY_MS, () => this.#advance());
  }

  #applyOriginalOutcome(player: PlayerState, group: string, fallback: 'goodBad' | 'surprise'): boolean {
    const options = tileOutcomes(this.state.boardTheme, group);
    if (!options.length) {
      if (fallback === 'goodBad') {
        const delta = Math.random() < 0.5 ? 3 : -3;
        player.coins = Math.max(0, player.coins + delta);
        this.#log(`${player.name} ${delta > 0 ? 'gana' : 'pierde'} ${Math.abs(delta)} monedas`);
      } else {
        const result = Math.floor(Math.random() * 3);
        if (result === 0) { player.coins += 3; this.#log(`${player.name} encuentra 3 monedas`); }
        else if (result === 1) { player.coins = Math.max(0, player.coins - 3); this.#log(`${player.name} pierde 3 monedas`); }
        else { this.state.goldCoinPos = Math.floor(Math.random() * this.state.board.length); this.#log('La moneda dorada cambia de lugar'); }
      }
      return false;
    }
    const total = options.reduce((sum, option) => sum + option.weight, 0);
    let pick = Math.random() * total;
    const chosen = options.find((option) => (pick -= option.weight) < 0) ?? options[options.length - 1];
    const effect = chosen.effect;
    const amount = Number(effect.match(/^(?:\+|-)(\d+)c$/)?.[1] ?? (1 + Math.floor(Math.random() * 5)));
    if (effect === 'er') { this.#log(`${player.name} consigue una tirada extra`); return true; }
    if (effect === '+gc') { player.gold += 1; this.#log(`${player.name} gana una moneda dorada`); return false; }
    if (effect === '-gc') { player.gold = Math.max(0, player.gold - 1); this.#log(`${player.name} pierde una moneda dorada`); return false; }
    if (effect === 'mgc') { this.state.goldCoinPos = Math.floor(Math.random() * this.state.board.length); this.#log('La moneda dorada cambia de lugar'); return false; }
    if (effect.startsWith('+')) { player.coins += amount; this.#log(`${player.name} gana ${amount} monedas`); }
    else if (effect.startsWith('-')) { const lost = Math.min(amount, player.coins); player.coins -= lost; this.#log(`${player.name} pierde ${lost} monedas`); }
    else this.#log(`${player.name} obtiene un resultado especial`);
    return false;
  }

  #advance(): void {
    const st = this.state;
    st.dice = null;
    st.trivia = null;
    st.pathChoice = null;
    st.movement = null;
    const cur = st.players[st.turn];
    if (cur) cur.acted = true;

    let next = -1;
    for (let k = 1; k <= st.players.length; k++) {
      const i = (st.turn + k) % st.players.length;
      const p = st.players[i];
      if (!p.acted && p.connected) {
        if (p.frozenTurns > 0) {
          p.frozenTurns -= 1;
          p.acted = true;
          this.#log(`${p.name} pierde su turno por congelación`);
          continue;
        }
        next = i;
        break;
      }
    }

    if (next === -1) {
      for (const p of st.players) p.acted = false;
      st.blockedTiles = [];
      this.#startMinigame();
      return;
    }
    st.turn = next;
    st.phase = 'playing';
    this.#changed();
    this.#scheduleCpuTurn();
  }

  // ---- minijuego en tiempo real -----------------------------------------

  #startMinigame(endsRound = false): void {
    const st = this.state;
    st.phase = 'minigame';
    if (!this.#minigameBag.length) {
      this.#minigameBag = MINIGAMES.map(game => game.id);
      for (let i = this.#minigameBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.#minigameBag[i], this.#minigameBag[j]] = [this.#minigameBag[j], this.#minigameBag[i]];
      }
    }
    const kind = this.#minigameBag.pop()!;
    const game = MINIGAMES.find(game => game.id === kind)!;
    const startsAt = Date.now() + PREPARATION_MS;
    const mg: MinigameState = {
      id: ++this.#minigameSeq, kind: game.id, name: game.name,
      desc: game.desc, startsAt, endsAt: startsAt + game.seconds * 1000,
      coins: [], cards: [], revealed: [], matched: [], endsRound,
      collected: Object.fromEntries(st.players.map(p => [p.id, 0])),
      arena: createArena(st.players.map(p => p.id), game.id, startsAt),
    };
    st.minigame = mg;
    this.#log(`¡Minijuego: ${mg.name}!`);
    this.#changed();
    this.#scheduleCpuMinigames();
    this.#tickMinigame(mg.id);
    this.#mgTimer = setTimeout(() => this.#endMinigame(), mg.endsAt - Date.now());
  }

  miniInput(playerId: string, input: MiniInput): void {
    const mg = this.state.minigame;
    if (this.state.phase !== 'minigame' || !mg || !this.#find(playerId)?.connected) return;
    if (arenaInput(mg, playerId, input, Date.now())) this.#changed();
  }

  #tickMinigame(id: number): void {
    const mg = this.state.minigame;
    if (!mg || mg.id !== id || this.state.phase !== 'minigame' || mg.resultsUntil || this.#pausedAt !== null) return;
    tickArena(mg, this.state.players, Date.now());
    if (mg.arena?.winner && Date.now() >= (mg.startsAt ?? 0)) {
      this.#endMinigame(); return;
    }
    this.#changed();
    this.#after(100, () => this.#tickMinigame(id));
  }


  #scheduleCpuTurn(): void {
    const st = this.state;
    if (st.phase === 'minigame') {
      this.#scheduleCpuMinigames();
      return;
    }
    if (st.phase === 'goldCoin') {
      const player = st.players[st.turn];
      if (player?.isBot) this.#after(650, () => this.resolveGoldCoin(player.id, player.coins >= 20));
      return;
    }
    if (st.phase === 'store') {
      const player = st.players[st.turn];
      if (player?.isBot) this.#after(550, () => {
        if (this.state.phase !== 'store' || this.state.players[this.state.turn]?.id !== player.id) return;
        const priorities: StoreItemId[] = ['triple', 'double', 'thief', 'freeze', 'random', 'block'];
        for (const id of priorities) {
          const definition = STORE_ITEMS.find((item) => item.id === id)!;
          if (player.items.length >= 3 || player.coins < definition.price) continue;
          this.buyItem(player.id, id);
        }
        this.closeStore(player.id);
      });
      return;
    }
    if (st.phase === 'trivia') {
      const trivia = st.trivia;
      if (trivia && this.#find(trivia.playerId)?.isBot) this.#after(700, () => {
        const answers = trivia.question.answers;
        const correct = answers.findIndex((answer) => answer.correct);
        const answer = Math.random() < 0.7 || correct < 0 ? correct : Math.floor(Math.random() * answers.length);
        this.answerTrivia(trivia.playerId, answer);
      });
      return;
    }
    if (st.phase === 'playing') {
      const player = st.players[st.turn];
      if (player?.isBot && st.dice === null) this.#after(700, () => this.#cpuTurn(player.id));
    }
  }

  #cpuTurn(playerId: string): void {
    const player = this.#find(playerId);
    if (!player?.isBot || this.state.phase !== 'playing' || this.state.players[this.state.turn]?.id !== playerId || this.state.dice !== null) return;
    const rival = this.state.players.find((candidate) => !candidate.isBot && candidate.connected);
    let item: StoreItemId | undefined;
    let targetId: string | undefined;
    if (player.items.includes('triple')) item = 'triple';
    else if (player.items.includes('double')) item = 'double';
    else if (rival && player.items.includes('thief') && rival.coins > 0) { item = 'thief'; targetId = rival.id; }
    else if (rival && player.items.includes('freeze')) { item = 'freeze'; targetId = rival.id; }
    else if (player.items.includes('random')) item = 'random';
    else if (player.items.includes('block')) { item = 'block'; targetId = String((player.pos + 4) % this.state.board.length); }
    if (item) this.useItem(playerId, item, targetId);
    this.#after(item ? 420 : 100, () => this.roll(playerId));
  }

  #scheduleCpuMinigames(): void {
    const mg = this.state.minigame;
    if (!mg) return;
    for (const bot of this.state.players.filter((player) => player.isBot)) {
      this.#after(350 + Math.floor(Math.random() * 180), () => this.#cpuMinigameStep(bot.id, mg.id));
    }
  }

  #cpuMinigameStep(playerId: string, gameId: number): void {
    const mg = this.state.minigame;
    if (this.state.phase !== 'minigame' || !mg || mg.id !== gameId || mg.endsAt <= Date.now()) return;
    if (mg.arena) {
      const input = cpuInput(mg, playerId, Date.now());
      if (input) this.miniInput(playerId, input);
      this.#after(260 + Math.random() * 240, () => this.#cpuMinigameStep(playerId, gameId));
      return;
    }
    if (mg.kind === 'memory') {
      if (mg.revealed.length >= 2) {
        this.#after(300, () => this.#cpuMinigameStep(playerId, gameId));
        return;
      }
      const available = mg.cards.map((_, index) => index).filter((index) => !mg.revealed.includes(index) && !mg.matched.includes(index));
      if (available.length) this.flipCard(playerId, available[Math.floor(Math.random() * available.length)]);
      if (this.state.minigame && this.state.minigame.matched.length < mg.cards.length) this.#after(420, () => this.#cpuMinigameStep(playerId, gameId));
      return;
    }
    const target = mg.coins.find((coin) => coin.by === null && Date.now() >= (coin.appearsAt ?? 0) && Date.now() < (coin.expiresAt ?? Infinity));
    if (target) this.claim(playerId, target.id);
    this.#after(260, () => this.#cpuMinigameStep(playerId, gameId));
  }

  #endMinigame(): void {
    const st = this.state;
    const mg = st.minigame;
    if (!mg) return;
    if (this.#mgTimer) clearTimeout(this.#mgTimer);
    this.#mgTimer = null;

    if (!mg.resultsUntil) {
      tickArena(mg, st.players, Math.min(Date.now(), mg.endsAt));
      mg.endsAt = Date.now();
      mg.resultsUntil = Date.now() + RESULTS_MS;
      for (const p of st.players) {
        const score = mg.collected[p.id] ?? 0;
        const gained = mg.arena ? Math.min(20, Math.floor(score / (mg.kind === 'lolly' || mg.kind === 'pizza_pursuit' || mg.kind === 'king_of_the_heap' || mg.kind === 'bouncybed' ? 5 : 1))) : score;
        p.coins += gained;
        p.stats ??= { minigameCoins: 0, blueSpaces: 0, triviaCorrect: 0 };
        p.stats.minigameCoins += gained;
        this.#log(`${p.name}: ${score} puntos, +${gained} monedas`);
      }
      this.#changed();
      this.#mgTimer = setTimeout(() => this.#endMinigame(), RESULTS_MS);
      return;
    }

    st.minigame = null;
    st.phase = 'resolving';
    st.dice = null;
    if (mg.endsRound) {
      this.#changed();
      this.#after(EFFECT_DELAY_MS, () => this.#advance());
    } else {
      if (st.round >= st.maxRounds) {
        this.#endGame();
        return;
      }
      st.round += 1;
      for (const p of st.players) p.acted = false;
      st.turn = this.#firstConnected();
      st.phase = 'playing';
      this.#changed();
      this.#scheduleCpuTurn();
    }
  }

  #endGame(): void {
    const st = this.state;
    if (st.phase === 'ended') return;
    for (const [key, label] of [['minigameCoins', 'monedas de minijuegos'], ['blueSpaces', 'casillas azules'], ['triviaCorrect', 'trivias acertadas']] as const) {
      const best = Math.max(0, ...st.players.map(p => p.stats?.[key] ?? 0));
      if (best <= 0) continue;
      for (const p of st.players.filter(p => p.stats?.[key] === best)) {
        p.gold++;
        this.#log(`${p.name}: moneda dorada de bonificación por ${label} (${best})`);
      }
    }
    st.phase = 'ended';
    st.dice = null;
    st.minigame = null;
    let winner: PlayerState | null = null;
    for (const p of st.players) {
      if (!winner) {
        winner = p;
        continue;
      }
      if (p.gold > winner.gold || (p.gold === winner.gold && p.coins > winner.coins)) {
        winner = p;
      }
    }
    st.winnerId = winner && st.players.filter((p) => p.gold === winner!.gold && p.coins === winner!.coins).length === 1 ? winner.id : null;
    this.#log('Fin de la partida');
    this.#changed();
  }

  // ---- utilidades --------------------------------------------------------

  #log(text: string): void {
    this.state.log.push(text);
    if (this.state.log.length > MAX_LOG) {
      this.state.log.splice(0, this.state.log.length - MAX_LOG);
    }
  }

  #changed(): void {
    this.state.version += 1;
    this.onChange?.();
  }

  #after(ms: number, fn: () => void): void {
    const handle = setTimeout(() => {
      this.#seqTimers = this.#seqTimers.filter((t) => t !== handle);
      fn();
    }, ms);
    this.#seqTimers.push(handle);
  }

  #normalizeState(): void {
    const validTheme = BOARD_THEMES.some((theme) => theme.id === this.state.boardTheme);
    const validTileTypes = new Set(['red', 'blue', 'shop', 'goodBad', 'trivia', 'surprise', 'challenge', 'extraRoll']);
    const validBoard = this.state.board.every((tile) => validTileTypes.has(tile.type));
    if (!validTheme || !validBoard) {
      this.state.boardTheme = DEFAULT_BOARD_THEME;
      this.state.board = buildBoard(DEFAULT_BOARD_THEME);
      for (const player of this.state.players) player.pos %= this.state.board.length;
    }
    if (!Number.isInteger(this.state.goldCoinPos)) this.state.goldCoinPos = 0;
    this.state.blockedTiles ??= [];
    for (const player of this.state.players) {
      player.isBot ??= false;
      player.items ??= [];
      player.diceCount ??= 1;
      player.frozenTurns ??= 0;
    }
    this.state.trivia ??= null;
  }

  close(): void {
    for (const t of this.#seqTimers) clearTimeout(t);
    this.#seqTimers = [];
    if (this.#mgTimer) clearTimeout(this.#mgTimer);
    this.#mgTimer = null;
  }
}
