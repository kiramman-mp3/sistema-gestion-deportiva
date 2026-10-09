import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthContext, AuthedRequest } from '../auth/auth.types.js';
import { CurrentAuth, RequirePermissions } from '../auth/decorators.js';
import { parseOrThrow, uuidSchema } from '../auth/schemas.js';
import { listPermissions } from '../authz/permissions.js';
import {
  createRoleSchema,
  setRolePermissionsSchema,
  updateRoleSchema,
} from './roles.schemas.js';
import { RolesService } from './roles.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

@ApiTags('roles')
@Controller()
export class RolesController {
  constructor(@Inject(RolesService) private readonly roles: RolesService) {}

  /** Catálogo de permisos del sistema, con módulo y acción para agruparlos. */
  @RequirePermissions('roles:read')
  @Get('permissions')
  permissions() {
    return listPermissions();
  }

  @RequirePermissions('roles:read')
  @Get('roles')
  list() {
    return this.roles.list();
  }

  @RequirePermissions('roles:read')
  @Get('roles/:id')
  get(@Param('id') id: string) {
    return this.roles.get(parseOrThrow(uuidSchema, id));
  }

  @RequirePermissions('roles:manage')
  @Post('roles')
  create(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.roles.create(
      auth,
      parseOrThrow(createRoleSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('roles:manage')
  @Patch('roles/:id')
  update(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.roles.update(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(updateRoleSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('roles:manage')
  @Put('roles/:id/permissions')
  setPermissions(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { permissions } = parseOrThrow(setRolePermissionsSchema, body);
    return this.roles.setPermissions(
      auth,
      parseOrThrow(uuidSchema, id),
      permissions,
      ipOf(req),
    );
  }
}
