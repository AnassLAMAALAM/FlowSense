import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// The dashboard shows the release version from package.json (e.g. "v1.1").
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// In development the dashboard proxies REST + WebSocket traffic to the backend.
const backend = process.env.VITE_BACKEND_URL || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': backend,
      '/socket.io': { target: backend, ws: true },
    },
  },
});
