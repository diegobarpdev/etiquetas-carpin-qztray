import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const KEY_LEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

/** `${saltHex}:${hashHex}` — scrypt (nativo de Node, sin dependencia extra). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LEN, SCRYPT_PARAMS).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const sepIdx = stored.indexOf(':');
  if (sepIdx <= 0) return false;
  const salt = stored.slice(0, sepIdx);
  const hashHex = stored.slice(sepIdx + 1);
  if (!salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const candidate = scryptSync(password, salt, expected.length || KEY_LEN, SCRYPT_PARAMS);
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
