import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../auth/auth.types.js';
import { AuditService } from '../../audit/audit.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
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
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Quién puede escribir el acta de un partido: `results:manage` en cualquiera, o
   * `results:manage_assigned` solo si está designado en ese partido (y no rechazó la designación).
   */
  async assertCanWrite(auth: AuthContext, eventId: string): Promise<void> {
    if (auth.permissions.has('results:manage')) return;
    if (auth.permissions.has('results:manage_assigned')) {
      const assignment = await this.prisma.client.eventAssignment.findFirst({
        where: {
          eventId,
          status: { not: 'rechazado' },
          official: { userId: auth.user.id },
        },
        select: { id: true },
      });
      if (assignment) return;
    }
    throw new ForbiddenException('No tiene permisos para esta operación');
  }

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
            periodScores: {
              orderBy: { periodNumber: 'asc' },
            },
            taekwondoBouts: {
              orderBy: { roundNumber: 'asc' },
            },
            chessPairings: true,
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

      // Si hay puntuación por período (Básquet), reemplazarlos
      if (input.periodScores !== undefined) {
        await tx.eventPeriodScore.deleteMany({
          where: { resultId: result.id },
        });

        if (input.periodScores.length > 0) {
          await tx.eventPeriodScore.createMany({
            data: input.periodScores.map((ps) => ({
              resultId: result.id,
              eventParticipantId: ps.eventParticipantId,
              periodNumber: ps.periodNumber,
              score: ps.score,
            })),
          });
        }
      }

      // Si hay asaltos de combate (Taekwondo), reemplazarlos
      if (input.taekwondoBouts !== undefined) {
        await tx.taekwondoBout.deleteMany({
          where: { resultId: result.id },
        });

        if (input.taekwondoBouts.length > 0) {
          await tx.taekwondoBout.createMany({
            data: input.taekwondoBouts.map((tb) => ({
              resultId: result.id,
              eventParticipantId: tb.eventParticipantId,
              roundNumber: tb.roundNumber,
              points: tb.points,
              penalties: tb.penalties,
              decision: tb.decision ?? null,
            })),
          });
        }
      }

      // Si hay emparejamientos de ajedrez, reemplazarlos
      if (input.chessPairings !== undefined) {
        await tx.chessPairing.deleteMany({
          where: { resultId: result.id },
        });

        if (input.chessPairings.length > 0) {
          await tx.chessPairing.createMany({
            data: input.chessPairings.map((cp) => ({
              resultId: result.id,
              eventParticipantId: cp.eventParticipantId,
              color: cp.color,
              points: cp.points,
              buchholz: cp.buchholz ?? null,
            })),
          });
        }
      }

      const fullResult = await tx.result.findUnique({
        where: { id: result.id },
        include: {
          values: true,
          footballEvents: true,
          periodScores: true,
          taekwondoBouts: true,
          chessPairings: true,
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

      const context = await this.notifications.eventContext(tx, eventId);
      await this.notifications.notify(tx, {
        userIds: await this.notifications.permissionUserIds(
          tx,
          'results:approve',
        ),
        template: 'result.pending_review',
        params: { championship: context.championship, match: context.match },
        entityType: 'result',
        entityId: result.id,
        link: '#/campeonatos',
        excludeUserId: userId,
      });

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
            periodScores: true,
            taekwondoBouts: true,
            chessPairings: true,
          },
        },
      },
    });

    if (!event || !event.result) {
      throw new NotFoundException('Acta de resultado no encontrada');
    }

    const previousResult = event.result;
    const newStatus = input.approved ? 'aprobado' : 'rechazado';

    // Solo se revisa lo que alguien envió a revisión: un borrador, o un acta ya resuelta, no se aprueba.
    if (previousResult.status !== 'pendiente_revision') {
      throw new ConflictException(
        'Solo se pueden aprobar o rechazar actas pendientes de revisión',
      );
    }
    // Separación de funciones (§4.5): quien registró el acta no la aprueba, salvo decisión expresa de la Liga.
    if (previousResult.submittedById === userId) {
      const institution =
        await this.prisma.client.institutionSettings.findUnique({
          where: { id: 1 },
          select: { allowSelfApproval: true },
        });
      if (!institution?.allowSelfApproval) {
        throw new ForbiddenException(
          'Quien registró el acta no puede aprobarla ni rechazarla. Solicite la revisión a otra persona',
        );
      }
    }

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
          periodScores: true,
          taekwondoBouts: true,
          chessPairings: true,
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
        sport: true,
        ruleVersions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!champ) {
      throw new NotFoundException('Campeonato no encontrado');
    }

    const sportCode = champ.sport.code;
    const activeRules =
      (champ.ruleVersions[0]?.rulesJson as Record<string, unknown> | null) ??
      {};

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
        buchholz?: number;
      }
    >();

    for (const reg of registrations) {
      let name = 'Desconocido';
      let clubName = 'Sin club';
      if (reg.participant.kind === 'equipo' && reg.participant.team) {
        name = reg.participant.team.team.name;
        clubName = reg.participant.team.team.club.name;
      } else if (
        reg.participant.kind === 'individual' &&
        reg.participant.individual
      ) {
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
        buchholz: 0,
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
            periodScores: true,
            taekwondoBouts: true,
            chessPairings: true,
          },
        },
      },
    });

    // Puntuaciones según deporte
    let pointsWin = 3;
    let pointsDraw = 1;
    let pointsLoss = 0;

    if (sportCode === 'basquet') {
      pointsWin = Number(activeRules['pointsWin'] ?? 2);
      pointsLoss = Number(activeRules['pointsLoss'] ?? 1);
      pointsDraw = 0; // En básquet no hay empates
    } else if (sportCode === 'ajedrez') {
      pointsWin = 1;
      pointsDraw = 0.5;
      pointsLoss = 0;
    } else {
      pointsWin = Number(activeRules['pointsWin'] ?? 3);
      pointsDraw = Number(activeRules['pointsDraw'] ?? 1);
      pointsLoss = Number(activeRules['pointsLoss'] ?? 0);
    }

    for (const ev of events) {
      if (!ev.result) continue;

      if (sportCode === 'ajedrez' && ev.result.chessPairings.length > 0) {
        for (const cp of ev.result.chessPairings) {
          const part = ev.participants.find(
            (p) => p.id === cp.eventParticipantId,
          );
          if (part) {
            const row = tableMap.get(part.registrationId);
            if (row) {
              row.played += 1;
              const pVal = Number(cp.points);
              row.points += pVal;
              if (pVal === 1) row.won += 1;
              else if (pVal === 0.5) row.drawn += 1;
              else row.lost += 1;
              if (cp.buchholz) {
                row.buchholz = (row.buchholz ?? 0) + Number(cp.buchholz);
              }
            }
          }
        }
        continue;
      }

      const values = ev.result.values;
      if (values.length === 2 && values[0] && values[1]) {
        const p0 = ev.participants.find(
          (p) => p.id === values[0]!.eventParticipantId,
        );
        const p1 = ev.participants.find(
          (p) => p.id === values[1]!.eventParticipantId,
        );

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

      // Tarjetas para juego limpio en fútbol
      for (const fe of ev.result.footballEvents) {
        const p = ev.participants.find(
          (part) => part.id === fe.eventParticipantId,
        );
        if (p) {
          const row = tableMap.get(p.registrationId);
          if (row) {
            if (fe.eventType === 'tarjeta_amarilla') row.yellowCards += 1;
            if (fe.eventType === 'tarjeta_roja') row.redCards += 1;
          }
        }
      }

      // Faltas / Gam-jeom en taekwondo
      for (const tb of ev.result.taekwondoBouts) {
        const p = ev.participants.find(
          (part) => part.id === tb.eventParticipantId,
        );
        if (p) {
          const row = tableMap.get(p.registrationId);
          if (row) {
            row.redCards += tb.penalties; // acumulamos penalizaciones
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
      // Ajedrez: Buchholz
      if (sportCode === 'ajedrez' && (b.buchholz ?? 0) !== (a.buchholz ?? 0)) {
        return (b.buchholz ?? 0) - (a.buchholz ?? 0);
      }
      // 2. Diferencia
      if (b.goalDifference !== a.goalDifference)
        return b.goalDifference - a.goalDifference;
      // 3. Puntos / Goles a favor
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      // 4. Juego limpio
      if (a.redCards !== b.redCards) return a.redCards - b.redCards;
      if (a.yellowCards !== b.yellowCards) return a.yellowCards - b.yellowCards;
      // 5. Nombre alfabético
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
        sportCode,
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
