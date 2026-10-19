// Minimal RESP fixture for exercising ioredis transport locally without a service.
// It models leases and pub/sub; it is not a Redis durability/performance test.
import net from 'node:net';

export async function redisFixture() {
  const sockets = new Set<net.Socket>();
  const subscriptions = new Map<net.Socket, Set<string>>();
  const values = new Map<string, { value: string; expires: number }>();
  const bulk = (s: string) => `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
  const array = (parts: Array<string | number>) => `*${parts.length}\r\n` + parts.map((p) => typeof p === 'number' ? `:${p}\r\n` : bulk(p)).join('');
  const get = (key: string) => {
    const entry = values.get(key);
    if (entry && entry.expires <= Date.now()) { values.delete(key); return undefined; }
    return entry;
  };
  const server = net.createServer((socket) => {
    sockets.add(socket);
    let buffer = Buffer.alloc(0);
    socket.on('close', () => { sockets.delete(socket); subscriptions.delete(socket); });
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length) {
        const first = buffer.indexOf('\r\n');
        if (first < 0) return;
        const count = Number(buffer.subarray(1, first).toString());
        let offset = first + 2;
        const args: string[] = [];
        for (let i = 0; i < count; i++) {
          const end = buffer.indexOf('\r\n', offset);
          if (end < 0) return;
          const length = Number(buffer.subarray(offset + 1, end).toString());
          if (buffer.length < end + 2 + length + 2) return;
          args.push(buffer.subarray(end + 2, end + 2 + length).toString());
          offset = end + 2 + length + 2;
        }
        buffer = buffer.subarray(offset);
        const [command, ...a] = args;
        switch (command.toLowerCase()) {
          case 'info': socket.write(bulk('redis_version:7.2.0\r\nloading:0\r\n')); break;
          case 'client': case 'select': case 'auth': socket.write('+OK\r\n'); break;
          case 'get': socket.write(get(a[0]) ? bulk(get(a[0])!.value) : '$-1\r\n'); break;
          case 'set': {
            if (a.includes('NX') && get(a[0])) socket.write('$-1\r\n');
            else {
              const px = a.indexOf('PX');
              values.set(a[0], { value: a[1], expires: px >= 0 ? Date.now() + Number(a[px + 1]) : Infinity });
              socket.write('+OK\r\n');
            }
            break;
          }
          case 'subscribe': subscriptions.set(socket, new Set(a)); a.forEach((c) => socket.write(array(['subscribe', c, a.length]))); break;
          case 'publish': {
            let delivered = 0;
            for (const [peer, channels] of subscriptions) if (channels.has(a[0])) { peer.write(array(['message', a[0], a[1]])); delivered++; }
            socket.write(`:${delivered}\r\n`); break;
          }
          case 'eval': {
            const entry = get(a[2]);
            const ok = entry?.value === a[3];
            if (ok && a[0].includes('pexpire')) entry.expires = Date.now() + 15000;
            else if (ok) values.delete(a[2]);
            socket.write(`:${ok ? 1 : 0}\r\n`); break;
          }
          case 'quit': socket.end('+OK\r\n'); break;
          default: socket.write('-ERR unsupported fixture command\r\n');
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `redis://127.0.0.1:${(server.address() as net.AddressInfo).port}`,
    close: async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>((resolve) => server.close(() => resolve())); },
  };
}
