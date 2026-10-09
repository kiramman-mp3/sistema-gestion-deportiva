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
  championshipListQuerySchema,
  createChampionshipSchema,
  createRuleVersionSchema,
  transitionChampionshipSchema,
  updateChampionshipSchema,
} from './championships.schemas.js';
import { ChampionshipsService } from './championships.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

@ApiTags('championships')
@Controller('championships')
export class ChampionshipsController {
  constructor(
    @Inject(ChampionshipsService)
    private readonly championships: ChampionshipsService,
  ) {}

  @RequirePermissions('championships:read')
  @Get()
  list(@Query() query: unknown) {
    return this.championships.list(
      parseOrThrow(championshipListQuerySchema, query),
    );
  }

  @RequirePermissions('championships:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.championships.get(parseOrThrow(uuidSchema, id));
  }

  @RequirePermissions('championships:manage')
  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.championships.create(
      auth,
      ipOf(req),
      parseOrThrow(createChampionshipSchema, body),
    );
  }

  @RequirePermissions('championships:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.championships.update(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      parseOrThrow(updateChampionshipSchema, body),
    );
  }

  @RequirePermissions('championships:manage')
  @Patch(':id/status')
  transition(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.championships.transition(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      parseOrThrow(transitionChampionshipSchema, body),
    );
  }

  @RequirePermissions('championships:manage')
  @Post(':id/rules')
  createRuleVersion(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.championships.createRuleVersion(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      parseOrThrow(createRuleVersionSchema, body),
    );
  }

  @RequirePermissions('championships:delete')
  @Delete(':id')
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.championships.delete(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
    );
  }
}
