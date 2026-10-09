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
import type { AuthContext, AuthedRequest } from '../../auth/auth.types.js';
import { CurrentAuth, RequirePermissions } from '../../auth/decorators.js';
import { parseOrThrow, uuidSchema } from '../../auth/schemas.js';
import {
  createSportSchema,
  sportListQuerySchema,
  sportStatusSchema,
  updateSportSchema,
} from './sports.schemas.js';
import { SportsService } from './sports.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

@ApiTags('sports')
@Controller('sports')
export class SportsController {
  constructor(@Inject(SportsService) private readonly sports: SportsService) {}

  @RequirePermissions('sports:read')
  @Get()
  list(@Query() query: unknown) {
    return this.sports.list(parseOrThrow(sportListQuerySchema, query));
  }

  @RequirePermissions('sports:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.sports.get(parseOrThrow(uuidSchema, id));
  }

  @RequirePermissions('sports:manage')
  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.sports.create(
      auth,
      parseOrThrow(createSportSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('sports:manage')
  @Patch(':id')
  update(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.sports.update(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(updateSportSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('sports:manage')
  @Patch(':id/status')
  setStatus(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { status, reason } = parseOrThrow(sportStatusSchema, body);
    return this.sports.setStatus(
      auth,
      parseOrThrow(uuidSchema, id),
      status,
      reason,
      ipOf(req),
    );
  }

  @RequirePermissions('sports:delete')
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    await this.sports.remove(auth, parseOrThrow(uuidSchema, id), ipOf(req));
  }
}
