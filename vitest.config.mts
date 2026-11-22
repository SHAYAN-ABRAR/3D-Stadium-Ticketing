import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    // The layout builds ~80k seats and the holds tests boot an in-memory Postgres (PGlite).
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
