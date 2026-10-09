import { PERMISSIONS, SUPERADMIN_ROLE } from '../authz/permissions.js';
import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * Sincroniza el catálogo de permisos del código con la base de datos y
 * garantiza el rol de sistema `superadmin` con todos los permisos.
 * Es idempotente. No crea usuarios, categorías ni datos institucionales.
 */
export async function seedAuthorization(prisma: PrismaClient): Promise<void> {
  const codes = Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[];

  await prisma.$transaction(async (tx) => {
    for (const code of codes) {
      await tx.permission.upsert({
        where: { code },
        create: { code, description: PERMISSIONS[code] },
        update: { description: PERMISSIONS[code] },
      });
    }

    // Un permiso que el código ya no comprueba carece de sentido: se retira
    // (sus asignaciones a roles se eliminan en cascada).
    await tx.permission.deleteMany({ where: { code: { notIn: codes } } });

    const role = await tx.role.upsert({
      where: { code: SUPERADMIN_ROLE.code },
      create: { ...SUPERADMIN_ROLE, isSystem: true },
      update: {
        name: SUPERADMIN_ROLE.name,
        description: SUPERADMIN_ROLE.description,
        isSystem: true,
      },
    });

    const permissions = await tx.permission.findMany({
      select: { id: true },
    });
    await tx.rolePermission.createMany({
      data: permissions.map(({ id }) => ({
        roleId: role.id,
        permissionId: id,
      })),
      skipDuplicates: true,
    });
  });
}
