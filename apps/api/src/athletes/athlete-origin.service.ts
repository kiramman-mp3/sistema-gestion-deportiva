import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { SecurityHashService } from '../auth/security-hash.service.js';
import { ClubAccessService } from '../clubs/club-access.service.js';
import { PrismaService } from '../database/prisma.service.js';
import {
  CIVIL_REGISTRY,
  type CivilRegistry,
  type CivilRegistryRecord,
} from '../people/civil-registry.js';
import { PersonsService } from '../people/persons.service.js';
import type {
  AthleteLookupInput,
  OriginLinksInput,
} from './athletes.schemas.js';
import { AthletesService, READ_FULL, athleteCode } from './athletes.service.js';

type Actor = Pick<AuthContext, 'user' | 'permissions'>;

export type LookupExisting =
  | {
      kind: 'athlete';
      /** Sin acceso al club, solo se informa a qué club pertenece. */
      athlete: {
        id: string;
        code: string;
        firstName: string;
        lastName: string;
      } | null;
      club: { name: string };
    }
  | {
      kind: 'person';
      firstName: string;
      lastName: string;
      birthDate: string | null;
    };

export interface LookupResult {
  existing: LookupExisting | null;
  registry: { configured: boolean; record: CivilRegistryRecord | null };
}

const LINK_SELECT = {
  id: true,
  kind: true,
  relatedName: true,
  relatedIdNumber: true,
  birthPlace: true,
  source: true,
  updatedAt: true,
} as const;

/**
 * Búsqueda por documento antes de registrar a un deportista y vínculos con Quero
 * (requisito para jugar). Ambos manejan datos privados: exigen `athletes:read_full`.
 */
@Injectable()
export class AthleteOriginService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hasher: SecurityHashService,
    @Inject(ClubAccessService) private readonly access: ClubAccessService,
    @Inject(PersonsService) private readonly persons: PersonsService,
    @Inject(AthletesService) private readonly athletes: AthletesService,
    @Inject(CIVIL_REGISTRY) private readonly registry: CivilRegistry,
  ) {}

  async lookup(actor: Actor, input: AthleteLookupInput): Promise<LookupResult> {
    this.assertFull(actor);
    const client = this.prisma.client;
    const registry = {
      configured: this.registry.configured,
      record: null as CivilRegistryRecord | null,
    };
    const found = await this.persons.findByDocument(
      client,
      input.idType,
      input.idNumber,
    );
    if (found) {
      const person = await client.person.findUniqueOrThrow({
        where: { id: found.personId },
        select: {
          firstName: true,
          lastName: true,
          birthDate: true,
          athlete: {
            select: {
              id: true,
              clubId: true,
              codeNumber: true,
              club: { select: { name: true } },
            },
          },
        },
      });
      if (person.athlete) {
        const a = person.athlete;
        const visible = await this.access.canAccess(actor, a.clubId, client);
        return {
          existing: {
            kind: 'athlete',
            athlete: visible
              ? {
                  id: a.id,
                  code: athleteCode(a.codeNumber),
                  firstName: person.firstName,
                  lastName: person.lastName,
                }
              : null,
            club: a.club,
          },
          registry,
        };
      }
      return {
        existing: {
          kind: 'person',
          firstName: person.firstName,
          lastName: person.lastName,
          birthDate: person.birthDate?.toISOString().slice(0, 10) ?? null,
        },
        registry,
      };
    }
    if (input.idType === 'cedula' && this.registry.configured) {
      registry.record = await this.registry.findByCedula(input.idNumber);
    }
    return { existing: null, registry };
  }

  /** Lectura: quien ve datos completos o quien decide la habilitación. */
  async listLinks(actor: Actor, athleteId: string) {
    if (
      !actor.permissions.has(READ_FULL) &&
      !actor.permissions.has('athletes:validate')
    ) {
      throw new ForbiddenException(
        'Necesita permiso para ver datos personales completos o validar deportistas',
      );
    }
    await this.athletes.get(actor, athleteId);
    return this.prisma.client.athleteOriginLink.findMany({
      where: { athleteId },
      select: LINK_SELECT,
      orderBy: { kind: 'asc' },
    });
  }

  async replaceLinks(
    actor: Actor,
    athleteId: string,
    input: OriginLinksInput,
    ip: string,
  ) {
    this.assertFull(actor);
    await this.athletes.get(actor, athleteId);
    await this.prisma.client.$transaction(async (tx) => {
      const before = await tx.athleteOriginLink.findMany({
        where: { athleteId },
        select: { kind: true },
      });
      await tx.athleteOriginLink.deleteMany({ where: { athleteId } });
      await tx.athleteOriginLink.createMany({
        data: input.links.map((l) => ({
          athleteId,
          kind: l.kind,
          relatedName: l.kind === 'nacimiento' ? null : (l.relatedName ?? null),
          relatedIdNumber:
            l.kind === 'nacimiento' ? null : (l.relatedIdNumber ?? null),
          birthPlace: l.birthPlace ?? null,
        })),
      });
      // Solo los tipos: nombres y documentos de familiares no van a la auditoría.
      await this.audit.record(
        {
          userId: actor.user.id,
          action: 'athlete.origin_links',
          entityType: 'athlete',
          entityId: athleteId,
          before: { kinds: before.map((l) => l.kind) },
          after: { kinds: input.links.map((l) => l.kind) },
          ipHash: this.hasher.hash('ip', ip),
        },
        tx,
      );
    });
    return this.listLinks(actor, athleteId);
  }

  private assertFull(actor: Actor): void {
    if (!actor.permissions.has(READ_FULL)) {
      throw new ForbiddenException(
        'Necesita permiso para ver datos personales completos',
      );
    }
  }
}
