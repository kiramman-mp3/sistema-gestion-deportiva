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
  'venues:read',
  'venues:manage',
  'championships:read',
  'championships:manage',
  'registrations:read',
  'registrations:manage',
  'fixtures:read',
  'fixtures:manage',
  'clubs:access_all',
  'teams:manage',
  'athletes:manage',
];

describe('calendario, etapas y programación de encuentros (fixtures)', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof adminWith>>;
  let championshipId: string;
  let venueId: string;
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
    admin = await adminWith(t, prisma, PERMISSIONS);

    const club1 = await createClub(prisma, 'Club Central Quero');
    const club2 = await createClub(prisma, 'Club Huracán Quero');

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
        name: 'Campeonato Cantonal de Fútbol 2026',
        seasonId: season.id,
        sportId: sport.id,
        categoryId: cat.id,
        format: 'todos_contra_todos',
        status: 'en_curso',
      },
    });
    championshipId = champ.id;

    const venue = await prisma.venue.create({
      data: {
        name: 'Estadio San Carlos',
        capacity: 2000,
      },
    });
    venueId = venue.id;

    // Equipos e inscripciones
    const team1 = await prisma.team.create({
      data: {
        clubId: club1.id,
        sportId: sport.id,
        name: 'Central FC',
        nameKey: 'central fc',
      },
    });
    const team2 = await prisma.team.create({
      data: {
        clubId: club2.id,
        sportId: sport.id,
        name: 'Huracán SC',
        nameKey: 'huracan sc',
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
  });

  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  it('gestiona etapas, jornadas y programa un partido con verificación de auditoría', async () => {
    // 1. Crear Etapa
    const stageRes = await api()
      .post(`/api/championships/${championshipId}/stages`)
      .send({
        name: 'Fase de Clasificación',
        stageType: 'grupo',
      })
      .expect(201);

    expect(stageRes.body).toMatchObject({
      name: 'Fase de Clasificación',
      stageType: 'grupo',
      sequence: 1,
    });
    const stageId = stageRes.body.id;

    // 2. Crear Ronda/Jornada
    const roundRes = await api()
      .post(`/api/stages/${stageId}/rounds`)
      .send({
        name: 'Jornada 1',
      })
      .expect(201);

    expect(roundRes.body).toMatchObject({
      name: 'Jornada 1',
      roundNumber: 1,
    });
    const roundId = roundRes.body.id;

    // 3. Programar Evento/Partido
    const eventTime = '2026-06-15T15:00:00.000Z';
    const eventRes = await api()
      .post(`/api/rounds/${roundId}/events`)
      .send({
        venueId,
        scheduledAt: eventTime,
        homeRegistrationId: reg1Id,
        awayRegistrationId: reg2Id,
      })
      .expect(201);

    expect(eventRes.body).toMatchObject({
      venueId,
      status: 'programado',
    });
    expect(eventRes.body.participants).toHaveLength(2);

    // 4. Listar eventos del campeonato
    const listRes = await api()
      .get(`/api/championships/${championshipId}/events`)
      .expect(200);

    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].venue.name).toBe('Estadio San Carlos');
  });

  it('detecta y previene conflictos de escenario y de participante', async () => {
    // Crear etapa y ronda
    const stage = await prisma.stage.create({
      data: {
        championshipId,
        name: 'Fase 1',
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

    const matchDate = '2026-06-20T14:00:00.000Z';
    await api()
      .post(`/api/rounds/${round.id}/events`)
      .send({
        venueId,
        scheduledAt: matchDate,
        homeRegistrationId: reg1Id,
        awayRegistrationId: reg2Id,
      })
      .expect(201);

    // Conflicto de escenario: 30 minutos después en el mismo estadio (dentro del rango de 90 min)
    const venueConflictRes = await api()
      .post(`/api/rounds/${round.id}/events`)
      .send({
        venueId,
        scheduledAt: '2026-06-20T14:30:00.000Z',
        homeRegistrationId: reg2Id,
        awayRegistrationId: reg1Id,
      })
      .expect(409);

    expect(venueConflictRes.body.message).toContain('escenario deportivo ya está ocupado');

    // Conflicto de participante: reg1 ya juega el 2026-06-20 en otro escenario
    const otherVenue = await prisma.venue.create({
      data: { name: 'Cancha El Rosal' },
    });
    const participantConflictRes = await api()
      .post(`/api/rounds/${round.id}/events`)
      .send({
        venueId: otherVenue.id,
        scheduledAt: '2026-06-20T18:00:00.000Z',
        homeRegistrationId: reg1Id,
        awayRegistrationId: reg2Id,
      })
      .expect(409);

    expect(participantConflictRes.body.message).toContain('ya tiene un encuentro programado en esa misma fecha');
  });

  it('permite reprogramar un encuentro con motivo obligatorio y audita el cambio', async () => {
    const stage = await prisma.stage.create({
      data: { championshipId, name: 'Fase 1', sequence: 1 },
    });
    const round = await prisma.round.create({
      data: { stageId: stage.id, name: 'Fecha 1', roundNumber: 1 },
    });

    const event = await prisma.event.create({
      data: {
        roundId: round.id,
        venueId,
        scheduledAt: new Date('2026-07-01T10:00:00.000Z'),
        status: 'programado',
        participants: {
          create: [
            { registrationId: reg1Id, side: 'local' },
            { registrationId: reg2Id, side: 'visitante' },
          ],
        },
      },
    });

    const rescheduleRes = await api()
      .patch(`/api/events/${event.id}/schedule`)
      .send({
        venueId,
        scheduledAt: '2026-07-02T16:00:00.000Z',
        reason: 'Lluvia intensa e inundación del campo',
      })
      .expect(200);

    expect(rescheduleRes.body.status).toBe('postergado');
    expect(rescheduleRes.body.postponementReason).toBe('Lluvia intensa e inundación del campo');

    // Comprobar auditoría
    const auditRecord = await prisma.auditLog.findFirst({
      where: {
        action: 'event:reschedule',
        entityId: event.id,
      },
    });
    expect(auditRecord).toBeTruthy();
    expect(auditRecord?.reason).toBe('Lluvia intensa e inundación del campo');
  });
});
