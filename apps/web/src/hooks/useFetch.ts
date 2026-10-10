import { useEffect, useState } from 'react';
import { ApiError, apiGet } from '../api/client.ts';

export type FetchState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'error'; message: string; status?: number };

/**
 * Carga un recurso de la API. Pasar `null` desactiva la carga. Devuelve el estado y
 * una función para recargar. Mientras cambia la ruta, el estado es «cargando».
 */
export function useFetch<T>(path: string | null): [FetchState<T>, () => void] {
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{
    id: string;
    value: FetchState<T>;
  } | null>(null);
  const id = `${path}#${reloadCount}`;

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    apiGet<T>(path, controller.signal)
      .then((data) => setResult({ id, value: { kind: 'ready', data } }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          id,
          value: {
            kind: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'No se pudo cargar la información.',
            status: error instanceof ApiError ? error.status : undefined,
          },
        });
      });
    return () => controller.abort();
  }, [path, id]);

  const state: FetchState<T> =
    result?.id === id ? result.value : { kind: 'loading' };
  return [state, () => setReloadCount((n) => n + 1)];
}
