import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import {
  adminWith,
  authed,
  createUser,
  login,
  seedCatalog,
} from '../support/fixtures.js';

const validPng = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
]);

describe('configuración institucional', () => {
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
    admin = await adminWith(t, prisma, [
      'institution:read',
      'institution:manage',
    ]);
  });

  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  describe('acceso', () => {
    it('exige sesión (401) y permiso (403)', async () => {
      await t.http().get('/api/institution').expect(401);

      const reader = await createUser(prisma, {
        permissions: ['institution:read'],
      });
      const readerApi = authed(t, await login(t, reader.email));
      await readerApi.get('/api/institution').expect(200);
      await readerApi
        .patch('/api/institution')
        .send({ name: 'Otra Liga' })
        .expect(403);
      await readerApi
        .put('/api/institution/logo')
        .attach('file', validPng, 'logo.png')
        .expect(403);
      await readerApi.delete('/api/institution/logo').expect(403);

      const nobody = await createUser(prisma, { permissions: ['sports:read'] });
      await authed(t, await login(t, nobody.email))
        .get('/api/institution')
        .expect(403);
    });
  });

  describe('datos institucionales', () => {
    it('existe desde el primer uso con los valores por defecto, aunque la base esté vacía', async () => {
      expect(await prisma.institutionSettings.count()).toBe(0);
      const res = await api().get('/api/institution').expect(200);
      expect(res.body).toMatchObject({
        name: 'Liga Deportiva Cantonal de Quero',
        canton: 'Quero - Tungurahua - Ecuador',
        publicClubs: true,
        publicAthletes: true,
        publicNews: true,
        publicResolutions: false,
        hasLogo: false,
      });
      expect(await prisma.institutionSettings.count()).toBe(1);
    });

    it('modifica los datos, borra con cadena vacía y audita sin guardar los textos largos', async () => {
      const policy = 'Política de privacidad. '.repeat(20).trim();
      const res = await api()
        .patch('/api/institution')
        .send({
          name: 'Liga Deportiva Cantonal de Quero',
          address: 'Calle Bolívar y Sucre, Quero',
          email: 'Contacto@LigaQuero.example',
          phone: '032 777 000',
          website: 'https://ligaquero.example',
          privacyPolicy: policy,
          presidentName: 'Presidente Demo',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        address: 'Calle Bolívar y Sucre, Quero',
        email: 'contacto@ligaquero.example',
        website: 'https://ligaquero.example',
      });

      const cleared = await api()
        .patch('/api/institution')
        .send({ address: '', phone: '' })
        .expect(200);
      expect(cleared.body.address).toBeNull();
      expect(cleared.body.phone).toBeNull();
      expect(cleared.body.email).toBe('contacto@ligaquero.example');

      const logs = await prisma.auditLog.findMany({
        where: { action: 'institution.updated' },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs).toHaveLength(2);
      const first = JSON.stringify(logs[0]!.afterSnapshot);
      expect(first).toContain(`${policy.length} caracteres`);
      expect(first).not.toContain('Política de privacidad.');
      expect(logs[0]!.userId).toBe(admin.user.id);
    });

    it('no audita cuando no hay cambios', async () => {
      await api().patch('/api/institution').send({}).expect(200);
      expect(
        await prisma.auditLog.count({
          where: { action: 'institution.updated' },
        }),
      ).toBe(0);
    });

    it('rechaza datos inválidos y campos desconocidos', async () => {
      await api().patch('/api/institution').send({ name: '   ' }).expect(400);
      await api()
        .patch('/api/institution')
        .send({ email: 'no-es-correo' })
        .expect(400);
      await api()
        .patch('/api/institution')
        .send({ website: 'javascript:alert(1)' })
        .expect(400);
      await api()
        .patch('/api/institution')
        .send({ website: 'ligaquero.example' })
        .expect(400);
      await api()
        .patch('/api/institution')
        .send({ logoFileId: '00000000-0000-7000-8000-000000000000' })
        .expect(400);
    });
  });

  describe('logotipo', () => {
    it('sube, publica, reemplaza y elimina el logotipo', async () => {
      await t.http().get('/api/public/institution/logo').expect(404);

      await api()
        .put('/api/institution/logo')
        .attach('file', validPng, 'logo.png')
        .expect(200);
      expect(
        (await t.http().get('/api/public/institution').expect(200)).body
          .hasLogo,
      ).toBe(true);
      const served = await t
        .http()
        .get('/api/public/institution/logo')
        .expect(200);
      expect(served.headers['content-type']).toBe('image/png');
      expect(served.headers['x-content-type-options']).toBe('nosniff');
      expect(served.body).toEqual(validPng);

      const before = await prisma.storedFile.count();
      await api()
        .put('/api/institution/logo')
        .attach('file', validPng, 'logo2.png')
        .expect(200);
      expect(await prisma.storedFile.count()).toBe(before);

      await api().delete('/api/institution/logo').expect(204);
      await t.http().get('/api/public/institution/logo').expect(404);
      await api().delete('/api/institution/logo').expect(404);

      const actions = (await prisma.auditLog.findMany()).map((l) => l.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'institution.logo_changed',
          'institution.logo_removed',
        ]),
      );
    });

    it('rechaza archivos que no son imágenes válidas o no llegan', async () => {
      await api()
        .put('/api/institution/logo')
        .attach('file', Buffer.from('<script>alert(1)</script>'), 'logo.png')
        .expect(400);
      await api()
        .put('/api/institution/logo')
        .attach('file', Buffer.from('%PDF-1.4 x'), {
          filename: 'logo.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);
      await api().put('/api/institution/logo').expect(415);
    });
  });

  describe('portal público', () => {
    it('publica solo los datos institucionales, sin identificadores internos', async () => {
      await api()
        .patch('/api/institution')
        .send({
          about: 'Quiénes somos',
          contactInfo: 'Atención: lunes a viernes',
        })
        .expect(200);
      const res = await t.http().get('/api/public/institution').expect(200);
      expect(res.body).toMatchObject({
        name: 'Liga Deportiva Cantonal de Quero',
        about: 'Quiénes somos',
        contactInfo: 'Atención: lunes a viernes',
        publication: {
          clubs: true,
          athletes: true,
          news: true,
          resolutions: false,
        },
      });
      expect(res.body).not.toHaveProperty('id');
      expect(res.body).not.toHaveProperty('updatedById');
      expect(res.body).not.toHaveProperty('documentFooter');
    });

    it('los parámetros de publicación apagan los clubes y los perfiles de deportistas', async () => {
      await prisma.club.create({
        data: {
          name: 'Club Visible',
          nameKey: 'club visible',
          slug: 'club-visible',
        },
      });
      expect(
        (await t.http().get('/api/public/clubs').expect(200)).body.total,
      ).toBe(1);

      await api()
        .patch('/api/institution')
        .send({ publicClubs: false, publicAthletes: false })
        .expect(200);
      await t.http().get('/api/public/clubs').expect(404);
      await t.http().get('/api/public/clubs/club-visible').expect(404);
      await t
        .http()
        .get('/api/public/athletes/00000000-0000-7000-8000-000000000000')
        .expect(404);
      await t
        .http()
        .get('/api/public/athletes/00000000-0000-7000-8000-000000000000/photo')
        .expect(404);

      await api()
        .patch('/api/institution')
        .send({ publicClubs: true })
        .expect(200);
      await t.http().get('/api/public/clubs').expect(200);
    });
  });
});
