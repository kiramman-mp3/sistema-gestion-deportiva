import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  ApproveResultInput,
  SaveResultDraftInput,
} from './results.schemas.js';

@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getResult(eventId: string) {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      include: {
        participants: {
          include: {
            registration: {
              include: {
                participant: {
                  include: {
                    team: { include: { team: { include: { club: true } } } },
                    individual: {
                      include: {
                        athlete: { include: { person: true, club: true } },
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
            footballEvents: {
              include: {
                athlete: {
                  include: {
                    person: true,
                  },
                },
              },
              orderBy: { minute: 'asc' },
            },
            revisions: {
              include: {
                changedBy: {
                  select: { id: true, displayName: true, email: true },
                },
              },
              orderBy: { changedAt: 'desc' },
            },
            submittedBy: {
              select: { id: true, displayName: true, email: true },
            },
            approvedBy: {
              select: { id: true, displayName: true, email: true },
            },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Partido / evento no encontrado');
    }

    return {
      event: {
        id: event.id,
        scheduledAt: event.scheduledAt,
        status: event.status,
        venueId: event.venueId,
        participants: event.participants,
      },
      result: event.result,
    };
  }

  async saveDraft(
    eventId: string,
    input: SaveResultDraftInput,
    userId: string,
    ipHash: string | null,
  ) {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      include: {
        participants: true,
        result: {
          include: {
            values: true,
            footballEvents: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Partido / evento no encontrado');
    }

    if (event.result && event.result.status === 'aprobado') {
      throw new ConflictException(
        'El resultado ya fue aprobado oficialmente. No se puede modificar como borrador.',
      );
    }

    // Auto-determinar resultados si no se enviaron explícitamente y son 2 participantes
    const valuesWithOutcome = [...input.values];
    if (
      valuesWithOutcome.length === 2 &&
      valuesWithOutcome[0] &&
      valuesWithOutcome[1] &&
      !valuesWithOutcome[0].outcome &&
      !valuesWithOutcome[1].outcome
    ) {
      const s0 = valuesWithOutcome[0].score;
      const s1 = valuesWithOutcome[1].score;
      if (s0 > s1) {
        valuesWithOutcome[0].outcome = 'victoria';
        valuesWithOutcome[1].outcome = 'derrota';
      } else if (s0 < s1) {
        valuesWithOutcome[0].outcome = 'derrota';
        valuesWithOutcome[1].outcome = 'victoria';
      } else {
        valuesWithOutcome[0].outcome = 'empate';
        valuesWithOutcome[1].outcome = 'empate';
      }
    }

    return this.prisma.client.$transaction(async (tx) => {
      // Upsert Result
      const result = await tx.result.upsert({
        where: { eventId },
        create: {
          eventId,
          status: 'borrador',
          submittedById: userId,
          submittedAt: new Date(),
        },
        update: {
          status: 'borrador',
          submittedById: userId,
          submittedAt: new Date(),
        },
      });

      // Reemplazar ResultValues
      await tx.resultValue.deleteMany({
        where: { resultId: result.id },
      });

      await tx.resultValue.createMany({
        data: valuesWithOutcome.map((v) => ({
          resultId: result.id,
          eventParticipantId: v.eventParticipantId,
          score: v.score,
          outcome: v.outcome ?? 'empate',
        })),
      });

      // Si hay eventos de fútbol, reemplazarlos
      if (input.footballEvents !== undefined) {
        await tx.footballEvent.deleteMany({
          where: { resultId: result.id },
        });

        if (input.footballEvents.length > 0) {
          await tx.footballEvent.createMany({
            data: input.footballEvents.map((fe) => ({
              resultId: result.id,
              eventParticipantId: fe.eventParticipantId,
              athleteId: fe.athleteId ?? null,
              eventType: fe.eventType,
              minute: fe.minute,
              notes: fe.notes ?? null,
            })),
          });
        }
      }

      const fullResult = await tx.result.findUnique({
        where: { id: result.id },
        include: {
          values: true,
          footballEvents: true,
        },
      });

      await this.audit.record(
        {
          userId,
          action: 'result:save_draft',
          entityType: 'result',
          entityId: result.id,
          ipHash: ipHash ?? undefined,
          after: fullResult ?? undefined,
        },
        tx,
      );

      return fullResult;
    });
  }

  async submitForReview(
    eventId: string,
    userId: string,
    ipHash: string | null,
  ) {
    const result = await this.prisma.client.result.findUnique({
      where: { eventId },
    });

    if (!result) {
      throw new NotFoundException('Acta de resultado no encontrada');
    }

    if (result.status !== 'borrador') {
      throw new ConflictException(
        'Solo se pueden enviar a revisión resultados en estado borrador',
      );
    }

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.result.update({
        where: { id: result.id },
        data: {
          status: 'pendiente_revision',
        },
      });

      await this.audit.record(
        {
          userId,
          action: 'result:submit_for_review',
          entityType: 'result',
          entityId: result.id,
          ipHash: ipHash ?? undefined,
          before: result,
          after: updated,
        },
        tx,
      );

      return updated;
    });
  }

  async approveResult(
    eventId: string,
    input: ApproveResultInput,
    userId: string,
    ipHash: string | null,
  ) {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      include: {
        result: {
          include: {
            values: true,
            footballEvents: true,
          },
        },
      },
    });

    if (!event || !event.result) {
      throw new NotFoundException('Acta de resultado no encontrada');
    }

    const previousResult = event.result;
    const newStatus = input.approved ? 'aprobado' : 'rechazado';

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.result.update({
        where: { id: previousResult.id },
        data: {
          status: newStatus,
          approvedById: userId,
          approvedAt: new Date(),
          approvalNotes: input.notes,
        },
        include: {
          values: true,
          footballEvents: true,
        },
      });

      // Crear revisión histórica inmutable
      await tx.resultRevision.create({
        data: {
          resultId: previousResult.id,
          previousSnapshot: previousResult as unknown as Prisma.InputJsonValue,
          newSnapshot: updated as unknown as Prisma.InputJsonValue,
          reason: input.reason,
          changedById: userId,
        },
      });

      // Si fue aprobado, actualizar el evento a finalizado
      if (input.approved) {
        await tx.event.update({
          where: { id: eventId },
          data: { status: 'finalizado' },
        });
      }

      await this.audit.record(
        {
          userId,
          action: input.approved ? 'result:approve' : 'result:reject',
          entityType: 'result',
          entityId: previousResult.id,
          ipHash: ipHash ?? undefined,
          before: previousResult,
          after: updated,
          reason: input.reason,
        },
        tx,
      );

      return updated;
    });
  }

  async calculateStandings(championshipId: string) {
    const champ = await this.prisma.client.championship.findUnique({
      where: { id: championshipId },
      include: {
        ruleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!champ) {
      throw new NotFoundException('Campeonato no encontrado');
    }

    // Reglas de puntuación (con defaults estándar FIFA/Liga)
    const activeRules = (champ.ruleVersions[0]?.rulesJson as Record<string, unknown> | null) ?? {};
    const pointsWin = Number(activeRules['pointsWin'] ?? 3);
    const pointsDraw = Number(activeRules['pointsDraw'] ?? 1);
    const pointsLoss = Number(activeRules['pointsLoss'] ?? 0);

    // Obtener todas las inscripciones activas
    const registrations = await this.prisma.client.registration.findMany({
      where: {
        championshipId,
        status: { in: ['aprobada', 'pendiente'] },
      },
      include: {
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
                  include: { person: true, club: true },
                },
              },
            },
          },
        },
      },
    });

    // Mapear acumuladores iniciales
    const tableMap = new Map<
      string,
      {
        registrationId: string;
        participantId: string;
        name: string;
        clubName: string;
        played: number;
        won: number;
        drawn: number;
        lost: number;
        goalsFor: number;
        goalsAgainst: number;
        goalDifference: number;
        points: number;
        yellowCards: number;
        redCards: number;
      }
    >();

    for (const reg of registrations) {
      let name = 'Desconocido';
      let clubName = 'Sin club';
      if (reg.participant.kind === 'equipo' && reg.participant.team) {
        name = reg.participant.team.team.name;
        clubName = reg.participant.team.team.club.name;
      } else if (reg.participant.kind === 'individual' && reg.participant.individual) {
        const ind = reg.participant.individual;
        name = `${ind.athlete.person.firstName} ${ind.athlete.person.lastName}`;
        clubName = ind.athlete.club.name;
      }

      tableMap.set(reg.id, {
        registrationId: reg.id,
        participantId: reg.participantId,
        name,
        clubName,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        yellowCards: 0,
        redCards: 0,
      });
    }

    // Obtener todos los eventos con resultado aprobado en este campeonato
    const events = await this.prisma.client.event.findMany({
      where: {
        round: {
          stage: {
            championshipId,
          },
        },
        result: {
          status: 'aprobado',
        },
      },
      include: {
        participants: true,
        result: {
          include: {
            values: true,
            footballEvents: true,
          },
        },
      },
    });

    for (const ev of events) {
      if (!ev.result) continue;

      const values = ev.result.values;
      if (values.length === 2 && values[0] && values[1]) {
        const p0 = ev.participants.find((p) => p.id === values[0]!.eventParticipantId);
        const p1 = ev.participants.find((p) => p.id === values[1]!.eventParticipantId);

        if (p0 && p1) {
          const row0 = tableMap.get(p0.registrationId);
          const row1 = tableMap.get(p1.registrationId);

          if (row0 && row1) {
            const score0 = values[0]!.score;
            const score1 = values[1]!.score;

            row0.played += 1;
            row1.played += 1;
            row0.goalsFor += score0;
            row0.goalsAgainst += score1;
            row1.goalsFor += score1;
            row1.goalsAgainst += score0;

            if (score0 > score1) {
              row0.won += 1;
              row0.points += pointsWin;
              row1.lost += 1;
              row1.points += pointsLoss;
            } else if (score1 > score0) {
              row1.won += 1;
              row1.points += pointsWin;
              row0.lost += 1;
              row0.points += pointsLoss;
            } else {
              row0.drawn += 1;
              row0.points += pointsDraw;
              row1.drawn += 1;
              row1.points += pointsDraw;
            }
          }
        }
      }

      // Tarjetas para juego limpio
      for (const fe of ev.result.footballEvents) {
        const p = ev.participants.find((part) => part.id === fe.eventParticipantId);
        if (p) {
          const row = tableMap.get(p.registrationId);
          if (row) {
            if (fe.eventType === 'tarjeta_amarilla') row.yellowCards += 1;
            if (fe.eventType === 'tarjeta_roja') row.redCards += 1;
          }
        }
      }
    }

    // Calcular gol diferencia y ordenar
    const standings = Array.from(tableMap.values()).map((row) => ({
      ...row,
      goalDifference: row.goalsFor - row.goalsAgainst,
    }));

    standings.sort((a, b) => {
      // 1. Puntos
      if (b.points !== a.points) return b.points - a.points;
      // 2. Gol diferencia
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      // 3. Goles a favor
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      // 4. Juego limpio (menos tarjetas rojas)
      if (a.redCards !== b.redCards) return a.redCards - b.redCards;
      // 5. Juego limpio (menos tarjetas amarillas)
      if (a.yellowCards !== b.yellowCards) return a.yellowCards - b.yellowCards;
      // 6. Nombre alfabético
      return a.name.localeCompare(b.name);
    });

    const rankedStandings = standings.map((item, idx) => ({
      position: idx + 1,
      ...item,
    }));

    return {
      championship: {
        id: champ.id,
        name: champ.name,
      },
      rules: {
        pointsWin,
        pointsDraw,
        pointsLoss,
      },
      standings: rankedStandings,
    };
  }
}
