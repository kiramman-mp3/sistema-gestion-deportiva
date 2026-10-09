import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { SUPERADMIN_ROLE } from './permissions.js';
import { PermissionsService } from './permissions.service.js';

/**
 * Reglas de delegación y de protección del sistema, compartidas por todas las
 * operaciones que cambian privilegios (cuentas, roles, permisos, contraseñas).
 *
 * Modelo: el conjunto delegable de un actor son SUS permisos efectivos, leídos
 * dentro de la misma transacción que la operación y después de tomar el bloqueo
 * de privilegios. Así, dos cambios concurrentes se serializan y cada uno evalúa
 * el estado resultante del anterior.
 */
@Injectable()
export class PrivilegesService {
  constructor(
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
  ) {}

  /**
   * Serializa todas las operaciones que cambian privilegios o el conjunto de
   * superadministradores. Debe llamarse ANTES de leer cualquier dato que condicione
   * la decisión (se libera al terminar la transacción).
   */
  async lock(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('liga:privilege-changes'))`;
  }

  actorPermissions(
    tx: Prisma.TransactionClient,
    actorId: string,
  ): Promise<Set<string>> {
    return this.permissions.forUser(actorId, tx);
  }

  assertNotSelf(actorId: string, targetId: string, message: string): void {
    if (actorId === targetId) throw new ForbiddenException(message);
  }

  /** El actor debe poseer TODOS los permisos indicados para poder delegarlos. */
  async assertCovers(
    tx: Prisma.TransactionClient,
    actorId: string,
    codes: Iterable<string>,
    message: string,
  ): Promise<Set<string>> {
    const held = await this.actorPermissions(tx, actorId);
    for (const code of codes) {
      if (!held.has(code)) throw new ForbiddenException(message);
    }
    return held;
  }

  /**
   * Nadie gestiona (desactiva, edita, restablece credenciales de…) a una cuenta con
   * más privilegios que la suya: los permisos efectivos del objetivo deben estar
   * contenidos en los del actor. Evita, p. ej., que un administrador parcial tome
   * una cuenta de superadministrador generando un enlace de restablecimiento.
   */
  async assertCanManageUser(
    tx: Prisma.TransactionClient,
    actorId: string,
    targetId: string,
  ): Promise<void> {
    const [held, target] = await Promise.all([
      this.actorPermissions(tx, actorId),
      this.permissions.forUser(targetId, tx),
    ]);
    for (const code of target) {
      if (!held.has(code)) {
        throw new ForbiddenException(
          'No puede gestionar una cuenta con más privilegios que la suya',
        );
      }
    }
  }

  /** Impide dejar el sistema sin ningún superadministrador activo. */
  async assertNotLastSuperadmin(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    const isSuperadmin = await tx.userRole.count({
      where: { userId, role: { code: SUPERADMIN_ROLE.code } },
    });
    if (isSuperadmin === 0) return;
    const others = await tx.user.count({
      where: {
        id: { not: userId },
        status: 'activo',
        roles: { some: { role: { code: SUPERADMIN_ROLE.code } } },
      },
    });
    if (others === 0) {
      throw new ConflictException(
        'Debe existir al menos un superadministrador activo',
      );
    }
  }

  async loadRole(tx: Prisma.TransactionClient, roleId: string) {
    const role = await tx.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: { select: { permission: { select: { code: true } } } },
      },
    });
    if (!role) throw new NotFoundException('Rol no encontrado');
    return {
      ...role,
      permissionCodes: role.permissions.map((p) => p.permission.code).sort(),
    };
  }
}
