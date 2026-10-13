import { z } from 'zod';
import { uuidSchema } from '../auth/schemas.js';
import { listQuerySchema } from '../catalogs/common.js';
import { dateSchema } from '../catalogs/seasons/seasons.schemas.js';

export const announcementKindSchema = z.enum(['noticia', 'comunicado']);
export const announcementStatusSchema = z.enum([
  'borrador',
  'publicado',
  'archivado',
]);

const title = z
  .string()
  .trim()
  .min(5, 'El título necesita al menos 5 caracteres')
  .max(150, 'El título no puede superar 150 caracteres');
const summary = z
  .string()
  .trim()
  .min(10, 'El resumen necesita al menos 10 caracteres')
  .max(300, 'El resumen no puede superar 300 caracteres');
/** Texto plano: los párrafos se separan con una línea en blanco. */
const content = z
  .string()
  .trim()
  .min(20, 'El contenido necesita al menos 20 caracteres')
  .max(20000, 'El contenido no puede superar 20.000 caracteres');

export const createAnnouncementSchema = z.strictObject({
  kind: announcementKindSchema.default('noticia'),
  title,
  summary,
  content,
  coverId: uuidSchema.nullable().optional(),
  /** Fecha de publicación (AAAA-MM-DD, hora de Ecuador); por defecto, hoy. */
  publishDate: dateSchema.optional(),
});

export const updateAnnouncementSchema = z.strictObject({
  kind: announcementKindSchema.optional(),
  title: title.optional(),
  summary: summary.optional(),
  content: content.optional(),
  coverId: uuidSchema.nullable().optional(),
  publishDate: dateSchema.optional(),
});

export const announcementListQuerySchema = listQuerySchema.extend({
  status: announcementStatusSchema.optional(),
  kind: announcementKindSchema.optional(),
});

export const publicAnnouncementsQuerySchema = listQuerySchema
  .pick({ page: true, pageSize: true })
  .extend({ kind: announcementKindSchema.optional() });

export const mediaFormSchema = z.object({
  altText: z
    .string()
    .trim()
    .min(3, 'Describa la imagen (mínimo 3 caracteres)')
    .max(200, 'La descripción no puede superar 200 caracteres'),
});

export const mediaListQuerySchema = listQuerySchema.pick({
  page: true,
  pageSize: true,
});

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
export type AnnouncementListQuery = z.infer<typeof announcementListQuerySchema>;
