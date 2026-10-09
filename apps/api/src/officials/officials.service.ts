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
import {
  changedFields,
  escapeLike,
  type Page,
  translateDbError,
} from '../catalogs/common.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  CreateOfficialInput,
  OfficialListQuery,
  UpdateOfficialInput,
} from './officials.schemas.js';

const OFFICIAL_INCLUDE = {
  person: { select: { firstName: true, lastName: true } },
  club: { select: { id: true, name: true } },
  sports: {
    include: { sport: { select: { id: true, code: true, name: true } } },
  },
  user: { select: { email: true, displayName: true } },
} satisfies Prisma.OfficialInclude;

type OfficialRow = Prisma.OfficialGetPayload<{
  include: typeof OFFICIAL_INCLUDE;
}>;

@Injectable()
export class OfficialsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hash: SecurityHashService,
  ) {}

  /**
   * Vista de un oficial. El teléfono solo lo ven quienes gestionan oficiales o designaciones
   * (necesitan localizarlo); la cuenta vinculada solo la ve quien gestiona oficiales.
   */
  view(row: OfficialRow, actor: AuthContext) {
    const canContact =
      actor.permissions.has('officials:manage') ||
      actor.permissions.has('assignments:manage');
    return {
      id: row.id,
      firstName: row.person.firstName,
      lastName: row.person.lastName,
      status: row.status,
      licenseNumber: row.licenseNumber,
      club: row.club,
      sports: row.sports.map((s) => s.sport),
      hasAccount: row.userId !== null,
      ...(canContact && { phone: row.phone }),
      ...(actor.permissions.has('officials:manage') && {
        account: row.user
          ? { email: row.user.email, displayName: row.user.displayName }
          : null,
      }),
      createdAt: row.createdAt,
    };
  }

  async list(
    query: OfficialListQuery,
    actor: AuthContext,
  ): Promise<Page<ReturnType<OfficialsService['view']>>> {
    const where: Prisma.OfficialWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.sportId && { sports: { some: { sportId: query.sportId } } }),
      ...(query.q && {
        person: {
          OR: [
            {
              firstName: { contains: escapeLike(query.q), mode: 'insensitive' },
            },
            {
              lastName: { contains: escapeLike(query.q), mode: 'insensitive' },
            },
          ],
        },
      }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.official.count({ where }),
      this.prisma.client.official.findMany({
        where,
        include: OFFICIAL_INCLUDE,
        orderBy: [
          { person: { lastName: 'asc' } },
          { person: { firstName: 'asc' } },
          { id: 'asc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((r) => this.view(r, actor)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getRow(id: string, tx?: Prisma.TransactionClient) {
    const row = await (tx ?? this.prisma.client).official.findUnique({
      where: { id },
      include: OFFICIAL_INCLUDE,
    });
    if (!row) throw new NotFoundException('Oficial no encontrado');
    return row;
  }

  async get(id: string, actor: AuthContext) {
    const row = await this.getRow(id);
    const now = new Date();
    const [unavailabilities, upcoming] = await Promise.all([
      this.prisma.client.officialUnavailability.findMany({
        where: { officialId: id, endsAt: { gte: now } },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.client.eventAssignment.count({
        where: {
          officialId: id,
          status: { not: 'rechazado' },
          event: {
            scheduledAt: { gte: now },
            status: { notIn: ['finalizado', 'cancelado'] },
          },
        },
      }),
    ]);
    return {
      ...this.view(row, actor),
      unavailabilities,
      upcomingAssignments: upcoming,
    };
  }

  // ───────────────────── Altas y cambios ─────────────────────

  private async assertSports(
    tx: Prisma.TransactionClient,
    sportIds: string[],
  ): Promise<void> {
    const found = await tx.sport.findMany({
      where: { id: { in: sportIds }, status: 'activo' },
      select: { id: true },
    });
    if (found.length !== new Set(sportIds).size) {
      throw new BadRequestException(
        'Alguno de los deportes no existe o está inactivo',
      );
    }
  }

  private async assertClub(
    tx: Prisma.TransactionClient,
    clubId: string | null | undefined,
  ): Promise<void> {
    if (!clubId) return;
    const club = await tx.club.findUnique({
      where: { id: clubId },
      select: { id: true },
    });
    if (!club) throw new BadRequestException('El club no existe');
  }

  /** Resuelve el correo de una cuenta activa que aún no esté vinculada a otro oficial. */
  private async resolveAccount(
    tx: Prisma.TransactionClient,
    email: string,
    exceptOfficialId?: string,
  ): Promise<string> {
    const user = await tx.user.findUnique({
      where: { email },
      select: { id: true, status: true, official: { select: { id: true } } },
    });
    if (!user || user.status !== 'activo') {
      throw new BadRequestException(
        'No existe una cuenta activa con ese correo',
      );
    }
    if (user.official && user.official.id !== exceptOfficialId) {
      throw new ConflictException(
        'Esa cuenta ya está vinculada a otro oficial',
      );
    }
    return user.id;
  }

  async create(auth: AuthContext, ip: string, input: CreateOfficialInput) {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        await this.assertSports(tx, input.sportIds);
        await this.assertClub(tx, input.clubId);

        let personId = input.personId;
        if (personId) {
          const person = await tx.person.findUnique({
            where: { id: personId },
            select: { status: true },
          });
          if (!person) throw new NotFoundException('Persona no encontrada');
          if (person.status !== 'activo') {
            throw new BadRequestException('La persona está inactiva');
          }
        } else {
          personId = (
            await tx.person.create({
              data: { firstName: input.firstName!, lastName: input.lastName! },
              select: { id: true },
            })
          ).id;
        }
        const userId = input.userEmail
          ? await this.resolveAccount(tx, input.userEmail)
          : null;

        const official = await tx.official.create({
          data: {
            personId,
            userId,
            clubId: input.clubId ?? null,
            licenseNumber: input.licenseNumber ?? null,
            phone: input.phone ?? null,
            sports: { create: input.sportIds.map((sportId) => ({ sportId })) },
          },
        });
        await this.audit.record(
          {
            action: 'official.created',
            entityType: 'official',
            entityId: official.id,
            userId: auth.user.id,
            ipHash: this.hash.hash('ip', ip),
            after: {
              personId,
              clubId: official.clubId,
              sportIds: input.sportIds,
              linkedAccount: userId !== null,
            },
          },
          tx,
        );
        return this.view(await this.getRow(official.id, tx), auth);
      });
    } catch (error) {
      translateDbError(error, {
        unique: {
          officials_person_id_key:
            'Esa persona ya está registrada como oficial',
          officials_user_id_key: 'Esa cuenta ya está vinculada a otro oficial',
        },
        inUse: 'El oficial está en uso',
      });
    }
  }

  async update(
    id: string,
    auth: AuthContext,
    ip: string,
    input: UpdateOfficialInput,
  ) {
    const current = await this.getRow(id);
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        if (input.sportIds) await this.assertSports(tx, input.sportIds);
        if (input.clubId !== undefined) await this.assertClub(tx, input.clubId);
        const userId =
          input.userEmail === undefined
            ? undefined
            : input.userEmail === null
              ? null
              : await this.resolveAccount(tx, input.userEmail, id);

        if (input.firstName !== undefined || input.lastName !== undefined) {
          await tx.person.update({
            where: { id: current.personId },
            data: {
              ...(input.firstName !== undefined && {
                firstName: input.firstName,
              }),
              ...(input.lastName !== undefined && { lastName: input.lastName }),
            },
          });
        }
        if (input.sportIds) {
          await tx.officialSport.deleteMany({ where: { officialId: id } });
          await tx.officialSport.createMany({
            data: input.sportIds.map((sportId) => ({
              officialId: id,
              sportId,
            })),
          });
        }
        await tx.official.update({
          where: { id },
          data: {
            ...(input.clubId !== undefined && { clubId: input.clubId }),
            ...(input.status !== undefined && { status: input.status }),
            ...(input.licenseNumber !== undefined && {
              licenseNumber: input.licenseNumber,
            }),
            ...(input.phone !== undefined && { phone: input.phone }),
            ...(userId !== undefined && { userId }),
          },
        });
        const updated = await this.getRow(id, tx);

        const snapshot = (row: OfficialRow) => ({
          firstName: row.person.firstName,
          lastName: row.person.lastName,
          status: row.status,
          clubId: row.clubId,
          licenseNumber: row.licenseNumber,
          sports: row.sports
            .map((s) => s.sportId)
            .sort()
            .join(','),
          linkedAccount: row.userId !== null,
        });
        const diff = changedFields(snapshot(current), snapshot(updated));
        if (diff) {
          await this.audit.record(
            {
              action: 'official.updated',
              entityType: 'official',
              entityId: id,
              userId: auth.user.id,
              ipHash: this.hash.hash('ip', ip),
              before: diff.before,
              after: diff.after,
            },
            tx,
          );
        }
        return this.view(updated, auth);
      });
    } catch (error) {
      translateDbError(error, {
        unique: {
          officials_user_id_key: 'Esa cuenta ya está vinculada a otro oficial',
        },
        inUse: 'El oficial está en uso',
      });
    }
  }

  async delete(id: string, auth: AuthContext, ip: string) {
    const current = await this.getRow(id);
    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.official.delete({ where: { id } });
        // La persona creada solo para este oficial se elimina con él; si tiene otro papel se conserva.
        const [athlete, consents, representations] = await Promise.all([
          tx.athlete.count({ where: { personId: current.personId } }),
          tx.consentRecord.count({ where: { personId: current.personId } }),
          tx.clubRepresentative.count({
            where: { personId: current.personId },
          }),
        ]);
        if (athlete + consents + representations === 0) {
          await tx.person.delete({ where: { id: current.personId } });
        }
        await this.audit.record(
          {
            action: 'official.deleted',
            entityType: 'official',
            entityId: id,
            userId: auth.user.id,
            ipHash: this.hash.hash('ip', ip),
            before: {
              firstName: current.person.firstName,
              lastName: current.person.lastName,
            },
          },
          tx,
        );
      });
    } catch (error) {
      translateDbError(error, {
        unique: {},
        inUse:
          'No se puede eliminar: el oficial tiene designaciones. Desactívelo para conservar su historial',
      });
    }
  }

  // ───────────────────── Disponibilidad e historial ─────────────────────

  async addUnavailability(
    id: string,
    auth: AuthContext,
    ip: string,
    input: { startsAt: string; endsAt: string; reason?: string | null },
  ) {
    await this.getRow(id);
    return this.prisma.client.$transaction(async (tx) => {
      const created = await tx.officialUnavailability.create({
        data: {
          officialId: id,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          reason: input.reason ?? null,
        },
      });
      await this.audit.record(
        {
          action: 'official.unavailability_added',
          entityType: 'official',
          entityId: id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          after: { startsAt: input.startsAt, endsAt: input.endsAt },
        },
        tx,
      );
      return created;
    });
  }

  async removeUnavailability(
    id: string,
    unavailabilityId: string,
    auth: AuthContext,
    ip: string,
  ) {
    const found = await this.prisma.client.officialUnavailability.findFirst({
      where: { id: unavailabilityId, officialId: id },
    });
    if (!found) throw new NotFoundException('Período no encontrado');
    await this.prisma.client.$transaction(async (tx) => {
      await tx.officialUnavailability.delete({
        where: { id: unavailabilityId },
      });
      await this.audit.record(
        {
          action: 'official.unavailability_removed',
          entityType: 'official',
          entityId: id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          before: { startsAt: found.startsAt, endsAt: found.endsAt },
        },
        tx,
      );
    });
  }

  /** Historial de participación: todas las designaciones del oficial, de la más reciente a la más antigua. */
  async history(id: string, query: { page: number; pageSize: number }) {
    await this.getRow(id);
    const where: Prisma.EventAssignmentWhereInput = { officialId: id };
    const [total, rows] = await Promise.all([
      this.prisma.client.eventAssignment.count({ where }),
      this.prisma.client.eventAssignment.findMany({
        where,
        orderBy: [{ event: { scheduledAt: 'desc' } }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          event: {
            include: {
              round: {
                include: {
                  stage: {
                    include: {
                      championship: {
                        select: {
                          id: true,
                          name: true,
                          sport: { select: { name: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);
    return {
      items: rows.map((a) => ({
        id: a.id,
        role: a.role,
        status: a.status,
        event: {
          id: a.event.id,
          scheduledAt: a.event.scheduledAt,
          status: a.event.status,
        },
        championship: {
          id: a.event.round.stage.championship.id,
          name: a.event.round.stage.championship.name,
          sport: a.event.round.stage.championship.sport.name,
        },
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
}
