import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { SecurityHashService } from '../auth/security-hash.service.js';
import {
  describeParticipants,
  EVENT_LABEL_INCLUDE,
} from '../competitions/event-label.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  formatLocalDateTime,
  NotificationsService,
} from '../notifications/notifications.service.js';
import {
  ASSIGNMENT_ROLE_LABELS,
  type CreateAssignmentInput,
  type RespondAssignmentInput,
} from './officials.schemas.js';

/** Duración supuesta de un encuentro para detectar traslapes (el reglamento real la define la Liga). */
const EVENT_DURATION_MS = 120 * 60 * 1000;
/** Margen entre dos designaciones de un mismo oficial (mismo criterio que los escenarios, D-49). */
const MARGIN_MS = 90 * 60 * 1000;

export interface AssignmentConflict {
  code:
    'inactivo' | 'deporte' | 'no_disponible' | 'traslape' | 'club' | 'jugador';
  message: string;
}

const EVENT_CONTEXT_INCLUDE = {
  ...EVENT_LABEL_INCLUDE,
  round: {
    include: {
      stage: {
        include: {
          championship: {
            select: { id: true, name: true, sportId: true, seasonId: true },
          },
        },
      },
    },
  },
} satisfies Prisma.EventInclude;

type EventContext = Prisma.EventGetPayload<{
  include: typeof EVENT_CONTEXT_INCLUDE;
}>;

