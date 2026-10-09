import { defineConfig } from 'prisma/config';

// Prisma 7 no carga .env automáticamente. Se lee el .env de la raíz del
// monorepo si existe (en CI las variables ya vienen definidas).
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  // Sin .env: se usan las variables ya presentes en el entorno.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` no se conecta (p. ej. en `npm ci` sin .env). Si falta la
    // variable, cualquier comando que sí se conecte falla con este host inválido
    // en lugar de apuntar a una base de datos inesperada.
    url:
      process.env.DATABASE_URL ??
      'postgresql://sin-configurar.invalid:5432/sin_configurar',
  },
});
