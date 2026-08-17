import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { generate as generateSelfSigned } from 'selfsigned';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveDataDir(): string {
  const fromEnv = String(process.env.PRINTERS_CONFIG_DIR || '').trim();
  if (fromEnv) return fromEnv;
  return join(__dirname, '..', 'data');
}

const DATA_DIR = resolveDataDir();
const CERT_PATH = join(DATA_DIR, 'qz-cert.pem');
const KEY_PATH = join(DATA_DIR, 'qz-key.pem');

export interface QzCertificate {
  certPem: string;
  keyPem: string;
}

/**
 * Certificado auto-firmado usado por QZ Tray para confiar en este server como
 * emisor de trabajos de impresión. Se genera una sola vez y se persiste junto
 * a printers-config.json (fuera de git). Ver docs/qz-tray-setup.md.
 */
let cached: QzCertificate | null = null;

export async function getOrCreateQzCertificate(): Promise<QzCertificate> {
  if (cached) return cached;

  if (existsSync(CERT_PATH) && existsSync(KEY_PATH)) {
    cached = {
      certPem: readFileSync(CERT_PATH, 'utf8'),
      keyPem: readFileSync(KEY_PATH, 'utf8'),
    };
    return cached;
  }

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const attrs = [{ name: 'commonName', value: 'Etiquetas Colineal QZ Tray' }];
  const notBeforeDate = new Date();
  const notAfterDate = new Date(notBeforeDate.getTime());
  notAfterDate.setFullYear(notAfterDate.getFullYear() + 10);
  const pems = await generateSelfSigned(attrs, {
    notBeforeDate,
    notAfterDate,
    keySize: 2048,
    algorithm: 'sha256',
  });

  writeFileSync(CERT_PATH, pems.cert, 'utf8');
  writeFileSync(KEY_PATH, pems.private, 'utf8');

  cached = { certPem: pems.cert, keyPem: pems.private };
  return cached;
}
