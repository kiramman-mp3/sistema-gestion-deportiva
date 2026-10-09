import request from 'supertest';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, dbFailure, resetDatabase } from '../support/db.js';
import {
  adminWith,
  authed,
  createAthlete,
  createCategory,
  createClub,
  createSeason,
  createSport,
  leaderWith,
  seedCatalog,
} from '../support/fixtures.js';

const LEAGUE = [
  'teams:read',
  'teams:manage',
  'teams:delete',
  'athletes:read',
  'athletes:transfer',
  'clubs:access_all',
];
const LEADER = ['teams:read', 'teams:manage', 'athletes:read'];

describe('equipos y plantillas', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let league: Awaited<ReturnType<typeof adminWith>>;
  let club: Awaited<ReturnType<typeof createClub>>;
  let football: Awaited<ReturnType<typeof createSport>>;
  let basketball: Awaited<ReturnType<typeof createSport>>;
  let infantil: Awaited<ReturnType<typeof createCategory>>; // 10 a 14 años
  let libre: Awaited<ReturnType<typeof createCategory>>; // sin límites
  let s2026: Awaited<ReturnType<typeof createSeason>>;
  const api = () => authed(t, league.session);

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    league = await adminWith(t, prisma, LEAGUE);
    club = await createClub(prisma, 'Club Uno');
    football = await createSport(prisma, 'Fútbol');
    basketball = await createSport(prisma, 'Baloncesto');
    infantil = await createCategory(prisma, 'Infantil', 10, 14);
    libre = await createCategory(prisma, 'Libre');
    s2026 = await createSeason(prisma, 'Temporada 2026');
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  const mkTeam = async (
    name: string,
    sportId = football.id,
    clubId = club.id,
    a = api(),
  ) =>
    (await a.post('/api/teams').send({ clubId, sportId, name }).expect(201))
      .body.id as string;
  const enroll = (
    teamId: string,
    over: Record<string, unknown> = {},
    a = api(),
  ) =>
    a
      .post(`/api/teams/${teamId}/seasons`)
      .send({ seasonId: s2026.id, categoryId: libre.id, ...over });
  const mkEnrolled = async (
    name: string,
    over: {
      sportId?: string;
      clubId?: string;
      categoryId?: string;
      seasonId?: string;
    } = {},
  ) => {
    const teamId = await mkTeam(name, over.sportId, over.clubId);
    await enroll(teamId, {
      ...(over.categoryId && { categoryId: over.categoryId }),
      ...(over.seasonId && { seasonId: over.seasonId }),
    }).expect(201);
    return teamId;
  };
  const rosterUrl = (teamId: string, seasonId = s2026.id) =>
    `/api/teams/${teamId}/seasons/${seasonId}/roster`;
  const add = (
    teamId: string,
    athleteId: string,
    over: Record<string, unknown> = {},
    seasonId = s2026.id,
    a = api(),
  ) => a.post(rosterUrl(teamId, seasonId)).send({ athleteId, ...over });
  const audits = (action: string) =>
    prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });

  describe('equipos', () => {
    it('crea un equipo y rechaza nombres repetidos del mismo club y deporte (aunque cambien tildes o mayúsculas)', async () => {
      const id = await mkTeam('  Águilas   Doradas ');
      const res = await api().get(`/api/teams/${id}`).expect(200);
      expect(res.body).toMatchObject({
        name: 'Águilas Doradas',
        status: 'activo',
        club: { id: club.id },
        sport: { id: football.id },
        seasons: [],
      });
      for (const name of ['aguilas doradas', 'ÁGUILAS-DORADAS!']) {
        await api()
          .post('/api/teams')
          .send({ clubId: club.id, sportId: football.id, name })
          .expect(409);
      }
      // otro deporte u otro club: permitido
      await mkTeam('Águilas Doradas', basketball.id);
      const other = await createClub(prisma, 'Club Dos');
      await mkTeam('Águilas Doradas', football.id, other.id);
      expect(await prisma.team.count()).toBe(3);
      expect((await audits('team.create')).length).toBe(3);
    });

    it('no crea equipos en clubes inactivos ni en deportes inactivos o inexistentes', async () => {
      const closed = await createClub(prisma, 'Club Cerrado', 'inactivo');
      await api()
        .post('/api/teams')
        .send({ clubId: closed.id, sportId: football.id, name: 'X' })
        .expect(409);
      await prisma.sport.update({
        where: { id: basketball.id },
        data: { status: 'inactivo' },
      });
      await api()
        .post('/api/teams')
        .send({ clubId: club.id, sportId: basketball.id, name: 'X' })
        .expect(409);
      await api()
        .post('/api/teams')
        .send({
          clubId: club.id,
          sportId: '00000000-0000-7000-8000-000000000000',
          name: 'X',
        })
        .expect(404);
    });

    it('rechaza campos desconocidos y no permite cambiar el club ni el deporte', async () => {
      const id = await mkTeam('Uno');
      await api()
        .patch(`/api/teams/${id}`)
        .send({ clubId: club.id })
        .expect(400);
      await api()
        .patch(`/api/teams/${id}`)
        .send({ sportId: basketball.id })
        .expect(400);
      await api().patch(`/api/teams/${id}`).send({}).expect(400);
    });

    it('un equipo con temporadas no se elimina; sin ellas, sí (con permiso de eliminación)', async () => {
      const used = await mkEnrolled('Con historial');
      const free = await mkTeam('Sin historial');
      await api().delete(`/api/teams/${used}`).expect(409);
      const leader = await leaderWith(t, prisma, LEADER, [club.id]);
      await authed(t, leader.session).delete(`/api/teams/${free}`).expect(403);
      await api().delete(`/api/teams/${free}`).expect(204);
      expect(await prisma.team.findUnique({ where: { id: free } })).toBeNull();
      expect((await audits('team.delete')).length).toBe(1);
    });
  });

  describe('nombre y categoría por temporada', () => {
    it('un equipo puede llamarse distinto en cada temporada y conserva el historial', async () => {
      const s2027 = await createSeason(
        prisma,
        'Temporada 2027',
        'borrador',
        '2027-01-01',
        '2027-12-31',
      );
      const id = await mkTeam('Halcones');
      await enroll(id).expect(201);
      await enroll(id, { seasonId: s2027.id, name: 'Halcones del Sur' }).expect(
        201,
      );

      const res = await api().get(`/api/teams/${id}`).expect(200);
      expect(
        res.body.seasons.map(
          (s: { season: { name: string }; name: string }) => [
            s.season.name,
            s.name,
          ],
        ),
      ).toEqual([
        ['Temporada 2027', 'Halcones del Sur'],
        ['Temporada 2026', 'Halcones'],
      ]);
      // renombrar una temporada no toca las demás
      await api()
        .patch(`/api/teams/${id}/seasons/${s2027.id}`)
        .send({ name: 'Halcones FC' })
        .expect(200);
      const first = await api().get(`/api/teams/${id}/seasons`).expect(200);
      expect(first.body.map((s: { name: string }) => s.name)).toEqual([
        'Halcones FC',
        'Halcones',
      ]);
    });

    it('no admite dos equipos del mismo deporte con el mismo nombre en una temporada, ni inscribir dos veces', async () => {
      const other = await createClub(prisma, 'Club Dos');
      const a = await mkTeam('Rayos', football.id, club.id);
      const b = await mkTeam('Rayos', football.id, other.id);
      await enroll(a).expect(201);
      await enroll(b).expect(409);
      await enroll(b, { name: 'Rayos B' }).expect(201);
      await enroll(a).expect(409);
      // en otro deporte el nombre puede repetirse
      const bk = await mkTeam('Rayos', basketball.id, club.id);
      await enroll(bk).expect(201);
    });

    it('las temporadas finalizadas o archivadas y las categorías inactivas no admiten inscripciones', async () => {
      const done = await createSeason(
        prisma,
        'Temporada 2025',
        'finalizada',
        '2025-01-01',
        '2025-12-31',
      );
      const id = await mkTeam('Equipo');
      await enroll(id, { seasonId: done.id }).expect(409);
      await prisma.category.update({
        where: { id: libre.id },
        data: { status: 'inactivo' },
      });
      await enroll(id).expect(409);
      await enroll(id, {
        categoryId: '00000000-0000-7000-8000-000000000000',
      }).expect(404);
      await enroll(id, {
        seasonId: '00000000-0000-7000-8000-000000000000',
      }).expect(404);
    });

    it('cambiar de categoría exige que la plantilla vigente cumpla la nueva edad', async () => {
      const juvenil = await createCategory(prisma, 'Juvenil', 15, 18);
      const id = await mkEnrolled('Equipo', { categoryId: infantil.id });
      const kid = await createAthlete(prisma, club.id, {
        birthDate: '2014-03-01',
      }); // 11 años
      await add(id, kid.id).expect(201);
      const res = await api()
        .patch(`/api/teams/${id}/seasons/${s2026.id}`)
        .send({ categoryId: juvenil.id })
        .expect(409);
      expect(res.body.message).toContain('1 jugador');
      await api()
        .patch(`/api/teams/${id}/seasons/${s2026.id}`)
        .send({ categoryId: libre.id })
        .expect(200);
    });

    it('retirar una inscripción con plantilla no es posible; sin plantilla, sí', async () => {
      const id = await mkEnrolled('Equipo');
      const player = await createAthlete(prisma, club.id);
      const m = await add(id, player.id).expect(201);
      await api().delete(`/api/teams/${id}/seasons/${s2026.id}`).expect(409);
      await api()
        .delete(`${rosterUrl(id)}/${m.body.id}`)
        .send({ reason: 'alta por error' })
        .expect(204);
      await api().delete(`/api/teams/${id}/seasons/${s2026.id}`).expect(204);
    });
  });

  describe('plantilla: un equipo por deporte y temporada', () => {
    it('inscribe a un deportista habilitado y muestra solo datos básicos', async () => {
      const id = await mkEnrolled('Equipo');
      const player = await createAthlete(prisma, club.id);
      const res = await add(id, player.id, { jerseyNumber: 10 }).expect(201);
      expect(res.body).toMatchObject({
        status: 'activo',
        jerseyNumber: 10,
        athlete: { id: player.id, code: expect.stringMatching(/^DEP-\d{6}$/) },
      });
      const list = await api().get(rosterUrl(id)).expect(200);
      expect(list.body).toHaveLength(1);
      const text = JSON.stringify(list.body);
      expect(text).not.toMatch(/birth|idNumber|phone|guardian/i);
    });

    it('un deportista no puede estar en dos equipos del mismo deporte en la misma temporada', async () => {
      const a = await mkEnrolled('Equipo A');
      const b = await mkEnrolled('Equipo B');
      const player = await createAthlete(prisma, club.id);
      await add(a, player.id).expect(201);
      const res = await add(b, player.id).expect(409);
      expect(res.body.message).toContain('Equipo A');
      await add(a, player.id).expect(409);
      expect(await prisma.teamMembership.count()).toBe(1);
    });

    it('sí puede estar en equipos de deportes distintos', async () => {
      const f = await mkEnrolled('Fútbol A', { sportId: football.id });
      const b = await mkEnrolled('Basket A', { sportId: basketball.id });
      const player = await createAthlete(prisma, club.id);
      await add(f, player.id).expect(201);
      await add(b, player.id).expect(201);
      const teams = await api()
        .get(`/api/athletes/${player.id}/teams`)
        .expect(200);
      expect(
        teams.body.map((x: { sport: { name: string } }) => x.sport.name).sort(),
      ).toEqual(['Baloncesto', 'Fútbol']);
    });

    it('en otra temporada puede inscribirse en otro equipo del mismo deporte', async () => {
      const s2027 = await createSeason(
        prisma,
        'Temporada 2027',
        'borrador',
        '2027-01-01',
        '2027-12-31',
      );
      const a = await mkEnrolled('Equipo A');
      const b = await mkEnrolled('Equipo B', { seasonId: s2027.id });
      const player = await createAthlete(prisma, club.id);
      await add(a, player.id).expect(201);
      await add(b, player.id, {}, s2027.id).expect(201);
    });

    it('solo dos altas simultáneas del mismo deportista en equipos del mismo deporte: gana una', async () => {
      const a = await mkEnrolled('Equipo A');
      const b = await mkEnrolled('Equipo B');
      const c = await mkEnrolled('Equipo C');
      const player = await createAthlete(prisma, club.id);
      const results = await Promise.all([
        add(a, player.id),
        add(b, player.id),
        add(c, player.id),
        add(a, player.id),
      ]);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(3);
      expect(await prisma.teamMembership.count()).toBe(1);
    });

    it('una baja NO libera el cupo; solo la anulación (permiso de eliminación) lo hace', async () => {
      const a = await mkEnrolled('Equipo A');
      const b = await mkEnrolled('Equipo B');
      const player = await createAthlete(prisma, club.id);
      const m = await add(a, player.id, { jerseyNumber: 7 }).expect(201);

      const left = await api()
        .post(`${rosterUrl(a)}/${m.body.id}/leave`)
        .send({ reason: 'cambio de ciudad' })
        .expect(201);
      expect(left.body).toMatchObject({ status: 'baja', jerseyNumber: null });
      await api()
        .post(`${rosterUrl(a)}/${m.body.id}/leave`)
        .send({ reason: 'otra vez' })
        .expect(409);
      const blocked = await add(b, player.id).expect(409);
      expect(blocked.body.message).toContain('baja');

      const leader = await leaderWith(t, prisma, LEADER, [club.id]);
      await authed(t, leader.session)
        .delete(`${rosterUrl(a)}/${m.body.id}`)
        .send({ reason: 'excepción autorizada' })
        .expect(403);
      await api()
        .delete(`${rosterUrl(a)}/${m.body.id}`)
        .send({})
        .expect(400);
      await api()
        .delete(`${rosterUrl(a)}/${m.body.id}`)
        .send({ reason: 'excepción autorizada por la Liga' })
        .expect(204);
      await add(b, player.id).expect(201);
      const [log] = await audits('team.roster_annul');
      expect(log).toMatchObject({ reason: 'excepción autorizada por la Liga' });
    });

    it('exige deportista habilitado, activo, del mismo club y con plantilla abierta', async () => {
      const id = await mkEnrolled('Equipo');
      const other = await createClub(prisma, 'Club Dos');
      await add(
        id,
        (await createAthlete(prisma, club.id, { eligibility: 'pendiente' })).id,
      ).expect(409);
      await add(
        id,
        (await createAthlete(prisma, club.id, { eligibility: 'inhabilitado' }))
          .id,
      ).expect(409);
      await add(
        id,
        (await createAthlete(prisma, club.id, { status: 'inactivo' })).id,
      ).expect(409);
      await add(id, (await createAthlete(prisma, other.id)).id).expect(404);
      await add(id, '00000000-0000-7000-8000-000000000000').expect(404);

      await api()
        .patch(`/api/teams/${id}/seasons/${s2026.id}`)
        .send({ rosterClosed: true })
        .expect(200);
      await add(id, (await createAthlete(prisma, club.id)).id).expect(409);
      await api()
        .patch(`/api/teams/${id}/seasons/${s2026.id}`)
        .send({ rosterClosed: false })
        .expect(200);
      await add(id, (await createAthlete(prisma, club.id)).id).expect(201);
    });

    it('un equipo inactivo no recibe jugadores', async () => {
      const id = await mkEnrolled('Equipo');
      await api()
        .patch(`/api/teams/${id}`)
        .send({ status: 'inactivo' })
        .expect(200);
      await add(id, (await createAthlete(prisma, club.id)).id).expect(409);
    });

    it('valida la edad de la categoría a la fecha de inicio de la temporada', async () => {
      const id = await mkEnrolled('Infantil A', { categoryId: infantil.id });
      // temporada inicia 2026-01-01: nacido 2012-01-01 → 14; 2011-12-31 → 14; 2011-01-02 → 14; 2011-01-01 → 15
      const inRange = await createAthlete(prisma, club.id, {
        birthDate: '2012-01-01',
      });
      const edge = await createAthlete(prisma, club.id, {
        birthDate: '2011-01-02',
      });
      const tooOld = await createAthlete(prisma, club.id, {
        birthDate: '2011-01-01',
      });
      const tooYoung = await createAthlete(prisma, club.id, {
        birthDate: '2016-06-01',
      });
      const noBirth = await createAthlete(prisma, club.id, { birthDate: null });
      await add(id, inRange.id).expect(201);
      await add(id, edge.id).expect(201);
      const old = await add(id, tooOld.id).expect(409);
      expect(old.body.message).toContain('10 a 14 años');
      await add(id, tooYoung.id).expect(409);
      const nb = await add(id, noBirth.id).expect(409);
      expect(nb.body.message).toContain('fecha de nacimiento');
      expect(await prisma.teamMembership.count()).toBe(2);
    });

    it('una categoría sin límites de edad no exige fecha de nacimiento', async () => {
      const id = await mkEnrolled('Libre A');
      await add(
        id,
        (await createAthlete(prisma, club.id, { birthDate: null })).id,
      ).expect(201);
    });

    it('el número de camiseta no se repite entre jugadores vigentes y se libera con la baja', async () => {
      const id = await mkEnrolled('Equipo');
      const [p1, p2, p3] = await Promise.all([
        createAthlete(prisma, club.id),
        createAthlete(prisma, club.id),
        createAthlete(prisma, club.id),
      ]);
      const m1 = await add(id, p1.id, { jerseyNumber: 9 }).expect(201);
      await add(id, p2.id, { jerseyNumber: 9 }).expect(409);
      const m2 = await add(id, p2.id, { jerseyNumber: 8 }).expect(201);
      await api()
        .patch(`${rosterUrl(id)}/${m2.body.id}`)
        .send({ jerseyNumber: 9 })
        .expect(409);
      await add(id, p3.id, { jerseyNumber: 1000 }).expect(400);
      await api()
        .post(`${rosterUrl(id)}/${m1.body.id}/leave`)
        .send({ reason: 'lesión grave' })
        .expect(201);
      await api()
        .patch(`${rosterUrl(id)}/${m2.body.id}`)
        .send({ jerseyNumber: 9 })
        .expect(200);
    });

    it('en una temporada finalizada la plantilla es solo de consulta', async () => {
      const id = await mkEnrolled('Equipo');
      const player = await createAthlete(prisma, club.id);
      const m = await add(id, player.id).expect(201);
      await prisma.season.update({
        where: { id: s2026.id },
        data: { status: 'finalizada' },
      });
      await add(id, (await createAthlete(prisma, club.id)).id).expect(409);
      await api()
        .post(`${rosterUrl(id)}/${m.body.id}/leave`)
        .send({ reason: 'fuera de plazo' })
        .expect(409);
      await api()
        .delete(`${rosterUrl(id)}/${m.body.id}`)
        .send({ reason: 'fuera de plazo' })
        .expect(409);
      await api().get(rosterUrl(id)).expect(200);
    });
  });

  describe('garantías de la base de datos', () => {
    it('la restricción única impide dos altas del mismo deportista, deporte y temporada', async () => {
      const a = await mkEnrolled('Equipo A');
      const b = await mkEnrolled('Equipo B');
      const player = await createAthlete(prisma, club.id);
      const tsA = await prisma.teamSeason.findFirstOrThrow({
        where: { teamId: a },
      });
      const tsB = await prisma.teamSeason.findFirstOrThrow({
        where: { teamId: b },
      });
      const base = {
        athleteId: player.id,
        sportId: football.id,
        seasonId: s2026.id,
        createdById: league.user.id,
      };
      await prisma.teamMembership.create({
        data: { ...base, teamSeasonId: tsA.id },
      });
      const failure = await dbFailure(
        prisma.teamMembership.create({
          data: { ...base, teamSeasonId: tsB.id },
        }),
      );
      expect(failure.sqlState).toBe('23505');
      expect(failure.message).toContain(
        'team_memberships_athlete_id_sport_id_season_id_key',
      );
    });

    it('el deporte y la temporada de una alta deben coincidir con los de su inscripción', async () => {
      const a = await mkEnrolled('Equipo A');
      const player = await createAthlete(prisma, club.id);
      const ts = await prisma.teamSeason.findFirstOrThrow({
        where: { teamId: a },
      });
      const failure = await dbFailure(
        prisma.teamMembership.create({
          data: {
            teamSeasonId: ts.id,
            athleteId: player.id,
            sportId: basketball.id, // distinto del deporte del equipo
            seasonId: s2026.id,
            createdById: league.user.id,
          },
        }),
      );
      expect(failure.sqlState).toBe('23503');
    });

    it('una baja sin fecha ni motivo, o un alta vigente con motivo, violan los CHECK', async () => {
      const a = await mkEnrolled('Equipo A');
      const player = await createAthlete(prisma, club.id);
      const ts = await prisma.teamSeason.findFirstOrThrow({
        where: { teamId: a },
      });
      const base = {
        teamSeasonId: ts.id,
        athleteId: player.id,
        sportId: football.id,
        seasonId: s2026.id,
        createdById: league.user.id,
      };
      expect(
        (
          await dbFailure(
            prisma.teamMembership.create({ data: { ...base, status: 'baja' } }),
          )
        ).sqlState,
      ).toBe('23514');
      expect(
        (
          await dbFailure(
            prisma.teamMembership.create({
              data: { ...base, leaveReason: 'x' },
            }),
          )
        ).sqlState,
      ).toBe('23514');
      expect(
        (
          await dbFailure(
            prisma.teamMembership.create({
              data: { ...base, jerseyNumber: -1 },
            }),
          )
        ).sqlState,
      ).toBe('23514');
    });
  });

  describe('transferencia de club', () => {
    it('solo se habilita cuando no hay inscripciones en una temporada vigente', async () => {
      const other = await createClub(prisma, 'Club Dos');
      const id = await mkEnrolled('Equipo');
      const player = await createAthlete(prisma, club.id);
      await add(id, player.id).expect(201);

      const transfer = (reason = 'cambio de domicilio') =>
        api()
          .post(`/api/athletes/${player.id}/transfer`)
          .send({ clubId: other.id, reason });
      await transfer().expect(409);
      expect(
        (await prisma.athlete.findUniqueOrThrow({ where: { id: player.id } }))
          .clubId,
      ).toBe(club.id);

      await prisma.season.update({
        where: { id: s2026.id },
        data: { status: 'finalizada' },
      });
      const res = await transfer().expect(201);
      expect(res.body).toMatchObject({
        club: { id: other.id },
        eligibility: 'pendiente',
      });
      const [log] = await audits('athlete.transfer');
      expect(log).toMatchObject({
        reason: 'cambio de domicilio',
        beforeSnapshot: { clubId: club.id, eligibility: 'habilitado' },
        afterSnapshot: { clubId: other.id, eligibility: 'pendiente' },
      });
      // el historial queda con el equipo anterior
      const history = await api()
        .get(`/api/athletes/${player.id}/teams`)
        .expect(200);
      expect(history.body).toHaveLength(1);
      // y ya no puede inscribirse en equipos del club anterior
      await add(id, player.id).expect(409); // plantilla de temporada finalizada
    });

    it('una baja tampoco habilita el cambio dentro de la misma temporada', async () => {
      const other = await createClub(prisma, 'Club Dos');
      const id = await mkEnrolled('Equipo');
      const player = await createAthlete(prisma, club.id);
      const m = await add(id, player.id).expect(201);
      await api()
        .post(`${rosterUrl(id)}/${m.body.id}/leave`)
        .send({ reason: 'quiere cambiar de club' })
        .expect(201);
      await api()
        .post(`/api/athletes/${player.id}/transfer`)
        .send({ clubId: other.id, reason: 'cambio de club' })
        .expect(409);
    });

    it('requiere el permiso, motivo, club activo distinto y acceso a ambos clubes', async () => {
      const other = await createClub(prisma, 'Club Dos');
      const closed = await createClub(prisma, 'Club Cerrado', 'inactivo');
      const player = await createAthlete(prisma, club.id);
      const url = `/api/athletes/${player.id}/transfer`;
      await api().post(url).send({ clubId: other.id }).expect(400);
      await api()
        .post(url)
        .send({ clubId: club.id, reason: 'mismo club' })
        .expect(409);
      await api()
        .post(url)
        .send({ clubId: closed.id, reason: 'club cerrado' })
        .expect(409);

      const leader = await leaderWith(
        t,
        prisma,
        [...LEADER, 'athletes:transfer'],
        [club.id],
      );
      await authed(t, leader.session)
        .post(url)
        .send({ clubId: other.id, reason: 'sin acceso al destino' })
        .expect(404);
      const reader = await leaderWith(t, prisma, LEADER, [club.id]);
      await authed(t, reader.session)
        .post(url)
        .send({ clubId: other.id, reason: 'sin permiso' })
        .expect(403);
      expect(
        (await prisma.athlete.findUniqueOrThrow({ where: { id: player.id } }))
          .clubId,
      ).toBe(club.id);
    });

    it('una transferencia y un alta simultáneas nunca dejan al deportista en un club distinto del de su equipo', async () => {
      for (let round = 0; round < 4; round++) {
        await prisma.teamMembership.deleteMany();
        const other = await createClub(prisma, `Destino ${round}`);
        const id = await mkEnrolled(`Equipo carrera ${round}`);
        const player = await createAthlete(prisma, club.id);
        const [added, moved] = await Promise.all([
          add(id, player.id),
          api()
            .post(`/api/athletes/${player.id}/transfer`)
            .send({ clubId: other.id, reason: 'carrera de prueba' }),
        ]);
        // exactamente una de las dos operaciones prospera
        expect(
          [added.status, moved.status].filter((s) => s < 300),
        ).toHaveLength(1);
        const rows = await prisma.teamMembership.findMany({
          where: { athleteId: player.id },
          include: { teamSeason: { include: { team: true } } },
        });
        const current = await prisma.athlete.findUniqueOrThrow({
          where: { id: player.id },
        });
        for (const r of rows)
          expect(r.teamSeason.team.clubId).toBe(current.clubId);
        await prisma.athlete.update({
          where: { id: player.id },
          data: { clubId: club.id },
        });
      }
    });
  });

  describe('alcance por club y permisos', () => {
    it('un dirigente solo ve y gestiona los equipos de sus clubes; lo demás responde 404', async () => {
      const other = await createClub(prisma, 'Club Ajeno');
      const mine = await mkEnrolled('Mío');
      const foreign = await mkEnrolled('Ajeno', { clubId: other.id });
      const foreignPlayer = await createAthlete(prisma, other.id);
      const foreignMembership = await add(foreign, foreignPlayer.id).expect(
        201,
      );
      const leader = await leaderWith(
        t,
        prisma,
        [...LEADER, 'teams:delete'],
        [club.id],
      );
      const a = authed(t, leader.session);

      const list = await a.get('/api/teams').expect(200);
      expect(list.body.items.map((x: { id: string }) => x.id)).toEqual([mine]);
      expect(
        (await a.get(`/api/teams?clubId=${other.id}`).expect(200)).body.total,
      ).toBe(0);

      await a.get(`/api/teams/${foreign}`).expect(404);
      await a
        .patch(`/api/teams/${foreign}`)
        .send({ name: 'Robado' })
        .expect(404);
      await a.delete(`/api/teams/${foreign}`).expect(404);
      await a.get(`/api/teams/${foreign}/seasons`).expect(404);
      await enroll(foreign, {}, a).expect(404);
      await a.get(rosterUrl(foreign)).expect(404);
      await add(foreign, foreignPlayer.id, {}, s2026.id, a).expect(404);
      await a
        .post(`${rosterUrl(foreign)}/${foreignMembership.body.id}/leave`)
        .send({ reason: 'intento ajeno' })
        .expect(404);
      await a
        .delete(`${rosterUrl(foreign)}/${foreignMembership.body.id}`)
        .send({ reason: 'intento ajeno' })
        .expect(404);
      await a
        .post('/api/teams')
        .send({ clubId: other.id, sportId: football.id, name: 'Intruso' })
        .expect(404);
      expect(await prisma.teamMembership.count()).toBe(1);
      expect(
        (await prisma.team.findUniqueOrThrow({ where: { id: foreign } })).name,
      ).toBe('Ajeno');
    });

    it('un identificador de alta de otro equipo no sirve desde la ruta de un equipo propio', async () => {
      const mine = await mkEnrolled('Mío');
      const sibling = await mkEnrolled('Hermano');
      const player = await createAthlete(prisma, club.id);
      const m = await add(sibling, player.id).expect(201);
      await api()
        .post(`${rosterUrl(mine)}/${m.body.id}/leave`)
        .send({ reason: 'ruta equivocada' })
        .expect(404);
      await api()
        .patch(`${rosterUrl(mine)}/${m.body.id}`)
        .send({ jerseyNumber: 3 })
        .expect(404);
      await api()
        .delete(`${rosterUrl(mine)}/${m.body.id}`)
        .send({ reason: 'ruta equivocada' })
        .expect(404);
      expect(
        (
          await prisma.teamMembership.findUniqueOrThrow({
            where: { id: m.body.id },
          })
        ).status,
      ).toBe('activo');
    });

    it('exige sesión y el permiso correspondiente', async () => {
      await request(t.app.getHttpServer()).get('/api/teams').expect(401);
      const id = await mkEnrolled('Equipo');
      const reader = await leaderWith(t, prisma, ['teams:read'], [club.id]);
      const r = authed(t, reader.session);
      await r.get('/api/teams').expect(200);
      await r
        .post('/api/teams')
        .send({ clubId: club.id, sportId: football.id, name: 'X' })
        .expect(403);
      await enroll(id, {}, r).expect(403);
      await add(
        id,
        (await createAthlete(prisma, club.id)).id,
        {},
        s2026.id,
        r,
      ).expect(403);
      const none = await leaderWith(t, prisma, ['clubs:read'], [club.id]);
      await authed(t, none.session).get('/api/teams').expect(403);
      // ver los equipos de un deportista exige además poder ver deportistas
      const player = await createAthlete(prisma, club.id);
      await r.get(`/api/athletes/${player.id}/teams`).expect(403);
    });
  });

  describe('auditoría', () => {
    it('registra identificadores y nunca nombres de deportistas', async () => {
      const id = await mkEnrolled('Equipo');
      const player = await createAthlete(prisma, club.id, {
        firstName: 'Nombre Secreto',
      });
      const m = await add(id, player.id).expect(201);
      await api()
        .post(`${rosterUrl(id)}/${m.body.id}/leave`)
        .send({ reason: 'se retira' })
        .expect(201);
      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'team' },
      });
      expect(logs.map((l) => l.action).sort()).toEqual([
        'team.create',
        'team.roster_add',
        'team.roster_leave',
        'team.season_enroll',
      ]);
      const text = JSON.stringify(logs);
      expect(text).not.toContain('Nombre Secreto');
      expect(text).not.toContain('Prueba');
    });

    it('las operaciones sin cambios reales no generan auditoría', async () => {
      const id = await mkEnrolled('Equipo');
      await api()
        .patch(`/api/teams/${id}`)
        .send({ name: 'Equipo' })
        .expect(200);
      await api()
        .patch(`/api/teams/${id}/seasons/${s2026.id}`)
        .send({ rosterClosed: false })
        .expect(200);
      expect(await audits('team.update')).toHaveLength(0);
      expect(await audits('team.season_update')).toHaveLength(0);
    });
  });
});
