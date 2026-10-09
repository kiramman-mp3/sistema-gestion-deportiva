import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthContext, AuthedRequest } from '../auth/auth.types.js';
import { CurrentAuth, Public, RequirePermissions } from '../auth/decorators.js';
import { parseOrThrow, uuidSchema } from '../auth/schemas.js';
import { PrismaService } from '../database/prisma.service.js';
import {
  type GeneratedFile,
  type ReportFormat,
  ReportsService,
} from './reports.service.js';
import { IssuedDocumentsService } from './issued-documents.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

const formatSchema = z.object({
  format: z.enum(['pdf', 'csv']).default('pdf'),
});

const sanctionsQuerySchema = formatSchema.extend({
  status: z.enum(['vigente', 'cumplida', 'anulada']).optional(),
  championshipId: uuidSchema.optional(),
  clubId: uuidSchema.optional(),
});

const issueSchema = z.strictObject({
  kind: z.enum(['carne', 'certificado_inscripcion']),
  seasonId: uuidSchema.optional(),
});

const reasonSchema = z.strictObject({
  reason: z.string().trim().min(5, 'Indique el motivo').max(300),
});

/** Entrega un archivo generado sin dejarlo en cachés ni indexarlo. */
function send(res: Response, file: GeneratedFile): void {
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${file.filename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
  );
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.send(file.buffer);
}

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(IssuedDocumentsService)
    private readonly issued: IssuedDocumentsService,
  ) {}

  @RequirePermissions('reports:read')
  @Get('championships/:id/teams')
  async teams(
    @Param('id') id: string,
    @Query() query: unknown,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    const { format } = parseOrThrow(formatSchema, query);
    send(
      res,
      await this.reports.championshipTeams(
        parseOrThrow(uuidSchema, id),
        format,
        auth,
        ipOf(req),
      ),
    );
  }

  @RequirePermissions('reports:read')
  @Get('championships/:id/standings')
  async standings(
    @Param('id') id: string,
    @Query() query: unknown,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    const { format } = parseOrThrow(formatSchema, query);
    send(
      res,
      await this.reports.standings(
        parseOrThrow(uuidSchema, id),
        format,
        auth,
        ipOf(req),
      ),
    );
  }

  @RequirePermissions('reports:read')
  @Get('championships/:id/fixtures')
  async fixtures(
    @Param('id') id: string,
    @Query() query: unknown,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    const { format } = parseOrThrow(formatSchema, query);
    send(
      res,
      await this.reports.fixtures(
        parseOrThrow(uuidSchema, id),
        format,
        auth,
        ipOf(req),
      ),
    );
  }

  @RequirePermissions('reports:read', 'results:read')
  @Get('events/:id/scoresheet')
  async scoresheet(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    send(
      res,
      await this.reports.scoresheet(
        parseOrThrow(uuidSchema, id),
        auth,
        ipOf(req),
      ),
    );
  }

  @RequirePermissions('reports:read')
  @Get('registrations/:id/roster')
  async roster(
    @Param('id') id: string,
    @Query() query: unknown,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    const { format } = parseOrThrow(formatSchema, query);
    send(
      res,
      await this.reports.roster(
        parseOrThrow(uuidSchema, id),
        format,
        auth,
        ipOf(req),
      ),
    );
  }

  @RequirePermissions('reports:read', 'sanctions:read')
  @Get('sanctions')
  async sanctions(
    @Query() query: unknown,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    const { format, ...filters } = parseOrThrow(sanctionsQuerySchema, query);
    send(
      res,
      await this.reports.sanctionsReport(filters, format, auth, ipOf(req)),
    );
  }

  @RequirePermissions('credentials:issue')
  @Get('team-seasons/:id/credentials')
  async credentials(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    send(
      res,
      await this.issued.teamSheet(
        parseOrThrow(uuidSchema, id),
        auth,
        ipOf(req),
      ),
    );
  }
}

@ApiTags('documents')
@Controller()
export class IssuedDocumentsController {
  constructor(
    @Inject(IssuedDocumentsService)
    private readonly issued: IssuedDocumentsService,
  ) {}

  @RequirePermissions('credentials:issue')
  @Get('athletes/:id/issued-documents')
  list(@Param('id') id: string, @CurrentAuth() auth: AuthContext) {
    return this.issued.list(parseOrThrow(uuidSchema, id), auth);
  }

  @RequirePermissions('credentials:issue')
  @Post('athletes/:id/issued-documents')
  issue(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    const { kind, seasonId } = parseOrThrow(issueSchema, body);
    return this.issued.issue(
      parseOrThrow(uuidSchema, id),
      kind,
      seasonId,
      auth,
      ipOf(req),
    );
  }

  @RequirePermissions('credentials:issue')
  @Get('issued-documents/:id/pdf')
  async download(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    send(
      res,
      await this.issued.renderOne(
        parseOrThrow(uuidSchema, id),
        auth,
        ipOf(req),
      ),
    );
  }

  @RequirePermissions('credentials:revoke')
  @Post('issued-documents/:id/revoke')
  @HttpCode(200)
  revoke(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    const { reason } = parseOrThrow(reasonSchema, body);
    return this.issued.revoke(
      parseOrThrow(uuidSchema, id),
      reason,
      auth,
      ipOf(req),
    );
  }
}

/** Exportaciones y verificación de documentos para el público. */
@ApiTags('public')
@Public()
@Controller('public')
export class PublicDocumentsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(IssuedDocumentsService)
    private readonly issued: IssuedDocumentsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  private async assertPublic(championshipId: string): Promise<void> {
    const champ = await this.prisma.client.championship.findUnique({
      where: { id: championshipId },
      select: { status: true },
    });
    if (!champ || ['borrador', 'archivado'].includes(champ.status)) {
      throw new NotFoundException('Campeonato no encontrado');
    }
  }

  @Get('championships/:id/export/standings')
  async standings(
    @Param('id') id: string,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    const champId = parseOrThrow(uuidSchema, id);
    await this.assertPublic(champId);
    const { format } = parseOrThrow(formatSchema, query);
    send(
      res,
      await this.reports.standings(champId, format as ReportFormat, null, ''),
    );
  }

  @Get('championships/:id/export/fixtures')
  async fixtures(
    @Param('id') id: string,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    const champId = parseOrThrow(uuidSchema, id);
    await this.assertPublic(champId);
    const { format } = parseOrThrow(formatSchema, query);
    send(
      res,
      await this.reports.fixtures(champId, format as ReportFormat, null, ''),
    );
  }

  @Get('verify/:code')
  async verify(
    @Param('code') code: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (!/^[A-Z2-7]{16}$/.test(code)) {
      throw new NotFoundException('Documento no encontrado');
    }
    return this.issued.verify(code);
  }
}
