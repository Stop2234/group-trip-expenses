import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite-конфигурация frontend.
 * В dev-режиме запросы к /api и /mcp проксируются на backend-сервер
 * (http://127.0.0.1:3001), который владеет общим хранилищем данных.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/mcp': 'http://127.0.0.1:3001',
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'oneshot-expenses/**'],
  },
});
