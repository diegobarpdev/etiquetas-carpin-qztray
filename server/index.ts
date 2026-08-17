/**
 * API Express (:3010). El front (:3000) proxifica /api y /health hacia aquí.
 */
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { config as loadEnv } from 'dotenv';
import apiRouter from './routes/api';
import { closeBrowser } from './services/pdf-generator.service';
import { initPrintersConfig } from './services/printers-config.service';
import { closeOdooPool, isOdooEnabled, odooHealth } from './lib/odoo';
import { getLanIpv4Addresses, getPublicUrls } from './lib/network';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const envPath = join(repoRoot, '.env');
if (existsSync(envPath)) {
  loadEnv({ path: envPath, override: true });
}

process.env.HOST = process.env.HOST || '0.0.0.0';

const HOST = process.env.HOST || '0.0.0.0';
const API_PORT = parseInt(process.env.API_PORT || '3010', 10);
const WEB_PORT = parseInt(process.env.WEB_PORT || '3000', 10);
if (!process.env.PUBLIC_URL) {
  process.env.PUBLIC_URL = `http://192.168.2.28:${WEB_PORT}`;
}

initPrintersConfig();

async function main() {
  const app = express();

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '25mb' }));

  app.get('/health', async (_req, res) => {
    const urls = getPublicUrls(API_PORT);
    const odoo = isOdooEnabled()
      ? await odooHealth()
      : { ok: false, readOnly: true, error: 'ODOO_DATABASE_URL no configurada' };

    res.json({
      status: odoo.ok ? 'ok' : 'degraded',
      app: 'etiquetas-api',
      role: 'api',
      host: HOST,
      port: API_PORT,
      webPort: WEB_PORT,
      urls,
      networkUrl: urls.find((url) => !url.includes('localhost')) ?? urls[0],
      odoo,
      ordersSource: 'odoo',
      note: `Front :${WEB_PORT} · API :${API_PORT}`,
    });
  });

  app.use('/api', apiRouter);

  const server = app.listen(API_PORT, HOST, () => {
    const ips = getLanIpv4Addresses();
    console.log('');
    console.log(`=== Etiquetas CTIN · API (:${API_PORT}) ===`);
    console.log(`Local:  http://localhost:${API_PORT}`);
    for (const ip of ips) {
      console.log(`Red:    http://${ip}:${API_PORT}`);
    }
    console.log(
      `Ordenes: ${isOdooEnabled() ? 'Odoo PostgreSQL (RO)' : 'SIN ODOO_DATABASE_URL'}`,
    );
    console.log(`Front:   puerto ${WEB_PORT} (proxy → esta API)`);
    console.log('');
  });

  const shutdown = async () => {
    server.close();
    await closeBrowser();
    await closeOdooPool();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
