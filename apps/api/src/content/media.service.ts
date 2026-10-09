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
import type { Page } from '../catalogs/common.js';
import { PrismaService } from '../database/prisma.service.js';
import type { UploadFilePayload } from '../documents/documents.schemas.js';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_PHOTO_BYTES,
  StorageService,
} from '../storage/storage.service.js';

@Injectable()
export class MediaService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hash: SecurityHashService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async upload(
    auth: AuthContext,
    ip: string,
    altText: string,
    file: UploadFilePayload | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }
    const saved = await this.storage.saveFile({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      maxSizeBytes: MAX_PHOTO_BYTES,
      allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
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
        const media = await tx.mediaAsset.create({
          data: { fileId: stored.id, altText, uploadedById: auth.user.id },
        });
        await this.audit.record(
          {
            action: 'media.uploaded',
            entityType: 'media',
            entityId: media.id,
            userId: auth.user.id,
            ipHash: this.hash.hash('ip', ip),
            after: { sizeBytes: saved.sizeBytes, mimeType: saved.mimeType },
          },
          tx,
        );
        return {
          id: media.id,
          altText: media.altText,
          visibility: media.visibility,
          createdAt: media.createdAt,
        };
      });
    } catch (error) {
      await this.storage.deleteFile(saved.filename);
      throw error;
    }
  }

  async list(query: {
    page: number;
    pageSize: number;
  }): Promise<Page<unknown>> {
    const [total, rows] = await Promise.all([
      this.prisma.client.mediaAsset.count(),
      this.prisma.client.mediaAsset.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          file: { select: { sizeBytes: true, mimeType: true } },
          _count: { select: { announcements: true } },
        },
      }),
    ]);
    return {
      items: rows.map((m) => ({
        id: m.id,
        altText: m.altText,
        visibility: m.visibility,
        sizeBytes: m.file.sizeBytes,
        mimeType: m.file.mimeType,
        createdAt: m.createdAt,
        usedIn: m._count.announcements,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async delete(id: string, auth: AuthContext, ip: string): Promise<void> {
    const media = await this.prisma.client.mediaAsset.findUnique({
      where: { id },
      include: { file: true, _count: { select: { announcements: true } } },
    });
    if (!media) throw new NotFoundException('Imagen no encontrada');
    if (media._count.announcements > 0) {
      throw new ConflictException(
        'La imagen se usa como portada de una publicación: quítela de allí primero',
      );
    }
    await this.prisma.client.$transaction(async (tx) => {
      await tx.mediaAsset.delete({ where: { id } });
      await tx.storedFile.delete({ where: { id: media.fileId } });
      await this.audit.record(
        {
          action: 'media.deleted',
          entityType: 'media',
          entityId: id,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          before: { altText: media.altText },
        },
        tx,
      );
    });
    await this.storage.deleteFile(media.file.filename);
  }

  /** Archivo de una imagen pública. Las privadas no se sirven por la ruta del portal. */
  async readPublic(id: string) {
    const media = await this.prisma.client.mediaAsset.findFirst({
      where: { id, visibility: 'publico' },
      include: { file: true },
    });
    if (!media) throw new NotFoundException('Imagen no encontrada');
    return {
      buffer: await this.storage.readFile(media.file.filename),
      mimeType: media.file.mimeType,
    };
  }
}
