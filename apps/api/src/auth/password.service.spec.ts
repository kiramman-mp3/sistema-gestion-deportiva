import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('genera hashes Argon2id con los parámetros configurados y sal distinta cada vez', async () => {
    const a = await service.hash('contraseña-de-prueba-1');
    const b = await service.hash('contraseña-de-prueba-1');
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('contraseña-de-prueba-1');
  });

  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const hash = await service.hash('contraseña-de-prueba-1');
    expect(await service.verify(hash, 'contraseña-de-prueba-1')).toBe(true);
    expect(await service.verify(hash, 'contraseña-de-prueba-2')).toBe(false);
    expect(await service.verify(hash, '')).toBe(false);
  });

  it('sin hash (usuario inexistente) devuelve false tras una verificación ficticia', async () => {
    expect(await service.verify(null, 'cualquier-cosa-larga')).toBe(false);
  });

  it('trata un hash corrupto como credencial incorrecta, sin lanzar', async () => {
    expect(await service.verify('esto-no-es-un-hash', 'x')).toBe(false);
    expect(
      await service.verify('$argon2id$v=19$m=1,t=1,p=1$AAAA$BBBB', 'x'),
    ).toBe(false);
  });

  it('el coste de verificar un usuario inexistente es comparable al de uno existente', async () => {
    const hash = await service.hash('contraseña-de-prueba-1');
    const time = async (fn: () => Promise<unknown>) => {
      const start = performance.now();
      await fn();
      return performance.now() - start;
    };
    await service.verify(null, 'warmup-warmup');
    const real = await time(() =>
      service.verify(hash, 'incorrecta-incorrecta'),
    );
    const dummy = await time(() =>
      service.verify(null, 'incorrecta-incorrecta'),
    );
    // Ambos ejecutan Argon2id: la diferencia no debe ser de órdenes de magnitud
    expect(dummy).toBeGreaterThan(real / 5);
  });
});
