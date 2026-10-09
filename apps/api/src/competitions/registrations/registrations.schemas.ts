import { z } from 'zod';
import { uuidSchema } from '../../auth/schemas.js';

export const registrationStatusSchema = z.enum([
  'borrador',
  'pendiente',
  'observada',
  'aprobada',
  'rechazada',
  'retirada',
]);

export const createRegistrationSchema = z
  .object({
    kind: z.enum(['equipo', 'individual']),
    teamId: uuidSchema.optional(),
    athleteId: uuidSchema.optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine(
    (data) => {
      if (data.kind === 'equipo') return Boolean(data.teamId);
      if (data.kind === 'individual') return Boolean(data.athleteId);
      return false;
    },
    {
      message: 'Debe especificar el equipo o el deportista según el tipo de participante',
      path: ['teamId'],
    },
  );

export const reviewRegistrationSchema = z.object({
  status: registrationStatusSchema,
  reviewNotes: z.string().trim().max(500).optional(),
});

export type CreateRegistrationInput = z.infer<typeof createRegistrationSchema>;
export type ReviewRegistrationInput = z.infer<typeof reviewRegistrationSchema>;
