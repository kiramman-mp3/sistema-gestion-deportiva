/**
 * Crea el primer superadministrador. Uso (ver docs/authentication.md):
 *
 *   npm run admin:create-superadmin -w @liga/api -- --email=persona@dominio --name="Nombre Apellido"
 *
 * La contraseña se pide por terminal (entrada oculta, dos veces). En entornos no
 * interactivos puede suministrarse con BOOTSTRAP_ADMIN_PASSWORD. Nunca se acepta
 * como argumento de línea de comandos (quedaría en el historial y en `ps`).
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { loadRootDotenv } from '../config/dotenv.js';
import { PrismaService } from '../database/prisma.service.js';
import { seedAuthorization } from '../database/seed.js';
import { BootstrapError, BootstrapService } from './bootstrap.service.js';
import { promptHidden, promptLine } from './cli-prompt.js';

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const fromEnv = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!fromEnv) {
      throw new BootstrapError(
        'Sin terminal interactiva: defina BOOTSTRAP_ADMIN_PASSWORD para esta ejecución.',
      );
    }
    return fromEnv;
  }
  const first = await promptHidden('Contraseña (mínimo 12 caracteres): ');
  const second = await promptHidden('Repita la contraseña: ');
  if (first !== second)
    throw new BootstrapError('Las contraseñas no coinciden.');
  return first;
}

async function main(): Promise<void> {
  loadRootDotenv();
  const interactive = Boolean(process.stdin.isTTY);
  const email =
    argument('email') ??
    process.env.BOOTSTRAP_ADMIN_EMAIL ??
    (interactive ? await promptLine('Correo electrónico: ') : undefined);
  const displayName =
    argument('name') ??
    process.env.BOOTSTRAP_ADMIN_NAME ??
    (interactive ? await promptLine('Nombre completo: ') : undefined);
  if (!email || !displayName) {
    throw new BootstrapError(
      'Indique --email y --name (o BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_NAME).',
    );
  }
  const password = await readPassword();
  // No dejar la contraseña en el entorno del proceso más tiempo del necesario.
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    // Garantiza que existan permisos y rol superadmin (idempotente).
    await seedAuthorization(app.get(PrismaService).client);
    const user = await app.get(BootstrapService).createFirstSuperadmin({
      email,
      displayName,
      password,
    });
    console.log(`Superadministrador creado: ${user.email}`);
  } finally {
    await app.close();
  }
}

try {
  await main();
} catch (error) {
  // Solo se muestra el mensaje de errores esperados; nunca datos de entrada.
  console.error(
    error instanceof BootstrapError
      ? `Error: ${error.message}`
      : 'Error inesperado al crear el superadministrador. Revise la configuración y la base de datos.',
  );
  process.exitCode = 1;
}
