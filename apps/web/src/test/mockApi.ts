import { vi } from 'vitest';

export interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

export type Handler = (call: Call) => Response | Promise<Response>;

export const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
export const noContent = () => new Response(null, { status: 204 });
export const page = <T>(
  items: T[],
  extra: Partial<{ page: number; total: number }> = {},
) =>
  json({
    items,
    page: extra.page ?? 1,
    pageSize: 20,
    total: extra.total ?? items.length,
  });
export const error = (
  status: number,
  message: string,
  errors?: { field: string; message: string }[],
) =>
  json({ statusCode: status, message, ...(errors ? { errors } : {}) }, status);

/** Sustituye `fetch` por rutas simuladas «MÉTODO /ruta». Falla ante cualquier ruta no simulada. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const parsed = new URL(url, 'http://localhost');
      const call: Call = {
        method: init.method ?? 'GET',
        path: parsed.pathname.replace(/^\/api/, ''),
        query: parsed.searchParams,
        headers: (init.headers ?? {}) as Record<string, string>,
        body: !init.body
          ? undefined
          : init.body instanceof FormData
            ? Object.fromEntries(init.body.entries())
            : (JSON.parse(init.body as string) as Record<string, unknown>),
      };
      calls.push(call);
      const handler = routes[`${call.method} ${call.path}`];
      if (!handler)
        throw new Error(`Petición no simulada: ${call.method} ${call.path}`);
      return handler(call);
    }),
  );
  return {
    calls,
    of: (method: string, path: string) =>
      calls.filter((c) => c.method === method && c.path === path),
  };
}

/** Almacenamiento que registra cualquier escritura (la aplicación no debe escribir nada). */
export function spyStorage() {
  const writes: string[] = [];
  const storage = {
    length: 0,
    getItem: () => null,
    key: () => null,
    removeItem: () => undefined,
    clear: () => undefined,
    setItem: (key: string) => void writes.push(key),
  };
  return { storage, writes };
}
