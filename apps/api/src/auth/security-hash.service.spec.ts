import type { Env } from '../config/env.js';
import { SecurityHashService, sha256Hex } from './security-hash.service.js';

const service = (key: string) =>
  new SecurityHashService({ SECURITY_HASH_KEY: key } as Env);

describe('hashes', () => {
  it('sha256Hex es determinista y de 64 caracteres hexadecimales', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('el hash con clave es determinista, depende de la clave y del ámbito', () => {
    const a = service('a'.repeat(40));
    expect(a.hash('ip', '1.2.3.4')).toBe(a.hash('ip', '1.2.3.4'));
    expect(a.hash('ip', '1.2.3.4')).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash('ip', '1.2.3.4')).not.toBe(a.hash('correo', '1.2.3.4'));
    expect(a.hash('ip', '1.2.3.4')).not.toBe(
      service('b'.repeat(40)).hash('ip', '1.2.3.4'),
    );
    expect(a.hash('ip', '1.2.3.4')).not.toContain('1.2.3.4');
  });

  it('evita colisiones por concatenación entre ámbito y valor', () => {
    const a = service('a'.repeat(40));
    expect(a.hash('ab', 'c')).not.toBe(a.hash('a', 'bc'));
  });
});
