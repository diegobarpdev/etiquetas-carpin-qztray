import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['**/__tests__/**/*.{test,spec}.{js,ts}', '**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules/**', 'dist/**'],
  },
  root: resolve(__dirname),
});
