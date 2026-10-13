// Prepara la base de datos de las pruebas end-to-end: la recrea desde cero, aplica las migraciones y
// carga los datos de demostración más una cuenta de superadministrador. Se ejecuta antes de Playwright
// (`npm run test:e2e`), con la API ya compilada. Nunca toca la base de desarrollo.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = resolve(root, 'apps/api');
const storage = resolve(root, 'e2e/.storage');
export const E2E_DB = 'liga_quero_e2e';

try {
  process.loadEnvFile(resolve(root, '.env'));
} catch {
  // En CI las variables ya vienen definidas.
}
if (!process.env.DATABASE_URL) {
  throw new Error(
    'Falta DATABASE_URL (o un .env en la raíz) para preparar la base e2e.',
  );
}

const e2eUrl = new URL(process.env.DATABASE_URL);
e2eUrl.pathname = `/${E2E_DB}`;
const adminUrl = new URL(process.env.DATABASE_URL);
adminUrl.pathname = '/postgres';

const password = process.env.E2E_PASSWORD ?? 'e2e-demostracion-2026';

console.log(`[e2e] Recreando la base ${E2E_DB}…`);
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
try {
  await admin.query(`DROP DATABASE IF EXISTS "${E2E_DB}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${E2E_DB}"`);
} finally {
  await admin.end();
}

const require = createRequire(pathToFileURL(resolve(apiDir, 'package.json')));
execFileSync(
  process.execPath,
  [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
  {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: e2eUrl.toString() },
    stdio: 'pipe',
  },
);

rmSync(storage, { recursive: true, force: true });
mkdirSync(storage, { recursive: true });

const load = (path) =>
  import(pathToFileURL(resolve(apiDir, 'dist', path)).href);
const [
  { createPrismaClient },
  { seedAuthorization },
  { seedDemo },
  { PasswordService },
] = await Promise.all([
  load('database/prisma-client.js'),
  load('database/seed.js'),
  load('database/seed-demo.js'),
  load('auth/password.service.js'),
]);

const prisma = createPrismaClient(e2eUrl.toString());
try {
  await seedAuthorization(prisma);
  const role = await prisma.role.findUniqueOrThrow({
    where: { code: 'superadmin' },
  });
  const admin = await prisma.user.create({
    data: {
      email: 'admin@e2e.liga.invalid',
      displayName: 'Superadministrador E2E',
      passwordHash: await new PasswordService().hash(password),
    },
  });
  await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } });
  const summary = await seedDemo(prisma, { password, storageDir: storage });
  console.log(
    `[e2e] Datos listos: ${summary.clubs} clubes, ${summary.athletes} deportistas, ${summary.matches} partidos.`,
  );
} finally {
  await prisma.$disconnect();
}
