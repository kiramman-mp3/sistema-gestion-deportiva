import { createPrismaClient } from '../../src/database/prisma-client.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { databaseName, getTestDatabaseUrl } from './test-database.js';

export function createTestPrisma(): PrismaClient {
  return createPrismaClient(getTestDatabaseUrl());
}

/**
 * Vacía todas las tablas de la aplicación (no `_prisma_migrations`).
 * Comprueba antes que la conexión apunta a la base de pruebas.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const [{ current_database: current }] = await prisma.$queryRaw<
    { current_database: string }[]
  >`SELECT current_database()`;
  if (current !== databaseName(getTestDatabaseUrl())) {
    throw new Error(`Se rechaza vaciar la base de datos "${current}".`);
  }

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;

  const list = tables.map(({ tablename }) => `"${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}

export interface DbFailure {
  /** SQLSTATE de PostgreSQL (23505 único, 23503 FK, 23514 CHECK, 23001 RESTRICT…). */
  sqlState: string;
  /** Mensaje original de PostgreSQL (incluye el nombre de la restricción). */
  message: string;
}

/** Espera que la operación falle por una regla de la base de datos y describe el fallo. */
export async function dbFailure(
  operation: Promise<unknown>,
): Promise<DbFailure> {
  try {
    await operation;
  } catch (error) {
    const cause = (
      error as {
        meta?: {
          driverAdapterError?: {
            cause?: { originalCode?: string; originalMessage?: string };
          };
        };
      }
    ).meta?.driverAdapterError?.cause;
    if (!cause?.originalCode) throw error;
    return {
      sqlState: cause.originalCode,
      message: cause.originalMessage ?? '',
    };
  }
  throw new Error(
    'Se esperaba un error de la base de datos, pero la operación tuvo éxito.',
  );
}
