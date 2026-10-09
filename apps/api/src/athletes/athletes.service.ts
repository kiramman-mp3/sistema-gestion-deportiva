import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { SecurityHashService } from '../auth/security-hash.service.js';
import { type Page, escapeLike, translateDbError } from '../catalogs/common.js';
import { ClubAccessService } from '../clubs/club-access.service.js';
import { normalizeKey } from '../common/keys.js';
import { PrismaService } from '../database/prisma.service.js';
import type {
  AthleteEligibility,
  ConsentType,
  PersonStatus,
  Prisma,
} from '../generated/prisma/client.js';
import {
  MAJORITY_AGE,
  PRIVATE_FIELDS,
  type PersonInput,
  ageOn,
  todayInGuayaquil,
} from '../people/people.schemas.js';
import {
  DUPLICATE_ID_MESSAGE,
  ID_KEY_CONSTRAINT,
  PersonsService,
  idKeyOf,
} from '../people/persons.service.js';
import type {
  CreateAthleteInput,
  CreateConsentInput,
  UpdateAthleteInput,
} from './athletes.schemas.js';

type Actor = Pick<AuthContext, 'user' | 'permissions'>;

export const READ_FULL = 'athletes:read_full';
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
export const athleteCode = (n: number) => `DEP-${String(n).padStart(6, '0')}`;

const ATHLETE_INCLUDE = {
  club: { select: { id: true, name: true } },
  person: {
    select: {
      firstName: true,
      lastName: true,
      birthDate: true,
      status: true,
      privateData: {
        select: {
          idType: true,
          idNumber: true,
          phone: true,
          guardianName: true,
          guardianRelation: true,
          guardianPhone: true,
        },
      },
    },
  },
} satisfies Prisma.AthleteInclude;

type AthleteRow = Prisma.AthleteGetPayload<{ include: typeof ATHLETE_INCLUDE }>;

/** Datos personales completos: solo con `athletes:read_full`. */
export interface AthleteFullData {
  birthDate: string | null;
  age: number | null;
  idType: string | null;
  idNumber: string | null;
  phone: string | null;
  guardianName: string | null;
  guardianRelation: string | null;
  guardianPhone: string | null;
}

export interface AthleteView {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  status: PersonStatus;
  eligibility: AthleteEligibility;
  publicProfile: boolean;
  club: { id: string; name: string };
  createdAt: Date;
  updatedAt: Date;
  /** Presente únicamente si el solicitante posee `athletes:read_full`. */
  full?: AthleteFullData;
}

