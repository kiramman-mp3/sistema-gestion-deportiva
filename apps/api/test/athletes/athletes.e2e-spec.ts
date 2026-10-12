import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { todayInGuayaquil } from '../../src/people/people.schemas.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import {
  adminWith,
  authed,
  cedula,
  createClub,
  leaderWith,
  seedCatalog,
} from '../support/fixtures.js';
import request from 'supertest';

const FULL = [
  'athletes:read',
  'athletes:read_full',
  'athletes:manage',
  'athletes:validate',
  'athletes:publish',
  'clubs:access_all',
];
const SUMMARY = ['athletes:read', 'athletes:manage'];

/** Fecha de nacimiento de alguien que HOY tiene exactamente `years` años cumplidos. */
function birthFor(years: number): string {
  const [y, m, d] = todayInGuayaquil().split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(y - years, m - 1, d - 30));
  return date.toISOString().slice(0, 10);
}

describe('deportistas', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let league: Awaited<ReturnType<typeof adminWith>>;
  let club: Awaited<ReturnType<typeof createClub>>;
  const api = () => authed(t, league.session);

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    league = await adminWith(t, prisma, FULL);
    club = await createClub(prisma, 'Club Uno');
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  const adult = (over: Record<string, unknown> = {}) => ({
    clubId: club.id,
    firstName: 'María José',
    lastName: 'Pérez Andrade',
    birthDate: birthFor(25),
    idType: 'cedula',
    idNumber: cedula('171003406'),
    phone: '+593 99 123 4567',
    ...over,
  });
  const create = (body: Record<string, unknown>, a = api()) =>
    a.post('/api/athletes').send(body);
  const audits = (action: string) =>
    prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });
  const consent = (id: string, over: Record<string, unknown> = {}, a = api()) =>
    a.post(`/api/athletes/${id}/consents`).send({
      type: 'tratamiento_datos',
      grantedByName: 'María José Pérez Andrade',
      grantedByRelation: 'propio',
      ...over,
    });

  describe('alta y niveles de privacidad', () => {
    it('crea un deportista con código y devuelve los datos completos a quien tiene el permiso', async () => {
      const res = await create(adult()).expect(201);
      expect(res.body).toMatchObject({
        code: 'DEP-000001',
        firstName: 'María José',
        lastName: 'Pérez Andrade',
        status: 'activo',
        eligibility: 'pendiente',
        publicProfile: false,
        club: { id: club.id, name: 'Club Uno' },
        full: {
          age: 25,
          idType: 'cedula',
          idNumber: cedula('171003406'),
          phone: '+593 99 123 4567',
        },
      });
      const second = await create(
        adult({ idNumber: cedula('171003407'), firstName: 'Otra' }),
      ).expect(201);
      expect(second.body.code).toBe('DEP-000002');
    });

    it('quien solo tiene el resumen nunca recibe fecha de nacimiento, documento ni contacto', async () => {
      const full = await create(adult()).expect(201);
      const leader = await leaderWith(t, prisma, SUMMARY, [club.id]);
      const a = authed(t, leader.session);

      const one = await a.get(`/api/athletes/${full.body.id}`).expect(200);
      const list = await a.get('/api/athletes').expect(200);
      for (const body of [one.body, list.body]) {
        const text = JSON.stringify(body);
        expect(text).not.toContain(cedula('171003406'));
        expect(text).not.toContain('99 123');
        expect(text).not.toContain('birthDate');
        expect(text).not.toContain('"full"');
      }
      expect(one.body).toMatchObject({
        firstName: 'María José',
        code: 'DEP-000001',
      });
    });

    it('quien solo tiene el resumen puede registrar nombre y club, pero no datos personales', async () => {
      const leader = await leaderWith(t, prisma, SUMMARY, [club.id]);
      const a = authed(t, leader.session);
      const ok = await create(
        { clubId: club.id, firstName: 'Luis', lastName: 'Mora' },
        a,
      ).expect(201);
      expect(ok.body.full).toBeUndefined();

      for (const extra of [
        { idType: 'cedula', idNumber: cedula('171003406') },
        { phone: '0991234567' },
        { guardianName: 'Ana Mora' },
      ]) {
        await create(
          { clubId: club.id, firstName: 'Luis', lastName: 'Otro', ...extra },
          a,
        ).expect(403);
      }
      await a
        .patch(`/api/athletes/${ok.body.id}`)
        .send({ phone: '0991234567' })
        .expect(403);
    });

    it('rechaza cédulas inválidas, campos desconocidos y fechas futuras', async () => {
      await create(adult({ idNumber: '1710034060' })).expect(400);
      await create(adult({ unknown: 1 })).expect(400);
      await create(adult({ birthDate: '2999-01-01' })).expect(400);
      await create(adult({ idType: undefined })).expect(400);
      expect(await prisma.athlete.count()).toBe(0);
    });

    it('exige estar autenticado y tener permiso', async () => {
      await request(t.app.getHttpServer()).get('/api/athletes').expect(401);
      const nobody = await leaderWith(t, prisma, ['clubs:read'], [club.id]);
      await authed(t, nobody.session).get('/api/athletes').expect(403);
      await create(adult(), authed(t, nobody.session)).expect(403);
    });
  });

  describe('duplicados', () => {
    it('rechaza el mismo documento aunque cambie el formato, también en otro club', async () => {
      await create(adult()).expect(201);
      const other = await createClub(prisma, 'Club Dos');
      for (const idNumber of ['1710034065', '171.003.406-5', ' 1710034065 ']) {
        const res = await create(
          adult({ clubId: other.id, idNumber, firstName: 'Distinto' }),
        );
        expect(res.status, idNumber).toBe(409);
      }
      expect(await prisma.athlete.count()).toBe(1);
    });

    it('con el mismo nombre y fecha de nacimiento pide confirmar; confirmando se crea', async () => {
      await create(adult({ idType: undefined, idNumber: undefined })).expect(
        201,
      );
      const dup = adult({
        firstName: 'maria jose',
        lastName: 'PEREZ andrade',
        idType: undefined,
        idNumber: undefined,
      });
      const res = await create(dup).expect(409);
      expect(res.body.code).toBe('posible_duplicado');
      await create({ ...dup, confirmDuplicate: true }).expect(201);
      expect(await prisma.athlete.count()).toBe(2);
      const [log] = await audits('athlete.create');
      expect(log).toBeDefined();
    });

    it('solo un alta gana cuando llegan dos simultáneas con el mismo documento', async () => {
      const results = await Promise.all(
        [1, 2, 3, 4].map((n) =>
          create(adult({ firstName: `Concurrente ${n}` })),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(3);
      expect(await prisma.athlete.count()).toBe(1);
    });

    it('un documento ya usado no puede asignarse a otro deportista al editar', async () => {
      await create(adult()).expect(201);
      const b = await create(
        adult({ idNumber: cedula('171003407'), firstName: 'Beto' }),
      ).expect(201);
      await api()
        .patch(`/api/athletes/${b.body.id}`)
        .send({ idType: 'cedula', idNumber: cedula('171003406') })
        .expect(409);
    });

    it('no permite registrar en un club inactivo', async () => {
      const inactive = await createClub(prisma, 'Club Cerrado', 'inactivo');
      await create(adult({ clubId: inactive.id })).expect(409);
    });
  });

  describe('alcance por club (IDOR)', () => {
    it('un dirigente solo ve y modifica deportistas de sus clubes; lo demás responde 404', async () => {
      const other = await createClub(prisma, 'Club Ajeno');
      const mineAthlete = await create(adult()).expect(201);
      const foreign = await create(
        adult({
          clubId: other.id,
          idNumber: cedula('171003407'),
          firstName: 'Ajeno',
        }),
      ).expect(201);
      const leader = await leaderWith(
        t,
        prisma,
        [...SUMMARY, 'athletes:publish'],
        [club.id],
      );
      const a = authed(t, leader.session);

      const list = await a.get('/api/athletes').expect(200);
      expect(list.body.items.map((x: { id: string }) => x.id)).toEqual([
        mineAthlete.body.id,
      ]);
      const filtered = await a
        .get(`/api/athletes?clubId=${other.id}`)
        .expect(200);
      expect(filtered.body.total).toBe(0);

      const id = foreign.body.id as string;
      await a.get(`/api/athletes/${id}`).expect(404);
      await a.patch(`/api/athletes/${id}`).send({ firstName: 'X' }).expect(404);
      await a
        .patch(`/api/athletes/${id}/status`)
        .send({ status: 'inactivo', reason: 'prueba' })
        .expect(404);
      await a.get(`/api/athletes/${id}/consents`).expect(404);
      await consent(id, {}, a).expect(404);
      await a
        .put(`/api/athletes/${id}/publication`)
        .send({ published: true })
        .expect(404);
      await create(
        { clubId: other.id, firstName: 'Intruso', lastName: 'Externo' },
        a,
      ).expect(404);

      const untouched = await prisma.athlete.findUnique({
        where: { id },
        include: { person: true },
      });
      expect(untouched?.person.firstName).toBe('Ajeno');
    });

    it('no se puede usar el identificador de un consentimiento ajeno desde otro deportista', async () => {
      const first = await create(adult()).expect(201);
      const second = await create(
        adult({ idNumber: cedula('171003407'), firstName: 'Segundo' }),
      ).expect(201);
      const granted = await consent(first.body.id).expect(201);
      const consentId = granted.body[0].id as string;
      await api()
        .post(`/api/athletes/${second.body.id}/consents/${consentId}/revoke`)
        .send({ reason: 'intento ajeno' })
        .expect(404);
      const row = await prisma.consentRecord.findUnique({
        where: { id: consentId },
      });
      expect(row?.status).toBe('otorgado');
    });
  });

  describe('consentimientos', () => {
    it('un adulto lo otorga él mismo y un menor, su tutor', async () => {
      const a = (await create(adult()).expect(201)).body.id as string;
      const m = (
        await create(
          adult({
            idNumber: cedula('171003407'),
            firstName: 'Menor',
            birthDate: birthFor(12),
          }),
        ).expect(201)
      ).body.id as string;

      const bad1 = await consent(a, { grantedByRelation: 'madre' }).expect(400);
      expect(bad1.body.errors[0].field).toBe('grantedByRelation');
      await consent(m, { grantedByRelation: 'propio' }).expect(400);
      await consent(a).expect(201);
      const ok = await consent(m, {
        grantedByName: 'Rosa Menor',
        grantedByRelation: 'Madre',
      }).expect(201);
      expect(ok.body[0]).toMatchObject({
        type: 'tratamiento_datos',
        grantedByRelation: 'madre',
        active: true,
      });
    });

    it('sin fecha de nacimiento no se puede saber quién lo otorga', async () => {
      const id = (
        await create({
          clubId: club.id,
          firstName: 'Sin',
          lastName: 'Fecha',
        }).expect(201)
      ).body.id as string;
      await consent(id).expect(400);
    });

    it('solo permite un consentimiento vigente por tipo y se puede volver a otorgar tras revocarlo', async () => {
      const id = (await create(adult()).expect(201)).body.id as string;
      const first = await consent(id).expect(201);
      await consent(id).expect(409);
      await consent(id, { type: 'publicacion_foto' }).expect(201);

      await api()
        .post(`/api/athletes/${id}/consents/${first.body[0].id}/revoke`)
        .send({ reason: 'ya no autoriza' })
        .expect(201);
      await api()
        .post(`/api/athletes/${id}/consents/${first.body[0].id}/revoke`)
        .send({ reason: 'otra vez' })
        .expect(409);
      await consent(id).expect(201);
      const history = await api()
        .get(`/api/athletes/${id}/consents`)
        .expect(200);
      expect(history.body).toHaveLength(3);
    });

    it('rechaza un vencimiento ya pasado', async () => {
      const id = (await create(adult()).expect(201)).body.id as string;
      await consent(id, { expiresOn: '2020-01-01' }).expect(400);
    });

    it('exige motivo para revocar y permiso de gestión para registrar', async () => {
      const id = (await create(adult()).expect(201)).body.id as string;
      const granted = await consent(id).expect(201);
      await api()
        .post(`/api/athletes/${id}/consents/${granted.body[0].id}/revoke`)
        .send({})
        .expect(400);
      const reader = await leaderWith(t, prisma, ['athletes:read'], [club.id]);
      await consent(id, {}, authed(t, reader.session)).expect(403);
    });
  });

  describe('elegibilidad', () => {
    it('no se habilita sin fecha de nacimiento, datos del tutor (menores) y consentimiento de datos', async () => {
      const minor = (
        await create(
          adult({
            birthDate: birthFor(12),
            idType: undefined,
            idNumber: undefined,
          }),
        ).expect(201)
      ).body.id as string;
      const habilitar = (id: string) =>
        api().patch(`/api/athletes/${id}/eligibility`).send({
          eligibility: 'habilitado',
          reason: 'revisión de documentos',
        });

      let res = await habilitar(minor).expect(409);
      expect(res.body.blockers).toEqual([
        'es menor de edad y faltan los datos del tutor',
        'falta el consentimiento de tratamiento de datos',
      ]);

      await api()
        .patch(`/api/athletes/${minor}`)
        .send({ guardianName: 'Rosa Pérez', guardianRelation: 'madre' })
        .expect(200);
      await consent(minor, {
        grantedByName: 'Rosa Pérez',
        grantedByRelation: 'madre',
      }).expect(201);
      res = await habilitar(minor).expect(200);
      expect(res.body.eligibility).toBe('habilitado');

      const noBirth = (
        await create({
          clubId: club.id,
          firstName: 'Sin',
          lastName: 'Fecha',
        }).expect(201)
      ).body.id as string;
      res = await habilitar(noBirth).expect(409);
      expect(res.body.blockers).toContain('falta la fecha de nacimiento');
    });

    it('requiere el permiso de validación y queda auditada con su motivo', async () => {
      const id = (await create(adult()).expect(201)).body.id as string;
      await consent(id).expect(201);
      const manager = await leaderWith(t, prisma, [...SUMMARY], [club.id]);
      await authed(t, manager.session)
        .patch(`/api/athletes/${id}/eligibility`)
        .send({ eligibility: 'habilitado', reason: 'intento' })
        .expect(403);
      await api()
        .patch(`/api/athletes/${id}/eligibility`)
        .send({ eligibility: 'habilitado' })
        .expect(400);
      await api()
        .patch(`/api/athletes/${id}/eligibility`)
        .send({ eligibility: 'habilitado', reason: 'documentos completos' })
        .expect(200);
      const [log] = await audits('athlete.eligibility_change');
      expect(log).toMatchObject({
        entityId: id,
        reason: 'documentos completos',
        beforeSnapshot: { eligibility: 'pendiente' },
        afterSnapshot: { eligibility: 'habilitado' },
      });
    });

    it('cambiar nombre, fecha de nacimiento o documento devuelve la elegibilidad a pendiente', async () => {
      const id = (await create(adult()).expect(201)).body.id as string;
      await consent(id).expect(201);
      const enable = () =>
        api()
          .patch(`/api/athletes/${id}/eligibility`)
          .send({ eligibility: 'habilitado', reason: 'documentos ok' })
          .expect(200);

      await enable();
      // un cambio de teléfono no afecta la elegibilidad
      let res = await api()
        .patch(`/api/athletes/${id}`)
        .send({ phone: '0991112233' })
        .expect(200);
      expect(res.body.eligibility).toBe('habilitado');
      res = await api()
        .patch(`/api/athletes/${id}`)
        .send({ birthDate: birthFor(26) })
        .expect(200);
      expect(res.body.eligibility).toBe('pendiente');
      await enable();
      res = await api()
        .patch(`/api/athletes/${id}`)
        .send({ lastName: 'Otro Apellido' })
        .expect(200);
      expect(res.body.eligibility).toBe('pendiente');
    });
  });

  describe('publicación y perfil público', () => {
    const publish = (id: string, published = true) =>
      api().put(`/api/athletes/${id}/publication`).send({ published });
    const publicProfile = (id: string) =>
      request(t.app.getHttpServer()).get(`/api/public/athletes/${id}`);

    it('no se publica sin un consentimiento de publicación vigente', async () => {
      const id = (await create(adult()).expect(201)).body.id as string;
      await consent(id).expect(201); // otro tipo de consentimiento no basta
      await publish(id).expect(409);
      await publicProfile(id).expect(404);
    });

    it('publicado, muestra solo el nombre y el club, sin indexación ni datos personales', async () => {
      const id = (await create(adult()).expect(201)).body.id as string;
      await consent(id, { type: 'publicacion_perfil' }).expect(201);
      await publish(id).expect(200);

      const res = await publicProfile(id).expect(200);
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(res.body).toEqual({
        id,
        displayName: 'María José Pérez Andrade',
        club: { name: 'Club Uno', slug: 'club-uno' },
      });
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(cedula('171003406'));
      expect(text).not.toContain('99 123');
      expect(text).not.toMatch(/birth|phone|guardian|idNumber|eligibility/i);
    });

    it('revocar el consentimiento, inactivar o dejar vencer el consentimiento retira el perfil', async () => {
      const id = (await create(adult()).expect(201)).body.id as string;
      const granted = await consent(id, { type: 'publicacion_perfil' }).expect(
        201,
      );
      await publish(id).expect(200);
      await publicProfile(id).expect(200);

      await api()
        .post(`/api/athletes/${id}/consents/${granted.body[0].id}/revoke`)
        .send({ reason: 'retira la autorización' })
        .expect(201);
      expect(
        (await prisma.athlete.findUniqueOrThrow({ where: { id } }))
          .publicProfile,
      ).toBe(false);
      await publicProfile(id).expect(404);

      // vencimiento: se comprueba también al leer, sin depender de una tarea programada
      await consent(id, { type: 'publicacion_perfil' }).expect(201);
      await publish(id).expect(200);
      await prisma.consentRecord.updateMany({
        where: { type: 'publicacion_perfil', status: 'otorgado' },
        data: {
          recordedAt: new Date(Date.now() - 86_400_000),
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      await publicProfile(id).expect(404);

      // inactivar
      await prisma.consentRecord.updateMany({ data: { expiresAt: null } });
      await publicProfile(id).expect(200);
      await api()
        .patch(`/api/athletes/${id}/status`)
        .send({ status: 'inactivo', reason: 'se retiró' })
        .expect(200);
      expect(
        (await prisma.athlete.findUniqueOrThrow({ where: { id } }))
          .publicProfile,
      ).toBe(false);
      await publicProfile(id).expect(404);
    });

    it('publicar exige el permiso específico y un club activo', async () => {
      const id = (await create(adult()).expect(201)).body.id as string;
      await consent(id, { type: 'publicacion_perfil' }).expect(201);
      const manager = await leaderWith(t, prisma, SUMMARY, [club.id]);
      await authed(t, manager.session)
        .put(`/api/athletes/${id}/publication`)
        .send({ published: true })
        .expect(403);
      await publish(id).expect(200);
      await prisma.club.update({
        where: { id: club.id },
        data: { status: 'suspendido' },
      });
      await publicProfile(id).expect(404);
    });

    it('un identificador inexistente o mal formado no revela nada', async () => {
      await publicProfile('00000000-0000-7000-8000-000000000000').expect(404);
      await publicProfile('no-es-uuid').expect(400);
    });
  });

  describe('auditoría sin datos personales', () => {
    it('registra identificadores y nombres de campos, nunca nombres, documentos ni teléfonos', async () => {
      const id = (await create(adult()).expect(201)).body.id as string;
      await api()
        .patch(`/api/athletes/${id}`)
        .send({
          phone: '0987654321',
          guardianName: 'Tutor Secreto',
          lastName: 'Cambiado',
        })
        .expect(200);
      await consent(id, {
        purpose: 'Difusión en redes',
        type: 'publicacion_perfil',
      }).expect(201);
      await api()
        .patch(`/api/athletes/${id}/status`)
        .send({ status: 'inactivo', reason: 'cambio de ciudad' })
        .expect(200);

      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'athlete' },
      });
      expect(logs.map((l) => l.action).sort()).toEqual([
        'athlete.consent_recorded',
        'athlete.create',
        'athlete.status_change',
        'athlete.update',
      ]);
      const text = JSON.stringify(logs);
      for (const secret of [
        cedula('171003406'),
        '0987654321',
        '99 123',
        'Tutor Secreto',
        'Cambiado',
        'Pérez',
        'María',
        'Difusión',
      ]) {
        expect(text, secret).not.toContain(secret);
      }
      const update = logs.find((l) => l.action === 'athlete.update');
      expect(update?.afterSnapshot).toMatchObject({
        changedFields: expect.arrayContaining([
          'phone',
          'guardianName',
          'lastName',
        ]),
      });
    });

    it('una actualización sin cambios reales no genera auditoría', async () => {
      const id = (await create(adult()).expect(201)).body.id as string;
      await api()
        .patch(`/api/athletes/${id}`)
        .send({ firstName: 'María José' })
        .expect(200);
      expect(await audits('athlete.update')).toHaveLength(0);
    });
  });

  describe('búsqueda por cédula y vínculos con Quero', () => {
    const lookup = (idNumber: string, a = api()) =>
      a.get('/api/athletes/lookup').query({ idType: 'cedula', idNumber });

    it('una cédula nueva no tiene coincidencias y el Registro Civil figura sin convenio', async () => {
      const res = await lookup(cedula('171003406')).expect(200);
      expect(res.body).toEqual({
        existing: null,
        registry: { configured: false, record: null },
      });
      const good = cedula('171003406');
      const bad = good.slice(0, 9) + String((Number(good[9]) + 1) % 10);
      await lookup(bad).expect(400);
    });

    it('encuentra al deportista ya registrado y oculta su nombre a quien no accede a su club', async () => {
      const created = await create(adult()).expect(201);
      const res = await lookup(cedula('171003406')).expect(200);
      expect(res.body.existing).toEqual({
        kind: 'athlete',
        athlete: {
          id: created.body.id,
          code: 'DEP-000001',
          firstName: 'María José',
          lastName: 'Pérez Andrade',
        },
        club: { name: 'Club Uno' },
      });

      const other = await createClub(prisma, 'Club Dos');
      const leader = await leaderWith(
        t,
        prisma,
        ['athletes:read', 'athletes:read_full', 'athletes:manage'],
        [other.id],
      );
      const hidden = await lookup(
        cedula('171003406'),
        authed(t, leader.session),
      ).expect(200);
      expect(hidden.body.existing).toEqual({
        kind: 'athlete',
        athlete: null,
        club: { name: 'Club Uno' },
      });
    });

    it('sin datos personales completos no se puede buscar por documento', async () => {
      const leader = await leaderWith(t, prisma, SUMMARY, [club.id]);
      await lookup(cedula('171003406'), authed(t, leader.session)).expect(403);
    });

    it('guarda, reemplaza y valida los vínculos sin registrar familiares en la auditoría', async () => {
      const { body } = await create(adult()).expect(201);
      const url = `/api/athletes/${body.id}/origin-links`;

      await api()
        .put(url)
        .send({ links: [{ kind: 'matrimonio' }] })
        .expect(400);
      await api()
        .put(url)
        .send({ links: [{ kind: 'nacimiento' }, { kind: 'nacimiento' }] })
        .expect(400);

      const saved = await api()
        .put(url)
        .send({
          links: [
            {
              kind: 'nacimiento',
              birthPlace: 'Quero',
              relatedName: 'Ignorado',
            },
            {
              kind: 'madre',
              relatedName: 'Rosa Andrade',
              relatedIdNumber: '1800000000',
              birthPlace: 'Yanayacu, Quero',
            },
          ],
        })
        .expect(200);
      expect(saved.body).toMatchObject([
        {
          kind: 'nacimiento',
          relatedName: null,
          birthPlace: 'Quero',
          source: 'manual',
        },
        {
          kind: 'madre',
          relatedName: 'Rosa Andrade',
          relatedIdNumber: '1800000000',
        },
      ]);
      expect((await api().get(url).expect(200)).body).toHaveLength(2);

      const leader = await leaderWith(t, prisma, SUMMARY, [club.id]);
      await authed(t, leader.session).get(url).expect(403);

      await api().put(url).send({ links: [] }).expect(200);
      expect((await api().get(url).expect(200)).body).toEqual([]);

      const logged = JSON.stringify(await audits('athlete.origin_links'));
      expect(logged).toContain('madre');
      expect(logged).not.toContain('Rosa Andrade');
    });
  });
});
