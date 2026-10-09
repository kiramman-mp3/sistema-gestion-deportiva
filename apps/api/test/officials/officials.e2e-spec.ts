import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import {
  adminWith,
  authed,
  createMatchScenario,
  createUser,
  login,
  seedCatalog,
} from '../support/fixtures.js';

const ADMIN = [
  'officials:read',
  'officials:manage',
  'officials:delete',
  'assignments:read',
  'assignments:manage',
  'clubs:access_all',
  'fixtures:manage',
  'fixtures:read',
];

type Scenario = Awaited<ReturnType<typeof createMatchScenario>>;

describe('árbitros, jueces y designaciones', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof adminWith>>;
  let scenario: Scenario;

  const api = () => authed(t, admin.session);

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    admin = await adminWith(t, prisma, ADMIN);
    scenario = await createMatchScenario(prisma);
  });

  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  const newOfficial = async (
    over: Record<string, unknown> = {},
    expectStatus = 201,
  ) => {
    const n = Math.random().toString(36).slice(2, 8);
    const res = await api()
      .post('/api/officials')
      .send({
        firstName: `Árbitro${n}`,
        lastName: `Prueba${n}`,
        sportIds: [scenario.sport.id],
        phone: '0991112222',
        ...over,
      })
      .expect(expectStatus);
    return res.body;
  };

  /** Otro partido del mismo campeonato en la hora indicada (UTC). */
  const extraEvent = (iso: string) =>
    prisma.event.create({
      data: {
        roundId: scenario.round.id,
        scheduledAt: new Date(iso),
        participants: {
          create: [
            { registrationId: scenario.home.registrationId, side: 'local' },
            { registrationId: scenario.away.registrationId, side: 'visitante' },
          ],
        },
      },
    });

  const assign = (
    eventId: string,
    officialId: string,
    role = 'arbitro_central',
  ) =>
    api().post(`/api/events/${eventId}/assignments`).send({ officialId, role });

  describe('acceso y privacidad', () => {
    it('exige sesión y permisos; el teléfono solo lo ven quienes gestionan', async () => {
      await t.http().get('/api/officials').expect(401);
      const official = await newOfficial();

      const reader = await createUser(prisma, {
        permissions: ['officials:read'],
      });
      const readerApi = authed(t, await login(t, reader.email));
      const asReader = await readerApi.get(`/api/officials/${official.id}`);
      expect(asReader.status).toBe(200);
      expect(asReader.body).not.toHaveProperty('phone');
      expect(asReader.body).not.toHaveProperty('account');
      await readerApi
        .post('/api/officials')
        .send({ firstName: 'A', lastName: 'B', sportIds: [scenario.sport.id] })
        .expect(403);
      await readerApi.delete(`/api/officials/${official.id}`).expect(403);

      const asAdmin = await api().get(`/api/officials/${official.id}`);
      expect(asAdmin.body.phone).toBe('0991112222');

      const designer = await createUser(prisma, {
        permissions: ['officials:read', 'assignments:manage'],
      });
      const designerApi = authed(t, await login(t, designer.email));
      expect(
        (await designerApi.get(`/api/officials/${official.id}`)).body.phone,
      ).toBe('0991112222');

      const nobody = await createUser(prisma, { permissions: ['sports:read'] });
      await authed(t, await login(t, nobody.email))
        .get('/api/officials')
        .expect(403);
    });
  });

  describe('registro de oficiales', () => {
    it('registra, consulta, filtra, modifica y audita', async () => {
      const created = await newOfficial({
        firstName: 'Carlos',
        lastName: 'Mena',
        licenseNumber: 'LIC-001',
      });
      expect(created).toMatchObject({
        firstName: 'Carlos',
        lastName: 'Mena',
        status: 'activo',
        licenseNumber: 'LIC-001',
        hasAccount: false,
      });
      expect(created.sports).toHaveLength(1);

      const other = await prisma.sport.create({
        data: { code: 'basquet', name: 'Básquet' },
      });
      const second = await newOfficial({
        firstName: 'Luis',
        lastName: 'Zambrano',
        sportIds: [other.id],
      });

      const all = await api().get('/api/officials').expect(200);
      expect(all.body.total).toBe(2);
      expect(
        all.body.items.map((o: { lastName: string }) => o.lastName),
      ).toEqual(['Mena', 'Zambrano']);
      expect((await api().get('/api/officials?q=zamb')).body.items[0].id).toBe(
        second.id,
      );
      expect(
        (await api().get(`/api/officials?sportId=${scenario.sport.id}`)).body
          .total,
      ).toBe(1);

      const patched = await api()
        .patch(`/api/officials/${created.id}`)
        .send({
          status: 'suspendido',
          lastName: 'Mena Vera',
          sportIds: [scenario.sport.id, other.id],
          licenseNumber: '',
        })
        .expect(200);
      expect(patched.body).toMatchObject({
        status: 'suspendido',
        lastName: 'Mena Vera',
        licenseNumber: null,
      });
      expect(patched.body.sports).toHaveLength(2);
      expect(
        (await api().get('/api/officials?status=suspendido')).body.total,
      ).toBe(1);

      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'official', entityId: created.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.action)).toEqual([
        'official.created',
        'official.updated',
      ]);
      expect(JSON.stringify(logs[1]!.afterSnapshot)).toContain('suspendido');
    });

    it('valida deportes, club, persona repetida y datos', async () => {
      await newOfficial(
        { sportIds: ['00000000-0000-7000-8000-000000000000'] },
        400,
      );
      await newOfficial({ sportIds: [] }, 400);
      await newOfficial({ firstName: undefined, lastName: undefined }, 400);
      await newOfficial(
        { clubId: '00000000-0000-7000-8000-000000000000' },
        400,
      );
      await newOfficial({ extra: 'x' }, 400);

      const person = await prisma.person.create({
        data: { firstName: 'Ya', lastName: 'Oficial' },
      });
      await newOfficial({ personId: person.id }, 201);
      await newOfficial({ personId: person.id }, 409);
    });

    it('vincula una cuenta activa, una sola vez, y la muestra solo a quien gestiona', async () => {
      const account = await createUser(prisma, { email: 'arb@liga.example' });
      const official = await newOfficial({ userEmail: 'ARB@liga.example' });
      expect(official.hasAccount).toBe(true);
      expect(official.account).toMatchObject({ email: 'arb@liga.example' });

      await newOfficial({ userEmail: 'arb@liga.example' }, 409);
      await newOfficial({ userEmail: 'nadie@liga.example' }, 400);
      await prisma.user.update({
        where: { id: account.id },
        data: { status: 'inactivo' },
      });
      await newOfficial({ userEmail: 'arb@liga.example' }, 400);

      const unlinked = await api()
        .patch(`/api/officials/${official.id}`)
        .send({ userEmail: null })
        .expect(200);
      expect(unlinked.body.hasAccount).toBe(false);
    });

    it('elimina un oficial sin designaciones (y su persona) y protege el historial', async () => {
      const free = await newOfficial();
      const before = await prisma.person.count();
      await api().delete(`/api/officials/${free.id}`).expect(204);
      expect(await prisma.person.count()).toBe(before - 1);

      // Una persona que además es deportista se conserva.
      const athlete = await prisma.athlete.findFirstOrThrow();
      const ex = await newOfficial({ personId: athlete.personId });
      await api().delete(`/api/officials/${ex.id}`).expect(204);
      expect(
        await prisma.person.findUnique({ where: { id: athlete.personId } }),
      ).not.toBeNull();

      const busy = await newOfficial();
      await assign(scenario.event.id, busy.id).expect(201);
      const res = await api().delete(`/api/officials/${busy.id}`).expect(409);
      expect(res.body.message).toMatch(/designaciones/);
    });

    it('registra períodos de indisponibilidad válidos y los quita', async () => {
      const official = await newOfficial();
      const url = `/api/officials/${official.id}/unavailability`;
      await api()
        .post(url)
        .send({
          startsAt: '2099-02-01T00:00:00.000Z',
          endsAt: '2099-01-01T00:00:00.000Z',
        })
        .expect(400);
      const ok = await api()
        .post(url)
        .send({
          startsAt: '2099-01-01T00:00:00.000Z',
          endsAt: '2099-01-10T00:00:00.000Z',
          reason: 'Viaje',
        })
        .expect(201);
      expect(
        (await api().get(`/api/officials/${official.id}`)).body
          .unavailabilities,
      ).toHaveLength(1);
      await api().delete(`${url}/${ok.body.id}`).expect(204);
      await api().delete(`${url}/${ok.body.id}`).expect(404);
    });
  });

  describe('designaciones y conflictos', () => {
    it('designa, lista y retira con auditoría', async () => {
      const official = await newOfficial();
      const res = await assign(scenario.event.id, official.id).expect(201);
      expect(res.body).toMatchObject({
        role: 'arbitro_central',
        status: 'designado',
      });

      const list = await api()
        .get(`/api/events/${scenario.event.id}/assignments`)
        .expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({
        roleLabel: 'árbitro central',
        official: { id: official.id },
      });

      await api()
        .delete(`/api/events/${scenario.event.id}/assignments/${res.body.id}`)
        .send({ reason: 'Cambio de terna' })
        .expect(204);
      expect(
        (await api().get(`/api/events/${scenario.event.id}/assignments`)).body,
      ).toHaveLength(0);
      const actions = (
        await prisma.auditLog.findMany({ where: { entityType: 'event' } })
      ).map((l) => l.action);
      expect(actions).toEqual(
        expect.arrayContaining(['assignment.created', 'assignment.removed']),
      );
    });

    it('exige un partido con fecha y rechaza partidos cerrados', async () => {
      const official = await newOfficial();
      const noDate = await prisma.event.create({
        data: { roundId: scenario.round.id },
      });
      const res = await assign(noDate.id, official.id).expect(409);
      expect(res.body.message).toMatch(/fecha y hora/);

      await prisma.event.update({
        where: { id: scenario.event.id },
        data: { status: 'finalizado' },
      });
      await assign(scenario.event.id, official.id).expect(409);
      await assign('00000000-0000-7000-8000-000000000000', official.id).expect(
        404,
      );
    });

    it('rechaza oficiales inactivos, de otro deporte o no disponibles', async () => {
      const inactive = await newOfficial({});
      await api()
        .patch(`/api/officials/${inactive.id}`)
        .send({ status: 'inactivo' })
        .expect(200);
      expect(
        (await assign(scenario.event.id, inactive.id).expect(409)).body.message,
      ).toMatch(/inactivo/);

      const other = await prisma.sport.create({
        data: { code: 'ajedrez', name: 'Ajedrez' },
      });
      const wrongSport = await newOfficial({ sportIds: [other.id] });
      expect(
        (await assign(scenario.event.id, wrongSport.id).expect(409)).body
          .message,
      ).toMatch(/deporte/);

      const away = await newOfficial();
      await api()
        .post(`/api/officials/${away.id}/unavailability`)
        .send({
          startsAt: '2026-06-25T00:00:00.000Z',
          endsAt: '2026-06-26T00:00:00.000Z',
        })
        .expect(201);
      expect(
        (await assign(scenario.event.id, away.id).expect(409)).body.message,
      ).toMatch(/no está disponible/);
    });

    it('impide traslapes de ±90 minutos pero permite horarios separados, y un rechazo libera el horario', async () => {
      const official = await newOfficial();
      await assign(scenario.event.id, official.id).expect(201);

      const near = await extraEvent('2026-06-25T16:00:00.000Z');
      expect(
        (await assign(near.id, official.id).expect(409)).body.message,
      ).toMatch(/horario cercano/);

      const apart = await extraEvent('2026-06-25T17:31:00.000Z');
      await assign(apart.id, official.id).expect(201);

      // Si rechaza la primera designación, el horario queda libre.
      const mineFirst = await prisma.eventAssignment.findFirstOrThrow({
        where: { eventId: scenario.event.id },
      });
      await prisma.eventAssignment.update({
        where: { id: mineFirst.id },
        data: { status: 'rechazado', respondedAt: new Date() },
      });
      await assign(near.id, official.id).expect(201);
    });

    it('un oficial no puede arbitrar a su club ni partidos en los que juega', async () => {
      const homeClub = await newOfficial({ clubId: scenario.home.club.id });
      expect(
        (await assign(scenario.event.id, homeClub.id).expect(409)).body.message,
      ).toMatch(/clubes que juegan/);

      // Exjugador del equipo visitante: su club se detecta por la ficha de deportista.
      const player = await newOfficial({
        personId: scenario.away.athlete.personId,
      });
      expect(
        (await assign(scenario.event.id, player.id).expect(409)).body.message,
      ).toMatch(/clubes que juegan|deportista/);

      // En un partido de otros equipos sí puede.
      const other = await createMatchScenario(prisma);
      const free = await api()
        .post('/api/officials')
        .send({
          personId: other.away.athlete.personId,
          sportIds: [other.sport.id],
        })
        .expect(201);
      const stranger = await createMatchScenario(prisma, {
        scheduledAt: '2026-07-10T15:00:00.000Z',
      });
      await prisma.officialSport.create({
        data: { officialId: free.body.id, sportId: stranger.sport.id },
      });
      await api()
        .post(`/api/events/${stranger.event.id}/assignments`)
        .send({ officialId: free.body.id, role: 'arbitro_central' })
        .expect(201);
    });

    it('no repite oficial ni rol en un partido', async () => {
      const a = await newOfficial();
      const b = await newOfficial();
      await assign(scenario.event.id, a.id, 'arbitro_central').expect(201);
      expect(
        (await assign(scenario.event.id, a.id, 'asistente_1').expect(409)).body
          .message,
      ).toMatch(/ya está designado/);
      expect(
        (await assign(scenario.event.id, b.id, 'arbitro_central').expect(409))
          .body.message,
      ).toMatch(/rol ya está ocupado|ya está designado/);
      await assign(scenario.event.id, b.id, 'asistente_1').expect(201);
    });

    it('dos designaciones simultáneas a horarios que se traslapan: solo una prospera', async () => {
      const official = await newOfficial();
      const e1 = await extraEvent('2026-08-01T15:00:00.000Z');
      const e2 = await extraEvent('2026-08-01T16:00:00.000Z');
      const results = await Promise.all([
        assign(e1.id, official.id),
        assign(e2.id, official.id),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(
        await prisma.eventAssignment.count({
          where: { officialId: official.id },
        }),
      ).toBe(1);
    });

    it('lista candidatos del deporte con sus conflictos', async () => {
      const ok = await newOfficial({ firstName: 'Libre', lastName: 'A' });
      const busy = await newOfficial({ firstName: 'Ocupado', lastName: 'B' });
      const sameClub = await newOfficial({
        firstName: 'Local',
        lastName: 'C',
        clubId: scenario.home.club.id,
      });
      const other = await prisma.sport.create({
        data: { code: 'otro', name: 'Otro' },
      });
      await newOfficial({ sportIds: [other.id], lastName: 'D' });
      const near = await extraEvent('2026-06-25T16:00:00.000Z');
      await assign(near.id, busy.id).expect(201);

      const res = await api()
        .get(`/api/events/${scenario.event.id}/assignment-candidates`)
        .expect(200);
      const byId = new Map(
        res.body.map((c: { id: string }) => [c.id, c] as const),
      );
      expect(res.body).toHaveLength(3);
      expect((byId.get(ok.id) as { conflicts: unknown[] }).conflicts).toEqual(
        [],
      );
      expect(
        (byId.get(busy.id) as { conflicts: { code: string }[] }).conflicts.map(
          (c) => c.code,
        ),
      ).toEqual(['traslape']);
      expect(
        (
          byId.get(sameClub.id) as { conflicts: { code: string }[] }
        ).conflicts.map((c) => c.code),
      ).toEqual(['club']);
    });
  });

  describe('respuesta del oficial y «mis designaciones»', () => {
    async function referee() {
      const user = await createUser(prisma, {
        permissions: ['assignments:read_own'],
      });
      const official = await newOfficial({ userEmail: user.email });
      return { user, official, api: authed(t, await login(t, user.email)) };
    }

    it('el oficial ve sus designaciones, las confirma o las rechaza con motivo', async () => {
      const ref = await referee();
      const created = (
        await assign(scenario.event.id, ref.official.id).expect(201)
      ).body;

      // El partido del fixture es pasado: no figura en «próximas» pero sí en «pasadas».
      expect((await ref.api.get('/api/assignments/mine')).body.total).toBe(0);
      expect(
        (await ref.api.get('/api/assignments/mine?scope=pasadas')).body.total,
      ).toBe(1);
      const mine = await ref.api
        .get('/api/assignments/mine?scope=todas')
        .expect(200);
      expect(mine.body).toMatchObject({ linked: true, total: 1 });
      expect(mine.body.items[0]).toMatchObject({
        id: created.id,
        status: 'designado',
        roleLabel: 'árbitro central',
        event: { id: scenario.event.id },
        championship: { id: scenario.championship.id },
      });
      expect(mine.body.items[0].event.match).toContain('Local');

      await ref.api
        .post(`/api/assignments/${created.id}/respond`)
        .send({ response: 'rechazar' })
        .expect(400);
      const confirmed = await ref.api
        .post(`/api/assignments/${created.id}/respond`)
        .send({ response: 'confirmar' })
        .expect(200);
      expect(confirmed.body.status).toBe('confirmado');

      // Un administrador que designó recibe el aviso del rechazo.
      const rejected = await ref.api
        .post(`/api/assignments/${created.id}/respond`)
        .send({ response: 'rechazar', reason: 'Viaje de trabajo' })
        .expect(200);
      expect(rejected.body).toMatchObject({
        status: 'rechazado',
        responseNote: 'Viaje de trabajo',
      });
      const notice = await prisma.notification.findFirstOrThrow({
        where: { userId: admin.user.id, templateKey: 'assignment.rejected' },
      });
      expect(notice.body).toContain('rechazó su designación');

      await ref.api
        .post(`/api/assignments/${created.id}/respond`)
        .send({ response: 'confirmar' })
        .expect(409);
      expect(
        (await ref.api.get('/api/assignments/mine?scope=todas')).body.total,
      ).toBe(1);
    });

    it('una designación ajena responde 404 y sin vínculo no hay designaciones', async () => {
      const ref = await referee();
      const created = (
        await assign(scenario.event.id, ref.official.id).expect(201)
      ).body;
      const other = await referee();
      await other.api
        .post(`/api/assignments/${created.id}/respond`)
        .send({ response: 'confirmar' })
        .expect(404);

      const unlinked = await createUser(prisma, {
        permissions: ['assignments:read_own'],
      });
      const mine = await authed(t, await login(t, unlinked.email))
        .get('/api/assignments/mine')
        .expect(200);
      expect(mine.body).toMatchObject({ linked: false, items: [], total: 0 });

      const noPerm = await createUser(prisma, { permissions: ['sports:read'] });
      await authed(t, await login(t, noPerm.email))
        .get('/api/assignments/mine')
        .expect(403);
    });

    it('avisa al oficial al designarlo, al retirarlo y al reprogramar el partido', async () => {
      const ref = await referee();
      const created = (
        await assign(scenario.event.id, ref.official.id).expect(201)
      ).body;
      await api()
        .patch(`/api/events/${scenario.event.id}/schedule`)
        .send({ scheduledAt: '2026-07-01T20:00:00.000Z', reason: 'Lluvia' })
        .expect(200);
      await api()
        .delete(`/api/events/${scenario.event.id}/assignments/${created.id}`)
        .expect(204);

      const keys = (
        await prisma.notification.findMany({
          where: { userId: ref.user.id, channel: 'sistema' },
          orderBy: { createdAt: 'asc' },
        })
      ).map((n) => n.templateKey);
      expect(keys).toEqual([
        'assignment.created',
        'event.rescheduled',
        'assignment.removed',
      ]);
    });
  });

  describe('historial', () => {
    it('lista las participaciones del oficial', async () => {
      const official = await newOfficial();
      await assign(scenario.event.id, official.id).expect(201);
      const later = await extraEvent('2026-09-01T15:00:00.000Z');
      await assign(later.id, official.id, 'asistente_1').expect(201);
      const history = await api()
        .get(`/api/officials/${official.id}/history`)
        .expect(200);
      expect(history.body.total).toBe(2);
      expect(history.body.items[0]).toMatchObject({
        role: 'asistente_1',
        championship: { id: scenario.championship.id },
      });
      expect(
        (await api().get(`/api/officials/${official.id}`)).body
          .upcomingAssignments,
      ).toBe(0);
    });
  });

  describe('acta de los partidos designados', () => {
    it('un árbitro designado registra y envía el acta de su partido, y no la de otros ni aprueba', async () => {
      const user = await createUser(prisma, {
        permissions: [
          'results:manage_assigned',
          'results:read',
          'assignments:read_own',
        ],
      });
      const official = await newOfficial({ userEmail: user.email });
      const as = authed(t, await login(t, user.email));
      const [ep1, ep2] = scenario.eventParticipants;
      const draft = {
        values: [
          { eventParticipantId: ep1!.id, score: 2 },
          { eventParticipantId: ep2!.id, score: 1 },
        ],
      };

      // Sin designación no puede.
      await as
        .put(`/api/events/${scenario.event.id}/result`)
        .send(draft)
        .expect(403);

      const created = (await assign(scenario.event.id, official.id).expect(201))
        .body;
      await as
        .put(`/api/events/${scenario.event.id}/result`)
        .send(draft)
        .expect(200);
      await as
        .post(`/api/events/${scenario.event.id}/result/submit`)
        .expect(201);
      await as
        .post(`/api/events/${scenario.event.id}/result/approve`)
        .send({ approved: true, reason: 'Yo mismo' })
        .expect(403);

      // Otro partido, sin designación: 403.
      const other = await extraEvent('2026-08-10T15:00:00.000Z');
      await as.put(`/api/events/${other.id}/result`).send(draft).expect(403);

      // Si rechaza la designación, pierde el acceso.
      await prisma.eventAssignment.update({
        where: { id: created.id },
        data: { status: 'rechazado', respondedAt: new Date() },
      });
      await as
        .put(`/api/events/${scenario.event.id}/result`)
        .send(draft)
        .expect(403);

      // Un gestor general sigue pudiendo, y sin sesión no hay acceso.
      await t
        .http()
        .put(`/api/events/${scenario.event.id}/result`)
        .send(draft)
        .expect(401);
    });
  });
});
