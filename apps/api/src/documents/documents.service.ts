import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { SecurityHashService } from '../auth/security-hash.service.js';
import { ClubAccessService } from '../clubs/club-access.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_DOCUMENT_BYTES,
  MAX_PHOTO_BYTES,
  StorageService,
} from '../storage/storage.service.js';
import type {
  UploadDocumentInput,
  UploadFilePayload,
  VerifyDocumentInput,
} from './documents.schemas.js';

type Actor = Pick<AuthContext, 'user' | 'permissions'>;

export interface FileDownloadResult {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

export interface AthleteDocumentView {
  id: string;
  athleteId: string;
  fileId: string;
  type: string;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  verified: boolean;
  verifiedAt: Date | null;
  verifiedBy: { id: string; displayName: string } | null;
  createdAt: Date;
}

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hasher: SecurityHashService,
    @Inject(ClubAccessService) private readonly clubAccess: ClubAccessService,
  ) {}

  // ─────────────────────────── Fotografía ───────────────────────────

  async uploadPhoto(
    actor: Actor,
    athleteId: string,
    file: UploadFilePayload | undefined,
    ip: string,
  ): Promise<{ success: boolean; fileId: string }> {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }

    const athlete = await this.prisma.client.athlete.findUnique({
      where: { id: athleteId },
      select: { id: true, clubId: true },
    });
    if (!athlete) throw new NotFoundException('Deportista no encontrado');

    await this.clubAccess.assertAccess(actor, athlete.clubId);

    const saved = await this.storage.saveFile({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      maxSizeBytes: MAX_PHOTO_BYTES,
      allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
    });

    let oldFilenameToDelete: string | null = null;

    try {
      await this.prisma.client.$transaction(async (tx) => {
        const existing = await tx.athletePhoto.findUnique({
          where: { athleteId },
          include: { file: true },
        });

        if (existing) {
          oldFilenameToDelete = existing.file.filename;
          await tx.athletePhoto.delete({ where: { athleteId } });
          await tx.storedFile.delete({ where: { id: existing.fileId } });
        }

        const storedFile = await tx.storedFile.create({
          data: {
            filename: saved.filename,
            originalName: saved.originalName,
            mimeType: saved.mimeType,
            sizeBytes: saved.sizeBytes,
            checksumSha256: saved.checksumSha256,
            createdById: actor.user.id,
          },
        });

        await tx.athletePhoto.create({
          data: {
            athleteId,
            fileId: storedFile.id,
          },
        });

        await this.record(
          tx,
          actor,
          ip,
          'athlete.photo_uploaded',
          'athlete',
          athleteId,
          {
            before: existing ? { fileId: existing.fileId } : undefined,
            after: {
              fileId: storedFile.id,
              originalName: saved.originalName,
              sizeBytes: saved.sizeBytes,
            },
          },
        );
      });
    } catch (err) {
      await this.storage.deleteFile(saved.filename);
      throw err;
    }

    if (oldFilenameToDelete) {
      await this.storage.deleteFile(oldFilenameToDelete);
    }

    return { success: true, fileId: saved.filename };
  }

  async getPhoto(actor: Actor, athleteId: string): Promise<FileDownloadResult> {
    const athlete = await this.prisma.client.athlete.findUnique({
      where: { id: athleteId },
      include: {
        photo: { include: { file: true } },
      },
    });
    if (!athlete) throw new NotFoundException('Deportista no encontrado');

    await this.clubAccess.assertAccess(actor, athlete.clubId);

    if (!athlete.photo) {
      throw new NotFoundException('El deportista no tiene fotografía');
    }

    const buffer = await this.storage.readFile(athlete.photo.file.filename);
    return {
      buffer,
      mimeType: athlete.photo.file.mimeType,
      originalName: athlete.photo.file.originalName,
    };
  }

  async getPublicPhoto(athleteId: string): Promise<FileDownloadResult> {
    const athlete = await this.prisma.client.athlete.findUnique({
      where: { id: athleteId },
      include: {
        club: { select: { status: true } },
        person: {
          select: {
            status: true,
            consents: {
              where: {
                type: 'publicacion_foto',
                status: 'otorgado',
              },
            },
          },
        },
        photo: { include: { file: true } },
      },
    });

    const now = Date.now();
    const activeConsent = athlete?.person.consents.some(
      (c) => !c.expiresAt || c.expiresAt.getTime() > now,
    );

    const isVisible =
      athlete &&
      athlete.publicProfile &&
      athlete.person.status === 'activo' &&
      athlete.club.status === 'activo' &&
      activeConsent &&
      athlete.photo;

    if (!athlete || !isVisible || !athlete.photo) {
      throw new NotFoundException('Fotografía no disponible');
    }

    const buffer = await this.storage.readFile(athlete.photo.file.filename);
    return {
      buffer,
      mimeType: athlete.photo.file.mimeType,
      originalName: athlete.photo.file.originalName,
    };
  }

  async deletePhoto(
    actor: Actor,
    athleteId: string,
    ip: string,
  ): Promise<{ success: boolean }> {
    const athlete = await this.prisma.client.athlete.findUnique({
      where: { id: athleteId },
      include: { photo: { include: { file: true } } },
    });
    if (!athlete) throw new NotFoundException('Deportista no encontrado');

    await this.clubAccess.assertAccess(actor, athlete.clubId);

    if (!athlete.photo) {
      throw new NotFoundException('El deportista no tiene fotografía');
    }

    const filenameToDelete = athlete.photo.file.filename;

    await this.prisma.client.$transaction(async (tx) => {
      await tx.athletePhoto.delete({ where: { athleteId } });
      await tx.storedFile.delete({ where: { id: athlete.photo!.fileId } });

      await this.record(
        tx,
        actor,
        ip,
        'athlete.photo_deleted',
        'athlete',
        athleteId,
        {
          before: { fileId: athlete.photo!.fileId },
          after: undefined,
        },
      );
    });

    await this.storage.deleteFile(filenameToDelete);
    return { success: true };
  }

  // ─────────────────────────── Documentos ───────────────────────────

  async uploadDocument(
    actor: Actor,
    athleteId: string,
    input: UploadDocumentInput,
    file: UploadFilePayload | undefined,
    ip: string,
  ): Promise<AthleteDocumentView> {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }

    const athlete = await this.prisma.client.athlete.findUnique({
      where: { id: athleteId },
      select: { id: true, clubId: true },
    });
    if (!athlete) throw new NotFoundException('Deportista no encontrado');

    await this.clubAccess.assertAccess(actor, athlete.clubId);

    const saved = await this.storage.saveFile({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      maxSizeBytes: MAX_DOCUMENT_BYTES,
      allowedMimeTypes: ALLOWED_DOCUMENT_MIME_TYPES,
    });

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const storedFile = await tx.storedFile.create({
          data: {
            filename: saved.filename,
            originalName: saved.originalName,
            mimeType: saved.mimeType,
            sizeBytes: saved.sizeBytes,
            checksumSha256: saved.checksumSha256,
            createdById: actor.user.id,
          },
        });

        const doc = await tx.athleteDocument.create({
          data: {
            athleteId,
            fileId: storedFile.id,
            type: input.type,
            title: input.title,
            verified: false,
          },
          include: {
            file: true,
            verifiedBy: { select: { id: true, displayName: true } },
          },
        });

        await this.record(
          tx,
          actor,
          ip,
          'athlete.document_uploaded',
          'athlete_document',
          doc.id,
          {
            before: undefined,
            after: {
              athleteId,
              fileId: storedFile.id,
              type: doc.type,
              title: doc.title,
            },
          },
        );

        return {
          id: doc.id,
          athleteId: doc.athleteId,
          fileId: doc.fileId,
          type: doc.type,
          title: doc.title,
          originalName: doc.file.originalName,
          mimeType: doc.file.mimeType,
          sizeBytes: doc.file.sizeBytes,
          verified: doc.verified,
          verifiedAt: doc.verifiedAt,
          verifiedBy: doc.verifiedBy,
          createdAt: doc.createdAt,
        };
      });
    } catch (err) {
      await this.storage.deleteFile(saved.filename);
      throw err;
    }
  }

  async listDocuments(
    actor: Actor,
    athleteId: string,
  ): Promise<AthleteDocumentView[]> {
    const athlete = await this.prisma.client.athlete.findUnique({
      where: { id: athleteId },
      select: { clubId: true },
    });
    if (!athlete) throw new NotFoundException('Deportista no encontrado');

    await this.clubAccess.assertAccess(actor, athlete.clubId);

    const docs = await this.prisma.client.athleteDocument.findMany({
      where: { athleteId },
      include: {
        file: true,
        verifiedBy: { select: { id: true, displayName: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return docs.map((doc) => ({
      id: doc.id,
      athleteId: doc.athleteId,
      fileId: doc.fileId,
      type: doc.type,
      title: doc.title,
      originalName: doc.file.originalName,
      mimeType: doc.file.mimeType,
      sizeBytes: doc.file.sizeBytes,
      verified: doc.verified,
      verifiedAt: doc.verifiedAt,
      verifiedBy: doc.verifiedBy,
      createdAt: doc.createdAt,
    }));
  }

  async getDocumentFile(
    actor: Actor,
    athleteId: string,
    documentId: string,
  ): Promise<FileDownloadResult> {
    const athlete = await this.prisma.client.athlete.findUnique({
      where: { id: athleteId },
      select: { clubId: true },
    });
    if (!athlete) throw new NotFoundException('Deportista no encontrado');

    await this.clubAccess.assertAccess(actor, athlete.clubId);

    const doc = await this.prisma.client.athleteDocument.findFirst({
      where: { id: documentId, athleteId },
      include: { file: true },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    const buffer = await this.storage.readFile(doc.file.filename);
    return {
      buffer,
      mimeType: doc.file.mimeType,
      originalName: doc.file.originalName,
    };
  }

  async verifyDocument(
    actor: Actor,
    athleteId: string,
    documentId: string,
    input: VerifyDocumentInput,
    ip: string,
  ): Promise<AthleteDocumentView> {
    const athlete = await this.prisma.client.athlete.findUnique({
      where: { id: athleteId },
      select: { clubId: true },
    });
    if (!athlete) throw new NotFoundException('Deportista no encontrado');

    await this.clubAccess.assertAccess(actor, athlete.clubId);

    return this.prisma.client.$transaction(async (tx) => {
      const doc = await tx.athleteDocument.findFirst({
        where: { id: documentId, athleteId },
        include: { file: true },
      });
      if (!doc) throw new NotFoundException('Documento no encontrado');

      const updated = await tx.athleteDocument.update({
        where: { id: documentId },
        data: {
          verified: input.verified,
          verifiedAt: input.verified ? new Date() : null,
          verifiedById: input.verified ? actor.user.id : null,
        },
        include: {
          file: true,
          verifiedBy: { select: { id: true, displayName: true } },
        },
      });

      await this.record(
        tx,
        actor,
        ip,
        'athlete.document_verified',
        'athlete_document',
        documentId,
        {
          before: { verified: doc.verified },
          after: { verified: updated.verified },
        },
        input.reason,
      );

      return {
        id: updated.id,
        athleteId: updated.athleteId,
        fileId: updated.fileId,
        type: updated.type,
        title: updated.title,
        originalName: updated.file.originalName,
        mimeType: updated.file.mimeType,
        sizeBytes: updated.file.sizeBytes,
        verified: updated.verified,
        verifiedAt: updated.verifiedAt,
        verifiedBy: updated.verifiedBy,
        createdAt: updated.createdAt,
      };
    });
  }

  async deleteDocument(
    actor: Actor,
    athleteId: string,
    documentId: string,
    ip: string,
  ): Promise<{ success: boolean }> {
    const athlete = await this.prisma.client.athlete.findUnique({
      where: { id: athleteId },
      select: { clubId: true },
    });
    if (!athlete) throw new NotFoundException('Deportista no encontrado');

    await this.clubAccess.assertAccess(actor, athlete.clubId);

    const doc = await this.prisma.client.athleteDocument.findFirst({
      where: { id: documentId, athleteId },
      include: { file: true },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    const filename = doc.file.filename;

    await this.prisma.client.$transaction(async (tx) => {
      await tx.athleteDocument.delete({ where: { id: documentId } });
      await tx.storedFile.delete({ where: { id: doc.fileId } });

      await this.record(
        tx,
        actor,
        ip,
        'athlete.document_deleted',
        'athlete_document',
        documentId,
        {
          before: {
            title: doc.title,
            type: doc.type,
            fileId: doc.fileId,
          },
          after: undefined,
        },
      );
    });

    await this.storage.deleteFile(filename);
    return { success: true };
  }

  private record(
    tx: Prisma.TransactionClient,
    actor: Actor,
    ip: string,
    action: string,
    entityType: string,
    entityId: string,
    change: { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue },
    reason?: string,
  ) {
    return this.audit.record(
      {
        userId: actor.user.id,
        action,
        entityType,
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
