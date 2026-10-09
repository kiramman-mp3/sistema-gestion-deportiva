import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types.js';
import { translateDbError } from '../catalogs/common.js';
import { athleteCode } from '../athletes/athletes.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ageOn } from '../people/people.schemas.js';
import type { AddToRosterInput } from './teams.schemas.js';
import { TeamsService } from './teams.service.js';

type Actor = Pick<AuthContext, 'user' | 'permissions'>;

const iso = (d: Date) => d.toISOString().slice(0, 10);

const MEMBERSHIP_INCLUDE = {
  athlete: {
    select: {
      id: true,
      codeNumber: true,
      eligibility: true,
      person: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.TeamMembershipInclude;

type MembershipRow = Prisma.TeamMembershipGetPayload<{
  include: typeof MEMBERSHIP_INCLUDE;
}>;

/** La plantilla muestra solo identidad básica: nunca fecha de nacimiento ni documento. */
const toMembershipView = (row: MembershipRow) => ({
  id: row.id,
  status: row.status,
  jerseyNumber: row.jerseyNumber,
  joinedAt: row.joinedAt,
  leftAt: row.leftAt,
  leaveReason: row.leaveReason,
  athlete: {
    id: row.athlete.id,
    code: athleteCode(row.athlete.codeNumber),
    firstName: row.athlete.person.firstName,
    lastName: row.athlete.person.lastName,
    eligibility: row.athlete.eligibility,
  },
});

const ERRORS = {
  unique: {
    team_memberships_athlete_id_sport_id_season_id_key:
      'El deportista ya está inscrito en un equipo de este deporte en esta temporada',
    team_memberships_active_jersey_idx:
      'Ese número de camiseta ya lo usa otro jugador de la plantilla',
  },
  inUse: 'El registro tiene datos asociados',
};

/**
 * Plantillas por temporada. Reglas de negocio (D-40 a D-43):
 *  - un deportista solo puede estar en un equipo por deporte y temporada, pero sí en
 *    varios deportes distintos (restricción única en la base de datos);
 *  - una baja NO libera el cupo: el cambio de equipo se habilita en la temporada
 *    siguiente (transferencia de club) o por excepción de un administrador (anulación);
 *  - solo se inscriben deportistas habilitados, del mismo club del equipo y con la edad
 *    de la categoría (calculada a la fecha de inicio de la temporada).
 */
@Injectable()
export class RosterService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TeamsService) private readonly teams: TeamsService,
  ) {}

  async list(actor: Actor, teamId: string, seasonId: string) {
    await this.teams.loadTeam(this.prisma.client, actor, teamId);
    const ts = await this.prisma.client.teamSeason.findUnique({
      where: { teamId_seasonId: { teamId, seasonId } },
      select: { id: true },
    });
    if (!ts) throw new NotFoundException('Inscripción no encontrada');
    const rows = await this.prisma.client.teamMembership.findMany({
      where: { teamSeasonId: ts.id },
      include: MEMBERSHIP_INCLUDE,
      orderBy: [
        { status: 'asc' },
        { athlete: { person: { lastName: 'asc' } } },
        { athlete: { person: { firstName: 'asc' } } },
        { id: 'asc' },
      ],
    });
    return rows.map(toMembershipView);
  }

  async add(
    actor: Actor,
    teamId: string,
    seasonId: string,
    input: AddToRosterInput,
    ip: string,
  ) {
    try {
      const id = await this.prisma.client.$transaction(async (tx) => {
        const team = await this.teams.loadTeam(tx, actor, teamId);
        const ts = await this.teams.lockTeamSeason(tx, teamId, seasonId);
        await this.teams.assertSeasonEditable(tx, seasonId);
        if (team.status !== 'activo')
          throw new ConflictException('El equipo está inactivo');
        if (ts.rosterClosed)
          throw new ConflictException('La plantilla está cerrada');

        // Bloquear al deportista serializa altas simultáneas y transferencias de club.
        await tx.$queryRaw`SELECT id FROM athletes WHERE id = ${input.athleteId}::uuid FOR UPDATE`;
        const athlete = await tx.athlete.findUnique({
          where: { id: input.athleteId },
          include: { person: { select: { status: true, birthDate: true } } },
        });
        if (!athlete || athlete.clubId !== team.clubId) {
          throw new NotFoundException('Deportista no encontrado en este club');
        }
        if (athlete.person.status !== 'activo')
          throw new ConflictException('El deportista está inactivo');
        if (athlete.eligibility !== 'habilitado') {
          throw new ConflictException(
            'Solo se inscriben deportistas habilitados',
          );
        }
        this.assertAge(athlete.person.birthDate, ts);

        const existing = await tx.teamMembership.findUnique({
          where: {
            athleteId_sportId_seasonId: {
              athleteId: athlete.id,
              sportId: ts.sportId,
              seasonId,
            },
          },
          include: { teamSeason: { select: { name: true } } },
        });
        if (existing) {
          throw new ConflictException(
            existing.status === 'baja'
              ? `Ya fue dado de baja de «${existing.teamSeason.name}» en esta temporada; podrá cambiar de equipo en la siguiente (o un administrador puede anular la baja)`
              : `Ya está inscrito en «${existing.teamSeason.name}» en este deporte y temporada`,
          );
        }

        const created = await tx.teamMembership.create({
          data: {
            teamSeasonId: ts.id,
            athleteId: athlete.id,
            sportId: ts.sportId,
            seasonId,
            jerseyNumber: input.jerseyNumber ?? null,
            createdById: actor.user.id,
          },
          select: { id: true },
        });
        await this.teams.record(tx, actor, ip, 'team.roster_add', teamId, {
          after: {
            membershipId: created.id,
            teamSeasonId: ts.id,
            athleteId: athlete.id,
            seasonId,
          },
        });
        return created.id;
      });
      return await this.get(id);
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async setJersey(
    actor: Actor,
    teamId: string,
    seasonId: string,
    membershipId: string,
    jerseyNumber: number | null,
    ip: string,
  ) {
    try {
      await this.prisma.client.$transaction(async (tx) => {
        const m = await this.loadMembership(
          tx,
          actor,
          teamId,
          seasonId,
          membershipId,
        );
        await this.teams.assertSeasonEditable(tx, seasonId);
        if (m.status !== 'activo')
          throw new ConflictException('El jugador está dado de baja');
        if (m.jerseyNumber === jerseyNumber) return;
        await tx.teamMembership.update({
          where: { id: m.id },
          data: { jerseyNumber },
        });
        await this.teams.record(tx, actor, ip, 'team.roster_update', teamId, {
          before: { membershipId: m.id, jerseyNumber: m.jerseyNumber },
          after: { membershipId: m.id, jerseyNumber },
        });
      });
      return await this.get(membershipId);
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  /** Baja de la plantilla. No libera el cupo del deporte en la temporada. */
  async leave(
    actor: Actor,
    teamId: string,
    seasonId: string,
    membershipId: string,
    reason: string,
    ip: string,
  ) {
    await this.prisma.client.$transaction(async (tx) => {
      const m = await this.loadMembership(
        tx,
        actor,
        teamId,
        seasonId,
        membershipId,
      );
      await this.teams.assertSeasonEditable(tx, seasonId);
      if (m.status === 'baja')
        throw new ConflictException('El jugador ya está dado de baja');
      await tx.teamMembership.update({
        where: { id: m.id },
        data: {
          status: 'baja',
          leftAt: new Date(),
          leaveReason: reason,
          jerseyNumber: null,
        },
      });
      await this.teams.record(
        tx,
        actor,
        ip,
        'team.roster_leave',
        teamId,
        {
          before: { membershipId: m.id, athleteId: m.athleteId },
          after: { status: 'baja' },
        },
        reason,
      );
    });
    return this.get(membershipId);
  }

  /**
   * Anula el alta (la elimina) y libera el cupo del deporte en esa temporada. Es la
   * excepción a la regla de un equipo por temporada, por eso exige `teams:delete`.
   */
  async annul(
    actor: Actor,
    teamId: string,
    seasonId: string,
    membershipId: string,
    reason: string,
    ip: string,
  ): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const m = await this.loadMembership(
        tx,
        actor,
        teamId,
        seasonId,
        membershipId,
      );
      await this.teams.assertSeasonEditable(tx, seasonId);
      await tx.teamMembership.delete({ where: { id: m.id } });
      await this.teams.record(
        tx,
        actor,
        ip,
        'team.roster_annul',
        teamId,
        {
          before: {
            membershipId: m.id,
            athleteId: m.athleteId,
            status: m.status,
            seasonId,
          },
        },
        reason,
      );
    });
  }

  /** Equipos de un deportista, por temporada (historial). */
  async forAthlete(athleteId: string) {
    const rows = await this.prisma.client.teamMembership.findMany({
      where: { athleteId },
      include: {
        teamSeason: {
          select: {
            id: true,
            name: true,
            team: { select: { id: true } },
            category: { select: { id: true, name: true } },
            sport: { select: { id: true, name: true } },
            season: {
              select: { id: true, name: true, status: true, startDate: true },
            },
          },
        },
      },
      orderBy: [
        { teamSeason: { season: { startDate: 'desc' } } },
        { id: 'asc' },
      ],
    });
    return rows.map((r) => ({
      membershipId: r.id,
      status: r.status,
      jerseyNumber: r.jerseyNumber,
      team: { id: r.teamSeason.team.id, name: r.teamSeason.name },
      sport: r.teamSeason.sport,
      category: r.teamSeason.category,
      season: {
        id: r.teamSeason.season.id,
        name: r.teamSeason.season.name,
        status: r.teamSeason.season.status,
        startDate: iso(r.teamSeason.season.startDate),
      },
    }));
  }

  // ───────────────────────────── internos ─────────────────────────────

  private async get(membershipId: string) {
    return toMembershipView(
      await this.prisma.client.teamMembership.findUniqueOrThrow({
        where: { id: membershipId },
        include: MEMBERSHIP_INCLUDE,
      }),
    );
  }

  /** La membresía debe pertenecer a la inscripción de la ruta y estar en el alcance del actor. */
  private async loadMembership(
    tx: Prisma.TransactionClient,
    actor: Actor,
    teamId: string,
    seasonId: string,
    membershipId: string,
  ) {
    await this.teams.loadTeam(tx, actor, teamId);
    const m = await tx.teamMembership.findFirst({
      where: { id: membershipId, seasonId, teamSeason: { teamId } },
    });
    if (!m)
      throw new NotFoundException('Jugador no encontrado en la plantilla');
    return m;
  }

  private assertAge(
    birthDate: Date | null,
    ts: {
      season: { startDate: Date };
      category: { ageMin: number | null; ageMax: number | null; name: string };
    },
  ): void {
    const { ageMin, ageMax } = ts.category;
    if (ageMin == null && ageMax == null) return;
    if (!birthDate) {
      throw new ConflictException(
        'Falta la fecha de nacimiento del deportista para validar la categoría',
      );
    }
    const age = ageOn(iso(birthDate), iso(ts.season.startDate));
    if ((ageMin != null && age < ageMin) || (ageMax != null && age > ageMax)) {
      const range =
        ageMin != null && ageMax != null
          ? `${ageMin} a ${ageMax} años`
          : ageMin != null
            ? `${ageMin} años o más`
            : `hasta ${ageMax} años`;
      throw new ConflictException(
        `La edad del deportista a la fecha de inicio de la temporada no cumple la categoría «${ts.category.name}» (${range})`,
      );
    }
  }
}
