export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Segundos hasta poder reintentar (429). */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Token CSRF de la sesión actual. Se guarda SOLO en memoria (nunca en
 * localStorage/sessionStorage): lo entrega el servidor al iniciar sesión o al
 * consultar la sesión, y se envía en la cabecera X-CSRF-Token en cada escritura.
 */
let csrfToken: string | null = null;
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

type UnauthorizedListener = () => void;
let onUnauthorized: UnauthorizedListener | null = null;
/** El proveedor de sesión se suscribe para enterarse de sesiones expiradas o revocadas. */
export function setUnauthorizedListener(
  listener: UnauthorizedListener | null,
): void {
  onUnauthorized = listener;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Si es true, un 401 no se interpreta como sesión expirada (p. ej. el propio login). */
  skipUnauthorizedHandler?: boolean;
}

async function messageFrom(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const data = (await response.json()) as { message?: unknown };
    if (typeof data.message === 'string') return data.message;
  } catch {
    // Cuerpo vacío o no JSON: se usa el mensaje genérico.
  }
  return fallback;
}

/** Cliente HTTP mínimo hacia la API. Las rutas son relativas a /api. */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'include',
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error;
    throw new ApiError('No se pudo conectar con el servidor.');
  }

  if (!response.ok) {
    if (response.status === 401 && !options.skipUnauthorizedHandler) {
      onUnauthorized?.();
    }
    const retryAfter = Number(response.headers.get('Retry-After')) || undefined;
    throw new ApiError(
      await messageFrom(
        response,
        `El servidor respondió con un error (${response.status}).`,
      ),
      response.status,
      retryAfter,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { signal });
}
