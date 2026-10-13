export type { Page } from '../admin/types.ts';

export type AnnouncementKind = 'noticia' | 'comunicado';
export type AnnouncementStatus = 'borrador' | 'publicado' | 'archivado';

export const KIND_LABELS: Record<AnnouncementKind, string> = {
  noticia: 'Noticia',
  comunicado: 'Comunicado',
};

export const STATUS_LABELS: Record<AnnouncementStatus, string> = {
  borrador: 'Borrador',
  publicado: 'Publicado',
  archivado: 'Archivado',
};

/** Hoy en la hora de Ecuador, `AAAA-MM-DD` (igual que la API). */
export function todayInEcuador(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
  }).format(now);
}

const longDate = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'long',
  timeZone: 'UTC',
});

/** `2026-10-12` → «12 de octubre de 2026». */
export function formatDay(day: string): string {
  return longDate.format(new Date(`${day}T00:00:00.000Z`));
}

export interface Announcement {
  id: string;
  kind: AnnouncementKind;
  title: string;
  slug: string;
  summary: string;
  status: AnnouncementStatus;
  /** Fecha elegida al redactar, `AAAA-MM-DD` (hora de Ecuador). */
  publishDate: string;
  publishedAt: string | null;
  /** Publicada con fecha futura: aún no se ve en el portal. */
  scheduled: boolean;
  updatedAt: string;
  author: string;
  cover: { id: string; altText: string } | null;
  content?: string;
}

export interface MediaItem {
  id: string;
  altText: string;
  visibility: 'publico' | 'privado';
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  usedIn: number;
}
