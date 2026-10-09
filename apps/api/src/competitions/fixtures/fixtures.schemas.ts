import { z } from 'zod';
import { uuidSchema } from '../../auth/schemas.js';

export const stageTypeSchema = z.enum(['grupo', 'eliminatoria', 'unico']);

export const eventStatusSchema = z.enum([
  'programado',
  'en_curso',
  'finalizado',
  'suspendido',
  'postergado',
  'cancelado',
]);

export const createStageSchema = z.object({
  name: z.string().trim().min(2).max(100),
  stageType: stageTypeSchema.default('grupo'),
  sequence: z.number().int().positive().optional(),
});

export const createRoundSchema = z.object({
  name: z.string().trim().min(2).max(100),
  roundNumber: z.number().int().positive().optional(),
});

export const createEventSchema = z
  .object({
    venueId: uuidSchema.optional().nullable(),
    scheduledAt: z.string().datetime().optional().nullable(),
    homeRegistrationId: uuidSchema,
    awayRegistrationId: uuidSchema,
  })
  .refine((data) => data.homeRegistrationId !== data.awayRegistrationId, {
    message: 'El participante local y visitante no pueden ser el mismo',
    path: ['awayRegistrationId'],
  });

export const rescheduleEventSchema = z.object({
  venueId: uuidSchema.optional().nullable(),
  scheduledAt: z.string().datetime().optional().nullable(),
  reason: z.string().trim().min(3).max(500),
});

export const changeEventStatusSchema = z.object({
  status: eventStatusSchema,
  reason: z.string().trim().max(500).optional(),
});

export const listEventsQuerySchema = z.object({
  stageId: uuidSchema.optional(),
  roundId: uuidSchema.optional(),
  status: eventStatusSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type CreateStageInput = z.infer<typeof createStageSchema>;
export type CreateRoundInput = z.infer<typeof createRoundSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type RescheduleEventInput = z.infer<typeof rescheduleEventSchema>;
export type ChangeEventStatusInput = z.infer<typeof changeEventStatusSchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
