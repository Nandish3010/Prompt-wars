import { defineConfig } from 'vitest/config';
import path             from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include:     ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    alias: {
      '@': path.resolve(__dirname, './'),
    },
    coverage: {
      provider:  'v8',
      reporter:  ['text', 'html'],
      include:   ['shared/**', 'app/**', 'components/**'],
      thresholds: { lines: 80 },
    },
  },
});
