import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { SecurityHashService } from '../auth/security-hash.service.js';
import { SessionService } from '../auth/session.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { SUPERADMIN_ROLE } from '../authz/permissions.js';
import { PermissionsService } from '../authz/permissions.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, UserStatus } from '../generated/prisma/client.js';

type Actor = Pick<AuthContext, 'user' | 'permissions'>;

/**
 * Operaciones administrativas sobre cuentas y roles. Cada una se ejecuta y se
 * audita en una única transacción, y aplica reglas de seguridad adicionales a
 * los permisos de ruta:
 *  - nadie modifica su propia cuenta o roles (evita bloqueos y autoescalada);
 *  - solo se asigna o retira un rol cuyos permisos el actor posee todos
 *    (no se puede otorgar lo que no se tiene);
 *  - nunca puede quedar el sistema sin un superadministrador activo.
 */
@Injectable()
export class UsersAdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(SecurityHashService) private readonly hasher: SecurityHashService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
  ) {}

  async setStatus(
    actor: Actor,
    userId: string,
    status: UserStatus,
    reason: string,
    ip: string,
  ): Promise<{ id: string; status: UserStatus; revokedSessions: number }> {
    if (actor.user.id === userId) {
      throw new ForbiddenException(
        'No puede cambiar el estado de su propia cuenta',
      );
    }
    return this.prisma.client.$transaction(async (tx) => {
      await this.lockSuperadminChanges(tx);
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, status: true },
      });
      if (!target) throw new NotFoundException('Usuario no encontrado');

      if (target.status === status) {
        return { id: target.id, status, revokedSessions: 0 };
      }
      if (status !== 'activo') {
        await this.assertNotLastSuperadmin(tx, userId);
      }

      await tx.user.update({ where: { id: userId }, data: { status } });
      // Una cuenta que deja de estar activa pierde todas sus sesiones al instante.
      const revokedSessions =
        status === 'activo'
          ? 0
          : await this.sessions.revokeAllForUser(
              userId,
              'cuenta_desactivada',
              tx,
            );

      await this.audit.record(
        {
          userId: actor.user.id,
          action: 'user.status_change',
          entityType: 'user',
          entityId: userId,
          before: { status: target.status },
          after: { status, revokedSessions },
          reason,
          ipHash: this.hasher.hash('ip', ip),
        },
        tx,
      );
      return { id: userId, status, revokedSessions };
    });
  }

  async revokeSessions(
    actor: Actor,
    userId: string,
    reason: string,
    ip: string,
  ): Promise<{ revokedSessions: number }> {
    return this.prisma.client.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!target) throw new NotFoundException('Usuario no encontrado');

      const revokedSessions = await this.sessions.revokeAllForUser(
        userId,
        'revocada_por_administrador',
        tx,
      );
      await this.audit.record(
        {
          userId: actor.user.id,
          action: 'auth.sessions_revoked_by_admin',
          entityType: 'user',
          entityId: userId,
          after: { revokedSessions },
          reason,
          ipHash: this.hasher.hash('ip', ip),
        },
        tx,
      );
      return { revokedSessions };
    });
  }

  async assignRole(
    actor: Actor,
    userId: string,
    roleId: string,
    ip: string,
  ): Promise<void> {
    this.assertNotSelf(actor, userId);
    await this.prisma.client.$transaction(async (tx) => {
      await this.lockSuperadminChanges(tx);
      const { role } = await this.loadTargetAndRole(tx, userId, roleId);
      await this.assertActorHoldsRolePermissions(tx, actor, roleId);

      const existing = await tx.userRole.findUnique({
        where: { userId_roleId: { userId, roleId } },
      });
      if (existing) throw new ConflictException('El usuario ya tiene ese rol');

      await tx.userRole.create({
        data: { userId, roleId, grantedById: actor.user.id },
      });
      await this.audit.record(
        {
          userId: actor.user.id,
          action: 'user.role_assigned',
          entityType: 'user',
          entityId: userId,
          after: { role: role.code },
          ipHash: this.hasher.hash('ip', ip),
        },
        tx,
      );
    });
  }

  async removeRole(
    actor: Actor,
    userId: string,
    roleId: string,
    ip: string,
  ): Promise<void> {
    this.assertNotSelf(actor, userId);
    await this.prisma.client.$transaction(async (tx) => {
      await this.lockSuperadminChanges(tx);
      const { role } = await this.loadTargetAndRole(tx, userId, roleId);
      await this.assertActorHoldsRolePermissions(tx, actor, roleId);

      const existing = await tx.userRole.findUnique({
        where: { userId_roleId: { userId, roleId } },
      });
      if (!existing) throw new NotFoundException('El usuario no tiene ese rol');
      if (role.code === SUPERADMIN_ROLE.code) {
        await this.assertNotLastSuperadmin(tx, userId);
      }

      await tx.userRole.delete({ where: { id: existing.id } });
      await this.audit.record(
        {
          userId: actor.user.id,
          action: 'user.role_removed',
          entityType: 'user',
          entityId: userId,
          before: { role: role.code },
          ipHash: this.hasher.hash('ip', ip),
        },
        tx,
      );
    });
  }

  // ───────────────────────── reglas de seguridad ─────────────────────────

  private assertNotSelf(actor: Actor, userId: string): void {
    if (actor.user.id === userId) {
      throw new ForbiddenException('No puede modificar sus propios roles');
    }
  }

  /** Serializa los cambios que pueden afectar al conjunto de superadministradores. */
  private async lockSuperadminChanges(
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('liga:superadmin-changes'))`;
  }

  private async loadTargetAndRole(
    tx: Prisma.TransactionClient,
    userId: string,
    roleId: string,
  ) {
    const [user, role] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { id: true } }),
      tx.role.findUnique({
        where: { id: roleId },
        select: { id: true, code: true },
      }),
    ]);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (!role) throw new NotFoundException('Rol no encontrado');
    return { user, role };
  }

  /**
   * El actor debe poseer todos los permisos del rol que asigna o retira; así un
   * administrador parcial no puede crear (ni quitar) superadministradores.
   * Los permisos se releen dentro de la transacción: no se confía en un valor
   * leído antes.
   */
  private async assertActorHoldsRolePermissions(
    tx: Prisma.TransactionClient,
    actor: Actor,
    roleId: string,
  ): Promise<void> {
    const [actorPermissions, rolePermissions] = await Promise.all([
      this.permissions.forUser(actor.user.id, tx),
      tx.rolePermission.findMany({
        where: { roleId },
        select: { permission: { select: { code: true } } },
      }),
    ]);
    const missing = rolePermissions.filter(
      (rp) => !actorPermissions.has(rp.permission.code),
    );
    if (missing.length > 0) {
      throw new ForbiddenException(
        'No puede gestionar un rol con permisos que usted no posee',
      );
    }
  }

  /** Impide dejar el sistema sin ningún superadministrador activo. */
  private async assertNotLastSuperadmin(
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
}
