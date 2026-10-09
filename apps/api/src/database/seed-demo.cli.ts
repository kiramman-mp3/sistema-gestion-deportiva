import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { loadRootDotenv } from '../config/dotenv.js';
import { loadEnv } from '../config/env.js';
import { createPrismaClient } from './prisma-client.js';
import {
  deactivateDemoUsers,
  DEMO_DOMAIN,
  isDemoLoaded,
  seedDemo,
} from './seed-demo.js';

const args = new Set(process.argv.slice(2));
loadRootDotenv();
const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL);

function target(): string {
  try {
    const url = new URL(env.DATABASE_URL);
    return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  } catch {
    return 'base de datos configurada';
  }
}

try {
  if (args.has('--deactivate-users')) {
    const count = await deactivateDemoUsers(prisma);
    console.log(
      `Se desactivaron ${count} cuenta(s) de demostración y se cerraron sus sesiones. Los datos permanecen.`,
    );
  } else if (!args.has('--confirm')) {
    console.log(`Datos de demostración — destino: ${target()} (${env.NODE_ENV})

Carga clubes, deportistas, campeonatos con partidos jugados y por jugar, árbitros,
expedientes disciplinarios, noticias y cuentas de prueba. Todo es ficticio, pero NO se
puede eliminar después (hay auditoría inmutable): para quitarlo, restaure un respaldo.

  Cargar:      npm run db:seed:demo -w @liga/api -- --confirm
  Desactivar:  npm run db:seed:demo -w @liga/api -- --deactivate-users

Variables opcionales: DEMO_USER_PASSWORD (mínimo 12 caracteres; si falta se genera una).`);
    process.exitCode = 1;
  } else if (env.NODE_ENV === 'production' && !args.has('--allow-production')) {
    console.error(
      'Está en producción. Si de verdad quiere cargar datos de prueba aquí, añada también --allow-production.',
    );
    process.exitCode = 1;
  } else if (await isDemoLoaded(prisma)) {
    console.log(
      'Los datos de demostración ya están cargados: no se hizo nada.',
    );
  } else {
    const password =
      process.env.DEMO_USER_PASSWORD ?? randomBytes(12).toString('base64url');
    console.log(`Cargando datos de demostración en ${target()}…`);
    const summary = await seedDemo(prisma, {
      password,
      storageDir: resolve(env.STORAGE_PATH),
    });
    console.log(`
Listo:
  ${summary.clubs} clubes · ${summary.athletes} deportistas · ${summary.championships} campeonatos
  ${summary.matches} partidos (${summary.playedMatches} jugados) · ${summary.officials} árbitros
  ${summary.cases} expedientes · ${summary.announcements} publicaciones

Cuentas de prueba (dominio reservado @${DEMO_DOMAIN}, no reciben correo):`);
    for (const a of summary.accounts)
      console.log(`  ${a.email.padEnd(40)} ${a.role}`);
    console.log(`
Contraseña de TODAS las cuentas: ${password}
(Se muestra solo ahora y no se guarda. Desactive las cuentas al terminar:
 npm run db:seed:demo -w @liga/api -- --deactivate-users)`);
  }
} finally {
  await prisma.$disconnect();
}
