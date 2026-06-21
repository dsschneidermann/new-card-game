import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// Phaser is confined to the presentation layer; src/core stays engine-free (ADR-002).
export default defineConfig({
  // Real art lives in assets/<key-path>.png and is served from the site root (ADR-004).
  publicDir: 'assets',
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@scenes': fileURLToPath(new URL('./src/scenes', import.meta.url)),
      '@render': fileURLToPath(new URL('./src/render', import.meta.url)),
      '@platform': fileURLToPath(new URL('./src/platform', import.meta.url)),
    },
  },
  build: {
    target: 'esnext',
  },
});
