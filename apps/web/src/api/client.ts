export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Cliente HTTP mínimo hacia la API. Las rutas son relativas a /api. */
export async function apiGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiError('No se pudo conectar con el servidor.');
  }
  if (!response.ok) {
    throw new ApiError(
      `El servidor respondió con un error (${response.status}).`,
      response.status,
    );
  }
  return (await response.json()) as T;
}
