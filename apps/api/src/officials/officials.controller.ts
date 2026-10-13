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
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthContext, AuthedRequest } from '../auth/auth.types.js';
import { CurrentAuth, RequirePermissions } from '../auth/decorators.js';
import { parseOrThrow, uuidSchema } from '../auth/schemas.js';
import {
  createOfficialSchema,
  historyQuerySchema,
  officialListQuerySchema,
  unavailabilitySchema,
  updateOfficialSchema,
} from './officials.schemas.js';
import { OfficialsService } from './officials.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

@ApiTags('officials')
@Controller('officials')
export class OfficialsController {
  constructor(
    @Inject(OfficialsService) private readonly officials: OfficialsService,
  ) {}

  @RequirePermissions('officials:read')
  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    return this.officials.list(
      parseOrThrow(officialListQuerySchema, query),
      auth,
    );
  }

  @RequirePermissions('officials:read')
  @Get(':id')
  get(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.officials.get(parseOrThrow(uuidSchema, id), auth);
  }

  @RequirePermissions('officials:read')
  @Get(':id/history')
  history(@Param('id') id: string, @Query() query: unknown) {
    return this.officials.history(
      parseOrThrow(uuidSchema, id),
      parseOrThrow(historyQuerySchema, query),
    );
  }

  @RequirePermissions('officials:manage')
  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.officials.create(
      auth,
      ipOf(req),
      parseOrThrow(createOfficialSchema, body),
    );
  }

  @RequirePermissions('officials:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.officials.update(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      parseOrThrow(updateOfficialSchema, body),
    );
  }

  @RequirePermissions('officials:delete')
  @Delete(':id')
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.officials.delete(parseOrThrow(uuidSchema, id), auth, ipOf(req));
  }

  @RequirePermissions('officials:manage')
  @Post(':id/unavailability')
  addUnavailability(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.officials.addUnavailability(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      parseOrThrow(unavailabilitySchema, body),
    );
  }

  @RequirePermissions('officials:manage')
  @Delete(':id/unavailability/:unavailabilityId')
  @HttpCode(204)
  async removeUnavailability(
    @Param('id') id: string,
    @Param('unavailabilityId') unavailabilityId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.officials.removeUnavailability(
      parseOrThrow(uuidSchema, id),
      parseOrThrow(uuidSchema, unavailabilityId),
      auth,
      ipOf(req),
    );
  }
}
