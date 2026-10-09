import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Correo electrónico inválido'));

/**
 * Política de contraseñas (NIST SP 800-63B): longitud mínima de 12 y máxima de
 * 128 (acota el coste del hash), sin reglas de composición.
 */
export const newPasswordSchema = z
  .string()
  .min(12, 'La contraseña debe tener al menos 12 caracteres')
  .max(128, 'La contraseña no puede superar 128 caracteres');

export const loginSchema = z.object({
  email: emailSchema,
  // En el login solo se acota el tamaño: no se revela la política.
  password: z.string().min(1).max(128),
});

export const uuidSchema = z.uuid();

export const userStatusSchema = z.object({
  status: z.enum(['activo', 'inactivo', 'bloqueado']),
  reason: z.string().trim().min(3, 'Indique el motivo').max(500),
});

export const revokeSessionsSchema = z.object({
  reason: z.string().trim().min(3, 'Indique el motivo').max(500),
});

/** Valida con zod y responde 400 con errores por campo, sin eco de los valores. */
export function parseOrThrow<T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'Solicitud inválida',
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.') || null,
        message: issue.message,
      })),
    });
  }
  return result.data;
}
