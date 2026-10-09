import {
  Body,
  Controller,
  Delete,
  HttpCode,
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
import {
  parseOrThrow,
  revokeSessionsSchema,
  userStatusSchema,
  uuidSchema,
} from '../auth/schemas.js';
import { UsersAdminService } from './users-admin.service.js';

@ApiTags('users')
@Controller('users')
export class UsersAdminController {
  constructor(
    @Inject(UsersAdminService) private readonly users: UsersAdminService,
  ) {}

  /** Activa, desactiva o bloquea una cuenta. Al desactivarla se revocan sus sesiones. */
  @RequirePermissions('users:update')
  @Patch(':id/status')
  setStatus(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { status, reason } = parseOrThrow(userStatusSchema, body);
    return this.users.setStatus(
      auth,
      parseOrThrow(uuidSchema, id),
      status,
      reason,
      req.ip ?? 'desconocida',
    );
  }

  /** Cierra todas las sesiones de un usuario. */
  @RequirePermissions('users:update')
  @Post(':id/sessions/revoke')
  @HttpCode(200)
  revokeSessions(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { reason } = parseOrThrow(revokeSessionsSchema, body);
    return this.users.revokeSessions(
      auth,
      parseOrThrow(uuidSchema, id),
      reason,
      req.ip ?? 'desconocida',
    );
  }

  @RequirePermissions('roles:manage')
  @Put(':id/roles/:roleId')
  @HttpCode(204)
  async assignRole(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('roleId') roleId: string,
  ): Promise<void> {
    await this.users.assignRole(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(uuidSchema, roleId),
      req.ip ?? 'desconocida',
    );
  }

  @RequirePermissions('roles:manage')
  @Delete(':id/roles/:roleId')
  @HttpCode(204)
  async removeRole(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('roleId') roleId: string,
  ): Promise<void> {
    await this.users.removeRole(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(uuidSchema, roleId),
      req.ip ?? 'desconocida',
    );
  }
}
