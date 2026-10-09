import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import {
  adminWith,
  allowSelfApproval,
  authed,
  createClub,
  seedCatalog,
} from '../support/fixtures.js';

const PERMISSIONS = [
  'championships:read',
  'championships:manage',
  'registrations:read',
  'registrations:manage',
  'fixtures:read',
  'fixtures:manage',
  'results:read',
  'results:manage',
  'results:approve',
  'clubs:access_all',
  'teams:manage',
  'athletes:manage',
];

describe('resultados de fútbol, flujo de actas y tabla de posiciones', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof adminWith>>;
  let championshipId: string;
  let eventId: string;
  let ep1Id: string;
  let ep2Id: string;
  let reg1Id: string;
  let reg2Id: string;

  const api = () => authed(t, admin.session);

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    await allowSelfApproval(prisma);
    admin = await adminWith(t, prisma, PERMISSIONS);

    const club1 = await createClub(prisma, 'Club Real Quero');
    const club2 = await createClub(prisma, 'Club Atlético Quero');

    const season = await prisma.season.create({
      data: {
        name: 'Temporada Oficial 2026',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        status: 'activa',
      },
    });

    const sport = await prisma.sport.create({
      data: {
        code: 'futbol',
        name: 'Fútbol',
        status: 'activo',
      },
    });

    const cat = await prisma.category.create({
      data: {
        code: 'senior',
        name: 'Senior Máxima',
        status: 'activo',
      },
    });

    const champ = await prisma.championship.create({
      data: {
        name: 'Torneo Oficial de Fútbol 2026',
        seasonId: season.id,
        sportId: sport.id,
        categoryId: cat.id,
        format: 'todos_contra_todos',
        status: 'en_curso',
      },
    });
    championshipId = champ.id;

    // Reglas de puntuación versión 1
    await prisma.competitionRuleVersion.create({
      data: {
        championshipId: champ.id,
        version: 1,
        rulesJson: {
          pointsWin: 3,
          pointsDraw: 1,
          pointsLoss: 0,
        },
      },
    });

    const team1 = await prisma.team.create({
      data: {
        clubId: club1.id,
        sportId: sport.id,
        name: 'Real Quero',
        nameKey: 'real quero',
      },
    });
    const team2 = await prisma.team.create({
      data: {
        clubId: club2.id,
        sportId: sport.id,
        name: 'Atlético Quero',
        nameKey: 'atletico quero',
      },
    });

    const p1 = await prisma.participant.create({
      data: {
        kind: 'equipo',
        team: { create: { teamId: team1.id } },
      },
    });
    const p2 = await prisma.participant.create({
      data: {
        kind: 'equipo',
        team: { create: { teamId: team2.id } },
      },
    });

    const r1 = await prisma.registration.create({
      data: {
        championshipId: champ.id,
        participantId: p1.id,
        status: 'aprobada',
      },
    });
    const r2 = await prisma.registration.create({
      data: {
        championshipId: champ.id,
        participantId: p2.id,
        status: 'aprobada',
      },
    });
    reg1Id = r1.id;
    reg2Id = r2.id;

    const stage = await prisma.stage.create({
      data: {
        championshipId: champ.id,
        name: 'Primera Etapa',
        sequence: 1,
      },
    });
    const round = await prisma.round.create({
      data: {
        stageId: stage.id,
        name: 'Fecha 1',
        roundNumber: 1,
      },
    });

    const event = await prisma.event.create({
      data: {
        roundId: round.id,
        scheduledAt: new Date('2026-06-25T15:00:00.000Z'),
        status: 'programado',
        participants: {
          create: [
            { registrationId: reg1Id, side: 'local' },
            { registrationId: reg2Id, side: 'visitante' },
          ],
        },
      },
      include: {
        participants: true,
      },
    });
    eventId = event.id;
    ep1Id = event.participants[0]!.id;
    ep2Id = event.participants[1]!.id;
  });

  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  it('registra acta en borrador, la envía a revisión y la aprueba oficialmente con revisión histórica', async () => {
    // 1. Guardar acta en borrador con marcador 2 - 1 e incidencias
    const draftRes = await api()
      .put(`/api/events/${eventId}/result`)
      .send({
        values: [
          { eventParticipantId: ep1Id, score: 2 },
          { eventParticipantId: ep2Id, score: 1 },
        ],
        footballEvents: [
          {
            eventParticipantId: ep1Id,
            eventType: 'gol',
            minute: 15,
            notes: 'Gol de jugada',
          },
          {
            eventParticipantId: ep2Id,
            eventType: 'gol',
            minute: 40,
            notes: 'Tiro libre',
          },
          {
            eventParticipantId: ep1Id,
            eventType: 'gol',
            minute: 82,
            notes: 'Remate cruzado',
          },
          {
            eventParticipantId: ep2Id,
            eventType: 'tarjeta_amarilla',
            minute: 65,
            notes: 'Falta táctica',
          },
        ],
      })
      .expect(200);

    expect(draftRes.body.status).toBe('borrador');
    expect(draftRes.body.values).toHaveLength(2);
    expect(draftRes.body.footballEvents).toHaveLength(4);

    // 2. Enviar a revisión
    const submitRes = await api()
      .post(`/api/events/${eventId}/result/submit`)
      .expect(201);

    expect(submitRes.body.status).toBe('pendiente_revision');

    // 3. Aprobar oficialmente
    const approveRes = await api()
      .post(`/api/events/${eventId}/result/approve`)
      .send({
        approved: true,
        notes: 'Acta revisada y validada con los vocales de mesa',
        reason: 'Validación reglamentaria de la vocalía',
      })
      .expect(201);

    expect(approveRes.body.status).toBe('aprobado');

    // Comprobar que el partido quedó en estado finalizado
    const updatedEvent = await prisma.event.findUnique({
      where: { id: eventId },
    });
    expect(updatedEvent?.status).toBe('finalizado');

    // Comprobar revisión histórica guardada
    const revisions = await prisma.resultRevision.findMany({
      where: { resultId: approveRes.body.id },
    });
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.reason).toBe('Validación reglamentaria de la vocalía');
  });

  it('calcula la tabla de posiciones con puntos, goles y desempate', async () => {
    // Registramos y aprobamos el partido 2-1 a favor de Real Quero
    await api()
      .put(`/api/events/${eventId}/result`)
      .send({
        values: [
          { eventParticipantId: ep1Id, score: 2 },
          { eventParticipantId: ep2Id, score: 1 },
        ],
        footballEvents: [
          {
            eventParticipantId: ep2Id,
            eventType: 'tarjeta_amarilla',
            minute: 55,
          },
        ],
      })
      .expect(200);

    await api().post(`/api/events/${eventId}/result/submit`).expect(201);
    await api()
      .post(`/api/events/${eventId}/result/approve`)
      .send({
        approved: true,
        reason: 'Aprobación oficial',
      })
      .expect(201);

    // Consultar tabla de posiciones
    const standingsRes = await api()
      .get(`/api/championships/${championshipId}/standings`)
      .expect(200);

    expect(standingsRes.body.standings).toHaveLength(2);

    const leader = standingsRes.body.standings[0];
    const second = standingsRes.body.standings[1];

    expect(leader.name).toBe('Real Quero');
    expect(leader.position).toBe(1);
    expect(leader.played).toBe(1);
    expect(leader.won).toBe(1);
    expect(leader.drawn).toBe(0);
    expect(leader.lost).toBe(0);
    expect(leader.goalsFor).toBe(2);
    expect(leader.goalsAgainst).toBe(1);
    expect(leader.goalDifference).toBe(1);
    expect(leader.points).toBe(3);

    expect(second.name).toBe('Atlético Quero');
    expect(second.position).toBe(2);
    expect(second.played).toBe(1);
    expect(second.won).toBe(0);
    expect(second.drawn).toBe(0);
    expect(second.lost).toBe(1);
    expect(second.goalsFor).toBe(1);
    expect(second.goalsAgainst).toBe(2);
    expect(second.goalDifference).toBe(-1);
    expect(second.points).toBe(0);
    expect(second.yellowCards).toBe(1);
  });
});
