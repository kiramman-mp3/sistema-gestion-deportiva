/**
 * Saneado de los valores anteriores/posteriores de la auditoría antes de mostrarlos.
 * La aplicación no guarda secretos en ellos, pero un registro antiguo o un cambio
 * futuro podrían hacerlo por error: aquí se enmascara cualquier campo cuyo nombre
 * sugiera un secreto y cualquier valor con forma de hash o token.
 */
export const REDACTED = '[oculto]';

const SECRET_KEY =
  /pass|secret|token|hash|cookie|csrf|authorization|credential|api[-_]?key/i;
const SECRET_VALUE = /^\$argon2|^\$2[aby]\$|^[A-Za-z0-9_-]{43}$|^[0-9a-f]{64}$/;

export function sanitizeSnapshot(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (Array.isArray(value))
    return value.map((item) => sanitizeSnapshot(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SECRET_KEY.test(key) ? REDACTED : sanitizeSnapshot(item, depth + 1),
      ]),
    );
  }
  if (typeof value === 'string' && SECRET_VALUE.test(value)) return REDACTED;
  return value;
}
