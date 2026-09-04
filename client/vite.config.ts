import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Bind every interface so a phone or tablet on the same network can reach
    // the dev server. Without this Vite listens on loopback only and the site
    // is unreachable from any other device.
    host: true,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:4000', changeOrigin: true },
    },
  },
  preview: { port: 4173, host: true },
});
