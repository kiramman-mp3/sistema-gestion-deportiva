import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import {
  adminWith,
  allowSelfApproval,
  authed,
  createMatchScenario,
  seedCatalog,
} from '../support/fixtures.js';

describe('aprobación de actas: estado y separación de funciones', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let scorer: Awaited<ReturnType<typeof adminWith>>;
  let reviewer: Awaited<ReturnType<typeof adminWith>>;
  let scenario: Awaited<ReturnType<typeof createMatchScenario>>;

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    scorer = await adminWith(t, prisma, [
      'results:read',
      'results:manage',
      'results:approve',
    ]);
    reviewer = await adminWith(t, prisma, ['results:read', 'results:approve']);
    scenario = await createMatchScenario(prisma);
  });

  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  const as = (who: typeof scorer) => authed(t, who.session);
  const eventUrl = () => `/api/events/${scenario.event.id}/result`;
  const approval = { approved: true, reason: 'Revisión reglamentaria' };

  const saveDraft = () =>
    as(scorer)
      .put(eventUrl())
      .send({
        values: [
          { eventParticipantId: scenario.eventParticipants[0]!.id, score: 1 },
          { eventParticipantId: scenario.eventParticipants[1]!.id, score: 0 },
        ],
      })
      .expect(200);

  it('un borrador no se puede aprobar ni rechazar', async () => {
    await saveDraft();
    const approve = await as(reviewer)
      .post(`${eventUrl()}/approve`)
      .send(approval)
      .expect(409);
    expect(approve.body.message).toMatch(/pendientes de revisión/);
    await as(reviewer)
      .post(`${eventUrl()}/approve`)
      .send({ approved: false, reason: 'No procede' })
      .expect(409);
    expect((await prisma.result.findFirstOrThrow()).status).toBe('borrador');
  });

  it('quien registró el acta no puede aprobarla ni rechazarla; otra persona sí', async () => {
    await saveDraft();
    await as(scorer).post(`${eventUrl()}/submit`).expect(201);

    const self = await as(scorer)
      .post(`${eventUrl()}/approve`)
      .send(approval)
      .expect(403);
    expect(self.body.message).toMatch(/no puede aprobarla/);
    await as(scorer)
      .post(`${eventUrl()}/approve`)
      .send({ approved: false, reason: 'Me arrepiento' })
      .expect(403);
    expect((await prisma.result.findFirstOrThrow()).status).toBe(
      'pendiente_revision',
    );

    const ok = await as(reviewer)
      .post(`${eventUrl()}/approve`)
      .send(approval)
      .expect(201);
    expect(ok.body).toMatchObject({
      status: 'aprobado',
      approvedById: reviewer.user.id,
    });
  });

  it('un acta ya resuelta no se vuelve a aprobar', async () => {
    await saveDraft();
    await as(scorer).post(`${eventUrl()}/submit`).expect(201);
    await as(reviewer).post(`${eventUrl()}/approve`).send(approval).expect(201);
    await as(reviewer).post(`${eventUrl()}/approve`).send(approval).expect(409);
    await as(reviewer)
      .post(`${eventUrl()}/approve`)
      .send({ approved: false, reason: 'Ahora la rechazo' })
      .expect(409);
    expect(await prisma.resultRevision.count()).toBe(1);
  });

  it('la Liga puede permitir la autoaprobación de forma expresa', async () => {
    await saveDraft();
    await as(scorer).post(`${eventUrl()}/submit`).expect(201);
    await as(scorer).post(`${eventUrl()}/approve`).send(approval).expect(403);

    await allowSelfApproval(prisma);
    const res = await as(scorer)
      .post(`${eventUrl()}/approve`)
      .send(approval)
      .expect(201);
    expect(res.body.status).toBe('aprobado');
  });
});
