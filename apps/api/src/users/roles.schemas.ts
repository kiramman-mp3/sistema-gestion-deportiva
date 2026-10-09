import { z } from 'zod';
import { normalizeName } from '../catalogs/common.js';

/** Los códigos de rol siguen el formato que impone la base de datos (CHECK). */
export const roleCodeSchema = z
  .string()
  .trim()
  .min(2, 'Mínimo 2 caracteres')
  .max(40, 'Máximo 40 caracteres')
  .regex(
    /^[a-z][a-z0-9_]*$/,
    'Use minúsculas, números y guion bajo, empezando con una letra',
  );

const roleNameSchema = z
  .string()
  .transform(normalizeName)
  .pipe(z.string().min(1, 'Obligatorio').max(100, 'Máximo 100 caracteres'));

const roleDescriptionSchema = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().max(500, 'Máximo 500 caracteres'))
  .nullable();

/** Lista de permisos: sin duplicados; cada código se valida contra el catálogo del sistema. */
export const permissionListSchema = z
  .array(z.string().trim().min(1).max(60), 'Debe ser una lista de permisos')
  .max(200, 'Demasiados permisos')
  .transform((codes) => [...new Set(codes)]);

export const createRoleSchema = z.strictObject({
  code: roleCodeSchema,
  name: roleNameSchema,
  description: roleDescriptionSchema.optional(),
  permissions: permissionListSchema.optional(),
});

/** Solo nombre y descripción. El código es estable y los permisos tienen su propia operación. */
export const updateRoleSchema = z
  .strictObject({
    name: roleNameSchema.optional(),
    description: roleDescriptionSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Indique al menos un campo para modificar',
  });

/** Reemplaza el conjunto completo de permisos del rol. */
export const setRolePermissionsSchema = z.strictObject({
  permissions: permissionListSchema,
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
