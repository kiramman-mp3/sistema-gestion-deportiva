import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  MAIL_TRANSPORTER,
  type MailMessage,
} from '../../src/notifications/mail.js';
import { NotificationsService } from '../../src/notifications/notifications.service.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import {
  adminWith,
  authed,
  createAthlete,
  createClub,
  createMatchScenario,
  createUser,
  leaderWith,
  login,
  seedCatalog,
} from '../support/fixtures.js';

/** Transporte de correo simulado: guarda lo enviado y puede fallar a demanda. */
class FakeMail {
  sent: MailMessage[] = [];
  failWith: (Error & { code?: string }) | null = null;
  async sendMail(message: MailMessage) {
    if (this.failWith) throw this.failWith;
    this.sent.push(message);
    return {};
  }
}

const OPERATOR = [
  'championships:read',
  'registrations:read',
  'registrations:manage',
  'fixtures:read',
  'fixtures:manage',
  'results:read',
  'results:manage',
  'results:approve',
  'clubs:access_all',
  'notifications:manage',
];

describe('notificaciones', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let operator: Awaited<ReturnType<typeof adminWith>>;
  const api = () => authed(t, operator.session);

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    operator = await adminWith(t, prisma, OPERATOR);
  });

  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  /** Dirigente vinculado a un club (recibe los avisos del club). */
  const leaderOf = (clubId: string) =>
    leaderWith(t, prisma, ['clubs:read'], [clubId]);

  describe('bandeja propia', () => {
    it('exige sesión y cada usuario ve solo sus avisos', async () => {
      await t.http().get('/api/notifications').expect(401);

      const scenario = await createMatchScenario(prisma);
      const homeLeader = await leaderOf(scenario.home.club.id);
      const awayLeader = await leaderOf(scenario.away.club.id);

      await api()
        .patch(`/api/events/${scenario.event.id}/schedule`)
        .send({ scheduledAt: '2026-07-01T20:00:00.000Z', reason: 'Lluvia' })
        .expect(200);

      const mine = await authed(t, homeLeader.session)
        .get('/api/notifications')
        .expect(200);
      expect(mine.body.total).toBe(1);
      expect(mine.body.items[0]).toMatchObject({
        templateKey: 'event.rescheduled',
        channel: 'sistema',
        status: 'enviada',
        readAt: null,
      });
      expect(mine.body.items[0].body).toContain('Lluvia');
      expect(
        (await authed(t, awayLeader.session).get('/api/notifications')).body
          .total,
      ).toBe(1);
      // El operador que reprogramó no se notifica a sí mismo.
      expect(
        (await api().get('/api/notifications').expect(200)).body.total,
      ).toBe(0);
    });

    it('cuenta, marca como leída una o todas, y una ajena responde 404', async () => {
      const scenario = await createMatchScenario(prisma);
      const leader = await leaderOf(scenario.home.club.id);
      const other = await leaderOf(scenario.away.club.id);
      await api()
        .patch(`/api/events/${scenario.event.id}/schedule`)
        .send({ scheduledAt: '2026-07-01T20:00:00.000Z', reason: 'Cancha' })
        .expect(200);
      await api()
        .patch(`/api/events/${scenario.event.id}/schedule`)
        .send({ scheduledAt: '2026-07-02T20:00:00.000Z', reason: 'Árbitro' })
        .expect(200);

      const as = authed(t, leader.session);
      expect((await as.get('/api/notifications/unread-count')).body).toEqual({
        unread: 2,
      });
      const list = (await as.get('/api/notifications')).body.items;

      // Una notificación ajena no se puede marcar ni revela que existe.
      await authed(t, other.session)
        .post(`/api/notifications/${list[0].id}/read`)
        .expect(404);
      expect(
        (await as.get('/api/notifications/unread-count')).body.unread,
      ).toBe(2);

      await as.post(`/api/notifications/${list[0].id}/read`).expect(204);
      await as.post(`/api/notifications/${list[0].id}/read`).expect(204);
      await as
        .post('/api/notifications/00000000-0000-7000-8000-000000000000/read')
        .expect(404);
      expect(
        (await as.get('/api/notifications/unread-count')).body.unread,
      ).toBe(1);
      expect((await as.get('/api/notifications?unread=true')).body.total).toBe(
        1,
      );

      expect((await as.post('/api/notifications/read-all')).body).toEqual({
        marked: 1,
      });
      expect(
        (await as.get('/api/notifications/unread-count')).body.unread,
      ).toBe(0);
    });
  });

  describe('eventos que generan avisos', () => {
    it('avisa a los dirigentes del club cuando se observa o aprueba su inscripción', async () => {
      const scenario = await createMatchScenario(prisma);
      const leader = await leaderOf(scenario.home.club.id);
      const rival = await leaderOf(scenario.away.club.id);

      await api()
        .patch(
          `/api/championships/${scenario.championship.id}/registrations/${scenario.home.registrationId}/status`,
        )
        .send({ status: 'observada', reviewNotes: 'Falta la nómina firmada' })
        .expect(200);

      const items = (await authed(t, leader.session).get('/api/notifications'))
        .body.items;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        templateKey: 'registration.reviewed',
        entityType: 'registration',
        entityId: scenario.home.registrationId,
        link: `#/campeonatos/${scenario.championship.id}`,
      });
      expect(items[0].body).toContain('observada');
      expect(items[0].body).toContain('Falta la nómina firmada');
      expect(
        (await authed(t, rival.session).get('/api/notifications')).body.total,
      ).toBe(0);
    });

    it('avisa del cambio de estado de un partido solo si lo suspende, pospone o cancela', async () => {
      const scenario = await createMatchScenario(prisma);
      const leader = await leaderOf(scenario.home.club.id);
      const as = authed(t, leader.session);

      await api()
        .patch(`/api/events/${scenario.event.id}/status`)
        .send({ status: 'en_curso' })
        .expect(200);
      expect((await as.get('/api/notifications')).body.total).toBe(0);

      await api()
        .patch(`/api/events/${scenario.event.id}/status`)
        .send({ status: 'suspendido', reason: 'Falta de garantías' })
        .expect(200);
      const items = (await as.get('/api/notifications')).body.items;
      expect(items).toHaveLength(1);
      expect(items[0].templateKey).toBe('event.status_changed');
      expect(items[0].body).toContain('suspendido');
    });

    it('avisa a quienes pueden aprobar cuando un acta pasa a revisión, sin avisar a quien la envía', async () => {
      const scenario = await createMatchScenario(prisma);
      const approver = await adminWith(t, prisma, [
        'results:approve',
        'results:read',
      ]);
      const [ep1, ep2] = scenario.eventParticipants;

      await api()
        .put(`/api/events/${scenario.event.id}/result`)
        .send({
          values: [
            { eventParticipantId: ep1!.id, score: 1 },
            { eventParticipantId: ep2!.id, score: 0 },
          ],
        })
        .expect(200);
      await api()
        .post(`/api/events/${scenario.event.id}/result/submit`)
        .expect(201);

      const inbox = (
        await authed(t, approver.session).get('/api/notifications')
      ).body.items;
      expect(inbox).toHaveLength(1);
      expect(inbox[0].templateKey).toBe('result.pending_review');
      // El operador también puede aprobar, pero es quien envió el acta.
      expect((await api().get('/api/notifications')).body.total).toBe(0);
    });

    it('no notifica a cuentas inactivas ni crea avisos si la operación se revierte', async () => {
      const scenario = await createMatchScenario(prisma);
      const leader = await leaderOf(scenario.home.club.id);
      await prisma.user.update({
        where: { id: leader.user.id },
        data: { status: 'inactivo' },
      });
      await api()
        .patch(`/api/events/${scenario.event.id}/schedule`)
        .send({ scheduledAt: '2026-07-01T20:00:00.000Z', reason: 'Cancha' })
        .expect(200);
      expect(await prisma.notification.count()).toBe(0);

      // Operación que falla (partido inexistente): no deja avisos.
      await api()
        .patch('/api/events/00000000-0000-7000-8000-000000000000/schedule')
        .send({ scheduledAt: '2026-07-01T20:00:00.000Z', reason: 'Motivo' })
        .expect(404);
      expect(await prisma.notification.count()).toBe(0);
    });
  });

  describe('correo desactivado (por defecto)', () => {
    it('no encola correos y la administración del correo informa que está apagado', async () => {
      const scenario = await createMatchScenario(prisma);
      await leaderOf(scenario.home.club.id);
      await api()
        .patch(`/api/events/${scenario.event.id}/schedule`)
        .send({ scheduledAt: '2026-07-01T20:00:00.000Z', reason: 'Cancha' })
        .expect(200);
      expect(
        await prisma.notification.count({ where: { channel: 'correo' } }),
      ).toBe(0);
      const outbox = await api().get('/api/notifications/outbox').expect(200);
      expect(outbox.body).toMatchObject({ mailEnabled: false, total: 0 });
      expect((await api().post('/api/notifications/dispatch')).body).toEqual({
        sent: 0,
        failed: 0,
        retrying: 0,
      });
    });
  });

  describe('permisos de administración', () => {
    it('la cola de correo, el despacho y los recordatorios exigen notifications:manage', async () => {
      const plain = await createUser(prisma, { permissions: ['clubs:read'] });
      const as = authed(t, await login(t, plain.email));
      await as.get('/api/notifications/outbox').expect(403);
      await as.post('/api/notifications/dispatch').expect(403);
      await as
        .post('/api/notifications/reminders/documents')
        .send({ clubId: '00000000-0000-7000-8000-000000000000' })
        .expect(403);
      await t.http().get('/api/notifications/outbox').expect(401);
    });
  });

  describe('recordatorio de documentación', () => {
    it('avisa solo la cantidad de deportistas sin documentos, nunca sus nombres', async () => {
      const club = await createClub(prisma, 'Club Documentos');
      const leader = await leaderOf(club.id);
      await createAthlete(prisma, club.id, { firstName: 'Nombre Secreto' });
      await createAthlete(prisma, club.id);
      await createAthlete(prisma, club.id, { eligibility: 'inhabilitado' });

      const res = await api()
        .post('/api/notifications/reminders/documents')
        .send({ clubId: club.id })
        .expect(200);
      expect(res.body).toEqual({ pending: 2, notified: 1 });

      const items = (await authed(t, leader.session).get('/api/notifications'))
        .body.items;
      expect(items).toHaveLength(1);
      expect(items[0].body).toContain('2 deportista(s)');
      expect(JSON.stringify(items[0])).not.toContain('Nombre Secreto');

      expect(
        await prisma.auditLog.count({
          where: { action: 'notifications.documents_reminder' },
        }),
      ).toBe(1);
    });

    it('respeta el alcance por club y valida los datos', async () => {
      const mine = await createClub(prisma, 'Club Mío');
      const foreign = await createClub(prisma, 'Club Ajeno');
      const scoped = await leaderWith(
        t,
        prisma,
        ['notifications:manage'],
        [mine.id],
      );
      const as = authed(t, scoped.session);
      await as
        .post('/api/notifications/reminders/documents')
        .send({ clubId: foreign.id })
        .expect(404);
      await as
        .post('/api/notifications/reminders/documents')
        .send({ clubId: mine.id })
        .expect(200);
      await as
        .post('/api/notifications/reminders/documents')
        .send({ clubId: 'no-es-uuid' })
        .expect(400);
      await as
        .post('/api/notifications/reminders/documents')
        .send({ clubId: mine.id, extra: true })
        .expect(400);
    });
  });
});

