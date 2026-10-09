import { AuditService } from '../../src/audit/audit.service.js';
import {
  BootstrapError,
  BootstrapService,
} from '../../src/auth/bootstrap.service.js';
import { PasswordService } from '../../src/auth/password.service.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { TEST_ORIGIN, createTestApp, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import {
  PASSWORD,
  createUser,
  login,
  seedCatalog,
} from '../support/fixtures.js';

const VALID = {
  email: 'Presidente@liga.example',
  displayName: 'Presidente de la Liga',
  password: 'frase-muy-larga-y-unica-2026',
};

describe('bootstrap del primer superadministrador', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let bootstrap: BootstrapService;

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp();
    bootstrap = t.app.get(BootstrapService);
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  it('crea el primer superadministrador con la contraseña solo como hash Argon2id', async () => {
    const created = await bootstrap.createFirstSuperadmin(VALID);
    expect(created.email).toBe('presidente@liga.example');

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
      include: { roles: { include: { role: true } } },
    });
    expect(user.status).toBe('activo');
    expect(user.roles.map((r) => r.role.code)).toEqual(['superadmin']);
    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(user.passwordHash).not.toContain(VALID.password);
    expect(
      await new PasswordService().verify(user.passwordHash, VALID.password),
    ).toBe(true);
  });

  it('el administrador creado puede iniciar sesión y tiene todos los permisos', async () => {
    await bootstrap.createFirstSuperadmin(VALID);
    const s = await login(t, 'presidente@liga.example', VALID.password);
    const catalog = (await prisma.permission.findMany())
      .map((p) => p.code)
      .sort();
    expect(s.body.permissions).toEqual(catalog);
  });

  it('registra la operación en auditoría sin contraseñas ni hashes', async () => {
    const created = await bootstrap.createFirstSuperadmin(VALID);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'auth.bootstrap_superadmin' },
    });
    expect(log).toMatchObject({ entityType: 'user', entityId: created.id });
    expect(log.afterSnapshot).toEqual({
      email: 'presidente@liga.example',
      role: 'superadmin',
    });
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
    });
    const dump = JSON.stringify(log);
    expect(dump).not.toContain(VALID.password);
    expect(dump).not.toContain(stored.passwordHash);
  });

  it('no puede ejecutarse una segunda vez: no hay un segundo "administrador inicial"', async () => {
    await bootstrap.createFirstSuperadmin(VALID);
    await expect(
      bootstrap.createFirstSuperadmin({ ...VALID, email: 'otro@liga.example' }),
    ).rejects.toThrow(/Ya existe un superadministrador/);
    expect(await prisma.userRole.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
  });

  it('tampoco sirve si el superadministrador existente está desactivado', async () => {
    const existing = await createUser(prisma, {
      roleCodes: ['superadmin'],
      status: 'inactivo',
    });
    await expect(bootstrap.createFirstSuperadmin(VALID)).rejects.toThrow(
      /Ya existe un superadministrador/,
    );
    expect(existing).toBeDefined();
    expect(await prisma.user.count()).toBe(1);
  });

  it('ejecuciones concurrentes crean como máximo una cuenta', async () => {
    const results = await Promise.allSettled([
      bootstrap.createFirstSuperadmin({ ...VALID, email: 'a@liga.example' }),
      bootstrap.createFirstSuperadmin({ ...VALID, email: 'b@liga.example' }),
      bootstrap.createFirstSuperadmin({ ...VALID, email: 'c@liga.example' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.userRole.count()).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { action: 'auth.bootstrap_superadmin' },
      }),
    ).toBe(1);
  });

  it('valida los datos de entrada', async () => {
    for (const bad of [
      { ...VALID, email: 'no-es-correo' },
      { ...VALID, displayName: '   ' },
      { ...VALID, password: 'corta' },
      { ...VALID, password: 'x'.repeat(129) },
      { ...VALID, password: 'presidente-presidente-1' }, // contiene el usuario del correo
      {},
    ]) {
      await expect(bootstrap.createFirstSuperadmin(bad)).rejects.toBeInstanceOf(
        BootstrapError,
      );
    }
    expect(await prisma.user.count()).toBe(0);
  });

  it('no filtra la contraseña en los mensajes de error', async () => {
    const error = await bootstrap
      .createFirstSuperadmin({ ...VALID, email: 'no-es-correo' })
      .catch((e: Error) => e);
    expect((error as Error).message).not.toContain(VALID.password);
  });

  it('exige que exista el rol superadmin (db:seed) y no deja datos a medias', async () => {
    await resetDatabase(prisma);
    await expect(bootstrap.createFirstSuperadmin(VALID)).rejects.toThrow(
      /db:seed/,
    );
    expect(await prisma.user.count()).toBe(0);
  });

  it('rechaza un correo ya registrado', async () => {
    await createUser(prisma, { email: 'presidente@liga.example' });
    await expect(bootstrap.createFirstSuperadmin(VALID)).rejects.toThrow(
      /Ya existe un usuario/,
    );
  });

  it('si falla la auditoría, no queda ninguna cuenta creada', async () => {
    const failing = await createTestApp({
      customize: (b) =>
        b.overrideProvider(AuditService).useValue({
          record: () => Promise.reject(new Error('auditoría caída')),
        }),
    });
    try {
      await expect(
        failing.app.get(BootstrapService).createFirstSuperadmin(VALID),
      ).rejects.toThrow();
      expect(await prisma.user.count()).toBe(0);
      expect(await prisma.userRole.count()).toBe(0);
    } finally {
      await failing.close();
    }
  });

  describe('no existe ninguna vía HTTP para hacerse administrador', () => {
    it('no hay rutas de bootstrap ni de registro', async () => {
      for (const path of [
        '/api/auth/bootstrap',
        '/api/bootstrap',
        '/api/auth/register',
        '/api/users',
        '/api/setup',
      ]) {
        for (const method of ['get', 'post', 'put'] as const) {
          const res = await t
            .http()
            [method](path)
            .set('Origin', TEST_ORIGIN)
            .send({ ...VALID });
          expect([401, 404]).toContain(res.status);
        }
      }
      expect(await prisma.user.count()).toBe(0);
    });

    it('el login no acepta campos que concedan privilegios', async () => {
      await createUser(prisma, { email: 'ana@example.com' });
      const res = await t
        .http()
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .send({
          email: 'ana@example.com',
          password: PASSWORD,
          role: 'superadmin',
          isAdmin: true,
        })
        .expect(200);
      expect(res.body.permissions).toEqual([]);
      expect(await prisma.userRole.count()).toBe(0);
    });
  });
});
