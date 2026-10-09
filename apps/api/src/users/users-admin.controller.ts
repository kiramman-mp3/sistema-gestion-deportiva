import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthContext, AuthedRequest } from '../auth/auth.types.js';
import { CurrentAuth, RequirePermissions } from '../auth/decorators.js';
import { parseOrThrow, uuidSchema } from '../auth/schemas.js';
import { UsersAdminService } from './users-admin.service.js';
import {
  createUserSchema,
  revokeReasonSchema,
  setUserStatusSchema,
  updateUserSchema,
  userListQuerySchema,
} from './users.schemas.js';
import { UsersService } from './users.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

@ApiTags('users')
@Controller('users')
export class UsersAdminController {
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(UsersAdminService) private readonly admin: UsersAdminService,
  ) {}

  @RequirePermissions('users:read')
  @Get()
  list(@Query() query: unknown) {
    return this.users.list(parseOrThrow(userListQuerySchema, query));
  }

  @RequirePermissions('users:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.users.get(parseOrThrow(uuidSchema, id));
  }

  /**
   * Crea una cuenta pendiente de activación. La respuesta incluye UNA SOLA VEZ el
   * token de activación; el titular establece su propia contraseña con él.
   */
  @RequirePermissions('users:create')
  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.users.create(
      auth,
      parseOrThrow(createUserSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('users:update')
  @Patch(':id')
  update(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.users.update(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(updateUserSchema, body),
      ipOf(req),
    );
  }

  /** Activa, desactiva o bloquea una cuenta. Al desactivarla se revocan sus sesiones. */
  @RequirePermissions('users:update')
  @Patch(':id/status')
  setStatus(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { status, reason } = parseOrThrow(setUserStatusSchema, body);
    return this.admin.setStatus(
      auth,
      parseOrThrow(uuidSchema, id),
      status,
      reason,
      ipOf(req),
    );
  }

  /**
   * Genera un enlace de un solo uso (activación o restablecimiento). El token se
   * devuelve una única vez; no se envía por correo (no hay entrega de correo).
   */
  @RequirePermissions('users:update')
  @Post(':id/credential-link')
  @HttpCode(200)
  credentialLink(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ) {
    return this.users.issueCredentialLink(
      auth,
      parseOrThrow(uuidSchema, id),
      ipOf(req),
    );
  }

  @RequirePermissions('users:read')
  @Get(':id/sessions')
  sessions(@Param('id') id: string) {
    return this.users.listSessions(parseOrThrow(uuidSchema, id));
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
    const { reason } = parseOrThrow(revokeReasonSchema, body);
    return this.admin.revokeSessions(
      auth,
      parseOrThrow(uuidSchema, id),
      reason,
      ipOf(req),
    );
  }

  @RequirePermissions('users:update')
  @Post(':id/sessions/:sessionId/revoke')
  @HttpCode(204)
  async revokeSession(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
  ): Promise<void> {
    const { reason } = parseOrThrow(revokeReasonSchema, body);
    await this.users.revokeSession(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(uuidSchema, sessionId),
      reason,
      ipOf(req),
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
    await this.admin.assignRole(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(uuidSchema, roleId),
      ipOf(req),
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
    await this.admin.removeRole(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(uuidSchema, roleId),
      ipOf(req),
    );
  }
}
