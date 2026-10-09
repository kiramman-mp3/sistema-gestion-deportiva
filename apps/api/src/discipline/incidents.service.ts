import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { SecurityHashService } from '../auth/security-hash.service.js';
import type { Page } from '../catalogs/common.js';
import {
  describeParticipants,
  EVENT_LABEL_INCLUDE,
} from '../competitions/event-label.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { INCIDENT_TYPE_LABELS } from './discipline.helpers.js';
import type { CreateIncidentInput } from './discipline.schemas.js';

@Injectable()
export class IncidentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hash: SecurityHashService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Quien tiene `cases:manage` reporta en cualquier partido; un oficial solo en los suyos
   * (designado y sin haber rechazado la designación).
   */
  private async assertCanReport(auth: AuthContext, eventId: string) {
    if (auth.permissions.has('cases:manage')) return;
    const assignment = await this.prisma.client.eventAssignment.findFirst({
      where: {
        eventId,
        status: { not: 'rechazado' },
        official: { userId: auth.user.id },
      },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException(
        'Solo puede reportar incidencias de los partidos en que está designado',
      );
    }
  }

  async create(
    eventId: string,
    auth: AuthContext,
    ip: string,
    input: CreateIncidentInput,
  ) {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      include: EVENT_LABEL_INCLUDE,
    });
    if (!event) throw new NotFoundException('Partido no encontrado');
    await this.assertCanReport(auth, eventId);

    const participants = describeParticipants(event);
    if (input.clubId && !participants.clubIds.includes(input.clubId)) {
      throw new BadRequestException('El club no participa en ese partido');
    }
    if (input.athleteId) {
      const athlete = await this.prisma.client.athlete.findUnique({
        where: { id: input.athleteId },
        select: { clubId: true },
      });
      if (!athlete) throw new NotFoundException('Deportista no encontrado');
      if (!participants.clubIds.includes(athlete.clubId)) {
        throw new BadRequestException(
          'El deportista no pertenece a ninguno de los clubes del partido',
        );
      }
      if (input.clubId && input.clubId !== athlete.clubId) {
        throw new BadRequestException(
          'El deportista no pertenece al club indicado',
        );
      }
    }

    return this.prisma.client.$transaction(async (tx) => {
      const incident = await tx.eventIncident.create({
        data: {
          eventId,
          athleteId: input.athleteId ?? null,
          clubId: input.clubId ?? null,
          type: input.type,
          description: input.description,
          reportedById: auth.user.id,
        },
      });
      await this.audit.record(
        {
          action: 'incident.reported',
          entityType: 'event',
          entityId: eventId,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          // La descripción puede nombrar a personas: en la auditoría solo van los identificadores.
          after: {
            incidentId: incident.id,
            type: incident.type,
            athleteId: incident.athleteId,
            clubId: incident.clubId,
          },
        },
        tx,
      );
      await this.notifications.notify(tx, {
        userIds: await this.notifications.permissionUserIds(tx, 'cases:manage'),
        template: 'incident.reported',
        params: {
          match: participants.label,
          type: INCIDENT_TYPE_LABELS[input.type] ?? input.type,
        },
        entityType: 'incident',
        entityId: incident.id,
        link: '#/disciplina',
        excludeUserId: auth.user.id,
      });
      return incident;
    });
  }

  async list(query: {
    page: number;
    pageSize: number;
    eventId?: string;
    athleteId?: string;
    clubId?: string;
    championshipId?: string;
    unlinked: boolean;
  }): Promise<Page<unknown>> {
    const where: Prisma.EventIncidentWhereInput = {
      ...(query.eventId && { eventId: query.eventId }),
      ...(query.athleteId && { athleteId: query.athleteId }),
      ...(query.clubId && { clubId: query.clubId }),
      ...(query.championshipId && {
        event: { round: { stage: { championshipId: query.championshipId } } },
      }),
      ...(query.unlinked && { caseId: null }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.eventIncident.count({ where }),
      this.prisma.client.eventIncident.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          event: {
            include: {
              ...EVENT_LABEL_INCLUDE,
              round: {
                include: {
                  stage: {
                    include: {
                      championship: { select: { id: true, name: true } },
                    },
                  },
                },
              },
            },
          },
          athlete: {
            include: {
              person: { select: { firstName: true, lastName: true } },
            },
          },
          club: { select: { id: true, name: true } },
          reportedBy: { select: { displayName: true } },
        },
      }),
    ]);
    return {
      items: rows.map((i) => ({
        id: i.id,
        type: i.type,
        typeLabel: INCIDENT_TYPE_LABELS[i.type] ?? i.type,
        description: i.description,
        createdAt: i.createdAt,
        caseId: i.caseId,
        reportedBy: i.reportedBy.displayName,
        event: {
          id: i.event.id,
          scheduledAt: i.event.scheduledAt,
          match: describeParticipants(i.event).label,
        },
        championship: i.event.round.stage.championship,
        athlete: i.athlete
          ? {
              id: i.athlete.id,
              name: `${i.athlete.person.firstName} ${i.athlete.person.lastName}`,
            }
          : null,
        club: i.club,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
}
