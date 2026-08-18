import { createSessionAuth } from '../lib/session-auth';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const appAccessAuth = createSessionAuth({
  cookieName: 'app_access_session',
  pinEnvVar: 'APP_ACCESS_PIN',
  ttlMs: SESSION_TTL_MS,
  secretEnvVar: 'INTERNAL_API_KEY',
});
