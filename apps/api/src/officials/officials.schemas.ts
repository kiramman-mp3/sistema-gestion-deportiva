import { z } from 'zod';
import { uuidSchema, emailSchema } from '../auth/schemas.js';
import { listQuerySchema, nameSchema } from '../catalogs/common.js';

export const officialStatusSchema = z.enum([
  'activo',
  'inactivo',
  'suspendido',
]);

export const ASSIGNMENT_ROLES = [
  'arbitro_central',
  'asistente_1',
  'asistente_2',
  'cuarto_arbitro',
  'juez_mesa',
  'cronometrista',
  'anotador',
  'juez_taekwondo',
  'arbitro_ajedrez',
  'comisario',
] as const;
export const assignmentRoleSchema = z.enum(ASSIGNMENT_ROLES);

export const ASSIGNMENT_ROLE_LABELS: Record<
  (typeof ASSIGNMENT_ROLES)[number],
  string
> = {
  arbitro_central: 'árbitro central',
  asistente_1: 'asistente 1',
  asistente_2: 'asistente 2',
  cuarto_arbitro: 'cuarto árbitro',
  juez_mesa: 'juez de mesa',
  cronometrista: 'cronometrista',
  anotador: 'anotador',
  juez_taekwondo: 'juez de taekwondo',
  arbitro_ajedrez: 'árbitro de ajedrez',
  comisario: 'comisario',
};

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value));

const sportIds = z
  .array(uuidSchema)
  .min(1, 'Indique al menos un deporte')
  .max(20)
  .refine((ids) => new Set(ids).size === ids.length, 'Deportes repetidos');

const phone = optional(30);
const licenseNumber = optional(40);
const userEmail = z
  .union([z.literal(''), emailSchema])
  .nullable()
  .optional()
  .transform((value) => (value === '' ? null : value));

export const createOfficialSchema = z
  .strictObject({
    /** Persona ya registrada (p. ej. un exjugador); si se omite, se crea con los nombres. */
    personId: uuidSchema.optional(),
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    clubId: uuidSchema.nullable().optional(),
    licenseNumber,
    phone,
    sportIds,
    userEmail,
  })
  .refine((v) => v.personId || (v.firstName && v.lastName), {
    message: 'Indique nombres y apellidos, o una persona existente',
    path: ['firstName'],
  });

export const updateOfficialSchema = z.strictObject({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  clubId: uuidSchema.nullable().optional(),
  status: officialStatusSchema.optional(),
  licenseNumber,
  phone,
  sportIds: sportIds.optional(),
  userEmail,
});

export const officialListQuerySchema = listQuerySchema.extend({
  status: officialStatusSchema.optional(),
  sportId: uuidSchema.optional(),
});

export const unavailabilitySchema = z
  .strictObject({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    reason: optional(200),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: 'La fecha final debe ser posterior a la inicial',
    path: ['endsAt'],
  });

export const historyQuerySchema = listQuerySchema.pick({
  page: true,
  pageSize: true,
});

export const createAssignmentSchema = z.strictObject({
  officialId: uuidSchema,
  role: assignmentRoleSchema,
  notes: optional(300),
});

export const removeAssignmentSchema = z.strictObject({
  reason: optional(300),
});

export const respondAssignmentSchema = z
  .strictObject({
    response: z.enum(['confirmar', 'rechazar']),
    reason: optional(300),
  })
  .refine((v) => v.response === 'confirmar' || (v.reason?.length ?? 0) >= 3, {
    message: 'Indique el motivo del rechazo (mínimo 3 caracteres)',
    path: ['reason'],
  });

export const myAssignmentsQuerySchema = listQuerySchema
  .pick({ page: true, pageSize: true })
  .extend({
    scope: z.enum(['proximas', 'pasadas', 'todas']).default('proximas'),
  });

export type CreateOfficialInput = z.infer<typeof createOfficialSchema>;
export type UpdateOfficialInput = z.infer<typeof updateOfficialSchema>;
export type OfficialListQuery = z.infer<typeof officialListQuerySchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type RespondAssignmentInput = z.infer<typeof respondAssignmentSchema>;
