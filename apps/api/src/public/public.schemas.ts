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
  status: publicChampionshipStatusSchema.optional(),
  q: z.string().trim().max(100).optional(),
});

export type PublicChampionshipsQuery = z.infer<
  typeof publicChampionshipsQuerySchema
>;
