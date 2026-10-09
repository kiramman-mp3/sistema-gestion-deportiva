import {
  BadRequestException,
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
  Prisma,
  Season,
  SeasonStatus,
} from '../../generated/prisma/client.js';
import {
  type Page,
  changedFields,
  escapeLike,
  translateDbError,
} from '../common.js';
import {
  DELETABLE_SEASON_STATUS,
  READ_ONLY_SEASON_STATUS,
  SEASON_TRANSITIONS,
  canTransition,
  fromDate,
  seasonRangeError,
  toDate,
} from './seasons.rules.js';
import type {
  CreateSeasonInput,
  UpdateSeasonInput,
} from './seasons.schemas.js';

type Actor = Pick<AuthContext, 'user'>;

export interface SeasonView {
  id: string;
  name: string;
  /** Fecha de calendario `AAAA-MM-DD`, sin zona horaria. */
  startDate: string;
  endDate: string;
  status: SeasonStatus;
  /** Estados a los que puede pasar desde el actual. */
  allowedTransitions: readonly SeasonStatus[];
  createdAt: Date;
  updatedAt: Date;
}

const ERRORS = {
  unique: { seasons_name_key: 'Ya existe una temporada con ese nombre' },
  inUse:
    'La temporada está en uso y no puede eliminarse. Finalícela o archívela en su lugar.',
};

const toView = (s: Season): SeasonView => ({
  id: s.id,
  name: s.name,
  startDate: fromDate(s.startDate),
  endDate: fromDate(s.endDate),
  status: s.status,
  allowedTransitions: SEASON_TRANSITIONS[s.status],
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

const snapshot = (s: Season) => ({
  name: s.name,
  startDate: fromDate(s.startDate),
  endDate: fromDate(s.endDate),
  status: s.status,
});

@Injectable()
export class SeasonsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hasher: SecurityHashService,
  ) {}

  async list(query: {
    page: number;
    pageSize: number;
    q?: string;
    status?: SeasonStatus;
  }): Promise<Page<SeasonView>> {
    const where: Prisma.SeasonWhereInput = {
      status: query.status,
      ...(query.q && {
        name: { contains: escapeLike(query.q), mode: 'insensitive' },
      }),
    };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.season.findMany({
        where,
        orderBy: [{ startDate: 'desc' }, { name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.season.count({ where }),
    ]);
    return {
      items: items.map(toView),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(id: string): Promise<SeasonView> {
    const season = await this.prisma.client.season.findUnique({
      where: { id },
    });
    if (!season) throw new NotFoundException('Temporada no encontrada');
    return toView(season);
  }

  /** Toda temporada nace en `borrador`. */
  async create(
    actor: Actor,
    input: CreateSeasonInput,
    ip: string,
  ): Promise<SeasonView> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        await this.assertNameFree(tx, input.name);
        const season = await tx.season.create({
          data: {
            name: input.name,
            startDate: toDate(input.startDate),
            endDate: toDate(input.endDate),
          },
        });
        await this.record(tx, actor, ip, 'season.create', season.id, {
          after: snapshot(season),
        });
        return toView(season);
      });
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async update(
    actor: Actor,
    id: string,
    input: UpdateSeasonInput,
    ip: string,
  ): Promise<SeasonView> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const current = await this.load(tx, id);
        if (current.status === READ_ONLY_SEASON_STATUS) {
          throw new ConflictException(
            'Una temporada archivada no puede modificarse',
          );
        }

        // La coherencia de fechas se valida sobre el resultado final.
        const startDate = input.startDate ?? fromDate(current.startDate);
        const endDate = input.endDate ?? fromDate(current.endDate);
        const rangeError = seasonRangeError(startDate, endDate);
        if (rangeError) {
          throw new BadRequestException({
            statusCode: 400,
            message: 'Solicitud inválida',
            errors: [{ field: 'endDate', message: rangeError }],
          });
        }
        if (input.name) await this.assertNameFree(tx, input.name, id);

        const next = {
          name: input.name ?? current.name,
          startDate,
          endDate,
          status: current.status,
        };
        const diff = changedFields(snapshot(current), next);
        if (!diff) return toView(current);

        const updated = await tx.season.update({
          where: { id },
          data: {
            name: next.name,
            startDate: toDate(startDate),
            endDate: toDate(endDate),
          },
        });
        await this.record(tx, actor, ip, 'season.update', id, diff);
        return toView(updated);
      });
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async setStatus(
    actor: Actor,
    id: string,
    status: SeasonStatus,
    reason: string,
    ip: string,
  ): Promise<SeasonView> {
    return this.prisma.client.$transaction(async (tx) => {
      const current = await this.load(tx, id);
      if (current.status === status) return toView(current);
      if (!canTransition(current.status, status)) {
        throw new ConflictException(
          `No se puede pasar de «${current.status}» a «${status}». ` +
            `Desde «${current.status}» solo se permite: ${SEASON_TRANSITIONS[current.status].join(', ')}.`,
        );
      }
      const updated = await tx.season.update({
        where: { id },
        data: { status },
      });
      await this.record(
        tx,
        actor,
        ip,
        'season.status_change',
        id,
        { before: { status: current.status }, after: { status } },
        reason,
      );
      return toView(updated);
    });
  }

  /** Solo se eliminan temporadas en borrador y sin referencias (FK RESTRICT de la BD). */
  async remove(actor: Actor, id: string, ip: string): Promise<void> {
    try {
      await this.prisma.client.$transaction(async (tx) => {
        const current = await this.load(tx, id);
        if (current.status !== DELETABLE_SEASON_STATUS) {
          throw new ConflictException(
            'Solo se pueden eliminar temporadas en borrador. Archive la temporada en su lugar.',
          );
        }
        await tx.season.delete({ where: { id } });
        await this.record(tx, actor, ip, 'season.delete', id, {
          before: snapshot(current),
        });
      });
    } catch (error) {
      translateDbError(error, ERRORS);
    }
  }

  // ───────────────────────────── internos ─────────────────────────────

  private async load(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<Season> {
    const season = await tx.season.findUnique({ where: { id } });
    if (!season) throw new NotFoundException('Temporada no encontrada');
    return season;
  }

  private async assertNameFree(
    tx: Prisma.TransactionClient,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const clash = await tx.season.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        id: { not: exceptId },
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(ERRORS.unique.seasons_name_key);
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
        entityType: 'season',
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
