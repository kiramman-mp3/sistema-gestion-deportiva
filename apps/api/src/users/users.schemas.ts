import { z } from 'zod';
import { emailSchema } from '../auth/schemas.js';
import {
  listQuerySchema,
  normalizeName,
  reasonSchema,
} from '../catalogs/common.js';

export const displayNameSchema = z
  .string()
  .transform(normalizeName)
  .pipe(z.string().min(1, 'Obligatorio').max(120, 'Máximo 120 caracteres'));

export const userStatusValues = [
  'pendiente',
  'activo',
  'inactivo',
  'bloqueado',
] as const;

export const userListQuerySchema = listQuerySchema.extend({
  status: z.enum(userStatusValues).optional(),
  roleId: z.uuid().optional(),
});

/** Alta administrativa: sin contraseña, sin roles y sin estado (nace «pendiente»). */
export const createUserSchema = z.strictObject({
  email: emailSchema,
  displayName: displayNameSchema,
});

/** Solo datos administrativos. Estado, roles y contraseña tienen sus propias operaciones. */
export const updateUserSchema = z
  .strictObject({
    email: emailSchema.optional(),
    displayName: displayNameSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Indique al menos un campo para modificar',
  });

/** Estados que un administrador puede fijar (activar, desactivar, bloquear). */
export const setUserStatusSchema = z.strictObject({
  status: z.enum(['activo', 'inactivo', 'bloqueado']),
  reason: reasonSchema,
});

export const revokeReasonSchema = z.strictObject({ reason: reasonSchema });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
