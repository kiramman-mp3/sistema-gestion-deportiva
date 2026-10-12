import { z } from 'zod';
import { listQuerySchema, reasonSchema } from '../catalogs/common.js';
import {
  calendarDate,
  idIssue,
  optionalText,
  personInputShape,
} from '../people/people.schemas.js';

export const personStatusValues = ['activo', 'inactivo'] as const;
export const eligibilityValues = [
  'pendiente',
  'habilitado',
  'inhabilitado',
] as const;
export const consentTypeValues = [
  'publicacion_perfil',
  'publicacion_foto',
  'tratamiento_datos',
] as const;

export const athleteListQuerySchema = listQuerySchema.extend({
  clubId: z.uuid().optional(),
  status: z.enum(personStatusValues).optional(),
  eligibility: z.enum(eligibilityValues).optional(),
});

export const createAthleteSchema = z
  .strictObject({
    clubId: z.uuid(),
    ...personInputShape,
    /** Confirma que, pese a coincidir nombre y fecha de nacimiento con otra persona, es alguien distinto. */
    confirmDuplicate: z.boolean().optional(),
  })
  .superRefine(idIssue);

export const updateAthleteSchema = z
  .strictObject({
    firstName: personInputShape.firstName.optional(),
    lastName: personInputShape.lastName.optional(),
    birthDate: personInputShape.birthDate,
    idType: personInputShape.idType,
    idNumber: personInputShape.idNumber,
    phone: personInputShape.phone,
    guardianName: personInputShape.guardianName,
    guardianRelation: personInputShape.guardianRelation,
    guardianPhone: personInputShape.guardianPhone,
  })
  .superRefine(idIssue)
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Indique al menos un campo para modificar',
  });

export const athleteStatusSchema = z.strictObject({
  status: z.enum(personStatusValues),
  reason: reasonSchema,
});

export const eligibilitySchema = z.strictObject({
  eligibility: z.enum(eligibilityValues),
  reason: reasonSchema,
});

export const transferSchema = z.strictObject({
  clubId: z.uuid(),
  reason: reasonSchema,
});

export const publicationSchema = z.strictObject({ published: z.boolean() });

export const createConsentSchema = z.strictObject({
  type: z.enum(consentTypeValues),
  purpose: optionalText(200).optional(),
  grantedByName: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1, 'Obligatorio').max(120, 'Máximo 120 caracteres')),
  /** `propio` si lo otorga la propia persona (mayor de edad); si no, el parentesco del tutor. */
  grantedByRelation: z
    .string()
    .transform((v) => v.trim().toLowerCase().replace(/\s+/g, ' '))
    .pipe(z.string().min(1, 'Obligatorio').max(40, 'Máximo 40 caracteres')),
  /** Último día de vigencia (`AAAA-MM-DD`); opcional. */
  expiresOn: calendarDate.nullable().optional(),
});

export const revokeConsentSchema = z.strictObject({ reason: reasonSchema });

/** Búsqueda por documento antes de registrar: ¿ya existe? ¿qué datos se pueden precargar? */
export const athleteLookupSchema = z
  .strictObject({
    idType: personInputShape.idType.default('cedula'),
    idNumber: personInputShape.idNumber.unwrap(),
  })
  .superRefine(idIssue);

export const queroLinkKindValues = [
  'nacimiento',
  'matrimonio',
  'padre',
  'madre',
] as const;

/** Reemplaza todos los vínculos con Quero del deportista (lista vacía = ninguno). */
export const originLinksSchema = z.strictObject({
  links: z
    .array(
      z
        .strictObject({
          kind: z.enum(queroLinkKindValues),
          relatedName: optionalText(160).optional(),
          relatedIdNumber: optionalText(30).optional(),
          birthPlace: optionalText(120).optional(),
        })
        .refine((l) => l.kind === 'nacimiento' || !!l.relatedName, {
          path: ['relatedName'],
          message: 'Indique el nombre de la persona de Quero',
        }),
    )
    .max(queroLinkKindValues.length)
    .refine((ls) => new Set(ls.map((l) => l.kind)).size === ls.length, {
      message: 'Cada vínculo se indica una sola vez',
    }),
});

export type CreateAthleteInput = z.infer<typeof createAthleteSchema>;
export type UpdateAthleteInput = z.infer<typeof updateAthleteSchema>;
export type CreateConsentInput = z.infer<typeof createConsentSchema>;
export type AthleteLookupInput = z.infer<typeof athleteLookupSchema>;
export type OriginLinksInput = z.infer<typeof originLinksSchema>;
