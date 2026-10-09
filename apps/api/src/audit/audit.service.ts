import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface AuditEntry {
  /** Actor autenticado; omitir para acciones del sistema o actores anónimos. */
  userId?: string;
  /** Operación en formato `recurso.acción`, ej. "result.approve". */
  action: string;
  entityType: string;
  entityId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
  /** Hash de la IP; nunca la IP en claro. */
  ipHash?: string;
}

/**
 * Escribe en `audit_logs`. Los registros son inmutables (trigger en la base de
 * datos). Nunca incluir contraseñas, tokens ni secretos en los snapshots.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry) {
    return this.prisma.client.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        beforeSnapshot: entry.before,
        afterSnapshot: entry.after,
        reason: entry.reason,
        ipHash: entry.ipHash,
      },
    });
  }
}
