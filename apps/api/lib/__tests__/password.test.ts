import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../password';

describe('password hashing (scrypt)', () => {
  it('verifica correctamente una clave válida', () => {
    const hash = hashPassword('clave12345');
    expect(verifyPassword('clave12345', hash)).toBe(true);
  });

  it('rechaza una clave incorrecta', () => {
    const hash = hashPassword('clave12345');
    expect(verifyPassword('otra-clave', hash)).toBe(false);
  });

  it('dos hashes de la misma clave son distintos (salt aleatorio)', () => {
    const a = hashPassword('clave12345');
    const b = hashPassword('clave12345');
    expect(a).not.toBe(b);
    expect(verifyPassword('clave12345', a)).toBe(true);
    expect(verifyPassword('clave12345', b)).toBe(true);
  });

  it('rechaza un hash con formato inválido en vez de tirar excepción', () => {
    expect(verifyPassword('clave12345', 'no-tiene-separador')).toBe(false);
    expect(verifyPassword('clave12345', '')).toBe(false);
  });
});
