import { createHash } from 'node:crypto';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AuditService } from '../../src/audit/audit.service.js';
import {
  TEST_ORIGIN,
  cookieValue,
  createTestApp,
  setCookies,
  type TestApp,
} from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import {
  PASSWORD,
  authed,
  createUser,
  login,
  seedCatalog,
} from '../support/fixtures.js';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

describe('inicio y cierre de sesión', () => {
  let prisma: PrismaClient;
  let t: TestApp;

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  const post = (body: unknown) =>
    t
      .http()
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send(body as object);

  describe('login', () => {
    it('autentica a un usuario persistido y crea una sesión', async () => {
      const user = await createUser(prisma, {
        email: 'ana@example.com',
        permissions: ['roles:read'],
      });
      const res = await post({
        email: 'ana@example.com',
        password: PASSWORD,
      }).expect(200);

      expect(res.body).toMatchObject({
        user: {
          id: user.id,
          email: 'ana@example.com',
          displayName: 'Usuario de prueba',
        },
        permissions: ['roles:read'],
      });
      expect(res.body.csrfToken).toEqual(expect.any(String));
      expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(
        Date.now(),
      );
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
        1,
      );
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(stored.lastLoginAt).not.toBeNull();
    });

    it('normaliza el correo (mayúsculas y espacios)', async () => {
      await createUser(prisma, { email: 'ana@example.com' });
      await post({ email: '  ANA@Example.com ', password: PASSWORD }).expect(
        200,
      );
    });

    it('guarda solo el hash del identificador de sesión, nunca el valor de la cookie', async () => {
      const user = await createUser(prisma);
      const session = await login(t, user.email);
      const row = await prisma.session.findFirstOrThrow({
        where: { userId: user.id },
      });
      expect(row.tokenHash).toBe(sha256(session.token));
      expect(row.tokenHash).not.toBe(session.token);
      expect(JSON.stringify(row)).not.toContain(session.token);
    });

    it('rechaza contraseña incorrecta, usuario inexistente y cuenta inactiva con la MISMA respuesta', async () => {
      await createUser(prisma, { email: 'ok@example.com' });
      await createUser(prisma, {
        email: 'off@example.com',
        status: 'inactivo',
      });
      await createUser(prisma, {
        email: 'lock@example.com',
        status: 'bloqueado',
      });

      const attempts = [
        { email: 'ok@example.com', password: 'contraseña-incorrecta-123' },
        { email: 'nadie@example.com', password: PASSWORD },
        { email: 'off@example.com', password: PASSWORD },
        { email: 'lock@example.com', password: PASSWORD },
      ];
      const responses = [];
      for (const attempt of attempts) {
        const res = await post(attempt).expect(401);
        expect(setCookies(res)).toEqual([]);
        responses.push(res.body);
      }
      for (const body of responses) expect(body).toEqual(responses[0]);
      expect(responses[0]).toMatchObject({
        statusCode: 401,
        message: 'Credenciales inválidas',
      });
      expect(await prisma.session.count()).toBe(0);
    });

    it('valida la entrada sin eco de valores', async () => {
      for (const body of [
        {},
        { email: 'no-es-correo', password: 'x' },
        { email: 'a@b.co' },
        { email: 'a@b.co', password: 'x'.repeat(129) },
      ]) {
        const res = await post(body).expect(400);
        expect(res.body.message).toBe('Solicitud inválida');
        expect(JSON.stringify(res.body)).not.toContain('xxxxx');
      }
      // Contraseña de tipo incorrecto no provoca un error 500
      await post({ email: 'a@b.co', password: { $ne: '' } }).expect(400);
    });

    it('trata la entrada como dato, no como SQL', async () => {
      await createUser(prisma, { email: 'ana@example.com' });
      await post({
        email: "ana@example.com' OR '1'='1",
        password: PASSWORD,
      }).expect(400);
      await post({ email: 'ana@example.com', password: "' OR '1'='1" }).expect(
        401,
      );
    });

    it('no crea ninguna sesión ante credenciales inválidas', async () => {
      await createUser(prisma, { email: 'ok@example.com' });
      await post({
        email: 'ok@example.com',
        password: 'mal-mal-mal-mal',
      }).expect(401);
      expect(await prisma.session.count()).toBe(0);
    });
  });

  describe('cookie de sesión', () => {
    it('es HttpOnly, SameSite=Strict, Path=/, sin Domain ni Max-Age, y no Secure fuera de producción', async () => {
      const user = await createUser(prisma);
      const res = await post({ email: user.email, password: PASSWORD }).expect(
        200,
      );
      const cookie = setCookies(res).find((c) => c.startsWith('liga_sid='))!;
      expect(cookie).toMatch(/;\s*HttpOnly/i);
      expect(cookie).toMatch(/;\s*SameSite=Strict/i);
      expect(cookie).toMatch(/;\s*Path=\/(;|$)/i);
      expect(cookie).not.toMatch(/Domain=/i);
      expect(cookie).not.toMatch(/Max-Age|Expires/i);
      expect(cookie).not.toMatch(/;\s*Secure/i);
    });

    it('en producción usa el prefijo __Host- y Secure', async () => {
      const prod = await createTestApp({
        env: { NODE_ENV: 'production', WEB_ORIGIN: TEST_ORIGIN },
      });
      try {
        const user = await createUser(prisma);
        const res = await prod
          .http()
          .post('/api/auth/login')
          .set('Origin', TEST_ORIGIN)
          .send({ email: user.email, password: PASSWORD })
          .expect(200);
        const cookie = setCookies(res).find((c) =>
          c.startsWith('__Host-liga_sid='),
        )!;
        expect(cookie).toBeDefined();
        expect(cookie).toMatch(/;\s*Secure/i);
        expect(cookie).toMatch(/;\s*HttpOnly/i);
        expect(cookie).toMatch(/;\s*SameSite=Strict/i);
        expect(cookie).toMatch(/;\s*Path=\/(;|$)/i);
        expect(cookie).not.toMatch(/Domain=/i);
        // La documentación de la API no se publica en producción
        await prod.http().get('/api/docs-json').expect(404);
      } finally {
        await prod.close();
      }
    });

    it('el valor de la cookie es aleatorio e impredecible entre sesiones', async () => {
      const user = await createUser(prisma);
      const tokens = new Set<string>();
      for (let i = 0; i < 5; i++)
        tokens.add((await login(t, user.email)).token);
      expect(tokens.size).toBe(5);
      for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });
  });

  describe('sesión actual', () => {
    it('se crea y se recupera con el usuario y sus permisos', async () => {
      const user = await createUser(prisma, {
        permissions: ['roles:read', 'audit:read'],
      });
      const s = await login(t, user.email);
      const res = await authed(t, s).get('/api/auth/session').expect(200);
      expect(res.body).toMatchObject({
        user: { id: user.id, email: user.email },
        permissions: ['audit:read', 'roles:read'],
        csrfToken: s.csrf,
      });
    });

    it('no expone hashes, secretos de sesión ni datos internos', async () => {
      const user = await createUser(prisma);
      const s = await login(t, user.email);
      const row = await prisma.session.findFirstOrThrow({
        where: { userId: user.id },
      });
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });

      const bodies = [
        s.body,
        (await authed(t, s).get('/api/auth/session').expect(200)).body,
        (await authed(t, s).get('/api/auth/sessions').expect(200)).body,
      ].map((b) => JSON.stringify(b));
      for (const body of bodies) {
        expect(body).not.toContain(stored.passwordHash);
        expect(body).not.toContain(row.tokenHash);
        expect(body).not.toContain(s.token);
        expect(body).not.toMatch(/passwordHash|tokenHash|argon2/i);
      }
    });

    it('rechaza peticiones sin cookie, con cookie inventada o con formato inválido', async () => {
      await t.http().get('/api/auth/session').expect(401);
      await t
        .http()
        .get('/api/auth/session')
        .set('Cookie', `liga_sid=${'a'.repeat(43)}`)
        .expect(401);
      const res = await t
        .http()
        .get('/api/auth/session')
        .set('Cookie', 'liga_sid=basura')
        .expect(401);
      // La cookie inválida se elimina del navegador
      expect(setCookies(res).join()).toMatch(/liga_sid=;/);
    });

    it('lista las sesiones propias y marca la actual', async () => {
      const user = await createUser(prisma);
      const first = await login(t, user.email);
      const second = await login(t, user.email, PASSWORD, {
        'User-Agent': 'Prueba/2.0',
      });
      const res = await authed(t, second).get('/api/auth/sessions').expect(200);
      expect(res.body).toHaveLength(2);
      expect(
        res.body.filter((s: { current: boolean }) => s.current),
      ).toHaveLength(1);
      expect(
        res.body.find((s: { current: boolean }) => s.current).userAgent,
      ).toBe('Prueba/2.0');
      expect(first.token).not.toBe(second.token);
    });

    it('permite revocar una sesión propia y no sesiones ajenas', async () => {
      const a = await createUser(prisma);
      const b = await createUser(prisma);
      const sa1 = await login(t, a.email);
      const sa2 = await login(t, a.email);
      const sb = await login(t, b.email);
      const sa2Id = (
        await prisma.session.findFirstOrThrow({
          where: { tokenHash: sha256(sa2.token) },
        })
      ).id;
      const sbId = (
        await prisma.session.findFirstOrThrow({
          where: { tokenHash: sha256(sb.token) },
        })
      ).id;

      // IDOR: A no puede revocar la sesión de B
      await authed(t, sa1).delete(`/api/auth/sessions/${sbId}`).expect(404);
      await authed(t, sb).get('/api/auth/session').expect(200);

      await authed(t, sa1).delete(`/api/auth/sessions/${sa2Id}`).expect(204);
      await authed(t, sa2).get('/api/auth/session').expect(401);
      await authed(t, sa1).get('/api/auth/session').expect(200);
      await authed(t, sa1).delete('/api/auth/sessions/no-es-uuid').expect(400);
    });
  });

  describe('rotación del identificador', () => {
    it('cada login genera un identificador nuevo', async () => {
      const user = await createUser(prisma);
      const first = await login(t, user.email);
      const second = await login(t, user.email);
      expect(second.token).not.toBe(first.token);
      expect(second.csrf).not.toBe(first.csrf);
    });

    it('al autenticarse con una cookie previa, la sesión anterior queda revocada', async () => {
      const user = await createUser(prisma);
      const old = await login(t, user.email);
      const res = await t
        .http()
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', old.cookie)
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      const fresh = cookieValue(res, 'liga_sid')!;
      expect(fresh).not.toBe(old.token);

      await authed(t, old).get('/api/auth/session').expect(401);
      const replaced = await prisma.session.findFirstOrThrow({
        where: { tokenHash: sha256(old.token) },
      });
      expect(replaced.revocationReason).toBe('reemplazada');
      await t
        .http()
        .get('/api/auth/session')
        .set('Cookie', `liga_sid=${fresh}`)
        .expect(200);
    });

    it('un identificador fijado por un atacante no es aceptado (no hay sesiones anónimas)', async () => {
      const user = await createUser(prisma);
      const planted = 'p'.repeat(43);
      const res = await t
        .http()
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', `liga_sid=${planted}`)
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      expect(cookieValue(res, 'liga_sid')).not.toBe(planted);
    });
  });

  describe('logout y revocación', () => {
    it('invalida la sesión en el servidor y borra la cookie con los mismos atributos', async () => {
      const user = await createUser(prisma);
      const s = await login(t, user.email);
      const res = await authed(t, s).post('/api/auth/logout').expect(204);

      const cleared = setCookies(res).find((c) => c.startsWith('liga_sid='))!;
      expect(cleared).toMatch(/^liga_sid=;/);
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/i);
      expect(cleared).toMatch(/;\s*HttpOnly/i);
      expect(cleared).toMatch(/;\s*SameSite=Strict/i);
      expect(cleared).toMatch(/;\s*Path=\/(;|$)/i);

      const row = await prisma.session.findFirstOrThrow({
        where: { userId: user.id },
      });
      expect(row.revokedAt).not.toBeNull();
      expect(row.revocationReason).toBe('cierre_sesion');
    });

    it('una sesión cerrada no puede volver a utilizarse (aunque se conserve la cookie)', async () => {
      const user = await createUser(prisma, { permissions: ['roles:read'] });
      const s = await login(t, user.email);
      await authed(t, s).post('/api/auth/logout').expect(204);
      await authed(t, s).get('/api/auth/session').expect(401);
      await authed(t, s).get('/api/roles').expect(401);
      await authed(t, s).post('/api/auth/logout').expect(401);
    });

    it('cerrar una sesión no afecta a las demás del usuario', async () => {
      const user = await createUser(prisma);
      const one = await login(t, user.email);
      const two = await login(t, user.email);
      await authed(t, one).post('/api/auth/logout').expect(204);
      await authed(t, two).get('/api/auth/session').expect(200);
    });
  });

  describe('expiración', () => {
    it('rechaza sesiones con caducidad absoluta vencida', async () => {
      const user = await createUser(prisma);
      const s = await login(t, user.email);
      await prisma.session.updateMany({
        where: { userId: user.id },
        data: {
          expiresAt: new Date(Date.now() - 1000),
          createdAt: new Date(Date.now() - 3_600_000),
        },
      });
      await authed(t, s).get('/api/auth/session').expect(401);
    });

    it('rechaza sesiones inactivas más allá del límite de inactividad', async () => {
      const user = await createUser(prisma);
      const s = await login(t, user.email);
      await prisma.session.updateMany({
        where: { userId: user.id },
        data: {
          lastSeenAt: new Date(
            Date.now() - (t.env.SESSION_IDLE_MINUTES + 1) * 60_000,
          ),
        },
      });
      await authed(t, s).get('/api/auth/session').expect(401);
    });

    it('la actividad renueva la inactividad pero no la caducidad absoluta', async () => {
      const user = await createUser(prisma);
      const s = await login(t, user.email);
      const before = await prisma.session.findFirstOrThrow({
        where: { userId: user.id },
      });
      await prisma.session.update({
        where: { id: before.id },
        data: { lastSeenAt: new Date(Date.now() - 10 * 60_000) },
      });
      await authed(t, s).get('/api/auth/session').expect(200);
      const after = await prisma.session.findFirstOrThrow({
        where: { userId: user.id },
      });
      expect(after.lastSeenAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
      expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());
    });

    it('no lista sesiones caducadas', async () => {
      const user = await createUser(prisma);
      await login(t, user.email);
      const s = await login(t, user.email);
      await prisma.session.updateMany({
        where: { userId: user.id, tokenHash: { not: sha256(s.token) } },
        data: {
          expiresAt: new Date(Date.now() - 1000),
          createdAt: new Date(Date.now() - 3_600_000),
        },
      });
      const res = await authed(t, s).get('/api/auth/sessions').expect(200);
      expect(res.body).toHaveLength(1);
    });

    it('depura sesiones e intentos antiguos', async () => {
      const user = await createUser(prisma);
      await login(t, user.email);
      await prisma.session.updateMany({
        data: {
          expiresAt: new Date(Date.now() - 30 * 86_400_000),
          createdAt: new Date(Date.now() - 31 * 86_400_000),
        },
      });
      await prisma.loginFailure.create({
        data: {
          scope: 'ip',
          keyHash: 'x',
          createdAt: new Date(Date.now() - 86_400_000),
        },
      });
      const { SessionService } =
        await import('../../src/auth/session.service.js');
      const purged = await t.app.get(SessionService).purgeExpired();
      expect(purged).toEqual({ sessions: 1, loginFailures: 1 });
    });
  });

  describe('cuentas desactivadas', () => {
    it('una sesión vigente deja de servir en cuanto la cuenta deja de estar activa', async () => {
      const user = await createUser(prisma, { permissions: ['roles:read'] });
      const s = await login(t, user.email);
      await authed(t, s).get('/api/roles').expect(200);

      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'inactivo' },
      });
      await authed(t, s).get('/api/roles').expect(401);
      const row = await prisma.session.findFirstOrThrow({
        where: { userId: user.id },
      });
      expect(row.revocationReason).toBe('cuenta_desactivada');
    });

    it('al reactivar la cuenta, las sesiones antiguas siguen revocadas', async () => {
      const user = await createUser(prisma);
      const s = await login(t, user.email);
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'bloqueado' },
      });
      await authed(t, s).get('/api/auth/session').expect(401);
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'activo' },
      });
      await authed(t, s).get('/api/auth/session').expect(401);
    });
  });

  describe('auditoría de eventos de acceso', () => {
    it('registra login exitoso, login fallido y logout con actor, entidad y momento', async () => {
      const user = await createUser(prisma, { email: 'ana@example.com' });
      await post({
        email: 'ana@example.com',
        password: 'incorrecta-incorrecta',
      }).expect(401);
      await post({
        email: 'nadie@example.com',
        password: 'incorrecta-incorrecta',
      }).expect(401);
      const s = await login(t, user.email);
      await authed(t, s).post('/api/auth/logout').expect(204);

      const logs = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
      expect(logs.map((l) => l.action)).toEqual([
        'auth.login_failed',
        'auth.login_failed',
        'auth.login',
        'auth.logout',
      ]);
      expect(logs[0]).toMatchObject({ userId: user.id, entityId: user.id });
      expect(logs[0]!.afterSnapshot).toMatchObject({
        reason: 'contrasena_incorrecta',
      });
      expect(logs[1]).toMatchObject({ userId: null, entityId: null });
      expect(logs[1]!.afterSnapshot).toMatchObject({
        reason: 'cuenta_inexistente',
      });
      expect(logs[2]).toMatchObject({ userId: user.id, entityType: 'session' });
      expect(logs[3]!.entityId).toBe(logs[2]!.entityId);
      for (const log of logs) {
        expect(log.ipHash).toMatch(/^[0-9a-f]{64}$/);
        expect(log.createdAt).toBeInstanceOf(Date);
      }
    });

    it('no guarda en auditoría contraseñas, correos de intentos fallidos, hashes ni tokens', async () => {
      const user = await createUser(prisma, { email: 'ana@example.com' });
      await post({
        email: 'ana@example.com',
        password: 'clave-equivocada-secreta',
      }).expect(401);
      await post({
        email: 'nadie@example.com',
        password: 'otra-clave-secreta',
      }).expect(401);
      const s = await login(t, user.email);
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      const session = await prisma.session.findFirstOrThrow({
        where: { userId: user.id },
      });
      await authed(t, s).post('/api/auth/logout').expect(204);

      const dump = JSON.stringify(await prisma.auditLog.findMany());
      for (const secret of [
        'clave-equivocada-secreta',
        'otra-clave-secreta',
        PASSWORD,
        stored.passwordHash,
        s.token,
        s.csrf,
        session.tokenHash,
        'nadie@example.com',
        '127.0.0.1',
      ]) {
        expect(dump).not.toContain(secret);
      }
    });
  });

  describe('política de errores de auditoría', () => {
    it('si no puede auditarse un login exitoso, falla cerrado: no se crea sesión', async () => {
      const failing = await createTestApp({
        customize: (b) =>
          b.overrideProvider(AuditService).useValue({
            record: () => Promise.reject(new Error('auditoría caída')),
          }),
      });
      try {
        const user = await createUser(prisma);
        const res = await failing
          .http()
          .post('/api/auth/login')
          .set('Origin', TEST_ORIGIN)
          .send({ email: user.email, password: PASSWORD });
        expect(res.status).toBe(500);
        expect(setCookies(res)).toEqual([]);
        expect(await prisma.session.count()).toBe(0);
        expect(JSON.stringify(res.body)).not.toContain('auditoría caída');
      } finally {
        await failing.close();
      }
    });

    it('si falla la auditoría de un login fallido, la respuesta sigue siendo 401 y el error se registra', async () => {
      const failing = await createTestApp({
        customize: (b) =>
          b.overrideProvider(AuditService).useValue({
            record: () => Promise.reject(new Error('auditoría caída')),
          }),
      });
      try {
        const user = await createUser(prisma);
        await failing
          .http()
          .post('/api/auth/login')
          .set('Origin', TEST_ORIGIN)
          .send({ email: user.email, password: 'incorrecta-incorrecta' })
          .expect(401);
        expect(failing.logger.text).toContain(
          'No se pudo auditar un inicio de sesión fallido',
        );
        // El intento sí quedó contado para la limitación de intentos
        expect(await prisma.loginFailure.count()).toBe(3);
      } finally {
        await failing.close();
      }
    });
  });

  describe('secretos en los logs de la aplicación', () => {
    it('no aparecen contraseñas, cookies, tokens ni hashes en lo que la aplicación escribe', async () => {
      const user = await createUser(prisma, { email: 'ana@example.com' });
      await post({
        email: 'ana@example.com',
        password: 'clave-equivocada-secreta',
      }).expect(401);
      const s = await login(t, user.email);
      await authed(t, s).post('/api/auth/logout').expect(204);
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      const session = await prisma.session.findFirstOrThrow({
        where: { userId: user.id },
      });

      for (const secret of [
        'clave-equivocada-secreta',
        PASSWORD,
        stored.passwordHash,
        s.token,
        s.csrf,
        session.tokenHash,
      ]) {
        expect(t.logger.text).not.toContain(secret);
      }
    });
  });
});
