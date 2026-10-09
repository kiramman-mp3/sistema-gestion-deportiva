import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import { authed, createUser, login, seedCatalog } from '../support/fixtures.js';

describe('administración de cuentas, sesiones y roles', () => {
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

  const superadmin = (email = 'root@example.com') =>
    createUser(prisma, { email, roleCodes: ['superadmin'] });
  const roleId = async (code: string) =>
    (await prisma.role.findUniqueOrThrow({ where: { code } })).id;

  describe('cambio de estado de una cuenta', () => {
    it('desactiva la cuenta, revoca sus sesiones al instante y lo audita con motivo', async () => {
      const admin = await superadmin();
      const victim = await createUser(prisma, { permissions: ['roles:read'] });
      const adminSession = await login(t, admin.email);
      const victimSession = await login(t, victim.email);
      await login(t, victim.email);
      await authed(t, victimSession).get('/api/roles').expect(200);

      const res = await authed(t, adminSession)
        .patch(`/api/users/${victim.id}/status`)
        .send({ status: 'inactivo', reason: 'Baja del dirigente' })
        .expect(200);
      expect(res.body).toEqual({
        id: victim.id,
        status: 'inactivo',
        revokedSessions: 2,
      });

      await authed(t, victimSession).get('/api/roles').expect(401);
      await t
        .http()
        .post('/api/auth/login')
        .set('Origin', 'https://liga.example')
        .send({
          email: victim.email,
          password: 'una-contraseña-larga-de-prueba-1',
        })
        .expect(401);

      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'user.status_change' },
      });
      expect(log).toMatchObject({
        userId: admin.id,
        entityId: victim.id,
        reason: 'Baja del dirigente',
        beforeSnapshot: { status: 'activo' },
        afterSnapshot: { status: 'inactivo', revokedSessions: 2 },
      });
    });

    it('reactivar la cuenta permite iniciar sesión de nuevo y se audita', async () => {
      const admin = await superadmin();
      const user = await createUser(prisma, { status: 'inactivo' });
      const s = await login(t, admin.email);
      await authed(t, s)
        .patch(`/api/users/${user.id}/status`)
        .send({ status: 'activo', reason: 'Reincorporación' })
        .expect(200);
      await login(t, user.email);
      expect(
        await prisma.auditLog.count({
          where: { action: 'user.status_change' },
        }),
      ).toBe(1);
    });

    it('exige un motivo y un estado válido', async () => {
      const admin = await superadmin();
      const user = await createUser(prisma);
      const s = await login(t, admin.email);
      await authed(t, s)
        .patch(`/api/users/${user.id}/status`)
        .send({ status: 'inactivo' })
        .expect(400);
      await authed(t, s)
        .patch(`/api/users/${user.id}/status`)
        .send({ status: 'eliminado', reason: 'motivo' })
        .expect(400);
      await authed(t, s)
        .patch('/api/users/no-uuid/status')
        .send({ status: 'inactivo', reason: 'motivo' })
        .expect(400);
      await authed(t, s)
        .patch('/api/users/0197aaaa-0000-7000-8000-000000000000/status')
        .send({ status: 'inactivo', reason: 'motivo' })
        .expect(404);
    });

    it('no permite cambiar el estado de la propia cuenta', async () => {
      const admin = await superadmin();
      const s = await login(t, admin.email);
      await authed(t, s)
        .patch(`/api/users/${admin.id}/status`)
        .send({ status: 'inactivo', reason: 'motivo' })
        .expect(403);
    });

    it('no permite desactivar al último superadministrador activo', async () => {
      const root = await superadmin('root@example.com');
      // Un actor con TODOS los permisos (pero sin el rol superadmin) sí puede gestionar a root
      const all = (await prisma.permission.findMany()).map((p) => p.code);
      const other = await createUser(prisma, {
        email: 'gestor@example.com',
        permissions: all,
      });
      const s = await login(t, other.email);
      await authed(t, s)
        .patch(`/api/users/${root.id}/status`)
        .send({ status: 'bloqueado', reason: 'motivo' })
        .expect(409);

      // Con un segundo superadministrador activo sí es posible
      await superadmin('root2@example.com');
      await authed(t, s)
        .patch(`/api/users/${root.id}/status`)
        .send({ status: 'bloqueado', reason: 'motivo' })
        .expect(200);
    });

    it('un administrador parcial no puede gestionar una cuenta con más privilegios que la suya', async () => {
      const root = await superadmin('root@example.com');
      await superadmin('root2@example.com');
      const partial = await createUser(prisma, {
        email: 'parcial@example.com',
        permissions: ['users:update'],
      });
      const s = await login(t, partial.email);
      const res = await authed(t, s)
        .patch(`/api/users/${root.id}/status`)
        .send({ status: 'bloqueado', reason: 'motivo' })
        .expect(403);
      expect(res.body.message).toBe(
        'No puede gestionar una cuenta con más privilegios que la suya',
      );
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: root.id } }))
          .status,
      ).toBe('activo');
    });

    it('es idempotente y no audita un cambio que no cambia nada', async () => {
      const admin = await superadmin();
      const user = await createUser(prisma);
      const s = await login(t, admin.email);
      await authed(t, s)
        .patch(`/api/users/${user.id}/status`)
        .send({ status: 'activo', reason: 'sin cambios' })
        .expect(200);
      expect(
        await prisma.auditLog.count({
          where: { action: 'user.status_change' },
        }),
      ).toBe(0);
    });
  });

  describe('revocación de sesiones por un administrador', () => {
    it('cierra todas las sesiones del usuario y lo audita', async () => {
      const admin = await superadmin();
      const user = await createUser(prisma);
      const a = await login(t, user.email);
      const b = await login(t, user.email);
      const s = await login(t, admin.email);

      const res = await authed(t, s)
        .post(`/api/users/${user.id}/sessions/revoke`)
        .send({ reason: 'Equipo extraviado' })
        .expect(200);
      expect(res.body).toEqual({ revokedSessions: 2 });
      await authed(t, a).get('/api/auth/session').expect(401);
      await authed(t, b).get('/api/auth/session').expect(401);
      await authed(t, s).get('/api/auth/session').expect(200);

      const row = await prisma.session.findFirstOrThrow({
        where: { userId: user.id },
      });
      expect(row.revocationReason).toBe('revocada_por_administrador');
      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'auth.sessions_revoked_by_admin' },
      });
      expect(log).toMatchObject({
        userId: admin.id,
        entityId: user.id,
        reason: 'Equipo extraviado',
      });
    });

    it('requiere el permiso users:update', async () => {
      const user = await createUser(prisma, { permissions: ['roles:read'] });
      const s = await login(t, user.email);
      await authed(t, s)
        .post(`/api/users/${user.id}/sessions/revoke`)
        .send({ reason: 'motivo' })
        .expect(403);
    });
  });

  describe('asignación de roles', () => {
    it('asigna y retira un rol, lo audita y se aplica de inmediato', async () => {
      const admin = await superadmin();
      const user = await createUser(prisma);
      const editor = await prisma.role.create({
        data: {
          code: 'consulta',
          name: 'Consulta',
          permissions: {
            create: [{ permission: { connect: { code: 'roles:read' } } }],
          },
        },
      });
      const adminSession = await login(t, admin.email);
      const userSession = await login(t, user.email);
      await authed(t, userSession).get('/api/roles').expect(403);

      await authed(t, adminSession)
        .put(`/api/users/${user.id}/roles/${editor.id}`)
        .expect(204);
      await authed(t, userSession).get('/api/roles').expect(200);
      await authed(t, adminSession)
        .put(`/api/users/${user.id}/roles/${editor.id}`)
        .expect(409);

      await authed(t, adminSession)
        .delete(`/api/users/${user.id}/roles/${editor.id}`)
        .expect(204);
      await authed(t, userSession).get('/api/roles').expect(403);
      await authed(t, adminSession)
        .delete(`/api/users/${user.id}/roles/${editor.id}`)
        .expect(404);

      const logs = await prisma.auditLog.findMany({
        where: { action: { startsWith: 'user.role_' } },
        orderBy: { id: 'asc' },
      });
      expect(logs.map((l) => l.action)).toEqual([
        'user.role_assigned',
        'user.role_removed',
      ]);
      expect(logs[0]).toMatchObject({
        userId: admin.id,
        entityId: user.id,
        afterSnapshot: { role: 'consulta' },
      });
      const grant = await prisma.userRole.findMany({
        where: { userId: user.id },
      });
      expect(grant).toHaveLength(0);
    });

    it('registra quién otorgó el rol', async () => {
      const admin = await superadmin();
      const user = await createUser(prisma);
      const role = await prisma.role.create({
        data: { code: 'vacio', name: 'Vacío' },
      });
      const s = await login(t, admin.email);
      await authed(t, s)
        .put(`/api/users/${user.id}/roles/${role.id}`)
        .expect(204);
      const grant = await prisma.userRole.findFirstOrThrow({
        where: { userId: user.id },
      });
      expect(grant.grantedById).toBe(admin.id);
    });

    it('no permite autoescalada: no se puede asignar un rol con permisos que el actor no posee', async () => {
      const root = await superadmin();
      const manager = await createUser(prisma, {
        permissions: ['roles:manage'],
      });
      const target = await createUser(prisma);
      const s = await login(t, manager.email);

      await authed(t, s)
        .put(`/api/users/${target.id}/roles/${await roleId('superadmin')}`)
        .expect(403);
      expect(
        await prisma.userRole.count({ where: { userId: target.id } }),
      ).toBe(0);
      // Tampoco puede quitar el rol a un superadministrador
      await authed(t, s)
        .delete(`/api/users/${root.id}/roles/${await roleId('superadmin')}`)
        .expect(403);
      expect(await prisma.userRole.count({ where: { userId: root.id } })).toBe(
        1,
      );
    });

    it('no permite modificar los propios roles', async () => {
      const admin = await superadmin();
      const role = await prisma.role.create({
        data: { code: 'vacio', name: 'Vacío' },
      });
      const s = await login(t, admin.email);
      await authed(t, s)
        .put(`/api/users/${admin.id}/roles/${role.id}`)
        .expect(403);
      await authed(t, s)
        .delete(`/api/users/${admin.id}/roles/${await roleId('superadmin')}`)
        .expect(403);
    });

    it('no permite retirar el rol al último superadministrador activo', async () => {
      const root = await superadmin('root@example.com');
      const other = await superadmin('root2@example.com');
      const s = await login(t, other.email);
      // root2 retira a root: quedaría root2 (activo) -> permitido
      await authed(t, s)
        .delete(`/api/users/${root.id}/roles/${await roleId('superadmin')}`)
        .expect(204);
      // root es ahora un usuario normal; un tercero no puede dejar a root2 sin rol: no hay otro activo
      const third = await createUser(prisma, {
        permissions: (await prisma.permission.findMany()).map((p) => p.code),
      });
      const s3 = await login(t, third.email);
      await authed(t, s3)
        .delete(`/api/users/${other.id}/roles/${await roleId('superadmin')}`)
        .expect(409);
    });

    it('responde 404 ante usuario o rol inexistentes y 400 ante identificadores inválidos', async () => {
      const admin = await superadmin();
      const s = await login(t, admin.email);
      const role = await prisma.role.create({
        data: { code: 'vacio', name: 'Vacío' },
      });
      await authed(t, s)
        .put(`/api/users/0197aaaa-0000-7000-8000-000000000000/roles/${role.id}`)
        .expect(404);
      await authed(t, s)
        .put(
          `/api/users/${(await createUser(prisma)).id}/roles/0197aaaa-0000-7000-8000-000000000000`,
        )
        .expect(404);
      await authed(t, s).put(`/api/users/abc/roles/${role.id}`).expect(400);
    });

    it('si la auditoría falla, el cambio de rol se revierte', async () => {
      const { AuditService } = await import('../../src/audit/audit.service.js');
      const failing = await createTestApp({
        customize: (b) =>
          b.overrideProvider(AuditService).useValue({
            record: () => Promise.reject(new Error('auditoría caída')),
          }),
      });
      try {
        // No se puede iniciar sesión con la auditoría caída: se fabrica la sesión directamente
        const admin = await superadmin();
        const user = await createUser(prisma);
        const role = await prisma.role.create({
          data: { code: 'vacio', name: 'Vacío' },
        });
        const { SessionService } =
          await import('../../src/auth/session.service.js');
        const created = await prisma.$transaction((tx) =>
          failing.app.get(SessionService).create(tx, { userId: admin.id }),
        );
        const session = {
          cookieName: 'liga_sid',
          token: created.token,
          cookie: `liga_sid=${created.token}`,
          csrf: created.csrfToken,
          body: {} as never,
        };
        const res = await authed(failing, session).put(
          `/api/users/${user.id}/roles/${role.id}`,
        );
        expect(res.status).toBe(500);
        expect(
          await prisma.userRole.count({ where: { userId: user.id } }),
        ).toBe(0);
      } finally {
        await failing.close();
      }
    });
  });
});
