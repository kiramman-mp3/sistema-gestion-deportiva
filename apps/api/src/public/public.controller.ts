import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { athleteCode, AthletesService } from '../athletes/athletes.service.js';
import { Public } from '../auth/decorators.js';
import { parseOrThrow, uuidSchema } from '../auth/schemas.js';
import { escapeLike, listQuerySchema } from '../catalogs/common.js';
import { ResultsService } from '../competitions/results/results.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { InstitutionService } from '../institution/institution.service.js';
import { PublicNamesService } from './public-names.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import type { ChampionshipStatus, Prisma } from '../generated/prisma/client.js';
import { publicChampionshipsQuerySchema } from './public.schemas.js';

/**
 * Información PÚBLICA, sin sesión. Solo expone campos aprobados para publicación:
 * jamás datos de contacto, documentos, fechas de nacimiento ni datos de menores
 * sin consentimiento. Cada ruta nueva aquí debe revisarse con esa regla.
 */
@ApiTags('public')
@Public()
@Controller('public')
export class PublicController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AthletesService) private readonly athletes: AthletesService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(ResultsService) private readonly results: ResultsService,
    @Inject(InstitutionService)
    private readonly institution: InstitutionService,
    @Inject(PublicNamesService) private readonly names: PublicNamesService,
  ) {}

  /** Clubes activos: nombre, nombre corto, identificador y sector. */
  @Get('clubs')
  async clubs(@Query() query: unknown) {
    await this.institution.assertPublished('publicClubs');
    const { page, pageSize } = parseOrThrow(listQuerySchema, query);
    const where = { status: 'activo' as const };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.club.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { name: true, shortName: true, slug: true, sector: true },
      }),
      this.prisma.client.club.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  @Get('clubs/:slug')
  async club(@Param('slug') slug: string) {
    await this.institution.assertPublished('publicClubs');
    const club = await this.prisma.client.club.findFirst({
      where: { slug, status: 'activo' },
      select: { name: true, shortName: true, slug: true, sector: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
    return club;
  }

  /**
   * Perfil resumido de un deportista: solo nombre para mostrar y club, y únicamente si
   * está publicado con consentimiento vigente. Sin indexación en buscadores.
   */
  @Get('athletes/:id')
  async athlete(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.institution.assertPublished('publicAthletes');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    return this.athletes.publicProfile(parseOrThrow(uuidSchema, id));
  }

  /**
   * Fotografía pública de un deportista: solo si el perfil está publicado y
   * existe consentimiento vigente de publicación de fotografía.
   */
  @Get('athletes/:id/photo')
  async athletePhoto(@Param('id') id: string, @Res() res: Response) {
    await this.institution.assertPublished('publicAthletes');
    const athleteId = parseOrThrow(uuidSchema, id);
    const result = await this.documents.getPublicPhoto(athleteId);
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(result.buffer);
  }

  /**
   * Lista pública de campeonatos en curso, finalizados o con inscripciones abiertas.
   * No se publican campeonatos en borrador ni archivados.
   */
  @Get('championships')
  async championships(@Query() query: unknown) {
    const parsed = parseOrThrow(publicChampionshipsQuerySchema, query);
    const allowedStatuses: ChampionshipStatus[] = parsed.status
      ? [parsed.status as ChampionshipStatus]
      : [
          'en_curso',
          'finalizado',
          'inscripciones_cerradas',
          'inscripciones_abiertas',
        ];

    const where: Prisma.ChampionshipWhereInput = {
      status: { in: allowedStatuses },
      ...(parsed.sportId && { sportId: parsed.sportId }),
      ...(parsed.seasonId && { seasonId: parsed.seasonId }),
      ...(parsed.categoryId && { categoryId: parsed.categoryId }),
      ...(parsed.q && {
        name: { contains: escapeLike(parsed.q), mode: 'insensitive' },
      }),
    };

    const [total, items] = await Promise.all([
      this.prisma.client.championship.count({ where }),
      this.prisma.client.championship.findMany({
        where,
        skip: (parsed.page - 1) * parsed.pageSize,
        take: parsed.pageSize,
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          name: true,
          format: true,
          status: true,
          startDate: true,
          endDate: true,
          season: { select: { id: true, name: true } },
          sport: { select: { id: true, code: true, name: true } },
          category: { select: { id: true, code: true, name: true } },
          _count: { select: { registrations: true } },
        },
      }),
    ]);

    return { items, page: parsed.page, pageSize: parsed.pageSize, total };
  }

  /** Detalle público de un campeonato y sus reglas oficiales activas. */
  @Get('championships/:id')
  async championship(@Param('id') id: string) {
    const champId = parseOrThrow(uuidSchema, id);
    const champ = await this.prisma.client.championship.findUnique({
      where: { id: champId },
      include: {
        season: { select: { id: true, name: true } },
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
        ruleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { version: true, rulesJson: true },
        },
        _count: { select: { registrations: true } },
      },
    });

    if (!champ || champ.status === 'borrador') {
      throw new NotFoundException('Campeonato no encontrado');
    }

    return champ;
  }

  /** Calendario oficial de encuentros de un campeonato con resultados aprobados. */
  @Get('championships/:id/fixtures')
  async championshipFixtures(@Param('id') id: string) {
    const champId = parseOrThrow(uuidSchema, id);
    const champ = await this.prisma.client.championship.findUnique({
      where: { id: champId },
      select: { id: true, status: true },
    });

    if (!champ || champ.status === 'borrador') {
      throw new NotFoundException('Campeonato no encontrado');
    }

    const stages = await this.prisma.client.stage.findMany({
      where: { championshipId: champId },
      orderBy: { sequence: 'asc' },
      include: {
        rounds: {
          orderBy: { roundNumber: 'asc' },
          include: {
            events: {
              orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
              include: {
                venue: { select: { id: true, name: true } },
                participants: {
                  include: {
                    registration: {
                      include: {
                        participant: {
                          include: {
                            team: {
                              include: { team: { include: { club: true } } },
                            },
                            individual: {
                              include: {
                                athlete: {
                                  include: { person: true, club: true },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                result: {
                  include: {
                    values: true,
                    periodScores: { orderBy: { periodNumber: 'asc' } },
                    taekwondoBouts: { orderBy: { roundNumber: 'asc' } },
                    chessPairings: true,
                    footballEvents: {
                      orderBy: { minute: 'asc' },
                      include: {
                        athlete: {
                          include: {
                            person: {
                              select: { firstName: true, lastName: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Los menores sin consentimiento de publicación no se nombran (ver PublicNamesService).
    const athleteIds = stages.flatMap((st) =>
      st.rounds.flatMap((r) =>
        r.events.flatMap((e) => [
          ...e.participants.flatMap((ep) =>
            ep.registration.participant.individual
              ? [ep.registration.participant.individual.athlete.id]
              : [],
          ),
          ...(e.result?.footballEvents ?? []).flatMap((fe) =>
            fe.athlete ? [fe.athlete.id] : [],
          ),
        ]),
      ),
    );
    const labels = await this.names.labels(athleteIds);

    return stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      stageType: stage.stageType,
      sequence: stage.sequence,
      rounds: stage.rounds.map((round) => ({
        id: round.id,
        name: round.name,
        roundNumber: round.roundNumber,
        events: round.events.map((event) => {
          const isApproved = event.result?.status === 'aprobado';
          return {
            id: event.id,
            scheduledAt: event.scheduledAt,
            status: event.status,
            postponementReason: event.postponementReason,
            venue: event.venue
              ? { id: event.venue.id, name: event.venue.name }
              : null,
            participants: event.participants.map((ep) => {
              let name = 'Por definir';
              let clubName = '';
              if (
                ep.registration.participant.kind === 'equipo' &&
                ep.registration.participant.team
              ) {
                name = ep.registration.participant.team.team.name;
                clubName = ep.registration.participant.team.team.club.name;
              } else if (
                ep.registration.participant.kind === 'individual' &&
                ep.registration.participant.individual
              ) {
                const ind = ep.registration.participant.individual;
                name = labels.get(ind.athlete.id) ?? 'Deportista';
                clubName = ind.athlete.club.name;
              }

              const resultVal = isApproved
                ? event.result?.values.find(
                    (v) => v.eventParticipantId === ep.id,
                  )
                : null;

              return {
                id: ep.id,
                side: ep.side,
                seed: ep.seed,
                name,
                clubName,
                score: resultVal ? resultVal.score : null,
                outcome: resultVal ? resultVal.outcome : null,
              };
            }),
            result:
              isApproved && event.result
                ? {
                    status: event.result.status,
                    periodScores: event.result.periodScores,
                    taekwondoBouts: event.result.taekwondoBouts,
                    chessPairings: event.result.chessPairings,
                    footballEvents: event.result.footballEvents.map((fe) => ({
                      id: fe.id,
                      eventType: fe.eventType,
                      minute: fe.minute,
                      athleteName: fe.athlete
                        ? (labels.get(fe.athlete.id) ?? 'Deportista')
                        : null,
                      notes: fe.notes,
                    })),
                  }
                : null,
          };
        }),
      })),
    }));
  }

  /** Tabla oficial de posiciones de un campeonato. */
  @Get('championships/:id/standings')
  async championshipStandings(@Param('id') id: string) {
    const champId = parseOrThrow(uuidSchema, id);
    const champ = await this.prisma.client.championship.findUnique({
      where: { id: champId },
      include: {
        sport: { select: { id: true, code: true, name: true } },
        category: { select: { id: true, code: true, name: true } },
        season: { select: { id: true, name: true } },
      },
    });

    if (!champ || champ.status === 'borrador') {
      throw new NotFoundException('Campeonato no encontrado');
    }

    const calculated = await this.results.calculateStandings(champId);
    const labels = await this.names.labels(
      calculated.standings.flatMap((row) =>
        row.athleteId ? [row.athleteId] : [],
      ),
    );
    return {
      championship: champ,
      rules: calculated.rules,
      standings: calculated.standings.map(({ athleteId, ...row }) => ({
        ...row,
        name: athleteId ? (labels.get(athleteId) ?? row.name) : row.name,
      })),
    };
  }

  /** Acta oficial de encuentro imprimible con membrete de la Liga Cantonal de Quero. */
  @Get('events/:id/scoresheet')
  async eventScoresheet(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    const eventId = parseOrThrow(uuidSchema, id);
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      include: {
        venue: true,
        round: {
          include: {
            stage: {
              include: {
                championship: {
                  include: {
                    sport: true,
                    category: true,
                    season: true,
                  },
                },
              },
            },
          },
        },
        participants: {
          include: {
            registration: {
              include: {
                participant: {
                  include: {
                    team: { include: { team: { include: { club: true } } } },
                    individual: {
                      include: {
                        athlete: {
                          include: {
                            person: {
                              select: { firstName: true, lastName: true },
                            },
                            club: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        result: {
          include: {
            values: true,
            periodScores: { orderBy: { periodNumber: 'asc' } },
            taekwondoBouts: { orderBy: { roundNumber: 'asc' } },
            chessPairings: true,
            footballEvents: {
              orderBy: { minute: 'asc' },
              include: {
                athlete: {
                  include: {
                    person: { select: { firstName: true, lastName: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!event || event.round.stage.championship.status === 'borrador') {
      throw new NotFoundException('Encuentro no encontrado');
    }

    const champ = event.round.stage.championship;
    const header = await this.institution.documentHeader();

    const participantsWithRoster = await Promise.all(
      event.participants.map(async (ep) => {
        let name = 'Desconocido';
        let clubName = '';
        let roster: Array<{
          jerseyNumber: number | null;
          code: string;
          name: string;
        }> = [];

        if (
          ep.registration.participant.kind === 'equipo' &&
          ep.registration.participant.team
        ) {
          const t = ep.registration.participant.team.team;
          name = t.name;
          clubName = t.club.name;

          const teamSeason = await this.prisma.client.teamSeason.findUnique({
            where: {
              teamId_seasonId: {
                teamId: t.id,
                seasonId: champ.seasonId,
              },
            },
            include: {
              memberships: {
                where: { status: 'activo' },
                include: {
                  athlete: {
                    include: {
                      person: { select: { firstName: true, lastName: true } },
                    },
                  },
                },
                orderBy: [{ jerseyNumber: 'asc' }, { id: 'asc' }],
              },
            },
          });

          if (teamSeason) {
            const labels = await this.names.labels(
              teamSeason.memberships.map((m) => m.athlete.id),
            );
            roster = teamSeason.memberships.map((m) => ({
              jerseyNumber: m.jerseyNumber,
              code: athleteCode(m.athlete.codeNumber),
              name: labels.get(m.athlete.id) ?? 'Deportista',
            }));
          }
        } else if (
          ep.registration.participant.kind === 'individual' &&
          ep.registration.participant.individual
        ) {
          const ind = ep.registration.participant.individual;
          name =
            (await this.names.labels([ind.athlete.id])).get(ind.athlete.id) ??
            'Deportista';
          clubName = ind.athlete.club.name;
          roster = [
            {
              jerseyNumber: null,
              code: athleteCode(ind.athlete.codeNumber),
              name,
            },
          ];
        }

        const scoreVal =
          event.result?.status === 'aprobado'
            ? event.result.values.find((v) => v.eventParticipantId === ep.id)
            : null;

        return {
          id: ep.id,
          side: ep.side,
          name,
          clubName,
          score: scoreVal ? scoreVal.score : null,
          outcome: scoreVal ? scoreVal.outcome : null,
          roster,
        };
      }),
    );

    const eventLabels = await this.names.labels(
      (event.result?.footballEvents ?? []).flatMap((fe) =>
        fe.athlete ? [fe.athlete.id] : [],
      ),
    );

    return {
      documentMetadata: {
        title: 'ACTA OFICIAL DE ENCUENTRO',
        institution: header.institution,
        affiliation: header.affiliation,
        canton: header.canton,
        footer: header.footer,
        generatedAt: new Date().toISOString(),
      },
      championship: {
        id: champ.id,
        name: champ.name,
        sport: champ.sport.name,
        sportCode: champ.sport.code,
        category: champ.category.name,
        season: champ.season.name,
      },
      stage: event.round.stage.name,
      round: event.round.name,
      venue: event.venue ? event.venue.name : 'Por confirmar',
      venueAddress: event.venue?.address ?? '',
      scheduledAt: event.scheduledAt,
      status: event.status,
      participants: participantsWithRoster,
      result:
        event.result?.status === 'aprobado'
          ? {
              status: event.result.status,
              approvedAt: event.result.approvedAt,
              approvalNotes: event.result.approvalNotes,
              periodScores: event.result.periodScores,
              taekwondoBouts: event.result.taekwondoBouts,
              chessPairings: event.result.chessPairings,
              footballEvents: event.result.footballEvents.map((fe) => ({
                minute: fe.minute,
                eventType: fe.eventType,
                athleteName: fe.athlete
                  ? (eventLabels.get(fe.athlete.id) ?? 'Jugador')
                  : 'Jugador',
                notes: fe.notes,
              })),
            }
          : null,
      signatories: [
        {
          label: 'Juez Central / Árbitro',
          name: '____________________________',
        },
        {
          label: 'Asistente 1 / Cronometrista',
          name: '____________________________',
        },
        {
          label: 'Asistente 2 / Juez de Mesa',
          name: '____________________________',
        },
        {
          label: 'Vocal de Turno (Comisión)',
          name: '____________________________',
        },
        {
          label: 'Delegado / Capitán Local',
          name: '____________________________',
        },
        {
          label: 'Delegado / Capitán Visitante',
          name: '____________________________',
        },
      ],
    };
  }

  /** Nómina de Buena Fe institucional imprimible para un participante/equipo inscrito. */
  @Get('registrations/:id/roster')
  async registrationRoster(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    const registrationId = parseOrThrow(uuidSchema, id);
    const reg = await this.prisma.client.registration.findUnique({
      where: { id: registrationId },
      include: {
        championship: {
          include: {
            sport: true,
            category: true,
            season: true,
          },
        },
        participant: {
          include: {
            team: {
              include: {
                team: {
                  include: { club: true },
                },
              },
            },
            individual: {
              include: {
                athlete: {
                  include: {
                    person: { select: { firstName: true, lastName: true } },
                    club: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!reg || reg.championship.status === 'borrador') {
      throw new NotFoundException('Inscripción no encontrada');
    }

    const champ = reg.championship;
    const header = await this.institution.documentHeader();
    let participantName = 'Desconocido';
    let clubName = '';
    let clubSector = '';
    let members: Array<{
      jerseyNumber: number | null;
      code: string;
      name: string;
      status: string;
    }> = [];

    if (reg.participant.kind === 'equipo' && reg.participant.team) {
      const t = reg.participant.team.team;
      participantName = t.name;
      clubName = t.club.name;
      clubSector = t.club.sector ?? '';

      const teamSeason = await this.prisma.client.teamSeason.findUnique({
        where: {
          teamId_seasonId: {
            teamId: t.id,
            seasonId: champ.seasonId,
          },
        },
        include: {
          memberships: {
            include: {
              athlete: {
                include: {
                  person: { select: { firstName: true, lastName: true } },
                },
              },
            },
            orderBy: [{ jerseyNumber: 'asc' }, { id: 'asc' }],
          },
        },
      });

      if (teamSeason) {
        const labels = await this.names.labels(
          teamSeason.memberships.map((m) => m.athlete.id),
        );
        members = teamSeason.memberships.map((m) => ({
          jerseyNumber: m.jerseyNumber,
          code: athleteCode(m.athlete.codeNumber),
          name: labels.get(m.athlete.id) ?? 'Deportista',
          status: m.status,
        }));
      }
    } else if (
      reg.participant.kind === 'individual' &&
      reg.participant.individual
    ) {
      const ind = reg.participant.individual;
      participantName =
        (await this.names.labels([ind.athlete.id])).get(ind.athlete.id) ??
        'Deportista';
      clubName = ind.athlete.club.name;
      clubSector = ind.athlete.club.sector ?? '';
      members = [
        {
          jerseyNumber: null,
          code: athleteCode(ind.athlete.codeNumber),
          name: participantName,
          status: 'activo',
        },
      ];
    }

    return {
      documentMetadata: {
        title: 'NÓMINA INSTITUCIONAL DE BUENA FE',
        institution: header.institution,
        affiliation: header.affiliation,
        canton: header.canton,
        footer: header.footer,
        generatedAt: new Date().toISOString(),
      },
      championship: {
        id: champ.id,
        name: champ.name,
        sport: champ.sport.name,
        category: champ.category.name,
        season: champ.season.name,
      },
      participant: {
        name: participantName,
        clubName,
        clubSector,
        registrationStatus: reg.status,
        submittedAt: reg.submittedAt,
        reviewedAt: reg.reviewedAt,
      },
      members,
      signatories: [
        {
          label: 'Presidente del Club Deportivo',
          name: '____________________________',
        },
        {
          label: 'Presidente Liga Cantonal de Quero',
          name: '____________________________',
        },
        {
          label: 'Secretario/a de la Liga Cantonal',
          name: '____________________________',
        },
      ],
    };
  }
}
