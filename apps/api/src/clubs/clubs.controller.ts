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
import { ClubMembersService } from './club-members.service.js';
import {
  addRepresentativeSchema,
  clubListQuerySchema,
  clubStatusSchema,
  createClubSchema,
  updateClubSchema,
  updateRepresentativeSchema,
} from './clubs.schemas.js';
import { ClubsService } from './clubs.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

@ApiTags('clubs')
@Controller('clubs')
export class ClubsController {
  constructor(
    @Inject(ClubsService) private readonly clubs: ClubsService,
    @Inject(ClubMembersService) private readonly members: ClubMembersService,
  ) {}

  @RequirePermissions('clubs:read')
  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    return this.clubs.list(auth, parseOrThrow(clubListQuerySchema, query));
  }

  @RequirePermissions('clubs:read')
  @Get(':id')
  get(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.clubs.get(auth, parseOrThrow(uuidSchema, id));
  }

  /** Crear clubes es una función de la Liga: exige además acceso a todos los clubes. */
  @RequirePermissions('clubs:manage', 'clubs:access_all')
  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.clubs.create(
      auth,
      parseOrThrow(createClubSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('clubs:manage')
  @Patch(':id')
  update(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.clubs.update(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(updateClubSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('clubs:manage', 'clubs:access_all')
  @Patch(':id/status')
  setStatus(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { status, reason } = parseOrThrow(clubStatusSchema, body);
    return this.clubs.setStatus(
      auth,
      parseOrThrow(uuidSchema, id),
      status,
      reason,
      ipOf(req),
    );
  }

  @RequirePermissions('clubs:delete', 'clubs:access_all')
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    await this.clubs.remove(auth, parseOrThrow(uuidSchema, id), ipOf(req));
  }

  // ───────────── representantes ─────────────

  @RequirePermissions('clubs:read')
  @Get(':id/representatives')
  representatives(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.members.listRepresentatives(auth, parseOrThrow(uuidSchema, id));
  }

  @RequirePermissions('clubs:manage')
  @Post(':id/representatives')
  addRepresentative(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.members.addRepresentative(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(addRepresentativeSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('clubs:manage')
  @Patch(':id/representatives/:repId')
  updateRepresentative(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('repId') repId: string,
    @Body() body: unknown,
  ) {
    return this.members.updateRepresentative(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(uuidSchema, repId),
      parseOrThrow(updateRepresentativeSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('clubs:manage', 'clubs:access_all')
  @Delete(':id/representatives/:repId')
  @HttpCode(204)
  async removeRepresentative(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('repId') repId: string,
  ): Promise<void> {
    await this.members.removeRepresentative(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(uuidSchema, repId),
      ipOf(req),
    );
  }

  // ───────────── usuarios vinculados (alcance por club) ─────────────

  @RequirePermissions('clubs:manage')
  @Get(':id/users')
  users(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.members.listUsers(auth, parseOrThrow(uuidSchema, id));
  }

  @RequirePermissions('clubs:manage')
  @Put(':id/users/:userId')
  @HttpCode(204)
  async linkUser(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.members.linkUser(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(uuidSchema, userId),
      ipOf(req),
    );
  }

  @RequirePermissions('clubs:manage')
  @Delete(':id/users/:userId')
  @HttpCode(204)
  async unlinkUser(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.members.unlinkUser(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(uuidSchema, userId),
      ipOf(req),
    );
  }
}
