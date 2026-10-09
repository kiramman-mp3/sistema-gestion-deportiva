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
  createSeasonSchema,
  seasonListQuerySchema,
  seasonStatusSchema,
  updateSeasonSchema,
} from './seasons.schemas.js';
import { SeasonsService } from './seasons.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

@ApiTags('seasons')
@Controller('seasons')
export class SeasonsController {
  constructor(
    @Inject(SeasonsService) private readonly seasons: SeasonsService,
  ) {}

  @RequirePermissions('seasons:read')
  @Get()
  list(@Query() query: unknown) {
    return this.seasons.list(parseOrThrow(seasonListQuerySchema, query));
  }

  @RequirePermissions('seasons:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.seasons.get(parseOrThrow(uuidSchema, id));
  }

  @RequirePermissions('seasons:manage')
  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.seasons.create(
      auth,
      parseOrThrow(createSeasonSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('seasons:manage')
  @Patch(':id')
  update(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.seasons.update(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(updateSeasonSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('seasons:manage')
  @Patch(':id/status')
  setStatus(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { status, reason } = parseOrThrow(seasonStatusSchema, body);
    return this.seasons.setStatus(
      auth,
      parseOrThrow(uuidSchema, id),
      status,
      reason,
      ipOf(req),
    );
  }

  @RequirePermissions('seasons:delete')
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    await this.seasons.remove(auth, parseOrThrow(uuidSchema, id), ipOf(req));
  }
}
