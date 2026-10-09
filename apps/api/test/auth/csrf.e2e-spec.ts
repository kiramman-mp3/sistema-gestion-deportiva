import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { TEST_ORIGIN, createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import {
  PASSWORD,
  createUser,
  login,
  seedCatalog,
} from '../support/fixtures.js';

describe('protección CSRF y de origen', () => {
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

  describe('token CSRF en operaciones que modifican estado', () => {
    it('rechaza logout con sesión válida pero sin token CSRF', async () => {
      const user = await createUser(prisma);
      const s = await login(t, user.email);
      await t
        .http()
        .post('/api/auth/logout')
        .set('Cookie', s.cookie)
        .set('Origin', TEST_ORIGIN)
        .expect(403);
      // La sesión sigue viva: el ataque no tuvo efecto
      await t
        .http()
        .get('/api/auth/session')
        .set('Cookie', s.cookie)
        .expect(200);
    });

    it('rechaza un token CSRF incorrecto, vacío o de otra sesión', async () => {
      const user = await createUser(prisma);
      const mine = await login(t, user.email);
      const other = await login(t, user.email);
      for (const token of [
        '',
        'x',
        mine.csrf.slice(0, -1) + (mine.csrf.endsWith('A') ? 'B' : 'A'),
        other.csrf,
        mine.csrf + 'x',
      ]) {
        const res = await t
          .http()
          .post('/api/auth/logout')
          .set('Cookie', mine.cookie)
          .set('X-CSRF-Token', token)
          .set('Origin', TEST_ORIGIN);
        expect(res.status).toBe(403);
        expect(res.body.message).toBe('Token CSRF inválido');
      }
      await t
        .http()
        .get('/api/auth/session')
        .set('Cookie', mine.cookie)
        .expect(200);
    });

    it('acepta el token CSRF correcto', async () => {
      const user = await createUser(prisma);
      const s = await login(t, user.email);
      await t
        .http()
        .post('/api/auth/logout')
        .set('Cookie', s.cookie)
        .set('X-CSRF-Token', s.csrf)
        .set('Origin', TEST_ORIGIN)
        .expect(204);
    });

    it('el token CSRF no sirve sin la cookie de sesión', async () => {
      const user = await createUser(prisma);
      const s = await login(t, user.email);
      await t
        .http()
        .post('/api/auth/logout')
        .set('X-CSRF-Token', s.csrf)
        .expect(401);
    });

    it('las lecturas (GET) no exigen token CSRF', async () => {
      const user = await createUser(prisma);
      const s = await login(t, user.email);
      await t
        .http()
        .get('/api/auth/session')
        .set('Cookie', s.cookie)
        .expect(200);
    });

    it('protege también las operaciones administrativas', async () => {
      const admin = await createUser(prisma, { permissions: ['users:update'] });
      const victim = await createUser(prisma);
      const s = await login(t, admin.email);
      await t
        .http()
        .patch(`/api/users/${victim.id}/status`)
        .set('Cookie', s.cookie)
        .set('Origin', TEST_ORIGIN)
        .send({ status: 'inactivo', reason: 'prueba CSRF' })
        .expect(403);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: victim.id } }))
          .status,
      ).toBe('activo');
    });
  });

  describe('validación de origen', () => {
    it('rechaza un Origin no configurado en el login (login CSRF) y no crea sesión', async () => {
      const user = await createUser(prisma);
      const res = await t
        .http()
        .post('/api/auth/login')
        .set('Origin', 'https://malicioso.example')
        .send({ email: user.email, password: PASSWORD });
      expect(res.status).toBe(403);
      expect(await prisma.session.count()).toBe(0);
    });

    it('rechaza un Origin ajeno aunque el token CSRF sea correcto', async () => {
      const user = await createUser(prisma);
      const s = await login(t, user.email);
      await t
        .http()
        .post('/api/auth/logout')
        .set('Cookie', s.cookie)
        .set('X-CSRF-Token', s.csrf)
        .set('Origin', 'https://malicioso.example')
        .expect(403);
      await t
        .http()
        .get('/api/auth/session')
        .set('Cookie', s.cookie)
        .expect(200);
    });

    it('rechaza el origen "null" (documentos aislados) y orígenes parecidos', async () => {
      const user = await createUser(prisma);
      for (const origin of [
        'null',
        'https://liga.example.malicioso.com',
        'http://liga.example',
        'https://liga.example:8443',
      ]) {
        await t
          .http()
          .post('/api/auth/login')
          .set('Origin', origin)
          .send({ email: user.email, password: PASSWORD })
          .expect(403);
      }
    });

    it('sin Origin, valida el Referer', async () => {
      const user = await createUser(prisma);
      await t
        .http()
        .post('/api/auth/login')
        .set('Referer', 'https://malicioso.example/pagina')
        .send({ email: user.email, password: PASSWORD })
        .expect(403);
      await t
        .http()
        .post('/api/auth/login')
        .set('Referer', 'esto no es una url')
        .send({ email: user.email, password: PASSWORD })
        .expect(403);
      await t
        .http()
        .post('/api/auth/login')
        .set('Referer', `${TEST_ORIGIN}/login`)
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
    });

    it('rechaza cuerpos que no son JSON (formularios entre sitios) con 415', async () => {
      const user = await createUser(prisma);
      for (const [type, body] of [
        [
          'application/x-www-form-urlencoded',
          `email=${user.email}&password=${PASSWORD}`,
        ],
        [
          'text/plain',
          JSON.stringify({ email: user.email, password: PASSWORD }),
        ],
        ['multipart/form-data; boundary=x', '--x--'],
      ] as const) {
        const res = await t
          .http()
          .post('/api/auth/login')
          .set('Origin', TEST_ORIGIN)
          .set('Content-Type', type)
          .send(body);
        expect(res.status).toBe(415);
      }
      expect(await prisma.session.count()).toBe(0);
    });
  });

  describe('CORS', () => {
    it('el preflight solo se concede a orígenes configurados y con las cabeceras permitidas', async () => {
      const ok = await t
        .http()
        .options('/api/auth/logout')
        .set('Origin', TEST_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,x-csrf-token');
      expect(ok.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
      expect(ok.headers['access-control-allow-credentials']).toBe('true');
      expect(ok.headers['access-control-allow-headers']).toMatch(
        /x-csrf-token/i,
      );

      const denied = await t
        .http()
        .options('/api/auth/logout')
        .set('Origin', 'https://malicioso.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
