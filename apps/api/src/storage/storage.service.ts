import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ENV, type Env } from '../config/config.module.js';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg'];
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
];

export interface SaveFileInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  maxSizeBytes: number;
  allowedMimeTypes: string[];
}

export interface SavedFile {
  /** Nombre aleatorio en disco; el original nunca se usa como ruta. */
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
}

/** Tipo real según los primeros bytes; el `Content-Type` del cliente no es de fiar. */
function sniffMimeType(buffer: Buffer): { mime: string; ext: string } | null {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { mime: 'application/pdf', ext: 'pdf' };
  }
  return null;
}

const STORED_NAME = /^[a-f0-9]{32}\.(png|jpg|pdf)$/;

/** Archivos privados en disco, fuera de la raíz web. */
@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(@Inject(ENV) env: Env) {
    this.root = resolve(env.STORAGE_PATH);
  }

  async saveFile(input: SaveFileInput): Promise<SavedFile> {
    const { buffer } = input;
    if (buffer.length === 0) {
      throw new BadRequestException('El archivo está vacío');
    }
    if (buffer.length > input.maxSizeBytes) {
      throw new BadRequestException(
        `El archivo supera el tamaño máximo de ${Math.floor(input.maxSizeBytes / (1024 * 1024))} MB`,
      );
    }
    const detected = sniffMimeType(buffer);
    if (
      !detected ||
      detected.mime !== input.mimeType ||
      !input.allowedMimeTypes.includes(detected.mime)
    ) {
      throw new BadRequestException(
        'Tipo de archivo no permitido o contenido que no corresponde a su tipo',
      );
    }
    const filename = `${randomBytes(16).toString('hex')}.${detected.ext}`;
    await mkdir(this.root, { recursive: true });
    await writeFile(join(this.root, filename), buffer, { flag: 'wx' });
    return {
      filename,
      originalName: input.originalName.slice(0, 255),
      mimeType: detected.mime,
      sizeBytes: buffer.length,
      checksumSha256: createHash('sha256').update(buffer).digest('hex'),
    };
  }

  async readFile(filename: string): Promise<Buffer> {
    try {
      return await readFile(this.pathOf(filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('Archivo no encontrado');
      }
      throw error;
    }
  }

  /** Borra el archivo; si ya no existe no es un error (limpieza idempotente). */
  async deleteFile(filename: string): Promise<void> {
    try {
      await unlink(this.pathOf(filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private pathOf(filename: string): string {
    if (!STORED_NAME.test(filename)) {
      throw new NotFoundException('Archivo no encontrado');
    }
    return join(this.root, filename);
  }
}
