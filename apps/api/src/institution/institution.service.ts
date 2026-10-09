import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { SecurityHashService } from '../auth/security-hash.service.js';
import { changedFields } from '../catalogs/common.js';
import { PrismaService } from '../database/prisma.service.js';
import type { UploadFilePayload } from '../documents/documents.schemas.js';
import type { InstitutionSettings } from '../generated/prisma/client.js';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_PHOTO_BYTES,
  StorageService,
} from '../storage/storage.service.js';
import type {
  PublicationFlag,
  UpdateInstitutionInput,
} from './institution.schemas.js';

/** Valores con los que nace la configuración si la fila no existe todavía. */
export const INSTITUTION_DEFAULTS = {
  name: 'Liga Deportiva Cantonal de Quero',
  shortName: 'Liga de Quero',
  affiliation: 'Afiliada a Federación Deportiva de Tungurahua',
  canton: 'Quero - Tungurahua - Ecuador',
} as const;

const LONG_TEXT_FIELDS = ['about', 'contactInfo', 'privacyPolicy'] as const;

/** Campos que se comparan al auditar (todo menos marcas de tiempo y relaciones). */
const TRACKED = [
  'name',
  'shortName',
  'affiliation',
  'canton',
  'address',
  'email',
  'phone',
  'website',
  'about',
  'contactInfo',
  'privacyPolicy',
  'documentFooter',
  'presidentName',
  'secretaryName',
  'publicClubs',
  'publicAthletes',
  'publicNews',
  'publicResolutions',
  'allowSelfApproval',
] as const;

type Tracked = Record<(typeof TRACKED)[number], string | boolean | null>;

function tracked(row: InstitutionSettings): Tracked {
  return Object.fromEntries(TRACKED.map((key) => [key, row[key]])) as Tracked;
}

/** Instantánea apta para auditoría: los textos largos se reducen a su longitud. */
function auditView(
  fields: Partial<Tracked>,
): Record<string, string | boolean | null> {
  const view: Record<string, string | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    view[key] =
      (LONG_TEXT_FIELDS as readonly string[]).includes(key) &&
      typeof value === 'string'
        ? `${value.length} caracteres`
        : (value ?? null);
  }
  return view;
}

@Injectable()
export class InstitutionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hash: SecurityHashService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  /** La configuración es una fila única; si falta (base vacía) se crea con los valores por defecto. */
  async get(): Promise<InstitutionSettings> {
    return this.prisma.client.institutionSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, ...INSTITUTION_DEFAULTS },
    });
  }

  async update(
    auth: AuthContext,
    ip: string,
    input: UpdateInstitutionInput,
  ): Promise<InstitutionSettings> {
    const current = await this.get();
    const data = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );
    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.institutionSettings.update({
        where: { id: 1 },
        data: { ...data, updatedById: auth.user.id },
      });
      const diff = changedFields(tracked(current), tracked(updated));
      if (diff) {
        await this.audit.record(
          {
            action: 'institution.updated',
            entityType: 'institution',
            entityId: '1',
            userId: auth.user.id,
            ipHash: this.hash.hash('ip', ip),
            before: auditView(diff.before),
            after: auditView(diff.after),
          },
          tx,
        );
      }
      return updated;
    });
  }

  async setLogo(
    auth: AuthContext,
    ip: string,
    file: UploadFilePayload | undefined,
  ): Promise<void> {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }
    await this.get();
    const saved = await this.storage.saveFile({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      maxSizeBytes: MAX_PHOTO_BYTES,
      allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
    });

    let oldFilename: string | null = null;
    try {
      await this.prisma.client.$transaction(async (tx) => {
        const existing = await tx.institutionSettings.findUniqueOrThrow({
          where: { id: 1 },
          include: { logoFile: true },
        });
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
        await tx.institutionSettings.update({
          where: { id: 1 },
          data: { logoFileId: stored.id, updatedById: auth.user.id },
        });
        if (existing.logoFile) {
          oldFilename = existing.logoFile.filename;
          await tx.storedFile.delete({ where: { id: existing.logoFile.id } });
        }
        await this.audit.record(
          {
            action: 'institution.logo_changed',
            entityType: 'institution',
            entityId: '1',
            userId: auth.user.id,
            ipHash: this.hash.hash('ip', ip),
            after: { fileId: stored.id, sizeBytes: saved.sizeBytes },
          },
          tx,
        );
      });
    } catch (error) {
      await this.storage.deleteFile(saved.filename);
      throw error;
    }
    if (oldFilename) await this.storage.deleteFile(oldFilename);
  }

  async removeLogo(auth: AuthContext, ip: string): Promise<void> {
    const current = await this.prisma.client.institutionSettings.findUnique({
      where: { id: 1 },
      include: { logoFile: true },
    });
    const logo = current?.logoFile;
    if (!logo) throw new NotFoundException('No hay logotipo configurado');
    await this.prisma.client.$transaction(async (tx) => {
      await tx.institutionSettings.update({
        where: { id: 1 },
        data: { logoFileId: null, updatedById: auth.user.id },
      });
      await tx.storedFile.delete({ where: { id: logo.id } });
      await this.audit.record(
        {
          action: 'institution.logo_removed',
          entityType: 'institution',
          entityId: '1',
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          before: { fileId: logo.id },
        },
        tx,
      );
    });
    await this.storage.deleteFile(logo.filename);
  }

  async readLogo(): Promise<{ buffer: Buffer; mimeType: string }> {
    const current = await this.prisma.client.institutionSettings.findUnique({
      where: { id: 1 },
      include: { logoFile: true },
    });
    if (!current?.logoFile) throw new NotFoundException('Sin logotipo');
    return {
      buffer: await this.storage.readFile(current.logoFile.filename),
      mimeType: current.logoFile.mimeType,
    };
  }

  /** Datos publicables (sin identificadores internos ni auditoría). */
  async publicInfo() {
    const row = await this.get();
    return {
      name: row.name,
      shortName: row.shortName,
      affiliation: row.affiliation,
      canton: row.canton,
      address: row.address,
      email: row.email,
      phone: row.phone,
      website: row.website,
      about: row.about,
      contactInfo: row.contactInfo,
      privacyPolicy: row.privacyPolicy,
      presidentName: row.presidentName,
      secretaryName: row.secretaryName,
      hasLogo: row.logoFileId !== null,
      publication: {
        clubs: row.publicClubs,
        athletes: row.publicAthletes,
        news: row.publicNews,
        resolutions: row.publicResolutions,
      },
    };
  }

  /** Encabezado de los documentos oficiales (reemplaza los textos que estaban fijos en el código). */
  async documentHeader() {
    const row = await this.get();
    return {
      institution: row.name.toUpperCase(),
      affiliation: row.affiliation ?? '',
      canton: row.canton ?? '',
      footer: row.documentFooter ?? '',
      presidentName: row.presidentName ?? '',
      secretaryName: row.secretaryName ?? '',
    };
  }

  /** Lanza 404 si el parámetro de publicación indicado está desactivado. */
  async assertPublished(flag: PublicationFlag): Promise<void> {
    const row = await this.get();
    if (!row[flag]) throw new NotFoundException('Contenido no disponible');
  }
}
