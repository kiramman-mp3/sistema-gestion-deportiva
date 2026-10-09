import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import { adminWith, authed, seedCatalog } from '../support/fixtures.js';

describe('API de categorías', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof adminWith>>;
  const api = () => authed(t, admin.session);

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    admin = await adminWith(t, prisma, [
      'categories:read',
      'categories:manage',
      'categories:delete',
    ]);
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  const create = (body: Record<string, unknown>) =>
    api().post('/api/categories').send(body);
  const audits = (action: string) =>
    prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });
  const fieldsOf = (res: { body: { errors?: { field: string }[] } }) =>
    (res.body.errors ?? []).map((e) => e.field);

  describe('creación', () => {
    it('crea una categoría sin edades (la Liga aún no las ha confirmado) y la audita', async () => {
      const res = await create({ code: 'liga_a', name: 'Liga A' }).expect(201);
      expect(res.body).toMatchObject({
        code: 'liga_a',
        name: 'Liga A',
        ageMin: null,
        ageMax: null,
        sortOrder: 0,
        status: 'activo',
      });
      const row = await prisma.category.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(row).toMatchObject({ ageMin: null, ageMax: null });
      const [log] = await audits('category.create');
      expect(log).toMatchObject({
        userId: admin.user.id,
        entityType: 'category',
        entityId: res.body.id,
        afterSnapshot: {
          code: 'liga_a',
          name: 'Liga A',
          ageMin: null,
          ageMax: null,
          sortOrder: 0,
          status: 'activo',
        },
      });
    });

    it('crea con rango de edad, solo límite inferior o solo superior', async () => {
      expect(
        (
          await create({
            code: 'rango_a',
            name: 'Rango completo',
            ageMin: 10,
            ageMax: 12,
          }).expect(201)
        ).body,
      ).toMatchObject({ ageMin: 10, ageMax: 12 });
      expect(
        (
          await create({
            code: 'rango_b',
            name: 'Solo mínimo',
            ageMin: 18,
          }).expect(201)
        ).body,
      ).toMatchObject({ ageMin: 18, ageMax: null });
      expect(
        (
          await create({
            code: 'rango_c',
            name: 'Solo máximo',
            ageMax: 8,
          }).expect(201)
        ).body,
      ).toMatchObject({ ageMin: null, ageMax: 8 });
      expect(
        (
          await create({
            code: 'rango_d',
            name: 'Misma edad',
            ageMin: 9,
            ageMax: 9,
          }).expect(201)
        ).body,
      ).toMatchObject({ ageMin: 9, ageMax: 9 });
    });

    it('rechaza rangos de edad inválidos y nunca los guarda', async () => {
      const cases: [Record<string, unknown>, string][] = [
        [{ ageMin: 15, ageMax: 10 }, 'ageMax'],
        [{ ageMin: -1 }, 'ageMin'],
        [{ ageMax: -3 }, 'ageMax'],
        [{ ageMin: 121 }, 'ageMin'],
        [{ ageMax: 200 }, 'ageMax'],
        [{ ageMin: 10.5 }, 'ageMin'],
        [{ ageMin: '10' }, 'ageMin'],
        [{ sortOrder: -1 }, 'sortOrder'],
        [{ sortOrder: 10000 }, 'sortOrder'],
        [{ sortOrder: 1.5 }, 'sortOrder'],
      ];
      for (const [extra, field] of cases) {
        const res = await create({
          code: 'x_cat',
          name: 'Categoría X',
          ...extra,
        }).expect(400);
        expect(fieldsOf(res), JSON.stringify(extra)).toContain(field);
      }
      expect(
        (await create({ code: 'x_cat', name: 'X', ageMin: 15, ageMax: 10 }))
          .body.errors[0].message,
      ).toBe('La edad máxima no puede ser menor que la mínima');
      expect(await prisma.category.count()).toBe(0);
    });

    it('valida código y nombre y rechaza campos no permitidos', async () => {
      await create({}).expect(400);
      await create({ code: 'Liga A', name: 'x' }).expect(400);
      await create({ code: 'ok', name: '' }).expect(400);
      await create({ code: 'ok', name: 'Ok', status: 'inactivo' }).expect(400);
      await create({ code: 'ok', name: 'Ok', gender: 'mixto' }).expect(400);
    });

    it('rechaza duplicados de código y de nombre (sin distinguir mayúsculas)', async () => {
      await create({ code: 'juvenil', name: 'Juvenil' }).expect(201);
      expect(
        (await create({ code: 'juvenil', name: 'Otra' }).expect(409)).body
          .message,
      ).toBe('Ya existe una categoría con ese código');
      expect(
        (await create({ code: 'otra', name: 'juvenil' }).expect(409)).body
          .message,
      ).toBe('Ya existe una categoría con ese nombre');
      expect(await prisma.category.count()).toBe(1);
    });

    it('no relaciona las categorías con un deporte (decisión pendiente de la Liga)', async () => {
      const res = await create({
        code: 'liga_b',
        name: 'Liga B',
        sportId: '0197aaaa-0000-7000-8000-000000000000',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('consulta', () => {
    beforeEach(async () => {
      await prisma.category.createMany({
        data: [
          { code: 'ninos', name: 'Niños', sortOrder: 30, ageMax: 12 },
          { code: 'liga_b', name: 'Liga B', sortOrder: 20 },
          { code: 'liga_a', name: 'Liga A', sortOrder: 10 },
          {
            code: 'juvenil',
            name: 'Juvenil',
            sortOrder: 20,
            status: 'inactivo',
          },
        ],
      });
    });

    it('lista ordenado por orden de presentación y nombre', async () => {
      const res = await api().get('/api/categories').expect(200);
      expect(res.body.items.map((c: { code: string }) => c.code)).toEqual([
        'liga_a',
        'juvenil',
        'liga_b',
        'ninos',
      ]);
      expect(res.body.total).toBe(4);
    });

    it('pagina, filtra por estado y busca', async () => {
      const page = await api()
        .get('/api/categories?pageSize=3&page=2')
        .expect(200);
      expect(page.body.items.map((c: { code: string }) => c.code)).toEqual([
        'ninos',
      ]);
      expect(
        (await api().get('/api/categories?status=inactivo').expect(200)).body
          .total,
      ).toBe(1);
      expect(
        (await api().get('/api/categories?q=LIGA').expect(200)).body.total,
      ).toBe(2);
      expect(
        (await api().get('/api/categories?q=_').expect(200)).body.total,
      ).toBe(2); // solo "liga_a" y "liga_b" contienen "_"
      await api().get('/api/categories?pageSize=500').expect(400);
    });

    it('devuelve por id, 404 e id inválido', async () => {
      const row = await prisma.category.findFirstOrThrow({
        where: { code: 'ninos' },
      });
      expect(
        (await api().get(`/api/categories/${row.id}`).expect(200)).body,
      ).toMatchObject({ code: 'ninos', ageMax: 12 });
      await api()
        .get('/api/categories/0197aaaa-0000-7000-8000-000000000000')
        .expect(404);
      await api().get('/api/categories/xyz').expect(400);
    });
  });

  describe('edición', () => {
    it('modifica campos, borra límites con null y audita solo lo que cambió', async () => {
      const { body: cat } = await create({
        code: 'sub15',
        name: 'Sub 15',
        ageMin: 13,
        ageMax: 15,
      }).expect(201);
      const res = await api()
        .patch(`/api/categories/${cat.id}`)
        .send({ name: 'Sub-15', ageMax: null, sortOrder: 5 })
        .expect(200);
      expect(res.body).toMatchObject({
        code: 'sub15',
        name: 'Sub-15',
        ageMin: 13,
        ageMax: null,
        sortOrder: 5,
      });
      const [log] = await audits('category.update');
      expect(log).toMatchObject({
        entityId: cat.id,
        beforeSnapshot: { name: 'Sub 15', ageMax: 15, sortOrder: 0 },
        afterSnapshot: { name: 'Sub-15', ageMax: null, sortOrder: 5 },
      });
      expect(log!.afterSnapshot).not.toHaveProperty('ageMin');
    });

    it('valida la coherencia sobre el valor resultante, no solo sobre lo enviado', async () => {
      const { body: cat } = await create({
        code: 'sub15',
        name: 'Sub 15',
        ageMin: 13,
        ageMax: 15,
      }).expect(201);
      // Solo se envía ageMax, pero el resultado (min 13, max 10) es incoherente
      const res = await api()
        .patch(`/api/categories/${cat.id}`)
        .send({ ageMax: 10 })
        .expect(400);
      expect(fieldsOf(res)).toContain('ageMax');
      await api()
        .patch(`/api/categories/${cat.id}`)
        .send({ ageMin: 16 })
        .expect(400);
      // Subir ambos a la vez sí es válido
      await api()
        .patch(`/api/categories/${cat.id}`)
        .send({ ageMin: 16, ageMax: 18 })
        .expect(200);
      expect(
        await prisma.category.findUniqueOrThrow({ where: { id: cat.id } }),
      ).toMatchObject({ ageMin: 16, ageMax: 18 });
    });

    it('el código es inmutable y no hay cambios vacíos', async () => {
      const { body: cat } = await create({
        code: 'liga_a',
        name: 'Liga A',
      }).expect(201);
      await api()
        .patch(`/api/categories/${cat.id}`)
        .send({ code: 'otro' })
        .expect(400);
      await api()
        .patch(`/api/categories/${cat.id}`)
        .send({ status: 'inactivo' })
        .expect(400);
      await api().patch(`/api/categories/${cat.id}`).send({}).expect(400);
    });

    it('rechaza un nombre duplicado, no audita sin cambios y responde 404 si no existe', async () => {
      await create({ code: 'liga_a', name: 'Liga A' }).expect(201);
      const { body: b } = await create({
        code: 'liga_b',
        name: 'Liga B',
      }).expect(201);
      await api()
        .patch(`/api/categories/${b.id}`)
        .send({ name: 'liga a' })
        .expect(409);
      await api()
        .patch(`/api/categories/${b.id}`)
        .send({ name: 'Liga B' })
        .expect(200);
      expect(await audits('category.update')).toHaveLength(0);
      await api()
        .patch('/api/categories/0197aaaa-0000-7000-8000-000000000000')
        .send({ name: 'X' })
        .expect(404);
    });
  });

  describe('estado y eliminación', () => {
    it('desactiva y reactiva sin perder el registro, con auditoría', async () => {
      const { body: cat } = await create({
        code: 'liga_a',
        name: 'Liga A',
      }).expect(201);
      expect(
        (
          await api()
            .patch(`/api/categories/${cat.id}/status`)
            .send({ status: 'inactivo', reason: 'Fusionada con Liga B' })
            .expect(200)
        ).body.status,
      ).toBe('inactivo');
      await api()
        .patch(`/api/categories/${cat.id}/status`)
        .send({ status: 'activo' })
        .expect(200);
      const logs = await audits('category.status_change');
      expect(logs.map((l) => l.afterSnapshot)).toEqual([
        { status: 'inactivo' },
        { status: 'activo' },
      ]);
      expect(logs[0]!.reason).toBe('Fusionada con Liga B');
      expect(await prisma.category.count()).toBe(1);
    });

    it('elimina una categoría sin uso y lo audita', async () => {
      const { body: cat } = await create({
        code: 'liga_a',
        name: 'Liga A',
        ageMin: 18,
      }).expect(201);
      await api().delete(`/api/categories/${cat.id}`).expect(204);
      expect(await prisma.category.count()).toBe(0);
      expect((await audits('category.delete'))[0]).toMatchObject({
        entityId: cat.id,
        beforeSnapshot: { code: 'liga_a', ageMin: 18 },
      });
      await api().delete(`/api/categories/${cat.id}`).expect(404);
    });
  });
});
