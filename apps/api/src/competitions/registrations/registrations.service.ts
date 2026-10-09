import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { SecurityHashService } from '../../auth/security-hash.service.js';
import { translateDbError } from '../../catalogs/common.js';
import { ClubAccessService } from '../../clubs/club-access.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import type {
  CreateRegistrationInput,
  ReviewRegistrationInput,
} from './registrations.schemas.js';

@Injectable()
export class RegistrationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hash: SecurityHashService,
    @Inject(ClubAccessService) private readonly clubAccess: ClubAccessService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  async list(championshipId: string, auth: AuthContext) {
    const champ = await this.prisma.client.championship.findUnique({
      where: { id: championshipId },
    });
    if (!champ) throw new NotFoundException('Campeonato no encontrado');

    const registrations = await this.prisma.client.registration.findMany({
      where: { championshipId },
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
                        birthDate: true,
                      },
                    },
                    club: { select: { id: true, name: true, shortName: true } },
                  },
                },
              },
            },
          },
        },
        reviewedBy: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (this.clubAccess.hasGlobalAccess(auth)) {
      return registrations;
    }

    const filtered = [];
    for (const r of registrations) {
      if (r.participant.team) {
        if (
          await this.clubAccess.canAccess(auth, r.participant.team.team.clubId)
        ) {
          filtered.push(r);
        }
      } else if (r.participant.individual) {
        if (
          await this.clubAccess.canAccess(
            auth,
            r.participant.individual.athlete.clubId,
          )
        ) {
          filtered.push(r);
        }
      }
    }
    return filtered;
  }

  async create(
    championshipId: string,
    auth: AuthContext,
    ip: string,
    input: CreateRegistrationInput,
  ) {
    const champ = await this.prisma.client.championship.findUnique({
      where: { id: championshipId },
      include: {
        category: true,
        sport: true,
        season: true,
      },
    });
    if (!champ) throw new NotFoundException('Campeonato no encontrado');

    if (champ.status === 'archivado' || champ.status === 'finalizado') {
      throw new BadRequestException('El campeonato no admite inscripciones');
    }

    let participantId: string;
    let participantLabel = '';

    if (input.kind === 'equipo') {
      const team = await this.prisma.client.team.findUnique({
        where: { id: input.teamId! },
        include: { club: true },
      });
      if (!team) throw new NotFoundException('Equipo no encontrado');
      if (team.status !== 'activo') {
        throw new BadRequestException('El equipo no está activo');
      }
      if (team.sportId !== champ.sportId) {
        throw new BadRequestException(
          'El deporte del equipo no coincide con el deporte del campeonato',
        );
      }
      await this.clubAccess.assertAccess(auth, team.clubId);
      participantLabel = `${team.name} (${team.club.name})`;

      const existingPart = await this.prisma.client.teamParticipant.findUnique({
        where: { teamId: team.id },
      });

      if (existingPart) {
        participantId = existingPart.participantId;
      } else {
        const p = await this.prisma.client.participant.create({
          data: {
            kind: 'equipo',
            team: { create: { teamId: team.id } },
          },
        });
        participantId = p.id;
      }
    } else {
      const athlete = await this.prisma.client.athlete.findUnique({
        where: { id: input.athleteId! },
        include: { person: true, club: true },
      });
      if (!athlete) throw new NotFoundException('Deportista no encontrado');
      await this.clubAccess.assertAccess(auth, athlete.clubId);
      participantLabel = `${athlete.person.firstName} ${athlete.person.lastName}`;

      // Validación de edad según categoría
      if (
        athlete.person.birthDate &&
        (champ.category.ageMin !== null || champ.category.ageMax !== null)
      ) {
        const refDate = champ.season.startDate;
        const birth = athlete.person.birthDate;
        let age = refDate.getFullYear() - birth.getFullYear();
        const m = refDate.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && refDate.getDate() < birth.getDate())) age--;

        if (champ.category.ageMin !== null && age < champ.category.ageMin) {
          throw new BadRequestException(
            `El deportista tiene ${age} años, menor a la edad mínima (${champ.category.ageMin}) de la categoría`,
          );
        }
        if (champ.category.ageMax !== null && age > champ.category.ageMax) {
          throw new BadRequestException(
            `El deportista tiene ${age} años, mayor a la edad máxima (${champ.category.ageMax}) de la categoría`,
          );
        }
      }

      const existingPart =
        await this.prisma.client.individualParticipant.findUnique({
          where: { athleteId: athlete.id },
        });

      if (existingPart) {
        participantId = existingPart.participantId;
      } else {
        const p = await this.prisma.client.participant.create({
          data: {
            kind: 'individual',
            individual: { create: { athleteId: athlete.id } },
          },
        });
        participantId = p.id;
      }
    }

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const registration = await tx.registration.create({
          data: {
            championshipId,
            participantId,
            notes: input.notes,
            status: 'pendiente',
          },
          include: {
            participant: true,
          },
        });

        await this.audit.record(
          {
            action: 'registration.created',
            entityType: 'registration',
            entityId: registration.id,
            userId: auth.user.id,
            ipHash: this.hash.hash('ip', ip),
            after: {
              championshipId,
              participantId,
              participantLabel,
              status: registration.status,
            },
          },
          tx,
        );

        return registration;
      });
    } catch (error) {
      translateDbError(error, {
        unique: {
          registrations_championship_id_participant_id_key:
            'El participante ya se encuentra inscrito en este campeonato',
        },
        inUse: 'La inscripción está en uso',
      });
    }
  }

  async review(
    championshipId: string,
    registrationId: string,
    auth: AuthContext,
    ip: string,
    input: ReviewRegistrationInput,
  ) {
    const reg = await this.prisma.client.registration.findUnique({
      where: { id: registrationId },
      include: {
        championship: { select: { name: true } },
        participant: {
          include: {
            team: { include: { team: true } },
            individual: { include: { athlete: { include: { person: true } } } },
          },
        },
      },
    });
    if (!reg || reg.championshipId !== championshipId) {
      throw new NotFoundException('Inscripción no encontrada');
    }

    return await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.registration.update({
        where: { id: registrationId },
        data: {
          status: input.status,
          reviewedById: auth.user.id,
          reviewedAt: new Date(),
          reviewNotes: input.reviewNotes,
        },
      });

      await this.audit.record(
        {
          action: 'registration.status_changed',
          entityType: 'registration',
          entityId: registrationId,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          reason: input.reviewNotes,
          before: { status: reg.status },
          after: { status: updated.status },
        },
        tx,
      );

      if (updated.status !== reg.status) {
        const team = reg.participant.team?.team;
        const athlete = reg.participant.individual?.athlete;
        const clubId = team?.clubId ?? athlete?.clubId;
        await this.notifications.notify(tx, {
          userIds: clubId
            ? await this.notifications.clubUserIds(tx, [clubId])
            : [],
          template: 'registration.reviewed',
          params: {
            participant: team
              ? team.name
              : athlete
                ? `${athlete.person.firstName} ${athlete.person.lastName}`
                : 'Participante',
            championship: reg.championship.name,
            status: updated.status,
            notes: input.reviewNotes,
          },
          entityType: 'registration',
          entityId: registrationId,
          link: `#/campeonatos/${championshipId}`,
          excludeUserId: auth.user.id,
        });
      }

      return updated;
    });
  }

  async delete(
    championshipId: string,
    registrationId: string,
    auth: AuthContext,
    ip: string,
  ) {
    const reg = await this.prisma.client.registration.findUnique({
      where: { id: registrationId },
    });
    if (!reg || reg.championshipId !== championshipId) {
      throw new NotFoundException('Inscripción no encontrada');
    }

    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.registration.delete({ where: { id: registrationId } });

        await this.audit.record(
          {
            action: 'registration.deleted',
            entityType: 'registration',
            entityId: registrationId,
            userId: auth.user.id,
            ipHash: this.hash.hash('ip', ip),
            before: { championshipId, participantId: reg.participantId },
          },
          tx,
        );
      });
    } catch (error) {
      translateDbError(error, {
        unique: {},
        inUse:
          'No se puede eliminar la inscripción porque ya tiene partidos asignados',
      });
    }
  }
}
