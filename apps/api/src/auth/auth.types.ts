import type { Request } from 'express';

/** Identidad resuelta para una petición autenticada. */
export interface AuthContext {
  user: { id: string; email: string; displayName: string };
  session: {
    id: string;
    csrfToken: string;
    createdAt: Date;
    /** Caducidad efectiva: la menor entre la absoluta y la de inactividad. */
    expiresAt: Date;
  };
  /** Permisos derivados de los roles persistidos, leídos en esta petición. */
  permissions: ReadonlySet<string>;
}

export type AuthedRequest = Request & { auth?: AuthContext };

/** Cabecera en la que el frontend devuelve el token CSRF. */
export const CSRF_HEADER = 'x-csrf-token';
