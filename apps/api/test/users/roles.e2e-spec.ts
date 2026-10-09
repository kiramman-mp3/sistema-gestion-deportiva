import { PERMISSIONS, listPermissions } from '../../src/authz/permissions.js';
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

const ALL_CODES = Object.keys(PERMISSIONS);
/** Un administrador de roles «parcial»: gestiona roles y usuarios, pero no auditoría ni altas. */
const MANAGER = [
  'roles:read',
  'roles:manage',
  'users:read',
  'users:update',
  'sports:read',
  'sports:manage',
];

describe('roles y permisos', () => {
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

  const audits = (action: string) =>
    prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });
  const roleByCode = (code: string) =>
    prisma.role.findUniqueOrThrow({ where: { code } });
  const permsOf = async (roleId: string) =>
    (
      await prisma.rolePermission.findMany({
        where: { roleId },
        select: { permission: { select: { code: true } } },
      })
    )
      .map((p) => p.permission.code)
      .sort();
  const rootAdmin = async (email = 'root@liga.example') => {
    const user = await createUser(prisma, { email, roleCodes: ['superadmin'] });
    return { user, session: await login(t, email) };
  };

  // ───────────────────────── catálogo y lectura ─────────────────────────

  describe('catálogo de permisos', () => {
    it('lo entrega el backend agrupable por módulo, con acciones distintas', async () => {
      const { session } = await adminWith(t, prisma, ['roles:read']);
      const res = await authed(t, session).get('/api/permissions').expect(200);
      expect(res.body.map((p: { code: string }) => p.code).sort()).toEqual(
        [...ALL_CODES].sort(),
      );
      expect(res.body).toEqual(JSON.parse(JSON.stringify(listPermissions())));

      const sports = res.body.filter(
        (p: { module: string }) => p.module === 'sports',
      );
      expect(sports.map((p: { action: string }) => p.action)).toEqual([
        'read',
        'manage',
        'delete',
      ]);
      expect(sports.map((p: { actionLabel: string }) => p.actionLabel)).toEqual(
        ['Consultar', 'Gestionar', 'Eliminar'],
      );
      expect(res.body[0]).toMatchObject({
        module: 'users',
        moduleLabel: 'Usuarios',
      });
      const users = res.body
        .filter((p: { module: string }) => p.module === 'users')
        .map((p: { code: string }) => p.code);
      expect(users).toEqual(['users:read', 'users:create', 'users:update']);
    });

    it('requiere roles:read', async () => {
      await t.http().get('/api/permissions').expect(401);
      const { session } = await adminWith(t, prisma, ['sports:read']);
      await authed(t, session).get('/api/permissions').expect(403);
    });
  });

  describe('lectura de roles', () => {
    it('lista roles con sus permisos y usuarios, y devuelve el detalle', async () => {
      const { user, session } = await adminWith(t, prisma, ['roles:read']);
      const res = await authed(t, session).get('/api/roles').expect(200);
      const superadmin = res.body.find(
        (r: { code: string }) => r.code === 'superadmin',
      );
      expect(superadmin).toMatchObject({ isSystem: true, userCount: 0 });
      expect(superadmin.permissions.sort()).toEqual([...ALL_CODES].sort());
      const own = res.body.find(
        (r: { userCount: number; isSystem: boolean }) =>
          !r.isSystem && r.userCount === 1,
      );
      expect(own.permissions).toEqual(['roles:read']);
      expect(user.id).toBeDefined();

      const detail = await authed(t, session)
        .get(`/api/roles/${superadmin.id}`)
        .expect(200);
      expect(detail.body.code).toBe('superadmin');
      await authed(t, session)
        .get('/api/roles/0197aaaa-0000-7000-8000-000000000000')
        .expect(404);
      await authed(t, session).get('/api/roles/xyz').expect(400);
    });

    it('roles:manage no implica poder consultar, ni consultar poder gestionar', async () => {
      const onlyManage = await adminWith(t, prisma, ['roles:manage']);
      await authed(t, onlyManage.session).get('/api/roles').expect(403);
      const onlyRead = await adminWith(t, prisma, ['roles:read']);
      await authed(t, onlyRead.session)
        .post('/api/roles')
        .send({ code: 'nuevo', name: 'Nuevo' })
        .expect(403);
    });
  });

  // ───────────────────────── creación y edición ─────────────────────────

  describe('creación de roles', () => {
    it('crea un rol configurable (nunca de sistema) con permisos delegables y lo audita', async () => {
      const { user, session } = await adminWith(t, prisma, MANAGER);
      const res = await authed(t, session)
        .post('/api/roles')
        .send({
          code: 'delegado_deportes',
          name: '  Delegado   de deportes ',
          description: 'Gestiona deportes',
          permissions: ['sports:read', 'sports:manage'],
        })
        .expect(201);
      expect(res.body).toMatchObject({
        code: 'delegado_deportes',
        name: 'Delegado de deportes',
        description: 'Gestiona deportes',
        isSystem: false,
        permissions: ['sports:manage', 'sports:read'],
        userCount: 0,
      });
      const [log] = await audits('role.create');
      expect(log).toMatchObject({
        userId: user.id,
        entityId: res.body.id,
        afterSnapshot: {
          code: 'delegado_deportes',
          permissions: ['sports:manage', 'sports:read'],
        },
      });
    });

    it('un rol sin permisos no concede nada (no hay permisos implícitos)', async () => {
      const { session } = await adminWith(t, prisma, MANAGER);
      const created = await authed(t, session)
        .post('/api/roles')
        .send({ code: 'vacio', name: 'Vacío' })
        .expect(201);
      expect(created.body.permissions).toEqual([]);
      expect(
        await prisma.rolePermission.count({
          where: { roleId: created.body.id },
        }),
      ).toBe(0);
    });

    it('valida datos, rechaza duplicados y campos protegidos (isSystem, id)', async () => {
      const { session } = await adminWith(t, prisma, MANAGER);
      const api = authed(t, session);
      for (const body of [
        {},
        { code: 'Mal Código', name: 'X' },
        { code: 'x', name: 'X' },
        { code: 'ok_rol', name: ' ' },
        { code: 'ok_rol', name: 'X', description: 'd'.repeat(501) },
        { code: 'ok_rol', name: 'X', isSystem: true },
        {
          code: 'ok_rol',
          name: 'X',
          id: '0197aaaa-0000-7000-8000-000000000000',
        },
        { code: 'ok_rol', name: 'X', permissions: 'sports:read' },
      ]) {
        await api.post('/api/roles').send(body).expect(400);
      }
      await api
        .post('/api/roles')
        .send({ code: 'duplicado', name: 'Uno' })
        .expect(201);
      const dup = await api
        .post('/api/roles')
        .send({ code: 'duplicado', name: 'Dos' })
        .expect(409);
      expect(dup.body.message).toBe('Ya existe un rol con ese código');
      await api
        .post('/api/roles')
        .send({ code: 'superadmin', name: 'Intento' })
        .expect(409);
      expect(await prisma.role.count({ where: { isSystem: true } })).toBe(1);
    });

    it('rechaza permisos que no existen en el catálogo, con su lista', async () => {
      const { session } = await adminWith(t, prisma, MANAGER);
      const res = await authed(t, session)
        .post('/api/roles')
        .send({
          code: 'raro',
          name: 'Raro',
          permissions: [
            'sports:read',
            'inventado:todo',
            'SPORTS:READ',
            ' sports:read',
          ],
        })
        .expect(400);
      expect(res.body.errors[0].message).toContain('inventado:todo');
      expect(res.body.errors[0].message).toContain('SPORTS:READ');
      expect(await prisma.role.count({ where: { code: 'raro' } })).toBe(0);
    });
  });

  describe('edición de nombre y descripción', () => {
    it('modifica un rol configurable, conserva el código y audita el cambio', async () => {
      const { session } = await adminWith(t, prisma, MANAGER);
      const api = authed(t, session);
      const { body: role } = await api
        .post('/api/roles')
        .send({ code: 'rol_a', name: 'Rol A' })
        .expect(201);
      const res = await api
        .patch(`/api/roles/${role.id}`)
        .send({ name: 'Rol A2', description: 'Descripción' })
        .expect(200);
      expect(res.body).toMatchObject({
        code: 'rol_a',
        name: 'Rol A2',
        description: 'Descripción',
      });
      const [log] = await audits('role.update');
      expect(log).toMatchObject({
        entityId: role.id,
        beforeSnapshot: { name: 'Rol A' },
        afterSnapshot: { name: 'Rol A2' },
      });
      await api
        .patch(`/api/roles/${role.id}`)
        .send({ description: null })
        .expect(200);
      await api
        .patch(`/api/roles/${role.id}`)
        .send({ code: 'otro' })
        .expect(400);
      await api
        .patch(`/api/roles/${role.id}`)
        .send({ isSystem: true })
        .expect(400);
      await api.patch(`/api/roles/${role.id}`).send({}).expect(400);
    });

    it('no permite modificar roles de sistema por la edición genérica', async () => {
      const { session } = await adminWith(t, prisma, MANAGER);
      const superadmin = await roleByCode('superadmin');
      const res = await authed(t, session)
        .patch(`/api/roles/${superadmin.id}`)
        .send({ name: 'Otro nombre' })
        .expect(403);
      expect(res.body.message).toContain('roles de sistema');
      expect((await roleByCode('superadmin')).name).toBe('Superadministrador');
    });
  });

  describe('edición de los permisos de un rol', () => {
    it('añade y retira permisos, audita lo cambiado y los usuarios lo notan en su siguiente petición', async () => {
      const { user, session } = await adminWith(t, prisma, MANAGER);
      const member = await createUser(prisma, {
        email: 'miembro@liga.example',
      });
      const memberSession = await login(t, member.email);
      const { body: role } = await authed(t, session)
        .post('/api/roles')
        .send({
          code: 'deportes',
          name: 'Deportes',
          permissions: ['sports:read'],
        })
        .expect(201);
      await authed(t, session)
        .put(`/api/users/${member.id}/roles/${role.id}`)
        .expect(204);

      await authed(t, memberSession).get('/api/sports').expect(200);
      await authed(t, memberSession)
        .post('/api/sports')
        .send({ code: 'futbol', name: 'Fútbol' })
        .expect(403);

      const res = await authed(t, session)
        .put(`/api/roles/${role.id}/permissions`)
        .send({ permissions: ['sports:read', 'sports:manage'] })
        .expect(200);
      expect(res.body).toMatchObject({
        added: ['sports:manage'],
        removed: [],
        permissions: ['sports:manage', 'sports:read'],
        userCount: 1,
      });
      // Misma sesión, sin volver a iniciar sesión
      await authed(t, memberSession)
        .post('/api/sports')
        .send({ code: 'futbol', name: 'Fútbol' })
        .expect(201);

      await authed(t, session)
        .put(`/api/roles/${role.id}/permissions`)
        .send({ permissions: [] })
        .expect(200);
      await authed(t, memberSession).get('/api/sports').expect(403);

      const logs = await audits('role.permissions_update');
      expect(logs).toHaveLength(2);
      expect(logs[0]).toMatchObject({
        userId: user.id,
        entityId: role.id,
        beforeSnapshot: { permissions: ['sports:read'] },
        afterSnapshot: {
          added: ['sports:manage'],
          removed: [],
          affectedUsers: 1,
        },
      });
      expect(logs[1]!.afterSnapshot).toMatchObject({
        permissions: [],
        removed: ['sports:manage', 'sports:read'],
      });
    });

    it('es idempotente (sin cambios no escribe ni audita) y admite duplicados en la petición', async () => {
      const { session } = await adminWith(t, prisma, MANAGER);
      const api = authed(t, session);
      const { body: role } = await api
        .post('/api/roles')
        .send({ code: 'rol_a', name: 'A', permissions: ['sports:read'] })
        .expect(201);
      const same = await api
        .put(`/api/roles/${role.id}/permissions`)
        .send({ permissions: ['sports:read', 'sports:read'] })
        .expect(200);
      expect(same.body).toMatchObject({ added: [], removed: [] });
      expect(await audits('role.permissions_update')).toHaveLength(0);
    });

    it('valida la petición: lista obligatoria, códigos del catálogo, sin campos extra', async () => {
      const { session } = await adminWith(t, prisma, MANAGER);
      const api = authed(t, session);
      const { body: role } = await api
        .post('/api/roles')
        .send({ code: 'rol_a', name: 'A' })
        .expect(201);
      const put = (body: unknown) =>
        api.put(`/api/roles/${role.id}/permissions`).send(body as object);
      await put({}).expect(400);
      await put({ permissions: 'sports:read' }).expect(400);
      await put({ permissions: ['inventado:todo'] }).expect(400);
      await put({ permissions: [], extra: 1 }).expect(400);
      await api
        .put('/api/roles/0197aaaa-0000-7000-8000-000000000000/permissions')
        .send({ permissions: [] })
        .expect(404);
    });

    it('lectura, gestión y eliminación son permisos distintos y se pueden conceder por separado', async () => {
      const { session } = await adminWith(t, prisma, [
        'roles:read',
        'roles:manage',
        'sports:read',
        'sports:manage',
        'sports:delete',
      ]);
      const api = authed(t, session);
      const { body: role } = await api
        .post('/api/roles')
        .send({ code: 'lector', name: 'Lector' })
        .expect(201);
      const res = await api
        .put(`/api/roles/${role.id}/permissions`)
        .send({ permissions: ['sports:read'] })
        .expect(200);
      expect(res.body.permissions).toEqual(['sports:read']);
      const member = await createUser(prisma, { email: 'lector@liga.example' });
      await api.put(`/api/users/${member.id}/roles/${role.id}`).expect(204);
      const ms = await login(t, member.email);
      await authed(t, ms).get('/api/sports').expect(200);
      await authed(t, ms)
        .post('/api/sports')
        .send({ code: 'futbol', name: 'Fútbol' })
        .expect(403);
      await authed(t, ms)
        .delete('/api/sports/0197aaaa-0000-7000-8000-000000000000')
        .expect(403);
    });
  });

  // ───────────────────────── protección de roles de sistema ─────────────────────────

  describe('roles de sistema', () => {
    it('ni siquiera un superadministrador puede editar sus permisos por la API', async () => {
      const root = await rootAdmin();
      const role = await roleByCode('superadmin');
      const before = await permsOf(role.id);
      for (const permissions of [[], ['sports:read'], ALL_CODES]) {
        const res = await authed(t, root.session)
          .put(`/api/roles/${role.id}/permissions`)
          .send({ permissions })
          .expect(403);
        expect(res.body.message).toContain('roles de sistema');
      }
      await authed(t, root.session)
        .patch(`/api/roles/${role.id}`)
        .send({ name: 'X' })
        .expect(403);
      expect(await permsOf(role.id)).toEqual(before);
    });

    it('un rol de sistema no se elimina ni por SQL directo, y no hay endpoint para borrar roles', async () => {
      const root = await rootAdmin();
      const role = await roleByCode('superadmin');
      await authed(t, root.session).delete(`/api/roles/${role.id}`).expect(404);
      await expect(
        prisma.role.delete({ where: { id: role.id } }),
      ).rejects.toThrow();
      expect(await prisma.role.count({ where: { code: 'superadmin' } })).toBe(
        1,
      );
    });

    it('el seed restablece el rol de sistema sin tocar los roles configurables', async () => {
      const { session } = await adminWith(t, prisma, MANAGER);
      const { body: custom } = await authed(t, session)
        .post('/api/roles')
        .send({ code: 'propio', name: 'Propio', permissions: ['sports:read'] })
        .expect(201);
      const superadmin = await roleByCode('superadmin');
      await prisma.rolePermission.deleteMany({
        where: { roleId: superadmin.id, permission: { code: 'audit:read' } },
      });
      await seedCatalog(prisma);
      expect(await permsOf(superadmin.id)).toContain('audit:read');
      expect(await permsOf(custom.id)).toEqual(['sports:read']);
    });
  });

  // ───────────────────────── escalada de privilegios ─────────────────────────

  describe('escalada de privilegios', () => {
    it('no se puede crear un rol con permisos que el actor no posee', async () => {
      const { session } = await adminWith(t, prisma, MANAGER);
      for (const permissions of [
        ['users:create'],
        ['audit:read'],
        ['sports:delete'],
        ['sports:read', 'seasons:manage'],
      ]) {
        const res = await authed(t, session)
          .post('/api/roles')
          .send({ code: 'escalada', name: 'Escalada', permissions })
          .expect(403);
        expect(res.body.message).toBe(
          'No puede conceder permisos que usted no posee',
        );
      }
      expect(await prisma.role.count({ where: { code: 'escalada' } })).toBe(0);
    });

    it('no se pueden añadir permisos que el actor no posee a un rol existente', async () => {
      const { session } = await adminWith(t, prisma, MANAGER);
      const api = authed(t, session);
      const { body: role } = await api
        .post('/api/roles')
        .send({ code: 'rol_a', name: 'A', permissions: ['sports:read'] })
        .expect(201);
      await api
        .put(`/api/roles/${role.id}/permissions`)
        .send({ permissions: ['sports:read', 'audit:read'] })
        .expect(403);
      expect(await permsOf(role.id)).toEqual(['sports:read']);
    });

    it('no se puede modificar un rol que contiene permisos que el actor no posee (ni para quitárselos a otros)', async () => {
      const { session } = await adminWith(t, prisma, MANAGER);
      const root = await rootAdmin();
      const { body: strong } = await authed(t, root.session)
        .post('/api/roles')
        .send({
          code: 'auditor',
          name: 'Auditor',
          permissions: ['audit:read', 'sports:read'],
        })
        .expect(201);
      const res = await authed(t, session)
        .put(`/api/roles/${strong.id}/permissions`)
        .send({ permissions: ['sports:read'] })
        .expect(403);
      expect(res.body.message).toBe(
        'No puede modificar un rol con permisos que usted no posee',
      );
      expect(await permsOf(strong.id)).toEqual(['audit:read', 'sports:read']);
    });

    it('no se puede asignar un rol con permisos que el actor no posee', async () => {
      const { session } = await adminWith(t, prisma, MANAGER);
      const root = await rootAdmin();
      const { body: strong } = await authed(t, root.session)
        .post('/api/roles')
        .send({ code: 'auditor', name: 'Auditor', permissions: ['audit:read'] })
        .expect(201);
      const target = await createUser(prisma, {
        email: 'objetivo@liga.example',
      });
      await authed(t, session)
        .put(`/api/users/${target.id}/roles/${strong.id}`)
        .expect(403);
      await authed(t, session)
        .put(
          `/api/users/${target.id}/roles/${(await roleByCode('superadmin')).id}`,
        )
        .expect(403);
      expect(
        await prisma.userRole.count({ where: { userId: target.id } }),
      ).toBe(0);
    });

    it('no se puede modificar un rol que el propio actor tiene asignado', async () => {
      const root = await rootAdmin();
      const holder = await createUser(prisma, {
        email: 'titular@liga.example',
      });
      const { body: own } = await authed(t, root.session)
        .post('/api/roles')
        .send({
          code: 'propio',
          name: 'Propio',
          permissions: [
            'roles:read',
            'roles:manage',
            'sports:read',
            'sports:manage',
          ],
        })
        .expect(201);
      await authed(t, root.session)
        .put(`/api/users/${holder.id}/roles/${own.id}`)
        .expect(204);
      const hs = await login(t, holder.email);
      // Aunque solo añadiera permisos que ya posee, no puede reconfigurar su propio rol
      const res = await authed(t, hs)
        .put(`/api/roles/${own.id}/permissions`)
        .send({ permissions: ['roles:read', 'roles:manage', 'sports:read'] })
        .expect(403);
      expect(res.body.message).toBe(
        'No puede modificar un rol que usted mismo tiene asignado',
      );
      expect(await permsOf(own.id)).toEqual([
        'roles:manage',
        'roles:read',
        'sports:manage',
        'sports:read',
      ]);
    });

    it('no puede asignarse roles a sí mismo ni por rutas alternativas', async () => {
      const { user, session } = await adminWith(t, prisma, MANAGER);
      const api = authed(t, session);
      const { body: role } = await api
        .post('/api/roles')
        .send({ code: 'rol_a', name: 'A', permissions: ['sports:read'] })
        .expect(201);
      await api.put(`/api/users/${user.id}/roles/${role.id}`).expect(403);
      await api.delete(`/api/users/${user.id}/roles/${role.id}`).expect(403);
      await api
        .patch(`/api/users/${user.id}`)
        .send({ roles: [role.id] })
        .expect(400);
      await api
        .patch(`/api/users/${user.id}/status`)
        .send({ status: 'activo', reason: 'prueba' })
        .expect(403);
      await api.post(`/api/users/${user.id}/credential-link`).expect(403);
      expect(await prisma.userRole.count({ where: { userId: user.id } })).toBe(
        1,
      ); // solo su rol original
    });

    it('un cómplice con un rol delegado nunca obtiene más de lo que el delegante posee', async () => {
      const manager = await adminWith(t, prisma, MANAGER);
      const accomplice = await createUser(prisma, {
        email: 'complice@liga.example',
      });
      const api = authed(t, manager.session);
      const { body: role } = await api
        .post('/api/roles')
        .send({
          code: 'complice',
          name: 'Cómplice',
          permissions: ['roles:read', 'roles:manage', 'sports:read'],
        })
        .expect(201);
      await api.put(`/api/users/${accomplice.id}/roles/${role.id}`).expect(204);
      const as = await login(t, accomplice.email);

      // El cómplice solo puede delegar lo que tiene (que es un subconjunto del delegante)
      const held = (await authed(t, as).get('/api/auth/session').expect(200))
        .body.permissions as string[];
      for (const code of held) expect(MANAGER).toContain(code);

      const { body: other } = await authed(t, as)
        .post('/api/roles')
        .send({ code: 'otro', name: 'Otro', permissions: ['sports:read'] })
        .expect(201);
      await authed(t, as)
        .put(`/api/roles/${other.id}/permissions`)
        .send({ permissions: ['sports:read', 'sports:manage'] })
        .expect(403);
      await authed(t, as)
        .post('/api/roles')
        .send({ code: 'otro2', name: 'Otro 2', permissions: ['users:update'] })
        .expect(403);
      // No puede asignar el rol «superadmin» ni siquiera a un tercero
      const third = await createUser(prisma, { email: 'tercero@liga.example' });
      await authed(t, as)
        .put(
          `/api/users/${third.id}/roles/${(await roleByCode('superadmin')).id}`,
        )
        .expect(403);
    });

    it('un administrador de usuarios parcial no puede tomar la cuenta de un superadministrador', async () => {
      const root = await rootAdmin();
      await rootAdmin('root2@liga.example');
      const partial = await adminWith(t, prisma, [
        'users:read',
        'users:create',
        'users:update',
      ]);
      const api = authed(t, partial.session);
      // Vías de toma de cuenta: enlace de restablecimiento, cambio de correo, desactivación, sesiones
      await api.post(`/api/users/${root.user.id}/credential-link`).expect(403);
      await api
        .patch(`/api/users/${root.user.id}`)
        .send({ email: 'atacante@liga.example' })
        .expect(403);
      await api
        .patch(`/api/users/${root.user.id}/status`)
        .send({ status: 'inactivo', reason: 'prueba' })
        .expect(403);
      await api
        .post(`/api/users/${root.user.id}/sessions/revoke`)
        .send({ reason: 'prueba' })
        .expect(403);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: root.user.id } }))
          .email,
      ).toBe('root@liga.example');
      expect(
        await prisma.credentialToken.count({ where: { userId: root.user.id } }),
      ).toBe(0);
    });

    it('tampoco puede tomar a un usuario cuyos permisos exceden los suyos aunque no sea superadmin', async () => {
      const partial = await adminWith(t, prisma, [
        'users:read',
        'users:update',
      ]);
      const stronger = await createUser(prisma, {
        email: 'fuerte@liga.example',
        permissions: ['users:update', 'audit:read'],
      });
      const api = authed(t, partial.session);
      await api.post(`/api/users/${stronger.id}/credential-link`).expect(403);
      await api
        .patch(`/api/users/${stronger.id}`)
        .send({ displayName: 'Hackeado' })
        .expect(403);
      // pero sí a uno con menos privilegios o sin ninguno
      const weaker = await createUser(prisma, {
        email: 'debil@liga.example',
        permissions: ['users:read'],
      });
      await api.post(`/api/users/${weaker.id}/credential-link`).expect(200);
      const none = await createUser(prisma, { email: 'ninguno@liga.example' });
      await api
        .patch(`/api/users/${none.id}`)
        .send({ displayName: 'Renombrado' })
        .expect(200);
    });

    it('retirar el rol a un usuario más privilegiado que el actor está prohibido', async () => {
      const root = await rootAdmin();
      const partial = await adminWith(t, prisma, MANAGER);
      const { body: role } = await authed(t, partial.session)
        .post('/api/roles')
        .send({ code: 'rol_a', name: 'A', permissions: ['sports:read'] })
        .expect(201);
      // root tiene además el rol: retirárselo exigiría gestionar a alguien más privilegiado
      await prisma.userRole.create({
        data: { userId: root.user.id, roleId: role.id },
      });
      await authed(t, partial.session)
        .delete(`/api/users/${root.user.id}/roles/${role.id}`)
        .expect(403);
      expect(
        await prisma.userRole.count({
          where: { userId: root.user.id, roleId: role.id },
        }),
      ).toBe(1);
    });
  });

  // ───────────────────────── último superadministrador ─────────────────────────

  describe('último superadministrador', () => {
    it('no se le retira el rol ni se le desactiva', async () => {
      const root = await rootAdmin();
      const all = await adminWith(t, prisma, ALL_CODES);
      const api = authed(t, all.session);
      const role = await roleByCode('superadmin');
      await api
        .delete(`/api/users/${root.user.id}/roles/${role.id}`)
        .expect(409);
      await api
        .patch(`/api/users/${root.user.id}/status`)
        .send({ status: 'bloqueado', reason: 'prueba' })
        .expect(409);
      expect(await prisma.userRole.count({ where: { roleId: role.id } })).toBe(
        1,
      );
    });

    it('dos operaciones concurrentes no pueden dejar el sistema sin superadministrador activo', async () => {
      const a = await rootAdmin('a@liga.example');
      const b = await rootAdmin('b@liga.example');
      const all = await adminWith(t, prisma, ALL_CODES);
      const role = await roleByCode('superadmin');

      for (let trial = 0; trial < 5; trial++) {
        const results = await Promise.all([
          authed(t, all.session).delete(
            `/api/users/${a.user.id}/roles/${role.id}`,
          ),
          authed(t, all.session).delete(
            `/api/users/${b.user.id}/roles/${role.id}`,
          ),
          authed(t, all.session)
            .patch(`/api/users/${a.user.id}/status`)
            .send({ status: 'bloqueado', reason: 'prueba' }),
          authed(t, all.session)
            .patch(`/api/users/${b.user.id}/status`)
            .send({ status: 'bloqueado', reason: 'prueba' }),
        ]);
        expect(
          results.every((r) => [200, 204, 404, 409].includes(r.status)),
        ).toBe(true);
        const remaining = await prisma.user.count({
          where: { status: 'activo', roles: { some: { roleId: role.id } } },
        });
        expect(remaining, `intento ${trial}`).toBeGreaterThanOrEqual(1);

        // Restablecer para el siguiente intento
        await prisma.user.updateMany({
          where: { id: { in: [a.user.id, b.user.id] } },
          data: { status: 'activo' },
        });
        for (const u of [a.user, b.user]) {
          await prisma.userRole.upsert({
            where: { userId_roleId: { userId: u.id, roleId: role.id } },
            create: { userId: u.id, roleId: role.id },
            update: {},
          });
        }
      }
    });

    it('dos superadministradores que se desactivan mutuamente a la vez: queda uno activo', async () => {
      const a = await rootAdmin('a@liga.example');
      const b = await rootAdmin('b@liga.example');
      const res = await Promise.all([
        authed(t, a.session)
          .patch(`/api/users/${b.user.id}/status`)
          .send({ status: 'inactivo', reason: 'prueba' }),
        authed(t, b.session)
          .patch(`/api/users/${a.user.id}/status`)
          .send({ status: 'inactivo', reason: 'prueba' }),
      ]);
      expect(res.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      const active = await prisma.user.count({
        where: {
          status: 'activo',
          roles: { some: { role: { code: 'superadmin' } } },
        },
      });
      expect(active).toBe(1);
    });
  });

  // ───────────────────────── concurrencia en privilegios ─────────────────────────

  describe('cambios concurrentes de privilegios', () => {
    it('un permiso que el actor pierde en paralelo no puede delegarse después de perderlo', async () => {
      const root = await rootAdmin();
      const holder = await createUser(prisma, {
        email: 'delegante@liga.example',
      });
      const { body: holderRole } = await authed(t, root.session)
        .post('/api/roles')
        .send({
          code: 'delegante',
          name: 'Delegante',
          permissions: [
            'roles:read',
            'roles:manage',
            'sports:read',
            'sports:manage',
          ],
        })
        .expect(201);
      await authed(t, root.session)
        .put(`/api/users/${holder.id}/roles/${holderRole.id}`)
        .expect(204);
      const hs = await login(t, holder.email);
      const { body: target } = await authed(t, root.session)
        .post('/api/roles')
        .send({ code: 'destino', name: 'Destino' })
        .expect(201);

      for (let trial = 0; trial < 12; trial++) {
        await prisma.rolePermission.deleteMany({
          where: { roleId: target.id },
        });
        const have = new Set(await permsOf(holderRole.id));
        if (!have.has('sports:manage')) {
          const perm = await prisma.permission.findUniqueOrThrow({
            where: { code: 'sports:manage' },
          });
          await prisma.rolePermission.create({
            data: { roleId: holderRole.id, permissionId: perm.id },
          });
        }
        await prisma.auditLog.count(); // (solo para ordenar el registro de esta ronda)
        const marker =
          (await prisma.auditLog.findFirst({ orderBy: { id: 'desc' } }))?.id ??
          '';

        const [grant, revoke] = await Promise.all([
          authed(t, hs)
            .put(`/api/roles/${target.id}/permissions`)
            .send({ permissions: ['sports:manage'] }),
          authed(t, root.session)
            .put(`/api/roles/${holderRole.id}/permissions`)
            .send({
              permissions: ['roles:read', 'roles:manage', 'sports:read'],
            }),
        ]);
        expect(revoke.status).toBe(200);
        expect([200, 403]).toContain(grant.status);

        if (grant.status === 200) {
          // El delegante aún tenía el permiso cuando se concedió: la concesión es anterior a la retirada
          const logs = await prisma.auditLog.findMany({
            where: { id: { gt: marker }, action: 'role.permissions_update' },
            orderBy: { id: 'asc' },
          });
          const order = logs.map((l) => l.entityId);
          expect(order, `intento ${trial}`).toEqual([target.id, holderRole.id]);
        } else {
          expect(await permsOf(target.id), `intento ${trial}`).toEqual([]);
        }
      }
    });

    it('dos ediciones simultáneas del mismo rol terminan en uno de los dos estados, sin errores', async () => {
      const { session } = await adminWith(t, prisma, MANAGER);
      const second = await adminWith(t, prisma, MANAGER);
      const { body: role } = await authed(t, session)
        .post('/api/roles')
        .send({ code: 'rol_a', name: 'A' })
        .expect(201);
      for (let trial = 0; trial < 6; trial++) {
        const res = await Promise.all([
          authed(t, session)
            .put(`/api/roles/${role.id}/permissions`)
            .send({ permissions: ['sports:read'] }),
          authed(t, second.session)
            .put(`/api/roles/${role.id}/permissions`)
            .send({ permissions: ['sports:manage', 'roles:read'] }),
        ]);
        expect(res.map((r) => r.status)).toEqual([200, 200]);
        expect([
          ['sports:read'],
          ['roles:read', 'sports:manage'],
        ]).toContainEqual(await permsOf(role.id));
      }
    });
  });

  // ───────────────────────── autorización y secretos ─────────────────────────

  describe('autorización de las rutas', () => {
    it('todas las rutas de roles y permisos rechazan sin sesión (401) y sin permiso (403)', async () => {
      const id = '0197aaaa-0000-7000-8000-000000000000';
      const routes: [string, string, object?][] = [
        ['get', '/api/roles'],
        ['get', `/api/roles/${id}`],
        ['post', '/api/roles', { code: 'x_x', name: 'X' }],
        ['patch', `/api/roles/${id}`, { name: 'X' }],
        ['put', `/api/roles/${id}/permissions`, { permissions: [] }],
        ['get', '/api/permissions'],
      ];
      const { session } = await adminWith(t, prisma, ['sports:read']);
      for (const [method, path, body] of routes) {
        const anon = await (
          t.http() as never as Record<
            string,
            (p: string) => {
              set: (
                k: string,
                v: string,
              ) => { send: (b?: object) => Promise<{ status: number }> };
            }
          >
        )[method]!(path)
          .set('Origin', 'https://liga.example')
          .send(body);
        expect(anon.status, `${method} ${path}`).toBe(401);
        const denied = await (
          authed(t, session) as never as Record<
            string,
            (p: string) => { send: (b?: object) => Promise<{ status: number }> }
          >
        )[method]!(path).send(body);
        expect(denied.status, `${method} ${path}`).toBe(403);
      }
    });

    it('las respuestas de roles no contienen secretos', async () => {
      const root = await rootAdmin();
      const res = await authed(t, root.session).get('/api/roles').expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(
        /hash|token|argon2|password/i,
      );
    });
  });
});
