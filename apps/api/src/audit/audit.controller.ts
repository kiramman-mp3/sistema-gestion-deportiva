import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators.js';
import { parseOrThrow } from '../auth/schemas.js';
import { AuditQueryService, auditQuerySchema } from './audit-query.service.js';

/** Consulta de auditoría: únicamente lectura, y solo con el permiso `audit:read`. */
@ApiTags('audit')
@Controller('audit-logs')
export class AuditController {
  constructor(
    @Inject(AuditQueryService) private readonly query: AuditQueryService,
  ) {}

  @RequirePermissions('audit:read')
  @Get()
  list(@Query() query: unknown) {
    return this.query.list(parseOrThrow(auditQuerySchema, query));
  }
}