describe('notificaciones con correo activado', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let mail: FakeMail;
  let operator: Awaited<ReturnType<typeof adminWith>>;
  const api = () => authed(t, operator.session);

  beforeAll(async () => {
    prisma = createTestPrisma();
    mail = new FakeMail();
    t = await createTestApp({
      env: {
        MAIL_TRANSPORT: 'smtp',
        SMTP_HOST: 'smtp.test',
        MAIL_FROM: 'Liga <no-responder@test>',
      },
      customize: (builder) =>
        builder.overrideProvider(MAIL_TRANSPORTER).useValue(mail),
    });
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    mail.sent = [];
    mail.failWith = null;
    operator = await adminWith(t, prisma, OPERATOR);
  });

  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  async function queueOneEmail() {
    const scenario = await createMatchScenario(prisma);
    const leader = await leaderWith(
      t,
      prisma,
      ['clubs:read'],
      [scenario.home.club.id],
    );
    await api()
      .patch(`/api/events/${scenario.event.id}/schedule`)
      .send({ scheduledAt: '2026-07-01T20:00:00.000Z', reason: 'Cancha' })
      .expect(200);
    return { scenario, leader };
  }

  it('encola un correo por aviso y lo envía con asunto y cuerpo genéricos', async () => {
    const { scenario, leader } = await queueOneEmail();
    const queued = await prisma.notification.findMany({
      where: { channel: 'correo' },
    });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ status: 'pendiente', attempts: 0 });

    const res = await api().post('/api/notifications/dispatch').expect(200);
    expect(res.body).toEqual({ sent: 1, failed: 0, retrying: 0 });

    expect(mail.sent).toHaveLength(1);
    const message = mail.sent[0]!;
    expect(message.to).toBe(leader.user.email);
    expect(message.from).toBe('Liga <no-responder@test>');
    expect(message.subject).toBe(
      'Liga de Quero: Se modificó la programación de un partido',
    );
    // Sin datos del caso: ni equipos, ni campeonato, ni motivo.
    const content = `${message.subject}\n${message.text}`;
    for (const secret of [
      'Cancha',
      'Local',
      'Visitante',
      scenario.championship.name,
    ]) {
      expect(content).not.toContain(secret);
    }
    expect(message.text).toContain('https://liga.example/#/campeonatos');

    expect(
      await prisma.notification.findUniqueOrThrow({
        where: { id: queued[0]!.id },
      }),
    ).toMatchObject({ status: 'enviada', attempts: 1 });
    // El aviso dentro del sistema sí conserva el detalle.
    const inbox = await prisma.notification.findFirstOrThrow({
      where: { channel: 'sistema', userId: leader.user.id },
    });
    expect(inbox.body).toContain('Cancha');
  });

  it('dos despachos simultáneos no envían dos veces el mismo correo', async () => {
    await queueOneEmail();
    const service = t.app.get(NotificationsService);
    const [a, b] = await Promise.all([
      service.dispatchPending(),
      service.dispatchPending(),
    ]);
    expect(a.sent + b.sent).toBe(1);
    expect(mail.sent).toHaveLength(1);
  });

  it('reintenta los fallos, guarda solo el código del error y descarta tras agotar los intentos', async () => {
    await queueOneEmail();
    mail.failWith = Object.assign(
      new Error('535 contraseña secreta rechazada'),
      {
        code: 'EAUTH',
      },
    );

    const first = await api().post('/api/notifications/dispatch').expect(200);
    expect(first.body).toEqual({ sent: 0, failed: 0, retrying: 1 });
    const row = await prisma.notification.findFirstOrThrow({
      where: { channel: 'correo' },
    });
    expect(row).toMatchObject({
      status: 'pendiente',
      attempts: 1,
      lastError: 'EAUTH',
    });
    expect(JSON.stringify(row)).not.toContain('secreta');

    // Tras un fallo hay una espera: un despacho inmediato no reintenta.
    expect((await api().post('/api/notifications/dispatch')).body).toEqual({
      sent: 0,
      failed: 0,
      retrying: 0,
    });
    const elapse = () =>
      prisma.notification.updateMany({
        where: { channel: 'correo' },
        data: { nextAttemptAt: new Date(Date.now() - 1000) },
      });
    for (let i = 0; i < 3; i++) {
      await elapse();
      await api().post('/api/notifications/dispatch');
    }
    await elapse();
    const last = await api().post('/api/notifications/dispatch').expect(200);
    expect(last.body).toEqual({ sent: 0, failed: 1, retrying: 0 });
    expect(
      await prisma.notification.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({ status: 'fallida', attempts: 5 });

    // Una vez fallido no se reintenta más.
    mail.failWith = null;
    expect((await api().post('/api/notifications/dispatch')).body).toEqual({
      sent: 0,
      failed: 0,
      retrying: 0,
    });

    const outbox = await api()
      .get('/api/notifications/outbox?status=fallida')
      .expect(200);
    expect(outbox.body.mailEnabled).toBe(true);
    expect(outbox.body.total).toBe(1);
    expect(outbox.body.items[0]).toMatchObject({
      status: 'fallida',
      lastError: 'EAUTH',
    });
  });
});
