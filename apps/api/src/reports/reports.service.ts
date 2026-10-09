import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { SecurityHashService } from '../auth/security-hash.service.js';
import { athleteCode } from '../athletes/athletes.service.js';
import { ClubAccessService } from '../clubs/club-access.service.js';
import { ResultsService } from '../competitions/results/results.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { SANCTION_TYPE_LABELS } from '../discipline/discipline.helpers.js';
import type { Prisma } from '../generated/prisma/client.js';
import { toCsv } from './csv.js';
import { PublicNamesService } from '../public/public-names.service.js';
import { PdfService } from './pdf.service.js';

export type ReportFormat = 'pdf' | 'csv';

export interface GeneratedFile {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

const PDF = 'application/pdf';
const CSV = 'text/csv; charset=utf-8';

const REGISTRATION_STATUS: Record<string, string> = {
  borrador: 'Borrador',
  pendiente: 'Pendiente',
  observada: 'Observada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  retirada: 'Retirada',
};

const EVENT_STATUS: Record<string, string> = {
  programado: 'Programado',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
  suspendido: 'Suspendido',
  postergado: 'Postergado',
  cancelado: 'Cancelado',
};

const FORMAT: Record<string, string> = {
  todos_contra_todos: 'Todos contra todos',
  eliminatoria_simple: 'Eliminatoria simple',
  fase_grupos_y_eliminatoria: 'Fase de grupos y eliminatoria',
  sistema_suizo: 'Sistema suizo',
  cuadro_combates: 'Cuadro de combates',
};

const dateFmt = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeZone: 'America/Guayaquil',
});
const dateTimeFmt = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Guayaquil',
});
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const fileSlug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'documento';

const PARTICIPANT_INCLUDE = {
  participant: {
    include: {
      team: { include: { team: { include: { club: true } } } },
      individual: {
        include: { athlete: { include: { person: true, club: true } } },
      },
    },
  },
} satisfies Prisma.RegistrationInclude;

type RegistrationRow = Prisma.RegistrationGetPayload<{
  include: typeof PARTICIPANT_INCLUDE;
}>;

