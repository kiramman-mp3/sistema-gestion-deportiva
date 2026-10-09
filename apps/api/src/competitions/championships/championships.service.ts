import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { SecurityHashService } from '../../auth/security-hash.service.js';
import {
  changedFields,
  escapeLike,
  type Page,
  translateDbError,
} from '../../catalogs/common.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  ChampionshipListQuery,
  CreateChampionshipInput,
  CreateRuleVersionInput,
  TransitionChampionshipInput,
  UpdateChampionshipInput,
} from './championships.schemas.js';

const DEFAULT_SPORT_RULES: Record<string, Record<string, unknown>> = {
  futbol: {
    pointsWin: 3,
    pointsDraw: 1,
    pointsLoss: 0,
    tieBreakers: ['goal_difference', 'goals_for', 'head_to_head'],
  },
  basquet: {
    pointsWin: 2,
    pointsLoss: 1,
    pointsDefault: 0,
    periods: 4,
    tieBreakers: ['points_difference', 'points_for', 'head_to_head'],
  },
  taekwondo: {
    rounds: 3,
    roundDurationSeconds: 120,
    maxPenalties: 5,
  },
  ajedrez: {
    pointsWin: 1.0,
    pointsDraw: 0.5,
    pointsLoss: 0.0,
    tieBreakers: ['buchholz', 'sonneborn_berger'],
  },
};

