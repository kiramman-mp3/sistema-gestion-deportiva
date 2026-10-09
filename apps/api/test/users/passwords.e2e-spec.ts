import { createHash } from 'node:crypto';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { PasswordService } from '../../src/auth/password.service.js';
import {
  TEST_ORIGIN,
  createTestApp,
  setCookies,
  type TestApp,
} from '../support/app.js';
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
const NEW_PASSWORD = 'otra-contraseña-larga-y-distinta-9';

describe('contraseñas: activación, restablecimiento y cambio', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof adminWith>>;

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp({ env: { TRUST_PROXY: '1' } });
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    admin = await adminWith(t, prisma, [
      'users:read',
      'users:create',
      'users:update',
    ]);
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  const api = () => authed(t, admin.session);
  const complete = (
    token: string,
    password = NEW_PASSWORD,
    ip = '203.0.113.9',
  ) =>
    t
      .http()
      .post('/api/auth/password/complete')
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', ip)
      .send({ token, password });
  const newPending = async (email = 'nueva@liga.example') =>
    (
      await api()
        .post('/api/users')
        .send({ email, displayName: 'Persona Nueva' })
        .expect(201)
    ).body as {
      user: { id: string; email: string };
      activation: { token: string; expiresAt: string };
    };
  const audits = (action: string) =>
    prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });

  // ───────────────────────── activación ─────────────────────────

  describe('activación de una cuenta nueva', () => {
    it('el titular fija su contraseña con el enlace, la cuenta queda activa y puede iniciar sesión', async () => {
      const { user, activation } = await newPending();
      await complete(activation.token).expect(204);

      const row = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(row.status).toBe('activo');
      expect(row.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      expect(row.passwordHash).not.toContain(NEW_PASSWORD);
      expect(
        await new PasswordService().verify(row.passwordHash, NEW_PASSWORD),
      ).toBe(true);

      const session = await login(t, user.email, NEW_PASSWORD);
      expect(session.body.permissions).toEqual([]); // sin privilegios por defecto
      const [log] = await audits('auth.account_activated');
      expect(log).toMatchObject({ userId: user.id, entityId: user.id });
    });

    it('el enlace es de un solo uso', async () => {
      const { activation } = await newPending();
      await complete(activation.token).expect(204);
      const again = await complete(
        activation.token,
        'una-contraseña-larga-distinta-3',
      ).expect(400);
      expect(again.body.message).toBe('El enlace no es válido o ya venció');
    });

    it('dos canjes simultáneos del mismo enlace: solo uno prospera', async () => {
      const { user, activation } = await newPending();
      const results = await Promise.all([
        complete(activation.token, 'primera-contraseña-larga-1'),
        complete(activation.token, 'segunda-contraseña-larga-2'),
        complete(activation.token, 'tercera-contraseña-larga-3'),
      ]);
      expect(results.filter((r) => r.status === 204)).toHaveLength(1);
      expect(results.filter((r) => r.status === 400)).toHaveLength(2);
      expect(
        await prisma.auditLog.count({
          where: { action: 'auth.account_activated', entityId: user.id },
        }),
      ).toBe(1);
    });

    it('un enlace vencido no sirve', async () => {
      const { activation } = await newPending();
      await prisma.credentialToken.updateMany({
        data: {
          expiresAt: new Date(Date.now() - 1000),
          createdAt: new Date(Date.now() - 3_600_000),
        },
      });
      await complete(activation.token).expect(400);
    });

    it('rechaza tokens inventados, mal formados, de otro tipo de valor o vacíos', async () => {
      await newPending();
      for (const token of [
        'a'.repeat(43),
        'corto',
        '',
        'x'.repeat(200),
        '../../etc/passwd',
        'a'.repeat(43) + '\u0000',
      ]) {
        const res = await complete(token);
        expect([400], token).toContain(res.status);
      }
      await t
        .http()
        .post('/api/auth/password/complete')
        .set('Origin', TEST_ORIGIN)
        .send({})
        .expect(400);
      await t
        .http()
        .post('/api/auth/password/complete')
        .set('Origin', TEST_ORIGIN)
        .send({ token: { $ne: 1 }, password: NEW_PASSWORD })
        .expect(400);
    });

    it('aplica la política de contraseñas sin consumir el enlace', async () => {
      const { user, activation } = await newPending('presidente@liga.example');
      for (const password of [
        'corta',
        'x'.repeat(129),
        'presidente-es-mi-nombre-1',
      ]) {
        await complete(activation.token, password).expect(400);
      }
      // El enlace sigue vigente tras los rechazos
      expect(
        (
          await prisma.credentialToken.findFirstOrThrow({
            where: { userId: user.id },
          })
        ).usedAt,
      ).toBeNull();
      await complete(activation.token, NEW_PASSWORD).expect(204);
    });

    it('un administrador puede regenerar el enlace; el anterior queda anulado', async () => {
      const { user, activation } = await newPending();
      const fresh = await api()
        .post(`/api/users/${user.id}/credential-link`)
        .expect(200);
      expect(fresh.body.kind).toBe('activacion');
      await complete(activation.token).expect(400);
      await complete(fresh.body.token).expect(204);
    });

    it('el token nunca se guarda en claro ni aparece en la auditoría ni en los logs', async () => {
      const { user, activation } = await newPending();
      await complete(activation.token).expect(204);
      const everything = JSON.stringify({
        tokens: await prisma.credentialToken.findMany(),
        audit: await prisma.auditLog.findMany(),
        users: await prisma.user.findMany(),
        sessions: await prisma.session.findMany(),
      });
      expect(everything).not.toContain(activation.token);
      expect(everything).not.toContain(NEW_PASSWORD);
      expect(t.logger.text).not.toContain(activation.token);
      expect(t.logger.text).not.toContain(NEW_PASSWORD);
      const stored = await prisma.credentialToken.findFirstOrThrow({
        where: { userId: user.id },
      });
      expect(stored.tokenHash).toBe(sha256(activation.token));
      expect(stored.usedAt).not.toBeNull();
    });

    it('no admite un token de restablecimiento sobre una cuenta pendiente ni viceversa', async () => {
      const { user } = await newPending();
      const active = await createUser(prisma, { email: 'activa@liga.example' });
      // Fabrica tokens con el tipo equivocado para la cuenta
      const { CredentialTokenService } =
        await import('../../src/auth/credential-token.service.js');
      const service = t.app.get(CredentialTokenService);
      const wrongForPending = await prisma.$transaction((tx) =>
        service.issue(tx, {
          userId: user.id,
          kind: 'restablecimiento',
          createdById: admin.user.id,
        }),
      );
      const wrongForActive = await prisma.$transaction((tx) =>
        service.issue(tx, {
          userId: active.id,
          kind: 'activacion',
          createdById: admin.user.id,
        }),
      );
      await complete(wrongForPending.token).expect(400);
      await complete(wrongForActive.token).expect(400);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
          .status,
      ).toBe('pendiente');
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: active.id } }))
          .passwordHash,
      ).not.toBeNull();
    });
  });

  // ───────────────────────── restablecimiento ─────────────────────────

  describe('restablecimiento emitido por un administrador', () => {
    it('fija la nueva contraseña, revoca TODAS las sesiones y la anterior deja de valer', async () => {
      const user = await createUser(prisma, {
        email: 'ana@liga.example',
        permissions: ['users:read'],
      });
      const s1 = await login(t, user.email);
      const s2 = await login(t, user.email);
      const link = await api()
        .post(`/api/users/${user.id}/credential-link`)
        .expect(200);

      await complete(link.body.token).expect(204);
      await authed(t, s1).get('/api/auth/session').expect(401);
      await authed(t, s2).get('/api/auth/session').expect(401);
      await t
        .http()
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .send({ email: user.email, password: PASSWORD })
        .expect(401);
      await login(t, user.email, NEW_PASSWORD);

      const sessions = await prisma.session.findMany({
        where: { userId: user.id, revokedAt: { not: null } },
      });
      expect(
        sessions.every((s) => s.revocationReason === 'contrasena_cambiada'),
      ).toBe(true);
      expect(await audits('auth.password_reset_completed')).toHaveLength(1);
    });

    it('el enlace de restablecimiento también es de un solo uso (aunque la cuenta ya esté activa)', async () => {
      const user = await createUser(prisma, { email: 'ana@liga.example' });
      const link = await api()
        .post(`/api/users/${user.id}/credential-link`)
        .expect(200);
      await complete(link.body.token, 'primera-contraseña-larga-1').expect(204);
      await complete(link.body.token, 'segunda-contraseña-larga-2').expect(400);
      await login(t, user.email, 'primera-contraseña-larga-1');
      await t
        .http()
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .send({ email: user.email, password: 'segunda-contraseña-larga-2' })
        .expect(401);
    });

    it('dos canjes simultáneos de un restablecimiento: solo uno fija la contraseña', async () => {
      const user = await createUser(prisma, { email: 'ana@liga.example' });
      const link = await api()
        .post(`/api/users/${user.id}/credential-link`)
        .expect(200);
      const results = await Promise.all([
        complete(link.body.token, 'primera-contraseña-larga-1'),
        complete(link.body.token, 'segunda-contraseña-larga-2'),
        complete(link.body.token, 'tercera-contraseña-larga-3'),
      ]);
      expect(results.filter((r) => r.status === 204)).toHaveLength(1);
      expect(await audits('auth.password_reset_completed')).toHaveLength(1);
    });

    it('no sirve si la cuenta fue desactivada después de emitir el enlace', async () => {
      const user = await createUser(prisma, { email: 'ana@liga.example' });
      const link = await api()
        .post(`/api/users/${user.id}/credential-link`)
        .expect(200);
      await api()
        .patch(`/api/users/${user.id}/status`)
        .send({ status: 'inactivo', reason: 'Baja' })
        .expect(200);
      await complete(link.body.token).expect(400);
      expect(
        await prisma.credentialToken.count({
          where: { userId: user.id, revokedAt: { not: null } },
        }),
      ).toBe(1);
    });

    it('limita los canjes fallidos por IP y se recupera al pasar la ventana', async () => {
      const limited = await createTestApp({
        env: { TRUST_PROXY: '1', LOGIN_MAX_FAILURES_PER_IP: '4' },
      });
      try {
        const attempt = (ip: string) =>
          limited
            .http()
            .post('/api/auth/password/complete')
            .set('Origin', TEST_ORIGIN)
            .set('X-Forwarded-For', ip)
            .send({ token: 'a'.repeat(43), password: NEW_PASSWORD });
        for (let i = 0; i < 4; i++) await attempt('198.51.100.7').expect(400);
        const blocked = await attempt('198.51.100.7');
        expect(blocked.status).toBe(429);
        expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
        // Otra IP no se ve afectada; el contador del login tampoco se mezcla
        await attempt('198.51.100.8').expect(400);
        await prisma.loginFailure.updateMany({
          data: { createdAt: new Date(Date.now() - 3_600_000) },
        });
        await attempt('198.51.100.7').expect(400);
      } finally {
        await limited.close();
      }
    });

    it('un canje correcto no se cuenta como fallo', async () => {
      const { activation } = await newPending();
      await complete(activation.token).expect(204);
      expect(await prisma.loginFailure.count()).toBe(0);
    });
  });

  // ───────────────────────── cambio de contraseña propio ─────────────────────────

  describe('cambio de la propia contraseña', () => {
    const change = (
      session: Awaited<ReturnType<typeof login>>,
      body: object,
      ip = '203.0.113.50',
    ) =>
      authed(t, session)
        .post('/api/auth/password/change')
        .set('X-Forwarded-For', ip)
        .send(body);

    it('cambia la contraseña, conserva la sesión actual y revoca las demás', async () => {
      const user = await createUser(prisma, {
        email: 'ana@liga.example',
        permissions: ['users:read'],
      });
      const current = await login(t, user.email);
      const other1 = await login(t, user.email);
      const other2 = await login(t, user.email);

      const res = await change(current, {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(200);
      expect(res.body).toEqual({ revokedSessions: 2 });
      await authed(t, current).get('/api/auth/session').expect(200);
      await authed(t, other1).get('/api/auth/session').expect(401);
      await authed(t, other2).get('/api/auth/session').expect(401);

      await t
        .http()
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .send({ email: user.email, password: PASSWORD })
        .expect(401);
      await login(t, user.email, NEW_PASSWORD);

      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
      const [log] = await audits('auth.password_changed');
      expect(log).toMatchObject({
        userId: user.id,
        entityId: user.id,
        afterSnapshot: { revokedSessions: 2 },
      });
      const dump = JSON.stringify(await prisma.auditLog.findMany());
      expect(dump).not.toContain(NEW_PASSWORD);
      expect(dump).not.toContain(PASSWORD);
      expect(t.logger.text).not.toContain(NEW_PASSWORD);
    });

    it('exige la contraseña actual: una incorrecta responde 400 (no 401) y no cambia nada', async () => {
      const user = await createUser(prisma, { email: 'ana@liga.example' });
      const session = await login(t, user.email);
      const res = await change(session, {
        currentPassword: 'contraseña-equivocada-1',
        newPassword: NEW_PASSWORD,
      }).expect(400);
      expect(res.body.errors[0]).toMatchObject({ field: 'currentPassword' });
      await authed(t, session).get('/api/auth/session').expect(200);
      await login(t, user.email, PASSWORD);
      expect(await audits('auth.password_change_failed')).toHaveLength(1);
    });

    it('limita los intentos con la contraseña actual (como el login)', async () => {
      const limited = await createTestApp({
        env: { TRUST_PROXY: '1', LOGIN_MAX_FAILURES_PER_ACCOUNT_IP: '3' },
      });
      try {
        const user = await createUser(prisma, { email: 'ana@liga.example' });
        const session = await login(limited, user.email, PASSWORD, {
          'X-Forwarded-For': '203.0.113.60',
        });
        const attempt = (current: string) =>
          authed(limited, session)
            .post('/api/auth/password/change')
            .set('X-Forwarded-For', '203.0.113.60')
            .send({ currentPassword: current, newPassword: NEW_PASSWORD });
        for (let i = 0; i < 3; i++)
          await attempt('contraseña-equivocada-1').expect(400);
        const blocked = await attempt(PASSWORD);
        expect(blocked.status).toBe(429);
        expect(blocked.headers['retry-after']).toBeDefined();
        expect(
          (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
            .passwordHash,
        ).not.toBeNull();
        await new PasswordService()
          .verify(
            (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
              .passwordHash,
            PASSWORD,
          )
          .then((ok) => expect(ok).toBe(true));
      } finally {
        await limited.close();
      }
    });

    it('aplica la política y rechaza reutilizar la actual', async () => {
      const user = await createUser(prisma, {
        email: 'maria.fernandez@liga.example',
      });
      const session = await login(t, user.email);
      const rejected = [
        { currentPassword: PASSWORD, newPassword: PASSWORD },
        { currentPassword: PASSWORD, newPassword: 'corta' },
        { currentPassword: PASSWORD, newPassword: 'x'.repeat(129) },
        { currentPassword: PASSWORD, newPassword: 'maria.fernandez-2026-abc' },
        { currentPassword: PASSWORD },
        { newPassword: NEW_PASSWORD },
        {
          currentPassword: PASSWORD,
          newPassword: NEW_PASSWORD,
          userId: 'otro',
        },
      ];
      for (const body of rejected) await change(session, body).expect(400);
      await login(t, user.email, PASSWORD);
    });

    it('requiere sesión y CSRF', async () => {
      const user = await createUser(prisma, { email: 'ana@liga.example' });
      const session = await login(t, user.email);
      await t
        .http()
        .post('/api/auth/password/change')
        .set('Origin', TEST_ORIGIN)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(401);
      await t
        .http()
        .post('/api/auth/password/change')
        .set('Cookie', session.cookie)
        .set('Origin', TEST_ORIGIN)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(403);
      await login(t, user.email, PASSWORD);
    });

    it('anula los enlaces de restablecimiento pendientes', async () => {
      const user = await createUser(prisma, { email: 'ana@liga.example' });
      const link = await api()
        .post(`/api/users/${user.id}/credential-link`)
        .expect(200);
      const session = await login(t, user.email);
      await change(session, {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(200);
      await complete(link.body.token, 'tercera-contraseña-larga-3').expect(400);
    });

    it('no puede cambiar la contraseña de otra cuenta enviando su identificador', async () => {
      const victim = await createUser(prisma, {
        email: 'victima@liga.example',
      });
      const attacker = await createUser(prisma, {
        email: 'atacante@liga.example',
      });
      const session = await login(t, attacker.email);
      await change(session, {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
        email: victim.email,
        userId: victim.id,
      }).expect(400);
      await login(t, victim.email, PASSWORD);
    });

    it('no revela detalles ni cookies nuevas en la respuesta', async () => {
      const user = await createUser(prisma, { email: 'ana@liga.example' });
      const session = await login(t, user.email);
      const res = await change(session, {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(200);
      expect(setCookies(res)).toEqual([]);
      expect(JSON.stringify(res.body)).not.toMatch(/hash|token|argon2/i);
    });
  });

  // ───────────────────────── recuperación autoservicio ─────────────────────────

  describe('recuperación autoservicio (sin entrega de correo)', () => {
    it('no existe ninguna ruta pública que genere enlaces ni que confirme si una cuenta existe', async () => {
      await createUser(prisma, { email: 'ana@liga.example' });
      for (const path of [
        '/api/auth/password/forgot',
        '/api/auth/password/reset',
        '/api/auth/forgot-password',
        '/api/auth/password/request',
      ]) {
        const res = await t
          .http()
          .post(path)
          .set('Origin', TEST_ORIGIN)
          .send({ email: 'ana@liga.example' });
        expect([401, 404], path).toContain(res.status);
      }
      expect(await prisma.credentialToken.count()).toBe(0);
    });
  });
});
