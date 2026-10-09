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
  changeEventStatusSchema,
  createEventSchema,
  createRoundSchema,
  createStageSchema,
  listEventsQuerySchema,
  rescheduleEventSchema,
} from './fixtures.schemas.js';
import { FixturesService } from './fixtures.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

@ApiTags('fixtures')
@Controller()
export class FixturesController {
  constructor(
    @Inject(FixturesService)
    private readonly fixtures: FixturesService,
  ) {}

  @RequirePermissions('fixtures:read')
  @Get('championships/:championshipId/stages')
  listStages(@Param('championshipId') championshipId: string) {
    return this.fixtures.listStages(parseOrThrow(uuidSchema, championshipId));
  }

  @RequirePermissions('fixtures:manage')
  @Post('championships/:championshipId/stages')
  createStage(
    @Param('championshipId') championshipId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.fixtures.createStage(
      parseOrThrow(uuidSchema, championshipId),
      parseOrThrow(createStageSchema, body),
      auth.user.id,
      ipOf(req),
    );
  }

  @RequirePermissions('fixtures:manage')
  @Post('stages/:stageId/rounds')
  createRound(
    @Param('stageId') stageId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.fixtures.createRound(
      parseOrThrow(uuidSchema, stageId),
      parseOrThrow(createRoundSchema, body),
      auth.user.id,
      ipOf(req),
    );
  }

  @RequirePermissions('fixtures:read')
  @Get('championships/:championshipId/events')
  listEvents(
    @Param('championshipId') championshipId: string,
    @Query() query: unknown,
  ) {
    return this.fixtures.listEvents(
      parseOrThrow(uuidSchema, championshipId),
      parseOrThrow(listEventsQuerySchema, query),
    );
  }

  @RequirePermissions('fixtures:read')
  @Get('events/:id')
  getEvent(@Param('id') id: string) {
    return this.fixtures.getEvent(parseOrThrow(uuidSchema, id));
  }

  @RequirePermissions('fixtures:manage')
  @Post('rounds/:roundId/events')
  createEvent(
    @Param('roundId') roundId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.fixtures.createEvent(
      parseOrThrow(uuidSchema, roundId),
      parseOrThrow(createEventSchema, body),
      auth.user.id,
      ipOf(req),
    );
  }

  @RequirePermissions('fixtures:manage')
  @Patch('events/:id/schedule')
  rescheduleEvent(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.fixtures.rescheduleEvent(
      parseOrThrow(uuidSchema, id),
      parseOrThrow(rescheduleEventSchema, body),
      auth.user.id,
      ipOf(req),
    );
  }

  @RequirePermissions('fixtures:manage')
  @Patch('events/:id/status')
  changeStatus(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.fixtures.changeStatus(
      parseOrThrow(uuidSchema, id),
      parseOrThrow(changeEventStatusSchema, body),
      auth.user.id,
      ipOf(req),
    );
  }

  @RequirePermissions('fixtures:manage')
  @Delete('events/:id')
  @HttpCode(204)
  async deleteEvent(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.fixtures.deleteEvent(
      parseOrThrow(uuidSchema, id),
      auth.user.id,
      ipOf(req),
    );
  }
}
