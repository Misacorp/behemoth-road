/// <reference types="vitest/config" />
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Two entries: the game (index.html) and the public skills wiki (wiki.html, served at /wiki).
    rollupOptions: { input: { main: 'index.html', wiki: 'wiki.html' } },
    // The CSP (public/_headers) forbids inline resources: never inline assets.
    assetsInlineLimit: 0,
  },
  test: {
    // The stylesheet guards (src/styles.test.ts, onboarding/css.test.ts) read the stylesheets as text.
    css: { include: [/(styles|onboarding)\.css/] },
  },
  server: {
    // `pnpm dev` in apps/worker serves the API on 8787.
    proxy: { '/api': 'http://localhost:8787' },
  },
});
