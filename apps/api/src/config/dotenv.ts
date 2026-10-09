/**
 * Carga el .env de la raíz del monorepo si existe (solo desarrollo local).
 * No sobrescribe variables ya definidas en el entorno.
 */
export function loadRootDotenv(): void {
  try {
    process.loadEnvFile(new URL('../../../../.env', import.meta.url));
  } catch {
    // Sin .env: se usan las variables ya presentes en el entorno.
  }
}