@Injectable()
export class AssignmentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hash: SecurityHashService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  private async loadEvent(
    eventId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<EventContext> {
    const event = await (tx ?? this.prisma.client).event.findUnique({
      where: { id: eventId },
      include: EVENT_CONTEXT_INCLUDE,
    });
    if (!event) throw new NotFoundException('Partido no encontrado');
    return event;
  }

  /**
   * Motivos por los que un oficial no puede ser designado en un partido. Vacío = puede serlo.
   * Se usa tanto para rechazar una designación como para marcar a los candidatos en la interfaz.
   */
  async conflictsFor(
    tx: Prisma.TransactionClient,
    event: EventContext,
    official: {
      id: string;
      status: string;
      clubId: string | null;
      personId: string;
      sports: { sportId: string }[];
    },
  ): Promise<AssignmentConflict[]> {
    const conflicts: AssignmentConflict[] = [];
    const scheduledAt = event.scheduledAt;
    if (!scheduledAt) return conflicts;
    const participants = describeParticipants(event);
    const championship = event.round.stage.championship;

    if (official.status !== 'activo') {
      conflicts.push({
        code: 'inactivo',
        message: `El oficial está ${official.status}`,
      });
    }
    if (!official.sports.some((s) => s.sportId === championship.sportId)) {
      conflicts.push({
        code: 'deporte',
        message: 'El oficial no está habilitado para el deporte del campeonato',
      });
    }

    const start = scheduledAt;
    const end = new Date(scheduledAt.getTime() + EVENT_DURATION_MS);
    const unavailable = await tx.officialUnavailability.findFirst({
      where: {
        officialId: official.id,
        startsAt: { lt: end },
        endsAt: { gt: start },
      },
    });
    if (unavailable) {
      conflicts.push({
        code: 'no_disponible',
        message: 'El oficial no está disponible en ese horario',
      });
    }

    const overlapping = await tx.eventAssignment.findFirst({
      where: {
        officialId: official.id,
        status: { not: 'rechazado' },
        eventId: { not: event.id },
        event: {
          status: { notIn: ['cancelado', 'postergado'] },
          scheduledAt: {
            gt: new Date(scheduledAt.getTime() - MARGIN_MS),
            lt: new Date(scheduledAt.getTime() + MARGIN_MS),
          },
        },
      },
    });
    if (overlapping) {
      conflicts.push({
        code: 'traslape',
        message: 'El oficial ya tiene otra designación en un horario cercano',
      });
    }

    // Imparcialidad: no arbitra a su propio club ni partidos donde juega.
    const athlete = await tx.athlete.findUnique({
      where: { personId: official.personId },
      select: { id: true, clubId: true },
    });
    const affiliations = new Set(
      [official.clubId, athlete?.clubId].filter((id): id is string => !!id),
    );
    if (participants.clubIds.some((id) => affiliations.has(id))) {
      conflicts.push({
        code: 'club',
        message:
          'El oficial pertenece a uno de los clubes que juegan el partido',
      });
    }
    if (athlete) {
      const plays =
        participants.athleteIds.includes(athlete.id) ||
        (participants.teamIds.length > 0 &&
          (await tx.teamMembership.count({
            where: {
              athleteId: athlete.id,
              status: 'activo',
              seasonId: championship.seasonId,
              teamSeason: { teamId: { in: participants.teamIds } },
            },
          })) > 0);
      if (plays) {
        conflicts.push({
          code: 'jugador',
          message: 'El oficial es deportista en uno de los equipos del partido',
        });
      }
    }
    return conflicts;
  }

  private assertEventOpen(event: EventContext): void {
    if (['finalizado', 'cancelado'].includes(event.status)) {
      throw new ConflictException(
        `El partido está ${event.status}: no se modifican sus designaciones`,
      );
    }
  }

  // ───────────────────── Consulta ─────────────────────

  async listForEvent(eventId: string) {
    await this.loadEvent(eventId);
    const rows = await this.prisma.client.eventAssignment.findMany({
      where: { eventId },
      include: {
        official: {
          include: {
            person: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((a) => ({
      id: a.id,
      role: a.role,
      roleLabel: ASSIGNMENT_ROLE_LABELS[a.role],
      status: a.status,
      notes: a.notes,
      responseNote: a.responseNote,
      respondedAt: a.respondedAt,
      official: {
        id: a.official.id,
        firstName: a.official.person.firstName,
        lastName: a.official.person.lastName,
      },
    }));
  }

  /** Oficiales activos del deporte del partido, cada uno con sus conflictos (si los hay). */
  async candidates(eventId: string) {
    const event = await this.loadEvent(eventId);
    const sportId = event.round.stage.championship.sportId;
    const officials = await this.prisma.client.official.findMany({
      where: { status: 'activo', sports: { some: { sportId } } },
      include: {
        person: { select: { firstName: true, lastName: true } },
        sports: { select: { sportId: true } },
      },
      orderBy: [
        { person: { lastName: 'asc' } },
        { person: { firstName: 'asc' } },
      ],
      take: 300,
    });
    const assigned = new Set(
      (
        await this.prisma.client.eventAssignment.findMany({
          where: { eventId, status: { not: 'rechazado' } },
          select: { officialId: true },
        })
      ).map((a) => a.officialId),
    );
    return this.prisma.client.$transaction(async (tx) => {
      const items = [];
      for (const o of officials) {
        items.push({
          id: o.id,
          firstName: o.person.firstName,
          lastName: o.person.lastName,
          alreadyAssigned: assigned.has(o.id),
          conflicts: await this.conflictsFor(tx, event, o),
        });
      }
      return items;
    });
  }

  /** Designaciones del usuario autenticado (si su cuenta está vinculada a un oficial). */
  async mine(
    auth: AuthContext,
    query: {
      page: number;
      pageSize: number;
      scope: 'proximas' | 'pasadas' | 'todas';
    },
  ) {
    const official = await this.prisma.client.official.findUnique({
      where: { userId: auth.user.id },
      select: { id: true },
    });
    if (!official) {
      return {
        linked: false,
        items: [],
        page: 1,
        pageSize: query.pageSize,
        total: 0,
      };
    }
    const now = new Date();
    const where: Prisma.EventAssignmentWhereInput = {
      officialId: official.id,
      ...(query.scope === 'proximas' && {
        status: { not: 'rechazado' },
        event: {
          status: { notIn: ['finalizado', 'cancelado'] },
          OR: [{ scheduledAt: null }, { scheduledAt: { gte: now } }],
        },
      }),
      ...(query.scope === 'pasadas' && {
        event: { scheduledAt: { lt: now } },
      }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.eventAssignment.count({ where }),
      this.prisma.client.eventAssignment.findMany({
        where,
        include: {
          event: {
            include: {
              ...EVENT_CONTEXT_INCLUDE,
              venue: { select: { name: true, address: true } },
            },
          },
        },
        orderBy: [
          {
            event: { scheduledAt: query.scope === 'pasadas' ? 'desc' : 'asc' },
          },
          { id: 'asc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      linked: true,
      items: rows.map((a) => ({
        id: a.id,
        role: a.role,
        roleLabel: ASSIGNMENT_ROLE_LABELS[a.role],
        status: a.status,
        responseNote: a.responseNote,
        event: {
          id: a.event.id,
          scheduledAt: a.event.scheduledAt,
          status: a.event.status,
          match: describeParticipants(a.event).label,
          venue: a.event.venue,
        },
        championship: {
          id: a.event.round.stage.championship.id,
          name: a.event.round.stage.championship.name,
        },
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  // ───────────────────── Designar y retirar ─────────────────────

  async assign(
    eventId: string,
    auth: AuthContext,
    ip: string,
    input: CreateAssignmentInput,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      // Serializa las designaciones de un mismo oficial: dos solicitudes simultáneas no se traslapan.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'official:' + input.officialId}))`;

      const event = await this.loadEvent(eventId, tx);
      this.assertEventOpen(event);
      if (!event.scheduledAt) {
        throw new ConflictException(
          'Programe la fecha y hora del partido antes de designar oficiales',
        );
      }
      const official = await tx.official.findUnique({
        where: { id: input.officialId },
        include: {
          sports: { select: { sportId: true } },
          person: { select: { firstName: true, lastName: true } },
        },
      });
      if (!official) throw new NotFoundException('Oficial no encontrado');

      const conflicts = await this.conflictsFor(tx, event, official);
      if (conflicts.length > 0) {
        throw new ConflictException(conflicts.map((c) => c.message).join('. '));
      }

      let assignment;
      try {
        assignment = await tx.eventAssignment.create({
          data: {
            eventId,
            officialId: official.id,
            role: input.role,
            notes: input.notes ?? null,
            assignedById: auth.user.id,
          },
        });
      } catch (error) {
        // El alta fallida dentro de la transacción obliga a traducir fuera: se relanza con mensaje claro.
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            'El oficial ya está designado en este partido o el rol ya está ocupado',
          );
        }
        throw error;
      }

      await this.audit.record(
        {
          action: 'assignment.created',
          entityType: 'event',
          entityId: eventId,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          after: {
            assignmentId: assignment.id,
            officialId: official.id,
            role: input.role,
          },
        },
        tx,
      );

      const official_ = await tx.official.findUniqueOrThrow({
        where: { id: official.id },
        select: { userId: true },
      });
      await this.notifications.notify(tx, {
        userIds: official_.userId ? [official_.userId] : [],
        template: 'assignment.created',
        params: {
          match: describeParticipants(event).label,
          role: ASSIGNMENT_ROLE_LABELS[input.role],
          when: formatLocalDateTime(event.scheduledAt),
        },
        entityType: 'assignment',
        entityId: assignment.id,
        link: '#/mis-designaciones',
        excludeUserId: auth.user.id,
      });
      return assignment;
    });
  }

  async remove(
    eventId: string,
    assignmentId: string,
    auth: AuthContext,
    ip: string,
    reason?: string | null,
  ): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const assignment = await tx.eventAssignment.findFirst({
        where: { id: assignmentId, eventId },
        include: { official: { select: { userId: true } } },
      });
      if (!assignment) throw new NotFoundException('Designación no encontrada');
      const event = await this.loadEvent(eventId, tx);
      this.assertEventOpen(event);

      await tx.eventAssignment.delete({ where: { id: assignmentId } });
      await this.audit.record(
        {
          action: 'assignment.removed',
          entityType: 'event',
          entityId: eventId,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          before: {
            assignmentId,
            officialId: assignment.officialId,
            role: assignment.role,
            status: assignment.status,
          },
          reason: reason ?? undefined,
        },
        tx,
      );
      await this.notifications.notify(tx, {
        userIds: assignment.official.userId ? [assignment.official.userId] : [],
        template: 'assignment.removed',
        params: {
          match: describeParticipants(event).label,
          role: ASSIGNMENT_ROLE_LABELS[assignment.role],
        },
        entityType: 'event',
        entityId: eventId,
        link: '#/mis-designaciones',
        excludeUserId: auth.user.id,
      });
    });
  }

  /** El oficial confirma o rechaza una designación propia. */
  async respond(
    assignmentId: string,
    auth: AuthContext,
    ip: string,
    input: RespondAssignmentInput,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      // Solo las propias: una ajena responde como inexistente.
      const assignment = await tx.eventAssignment.findFirst({
        where: { id: assignmentId, official: { userId: auth.user.id } },
        include: {
          official: {
            include: {
              person: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });
      if (!assignment) throw new NotFoundException('Designación no encontrada');
      if (assignment.status === 'rechazado') {
        throw new ConflictException(
          'La designación ya fue rechazada: solicite una nueva designación',
        );
      }
      const event = await this.loadEvent(assignment.eventId, tx);
      this.assertEventOpen(event);

      const status =
        input.response === 'confirmar' ? 'confirmado' : 'rechazado';
      const updated = await tx.eventAssignment.update({
        where: { id: assignmentId },
        data: {
          status,
          respondedAt: new Date(),
          responseNote: input.reason ?? null,
        },
      });
      await this.audit.record(
        {
          action: 'assignment.responded',
          entityType: 'event',
          entityId: assignment.eventId,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          before: { status: assignment.status },
          after: { assignmentId, status },
          reason: input.reason ?? undefined,
        },
        tx,
      );
      if (status === 'rechazado') {
        // Quien designó debe saberlo para buscar un reemplazo.
        await this.notifications.notify(tx, {
          userIds: [assignment.assignedById],
          template: 'assignment.rejected',
          params: {
            official: `${assignment.official.person.firstName} ${assignment.official.person.lastName}`,
            match: describeParticipants(event).label,
            role: ASSIGNMENT_ROLE_LABELS[assignment.role],
          },
          entityType: 'event',
          entityId: assignment.eventId,
          link: '#/campeonatos',
          excludeUserId: auth.user.id,
        });
      }
      return updated;
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  const cause = (
    error as {
      meta?: { driverAdapterError?: { cause?: { originalCode?: string } } };
    }
  )?.meta?.driverAdapterError?.cause;
  return cause?.originalCode === '23505';
}
