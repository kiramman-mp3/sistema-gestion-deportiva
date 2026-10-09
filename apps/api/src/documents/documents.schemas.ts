import { z } from 'zod';

export const documentTypeSchema = z.enum([
  'identificacion',
  'certificado_medico',
  'formulario_inscripcion',
  'otro',
]);

export type DocumentTypeEnum = z.infer<typeof documentTypeSchema>;

export const uploadDocumentSchema = z.object({
  type: documentTypeSchema,
  title: z
    .string()
    .trim()
    .min(1, 'El título es obligatorio')
    .max(150, 'El título no puede exceder 150 caracteres'),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;

export const verifyDocumentSchema = z.object({
  verified: z.boolean(),
  reason: z.string().trim().max(255).optional(),
});

export type VerifyDocumentInput = z.infer<typeof verifyDocumentSchema>;

export interface UploadFilePayload {
  fieldname?: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
