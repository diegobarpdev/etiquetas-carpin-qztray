/**
 * Servidor estático del front (producción) en :3000.
 * Proxifica /api y /health hacia la API (:3010).
 */
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const envPath = join(repoRoot, '.env');
if (existsSync(envPath)) {
  loadEnv({ path: envPath, override: true });
}

const HOST = process.env.HOST || '0.0.0.0';
const WEB_PORT = parseInt(process.env.WEB_PORT || '3000', 10);
const API_PORT = parseInt(process.env.API_PORT || '3010', 10);
const API_TARGET = process.env.API_URL || `http://127.0.0.1:${API_PORT}`;

const INTERNAL_API_KEY = String(process.env.INTERNAL_API_KEY || '').trim();
if (!INTERNAL_API_KEY) {
  console.error(
    '[web] Falta INTERNAL_API_KEY en .env — no hay default por seguridad. ' +
      'La API rechaza pedidos sin esta clave, y este proxy es el único que la conoce.',
  );
  process.exit(1);
}

const distDir = join(__dirname, 'dist');
if (!existsSync(join(distDir, 'index.html'))) {
  console.error(
    `[web] No hay build en ${distDir}. Ejecuta "npm run build" antes de start:web.`,
  );
  process.exit(1);
}

const app = express();

app.use(
  createProxyMiddleware({
    target: API_TARGET,
    changeOrigin: true,
    xfwd: true,
    // Impresión de lotes grandes (PDF + agente USB) puede tardar varios minutos.
    timeout: 1_200_000,
    proxyTimeout: 1_200_000,
    pathFilter: (pathname) =>
      pathname === '/health' ||
      pathname.startsWith('/health/') ||
      pathname === '/api' ||
      pathname.startsWith('/api/'),
    on: {
      proxyReq: (proxyReq) => {
        // Este proxy es el único que conoce la clave — nunca llega al
        // navegador. Un pedido directo al puerto de la API sin pasar por
        // acá no la tiene y queda afuera.
        proxyReq.setHeader('X-Internal-Key', INTERNAL_API_KEY);
      },
    },
  }),
);

app.use(express.static(distDir));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.includes('.')) return next();
  res.sendFile(join(distDir, 'index.html'));
});

app.listen(WEB_PORT, HOST, () => {
  console.log('');
  console.log(`=== Etiquetas CTIN · Front (:${WEB_PORT}) ===`);
  console.log(`Local:  http://localhost:${WEB_PORT}`);
  console.log(`API →   ${API_TARGET}`);
  console.log(`Static: ${distDir}`);
  console.log('');
});
