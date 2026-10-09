export interface PublicChampionship {
  id: string;
  name: string;
  format: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  season: { id: string; name: string };
  sport: { id: string; code: string; name: string };
  category: { id: string; code: string; name: string };
  _count: { registrations: number };
}

export interface PublicChampionshipsResponse {
  items: PublicChampionship[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PublicFixtureEventParticipant {
  id: string;
  side: 'local' | 'visitante' | 'individual';
  seed: number | null;
  name: string;
  clubName: string;
  score: number | null;
  outcome: string | null;
}

export interface PublicFootballEvent {
  id: string;
  eventType: 'gol' | 'tarjeta_amarilla' | 'tarjeta_roja' | 'sustitucion';
  minute: number;
  athleteName: string | null;
  notes: string | null;
}

export interface PublicPeriodScore {
  periodNumber: number;
  score: number;
}

export interface PublicTaekwondoBout {
  roundNumber: number;
  points: number;
  penalties: number;
  decision: string | null;
}

export interface PublicChessPairing {
  color: 'blancas' | 'negras';
  points: number | string;
  buchholz: number | string | null;
}

export interface PublicFixtureEvent {
  id: string;
  scheduledAt: string | null;
  status: string;
  postponementReason: string | null;
  venue: { id: string; name: string } | null;
  participants: PublicFixtureEventParticipant[];
  result: {
    status: string;
    periodScores?: PublicPeriodScore[];
    taekwondoBouts?: PublicTaekwondoBout[];
    chessPairings?: PublicChessPairing[];
    footballEvents?: PublicFootballEvent[];
  } | null;
}

export interface PublicRound {
  id: string;
  name: string;
  roundNumber: number;
  events: PublicFixtureEvent[];
}

export interface PublicStage {
  id: string;
  name: string;
  stageType: string;
  sequence: number;
  rounds: PublicRound[];
}

export interface PublicStandingRow {
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
  buchholz?: number;
}

export interface PublicStandingsResponse {
  championship: {
    id: string;
    name: string;
    sport: { id: string; code: string; name: string };
    category: { id: string; code: string; name: string };
    season: { id: string; name: string };
  };
  rules: {
    pointsWin: number;
    pointsDraw: number;
    pointsLoss: number;
  };
  standings: PublicStandingRow[];
}

export interface ScoresheetPrintData {
  documentMetadata: {
    title: string;
    institution: string;
    affiliation: string;
    canton: string;
    generatedAt: string;
  };
  championship: {
    id: string;
    name: string;
    sport: string;
    sportCode: string;
    category: string;
    season: string;
  };
  stage: string;
  round: string;
  venue: string;
  venueAddress: string;
  scheduledAt: string | null;
  status: string;
  participants: Array<{
    id: string;
    side: string;
    name: string;
    clubName: string;
    score: number | null;
    outcome: string | null;
    roster: Array<{
      jerseyNumber: number | null;
      code: string;
      name: string;
    }>;
  }>;
  result: {
    status: string;
    approvedAt: string | null;
    approvalNotes: string | null;
    periodScores?: PublicPeriodScore[];
    taekwondoBouts?: PublicTaekwondoBout[];
    chessPairings?: PublicChessPairing[];
    footballEvents?: Array<{
      minute: number;
      eventType: string;
      athleteName: string;
      notes: string | null;
    }>;
  } | null;
  signatories: Array<{
    label: string;
    name: string;
  }>;
}

export interface RosterPrintData {
  documentMetadata: {
    title: string;
    institution: string;
    affiliation: string;
    canton: string;
    generatedAt: string;
  };
  championship: {
    id: string;
    name: string;
    sport: string;
    category: string;
    season: string;
  };
  participant: {
    name: string;
    clubName: string;
    clubSector: string;
    registrationStatus: string;
    submittedAt: string;
    reviewedAt: string | null;
  };
  members: Array<{
    jerseyNumber: number | null;
    code: string;
    name: string;
    status: string;
  }>;
  signatories: Array<{
    label: string;
    name: string;
  }>;
}

export interface PublicClub {
  name: string;
  shortName: string;
  slug: string;
  sector: string | null;
}
