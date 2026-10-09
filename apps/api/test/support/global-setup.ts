import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { databaseName, getTestDatabaseUrl } from './test-database.js';

/**
 * Prepara la base de datos de pruebas una vez por ejecución:
 * la crea si no existe y aplica las migraciones (`migrate deploy`).
 * Es repetible: si ya está al día, no hace nada.
 */
export default async function setup(): Promise<void> {
  const url = getTestDatabaseUrl();
  // Aquí DATABASE_URL aún es la de desarrollo (los workers la sustituyen).
  if (url === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL no puede ser igual a DATABASE_URL.');
  }
  await ensureDatabase(url);
  applyMigrations(url);
}

async function ensureDatabase(url: string): Promise<void> {
  const name = databaseName(url);
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';

  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const exists = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [name],
    );
    if (exists.rowCount === 0) {
      // `name` ya fue validado con /^[a-z0-9_]+_test$/ en getTestDatabaseUrl.
      await admin.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await admin.end();
  }
}

function applyMigrations(url: string): void {
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve('prisma/build/index.js');
  const apiDir = fileURLToPath(new URL('../../', import.meta.url));
  try {
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: apiDir,
      // DATABASE_URL se fuerza a la base de pruebas, sea cual sea el entorno.
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  } catch (error) {
    const output = (
      error as { stdout?: Buffer; stderr?: Buffer }
    ).stderr?.toString();
    throw new Error(
      `Fallo al aplicar las migraciones en la base de pruebas:\n${output ?? String(error)}`,
    );
  }
}
