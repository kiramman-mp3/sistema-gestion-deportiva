import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { SecurityHashService } from '../auth/security-hash.service.js';
import { PrivilegesService } from '../authz/privileges.service.js';
import { translateDbError } from '../catalogs/common.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  ID_KEY_CONSTRAINT,
  DUPLICATE_ID_MESSAGE,
  PersonsService,
} from '../people/persons.service.js';
import { ClubAccessService } from './club-access.service.js';
import type { AddRepresentativeInput } from './clubs.schemas.js';

type Actor = Pick<AuthContext, 'user' | 'permissions'>;

const toDate = (v: string) => new Date(`${v}T00:00:00.000Z`);
const fromDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export interface RepresentativeView {
  id: string;
  roleName: string;
  validFrom: string;
  validUntil: string | null;
  /** `true` si la representación está vigente hoy. */
  active: boolean;
  person: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
  };
}

const ERRORS = {
  unique: { [ID_KEY_CONSTRAINT]: DUPLICATE_ID_MESSAGE },
  inUse: 'El registro está en uso',
};

/** Representantes de un club y vínculos entre usuarios y clubes (alcance). */
@Injectable()
export class ClubMembersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hasher: SecurityHashService,
    @Inject(ClubAccessService) private readonly access: ClubAccessService,
    @Inject(PersonsService) private readonly persons: PersonsService,
    @Inject(PrivilegesService) private readonly privileges: PrivilegesService,
  ) {}

  // ───────────────────────────── representantes ─────────────────────────────

  async listRepresentatives(
    actor: Actor,
    clubId: string,
  ): Promise<RepresentativeView[]> {
    await this.access.assertAccess(actor, clubId);
    const rows = await this.prisma.client.clubRepresentative.findMany({
      where: { clubId },
      orderBy: [{ validFrom: 'desc' }, { id: 'desc' }],
      include: {
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            privateData: { select: { phone: true } },
          },
        },
      },
    });
    const today = new Date().toISOString().slice(0, 10);
    return rows.map((r) => {
      const until = fromDate(r.validUntil);
      return {
        id: r.id,
        roleName: r.roleName,
        validFrom: fromDate(r.validFrom)!,
        validUntil: until,
        active:
          fromDate(r.validFrom)! <= today && (until === null || until >= today),
        person: {
          id: r.person.id,
          firstName: r.person.firstName,
          lastName: r.person.lastName,
          phone: r.person.privateData?.phone ?? null,
        },
      };
    });
  }

  async addRepresentative(
    actor: Actor,
    clubId: string,
    input: AddRepresentativeInput,
    ip: string,
  ): Promise<RepresentativeView> {
    try {
      const id = await this.prisma.client.$transaction(async (tx) => {
        await this.access.assertAccess(actor, clubId, tx);

        // Si el documento ya está registrado, se reutiliza esa persona (no se duplica).
        let personId: string;
        const existing =
          input.idType && input.idNumber
            ? await this.persons.findByDocument(
                tx,
                input.idType,
                input.idNumber,
              )
            : null;
        if (existing) {
          personId = existing.personId;
        } else {
          personId = (
            await this.persons.create(tx, {
              firstName: input.firstName,
              lastName: input.lastName,
              idType: input.idType,
              idNumber: input.idNumber,
              phone: input.phone,
            })
          ).id;
        }

        const rep = await tx.clubRepresentative.create({
          data: {
            clubId,
            personId,
            roleName: input.roleName,
            validFrom: toDate(input.validFrom),
            validUntil: input.validUntil ? toDate(input.validUntil) : null,
          },
        });
        await this.record(tx, actor, ip, 'club.representative_added', clubId, {
          after: {
            representativeId: rep.id,
            personId,
            roleName: input.roleName,
            validFrom: input.validFrom,
            validUntil: input.validUntil ?? null,
            reusedPerson: existing !== null,
          },
        });
        return rep.id;
      });
      return (await this.listRepresentatives(actor, clubId)).find(
        (r) => r.id === id,
      )!;
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async updateRepresentative(
    actor: Actor,
    clubId: string,
    repId: string,
    input: { roleName?: string; validUntil?: string | null },
    ip: string,
  ): Promise<RepresentativeView> {
    await this.prisma.client.$transaction(async (tx) => {
      await this.access.assertAccess(actor, clubId, tx);
      const current = await tx.clubRepresentative.findFirst({
        where: { id: repId, clubId },
      });
      if (!current) throw new NotFoundException('Representante no encontrado');

      const validUntil =
        input.validUntil === undefined
          ? current.validUntil
          : input.validUntil
            ? toDate(input.validUntil)
            : null;
      if (validUntil && validUntil < current.validFrom) {
        throw new ConflictException(
          'El fin de la representación no puede ser anterior a su inicio',
        );
      }
      const roleName = input.roleName ?? current.roleName;
      if (
        roleName === current.roleName &&
        fromDate(validUntil) === fromDate(current.validUntil)
      )
        return;

      await tx.clubRepresentative.update({
        where: { id: repId },
        data: { roleName, validUntil },
      });
      await this.record(tx, actor, ip, 'club.representative_updated', clubId, {
        before: {
          representativeId: repId,
          roleName: current.roleName,
          validUntil: fromDate(current.validUntil),
        },
        after: {
          representativeId: repId,
          roleName,
          validUntil: fromDate(validUntil),
        },
      });
    });
    return (await this.listRepresentatives(actor, clubId)).find(
      (r) => r.id === repId,
    )!;
  }

  /** Eliminación de un registro erróneo (excepción): exige acceso a todos los clubes. */
  async removeRepresentative(
    actor: Actor,
    clubId: string,
    repId: string,
    ip: string,
  ): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      await this.access.assertAccess(actor, clubId, tx);
      const current = await tx.clubRepresentative.findFirst({
        where: { id: repId, clubId },
      });
      if (!current) throw new NotFoundException('Representante no encontrado');
      await tx.clubRepresentative.delete({ where: { id: repId } });
      await this.record(tx, actor, ip, 'club.representative_removed', clubId, {
        before: {
          representativeId: repId,
          personId: current.personId,
          roleName: current.roleName,
        },
      });
    });
  }

  // ───────────────────────────── usuarios vinculados ─────────────────────────────

  async listUsers(actor: Actor, clubId: string) {
    await this.access.assertAccess(actor, clubId);
    const links = await this.prisma.client.clubUser.findMany({
      where: { clubId },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        user: {
          select: { id: true, email: true, displayName: true, status: true },
        },
      },
    });
    return links.map((l) => ({ ...l.user, linkedAt: l.createdAt }));
  }

  /**
   * Vincula un usuario a un club: desde ese momento, sus permisos de clubes, deportistas
   * y equipos se aplican a ese club. Nadie se vincula a sí mismo.
   */
  async linkUser(
    actor: Actor,
    clubId: string,
    userId: string,
    ip: string,
  ): Promise<void> {
    this.privileges.assertNotSelf(
      actor.user.id,
      userId,
      'No puede modificar sus propios vínculos con clubes',
    );
    await this.prisma.client.$transaction(async (tx) => {
      await this.privileges.lock(tx);
      await this.access.assertAccess(actor, clubId, tx);
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, status: true },
      });
      if (!user) throw new NotFoundException('Usuario no encontrado');
      if (user.status === 'inactivo' || user.status === 'bloqueado') {
        throw new ConflictException(
          'No se puede vincular una cuenta desactivada o bloqueada',
        );
      }
      const existing = await tx.clubUser.findUnique({
        where: { clubId_userId: { clubId, userId } },
      });
      if (existing)
        throw new ConflictException('El usuario ya está vinculado a este club');

      await tx.clubUser.create({
        data: { clubId, userId, createdById: actor.user.id },
      });
      await this.record(tx, actor, ip, 'club.user_linked', clubId, {
        after: { userId },
      });
    });
  }

  async unlinkUser(
    actor: Actor,
    clubId: string,
    userId: string,
    ip: string,
  ): Promise<void> {
    this.privileges.assertNotSelf(
      actor.user.id,
      userId,
      'No puede modificar sus propios vínculos con clubes',
    );
    await this.prisma.client.$transaction(async (tx) => {
      await this.privileges.lock(tx);
      await this.access.assertAccess(actor, clubId, tx);
      const existing = await tx.clubUser.findUnique({
        where: { clubId_userId: { clubId, userId } },
      });
      if (!existing)
        throw new NotFoundException('El usuario no está vinculado a este club');
      await tx.clubUser.delete({
        where: { clubId_userId: { clubId, userId } },
      });
      await this.record(tx, actor, ip, 'club.user_unlinked', clubId, {
        before: { userId },
      });
    });
  }

  private record(
    tx: Prisma.TransactionClient,
    actor: Actor,
    ip: string,
    action: string,
    clubId: string,
    change: { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue },
  ) {
    return this.audit.record(
      {
        userId: actor.user.id,
        action,
        entityType: 'club',
        entityId: clubId,
        before: change.before,
        after: change.after,
        ipHash: this.hasher.hash('ip', ip),
      },
      tx,
    );
  }
}
