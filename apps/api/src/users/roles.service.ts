import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { SecurityHashService } from '../auth/security-hash.service.js';
import { isPermissionCode } from '../authz/permissions.js';
import { PrivilegesService } from '../authz/privileges.service.js';
import { changedFields, translateDbError } from '../catalogs/common.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CreateRoleInput, UpdateRoleInput } from './roles.schemas.js';

type Actor = Pick<AuthContext, 'user'>;

export interface RoleView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  /** Rol de sistema: solo lo mantiene el seed; no se modifica desde la API. */
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

const ROLE_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  isSystem: true,
  permissions: { select: { permission: { select: { code: true } } } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleSelect;

const toView = (
  r: Prisma.RoleGetPayload<{ select: typeof ROLE_SELECT }>,
): RoleView => ({
  id: r.id,
  code: r.code,
  name: r.name,
  description: r.description,
  isSystem: r.isSystem,
  permissions: r.permissions.map((p) => p.permission.code).sort(),
  userCount: r._count.users,
});

const ERRORS = {
  unique: { roles_code_key: 'Ya existe un rol con ese código' },
  inUse: 'El rol está en uso',
};

const SYSTEM_ROLE_MESSAGE =
  'Los roles de sistema no pueden modificarse: los mantiene el sistema (npm run db:seed)';

@Injectable()
export class RolesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hasher: SecurityHashService,
    @Inject(PrivilegesService) private readonly privileges: PrivilegesService,
  ) {}

  async list(): Promise<RoleView[]> {
    const rows = await this.prisma.client.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
      select: ROLE_SELECT,
    });
    return rows.map(toView);
  }

  async get(id: string): Promise<RoleView> {
    const row = await this.prisma.client.role.findUnique({
      where: { id },
      select: ROLE_SELECT,
    });
    if (!row) throw new NotFoundException('Rol no encontrado');
    return toView(row);
  }

  /** Crea un rol configurable (nunca de sistema) con permisos que el actor puede delegar. */
  async create(
    actor: Actor,
    input: CreateRoleInput,
    ip: string,
  ): Promise<RoleView> {
    const permissions = this.validateCodes(input.permissions ?? []);
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        await this.privileges.lock(tx);
        await this.privileges.assertCovers(
          tx,
          actor.user.id,
          permissions,
          'No puede conceder permisos que usted no posee',
        );
        const rows = await tx.permission.findMany({
          where: { code: { in: permissions } },
        });
        const role = await tx.role.create({
          data: {
            code: input.code,
            name: input.name,
            description: input.description ?? null,
            isSystem: false,
            permissions: { create: rows.map((p) => ({ permissionId: p.id })) },
          },
        });
        await this.audit.record(
          {
            userId: actor.user.id,
            action: 'role.create',
            entityType: 'role',
            entityId: role.id,
            after: {
              code: role.code,
              name: role.name,
              description: role.description,
              permissions: [...permissions].sort(),
            },
            ipHash: this.hasher.hash('ip', ip),
          },
          tx,
        );
        return toView(
          await tx.role.findUniqueOrThrow({
            where: { id: role.id },
            select: ROLE_SELECT,
          }),
        );
      });
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async update(
    actor: Actor,
    id: string,
    input: UpdateRoleInput,
    ip: string,
  ): Promise<RoleView> {
    return this.prisma.client.$transaction(async (tx) => {
      await this.privileges.lock(tx);
      const role = await this.privileges.loadRole(tx, id);
      if (role.isSystem) throw new ForbiddenException(SYSTEM_ROLE_MESSAGE);

      const diff = changedFields(
        { name: role.name, description: role.description },
        {
          name: input.name ?? role.name,
          description:
            input.description === undefined
              ? role.description
              : input.description,
        },
      );
      if (!diff)
        return toView(
          await tx.role.findUniqueOrThrow({
            where: { id },
            select: ROLE_SELECT,
          }),
        );

      const updated = await tx.role.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
        },
        select: ROLE_SELECT,
      });
      await this.audit.record(
        {
          userId: actor.user.id,
          action: 'role.update',
          entityType: 'role',
          entityId: id,
          before: diff.before as Prisma.InputJsonValue,
          after: diff.after as Prisma.InputJsonValue,
          ipHash: this.hasher.hash('ip', ip),
        },
        tx,
      );
      return toView(updated);
    });
  }

  /**
   * Reemplaza el conjunto de permisos de un rol. Reglas (todas en el backend):
   *  - no se tocan roles de sistema;
   *  - el actor no modifica un rol que él mismo tiene asignado;
   *  - el actor debe poseer todos los permisos actuales del rol y todos los nuevos
   *    (no puede conceder ni retirar lo que no tiene);
   *  - todo código debe existir en el catálogo del sistema.
   * Los usuarios con ese rol reciben el cambio en su siguiente petición.
   */
  async setPermissions(
    actor: Actor,
    id: string,
    requested: string[],
    ip: string,
  ): Promise<RoleView & { added: string[]; removed: string[] }> {
    const desired = this.validateCodes(requested);
    return this.prisma.client.$transaction(async (tx) => {
      await this.privileges.lock(tx);
      const role = await this.privileges.loadRole(tx, id);
      if (role.isSystem) throw new ForbiddenException(SYSTEM_ROLE_MESSAGE);

      const holdsRole = await tx.userRole.count({
        where: { userId: actor.user.id, roleId: id },
      });
      if (holdsRole > 0) {
        throw new ForbiddenException(
          'No puede modificar un rol que usted mismo tiene asignado',
        );
      }

      const current = new Set(role.permissionCodes);
      const wanted = new Set(desired);
      await this.privileges.assertCovers(
        tx,
        actor.user.id,
        [...current, ...wanted],
        'No puede modificar un rol con permisos que usted no posee',
      );

      const added = [...wanted].filter((c) => !current.has(c)).sort();
      const removed = [...current].filter((c) => !wanted.has(c)).sort();
      if (added.length === 0 && removed.length === 0) {
        return {
          ...toView(
            await tx.role.findUniqueOrThrow({
              where: { id },
              select: ROLE_SELECT,
            }),
          ),
          added,
          removed,
        };
      }

      if (removed.length > 0) {
        await tx.rolePermission.deleteMany({
          where: { roleId: id, permission: { code: { in: removed } } },
        });
      }
      if (added.length > 0) {
        const rows = await tx.permission.findMany({
          where: { code: { in: added } },
        });
        if (rows.length !== added.length) {
          throw new BadRequestException(
            'Algún permiso no existe en la base de datos (ejecute db:seed)',
          );
        }
        await tx.rolePermission.createMany({
          data: rows.map((p) => ({ roleId: id, permissionId: p.id })),
        });
      }

      const view = toView(
        await tx.role.findUniqueOrThrow({ where: { id }, select: ROLE_SELECT }),
      );
      await this.audit.record(
        {
          userId: actor.user.id,
          action: 'role.permissions_update',
          entityType: 'role',
          entityId: id,
          before: { permissions: [...current].sort() },
          after: {
            permissions: view.permissions,
            added,
            removed,
            affectedUsers: view.userCount,
          },
          ipHash: this.hasher.hash('ip', ip),
        },
        tx,
      );
      return { ...view, added, removed };
    });
  }

  /** Rechaza códigos que no existan en el catálogo definido por el código. */
  private validateCodes(codes: string[]): string[] {
    const unknown = codes.filter((c) => !isPermissionCode(c));
    if (unknown.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Solicitud inválida',
        errors: [
          {
            field: 'permissions',
            message: `Permisos inexistentes: ${unknown.join(', ')}`,
          },
        ],
      });
    }
    return codes;
  }
}
