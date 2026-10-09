import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { SecurityHashService } from '../auth/security-hash.service.js';
import type { Page } from '../catalogs/common.js';
import { ClubAccessService } from '../clubs/club-access.service.js';
import {
  describeParticipants,
  EVENT_LABEL_INCLUDE,
} from '../competitions/event-label.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  caseCode,
  isSanctionActive,
  SANCTION_TYPE_LABELS,
  todayDate,
} from './discipline.helpers.js';
import type {
  CreateSanctionInput,
  SanctionListQuery,
} from './discipline.schemas.js';

const SANCTION_INCLUDE = {
  case: { select: { id: true, caseNumber: true, status: true } },
  athlete: {
    include: { person: { select: { firstName: true, lastName: true } } },
  },
  team: { select: { id: true, name: true, clubId: true } },
  club: { select: { id: true, name: true } },
  championship: { select: { id: true, name: true } },
} satisfies Prisma.SanctionInclude;

type SanctionRow = Prisma.SanctionGetPayload<{
  include: typeof SANCTION_INCLUDE;
}>;

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

@Injectable()
export class SanctionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hash: SecurityHashService,
    @Inject(ClubAccessService) private readonly clubAccess: ClubAccessService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  view(row: SanctionRow) {
    return {
      id: row.id,
      case: {
        id: row.case.id,
        code: caseCode(row.case.caseNumber),
      },
      type: row.type,
      typeLabel: SANCTION_TYPE_LABELS[row.type] ?? row.type,
      reason: row.reason,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      matchesCount: row.matchesCount,
      points: row.points,
      status: row.status,
      statusReason: row.statusReason,
      isActive: isSanctionActive(row),
      athlete: row.athlete
        ? {
            id: row.athlete.id,
            name: `${row.athlete.person.firstName} ${row.athlete.person.lastName}`,
          }
        : null,
      team: row.team ? { id: row.team.id, name: row.team.name } : null,
      club: row.club,
      championship: row.championship,
    };
  }

  /** Clubes del sujeto de la sanción, para aplicar el alcance por club. */
  private subjectClubIds(row: {
    clubId: string | null;
    athlete: { clubId: string } | null;
    team: { clubId: string } | null;
  }): string[] {
    return [row.clubId, row.athlete?.clubId, row.team?.clubId].filter(
      (id): id is string => !!id,
    );
  }

  private async assertVisible(row: SanctionRow, auth: AuthContext) {
    if (this.clubAccess.hasGlobalAccess(auth)) return;
    for (const clubId of this.subjectClubIds({
      clubId: row.clubId,
      athlete: row.athlete,
      team: row.team,
    })) {
      if (await this.clubAccess.canAccess(auth, clubId)) return;
    }
    throw new NotFoundException('Sanción no encontrada');
  }

  /** Filtro Prisma que limita las sanciones a los clubes del actor (todas con acceso global). */
  private async scopeWhere(
    auth: AuthContext,
  ): Promise<Prisma.SanctionWhereInput> {
    const scope = await this.clubAccess.scope(auth);
    if (scope === 'all') return {};
    return {
      OR: [
        { clubId: { in: scope } },
        { athlete: { clubId: { in: scope } } },
        { team: { clubId: { in: scope } } },
      ],
    };
  }

  // ───────────────────── Consulta ─────────────────────

  async list(
    auth: AuthContext,
    query: SanctionListQuery,
  ): Promise<Page<ReturnType<SanctionsService['view']>>> {
    const today = todayDate();
    const filters: Prisma.SanctionWhereInput[] = [await this.scopeWhere(auth)];
    if (query.status) filters.push({ status: query.status });
    if (query.athleteId) filters.push({ athleteId: query.athleteId });
    if (query.teamId) filters.push({ teamId: query.teamId });
    if (query.clubId) filters.push({ clubId: query.clubId });
    if (query.championshipId) {
      filters.push({ championshipId: query.championshipId });
    }
    if (query.caseId) filters.push({ caseId: query.caseId });
    if (query.active !== undefined) {
      const active: Prisma.SanctionWhereInput = {
        status: 'vigente',
        startsAt: { lte: today },
        OR: [{ endsAt: null }, { endsAt: { gte: today } }],
      };
      filters.push(query.active ? active : { NOT: active });
    }
    const where: Prisma.SanctionWhereInput = { AND: filters };
    const [total, rows] = await Promise.all([
      this.prisma.client.sanction.count({ where }),
      this.prisma.client.sanction.findMany({
        where,
        include: SANCTION_INCLUDE,
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((r) => this.view(r)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /**
   * Sanciones vigentes que afectan a los participantes de un partido (para avisar al registrar el
   * acta). Es informativo: el sistema no impide jugar, lo decide la autoridad.
   */
  async alertsForEvent(eventId: string, auth: AuthContext) {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      include: {
        ...EVENT_LABEL_INCLUDE,
        round: { include: { stage: { include: { championship: true } } } },
      },
    });
    if (!event) throw new NotFoundException('Partido no encontrado');
    const participants = describeParticipants(event);
    const championship = event.round.stage.championship;
    const date = todayDate(event.scheduledAt ?? new Date());

    // Plantilla de la temporada de cada equipo que juega.
    const roster =
      participants.teamIds.length > 0
        ? await this.prisma.client.teamMembership.findMany({
            where: {
              status: 'activo',
              seasonId: championship.seasonId,
              teamSeason: { teamId: { in: participants.teamIds } },
            },
            select: { athleteId: true },
          })
        : [];
    const athleteIds = [
      ...new Set([
        ...participants.athleteIds,
        ...roster.map((r) => r.athleteId),
      ]),
    ];

    const rows = await this.prisma.client.sanction.findMany({
      where: {
        AND: [
          await this.scopeWhere(auth),
          { status: 'vigente', startsAt: { lte: date } },
          { OR: [{ endsAt: null }, { endsAt: { gte: date } }] },
          {
            OR: [{ championshipId: null }, { championshipId: championship.id }],
          },
          {
            OR: [
              { athleteId: { in: athleteIds } },
              { teamId: { in: participants.teamIds } },
              { clubId: { in: participants.clubIds } },
            ],
          },
        ],
      },
      include: SANCTION_INCLUDE,
      orderBy: { startsAt: 'asc' },
    });
    return rows.map((r) => this.view(r));
  }

  // ───────────────────── Registro y cambios ─────────────────────

  async create(
    caseId: string,
    auth: AuthContext,
    ip: string,
    input: CreateSanctionInput,
  ) {
    const found = await this.prisma.client.disciplinaryCase.findUnique({
      where: { id: caseId },
      select: { id: true, status: true, caseNumber: true },
    });
    if (!found) throw new NotFoundException('Expediente no encontrado');
    if (!['en_revision', 'resuelto'].includes(found.status)) {
      throw new ConflictException(
        'Solo se registran sanciones en un expediente en revisión o resuelto',
      );
    }

    // Coherencia entre sujeto, club y alcance.
    const [athlete, team, club, championship] = await Promise.all([
      input.athleteId
        ? this.prisma.client.athlete.findUnique({
            where: { id: input.athleteId },
            include: {
              person: { select: { firstName: true, lastName: true } },
            },
          })
        : null,
      input.teamId
        ? this.prisma.client.team.findUnique({ where: { id: input.teamId } })
        : null,
      input.clubId
        ? this.prisma.client.club.findUnique({ where: { id: input.clubId } })
        : null,
      input.championshipId
        ? this.prisma.client.championship.findUnique({
            where: { id: input.championshipId },
          })
        : null,
    ]);
    if (!input.athleteId && !input.teamId && !input.clubId) {
      throw new BadRequestException(
        'La sanción debe indicar un deportista, un equipo o un club',
      );
    }
    if (input.athleteId && !athlete) {
      throw new NotFoundException('Deportista no encontrado');
    }
    if (input.teamId && !team)
      throw new NotFoundException('Equipo no encontrado');
    if (input.clubId && !club)
      throw new NotFoundException('Club no encontrado');
    if (input.championshipId && !championship) {
      throw new NotFoundException('Campeonato no encontrado');
    }
    if (athlete && club && athlete.clubId !== club.id) {
      throw new BadRequestException(
        'El deportista no pertenece al club indicado',
      );
    }
    if (team && club && team.clubId !== club.id) {
      throw new BadRequestException('El equipo no pertenece al club indicado');
    }
    if (athlete && team && athlete.clubId !== team.clubId) {
      throw new BadRequestException(
        'El deportista no pertenece al club del equipo indicado',
      );
    }
    if (team && championship && team.sportId !== championship.sportId) {
      throw new BadRequestException(
        'El deporte del equipo no coincide con el del campeonato',
      );
    }

    // Reglas propias de cada tipo.
    if (input.type === 'suspension_partidos') {
      if (!input.matchesCount) {
        throw new BadRequestException(
          'Indique el número de partidos de la suspensión',
        );
      }
    } else if (input.matchesCount) {
      throw new BadRequestException(
        'El número de partidos solo aplica a la suspensión por partidos',
      );
    }
    if (input.type === 'suspension_temporal' && !input.endsAt) {
      throw new BadRequestException(
        'La suspensión temporal necesita fecha final',
      );
    }
    if (input.endsAt && input.endsAt < input.startsAt) {
      throw new BadRequestException(
        'La fecha final no puede ser anterior a la inicial',
      );
    }
    if (input.type === 'descuento_puntos') {
      if (!input.points || !team || !championship) {
        throw new BadRequestException(
          'El descuento de puntos exige equipo, campeonato y número de puntos',
        );
      }
      const registered = await this.prisma.client.registration.count({
        where: {
          championshipId: championship.id,
          participant: { team: { teamId: team.id } },
        },
      });
      if (registered === 0) {
        throw new BadRequestException(
          'El equipo no está inscrito en ese campeonato',
        );
      }
    } else if (input.points) {
      throw new BadRequestException(
        'Los puntos solo aplican al descuento de puntos',
      );
    }

    return this.prisma.client.$transaction(async (tx) => {
      const sanction = await tx.sanction.create({
        data: {
          caseId,
          athleteId: input.athleteId ?? null,
          teamId: input.teamId ?? null,
          clubId: input.clubId ?? null,
          championshipId: input.championshipId ?? null,
          type: input.type,
          reason: input.reason,
          startsAt: day(input.startsAt),
          endsAt: input.endsAt ? day(input.endsAt) : null,
          matchesCount: input.matchesCount ?? null,
          points: input.points ?? null,
          createdById: auth.user.id,
        },
        include: SANCTION_INCLUDE,
      });
      const subject = athlete
        ? `${athlete.person.firstName} ${athlete.person.lastName}`
        : team
          ? `equipo ${team.name}`
          : `club ${club!.name}`;
      await tx.caseEntry.create({
        data: {
          caseId,
          kind: 'decision',
          body: `Sanción registrada: ${SANCTION_TYPE_LABELS[input.type]} a ${subject}`,
          authorId: auth.user.id,
        },
      });
      await this.audit.record(
        {
          action: 'sanction.created',
          entityType: 'sanction',
          entityId: sanction.id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          after: {
            caseId,
            type: input.type,
            athleteId: input.athleteId ?? null,
            teamId: input.teamId ?? null,
            clubId: input.clubId ?? null,
            championshipId: input.championshipId ?? null,
            startsAt: input.startsAt,
            endsAt: input.endsAt ?? null,
          },
        },
        tx,
      );

      // Aviso a los usuarios de los clubes afectados (el detalle solo se ve en el sistema).
      const clubIds = this.subjectClubIds({
        clubId: sanction.clubId,
        athlete: athlete ? { clubId: athlete.clubId } : null,
        team: team ? { clubId: team.clubId } : null,
      });
      await this.notifications.notify(tx, {
        userIds: await this.notifications.clubUserIds(tx, clubIds),
        template: 'sanction.registered',
        params: {
          type: SANCTION_TYPE_LABELS[input.type] ?? input.type,
          subject,
          code: caseCode(found.caseNumber),
        },
        entityType: 'sanction',
        entityId: sanction.id,
        link: '#/disciplina',
        excludeUserId: auth.user.id,
      });
      return this.view(sanction);
    });
  }

  private async transition(
    id: string,
    auth: AuthContext,
    ip: string,
    to: 'cumplida' | 'anulada',
    reason: string | null,
  ) {
    const current = await this.prisma.client.sanction.findUnique({
      where: { id },
      include: SANCTION_INCLUDE,
    });
    if (!current) throw new NotFoundException('Sanción no encontrada');
    if (current.status !== 'vigente') {
      throw new ConflictException(`La sanción ya está ${current.status}`);
    }
    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.sanction.update({
        where: { id },
        data: { status: to, statusReason: reason },
        include: SANCTION_INCLUDE,
      });
      await tx.caseEntry.create({
        data: {
          caseId: current.caseId,
          kind: 'nota',
          body:
            to === 'anulada'
              ? `Sanción anulada (${SANCTION_TYPE_LABELS[current.type]}): ${reason}`
              : `Sanción cumplida (${SANCTION_TYPE_LABELS[current.type]})`,
          authorId: auth.user.id,
        },
      });
      await this.audit.record(
        {
          action: to === 'anulada' ? 'sanction.annulled' : 'sanction.fulfilled',
          entityType: 'sanction',
          entityId: id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          before: { status: current.status },
          after: { status: to },
          reason: reason ?? undefined,
        },
        tx,
      );
      return this.view(updated);
    });
  }

  annul(id: string, auth: AuthContext, ip: string, reason: string) {
    return this.transition(id, auth, ip, 'anulada', reason);
  }

  fulfill(id: string, auth: AuthContext, ip: string) {
    return this.transition(id, auth, ip, 'cumplida', null);
  }

  async get(id: string, auth: AuthContext) {
    const row = await this.prisma.client.sanction.findUnique({
      where: { id },
      include: SANCTION_INCLUDE,
    });
    if (!row) throw new NotFoundException('Sanción no encontrada');
    await this.assertVisible(row, auth);
    return this.view(row);
  }
}
