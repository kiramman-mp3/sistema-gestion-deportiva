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
  type Page,
  changedFields,
  escapeLike,
  translateDbError,
} from '../catalogs/common.js';
import { normalizeKey, slugify } from '../common/keys.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Club, ClubStatus, Prisma } from '../generated/prisma/client.js';
import { ClubAccessService } from './club-access.service.js';
import type { CreateClubInput, UpdateClubInput } from './clubs.schemas.js';

type Actor = Pick<AuthContext, 'user' | 'permissions'>;

export interface ClubView {
  id: string;
  name: string;
  shortName: string | null;
  slug: string;
  code: string | null;
  sector: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: ClubStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ERRORS = {
  unique: {
    clubs_name_key_key: 'Ya existe un club con ese nombre',
    clubs_slug_key: 'Ya existe un club con ese identificador público',
    clubs_code_key: 'Ya existe un club con ese código institucional',
  },
  inUse:
    'El club tiene deportistas, equipos o representantes y no puede eliminarse. Archívelo en su lugar.',
};

const toView = (c: Club): ClubView => ({
  id: c.id,
  name: c.name,
  shortName: c.shortName,
  slug: c.slug,
  code: c.code,
  sector: c.sector,
  contactEmail: c.contactEmail,
  contactPhone: c.contactPhone,
  status: c.status,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

const snapshot = (c: Club) => ({
  name: c.name,
  shortName: c.shortName,
  code: c.code,
  sector: c.sector,
  contactEmail: c.contactEmail,
  contactPhone: c.contactPhone,
  status: c.status,
});

@Injectable()
export class ClubsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hasher: SecurityHashService,
    @Inject(ClubAccessService) private readonly access: ClubAccessService,
  ) {}

  async list(
    actor: Actor,
    query: { page: number; pageSize: number; q?: string; status?: ClubStatus },
  ): Promise<Page<ClubView>> {
    const scope = await this.access.scope(actor);
    const where: Prisma.ClubWhereInput = {
      status: query.status,
      ...(scope !== 'all' && { id: { in: scope } }),
      ...(query.q && {
        OR: [
          { name: { contains: escapeLike(query.q), mode: 'insensitive' } },
          { shortName: { contains: escapeLike(query.q), mode: 'insensitive' } },
          { code: { contains: escapeLike(query.q), mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.club.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.club.count({ where }),
    ]);
    return {
      items: items.map(toView),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(actor: Actor, id: string): Promise<ClubView> {
    await this.access.assertAccess(actor, id);
    const club = await this.prisma.client.club.findUnique({ where: { id } });
    if (!club) throw new NotFoundException('Club no encontrado');
    return toView(club);
  }

  async create(
    actor: Actor,
    input: CreateClubInput,
    ip: string,
  ): Promise<ClubView> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const club = await tx.club.create({
          data: {
            name: input.name,
            nameKey: normalizeKey(input.name),
            slug: await this.uniqueSlug(tx, input.name),
            shortName: input.shortName ?? null,
            code: input.code ?? null,
            sector: input.sector ?? null,
            contactEmail: input.contactEmail ?? null,
            contactPhone: input.contactPhone ?? null,
          },
        });
        await this.record(tx, actor, ip, 'club.create', club.id, {
          after: snapshot(club),
        });
        return toView(club);
      });
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async update(
    actor: Actor,
    id: string,
    input: UpdateClubInput,
    ip: string,
  ): Promise<ClubView> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        await this.access.assertAccess(actor, id, tx);
        const current = await tx.club.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Club no encontrado');

        const next = {
          name: input.name ?? current.name,
          shortName:
            input.shortName === undefined ? current.shortName : input.shortName,
          code: input.code === undefined ? current.code : input.code,
          sector: input.sector === undefined ? current.sector : input.sector,
          contactEmail:
            input.contactEmail === undefined
              ? current.contactEmail
              : input.contactEmail,
          contactPhone:
            input.contactPhone === undefined
              ? current.contactPhone
              : input.contactPhone,
        };
        const diff = changedFields(snapshot(current), {
          ...snapshot(current),
          ...next,
        });
        if (!diff) return toView(current);

        const updated = await tx.club.update({
          where: { id },
          data: { ...next, nameKey: normalizeKey(next.name) },
        });
        await this.record(tx, actor, ip, 'club.update', id, diff);
        return toView(updated);
      });
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async setStatus(
    actor: Actor,
    id: string,
    status: ClubStatus,
    reason: string,
    ip: string,
  ): Promise<ClubView> {
    return this.prisma.client.$transaction(async (tx) => {
      await this.access.assertAccess(actor, id, tx);
      const current = await tx.club.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Club no encontrado');
      if (current.status === status) return toView(current);

      const updated = await tx.club.update({ where: { id }, data: { status } });
      await this.record(
        tx,
        actor,
        ip,
        'club.status_change',
        id,
        { before: { status: current.status }, after: { status } },
        reason,
      );
      return toView(updated);
    });
  }

  /** Solo se elimina un club sin deportistas, equipos ni representantes (FK RESTRICT). */
  async remove(actor: Actor, id: string, ip: string): Promise<void> {
    try {
      await this.prisma.client.$transaction(async (tx) => {
        await this.access.assertAccess(actor, id, tx);
        const current = await tx.club.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Club no encontrado');
        await tx.club.delete({ where: { id } });
        await this.record(tx, actor, ip, 'club.delete', id, {
          before: snapshot(current),
        });
      });
    } catch (error) {
      translateDbError(error, ERRORS);
    }
  }

  // ───────────────────────────── internos ─────────────────────────────

  /** `slug`, `slug-2`, `slug-3`… hasta encontrar uno libre (el índice único es la red de seguridad). */
  private async uniqueSlug(
    tx: Prisma.TransactionClient,
    name: string,
  ): Promise<string> {
    const base = slugify(name) || 'club';
    for (let n = 1; n < 1000; n++) {
      const candidate = n === 1 ? base : `${base}-${n}`;
      const taken = await tx.club.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw new ConflictException(
      'No se pudo generar un identificador público único',
    );
  }

  private record(
    tx: Prisma.TransactionClient,
    actor: Actor,
    ip: string,
    action: string,
    entityId: string,
    change: { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue },
    reason?: string,
  ) {
    return this.audit.record(
      {
        userId: actor.user.id,
        action,
        entityType: 'club',
        entityId,
        before: change.before,
        after: change.after,
        reason,
        ipHash: this.hasher.hash('ip', ip),
      },
      tx,
    );
  }
}
