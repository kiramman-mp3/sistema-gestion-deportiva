import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { escapeLike, listQuerySchema } from '../catalogs/common.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { sanitizeSnapshot } from './sanitize.js';

const instant = z
  .string()
  .refine(
    (v) => !Number.isNaN(Date.parse(v)),
    'Use una fecha válida (AAAA-MM-DD o ISO 8601)',
  );

export const auditQuerySchema = listQuerySchema.extend({
  /** Desde (inclusive). Una fecha sin hora se toma a las 00:00 UTC. */
  from: instant.optional(),
  /** Hasta (inclusive). Una fecha sin hora abarca todo ese día. */
  to: instant.optional(),
  /** Identificador exacto del actor. */
  userId: z.uuid().optional(),
  /** Texto contenido en el correo o el nombre del actor. */
  actor: z.string().trim().max(100).optional(),
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(100).optional(),
});

export interface AuditEntryView {
  id: string;
  createdAt: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: { id: string; email: string; displayName: string } | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}

/** `AAAA-MM-DD` como límite superior abarca el día completo (hasta el instante siguiente). */
function upperBound(value: string): Date {
  const date = new Date(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(date.getTime() + 86_400_000 - 1)
    : date;
}

/** Solo lectura. No existe ninguna operación para modificar o borrar registros. */
@Injectable()
export class AuditQueryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: z.infer<typeof auditQuerySchema>) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) createdAt.gte = new Date(query.from);
    if (query.to) createdAt.lte = upperBound(query.to);

    const where: Prisma.AuditLogWhereInput = {
      ...(Object.keys(createdAt).length > 0 && { createdAt }),
      userId: query.userId,
      action: query.action || undefined,
      entityType: query.entityType || undefined,
      entityId: query.entityId || undefined,
      ...(query.actor && {
        user: {
          OR: [
            {
              email: { contains: escapeLike(query.actor), mode: 'insensitive' },
            },
            {
              displayName: {
                contains: escapeLike(query.actor),
                mode: 'insensitive',
              },
            },
          ],
        },
      }),
    };

    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.auditLog.findMany({
        where,
        // Orden estable: el UUID v7 desempata registros del mismo instante.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          createdAt: true,
          action: true,
          entityType: true,
          entityId: true,
          reason: true,
          beforeSnapshot: true,
          afterSnapshot: true,
          user: { select: { id: true, email: true, displayName: true } },
        },
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);

    const items: AuditEntryView[] = rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actor: row.user,
      reason: row.reason,
      before: sanitizeSnapshot(row.beforeSnapshot),
      after: sanitizeSnapshot(row.afterSnapshot),
    }));
    return { items, page: query.page, pageSize: query.pageSize, total };
  }
}
