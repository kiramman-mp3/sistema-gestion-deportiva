import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthContext, AuthedRequest } from '../auth/auth.types.js';
import {
  AllowMultipart,
  CurrentAuth,
  Public,
  RequirePermissions,
} from '../auth/decorators.js';
import { parseOrThrow, uuidSchema } from '../auth/schemas.js';
import { listQuerySchema } from '../catalogs/common.js';
import type { UploadFilePayload } from '../documents/documents.schemas.js';
import { CasesService } from './cases.service.js';
import { ComplaintsService } from './complaints.service.js';
import {
  assignReviewerSchema,
  attachmentFormSchema,
  caseEntrySchema,
  caseListQuerySchema,
  complaintListQuerySchema,
  createCaseSchema,
  createComplaintSchema,
  createIncidentSchema,
  createSanctionSchema,
  dismissComplaintSchema,
  incidentListQuerySchema,
  publishCaseSchema,
  reasonSchema,
  resolveCaseSchema,
  sanctionListQuerySchema,
  updateCaseSchema,
} from './discipline.schemas.js';
import { IncidentsService } from './incidents.service.js';
import { SanctionsService } from './sanctions.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

@ApiTags('incidents')
@Controller()
export class IncidentsController {
  constructor(
    @Inject(IncidentsService) private readonly incidents: IncidentsService,
  ) {}

  @RequirePermissions('incidents:report')
  @Post('events/:eventId/incidents')
  report(
    @Param('eventId') eventId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.incidents.create(
      parseOrThrow(uuidSchema, eventId),
      auth,
      ipOf(req),
      parseOrThrow(createIncidentSchema, body),
    );
  }

  @RequirePermissions('incidents:read')
  @Get('incidents')
  list(@Query() query: unknown) {
    return this.incidents.list(parseOrThrow(incidentListQuerySchema, query));
  }
}

@ApiTags('complaints')
@Controller('complaints')
export class ComplaintsController {
  constructor(
    @Inject(ComplaintsService) private readonly complaints: ComplaintsService,
  ) {}

  @RequirePermissions('complaints:submit')
  @Post()
  submit(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.complaints.create(
      auth,
      ipOf(req),
      parseOrThrow(createComplaintSchema, body),
    );
  }

  @RequirePermissions('complaints:read')
  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    return this.complaints.list(
      auth,
      parseOrThrow(complaintListQuerySchema, query),
    );
  }

  @RequirePermissions('complaints:read')
  @Get(':id')
  get(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.complaints.get(parseOrThrow(uuidSchema, id), auth);
  }

  @RequirePermissions('complaints:submit')
  @AllowMultipart()
  @UseInterceptors(FileInterceptor('file'))
  @Post(':id/attachments')
  attach(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
    @UploadedFile() file: UploadFilePayload | undefined,
  ) {
    const { title } = parseOrThrow(attachmentFormSchema, body);
    return this.complaints.addAttachment(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      title,
      file,
    );
  }

  @RequirePermissions('complaints:read')
  @Get(':id/attachments/:attachmentId/file')
  async download(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentAuth() auth: AuthContext,
    @Res() res: Response,
  ) {
    const file = await this.complaints.readAttachment(
      parseOrThrow(uuidSchema, id),
      parseOrThrow(uuidSchema, attachmentId),
      auth,
    );
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.filename)}"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.buffer);
  }

  @RequirePermissions('cases:manage')
  @Post(':id/dismiss')
  @HttpCode(200)
  dismiss(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    const { reason } = parseOrThrow(dismissComplaintSchema, body);
    return this.complaints.dismiss(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      reason,
    );
  }
}

@ApiTags('cases')
@Controller('cases')
export class CasesController {
  constructor(@Inject(CasesService) private readonly cases: CasesService) {}

  @RequirePermissions('cases:read')
  @Get()
  list(@Query() query: unknown) {
    return this.cases.list(parseOrThrow(caseListQuerySchema, query));
  }

  @RequirePermissions('cases:manage')
  @Get('reviewers')
  reviewers() {
    return this.cases.reviewerCandidates();
  }

  @RequirePermissions('cases:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.cases.get(parseOrThrow(uuidSchema, id));
  }

