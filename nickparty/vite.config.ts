import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The client always connects to same-origin `/api/ws`.
// In dev we proxy that to the local WebSocket server (server/dev.ts, port 8787).
// In production Vercel routes `/api/ws` to the `api/ws.ts` function.
const WS_DEV_TARGET = process.env.WS_DEV_TARGET ?? 'ws://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/ws': {
        target: WS_DEV_TARGET,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
});
