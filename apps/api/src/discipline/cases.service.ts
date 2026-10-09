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
import { changedFields, escapeLike, type Page } from '../catalogs/common.js';
import { PrismaService } from '../database/prisma.service.js';
import type { CaseEntryKind, Prisma } from '../generated/prisma/client.js';
import { InstitutionService } from '../institution/institution.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  caseCode,
  INCIDENT_TYPE_LABELS,
  isSanctionActive,
  mentionsAnyName,
  SANCTION_TYPE_LABELS,
} from './discipline.helpers.js';
import type { CaseListQuery, CreateCaseInput } from './discipline.schemas.js';

const CASE_LIST_INCLUDE = {
  championship: { select: { id: true, name: true } },
  club: { select: { id: true, name: true } },
  reviewer: { select: { id: true, displayName: true } },
  _count: { select: { incidents: true, complaints: true, sanctions: true } },
} satisfies Prisma.DisciplinaryCaseInclude;

type CaseListRow = Prisma.DisciplinaryCaseGetPayload<{
  include: typeof CASE_LIST_INCLUDE;
}>;

@Injectable()
export class CasesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hash: SecurityHashService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
    @Inject(InstitutionService)
    private readonly institution: InstitutionService,
  ) {}

  private listView(row: CaseListRow) {
    return {
      id: row.id,
      code: caseCode(row.caseNumber),
      subject: row.subject,
      status: row.status,
      openedAt: row.openedAt,
      resolvedAt: row.resolvedAt,
      publishedAt: row.publishedAt,
      championship: row.championship,
      club: row.club,
      reviewer: row.reviewer,
      counts: row._count,
    };
  }

  private async load(id: string, tx?: Prisma.TransactionClient) {
    const row = await (tx ?? this.prisma.client).disciplinaryCase.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Expediente no encontrado');
    return row;
  }

  private async entry(
    tx: Prisma.TransactionClient,
    caseId: string,
    kind: CaseEntryKind,
    body: string,
    authorId: string,
  ) {
    return tx.caseEntry.create({ data: { caseId, kind, body, authorId } });
  }

  // ───────────────────── Consulta ─────────────────────

  async list(query: CaseListQuery): Promise<Page<unknown>> {
    const codeMatch = query.q ? /^exp-?0*(\d+)$/i.exec(query.q) : null;
    const where: Prisma.DisciplinaryCaseWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.reviewerId && { reviewerId: query.reviewerId }),
      ...(query.clubId && { clubId: query.clubId }),
      ...(query.championshipId && { championshipId: query.championshipId }),
      ...(query.published !== undefined && {
        publishedAt: query.published ? { not: null } : null,
      }),
      ...(query.q && {
        OR: [
          { subject: { contains: escapeLike(query.q), mode: 'insensitive' } },
          ...(codeMatch ? [{ caseNumber: Number(codeMatch[1]) }] : []),
        ],
      }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.disciplinaryCase.count({ where }),
      this.prisma.client.disciplinaryCase.findMany({
        where,
        include: CASE_LIST_INCLUDE,
        orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((r) => this.listView(r)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /** Usuarios activos que pueden revisar expedientes (tienen `cases:read`): candidatos a revisor. */
  async reviewerCandidates() {
    return this.prisma.client.user.findMany({
      where: {
        status: 'activo',
        roles: {
          some: {
            role: {
              permissions: { some: { permission: { code: 'cases:read' } } },
            },
          },
        },
      },
      select: { id: true, displayName: true },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      take: 200,
    });
  }

  async get(id: string) {
    const row = await this.prisma.client.disciplinaryCase.findUnique({
      where: { id },
      include: {
        ...CASE_LIST_INCLUDE,
        openedBy: { select: { displayName: true } },
        resolvedBy: { select: { displayName: true } },
        publishedBy: { select: { displayName: true } },
        event: { select: { id: true, scheduledAt: true } },
        entries: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { author: { select: { displayName: true } } },
        },
        incidents: {
          orderBy: { createdAt: 'asc' },
          include: {
            athlete: {
              include: {
                person: { select: { firstName: true, lastName: true } },
              },
            },
            club: { select: { name: true } },
          },
        },
        complaints: {
          orderBy: { submittedAt: 'asc' },
          include: { club: { select: { id: true, name: true } } },
        },
        sanctions: {
          orderBy: { createdAt: 'asc' },
          include: {
            athlete: {
              include: {
                person: { select: { firstName: true, lastName: true } },
              },
            },
            team: { select: { id: true, name: true } },
            club: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Expediente no encontrado');
    return {
      ...this.listView(row),
      description: row.description,
      resolution: row.resolution,
      resolvedBy: row.resolvedBy?.displayName ?? null,
      openedBy: row.openedBy.displayName,
      publication: row.publishedAt
        ? {
            publishedAt: row.publishedAt,
            publishedBy: row.publishedBy?.displayName ?? null,
            publicTitle: row.publicTitle,
            publicSummary: row.publicSummary,
          }
        : null,
      event: row.event,
      entries: row.entries.map((e) => ({
        id: e.id,
        kind: e.kind,
        body: e.body,
        author: e.author.displayName,
        createdAt: e.createdAt,
      })),
      incidents: row.incidents.map((i) => ({
        id: i.id,
        type: i.type,
        typeLabel: INCIDENT_TYPE_LABELS[i.type] ?? i.type,
        description: i.description,
        createdAt: i.createdAt,
        athlete: i.athlete
          ? `${i.athlete.person.firstName} ${i.athlete.person.lastName}`
          : null,
        club: i.club?.name ?? null,
      })),
      complaints: row.complaints.map((c) => ({
        id: c.id,
        subject: c.subject,
        status: c.status,
        club: c.club,
      })),
      sanctions: row.sanctions.map((s) => ({
        id: s.id,
        type: s.type,
        typeLabel: SANCTION_TYPE_LABELS[s.type] ?? s.type,
        reason: s.reason,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        matchesCount: s.matchesCount,
        points: s.points,
        status: s.status,
        statusReason: s.statusReason,
        isActive: isSanctionActive(s),
        athlete: s.athlete
          ? `${s.athlete.person.firstName} ${s.athlete.person.lastName}`
          : null,
        team: s.team,
        club: s.club,
      })),
    };
  }

  // ───────────────────── Apertura y cambios ─────────────────────

  async create(auth: AuthContext, ip: string, input: CreateCaseInput) {
    return this.prisma.client.$transaction(async (tx) => {
      if (input.championshipId) {
        const found = await tx.championship.findUnique({
          where: { id: input.championshipId },
          select: { id: true },
        });
        if (!found) throw new NotFoundException('Campeonato no encontrado');
      }
      if (input.clubId) {
        const found = await tx.club.findUnique({
          where: { id: input.clubId },
          select: { id: true },
        });
        if (!found) throw new NotFoundException('Club no encontrado');
      }
      if (input.eventId) {
        const event = await tx.event.findUnique({
          where: { id: input.eventId },
          select: {
            round: { select: { stage: { select: { championshipId: true } } } },
          },
        });
        if (!event) throw new NotFoundException('Partido no encontrado');
        if (
          input.championshipId &&
          event.round.stage.championshipId !== input.championshipId
        ) {
          throw new BadRequestException(
            'El partido no pertenece al campeonato',
          );
        }
      }

      const incidentIds = [...new Set(input.incidentIds ?? [])];
      const complaintIds = [...new Set(input.complaintIds ?? [])];
      if (incidentIds.length > 0) {
        const free = await tx.eventIncident.count({
          where: { id: { in: incidentIds }, caseId: null },
        });
        if (free !== incidentIds.length) {
          throw new ConflictException(
            'Alguna incidencia no existe o ya pertenece a un expediente',
          );
        }
      }
      if (complaintIds.length > 0) {
        const free = await tx.complaint.count({
          where: { id: { in: complaintIds }, caseId: null, status: 'recibido' },
        });
        if (free !== complaintIds.length) {
          throw new ConflictException(
            'Algún reclamo no existe, ya fue atendido o ya tiene expediente',
          );
        }
      }

      const created = await tx.disciplinaryCase.create({
        data: {
          subject: input.subject,
          description: input.description,
          championshipId: input.championshipId ?? null,
          eventId: input.eventId ?? null,
          clubId: input.clubId ?? null,
          openedById: auth.user.id,
        },
      });
      const code = caseCode(created.caseNumber);
      await this.entry(
        tx,
        created.id,
        'apertura',
        `Expediente ${code} abierto: ${input.subject}`,
        auth.user.id,
      );
      if (incidentIds.length > 0) {
        await tx.eventIncident.updateMany({
          where: { id: { in: incidentIds } },
          data: { caseId: created.id },
        });
      }
      if (complaintIds.length > 0) {
        await tx.complaint.updateMany({
          where: { id: { in: complaintIds } },
          data: { caseId: created.id, status: 'en_revision' },
        });
      }
      await this.audit.record(
        {
          action: 'case.opened',
          entityType: 'case',
          entityId: created.id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          after: {
            code,
            championshipId: created.championshipId,
            eventId: created.eventId,
            clubId: created.clubId,
            incidents: incidentIds.length,
            complaints: complaintIds.length,
          },
        },
        tx,
      );
      return { id: created.id, code };
    });
  }

  async update(
    id: string,
    auth: AuthContext,
    ip: string,
    input: { subject?: string; description?: string },
  ) {
    const current = await this.load(id);
    if (!['abierto', 'en_revision'].includes(current.status)) {
      throw new ConflictException(
        'Un expediente resuelto o archivado no se modifica; reábralo para corregirlo',
      );
    }
    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.disciplinaryCase.update({
        where: { id },
        data: {
          ...(input.subject !== undefined && { subject: input.subject }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
        },
      });
      const diff = changedFields(
        { subject: current.subject, description: current.description },
        { subject: updated.subject, description: updated.description },
      );
      if (diff) {
        await this.entry(
          tx,
          id,
          'nota',
          `Se modificaron los datos del expediente (${Object.keys(diff.after).join(', ')})`,
          auth.user.id,
        );
        await this.audit.record(
          {
            action: 'case.updated',
            entityType: 'case',
            entityId: id,
            userId: auth.user.id,
            ipHash: this.hash.hash('ip', ip),
            before: { fields: Object.keys(diff.before) },
            after: { fields: Object.keys(diff.after) },
          },
          tx,
        );
      }
      return { id: updated.id, code: caseCode(updated.caseNumber) };
    });
  }

  async assignReviewer(
    id: string,
    auth: AuthContext,
    ip: string,
    reviewerId: string,
  ) {
    const current = await this.load(id);
    if (['resuelto', 'archivado'].includes(current.status)) {
      throw new ConflictException(
        'No se asigna revisor a un expediente resuelto o archivado',
      );
    }
    return this.prisma.client.$transaction(async (tx) => {
      const reviewer = await tx.user.findFirst({
        where: {
          id: reviewerId,
          status: 'activo',
          roles: {
            some: {
              role: {
                permissions: { some: { permission: { code: 'cases:read' } } },
              },
            },
          },
        },
        select: { id: true, displayName: true },
      });
      if (!reviewer) {
        throw new BadRequestException(
          'El revisor debe ser un usuario activo con acceso a expedientes',
        );
      }
      await tx.disciplinaryCase.update({
        where: { id },
        data: { reviewerId, status: 'en_revision' },
      });
      await this.entry(
        tx,
        id,
        'asignacion',
        `Revisor asignado: ${reviewer.displayName}`,
        auth.user.id,
      );
      await this.audit.record(
        {
          action: 'case.reviewer_assigned',
          entityType: 'case',
          entityId: id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          before: { reviewerId: current.reviewerId },
          after: { reviewerId },
        },
        tx,
      );
      await this.notifications.notify(tx, {
        userIds: [reviewerId],
        template: 'case.assigned',
        params: {
          number: caseCode(current.caseNumber),
          subject: current.subject,
        },
        entityType: 'case',
        entityId: id,
        link: `#/disciplina/${id}`,
        excludeUserId: auth.user.id,
      });
      return { id, reviewer };
    });
  }

  async addEntry(
    id: string,
    auth: AuthContext,
    ip: string,
    kind: 'nota' | 'recurso' | 'notificacion',
    body: string,
  ) {
    const current = await this.load(id);
    if (current.status === 'archivado') {
      throw new ConflictException('El expediente está archivado');
    }
    return this.prisma.client.$transaction(async (tx) => {
      const entry = await this.entry(tx, id, kind, body, auth.user.id);
      await this.audit.record(
        {
          action: 'case.entry_added',
          entityType: 'case',
          entityId: id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          after: { entryId: entry.id, kind },
        },
        tx,
      );
      return { id: entry.id, kind, body, createdAt: entry.createdAt };
    });
  }

  // ───────────────────── Decisión ─────────────────────

  async resolve(id: string, auth: AuthContext, ip: string, resolution: string) {
    const current = await this.load(id);
    if (!['abierto', 'en_revision'].includes(current.status)) {
      throw new ConflictException(
        'Solo se resuelven expedientes abiertos o en revisión',
      );
    }
    return this.prisma.client.$transaction(async (tx) => {
      const now = new Date();
      await tx.disciplinaryCase.update({
        where: { id },
        data: {
          status: 'resuelto',
          resolution,
          resolvedAt: now,
          resolvedById: auth.user.id,
        },
      });
      await this.entry(tx, id, 'decision', resolution, auth.user.id);

      const complaints = await tx.complaint.findMany({
        where: { caseId: id, status: 'en_revision' },
        select: { id: true, subject: true, submittedById: true },
      });
      await tx.complaint.updateMany({
        where: { id: { in: complaints.map((c) => c.id) } },
        data: { status: 'resuelto', resolvedAt: now },
      });
      for (const complaint of complaints) {
        await this.notifications.notify(tx, {
          userIds: [complaint.submittedById],
          template: 'complaint.updated',
          params: { subject: complaint.subject, status: 'resuelto' },
          entityType: 'complaint',
          entityId: complaint.id,
          link: '#/disciplina',
          excludeUserId: auth.user.id,
        });
      }
      await this.audit.record(
        {
          action: 'case.resolved',
          entityType: 'case',
          entityId: id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          before: { status: current.status },
          after: { status: 'resuelto', complaintsResolved: complaints.length },
        },
        tx,
      );
      return { id, status: 'resuelto' as const };
    });
  }

  async reopen(id: string, auth: AuthContext, ip: string, reason: string) {
    const current = await this.load(id);
    if (current.status !== 'resuelto') {
      throw new ConflictException('Solo se reabre un expediente resuelto');
    }
    return this.prisma.client.$transaction(async (tx) => {
      await tx.disciplinaryCase.update({
        where: { id },
        data: {
          status: 'en_revision',
          resolution: null,
          resolvedAt: null,
          resolvedById: null,
          publishedAt: null,
          publishedById: null,
        },
      });
      await this.entry(
        tx,
        id,
        'reapertura',
        `Expediente reabierto: ${reason}. Resolución anterior: ${current.resolution ?? '—'}${
          current.publishedAt ? ' (se retiró su publicación)' : ''
        }`,
        auth.user.id,
      );
      await tx.complaint.updateMany({
        where: { caseId: id, status: 'resuelto' },
        data: { status: 'en_revision', resolvedAt: null },
      });
      await this.audit.record(
        {
          action: 'case.reopened',
          entityType: 'case',
          entityId: id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          before: {
            status: current.status,
            wasPublished: !!current.publishedAt,
          },
          after: { status: 'en_revision' },
          reason,
        },
        tx,
      );
      return { id, status: 'en_revision' as const };
    });
  }

  async archive(id: string, auth: AuthContext, ip: string, reason: string) {
    const current = await this.load(id);
    if (current.status !== 'resuelto') {
      throw new ConflictException('Solo se archiva un expediente resuelto');
    }
    return this.prisma.client.$transaction(async (tx) => {
      await tx.disciplinaryCase.update({
        where: { id },
        data: { status: 'archivado' },
      });
      await this.entry(
        tx,
        id,
        'archivo',
        `Expediente archivado: ${reason}`,
        auth.user.id,
      );
      await this.audit.record(
        {
          action: 'case.archived',
          entityType: 'case',
          entityId: id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          before: { status: current.status },
          after: { status: 'archivado' },
          reason,
        },
        tx,
      );
      return { id, status: 'archivado' as const };
    });
  }

  // ───────────────────── Publicación ─────────────────────

  async publish(
    id: string,
    auth: AuthContext,
    ip: string,
    input: { publicTitle: string; publicSummary: string },
  ) {
    const current = await this.prisma.client.disciplinaryCase.findUnique({
      where: { id },
      include: {
        incidents: {
          include: { athlete: { include: { person: true } } },
        },
        sanctions: {
          include: { athlete: { include: { person: true } } },
        },
        complaints: { select: { submittedById: true, clubId: true } },
        club: { select: { id: true } },
      },
    });
    if (!current) throw new NotFoundException('Expediente no encontrado');
    if (current.status !== 'resuelto') {
      throw new ConflictException('Solo se publica un expediente resuelto');
    }

    const people = [
      ...current.incidents.flatMap((i) =>
        i.athlete ? [i.athlete.person] : [],
      ),
      ...current.sanctions.flatMap((s) =>
        s.athlete ? [s.athlete.person] : [],
      ),
    ];
    const named = mentionsAnyName(
      `${input.publicTitle} ${input.publicSummary}`,
      people,
    );
    if (named) {
      throw new BadRequestException(
        'El texto público no debe mencionar por su nombre a deportistas del expediente. Redáctelo sin datos personales',
      );
    }

    return this.prisma.client.$transaction(async (tx) => {
      await tx.disciplinaryCase.update({
        where: { id },
        data: {
          publicTitle: input.publicTitle,
          publicSummary: input.publicSummary,
          publishedAt: new Date(),
          publishedById: auth.user.id,
        },
      });
      await this.entry(
        tx,
        id,
        'publicacion',
        `Resolución publicada en el portal: ${input.publicTitle}`,
        auth.user.id,
      );
      const clubIds = new Set<string>();
      if (current.club) clubIds.add(current.club.id);
      for (const c of current.complaints) clubIds.add(c.clubId);
      for (const s of current.sanctions) {
        if (s.clubId) clubIds.add(s.clubId);
      }
      const athleteClubs = await tx.athlete.findMany({
        where: {
          id: {
            in: current.sanctions.flatMap((s) =>
              s.athleteId ? [s.athleteId] : [],
            ),
          },
        },
        select: { clubId: true },
      });
      athleteClubs.forEach((a) => clubIds.add(a.clubId));
      const teams = await tx.team.findMany({
        where: {
          id: {
            in: current.sanctions.flatMap((s) => (s.teamId ? [s.teamId] : [])),
          },
        },
        select: { clubId: true },
      });
      teams.forEach((t) => clubIds.add(t.clubId));

      await this.notifications.notify(tx, {
        userIds: await this.notifications.clubUserIds(tx, [...clubIds]),
        template: 'resolution.published',
        params: { title: input.publicTitle },
        entityType: 'case',
        entityId: id,
        link: '#/portal',
        excludeUserId: auth.user.id,
      });
      await this.audit.record(
        {
          action: 'case.published',
          entityType: 'case',
          entityId: id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          after: { publicTitle: input.publicTitle },
        },
        tx,
      );
      return { id, published: true };
    });
  }

  async unpublish(id: string, auth: AuthContext, ip: string, reason: string) {
    const current = await this.load(id);
    if (!current.publishedAt) {
      throw new ConflictException('El expediente no está publicado');
    }
    return this.prisma.client.$transaction(async (tx) => {
      await tx.disciplinaryCase.update({
        where: { id },
        data: { publishedAt: null, publishedById: null },
      });
      await this.entry(
        tx,
        id,
        'publicacion',
        `Se retiró la publicación: ${reason}`,
        auth.user.id,
      );
      await this.audit.record(
        {
          action: 'case.unpublished',
          entityType: 'case',
          entityId: id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          reason,
        },
        tx,
      );
      return { id, published: false };
    });
  }

  // ───────────────────── Portal público ─────────────────────

  private async publishedWhere(): Promise<Prisma.DisciplinaryCaseWhereInput> {
    await this.institution.assertPublished('publicResolutions');
    return {
      publishedAt: { not: null },
      status: { in: ['resuelto', 'archivado'] },
    };
  }

  /**
   * Vista pública de una resolución: texto redactado para el portal, campeonato y clubes
   * involucrados, y el resumen de las sanciones vigentes o cumplidas SIN nombres de personas.
   */
  private publicView(
    row: Prisma.DisciplinaryCaseGetPayload<{
      include: ReturnType<CasesService['publicInclude']>;
    }>,
  ) {
    return {
      id: row.id,
      code: caseCode(row.caseNumber),
      title: row.publicTitle,
      summary: row.publicSummary,
      publishedAt: row.publishedAt,
      championship: row.championship?.name ?? null,
      sanctions: row.sanctions
        .filter((s) => s.status !== 'anulada')
        .map((s) => ({
          type: s.type,
          typeLabel: SANCTION_TYPE_LABELS[s.type] ?? s.type,
          subject: s.athlete ? 'deportista' : s.team ? 'equipo' : 'club',
          club:
            s.athlete?.club.name ?? s.team?.club.name ?? s.club?.name ?? null,
          team: s.team?.name ?? null,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          matchesCount: s.matchesCount,
          points: s.points,
          status: s.status,
        })),
    };
  }

  private publicInclude() {
    return {
      championship: { select: { name: true } },
      sanctions: {
        include: {
          athlete: { select: { club: { select: { name: true } } } },
          team: { select: { name: true, club: { select: { name: true } } } },
          club: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    } satisfies Prisma.DisciplinaryCaseInclude;
  }

  async listPublic(query: { page: number; pageSize: number }) {
    const where = await this.publishedWhere();
    const [total, rows] = await Promise.all([
      this.prisma.client.disciplinaryCase.count({ where }),
      this.prisma.client.disciplinaryCase.findMany({
        where,
        include: this.publicInclude(),
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((r) => this.publicView(r)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getPublic(id: string) {
    const where = await this.publishedWhere();
    const row = await this.prisma.client.disciplinaryCase.findFirst({
      where: { ...where, id },
      include: this.publicInclude(),
    });
    if (!row) throw new NotFoundException('Resolución no encontrada');
    return this.publicView(row);
  }
}
