import type { ClientMsg, ServerMsg } from '../shared/protocol';

export type NetStatus = 'connecting' | 'online' | 'offline';

export interface JoinPayload {
  room: string;
  playerId: string;
  name: string;
  avatar: string;
  sessionToken: string;
}

function wsUrl(): string {
  const endpoint = import.meta.env.VITE_WS_URL;
  if (endpoint) return endpoint;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/api/ws`;
}

/**
 * Las conexiones WS de Vercel se cierran al alcanzar la duración máxima de la
 * función (300s en Hobby), así que tratamos el cierre como algo esperado:
 * reconectamos con backoff y reenviamos el `join` para retomar la partida.
 */
export class NetClient {
  #onMsg: (m: ServerMsg) => void;
  #onStatus: (s: NetStatus) => void;
  #ws: WebSocket | null = null;
  #join: JoinPayload | null = null;
  #outbox: ClientMsg[] = [];
  #retry = 1000;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #ping: ReturnType<typeof setInterval> | null = null;
  #stopped = false;
  #started = false;
  readonly #url = wsUrl();

  constructor(onMsg: (m: ServerMsg) => void, onStatus: (s: NetStatus) => void) {
    this.#onMsg = onMsg;
    this.#onStatus = onStatus;
  }

  get joined(): boolean {
    return this.#join !== null;
  }

  setJoin(join: JoinPayload | null): void {
    this.#join = join;
    this.#outbox = [];
    if (join && this.#ws?.readyState === WebSocket.OPEN) this.#send({ t: 'join', ...join });
  }

  connect(): void {
    if (this.#stopped) return;
    if (this.#started && this.#ws && this.#ws.readyState !== WebSocket.CLOSED) return;
    this.#started = true;
    this.#onStatus('connecting');

    const ws = new WebSocket(this.#url);
    this.#ws = ws;

    ws.onopen = () => {
      this.#retry = 1000;
      this.#onStatus('online');
      if (this.#join) this.#send({ t: 'join', ...this.#join });
      for (const msg of this.#outbox.splice(0)) this.#send(msg);
      this.#startPing();
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return;
      try {
        const message = JSON.parse(ev.data) as ServerMsg;
        if (message.t === 'welcome' && this.#join) {
          this.#join.room = message.room;
          this.#join.playerId = message.playerId;
        }
        this.#onMsg(message);
      } catch {
        /* ignora payloads inválidos */
      }
    };

    ws.onclose = (event) => {
      this.#stopPing();
      this.#onStatus('offline');
      if (this.#stopped || event.code === 4001) return;
      const delay = this.#retry + Math.random() * 400;
      this.#retry = Math.min(this.#retry * 2, 30_000);
      this.#timer = setTimeout(() => this.connect(), delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  send(msg: ClientMsg): void {
    if (this.#ws?.readyState === WebSocket.OPEN) this.#send(msg);
    // Game actions expire with the connection; replaying an old roll is unsafe.
  }

  stop(): void {
    this.#stopped = true;
    this.#stopPing();
    if (this.#timer) clearTimeout(this.#timer);
    this.#ws?.close();
  }

  #send(msg: ClientMsg): void {
    this.#ws?.send(JSON.stringify(msg));
  }

  #startPing(): void {
    this.#stopPing();
    this.#ping = setInterval(() => this.#send({ t: 'ping' }), 20_000);
  }

  #stopPing(): void {
    if (this.#ping) {
      clearInterval(this.#ping);
      this.#ping = null;
    }
  }
}
