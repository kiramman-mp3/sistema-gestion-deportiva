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

/** Imágenes institucionales: logotipo (documentos y portal) y foto de portada del portal. */
type InstitutionImage = 'logo' | 'cover';

const IMAGES = {
  logo: {
    column: 'logoFileId',
    relation: 'logoFile',
    label: 'logo',
    missing: 'No hay logotipo configurado',
  },
  cover: {
    column: 'coverFileId',
    relation: 'coverFile',
    label: 'cover',
    missing: 'No hay foto de portada configurada',
  },
} as const;

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

  setLogo(auth: AuthContext, ip: string, file: UploadFilePayload | undefined) {
    return this.setImage('logo', auth, ip, file);
  }

  removeLogo(auth: AuthContext, ip: string) {
    return this.removeImage('logo', auth, ip);
  }

  readLogo() {
    return this.readImage('logo');
  }

  setCover(auth: AuthContext, ip: string, file: UploadFilePayload | undefined) {
    return this.setImage('cover', auth, ip, file);
  }

  removeCover(auth: AuthContext, ip: string) {
    return this.removeImage('cover', auth, ip);
  }

  readCover() {
    return this.readImage('cover');
  }

  /** Sustituye la imagen (logotipo o portada) y borra la anterior del almacenamiento. */
  private async setImage(
    kind: InstitutionImage,
    auth: AuthContext,
    ip: string,
    file: UploadFilePayload | undefined,
  ): Promise<void> {
    const { column, relation, label } = IMAGES[kind];
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
          include: { logoFile: true, coverFile: true },
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
          data: { [column]: stored.id, updatedById: auth.user.id },
        });
        const previous = existing[relation];
        if (previous) {
          oldFilename = previous.filename;
          await tx.storedFile.delete({ where: { id: previous.id } });
        }
        await this.audit.record(
          {
            action: `institution.${label}_changed`,
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

  private async removeImage(
    kind: InstitutionImage,
    auth: AuthContext,
    ip: string,
  ): Promise<void> {
    const { column, relation, label, missing } = IMAGES[kind];
    const current = await this.prisma.client.institutionSettings.findUnique({
      where: { id: 1 },
      include: { logoFile: true, coverFile: true },
    });
    const image = current?.[relation];
    if (!image) throw new NotFoundException(missing);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.institutionSettings.update({
        where: { id: 1 },
        data: { [column]: null, updatedById: auth.user.id },
      });
      await tx.storedFile.delete({ where: { id: image.id } });
      await this.audit.record(
        {
          action: `institution.${label}_removed`,
          entityType: 'institution',
          entityId: '1',
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          before: { fileId: image.id },
        },
        tx,
      );
    });
    await this.storage.deleteFile(image.filename);
  }

  private async readImage(
    kind: InstitutionImage,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const { relation, missing } = IMAGES[kind];
    const current = await this.prisma.client.institutionSettings.findUnique({
      where: { id: 1 },
      include: { logoFile: true, coverFile: true },
    });
    const image = current?.[relation];
    if (!image) throw new NotFoundException(missing);
    return {
      buffer: await this.storage.readFile(image.filename),
      mimeType: image.mimeType,
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
      hasCover: row.coverFileId !== null,
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
