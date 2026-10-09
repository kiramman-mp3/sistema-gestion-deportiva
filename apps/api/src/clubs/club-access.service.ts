import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

export const ACCESS_ALL = 'clubs:access_all';

type Actor = Pick<AuthContext, 'user' | 'permissions'>;

/**
 * Alcance por club. Los permisos (`teams:manage`, `athletes:read`…) dicen QUÉ puede
 * hacer un usuario; este servicio dice EN QUÉ clubes:
 *  - con `clubs:access_all` → en todos;
 *  - sin él → solo en los clubes con los que tiene un vínculo (`club_users`).
 * Un club fuera del alcance responde como «no encontrado» (no revela que existe).
 */
@Injectable()
export class ClubAccessService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  hasGlobalAccess(actor: Actor): boolean {
    return actor.permissions.has(ACCESS_ALL);
  }

  /** `'all'` o la lista de clubes accesibles (puede estar vacía). */
  async scope(
    actor: Actor,
    tx?: Prisma.TransactionClient,
  ): Promise<'all' | string[]> {
    if (this.hasGlobalAccess(actor)) return 'all';
    const client = tx ?? this.prisma.client;
    const links = await client.clubUser.findMany({
      where: { userId: actor.user.id },
      select: { clubId: true },
    });
    return links.map((l) => l.clubId);
  }

  /** Filtro Prisma por `clubId` según el alcance del actor. */
  async clubFilter(
    actor: Actor,
    tx?: Prisma.TransactionClient,
  ): Promise<{ clubId?: { in: string[] } }> {
    const scope = await this.scope(actor, tx);
    return scope === 'all' ? {} : { clubId: { in: scope } };
  }

  async canAccess(
    actor: Actor,
    clubId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    if (this.hasGlobalAccess(actor)) return true;
    const client = tx ?? this.prisma.client;
    const link = await client.clubUser.findUnique({
      where: { clubId_userId: { clubId, userId: actor.user.id } },
      select: { clubId: true },
    });
    return link !== null;
  }

  async assertAccess(
    actor: Actor,
    clubId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (!(await this.canAccess(actor, clubId, tx))) {
      throw new NotFoundException('Club no encontrado');
    }
  }
}
