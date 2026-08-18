import { describe, it, expect, beforeEach } from 'vitest';
import { createSessionAuth } from '../session-auth';

function fakeReq(overrides: Partial<{ secure: boolean; cookie: string }> = {}) {
  return {
    secure: overrides.secure ?? false,
    headers: { cookie: overrides.cookie },
  } as any;
}

function fakeRes() {
  let header = '';
  return {
    setHeader(_name: string, value: string) {
      header = value;
    },
    get cookieHeader() {
      return header;
    },
  } as any;
}

describe('session-auth cookie Secure flag', () => {
  beforeEach(() => {
    process.env.TEST_PIN = 'secret';
    process.env.TEST_SECRET = 'signing-secret';
  });

  const auth = createSessionAuth({
    cookieName: 'test_session',
    pinEnvVar: 'TEST_PIN',
    ttlMs: 60_000,
    secretEnvVar: 'TEST_SECRET',
  });

  it('no manda Secure sobre HTTP plano (req.secure=false)', () => {
    const res = fakeRes();
    auth.createSession(fakeReq({ secure: false }), res);
    expect(res.cookieHeader).toContain('SameSite=Lax');
    expect(res.cookieHeader).not.toContain('Secure');
  });

  it('manda Secure cuando la conexión es HTTPS (req.secure=true)', () => {
    const res = fakeRes();
    auth.createSession(fakeReq({ secure: true }), res);
    expect(res.cookieHeader).toContain('; Secure');
  });

  it('la sesión creada sigue siendo válida al leerla de vuelta (con o sin Secure)', () => {
    const res = fakeRes();
    auth.createSession(fakeReq({ secure: true }), res);
    const match = res.cookieHeader.match(/test_session=([^;]+)/);
    const cookieValue = decodeURIComponent(match![1]);
    const req = fakeReq({ cookie: `test_session=${encodeURIComponent(cookieValue)}` });
    expect(auth.isSessionValid(req)).toBe(true);
  });
});
