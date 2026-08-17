import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(rootDir, 'web');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const apiPort = env.API_PORT || '3010';
  const webPort = parseInt(env.WEB_PORT || '3000', 10);
  const apiTarget = env.API_URL || `http://127.0.0.1:${apiPort}`;

  return {
    plugins: [react()],
    root: webRoot,
    publicDir: path.resolve(rootDir, 'public'),
    resolve: {
      alias: {
        '@': webRoot,
      },
    },
    build: {
      outDir: path.resolve(rootDir, 'dist'),
      emptyOutDir: true,
    },
    server: {
      host: true,
      port: webPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          xfwd: true,
          timeout: 1_200_000,
          proxyTimeout: 1_200_000,
        },
        '/health': {
          target: apiTarget,
          changeOrigin: true,
          xfwd: true,
          timeout: 1_200_000,
          proxyTimeout: 1_200_000,
        },
      },
    },
    preview: {
      host: true,
      port: webPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          xfwd: true,
          timeout: 1_200_000,
          proxyTimeout: 1_200_000,
        },
        '/health': {
          target: apiTarget,
          changeOrigin: true,
          xfwd: true,
          timeout: 1_200_000,
          proxyTimeout: 1_200_000,
        },
      },
    },
  };
});
