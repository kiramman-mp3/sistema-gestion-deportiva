import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CredentialTokenService } from '../auth/credential-token.service.js';
import { SecurityHashService } from '../auth/security-hash.service.js';
import { SessionService } from '../auth/session.service.js';
import { SUPERADMIN_ROLE } from '../authz/permissions.js';
import { PrivilegesService } from '../authz/privileges.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { UserStatus } from '../generated/prisma/client.js';

type Actor = Pick<AuthContext, 'user'>;

/**
 * Operaciones que cambian el acceso de una cuenta (estado, sesiones, roles). Cada
 * una se ejecuta y se audita en una única transacción, tras tomar el bloqueo de
 * privilegios, y aplica estas reglas además de los permisos de ruta:
 *  - nadie modifica su propia cuenta ni sus propios roles;
 *  - no se gestiona una cuenta con más privilegios que la propia;
 *  - solo se asigna o retira un rol cuyos permisos el actor posee todos;
 *  - nunca puede quedar el sistema sin un superadministrador activo.
 */
@Injectable()
export class UsersAdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(CredentialTokenService)
    private readonly tokens: CredentialTokenService,
    @Inject(SecurityHashService) private readonly hasher: SecurityHashService,
    @Inject(PrivilegesService) private readonly privileges: PrivilegesService,
  ) {}

  async setStatus(
    actor: Actor,
    userId: string,
    status: Exclude<UserStatus, 'pendiente'>,
    reason: string,
    ip: string,
  ): Promise<{ id: string; status: UserStatus; revokedSessions: number }> {
    this.privileges.assertNotSelf(
      actor.user.id,
      userId,
      'No puede cambiar el estado de su propia cuenta',
    );
    return this.prisma.client.$transaction(async (tx) => {
      await this.privileges.lock(tx);
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, status: true, passwordHash: true },
      });
      if (!target) throw new NotFoundException('Usuario no encontrado');
      await this.privileges.assertCanManageUser(tx, actor.user.id, userId);

      if (target.status === status)
        return { id: target.id, status, revokedSessions: 0 };
      if (status === 'activo' && target.passwordHash === null) {
        throw new ConflictException(
          'La cuenta aún no tiene contraseña: genere un enlace de activación para que su titular la establezca',
        );
      }
      if (status !== 'activo') {
        await this.privileges.assertNotLastSuperadmin(tx, userId);
      }

      await tx.user.update({ where: { id: userId }, data: { status } });
      let revokedSessions = 0;
      if (status !== 'activo') {
        // Una cuenta que deja de estar activa pierde sesiones y enlaces pendientes al instante.
        revokedSessions = await this.sessions.revokeAllForUser(
          userId,
          'cuenta_desactivada',
          tx,
        );
        await this.tokens.revokeOutstanding(tx, userId);
      }
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
      await this.privileges.lock(tx);
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!target) throw new NotFoundException('Usuario no encontrado');
      if (userId !== actor.user.id) {
        await this.privileges.assertCanManageUser(tx, actor.user.id, userId);
      }

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
    this.privileges.assertNotSelf(
      actor.user.id,
      userId,
      'No puede modificar sus propios roles',
    );
    await this.prisma.client.$transaction(async (tx) => {
      await this.privileges.lock(tx);
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) throw new NotFoundException('Usuario no encontrado');
      const role = await this.privileges.loadRole(tx, roleId);
      // El actor solo delega lo que posee, permiso por permiso.
      await this.privileges.assertCovers(
        tx,
        actor.user.id,
        role.permissionCodes,
        'No puede gestionar un rol con permisos que usted no posee',
      );

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
    this.privileges.assertNotSelf(
      actor.user.id,
      userId,
      'No puede modificar sus propios roles',
    );
    await this.prisma.client.$transaction(async (tx) => {
      await this.privileges.lock(tx);
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) throw new NotFoundException('Usuario no encontrado');
      const role = await this.privileges.loadRole(tx, roleId);
      await this.privileges.assertCovers(
        tx,
        actor.user.id,
        role.permissionCodes,
        'No puede gestionar un rol con permisos que usted no posee',
      );
      await this.privileges.assertCanManageUser(tx, actor.user.id, userId);

      const existing = await tx.userRole.findUnique({
        where: { userId_roleId: { userId, roleId } },
      });
      if (!existing) throw new NotFoundException('El usuario no tiene ese rol');
      if (role.code === SUPERADMIN_ROLE.code) {
        await this.privileges.assertNotLastSuperadmin(tx, userId);
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
}
