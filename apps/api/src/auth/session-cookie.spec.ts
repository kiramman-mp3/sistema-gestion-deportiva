import type { Request, Response } from 'express';
import {
  clearSessionCookie,
  readSessionToken,
  sessionCookie,
  setSessionCookie,
} from './session-cookie.js';

function fakeResponse() {
  const calls: { method: string; args: unknown[] }[] = [];
  const res = {
    cookie: (...args: unknown[]) => calls.push({ method: 'cookie', args }),
    clearCookie: (...args: unknown[]) =>
      calls.push({ method: 'clearCookie', args }),
  } as unknown as Response;
  return { res, calls };
}

describe('cookie de sesión', () => {
  it('fuera de producción: HttpOnly, SameSite=Strict, Path=/, sin Secure ni prefijo', () => {
    const { name, options } = sessionCookie({ NODE_ENV: 'development' });
    expect(name).toBe('liga_sid');
    expect(options).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/',
    });
  });

  it('en producción: Secure y prefijo __Host- (sin Domain)', () => {
    const { name, options } = sessionCookie({ NODE_ENV: 'production' });
    expect(name).toBe('__Host-liga_sid');
    expect(options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
    });
    expect(options).not.toHaveProperty('domain');
  });

  it('borra la cookie con exactamente los mismos atributos con que se establece', () => {
    for (const NODE_ENV of ['development', 'production'] as const) {
      const { res, calls } = fakeResponse();
      setSessionCookie(res, { NODE_ENV }, 'token');
      clearSessionCookie(res, { NODE_ENV });
      expect(calls[0]!.args[0]).toBe(calls[1]!.args[0]);
      expect(calls[0]!.args[2]).toEqual(calls[1]!.args[1]);
    }
  });

  it('lee el identificador solo de la cookie con el nombre esperado', () => {
    const req = (cookie?: string) =>
      ({ headers: { cookie } }) as unknown as Request;
    const env = { NODE_ENV: 'development' as const };
    expect(readSessionToken(req('a=1; liga_sid=abc; b=2'), env)).toBe('abc');
    expect(readSessionToken(req('otra_liga_sid=abc'), env)).toBeUndefined();
    expect(readSessionToken(req(), env)).toBeUndefined();
    // En producción no se acepta la cookie sin prefijo (la podría inyectar un subdominio)
    expect(
      readSessionToken(req('liga_sid=abc'), { NODE_ENV: 'production' }),
    ).toBeUndefined();
  });
});
