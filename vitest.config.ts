import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// The unit suite loads only the Phaser-free core layer (ADR-003).
export default defineConfig({
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@scenes': fileURLToPath(new URL('./src/scenes', import.meta.url)),
      '@render': fileURLToPath(new URL('./src/render', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
