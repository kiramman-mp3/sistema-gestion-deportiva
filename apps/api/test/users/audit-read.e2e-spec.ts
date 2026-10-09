import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { TEST_ORIGIN, createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, dbFailure, resetDatabase } from '../support/db.js';
import {
  adminWith,
  authed,
  createUser,
  seedCatalog,
} from '../support/fixtures.js';

describe('consulta de auditoría', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let reader: Awaited<ReturnType<typeof adminWith>>;
  const api = () => authed(t, reader.session);

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
    reader = await adminWith(t, prisma, ['audit:read']);
    // El login del lector deja su propio registro; la tabla es inmutable, así que se reinicia con TRUNCATE
    await prisma.$executeRawUnsafe('TRUNCATE TABLE audit_logs');
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  const insert = (
    data: {
      action?: string;
      entityType?: string;
      entityId?: string;
      userId?: string;
      createdAt?: Date;
    } & Record<string, unknown>,
  ) =>
    prisma.auditLog.create({
      data: { action: 'prueba.accion', entityType: 'prueba', ...data } as never,
    });

  describe('autorización', () => {
    it('exige sesión (401) y el permiso explícito audit:read (403)', async () => {
      await t.http().get('/api/audit-logs').expect(401);
      for (const permissions of [
        ['users:read', 'users:update', 'roles:read', 'roles:manage'],
        ['sports:read'],
      ]) {
        const other = await adminWith(t, prisma, permissions);
        await authed(t, other.session).get('/api/audit-logs').expect(403);
      }
      await api().get('/api/audit-logs').expect(200);
    });

    it('no existe ninguna operación para modificar o borrar registros', async () => {
      const entry = await insert({});
      for (const method of ['post', 'put', 'patch', 'delete'] as const) {
        for (const path of ['/api/audit-logs', `/api/audit-logs/${entry.id}`]) {
          const res = await authed(t, reader.session)
            [method](path)
            .send({ action: 'alterado' });
          expect([404, 403], `${method} ${path}`).toContain(res.status);
        }
      }
      expect(
        (await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } }))
          .action,
      ).toBe('prueba.accion');
    });

    it('la base de datos sigue impidiendo modificar o borrar registros', async () => {
      const entry = await insert({});
      expect(
        (
          await dbFailure(
            prisma.auditLog.update({
              where: { id: entry.id },
              data: { reason: 'x' },
            }),
          )
        ).message,
      ).toContain('inmutables');
      expect(
        (await dbFailure(prisma.auditLog.delete({ where: { id: entry.id } })))
          .message,
      ).toContain('inmutables');
    });

    it('sin la CSRF-protección de lectura: una lectura (GET) no exige token CSRF, pero sí cookie', async () => {
      await t
        .http()
        .get('/api/audit-logs')
        .set('Cookie', reader.session.cookie)
        .set('Origin', TEST_ORIGIN)
        .expect(200);
    });
  });

  describe('contenido y orden', () => {
    it('devuelve actor, acción, entidad y momento, ordenados del más reciente al más antiguo', async () => {
      const actor = await createUser(prisma, {
        email: 'ana@liga.example',
        displayName: 'Ana Pérez',
      });
      await insert({
        action: 'a.uno',
        userId: actor.id,
        entityId: 'e1',
        createdAt: new Date('2026-05-01T10:00:00Z'),
        reason: 'motivo',
      });
      await insert({
        action: 'a.dos',
        createdAt: new Date('2026-05-03T10:00:00Z'),
      });
      const res = await api().get('/api/audit-logs').expect(200);

      expect(res.body.total).toBe(2);
      expect(res.body.items.map((i: { action: string }) => i.action)).toEqual([
        'a.dos',
        'a.uno',
      ]);
      expect(res.body.items[1]).toMatchObject({
        actor: {
          id: actor.id,
          email: 'ana@liga.example',
          displayName: 'Ana Pérez',
        },
        entityType: 'prueba',
        entityId: 'e1',
        reason: 'motivo',
        createdAt: '2026-05-01T10:00:00.000Z',
      });
      expect(res.body.items[0].actor).toBeNull();
    });

    it('no expone hashes de IP, hashes de contraseña ni otros datos internos del actor', async () => {
      const actor = await createUser(prisma, { email: 'ana@liga.example' });
      await insert({ userId: actor.id, ipHash: 'a'.repeat(64) });
      const res = await api().get('/api/audit-logs').expect(200);
      const dump = JSON.stringify(res.body);
      expect(dump).not.toMatch(/ipHash|ip_hash|passwordHash|argon2/i);
      expect(dump).not.toContain('a'.repeat(64));
      expect(Object.keys(res.body.items[0]).sort()).toEqual(
        [
          'action',
          'actor',
          'after',
          'before',
          'createdAt',
          'entityId',
          'entityType',
          'id',
          'reason',
        ].sort(),
      );
    });

    it('la paginación es estable aunque varios registros compartan el mismo instante', async () => {
      const same = new Date('2026-06-01T12:00:00Z');
      for (let i = 0; i < 25; i++)
        await insert({
          action: `lote.${String(i).padStart(2, '0')}`,
          createdAt: same,
        });
      const seen: string[] = [];
      for (let page = 1; page <= 3; page++) {
        const res = await api()
          .get(`/api/audit-logs?pageSize=10&page=${page}`)
          .expect(200);
        expect(res.body.total).toBe(25);
        seen.push(...res.body.items.map((i: { id: string }) => i.id));
      }
      expect(new Set(seen).size).toBe(25);
      const again = await api()
        .get('/api/audit-logs?pageSize=10&page=2')
        .expect(200);
      expect(again.body.items.map((i: { id: string }) => i.id)).toEqual(
        seen.slice(10, 20),
      );
    });
  });

  describe('filtros', () => {
    beforeEach(async () => {
      const ana = await createUser(prisma, {
        email: 'ana@liga.example',
        displayName: 'Ana Pérez',
      });
      const luis = await createUser(prisma, {
        email: 'luis@otro.example',
        displayName: 'Luis Gómez',
      });
      await insert({
        action: 'user.create',
        entityType: 'user',
        entityId: 'u-1',
        userId: ana.id,
        createdAt: new Date('2026-03-10T08:00:00Z'),
      });
      await insert({
        action: 'user.update',
        entityType: 'user',
        entityId: 'u-1',
        userId: luis.id,
        createdAt: new Date('2026-03-15T23:30:00Z'),
      });
      await insert({
        action: 'sport.create',
        entityType: 'sport',
        entityId: 's-1',
        userId: ana.id,
        createdAt: new Date('2026-04-01T00:00:00Z'),
      });
      await insert({
        action: 'auth.login_failed',
        entityType: 'user',
        createdAt: new Date('2026-04-20T12:00:00Z'),
      });
    });
    const actions = async (qs: string) =>
      (
        (await api().get(`/api/audit-logs?${qs}`).expect(200)).body.items as {
          action: string;
        }[]
      )
        .map((i) => i.action)
        .sort();

    it('por acción, tipo e identificador de entidad', async () => {
      expect(await actions('action=user.update')).toEqual(['user.update']);
      expect(await actions('entityType=user')).toEqual([
        'auth.login_failed',
        'user.create',
        'user.update',
      ]);
      expect(await actions('entityType=user&entityId=u-1')).toEqual([
        'user.create',
        'user.update',
      ]);
      expect(await actions('entityId=s-1')).toEqual(['sport.create']);
      expect(await actions('action=no.existe')).toEqual([]);
    });

    it('por actor (id exacto o texto del correo/nombre, sin distinguir mayúsculas)', async () => {
      const ana = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@liga.example' },
      });
      expect(await actions(`userId=${ana.id}`)).toEqual([
        'sport.create',
        'user.create',
      ]);
      expect(await actions('actor=GÓMEZ')).toEqual(['user.update']);
      expect(await actions('actor=otro.example')).toEqual(['user.update']);
      expect(await actions('actor=%25')).toEqual([]);
    });

    it('por rango de fechas: instantes ISO y días completos', async () => {
      expect(
        await actions('from=2026-03-15T23:00:00Z&to=2026-04-01T00:00:00Z'),
      ).toEqual(['sport.create', 'user.update']);
      expect(await actions('from=2026-04-01')).toEqual([
        'auth.login_failed',
        'sport.create',
      ]);
      // `to` con solo la fecha incluye todo ese día
      expect(await actions('to=2026-03-15')).toEqual([
        'user.create',
        'user.update',
      ]);
      expect(await actions('from=2026-03-10&to=2026-03-10')).toEqual([
        'user.create',
      ]);
      expect(await actions('from=2027-01-01')).toEqual([]);
    });

    it('combina filtros y rechaza parámetros inválidos', async () => {
      expect(await actions('entityType=user&from=2026-03-12')).toEqual([
        'auth.login_failed',
        'user.update',
      ]);
      for (const qs of [
        'from=ayer',
        'to=32/13/2026',
        'userId=no-uuid',
        'page=0',
        'pageSize=500',
        'action=' + 'x'.repeat(101),
      ]) {
        await api().get(`/api/audit-logs?${qs}`).expect(400);
      }
    });
  });

  describe('protección de información sensible', () => {
    it('enmascara secretos aunque un registro antiguo los contenga por error', async () => {
      await insert({
        action: 'legacy.cambio',
        beforeSnapshot: {
          passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$abc$def',
          name: 'Visible',
          nested: { sessionToken: 'abc', csrfToken: 'xyz' },
        },
        afterSnapshot: {
          password: 'mi-clave-secreta',
          cookie: 'liga_sid=abc',
          authorization: 'Bearer abc',
          apiKey: 'k',
          list: [
            { token: 't' },
            'a'.repeat(43),
            'b'.repeat(64),
            '$argon2id$v=19$x',
            'texto normal',
          ],
          conteo: 3,
          revokedSessions: 2,
          permissions: ['sports:read'],
        },
      });
      const res = await api().get('/api/audit-logs').expect(200);
      const [item] = res.body.items;
      expect(item.before).toEqual({
        passwordHash: '[oculto]',
        name: 'Visible',
        nested: { sessionToken: '[oculto]', csrfToken: '[oculto]' },
      });
      expect(item.after).toEqual({
        password: '[oculto]',
        cookie: '[oculto]',
        authorization: '[oculto]',
        apiKey: '[oculto]',
        list: [
          { token: '[oculto]' },
          '[oculto]',
          '[oculto]',
          '[oculto]',
          'texto normal',
        ],
        conteo: 3,
        revokedSessions: 2,
        permissions: ['sports:read'],
      });
      const dump = JSON.stringify(res.body);
      for (const secret of [
        'mi-clave-secreta',
        'liga_sid',
        'Bearer',
        'argon2',
        'a'.repeat(43),
        'b'.repeat(64),
      ]) {
        expect(dump).not.toContain(secret);
      }
    });

    it('los registros generados por la propia administración no contienen secretos', async () => {
      const newUser = await authed(
        t,
        (
          await adminWith(t, prisma, [
            'users:create',
            'roles:manage',
            'users:update',
          ])
        ).session,
      )
        .post('/api/users')
        .send({ email: 'nueva@liga.example', displayName: 'Nueva' })
        .expect(201);
      const res = await api()
        .get('/api/audit-logs?action=user.create')
        .expect(200);
      expect(res.body.total).toBe(1);
      const dump = JSON.stringify(res.body);
      expect(dump).not.toContain(newUser.body.activation.token);
      expect(dump).not.toMatch(/argon2|passwordHash/i);
    });
  });
});
