import { z } from 'zod';
import { listQuerySchema, nameSchema, reasonSchema } from '../common.js';
import { isValidCalendarDate, seasonRangeError } from './seasons.rules.js';

export const seasonStatusValues = [
  'borrador',
  'activa',
  'finalizada',
  'archivada',
] as const;

const dateSchema = z
  .string('Fecha obligatoria')
  .refine(isValidCalendarDate, 'Use una fecha válida con formato AAAA-MM-DD');

export const seasonListQuerySchema = listQuerySchema.extend({
  status: z.enum(seasonStatusValues).optional(),
});

export const createSeasonSchema = z
  .strictObject({
    name: nameSchema,
    startDate: dateSchema,
    endDate: dateSchema,
  })
  .refine((v) => !seasonRangeError(v.startDate, v.endDate), {
    path: ['endDate'],
    message: 'La fecha de fin debe ser posterior a la de inicio',
  });

/** Actualización parcial; el estado se cambia con su propio endpoint. */
export const updateSeasonSchema = z
  .strictObject({
    name: nameSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Indique al menos un campo para modificar',
  });

/** El motivo es obligatorio: los cambios de estado de una temporada quedan justificados. */
export const seasonStatusSchema = z.strictObject({
  status: z.enum(seasonStatusValues),
  reason: reasonSchema,
});

export type CreateSeasonInput = z.infer<typeof createSeasonSchema>;
export type UpdateSeasonInput = z.infer<typeof updateSeasonSchema>;
