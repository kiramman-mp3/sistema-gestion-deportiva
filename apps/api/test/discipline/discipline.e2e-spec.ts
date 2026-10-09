import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, dbFailure, resetDatabase } from '../support/db.js';
import {
  adminWith,
  authed,
  createMatchScenario,
  createUser,
  leaderWith,
  login,
  seedCatalog,
} from '../support/fixtures.js';

const MANAGER = [
  'incidents:report',
  'incidents:read',
  'complaints:read',
  'cases:read',
  'cases:manage',
  'cases:resolve',
  'cases:publish',
  'sanctions:read',
  'sanctions:manage',
  'clubs:access_all',
  'assignments:manage',
  'officials:manage',
  'results:read',
  'results:manage',
];

const daysFromNow = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const validPdf = Buffer.from('%PDF-1.4 evidencia del reclamo de prueba');

type Scenario = Awaited<ReturnType<typeof createMatchScenario>>;

describe('disciplina: incidencias, reclamos, expedientes y sanciones', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let manager: Awaited<ReturnType<typeof adminWith>>;
  let scenario: Scenario;

  const api = () => authed(t, manager.session);

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    manager = await adminWith(t, prisma, MANAGER);
    scenario = await createMatchScenario(prisma, {
      scheduledAt: `${daysFromNow(10)}T15:00:00.000Z`,
    });
  });

  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  // ───────────────────── ayudas ─────────────────────

  const leader = (clubId: string, extra: string[] = []) =>
    leaderWith(
      t,
      prisma,
      ['complaints:submit', 'complaints:read', 'sanctions:read', ...extra],
      [clubId],
    );

  const reportIncident = (over: Record<string, unknown> = {}) =>
    api()
      .post(`/api/events/${scenario.event.id}/incidents`)
      .send({
        type: 'conducta_antideportiva',
        description: 'Insultos reiterados hacia el árbitro',
        athleteId: scenario.home.athlete.id,
        ...over,
      });

  const submitComplaint = (
    as: ReturnType<typeof authed>,
    over: Record<string, unknown> = {},
  ) =>
    as.post('/api/complaints').send({
      championshipId: scenario.championship.id,
      clubId: scenario.home.club.id,
      eventId: scenario.event.id,
      subject: 'Alineación indebida del rival',
      description: 'El equipo visitante alineó a un jugador no inscrito.',
      ...over,
    });

  const openCase = async (over: Record<string, unknown> = {}) =>
    (
      await api()
        .post('/api/cases')
        .send({
          subject: 'Conducta antideportiva en la fecha 1',
          description: 'Se investiga la conducta del jugador local.',
          championshipId: scenario.championship.id,
          eventId: scenario.event.id,
          ...over,
        })
        .expect(201)
    ).body as { id: string; code: string };

  const reviewer = async () => {
    const user = await createUser(prisma, {
      permissions: ['cases:read', 'cases:resolve'],
    });
    return { user, api: authed(t, await login(t, user.email)) };
  };

  const inReview = async (caseId: string) => {
    const r = await reviewer();
    await api()
      .post(`/api/cases/${caseId}/reviewer`)
      .send({ reviewerId: r.user.id })
      .expect(200);
    return r;
  };

  const sanction = (caseId: string, over: Record<string, unknown> = {}) =>
    api()
      .post(`/api/cases/${caseId}/sanctions`)
      .send({
        athleteId: scenario.home.athlete.id,
        type: 'suspension_partidos',
        matchesCount: 2,
        reason: 'Conducta antideportiva comprobada',
        startsAt: daysFromNow(-1),
        ...over,
      });

  // ───────────────────── acceso ─────────────────────

  describe('acceso', () => {
    it('exige sesión y el permiso de cada operación', async () => {
      await t.http().get('/api/cases').expect(401);
      await t.http().get('/api/sanctions').expect(401);
      const plain = await createUser(prisma, { permissions: ['sports:read'] });
      const as = authed(t, await login(t, plain.email));
      for (const [method, url] of [
        ['get', '/api/cases'],
        ['get', '/api/incidents'],
        ['get', '/api/complaints'],
        ['get', '/api/sanctions'],
      ] as const) {
        await as[method](url).expect(403);
      }
      await as.post('/api/cases').send({}).expect(403);
      await as.post('/api/complaints').send({}).expect(403);
    });

    it('«gestionar» no implica resolver ni publicar', async () => {
      const onlyManage = await adminWith(t, prisma, [
        'cases:read',
        'cases:manage',
      ]);
      const as = authed(t, onlyManage.session);
      const created = await as
        .post('/api/cases')
        .send({
          subject: 'Asunto de prueba',
          description: 'Descripción de prueba suficiente',
        })
        .expect(201);
      await as
        .post(`/api/cases/${created.body.id}/resolve`)
        .send({ resolution: 'Resolución de prueba suficiente' })
        .expect(403);
      await as
        .post(`/api/cases/${created.body.id}/publish`)
        .send({})
        .expect(403);
      await as
        .post(`/api/cases/${created.body.id}/sanctions`)
        .send({})
        .expect(403);
    });
  });

  // ───────────────────── incidencias ─────────────────────

  describe('incidencias', () => {
    it('un oficial designado reporta en su partido y no en otros; quien gestiona, en cualquiera', async () => {
      const refUser = await createUser(prisma, {
        permissions: ['incidents:report', 'assignments:read_own'],
      });
      const official = (
        await api()
          .post('/api/officials')
          .send({
            firstName: 'Mario',
            lastName: 'Vela',
            sportIds: [scenario.sport.id],
            userEmail: refUser.email,
          })
          .expect(201)
      ).body;
      const asRef = authed(t, await login(t, refUser.email));
      const body = {
        type: 'agresion_verbal',
        description: 'Insultos a la terna arbitral',
      };

      await asRef
        .post(`/api/events/${scenario.event.id}/incidents`)
        .send(body)
        .expect(403);
      const assignment = await api()
        .post(`/api/events/${scenario.event.id}/assignments`)
        .send({ officialId: official.id, role: 'arbitro_central' })
        .expect(201);
      await asRef
        .post(`/api/events/${scenario.event.id}/incidents`)
        .send(body)
        .expect(201);

      // Si rechaza la designación, pierde el acceso.
      await prisma.eventAssignment.update({
        where: { id: assignment.body.id },
        data: { status: 'rechazado', respondedAt: new Date() },
      });
      await asRef
        .post(`/api/events/${scenario.event.id}/incidents`)
        .send(body)
        .expect(403);

      await reportIncident().expect(201);
      expect(await prisma.eventIncident.count()).toBe(2);
    });

    it('valida que el club y el deportista participen en el partido y sean coherentes', async () => {
      const outsider = await createMatchScenario(prisma, {
        scheduledAt: `${daysFromNow(20)}T15:00:00.000Z`,
      });
      await reportIncident({ athleteId: outsider.home.athlete.id }).expect(400);
      await reportIncident({
        athleteId: undefined,
        clubId: outsider.home.club.id,
      }).expect(400);
      await reportIncident({ clubId: scenario.away.club.id }).expect(400);
      await reportIncident({
        athleteId: undefined,
        clubId: scenario.away.club.id,
      }).expect(201);
      await reportIncident({ type: 'inventado' }).expect(400);
      await reportIncident({ description: 'no' }).expect(400);
      await api()
        .post('/api/events/00000000-0000-7000-8000-000000000000/incidents')
        .send({ type: 'otro', description: 'Descripción válida' })
        .expect(404);
    });

    it('no se editan ni se borran (la base de datos lo impide) y la auditoría no guarda el texto', async () => {
      const res = await reportIncident({
        description: 'Texto sensible con el nombre de una persona',
      }).expect(201);
      const failure = await dbFailure(
        prisma.eventIncident.update({
          where: { id: res.body.id },
          data: { description: 'cambiado' },
        }),
      );
      expect(failure.sqlState).toBe('23001');
      expect(
        (
          await dbFailure(
            prisma.eventIncident.delete({ where: { id: res.body.id } }),
          )
        ).sqlState,
      ).toBe('23001');
      const logs = await prisma.auditLog.findMany({
        where: { action: 'incident.reported' },
      });
      expect(JSON.stringify(logs)).not.toContain('Texto sensible');
    });

    it('avisa a quienes gestionan expedientes y lista con filtros', async () => {
      const other = await adminWith(t, prisma, ['cases:manage']);
      await reportIncident().expect(201);
      expect(
        await prisma.notification.count({
          where: { userId: other.user.id, templateKey: 'incident.reported' },
        }),
      ).toBe(1);
      // Quien reporta no se avisa a sí mismo.
      expect(
        await prisma.notification.count({
          where: { userId: manager.user.id, templateKey: 'incident.reported' },
        }),
      ).toBe(0);

      const list = await api().get('/api/incidents').expect(200);
      expect(list.body.total).toBe(1);
      expect(list.body.items[0]).toMatchObject({
        typeLabel: 'conducta antideportiva',
        caseId: null,
        championship: { id: scenario.championship.id },
      });
      expect(
        (
          await api().get(
            `/api/incidents?athleteId=${scenario.away.athlete.id}`,
          )
        ).body.total,
      ).toBe(0);
      expect((await api().get('/api/incidents?unlinked=true')).body.total).toBe(
        1,
      );
    });
  });

  // ───────────────────── reclamos ─────────────────────

  describe('reclamos', () => {
    it('un club presenta su reclamo, ve solo los suyos y la Liga los ve todos', async () => {
      const home = await leader(scenario.home.club.id);
      const away = await leader(scenario.away.club.id);
      const asHome = authed(t, home.session);
      const asAway = authed(t, away.session);

      const created = await submitComplaint(asHome).expect(201);
      expect(created.body).toMatchObject({
        status: 'recibido',
        club: { id: scenario.home.club.id },
        case: null,
      });
      await submitComplaint(asAway, {
        clubId: scenario.away.club.id,
        subject: 'Agresión a nuestro delegado',
      }).expect(201);

      expect((await asHome.get('/api/complaints')).body.total).toBe(1);
      expect((await asAway.get('/api/complaints')).body.total).toBe(1);
      expect((await api().get('/api/complaints')).body.total).toBe(2);
      // Un reclamo ajeno responde como inexistente.
      await asAway.get(`/api/complaints/${created.body.id}`).expect(404);
      await asHome.get(`/api/complaints/${created.body.id}`).expect(200);
      expect(
        (await asHome.get(`/api/complaints?clubId=${scenario.away.club.id}`))
          .body.total,
      ).toBe(0);

      // Los gestores de expedientes son avisados.
      expect(
        await prisma.notification.count({
          where: { userId: manager.user.id, templateKey: 'complaint.received' },
        }),
      ).toBe(2);
    });

    it('valida club, campeonato y partido', async () => {
      const home = await leader(scenario.home.club.id);
      const as = authed(t, home.session);
      // Un club ajeno al alcance del usuario no existe para él.
      await submitComplaint(as, { clubId: scenario.away.club.id }).expect(404);

      // Un club que no participa en el campeonato no reclama.
      const other = await createMatchScenario(prisma, {
        scheduledAt: `${daysFromNow(30)}T15:00:00.000Z`,
      });
      const outsider = await leader(other.home.club.id);
      await submitComplaint(authed(t, outsider.session), {
        clubId: other.home.club.id,
      }).expect(400);
      // El partido debe ser del campeonato.
      await submitComplaint(as, { eventId: other.event.id }).expect(400);
      await submitComplaint(as, { subject: 'abc' }).expect(400);
      await submitComplaint(as, { extra: 1 }).expect(400);
      await submitComplaint(as, {
        championshipId: '00000000-0000-7000-8000-000000000000',
      }).expect(404);
    });

    it('admite adjuntos del club (PDF o imagen), con límite, y solo se descargan dentro del alcance', async () => {
      const home = await leader(scenario.home.club.id);
      const away = await leader(scenario.away.club.id);
      const asHome = authed(t, home.session);
      const complaint = (await submitComplaint(asHome).expect(201)).body;
      const url = `/api/complaints/${complaint.id}/attachments`;

      const ok = await asHome
        .post(url)
        .field('title', 'Acta firmada')
        .attach('file', validPdf, {
          filename: 'acta.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      await asHome
        .post(url)
        .field('title', 'Archivo falso')
        .attach('file', Buffer.from('MZ ejecutable'), {
          filename: 'virus.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);
      await asHome
        .post(url)
        .attach('file', validPdf, {
          filename: 'a.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);

      const detail = await asHome
        .get(`/api/complaints/${complaint.id}`)
        .expect(200);
      expect(detail.body.attachments).toHaveLength(1);
      const file = await asHome.get(`${url}/${ok.body.id}/file`).expect(200);
      expect(file.headers['content-type']).toBe('application/pdf');
      expect(file.headers['cache-control']).toBe('private, no-store');
      expect(file.body.toString()).toContain('%PDF');

      // Otro club no accede ni al reclamo ni al archivo.
      const asAway = authed(t, away.session);
      await asAway.get(`${url}/${ok.body.id}/file`).expect(404);
      await asAway
        .post(url)
        .field('title', 'Intruso')
        .attach('file', validPdf, {
          filename: 'a.pdf',
          contentType: 'application/pdf',
        })
        .expect(404);

      // Tope de adjuntos.
      for (let i = 0; i < 9; i++) {
        await asHome
          .post(url)
          .field('title', `Adjunto ${i}`)
          .attach('file', validPdf, {
            filename: 'a.pdf',
            contentType: 'application/pdf',
          })
          .expect(201);
      }
      await asHome
        .post(url)
        .field('title', 'Uno de más')
        .attach('file', validPdf, {
          filename: 'a.pdf',
          contentType: 'application/pdf',
        })
        .expect(409);
    });

    it('la Liga desestima solo un reclamo recién recibido, con motivo, y se avisa al club', async () => {
      const home = await leader(scenario.home.club.id);
      const complaint = (
        await submitComplaint(authed(t, home.session)).expect(201)
      ).body;
      await api()
        .post(`/api/complaints/${complaint.id}/dismiss`)
        .send({ reason: 'no' })
        .expect(400);
      const dismissed = await api()
        .post(`/api/complaints/${complaint.id}/dismiss`)
        .send({ reason: 'El hecho no está comprobado' })
        .expect(200);
      expect(dismissed.body).toMatchObject({
        status: 'desestimado',
        dismissReason: 'El hecho no está comprobado',
      });
      await api()
        .post(`/api/complaints/${complaint.id}/dismiss`)
        .send({ reason: 'Otra vez' })
        .expect(409);
      const notice = await prisma.notification.findFirstOrThrow({
        where: { userId: home.user.id, templateKey: 'complaint.updated' },
      });
      expect(notice.body).toContain('desestimado');

      // Cerrado: ya no admite adjuntos.
      await authed(t, home.session)
        .post(`/api/complaints/${complaint.id}/attachments`)
        .field('title', 'Tarde')
        .attach('file', validPdf, {
          filename: 'a.pdf',
          contentType: 'application/pdf',
        })
        .expect(409);
    });
  });

  // ───────────────────── expedientes ─────────────────────

  describe('expedientes', () => {
    it('abre un expediente con incidencias y reclamos, con código y primera entrada', async () => {
      const incident = (await reportIncident().expect(201)).body;
      const home = await leader(scenario.home.club.id);
      const complaint = (
        await submitComplaint(authed(t, home.session)).expect(201)
      ).body;

      const created = await openCase({
        incidentIds: [incident.id],
        complaintIds: [complaint.id],
      });
      expect(created.code).toBe('EXP-000001');

      const detail = (await api().get(`/api/cases/${created.id}`).expect(200))
        .body;
      expect(detail).toMatchObject({
        code: 'EXP-000001',
        status: 'abierto',
        counts: { incidents: 1, complaints: 1, sanctions: 0 },
      });
      expect(detail.entries).toHaveLength(1);
      expect(detail.entries[0]).toMatchObject({ kind: 'apertura' });
      expect(detail.complaints[0].status).toBe('en_revision');
      expect(
        (
          await authed(t, home.session)
            .get(`/api/complaints/${complaint.id}`)
            .expect(200)
        ).body,
      ).toMatchObject({ status: 'en_revision', case: { code: 'EXP-000001' } });

      // Incidencias o reclamos ya vinculados no se reutilizan.
      await api()
        .post('/api/cases')
        .send({
          subject: 'Otro expediente',
          description: 'Descripción suficiente',
          incidentIds: [incident.id],
        })
        .expect(409);
      await api()
        .post('/api/cases')
        .send({
          subject: 'Otro expediente',
          description: 'Descripción suficiente',
          complaintIds: [complaint.id],
        })
        .expect(409);
      expect(
        (await openCase({ subject: 'Segundo expediente de prueba' })).code,
      ).toBe('EXP-000002');
    });

    it('lista y busca por estado, texto y código', async () => {
      const a = await openCase({ subject: 'Invasión de campo en la final' });
      await openCase({ subject: 'Retraso en la presentación' });
      expect((await api().get('/api/cases')).body.total).toBe(2);
      expect(
        (await api().get('/api/cases?q=invasi%C3%B3n')).body.items[0].id,
      ).toBe(a.id);
      expect((await api().get('/api/cases?q=EXP-000002')).body.total).toBe(1);
      expect((await api().get('/api/cases?status=resuelto')).body.total).toBe(
        0,
      );
      expect((await api().get('/api/cases?published=true')).body.total).toBe(0);
    });

    it('asigna un revisor con acceso a expedientes y le avisa', async () => {
      const created = await openCase();
      const noAccess = await createUser(prisma, {
        permissions: ['sports:read'],
      });
      await api()
        .post(`/api/cases/${created.id}/reviewer`)
        .send({ reviewerId: noAccess.id })
        .expect(400);

      const r = await reviewer();
      await api()
        .post(`/api/cases/${created.id}/reviewer`)
        .send({ reviewerId: r.user.id })
        .expect(200);
      const detail = (await api().get(`/api/cases/${created.id}`)).body;
      expect(detail).toMatchObject({
        status: 'en_revision',
        reviewer: { id: r.user.id },
      });
      expect(detail.entries.map((e: { kind: string }) => e.kind)).toEqual([
        'apertura',
        'asignacion',
      ]);
      expect(
        await prisma.notification.count({
          where: { userId: r.user.id, templateKey: 'case.assigned' },
        }),
      ).toBe(1);
      expect(
        (await r.api.get(`/api/cases?reviewerId=${r.user.id}`)).body.total,
      ).toBe(1);
    });

    it('anexa notas, recursos y notificaciones al historial, pero no decisiones manuales', async () => {
      const created = await openCase();
      for (const kind of ['nota', 'recurso', 'notificacion']) {
        await api()
          .post(`/api/cases/${created.id}/entries`)
          .send({ kind, body: `Entrada de tipo ${kind}` })
          .expect(201);
      }
      await api()
        .post(`/api/cases/${created.id}/entries`)
        .send({ kind: 'decision', body: 'Decisión inventada' })
        .expect(400);
      const entries = (await api().get(`/api/cases/${created.id}`)).body
        .entries;
      expect(entries.map((e: { kind: string }) => e.kind)).toEqual([
        'apertura',
        'nota',
        'recurso',
        'notificacion',
      ]);

      // El historial es de solo anexar: la base de datos lo garantiza.
      const row = await prisma.caseEntry.findFirstOrThrow({
        where: { caseId: created.id },
      });
      expect(
        (
          await dbFailure(
            prisma.caseEntry.update({
              where: { id: row.id },
              data: { body: 'x' },
            }),
          )
        ).sqlState,
      ).toBe('23001');
      expect(
        (await dbFailure(prisma.caseEntry.delete({ where: { id: row.id } })))
          .sqlState,
      ).toBe('23001');
    });

    it('modifica los datos solo mientras no esté resuelto', async () => {
      const created = await openCase();
      await api()
        .patch(`/api/cases/${created.id}`)
        .send({ subject: 'Asunto corregido del expediente' })
        .expect(200);
      await inReview(created.id);
      await api()
        .post(`/api/cases/${created.id}/resolve`)
        .send({ resolution: 'Se resuelve con una amonestación.' })
        .expect(200);
      await api()
        .patch(`/api/cases/${created.id}`)
        .send({ subject: 'Ya no se puede cambiar' })
        .expect(409);
    });

    it('resuelve con decisión documentada, cierra los reclamos y los notifica; no se resuelve dos veces', async () => {
      const home = await leader(scenario.home.club.id);
      const complaint = (
        await submitComplaint(authed(t, home.session)).expect(201)
      ).body;
      const created = await openCase({ complaintIds: [complaint.id] });
      await api()
        .post(`/api/cases/${created.id}/resolve`)
        .send({ resolution: 'corta' })
        .expect(400);

      const res = await api()
        .post(`/api/cases/${created.id}/resolve`)
        .send({ resolution: 'Se declara procedente el reclamo del club.' })
        .expect(200);
      expect(res.body.status).toBe('resuelto');
      await api()
        .post(`/api/cases/${created.id}/resolve`)
        .send({ resolution: 'Se declara procedente el reclamo del club.' })
        .expect(409);

      const detail = (await api().get(`/api/cases/${created.id}`)).body;
      expect(detail).toMatchObject({
        status: 'resuelto',
        resolution: 'Se declara procedente el reclamo del club.',
        resolvedBy: manager.user.displayName,
      });
      expect(detail.entries.at(-1)).toMatchObject({ kind: 'decision' });
      expect(detail.complaints[0].status).toBe('resuelto');
      expect(
        await prisma.notification.count({
          where: { userId: home.user.id, templateKey: 'complaint.updated' },
        }),
      ).toBe(1);
    });

    it('reabre conservando la resolución anterior en el historial, y archiva solo lo resuelto', async () => {
      const created = await openCase();
      await api()
        .post(`/api/cases/${created.id}/archive`)
        .send({ reason: 'Sin resolver aún' })
        .expect(409);
      await api()
        .post(`/api/cases/${created.id}/reopen`)
        .send({ reason: 'Todavía abierto' })
        .expect(409);

      await api()
        .post(`/api/cases/${created.id}/resolve`)
        .send({ resolution: 'Primera resolución del expediente.' })
        .expect(200);
      await api()
        .post(`/api/cases/${created.id}/reopen`)
        .send({ reason: 'Nuevo recurso presentado' })
        .expect(200);
      const reopened = (await api().get(`/api/cases/${created.id}`)).body;
      expect(reopened).toMatchObject({
        status: 'en_revision',
        resolution: null,
      });
      expect(reopened.entries.at(-1).body).toContain(
        'Primera resolución del expediente.',
      );

      await api()
        .post(`/api/cases/${created.id}/resolve`)
        .send({ resolution: 'Resolución definitiva del expediente.' })
        .expect(200);
      await api()
        .post(`/api/cases/${created.id}/archive`)
        .send({ reason: 'Plazo de recursos vencido' })
        .expect(200);
      await api()
        .post(`/api/cases/${created.id}/entries`)
        .send({ kind: 'nota', body: 'Nota tardía' })
        .expect(409);
    });

    it('audita cada paso sin copiar los textos del expediente', async () => {
      const created = await openCase({
        description: 'Descripción con datos de personas involucradas',
      });
      await inReview(created.id);
      await api()
        .post(`/api/cases/${created.id}/resolve`)
        .send({ resolution: 'Resolución con detalles que no deben copiarse.' })
        .expect(200);
      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'case', entityId: created.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.action)).toEqual([
        'case.opened',
        'case.reviewer_assigned',
        'case.resolved',
      ]);
      const blob = JSON.stringify(logs);
      expect(blob).not.toContain('datos de personas');
      expect(blob).not.toContain('no deben copiarse');
    });
  });

  // ───────────────────── sanciones ─────────────────────

  describe('sanciones', () => {
    it('solo se registran con el expediente en revisión o resuelto', async () => {
      const created = await openCase();
      expect((await sanction(created.id).expect(409)).body.message).toMatch(
        /en revisión o resuelto/,
      );
      await inReview(created.id);
      const ok = await sanction(created.id).expect(201);
      expect(ok.body).toMatchObject({
        type: 'suspension_partidos',
        matchesCount: 2,
        status: 'vigente',
        isActive: true,
        case: { code: created.code },
      });
      await api()
        .post(`/api/cases/${created.id}/archive`)
        .send({ reason: 'Motivo válido' })
        .expect(409);
      await api()
        .post(`/api/cases/${created.id}/resolve`)
        .send({ resolution: 'Se resuelve con la sanción indicada.' })
        .expect(200);
      await sanction(created.id, {
        type: 'amonestacion',
        matchesCount: null,
      }).expect(201);
      await api()
        .post(`/api/cases/${created.id}/archive`)
        .send({ reason: 'Cerrado' })
        .expect(200);
      await sanction(created.id).expect(409);
    });

    it('valida la coherencia entre sujeto, club, campeonato y tipo', async () => {
      const created = await openCase();
      await inReview(created.id);
      const none = { athleteId: undefined };
      await sanction(created.id, none).expect(400);
      await sanction(created.id, {
        clubId: scenario.away.club.id,
      }).expect(400); // deportista local, club visitante
      await sanction(created.id, {
        athleteId: undefined,
        teamId: scenario.home.team.id,
        clubId: scenario.away.club.id,
      }).expect(400);
      await sanction(created.id, {
        teamId: scenario.away.team.id,
      }).expect(400); // deportista de un club y equipo de otro
      await sanction(created.id, { matchesCount: null }).expect(400);
      await sanction(created.id, {
        type: 'amonestacion',
        matchesCount: 3,
      }).expect(400);
      await sanction(created.id, {
        type: 'suspension_temporal',
        matchesCount: null,
      }).expect(400);
      await sanction(created.id, {
        type: 'suspension_temporal',
        matchesCount: null,
        endsAt: daysFromNow(-5),
      }).expect(400);
      await sanction(created.id, {
        type: 'amonestacion',
        matchesCount: null,
        points: 2,
      }).expect(400);
      await sanction(created.id, {
        type: 'descuento_puntos',
        matchesCount: null,
        athleteId: undefined,
        teamId: scenario.home.team.id,
        points: 3,
      }).expect(400); // falta el campeonato

      const other = await createMatchScenario(prisma, {
        scheduledAt: `${daysFromNow(20)}T15:00:00.000Z`,
      });
      await sanction(created.id, {
        type: 'descuento_puntos',
        matchesCount: null,
        athleteId: undefined,
        teamId: scenario.home.team.id,
        championshipId: other.championship.id,
        points: 3,
      }).expect(400); // deporte distinto
      await sanction(created.id, {
        athleteId: '00000000-0000-7000-8000-000000000000',
      }).expect(404);
    });

    it('la base de datos también rechaza sanciones incoherentes', async () => {
      const created = await openCase();
      await inReview(created.id);
      const base = {
        caseId: created.id,
        type: 'amonestacion' as const,
        reason: 'Motivo de prueba',
        startsAt: new Date(),
        createdById: manager.user.id,
      };
      expect(
        (await dbFailure(prisma.sanction.create({ data: base }))).sqlState,
      ).toBe('23514'); // sin sujeto
      expect(
        (
          await dbFailure(
            prisma.sanction.create({
              data: {
                ...base,
                athleteId: scenario.home.athlete.id,
                type: 'suspension_partidos',
              },
            }),
          )
        ).sqlState,
      ).toBe('23514'); // sin número de partidos
      expect(
        (
          await dbFailure(
            prisma.sanction.create({
              data: {
                ...base,
                athleteId: scenario.home.athlete.id,
                endsAt: new Date(Date.now() - 10 * 86_400_000),
              },
            }),
          )
        ).sqlState,
      ).toBe('23514'); // fin anterior al inicio
      expect(
        (
          await dbFailure(
            prisma.sanction.create({
              data: {
                ...base,
                clubId: scenario.home.club.id,
                type: 'descuento_puntos',
                points: 2,
              },
            }),
          )
        ).sqlState,
      ).toBe('23514'); // sin equipo ni campeonato
    });

    it('distingue lo vigente de lo cumplido, anulado y futuro, y exige motivo para anular', async () => {
      const created = await openCase();
      await inReview(created.id);
      const current = (await sanction(created.id).expect(201)).body;
      const future = (
        await sanction(created.id, {
          type: 'suspension_temporal',
          matchesCount: null,
          startsAt: daysFromNow(5),
          endsAt: daysFromNow(15),
        }).expect(201)
      ).body;
      const expired = (
        await sanction(created.id, {
          type: 'suspension_temporal',
          matchesCount: null,
          startsAt: daysFromNow(-20),
          endsAt: daysFromNow(-10),
        }).expect(201)
      ).body;
      expect([current.isActive, future.isActive, expired.isActive]).toEqual([
        true,
        false,
        false,
      ]);
      expect(
        (await api().get('/api/sanctions?active=true')).body.items.map(
          (s: { id: string }) => s.id,
        ),
      ).toEqual([current.id]);
      expect((await api().get('/api/sanctions?active=false')).body.total).toBe(
        2,
      );

      await api()
        .post(`/api/sanctions/${current.id}/annul`)
        .send({ reason: 'no' })
        .expect(400);
      await api()
        .post(`/api/sanctions/${current.id}/annul`)
        .send({ reason: 'Resuelto el recurso de apelación' })
        .expect(200);
      await api().post(`/api/sanctions/${current.id}/fulfill`).expect(409);
      await api().post(`/api/sanctions/${future.id}/fulfill`).expect(200);
      expect(
        (await api().get('/api/sanctions?status=cumplida')).body.total,
      ).toBe(1);
      expect(
        (await api().get(`/api/sanctions?caseId=${created.id}`)).body.total,
      ).toBe(3);
      const entries = (await api().get(`/api/cases/${created.id}`)).body
        .entries;
      expect(
        entries.some((e: { body: string }) =>
          e.body.includes('Sanción anulada'),
        ),
      ).toBe(true);
    });

    it('cada club ve únicamente las sanciones de su club', async () => {
      const home = await leader(scenario.home.club.id);
      const away = await leader(scenario.away.club.id);
      const created = await openCase();
      await inReview(created.id);
      await sanction(created.id).expect(201); // deportista local
      await sanction(created.id, {
        athleteId: undefined,
        clubId: scenario.away.club.id,
        type: 'multa',
        matchesCount: null,
      }).expect(201);

      const homeList = await authed(t, home.session)
        .get('/api/sanctions')
        .expect(200);
      expect(homeList.body.total).toBe(1);
      expect(homeList.body.items[0].athlete.id).toBe(scenario.home.athlete.id);
      expect(
        (await authed(t, away.session).get('/api/sanctions')).body.items[0].club
          .id,
      ).toBe(scenario.away.club.id);
      expect((await api().get('/api/sanctions')).body.total).toBe(2);

      const foreign = homeList.body.items[0].id as string;
      await authed(t, away.session)
        .get(`/api/sanctions/${foreign}`)
        .expect(404);
      await authed(t, home.session)
        .get(`/api/sanctions/${foreign}`)
        .expect(200);
      // Y reciben el aviso de lo que les afecta.
      expect(
        await prisma.notification.count({
          where: { userId: home.user.id, templateKey: 'sanction.registered' },
        }),
      ).toBe(1);
    });

    it('avisa al registrar el acta qué participantes tienen sanciones vigentes', async () => {
      const created = await openCase();
      await inReview(created.id);
      await sanction(created.id).expect(201); // deportista local, vigente
      await sanction(created.id, {
        athleteId: undefined,
        clubId: scenario.away.club.id,
        type: 'multa',
        matchesCount: null,
      }).expect(201);
      const annulled = (
        await sanction(created.id, {
          athleteId: scenario.away.athlete.id,
          type: 'amonestacion',
          matchesCount: null,
        }).expect(201)
      ).body;
      await api()
        .post(`/api/sanctions/${annulled.id}/annul`)
        .send({ reason: 'Error en el registro' })
        .expect(200);
      // De otro campeonato y ya vencida: no aplican.
      await sanction(created.id, {
        type: 'suspension_temporal',
        matchesCount: null,
        startsAt: daysFromNow(-30),
        endsAt: daysFromNow(-20),
      }).expect(201);

      const alerts = await api()
        .get(`/api/events/${scenario.event.id}/sanction-alerts`)
        .expect(200);
      expect(alerts.body).toHaveLength(2);
      expect(alerts.body.map((a: { type: string }) => a.type).sort()).toEqual([
        'multa',
        'suspension_partidos',
      ]);
      await api()
        .get('/api/events/00000000-0000-7000-8000-000000000000/sanction-alerts')
        .expect(404);
    });

    it('el descuento de puntos se aplica a la tabla y se revierte al anular', async () => {
      const created = await openCase();
      await inReview(created.id);
      const penalty = (
        await sanction(created.id, {
          type: 'descuento_puntos',
          matchesCount: null,
          athleteId: undefined,
          teamId: scenario.home.team.id,
          championshipId: scenario.championship.id,
          points: 3,
        }).expect(201)
      ).body;

      const standings = async () =>
        (
          await api()
            .get(`/api/championships/${scenario.championship.id}/standings`)
            .expect(200)
        ).body.standings as {
          registrationId: string;
          points: number;
          pointsDeducted?: number;
        }[];
      const home = (await standings()).find(
        (r) => r.registrationId === scenario.home.registrationId,
      )!;
      expect(home).toMatchObject({ points: -3, pointsDeducted: 3 });

      await api()
        .post(`/api/sanctions/${penalty.id}/annul`)
        .send({ reason: 'Se aceptó la apelación' })
        .expect(200);
      const after = (await standings()).find(
        (r) => r.registrationId === scenario.home.registrationId,
      )!;
      expect(after.points).toBe(0);
      expect(after.pointsDeducted).toBeUndefined();
    });
  });

  // ───────────────────── publicación ─────────────────────

  describe('publicación de resoluciones', () => {
    const resolveWithSanction = async () => {
      const created = await openCase();
      await inReview(created.id);
      await sanction(created.id).expect(201);
      await api()
        .post(`/api/cases/${created.id}/resolve`)
        .send({ resolution: 'Se sanciona con dos partidos de suspensión.' })
        .expect(200);
      return created;
    };
    const publication = {
      publicTitle: 'Resolución de la comisión disciplinaria',
      publicSummary:
        'Se sancionó con la suspensión de dos partidos a un deportista del club por conducta antideportiva.',
    };

    it('solo se publica un expediente resuelto y sin nombrar a deportistas', async () => {
      const open = await openCase();
      await api()
        .post(`/api/cases/${open.id}/publish`)
        .send(publication)
        .expect(409);

      const created = await resolveWithSanction();
      const athlete = await prisma.athlete.findUniqueOrThrow({
        where: { id: scenario.home.athlete.id },
        include: { person: true },
      });
      const named = await api()
        .post(`/api/cases/${created.id}/publish`)
        .send({
          publicTitle: 'Resolución disciplinaria',
          publicSummary: `Se suspende a ${athlete.person.firstName} ${athlete.person.lastName} por dos partidos.`,
        })
        .expect(400);
      expect(named.body.message).toMatch(/no debe mencionar/);
      await api()
        .post(`/api/cases/${created.id}/publish`)
        .send({ publicTitle: 'corto', publicSummary: 'corto' })
        .expect(400);

      await api()
        .post(`/api/cases/${created.id}/publish`)
        .send(publication)
        .expect(200);
      expect((await api().get('/api/cases?published=true')).body.total).toBe(1);
    });

    it('el portal solo muestra lo publicado y únicamente si la Liga activó las resoluciones', async () => {
      const created = await resolveWithSanction();
      await api()
        .post(`/api/cases/${created.id}/publish`)
        .send(publication)
        .expect(200);

      // Por defecto las resoluciones están apagadas.
      await t.http().get('/api/public/resolutions').expect(404);
      await t.http().get(`/api/public/resolutions/${created.id}`).expect(404);

      await prisma.institutionSettings.upsert({
        where: { id: 1 },
        update: { publicResolutions: true },
        create: { id: 1, name: 'Liga', publicResolutions: true },
      });
      const list = await t.http().get('/api/public/resolutions').expect(200);
      expect(list.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(list.body.total).toBe(1);
      const item = list.body.items[0];
      expect(item).toMatchObject({
        code: created.code,
        title: publication.publicTitle,
        summary: publication.publicSummary,
        championship: scenario.championship.name,
      });
      expect(item.sanctions[0]).toMatchObject({
        typeLabel: 'suspensión por partidos',
        subject: 'deportista',
        club: scenario.home.club.name,
        matchesCount: 2,
      });

      // Nada interno ni nombres de personas.
      const blob = JSON.stringify(list.body);
      const athlete = await prisma.person.findFirstOrThrow({
        where: { athlete: { id: scenario.home.athlete.id } },
      });
      for (const secret of [
        'Se sanciona con dos partidos',
        'Conducta antideportiva comprobada',
        athlete.firstName,
        athlete.lastName,
        manager.user.email,
      ]) {
        expect(blob).not.toContain(secret);
      }
      await t.http().get(`/api/public/resolutions/${created.id}`).expect(200);

      // Retirar la publicación la oculta; un expediente sin publicar nunca aparece.
      await api()
        .post(`/api/cases/${created.id}/unpublish`)
        .send({ reason: 'Se presentó un recurso' })
        .expect(200);
      await t.http().get(`/api/public/resolutions/${created.id}`).expect(404);
      expect((await t.http().get('/api/public/resolutions')).body.total).toBe(
        0,
      );
      await api()
        .post(`/api/cases/${created.id}/unpublish`)
        .send({ reason: 'Otra vez' })
        .expect(409);
    });

    it('reabrir un expediente retira su publicación y las sanciones anuladas no se publican', async () => {
      await prisma.institutionSettings.upsert({
        where: { id: 1 },
        update: { publicResolutions: true },
        create: { id: 1, name: 'Liga', publicResolutions: true },
      });
      const created = await resolveWithSanction();
      const extra = (
        await sanction(created.id, {
          athleteId: undefined,
          clubId: scenario.away.club.id,
          type: 'multa',
          matchesCount: null,
        }).expect(201)
      ).body;
      await api()
        .post(`/api/sanctions/${extra.id}/annul`)
        .send({ reason: 'Registrada por error' })
        .expect(200);
      await api()
        .post(`/api/cases/${created.id}/publish`)
        .send(publication)
        .expect(200);
      expect(
        (await t.http().get(`/api/public/resolutions/${created.id}`)).body
          .sanctions,
      ).toHaveLength(1);

      await api()
        .post(`/api/cases/${created.id}/reopen`)
        .send({ reason: 'Nuevo recurso presentado' })
        .expect(200);
      await t.http().get(`/api/public/resolutions/${created.id}`).expect(404);
      expect(
        (
          await prisma.disciplinaryCase.findUniqueOrThrow({
            where: { id: created.id },
          })
        ).publishedAt,
      ).toBeNull();
    });

    it('avisa a los clubes involucrados al publicar', async () => {
      const home = await leader(scenario.home.club.id);
      const away = await leader(scenario.away.club.id);
      const created = await resolveWithSanction();
      await api()
        .post(`/api/cases/${created.id}/publish`)
        .send(publication)
        .expect(200);
      const count = (userId: string) =>
        prisma.notification.count({
          where: { userId, templateKey: 'resolution.published' },
        });
      expect(await count(home.user.id)).toBe(1);
      expect(await count(away.user.id)).toBe(0);
    });
  });
});
