import { z } from 'zod';
import {
  listQuerySchema,
  nameSchema,
  reasonSchema,
} from '../catalogs/common.js';

const teamStatusValues = ['activo', 'inactivo'] as const;

export const teamListQuerySchema = listQuerySchema.extend({
  clubId: z.uuid().optional(),
  sportId: z.uuid().optional(),
  status: z.enum(teamStatusValues).optional(),
});

export const createTeamSchema = z.strictObject({
  clubId: z.uuid(),
  sportId: z.uuid(),
  name: nameSchema,
});

/** El club y el deporte de un equipo no cambian: se crea otro equipo. */
export const updateTeamSchema = z
  .strictObject({
    name: nameSchema.optional(),
    status: z.enum(teamStatusValues).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Indique al menos un campo para modificar',
  });

export const enrollTeamSchema = z.strictObject({
  seasonId: z.uuid(),
  categoryId: z.uuid(),
  /** Nombre en esa temporada; si se omite, el nombre vigente del equipo. */
  name: nameSchema.optional(),
});

export const updateTeamSeasonSchema = z
  .strictObject({
    name: nameSchema.optional(),
    categoryId: z.uuid().optional(),
    rosterClosed: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Indique al menos un campo para modificar',
  });

const jersey = z
  .number()
  .int('Debe ser un número entero')
  .min(0, 'Entre 0 y 999')
  .max(999, 'Entre 0 y 999');

export const addToRosterSchema = z.strictObject({
  athleteId: z.uuid(),
  jerseyNumber: jersey.nullable().optional(),
});

export const updateMembershipSchema = z.strictObject({
  jerseyNumber: jersey.nullable(),
});

export const leaveSchema = z.strictObject({ reason: reasonSchema });

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type EnrollTeamInput = z.infer<typeof enrollTeamSchema>;
export type UpdateTeamSeasonInput = z.infer<typeof updateTeamSeasonSchema>;
export type AddToRosterInput = z.infer<typeof addToRosterSchema>;
