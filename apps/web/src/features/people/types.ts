export type { Page } from '../admin/types.ts';

export type ClubStatus = 'activo' | 'inactivo' | 'suspendido' | 'archivado';
export const CLUB_STATUS_LABELS: Record<ClubStatus, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  suspendido: 'Suspendido',
  archivado: 'Archivado',
};

export interface Club {
  id: string;
  name: string;
  shortName: string | null;
  slug: string;
  code: string | null;
  sector: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: ClubStatus;
}

export type Eligibility = 'pendiente' | 'habilitado' | 'inhabilitado';
export const ELIGIBILITY_LABELS: Record<Eligibility, string> = {
  pendiente: 'Pendiente de validación',
  habilitado: 'Habilitado',
  inhabilitado: 'Inhabilitado',
};

export type PersonStatus = 'activo' | 'inactivo';
export const PERSON_STATUS_LABELS: Record<PersonStatus, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
};

/** Datos personales: solo llegan con el permiso `athletes:read_full`. */
export interface AthleteFull {
  birthDate: string | null;
  age: number | null;
  idType: string | null;
  idNumber: string | null;
  phone: string | null;
  guardianName: string | null;
  guardianRelation: string | null;
  guardianPhone: string | null;
}

export interface Athlete {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  status: PersonStatus;
  eligibility: Eligibility;
  publicProfile: boolean;
  club: { id: string; name: string };
  full?: AthleteFull;
}

export type ConsentType =
  'tratamiento_datos' | 'publicacion_perfil' | 'publicacion_foto';
export const CONSENT_LABELS: Record<ConsentType, string> = {
  tratamiento_datos: 'Tratamiento de datos',
  publicacion_perfil: 'Publicación del perfil',
  publicacion_foto: 'Publicación de fotografías',
};

export interface Consent {
  id: string;
  type: ConsentType;
  status: 'otorgado' | 'revocado';
  purpose: string | null;
  grantedByName: string;
  grantedByRelation: string;
  recordedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  active: boolean;
}

export interface Team {
  id: string;
  name: string;
  status: 'activo' | 'inactivo';
  club: { id: string; name: string };
  sport: { id: string; name: string };
}

export interface TeamSeason {
  id: string;
  teamId: string;
  name: string;
  rosterClosed: boolean;
  activeMembers: number;
  season: { id: string; name: string; status: string; startDate: string };
  category: {
    id: string;
    name: string;
    ageMin: number | null;
    ageMax: number | null;
  };
}

export interface TeamDetail extends Team {
  seasons: TeamSeason[];
}

export interface RosterEntry {
  id: string;
  status: 'activo' | 'baja';
  jerseyNumber: number | null;
  leaveReason: string | null;
  athlete: {
    id: string;
    code: string;
    firstName: string;
    lastName: string;
    eligibility: Eligibility;
  };
}

export interface AthleteTeam {
  membershipId: string;
  status: 'activo' | 'baja';
  team: { id: string; name: string };
  sport: { id: string; name: string };
  category: { id: string; name: string };
  season: { id: string; name: string; status: string };
}

export interface CatalogItem {
  id: string;
  name: string;
  status: string;
}

/** Temporadas en las que aún se puede cambiar la información (las demás son historial). */
export const EDITABLE_SEASONS = ['borrador', 'activa'];

export type DocumentType =
  | 'identificacion'
  | 'certificado_medico'
  | 'formulario_inscripcion'
  | 'otro';

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  identificacion: 'Cédula / Identificación',
  certificado_medico: 'Certificado Médico',
  formulario_inscripcion: 'Formulario de Inscripción',
  otro: 'Otro Documento',
};

export interface AthleteDocument {
  id: string;
  athleteId: string;
  fileId: string;
  type: DocumentType;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  verified: boolean;
  verifiedAt: string | null;
  verifiedBy: { id: string; displayName: string } | null;
  createdAt: string;
}

