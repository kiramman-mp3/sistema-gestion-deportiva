import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators.js';
import { PrismaService } from '../database/prisma.service.js';

@ApiTags('roles')
@Controller('roles')
export class RolesController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Roles y los permisos que otorgan. */
  @RequirePermissions('roles:read')
  @Get()
  async list() {
    const roles = await this.prisma.client.role.findMany({
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isSystem: true,
        permissions: { select: { permission: { select: { code: true } } } },
      },
    });
    return roles.map(({ permissions, ...role }) => ({
      ...role,
      permissions: permissions.map((p) => p.permission.code).sort(),
    }));
  }
}
