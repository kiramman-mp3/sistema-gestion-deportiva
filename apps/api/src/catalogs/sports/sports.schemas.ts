import { z } from 'zod';
import {
  catalogStatusSchema,
  codeSchema,
  listQuerySchema,
  nameSchema,
  reasonSchema,
} from '../common.js';

export const sportListQuerySchema = listQuerySchema.extend({
  status: catalogStatusSchema.optional(),
});

export const createSportSchema = z.strictObject({
  code: codeSchema,
  name: nameSchema,
});

/** El código es estable: no se puede modificar una vez creado. */
export const updateSportSchema = z.strictObject({ name: nameSchema });

export const sportStatusSchema = z.strictObject({
  status: catalogStatusSchema,
  reason: reasonSchema.optional(),
});

export type CreateSportInput = z.infer<typeof createSportSchema>;
export type UpdateSportInput = z.infer<typeof updateSportSchema>;
