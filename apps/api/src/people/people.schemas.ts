import { z } from 'zod';
import { normalizeName } from '../catalogs/common.js';
import { normalizeIdNumber } from '../common/keys.js';
import { isValidCalendarDate } from '../catalogs/seasons/seasons.rules.js';

/** Fecha de hoy en la zona horaria local acordada (America/Guayaquil), `AAAA-MM-DD`. */
export function todayInGuayaquil(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
  }).format(now);
}

/**
 * Cédula ecuatoriana: 10 dígitos, provincia 01–24 o 30, tercer dígito < 6 y dígito
 * verificador por módulo 10 (coeficientes 2,1,2,1,2,1,2,1,2). Es una regla nacional,
 * no una decisión de la Liga.
 */
export function isValidEcuadorianCedula(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const province = Number(value.slice(0, 2));
  if (!((province >= 1 && province <= 24) || province === 30)) return false;
  if (Number(value[2]) >= 6) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(value[i]) * (i % 2 === 0 ? 2 : 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return (10 - (sum % 10)) % 10 === Number(value[9]);
}

const personName = z
  .string()
  .transform(normalizeName)
  .pipe(z.string().min(1, 'Obligatorio').max(80, 'Máximo 80 caracteres'));

/** Texto opcional: se recorta y una cadena vacía equivale a «sin valor». */
export const optionalText = (max: number) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().max(max, `Máximo ${max} caracteres`))
    .transform((v) => (v === '' ? null : v))
    .nullable();

export const phoneSchema = optionalText(30).refine(
  (v) => v === null || /^[0-9+()\- ]{6,30}$/.test(v),
  'Use solo números, espacios, +, - y paréntesis (6 a 30 caracteres)',
);

export const calendarDate = z
  .string('Fecha obligatoria')
  .refine(isValidCalendarDate, 'Use una fecha válida con formato AAAA-MM-DD');

export const birthDateSchema = calendarDate.refine(
  (v) => v >= '1900-01-01' && v <= todayInGuayaquil(),
  'La fecha de nacimiento no puede ser futura ni anterior a 1900',
);

/** Datos de identidad. Los privados (documento, teléfono, tutor) se separan al guardar. */
export const personInputShape = {
  firstName: personName,
  lastName: personName,
  birthDate: birthDateSchema.nullable().optional(),
  idType: z.enum(['cedula', 'pasaporte', 'otro']).optional(),
  idNumber: z
    .string()
    .trim()
    .min(3, 'Muy corto')
    .max(30, 'Máximo 30 caracteres')
    .optional(),
  phone: phoneSchema.optional(),
  guardianName: optionalText(120).optional(),
  guardianRelation: optionalText(40).optional(),
  guardianPhone: phoneSchema.optional(),
};

/** Reglas cruzadas del documento (tipo y número van juntos; la cédula se valida). */
export function idIssue(
  v: { idType?: string; idNumber?: string },
  ctx: z.RefinementCtx,
): void {
  if ((v.idType === undefined) !== (v.idNumber === undefined)) {
    ctx.addIssue({
      code: 'custom',
      path: [v.idNumber === undefined ? 'idNumber' : 'idType'],
      message: 'Indique el tipo y el número de documento juntos',
    });
    return;
  }
  if (v.idType === 'cedula' && v.idNumber !== undefined) {
    if (!isValidEcuadorianCedula(normalizeIdNumber(v.idNumber))) {
      ctx.addIssue({
        code: 'custom',
        path: ['idNumber'],
        message: 'La cédula no es válida',
      });
    }
  }
}

export const PRIVATE_FIELDS = [
  'idType',
  'idNumber',
  'phone',
  'guardianName',
  'guardianRelation',
  'guardianPhone',
] as const;

export type PersonInput = {
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  idType?: 'cedula' | 'pasaporte' | 'otro';
  idNumber?: string;
  phone?: string | null;
  guardianName?: string | null;
  guardianRelation?: string | null;
  guardianPhone?: string | null;
};

/** Edad cumplida en una fecha de referencia (`AAAA-MM-DD`). */
export function ageOn(birthDate: string, reference: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const [ry, rm, rd] = reference.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  let age = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) age -= 1;
  return age;
}

export const MAJORITY_AGE = 18;
