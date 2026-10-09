import { z } from 'zod';
import { emailSchema } from '../auth/schemas.js';
import {
  listQuerySchema,
  nameSchema,
  reasonSchema,
} from '../catalogs/common.js';
import {
  calendarDate,
  idIssue,
  optionalText,
  personInputShape,
  phoneSchema,
} from '../people/people.schemas.js';

export const clubStatusValues = [
  'activo',
  'inactivo',
  'suspendido',
  'archivado',
] as const;

const clubCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{2,20}$/, 'Use de 2 a 20 letras, números o guiones')
  .nullable();

const contactEmail = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.union([z.literal(''), emailSchema]))
  .transform((v) => (v === '' ? null : v))
  .nullable();

export const clubListQuerySchema = listQuerySchema.extend({
  status: z.enum(clubStatusValues).optional(),
});

export const createClubSchema = z.strictObject({
  name: nameSchema,
  shortName: optionalText(40).optional(),
  code: clubCode.optional(),
  sector: optionalText(100).optional(),
  contactEmail: contactEmail.optional(),
  contactPhone: phoneSchema.optional(),
});

/** El identificador público (slug) es estable: no se modifica una vez creado. */
export const updateClubSchema = z
  .strictObject({
    name: nameSchema.optional(),
    shortName: optionalText(40).optional(),
    code: clubCode.optional(),
    sector: optionalText(100).optional(),
    contactEmail: contactEmail.optional(),
    contactPhone: phoneSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Indique al menos un campo para modificar',
  });

export const clubStatusSchema = z.strictObject({
  status: z.enum(clubStatusValues),
  reason: reasonSchema,
});

const roleName = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1, 'Obligatorio').max(60, 'Máximo 60 caracteres'));

export const addRepresentativeSchema = z
  .strictObject({
    ...personInputShape,
    // La fecha de nacimiento y los datos del tutor no se piden para un representante.
    birthDate: z.undefined().optional(),
    guardianName: z.undefined().optional(),
    guardianRelation: z.undefined().optional(),
    guardianPhone: z.undefined().optional(),
    roleName,
    validFrom: calendarDate,
    validUntil: calendarDate.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    idIssue(v, ctx);
    if (v.validUntil && v.validUntil < v.validFrom) {
      ctx.addIssue({
        code: 'custom',
        path: ['validUntil'],
        message:
          'El fin de la representación no puede ser anterior a su inicio',
      });
    }
  });

export const updateRepresentativeSchema = z
  .strictObject({
    roleName: roleName.optional(),
    validUntil: calendarDate.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Indique al menos un campo para modificar',
  });

export const clubUserSchema = z.strictObject({});

export type CreateClubInput = z.infer<typeof createClubSchema>;
export type UpdateClubInput = z.infer<typeof updateClubSchema>;
export type AddRepresentativeInput = z.infer<typeof addRepresentativeSchema>;
