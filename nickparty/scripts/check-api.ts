// Verifica que el punto de entrada de Vercel (api/ws.ts) sirva WebSocket
// cuando se usa tal cual lo hace Vercel: export default = http.Server.
import server from '../api/ws';

const port = Number(process.env.PORT ?? 8790);
server.listen(port, () => {
  console.log(`[check-api] api/ws escuchando en ws://localhost:${port}/api/ws`);
});
