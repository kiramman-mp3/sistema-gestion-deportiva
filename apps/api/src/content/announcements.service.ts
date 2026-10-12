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
import { fromDate, toDate } from '../catalogs/seasons/seasons.rules.js';
import { slugify } from '../common/keys.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { InstitutionService } from '../institution/institution.service.js';
import { todayInGuayaquil } from '../people/people.schemas.js';
import type {
  AnnouncementListQuery,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from './content.schemas.js';

const LIST_INCLUDE = {
  author: { select: { displayName: true } },
  cover: { select: { id: true, altText: true } },
} satisfies Prisma.AnnouncementInclude;

type Row = Prisma.AnnouncementGetPayload<{ include: typeof LIST_INCLUDE }>;

/**
 * Instante de publicación para la fecha elegida: hoy es «ahora»; otro día, las 00:00 de
 * Ecuador (sin horario de verano). Una fecha futura deja la publicación programada.
 */
export function publicationInstant(date: string, now = new Date()): Date {
  return date === todayInGuayaquil(now)
    ? now
    : new Date(`${date}T00:00:00.000-05:00`);
}

@Injectable()
export class AnnouncementsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hash: SecurityHashService,
    @Inject(InstitutionService)
    private readonly institution: InstitutionService,
  ) {}

  private view(row: Row, withContent = false) {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      slug: row.slug,
      summary: row.summary,
      status: row.status,
      publishDate: fromDate(row.publishDate),
      publishedAt: row.publishedAt,
      /** Publicada con fecha futura: aún no aparece en el portal. */
      scheduled:
        row.status === 'publicado' &&
        row.publishedAt !== null &&
        row.publishedAt > new Date(),
      updatedAt: row.updatedAt,
      author: row.author.displayName,
      cover: row.cover,
      ...(withContent && { content: row.content }),
    };
  }

  /** Dirección pública estable derivada del título, sin repetir las existentes. */
  private async uniqueSlug(
    tx: Prisma.TransactionClient,
    titleText: string,
  ): Promise<string> {
    const base =
      slugify(titleText).slice(0, 80).replace(/-+$/, '') || 'noticia';
    const taken = new Set(
      (
        await tx.announcement.findMany({
          where: { slug: { startsWith: base } },
          select: { slug: true },
        })
      ).map((a) => a.slug),
    );
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) {
      const candidate = `${base}-${i}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  private async assertCover(
    tx: Prisma.TransactionClient,
    coverId: string | null | undefined,
  ): Promise<void> {
    if (!coverId) return;
    const media = await tx.mediaAsset.findUnique({
      where: { id: coverId },
      select: { visibility: true },
    });
    if (!media) throw new BadRequestException('La imagen de portada no existe');
    if (media.visibility !== 'publico') {
      throw new BadRequestException('La imagen de portada debe ser pública');
    }
  }

  // ───────────────────── Administración ─────────────────────

  async list(query: AnnouncementListQuery): Promise<Page<unknown>> {
    const where: Prisma.AnnouncementWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.kind && { kind: query.kind }),
      ...(query.q && {
        title: { contains: escapeLike(query.q), mode: 'insensitive' },
      }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.announcement.count({ where }),
      this.prisma.client.announcement.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [
          { publishDate: 'desc' },
          { updatedAt: 'desc' },
          { id: 'desc' },
        ],
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

  async get(id: string) {
    const row = await this.prisma.client.announcement.findUnique({
      where: { id },
      include: LIST_INCLUDE,
    });
    if (!row) throw new NotFoundException('Publicación no encontrada');
    return this.view(row, true);
  }

  async create(auth: AuthContext, ip: string, input: CreateAnnouncementInput) {
    return this.prisma.client.$transaction(async (tx) => {
      await this.assertCover(tx, input.coverId);
      const row = await tx.announcement.create({
        data: {
          kind: input.kind,
          title: input.title,
          slug: await this.uniqueSlug(tx, input.title),
          summary: input.summary,
          content: input.content,
          coverId: input.coverId ?? null,
          publishDate: toDate(input.publishDate ?? todayInGuayaquil()),
          authorId: auth.user.id,
        },
        include: LIST_INCLUDE,
      });
      await this.audit.record(
        {
          action: 'announcement.created',
          entityType: 'announcement',
          entityId: row.id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          after: {
            kind: row.kind,
            title: row.title,
            slug: row.slug,
            publishDate: fromDate(row.publishDate),
          },
        },
        tx,
      );
      return this.view(row, true);
    });
  }

  async update(
    id: string,
    auth: AuthContext,
    ip: string,
    input: UpdateAnnouncementInput,
  ) {
    const current = await this.prisma.client.announcement.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Publicación no encontrada');
    if (current.status === 'archivado') {
      throw new ConflictException(
        'Una publicación archivada no se edita: restáurela primero',
      );
    }
    return this.prisma.client.$transaction(async (tx) => {
      if (input.coverId !== undefined)
        await this.assertCover(tx, input.coverId);
      const dateChanged =
        input.publishDate !== undefined &&
        input.publishDate !== fromDate(current.publishDate);
      const row = await tx.announcement.update({
        where: { id },
        data: {
          ...(input.kind !== undefined && { kind: input.kind }),
          ...(input.title !== undefined && { title: input.title }),
          ...(input.summary !== undefined && { summary: input.summary }),
          ...(input.content !== undefined && { content: input.content }),
          ...(input.coverId !== undefined && { coverId: input.coverId }),
          ...(dateChanged && {
            publishDate: toDate(input.publishDate!),
            // Lo ya publicado pasa a la nueva fecha (y queda programado si es futura).
            ...(current.status === 'publicado' && {
              publishedAt: publicationInstant(input.publishDate!),
            }),
          }),
          updatedById: auth.user.id,
        },
        include: LIST_INCLUDE,
      });
      const diff = changedFields(
        {
          kind: current.kind,
          title: current.title,
          summary: current.summary,
          contentLength: current.content.length,
          coverId: current.coverId,
          publishDate: fromDate(current.publishDate),
        },
        {
          kind: row.kind,
          title: row.title,
          summary: row.summary,
          contentLength: row.content.length,
          coverId: row.coverId,
          publishDate: fromDate(row.publishDate),
        },
      );
      if (diff) {
        await this.audit.record(
          {
            action: 'announcement.updated',
            entityType: 'announcement',
            entityId: id,
            userId: auth.user.id,
            ipHash: this.hash.hash('ip', ip),
            before: diff.before as Prisma.InputJsonValue,
            after: diff.after as Prisma.InputJsonValue,
          },
          tx,
        );
      }
      return this.view(row, true);
    });
  }

  private async transition(
    id: string,
    auth: AuthContext,
    ip: string,
    to: 'publicado' | 'borrador' | 'archivado',
    allowedFrom: string[],
    action: string,
  ) {
    const current = await this.prisma.client.announcement.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Publicación no encontrada');
    if (!allowedFrom.includes(current.status)) {
      throw new ConflictException(
        `No se puede pasar de «${current.status}» a «${to}»`,
      );
    }
    return this.prisma.client.$transaction(async (tx) => {
      const row = await tx.announcement.update({
        where: { id },
        data: {
          status: to,
          publishedAt:
            to === 'publicado'
              ? publicationInstant(fromDate(current.publishDate))
              : to === 'borrador'
                ? null
                : current.publishedAt,
          updatedById: auth.user.id,
        },
        include: LIST_INCLUDE,
      });
      await this.audit.record(
        {
          action,
          entityType: 'announcement',
          entityId: id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          before: { status: current.status },
          after: { status: to },
        },
        tx,
      );
      return this.view(row);
    });
  }

  publish(id: string, auth: AuthContext, ip: string) {
    return this.transition(
      id,
      auth,
      ip,
      'publicado',
      ['borrador'],
      'announcement.published',
    );
  }

  /** Vuelve a borrador una publicación publicada o restaura una archivada. */
  unpublish(id: string, auth: AuthContext, ip: string) {
    return this.transition(
      id,
      auth,
      ip,
      'borrador',
      ['publicado', 'archivado'],
      'announcement.unpublished',
    );
  }

  archive(id: string, auth: AuthContext, ip: string) {
    return this.transition(
      id,
      auth,
      ip,
      'archivado',
      ['publicado', 'borrador'],
      'announcement.archived',
    );
  }

  async delete(id: string, auth: AuthContext, ip: string) {
    const current = await this.prisma.client.announcement.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Publicación no encontrada');
    if (current.status !== 'borrador') {
      throw new ConflictException(
        'Solo se eliminan borradores: retire o archive primero una publicación',
      );
    }
    await this.prisma.client.$transaction(async (tx) => {
      await tx.announcement.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'announcement.deleted',
          entityType: 'announcement',
          entityId: id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          before: { title: current.title, slug: current.slug },
        },
        tx,
      );
    });
  }

  // ───────────────────── Portal público ─────────────────────

  private publicWhere(
    kind?: 'noticia' | 'comunicado',
  ): Prisma.AnnouncementWhereInput {
    return {
      status: 'publicado',
      // Lo programado no aparece hasta su fecha.
      publishedAt: { lte: new Date() },
      ...(kind && { kind }),
    };
  }

  private publicView(row: Row, withContent = false) {
    return {
      slug: row.slug,
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      publishedAt: row.publishedAt,
      cover:
        row.cover === null
          ? null
          : { id: row.cover.id, altText: row.cover.altText },
      ...(withContent && { content: row.content }),
    };
  }

  async listPublic(query: {
    page: number;
    pageSize: number;
    kind?: 'noticia' | 'comunicado';
  }) {
    await this.institution.assertPublished('publicNews');
    const where = this.publicWhere(query.kind);
    const [total, rows] = await Promise.all([
      this.prisma.client.announcement.count({ where }),
      this.prisma.client.announcement.findMany({
        where,
        include: LIST_INCLUDE,
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

  async getPublic(slug: string) {
    await this.institution.assertPublished('publicNews');
    const row = await this.prisma.client.announcement.findFirst({
      where: { ...this.publicWhere(), slug },
      include: LIST_INCLUDE,
    });
    if (!row) throw new NotFoundException('Publicación no encontrada');
    return this.publicView(row, true);
  }

  /** Últimas publicaciones para el inicio del portal (vacío si las noticias están apagadas). */
  async latestPublic(limit: number) {
    const settings = await this.institution.get();
    if (!settings.publicNews) return [];
    const rows = await this.prisma.client.announcement.findMany({
      where: this.publicWhere(),
      include: LIST_INCLUDE,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map((r) => this.publicView(r));
  }
}
