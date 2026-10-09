export type ChampionshipFormat =
  | 'todos_contra_todos'
  | 'eliminatoria_simple'
  | 'fase_grupos_y_eliminatoria'
  | 'sistema_suizo'
  | 'cuadro_combates';

export type ChampionshipStatus =
  | 'borrador'
  | 'inscripciones_abiertas'
  | 'inscripciones_cerradas'
  | 'en_curso'
  | 'finalizado'
  | 'archivado';

export type RegistrationStatus =
  | 'borrador'
  | 'pendiente'
  | 'observada'
  | 'aprobada'
  | 'rechazada'
  | 'retirada';

export const CHAMPIONSHIP_FORMAT_LABELS: Record<ChampionshipFormat, string> = {
  todos_contra_todos: 'Todos contra todos (Liga)',
  eliminatoria_simple: 'Eliminatoria simple (Playoffs)',
  fase_grupos_y_eliminatoria: 'Fase de grupos y eliminación',
  sistema_suizo: 'Sistema Suizo',
  cuadro_combates: 'Cuadro de combates',
};

export const CHAMPIONSHIP_STATUS_LABELS: Record<ChampionshipStatus, string> = {
  borrador: 'Borrador',
  inscripciones_abiertas: 'Inscripciones abiertas',
  inscripciones_cerradas: 'Inscripciones cerradas',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
  archivado: 'Archivado',
};

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  borrador: 'Borrador',
  pendiente: 'Pendiente de revisión',
  observada: 'Observada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  retirada: 'Retirada',
};

export interface Venue {
  id: string;
  name: string;
  address?: string | null;
  capacity?: number | null;
  status: 'activo' | 'inactivo';
  createdAt: string;
}

export interface RuleVersion {
  id: string;
  version: number;
  rulesJson: Record<string, unknown>;
  approvedAt?: string | null;
  approvedBy?: { id: string; displayName: string; email: string } | null;
}

export interface Championship {
  id: string;
  name: string;
  format: ChampionshipFormat;
  status: ChampionshipStatus;
  registrationStart?: string | null;
  registrationEnd?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  season: { id: string; name: string; status: string };
  sport: { id: string; code: string; name: string };
  category: { id: string; code: string; name: string; ageMin?: number | null; ageMax?: number | null };
  ruleVersions?: RuleVersion[];
  _count?: {
    registrations: number;
    stages: number;
  };
}

export interface Registration {
  id: string;
  championshipId: string;
  participantId: string;
  status: RegistrationStatus;
  notes?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  reviewedBy?: { id: string; displayName: string; email: string } | null;
  participant: {
    id: string;
    kind: 'equipo' | 'individual';
    team?: {
      team: {
        id: string;
        name: string;
        club: { id: string; name: string; shortName?: string | null };
      };
    } | null;
    individual?: {
      athlete: {
        id: string;
        person: { id: string; firstName: string; lastName: string; birthDate?: string | null };
        club: { id: string; name: string; shortName?: string | null };
      };
    } | null;
  };
}

export type StageType = 'grupo' | 'eliminatoria' | 'unico';

export type EventStatus =
  | 'programado'
  | 'en_curso'
  | 'finalizado'
  | 'suspendido'
  | 'postergado'
  | 'cancelado';

export const STAGE_TYPE_LABELS: Record<StageType, string> = {
  grupo: 'Fase de grupos / Serie',
  eliminatoria: 'Eliminatoria directa / Playoff',
  unico: 'Etapa única',
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  programado: 'Programado',
  en_curso: 'En juego',
  finalizado: 'Finalizado',
  suspendido: 'Suspendido',
  postergado: 'Postergado / Reprogramado',
  cancelado: 'Cancelado',
};

export interface Round {
  id: string;
  stageId: string;
  roundNumber: number;
  name: string;
  status: string;
  _count?: { events: number };
}

export interface Stage {
  id: string;
  championshipId: string;
  name: string;
  stageType: StageType;
  sequence: number;
  status: string;
  rounds: Round[];
}

export interface EventParticipantItem {
  id: string;
  side: 'local' | 'visitante' | 'individual';
  registration: Registration;
}

export interface CompetitionEvent {
  id: string;
  scheduledAt?: string | null;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  status: EventStatus;
  postponementReason?: string | null;
  venue?: { id: string; name: string; capacity?: number | null } | null;
  round: {
    id: string;
    name: string;
    roundNumber: number;
    stage: { id: string; name: string; sequence: number; stageType: StageType };
  };
  participants: EventParticipantItem[];
  result?: {
    id: string;
    status: string;
    values: Array<{
      id: string;
      eventParticipantId: string;
      score: number;
      outcome: string;
      rank?: number | null;
    }>;
  } | null;
}

export interface StandingRow {
  position: number;
  registrationId: string;
  participantId: string;
  name: string;
  clubName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  yellowCards: number;
  redCards: number;
}

export interface StandingsResponse {
  championship: {
    id: string;
    name: string;
  };
  rules: {
    pointsWin: number;
    pointsDraw: number;
    pointsLoss: number;
  };
  standings: StandingRow[];
}

