import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { SecurityHashService } from '../../auth/security-hash.service.js';
import {
  changedFields,
  escapeLike,
  type Page,
  translateDbError,
} from '../../catalogs/common.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  CreateVenueInput,
  UpdateVenueInput,
  VenueListQuery,
} from './venues.schemas.js';

@Injectable()
export class VenuesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hash: SecurityHashService,
  ) {}

  async list(query: VenueListQuery): Promise<Page<unknown>> {
    const where: Prisma.VenueWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.q && {
        name: { contains: escapeLike(query.q), mode: 'insensitive' },
      }),
    };

    const [total, items] = await Promise.all([
      this.prisma.client.venue.count({ where }),
      this.prisma.client.venue.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(id: string) {
    const venue = await this.prisma.client.venue.findUnique({ where: { id } });
    if (!venue) throw new NotFoundException('Escenario no encontrado');
    return venue;
  }

  async create(auth: AuthContext, ip: string, input: CreateVenueInput) {
    const existing = await this.prisma.client.venue.findFirst({
      where: { name: { equals: input.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException('Ya existe un escenario con ese nombre');
    }

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const venue = await tx.venue.create({
          data: {
            name: input.name,
            address: input.address,
            capacity: input.capacity,
          },
        });

        await this.audit.record(
          {
            action: 'venue.created',
            entityType: 'venue',
            entityId: venue.id,
            userId: auth.user.id,
            ipHash: this.hash.hash('ip', ip),
            after: {
              name: venue.name,
              address: venue.address,
              capacity: venue.capacity,
            },
          },
          tx,
        );

        return venue;
      });
    } catch (error) {
      translateDbError(error, {
        unique: { venues_name_key: 'Ya existe un escenario con ese nombre' },
        inUse: 'El escenario está en uso',
      });
    }
  }

  async update(
    id: string,
    auth: AuthContext,
    ip: string,
    input: UpdateVenueInput,
  ) {
    const current = await this.get(id);

    if (input.name && input.name.toLowerCase() !== current.name.toLowerCase()) {
      const existing = await this.prisma.client.venue.findFirst({
        where: {
          name: { equals: input.name, mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictException('Ya existe un escenario con ese nombre');
      }
    }

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const updated = await tx.venue.update({
          where: { id },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.address !== undefined && { address: input.address }),
            ...(input.capacity !== undefined && { capacity: input.capacity }),
            ...(input.status !== undefined && { status: input.status }),
          },
        });

        const diff = changedFields(
          {
            name: current.name,
            address: current.address,
            capacity: current.capacity,
            status: current.status,
          },
          {
            name: updated.name,
            address: updated.address,
            capacity: updated.capacity,
            status: updated.status,
          },
        );

        if (diff) {
          await this.audit.record(
            {
              action: 'venue.updated',
              entityType: 'venue',
              entityId: id,
              userId: auth.user.id,
              ipHash: this.hash.hash('ip', ip),
              before: diff.before,
              after: diff.after,
            },
            tx,
          );
        }

        return updated;
      });
    } catch (error) {
      translateDbError(error, {
        unique: { venues_name_key: 'Ya existe un escenario con ese nombre' },
        inUse: 'El escenario está en uso',
      });
    }
  }

  async delete(id: string, auth: AuthContext, ip: string) {
    const current = await this.get(id);
    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.venue.delete({ where: { id } });

        await this.audit.record(
          {
            action: 'venue.deleted',
            entityType: 'venue',
            entityId: id,
            userId: auth.user.id,
            ipHash: this.hash.hash('ip', ip),
            before: { name: current.name },
          },
          tx,
        );
      });
    } catch (error) {
      translateDbError(error, {
        unique: {},
        inUse: 'No se puede eliminar el escenario porque tiene partidos o eventos asociados',
      });
    }
  }
}
