/**
 * API Express (:3010). El front (:3000) proxifica /api y /health hacia aquí.
 */
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { config as loadEnv } from 'dotenv';
import apiRouter from './routes/api';
import authRouter from './routes/auth';
import { requireLogin, blockIfMustChangePassword } from './lib/user-session';
import { ensureBootstrapAdmin } from './services/bootstrap-admin.service';
import { closeBrowser } from './services/pdf-generator.service';
import { initPrintersConfig } from './services/printers-config.service';
import { closeOdooPool, isOdooEnabled, odooHealth } from './lib/odoo';
import { getLanIpv4Addresses, getPublicUrls } from './lib/network';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const envPath = join(repoRoot, '.env');
if (existsSync(envPath)) {
  loadEnv({ path: envPath, override: true });
}

const INTERNAL_API_KEY = String(process.env.INTERNAL_API_KEY || '').trim();
if (!INTERNAL_API_KEY) {
  console.error(
    '[FATAL] Falta INTERNAL_API_KEY en .env — no hay default por seguridad. ' +
      'La API no acepta pedidos directos sin pasar por el proxy del front.',
  );
  process.exit(1);
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
  await ensureBootstrapAdmin();

  const app = express();

  // El front (apps/web/server.ts) proxifica con xfwd:true (manda
  // X-Forwarded-Proto real del browser); confiar en ese header solo cuando
  // el que conecta es loopback (el propio proxy) — así req.secure refleja
  // si el browser habló HTTPS con el front, aunque el salto interno
  // front→API sea HTTP plano. Necesario para que la cookie de sesión
  // (lib/user-session.ts) pueda poner Secure el día que se agregue TLS al
  // front, sin que nadie que hable directo con la API pueda spoofearlo.
  app.set('trust proxy', 'loopback');

  // Orígenes conocidos del front (nunca reflejar cualquier Origin: eso
  // permitía a cualquier página web leer respuestas de esta API con
  // credenciales incluidas).
  const allowedOrigins = new Set(
    [
      process.env.PUBLIC_URL,
      `http://localhost:${WEB_PORT}`,
      `http://127.0.0.1:${WEB_PORT}`,
    ].filter((v): v is string => Boolean(v)),
  );

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Internal-Key');
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

  // Solo el proxy del front (apps/web/server.ts) conoce esta clave — un
  // pedido directo al puerto de la API sin pasar por ahí queda afuera.
  app.use('/api', (req, res, next) => {
    if (req.get('X-Internal-Key') !== INTERNAL_API_KEY) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    next();
  });
  // Registro/login/logout/me: sin gate (si no, nadie podría loguearse
  // nunca). El rol admin se revisa por ruta más adentro (requireAdmin).
  app.use('/api', authRouter);
  app.use('/api', requireLogin);
  app.use('/api', blockIfMustChangePassword);
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
