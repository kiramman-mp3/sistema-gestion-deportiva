import { z } from 'zod';
import {
  catalogStatusSchema,
  listQuerySchema,
  nameSchema,
} from '../../catalogs/common.js';

export const createVenueSchema = z.object({
  name: nameSchema,
  address: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((v) => v || undefined),
  capacity: z.coerce
    .number()
    .int()
    .min(0, 'La capacidad no puede ser negativa')
    .optional(),
});

export const updateVenueSchema = z.object({
  name: nameSchema.optional(),
  address: z.string().trim().max(255).nullable().optional(),
  capacity: z.coerce
    .number()
    .int()
    .min(0, 'La capacidad no puede ser negativa')
    .nullable()
    .optional(),
  status: catalogStatusSchema.optional(),
});

export const venueListQuerySchema = listQuerySchema.extend({
  status: catalogStatusSchema.optional(),
});

export type CreateVenueInput = z.infer<typeof createVenueSchema>;
export type UpdateVenueInput = z.infer<typeof updateVenueSchema>;
export type VenueListQuery = z.infer<typeof venueListQuerySchema>;
