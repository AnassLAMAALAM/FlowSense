import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the dashboard proxies REST + WebSocket traffic to the backend.
const backend = process.env.VITE_BACKEND_URL || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': backend,
      '/socket.io': { target: backend, ws: true },
    },
  },
});
