import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, dbFailure, resetDatabase } from '../support/db.js';
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

const EDITOR = [
  'announcements:read',
  'announcements:manage',
  'announcements:publish',
  'announcements:delete',
];

const draft = (over: Record<string, unknown> = {}) => ({
  kind: 'noticia',
  title: 'Arranca el campeonato cantonal de fútbol',
  summary: 'La Liga inaugura la temporada con ocho equipos inscritos.',
  content:
    'La Liga Cantonal inaugura la temporada.\n\nSe jugará los fines de semana en el estadio.',
  ...over,
});

describe('noticias, comunicados e imágenes del portal', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let editor: Awaited<ReturnType<typeof adminWith>>;

  const api = () => authed(t, editor.session);

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    editor = await adminWith(t, prisma, EDITOR);
  });

  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  const create = async (over: Record<string, unknown> = {}) =>
    (await api().post('/api/announcements').send(draft(over)).expect(201)).body;

  const publish = (id: string) =>
    api().post(`/api/announcements/${id}/publish`).expect(200);

  describe('acceso', () => {
    it('exige sesión y separa leer, redactar, publicar y eliminar', async () => {
      await t.http().get('/api/announcements').expect(401);
      const post = await create();

      const reader = await createUser(prisma, {
        permissions: ['announcements:read'],
      });
      const writer = await createUser(prisma, {
        permissions: ['announcements:read', 'announcements:manage'],
      });
      const asReader = authed(t, await login(t, reader.email));
      const asWriter = authed(t, await login(t, writer.email));

      await asReader.get('/api/announcements').expect(200);
      await asReader.post('/api/announcements').send(draft()).expect(403);
      await asWriter
        .post('/api/announcements')
        .send(draft({ title: 'Otra noticia de prueba' }))
        .expect(201);
      // Redactar no es publicar: ni publicar, ni retirar, ni archivar, ni eliminar.
      for (const action of ['publish', 'unpublish', 'archive']) {
        await asWriter
          .post(`/api/announcements/${post.id}/${action}`)
          .expect(403);
      }
      await asWriter.delete(`/api/announcements/${post.id}`).expect(403);
      await asReader.get('/api/media').expect(200);
      await asReader
        .post('/api/media')
        .field('altText', 'Imagen de prueba')
        .attach('file', validPng, 'a.png')
        .expect(403);

      const nobody = await createUser(prisma, { permissions: ['sports:read'] });
      await authed(t, await login(t, nobody.email))
        .get('/api/announcements')
        .expect(403);
    });

    it('un editor de contenido no puede tocar resultados', async () => {
      const as = authed(t, editor.session);
      await as
        .put('/api/events/00000000-0000-7000-8000-000000000000/result')
        .send({ values: [] })
        .expect(403);
      await as
        .post('/api/events/00000000-0000-7000-8000-000000000000/result/approve')
        .send({ approved: true, reason: 'x' })
        .expect(403);
    });
  });

  describe('redacción', () => {
    it('crea un borrador con dirección estable, que no cambia al editar el título', async () => {
      const post = await create({
        title: 'Inauguración del campeonato: ¡gran apertura!',
      });
      expect(post).toMatchObject({
        status: 'borrador',
        slug: 'inauguracion-del-campeonato-gran-apertura',
        publishedAt: null,
        author: editor.user.displayName,
      });
      const edited = await api()
        .patch(`/api/announcements/${post.id}`)
        .send({ title: 'Título completamente distinto' })
        .expect(200);
      expect(edited.body.slug).toBe(post.slug);

      const same = await create({
        title: 'Inauguración del campeonato: ¡gran apertura!',
      });
      expect(same.slug).toBe('inauguracion-del-campeonato-gran-apertura-2');
    });

    it('valida los datos y rechaza campos desconocidos', async () => {
      const send = (body: object) =>
        api().post('/api/announcements').send(body);
      await send(draft({ title: 'abc' })).expect(400);
      await send(draft({ summary: 'muy corto' })).expect(400);
      await send(draft({ content: 'muy corto' })).expect(400);
      await send(draft({ kind: 'anuncio' })).expect(400);
      await send(draft({ status: 'publicado' })).expect(400);
      await send(draft({ coverId: 'no-es-uuid' })).expect(400);
      await send(
        draft({ coverId: '00000000-0000-7000-8000-000000000000' }),
      ).expect(400);
    });

    it('guarda el contenido como texto plano y audita sin copiar el texto', async () => {
      const post = await create({
        content:
          '<script>alert(1)</script>\n\nSegundo párrafo con texto largo.',
      });
      const stored = await api()
        .get(`/api/announcements/${post.id}`)
        .expect(200);
      expect(stored.body.content).toContain('<script>alert(1)</script>');
      await api()
        .patch(`/api/announcements/${post.id}`)
        .send({ content: 'Contenido nuevo y diferente del anterior.' })
        .expect(200);
      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'announcement' },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.action)).toEqual([
        'announcement.created',
        'announcement.updated',
      ]);
      expect(JSON.stringify(logs)).not.toContain('Contenido nuevo');
      expect(JSON.stringify(logs)).toContain('contentLength');
    });
  });

  describe('publicación y portal', () => {
    it('un borrador no se ve; al publicarlo aparece, ordenado por fecha, y al retirarlo desaparece', async () => {
      const first = await create({ title: 'Primera noticia del portal' });
      const second = await create({
        title: 'Comunicado oficial de la secretaría',
        kind: 'comunicado',
      });
      await t.http().get('/api/public/announcements').expect(200);
      expect((await t.http().get('/api/public/announcements')).body.total).toBe(
        0,
      );
      await t.http().get(`/api/public/announcements/${first.slug}`).expect(404);

      await publish(first.id);
      await publish(second.id);
      const list = await t.http().get('/api/public/announcements').expect(200);
      expect(list.body.items.map((i: { slug: string }) => i.slug)).toEqual([
        second.slug,
        first.slug,
      ]);
      expect(list.body.items[0]).toMatchObject({
        kind: 'comunicado',
        title: 'Comunicado oficial de la secretaría',
      });
      expect(list.body.items[0]).not.toHaveProperty('content');
      expect(list.body.items[0]).not.toHaveProperty('author');
      expect(
        (await t.http().get('/api/public/announcements?kind=noticia')).body
          .total,
      ).toBe(1);

      const detail = await t
        .http()
        .get(`/api/public/announcements/${first.slug}`)
        .expect(200);
      expect(detail.body.content).toContain('Se jugará los fines de semana');
      expect(detail.body).not.toHaveProperty('id');

      await api().post(`/api/announcements/${first.id}/unpublish`).expect(200);
      await t.http().get(`/api/public/announcements/${first.slug}`).expect(404);
      expect((await t.http().get('/api/public/announcements')).body.total).toBe(
        1,
      );
    });

    it('respeta las transiciones: no se publica dos veces, se archiva y se restaura', async () => {
      const post = await create();
      await api().post(`/api/announcements/${post.id}/unpublish`).expect(409);
      await publish(post.id);
      await api().post(`/api/announcements/${post.id}/publish`).expect(409);
      // Se puede corregir una publicada.
      await api()
        .patch(`/api/announcements/${post.id}`)
        .send({ summary: 'Resumen corregido de la noticia publicada.' })
        .expect(200);
      await api().post(`/api/announcements/${post.id}/archive`).expect(200);
      await t.http().get(`/api/public/announcements/${post.slug}`).expect(404);
      await api()
        .patch(`/api/announcements/${post.id}`)
        .send({ summary: 'No debería poder editarse archivada.' })
        .expect(409);
      const restored = await api()
        .post(`/api/announcements/${post.id}/unpublish`)
        .expect(200);
      expect(restored.body).toMatchObject({
        status: 'borrador',
        publishedAt: null,
      });
    });

    it('solo se eliminan borradores; lo publicado se retira o se archiva primero', async () => {
      const draftPost = await create({ title: 'Borrador sin publicar nunca' });
      const live = await create({ title: 'Esta noticia está publicada' });
      await publish(live.id);
      const err = await api()
        .delete(`/api/announcements/${live.id}`)
        .expect(409);
      expect(err.body.message).toMatch(/Solo se eliminan borradores/);
      await api().post(`/api/announcements/${live.id}/archive`).expect(200);
      await api().delete(`/api/announcements/${live.id}`).expect(409);

      await api().delete(`/api/announcements/${draftPost.id}`).expect(204);
      await api().delete(`/api/announcements/${draftPost.id}`).expect(404);
      const actions = (
        await prisma.auditLog.findMany({
          where: { entityType: 'announcement' },
        })
      ).map((l) => l.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'announcement.published',
          'announcement.archived',
          'announcement.deleted',
        ]),
      );
    });

    it('la configuración institucional puede apagar las noticias', async () => {
      const post = await create();
      await publish(post.id);
      await prisma.institutionSettings.upsert({
        where: { id: 1 },
        update: { publicNews: false },
        create: { id: 1, name: 'Liga', publicNews: false },
      });
      await t.http().get('/api/public/announcements').expect(404);
      await t.http().get(`/api/public/announcements/${post.slug}`).expect(404);
      expect((await t.http().get('/api/public/home')).body.news).toEqual([]);
    });

    it('la base de datos exige que solo lo publicado tenga fecha de publicación', async () => {
      const post = await create();
      const failure = await dbFailure(
        prisma.announcement.update({
          where: { id: post.id },
          data: { status: 'publicado', publishedAt: null },
        }),
      );
      expect(failure.sqlState).toBe('23514');
      expect(
        (
          await dbFailure(
            prisma.announcement.update({
              where: { id: post.id },
              data: { slug: 'Slug Inválido' },
            }),
          )
        ).sqlState,
      ).toBe('23514');
    });
  });

  describe('imágenes', () => {
    const upload = (alt = 'Equipo campeón levantando la copa') =>
      api()
        .post('/api/media')
        .field('altText', alt)
        .attach('file', validPng, 'foto.png');

    it('sube una imagen con texto alternativo y la sirve públicamente', async () => {
      const media = (await upload().expect(201)).body;
      expect(media).toMatchObject({
        altText: 'Equipo campeón levantando la copa',
        visibility: 'publico',
      });
      const file = await t
        .http()
        .get(`/api/public/media/${media.id}`)
        .expect(200);
      expect(file.headers['content-type']).toBe('image/png');
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      expect(file.body).toEqual(validPng);

      const list = await api().get('/api/media').expect(200);
      expect(list.body.items[0]).toMatchObject({ id: media.id, usedIn: 0 });
    });

    it('rechaza archivos que no son imágenes y exige la descripción', async () => {
      await api()
        .post('/api/media')
        .field('altText', 'Texto alternativo')
        .attach('file', Buffer.from('<?php echo 1; ?>'), 'x.png')
        .expect(400);
      await api()
        .post('/api/media')
        .field('altText', 'Texto alternativo')
        .attach('file', Buffer.from('%PDF-1.4 x'), {
          filename: 'x.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);
      await api()
        .post('/api/media')
        .field('altText', 'ab')
        .attach('file', validPng, 'a.png')
        .expect(400);
      await api()
        .post('/api/media')
        .attach('file', validPng, 'a.png')
        .expect(400);
    });

    it('sirve de portada, protege la imagen en uso y las privadas no se publican', async () => {
      const media = (await upload().expect(201)).body;
      const post = await create({ coverId: media.id });
      expect(post.cover).toMatchObject({ id: media.id });
      await publish(post.id);
      const pub = await t.http().get(`/api/public/announcements/${post.slug}`);
      expect(pub.body.cover).toEqual({
        id: media.id,
        altText: 'Equipo campeón levantando la copa',
      });

      expect(
        (await api().delete(`/api/media/${media.id}`).expect(409)).body.message,
      ).toMatch(/portada/);
      await api()
        .patch(`/api/announcements/${post.id}`)
        .send({ coverId: null })
        .expect(200);
      await api().delete(`/api/media/${media.id}`).expect(204);
      await t.http().get(`/api/public/media/${media.id}`).expect(404);

      const hidden = (
        await upload('Imagen interna de la secretaría').expect(201)
      ).body;
      await prisma.mediaAsset.update({
        where: { id: hidden.id },
        data: { visibility: 'privado' },
      });
      await t.http().get(`/api/public/media/${hidden.id}`).expect(404);
      await api()
        .post('/api/announcements')
        .send(draft({ coverId: hidden.id }))
        .expect(400);
    });
  });
});
