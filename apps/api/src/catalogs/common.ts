import { ConflictException } from '@nestjs/common';
import { z } from 'zod';

/** Espacios al inicio/final fuera y espacios internos colapsados. */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Escapa los comodines de LIKE/ILIKE (`%`, `_`) y la barra invertida: Prisma no lo hace
 * en `contains`, y la búsqueda del usuario debe tratarse como texto literal.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Código estable: minúsculas, números y guion bajo; empieza con letra. */
export const codeSchema = z
  .string()
  .trim()
  .min(2, 'Mínimo 2 caracteres')
  .max(40, 'Máximo 40 caracteres')
  .regex(
    /^[a-z][a-z0-9_]*$/,
    'Use minúsculas, números y guion bajo, empezando con una letra',
  );

export const nameSchema = z
  .string()
  .transform(normalizeName)
  .pipe(z.string().min(1, 'Obligatorio').max(100, 'Máximo 100 caracteres'));

export const reasonSchema = z
  .string()
  .trim()
  .min(3, 'Indique el motivo (mínimo 3 caracteres)')
  .max(500, 'Máximo 500 caracteres');

export const catalogStatusSchema = z.enum(['activo', 'inactivo']);

/** Paginación y búsqueda comunes a los listados. */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
});

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Datos de un error de base de datos devuelto por Prisma con el adaptador `pg`. */
export function dbErrorInfo(error: unknown): {
  sqlState?: string;
  constraint?: string;
} {
  const cause = (
    error as {
      meta?: {
        driverAdapterError?: {
          cause?: { originalCode?: string; constraint?: { index?: string } };
        };
      };
    }
  )?.meta?.driverAdapterError?.cause;
  return {
    sqlState: cause?.originalCode,
    constraint: cause?.constraint?.index,
  };
}

/**
 * Traduce errores de integridad de PostgreSQL a 409 con un mensaje claro.
 * Cualquier otro error se relanza (500 genérico para el cliente; el detalle
 * queda solo en el log del servidor).
 */
export function translateDbError(
  error: unknown,
  messages: { unique: Record<string, string>; inUse: string },
): never {
  const { sqlState, constraint } = dbErrorInfo(error);
  if (sqlState === '23505') {
    throw new ConflictException(
      (constraint && messages.unique[constraint]) ??
        'Ya existe un registro con esos datos',
    );
  }
  // 23503 foreign_key_violation / 23001 restrict_violation: el registro está en uso.
  if (sqlState === '23503' || sqlState === '23001') {
    throw new ConflictException(messages.inUse);
  }
  throw error;
}

/** Campos que cambian entre dos estados, para registrar solo lo modificado. */
export function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
): { before: Partial<T>; after: Partial<T> } | null {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (before[key] !== after[key]) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return Object.keys(a).length === 0 ? null : { before: b, after: a };
}
