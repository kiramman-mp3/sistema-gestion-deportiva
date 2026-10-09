import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthContext, AuthedRequest } from '../../auth/auth.types.js';
import {
  Authenticated,
  CurrentAuth,
  RequirePermissions,
} from '../../auth/decorators.js';
import { parseOrThrow, uuidSchema } from '../../auth/schemas.js';
import {
  approveResultSchema,
  saveResultDraftSchema,
} from './results.schemas.js';
import { ResultsService } from './results.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

@ApiTags('results')
@Controller()
export class ResultsController {
  constructor(
    @Inject(ResultsService)
    private readonly results: ResultsService,
  ) {}

  @RequirePermissions('results:read')
  @Get('events/:eventId/result')
  getResult(@Param('eventId') eventId: string) {
    return this.results.getResult(parseOrThrow(uuidSchema, eventId));
  }

  // Acceso: `results:manage`, o `results:manage_assigned` en los partidos designados
  // (se comprueba en `assertCanWrite`; sin sesión o sin ninguno de los dos, 401/403).
  @Authenticated()
  @Put('events/:eventId/result')
  async saveDraft(
    @Param('eventId') eventId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    await this.results.assertCanWrite(auth, parseOrThrow(uuidSchema, eventId));
    return this.results.saveDraft(
      parseOrThrow(uuidSchema, eventId),
      parseOrThrow(saveResultDraftSchema, body),
      auth.user.id,
      ipOf(req),
    );
  }

  @Authenticated()
  @Post('events/:eventId/result/submit')
  async submitForReview(
    @Param('eventId') eventId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.results.assertCanWrite(auth, parseOrThrow(uuidSchema, eventId));
    return this.results.submitForReview(
      parseOrThrow(uuidSchema, eventId),
      auth.user.id,
      ipOf(req),
    );
  }

  @RequirePermissions('results:approve')
  @Post('events/:eventId/result/approve')
  approveResult(
    @Param('eventId') eventId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.results.approveResult(
      parseOrThrow(uuidSchema, eventId),
      parseOrThrow(approveResultSchema, body),
      auth.user.id,
      ipOf(req),
    );
  }

  @RequirePermissions('results:read')
  @Get('championships/:championshipId/standings')
  getStandings(@Param('championshipId') championshipId: string) {
    return this.results.calculateStandings(
      parseOrThrow(uuidSchema, championshipId),
    );
  }
}
