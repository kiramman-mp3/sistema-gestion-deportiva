import { loadRootDotenv } from '../../src/config/dotenv.js';

/**
 * Devuelve la URL de la base de datos de PRUEBAS, rechazando cualquier otra.
 * Las pruebas de integración vacían tablas, así que jamás deben apuntar a la
 * base de desarrollo o producción.
 */
export function getTestDatabaseUrl(): string {
  loadRootDotenv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'Defina TEST_DATABASE_URL (ver .env.example) para ejecutar las pruebas de integración.',
    );
  }
  const name = databaseName(url);
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(
      `Por seguridad, la base de datos de pruebas debe llamarse "*_test" (recibido: "${name}").`,
    );
  }
  return url;
}

export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}
