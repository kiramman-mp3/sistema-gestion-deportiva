import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { SecurityHashService } from '../../auth/security-hash.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  CatalogStatus,
  Prisma,
  Sport,
} from '../../generated/prisma/client.js';
import {
  type Page,
  changedFields,
  escapeLike,
  translateDbError,
} from '../common.js';
import type { CreateSportInput, UpdateSportInput } from './sports.schemas.js';

type Actor = Pick<AuthContext, 'user'>;

export interface SportView {
  id: string;
  code: string;
  name: string;
  status: CatalogStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ERRORS = {
  unique: {
    sports_code_key: 'Ya existe un deporte con ese código',
    sports_name_key: 'Ya existe un deporte con ese nombre',
  },
  inUse:
    'El deporte está en uso y no puede eliminarse. Desactívelo en su lugar.',
};

const toView = (s: Sport): SportView => ({
  id: s.id,
  code: s.code,
  name: s.name,
  status: s.status,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

const snapshot = (s: Sport) => ({
  code: s.code,
  name: s.name,
  status: s.status,
});

@Injectable()
export class SportsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hasher: SecurityHashService,
  ) {}

  async list(query: {
    page: number;
    pageSize: number;
    q?: string;
    status?: CatalogStatus;
  }): Promise<Page<SportView>> {
    const where: Prisma.SportWhereInput = {
      status: query.status,
      ...(query.q && {
        OR: [
          { name: { contains: escapeLike(query.q), mode: 'insensitive' } },
          { code: { contains: escapeLike(query.q), mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.sport.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.sport.count({ where }),
    ]);
    return {
      items: items.map(toView),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(id: string): Promise<SportView> {
    const sport = await this.prisma.client.sport.findUnique({ where: { id } });
    if (!sport) throw new NotFoundException('Deporte no encontrado');
    return toView(sport);
  }

  async create(
    actor: Actor,
    input: CreateSportInput,
    ip: string,
  ): Promise<SportView> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        await this.assertNameFree(tx, input.name);
        const sport = await tx.sport.create({ data: input });
        await this.record(tx, actor, ip, 'sport.create', sport.id, {
          after: snapshot(sport),
        });
        return toView(sport);
      });
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async update(
    actor: Actor,
    id: string,
    input: UpdateSportInput,
    ip: string,
  ): Promise<SportView> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const current = await this.load(tx, id);
        await this.assertNameFree(tx, input.name, id);
        const diff = changedFields(snapshot(current), {
          ...snapshot(current),
          ...input,
        });
        if (!diff) return toView(current);

        const updated = await tx.sport.update({ where: { id }, data: input });
        await this.record(tx, actor, ip, 'sport.update', id, diff);
        return toView(updated);
      });
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async setStatus(
    actor: Actor,
    id: string,
    status: CatalogStatus,
    reason: string | undefined,
    ip: string,
  ): Promise<SportView> {
    return this.prisma.client.$transaction(async (tx) => {
      const current = await this.load(tx, id);
      if (current.status === status) return toView(current);

      const updated = await tx.sport.update({
        where: { id },
        data: { status },
      });
      await this.record(
        tx,
        actor,
        ip,
        'sport.status_change',
        id,
        { before: { status: current.status }, after: { status } },
        reason,
      );
      return toView(updated);
    });
  }

  /**
   * Elimina un deporte. La base de datos impide borrar uno referenciado por
   * otras tablas (FK ON DELETE RESTRICT presentes y futuras): en ese caso 409.
   */
  async remove(actor: Actor, id: string, ip: string): Promise<void> {
    try {
      await this.prisma.client.$transaction(async (tx) => {
        const current = await this.load(tx, id);
        await tx.sport.delete({ where: { id } });
        await this.record(tx, actor, ip, 'sport.delete', id, {
          before: snapshot(current),
        });
      });
    } catch (error) {
      translateDbError(error, ERRORS);
    }
  }

  // ───────────────────────────── internos ─────────────────────────────

  private async load(tx: Prisma.TransactionClient, id: string): Promise<Sport> {
    const sport = await tx.sport.findUnique({ where: { id } });
    if (!sport) throw new NotFoundException('Deporte no encontrado');
    return sport;
  }

  /** Evita duplicados evidentes que difieran solo en mayúsculas (el índice único distingue). */
  private async assertNameFree(
    tx: Prisma.TransactionClient,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const clash = await tx.sport.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        id: { not: exceptId },
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(ERRORS.unique.sports_name_key);
  }

  private record(
    tx: Prisma.TransactionClient,
    actor: Actor,
    ip: string,
    action: string,
    entityId: string,
    change: { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue },
    reason?: string,
  ) {
    return this.audit.record(
      {
        userId: actor.user.id,
        action,
        entityType: 'sport',
        entityId,
        before: change.before,
        after: change.after,
        reason,
        ipHash: this.hasher.hash('ip', ip),
      },
      tx,
    );
  }
}
