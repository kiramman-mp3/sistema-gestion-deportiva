import { z } from 'zod';
import { emailSchema } from '../auth/schemas.js';

/** Texto opcional: la cadena vacía borra el valor (`null`). */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value));

const optionalEmail = z
  .union([z.literal(''), emailSchema])
  .nullable()
  .optional()
  .transform((value) => (value === '' ? null : value));

const website = z
  .string()
  .trim()
  .max(200, 'Máximo 200 caracteres')
  .nullable()
  .optional()
  .transform((value) => (value === '' ? null : value))
  .refine(
    (value) => {
      if (value === null || value === undefined) return true;
      try {
        const { protocol } = new URL(value);
        return protocol === 'http:' || protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Indique una dirección que empiece por http:// o https://' },
  );

export const updateInstitutionSchema = z.strictObject({
  name: z.string().trim().min(1, 'Obligatorio').max(150).optional(),
  shortName: text(60),
  affiliation: text(200),
  canton: text(200),
  address: text(255),
  email: optionalEmail,
  phone: text(30),
  website,
  about: text(5000),
  contactInfo: text(3000),
  privacyPolicy: text(20000),
  documentFooter: text(300),
  presidentName: text(120),
  secretaryName: text(120),
  publicClubs: z.boolean().optional(),
  publicAthletes: z.boolean().optional(),
  publicNews: z.boolean().optional(),
  publicResolutions: z.boolean().optional(),
  allowSelfApproval: z.boolean().optional(),
});

export type UpdateInstitutionInput = z.infer<typeof updateInstitutionSchema>;

/** Parámetros de publicación que pueden apagar una parte del portal. */
export type PublicationFlag =
  'publicClubs' | 'publicAthletes' | 'publicNews' | 'publicResolutions';
