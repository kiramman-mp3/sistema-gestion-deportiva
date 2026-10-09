import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthContext, AuthedRequest } from '../auth/auth.types.js';
import {
  Authenticated,
  CurrentAuth,
  RequirePermissions,
} from '../auth/decorators.js';
import { parseOrThrow, uuidSchema } from '../auth/schemas.js';
import { listQuerySchema } from '../catalogs/common.js';
import { NotificationsService } from './notifications.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

const inboxQuerySchema = listQuerySchema
  .pick({ page: true, pageSize: true })
  .extend({
    unread: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  });

const outboxQuerySchema = listQuerySchema
  .pick({ page: true, pageSize: true })
  .extend({
    status: z.enum(['pendiente', 'enviada', 'fallida']).optional(),
  });

const reminderSchema = z.strictObject({ clubId: uuidSchema });

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  // Bandeja propia: cualquier usuario con sesión ve únicamente sus avisos.

  @Authenticated()
  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    return this.notifications.listForUser(
      auth.user.id,
      parseOrThrow(inboxQuerySchema, query),
    );
  }

  @Authenticated()
  @Get('unread-count')
  unreadCount(@CurrentAuth() auth: AuthContext) {
    return this.notifications.unreadCount(auth.user.id);
  }

  @Authenticated()
  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentAuth() auth: AuthContext) {
    return this.notifications.markAllRead(auth.user.id);
  }

  // Administración del correo.

  @RequirePermissions('notifications:manage')
  @Get('outbox')
  outbox(@Query() query: unknown) {
    return this.notifications.outbox(parseOrThrow(outboxQuerySchema, query));
  }

  @RequirePermissions('notifications:manage')
  @Post('dispatch')
  @HttpCode(200)
  dispatch() {
    return this.notifications.dispatchPending();
  }

  @RequirePermissions('notifications:manage')
  @Post('reminders/documents')
  @HttpCode(200)
  remindDocuments(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    const { clubId } = parseOrThrow(reminderSchema, body);
    return this.notifications.remindDocuments(auth, ipOf(req), clubId);
  }

  @Authenticated()
  @Post(':id/read')
  @HttpCode(204)
  async read(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    await this.notifications.markRead(
      auth.user.id,
      parseOrThrow(uuidSchema, id),
    );
  }
}
