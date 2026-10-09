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

export interface Announcement {
  id: string;
  kind: AnnouncementKind;
  title: string;
  slug: string;
  summary: string;
  status: AnnouncementStatus;
  publishedAt: string | null;
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
