import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3001';

// In development the storefront runs on :3000 and proxies /api to the NestJS API,
// so the browser always talks to a single origin (same as in Docker and production).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
  preview: { port: 3000, proxy: { '/api': { target: apiTarget, changeOrigin: true } } },
  build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 900 },
});
