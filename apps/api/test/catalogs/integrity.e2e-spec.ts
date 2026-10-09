import { AuditService } from '../../src/audit/audit.service.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import {
  adminWith,
  authed,
  createUser,
  fabricateSession,
  grantPermissions,
  seedCatalog,
} from '../support/fixtures.js';

const ALL = [
  'sports:read',
  'sports:manage',
  'sports:delete',
  'categories:read',
  'categories:manage',
  'categories:delete',
  'seasons:read',
  'seasons:manage',
  'seasons:delete',
];

describe('integridad referencial de los catálogos', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof adminWith>>;
  const api = () => authed(t, admin.session);

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS zz_catalog_refs');
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    admin = await adminWith(t, prisma, ALL);
  });
  afterAll(async () => {
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS zz_catalog_refs');
    await t.close();
    await prisma.$disconnect();
  });

  /**
   * Simula un módulo futuro (campeonatos, equipos…) que referencia los catálogos
   * con la misma regla que usará el esquema real: FK ON DELETE RESTRICT.
   */
  async function createReferencingTable() {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE zz_catalog_refs (
        id serial PRIMARY KEY,
        sport_id uuid REFERENCES sports(id) ON DELETE RESTRICT,
        category_id uuid REFERENCES categories(id) ON DELETE RESTRICT,
        season_id uuid REFERENCES seasons(id) ON DELETE RESTRICT
      )`);
  }

  it('no elimina un deporte referenciado: 409, el registro y la auditoría quedan intactos', async () => {
    await createReferencingTable();
    const sport = await prisma.sport.create({
      data: { code: 'futbol', name: 'Fútbol' },
    });
    await prisma.$executeRaw`INSERT INTO zz_catalog_refs (sport_id) VALUES (${sport.id}::uuid)`;

    const res = await api().delete(`/api/sports/${sport.id}`).expect(409);
    expect(res.body.message).toBe(
      'El deporte está en uso y no puede eliminarse. Desactívelo en su lugar.',
    );
    expect(await prisma.sport.count()).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { action: 'sport.delete' } }),
    ).toBe(0);

    // Desactivar sí es posible aunque esté en uso (se conserva el historial)
    await api()
      .patch(`/api/sports/${sport.id}/status`)
      .send({ status: 'inactivo' })
      .expect(200);
    // Y al dejar de estar referenciado, puede eliminarse
    await prisma.$executeRaw`DELETE FROM zz_catalog_refs`;
    await api().delete(`/api/sports/${sport.id}`).expect(204);
  });

  it('no elimina una categoría referenciada', async () => {
    await createReferencingTable();
    const category = await prisma.category.create({
      data: { code: 'liga_a', name: 'Liga A' },
    });
    await prisma.$executeRaw`INSERT INTO zz_catalog_refs (category_id) VALUES (${category.id}::uuid)`;

    const res = await api()
      .delete(`/api/categories/${category.id}`)
      .expect(409);
    expect(res.body.message).toBe(
      'La categoría está en uso y no puede eliminarse. Desactívela en su lugar.',
    );
    expect(await prisma.category.count()).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { action: 'category.delete' } }),
    ).toBe(0);
  });

  it('no elimina una temporada referenciada, aunque esté en borrador', async () => {
    await createReferencingTable();
    const season = await prisma.season.create({
      data: {
        name: 'T 2026',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
      },
    });
    await prisma.$executeRaw`INSERT INTO zz_catalog_refs (season_id) VALUES (${season.id}::uuid)`;

    const res = await api().delete(`/api/seasons/${season.id}`).expect(409);
    expect(res.body.message).toContain('está en uso');
    expect(await prisma.season.count()).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { action: 'season.delete' } }),
    ).toBe(0);
  });

  it('las restricciones de la base de datos siguen protegiendo aunque se omita la API', async () => {
    const failure = async (sql: string) =>
      prisma.$executeRawUnsafe(sql).then(
        () => 'ok',
        (e: Error) => e.message,
      );
    expect(
      await failure(
        `INSERT INTO seasons (id, name, start_date, end_date, updated_at) VALUES (gen_random_uuid(), 'X', '2026-05-01', '2026-04-01', now())`,
      ),
    ).toContain('seasons_dates_chk');
    expect(
      await failure(
        `INSERT INTO categories (id, code, name, age_min, age_max, updated_at) VALUES (gen_random_uuid(), 'zz', 'ZZ', 20, 10, now())`,
      ),
    ).toContain('categories_age_range_chk');
  });
});

describe('atomicidad de la auditoría en los catálogos', () => {
  let prisma: PrismaClient;
  let failing: TestApp;
  let session: Awaited<ReturnType<typeof fabricateSession>>;

  beforeAll(async () => {
    prisma = createTestPrisma();
    failing = await createTestApp({
      customize: (b) =>
        b.overrideProvider(AuditService).useValue({
          record: () => Promise.reject(new Error('auditoría caída')),
        }),
    });
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    const user = await createUser(prisma, { permissions: [] });
    await grantPermissions(prisma, user.id, ALL);
    session = await fabricateSession(failing, prisma, user.id);
  });
  afterAll(async () => {
    await failing.close();
    await prisma.$disconnect();
  });

  const api = () => authed(failing, session);

  it('si falla la auditoría, la creación se revierte (500 sin detalles)', async () => {
    const results = [
      await api().post('/api/sports').send({ code: 'futbol', name: 'Fútbol' }),
      await api()
        .post('/api/categories')
        .send({ code: 'liga_a', name: 'Liga A' }),
      await api().post('/api/seasons').send({
        name: 'T 2026',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      }),
    ];
    for (const res of results) {
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('auditoría caída');
    }
    expect(await prisma.sport.count()).toBe(0);
    expect(await prisma.category.count()).toBe(0);
    expect(await prisma.season.count()).toBe(0);
  });

  it('si falla la auditoría, la edición, el cambio de estado y la eliminación no se aplican', async () => {
    const sport = await prisma.sport.create({
      data: { code: 'futbol', name: 'Fútbol' },
    });
    const category = await prisma.category.create({
      data: { code: 'liga_a', name: 'Liga A' },
    });
    const season = await prisma.season.create({
      data: {
        name: 'T 2026',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
      },
    });

    expect(
      (await api().patch(`/api/sports/${sport.id}`).send({ name: 'Otro' }))
        .status,
    ).toBe(500);
    expect(
      (
        await api()
          .patch(`/api/sports/${sport.id}/status`)
          .send({ status: 'inactivo' })
      ).status,
    ).toBe(500);
    expect((await api().delete(`/api/sports/${sport.id}`)).status).toBe(500);
    expect(
      (await api().patch(`/api/categories/${category.id}`).send({ ageMin: 5 }))
        .status,
    ).toBe(500);
    expect((await api().delete(`/api/categories/${category.id}`)).status).toBe(
      500,
    );
    expect(
      (
        await api()
          .patch(`/api/seasons/${season.id}/status`)
          .send({ status: 'activa', reason: 'prueba' })
      ).status,
    ).toBe(500);
    expect((await api().delete(`/api/seasons/${season.id}`)).status).toBe(500);

    expect(
      await prisma.sport.findUniqueOrThrow({ where: { id: sport.id } }),
    ).toMatchObject({
      name: 'Fútbol',
      status: 'activo',
    });
    expect(
      await prisma.category.findUniqueOrThrow({ where: { id: category.id } }),
    ).toMatchObject({ ageMin: null });
    expect(
      await prisma.season.findUniqueOrThrow({ where: { id: season.id } }),
    ).toMatchObject({ status: 'borrador' });
  });
});
