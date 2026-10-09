import {
  Body,
  Controller,
  Get,
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
import {
  athleteListQuerySchema,
  athleteStatusSchema,
  createAthleteSchema,
  createConsentSchema,
  eligibilitySchema,
  publicationSchema,
  revokeConsentSchema,
  updateAthleteSchema,
} from './athletes.schemas.js';
import { AthletesService } from './athletes.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

@ApiTags('athletes')
@Controller('athletes')
export class AthletesController {
  constructor(
    @Inject(AthletesService) private readonly athletes: AthletesService,
  ) {}

  @RequirePermissions('athletes:read')
  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    return this.athletes.list(
      auth,
      parseOrThrow(athleteListQuerySchema, query),
    );
  }

  @RequirePermissions('athletes:read')
  @Get(':id')
  get(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.athletes.get(auth, parseOrThrow(uuidSchema, id));
  }

  @RequirePermissions('athletes:manage')
  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.athletes.create(
      auth,
      parseOrThrow(createAthleteSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('athletes:manage')
  @Patch(':id')
  update(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.athletes.update(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(updateAthleteSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('athletes:manage')
  @Patch(':id/status')
  setStatus(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parseOrThrow(athleteStatusSchema, body);
    return this.athletes.setStatus(
      auth,
      parseOrThrow(uuidSchema, id),
      input.status,
      input.reason,
      ipOf(req),
    );
  }

  @RequirePermissions('athletes:validate')
  @Patch(':id/eligibility')
  setEligibility(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parseOrThrow(eligibilitySchema, body);
    return this.athletes.setEligibility(
      auth,
      parseOrThrow(uuidSchema, id),
      input.eligibility,
      input.reason,
      ipOf(req),
    );
  }

  @RequirePermissions('athletes:read')
  @Get(':id/consents')
  consents(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.athletes.listConsents(auth, parseOrThrow(uuidSchema, id));
  }

  @RequirePermissions('athletes:manage')
  @Post(':id/consents')
  addConsent(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.athletes.addConsent(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(createConsentSchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('athletes:manage')
  @Post(':id/consents/:consentId/revoke')
  revokeConsent(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('consentId') consentId: string,
    @Body() body: unknown,
  ) {
    return this.athletes.revokeConsent(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(uuidSchema, consentId),
      parseOrThrow(revokeConsentSchema, body).reason,
      ipOf(req),
    );
  }

  @RequirePermissions('athletes:publish')
  @Put(':id/publication')
  setPublication(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.athletes.setPublication(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(publicationSchema, body).published,
      ipOf(req),
    );
  }
}
