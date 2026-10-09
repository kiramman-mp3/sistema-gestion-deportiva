import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators.js';
import { parseOrThrow, uuidSchema } from '../auth/schemas.js';
import { AnnouncementsService } from '../content/announcements.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { InstitutionService } from '../institution/institution.service.js';
import { PublicNamesService } from './public-names.service.js';
import { publicEventsQuerySchema } from './public.schemas.js';

/** Campeonatos visibles al público: nunca borradores ni archivados. */
const PUBLIC_CHAMPIONSHIP_STATUSES = [
  'inscripciones_abiertas',
  'inscripciones_cerradas',
  'en_curso',
  'finalizado',
] as const;

const EVENT_INCLUDE = {
  venue: { select: { id: true, name: true, address: true } },
  round: {
    include: {
      stage: {
        include: {
          championship: {
            select: {
              id: true,
              name: true,
              sport: { select: { id: true, code: true, name: true } },
              category: { select: { id: true, name: true } },
              season: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  },
  participants: {
    orderBy: { id: 'asc' as const },
    include: {
      registration: {
        include: {
          participant: {
            include: {
              team: { include: { team: { include: { club: true } } } },
              individual: { include: { athlete: { include: { club: true } } } },
            },
          },
        },
      },
    },
  },
  result: {
    include: {
      values: true,
      periodScores: { orderBy: { periodNumber: 'asc' as const } },
      taekwondoBouts: { orderBy: { roundNumber: 'asc' as const } },
      chessPairings: true,
      footballEvents: { orderBy: { minute: 'asc' as const } },
    },
  },
} satisfies Prisma.EventInclude;

type EventRow = Prisma.EventGetPayload<{ include: typeof EVENT_INCLUDE }>;

/**
 * Portal público: inicio, calendario y detalle de partido. Solo muestra lo que está publicado:
 * campeonatos que no sean borrador ni archivados y resultados aprobados.
 */
@ApiTags('public')
@Public()
@Controller('public')
export class PublicPortalController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InstitutionService)
    private readonly institution: InstitutionService,
    @Inject(AnnouncementsService)
    private readonly announcements: AnnouncementsService,
    @Inject(PublicNamesService) private readonly names: PublicNamesService,
  ) {}

  private async labelsFor(rows: EventRow[]) {
    return this.names.labels(
      rows.flatMap((e) => [
        ...e.participants.flatMap((p) =>
          p.registration.participant.individual
            ? [p.registration.participant.individual.athlete.id]
            : [],
        ),
        ...(e.result?.status === 'aprobado'
          ? e.result.footballEvents
          : []
        ).flatMap((fe) => (fe.athleteId ? [fe.athleteId] : [])),
      ]),
    );
  }

  private summary(event: EventRow, labels: Map<string, string>) {
    const champ = event.round.stage.championship;
    const approved = event.result?.status === 'aprobado' ? event.result : null;
    return {
      id: event.id,
      scheduledAt: event.scheduledAt,
      status: event.status,
      postponementReason: event.postponementReason,
      venue: event.venue
        ? { id: event.venue.id, name: event.venue.name }
        : null,
      stage: event.round.stage.name,
      round: event.round.name,
      championship: champ,
      participants: event.participants.map((ep) => {
        const p = ep.registration.participant;
        const value = approved?.values.find(
          (v) => v.eventParticipantId === ep.id,
        );
        let name = 'Por definir';
        let clubName = '';
        if (p.team) {
          name = p.team.team.name;
          clubName = p.team.team.club.name;
        } else if (p.individual) {
          name = labels.get(p.individual.athlete.id) ?? 'Deportista';
          clubName = p.individual.athlete.club.name;
        }
        return {
          id: ep.id,
          side: ep.side,
          name,
          clubName,
          score: value ? value.score : null,
          outcome: value ? value.outcome : null,
        };
      }),
      hasResult: approved !== null,
    };
  }

  private eventWhere(
    base: Prisma.EventWhereInput = {},
  ): Prisma.EventWhereInput {
    return {
      ...base,
      round: {
        stage: {
          championship: { status: { in: [...PUBLIC_CHAMPIONSHIP_STATUSES] } },
        },
      },
    };
  }

  /** Inicio del portal: datos de la Liga, últimas noticias, próximos partidos y últimos resultados. */
  @Get('home')
  async home(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    const [institution, news, upcoming, recent] = await Promise.all([
      this.institution.publicInfo(),
      this.announcements.latestPublic(3),
      this.prisma.client.event.findMany({
        where: this.eventWhere({
          scheduledAt: { gte: new Date() },
          status: { in: ['programado', 'en_curso'] },
        }),
        include: EVENT_INCLUDE,
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        take: 6,
      }),
      this.prisma.client.event.findMany({
        where: this.eventWhere({ result: { status: 'aprobado' } }),
        include: EVENT_INCLUDE,
        orderBy: [{ result: { approvedAt: 'desc' } }, { id: 'asc' }],
        take: 6,
      }),
    ]);
    const labels = await this.labelsFor([...upcoming, ...recent]);
    return {
      institution,
      news,
      upcoming: upcoming.map((e) => this.summary(e, labels)),
      recent: recent.map((e) => this.summary(e, labels)),
    };
  }

  /** Calendario general filtrable por fechas, deporte, categoría, temporada, campeonato y club. */
  @Get('events')
  async events(
    @Query() query: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const q = parseOrThrow(publicEventsQuerySchema, query);
    const championship: Prisma.ChampionshipWhereInput = {
      ...(q.sportId && { sportId: q.sportId }),
      ...(q.categoryId && { categoryId: q.categoryId }),
      ...(q.seasonId && { seasonId: q.seasonId }),
      ...(q.championshipId && { id: q.championshipId }),
    };
    const where = this.eventWhere({
      ...((q.from || q.to) && {
        scheduledAt: {
          ...(q.from && { gte: new Date(`${q.from}T00:00:00.000-05:00`) }),
          ...(q.to && { lte: new Date(`${q.to}T23:59:59.999-05:00`) }),
        },
      }),
      ...(q.status && { status: q.status }),
      ...(q.clubId && {
        participants: {
          some: {
            registration: {
              OR: [
                { participant: { team: { team: { clubId: q.clubId } } } },
                {
                  participant: {
                    individual: { athlete: { clubId: q.clubId } },
                  },
                },
              ],
            },
          },
        },
      }),
    });
    // El filtro de campeonato se combina con el de estado público.
    where.round = {
      stage: {
        championship: {
          AND: [
            { status: { in: [...PUBLIC_CHAMPIONSHIP_STATUSES] } },
            championship,
          ],
        },
      },
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.event.count({ where }),
      this.prisma.client.event.findMany({
        where,
        include: EVENT_INCLUDE,
        orderBy: [{ scheduledAt: q.order }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    const labels = await this.labelsFor(rows);
    return {
      items: rows.map((e) => this.summary(e, labels)),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  /** Detalle de un partido: participantes, escenario y, si está aprobado, el acta resumida. */
  @Get('events/:id')
  async event(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const event = await this.prisma.client.event.findFirst({
      where: this.eventWhere({ id: parseOrThrow(uuidSchema, id) }),
      include: EVENT_INCLUDE,
    });
    if (!event) throw new NotFoundException('Partido no encontrado');
    const labels = await this.labelsFor([event]);
    const approved = event.result?.status === 'aprobado' ? event.result : null;
    const byParticipant = new Map(
      event.participants.map((p) => [p.id, p.registration.participant]),
    );
    return {
      ...this.summary(event, labels),
      venue: event.venue,
      result: approved
        ? {
            approvedAt: approved.approvedAt,
            periodScores: approved.periodScores,
            taekwondoBouts: approved.taekwondoBouts,
            chessPairings: approved.chessPairings,
            footballEvents: approved.footballEvents.map((fe) => ({
              minute: fe.minute,
              eventType: fe.eventType,
              athleteName: fe.athleteId
                ? (labels.get(fe.athleteId) ?? 'Deportista')
                : null,
              team:
                byParticipant.get(fe.eventParticipantId)?.team?.team.name ??
                null,
            })),
          }
        : null,
    };
  }
}
