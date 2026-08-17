import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webRoot, '..', '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const apiPort = env.API_PORT || '3010';
  const webPort = parseInt(env.WEB_PORT || '3000', 10);
  const apiTarget = env.API_URL || `http://127.0.0.1:${apiPort}`;
  const internalApiKey = env.INTERNAL_API_KEY || '';

  return {
    plugins: [react()],
    root: webRoot,
    publicDir: path.resolve(webRoot, 'public'),
    resolve: {
      alias: {
        '@': webRoot,
      },
    },
    build: {
      outDir: path.resolve(webRoot, 'dist'),
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
          // Solo este proxy conoce la clave — nunca llega al navegador.
          headers: { 'X-Internal-Key': internalApiKey },
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
          headers: { 'X-Internal-Key': internalApiKey },
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
