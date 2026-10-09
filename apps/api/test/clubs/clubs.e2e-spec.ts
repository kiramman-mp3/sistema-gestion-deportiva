import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { TEST_ORIGIN, createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import {
  adminWith,
  authed,
  cedula,
  createClub,
  createUser,
  leaderWith,
  login,
  seedCatalog,
} from '../support/fixtures.js';

const LEAGUE = [
  'clubs:read',
  'clubs:manage',
  'clubs:delete',
  'clubs:access_all',
];
const LEADER = ['clubs:read', 'clubs:manage'];

describe('clubes', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let league: Awaited<ReturnType<typeof adminWith>>;
  const api = () => authed(t, league.session);

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    league = await adminWith(t, prisma, LEAGUE);
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  const create = (body: Record<string, unknown>) =>
    api().post('/api/clubs').send(body);
  const audits = (action: string) =>
    prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });

  describe('alta y validación', () => {
    it('crea un club con identificador público estable y lo audita', async () => {
      const res = await create({
        name: '  Deportivo   Quero ',
        shortName: 'DQ',
        code: 'DQ-01',
        sector: 'Centro',
        contactEmail: 'Contacto@Quero.EC',
        contactPhone: '+593 3 275 0000',
      }).expect(201);
      expect(res.body).toMatchObject({
        name: 'Deportivo Quero',
        shortName: 'DQ',
        slug: 'deportivo-quero',
        code: 'DQ-01',
        sector: 'Centro',
        contactEmail: 'contacto@quero.ec',
        status: 'activo',
      });
      const [log] = await audits('club.create');
      expect(log).toMatchObject({
        userId: league.user.id,
        entityType: 'club',
        entityId: res.body.id,
      });
    });

    it('rechaza nombres duplicados aunque cambien mayúsculas, tildes, signos o espacios', async () => {
      await create({ name: 'Atlético Quero' }).expect(201);
      for (const name of [
        'atletico quero',
        'ATLÉTICO   QUERO!',
        'Atlético-Quero',
      ]) {
        const res = await create({ name }).expect(409);
        expect(res.body.message).toBe('Ya existe un club con ese nombre');
      }
      expect(await prisma.club.count()).toBe(1);
    });

    it('genera un identificador distinto cuando coincide el de otro club', async () => {
      await create({ name: 'Club Sur' }).expect(201);
      // Nombre distinto cuyo slug coincidiría solo si se ignoraran las diferencias reales
      const other = await create({ name: 'Club Sur 2' }).expect(201);
      expect(other.body.slug).toBe('club-sur-2');
    });

    it('rechaza código duplicado, formatos inválidos y campos protegidos', async () => {
      await create({ name: 'Club Uno', code: 'C-1' }).expect(201);
      expect(
        (await create({ name: 'Club Dos', code: 'C-1' }).expect(409)).body
          .message,
      ).toBe('Ya existe un club con ese código institucional');
      for (const body of [
        {},
        { name: '   ' },
        { name: 'x'.repeat(101) },
        { name: 'Ok', contactEmail: 'no-es-correo' },
        { name: 'Ok', contactPhone: 'abc' },
        { name: 'Ok', code: 'con espacio' },
        { name: 'Ok', slug: 'forzado' },
        { name: 'Ok', status: 'archivado' },
        { name: 'Ok', id: '0197aaaa-0000-7000-8000-000000000000' },
      ]) {
        await create(body).expect(400);
      }
    });

    it('dos altas simultáneas del mismo club producen uno solo', async () => {
      const results = await Promise.all([
        create({ name: 'Club Veloz' }),
        create({ name: 'Club Veloz' }),
        create({ name: 'club veloz' }),
      ]);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(await prisma.club.count()).toBe(1);
    });
  });

  describe('edición, estado y eliminación', () => {
    it('edita datos sin cambiar el identificador público, y audita antes/después', async () => {
      const { body: club } = await create({ name: 'Club Norte' }).expect(201);
      const res = await api()
        .patch(`/api/clubs/${club.id}`)
        .send({
          name: 'Club Norte Unido',
          sector: 'Barrio Alto',
          contactPhone: null,
        })
        .expect(200);
      expect(res.body).toMatchObject({
        name: 'Club Norte Unido',
        slug: 'club-norte',
        sector: 'Barrio Alto',
        contactPhone: null,
      });
      const [log] = await audits('club.update');
      expect(log).toMatchObject({
        beforeSnapshot: { name: 'Club Norte' },
        afterSnapshot: { name: 'Club Norte Unido', sector: 'Barrio Alto' },
      });
      await api()
        .patch(`/api/clubs/${club.id}`)
        .send({ slug: 'otro' })
        .expect(400);
      await api().patch(`/api/clubs/${club.id}`).send({}).expect(400);
      await api()
        .patch(`/api/clubs/${club.id}`)
        .send({ name: 'Club Norte Unido' })
        .expect(200);
      expect(await audits('club.update')).toHaveLength(1);
    });

    it('impide renombrar a un nombre ya usado', async () => {
      await create({ name: 'Club A' }).expect(201);
      const { body: b } = await create({ name: 'Club B' }).expect(201);
      await api()
        .patch(`/api/clubs/${b.id}`)
        .send({ name: 'club a' })
        .expect(409);
    });

    it('cambia el estado con motivo obligatorio y lo audita', async () => {
      const { body: club } = await create({ name: 'Club Estado' }).expect(201);
      await api()
        .patch(`/api/clubs/${club.id}/status`)
        .send({ status: 'suspendido' })
        .expect(400);
      const res = await api()
        .patch(`/api/clubs/${club.id}/status`)
        .send({ status: 'suspendido', reason: 'Sanción disciplinaria' })
        .expect(200);
      expect(res.body.status).toBe('suspendido');
      expect((await audits('club.status_change'))[0]).toMatchObject({
        reason: 'Sanción disciplinaria',
        afterSnapshot: { status: 'suspendido' },
      });
      await api()
        .patch(`/api/clubs/${club.id}/status`)
        .send({ status: 'eliminado', reason: 'prueba' })
        .expect(400);
    });

    it('elimina un club sin uso y bloquea el que tiene representantes o deportistas', async () => {
      const free = await createClub(prisma, 'Club Libre');
      await api().delete(`/api/clubs/${free.id}`).expect(204);
      expect(await audits('club.delete')).toHaveLength(1);

      const { body: busy } = await create({ name: 'Club Ocupado' }).expect(201);
      await api()
        .post(`/api/clubs/${busy.id}/representatives`)
        .send({
          firstName: 'Ana',
          lastName: 'Pérez',
          roleName: 'Presidente',
          validFrom: '2026-01-01',
        })
        .expect(201);
      const res = await api().delete(`/api/clubs/${busy.id}`).expect(409);
      expect(res.body.message).toContain('Archívelo en su lugar');
      expect(await prisma.club.count({ where: { id: busy.id } })).toBe(1);
    });
  });

  describe('permisos independientes', () => {
    it.each([
      [
        'clubs:read',
        { list: 200, create: 403, update: 403, status: 403, remove: 403 },
      ],
      [
        'clubs:manage',
        { list: 403, create: 403, update: 404, status: 403, remove: 403 },
      ],
      [
        'clubs:access_all',
        { list: 403, create: 403, update: 403, status: 403, remove: 403 },
      ],
    ])('con solo %s', async (permission, expected) => {
      const actor = await adminWith(t, prisma, [permission]);
      const club = await createClub(prisma);
      const a = authed(t, actor.session);
      expect((await a.get('/api/clubs')).status).toBe(expected.list);
      expect((await a.post('/api/clubs').send({ name: 'Nuevo' })).status).toBe(
        expected.create,
      );
      expect(
        (await a.patch(`/api/clubs/${club.id}`).send({ sector: 'X' })).status,
      ).toBe(expected.update);
      expect(
        (
          await a
            .patch(`/api/clubs/${club.id}/status`)
            .send({ status: 'inactivo', reason: 'prueba' })
        ).status,
      ).toBe(expected.status);
      expect((await a.delete(`/api/clubs/${club.id}`)).status).toBe(
        expected.remove,
      );
    });

    it('crear, cambiar estado y eliminar exigen además acceso a todos los clubes', async () => {
      const manager = await leaderWith(t, prisma, [
        'clubs:read',
        'clubs:manage',
        'clubs:delete',
      ]);
      const a = authed(t, manager.session);
      const club = await createClub(prisma);
      await a.post('/api/clubs').send({ name: 'Intento' }).expect(403);
      await a
        .patch(`/api/clubs/${club.id}/status`)
        .send({ status: 'inactivo', reason: 'prueba' })
        .expect(403);
      await a.delete(`/api/clubs/${club.id}`).expect(403);
    });

    it('sin sesión todo responde 401', async () => {
      await t.http().get('/api/clubs').expect(401);
      await t
        .http()
        .post('/api/clubs')
        .set('Origin', TEST_ORIGIN)
        .send({ name: 'x' })
        .expect(401);
    });
  });

  describe('alcance por club (un dirigente solo alcanza a su club)', () => {
    it('lista, lee y edita únicamente los clubes vinculados; los demás responden 404', async () => {
      const mine = await createClub(prisma, 'Mi Club');
      const other = await createClub(prisma, 'Club Ajeno');
      const leader = await leaderWith(t, prisma, LEADER, [mine.id]);
      const a = authed(t, leader.session);

      const list = await a.get('/api/clubs').expect(200);
      expect(list.body.items.map((c: { id: string }) => c.id)).toEqual([
        mine.id,
      ]);
      expect(list.body.total).toBe(1);

      await a.get(`/api/clubs/${mine.id}`).expect(200);
      await a
        .patch(`/api/clubs/${mine.id}`)
        .send({ sector: 'Centro' })
        .expect(200);
      // IDOR: el club ajeno no existe para este usuario (ni se revela que existe)
      await a.get(`/api/clubs/${other.id}`).expect(404);
      await a
        .patch(`/api/clubs/${other.id}`)
        .send({ sector: 'Hackeado' })
        .expect(404);
      await a.get(`/api/clubs/${other.id}/representatives`).expect(404);
      await a
        .post(`/api/clubs/${other.id}/representatives`)
        .send({
          firstName: 'A',
          lastName: 'B',
          roleName: 'X',
          validFrom: '2026-01-01',
        })
        .expect(404);
      expect(
        (await prisma.club.findUniqueOrThrow({ where: { id: other.id } }))
          .sector,
      ).toBeNull();
    });

    it('un usuario sin vínculos no ve ningún club, y con acceso a todos los ve todos', async () => {
      await createClub(prisma);
      await createClub(prisma);
      const none = await leaderWith(t, prisma, LEADER, []);
      expect(
        (await authed(t, none.session).get('/api/clubs').expect(200)).body
          .total,
      ).toBe(0);
      expect((await api().get('/api/clubs').expect(200)).body.total).toBe(2);
    });

    it('el alcance se aplica de inmediato al vincular o desvincular, sin nuevo inicio de sesión', async () => {
      const club = await createClub(prisma);
      const leader = await leaderWith(t, prisma, LEADER, []);
      const a = authed(t, leader.session);
      await a.get(`/api/clubs/${club.id}`).expect(404);
      await api()
        .put(`/api/clubs/${club.id}/users/${leader.user.id}`)
        .expect(204);
      await a.get(`/api/clubs/${club.id}`).expect(200);
      await api()
        .delete(`/api/clubs/${club.id}/users/${leader.user.id}`)
        .expect(204);
      await a.get(`/api/clubs/${club.id}`).expect(404);
    });
  });

  describe('usuarios vinculados', () => {
    it('vincula y desvincula con auditoría, evita duplicados y exige un usuario válido', async () => {
      const club = await createClub(prisma);
      const user = await createUser(prisma, {
        email: 'dirigente@liga.example',
      });
      await api().put(`/api/clubs/${club.id}/users/${user.id}`).expect(204);
      await api().put(`/api/clubs/${club.id}/users/${user.id}`).expect(409);
      const list = await api().get(`/api/clubs/${club.id}/users`).expect(200);
      expect(list.body).toEqual([
        expect.objectContaining({
          id: user.id,
          email: 'dirigente@liga.example',
        }),
      ]);
      expect(JSON.stringify(list.body)).not.toMatch(/passwordHash|argon2/i);
      expect((await audits('club.user_linked'))[0]).toMatchObject({
        userId: league.user.id,
        entityId: club.id,
        afterSnapshot: { userId: user.id },
      });

      await api().delete(`/api/clubs/${club.id}/users/${user.id}`).expect(204);
      await api().delete(`/api/clubs/${club.id}/users/${user.id}`).expect(404);
      expect(await audits('club.user_unlinked')).toHaveLength(1);

      await api()
        .put(`/api/clubs/${club.id}/users/0197aaaa-0000-7000-8000-000000000000`)
        .expect(404);
      const off = await createUser(prisma, { status: 'inactivo' });
      await api().put(`/api/clubs/${club.id}/users/${off.id}`).expect(409);
      await api().put(`/api/clubs/${club.id}/users/no-uuid`).expect(400);
    });

    it('nadie modifica sus propios vínculos', async () => {
      const club = await createClub(prisma);
      await api()
        .put(`/api/clubs/${club.id}/users/${league.user.id}`)
        .expect(403);
      await api()
        .delete(`/api/clubs/${club.id}/users/${league.user.id}`)
        .expect(403);
    });

    it('un dirigente solo vincula usuarios a su propio club y requiere clubs:manage', async () => {
      const mine = await createClub(prisma);
      const other = await createClub(prisma);
      const leader = await leaderWith(t, prisma, LEADER, [mine.id]);
      const colleague = await createUser(prisma);
      await authed(t, leader.session)
        .put(`/api/clubs/${mine.id}/users/${colleague.id}`)
        .expect(204);
      await authed(t, leader.session)
        .put(`/api/clubs/${other.id}/users/${colleague.id}`)
        .expect(404);
      const reader = await leaderWith(t, prisma, ['clubs:read'], [mine.id]);
      await authed(t, reader.session)
        .put(`/api/clubs/${mine.id}/users/${colleague.id}`)
        .expect(403);
      await authed(t, reader.session)
        .get(`/api/clubs/${mine.id}/users`)
        .expect(403);
    });

    it('si dos vínculos simultáneos al mismo usuario: uno solo prospera', async () => {
      const club = await createClub(prisma);
      const user = await createUser(prisma);
      const res = await Promise.all([
        api().put(`/api/clubs/${club.id}/users/${user.id}`),
        api().put(`/api/clubs/${club.id}/users/${user.id}`),
      ]);
      expect(res.map((r) => r.status).sort((x, y) => x - y)).toEqual([
        204, 409,
      ]);
    });
  });

  describe('representantes', () => {
    const body = (over: Record<string, unknown> = {}) => ({
      firstName: ' María ',
      lastName: 'Gómez',
      roleName: 'Presidenta',
      validFrom: '2026-01-01',
      ...over,
    });

    it('registra un representante con su periodo, y no expone el documento', async () => {
      const club = await createClub(prisma);
      const doc = cedula('171003406');
      const res = await api()
        .post(`/api/clubs/${club.id}/representatives`)
        .send(body({ idType: 'cedula', idNumber: doc, phone: '0999999999' }))
        .expect(201);
      expect(res.body).toMatchObject({
        roleName: 'Presidenta',
        validFrom: '2026-01-01',
        validUntil: null,
        active: true,
      });
      expect(res.body.person).toMatchObject({
        firstName: 'María',
        lastName: 'Gómez',
        phone: '0999999999',
      });
      expect(JSON.stringify(res.body)).not.toContain(doc);

      const list = await api()
        .get(`/api/clubs/${club.id}/representatives`)
        .expect(200);
      expect(JSON.stringify(list.body)).not.toContain(doc);
      const private_ = await prisma.personPrivateData.findFirstOrThrow({
        where: { idNumber: doc },
      });
      expect(private_.idKey).toBe(`cedula:${doc}`);
      expect(await audits('club.representative_added')).toHaveLength(1);
      expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain(
        doc,
      );
    });

    it('reutiliza a la persona si el documento ya existe (no la duplica)', async () => {
      const a = await createClub(prisma);
      const b = await createClub(prisma);
      const doc = cedula('171003406');
      await api()
        .post(`/api/clubs/${a.id}/representatives`)
        .send(body({ idType: 'cedula', idNumber: doc }))
        .expect(201);
      await api()
        .post(`/api/clubs/${b.id}/representatives`)
        .send(
          body({
            idType: 'cedula',
            idNumber: ` ${doc.slice(0, 5)}-${doc.slice(5)} `,
            roleName: 'Delegada',
          }),
        )
        .expect(201);
      expect(await prisma.person.count()).toBe(1);
      expect(await prisma.clubRepresentative.count()).toBe(2);
      expect(
        (await audits('club.representative_added'))[1]!.afterSnapshot,
      ).toMatchObject({ reusedPerson: true });
    });

    it('valida la cédula, el par tipo/número, las fechas y los campos', async () => {
      const club = await createClub(prisma);
      const post = (over: Record<string, unknown>) =>
        api().post(`/api/clubs/${club.id}/representatives`).send(body(over));
      await post({ idType: 'cedula', idNumber: '1710034060' }).expect(400); // verificador incorrecto
      await post({ idType: 'cedula', idNumber: '99100340650' }).expect(400);
      await post({ idNumber: '1234567' }).expect(400);
      await post({ idType: 'pasaporte' }).expect(400);
      await post({ validFrom: '2026-02-30' }).expect(400);
      await post({ validUntil: '2025-12-31' }).expect(400);
      await post({ roleName: '  ' }).expect(400);
      await post({ firstName: '' }).expect(400);
      await post({ birthDate: '2000-01-01' }).expect(400); // no se piden datos de nacimiento
      await post({ guardianName: 'X' }).expect(400);
      await post({ idType: 'pasaporte', idNumber: 'AB123456' }).expect(201);
      expect(await prisma.clubRepresentative.count()).toBe(1);
    });

    it('termina o corrige una representación y audita el cambio', async () => {
      const club = await createClub(prisma);
      const { body: rep } = await api()
        .post(`/api/clubs/${club.id}/representatives`)
        .send(body())
        .expect(201);
      const res = await api()
        .patch(`/api/clubs/${club.id}/representatives/${rep.id}`)
        .send({ validUntil: '2026-06-30', roleName: 'Delegada' })
        .expect(200);
      expect(res.body).toMatchObject({
        roleName: 'Delegada',
        validUntil: '2026-06-30',
        active: false,
      });
      expect((await audits('club.representative_updated'))[0]).toMatchObject({
        beforeSnapshot: { roleName: 'Presidenta' },
        afterSnapshot: { roleName: 'Delegada', validUntil: '2026-06-30' },
      });
      await api()
        .patch(`/api/clubs/${club.id}/representatives/${rep.id}`)
        .send({ validUntil: '2025-01-01' })
        .expect(409);
      await api()
        .patch(`/api/clubs/${club.id}/representatives/${rep.id}`)
        .send({})
        .expect(400);
      await api()
        .patch(
          `/api/clubs/${club.id}/representatives/0197aaaa-0000-7000-8000-000000000000`,
        )
        .send({ roleName: 'X' })
        .expect(404);
    });

    it('un representante de otro club no se alcanza con el identificador de este (IDOR)', async () => {
      const mine = await createClub(prisma);
      const other = await createClub(prisma);
      const { body: rep } = await api()
        .post(`/api/clubs/${other.id}/representatives`)
        .send(body())
        .expect(201);
      const leader = await leaderWith(t, prisma, LEADER, [mine.id]);
      await authed(t, leader.session)
        .patch(`/api/clubs/${mine.id}/representatives/${rep.id}`)
        .send({ roleName: 'Hackeado' })
        .expect(404);
      expect(
        (
          await prisma.clubRepresentative.findUniqueOrThrow({
            where: { id: rep.id },
          })
        ).roleName,
      ).toBe('Presidenta');
    });

    it('eliminar un registro erróneo exige acceso a todos los clubes', async () => {
      const club = await createClub(prisma);
      const { body: rep } = await api()
        .post(`/api/clubs/${club.id}/representatives`)
        .send(body())
        .expect(201);
      const leader = await leaderWith(t, prisma, LEADER, [club.id]);
      await authed(t, leader.session)
        .delete(`/api/clubs/${club.id}/representatives/${rep.id}`)
        .expect(403);
      await api()
        .delete(`/api/clubs/${club.id}/representatives/${rep.id}`)
        .expect(204);
      expect(await audits('club.representative_removed')).toHaveLength(1);
    });
  });

  describe('información pública', () => {
    it('lista solo clubes activos con campos autorizados, sin sesión', async () => {
      await prisma.club.create({
        data: {
          name: 'Club Público',
          nameKey: 'club publico',
          slug: 'club-publico',
          shortName: 'CP',
          sector: 'Centro',
          contactEmail: 'privado@club.ec',
          contactPhone: '0999999999',
          code: 'INT-9',
        },
      });
      await createClub(prisma, 'Club Oculto', 'inactivo');
      await createClub(prisma, 'Club Suspendido', 'suspendido');
      const res = await t.http().get('/api/public/clubs').expect(200);
      expect(res.body.items).toEqual([
        {
          name: 'Club Público',
          shortName: 'CP',
          slug: 'club-publico',
          sector: 'Centro',
        },
      ]);
      const dump = JSON.stringify(res.body);
      for (const secret of [
        'privado@club.ec',
        '0999999999',
        'INT-9',
        'id"',
        'nameKey',
      ])
        expect(dump).not.toContain(secret);

      const one = await t
        .http()
        .get('/api/public/clubs/club-publico')
        .expect(200);
      expect(Object.keys(one.body).sort()).toEqual([
        'name',
        'sector',
        'shortName',
        'slug',
      ]);
      await t.http().get('/api/public/clubs/club-oculto').expect(404);
      await t.http().get('/api/public/clubs/no-existe').expect(404);
    });
  });

  it('mantiene el inicio de sesión de los usuarios de club (regresión)', async () => {
    const club = await createClub(prisma);
    const leader = await leaderWith(t, prisma, LEADER, [club.id]);
    await login(t, leader.user.email);
  });
});
