import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  ChangeEventStatusInput,
  CreateEventInput,
  CreateRoundInput,
  CreateStageInput,
  ListEventsQuery,
  RescheduleEventInput,
} from './fixtures.schemas.js';

@Injectable()
export class FixturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listStages(championshipId: string) {
    const champ = await this.prisma.client.championship.findUnique({
      where: { id: championshipId },
    });
    if (!champ) {
      throw new NotFoundException('Campeonato no encontrado');
    }

    return this.prisma.client.stage.findMany({
      where: { championshipId },
      orderBy: { sequence: 'asc' },
      include: {
        rounds: {
          orderBy: { roundNumber: 'asc' },
          include: {
            _count: {
              select: { events: true },
            },
          },
        },
      },
    });
  }

  async createStage(
    championshipId: string,
    input: CreateStageInput,
    userId: string,
    ipHash: string | null,
  ) {
    const champ = await this.prisma.client.championship.findUnique({
      where: { id: championshipId },
    });
    if (!champ) {
      throw new NotFoundException('Campeonato no encontrado');
    }

    let sequence = input.sequence;
    if (!sequence) {
      const maxStage = await this.prisma.client.stage.findFirst({
        where: { championshipId },
        orderBy: { sequence: 'desc' },
      });
      sequence = (maxStage?.sequence ?? 0) + 1;
    }

    return this.prisma.client.$transaction(async (tx) => {
      const stage = await tx.stage.create({
        data: {
          championshipId,
          name: input.name,
          stageType: input.stageType,
          sequence,
        },
      });

      await this.audit.record(
        {
          userId,
          action: 'stage:create',
          entityType: 'stage',
          entityId: stage.id,
          ipHash: ipHash ?? undefined,
          after: stage,
        },
        tx,
      );

      return stage;
    });
  }

  async createRound(
    stageId: string,
    input: CreateRoundInput,
    userId: string,
    ipHash: string | null,
  ) {
    const stage = await this.prisma.client.stage.findUnique({
      where: { id: stageId },
    });
    if (!stage) {
      throw new NotFoundException('Etapa no encontrada');
    }

    let roundNumber = input.roundNumber;
    if (!roundNumber) {
      const maxRound = await this.prisma.client.round.findFirst({
        where: { stageId },
        orderBy: { roundNumber: 'desc' },
      });
      roundNumber = (maxRound?.roundNumber ?? 0) + 1;
    }

    return this.prisma.client.$transaction(async (tx) => {
      const round = await tx.round.create({
        data: {
          stageId,
          name: input.name,
          roundNumber,
        },
      });

      await this.audit.record(
        {
          userId,
          action: 'round:create',
          entityType: 'round',
          entityId: round.id,
          ipHash: ipHash ?? undefined,
          after: round,
        },
        tx,
      );

      return round;
    });
  }

  async listEvents(championshipId: string, query: ListEventsQuery) {
    const champ = await this.prisma.client.championship.findUnique({
      where: { id: championshipId },
    });
    if (!champ) {
      throw new NotFoundException('Campeonato no encontrado');
    }

    const where: Prisma.EventWhereInput = {
      round: {
        stage: {
          championshipId,
          ...(query.stageId ? { id: query.stageId } : {}),
        },
        ...(query.roundId ? { id: query.roundId } : {}),
      },
      ...(query.status ? { status: query.status } : {}),
    };

    if (query.from || query.to) {
      where.scheduledAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    return this.prisma.client.event.findMany({
      where,
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      include: {
        venue: { select: { id: true, name: true, capacity: true } },
        round: {
          select: {
            id: true,
            name: true,
            roundNumber: true,
            stage: {
              select: {
                id: true,
                name: true,
                sequence: true,
                stageType: true,
              },
            },
          },
        },
        participants: {
          orderBy: { side: 'asc' },
          include: {
            registration: {
              include: {
                participant: {
                  include: {
                    team: {
                      include: {
                        team: {
                          include: {
                            club: { select: { id: true, name: true, shortName: true } },
                          },
                        },
                      },
                    },
                    individual: {
                      include: {
                        athlete: {
                          include: {
                            person: {
                              select: {
                                id: true,
                                firstName: true,
                                lastName: true,
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
        result: {
          select: {
            id: true,
            status: true,
            values: {
              select: {
                id: true,
                eventParticipantId: true,
                score: true,
                outcome: true,
                rank: true,
              },
            },
          },
        },
      },
    });
  }

  async getEvent(id: string) {
    const event = await this.prisma.client.event.findUnique({
      where: { id },
      include: {
        venue: true,
        round: {
          include: {
            stage: {
              include: {
                championship: {
                  select: {
                    id: true,
                    name: true,
                    format: true,
                    sport: { select: { id: true, name: true, code: true } },
                    category: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
        participants: {
          orderBy: { side: 'asc' },
          include: {
            registration: {
              include: {
                participant: {
                  include: {
                    team: {
                      include: {
                        team: {
                          include: {
                            club: true,
                          },
                        },
                      },
                    },
                    individual: {
                      include: {
                        athlete: {
                          include: {
                            person: true,
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
            footballEvents: true,
            periodScores: true,
            taekwondoBouts: true,
            chessPairings: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Partido / evento no encontrado');
    }

    return event;
  }

  async createEvent(
    roundId: string,
    input: CreateEventInput,
    userId: string,
    ipHash: string | null,
  ) {
    const round = await this.prisma.client.round.findUnique({
      where: { id: roundId },
      include: { stage: true },
    });
    if (!round) {
      throw new NotFoundException('Jornada / ronda no encontrada');
    }

    const championshipId = round.stage.championshipId;

    // Verificar que ambas inscripciones pertenezcan a este campeonato
    const [homeReg, awayReg] = await Promise.all([
      this.prisma.client.registration.findUnique({
        where: { id: input.homeRegistrationId },
      }),
      this.prisma.client.registration.findUnique({
        where: { id: input.awayRegistrationId },
      }),
    ]);

    if (!homeReg || homeReg.championshipId !== championshipId) {
      throw new ConflictException(
        'El participante local no pertenece a este campeonato',
      );
    }
    if (!awayReg || awayReg.championshipId !== championshipId) {
      throw new ConflictException(
        'El participante visitante no pertenece a este campeonato',
      );
    }
    if (homeReg.status === 'rechazada' || homeReg.status === 'retirada') {
      throw new ConflictException(
        'El participante local tiene una inscripción no válida para competir',
      );
    }
    if (awayReg.status === 'rechazada' || awayReg.status === 'retirada') {
      throw new ConflictException(
        'El participante visitante tiene una inscripción no válida para competir',
      );
    }

    if (input.scheduledAt) {
      const scheduledDate = new Date(input.scheduledAt);
      await this.validateConflicts({
        scheduledDate,
        venueId: input.venueId ?? null,
        registrationIds: [input.homeRegistrationId, input.awayRegistrationId],
      });
    }

    return this.prisma.client.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          roundId,
          venueId: input.venueId ?? null,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          status: 'programado',
          participants: {
            create: [
              {
                registrationId: input.homeRegistrationId,
                side: 'local',
              },
              {
                registrationId: input.awayRegistrationId,
                side: 'visitante',
              },
            ],
          },
        },
        include: {
          participants: true,
          venue: true,
        },
      });

      await this.audit.record(
        {
          userId,
          action: 'event:create',
          entityType: 'event',
          entityId: event.id,
          ipHash: ipHash ?? undefined,
          after: event,
        },
        tx,
      );

      return event;
    });
  }

  async rescheduleEvent(
    id: string,
    input: RescheduleEventInput,
    userId: string,
    ipHash: string | null,
  ) {
    const existing = await this.prisma.client.event.findUnique({
      where: { id },
      include: { participants: true },
    });
    if (!existing) {
      throw new NotFoundException('Partido / evento no encontrado');
    }

    if (input.scheduledAt) {
      const scheduledDate = new Date(input.scheduledAt);
      const regIds = existing.participants.map((p) => p.registrationId);
      await this.validateConflicts({
        scheduledDate,
        venueId: input.venueId ?? null,
        registrationIds: regIds,
        excludeEventId: id,
      });
    }

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.event.update({
        where: { id },
        data: {
          venueId: input.venueId ?? null,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          postponementReason: input.reason,
          status: 'postergado',
        },
        include: {
          venue: true,
          participants: true,
        },
      });

      await this.audit.record(
        {
          userId,
          action: 'event:reschedule',
          entityType: 'event',
          entityId: id,
          ipHash: ipHash ?? undefined,
          before: existing,
          after: updated,
          reason: input.reason,
        },
        tx,
      );

      return updated;
    });
  }

  async changeStatus(
    id: string,
    input: ChangeEventStatusInput,
    userId: string,
    ipHash: string | null,
  ) {
    const existing = await this.prisma.client.event.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Partido / evento no encontrado');
    }

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.event.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.reason ? { postponementReason: input.reason } : {}),
        },
      });

      await this.audit.record(
        {
          userId,
          action: 'event:status_change',
          entityType: 'event',
          entityId: id,
          ipHash: ipHash ?? undefined,
          before: existing,
          after: updated,
          reason: input.reason,
        },
        tx,
      );

      return updated;
    });
  }

  async deleteEvent(id: string, userId: string, ipHash: string | null) {
    const existing = await this.prisma.client.event.findUnique({
      where: { id },
      include: { result: true },
    });
    if (!existing) {
      throw new NotFoundException('Partido / evento no encontrado');
    }

    if (existing.result && existing.result.status === 'aprobado') {
      throw new ConflictException(
        'No se puede eliminar un partido con un resultado oficial ya aprobado',
      );
    }

    return this.prisma.client.$transaction(async (tx) => {
      await tx.event.delete({ where: { id } });

      await this.audit.record(
        {
          userId,
          action: 'event:delete',
          entityType: 'event',
          entityId: id,
          ipHash: ipHash ?? undefined,
          before: existing,
        },
        tx,
      );

      return { success: true };
    });
  }

  private async validateConflicts({
    scheduledDate,
    venueId,
    registrationIds,
    excludeEventId,
  }: {
    scheduledDate: Date;
    venueId: string | null;
    registrationIds: string[];
    excludeEventId?: string;
  }) {
    // 1. Conflicto de escenario: ±90 minutos
    if (venueId) {
      const marginMs = 90 * 60 * 1000;
      const startWindow = new Date(scheduledDate.getTime() - marginMs);
      const endWindow = new Date(scheduledDate.getTime() + marginMs);

      const venueConflict = await this.prisma.client.event.findFirst({
        where: {
          venueId,
          ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
          scheduledAt: {
            gte: startWindow,
            lte: endWindow,
          },
          status: { notIn: ['cancelado', 'postergado'] },
        },
      });

      if (venueConflict) {
        throw new ConflictException(
          'El escenario deportivo ya está ocupado por otro encuentro en ese horario',
        );
      }
    }

    // 2. Conflicto de participante: no puede tener dos partidos el mismo día
    const dayStart = new Date(scheduledDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(scheduledDate);
    dayEnd.setHours(23, 59, 59, 999);

    const participantConflict = await this.prisma.client.eventParticipant.findFirst({
      where: {
        registrationId: { in: registrationIds },
        event: {
          ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
          scheduledAt: {
            gte: dayStart,
            lte: dayEnd,
          },
          status: { notIn: ['cancelado', 'postergado'] },
        },
      },
      include: {
        event: true,
      },
    });

    if (participantConflict) {
      throw new ConflictException(
        'Uno de los participantes ya tiene un encuentro programado en esa misma fecha',
      );
    }
  }
}
