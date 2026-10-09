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
import { RosterService } from './roster.service.js';
import {
  addToRosterSchema,
  createTeamSchema,
  enrollTeamSchema,
  leaveSchema,
  teamListQuerySchema,
  updateMembershipSchema,
  updateTeamSchema,
  updateTeamSeasonSchema,
} from './teams.schemas.js';
import { TeamsService } from './teams.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';
const uuid = (value: string) => parseOrThrow(uuidSchema, value);

@ApiTags('teams')
@Controller('teams')
export class TeamsController {
  constructor(
    @Inject(TeamsService) private readonly teams: TeamsService,
    @Inject(RosterService) private readonly roster: RosterService,
  ) {}

  @RequirePermissions('teams:read')
  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    return this.teams.list(auth, parseOrThrow(teamListQuerySchema, query));
  }

  @RequirePermissions('teams:read')
  @Get(':id')
  get(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.teams.get(auth, uuid(id));
  }

  @RequirePermissions('teams:manage')
  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.teams.create(
      auth,
      parseOrThrow(createTeamSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('teams:manage')
  @Patch(':id')
  update(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.teams.update(
      auth,
      uuid(id),
      parseOrThrow(updateTeamSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('teams:delete')
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    await this.teams.remove(auth, uuid(id), ipOf(req));
  }

  // ───────────── inscripción en temporadas ─────────────

  @RequirePermissions('teams:read')
  @Get(':id/seasons')
  seasons(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.teams.listSeasons(auth, uuid(id));
  }

  @RequirePermissions('teams:manage')
  @Post(':id/seasons')
  enroll(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.teams.enroll(
      auth,
      uuid(id),
      parseOrThrow(enrollTeamSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('teams:manage')
  @Patch(':id/seasons/:seasonId')
  updateSeason(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('seasonId') seasonId: string,
    @Body() body: unknown,
  ) {
    return this.teams.updateSeason(
      auth,
      uuid(id),
      uuid(seasonId),
      parseOrThrow(updateTeamSeasonSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('teams:delete')
  @Delete(':id/seasons/:seasonId')
  @HttpCode(204)
  async removeSeason(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('seasonId') seasonId: string,
  ): Promise<void> {
    await this.teams.removeSeason(auth, uuid(id), uuid(seasonId), ipOf(req));
  }

  // ───────────── plantilla ─────────────

  @RequirePermissions('teams:read')
  @Get(':id/seasons/:seasonId/roster')
  rosterOf(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('seasonId') seasonId: string,
  ) {
    return this.roster.list(auth, uuid(id), uuid(seasonId));
  }

  @RequirePermissions('teams:manage')
  @Post(':id/seasons/:seasonId/roster')
  addToRoster(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('seasonId') seasonId: string,
    @Body() body: unknown,
  ) {
    return this.roster.add(
      auth,
      uuid(id),
      uuid(seasonId),
      parseOrThrow(addToRosterSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('teams:manage')
  @Patch(':id/seasons/:seasonId/roster/:membershipId')
  updateMembership(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('seasonId') seasonId: string,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
  ) {
    return this.roster.setJersey(
      auth,
      uuid(id),
      uuid(seasonId),
      uuid(membershipId),
      parseOrThrow(updateMembershipSchema, body).jerseyNumber,
      ipOf(req),
    );
  }

  @RequirePermissions('teams:manage')
  @Post(':id/seasons/:seasonId/roster/:membershipId/leave')
  leave(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('seasonId') seasonId: string,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
  ) {
    return this.roster.leave(
      auth,
      uuid(id),
      uuid(seasonId),
      uuid(membershipId),
      parseOrThrow(leaveSchema, body).reason,
      ipOf(req),
    );
  }

  /** Anular un alta es una excepción administrativa: exige `teams:delete` y un motivo. */
  @RequirePermissions('teams:delete')
  @Delete(':id/seasons/:seasonId/roster/:membershipId')
  @HttpCode(204)
  async annul(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('seasonId') seasonId: string,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
  ): Promise<void> {
    await this.roster.annul(
      auth,
      uuid(id),
      uuid(seasonId),
      uuid(membershipId),
      parseOrThrow(leaveSchema, body).reason,
      ipOf(req),
    );
  }
}