function participantInfo(r: RegistrationRow) {
  const p = r.participant;
  if (p.team) {
    return {
      name: p.team.team.name,
      clubId: p.team.team.clubId,
      club: p.team.team.club.name,
    };
  }
  if (p.individual) {
    const a = p.individual.athlete;
    return {
      name: `${a.person.firstName} ${a.person.lastName}`,
      clubId: a.clubId,
      club: a.club.name,
    };
  }
  return { name: 'Desconocido', clubId: '', club: '' };
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hash: SecurityHashService,
    @Inject(PdfService) private readonly pdf: PdfService,
    @Inject(ClubAccessService) private readonly clubAccess: ClubAccessService,
    @Inject(ResultsService) private readonly results: ResultsService,
    @Inject(PublicNamesService) private readonly names: PublicNamesService,
  ) {}

  /** Quién generó qué documento (§5.12): sin datos personales, solo qué se pidió y con qué código. */
  private async log(
    auth: AuthContext,
    ip: string,
    kind: string,
    entityType: string,
    entityId: string | undefined,
    format: ReportFormat,
    code: string,
    extra: Record<string, unknown> = {},
  ) {
    await this.audit.record({
      action: 'document.generated',
      entityType,
      entityId,
      userId: auth.user.id,
      ipHash: this.hash.hash('ip', ip),
      after: { kind, format, code, ...extra } as Prisma.InputJsonValue,
    });
  }

  private async championship(id: string) {
    const champ = await this.prisma.client.championship.findUnique({
      where: { id },
      include: { sport: true, category: true, season: true },
    });
    if (!champ) throw new NotFoundException('Campeonato no encontrado');
    return champ;
  }

  private context(champ: {
    name: string;
    sport: { name: string };
    category: { name: string };
    season: { name: string };
  }) {
    return `${champ.sport.name} · ${champ.category.name} · Temporada ${champ.season.name}`;
  }

  // ───────────────────── Listado de equipos inscritos ─────────────────────

  async championshipTeams(
    championshipId: string,
    format: ReportFormat,
    auth: AuthContext,
    ip: string,
  ): Promise<GeneratedFile> {
    const champ = await this.championship(championshipId);
    const scope = await this.clubAccess.scope(auth);
    const regs = await this.prisma.client.registration.findMany({
      where: {
        championshipId,
        status: { in: ['pendiente', 'observada', 'aprobada'] },
      },
      include: PARTICIPANT_INCLUDE,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    });
    const rows = regs
      .map((r) => ({ r, info: participantInfo(r) }))
      .filter(({ info }) => scope === 'all' || scope.includes(info.clubId))
      .map(({ r, info }, i) => [
        String(i + 1),
        info.name,
        info.club,
        REGISTRATION_STATUS[r.status] ?? r.status,
        dateFmt.format(r.submittedAt),
      ]);
    const filename = `equipos-inscritos-${fileSlug(champ.name)}`;

    if (format === 'csv') {
      await this.log(
        auth,
        ip,
        'equipos_inscritos',
        'championship',
        championshipId,
        'csv',
        'CSV',
        {
          rows: rows.length,
        },
      );
      return {
        buffer: toCsv(
          ['N.º', 'Participante', 'Club', 'Estado', 'Inscripción'],
          rows,
        ),
        mimeType: CSV,
        filename: `${filename}.csv`,
      };
    }
    const doc = await this.pdf.create({ title: 'Equipos inscritos' });
    doc
      .heading('LISTADO DE EQUIPOS INSCRITOS')
      .keyValues([
        ['Campeonato', champ.name],
        ['Competencia', this.context(champ)],
        ['Modalidad', FORMAT[champ.format] ?? champ.format],
        ['Total', String(rows.length)],
      ])
      .table(
        [
          { header: 'N.º', width: 1, align: 'center' },
          { header: 'Participante', width: 5 },
          { header: 'Club', width: 4 },
          { header: 'Estado', width: 2 },
          { header: 'Inscripción', width: 2.5 },
        ],
        rows,
        { emptyText: 'Sin inscripciones' },
      )
      .signatures(['Secretario/a de la Liga', 'Presidente de la Liga']);
    await this.log(
      auth,
      ip,
      'equipos_inscritos',
      'championship',
      championshipId,
      'pdf',
      doc.code,
      {
        rows: rows.length,
      },
    );
    return {
      buffer: await doc.finish(),
      mimeType: PDF,
      filename: `${filename}.pdf`,
    };
  }

  // ───────────────────── Tabla de posiciones ─────────────────────

  async standings(
    championshipId: string,
    format: ReportFormat,
    auth: AuthContext | null,
    ip: string,
  ): Promise<GeneratedFile> {
    const champ = await this.championship(championshipId);
    const calculated = await this.results.calculateStandings(championshipId);
    // Versión pública (sin sesión): los menores sin consentimiento se nombran por su código.
    const labels = auth
      ? null
      : await this.names.labels(
          calculated.standings.flatMap((s) =>
            s.athleteId ? [s.athleteId] : [],
          ),
        );
    const rows = calculated.standings.map((s) => [
      String(s.position),
      (s.athleteId && labels?.get(s.athleteId)) || s.name,
      s.clubName,
      String(s.played),
      String(s.won),
      String(s.drawn),
      String(s.lost),
      String(s.goalsFor),
      String(s.goalsAgainst),
      String(s.goalDifference),
      String(s.points),
    ]);
    const filename = `posiciones-${fileSlug(champ.name)}`;
    const deducted = calculated.standings.filter((s) => s.pointsDeducted);

    if (format === 'csv') {
      if (auth)
        await this.log(
          auth,
          ip,
          'posiciones',
          'championship',
          championshipId,
          'csv',
          'CSV',
        );
      return {
        buffer: toCsv(
          [
            'Pos',
            'Participante',
            'Club',
            'PJ',
            'PG',
            'PE',
            'PP',
            'GF',
            'GC',
            'DG',
            'Pts',
          ],
          rows,
        ),
        mimeType: CSV,
        filename: `${filename}.csv`,
      };
    }
    const doc = await this.pdf.create({
      title: 'Tabla de posiciones',
      landscape: true,
    });
    doc
      .heading('TABLA DE POSICIONES OFICIAL')
      .keyValues([
        ['Campeonato', champ.name],
        ['Competencia', this.context(champ)],
      ])
      .table(
        [
          { header: 'Pos', width: 1, align: 'center' },
          { header: 'Participante', width: 5 },
          { header: 'Club', width: 4 },
          { header: 'PJ', width: 1, align: 'center' },
          { header: 'PG', width: 1, align: 'center' },
          { header: 'PE', width: 1, align: 'center' },
          { header: 'PP', width: 1, align: 'center' },
          { header: 'GF', width: 1, align: 'center' },
          { header: 'GC', width: 1, align: 'center' },
          { header: 'DG', width: 1, align: 'center' },
          { header: 'Pts', width: 1, align: 'center' },
        ],
        rows,
        { emptyText: 'Sin participantes' },
      );
    if (deducted.length > 0) {
      doc.paragraph(
        `Puntos descontados por sanciones vigentes: ${deducted
          .map((s) => `${s.name} (-${s.pointsDeducted})`)
          .join(', ')}.`,
        { size: 8, muted: true },
      );
    }
    if (auth)
      await this.log(
        auth,
        ip,
        'posiciones',
        'championship',
        championshipId,
        'pdf',
        doc.code,
      );
    return {
      buffer: await doc.finish(),
      mimeType: PDF,
      filename: `${filename}.pdf`,
    };
  }

  // ───────────────────── Calendario ─────────────────────

  async fixtures(
    championshipId: string,
    format: ReportFormat,
    auth: AuthContext | null,
    ip: string,
  ): Promise<GeneratedFile> {
    const champ = await this.championship(championshipId);
    const events = await this.prisma.client.event.findMany({
      where: { round: { stage: { championshipId } } },
      include: {
        venue: true,
        round: { include: { stage: true } },
        participants: {
          orderBy: { id: 'asc' },
          include: { registration: { include: PARTICIPANT_INCLUDE } },
        },
        result: { include: { values: true } },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    });
    const labels = auth
      ? null
      : await this.names.labels(
          events.flatMap((e) =>
            e.participants.flatMap((p) =>
              p.registration.participant.individual
                ? [p.registration.participant.individual.athlete.id]
                : [],
            ),
          ),
        );
    const rows = events.map((e) => {
      const names = e.participants.map((p) => {
        const individual = p.registration.participant.individual;
        return (
          (individual && labels?.get(individual.athlete.id)) ||
          participantInfo(p.registration).name
        );
      });
      const approved = e.result?.status === 'aprobado' ? e.result : null;
      const score = approved
        ? e.participants
            .map(
              (p) =>
                approved.values.find((v) => v.eventParticipantId === p.id)
                  ?.score ?? 0,
            )
            .join(' - ')
        : '';
      return [
        e.scheduledAt ? dateTimeFmt.format(e.scheduledAt) : 'Por definir',
        `${e.round.stage.name} · ${e.round.name}`,
        names.join(' vs ') || 'Por definir',
        e.venue?.name ?? 'Por confirmar',
        EVENT_STATUS[e.status] ?? e.status,
        score,
      ];
    });
    const filename = `calendario-${fileSlug(champ.name)}`;

    if (format === 'csv') {
      if (auth)
        await this.log(
          auth,
          ip,
          'calendario',
          'championship',
          championshipId,
          'csv',
          'CSV',
        );
      return {
        buffer: toCsv(
          ['Fecha', 'Jornada', 'Encuentro', 'Escenario', 'Estado', 'Resultado'],
          rows,
        ),
        mimeType: CSV,
        filename: `${filename}.csv`,
      };
    }
    const doc = await this.pdf.create({ title: 'Calendario', landscape: true });
    doc
      .heading('CALENDARIO DE ENCUENTROS')
      .keyValues([
        ['Campeonato', champ.name],
        ['Competencia', this.context(champ)],
      ])
      .table(
        [
          { header: 'Fecha', width: 3 },
          { header: 'Jornada', width: 3 },
          { header: 'Encuentro', width: 5 },
          { header: 'Escenario', width: 3 },
          { header: 'Estado', width: 2 },
          { header: 'Resultado', width: 2, align: 'center' },
        ],
        rows,
        { emptyText: 'Sin encuentros programados' },
      );
    if (auth)
      await this.log(
        auth,
        ip,
        'calendario',
        'championship',
        championshipId,
        'pdf',
        doc.code,
      );
    return {
      buffer: await doc.finish(),
      mimeType: PDF,
      filename: `${filename}.pdf`,
    };
  }

  // ───────────────────── Acta de encuentro ─────────────────────

  async scoresheet(
    eventId: string,
    auth: AuthContext,
    ip: string,
  ): Promise<GeneratedFile> {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      include: {
        venue: true,
        round: {
          include: {
            stage: {
              include: {
                championship: {
                  include: { sport: true, category: true, season: true },
                },
              },
            },
          },
        },
        participants: {
          orderBy: { id: 'asc' },
          include: { registration: { include: PARTICIPANT_INCLUDE } },
        },
        result: {
          include: {
            values: true,
            periodScores: { orderBy: { periodNumber: 'asc' } },
            footballEvents: {
              orderBy: { minute: 'asc' },
              include: { athlete: { include: { person: true } } },
            },
          },
        },
      },
    });
    if (!event) throw new NotFoundException('Partido no encontrado');
    const champ = event.round.stage.championship;

    const doc = await this.pdf.create({ title: 'Acta de encuentro' });
    doc.heading('ACTA OFICIAL DE ENCUENTRO').keyValues([
      ['Campeonato', champ.name],
      ['Competencia', this.context(champ)],
      ['Etapa y jornada', `${event.round.stage.name} · ${event.round.name}`],
      [
        'Fecha',
        event.scheduledAt
          ? dateTimeFmt.format(event.scheduledAt)
          : 'Por definir',
      ],
      [
        'Escenario',
        event.venue
          ? `${event.venue.name}${event.venue.address ? ` — ${event.venue.address}` : ''}`
          : 'Por confirmar',
      ],
      [
        'Estado del acta',
        event.result
          ? event.result.status.replace('_', ' ')
          : 'Sin acta registrada',
      ],
    ]);

    for (const ep of event.participants) {
      const info = participantInfo(ep.registration);
      const value = event.result?.values.find(
        (v) => v.eventParticipantId === ep.id,
      );
      doc.subheading(
        `${ep.side === 'local' ? 'Local' : ep.side === 'visitante' ? 'Visitante' : 'Participante'}: ${info.name} (${info.club})${
          value ? ` — ${value.score}` : ''
        }`,
      );
      const team = ep.registration.participant.team?.team;
      let roster: string[][] = [];
      if (team) {
        const teamSeason = await this.prisma.client.teamSeason.findUnique({
          where: {
            teamId_seasonId: { teamId: team.id, seasonId: champ.seasonId },
          },
          include: {
            memberships: {
              where: { status: 'activo' },
              include: { athlete: { include: { person: true } } },
              orderBy: [{ jerseyNumber: 'asc' }, { id: 'asc' }],
            },
          },
        });
        roster = (teamSeason?.memberships ?? []).map((m) => [
          m.jerseyNumber === null ? '—' : String(m.jerseyNumber),
          athleteCode(m.athlete.codeNumber),
          `${m.athlete.person.firstName} ${m.athlete.person.lastName}`,
        ]);
      } else if (ep.registration.participant.individual) {
        const a = ep.registration.participant.individual.athlete;
        roster = [
          [
            '—',
            athleteCode(a.codeNumber),
            `${a.person.firstName} ${a.person.lastName}`,
          ],
        ];
      }
      doc.table(
        [
          { header: 'N.º', width: 1, align: 'center' },
          { header: 'Código', width: 2 },
          { header: 'Deportista', width: 6 },
        ],
        roster,
        { emptyText: 'Sin plantilla registrada' },
      );
    }

    const result = event.result;
    if (result && result.footballEvents.length > 0) {
      doc.subheading('Incidencias del encuentro');
      doc.table(
        [
          { header: 'Min.', width: 1, align: 'center' },
          { header: 'Incidencia', width: 3 },
          { header: 'Deportista', width: 5 },
        ],
        result.footballEvents.map((fe) => [
          String(fe.minute),
          fe.eventType.replaceAll('_', ' '),
          fe.athlete
            ? `${fe.athlete.person.firstName} ${fe.athlete.person.lastName}`
            : '—',
        ]),
      );
    }
    if (result && result.periodScores.length > 0) {
      doc.paragraph(
        `Puntuación por período: ${result.periodScores
          .map((s) => `P${s.periodNumber}: ${s.score}`)
          .join(' · ')}`,
        { size: 9 },
      );
    }
    doc.signatures([
      'Juez central / Árbitro',
      'Asistente 1 / Cronometrista',
      'Asistente 2 / Juez de mesa',
      'Vocal de turno',
      'Delegado local',
      'Delegado visitante',
    ]);
    await this.log(auth, ip, 'acta', 'event', eventId, 'pdf', doc.code);
    return {
      buffer: await doc.finish(),
      mimeType: PDF,
      filename: `acta-${fileSlug(champ.name)}-${eventId.slice(0, 8)}.pdf`,
    };
  }

  // ───────────────────── Nómina de buena fe ─────────────────────

  async roster(
    registrationId: string,
    format: ReportFormat,
    auth: AuthContext,
    ip: string,
  ): Promise<GeneratedFile> {
    const reg = await this.prisma.client.registration.findUnique({
      where: { id: registrationId },
      include: {
        ...PARTICIPANT_INCLUDE,
        championship: {
          include: { sport: true, category: true, season: true },
        },
      },
    });
    const info = reg ? participantInfo(reg) : null;
    // Un club fuera del alcance responde como inexistente.
    if (
      !reg ||
      !info ||
      !(await this.clubAccess.canAccess(auth, info.clubId))
    ) {
      throw new NotFoundException('Inscripción no encontrada');
    }
    const champ = reg.championship;
    let members: string[][] = [];
    const team = reg.participant.team?.team;
    if (team) {
      const teamSeason = await this.prisma.client.teamSeason.findUnique({
        where: {
          teamId_seasonId: { teamId: team.id, seasonId: champ.seasonId },
        },
        include: {
          memberships: {
            include: { athlete: { include: { person: true } } },
            orderBy: [{ jerseyNumber: 'asc' }, { id: 'asc' }],
          },
        },
      });
      members = (teamSeason?.memberships ?? []).map((m) => [
        m.jerseyNumber === null ? '' : String(m.jerseyNumber),
        athleteCode(m.athlete.codeNumber),
        `${m.athlete.person.firstName} ${m.athlete.person.lastName}`,
        m.athlete.eligibility,
        m.status === 'activo' ? 'Activo' : 'Baja',
      ]);
    } else if (reg.participant.individual) {
      const a = reg.participant.individual.athlete;
      members = [
        [
          '',
          athleteCode(a.codeNumber),
          `${a.person.firstName} ${a.person.lastName}`,
          a.eligibility,
          'Activo',
        ],
      ];
    }
    const filename = `nomina-${fileSlug(info.name)}-${fileSlug(champ.name)}`;

    if (format === 'csv') {
      await this.log(
        auth,
        ip,
        'nomina',
        'registration',
        registrationId,
        'csv',
        'CSV',
        {
          rows: members.length,
        },
      );
      return {
        buffer: toCsv(
          ['Camiseta', 'Código', 'Deportista', 'Habilitación', 'Estado'],
          members,
        ),
        mimeType: CSV,
        filename: `${filename}.csv`,
      };
    }
    const doc = await this.pdf.create({ title: 'Nómina de buena fe' });
    doc
      .heading('NÓMINA INSTITUCIONAL DE BUENA FE')
      .keyValues([
        ['Participante', info.name],
        ['Club', info.club],
        ['Campeonato', champ.name],
        ['Competencia', this.context(champ)],
        [
          'Estado de la inscripción',
          REGISTRATION_STATUS[reg.status] ?? reg.status,
        ],
      ])
      .table(
        [
          { header: 'N.º', width: 1, align: 'center' },
          { header: 'Código', width: 2 },
          { header: 'Deportista', width: 6 },
          { header: 'Habilitación', width: 2 },
          { header: 'Estado', width: 1.5 },
        ],
        members,
        { emptyText: 'Sin deportistas en la plantilla' },
      )
      .signatures([
        'Presidente del club',
        'Secretario/a de la Liga',
        'Presidente de la Liga',
      ]);
    await this.log(
      auth,
      ip,
      'nomina',
      'registration',
      registrationId,
      'pdf',
      doc.code,
      {
        rows: members.length,
      },
    );
    return {
      buffer: await doc.finish(),
      mimeType: PDF,
      filename: `${filename}.pdf`,
    };
  }

  // ───────────────────── Informe de sanciones ─────────────────────

  async sanctionsReport(
    query: {
      status?: 'vigente' | 'cumplida' | 'anulada';
      championshipId?: string;
      clubId?: string;
    },
    format: ReportFormat,
    auth: AuthContext,
    ip: string,
  ): Promise<GeneratedFile> {
    const scope = await this.clubAccess.scope(auth);
    const filters: Prisma.SanctionWhereInput[] = [
      scope === 'all'
        ? {}
        : {
            OR: [
              { clubId: { in: scope } },
              { athlete: { clubId: { in: scope } } },
              { team: { clubId: { in: scope } } },
            ],
          },
    ];
    if (query.status) filters.push({ status: query.status });
    if (query.championshipId)
      filters.push({ championshipId: query.championshipId });
    if (query.clubId) {
      filters.push({
        OR: [
          { clubId: query.clubId },
          { athlete: { clubId: query.clubId } },
          { team: { clubId: query.clubId } },
        ],
      });
    }
    const sanctions = await this.prisma.client.sanction.findMany({
      where: { AND: filters },
      include: {
        case: { select: { caseNumber: true } },
        athlete: { include: { person: true, club: true } },
        team: { include: { club: true } },
        club: true,
        championship: { select: { name: true } },
      },
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
    });
    const rows = sanctions.map((s) => [
      `EXP-${String(s.case.caseNumber).padStart(6, '0')}`,
      s.athlete
        ? `${s.athlete.person.firstName} ${s.athlete.person.lastName} (${s.athlete.club.name})`
        : s.team
          ? `Equipo ${s.team.name} (${s.team.club.name})`
          : `Club ${s.club?.name ?? ''}`,
      `${SANCTION_TYPE_LABELS[s.type] ?? s.type}${s.matchesCount ? ` (${s.matchesCount} partidos)` : ''}${s.points ? ` (${s.points} pts)` : ''}`,
      s.championship?.name ?? 'Todas las competencias',
      `${ymd(s.startsAt)}${s.endsAt ? ` a ${ymd(s.endsAt)}` : ''}`,
      s.status,
    ]);
    const filename = 'informe-de-sanciones';

    if (format === 'csv') {
      await this.log(
        auth,
        ip,
        'sanciones',
        'sanction',
        undefined,
        'csv',
        'CSV',
        { rows: rows.length },
      );
      return {
        buffer: toCsv(
          [
            'Expediente',
            'Sancionado',
            'Sanción',
            'Alcance',
            'Vigencia',
            'Estado',
          ],
          rows,
        ),
        mimeType: CSV,
        filename: `${filename}.csv`,
      };
    }
    const doc = await this.pdf.create({
      title: 'Informe de sanciones',
      landscape: true,
    });
    doc
      .heading('INFORME DE SANCIONES')
      .keyValues([
        ['Estado', query.status ?? 'Todos'],
        ['Total', String(rows.length)],
      ])
      .table(
        [
          { header: 'Expediente', width: 2 },
          { header: 'Sancionado', width: 5 },
          { header: 'Sanción', width: 4 },
          { header: 'Alcance', width: 3 },
          { header: 'Vigencia', width: 3 },
          { header: 'Estado', width: 1.5 },
        ],
        rows,
        { emptyText: 'Sin sanciones' },
      )
      .signatures([
        'Presidente de la Comisión Disciplinaria',
        'Secretario/a de la Liga',
      ]);
    await this.log(
      auth,
      ip,
      'sanciones',
      'sanction',
      undefined,
      'pdf',
      doc.code,
      { rows: rows.length },
    );
    return {
      buffer: await doc.finish(),
      mimeType: PDF,
      filename: `${filename}.pdf`,
    };
  }
}
