import { Controller, Get } from '@nestjs/common';
import {
  Authenticated,
  Public,
  RequirePermissions,
} from '../../src/auth/decorators.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { TEST_ORIGIN, createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import {
  authed,
  createUser,
  grantPermissions,
  login,
  seedCatalog,
} from '../support/fixtures.js';

/** Rutas de prueba que cubren cada política, incluida una SIN política declarada. */
@Controller('probe')
class ProbeController {
  @Get('sin-politica')
  sinPolitica() {
    return { ok: true };
  }
  @Public()
  @Get('publica')
  publica() {
    return { ok: true };
  }
  @Authenticated()
  @Get('autenticada')
  autenticada() {
    return { ok: true };
  }
  @RequirePermissions('seasons:manage', 'seasons:read')
  @Get('dos-permisos')
  dosPermisos() {
    return { ok: true };
  }
}

describe('autorización', () => {
  let prisma: PrismaClient;
  let t: TestApp;

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp({ extraControllers: [ProbeController] });
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  describe('denegación por defecto', () => {
    it('rechaza una ruta que no declara política de acceso, incluso con sesión válida', async () => {
      const user = await createUser(prisma, { roleCodes: ['superadmin'] });
      const s = await login(t, user.email);
      await authed(t, s).get('/api/probe/sin-politica').expect(403);
      await t.http().get('/api/probe/sin-politica').expect(403);
      expect(t.logger.text).toContain(
        'Ruta sin política de acceso: ProbeController.sinPolitica',
      );
    });

    it('las rutas públicas son accesibles sin sesión', async () => {
      await t.http().get('/api/probe/publica').expect(200);
      await t.http().get('/api/health').expect(200);
    });

    it('las rutas autenticadas exigen sesión pero no un permiso concreto', async () => {
      await t.http().get('/api/probe/autenticada').expect(401);
      const user = await createUser(prisma);
      const s = await login(t, user.email);
      await authed(t, s).get('/api/probe/autenticada').expect(200);
    });

    it('un usuario recién creado no tiene permisos ni roles', async () => {
      const user = await createUser(prisma);
      expect(await prisma.userRole.count({ where: { userId: user.id } })).toBe(
        0,
      );
      const s = await login(t, user.email);
      expect(s.body.permissions).toEqual([]);
      await authed(t, s).get('/api/roles').expect(403);
    });
  });

  describe('protección de endpoints administrativos', () => {
    it('rechaza sin sesión (401)', async () => {
      await t.http().get('/api/roles').expect(401);
      await t
        .http()
        .patch('/api/users/0197aaaa-0000-7000-8000-000000000000/status')
        .send({})
        .expect(401);
      await t
        .http()
        .put(
          '/api/users/0197aaaa-0000-7000-8000-000000000000/roles/0197aaaa-0000-7000-8000-000000000001',
        )
        .expect(401);
    });

    it('rechaza con sesión pero sin el permiso suficiente (403)', async () => {
      const user = await createUser(prisma, { permissions: ['sports:read'] });
      const s = await login(t, user.email);
      await authed(t, s).get('/api/roles').expect(403);
      await authed(t, s)
        .patch(`/api/users/${user.id}/status`)
        .send({ status: 'inactivo', reason: 'x'.repeat(5) })
        .expect(403);
    });

    it('permite el acceso cuando existe el permiso requerido', async () => {
      const user = await createUser(prisma, { permissions: ['roles:read'] });
      const s = await login(t, user.email);
      const res = await authed(t, s).get('/api/roles').expect(200);
      const codes = res.body.map((r: { code: string }) => r.code);
      expect(codes).toContain('superadmin');
      const superadmin = res.body.find(
        (r: { code: string }) => r.code === 'superadmin',
      );
      expect(superadmin.permissions.length).toBeGreaterThan(0);
    });

    it('exige TODOS los permisos declarados, no solo uno', async () => {
      const partial = await createUser(prisma, {
        permissions: ['seasons:read'],
      });
      const full = await createUser(prisma, {
        permissions: ['seasons:read', 'seasons:manage'],
      });
      await authed(t, await login(t, partial.email))
        .get('/api/probe/dos-permisos')
        .expect(403);
      await authed(t, await login(t, full.email))
        .get('/api/probe/dos-permisos')
        .expect(200);
    });

    it('suma los permisos de varios roles', async () => {
      const user = await createUser(prisma, { permissions: ['seasons:read'] });
      await grantPermissions(prisma, user.id, ['seasons:manage']);
      const s = await login(t, user.email);
      expect(s.body.permissions).toEqual(['seasons:manage', 'seasons:read']);
      await authed(t, s).get('/api/probe/dos-permisos').expect(200);
    });
  });

  describe('los permisos provienen de la base de datos', () => {
    it('ignora roles o permisos que envíe el cliente', async () => {
      const user = await createUser(prisma);
      const s = await login(t, user.email);
      await authed(t, s)
        .get('/api/roles')
        .set('X-Roles', 'superadmin')
        .set('X-Permissions', 'roles:read')
        .expect(403);
      await t
        .http()
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .send({
          email: user.email,
          password: 'una-contraseña-larga-de-prueba-1',
          roles: ['superadmin'],
          permissions: ['roles:read'],
        })
        .expect(200);
      const again = await login(t, user.email);
      expect(again.body.permissions).toEqual([]);
    });

    it('un permiso otorgado se aplica en la siguiente petición, con la misma sesión', async () => {
      const user = await createUser(prisma);
      const s = await login(t, user.email);
      await authed(t, s).get('/api/roles').expect(403);

      await grantPermissions(prisma, user.id, ['roles:read']);
      await authed(t, s).get('/api/roles').expect(200);
      const current = await authed(t, s).get('/api/auth/session').expect(200);
      expect(current.body.permissions).toEqual(['roles:read']);
    });

    it('un permiso retirado deja de valer de inmediato, sin cerrar la sesión', async () => {
      const user = await createUser(prisma, { permissions: ['roles:read'] });
      const s = await login(t, user.email);
      await authed(t, s).get('/api/roles').expect(200);

      await prisma.rolePermission.deleteMany({
        where: { permission: { code: 'roles:read' } },
      });
      await authed(t, s).get('/api/roles').expect(403);
    });

    it('quitar el rol a un usuario revoca su acceso en la siguiente petición', async () => {
      const user = await createUser(prisma, { permissions: ['roles:read'] });
      const s = await login(t, user.email);
      await authed(t, s).get('/api/roles').expect(200);
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await authed(t, s).get('/api/roles').expect(403);
    });
  });
});
