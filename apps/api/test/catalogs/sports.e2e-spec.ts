import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import { adminWith, authed, seedCatalog } from '../support/fixtures.js';

describe('API de deportes', () => {
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
      'sports:read',
      'sports:manage',
      'sports:delete',
    ]);
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  const create = (code: string, name: string) =>
    api().post('/api/sports').send({ code, name });
  const audits = (action: string) =>
    prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });

  describe('creación', () => {
    it('crea un deporte activo, lo guarda en PostgreSQL y lo audita', async () => {
      const res = await create('futbol', 'Fútbol').expect(201);
      expect(res.body).toMatchObject({
        code: 'futbol',
        name: 'Fútbol',
        status: 'activo',
      });
      expect(res.body.id).toEqual(expect.any(String));

      const row = await prisma.sport.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(row).toMatchObject({
        code: 'futbol',
        name: 'Fútbol',
        status: 'activo',
      });

      const [log] = await audits('sport.create');
      expect(log).toMatchObject({
        userId: admin.user.id,
        entityType: 'sport',
        entityId: res.body.id,
        afterSnapshot: { code: 'futbol', name: 'Fútbol', status: 'activo' },
      });
      expect(log!.ipHash).toMatch(/^[0-9a-f]{64}$/);
      expect(log!.createdAt).toBeInstanceOf(Date);
    });

    it('normaliza espacios del nombre', async () => {
      const res = await create('basquet', '   Bás   quet  ').expect(201);
      expect(res.body.name).toBe('Bás quet');
    });

    it('valida los datos de entrada con errores por campo', async () => {
      const bad = [
        [{}, ['code', 'name']],
        [{ code: 'Fútbol', name: 'x' }, ['code']],
        [{ code: '1abc', name: 'x' }, ['code']],
        [{ code: 'con espacio', name: 'x' }, ['code']],
        [{ code: 'a', name: 'x' }, ['code']],
        [{ code: 'ok', name: '   ' }, ['name']],
        [{ code: 'ok', name: 'x'.repeat(101) }, ['name']],
        [{ code: 'ok', name: 123 }, ['name']],
        [{ code: 'x'.repeat(41), name: 'x' }, ['code']],
      ] as const;
      for (const [body, fields] of bad) {
        const res = await api().post('/api/sports').send(body).expect(400);
        expect(res.body.message).toBe('Solicitud inválida');
        const reported = res.body.errors.map((e: { field: string }) => e.field);
        for (const f of fields)
          expect(reported, JSON.stringify(body)).toContain(f);
      }
      expect(await prisma.sport.count()).toBe(0);
    });

    it('rechaza campos no permitidos (no se puede fijar id, estado ni fechas)', async () => {
      for (const extra of [
        { status: 'inactivo' },
        { id: '0197aaaa-0000-7000-8000-000000000000' },
        { createdAt: '2000-01-01' },
      ]) {
        await api()
          .post('/api/sports')
          .send({ code: 'futbol', name: 'Fútbol', ...extra })
          .expect(400);
      }
    });

    it('rechaza código o nombre duplicados, también si solo difieren en mayúsculas', async () => {
      await create('futbol', 'Fútbol').expect(201);
      expect((await create('futbol', 'Otro').expect(409)).body.message).toBe(
        'Ya existe un deporte con ese código',
      );
      expect((await create('otro', 'Fútbol').expect(409)).body.message).toBe(
        'Ya existe un deporte con ese nombre',
      );
      expect((await create('otro', 'FÚTBOL').expect(409)).body.message).toBe(
        'Ya existe un deporte con ese nombre',
      );
      expect((await create('otro', '  fútbol ').expect(409)).body.message).toBe(
        'Ya existe un deporte con ese nombre',
      );
      expect(await prisma.sport.count()).toBe(1);
      expect(await audits('sport.create')).toHaveLength(1);
    });

    it('dos creaciones simultáneas del mismo deporte producen un único registro', async () => {
      const results = await Promise.all([
        create('futbol', 'Fútbol'),
        create('futbol', 'Fútbol'),
        create('futbol', 'Fútbol'),
      ]);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(2);
      expect(await prisma.sport.count()).toBe(1);
      expect(await audits('sport.create')).toHaveLength(1);
    });
  });

  describe('consulta', () => {
    beforeEach(async () => {
      await prisma.sport.createMany({
        data: [
          { code: 'futbol', name: 'Fútbol' },
          { code: 'basquet', name: 'Básquet' },
          { code: 'ajedrez', name: 'Ajedrez', status: 'inactivo' },
          { code: 'taekwondo', name: 'Taekwondo' },
          { code: 'natacion', name: 'Natación', status: 'inactivo' },
        ],
      });
    });

    it('lista paginado y ordenado por nombre', async () => {
      const first = await api().get('/api/sports?pageSize=2').expect(200);
      expect(first.body).toMatchObject({ page: 1, pageSize: 2, total: 5 });
      expect(first.body.items.map((s: { name: string }) => s.name)).toEqual([
        'Ajedrez',
        'Básquet',
      ]);
      const third = await api()
        .get('/api/sports?pageSize=2&page=3')
        .expect(200);
      expect(third.body.items.map((s: { name: string }) => s.name)).toEqual([
        'Taekwondo',
      ]);
      const beyond = await api()
        .get('/api/sports?pageSize=2&page=9')
        .expect(200);
      expect(beyond.body.items).toEqual([]);
      expect(beyond.body.total).toBe(5);
    });

    it('filtra por estado y busca por nombre o código sin distinguir mayúsculas', async () => {
      const inactive = await api()
        .get('/api/sports?status=inactivo')
        .expect(200);
      expect(inactive.body.total).toBe(2);
      const byName = await api().get('/api/sports?q=FÚT').expect(200);
      expect(byName.body.items.map((s: { code: string }) => s.code)).toEqual([
        'futbol',
      ]);
      const byCode = await api().get('/api/sports?q=kwon').expect(200);
      expect(byCode.body.items.map((s: { code: string }) => s.code)).toEqual([
        'taekwondo',
      ]);
      const combined = await api()
        .get('/api/sports?q=a&status=inactivo')
        .expect(200);
      expect(combined.body.total).toBe(2);
      expect(
        (await api().get('/api/sports?q=zzz').expect(200)).body,
      ).toMatchObject({ items: [], total: 0 });
    });

    it('trata la búsqueda como texto, no como patrón SQL', async () => {
      const res = await api()
        .get(`/api/sports?q=${encodeURIComponent("%' OR 1=1 --")}`)
        .expect(200);
      expect(res.body.total).toBe(0);
      for (const wildcard of ['%', '_', '\\']) {
        const res = await api()
          .get(`/api/sports?q=${encodeURIComponent(wildcard)}`)
          .expect(200);
        expect(res.body.total, wildcard).toBe(0);
      }
      // Los comodines se buscan como texto literal
      await prisma.sport.create({
        data: { code: 'cien', name: '100% Pelota_Libre' },
      });
      for (const literal of ['%', '_']) {
        const res = await api()
          .get(`/api/sports?q=${encodeURIComponent(literal)}`)
          .expect(200);
        expect(
          res.body.items.map((s: { code: string }) => s.code),
          literal,
        ).toEqual(['cien']);
      }
    });

    it('rechaza parámetros de paginación inválidos', async () => {
      for (const qs of [
        'page=0',
        'page=-1',
        'page=abc',
        'pageSize=0',
        'pageSize=101',
        'status=eliminado',
      ]) {
        await api().get(`/api/sports?${qs}`).expect(400);
      }
    });

    it('devuelve un deporte por id, 404 si no existe y 400 si el id es inválido', async () => {
      const row = await prisma.sport.findFirstOrThrow({
        where: { code: 'futbol' },
      });
      const res = await api().get(`/api/sports/${row.id}`).expect(200);
      expect(res.body).toMatchObject({
        id: row.id,
        code: 'futbol',
        name: 'Fútbol',
      });
      expect(Object.keys(res.body).sort()).toEqual([
        'code',
        'createdAt',
        'id',
        'name',
        'status',
        'updatedAt',
      ]);
      await api()
        .get('/api/sports/0197aaaa-0000-7000-8000-000000000000')
        .expect(404);
      await api().get('/api/sports/no-es-uuid').expect(400);
    });
  });

  describe('edición', () => {
    it('modifica el nombre, conserva el código y audita antes/después', async () => {
      const { body: sport } = await create('futbol', 'Fútbol').expect(201);
      const res = await api()
        .patch(`/api/sports/${sport.id}`)
        .send({ name: 'Fútbol sala' })
        .expect(200);
      expect(res.body).toMatchObject({ code: 'futbol', name: 'Fútbol sala' });
      expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(sport.updatedAt).getTime(),
      );

      const [log] = await audits('sport.update');
      expect(log).toMatchObject({
        userId: admin.user.id,
        entityId: sport.id,
        beforeSnapshot: { name: 'Fútbol' },
        afterSnapshot: { name: 'Fútbol sala' },
      });
    });

    it('el código es inmutable y el estado no se cambia por esta vía', async () => {
      const { body: sport } = await create('futbol', 'Fútbol').expect(201);
      await api()
        .patch(`/api/sports/${sport.id}`)
        .send({ code: 'otro' })
        .expect(400);
      await api()
        .patch(`/api/sports/${sport.id}`)
        .send({ name: 'X', status: 'inactivo' })
        .expect(400);
      await api().patch(`/api/sports/${sport.id}`).send({}).expect(400);
      expect(
        (await prisma.sport.findUniqueOrThrow({ where: { id: sport.id } }))
          .code,
      ).toBe('futbol');
    });

    it('rechaza un nombre duplicado, pero permite cambiar solo mayúsculas del propio nombre', async () => {
      await create('futbol', 'Fútbol').expect(201);
      const { body: other } = await create('basquet', 'Básquet').expect(201);
      expect(
        (
          await api()
            .patch(`/api/sports/${other.id}`)
            .send({ name: 'fútbol' })
            .expect(409)
        ).body.message,
      ).toBe('Ya existe un deporte con ese nombre');
      await api()
        .patch(`/api/sports/${other.id}`)
        .send({ name: 'BÁSQUET' })
        .expect(200);
    });

    it('no audita ni modifica cuando no hay cambios', async () => {
      const { body: sport } = await create('futbol', 'Fútbol').expect(201);
      await api()
        .patch(`/api/sports/${sport.id}`)
        .send({ name: 'Fútbol' })
        .expect(200);
      expect(await audits('sport.update')).toHaveLength(0);
    });

    it('responde 404 al editar un deporte inexistente', async () => {
      await api()
        .patch('/api/sports/0197aaaa-0000-7000-8000-000000000000')
        .send({ name: 'X' })
        .expect(404);
    });
  });

  describe('activación y desactivación', () => {
    it('desactiva y reactiva conservando el registro, con motivo opcional auditado', async () => {
      const { body: sport } = await create('futbol', 'Fútbol').expect(201);
      const off = await api()
        .patch(`/api/sports/${sport.id}/status`)
        .send({ status: 'inactivo', reason: 'Sin competencia este año' })
        .expect(200);
      expect(off.body.status).toBe('inactivo');
      await api()
        .patch(`/api/sports/${sport.id}/status`)
        .send({ status: 'activo' })
        .expect(200);

      const logs = await audits('sport.status_change');
      expect(logs).toHaveLength(2);
      expect(logs[0]).toMatchObject({
        reason: 'Sin competencia este año',
        beforeSnapshot: { status: 'activo' },
        afterSnapshot: { status: 'inactivo' },
      });
      expect(logs[1]!.reason).toBeNull();
      expect(await prisma.sport.count()).toBe(1);
    });

    it('es idempotente (sin auditoría) y valida el estado', async () => {
      const { body: sport } = await create('futbol', 'Fútbol').expect(201);
      await api()
        .patch(`/api/sports/${sport.id}/status`)
        .send({ status: 'activo' })
        .expect(200);
      expect(await audits('sport.status_change')).toHaveLength(0);
      await api()
        .patch(`/api/sports/${sport.id}/status`)
        .send({ status: 'borrador' })
        .expect(400);
      await api()
        .patch(`/api/sports/${sport.id}/status`)
        .send({ status: 'inactivo', reason: 'x' })
        .expect(400);
    });
  });

  describe('eliminación', () => {
    it('elimina un deporte sin uso y lo audita con su estado previo', async () => {
      const { body: sport } = await create('futbol', 'Fútbol').expect(201);
      await api().delete(`/api/sports/${sport.id}`).expect(204);
      expect(await prisma.sport.count()).toBe(0);
      const [log] = await audits('sport.delete');
      expect(log).toMatchObject({
        entityId: sport.id,
        beforeSnapshot: { code: 'futbol', name: 'Fútbol', status: 'activo' },
      });
      await api().delete(`/api/sports/${sport.id}`).expect(404);
    });
  });

  describe('errores', () => {
    it('un fallo inesperado de persistencia responde 500 genérico sin filtrar detalles y no deja datos', async () => {
      const { PrismaService } =
        await import('../../src/database/prisma.service.js');
      const client = t.app.get(PrismaService).client;
      const spy = vi
        .spyOn(client, '$transaction')
        .mockRejectedValueOnce(
          new Error('FATAL: password authentication failed for user "liga"'),
        );
      const res = await create('futbol', 'Fútbol');
      spy.mockRestore();
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toMatch(/password|liga|FATAL/);
      expect(await prisma.sport.count()).toBe(0);
    });
  });
});
