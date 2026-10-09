export type { Page } from '../admin/types.ts';

export type OfficialStatus = 'activo' | 'inactivo' | 'suspendido';

export const OFFICIAL_STATUS_LABELS: Record<OfficialStatus, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  suspendido: 'Suspendido',
};

export interface Official {
  id: string;
  firstName: string;
  lastName: string;
  status: OfficialStatus;
  licenseNumber: string | null;
  club: { id: string; name: string } | null;
  sports: { id: string; code: string; name: string }[];
  hasAccount: boolean;
  /** Solo con permiso de gestión de oficiales o de designaciones. */
  phone?: string | null;
  /** Solo con permiso de gestión de oficiales. */
  account?: { email: string; displayName: string } | null;
  createdAt: string;
}

export interface Unavailability {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export interface OfficialDetail extends Official {
  unavailabilities: Unavailability[];
  upcomingAssignments: number;
}

export type AssignmentRole =
  | 'arbitro_central'
  | 'asistente_1'
  | 'asistente_2'
  | 'cuarto_arbitro'
  | 'juez_mesa'
  | 'cronometrista'
  | 'anotador'
  | 'juez_taekwondo'
  | 'arbitro_ajedrez'
  | 'comisario';

export const ASSIGNMENT_ROLE_LABELS: Record<AssignmentRole, string> = {
  arbitro_central: 'Árbitro central',
  asistente_1: 'Asistente 1',
  asistente_2: 'Asistente 2',
  cuarto_arbitro: 'Cuarto árbitro',
  juez_mesa: 'Juez de mesa',
  cronometrista: 'Cronometrista',
  anotador: 'Anotador',
  juez_taekwondo: 'Juez de taekwondo',
  arbitro_ajedrez: 'Árbitro de ajedrez',
  comisario: 'Comisario',
};

export type AssignmentStatus = 'designado' | 'confirmado' | 'rechazado';

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  designado: 'Pendiente de respuesta',
  confirmado: 'Confirmada',
  rechazado: 'Rechazada',
};

export interface EventAssignmentItem {
  id: string;
  role: AssignmentRole;
  roleLabel: string;
  status: AssignmentStatus;
  notes: string | null;
  responseNote: string | null;
  respondedAt: string | null;
  official: { id: string; firstName: string; lastName: string };
}

export interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  alreadyAssigned: boolean;
  conflicts: { code: string; message: string }[];
}

export interface HistoryItem {
  id: string;
  role: AssignmentRole;
  status: AssignmentStatus;
  event: { id: string; scheduledAt: string | null; status: string };
  championship: { id: string; name: string; sport: string };
}

export interface MyAssignment {
  id: string;
  role: AssignmentRole;
  roleLabel: string;
  status: AssignmentStatus;
  responseNote: string | null;
  event: {
    id: string;
    scheduledAt: string | null;
    status: string;
    match: string;
    venue: { name: string; address: string | null } | null;
  };
  championship: { id: string; name: string };
}

export interface MyAssignmentsPageData {
  linked: boolean;
  items: MyAssignment[];
  page: number;
  pageSize: number;
  total: number;
}
