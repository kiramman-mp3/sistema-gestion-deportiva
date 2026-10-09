import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { TEST_ORIGIN, createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import {
  adminWith,
  authed,
  createUser,
  login,
  seedCatalog,
} from '../support/fixtures.js';

const ID = '0197aaaa-0000-7000-8000-000000000000';

interface Endpoint {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  permission: 'read' | 'manage' | 'delete';
  body?: object;
}

function endpoints(resource: string): Endpoint[] {
  return [
    { method: 'get', path: `/api/${resource}`, permission: 'read' },
    { method: 'get', path: `/api/${resource}/${ID}`, permission: 'read' },
    {
      method: 'post',
      path: `/api/${resource}`,
      permission: 'manage',
      body: {},
    },
    {
      method: 'patch',
      path: `/api/${resource}/${ID}`,
      permission: 'manage',
      body: {},
    },
    {
      method: 'patch',
      path: `/api/${resource}/${ID}/status`,
      permission: 'manage',
      body: {},
    },
    { method: 'delete', path: `/api/${resource}/${ID}`, permission: 'delete' },
  ];
}

describe.each(['sports', 'categories', 'seasons'])(
  'control de acceso de /%s',
  (resource) => {
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

    const send = (e: Endpoint, session?: Awaited<ReturnType<typeof login>>) => {
      const req = session
        ? authed(t, session)[e.method](e.path)
        : t.http()[e.method](e.path).set('Origin', TEST_ORIGIN);
      return e.body ? req.send(e.body) : req;
    };

    it('rechaza TODAS las operaciones sin sesión (401)', async () => {
      for (const e of endpoints(resource)) {
        const res = await send(e);
        expect(res.status, `${e.method} ${e.path}`).toBe(401);
      }
    });

    it('rechaza con sesión pero sin permisos de catálogo (403)', async () => {
      const { session } = await adminWith(t, prisma, [
        'roles:read',
        'users:update',
      ]);
      for (const e of endpoints(resource)) {
        const res = await send(e, session);
        expect(res.status, `${e.method} ${e.path}`).toBe(403);
      }
    });

    it(`con solo ${resource}:read únicamente se permiten las lecturas`, async () => {
      const { session } = await adminWith(t, prisma, [`${resource}:read`]);
      for (const e of endpoints(resource)) {
        const res = await send(e, session);
        if (e.permission === 'read')
          expect(res.status, `${e.method} ${e.path}`).not.toBe(403);
        else expect(res.status, `${e.method} ${e.path}`).toBe(403);
      }
    });

    it(`${resource}:manage no implica eliminar, ni leer implica gestionar`, async () => {
      const { session } = await adminWith(t, prisma, [`${resource}:manage`]);
      for (const e of endpoints(resource)) {
        const res = await send(e, session);
        if (e.permission === 'manage')
          expect(res.status, `${e.method} ${e.path}`).not.toBe(403);
        else expect(res.status, `${e.method} ${e.path}`).toBe(403);
      }
    });

    it(`con ${resource}:delete (y solo ese) se puede intentar eliminar`, async () => {
      const { session } = await adminWith(t, prisma, [`${resource}:delete`]);
      const del = endpoints(resource).find((e) => e.method === 'delete')!;
      expect((await send(del, session)).status).toBe(404); // autorizado; el registro no existe
    });

    it('los permisos de otro catálogo no sirven', async () => {
      const other = resource === 'sports' ? 'seasons' : 'sports';
      const { session } = await adminWith(t, prisma, [
        `${other}:read`,
        `${other}:manage`,
        `${other}:delete`,
      ]);
      for (const e of endpoints(resource)) {
        expect((await send(e, session)).status, `${e.method} ${e.path}`).toBe(
          403,
        );
      }
    });

    it('las escrituras exigen el token CSRF aunque haya permiso', async () => {
      const { session } = await adminWith(t, prisma, [
        `${resource}:manage`,
        `${resource}:delete`,
      ]);
      for (const e of endpoints(resource).filter((x) => x.method !== 'get')) {
        const req = t
          .http()
          [e.method](e.path)
          .set('Cookie', session.cookie)
          .set('Origin', TEST_ORIGIN);
        const res = await (e.body ? req.send(e.body) : req);
        expect(res.status, `${e.method} ${e.path}`).toBe(403);
        expect(res.body.message).toBe('Token CSRF inválido');
      }
    });

    it('una cuenta desactivada pierde el acceso al instante', async () => {
      const user = await createUser(prisma, {
        permissions: [`${resource}:read`],
      });
      const session = await login(t, user.email);
      await authed(t, session).get(`/api/${resource}`).expect(200);
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'inactivo' },
      });
      await authed(t, session).get(`/api/${resource}`).expect(401);
    });
  },
);

describe('permisos de catálogo en el seed', () => {
  it('el superadmin los recibe todos (política existente) y un usuario nuevo ninguno', async () => {
    const prisma = createTestPrisma();
    try {
      await resetDatabase(prisma);
      await seedCatalog(prisma);
      const role = await prisma.role.findUniqueOrThrow({
        where: { code: 'superadmin' },
        include: { permissions: { include: { permission: true } } },
      });
      const codes = role.permissions.map((p) => p.permission.code);
      for (const r of ['sports', 'categories', 'seasons']) {
        for (const a of ['read', 'manage', 'delete'])
          expect(codes).toContain(`${r}:${a}`);
      }
      const user = await createUser(prisma);
      expect(await prisma.userRole.count({ where: { userId: user.id } })).toBe(
        0,
      );
    } finally {
      await prisma.$disconnect();
    }
  });
});
