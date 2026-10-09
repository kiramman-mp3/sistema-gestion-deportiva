export type { Page } from '../admin/types.ts';

export const INCIDENT_TYPE_LABELS: Record<string, string> = {
  agresion_fisica: 'Agresión física',
  agresion_verbal: 'Agresión verbal',
  conducta_antideportiva: 'Conducta antideportiva',
  invasion_campo: 'Invasión del campo',
  alineacion_indebida: 'Alineación indebida',
  no_presentacion: 'No presentación',
  otro: 'Otra',
};

export const SANCTION_TYPE_LABELS: Record<string, string> = {
  amonestacion: 'Amonestación',
  suspension_partidos: 'Suspensión por partidos',
  suspension_temporal: 'Suspensión temporal',
  descuento_puntos: 'Descuento de puntos',
  descalificacion: 'Descalificación',
  multa: 'Multa',
};

export const SANCTION_STATUS_LABELS: Record<string, string> = {
  vigente: 'Vigente',
  cumplida: 'Cumplida',
  anulada: 'Anulada',
};

export const CASE_STATUS_LABELS: Record<string, string> = {
  abierto: 'Abierto',
  en_revision: 'En revisión',
  resuelto: 'Resuelto',
  archivado: 'Archivado',
};

export const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  recibido: 'Recibido',
  en_revision: 'En revisión',
  resuelto: 'Resuelto',
  desestimado: 'Desestimado',
};

export const ENTRY_KIND_LABELS: Record<string, string> = {
  apertura: 'Apertura',
  nota: 'Nota',
  asignacion: 'Asignación',
  recurso: 'Recurso',
  notificacion: 'Notificación',
  decision: 'Decisión',
  reapertura: 'Reapertura',
  publicacion: 'Publicación',
  archivo: 'Archivo',
};

export interface IncidentItem {
  id: string;
  type: string;
  typeLabel: string;
  description: string;
  createdAt: string;
  caseId: string | null;
  reportedBy: string;
  event: { id: string; scheduledAt: string | null; match: string };
  championship: { id: string; name: string };
  athlete: { id: string; name: string } | null;
  club: { id: string; name: string } | null;
}

export interface ComplaintItem {
  id: string;
  subject: string;
  description: string;
  status: string;
  submittedAt: string;
  resolvedAt: string | null;
  dismissReason: string | null;
  eventId: string | null;
  club: { id: string; name: string };
  championship: { id: string; name: string };
  submittedBy: string;
  case: { id: string; code: string } | null;
  attachmentCount: number;
}

export interface ComplaintDetail extends ComplaintItem {
  attachments: {
    id: string;
    title: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
  }[];
}

export interface CaseListItem {
  id: string;
  code: string;
  subject: string;
  status: string;
  openedAt: string;
  resolvedAt: string | null;
  publishedAt: string | null;
  championship: { id: string; name: string } | null;
  club: { id: string; name: string } | null;
  reviewer: { id: string; displayName: string } | null;
  counts: { incidents: number; complaints: number; sanctions: number };
}

export interface SanctionItem {
  id: string;
  case: { id: string; code: string };
  type: string;
  typeLabel: string;
  reason: string;
  startsAt: string;
  endsAt: string | null;
  matchesCount: number | null;
  points: number | null;
  status: string;
  statusReason: string | null;
  isActive: boolean;
  athlete: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  club: { id: string; name: string } | null;
  championship: { id: string; name: string } | null;
}

export interface CaseDetail extends CaseListItem {
  description: string;
  resolution: string | null;
  resolvedBy: string | null;
  openedBy: string;
  publication: {
    publishedAt: string;
    publishedBy: string | null;
    publicTitle: string | null;
    publicSummary: string | null;
  } | null;
  event: { id: string; scheduledAt: string | null } | null;
  entries: {
    id: string;
    kind: string;
    body: string;
    author: string;
    createdAt: string;
  }[];
  incidents: {
    id: string;
    typeLabel: string;
    description: string;
    createdAt: string;
    athlete: string | null;
    club: string | null;
  }[];
  complaints: {
    id: string;
    subject: string;
    status: string;
    club: { id: string; name: string };
  }[];
  sanctions: {
    id: string;
    type: string;
    typeLabel: string;
    reason: string;
    startsAt: string;
    endsAt: string | null;
    matchesCount: number | null;
    points: number | null;
    status: string;
    statusReason: string | null;
    isActive: boolean;
    athlete: string | null;
    team: { id: string; name: string } | null;
    club: { id: string; name: string } | null;
  }[];
}

/** Datos con los que se abre un expediente a partir de una incidencia o un reclamo. */
export interface CasePrefill {
  subject: string;
  description: string;
  championshipId?: string;
  eventId?: string;
  incidentIds?: string[];
  complaintIds?: string[];
}
