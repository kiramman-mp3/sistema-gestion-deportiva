import { createHash } from 'node:crypto';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { TEST_ORIGIN, createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import {
  PASSWORD,
  adminWith,
  authed,
  createUser,
  login,
  seedCatalog,
} from '../support/fixtures.js';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const ALL_USER_PERMS = [
  'users:read',
  'users:create',
  'users:update',
  'roles:manage',
];

describe('administración de usuarios', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof adminWith>>;
  const api = () => authed(t, admin.session);

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    admin = await adminWith(t, prisma, ALL_USER_PERMS);
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  const create = (email: string, displayName = 'Persona Nueva') =>
    api().post('/api/users').send({ email, displayName });
  const audits = (action: string) =>
    prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });

  describe('creación', () => {
    it('crea una cuenta pendiente, sin contraseña ni roles, con un enlace de activación de un solo uso', async () => {
      const res = await create(
        '  Nueva.Persona@Liga.Example ',
        '  Nueva   Persona ',
      ).expect(201);

      expect(res.body.user).toMatchObject({
        email: 'nueva.persona@liga.example',
        displayName: 'Nueva Persona',
        status: 'pendiente',
        roles: [],
        lastLoginAt: null,
      });
      expect(res.body.activation).toMatchObject({ kind: 'activacion' });
      expect(res.body.activation.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(new Date(res.body.activation.expiresAt).getTime()).toBeGreaterThan(
        Date.now(),
      );

      const row = await prisma.user.findUniqueOrThrow({
        where: { id: res.body.user.id },
      });
      expect(row.passwordHash).toBeNull();
      expect(await prisma.userRole.count({ where: { userId: row.id } })).toBe(
        0,
      );

      // Del token solo se guarda su hash
      const stored = await prisma.credentialToken.findFirstOrThrow({
        where: { userId: row.id },
      });
      expect(stored.tokenHash).toBe(sha256(res.body.activation.token));
      expect(JSON.stringify(stored)).not.toContain(res.body.activation.token);
      expect(stored.createdById).toBe(admin.user.id);
    });

    it('audita la creación sin incluir el token ni contraseñas', async () => {
      const res = await create('nueva@liga.example').expect(201);
      const [log] = await audits('user.create');
      expect(log).toMatchObject({
        userId: admin.user.id,
        entityType: 'user',
        entityId: res.body.user.id,
        afterSnapshot: {
          email: 'nueva@liga.example',
          displayName: 'Persona Nueva',
          status: 'pendiente',
        },
      });
      const dump = JSON.stringify(await prisma.auditLog.findMany());
      expect(dump).not.toContain(res.body.activation.token);
      expect(dump).not.toMatch(/argon2/);
    });

    it('la cuenta pendiente no puede iniciar sesión', async () => {
      await create('nueva@liga.example').expect(201);
      await t
        .http()
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .send({ email: 'nueva@liga.example', password: PASSWORD })
        .expect(401);
    });

    it('rechaza correos duplicados (también en otra capitalización) con 409', async () => {
      await create('persona@liga.example').expect(201);
      for (const email of [
        'persona@liga.example',
        'PERSONA@liga.example',
        ' persona@LIGA.example ',
      ]) {
        const res = await create(email).expect(409);
        expect(res.body.message).toBe('Ya existe un usuario con ese correo');
      }
      expect(
        await prisma.user.count({ where: { email: 'persona@liga.example' } }),
      ).toBe(1);
    });

    it('valida los datos y rechaza asignación masiva de campos protegidos', async () => {
      const bad: Record<string, unknown>[] = [
        {},
        { email: 'no-es-correo', displayName: 'X' },
        { email: 'a@b.co', displayName: '   ' },
        { email: 'a@b.co', displayName: 'x'.repeat(121) },
        {
          email: 'a@b.co',
          displayName: 'X',
          password: 'una-contraseña-larga-1',
        },
        { email: 'a@b.co', displayName: 'X', passwordHash: 'x' },
        { email: 'a@b.co', displayName: 'X', status: 'activo' },
        { email: 'a@b.co', displayName: 'X', roles: ['superadmin'] },
        { email: 'a@b.co', displayName: 'X', roleIds: ['x'] },
        {
          email: 'a@b.co',
          displayName: 'X',
          id: '0197aaaa-0000-7000-8000-000000000000',
        },
      ];
      for (const body of bad) {
        await api().post('/api/users').send(body).expect(400);
      }
      expect(await prisma.user.count()).toBe(1); // solo el administrador
    });

    it('un usuario nunca se crea con privilegios', async () => {
      const res = await create('nueva@liga.example').expect(201);
      expect(
        await prisma.userRole.count({ where: { userId: res.body.user.id } }),
      ).toBe(0);
    });
  });

  describe('lectura', () => {
    beforeEach(async () => {
      const role = await prisma.role.create({
        data: { code: 'consulta', name: 'Consulta' },
      });
      const ana = await createUser(prisma, {
        email: 'ana@liga.example',
        displayName: 'Ana Pérez',
      });
      await createUser(prisma, {
        email: 'luis@liga.example',
        displayName: 'Luis Gómez',
        status: 'inactivo',
      });
      await createUser(prisma, {
        email: 'carla@otro.example',
        displayName: 'Carla Ruiz',
      });
      await prisma.userRole.create({
        data: { userId: ana.id, roleId: role.id },
      });
    });

    it('lista paginado, ordenado por nombre, con roles y sin datos sensibles', async () => {
      const res = await api().get('/api/users?pageSize=2').expect(200);
      expect(res.body).toMatchObject({ page: 1, pageSize: 2, total: 4 });
      expect(
        res.body.items.map((u: { displayName: string }) => u.displayName),
      ).toEqual(['Ana Pérez', 'Carla Ruiz']);
      expect(res.body.items[0].roles).toEqual([
        expect.objectContaining({ code: 'consulta', name: 'Consulta' }),
      ]);

      const full = await api().get('/api/users').expect(200);
      const dump = JSON.stringify(full.body);
      expect(dump).not.toMatch(
        /passwordHash|password_hash|argon2|tokenHash|csrf/i,
      );
      for (const user of full.body.items) {
        expect(Object.keys(user).sort()).toEqual(
          [
            'createdAt',
            'displayName',
            'email',
            'id',
            'lastLoginAt',
            'roles',
            'status',
            'updatedAt',
          ].sort(),
        );
      }
    });

    it('filtra por estado, rol y texto (nombre o correo, literal)', async () => {
      expect(
        (await api().get('/api/users?status=inactivo').expect(200)).body.total,
      ).toBe(1);
      const role = await prisma.role.findUniqueOrThrow({
        where: { code: 'consulta' },
      });
      const byRole = await api()
        .get(`/api/users?roleId=${role.id}`)
        .expect(200);
      expect(byRole.body.items.map((u: { email: string }) => u.email)).toEqual([
        'ana@liga.example',
      ]);
      expect(
        (await api().get('/api/users?q=GÓMEZ').expect(200)).body.total,
      ).toBe(1);
      expect(
        (await api().get('/api/users?q=otro.example').expect(200)).body.total,
      ).toBe(1);
      expect((await api().get('/api/users?q=%25').expect(200)).body.total).toBe(
        0,
      );
      await api().get('/api/users?status=eliminado').expect(400);
      await api().get('/api/users?roleId=no-uuid').expect(400);
      await api().get('/api/users?page=0').expect(400);
    });

    it('devuelve el detalle, 404 e id inválido', async () => {
      const ana = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@liga.example' },
      });
      const res = await api().get(`/api/users/${ana.id}`).expect(200);
      expect(res.body).toMatchObject({
        email: 'ana@liga.example',
        status: 'activo',
      });
      await api()
        .get('/api/users/0197aaaa-0000-7000-8000-000000000000')
        .expect(404);
      await api().get('/api/users/xyz').expect(400);
    });
  });

  describe('edición', () => {
    it('modifica nombre y correo y audita antes/después', async () => {
      const user = await createUser(prisma, {
        email: 'ana@liga.example',
        displayName: 'Ana',
      });
      const res = await api()
        .patch(`/api/users/${user.id}`)
        .send({ displayName: 'Ana María', email: 'Ana.Maria@Liga.Example' })
        .expect(200);
      expect(res.body).toMatchObject({
        displayName: 'Ana María',
        email: 'ana.maria@liga.example',
      });
      const [log] = await audits('user.update');
      expect(log).toMatchObject({
        userId: admin.user.id,
        entityId: user.id,
        beforeSnapshot: { displayName: 'Ana', email: 'ana@liga.example' },
        afterSnapshot: {
          displayName: 'Ana María',
          email: 'ana.maria@liga.example',
        },
      });
    });

    it('rechaza un correo ya usado y campos protegidos (asignación masiva)', async () => {
      await createUser(prisma, { email: 'otra@liga.example' });
      const user = await createUser(prisma, { email: 'ana@liga.example' });
      await api()
        .patch(`/api/users/${user.id}`)
        .send({ email: 'otra@liga.example' })
        .expect(409);
      for (const body of [
        { status: 'bloqueado' },
        { passwordHash: 'x' },
        { password: 'una-contraseña-larga-1' },
        { roles: ['superadmin'] },
        { id: user.id },
        { lastLoginAt: null },
        {},
      ]) {
        await api().patch(`/api/users/${user.id}`).send(body).expect(400);
      }
      const row = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(row).toMatchObject({
        email: 'ana@liga.example',
        status: 'activo',
      });
    });

    it('no audita ni modifica cuando no hay cambios, y responde 404 si no existe', async () => {
      const user = await createUser(prisma, {
        email: 'ana@liga.example',
        displayName: 'Ana',
      });
      await api()
        .patch(`/api/users/${user.id}`)
        .send({ displayName: 'Ana' })
        .expect(200);
      expect(await audits('user.update')).toHaveLength(0);
      await api()
        .patch('/api/users/0197aaaa-0000-7000-8000-000000000000')
        .send({ displayName: 'X' })
        .expect(404);
    });

    it('no permite modificar la propia cuenta por esta vía', async () => {
      const res = await api()
        .patch(`/api/users/${admin.user.id}`)
        .send({ displayName: 'Yo' })
        .expect(403);
      expect(res.body.message).toBe(
        'No puede modificar su propia cuenta por esta vía',
      );
    });

    it('cambiar el correo anula el enlace pendiente emitido para el contacto anterior', async () => {
      const created = await create('vieja@liga.example').expect(201);
      await api()
        .patch(`/api/users/${created.body.user.id}`)
        .send({ email: 'nueva@liga.example' })
        .expect(200);
      await t
        .http()
        .post('/api/auth/password/complete')
        .set('Origin', TEST_ORIGIN)
        .send({
          token: created.body.activation.token,
          password: 'una-contraseña-larga-nueva',
        })
        .expect(400);
    });
  });

  describe('permisos independientes', () => {
    it.each([
      [
        'users:read',
        {
          list: 200,
          detail: 200,
          create: 403,
          update: 403,
          status: 403,
          sessions: 200,
        },
      ],
      [
        'users:create',
        {
          list: 403,
          detail: 403,
          create: 201,
          update: 403,
          status: 403,
          sessions: 403,
        },
      ],
      [
        'users:update',
        {
          list: 403,
          detail: 403,
          create: 403,
          update: 200,
          status: 200,
          sessions: 403,
        },
      ],
    ])('con solo %s', async (permission, expected) => {
      const actor = await adminWith(t, prisma, [permission]);
      const target = await createUser(prisma, {
        email: `objetivo-${permission.replace(':', '-')}@liga.example`,
      });
      const a = authed(t, actor.session);
      expect((await a.get('/api/users')).status).toBe(expected.list);
      expect((await a.get(`/api/users/${target.id}`)).status).toBe(
        expected.detail,
      );
      expect(
        (
          await a
            .post('/api/users')
            .send({ email: 'otro-nuevo@liga.example', displayName: 'Otro' })
        ).status,
      ).toBe(expected.create);
      expect(
        (
          await a
            .patch(`/api/users/${target.id}`)
            .send({ displayName: 'Nuevo nombre' })
        ).status,
      ).toBe(expected.update);
      expect(
        (
          await a
            .patch(`/api/users/${target.id}/status`)
            .send({ status: 'inactivo', reason: 'prueba' })
        ).status,
      ).toBe(expected.status);
      expect((await a.get(`/api/users/${target.id}/sessions`)).status).toBe(
        expected.sessions,
      );
    });

    it('sin sesión todo responde 401, y las escrituras sin CSRF 403', async () => {
      await t.http().get('/api/users').expect(401);
      await t
        .http()
        .post('/api/users')
        .set('Origin', TEST_ORIGIN)
        .send({})
        .expect(401);
      await t
        .http()
        .post('/api/users')
        .set('Cookie', admin.session.cookie)
        .set('Origin', TEST_ORIGIN)
        .send({ email: 'a@b.co', displayName: 'X' })
        .expect(403);
    });
  });

  describe('estado de la cuenta', () => {
    it('una cuenta desactivada no puede autenticarse y sus sesiones quedan revocadas al instante', async () => {
      const user = await createUser(prisma, {
        email: 'ana@liga.example',
        permissions: ['users:read'],
      });
      const session = await login(t, user.email);
      await authed(t, session).get('/api/users').expect(200);

      await api()
        .patch(`/api/users/${user.id}/status`)
        .send({ status: 'inactivo', reason: 'Baja' })
        .expect(200);
      await authed(t, session).get('/api/users').expect(401);
      await t
        .http()
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .send({ email: user.email, password: PASSWORD })
        .expect(401);

      await api()
        .patch(`/api/users/${user.id}/status`)
        .send({ status: 'activo', reason: 'Reincorporación' })
        .expect(200);
      await login(t, user.email);
    });

    it('no se puede activar una cuenta sin contraseña: hay que generar su enlace de activación', async () => {
      const created = await create('nueva@liga.example').expect(201);
      const res = await api()
        .patch(`/api/users/${created.body.user.id}/status`)
        .send({ status: 'activo', reason: 'Saltarse la activación' })
        .expect(409);
      expect(res.body.message).toContain('enlace de activación');
      expect(
        (
          await prisma.user.findUniqueOrThrow({
            where: { id: created.body.user.id },
          })
        ).status,
      ).toBe('pendiente');
      // 'pendiente' no es un estado que pueda fijarse por la API
      await api()
        .patch(`/api/users/${created.body.user.id}/status`)
        .send({ status: 'pendiente', reason: 'prueba' })
        .expect(400);
    });

    it('desactivar una cuenta pendiente anula su enlace de activación', async () => {
      const created = await create('nueva@liga.example').expect(201);
      await api()
        .patch(`/api/users/${created.body.user.id}/status`)
        .send({ status: 'inactivo', reason: 'Cancelada' })
        .expect(200);
      await t
        .http()
        .post('/api/auth/password/complete')
        .set('Origin', TEST_ORIGIN)
        .send({
          token: created.body.activation.token,
          password: 'una-contraseña-larga-nueva',
        })
        .expect(400);
    });
  });

  describe('sesiones', () => {
    it('lista las sesiones activas de un usuario sin exponer secretos', async () => {
      const user = await createUser(prisma, { email: 'ana@liga.example' });
      await login(t, user.email, PASSWORD, { 'User-Agent': 'Navegador/1.0' });
      await login(t, user.email);
      const res = await api().get(`/api/users/${user.id}/sessions`).expect(200);
      expect(res.body).toHaveLength(2);
      expect(JSON.stringify(res.body)).not.toMatch(/tokenHash|csrf|token/i);
      expect(
        res.body.map((s: { userAgent: string | null }) => s.userAgent),
      ).toContain('Navegador/1.0');
      await api()
        .get('/api/users/0197aaaa-0000-7000-8000-000000000000/sessions')
        .expect(404);
    });

    it('revoca una sesión concreta (solo de ese usuario) y lo audita con motivo', async () => {
      const user = await createUser(prisma, { email: 'ana@liga.example' });
      const other = await createUser(prisma, { email: 'luis@liga.example' });
      const s1 = await login(t, user.email);
      const s2 = await login(t, user.email);
      const so = await login(t, other.email);
      const rows = await prisma.session.findMany({
        where: { userId: user.id },
      });
      const target = rows.find((r) => r.tokenHash === sha256(s1.token))!;
      const foreign = await prisma.session.findFirstOrThrow({
        where: { userId: other.id },
      });

      // IDOR: la sesión de otro usuario no se revoca pasando el id de este
      await api()
        .post(`/api/users/${user.id}/sessions/${foreign.id}/revoke`)
        .send({ reason: 'prueba' })
        .expect(404);
      await authed(t, so).get('/api/auth/session').expect(200);

      await api()
        .post(`/api/users/${user.id}/sessions/${target.id}/revoke`)
        .send({ reason: 'Equipo compartido' })
        .expect(204);
      await authed(t, s1).get('/api/auth/session').expect(401);
      await authed(t, s2).get('/api/auth/session').expect(200);
      const [log] = await audits('auth.session_revoked_by_admin');
      expect(log).toMatchObject({
        userId: admin.user.id,
        entityId: target.id,
        reason: 'Equipo compartido',
      });
      expect(JSON.stringify(log)).not.toContain(s1.token);
      await api()
        .post(`/api/users/${user.id}/sessions/${target.id}/revoke`)
        .send({ reason: 'otra vez' })
        .expect(404);
      await api()
        .post(`/api/users/${user.id}/sessions/${target.id}/revoke`)
        .send({})
        .expect(400);
    });
  });

  describe('enlaces de contraseña', () => {
    it('genera un enlace de restablecimiento para una cuenta activa y anula el anterior', async () => {
      const user = await createUser(prisma, { email: 'ana@liga.example' });
      const first = await api()
        .post(`/api/users/${user.id}/credential-link`)
        .expect(200);
      const second = await api()
        .post(`/api/users/${user.id}/credential-link`)
        .expect(200);
      expect(first.body.kind).toBe('restablecimiento');
      expect(first.body.token).not.toBe(second.body.token);

      const complete = (token: string) =>
        t
          .http()
          .post('/api/auth/password/complete')
          .set('Origin', TEST_ORIGIN)
          .send({ token, password: 'una-contraseña-larga-nueva' });
      await complete(first.body.token).expect(400); // anulado por el nuevo
      await complete(second.body.token).expect(204);
    });

    it('audita la emisión sin el token', async () => {
      const user = await createUser(prisma, { email: 'ana@liga.example' });
      const res = await api()
        .post(`/api/users/${user.id}/credential-link`)
        .expect(200);
      const [log] = await audits('user.credential_link_issued');
      expect(log).toMatchObject({
        userId: admin.user.id,
        entityId: user.id,
        afterSnapshot: { kind: 'restablecimiento' },
      });
      expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain(
        res.body.token,
      );
    });

    it('no genera enlaces para cuentas desactivadas ni para la propia', async () => {
      const off = await createUser(prisma, { status: 'inactivo' });
      await api().post(`/api/users/${off.id}/credential-link`).expect(409);
      await api()
        .post(`/api/users/${admin.user.id}/credential-link`)
        .expect(403);
      await api()
        .post('/api/users/0197aaaa-0000-7000-8000-000000000000/credential-link')
        .expect(404);
    });

    it('requiere users:update', async () => {
      const user = await createUser(prisma);
      const reader = await adminWith(t, prisma, ['users:read', 'users:create']);
      await authed(t, reader.session)
        .post(`/api/users/${user.id}/credential-link`)
        .expect(403);
    });
  });
});
