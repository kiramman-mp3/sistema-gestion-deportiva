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
import { escapeLike, type Page } from '../catalogs/common.js';
import { ClubAccessService } from '../clubs/club-access.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { UploadFilePayload } from '../documents/documents.schemas.js';
import type { Prisma } from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_BYTES,
  StorageService,
} from '../storage/storage.service.js';
import { caseCode } from './discipline.helpers.js';
import type { CreateComplaintInput } from './discipline.schemas.js';

const MAX_ATTACHMENTS = 10;

const COMPLAINT_INCLUDE = {
  club: { select: { id: true, name: true } },
  championship: { select: { id: true, name: true } },
  submittedBy: { select: { displayName: true } },
  case: { select: { id: true, caseNumber: true } },
  _count: { select: { attachments: true } },
} satisfies Prisma.ComplaintInclude;

type ComplaintRow = Prisma.ComplaintGetPayload<{
  include: typeof COMPLAINT_INCLUDE;
}>;

const STATUS_WORDS: Record<string, string> = {
  en_revision: 'en revisión',
  resuelto: 'resuelto',
  desestimado: 'desestimado',
};

@Injectable()
export class ComplaintsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hash: SecurityHashService,
    @Inject(ClubAccessService) private readonly clubAccess: ClubAccessService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  view(row: ComplaintRow) {
    return {
      id: row.id,
      subject: row.subject,
      description: row.description,
      status: row.status,
      submittedAt: row.submittedAt,
      resolvedAt: row.resolvedAt,
      dismissReason: row.dismissReason,
      eventId: row.eventId,
      club: row.club,
      championship: row.championship,
      submittedBy: row.submittedBy.displayName,
      case: row.case
        ? { id: row.case.id, code: caseCode(row.case.caseNumber) }
        : null,
      attachmentCount: row._count.attachments,
    };
  }

  /** Reclamo visible para el actor (los de clubes fuera de su alcance responden como inexistentes). */
  private async load(id: string, auth: AuthContext) {
    const row = await this.prisma.client.complaint.findUnique({
      where: { id },
      include: COMPLAINT_INCLUDE,
    });
    if (!row || !(await this.clubAccess.canAccess(auth, row.clubId))) {
      throw new NotFoundException('Reclamo no encontrado');
    }
    return row;
  }

  async create(auth: AuthContext, ip: string, input: CreateComplaintInput) {
    await this.clubAccess.assertAccess(auth, input.clubId);
    const [club, championship] = await Promise.all([
      this.prisma.client.club.findUnique({
        where: { id: input.clubId },
        select: { id: true, name: true, status: true },
      }),
      this.prisma.client.championship.findUnique({
        where: { id: input.championshipId },
        select: { id: true, name: true },
      }),
    ]);
    if (!club) throw new NotFoundException('Club no encontrado');
    if (!championship) throw new NotFoundException('Campeonato no encontrado');
    if (club.status === 'archivado') {
      throw new BadRequestException('El club está archivado');
    }

    // Solo reclaman los clubes que participan en el campeonato.
    const participates = await this.prisma.client.registration.count({
      where: {
        championshipId: championship.id,
        status: { in: ['pendiente', 'aprobada', 'observada'] },
        OR: [
          { participant: { team: { team: { clubId: club.id } } } },
          { participant: { individual: { athlete: { clubId: club.id } } } },
        ],
      },
    });
    if (participates === 0) {
      throw new BadRequestException('El club no participa en ese campeonato');
    }
    if (input.eventId) {
      const event = await this.prisma.client.event.findFirst({
        where: {
          id: input.eventId,
          round: { stage: { championshipId: championship.id } },
        },
        select: { id: true },
      });
      if (!event) {
        throw new BadRequestException('El partido no pertenece al campeonato');
      }
    }

    return this.prisma.client.$transaction(async (tx) => {
      const complaint = await tx.complaint.create({
        data: {
          championshipId: championship.id,
          eventId: input.eventId ?? null,
          clubId: club.id,
          submittedById: auth.user.id,
          subject: input.subject,
          description: input.description,
        },
        include: COMPLAINT_INCLUDE,
      });
      await this.audit.record(
        {
          action: 'complaint.submitted',
          entityType: 'complaint',
          entityId: complaint.id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          after: {
            clubId: club.id,
            championshipId: championship.id,
            eventId: input.eventId ?? null,
          },
        },
        tx,
      );
      await this.notifications.notify(tx, {
        userIds: await this.notifications.permissionUserIds(tx, 'cases:manage'),
        template: 'complaint.received',
        params: { club: club.name, subject: input.subject },
        entityType: 'complaint',
        entityId: complaint.id,
        link: '#/disciplina',
        excludeUserId: auth.user.id,
      });
      return this.view(complaint);
    });
  }

  async list(
    auth: AuthContext,
    query: {
      page: number;
      pageSize: number;
      status?: 'recibido' | 'en_revision' | 'resuelto' | 'desestimado';
      clubId?: string;
      championshipId?: string;
      q?: string;
    },
  ): Promise<Page<ReturnType<ComplaintsService['view']>>> {
    const scope = await this.clubAccess.clubFilter(auth);
    const where: Prisma.ComplaintWhereInput = {
      ...scope,
      ...(query.status && { status: query.status }),
      ...(query.championshipId && { championshipId: query.championshipId }),
      ...(query.q && {
        subject: { contains: escapeLike(query.q), mode: 'insensitive' },
      }),
    };
    if (query.clubId) {
      // Un club fuera del alcance no aparece: se combina con el filtro de alcance.
      where.AND = [{ clubId: query.clubId }];
    }
    const [total, rows] = await Promise.all([
      this.prisma.client.complaint.count({ where }),
      this.prisma.client.complaint.findMany({
        where,
        include: COMPLAINT_INCLUDE,
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((r) => this.view(r)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(id: string, auth: AuthContext) {
    const row = await this.load(id, auth);
    const attachments = await this.prisma.client.complaintAttachment.findMany({
      where: { complaintId: id },
      include: { file: { select: { mimeType: true, sizeBytes: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...this.view(row),
      attachments: attachments.map((a) => ({
        id: a.id,
        title: a.title,
        mimeType: a.file.mimeType,
        sizeBytes: a.file.sizeBytes,
        createdAt: a.createdAt,
      })),
    };
  }

  // ───────────────────── Adjuntos ─────────────────────

  async addAttachment(
    id: string,
    auth: AuthContext,
    ip: string,
    title: string,
    file: UploadFilePayload | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }
    const complaint = await this.load(id, auth);
    if (['resuelto', 'desestimado'].includes(complaint.status)) {
      throw new ConflictException(
        'El reclamo ya está cerrado: no admite nuevos adjuntos',
      );
    }
    if (complaint._count.attachments >= MAX_ATTACHMENTS) {
      throw new ConflictException(
        `Un reclamo admite hasta ${MAX_ATTACHMENTS} adjuntos`,
      );
    }
    const saved = await this.storage.saveFile({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      maxSizeBytes: MAX_DOCUMENT_BYTES,
      allowedMimeTypes: ALLOWED_DOCUMENT_MIME_TYPES,
    });
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const stored = await tx.storedFile.create({
          data: {
            filename: saved.filename,
            originalName: saved.originalName,
            mimeType: saved.mimeType,
            sizeBytes: saved.sizeBytes,
            checksumSha256: saved.checksumSha256,
            createdById: auth.user.id,
          },
        });
        const attachment = await tx.complaintAttachment.create({
          data: { complaintId: id, fileId: stored.id, title },
        });
        await this.audit.record(
          {
            action: 'complaint.attachment_added',
            entityType: 'complaint',
            entityId: id,
            userId: auth.user.id,
            ipHash: this.hash.hash('ip', ip),
            after: { attachmentId: attachment.id, sizeBytes: saved.sizeBytes },
          },
          tx,
        );
        return { id: attachment.id, title };
      });
    } catch (error) {
      await this.storage.deleteFile(saved.filename);
      throw error;
    }
  }

  async readAttachment(id: string, attachmentId: string, auth: AuthContext) {
    await this.load(id, auth);
    const attachment = await this.prisma.client.complaintAttachment.findFirst({
      where: { id: attachmentId, complaintId: id },
      include: { file: true },
    });
    if (!attachment) throw new NotFoundException('Adjunto no encontrado');
    return {
      buffer: await this.storage.readFile(attachment.file.filename),
      mimeType: attachment.file.mimeType,
      filename: attachment.file.originalName,
    };
  }

  // ───────────────────── Desestimar ─────────────────────

  /** Cierra un reclamo recién recibido que no amerita expediente. */
  async dismiss(id: string, auth: AuthContext, ip: string, reason: string) {
    const complaint = await this.prisma.client.complaint.findUnique({
      where: { id },
      include: COMPLAINT_INCLUDE,
    });
    if (!complaint) throw new NotFoundException('Reclamo no encontrado');
    if (complaint.status !== 'recibido') {
      throw new ConflictException(
        'Solo se puede desestimar un reclamo recién recibido; si tiene expediente se resuelve allí',
      );
    }
    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.complaint.update({
        where: { id },
        data: {
          status: 'desestimado',
          resolvedAt: new Date(),
          dismissReason: reason,
        },
        include: COMPLAINT_INCLUDE,
      });
      await this.audit.record(
        {
          action: 'complaint.dismissed',
          entityType: 'complaint',
          entityId: id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          before: { status: complaint.status },
          after: { status: updated.status },
          reason,
        },
        tx,
      );
      await this.notifications.notify(tx, {
        userIds: [complaint.submittedById],
        template: 'complaint.updated',
        params: {
          subject: complaint.subject,
          status: STATUS_WORDS.desestimado!,
          reason,
        },
        entityType: 'complaint',
        entityId: id,
        link: '#/disciplina',
        excludeUserId: auth.user.id,
      });
      return this.view(updated);
    });
  }
}
