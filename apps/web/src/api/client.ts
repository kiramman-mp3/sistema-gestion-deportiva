export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Segundos hasta poder reintentar (429). */
    readonly retryAfter?: number,
    /** Errores de validación del servidor por campo (400). */
    readonly fieldErrors?: Record<string, string>,
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

interface ErrorBody {
  message: string;
  fieldErrors?: Record<string, string>;
}

async function readError(
  response: Response,
  fallback: string,
): Promise<ErrorBody> {
  try {
    const data = (await response.json()) as {
      message?: unknown;
      errors?: { field?: unknown; message?: unknown }[];
    };
    const fieldErrors: Record<string, string> = {};
    for (const e of data.errors ?? []) {
      if (
        typeof e.field === 'string' &&
        typeof e.message === 'string' &&
        !(e.field in fieldErrors)
      ) {
        fieldErrors[e.field] = e.message;
      }
    }
    return {
      message: typeof data.message === 'string' ? data.message : fallback,
      fieldErrors: Object.keys(fieldErrors).length ? fieldErrors : undefined,
    };
  } catch {
    // Cuerpo vacío o no JSON: se usa el mensaje genérico.
    return { message: fallback };
  }
}

/** Cliente HTTP mínimo hacia la API. Las rutas son relativas a /api. */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body:
        options.body === undefined
          ? undefined
          : isFormData
            ? (options.body as BodyInit)
            : JSON.stringify(options.body),
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
    const error = await readError(
      response,
      `El servidor respondió con un error (${response.status}).`,
    );
    throw new ApiError(
      error.message,
      response.status,
      retryAfter,
      error.fieldErrors,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { signal });
}
