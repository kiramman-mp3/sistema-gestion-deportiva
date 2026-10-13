import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import {
  adminWith,
  allowSelfApproval,
  authed,
  createAthlete,
  createMatchScenario,
  createClub,
  createSeason,
  seedCatalog,
} from '../support/fixtures.js';

const daysFromNow = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString();

type Scenario = Awaited<ReturnType<typeof createMatchScenario>>;

describe('portal público: inicio, calendario, detalle y nombres', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof adminWith>>;
  let upcoming: Scenario;

  const api = () => authed(t, admin.session);

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    await allowSelfApproval(prisma);
    admin = await adminWith(t, prisma, [
      'results:read',
      'results:manage',
      'results:approve',
    ]);
    upcoming = await createMatchScenario(prisma, {
      scheduledAt: daysFromNow(5),
    });
  });

  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  /** Registra, envía y aprueba un acta con el marcador indicado. */
  async function approve(scenario: Scenario, home: number, away: number) {
    const [ep1, ep2] = scenario.eventParticipants;
    const url = `/api/events/${scenario.event.id}/result`;
    await api()
      .put(url)
      .send({
        values: [
          { eventParticipantId: ep1!.id, score: home },
          { eventParticipantId: ep2!.id, score: away },
        ],
      })
      .expect(200);
    await api().post(`${url}/submit`).expect(201);
    await api()
      .post(`${url}/approve`)
      .send({ approved: true, reason: 'Revisión reglamentaria' })
      .expect(201);
  }

  describe('inicio', () => {
    it('reúne datos de la Liga, noticias, próximos partidos y últimos resultados', async () => {
      const played = await createMatchScenario(prisma, {
        scheduledAt: daysFromNow(-3),
      });
      await approve(played, 3, 1);
      await prisma.announcement.create({
        data: {
          title: 'Noticia de bienvenida',
          slug: 'noticia-de-bienvenida',
          summary: 'Resumen de la noticia de bienvenida.',
          content: 'Contenido de la noticia de bienvenida al portal.',
          status: 'publicado',
          publishedAt: new Date(),
          publishDate: new Date(),
          authorId: admin.user.id,
        },
      });
      await prisma.announcement.create({
        data: {
          title: 'Borrador interno',
          slug: 'borrador-interno',
          summary: 'Resumen del borrador interno.',
          content: 'Contenido del borrador que no debe verse.',
          publishDate: new Date(),
          authorId: admin.user.id,
        },
      });

      const res = await t.http().get('/api/public/home').expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.institution).toMatchObject({
        name: 'Liga Deportiva Cantonal de Quero',
      });
      expect(res.body.news.map((n: { slug: string }) => n.slug)).toEqual([
        'noticia-de-bienvenida',
      ]);
      expect(res.body.upcoming).toHaveLength(1);
      expect(res.body.upcoming[0]).toMatchObject({
        id: upcoming.event.id,
        hasResult: false,
        championship: { name: upcoming.championship.name },
      });
      expect(res.body.upcoming[0].participants[0].score).toBeNull();
      expect(res.body.recent).toHaveLength(1);
      expect(
        res.body.recent[0].participants.map((p: { score: number }) => p.score),
      ).toEqual([3, 1]);
    });

    it('no incluye borradores de campeonato ni actas sin aprobar', async () => {
      await prisma.championship.update({
        where: { id: upcoming.championship.id },
        data: { status: 'borrador' },
      });
      const other = await createMatchScenario(prisma, {
        scheduledAt: daysFromNow(-2),
      });
      // Acta en borrador y en revisión: no cuenta como resultado.
      const [ep1, ep2] = other.eventParticipants;
      await api()
        .put(`/api/events/${other.event.id}/result`)
        .send({
          values: [
            { eventParticipantId: ep1!.id, score: 9 },
            { eventParticipantId: ep2!.id, score: 0 },
          ],
        })
        .expect(200);
      const res = await t.http().get('/api/public/home').expect(200);
      expect(res.body.upcoming).toHaveLength(0);
      expect(res.body.recent).toHaveLength(0);
      expect(JSON.stringify(res.body)).not.toContain('"score":9');
    });
  });

  describe('calendario', () => {
    it('filtra por fechas, deporte, club, estado y paginación', async () => {
      const later = await createMatchScenario(prisma, {
        scheduledAt: daysFromNow(20),
      });
      const all = await t.http().get('/api/public/events').expect(200);
      expect(all.body.total).toBe(2);
      expect(all.body.items[0].id).toBe(upcoming.event.id);

      const desc = await t.http().get('/api/public/events?order=desc');
      expect(desc.body.items[0].id).toBe(later.event.id);

      const from = daysFromNow(10).slice(0, 10);
      expect(
        (await t.http().get(`/api/public/events?from=${from}`)).body.items.map(
          (e: { id: string }) => e.id,
        ),
      ).toEqual([later.event.id]);
      expect(
        (
          await t
            .http()
            .get(`/api/public/events?to=${daysFromNow(10).slice(0, 10)}`)
        ).body.total,
      ).toBe(1);
      expect(
        (await t.http().get(`/api/public/events?sportId=${later.sport.id}`))
          .body.items[0].id,
      ).toBe(later.event.id);
      expect(
        (
          await t
            .http()
            .get(`/api/public/events?clubId=${upcoming.home.club.id}`)
        ).body.total,
      ).toBe(1);
      expect(
        (
          await t
            .http()
            .get(`/api/public/events?championshipId=${later.championship.id}`)
        ).body.total,
      ).toBe(1);
      expect(
        (await t.http().get('/api/public/events?status=suspendido')).body.total,
      ).toBe(0);
      const page2 = await t.http().get('/api/public/events?pageSize=1&page=2');
      expect(page2.body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
      expect(page2.body.items).toHaveLength(1);
      await t.http().get('/api/public/events?from=ayer').expect(400);
    });

    it('oculta campeonatos en borrador o archivados', async () => {
      await prisma.championship.update({
        where: { id: upcoming.championship.id },
        data: { status: 'archivado' },
      });
      expect((await t.http().get('/api/public/events')).body.total).toBe(0);
      await t.http().get(`/api/public/events/${upcoming.event.id}`).expect(404);
    });
  });

  describe('detalle del partido', () => {
    it('muestra el escenario y el acta solo si está aprobada', async () => {
      const venue = await prisma.venue.create({
        data: { name: 'Estadio Cantonal', address: 'Av. Principal' },
      });
      await prisma.event.update({
        where: { id: upcoming.event.id },
        data: { venueId: venue.id },
      });
      const before = await t
        .http()
        .get(`/api/public/events/${upcoming.event.id}`)
        .expect(200);
      expect(before.body).toMatchObject({
        venue: { name: 'Estadio Cantonal', address: 'Av. Principal' },
        result: null,
        hasResult: false,
      });

      await approve(upcoming, 2, 2);
      const after = await t
        .http()
        .get(`/api/public/events/${upcoming.event.id}`)
        .expect(200);
      expect(after.body.hasResult).toBe(true);
      expect(after.body.result).toMatchObject({ footballEvents: [] });
      expect(
        after.body.participants.map((p: { outcome: string }) => p.outcome),
      ).toEqual(['empate', 'empate']);
      await t.http().get('/api/public/events/no-es-uuid').expect(400);
      await t
        .http()
        .get('/api/public/events/00000000-0000-7000-8000-000000000000')
        .expect(404);
    });
  });

  describe('nombres de deportistas (menores y adultos)', () => {
    async function individualEvent() {
      const club = await createClub(prisma, 'Club Taekwondo Quero');
      const season = await createSeason(prisma, 'Temporada Individual');
      const sport = await prisma.sport.create({
        data: { code: 'taekwondo', name: 'Taekwondo' },
      });
      const category = await prisma.category.create({
        data: { code: 'abierta', name: 'Abierta' },
      });
      const championship = await prisma.championship.create({
        data: {
          name: 'Torneo de Taekwondo',
          seasonId: season.id,
          sportId: sport.id,
          categoryId: category.id,
          format: 'cuadro_combates',
          status: 'en_curso',
        },
      });
      const adult = await createAthlete(prisma, club.id, {
        birthDate: '1995-03-10',
        firstName: 'Adulto',
      });
      const minor = await createAthlete(prisma, club.id, {
        birthDate: '2012-03-10',
        firstName: 'Menor',
      });
      const regs = [];
      for (const athlete of [adult, minor]) {
        const participant = await prisma.participant.create({
          data: {
            kind: 'individual',
            individual: { create: { athleteId: athlete.id } },
          },
        });
        regs.push(
          await prisma.registration.create({
            data: {
              championshipId: championship.id,
              participantId: participant.id,
              status: 'aprobada',
            },
          }),
        );
      }
      const stage = await prisma.stage.create({
        data: {
          championshipId: championship.id,
          name: 'Eliminatoria',
          sequence: 1,
        },
      });
      const round = await prisma.round.create({
        data: { stageId: stage.id, name: 'Combates', roundNumber: 1 },
      });
      const event = await prisma.event.create({
        data: {
          roundId: round.id,
          scheduledAt: new Date(daysFromNow(3)),
          participants: {
            create: regs.map((r) => ({
              registrationId: r.id,
              side: 'individual' as const,
            })),
          },
        },
      });
      return { adult, minor, championship, event, regs };
    }

    const nameOf = (person: { firstName: string; lastName: string }) =>
      `${person.firstName} ${person.lastName}`;

    it('un adulto aparece por su nombre y un menor sin consentimiento como «Deportista DEP-…»', async () => {
      const s = await individualEvent();
      const adultPerson = await prisma.person.findUniqueOrThrow({
        where: { id: s.adult.personId },
      });
      const minorPerson = await prisma.person.findUniqueOrThrow({
        where: { id: s.minor.personId },
      });

      const detail = await t
        .http()
        .get(`/api/public/events/${s.event.id}`)
        .expect(200);
      const names = detail.body.participants.map(
        (p: { name: string }) => p.name,
      );
      expect(names).toContain(nameOf(adultPerson));
      expect(names.some((n: string) => /^Deportista DEP-\d{6}$/.test(n))).toBe(
        true,
      );
      expect(JSON.stringify(detail.body)).not.toContain(minorPerson.lastName);

      // El mismo criterio en el calendario, las posiciones y el acta imprimible.
      for (const url of [
        `/api/public/events?championshipId=${s.championship.id}`,
        `/api/public/championships/${s.championship.id}/fixtures`,
        `/api/public/championships/${s.championship.id}/standings`,
        `/api/public/events/${s.event.id}/scoresheet`,
        `/api/public/registrations/${s.regs[1]!.id}/roster`,
      ]) {
        const res = await t.http().get(url).expect(200);
        expect(JSON.stringify(res.body), url).not.toContain(
          minorPerson.lastName,
        );
        expect(JSON.stringify(res.body), url).not.toContain(
          minorPerson.firstName,
        );
      }
      const adultRoster = await t
        .http()
        .get(`/api/public/registrations/${s.regs[0]!.id}/roster`)
        .expect(200);
      expect(adultRoster.body.participant.name).toBe(nameOf(adultPerson));
    });

    it('un menor con perfil público y consentimiento vigente sí se nombra, y deja de nombrarse si lo revoca', async () => {
      const s = await individualEvent();
      const minorPerson = await prisma.person.findUniqueOrThrow({
        where: { id: s.minor.personId },
      });
      await prisma.athlete.update({
        where: { id: s.minor.id },
        data: { publicProfile: true },
      });
      const consent = await prisma.consentRecord.create({
        data: {
          personId: s.minor.personId,
          type: 'publicacion_perfil',
          grantedByName: 'Madre Responsable',
          grantedByRelation: 'madre',
          recordedById: admin.user.id,
        },
      });
      const named = await t
        .http()
        .get(`/api/public/events/${s.event.id}`)
        .expect(200);
      expect(
        named.body.participants.map((p: { name: string }) => p.name),
      ).toContain(nameOf(minorPerson));

      await prisma.consentRecord.update({
        where: { id: consent.id },
        data: { status: 'revocado', revokedAt: new Date() },
      });
      const hidden = await t
        .http()
        .get(`/api/public/events/${s.event.id}`)
        .expect(200);
      expect(JSON.stringify(hidden.body)).not.toContain(minorPerson.lastName);
    });

    it('la nómina de un equipo con menores muestra códigos, no nombres', async () => {
      const roster = await t
        .http()
        .get(`/api/public/registrations/${upcoming.home.registrationId}/roster`)
        .expect(200);
      expect(roster.body.members).toHaveLength(1);
      expect(roster.body.members[0].name).toMatch(/^Deportista DEP-\d{6}$/);
      const person = await prisma.person.findUniqueOrThrow({
        where: { id: upcoming.home.athlete.personId },
      });
      expect(JSON.stringify(roster.body)).not.toContain(person.lastName);
    });
  });
});
