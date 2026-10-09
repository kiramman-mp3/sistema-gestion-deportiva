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

export const chessColorSchema = z.enum(['blancas', 'negras']);

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

export const periodScoreInputSchema = z.object({
  eventParticipantId: uuidSchema,
  periodNumber: z.number().int().min(1).max(10),
  score: z.number().int().min(0),
});

export const taekwondoBoutInputSchema = z.object({
  eventParticipantId: uuidSchema,
  roundNumber: z.number().int().min(1).max(5),
  points: z.number().int().min(0),
  penalties: z.number().int().min(0).default(0),
  decision: z.string().trim().max(100).optional().nullable(),
});

export const chessPairingInputSchema = z.object({
  eventParticipantId: uuidSchema,
  color: chessColorSchema,
  points: z.number().min(0).max(1),
  buchholz: z.number().min(0).optional().nullable(),
});

export const saveResultDraftSchema = z.object({
  values: z.array(resultValueInputSchema).min(1),
  footballEvents: z.array(footballEventInputSchema).optional(),
  periodScores: z.array(periodScoreInputSchema).optional(),
  taekwondoBouts: z.array(taekwondoBoutInputSchema).optional(),
  chessPairings: z.array(chessPairingInputSchema).optional(),
});

export const approveResultSchema = z.object({
  approved: z.boolean(),
  notes: z.string().trim().max(500).optional().nullable(),
  reason: z.string().trim().min(3).max(500),
});

export type ResultValueInput = z.infer<typeof resultValueInputSchema>;
export type FootballEventInput = z.infer<typeof footballEventInputSchema>;
export type PeriodScoreInput = z.infer<typeof periodScoreInputSchema>;
export type TaekwondoBoutInput = z.infer<typeof taekwondoBoutInputSchema>;
export type ChessPairingInput = z.infer<typeof chessPairingInputSchema>;
export type SaveResultDraftInput = z.infer<typeof saveResultDraftSchema>;
export type ApproveResultInput = z.infer<typeof approveResultSchema>;