  @RequirePermissions('cases:manage')
  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.cases.create(
      auth,
      ipOf(req),
      parseOrThrow(createCaseSchema, body),
    );
  }

  @RequirePermissions('cases:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.cases.update(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      parseOrThrow(updateCaseSchema, body),
    );
  }

  @RequirePermissions('cases:manage')
  @Post(':id/reviewer')
  @HttpCode(200)
  assign(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    const { reviewerId } = parseOrThrow(assignReviewerSchema, body);
    return this.cases.assignReviewer(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      reviewerId,
    );
  }

  @RequirePermissions('cases:manage')
  @Post(':id/entries')
  addEntry(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    const { kind, body: text } = parseOrThrow(caseEntrySchema, body);
    return this.cases.addEntry(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      kind,
      text,
    );
  }

  @RequirePermissions('cases:resolve')
  @Post(':id/resolve')
  @HttpCode(200)
  resolve(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    const { resolution } = parseOrThrow(resolveCaseSchema, body);
    return this.cases.resolve(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      resolution,
    );
  }

  @RequirePermissions('cases:resolve')
  @Post(':id/reopen')
  @HttpCode(200)
  reopen(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    const { reason } = parseOrThrow(reasonSchema, body);
    return this.cases.reopen(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      reason,
    );
  }

  @RequirePermissions('cases:resolve')
  @Post(':id/archive')
  @HttpCode(200)
  archive(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    const { reason } = parseOrThrow(reasonSchema, body);
    return this.cases.archive(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      reason,
    );
  }

  @RequirePermissions('cases:publish')
  @Post(':id/publish')
  @HttpCode(200)
  publish(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.cases.publish(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      parseOrThrow(publishCaseSchema, body),
    );
  }

  @RequirePermissions('cases:publish')
  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    const { reason } = parseOrThrow(reasonSchema, body);
    return this.cases.unpublish(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      reason,
    );
  }
}

@ApiTags('sanctions')
@Controller()
export class SanctionsController {
  constructor(
    @Inject(SanctionsService) private readonly sanctions: SanctionsService,
  ) {}

  @RequirePermissions('sanctions:read')
  @Get('sanctions')
  list(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    return this.sanctions.list(
      auth,
      parseOrThrow(sanctionListQuerySchema, query),
    );
  }

  @RequirePermissions('sanctions:read')
  @Get('sanctions/:id')
  get(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.sanctions.get(parseOrThrow(uuidSchema, id), auth);
  }

  @RequirePermissions('sanctions:read')
  @Get('events/:eventId/sanction-alerts')
  alerts(@CurrentAuth() auth: AuthContext, @Param('eventId') eventId: string) {
    return this.sanctions.alertsForEvent(
      parseOrThrow(uuidSchema, eventId),
      auth,
    );
  }

  @RequirePermissions('sanctions:manage')
  @Post('cases/:caseId/sanctions')
  create(
    @Param('caseId') caseId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.sanctions.create(
      parseOrThrow(uuidSchema, caseId),
      auth,
      ipOf(req),
      parseOrThrow(createSanctionSchema, body),
    );
  }

  @RequirePermissions('sanctions:manage')
  @Post('sanctions/:id/annul')
  @HttpCode(200)
  annul(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    const { reason } = parseOrThrow(reasonSchema, body);
    return this.sanctions.annul(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      reason,
    );
  }

  @RequirePermissions('sanctions:manage')
  @Post('sanctions/:id/fulfill')
  @HttpCode(200)
  fulfill(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.sanctions.fulfill(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
    );
  }
}

/** Resoluciones publicadas en el portal. Solo texto redactado para el público, sin nombres de personas. */
@ApiTags('public')
@Public()
@Controller('public/resolutions')
export class PublicResolutionsController {
  constructor(@Inject(CasesService) private readonly cases: CasesService) {}

  @Get()
  async list(
    @Query() query: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    return this.cases.listPublic(
      parseOrThrow(listQuerySchema.pick({ page: true, pageSize: true }), query),
    );
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    return this.cases.getPublic(parseOrThrow(uuidSchema, id));
  }
}
