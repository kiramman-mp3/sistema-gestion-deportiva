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
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthContext, AuthedRequest } from '../../auth/auth.types.js';
import { CurrentAuth, RequirePermissions } from '../../auth/decorators.js';
import { parseOrThrow, uuidSchema } from '../../auth/schemas.js';
import {
  createRegistrationSchema,
  reviewRegistrationSchema,
} from './registrations.schemas.js';
import { RegistrationsService } from './registrations.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

@ApiTags('registrations')
@Controller('championships/:championshipId/registrations')
export class RegistrationsController {
  constructor(
    @Inject(RegistrationsService)
    private readonly registrations: RegistrationsService,
  ) {}

  @RequirePermissions('registrations:read')
  @Get()
  list(
    @Param('championshipId') championshipId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.registrations.list(
      parseOrThrow(uuidSchema, championshipId),
      auth,
    );
  }

  @RequirePermissions('registrations:manage')
  @Post()
  create(
    @Param('championshipId') championshipId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.registrations.create(
      parseOrThrow(uuidSchema, championshipId),
      auth,
      ipOf(req),
      parseOrThrow(createRegistrationSchema, body),
    );
  }

  @RequirePermissions('registrations:manage')
  @Patch(':id/status')
  review(
    @Param('championshipId') championshipId: string,
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.registrations.review(
      parseOrThrow(uuidSchema, championshipId),
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      parseOrThrow(reviewRegistrationSchema, body),
    );
  }

  @RequirePermissions('registrations:manage')
  @Delete(':id')
  @HttpCode(204)
  async delete(
    @Param('championshipId') championshipId: string,
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.registrations.delete(
      parseOrThrow(uuidSchema, championshipId),
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
    );
  }
}
