import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, dbFailure, resetDatabase } from '../support/db.js';
import {
  adminWith,
  allowSelfApproval,
  authed,
  createAthlete,
  createClub,
  createMatchScenario,
  createSeason,
  createUser,
  leaderWith,
  login,
  seedCatalog,
} from '../support/fixtures.js';
import { isPdf, pdfText } from '../support/pdf.js';

const STAFF = [
  'reports:read',
  'results:read',
  'results:manage',
  'results:approve',
  'sanctions:read',
  'sanctions:manage',
  'cases:read',
  'cases:manage',
  'cases:resolve',
  'credentials:issue',
  'credentials:revoke',
  'clubs:access_all',
];

type Scenario = Awaited<ReturnType<typeof createMatchScenario>>;

const binary = (res: { body: unknown; text?: string }) =>
  Buffer.isBuffer(res.body) ? res.body : Buffer.from(String(res.text ?? ''));

describe('reportes, documentos y credenciales', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let staff: Awaited<ReturnType<typeof adminWith>>;
  let scenario: Scenario;

  const api = () => authed(t, staff.session);
  const getFile = (as: ReturnType<typeof authed>, url: string) =>
    as
      .get(url)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    await allowSelfApproval(prisma);
    staff = await adminWith(t, prisma, STAFF);
    scenario = await createMatchScenario(prisma);
    await prisma.institutionSettings.upsert({
      where: { id: 1 },
      update: {
        presidentName: 'Presidente Demo',
        secretaryName: 'Secretaria Demo',
        documentFooter: 'Documento oficial de la Liga',
      },
      create: { id: 1, name: 'Liga Deportiva Cantonal de Quero' },
    });
  });

  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  async function approve(score: [number, number] = [2, 1]) {
    const [ep1, ep2] = scenario.eventParticipants;
    const url = `/api/events/${scenario.event.id}/result`;
    await api()
      .put(url)
      .send({
        values: [
          { eventParticipantId: ep1!.id, score: score[0] },
          { eventParticipantId: ep2!.id, score: score[1] },
        ],
      })
      .expect(200);
    await api().post(`${url}/submit`).expect(201);
    await api()
      .post(`${url}/approve`)
      .send({ approved: true, reason: 'Revisión reglamentaria' })
      .expect(201);
  }

  // ───────────────────── acceso ─────────────────────

  describe('acceso', () => {
    it('exige sesión y los permisos de cada documento', async () => {
      const urls = [
        `/api/reports/championships/${scenario.championship.id}/teams`,
        `/api/reports/championships/${scenario.championship.id}/standings`,
        `/api/reports/championships/${scenario.championship.id}/fixtures`,
        `/api/reports/events/${scenario.event.id}/scoresheet`,
        `/api/reports/registrations/${scenario.home.registrationId}/roster`,
        '/api/reports/sanctions',
      ];
      for (const url of urls) await t.http().get(url).expect(401);

      const nobody = await createUser(prisma, { permissions: ['sports:read'] });
      const as = authed(t, await login(t, nobody.email));
      for (const url of urls) await as.get(url).expect(403);

      // El informe de sanciones exige además poder consultar sanciones; el acta, resultados.
      const onlyReports = await createUser(prisma, {
        permissions: ['reports:read'],
      });
      const asReports = authed(t, await login(t, onlyReports.email));
      await asReports.get('/api/reports/sanctions').expect(403);
      await asReports
        .get(`/api/reports/events/${scenario.event.id}/scoresheet`)
        .expect(403);
      await asReports
        .post(`/api/athletes/${scenario.home.athlete.id}/issued-documents`)
        .send({ kind: 'carne' })
        .expect(403);
      await asReports
        .get(`/api/reports/championships/${scenario.championship.id}/teams`)
        .expect(200);
    });
  });

  // ───────────────────── listados ─────────────────────

  describe('listados y tablas', () => {
    it('genera el listado de equipos inscritos en PDF con cabecera, código y pie', async () => {
      const res = await getFile(
        api(),
        `/api/reports/championships/${scenario.championship.id}/teams`,
      ).expect(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="equipos-inscritos-/,
      );
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      const file = binary(res);
      expect(isPdf(file)).toBe(true);
      const text = pdfText(file);
      for (const expected of [
        'LIGA DEPORTIVA CANTONAL DE QUERO',
        'LISTADO DE EQUIPOS INSCRITOS',
        scenario.championship.name,
        scenario.home.team.name,
        scenario.away.team.name,
        'Documento oficial de la Liga',
        'Secretario/a de la Liga',
      ]) {
        expect(text, expected).toContain(expected);
      }
      expect(text).toMatch(
        /Generado el .+ · Documento REP-\d{8}-[0-9A-F]{6} · Página 1 de 1/,
      );
    });

    it('exporta CSV para Excel (BOM, punto y coma) y neutraliza fórmulas', async () => {
      await prisma.team.update({
        where: { id: scenario.home.team.id },
        data: { name: '=CMD|calc' },
      });
      const res = await getFile(
        api(),
        `/api/reports/championships/${scenario.championship.id}/teams?format=csv`,
      ).expect(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      const csv = binary(res).toString('utf-8');
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      const lines = csv.slice(1).split('\r\n');
      expect(lines[0]).toBe('N.º;Participante;Club;Estado;Inscripción');
      expect(lines[1]).toContain(`;'=CMD|calc;`);
      expect(csv).not.toContain(';=CMD');
    });

    it('rechaza un formato desconocido y un campeonato inexistente', async () => {
      await api()
        .get(
          `/api/reports/championships/${scenario.championship.id}/teams?format=xlsx`,
        )
        .expect(400);
      await api()
        .get(
          '/api/reports/championships/00000000-0000-7000-8000-000000000000/teams',
        )
        .expect(404);
    });

    it('la tabla de posiciones incluye los puntos y avisa de los descuentos por sanción', async () => {
      await approve([3, 0]);
      const kase = await prisma.disciplinaryCase.create({
        data: {
          subject: 'Caso',
          description: 'Descripción del caso',
          status: 'en_revision',
          openedById: staff.user.id,
        },
      });
      await api()
        .post(`/api/cases/${kase.id}/sanctions`)
        .send({
          teamId: scenario.home.team.id,
          championshipId: scenario.championship.id,
          type: 'descuento_puntos',
          points: 1,
          reason: 'Alineación indebida comprobada',
          startsAt: new Date().toISOString().slice(0, 10),
        })
        .expect(201);
      const pdf = await getFile(
        api(),
        `/api/reports/championships/${scenario.championship.id}/standings`,
      ).expect(200);
      const text = pdfText(binary(pdf));
      expect(text).toContain('TABLA DE POSICIONES OFICIAL');
      expect(text).toContain('Puntos descontados por sanciones vigentes');
      expect(text).toContain(`${scenario.home.team.name} (-1)`);

      const csv = binary(
        await getFile(
          api(),
          `/api/reports/championships/${scenario.championship.id}/standings?format=csv`,
        ).expect(200),
      )
        .toString('utf-8')
        .split('\r\n');
      // Local ganó 3 puntos y se le descuenta 1.
      expect(csv[1]).toContain(`1;${scenario.home.team.name};`);
      expect(csv[1]!.split(';').at(-1)).toBe('2');
    });

    it('el calendario muestra los resultados aprobados', async () => {
      await approve([2, 1]);
      const csv = binary(
        await getFile(
          api(),
          `/api/reports/championships/${scenario.championship.id}/fixtures?format=csv`,
        ).expect(200),
      ).toString('utf-8');
      expect(csv).toContain(
        `${scenario.home.team.name} vs ${scenario.away.team.name}`,
      );
      expect(csv).toContain('Finalizado');
      expect(csv).toContain('2 - 1');
    });
  });

  // ───────────────────── acta, nómina y sanciones ─────────────────────

  describe('acta, nómina e informe de sanciones', () => {
    it('el acta en PDF lleva las plantillas con nombres completos y las seis firmas', async () => {
      await approve([1, 1]);
      const person = await prisma.person.findUniqueOrThrow({
        where: { id: scenario.home.athlete.personId },
      });
      const res = await getFile(
        api(),
        `/api/reports/events/${scenario.event.id}/scoresheet`,
      ).expect(200);
      const text = pdfText(binary(res));
      expect(text).toContain('ACTA OFICIAL DE ENCUENTRO');
      // A diferencia del portal público, aquí sí aparece el nombre del deportista (menor de edad).
      expect(text).toContain(`${person.firstName} ${person.lastName}`);
      for (const label of [
        'Juez central / Árbitro',
        'Vocal de turno',
        'Delegado visitante',
      ]) {
        expect(text).toContain(label);
      }
    });

    it('la nómina respeta el alcance por club', async () => {
      const home = await leaderWith(
        t,
        prisma,
        ['reports:read'],
        [scenario.home.club.id],
      );
      const asHome = authed(t, home.session);
      const own = await getFile(
        asHome,
        `/api/reports/registrations/${scenario.home.registrationId}/roster?format=csv`,
      ).expect(200);
      expect(binary(own).toString('utf-8')).toContain(
        'Camiseta;Código;Deportista',
      );
      expect(
        pdfText(
          binary(
            await getFile(
              asHome,
              `/api/reports/registrations/${scenario.home.registrationId}/roster`,
            ).expect(200),
          ),
        ),
      ).toContain('NÓMINA INSTITUCIONAL DE BUENA FE');
      await asHome
        .get(
          `/api/reports/registrations/${scenario.away.registrationId}/roster`,
        )
        .expect(404);

      // El listado de equipos solo muestra los del club del usuario.
      const teams = binary(
        await getFile(
          asHome,
          `/api/reports/championships/${scenario.championship.id}/teams?format=csv`,
        ).expect(200),
      ).toString('utf-8');
      expect(teams).toContain(scenario.home.team.name);
      expect(teams).not.toContain(scenario.away.team.name);
    });

    it('el informe de sanciones se limita al alcance del usuario', async () => {
      const kase = await prisma.disciplinaryCase.create({
        data: {
          subject: 'Caso',
          description: 'Descripción del caso',
          status: 'en_revision',
          openedById: staff.user.id,
        },
      });
      for (const club of [scenario.home.club, scenario.away.club]) {
        await api()
          .post(`/api/cases/${kase.id}/sanctions`)
          .send({
            clubId: club.id,
            type: 'multa',
            reason: 'Falta administrativa',
            startsAt: '2026-06-01',
          })
          .expect(201);
      }
      const all = binary(
        await getFile(api(), '/api/reports/sanctions?format=csv').expect(200),
      ).toString('utf-8');
      expect(all).toContain(`Club ${scenario.home.club.name}`);
      expect(all).toContain(`Club ${scenario.away.club.name}`);

      const home = await leaderWith(
        t,
        prisma,
        ['reports:read', 'sanctions:read'],
        [scenario.home.club.id],
      );
      const mine = binary(
        await getFile(
          authed(t, home.session),
          '/api/reports/sanctions?format=csv',
        ).expect(200),
      ).toString('utf-8');
      expect(mine).toContain(`Club ${scenario.home.club.name}`);
      expect(mine).not.toContain(`Club ${scenario.away.club.name}`);
      expect(
        pdfText(
          binary(await getFile(api(), '/api/reports/sanctions').expect(200)),
        ),
      ).toContain('INFORME DE SANCIONES');
    });

    it('registra en la auditoría quién generó cada documento, sin datos personales', async () => {
      await getFile(
        api(),
        `/api/reports/registrations/${scenario.home.registrationId}/roster`,
      ).expect(200);
      await getFile(
        api(),
        `/api/reports/championships/${scenario.championship.id}/teams?format=csv`,
      ).expect(200);
      const logs = await prisma.auditLog.findMany({
        where: { action: 'document.generated' },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs).toHaveLength(2);
      expect(logs[0]).toMatchObject({
        userId: staff.user.id,
        entityType: 'registration',
      });
      expect(logs[0]!.afterSnapshot).toMatchObject({
        kind: 'nomina',
        format: 'pdf',
      });
      expect(logs[1]!.afterSnapshot).toMatchObject({
        kind: 'equipos_inscritos',
        format: 'csv',
      });
      const person = await prisma.person.findUniqueOrThrow({
        where: { id: scenario.home.athlete.personId },
      });
      expect(JSON.stringify(logs)).not.toContain(person.lastName);
    });
  });

  // ───────────────────── exportaciones públicas ─────────────────────

  describe('exportaciones públicas', () => {
    it('publica la tabla y el calendario de un campeonato visible y oculta los borradores', async () => {
      await approve([2, 0]);
      const pdf = await getFile(
        t.http() as never,
        `/api/public/championships/${scenario.championship.id}/export/standings`,
      ).expect(200);
      expect(isPdf(binary(pdf))).toBe(true);
      const csv = binary(
        await getFile(
          t.http() as never,
          `/api/public/championships/${scenario.championship.id}/export/fixtures?format=csv`,
        ).expect(200),
      ).toString('utf-8');
      expect(csv).toContain('2 - 0');

      await prisma.championship.update({
        where: { id: scenario.championship.id },
        data: { status: 'borrador' },
      });
      await t
        .http()
        .get(
          `/api/public/championships/${scenario.championship.id}/export/standings`,
        )
        .expect(404);
    });

    it('no nombra a menores sin consentimiento en las exportaciones públicas', async () => {
      const club = await createClub(prisma, 'Club Individual');
      const season = await createSeason(prisma, 'Temporada Individual');
      const sport = await prisma.sport.create({
        data: { code: 'taekwondo', name: 'Taekwondo' },
      });
      const category = await prisma.category.create({
        data: { code: 'abierta', name: 'Abierta' },
      });
      const championship = await prisma.championship.create({
        data: {
          name: 'Torneo Individual',
          seasonId: season.id,
          sportId: sport.id,
          categoryId: category.id,
          format: 'cuadro_combates',
          status: 'en_curso',
        },
      });
      const minor = await createAthlete(prisma, club.id, {
        birthDate: '2012-01-01',
        firstName: 'Menorcito',
      });
      const participant = await prisma.participant.create({
        data: {
          kind: 'individual',
          individual: { create: { athleteId: minor.id } },
        },
      });
      await prisma.registration.create({
        data: {
          championshipId: championship.id,
          participantId: participant.id,
          status: 'aprobada',
        },
      });
      const person = await prisma.person.findUniqueOrThrow({
        where: { id: minor.personId },
      });

      const publicCsv = binary(
        await getFile(
          t.http() as never,
          `/api/public/championships/${championship.id}/export/standings?format=csv`,
        ).expect(200),
      ).toString('utf-8');
      expect(publicCsv).not.toContain(person.lastName);
      expect(publicCsv).toMatch(/Deportista DEP-\d{6}/);

      // El mismo informe con sesión sí lleva el nombre.
      const internal = binary(
        await getFile(
          api(),
          `/api/reports/championships/${championship.id}/standings?format=csv`,
        ).expect(200),
      ).toString('utf-8');
      expect(internal).toContain(person.lastName);
    });
  });

  // ───────────────────── carnés y certificados ─────────────────────

  describe('carnés y certificados', () => {
    const issue = (
      athleteId: string,
      body: Record<string, unknown> = { kind: 'carne' },
      as = api(),
    ) => as.post(`/api/athletes/${athleteId}/issued-documents`).send(body);

    it('emite un carné con serie, versión y código de verificación', async () => {
      const res = await issue(scenario.home.athlete.id).expect(201);
      expect(res.body).toMatchObject({
        kind: 'carne',
        label: 'CAR-000001',
        version: 1,
        valid: true,
        season: scenario.season.name,
      });
      expect(res.body.verificationCode).toMatch(/^[A-Z2-7]{16}$/);

      const pdf = await getFile(
        api(),
        `/api/issued-documents/${res.body.id}/pdf`,
      ).expect(200);
      const person = await prisma.person.findUniqueOrThrow({
        where: { id: scenario.home.athlete.personId },
      });
      const text = pdfText(binary(pdf));
      for (const expected of [
        'CARNÉ DE DEPORTISTA',
        `${person.firstName} ${person.lastName}`,
        scenario.home.club.name,
        res.body.verificationCode,
        'CAR-000001',
      ]) {
        expect(text, expected).toContain(expected);
      }
      expect(pdf.headers['content-disposition']).toContain('car-000001.pdf');
    });

    it('reemitir anula la versión anterior y deja una sola vigente', async () => {
      const first = (await issue(scenario.home.athlete.id).expect(201)).body;
      const second = (await issue(scenario.home.athlete.id).expect(201)).body;
      expect(second).toMatchObject({ version: 2, label: 'CAR-000002' });
      const list = (
        await api()
          .get(`/api/athletes/${scenario.home.athlete.id}/issued-documents`)
          .expect(200)
      ).body;
      expect(
        list.map((d: { id: string; valid: boolean }) => [d.id, d.valid]),
      ).toEqual([
        [second.id, true],
        [first.id, false],
      ]);
      expect(list[1].revokeReason).toMatch(/Reemplazado/);
      await api().get(`/api/issued-documents/${first.id}/pdf`).expect(409);

      // La base de datos también impide dos vigentes a la vez.
      const failure = await dbFailure(
        prisma.issuedDocument.update({
          where: { id: first.id },
          data: { revokedAt: null, revokedById: null, revokeReason: null },
        }),
      );
      expect(failure.sqlState).toBe('23505');
    });

    it('solo se emite a deportistas activos, habilitados y con plantilla en la temporada', async () => {
      await prisma.athlete.update({
        where: { id: scenario.home.athlete.id },
        data: { eligibility: 'pendiente' },
      });
      expect(
        (await issue(scenario.home.athlete.id).expect(409)).body.message,
      ).toMatch(/habilitados/);
      await prisma.athlete.update({
        where: { id: scenario.home.athlete.id },
        data: { eligibility: 'habilitado' },
      });
      await prisma.teamMembership.updateMany({
        where: { athleteId: scenario.home.athlete.id },
        data: { status: 'baja', leftAt: new Date(), leaveReason: 'Baja' },
      });
      expect(
        (await issue(scenario.home.athlete.id).expect(409)).body.message,
      ).toMatch(/plantilla/);

      await issue('00000000-0000-7000-8000-000000000000').expect(404);
      await issue(scenario.away.athlete.id, { kind: 'otro' }).expect(400);
      await prisma.season.update({
        where: { id: scenario.season.id },
        data: { status: 'finalizada' },
      });
      expect(
        (await issue(scenario.away.athlete.id).expect(409)).body.message,
      ).toMatch(/temporada activa/);
      await issue(scenario.away.athlete.id, {
        kind: 'carne',
        seasonId: scenario.season.id,
      }).expect(201);
    });

    it('emite el certificado con los nombres de las autoridades y el enlace de verificación', async () => {
      const cert = (
        await issue(scenario.home.athlete.id, {
          kind: 'certificado_inscripcion',
        }).expect(201)
      ).body;
      expect(cert.label).toBe('CER-000001');
      const text = pdfText(
        binary(
          await getFile(api(), `/api/issued-documents/${cert.id}/pdf`).expect(
            200,
          ),
        ),
      );
      expect(text).toContain('CERTIFICADO DE INSCRIPCIÓN');
      expect(text).toContain('Presidente Demo');
      expect(text).toContain('Secretaria Demo');
      expect(text).toContain(`/#/portal/verificar/${cert.verificationCode}`);
      expect(text).toContain(scenario.home.team.name);
    });

    it('cada club emite y descarga solo los de sus deportistas', async () => {
      const home = await leaderWith(
        t,
        prisma,
        ['credentials:issue'],
        [scenario.home.club.id],
      );
      const asHome = authed(t, home.session);
      const mine = (
        await issue(scenario.home.athlete.id, { kind: 'carne' }, asHome).expect(
          201,
        )
      ).body;
      await issue(scenario.away.athlete.id, { kind: 'carne' }, asHome).expect(
        404,
      );
      await asHome
        .get(`/api/athletes/${scenario.away.athlete.id}/issued-documents`)
        .expect(404);

      const away = await leaderWith(
        t,
        prisma,
        ['credentials:issue'],
        [scenario.away.club.id],
      );
      await authed(t, away.session)
        .get(`/api/issued-documents/${mine.id}/pdf`)
        .expect(404);
      await getFile(asHome, `/api/issued-documents/${mine.id}/pdf`).expect(200);
      // Anular requiere su propio permiso.
      await asHome
        .post(`/api/issued-documents/${mine.id}/revoke`)
        .send({ reason: 'Error en los datos' })
        .expect(403);
    });

    it('anular exige motivo y deja constancia', async () => {
      const doc = (await issue(scenario.home.athlete.id).expect(201)).body;
      await api()
        .post(`/api/issued-documents/${doc.id}/revoke`)
        .send({ reason: 'no' })
        .expect(400);
      const revoked = await api()
        .post(`/api/issued-documents/${doc.id}/revoke`)
        .send({ reason: 'Se perdió el carné' })
        .expect(200);
      expect(revoked.body).toMatchObject({
        valid: false,
        revokeReason: 'Se perdió el carné',
      });
      await api()
        .post(`/api/issued-documents/${doc.id}/revoke`)
        .send({ reason: 'Otra vez' })
        .expect(409);
      const actions = (
        await prisma.auditLog.findMany({ where: { entityType: 'athlete' } })
      ).map((l) => l.action);
      expect(actions).toEqual(
        expect.arrayContaining(['document.issued', 'document.revoked']),
      );
    });

    it('la hoja de carnés del equipo emite los que faltan y reutiliza los existentes', async () => {
      const second = await createAthlete(prisma, scenario.home.club.id);
      await prisma.teamMembership.create({
        data: {
          teamSeasonId: scenario.home.teamSeason.id,
          athleteId: second.id,
          sportId: scenario.sport.id,
          seasonId: scenario.season.id,
          createdById: staff.user.id,
          jerseyNumber: 7,
        },
      });
      await issue(scenario.home.athlete.id).expect(201);

      const url = `/api/reports/team-seasons/${scenario.home.teamSeason.id}/credentials`;
      const sheet = await getFile(api(), url).expect(200);
      expect(isPdf(binary(sheet))).toBe(true);
      expect(pdfText(binary(sheet))).toContain('CARNÉ DE DEPORTISTA');
      expect(
        await prisma.issuedDocument.count({ where: { kind: 'carne' } }),
      ).toBe(2);
      expect(
        await prisma.issuedDocument.count({ where: { revokedAt: null } }),
      ).toBe(2);

      // Descargarla otra vez no genera versiones nuevas.
      await getFile(api(), url).expect(200);
      expect(
        await prisma.issuedDocument.count({ where: { kind: 'carne' } }),
      ).toBe(2);

      const away = await leaderWith(
        t,
        prisma,
        ['credentials:issue'],
        [scenario.away.club.id],
      );
      await authed(t, away.session).get(url).expect(404);
    });
  });

  // ───────────────────── verificación pública ─────────────────────

  describe('verificación pública', () => {
    it('confirma un documento vigente mostrando lo mínimo y nombra al titular solo si corresponde', async () => {
      const doc = (
        await api()
          .post(`/api/athletes/${scenario.home.athlete.id}/issued-documents`)
          .send({ kind: 'carne' })
          .expect(201)
      ).body;
      const res = await t
        .http()
        .get(`/api/public/verify/${doc.verificationCode}`)
        .expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({
        valid: true,
        kind: 'carne',
        label: 'CAR-000001',
        season: scenario.season.name,
        club: scenario.home.club.name,
      });
      // El titular es menor de edad sin consentimiento: se identifica por su código.
      expect(res.body.holder).toMatch(/^Deportista DEP-\d{6}$/);
      const person = await prisma.person.findUniqueOrThrow({
        where: { id: scenario.home.athlete.personId },
      });
      expect(JSON.stringify(res.body)).not.toContain(person.lastName);
      for (const hidden of ['snapshot', 'issuedBy', 'athleteId', 'serial']) {
        expect(res.body).not.toHaveProperty(hidden);
      }

      // Un adulto sí aparece con su nombre.
      const adult = await createAthlete(prisma, scenario.home.club.id, {
        birthDate: '1990-01-01',
        firstName: 'Adulto',
      });
      await prisma.teamMembership.create({
        data: {
          teamSeasonId: scenario.home.teamSeason.id,
          athleteId: adult.id,
          sportId: scenario.sport.id,
          seasonId: scenario.season.id,
          createdById: staff.user.id,
        },
      });
      const adultDoc = (
        await api()
          .post(`/api/athletes/${adult.id}/issued-documents`)
          .send({ kind: 'carne' })
          .expect(201)
      ).body;
      const adultPerson = await prisma.person.findUniqueOrThrow({
        where: { id: adult.personId },
      });
      expect(
        (await t.http().get(`/api/public/verify/${adultDoc.verificationCode}`))
          .body.holder,
      ).toBe(`${adultPerson.firstName} ${adultPerson.lastName}`);
    });

    it('un documento anulado se informa como no vigente y un código inválido no existe', async () => {
      const doc = (
        await api()
          .post(`/api/athletes/${scenario.home.athlete.id}/issued-documents`)
          .send({ kind: 'carne' })
          .expect(201)
      ).body;
      await api()
        .post(`/api/issued-documents/${doc.id}/revoke`)
        .send({ reason: 'Documento extraviado' })
        .expect(200);
      const res = await t
        .http()
        .get(`/api/public/verify/${doc.verificationCode}`)
        .expect(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.revokedAt).not.toBeNull();
      // No se revela el motivo de la anulación.
      expect(JSON.stringify(res.body)).not.toContain('extraviado');

      await t.http().get('/api/public/verify/AAAAAAAAAAAAAAAA').expect(404);
      await t.http().get('/api/public/verify/corto').expect(404);
      await t.http().get('/api/public/verify/aaaaaaaaaaaaaaaa').expect(404);
    });

    it('la base de datos rechaza códigos de verificación mal formados', async () => {
      const doc = (
        await api()
          .post(`/api/athletes/${scenario.home.athlete.id}/issued-documents`)
          .send({ kind: 'carne' })
          .expect(201)
      ).body;
      const failure = await dbFailure(
        prisma.issuedDocument.update({
          where: { id: doc.id },
          data: { verificationCode: 'codigo-invalido' },
        }),
      );
      expect(failure.sqlState).toBe('23514');
    });
  });
});
