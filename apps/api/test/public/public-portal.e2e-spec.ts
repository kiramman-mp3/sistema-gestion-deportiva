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

describe('portal público y documentos institucionales imprimibles', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof adminWith>>;
  let championshipId: string;
  let eventId: string;
  let reg1Id: string;
  let ep1Id: string;
  let ep2Id: string;

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

    const club1 = await createClub(prisma, 'Club Deportivo San Pedro');
    const club2 = await createClub(prisma, 'Club Social Quero Central');

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
    const category = await prisma.category.create({
      data: {
        code: 'senior',
        name: 'Senior',
        status: 'activo',
      },
    });

    // Crear deportistas y personas
    const person1 = await prisma.person.create({
      data: {
        firstName: 'Carlos',
        lastName: 'Morocho',
        birthDate: new Date('1998-05-12'),
      },
    });
    const athlete1 = await prisma.athlete.create({
      data: {
        personId: person1.id,
        clubId: club1.id,
        codeNumber: 101,
        eligibility: 'habilitado',
      },
    });

    const person2 = await prisma.person.create({
      data: {
        firstName: 'Luis',
        lastName: 'Gavilanes',
        birthDate: new Date('1999-08-20'),
      },
    });
    const athlete2 = await prisma.athlete.create({
      data: {
        personId: person2.id,
        clubId: club2.id,
        codeNumber: 102,
        eligibility: 'habilitado',
      },
    });

    // Crear equipos y teamSeasons
    const team1 = await prisma.team.create({
      data: {
        clubId: club1.id,
        sportId: sport.id,
        name: 'San Pedro FC',
        nameKey: 'san-pedro-fc',
      },
    });
    const teamSeason1 = await prisma.teamSeason.create({
      data: {
        teamId: team1.id,
        sportId: sport.id,
        seasonId: season.id,
        categoryId: category.id,
        name: 'San Pedro FC 2026',
        nameKey: 'san-pedro-fc-2026',
      },
    });
    await prisma.teamMembership.create({
      data: {
        teamSeasonId: teamSeason1.id,
        athleteId: athlete1.id,
        sportId: sport.id,
        seasonId: season.id,
        jerseyNumber: 10,
        createdById: admin.user.id,
      },
    });

    const team2 = await prisma.team.create({
      data: {
        clubId: club2.id,
        sportId: sport.id,
        name: 'Quero Central FC',
        nameKey: 'quero-central-fc',
      },
    });
    const teamSeason2 = await prisma.teamSeason.create({
      data: {
        teamId: team2.id,
        sportId: sport.id,
        seasonId: season.id,
        categoryId: category.id,
        name: 'Quero Central FC 2026',
        nameKey: 'quero-central-fc-2026',
      },
    });
    await prisma.teamMembership.create({
      data: {
        teamSeasonId: teamSeason2.id,
        athleteId: athlete2.id,
        sportId: sport.id,
        seasonId: season.id,
        jerseyNumber: 7,
        createdById: admin.user.id,
      },
    });

    // Campeonato en curso
    const champ = await prisma.championship.create({
      data: {
        seasonId: season.id,
        sportId: sport.id,
        categoryId: category.id,
        name: 'Campeonato Cantonal de Fútbol 2026',
        format: 'todos_contra_todos',
        status: 'en_curso',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-11-30'),
      },
    });
    championshipId = champ.id;

    // Campeonato en borrador (no debe aparecer públicamente)
    await prisma.championship.create({
      data: {
        seasonId: season.id,
        sportId: sport.id,
        categoryId: category.id,
        name: 'Torneo Privado en Borrador',
        format: 'eliminatoria_simple',
        status: 'borrador',
      },
    });

    // Participantes e inscripciones
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

    // Escenario
    const venue = await prisma.venue.create({
      data: {
        name: 'Estadio Central de Quero',
        address: 'Av. 12 de Noviembre y García Moreno',
      },
    });

    // Etapa, jornada y partido
    const stage = await prisma.stage.create({
      data: {
        championshipId: champ.id,
        name: 'Fase Regular',
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
        venueId: venue.id,
        scheduledAt: new Date('2026-06-15T15:00:00.000Z'),
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

    eventId = event.id;
    ep1Id = event.participants[0].id;
    ep2Id = event.participants[1].id;
  });

  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  test('lista y detalle público de campeonatos solo expone campeonatos activos', async () => {
    // Consulta anónima sin cookies de sesión
    const listRes = await t.http().get('/api/public/championships').expect(200);
    expect(listRes.body.total).toBe(1);
    expect(listRes.body.items[0].name).toBe(
      'Campeonato Cantonal de Fútbol 2026',
    );
    expect(listRes.body.items[0].status).toBe('en_curso');

    // Detalle público
    const detailRes = await t
      .http()
      .get(`/api/public/championships/${championshipId}`)
      .expect(200);
    expect(detailRes.body.name).toBe('Campeonato Cantonal de Fútbol 2026');
    expect(detailRes.body.sport.code).toBe('futbol');
    expect(detailRes.body.season.name).toBe('Temporada Oficial 2026');
  });

  test('calendario público oculta resultados en borrador y expone únicamente resultados aprobados', async () => {
    // Antes de tener resultado, el partido aparece programado y sin score
    const fixturesBefore = await t
      .http()
      .get(`/api/public/championships/${championshipId}/fixtures`)
      .expect(200);
    expect(fixturesBefore.body.length).toBe(1);
    const eventBefore = fixturesBefore.body[0].rounds[0].events[0];
    expect(eventBefore.status).toBe('programado');
    expect(eventBefore.result).toBeNull();
    expect(eventBefore.participants[0].score).toBeNull();

    // Guardar borrador de resultado (2 - 1)
    await api()
      .put(`/api/events/${eventId}/result`)
      .send({
        values: [
          { eventParticipantId: ep1Id, score: 2, outcome: 'victoria' },
          { eventParticipantId: ep2Id, score: 1, outcome: 'derrota' },
        ],
      })
      .expect(200);

    // Consulta pública: NO debe publicar el borrador
    const fixturesDraft = await t
      .http()
      .get(`/api/public/championships/${championshipId}/fixtures`)
      .expect(200);
    const eventDraft = fixturesDraft.body[0].rounds[0].events[0];
    expect(eventDraft.result).toBeNull();
    expect(eventDraft.participants[0].score).toBeNull();

    // Aprobar resultado oficial
    await api().post(`/api/events/${eventId}/result/submit`).expect(201);
    await api()
      .post(`/api/events/${eventId}/result/approve`)
      .send({
        approved: true,
        reason: 'Aprobado según acta física firmada por el árbitro',
      })
      .expect(201);

    // Ahora sí se publica en el calendario oficial
    const fixturesApproved = await t
      .http()
      .get(`/api/public/championships/${championshipId}/fixtures`)
      .expect(200);
    const eventApproved = fixturesApproved.body[0].rounds[0].events[0];
    expect(eventApproved.status).toBe('finalizado');
    expect(eventApproved.result).toBeDefined();
    expect(eventApproved.participants[0].score).toBe(2);
    expect(eventApproved.participants[1].score).toBe(1);
    expect(eventApproved.participants[0].outcome).toBe('victoria');
  });

  test('tabla de posiciones pública refleja clasificaciones oficiales calculadas', async () => {
    // Registrar y aprobar resultado
    await api()
      .put(`/api/events/${eventId}/result`)
      .send({
        values: [
          { eventParticipantId: ep1Id, score: 3, outcome: 'victoria' },
          { eventParticipantId: ep2Id, score: 0, outcome: 'derrota' },
        ],
      })
      .expect(200);
    await api().post(`/api/events/${eventId}/result/submit`).expect(201);
    await api()
      .post(`/api/events/${eventId}/result/approve`)
      .send({ approved: true, reason: 'Validación reglamentaria' })
      .expect(201);

    const standingsRes = await t
      .http()
      .get(`/api/public/championships/${championshipId}/standings`)
      .expect(200);

    expect(standingsRes.body.championship.name).toBe(
      'Campeonato Cantonal de Fútbol 2026',
    );
    expect(standingsRes.body.standings.length).toBe(2);
    expect(standingsRes.body.standings[0].name).toBe('San Pedro FC');
    expect(standingsRes.body.standings[0].points).toBe(3);
    expect(standingsRes.body.standings[0].won).toBe(1);
    expect(standingsRes.body.standings[1].name).toBe('Quero Central FC');
    expect(standingsRes.body.standings[1].points).toBe(0);
    expect(standingsRes.body.standings[1].lost).toBe(1);
  });

  test('acta oficial de encuentro imprimible genera membrete, plantillas y firmas', async () => {
    const scoresheetRes = await t
      .http()
      .get(`/api/public/events/${eventId}/scoresheet`)
      .expect(200);

    expect(scoresheetRes.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(scoresheetRes.headers['cache-control']).toBe('no-store');
    expect(scoresheetRes.body.documentMetadata.institution).toBe(
      'LIGA DEPORTIVA CANTONAL DE QUERO',
    );
    expect(scoresheetRes.body.championship.name).toBe(
      'Campeonato Cantonal de Fútbol 2026',
    );
    expect(scoresheetRes.body.venue).toBe('Estadio Central de Quero');
    expect(scoresheetRes.body.participants.length).toBe(2);

    // Verifica que la plantilla contiene número de camiseta y nombre, pero sin datos sensibles
    const localRoster = scoresheetRes.body.participants[0].roster;
    expect(localRoster.length).toBe(1);
    expect(localRoster[0].jerseyNumber).toBe(10);
    expect(localRoster[0].name).toBe('Carlos Morocho');
    expect(localRoster[0].code).toBe('DEP-000101');
    expect(localRoster[0].birthDate).toBeUndefined();

    // Casilleros de firmas reglamentarias
    expect(scoresheetRes.body.signatories.length).toBe(6);
    expect(scoresheetRes.body.signatories[0].label).toContain('Juez Central');
  });

  test('nómina institucional de buena fe genera documento con deportistas y avales', async () => {
    const rosterRes = await t
      .http()
      .get(`/api/public/registrations/${reg1Id}/roster`)
      .expect(200);

    expect(rosterRes.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(rosterRes.body.documentMetadata.title).toBe(
      'NÓMINA INSTITUCIONAL DE BUENA FE',
    );
    expect(rosterRes.body.participant.name).toBe('San Pedro FC');
    expect(rosterRes.body.participant.clubName).toBe(
      'Club Deportivo San Pedro',
    );
    expect(rosterRes.body.members.length).toBe(1);
    expect(rosterRes.body.members[0].jerseyNumber).toBe(10);
    expect(rosterRes.body.members[0].name).toBe('Carlos Morocho');
    expect(rosterRes.body.members[0].status).toBe('activo');

    // Firmas institucionales
    expect(rosterRes.body.signatories.length).toBe(3);
    expect(rosterRes.body.signatories[0].label).toContain(
      'Presidente del Club',
    );
    expect(rosterRes.body.signatories[1].label).toContain(
      'Presidente Liga Cantonal',
    );
  });
});
