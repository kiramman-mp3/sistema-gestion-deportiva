import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import {
  adminWith,
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

describe('reglamentos y puntuación multideporte (básquet, taekwondo, ajedrez)', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof adminWith>>;
  let seasonId: string;
  let categoryId: string;
  let club1: Awaited<ReturnType<typeof createClub>>;
  let club2: Awaited<ReturnType<typeof createClub>>;

  const api = () => authed(t, admin.session);

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    admin = await adminWith(t, prisma, PERMISSIONS);

    club1 = await createClub(prisma, 'Club Libertad Quero');
    club2 = await createClub(prisma, 'Club San Pedro');

    const season = await prisma.season.create({
      data: {
        name: 'Temporada Multideporte 2026',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        status: 'activa',
      },
    });
    seasonId = season.id;

    const cat = await prisma.category.create({
      data: {
        code: 'abierta',
        name: 'Categoría Abierta',
        status: 'activo',
      },
    });
    categoryId = cat.id;
  });

  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  it('básquet: registra puntuación por período (cuartos Q1..Q4) y calcula tabla FIBA (2 pts victoria, 1 derrota)', async () => {
    const sport = await prisma.sport.create({
      data: { code: 'basquet', name: 'Básquetbol', status: 'activo' },
    });

    const champ = await prisma.championship.create({
      data: {
        name: 'Torneo Cantonal de Básquet',
        seasonId,
        sportId: sport.id,
        categoryId,
        format: 'todos_contra_todos',
        status: 'en_curso',
      },
    });

    const team1 = await prisma.team.create({
      data: {
        clubId: club1.id,
        sportId: sport.id,
        name: 'Tiburones Basket',
        nameKey: 'tiburones basket',
      },
    });
    const team2 = await prisma.team.create({
      data: {
        clubId: club2.id,
        sportId: sport.id,
        name: 'Águilas Basket',
        nameKey: 'aguilas basket',
      },
    });

    const p1 = await prisma.participant.create({
      data: { kind: 'equipo', team: { create: { teamId: team1.id } } },
    });
    const p2 = await prisma.participant.create({
      data: { kind: 'equipo', team: { create: { teamId: team2.id } } },
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

    const stage = await prisma.stage.create({
      data: { championshipId: champ.id, name: 'Fase Regular', sequence: 1 },
    });
    const round = await prisma.round.create({
      data: { stageId: stage.id, name: 'Jornada 1', roundNumber: 1 },
    });

    const event = await prisma.event.create({
      data: {
        roundId: round.id,
        status: 'programado',
        participants: {
          create: [
            { registrationId: r1.id, side: 'local' },
            { registrationId: r2.id, side: 'visitante' },
          ],
        },
      },
      include: { participants: true },
    });

    const ep1 = event.participants[0]!.id;
    const ep2 = event.participants[1]!.id;

    // Registrar resultado con cuartos Q1..Q4: Tiburones (82) vs Águilas (75)
    await api()
      .put(`/api/events/${event.id}/result`)
      .send({
        values: [
          { eventParticipantId: ep1, score: 82 },
          { eventParticipantId: ep2, score: 75 },
        ],
        periodScores: [
          { eventParticipantId: ep1, periodNumber: 1, score: 20 },
          { eventParticipantId: ep2, periodNumber: 1, score: 18 },
          { eventParticipantId: ep1, periodNumber: 2, score: 22 },
          { eventParticipantId: ep2, periodNumber: 2, score: 19 },
          { eventParticipantId: ep1, periodNumber: 3, score: 18 },
          { eventParticipantId: ep2, periodNumber: 3, score: 21 },
          { eventParticipantId: ep1, periodNumber: 4, score: 22 },
          { eventParticipantId: ep2, periodNumber: 4, score: 17 },
        ],
      })
      .expect(200);

    // Aprobar resultado
    await api()
      .post(`/api/events/${event.id}/result/approve`)
      .send({
        approved: true,
        reason: 'Planilla oficial de básquetbol aprobada',
      })
      .expect(201);

    // Consultar tabla
    const standingsRes = await api()
      .get(`/api/championships/${champ.id}/standings`)
      .expect(200);

    expect(standingsRes.body.standings).toHaveLength(2);
    const first = standingsRes.body.standings[0];
    const second = standingsRes.body.standings[1];

    expect(first.name).toBe('Tiburones Basket');
    expect(first.points).toBe(2); // Victoria FIBA = 2 pts
    expect(first.goalsFor).toBe(82);
    expect(first.goalsAgainst).toBe(75);

    expect(second.name).toBe('Águilas Basket');
    expect(second.points).toBe(1); // Derrota jugada FIBA = 1 pt
    expect(second.goalsFor).toBe(75);
    expect(second.goalsAgainst).toBe(82);
  });

  it('taekwondo: registra asaltos, puntos de combate y penalizaciones Gam-jeom', async () => {
    const sport = await prisma.sport.create({
      data: { code: 'taekwondo', name: 'Taekwondo', status: 'activo' },
    });

    const champ = await prisma.championship.create({
      data: {
        name: 'Selectivo Cantonal de Taekwondo',
        seasonId,
        sportId: sport.id,
        categoryId,
        format: 'cuadro_combates',
        status: 'en_curso',
      },
    });

    const person1 = await prisma.person.create({
      data: { firstName: 'Mateo', lastName: 'Paredes' },
    });
    const person2 = await prisma.person.create({
      data: { firstName: 'Carlos', lastName: 'Vargas' },
    });

    const ath1 = await prisma.athlete.create({
      data: {
        personId: person1.id,
        clubId: club1.id,
        eligibility: 'habilitado',
      },
    });
    const ath2 = await prisma.athlete.create({
      data: {
        personId: person2.id,
        clubId: club2.id,
        eligibility: 'habilitado',
      },
    });

    const p1 = await prisma.participant.create({
      data: {
        kind: 'individual',
        individual: { create: { athleteId: ath1.id } },
      },
    });
    const p2 = await prisma.participant.create({
      data: {
        kind: 'individual',
        individual: { create: { athleteId: ath2.id } },
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

    const stage = await prisma.stage.create({
      data: { championshipId: champ.id, name: 'Combates', sequence: 1 },
    });
    const round = await prisma.round.create({
      data: { stageId: stage.id, name: 'Final', roundNumber: 1 },
    });

    const event = await prisma.event.create({
      data: {
        roundId: round.id,
        status: 'programado',
        participants: {
          create: [
            { registrationId: r1.id, side: 'individual' },
            { registrationId: r2.id, side: 'individual' },
          ],
        },
      },
      include: { participants: true },
    });

    const ep1 = event.participants[0]!.id;
    const ep2 = event.participants[1]!.id;

    // Registrar asaltos y puntos (ep1 gana 2 asaltos a 1)
    const draftRes = await api()
      .put(`/api/events/${event.id}/result`)
      .send({
        values: [
          { eventParticipantId: ep1, score: 25 },
          { eventParticipantId: ep2, score: 18 },
        ],
        taekwondoBouts: [
          { eventParticipantId: ep1, roundNumber: 1, points: 10, penalties: 1 },
          { eventParticipantId: ep2, roundNumber: 1, points: 6, penalties: 2 },
          {
            eventParticipantId: ep1,
            roundNumber: 2,
            points: 15,
            penalties: 0,
            decision: 'superioridad',
          },
          { eventParticipantId: ep2, roundNumber: 2, points: 12, penalties: 1 },
        ],
      })
      .expect(200);

    expect(draftRes.body.taekwondoBouts).toHaveLength(4);

    await api()
      .post(`/api/events/${event.id}/result/approve`)
      .send({
        approved: true,
        reason: 'Validación de mesa de arbitraje de Taekwondo',
      })
      .expect(201);
  });

  it('ajedrez: registra emparejamiento con sistema de puntuación FIDE y desempate Buchholz', async () => {
    const sport = await prisma.sport.create({
      data: { code: 'ajedrez', name: 'Ajedrez', status: 'activo' },
    });

    const champ = await prisma.championship.create({
      data: {
        name: 'Torneo Abierto de Ajedrez Quero',
        seasonId,
        sportId: sport.id,
        categoryId,
        format: 'sistema_suizo',
        status: 'en_curso',
      },
    });

    const person1 = await prisma.person.create({
      data: { firstName: 'David', lastName: 'López' },
    });
    const person2 = await prisma.person.create({
      data: { firstName: 'Sebastián', lastName: 'Mora' },
    });

    const ath1 = await prisma.athlete.create({
      data: {
        personId: person1.id,
        clubId: club1.id,
        eligibility: 'habilitado',
      },
    });
    const ath2 = await prisma.athlete.create({
      data: {
        personId: person2.id,
        clubId: club2.id,
        eligibility: 'habilitado',
      },
    });

    const p1 = await prisma.participant.create({
      data: {
        kind: 'individual',
        individual: { create: { athleteId: ath1.id } },
      },
    });
    const p2 = await prisma.participant.create({
      data: {
        kind: 'individual',
        individual: { create: { athleteId: ath2.id } },
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

    const stage = await prisma.stage.create({
      data: { championshipId: champ.id, name: 'Rondas Suizas', sequence: 1 },
    });
    const round = await prisma.round.create({
      data: { stageId: stage.id, name: 'Ronda 1', roundNumber: 1 },
    });

    const event = await prisma.event.create({
      data: {
        roundId: round.id,
        status: 'programado',
        participants: {
          create: [
            { registrationId: r1.id, side: 'individual' },
            { registrationId: r2.id, side: 'individual' },
          ],
        },
      },
      include: { participants: true },
    });

    const ep1 = event.participants[0]!.id;
    const ep2 = event.participants[1]!.id;

    // David (Blancas) gana la partida: 1.0 vs 0.0 con Buchholz
    await api()
      .put(`/api/events/${event.id}/result`)
      .send({
        values: [
          { eventParticipantId: ep1, score: 1 },
          { eventParticipantId: ep2, score: 0 },
        ],
        chessPairings: [
          {
            eventParticipantId: ep1,
            color: 'blancas',
            points: 1.0,
            buchholz: 0.5,
          },
          {
            eventParticipantId: ep2,
            color: 'negras',
            points: 0.0,
            buchholz: 1.0,
          },
        ],
      })
      .expect(200);

    await api()
      .post(`/api/events/${event.id}/result/approve`)
      .send({
        approved: true,
        reason: 'Planilla arbitral FIDE aprobada',
      })
      .expect(201);

    const standingsRes = await api()
      .get(`/api/championships/${champ.id}/standings`)
      .expect(200);

    expect(standingsRes.body.standings).toHaveLength(2);
    expect(standingsRes.body.standings[0].name).toBe('David López');
    expect(standingsRes.body.standings[0].points).toBe(1);
    expect(standingsRes.body.standings[1].name).toBe('Sebastián Mora');
    expect(standingsRes.body.standings[1].points).toBe(0);
  });
});
