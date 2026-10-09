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
  'venues:delete',
  'championships:read',
  'championships:manage',
  'championships:delete',
  'registrations:read',
  'registrations:manage',
  'clubs:access_all',
  'teams:manage',
  'athletes:manage',
];

describe('campeonatos, escenarios e inscripciones (ADR-001)', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof adminWith>>;
  let club: Awaited<ReturnType<typeof createClub>>;
  let seasonId: string;
  let footballSportId: string;
  let basketballSportId: string;
  let categoryId: string;

  const api = () => authed(t, admin.session);

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    admin = await adminWith(t, prisma, PERMISSIONS);
    club = await createClub(prisma, 'Club Deportivo Quero');

    const season = await prisma.season.create({
      data: {
        name: 'Temporada Oficial 2026',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        status: 'activa',
      },
    });
    seasonId = season.id;

    const fb = await prisma.sport.create({
      data: {
        code: 'futbol',
        name: 'Fútbol',
        status: 'activo',
      },
    });
    footballSportId = fb.id;

    const bb = await prisma.sport.create({
      data: {
        code: 'basquet',
        name: 'Básquet',
        status: 'activo',
      },
    });
    basketballSportId = bb.id;

    const cat = await prisma.category.create({
      data: {
        code: 'juvenil',
        name: 'Juvenil Sub-18',
        ageMin: 14,
        ageMax: 18,
        status: 'activo',
      },
    });
    categoryId = cat.id;
  });

  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  describe('escenarios deportivos (venues)', () => {
    it('crea, lista, modifica y elimina un escenario deportivo', async () => {
      const resCreate = await api()
        .post('/api/venues')
        .send({
          name: 'Estadio Cantonal Quero',
          address: 'Av. 12 de Noviembre y García Moreno',
          capacity: 3500,
        })
        .expect(201);

      expect(resCreate.body).toMatchObject({
        name: 'Estadio Cantonal Quero',
        capacity: 3500,
        status: 'activo',
      });
      const venueId = resCreate.body.id;

      // Unicidad de nombre
      await api()
        .post('/api/venues')
        .send({ name: 'estadio cantonal quero' })
        .expect(409);

      // Listado
      const resList = await api().get('/api/venues?q=Quero').expect(200);
      expect(resList.body.items).toHaveLength(1);
      expect(resList.body.items[0].id).toBe(venueId);

      // Modificación
      const resUpdate = await api()
        .patch(`/api/venues/${venueId}`)
        .send({ capacity: 4000 })
        .expect(200);
      expect(resUpdate.body.capacity).toBe(4000);

      // Eliminación
      await api().delete(`/api/venues/${venueId}`).expect(204);
      await api().get(`/api/venues/${venueId}`).expect(404);

      // Verifica auditoría
      const audit = await prisma.auditLog.findMany({
        where: { entityType: 'venue', entityId: venueId },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit.map((a) => a.action)).toEqual([
        'venue.created',
        'venue.updated',
        'venue.deleted',
      ]);
    });
  });

  describe('campeonatos y reglamentos versionados', () => {
    it('crea campeonato con versión 1 de reglas y transiciona su estado con motivo', async () => {
      const resCreate = await api()
        .post('/api/championships')
        .send({
          seasonId,
          sportId: footballSportId,
          categoryId,
          name: 'Campeonato Apertura Fútbol Juvenil',
          format: 'todos_contra_todos',
          startDate: '2026-03-01',
          endDate: '2026-06-30',
        })
        .expect(201);

      const champId = resCreate.body.id;
      expect(resCreate.body.status).toBe('borrador');
      expect(resCreate.body.ruleVersions).toHaveLength(1);
      expect(resCreate.body.ruleVersions[0].version).toBe(1);

      // Detalle
      const resGet = await api()
        .get(`/api/championships/${champId}`)
        .expect(200);
      expect(resGet.body.name).toBe('Campeonato Apertura Fútbol Juvenil');
      expect(resGet.body.ruleVersions[0].rulesJson).toMatchObject({
        pointsWin: 3,
        pointsDraw: 1,
        pointsLoss: 0,
      });

      // Crear nueva versión de reglamento
      const resRule = await api()
        .post(`/api/championships/${champId}/rules`)
        .send({
          rules: {
            pointsWin: 3,
            pointsDraw: 1,
            pointsLoss: 0,
            bonusPenaltyWin: 1,
          },
        })
        .expect(201);
      expect(resRule.body.version).toBe(2);

      // Transición de estado con motivo
      const resTrans = await api()
        .patch(`/api/championships/${champId}/status`)
        .send({
          status: 'inscripciones_abiertas',
          reason: 'Aprobación del congresillo técnico de la Liga',
        })
        .expect(200);
      expect(resTrans.body.status).toBe('inscripciones_abiertas');

      // Auditoría registrada
      const audit = await prisma.auditLog.findMany({
        where: { entityType: 'championship', entityId: champId },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit.map((a) => a.action)).toEqual([
        'championship.created',
        'championship.rules_version_created',
        'championship.status_changed',
      ]);
    });
  });

  describe('inscripciones de participantes (ADR-001)', () => {
    it('inscribe un equipo y un deportista individual en el campeonato respetando reglas', async () => {
      const champ = await prisma.championship.create({
        data: {
          seasonId,
          sportId: footballSportId,
          categoryId,
          name: 'Torneo Piloto Fútbol',
          format: 'todos_contra_todos',
          status: 'inscripciones_abiertas',
        },
      });

      // Creamos equipo de fútbol
      const team = await prisma.team.create({
        data: {
          clubId: club.id,
          sportId: footballSportId,
          name: 'Los Leones FC',
          nameKey: 'los leones fc',
        },
      });

      // Inscribir equipo en campeonato
      const resTeamReg = await api()
        .post(`/api/championships/${champ.id}/registrations`)
        .send({
          kind: 'equipo',
          teamId: team.id,
          notes: 'Uniforme titular verde y blanco',
        })
        .expect(201);

      expect(resTeamReg.body.status).toBe('pendiente');
      expect(resTeamReg.body.participant.kind).toBe('equipo');

      // Validar creación de ADR-001 Participant y TeamParticipant
      const teamPart = await prisma.teamParticipant.findUnique({
        where: { teamId: team.id },
      });
      expect(teamPart).not.toBeNull();
      expect(teamPart?.kind).toBe('equipo');

      // Intentar inscribir equipo de otro deporte en este campeonato
      const basketTeam = await prisma.team.create({
        data: {
          clubId: club.id,
          sportId: basketballSportId,
          name: 'Quero Basketball Club',
          nameKey: 'quero basketball club',
        },
      });

      await api()
        .post(`/api/championships/${champ.id}/registrations`)
        .send({
          kind: 'equipo',
          teamId: basketTeam.id,
        })
        .expect(400);

      // Intentar duplicar la inscripción del mismo equipo
      await api()
        .post(`/api/championships/${champ.id}/registrations`)
        .send({
          kind: 'equipo',
          teamId: team.id,
        })
        .expect(409);

      // Inscribir deportista individual
      const personOk = await prisma.person.create({
        data: {
          firstName: 'Mateo',
          lastName: 'Pérez',
          birthDate: new Date('2010-06-10'), // 15 años en 2026 -> dentro de 14-18
        },
      });
      const athleteOk = await prisma.athlete.create({
        data: {
          personId: personOk.id,
          clubId: club.id,
          eligibility: 'habilitado',
        },
      });

      const resAthReg = await api()
        .post(`/api/championships/${champ.id}/registrations`)
        .send({
          kind: 'individual',
          athleteId: athleteOk.id,
        })
        .expect(201);
      expect(resAthReg.body.status).toBe('pendiente');

      // Deportista que no cumple la edad de la categoría (p. ej. 25 años)
      const personOld = await prisma.person.create({
        data: {
          firstName: 'Juan',
          lastName: 'Adulto',
          birthDate: new Date('2000-01-01'), // 26 años -> mayor a 18
        },
      });
      const athleteOld = await prisma.athlete.create({
        data: {
          personId: personOld.id,
          clubId: club.id,
          eligibility: 'habilitado',
        },
      });

      await api()
        .post(`/api/championships/${champ.id}/registrations`)
        .send({
          kind: 'individual',
          athleteId: athleteOld.id,
        })
        .expect(400);

      // Revisión y aprobación de la inscripción
      const regId = resTeamReg.body.id;
      const resReview = await api()
        .patch(`/api/championships/${champ.id}/registrations/${regId}/status`)
        .send({
          status: 'aprobada',
          reviewNotes: 'Documentación y nómina completa',
        })
        .expect(200);
      expect(resReview.body.status).toBe('aprobada');
      expect(resReview.body.reviewedById).toBe(admin.user.id);

      // Auditoría de inscripción
      const audit = await prisma.auditLog.findMany({
        where: { entityType: 'registration', entityId: regId },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit.map((a) => a.action)).toEqual([
        'registration.created',
        'registration.status_changed',
      ]);
    });
  });
});