@Injectable()
export class ChampionshipsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hash: SecurityHashService,
  ) {}

  async list(query: ChampionshipListQuery): Promise<Page<unknown>> {
    const where: Prisma.ChampionshipWhereInput = {
      ...(query.seasonId && { seasonId: query.seasonId }),
      ...(query.sportId && { sportId: query.sportId }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.status && { status: query.status }),
      ...(query.q && {
        name: { contains: escapeLike(query.q), mode: 'insensitive' },
      }),
    };

    const [total, items] = await Promise.all([
      this.prisma.client.championship.count({ where }),
      this.prisma.client.championship.findMany({
        where,
        include: {
          season: { select: { id: true, name: true, status: true } },
          sport: { select: { id: true, code: true, name: true } },
          category: {
            select: {
              id: true,
              code: true,
              name: true,
              ageMin: true,
              ageMax: true,
            },
          },
          _count: {
            select: {
              registrations: true,
              stages: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(id: string) {
    const champ = await this.prisma.client.championship.findUnique({
      where: { id },
      include: {
        season: true,
        sport: true,
        category: true,
        ruleVersions: {
          orderBy: { version: 'desc' },
          include: {
            approvedBy: {
              select: { id: true, displayName: true, email: true },
            },
          },
        },
        _count: {
          select: {
            registrations: true,
            stages: true,
          },
        },
      },
    });
    if (!champ) throw new NotFoundException('Campeonato no encontrado');
    return champ;
  }

  async create(auth: AuthContext, ip: string, input: CreateChampionshipInput) {
    const [season, sport, category] = await Promise.all([
      this.prisma.client.season.findUnique({ where: { id: input.seasonId } }),
      this.prisma.client.sport.findUnique({ where: { id: input.sportId } }),
      this.prisma.client.category.findUnique({
        where: { id: input.categoryId },
      }),
    ]);

    if (!season) throw new NotFoundException('Temporada no encontrada');
    if (season.status === 'archivada') {
      throw new BadRequestException(
        'No se pueden crear campeonatos en temporadas archivadas',
      );
    }
    if (!sport) throw new NotFoundException('Deporte no encontrado');
    if (sport.status !== 'activo') {
      throw new BadRequestException('El deporte seleccionado no está activo');
    }
    if (!category) throw new NotFoundException('Categoría no encontrada');
    if (category.status !== 'activo') {
      throw new BadRequestException('La categoría seleccionada no está activa');
    }

    const initialRules =
      input.rules ??
      DEFAULT_SPORT_RULES[sport.code] ??
      DEFAULT_SPORT_RULES.futbol;

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const champ = await tx.championship.create({
          data: {
            seasonId: input.seasonId,
            sportId: input.sportId,
            categoryId: input.categoryId,
            name: input.name,
            format: input.format,
            registrationStart: input.registrationStart
              ? new Date(input.registrationStart)
              : null,
            registrationEnd: input.registrationEnd
              ? new Date(input.registrationEnd)
              : null,
            startDate: input.startDate ? new Date(input.startDate) : null,
            endDate: input.endDate ? new Date(input.endDate) : null,
            ruleVersions: {
              create: {
                version: 1,
                rulesJson: initialRules as Prisma.InputJsonValue,
                approvedById: auth.user.id,
                approvedAt: new Date(),
              },
            },
          },
          include: {
            season: true,
            sport: true,
            category: true,
            ruleVersions: true,
          },
        });

        await this.audit.record(
          {
            action: 'championship.created',
            entityType: 'championship',
            entityId: champ.id,
            userId: auth.user.id,
            ipHash: this.hash.hash('ip', ip),
            after: {
              name: champ.name,
              format: champ.format,
              seasonId: champ.seasonId,
              sportId: champ.sportId,
              categoryId: champ.categoryId,
            },
          },
          tx,
        );

        return champ;
      });
    } catch (error) {
      translateDbError(error, {
        unique: {
          championships_season_id_sport_id_category_id_name_key:
            'Ya existe un campeonato con ese nombre para la misma temporada, deporte y categoría',
        },
        inUse: 'El campeonato está en uso',
      });
    }
  }

  async update(
    id: string,
    auth: AuthContext,
    ip: string,
    input: UpdateChampionshipInput,
  ) {
    const current = await this.get(id);
    if (current.status === 'archivado') {
      throw new BadRequestException(
        'Los campeonatos archivados son de solo lectura',
      );
    }

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const updated = await tx.championship.update({
          where: { id },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.format !== undefined && { format: input.format }),
            ...(input.registrationStart !== undefined && {
              registrationStart: input.registrationStart
                ? new Date(input.registrationStart)
                : null,
            }),
            ...(input.registrationEnd !== undefined && {
              registrationEnd: input.registrationEnd
                ? new Date(input.registrationEnd)
                : null,
            }),
            ...(input.startDate !== undefined && {
              startDate: input.startDate ? new Date(input.startDate) : null,
            }),
            ...(input.endDate !== undefined && {
              endDate: input.endDate ? new Date(input.endDate) : null,
            }),
          },
        });

        const diff = changedFields(
          {
            name: current.name,
            format: current.format,
            registrationStart:
              current.registrationStart?.toISOString().split('T')[0] ?? null,
            registrationEnd:
              current.registrationEnd?.toISOString().split('T')[0] ?? null,
            startDate: current.startDate?.toISOString().split('T')[0] ?? null,
            endDate: current.endDate?.toISOString().split('T')[0] ?? null,
          },
          {
            name: updated.name,
            format: updated.format,
            registrationStart:
              updated.registrationStart?.toISOString().split('T')[0] ?? null,
            registrationEnd:
              updated.registrationEnd?.toISOString().split('T')[0] ?? null,
            startDate: updated.startDate?.toISOString().split('T')[0] ?? null,
            endDate: updated.endDate?.toISOString().split('T')[0] ?? null,
          },
        );

        if (diff) {
          await this.audit.record(
            {
              action: 'championship.updated',
              entityType: 'championship',
              entityId: id,
              userId: auth.user.id,
              ipHash: this.hash.hash('ip', ip),
              before: diff.before,
              after: diff.after,
            },
            tx,
          );
        }

        return updated;
      });
    } catch (error) {
      translateDbError(error, {
        unique: {
          championships_season_id_sport_id_category_id_name_key:
            'Ya existe un campeonato con ese nombre para la misma temporada, deporte y categoría',
        },
        inUse: 'El campeonato está en uso',
      });
    }
  }

  async transition(
    id: string,
    auth: AuthContext,
    ip: string,
    input: TransitionChampionshipInput,
  ) {
    const current = await this.get(id);
    if (current.status === input.status) {
      return current;
    }

    return await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.championship.update({
        where: { id },
        data: { status: input.status },
      });

      await this.audit.record(
        {
          action: 'championship.status_changed',
          entityType: 'championship',
          entityId: id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          reason: input.reason,
          before: { status: current.status },
          after: { status: updated.status },
        },
        tx,
      );

      return updated;
    });
  }

  async createRuleVersion(
    id: string,
    auth: AuthContext,
    ip: string,
    input: CreateRuleVersionInput,
  ) {
    const current = await this.get(id);
    if (current.status === 'archivado') {
      throw new BadRequestException(
        'No se pueden modificar reglas de un campeonato archivado',
      );
    }

    const latest = await this.prisma.client.competitionRuleVersion.findFirst({
      where: { championshipId: id },
      orderBy: { version: 'desc' },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    return await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.competitionRuleVersion.create({
        data: {
          championshipId: id,
          version: nextVersion,
          rulesJson: input.rules as Prisma.InputJsonValue,
          approvedById: auth.user.id,
          approvedAt: new Date(),
        },
      });

      await this.audit.record(
        {
          action: 'championship.rules_version_created',
          entityType: 'championship',
          entityId: id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          after: {
            version: nextVersion,
            rules: input.rules as unknown as Prisma.InputJsonValue,
          },
        },
        tx,
      );

      return created;
    });
  }

  async delete(id: string, auth: AuthContext, ip: string) {
    const current = await this.get(id);
    if (current.status !== 'borrador') {
      throw new BadRequestException(
        'Solo se pueden eliminar campeonatos en estado borrador',
      );
    }
    if (current._count.registrations > 0) {
      throw new BadRequestException(
        'No se puede eliminar un campeonato con inscripciones',
      );
    }

    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.championship.delete({ where: { id } });

        await this.audit.record(
          {
            action: 'championship.deleted',
            entityType: 'championship',
            entityId: id,
            userId: auth.user.id,
            ipHash: this.hash.hash('ip', ip),
            before: { name: current.name, format: current.format },
          },
          tx,
        );
      });
    } catch (error) {
      translateDbError(error, {
        unique: {},
        inUse:
          'No se puede eliminar el campeonato porque tiene etapas o registros vinculados',
      });
    }
  }
}
