import { z } from 'zod';
import {
  catalogStatusSchema,
  codeSchema,
  listQuerySchema,
  nameSchema,
  reasonSchema,
} from '../common.js';

export const MAX_AGE = 120;

const age = z
  .number('Debe ser un número')
  .int('Debe ser un número entero')
  .min(0, 'No puede ser negativa')
  .max(MAX_AGE, `Máximo ${MAX_AGE}`);

const sortOrder = z
  .number('Debe ser un número')
  .int('Debe ser un número entero')
  .min(0, 'No puede ser negativo')
  .max(9999, 'Máximo 9999');

/** Coherencia entre edad mínima y máxima (si ambas existen). */
export function ageRangeError(
  ageMin: number | null | undefined,
  ageMax: number | null | undefined,
): string | null {
  if (ageMin != null && ageMax != null && ageMin > ageMax) {
    return 'La edad máxima no puede ser menor que la mínima';
  }
  return null;
}

export const categoryListQuerySchema = listQuerySchema.extend({
  status: catalogStatusSchema.optional(),
});

export const createCategorySchema = z
  .strictObject({
    code: codeSchema,
    name: nameSchema,
    ageMin: age.nullable().optional(),
    ageMax: age.nullable().optional(),
    sortOrder: sortOrder.optional(),
  })
  .refine((v) => !ageRangeError(v.ageMin, v.ageMax), {
    path: ['ageMax'],
    message: 'La edad máxima no puede ser menor que la mínima',
  });

/** Actualización parcial. `null` borra el límite de edad. El código no es editable. */
export const updateCategorySchema = z
  .strictObject({
    name: nameSchema.optional(),
    ageMin: age.nullable().optional(),
    ageMax: age.nullable().optional(),
    sortOrder: sortOrder.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Indique al menos un campo para modificar',
  });

export const categoryStatusSchema = z.strictObject({
  status: catalogStatusSchema,
  reason: reasonSchema.optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
