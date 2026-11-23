import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Minimal Vite config for the extracted content UI.
 *
 * MESH's own vite.config.ts additionally tunes keep-alive timeouts, emits the
 * sitemap at build time and configures preview headers. Only the API proxy is
 * reproduced here, because the content pages call same-origin `/api/v1/**`.
 */
const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
    },
  },
});