export function toAthleteView(row: AthleteRow, full: boolean): AthleteView {
  const view: AthleteView = {
    id: row.id,
    code: athleteCode(row.codeNumber),
    firstName: row.person.firstName,
    lastName: row.person.lastName,
    status: row.person.status,
    eligibility: row.eligibility,
    publicProfile: row.publicProfile,
    club: row.club,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (full) {
    const p = row.person.privateData;
    const birth = iso(row.person.birthDate);
    view.full = {
      birthDate: birth,
      age: birth ? ageOn(birth, todayInGuayaquil()) : null,
      idType: p?.idType ?? null,
      idNumber: p?.idNumber ?? null,
      phone: p?.phone ?? null,
      guardianName: p?.guardianName ?? null,
      guardianRelation: p?.guardianRelation ?? null,
      guardianPhone: p?.guardianPhone ?? null,
    };
  }
  return view;
}

const ERRORS = {
  unique: {
    [ID_KEY_CONSTRAINT]: DUPLICATE_ID_MESSAGE,
    athletes_person_id_key: 'Esa persona ya está registrada como deportista',
  },
  inUse: 'El deportista tiene registros asociados',
};

@Injectable()
export class AthletesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hasher: SecurityHashService,
    @Inject(ClubAccessService) private readonly access: ClubAccessService,
    @Inject(PersonsService) private readonly persons: PersonsService,
  ) {}

  canSeeFull = (actor: Actor) => actor.permissions.has(READ_FULL);

  // ───────────────────────────── consulta ─────────────────────────────

  async list(
    actor: Actor,
    query: {
      page: number;
      pageSize: number;
      q?: string;
      clubId?: string;
      status?: PersonStatus;
      eligibility?: AthleteEligibility;
    },
  ): Promise<Page<AthleteView>> {
    const scope = await this.access.scope(actor);
    let clubWhere: Prisma.AthleteWhereInput['clubId'];
    if (scope === 'all') clubWhere = query.clubId;
    else
      clubWhere = {
        in: query.clubId ? scope.filter((id) => id === query.clubId) : scope,
      };

    const tokens = (query.q ?? '').split(/\s+/).filter(Boolean);
    const codeMatch = /^dep-?(\d{1,9})$/i.exec(query.q ?? '');
    const where: Prisma.AthleteWhereInput = {
      clubId: clubWhere,
      eligibility: query.eligibility,
      person: {
        status: query.status,
        ...(!codeMatch &&
          tokens.length > 0 && {
            AND: tokens.map((token) => ({
              OR: [
                {
                  firstName: {
                    contains: escapeLike(token),
                    mode: 'insensitive' as const,
                  },
                },
                {
                  lastName: {
                    contains: escapeLike(token),
                    mode: 'insensitive' as const,
                  },
                },
              ],
            })),
          }),
      },
      ...(codeMatch && { codeNumber: Number(codeMatch[1]) }),
    };

    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.athlete.findMany({
        where,
        include: ATHLETE_INCLUDE,
        orderBy: [
          { person: { lastName: 'asc' } },
          { person: { firstName: 'asc' } },
          { id: 'asc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.athlete.count({ where }),
    ]);
    const full = this.canSeeFull(actor);
    return {
      items: rows.map((r) => toAthleteView(r, full)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(actor: Actor, id: string): Promise<AthleteView> {
    const row = await this.load(this.prisma.client, actor, id);
    return toAthleteView(row, this.canSeeFull(actor));
  }

  // ───────────────────────────── alta y edición ─────────────────────────────

  async create(
    actor: Actor,
    input: CreateAthleteInput,
    ip: string,
  ): Promise<AthleteView> {
    this.assertMayWritePrivate(actor, input);
    try {
      const id = await this.prisma.client.$transaction(async (tx) => {
        await this.access.assertAccess(actor, input.clubId, tx);
        const club = await tx.club.findUnique({
          where: { id: input.clubId },
          select: { status: true },
        });
        if (club?.status !== 'activo') {
          throw new ConflictException(
            'Solo se pueden registrar deportistas en clubes activos',
          );
        }

        let personId: string;
        let reusedPerson = false;
        const existing =
          input.idType && input.idNumber
            ? await this.persons.findByDocument(
                tx,
                input.idType,
                input.idNumber,
              )
            : null;
        if (existing) {
          const already = await tx.athlete.findUnique({
            where: { personId: existing.personId },
            select: { id: true },
          });
          if (already)
            throw new ConflictException(
              'Ya existe un deportista registrado con ese documento',
            );
          personId = existing.personId;
          reusedPerson = true;
        } else {
          if (input.birthDate && !input.confirmDuplicate)
            await this.assertNoLikelyDuplicate(tx, input);
          personId = (await this.persons.create(tx, input)).id;
        }

        const athlete = await tx.athlete.create({
          data: { personId, clubId: input.clubId },
          select: { id: true },
        });
        await this.record(tx, actor, ip, 'athlete.create', athlete.id, {
          after: {
            clubId: input.clubId,
            personId,
            reusedPerson,
            duplicateConfirmed: input.confirmDuplicate === true,
            eligibility: 'pendiente',
          },
        });
        return athlete.id;
      });
      return await this.get(actor, id);
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async update(
    actor: Actor,
    id: string,
    input: UpdateAthleteInput,
    ip: string,
  ): Promise<AthleteView> {
    this.assertMayWritePrivate(actor, input);
    try {
      await this.prisma.client.$transaction(async (tx) => {
        const row = await this.load(tx, actor, id);
        await this.lockAthlete(tx, id);

        const changed: string[] = [];
        const person: Prisma.PersonUpdateInput = {};
        if (
          input.firstName !== undefined &&
          input.firstName !== row.person.firstName
        ) {
          person.firstName = input.firstName;
          changed.push('firstName');
        }
        if (
          input.lastName !== undefined &&
          input.lastName !== row.person.lastName
        ) {
          person.lastName = input.lastName;
          changed.push('lastName');
        }
        if (
          input.birthDate !== undefined &&
          input.birthDate !== iso(row.person.birthDate)
        ) {
          person.birthDate = input.birthDate
            ? new Date(`${input.birthDate}T00:00:00.000Z`)
            : null;
          changed.push('birthDate');
        }

        const priv = row.person.privateData;
        const privateChanges: Partial<PersonInput> = {};
        if (input.idNumber !== undefined && input.idType !== undefined) {
          const sameDoc =
            priv?.idType && priv.idNumber
              ? idKeyOf(priv.idType, priv.idNumber) ===
                idKeyOf(input.idType, input.idNumber)
              : false;
          if (!sameDoc) {
            const dup = await this.persons.findByDocument(
              tx,
              input.idType,
              input.idNumber,
            );
            this.persons.assertDocumentFree(dup, row.personId);
            privateChanges.idType = input.idType;
            privateChanges.idNumber = input.idNumber;
            changed.push('idNumber');
          }
        }
        for (const field of [
          'phone',
          'guardianName',
          'guardianRelation',
          'guardianPhone',
        ] as const) {
          const value = input[field];
          if (value === undefined || value === (priv?.[field] ?? null))
            continue;
          privateChanges[field] = value;
          changed.push(field);
        }
        if (changed.length === 0) return;

        if (Object.keys(person).length > 0)
          await tx.person.update({ where: { id: row.personId }, data: person });
        await this.persons.updatePrivate(tx, row.personId, privateChanges);

        // Cambiar la identidad o la fecha de nacimiento obliga a validar de nuevo la elegibilidad.
        const identityChanged = changed.some((f) =>
          ['firstName', 'lastName', 'birthDate', 'idNumber'].includes(f),
        );
        const resetEligibility =
          identityChanged && row.eligibility === 'habilitado';
        if (resetEligibility)
          await tx.athlete.update({
            where: { id },
            data: { eligibility: 'pendiente' },
          });

        // La auditoría registra QUÉ campos cambiaron, no los datos personales.
        await this.record(tx, actor, ip, 'athlete.update', id, {
          after: { changedFields: changed, eligibilityReset: resetEligibility },
        });
      });
      return await this.get(actor, id);
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async setStatus(
    actor: Actor,
    id: string,
    status: PersonStatus,
    reason: string,
    ip: string,
  ): Promise<AthleteView> {
    await this.prisma.client.$transaction(async (tx) => {
      const row = await this.load(tx, actor, id);
      await this.lockAthlete(tx, id);
      if (row.person.status === status) return;
      await tx.person.update({ where: { id: row.personId }, data: { status } });
      // Un deportista inactivo deja de ser público de inmediato.
      const unpublished = status === 'inactivo' && row.publicProfile;
      if (unpublished)
        await tx.athlete.update({
          where: { id },
          data: { publicProfile: false },
        });
      await this.record(
        tx,
        actor,
        ip,
        'athlete.status_change',
        id,
        {
          before: { status: row.person.status },
          after: { status, unpublished },
        },
        reason,
      );
    });
    return this.get(actor, id);
  }

  // ───────────────────────────── elegibilidad ─────────────────────────────

  /**
   * Habilitar a un deportista exige (regla provisional, hasta que se defina la
   * documentación de inscripción): persona activa, fecha de nacimiento registrada,
   * datos del tutor si es menor de edad y consentimiento de tratamiento de datos vigente.
   */
  async setEligibility(
    actor: Actor,
    id: string,
    eligibility: AthleteEligibility,
    reason: string,
    ip: string,
  ): Promise<AthleteView> {
    await this.prisma.client.$transaction(async (tx) => {
      const row = await this.load(tx, actor, id);
      await this.lockAthlete(tx, id);
      if (row.eligibility === eligibility) return;

      if (eligibility === 'habilitado') {
        const blockers = await this.eligibilityBlockers(tx, row);
        if (blockers.length > 0) {
          throw new ConflictException({
            statusCode: 409,
            message: `No se puede habilitar: ${blockers.join('; ')}`,
            blockers,
          });
        }
      }
      await tx.athlete.update({ where: { id }, data: { eligibility } });
      await this.record(
        tx,
        actor,
        ip,
        'athlete.eligibility_change',
        id,
        { before: { eligibility: row.eligibility }, after: { eligibility } },
        reason,
      );
    });
    return this.get(actor, id);
  }

  private async eligibilityBlockers(
    tx: Prisma.TransactionClient,
    row: AthleteRow,
  ): Promise<string[]> {
    const blockers: string[] = [];
    if (row.person.status !== 'activo')
      blockers.push('la persona está inactiva');
    const birth = iso(row.person.birthDate);
    if (!birth) {
      blockers.push('falta la fecha de nacimiento');
    } else if (ageOn(birth, todayInGuayaquil()) < MAJORITY_AGE) {
      const p = row.person.privateData;
      if (!p?.guardianName || !p.guardianRelation)
        blockers.push('es menor de edad y faltan los datos del tutor');
    }
    if (!(await this.activeConsent(tx, row.personId, 'tratamiento_datos'))) {
      blockers.push('falta el consentimiento de tratamiento de datos');
    }
    return blockers;
  }

  // ───────────────────────────── consentimientos ─────────────────────────────

  async listConsents(actor: Actor, id: string) {
    const row = await this.load(this.prisma.client, actor, id);
    const consents = await this.prisma.client.consentRecord.findMany({
      where: { personId: row.personId },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    });
    const now = Date.now();
    return consents.map((c) => ({
      id: c.id,
      type: c.type,
      status: c.status,
      purpose: c.purpose,
      grantedByName: c.grantedByName,
      grantedByRelation: c.grantedByRelation,
      recordedAt: c.recordedAt,
      expiresAt: c.expiresAt,
      revokedAt: c.revokedAt,
      revokeReason: c.revokeReason,
      active:
        c.status === 'otorgado' &&
        (!c.expiresAt || c.expiresAt.getTime() > now),
    }));
  }

  /**
   * Registra un consentimiento. Si la persona es menor de edad lo otorga un tutor
   * (nunca «propio»); si es mayor, lo otorga ella misma. Sin fecha de nacimiento no
   * se puede saber quién debe otorgarlo, así que se exige registrarla antes.
   */
  async addConsent(
    actor: Actor,
    id: string,
    input: CreateConsentInput,
    ip: string,
  ) {
    await this.prisma.client.$transaction(async (tx) => {
      const row = await this.load(tx, actor, id);
      await this.lockAthlete(tx, id);
      const birth = iso(row.person.birthDate);
      if (!birth) {
        throw this.fieldError(
          'grantedByRelation',
          'Registre primero la fecha de nacimiento: determina quién debe otorgar el consentimiento',
        );
      }
      const minor = ageOn(birth, todayInGuayaquil()) < MAJORITY_AGE;
      if (minor && input.grantedByRelation === 'propio') {
        throw this.fieldError(
          'grantedByRelation',
          'Es menor de edad: el consentimiento lo otorga su tutor (indique su parentesco)',
        );
      }
      if (!minor && input.grantedByRelation !== 'propio') {
        throw this.fieldError(
          'grantedByRelation',
          'Es mayor de edad: el consentimiento lo otorga la propia persona («propio»)',
        );
      }
      if (await this.activeConsent(tx, row.personId, input.type)) {
        throw new ConflictException(
          'Ya existe un consentimiento vigente de ese tipo: revóquelo antes de registrar otro',
        );
      }
      const expiresAt = input.expiresOn
        ? new Date(
            new Date(`${input.expiresOn}T00:00:00.000Z`).getTime() +
              (24 + 5) * 3_600_000,
          ) // fin del día en Guayaquil (UTC-5)
        : null;
      if (expiresAt && expiresAt.getTime() <= Date.now()) {
        throw this.fieldError('expiresOn', 'La fecha de vencimiento ya pasó');
      }
      const consent = await tx.consentRecord.create({
        data: {
          personId: row.personId,
          type: input.type,
          purpose: input.purpose ?? null,
          grantedByName: input.grantedByName,
          grantedByRelation: input.grantedByRelation,
          expiresAt,
          recordedById: actor.user.id,
        },
      });
      await this.record(tx, actor, ip, 'athlete.consent_recorded', id, {
        after: {
          consentId: consent.id,
          type: input.type,
          byGuardian: minor,
          expiresOn: input.expiresOn ?? null,
        },
      });
    });
    return this.listConsents(actor, id);
  }

  async revokeConsent(
    actor: Actor,
    id: string,
    consentId: string,
    reason: string,
    ip: string,
  ) {
    await this.prisma.client.$transaction(async (tx) => {
      const row = await this.load(tx, actor, id);
      await this.lockAthlete(tx, id);
      const consent = await tx.consentRecord.findFirst({
        where: { id: consentId, personId: row.personId },
      });
      if (!consent) throw new NotFoundException('Consentimiento no encontrado');
      if (consent.status === 'revocado')
        throw new ConflictException('El consentimiento ya fue revocado');

      await tx.consentRecord.update({
        where: { id: consentId },
        data: {
          status: 'revocado',
          revokedAt: new Date(),
          revokeReason: reason,
        },
      });
      // Retirar el consentimiento de publicación retira el perfil público de inmediato.
      const unpublished =
        consent.type === 'publicacion_perfil' && row.publicProfile;
      if (unpublished)
        await tx.athlete.update({
          where: { id },
          data: { publicProfile: false },
        });
      await this.record(
        tx,
        actor,
        ip,
        'athlete.consent_revoked',
        id,
        { before: { consentId, type: consent.type }, after: { unpublished } },
        reason,
      );
    });
    return this.listConsents(actor, id);
  }

  // ───────────────────────────── publicación ─────────────────────────────

  /** Publica o retira el perfil resumido. Publicar exige consentimiento vigente y persona activa. */
  async setPublication(
    actor: Actor,
    id: string,
    published: boolean,
    ip: string,
  ): Promise<AthleteView> {
    await this.prisma.client.$transaction(async (tx) => {
      const row = await this.load(tx, actor, id);
      await this.lockAthlete(tx, id);
      if (row.publicProfile === published) return;
      if (published) {
        if (row.person.status !== 'activo')
          throw new ConflictException('El deportista está inactivo');
        if (
          !(await this.activeConsent(tx, row.personId, 'publicacion_perfil'))
        ) {
          throw new ConflictException(
            'No se puede publicar sin un consentimiento de publicación de perfil vigente',
          );
        }
      }
      await tx.athlete.update({
        where: { id },
        data: { publicProfile: published },
      });
      await this.record(
        tx,
        actor,
        ip,
        published ? 'athlete.published' : 'athlete.unpublished',
        id,
        {
          before: { publicProfile: !published },
          after: { publicProfile: published },
        },
      );
    });
    return this.get(actor, id);
  }

  /**
   * Perfil público resumido (sin sesión). Solo si hay marca de publicación, persona
   * activa y consentimiento vigente EN ESTE MOMENTO (se vuelve a comprobar al leer, por
   * si el consentimiento venció). Nunca incluye fecha de nacimiento, documento ni contacto.
   */
  async publicProfile(id: string) {
    const row = await this.prisma.client.athlete.findUnique({
      where: { id },
      include: {
        club: { select: { name: true, slug: true, status: true } },
        person: { select: { firstName: true, lastName: true, status: true } },
      },
    });
    const visible =
      row &&
      row.publicProfile &&
      row.person.status === 'activo' &&
      row.club.status === 'activo' &&
      (await this.activeConsent(
        this.prisma.client,
        row.personId,
        'publicacion_perfil',
      ));
    if (!row || !visible) throw new NotFoundException('Perfil no disponible');
    return {
      id: row.id,
      displayName: `${row.person.firstName} ${row.person.lastName}`,
      club: { name: row.club.name, slug: row.club.slug },
    };
  }

  // ───────────────────────────── internos ─────────────────────────────

  private assertMayWritePrivate(actor: Actor, input: object): void {
    const present = PRIVATE_FIELDS.some(
      (f) => (input as Record<string, unknown>)[f] !== undefined,
    );
    if (present && !this.canSeeFull(actor)) {
      throw new ForbiddenException(
        'Registrar o modificar documento, teléfono o datos del tutor requiere el permiso de datos personales completos',
      );
    }
  }

  private fieldError(field: string, message: string) {
    return new BadRequestException({
      statusCode: 400,
      message: 'Solicitud inválida',
      errors: [{ field, message }],
    });
  }

  /** Carga un deportista dentro del alcance del actor; fuera de él responde 404. */
  private async load(
    client: Prisma.TransactionClient | PrismaService['client'],
    actor: Actor,
    id: string,
  ) {
    const row = await client.athlete.findUnique({
      where: { id },
      include: ATHLETE_INCLUDE,
    });
    if (
      !row ||
      !(await this.access.canAccess(
        actor,
        row.clubId,
        client as Prisma.TransactionClient,
      ))
    ) {
      throw new NotFoundException('Deportista no encontrado');
    }
    return row;
  }

  /** Bloquea la fila del deportista para serializar consentimientos, publicación y elegibilidad. */
  private async lockAthlete(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM athletes WHERE id = ${id}::uuid FOR UPDATE`;
  }

  private async activeConsent(
    client: Prisma.TransactionClient | PrismaService['client'],
    personId: string,
    type: ConsentType,
  ) {
    return client.consentRecord.findFirst({
      where: {
        personId,
        type,
        status: 'otorgado',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
  }

  /** Mismo nombre y misma fecha de nacimiento que otra persona: probable duplicado. */
  private async assertNoLikelyDuplicate(
    tx: Prisma.TransactionClient,
    input: CreateAthleteInput,
  ): Promise<void> {
    const sameBirth = await tx.person.findMany({
      where: { birthDate: new Date(`${input.birthDate}T00:00:00.000Z`) },
      select: { firstName: true, lastName: true },
    });
    const key = normalizeKey(`${input.firstName} ${input.lastName}`);
    if (
      sameBirth.some(
        (p) => normalizeKey(`${p.firstName} ${p.lastName}`) === key,
      )
    ) {
      throw new ConflictException({
        statusCode: 409,
        code: 'posible_duplicado',
        message:
          'Ya existe una persona con el mismo nombre y fecha de nacimiento. Si es otra persona, repita el registro confirmando que no es un duplicado.',
      });
    }
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
        entityType: 'athlete',
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
