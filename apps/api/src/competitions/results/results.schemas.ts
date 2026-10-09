import { z } from 'zod';
import { uuidSchema } from '../../auth/schemas.js';

export const resultStatusSchema = z.enum([
  'borrador',
  'pendiente_revision',
  'aprobado',
  'rechazado',
  'anulado',
]);

export const resultOutcomeSchema = z.enum([
  'victoria',
  'empate',
  'derrota',
  'no_presentado',
]);

export const footballEventTypeSchema = z.enum([
  'gol',
  'tarjeta_amarilla',
  'tarjeta_roja',
  'sustitucion',
]);

export const resultValueInputSchema = z.object({
  eventParticipantId: uuidSchema,
  score: z.number().int().min(0),
  outcome: resultOutcomeSchema.optional(),
});

export const footballEventInputSchema = z.object({
  eventParticipantId: uuidSchema,
  athleteId: uuidSchema.optional().nullable(),
  eventType: footballEventTypeSchema,
  minute: z.number().int().min(1).max(130),
  notes: z.string().trim().max(200).optional().nullable(),
});

export const saveResultDraftSchema = z.object({
  values: z.array(resultValueInputSchema).min(1),
  footballEvents: z.array(footballEventInputSchema).optional(),
});

export const approveResultSchema = z.object({
  approved: z.boolean(),
  notes: z.string().trim().max(500).optional().nullable(),
  reason: z.string().trim().min(3).max(500),
});

export type ResultValueInput = z.infer<typeof resultValueInputSchema>;
export type FootballEventInput = z.infer<typeof footballEventInputSchema>;
export type SaveResultDraftInput = z.infer<typeof saveResultDraftSchema>;
export type ApproveResultInput = z.infer<typeof approveResultSchema>;
