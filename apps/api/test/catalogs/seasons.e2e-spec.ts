import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import { adminWith, authed, seedCatalog } from '../support/fixtures.js';

describe('API de temporadas', () => {
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
      'seasons:read',
      'seasons:manage',
      'seasons:delete',
    ]);
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  const body = (over: Record<string, unknown> = {}) => ({
    name: 'Temporada 2026',
    startDate: '2026-03-01',
    endDate: '2026-11-30',
    ...over,
  });
  const create = (over: Record<string, unknown> = {}) =>
    api().post('/api/seasons').send(body(over));
  const audits = (action: string) =>
    prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });
  const fieldsOf = (res: { body: { errors?: { field: string }[] } }) =>
    (res.body.errors ?? []).map((e) => e.field);
  const setStatus = (id: string, status: string, reason = 'Motivo de prueba') =>
    api().patch(`/api/seasons/${id}/status`).send({ status, reason });

  describe('creación', () => {
    it('crea la temporada en borrador, con fechas de calendario exactas, y la audita', async () => {
      const res = await create().expect(201);
      expect(res.body).toMatchObject({
        name: 'Temporada 2026',
        startDate: '2026-03-01',
        endDate: '2026-11-30',
        status: 'borrador',
        allowedTransitions: ['activa'],
      });
      const [row] = await prisma.$queryRaw<{ s: string; e: string }[]>`
        SELECT start_date::text AS s, end_date::text AS e FROM seasons WHERE id = ${res.body.id}::uuid`;
      expect(row).toEqual({ s: '2026-03-01', e: '2026-11-30' });
      const [log] = await audits('season.create');
      expect(log).toMatchObject({
        userId: admin.user.id,
        entityId: res.body.id,
        afterSnapshot: {
          name: 'Temporada 2026',
          startDate: '2026-03-01',
          endDate: '2026-11-30',
          status: 'borrador',
        },
      });
    });

    it('no se puede crear en otro estado ni fijar campos internos', async () => {
      await create({ status: 'activa' }).expect(400);
      await create({ id: '0197aaaa-0000-7000-8000-000000000000' }).expect(400);
      await create({ code: 'T26' }).expect(400);
      expect(await prisma.season.count()).toBe(0);
    });

    it('valida fechas: formato, calendario real y orden', async () => {
      const cases: [Record<string, unknown>, string][] = [
        [{ startDate: '01/03/2026' }, 'startDate'],
        [{ startDate: '2026-3-1' }, 'startDate'],
        [{ startDate: '2026-02-30' }, 'startDate'],
        [{ endDate: '2026-13-01' }, 'endDate'],
        [{ endDate: '2026-02-29' }, 'endDate'],
        [{ startDate: 20260301 }, 'startDate'],
        [{ endDate: null }, 'endDate'],
        [{ endDate: '2026-03-01' }, 'endDate'], // igual al inicio
        [{ endDate: '2026-02-28' }, 'endDate'], // anterior al inicio
      ];
      for (const [over, field] of cases) {
        const res = await create(over).expect(400);
        expect(fieldsOf(res), JSON.stringify(over)).toContain(field);
      }
      const order = await create({ endDate: '2026-02-28' }).expect(400);
      expect(order.body.errors[0].message).toBe(
        'La fecha de fin debe ser posterior a la de inicio',
      );
      await api().post('/api/seasons').send({ name: 'Sin fechas' }).expect(400);
      expect(await prisma.season.count()).toBe(0);
    });

    it('acepta el 29 de febrero de un año bisiesto', async () => {
      await create({
        name: 'Bisiesta',
        startDate: '2028-02-29',
        endDate: '2028-12-31',
      }).expect(201);
    });

    it('rechaza nombres duplicados (sin distinguir mayúsculas) y vacíos', async () => {
      await create().expect(201);
      expect(
        (await create({ name: 'TEMPORADA 2026' }).expect(409)).body.message,
      ).toBe('Ya existe una temporada con ese nombre');
      await create({ name: '  ' }).expect(400);
      await create({ name: 'x'.repeat(101) }).expect(400);
      expect(await prisma.season.count()).toBe(1);
    });

    it('permite temporadas solapadas (regla institucional aún sin confirmar)', async () => {
      await create({
        name: 'A',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      }).expect(201);
      await create({
        name: 'B',
        startDate: '2026-06-01',
        endDate: '2027-05-31',
      }).expect(201);
      expect(await prisma.season.count()).toBe(2);
    });
  });

  describe('consulta', () => {
    beforeEach(async () => {
      await prisma.season.createMany({
        data: [
          {
            name: 'Temporada 2024',
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-11-30'),
            status: 'archivada',
          },
          {
            name: 'Temporada 2026',
            startDate: new Date('2026-03-01'),
            endDate: new Date('2026-11-30'),
            status: 'activa',
          },
          {
            name: 'Temporada 2025',
            startDate: new Date('2025-03-01'),
            endDate: new Date('2025-11-30'),
            status: 'finalizada',
          },
          {
            name: 'Temporada 2027',
            startDate: new Date('2027-03-01'),
            endDate: new Date('2027-11-30'),
          },
        ],
      });
    });

    it('lista de la más reciente a la más antigua, con paginación', async () => {
      const res = await api().get('/api/seasons').expect(200);
      expect(res.body.items.map((s: { name: string }) => s.name)).toEqual([
        'Temporada 2027',
        'Temporada 2026',
        'Temporada 2025',
        'Temporada 2024',
      ]);
      const page = await api()
        .get('/api/seasons?pageSize=3&page=2')
        .expect(200);
      expect(page.body).toMatchObject({ page: 2, pageSize: 3, total: 4 });
      expect(page.body.items).toHaveLength(1);
    });

    it('filtra por estado y busca por nombre', async () => {
      expect(
        (await api().get('/api/seasons?status=activa').expect(200)).body
          .items[0].name,
      ).toBe('Temporada 2026');
      expect(
        (await api().get('/api/seasons?q=2025').expect(200)).body.total,
      ).toBe(1);
      await api().get('/api/seasons?status=cualquiera').expect(400);
    });

    it('devuelve por id con las transiciones permitidas, 404 e id inválido', async () => {
      const row = await prisma.season.findFirstOrThrow({
        where: { name: 'Temporada 2025' },
      });
      const res = await api().get(`/api/seasons/${row.id}`).expect(200);
      expect(res.body).toMatchObject({
        status: 'finalizada',
        allowedTransitions: ['archivada', 'activa'],
      });
      await api()
        .get('/api/seasons/0197aaaa-0000-7000-8000-000000000000')
        .expect(404);
      await api().get('/api/seasons/abc').expect(400);
    });
  });

  describe('edición', () => {
    it('modifica nombre y fechas, y audita solo lo que cambió', async () => {
      const { body: s } = await create().expect(201);
      const res = await api()
        .patch(`/api/seasons/${s.id}`)
        .send({ name: 'Temporada 2026-27', endDate: '2027-02-28' })
        .expect(200);
      expect(res.body).toMatchObject({
        name: 'Temporada 2026-27',
        startDate: '2026-03-01',
        endDate: '2027-02-28',
      });
      const [log] = await audits('season.update');
      expect(log).toMatchObject({
        beforeSnapshot: { name: 'Temporada 2026', endDate: '2026-11-30' },
        afterSnapshot: { name: 'Temporada 2026-27', endDate: '2027-02-28' },
      });
      expect(log!.afterSnapshot).not.toHaveProperty('startDate');
    });

    it('valida la coherencia de fechas sobre el resultado final', async () => {
      const { body: s } = await create().expect(201);
      // Solo se envía el fin, pero queda antes del inicio guardado
      const res = await api()
        .patch(`/api/seasons/${s.id}`)
        .send({ endDate: '2026-02-01' })
        .expect(400);
      expect(fieldsOf(res)).toContain('endDate');
      await api()
        .patch(`/api/seasons/${s.id}`)
        .send({ startDate: '2026-12-01' })
        .expect(400);
      await api()
        .patch(`/api/seasons/${s.id}`)
        .send({ startDate: '2027-01-01', endDate: '2027-12-31' })
        .expect(200);
      expect(
        await prisma.season.findUniqueOrThrow({ where: { id: s.id } }),
      ).toMatchObject({
        startDate: new Date('2027-01-01'),
        endDate: new Date('2027-12-31'),
      });
    });

    it('no cambia el estado por esta vía y rechaza cuerpos vacíos', async () => {
      const { body: s } = await create().expect(201);
      await api()
        .patch(`/api/seasons/${s.id}`)
        .send({ status: 'activa' })
        .expect(400);
      await api().patch(`/api/seasons/${s.id}`).send({}).expect(400);
    });

    it('rechaza nombre duplicado, no audita sin cambios y responde 404 si no existe', async () => {
      await create({ name: 'A' }).expect(201);
      const { body: b } = await create({ name: 'B' }).expect(201);
      await api().patch(`/api/seasons/${b.id}`).send({ name: 'a' }).expect(409);
      await api()
        .patch(`/api/seasons/${b.id}`)
        .send({ name: 'B', startDate: '2026-03-01' })
        .expect(200);
      expect(await audits('season.update')).toHaveLength(0);
      await api()
        .patch('/api/seasons/0197aaaa-0000-7000-8000-000000000000')
        .send({ name: 'X' })
        .expect(404);
    });

    it('una temporada archivada es de solo lectura', async () => {
      const { body: s } = await create().expect(201);
      await setStatus(s.id, 'activa').expect(200);
      await setStatus(s.id, 'finalizada').expect(200);
      await setStatus(s.id, 'archivada').expect(200);
      const res = await api()
        .patch(`/api/seasons/${s.id}`)
        .send({ name: 'Otro nombre' })
        .expect(409);
      expect(res.body.message).toBe(
        'Una temporada archivada no puede modificarse',
      );
    });
  });

  describe('cambio de estado', () => {
    it('recorre el ciclo borrador → activa → finalizada → archivada auditando cada paso con su motivo', async () => {
      const { body: s } = await create().expect(201);
      for (const [status, reason] of [
        ['activa', 'Inicio del campeonato'],
        ['finalizada', 'Terminó el calendario'],
        ['archivada', 'Cierre administrativo'],
      ] as const) {
        const res = await setStatus(s.id, status, reason).expect(200);
        expect(res.body.status).toBe(status);
      }
      const logs = await audits('season.status_change');
      expect(
        logs.map((l) => [l.beforeSnapshot, l.afterSnapshot, l.reason]),
      ).toEqual([
        [{ status: 'borrador' }, { status: 'activa' }, 'Inicio del campeonato'],
        [
          { status: 'activa' },
          { status: 'finalizada' },
          'Terminó el calendario',
        ],
        [
          { status: 'finalizada' },
          { status: 'archivada' },
          'Cierre administrativo',
        ],
      ]);
      expect(
        logs.every((l) => l.userId === admin.user.id && l.entityId === s.id),
      ).toBe(true);
    });

    it('permite las correcciones previstas (reabrir una finalizada, restaurar una archivada)', async () => {
      const { body: s } = await create().expect(201);
      for (const status of [
        'activa',
        'finalizada',
        'activa',
        'finalizada',
        'archivada',
        'finalizada',
      ]) {
        await setStatus(s.id, status).expect(200);
      }
    });

    it('rechaza transiciones no permitidas con un mensaje claro y sin cambiar nada', async () => {
      const { body: s } = await create().expect(201);
      for (const status of ['finalizada', 'archivada']) {
        const res = await setStatus(s.id, status).expect(409);
        expect(res.body.message).toContain('No se puede pasar de «borrador»');
        expect(res.body.message).toContain('activa');
      }
      expect(
        (await prisma.season.findUniqueOrThrow({ where: { id: s.id } })).status,
      ).toBe('borrador');
      expect(await audits('season.status_change')).toHaveLength(0);
    });

    it('exige un motivo y un estado válido', async () => {
      const { body: s } = await create().expect(201);
      await api()
        .patch(`/api/seasons/${s.id}/status`)
        .send({ status: 'activa' })
        .expect(400);
      await api()
        .patch(`/api/seasons/${s.id}/status`)
        .send({ status: 'activa', reason: ' ' })
        .expect(400);
      await setStatus(s.id, 'eliminada').expect(400);
      await setStatus('0197aaaa-0000-7000-8000-000000000000', 'activa').expect(
        404,
      );
    });

    it('repetir el estado actual es idempotente y no se audita', async () => {
      const { body: s } = await create().expect(201);
      await setStatus(s.id, 'borrador').expect(200);
      expect(await audits('season.status_change')).toHaveLength(0);
    });
  });

  describe('eliminación', () => {
    it('elimina una temporada en borrador y lo audita', async () => {
      const { body: s } = await create().expect(201);
      await api().delete(`/api/seasons/${s.id}`).expect(204);
      expect(await prisma.season.count()).toBe(0);
      expect((await audits('season.delete'))[0]).toMatchObject({
        entityId: s.id,
        beforeSnapshot: { name: 'Temporada 2026', status: 'borrador' },
      });
      await api().delete(`/api/seasons/${s.id}`).expect(404);
    });

    it('no elimina temporadas que ya salieron de borrador: se archivan', async () => {
      for (const status of ['activa', 'finalizada', 'archivada'] as const) {
        const row = await prisma.season.create({
          data: {
            name: `T ${status}`,
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-12-31'),
            status,
          },
        });
        const res = await api().delete(`/api/seasons/${row.id}`).expect(409);
        expect(res.body.message).toBe(
          'Solo se pueden eliminar temporadas en borrador. Archive la temporada en su lugar.',
        );
        expect(await prisma.season.count({ where: { id: row.id } })).toBe(1);
      }
      expect(await audits('season.delete')).toHaveLength(0);
    });
  });
});
