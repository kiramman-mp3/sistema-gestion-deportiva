import { Buffer } from 'node:buffer';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, type TestApp, TEST_ORIGIN } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import {
  adminWith,
  authed,
  createClub,
  seedCatalog,
} from '../support/fixtures.js';

const PERMISSIONS = [
  'athletes:read',
  'athletes:manage',
  'athletes:publish',
  'documents:read',
  'documents:manage',
  'clubs:access_all',
];

describe('documentos y fotografías de deportistas', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof adminWith>>;
  let club: Awaited<ReturnType<typeof createClub>>;
  let athlete: { id: string; personId: string };

  const validPng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
  ]);
  const validPdf = Buffer.from('%PDF-1.4 documento oficial de prueba para la Liga');

  const api = () => authed(t, admin.session);

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    admin = await adminWith(t, prisma, PERMISSIONS);
    club = await createClub(prisma, 'Club Central Quero');

    const person = await prisma.person.create({
      data: {
        firstName: 'Carlos',
        lastName: 'Morocho',
        birthDate: new Date('2000-05-15'),
        status: 'activo',
      },
    });

    const ath = await prisma.athlete.create({
      data: {
        personId: person.id,
        clubId: club.id,
        eligibility: 'habilitado',
        publicProfile: false,
      },
    });
    athlete = { id: ath.id, personId: person.id };
  });

  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  describe('fotografía', () => {
    it('sube una fotografía y la asocia al deportista auditando la operación', async () => {
      const res = await api()
        .post(`/api/athletes/${athlete.id}/photo`)
        .set('Origin', TEST_ORIGIN)
        .attach('file', validPng, 'foto.png');

      expect(res.status).toBe(201);

      const dbPhoto = await prisma.athletePhoto.findUnique({
        where: { athleteId: athlete.id },
        include: { file: true },
      });
      expect(dbPhoto).toBeDefined();
      expect(dbPhoto?.file.mimeType).toBe('image/png');

      // Auditoría
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'athlete.photo_uploaded', entityId: athlete.id },
      });
      expect(audit).toBeDefined();
      expect(audit?.userId).toBe(admin.user.id);
    });

    it('descarga la fotografía privada con permiso athletes:read', async () => {
      await api()
        .post(`/api/athletes/${athlete.id}/photo`)
        .set('Origin', TEST_ORIGIN)
        .attach('file', validPng, 'foto.png');

      const res = await api().get(`/api/athletes/${athlete.id}/photo`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.body).toEqual(validPng);
    });

    it('acceso público a la foto solo con perfil publicado y consentimiento vigente', async () => {
      await api()
        .post(`/api/athletes/${athlete.id}/photo`)
        .set('Origin', TEST_ORIGIN)
        .attach('file', validPng, 'foto.png');

      // 1. Sin publicar ni consentimiento -> 404
      const res1 = await t.http().get(`/api/public/athletes/${athlete.id}/photo`);
      expect(res1.status).toBe(404);

      // 2. Con consentimiento pero sin perfil público -> 404
      await prisma.consentRecord.create({
        data: {
          personId: athlete.personId,
          type: 'publicacion_foto',
          status: 'otorgado',
          grantedByName: 'Carlos Morocho',
          grantedByRelation: 'propio',
          recordedById: admin.user.id,
        },
      });

      const res2 = await t.http().get(`/api/public/athletes/${athlete.id}/photo`);
      expect(res2.status).toBe(404);

      // 3. Con perfil publicado -> 200 y headers de privacidad
      await prisma.athlete.update({
        where: { id: athlete.id },
        data: { publicProfile: true },
      });

      const res3 = await t.http().get(`/api/public/athletes/${athlete.id}/photo`);
      expect(res3.status).toBe(200);
      expect(res3.headers['content-type']).toBe('image/png');
      expect(res3.headers['x-robots-tag']).toBe('noindex, nofollow');
    });

    it('elimina la fotografía y lo audita', async () => {
      await api()
        .post(`/api/athletes/${athlete.id}/photo`)
        .set('Origin', TEST_ORIGIN)
        .attach('file', validPng, 'foto.png');

      const res = await api()
        .delete(`/api/athletes/${athlete.id}/photo`)
        .set('Origin', TEST_ORIGIN);

      expect(res.status).toBe(200);

      const dbPhoto = await prisma.athletePhoto.findUnique({
        where: { athleteId: athlete.id },
      });
      expect(dbPhoto).toBeNull();

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'athlete.photo_deleted', entityId: athlete.id },
      });
      expect(audit).toBeDefined();
    });
  });

  describe('documentos', () => {
    it('sube un documento PDF y lo audita con estado no verificado', async () => {
      const res = await api()
        .post(`/api/athletes/${athlete.id}/documents`)
        .set('Origin', TEST_ORIGIN)
        .field('type', 'identificacion')
        .field('title', 'Cédula de ciudadanía')
        .attach('file', validPdf, 'cedula.pdf');

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Cédula de ciudadanía');
      expect(res.body.type).toBe('identificacion');
      expect(res.body.verified).toBe(false);

      const dbDoc = await prisma.athleteDocument.findUnique({
        where: { id: res.body.id },
      });
      expect(dbDoc).toBeDefined();
      expect(dbDoc?.verified).toBe(false);

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'athlete.document_uploaded', entityId: res.body.id },
      });
      expect(audit).toBeDefined();
    });

    it('lista los documentos del deportista y permite descargar el archivo', async () => {
      const uploadRes = await api()
        .post(`/api/athletes/${athlete.id}/documents`)
        .set('Origin', TEST_ORIGIN)
        .field('type', 'certificado_medico')
        .field('title', 'Certificado Médico 2026')
        .attach('file', validPdf, 'medico.pdf');

      const listRes = await api().get(`/api/athletes/${athlete.id}/documents`);
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].title).toBe('Certificado Médico 2026');

      const downloadRes = await api().get(
        `/api/athletes/${athlete.id}/documents/${uploadRes.body.id}/file`,
      );
      expect(downloadRes.status).toBe(200);
      expect(downloadRes.headers['content-type']).toBe('application/pdf');
      expect(downloadRes.body).toEqual(validPdf);
    });

    it('verifica un documento y registra al revisor en auditoría y base de datos', async () => {
      const uploadRes = await api()
        .post(`/api/athletes/${athlete.id}/documents`)
        .set('Origin', TEST_ORIGIN)
        .field('type', 'identificacion')
        .field('title', 'Cédula de identidad')
        .attach('file', validPdf, 'cedula.pdf');

      const verifyRes = await api()
        .patch(`/api/athletes/${athlete.id}/documents/${uploadRes.body.id}/verify`)
        .set('Origin', TEST_ORIGIN)
        .send({ verified: true, reason: 'Validada contra original' });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.verified).toBe(true);
      expect(verifyRes.body.verifiedBy.id).toBe(admin.user.id);

      const dbDoc = await prisma.athleteDocument.findUnique({
        where: { id: uploadRes.body.id },
      });
      expect(dbDoc?.verified).toBe(true);
      expect(dbDoc?.verifiedById).toBe(admin.user.id);
      expect(dbDoc?.verifiedAt).toBeDefined();

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'athlete.document_verified', entityId: uploadRes.body.id },
      });
      expect(audit).toBeDefined();
      expect(audit?.reason).toBe('Validada contra original');
    });

    it('elimina un documento y su archivo en almacenamiento', async () => {
      const uploadRes = await api()
        .post(`/api/athletes/${athlete.id}/documents`)
        .set('Origin', TEST_ORIGIN)
        .field('type', 'otro')
        .field('title', 'Documento provisional')
        .attach('file', validPdf, 'doc.pdf');

      const delRes = await api()
        .delete(`/api/athletes/${athlete.id}/documents/${uploadRes.body.id}`)
        .set('Origin', TEST_ORIGIN);

      expect(delRes.status).toBe(200);

      const dbDoc = await prisma.athleteDocument.findUnique({
        where: { id: uploadRes.body.id },
      });
      expect(dbDoc).toBeNull();

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'athlete.document_deleted', entityId: uploadRes.body.id },
      });
      expect(audit).toBeDefined();
    });
  });
});
