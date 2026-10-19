import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import Redis from 'ioredis';

/** A single authority runs all room timers. Other instances relay connections. */
export interface Peer extends EventEmitter {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export function attachTransport(server: Server, connected: (peer: Peer) => void, reset: () => void) {
  const clients = new Set<Peer>();
  const wss = new WebSocketServer({ server, maxPayload: 8192 });
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    wss.on('connection', (ws) => {
      clients.add(ws);
      ws.once('close', () => clients.delete(ws));
      connected(ws);
    });
    server.once('close', () => { for (const ws of wss.clients) ws.terminate(); wss.close(); });
    return { clients };
  }

  const instance = randomUUID();
  const prefix = process.env.REDIS_NAMESPACE ?? 'nickparty:v2';
  const key = `${prefix}:authority`;
  const channel = `${prefix}:transport`;
  const pub = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  const sub = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  const local = new Map<string, { ws: WebSocket; owner: string }>();
  const remote = new Map<string, { peer: Peer; seen: number }>();
  let leaseUntil = 0;
  let stopped = false;
  type Packet = { to: string; kind: 'open' | 'message' | 'close' | 'heartbeat' | 'output' | 'end'; id: string; gateway: string; body?: string; code?: number };
  const publish = (packet: Packet) => pub.publish(channel, JSON.stringify(packet));
  const isAuthority = () => Date.now() < leaseUntil;
  const closeRemote = (id: string) => {
    const entry = remote.get(id);
    if (!entry) return;
    remote.delete(id);
    clients.delete(entry.peer);
    entry.peer.readyState = WebSocket.CLOSED;
    entry.peer.emit('close');
  };
  const revoke = () => {
    leaseUntil = 0;
    for (const entry of remote.values()) entry.peer.close(1012, 'Servidor reconectando');
    for (const { ws } of local.values()) ws.close(1012, 'Servidor reconectando');
    reset();
  };
  pub.on('error', revoke);
  sub.on('error', revoke);
  const ready = new Promise<void>((resolve, reject) => {
    sub.subscribe(channel).then(() => resolve(), reject);
  });
  // Attach a rejection handler immediately, even before the first connection.
  void ready.catch(() => undefined);
  sub.on('message', (_channel, raw) => {
    let packet: Packet;
    try { packet = JSON.parse(raw) as Packet; } catch { return; }
    if (packet.to !== instance) return;
    if (packet.kind === 'output' || packet.kind === 'end') {
      const entry = local.get(packet.id);
      if (!entry) return;
      if (packet.kind === 'end') entry.ws.close(packet.code ?? 1012, packet.body ?? 'Sesion cerrada');
      else if (entry.ws.readyState === WebSocket.OPEN) entry.ws.send(packet.body!);
      return;
    }
    if (!isAuthority()) return;
    if (packet.kind === 'open') {
      if (remote.has(packet.id)) return;
      const peer = new EventEmitter() as Peer;
      peer.readyState = WebSocket.OPEN;
      peer.send = (body) => {
        if (!isAuthority()) return;
        void publish({ ...packet, to: packet.gateway, kind: 'output', body }).catch(revoke);
      };
      peer.close = (code = 1000, reason = '') => {
        void publish({ ...packet, to: packet.gateway, kind: 'end', code, body: reason }).catch(() => undefined);
        closeRemote(packet.id);
      };
      remote.set(packet.id, { peer, seen: Date.now() });
      clients.add(peer);
      connected(peer);
    } else if (packet.kind === 'close') closeRemote(packet.id);
    else {
      const entry = remote.get(packet.id);
      if (!entry) return;
      entry.seen = Date.now();
      if (packet.kind === 'message') entry.peer.emit('message', Buffer.from(packet.body!));
    }
  });

  wss.on('connection', (ws) => {
    const id = randomUUID();
    let chain = (async () => {
      await ready;
      let owner = await pub.get(key);
      if (!owner) {
        if (await pub.set(key, instance, 'PX', 15000, 'NX')) {
          leaseUntil = Date.now() + 10000;
          owner = instance;
        } else owner = await pub.get(key);
      }
      if (!owner || ws.readyState !== WebSocket.OPEN) { ws.close(1013, 'Reintenta la conexion'); return; }
      local.set(id, { ws, owner });
      await publish({ to: owner, kind: 'open', id, gateway: instance });
    })();
    void chain.catch(() => ws.close(1013, 'Servidor no disponible'));
    ws.on('message', (data) => {
      chain = chain.then(async () => {
        const entry = local.get(id);
        if (entry) await publish({ to: entry.owner, kind: 'message', id, gateway: instance, body: data.toString() });
      }).catch(() => ws.close(1013, 'Servidor no disponible'));
    });
    ws.on('close', () => {
      void chain.finally(() => {
        const entry = local.get(id);
        local.delete(id);
        if (entry) void publish({ to: entry.owner, kind: 'close', id, gateway: instance }).catch(() => undefined);
      }).catch(() => undefined);
    });
    ws.on('error', () => undefined);
  });
  const timer = setInterval(() => {
    if (stopped) return;
    void (async () => {
      if (isAuthority()) {
        const renewed = await pub.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('pexpire',KEYS[1],15000) else return 0 end", 1, key, instance);
        if (renewed === 1) leaseUntil = Date.now() + 10000;
        else revoke();
      } else if (remote.size) revoke();
      const owner = await pub.get(key);
      for (const [id, entry] of local) {
        if (entry.owner !== owner) entry.ws.close(1012, 'Servidor reconectando');
        else await publish({ to: entry.owner, kind: 'heartbeat', id, gateway: instance });
      }
      for (const [id, entry] of remote) if (Date.now() - entry.seen > 20000) closeRemote(id);
    })().catch(revoke);
  }, 3000);
  timer.unref();
  server.once('close', () => {
    stopped = true;
    clearInterval(timer);
    revoke();
    void pub.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, key, instance)
      .finally(() => { pub.disconnect(); sub.disconnect(); }).catch(() => undefined);
    wss.close();
  });
  return { clients };
}
