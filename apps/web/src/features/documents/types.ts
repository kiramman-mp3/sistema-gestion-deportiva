export type { Page } from '../admin/types.ts';

export interface IssuedDocument {
  id: string;
  kind: 'carne' | 'certificado_inscripcion';
  label: string;
  version: number;
  season: string;
  verificationCode: string;
  issuedAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  valid: boolean;
}

export const KIND_LABELS: Record<IssuedDocument['kind'], string> = {
  carne: 'Carné',
  certificado_inscripcion: 'Certificado de inscripción',
};

export interface Verification {
  valid: boolean;
  kind: IssuedDocument['kind'];
  label: string;
  version: number;
  season: string;
  issuedAt: string;
  revokedAt: string | null;
  holder: string;
  club: string;
}
