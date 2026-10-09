import { z } from 'zod';
import { uuidSchema } from '../../auth/schemas.js';
import {
  listQuerySchema,
  nameSchema,
  reasonSchema,
} from '../../catalogs/common.js';

export const championshipFormatSchema = z.enum([
  'todos_contra_todos',
  'eliminatoria_simple',
  'fase_grupos_y_eliminatoria',
  'sistema_suizo',
  'cuadro_combates',
]);

export const championshipStatusSchema = z.enum([
  'borrador',
  'inscripciones_abiertas',
  'inscripciones_cerradas',
  'en_curso',
  'finalizado',
  'archivado',
]);

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha AAAA-MM-DD');

export const createChampionshipSchema = z
  .object({
    seasonId: uuidSchema,
    sportId: uuidSchema,
    categoryId: uuidSchema,
    name: nameSchema,
    format: championshipFormatSchema,
    registrationStart: dateStringSchema.optional(),
    registrationEnd: dateStringSchema.optional(),
    startDate: dateStringSchema.optional(),
    endDate: dateStringSchema.optional(),
    rules: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (data) => {
      if (data.registrationStart && data.registrationEnd) {
        return data.registrationEnd >= data.registrationStart;
      }
      return true;
    },
    {
      message: 'El fin de inscripciones debe ser posterior o igual al inicio',
      path: ['registrationEnd'],
    },
  )
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.endDate >= data.startDate;
      }
      return true;
    },
    {
      message: 'La fecha de fin debe ser posterior o igual al inicio',
      path: ['endDate'],
    },
  );

export const updateChampionshipSchema = z
  .object({
    name: nameSchema.optional(),
    format: championshipFormatSchema.optional(),
    registrationStart: dateStringSchema.nullable().optional(),
    registrationEnd: dateStringSchema.nullable().optional(),
    startDate: dateStringSchema.nullable().optional(),
    endDate: dateStringSchema.nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.registrationStart && data.registrationEnd) {
        return data.registrationEnd >= data.registrationStart;
      }
      return true;
    },
    {
      message: 'El fin de inscripciones debe ser posterior o igual al inicio',
      path: ['registrationEnd'],
    },
  )
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.endDate >= data.startDate;
      }
      return true;
    },
    {
      message: 'La fecha de fin debe ser posterior o igual al inicio',
      path: ['endDate'],
    },
  );

export const transitionChampionshipSchema = z.object({
  status: championshipStatusSchema,
  reason: reasonSchema,
});

export const createRuleVersionSchema = z.object({
  rules: z.record(z.string(), z.unknown()),
});

export const championshipListQuerySchema = listQuerySchema.extend({
  seasonId: uuidSchema.optional(),
  sportId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  status: championshipStatusSchema.optional(),
});

export type CreateChampionshipInput = z.infer<typeof createChampionshipSchema>;
export type UpdateChampionshipInput = z.infer<typeof updateChampionshipSchema>;
export type TransitionChampionshipInput = z.infer<
  typeof transitionChampionshipSchema
>;
export type CreateRuleVersionInput = z.infer<typeof createRuleVersionSchema>;
export type ChampionshipListQuery = z.infer<typeof championshipListQuerySchema>;
