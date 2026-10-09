import { PERMISSIONS, SUPERADMIN_ROLE } from '../../src/authz/permissions.js';
import { seedAuthorization } from '../../src/database/seed.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';

describe('seed de autorización', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('crea el catálogo de permisos y el rol superadmin con todos ellos', async () => {
    await seedAuthorization(prisma);

    const codes = (await prisma.permission.findMany())
      .map((p) => p.code)
      .sort();
    expect(codes).toEqual(Object.keys(PERMISSIONS).sort());

    const role = await prisma.role.findUniqueOrThrow({
      where: { code: SUPERADMIN_ROLE.code },
      include: { permissions: true },
    });
    expect(role.isSystem).toBe(true);
    expect(role.permissions).toHaveLength(codes.length);
  });

  it('es idempotente', async () => {
    await seedAuthorization(prisma);
    await seedAuthorization(prisma);
    expect(await prisma.permission.count()).toBe(
      Object.keys(PERMISSIONS).length,
    );
    expect(await prisma.role.count()).toBe(1);
    expect(await prisma.rolePermission.count()).toBe(
      Object.keys(PERMISSIONS).length,
    );
  });

  it('no crea usuarios, deportes, categorías ni temporadas', async () => {
    await seedAuthorization(prisma);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.sport.count()).toBe(0);
    expect(await prisma.category.count()).toBe(0);
    expect(await prisma.season.count()).toBe(0);
  });

  it('retira permisos obsoletos y repone los que falten al superadmin', async () => {
    await seedAuthorization(prisma);
    await prisma.permission.create({
      data: { code: 'obsoleto:ver', description: 'ya no existe' },
    });
    await prisma.rolePermission.deleteMany({
      where: { permission: { code: 'users:read' } },
    });

    await seedAuthorization(prisma);

    expect(
      await prisma.permission.findUnique({ where: { code: 'obsoleto:ver' } }),
    ).toBeNull();
    const granted = await prisma.rolePermission.count({
      where: {
        role: { code: SUPERADMIN_ROLE.code },
        permission: { code: 'users:read' },
      },
    });
    expect(granted).toBe(1);
  });

  it('conserva los roles personalizados al re-sincronizar', async () => {
    await seedAuthorization(prisma);
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'seasons:read' },
    });
    const custom = await prisma.role.create({
      data: {
        code: 'consulta',
        name: 'Consulta',
        permissions: { create: { permissionId: permission.id } },
      },
    });

    await seedAuthorization(prisma);

    expect(
      await prisma.rolePermission.count({ where: { roleId: custom.id } }),
    ).toBe(1);
  });
});
