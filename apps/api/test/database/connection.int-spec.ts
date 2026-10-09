import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';

describe('conexión y migraciones', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('se conecta a la base de datos de pruebas aislada', async () => {
    const [row] = await prisma.$queryRaw<
      { db: string }[]
    >`SELECT current_database() AS db`;
    expect(row.db).toMatch(/_test$/);
  });

  it('tiene aplicadas todas las migraciones del repositorio', async () => {
    const applied = await prisma.$queryRaw<
      { migration_name: string; finished_at: Date | null }[]
    >`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY migration_name`;
    expect(applied.length).toBeGreaterThan(0);
    expect(applied.every((m) => m.finished_at !== null)).toBe(true);
    expect(applied.map((m) => m.migration_name)).toContain(
      applied.find((m) => m.migration_name.endsWith('_init'))?.migration_name,
    );
  });

  it('crea las tablas del dominio', async () => {
    const rows = await prisma.$queryRaw<
      { tablename: string }[]
    >`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    expect(rows.map((r) => r.tablename)).toEqual(
      expect.arrayContaining([
        'users',
        'roles',
        'permissions',
        'role_permissions',
        'user_roles',
        'audit_logs',
        'sports',
        'categories',
        'seasons',
      ]),
    );
  });

  it('crea y consulta registros', async () => {
    await resetDatabase(prisma);
    const created = await prisma.sport.create({
      data: { code: 'futbol', name: 'Fútbol' },
    });
    const found = await prisma.sport.findUnique({ where: { id: created.id } });
    expect(found).toMatchObject({
      code: 'futbol',
      name: 'Fútbol',
      status: 'activo',
    });
    expect(found?.createdAt).toBeInstanceOf(Date);
  });

  it('resetDatabase deja las tablas vacías y es repetible', async () => {
    await prisma.sport.create({ data: { code: 'basquet', name: 'Básquet' } });
    await resetDatabase(prisma);
    await resetDatabase(prisma);
    expect(await prisma.sport.count()).toBe(0);
    // _prisma_migrations se conserva
    const [{ n }] = await prisma.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM _prisma_migrations`;
    expect(Number(n)).toBeGreaterThan(0);
  });
});
