import { z } from 'zod';
import { uuidSchema } from '../auth/schemas.js';
import { listQuerySchema } from '../catalogs/common.js';

export const publicChampionshipStatusSchema = z.enum([
  'inscripciones_abiertas',
  'inscripciones_cerradas',
  'en_curso',
  'finalizado',
]);

export const publicChampionshipsQuerySchema = listQuerySchema.extend({
  sportId: uuidSchema.optional(),
  seasonId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  status: publicChampionshipStatusSchema.optional(),
  q: z.string().trim().max(100).optional(),
});

export type PublicChampionshipsQuery = z.infer<
  typeof publicChampionshipsQuerySchema
>;

export const publicEventsQuerySchema = listQuerySchema
  .pick({ page: true, pageSize: true })
  .extend({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    sportId: uuidSchema.optional(),
    categoryId: uuidSchema.optional(),
    seasonId: uuidSchema.optional(),
    championshipId: uuidSchema.optional(),
    clubId: uuidSchema.optional(),
    status: z
      .enum([
        'programado',
        'en_curso',
        'finalizado',
        'suspendido',
        'postergado',
        'cancelado',
      ])
      .optional(),
    order: z.enum(['asc', 'desc']).default('asc'),
  });
