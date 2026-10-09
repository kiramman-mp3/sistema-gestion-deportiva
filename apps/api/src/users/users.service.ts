import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import {
  CredentialTokenService,
  type IssuedCredentialToken,
} from '../auth/credential-token.service.js';
import { SecurityHashService } from '../auth/security-hash.service.js';
import { SessionService } from '../auth/session.service.js';
import { PrivilegesService } from '../authz/privileges.service.js';
import {
  type Page,
  changedFields,
  escapeLike,
  translateDbError,
} from '../catalogs/common.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, UserStatus } from '../generated/prisma/client.js';
import type { CreateUserInput, UpdateUserInput } from './users.schemas.js';

type Actor = Pick<AuthContext, 'user'>;

/** Datos administrativos de una cuenta. Nunca incluye hash, tokens ni sesiones. */
export interface UserView {
  id: string;
  email: string;
  displayName: string;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: { id: string; code: string; name: string }[];
}

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    orderBy: { role: { code: 'asc' } },
    select: { role: { select: { id: true, code: true, name: true } } },
  },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

const toView = ({ roles, ...user }: UserRow): UserView => ({
  ...user,
  roles: roles.map((r) => r.role),
});

const ERRORS = {
  unique: { users_email_key: 'Ya existe un usuario con ese correo' },
  inUse: 'La cuenta tiene registros asociados y no puede eliminarse',
};

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hasher: SecurityHashService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(CredentialTokenService)
    private readonly tokens: CredentialTokenService,
    @Inject(PrivilegesService) private readonly privileges: PrivilegesService,
  ) {}

  async list(query: {
    page: number;
    pageSize: number;
    q?: string;
    status?: UserStatus;
    roleId?: string;
  }): Promise<Page<UserView>> {
    const where: Prisma.UserWhereInput = {
      status: query.status,
      ...(query.roleId && { roles: { some: { roleId: query.roleId } } }),
      ...(query.q && {
        OR: [
          {
            displayName: { contains: escapeLike(query.q), mode: 'insensitive' },
          },
          { email: { contains: escapeLike(query.q), mode: 'insensitive' } },
        ],
      }),
    };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.user.count({ where }),
    ]);
    return {
      items: rows.map(toView),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(id: string): Promise<UserView> {
    const row = await this.prisma.client.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!row) throw new NotFoundException('Usuario no encontrado');
    return toView(row);
  }

  /**
   * Crea una cuenta SIN contraseña, SIN roles y en estado `pendiente`. Devuelve un
   * enlace de activación de un solo uso (el token se muestra únicamente aquí): el
   * titular fija su propia contraseña; el administrador nunca la conoce.
   */
  async create(
    actor: Actor,
    input: CreateUserInput,
    ip: string,
  ): Promise<{ user: UserView; activation: IssuedCredentialToken }> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: input.email,
            displayName: input.displayName,
            status: 'pendiente',
          },
          select: { id: true },
        });
        const activation = await this.tokens.issue(tx, {
          userId: created.id,
          kind: 'activacion',
          createdById: actor.user.id,
        });
        await this.audit.record(
          {
            userId: actor.user.id,
            action: 'user.create',
            entityType: 'user',
            entityId: created.id,
            after: {
              email: input.email,
              displayName: input.displayName,
              status: 'pendiente',
              activationExpiresAt: activation.expiresAt.toISOString(),
            },
            ipHash: this.hasher.hash('ip', ip),
          },
          tx,
        );
        const row = await tx.user.findUniqueOrThrow({
          where: { id: created.id },
          select: USER_SELECT,
        });
        return { user: toView(row), activation };
      });
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async update(
    actor: Actor,
    id: string,
    input: UpdateUserInput,
    ip: string,
  ): Promise<UserView> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        await this.privileges.lock(tx);
        this.privileges.assertNotSelf(
          actor.user.id,
          id,
          'No puede modificar su propia cuenta por esta vía',
        );
        const current = await tx.user.findUnique({
          where: { id },
          select: { id: true, email: true, displayName: true },
        });
        if (!current) throw new NotFoundException('Usuario no encontrado');
        await this.privileges.assertCanManageUser(tx, actor.user.id, id);

        const next = {
          email: input.email ?? current.email,
          displayName: input.displayName ?? current.displayName,
        };
        const diff = changedFields(
          { email: current.email, displayName: current.displayName },
          next,
        );
        if (!diff) {
          return toView(
            await tx.user.findUniqueOrThrow({
              where: { id },
              select: USER_SELECT,
            }),
          );
        }

        if (next.email !== current.email) {
          // Un enlace pendiente fue emitido para el contacto anterior: deja de valer.
          await this.tokens.revokeOutstanding(tx, id);
        }
        const updated = await tx.user.update({
          where: { id },
          data: next,
          select: USER_SELECT,
        });
        await this.audit.record(
          {
            userId: actor.user.id,
            action: 'user.update',
            entityType: 'user',
            entityId: id,
            before: diff.before as Prisma.InputJsonValue,
            after: diff.after as Prisma.InputJsonValue,
            ipHash: this.hasher.hash('ip', ip),
          },
          tx,
        );
        return toView(updated);
      });
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  /**
   * Emite un enlace de un solo uso para que el titular establezca su contraseña:
   * activación si la cuenta está pendiente, restablecimiento si está activa. Anula
   * cualquier enlace anterior. Requiere poder gestionar la cuenta objetivo.
   */
  async issueCredentialLink(
    actor: Actor,
    id: string,
    ip: string,
  ): Promise<IssuedCredentialToken> {
    return this.prisma.client.$transaction(async (tx) => {
      await this.privileges.lock(tx);
      this.privileges.assertNotSelf(
        actor.user.id,
        id,
        'Para cambiar su propia contraseña use «Cambiar contraseña»',
      );
      const target = await tx.user.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!target) throw new NotFoundException('Usuario no encontrado');
      await this.privileges.assertCanManageUser(tx, actor.user.id, id);

      const kind =
        target.status === 'pendiente'
          ? 'activacion'
          : target.status === 'activo'
            ? 'restablecimiento'
            : null;
      if (!kind) {
        throw new ConflictException(
          'La cuenta está desactivada o bloqueada: actívela antes de generar un enlace de contraseña',
        );
      }
      const issued = await this.tokens.issue(tx, {
        userId: id,
        kind,
        createdById: actor.user.id,
      });
      await this.audit.record(
        {
          userId: actor.user.id,
          action: 'user.credential_link_issued',
          entityType: 'user',
          entityId: id,
          // El token NUNCA se registra: solo su tipo y vencimiento.
          after: { kind, expiresAt: issued.expiresAt.toISOString() },
          ipHash: this.hasher.hash('ip', ip),
        },
        tx,
      );
      return issued;
    });
  }

  async listSessions(id: string) {
    await this.get(id);
    return this.sessions.listActive(id);
  }

  async revokeSession(
    actor: Actor,
    userId: string,
    sessionId: string,
    reason: string,
    ip: string,
  ): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      await this.privileges.lock(tx);
      const session = await tx.session.findFirst({
        // Filtrar por usuario evita revocar sesiones de otra cuenta (IDOR).
        where: { id: sessionId, userId, revokedAt: null },
        select: { id: true },
      });
      if (!session) throw new NotFoundException('Sesión no encontrada');
      if (userId !== actor.user.id) {
        await this.privileges.assertCanManageUser(tx, actor.user.id, userId);
      }
      await this.sessions.revoke(session.id, 'revocada_por_administrador', tx);
      await this.audit.record(
        {
          userId: actor.user.id,
          action: 'auth.session_revoked_by_admin',
          entityType: 'session',
          entityId: session.id,
          after: { userId },
          reason,
          ipHash: this.hasher.hash('ip', ip),
        },
        tx,
      );
    });
  }
}
