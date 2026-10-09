import { z } from 'zod';
import { uuidSchema } from '../auth/schemas.js';
import { listQuerySchema } from '../catalogs/common.js';

const text = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label}: mínimo ${min} caracteres`)
    .max(max, `${label}: máximo ${max} caracteres`);

const optionalUuid = uuidSchema.nullable().optional();

const date = z.iso.date();

export const INCIDENT_TYPES = [
  'agresion_fisica',
  'agresion_verbal',
  'conducta_antideportiva',
  'invasion_campo',
  'alineacion_indebida',
  'no_presentacion',
  'otro',
] as const;
export const incidentTypeSchema = z.enum(INCIDENT_TYPES);

export const SANCTION_TYPES = [
  'amonestacion',
  'suspension_partidos',
  'suspension_temporal',
  'descuento_puntos',
  'descalificacion',
  'multa',
] as const;
export const sanctionTypeSchema = z.enum(SANCTION_TYPES);

export const CASE_ENTRY_KINDS_MANUAL = [
  'nota',
  'recurso',
  'notificacion',
] as const;

// ───────────────────── Incidencias ─────────────────────

export const createIncidentSchema = z.strictObject({
  athleteId: optionalUuid,
  clubId: optionalUuid,
  type: incidentTypeSchema,
  description: text(5, 2000, 'La descripción'),
});

export const incidentListQuerySchema = listQuerySchema
  .pick({ page: true, pageSize: true })
  .extend({
    eventId: uuidSchema.optional(),
    athleteId: uuidSchema.optional(),
    clubId: uuidSchema.optional(),
    championshipId: uuidSchema.optional(),
    unlinked: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
  });

// ───────────────────── Reclamos ─────────────────────

export const createComplaintSchema = z.strictObject({
  championshipId: uuidSchema,
  eventId: optionalUuid,
  clubId: uuidSchema,
  subject: text(5, 200, 'El asunto'),
  description: text(10, 4000, 'La descripción'),
});

export const complaintListQuerySchema = listQuerySchema.extend({
  status: z
    .enum(['recibido', 'en_revision', 'resuelto', 'desestimado'])
    .optional(),
  clubId: uuidSchema.optional(),
  championshipId: uuidSchema.optional(),
});

export const dismissComplaintSchema = z.strictObject({
  reason: text(5, 500, 'El motivo'),
});

export const attachmentFormSchema = z.object({
  title: text(1, 150, 'El título'),
});

// ───────────────────── Expedientes ─────────────────────

export const createCaseSchema = z.strictObject({
  subject: text(5, 200, 'El asunto'),
  description: text(10, 4000, 'La descripción'),
  championshipId: optionalUuid,
  eventId: optionalUuid,
  clubId: optionalUuid,
  incidentIds: z.array(uuidSchema).max(50).optional(),
  complaintIds: z.array(uuidSchema).max(50).optional(),
});

export const updateCaseSchema = z.strictObject({
  subject: text(5, 200, 'El asunto').optional(),
  description: text(10, 4000, 'La descripción').optional(),
});

export const caseListQuerySchema = listQuerySchema.extend({
  status: z
    .enum(['abierto', 'en_revision', 'resuelto', 'archivado'])
    .optional(),
  reviewerId: uuidSchema.optional(),
  clubId: uuidSchema.optional(),
  championshipId: uuidSchema.optional(),
  published: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export const assignReviewerSchema = z.strictObject({
  reviewerId: uuidSchema,
});

export const caseEntrySchema = z.strictObject({
  kind: z.enum(CASE_ENTRY_KINDS_MANUAL),
  body: text(3, 4000, 'El texto'),
});

export const resolveCaseSchema = z.strictObject({
  resolution: text(10, 4000, 'La resolución'),
});

export const reasonSchema = z.strictObject({
  reason: text(5, 500, 'El motivo'),
});

export const publishCaseSchema = z.strictObject({
  publicTitle: text(5, 150, 'El título público'),
  publicSummary: text(20, 2000, 'El resumen público'),
});

// ───────────────────── Sanciones ─────────────────────

export const createSanctionSchema = z.strictObject({
  athleteId: optionalUuid,
  teamId: optionalUuid,
  clubId: optionalUuid,
  championshipId: optionalUuid,
  type: sanctionTypeSchema,
  reason: text(5, 1000, 'El motivo'),
  startsAt: date,
  endsAt: date.nullable().optional(),
  matchesCount: z.number().int().min(1).max(100).nullable().optional(),
  points: z.number().int().min(1).max(100).nullable().optional(),
});

export const sanctionListQuerySchema = listQuerySchema
  .pick({ page: true, pageSize: true })
  .extend({
    status: z.enum(['vigente', 'cumplida', 'anulada']).optional(),
    active: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
    athleteId: uuidSchema.optional(),
    teamId: uuidSchema.optional(),
    clubId: uuidSchema.optional(),
    championshipId: uuidSchema.optional(),
    caseId: uuidSchema.optional(),
  });

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;
export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type CreateSanctionInput = z.infer<typeof createSanctionSchema>;
export type CaseListQuery = z.infer<typeof caseListQuerySchema>;
export type SanctionListQuery = z.infer<typeof sanctionListQuerySchema>;
