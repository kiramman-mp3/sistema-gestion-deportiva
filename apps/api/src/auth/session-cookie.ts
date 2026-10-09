import { parse } from 'cookie';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../config/env.js';

/**
 * Cookie de sesión.
 *  - HttpOnly: inaccesible para JavaScript (mitiga robo por XSS).
 *  - Secure + prefijo __Host- en producción: solo HTTPS, sin Domain y con Path=/.
 *  - SameSite=Strict: el navegador no la envía en peticiones entre sitios.
 *    Requiere que web y API compartan sitio (mismo dominio registrable).
 *  - Sin Max-Age: es una cookie de sesión del navegador; la caducidad real
 *    (inactividad y absoluta) la impone el servidor.
 */
export function sessionCookie(env: Pick<Env, 'NODE_ENV'>): {
  name: string;
  options: CookieOptions;
} {
  const secure = env.NODE_ENV === 'production';
  return {
    name: secure ? '__Host-liga_sid' : 'liga_sid',
    options: { httpOnly: true, secure, sameSite: 'strict', path: '/' },
  };
}

export function setSessionCookie(
  res: Response,
  env: Pick<Env, 'NODE_ENV'>,
  token: string,
): void {
  const { name, options } = sessionCookie(env);
  res.cookie(name, token, options);
}

/** Borra la cookie con los mismos atributos con que se estableció. */
export function clearSessionCookie(
  res: Response,
  env: Pick<Env, 'NODE_ENV'>,
): void {
  const { name, options } = sessionCookie(env);
  res.clearCookie(name, options);
}

export function readSessionToken(
  req: Request,
  env: Pick<Env, 'NODE_ENV'>,
): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  return parse(header)[sessionCookie(env).name];
}
