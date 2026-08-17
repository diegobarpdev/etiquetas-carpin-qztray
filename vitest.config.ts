import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['server/**/__tests__/**/*.{test,spec}.{js,ts}', 'server/**/*.{test,spec}.{js,ts}'],
    exclude: ['web/**', 'node_modules/**', 'dist/**', 'src/**'],
  },
  root: resolve(__dirname),
});
