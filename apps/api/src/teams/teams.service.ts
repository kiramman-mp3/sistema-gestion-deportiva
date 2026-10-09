import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { SecurityHashService } from '../auth/security-hash.service.js';
import { type Page, escapeLike, translateDbError } from '../catalogs/common.js';
import { ClubAccessService } from '../clubs/club-access.service.js';
import { normalizeKey } from '../common/keys.js';
import { PrismaService } from '../database/prisma.service.js';
import type { CatalogStatus, Prisma } from '../generated/prisma/client.js';
import { ageOn } from '../people/people.schemas.js';
import type {
  CreateTeamInput,
  EnrollTeamInput,
  UpdateTeamInput,
  UpdateTeamSeasonInput,
} from './teams.schemas.js';

type Actor = Pick<AuthContext, 'user' | 'permissions'>;
type Client = Prisma.TransactionClient | PrismaService['client'];

/** Las temporadas finalizadas o archivadas son historial: no admiten cambios de plantilla. */
export const EDITABLE_SEASON_STATUSES = ['borrador', 'activa'] as const;
const iso = (d: Date) => d.toISOString().slice(0, 10);

const TEAM_INCLUDE = {
  club: { select: { id: true, name: true } },
  sport: { select: { id: true, name: true } },
} satisfies Prisma.TeamInclude;

const TEAM_SEASON_INCLUDE = {
  season: { select: { id: true, name: true, status: true, startDate: true } },
  category: { select: { id: true, name: true, ageMin: true, ageMax: true } },
  _count: { select: { memberships: { where: { status: 'activo' } } } },
} satisfies Prisma.TeamSeasonInclude;

type TeamRow = Prisma.TeamGetPayload<{ include: typeof TEAM_INCLUDE }>;
type TeamSeasonRow = Prisma.TeamSeasonGetPayload<{
  include: typeof TEAM_SEASON_INCLUDE;
}>;

export const toTeamSeasonView = (row: TeamSeasonRow) => ({
  id: row.id,
  teamId: row.teamId,
  name: row.name,
  rosterClosed: row.rosterClosed,
  activeMembers: row._count.memberships,
  season: {
    id: row.season.id,
    name: row.season.name,
    status: row.season.status,
    startDate: iso(row.season.startDate),
  },
  category: row.category,
});

const toTeamView = (row: TeamRow) => ({
  id: row.id,
  name: row.name,
  status: row.status,
  club: row.club,
  sport: row.sport,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const ERRORS = {
  unique: {
    teams_club_id_sport_id_name_key_key:
      'Ya existe un equipo de ese club y deporte con ese nombre',
    team_seasons_season_id_sport_id_name_key_key:
      'Ya hay un equipo de ese deporte con ese nombre en la temporada',
    team_seasons_team_id_season_id_key:
      'El equipo ya está inscrito en esa temporada',
  },
  inUse: 'El registro tiene datos asociados',
};

@Injectable()
export class TeamsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hasher: SecurityHashService,
    @Inject(ClubAccessService) private readonly access: ClubAccessService,
  ) {}

  // ───────────────────────────── equipos ─────────────────────────────

  async list(
    actor: Actor,
    query: {
      page: number;
      pageSize: number;
      q?: string;
      clubId?: string;
      sportId?: string;
      status?: CatalogStatus;
    },
  ): Promise<Page<ReturnType<typeof toTeamView>>> {
    const scope = await this.access.scope(actor);
    const clubId =
      scope === 'all'
        ? query.clubId
        : {
            in: query.clubId
              ? scope.filter((id) => id === query.clubId)
              : scope,
          };
    const where: Prisma.TeamWhereInput = {
      clubId,
      sportId: query.sportId,
      status: query.status,
      ...(query.q && {
        name: { contains: escapeLike(query.q), mode: 'insensitive' as const },
      }),
    };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.team.findMany({
        where,
        include: TEAM_INCLUDE,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.team.count({ where }),
    ]);
    return {
      items: rows.map(toTeamView),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(actor: Actor, id: string) {
    const row = await this.loadTeam(this.prisma.client, actor, id);
    const seasons = await this.prisma.client.teamSeason.findMany({
      where: { teamId: id },
      include: TEAM_SEASON_INCLUDE,
      orderBy: [{ season: { startDate: 'desc' } }, { id: 'asc' }],
    });
    return { ...toTeamView(row), seasons: seasons.map(toTeamSeasonView) };
  }

  async create(actor: Actor, input: CreateTeamInput, ip: string) {
    try {
      const id = await this.prisma.client.$transaction(async (tx) => {
        await this.access.assertAccess(actor, input.clubId, tx);
        const [club, sport] = await Promise.all([
          tx.club.findUnique({
            where: { id: input.clubId },
            select: { status: true },
          }),
          tx.sport.findUnique({
            where: { id: input.sportId },
            select: { status: true },
          }),
        ]);
        if (club?.status !== 'activo')
          throw new ConflictException(
            'Solo se pueden crear equipos en clubes activos',
          );
        if (!sport) throw new NotFoundException('Deporte no encontrado');
        if (sport.status !== 'activo')
          throw new ConflictException('El deporte está inactivo');

        const team = await tx.team.create({
          data: {
            clubId: input.clubId,
            sportId: input.sportId,
            name: input.name,
            nameKey: normalizeKey(input.name),
          },
          select: { id: true },
        });
        await this.record(tx, actor, ip, 'team.create', team.id, {
          after: {
            clubId: input.clubId,
            sportId: input.sportId,
            name: input.name,
          },
        });
        return team.id;
      });
      return await this.get(actor, id);
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async update(actor: Actor, id: string, input: UpdateTeamInput, ip: string) {
    try {
      await this.prisma.client.$transaction(async (tx) => {
        const row = await this.loadTeam(tx, actor, id);
        const data: Prisma.TeamUpdateInput = {};
        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        if (input.name !== undefined && input.name !== row.name) {
          data.name = input.name;
          data.nameKey = normalizeKey(input.name);
          before.name = row.name;
          after.name = input.name;
        }
        if (input.status !== undefined && input.status !== row.status) {
          data.status = input.status;
          before.status = row.status;
          after.status = input.status;
        }
        if (Object.keys(after).length === 0) return;
        await tx.team.update({ where: { id }, data });
        await this.record(tx, actor, ip, 'team.update', id, {
          before: before as Prisma.InputJsonValue,
          after: after as Prisma.InputJsonValue,
        });
      });
      return await this.get(actor, id);
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async remove(actor: Actor, id: string, ip: string): Promise<void> {
    try {
      await this.prisma.client.$transaction(async (tx) => {
        const row = await this.loadTeam(tx, actor, id);
        await tx.team.delete({ where: { id } });
        await this.record(tx, actor, ip, 'team.delete', id, {
          before: { name: row.name, clubId: row.clubId, sportId: row.sportId },
        });
      });
    } catch (error) {
      translateDbError(error, {
        ...ERRORS,
        inUse: 'El equipo tiene temporadas inscritas: no se puede eliminar',
      });
    }
  }

  // ───────────────────────────── inscripción por temporada ─────────────────────────────

  async listSeasons(actor: Actor, teamId: string) {
    await this.loadTeam(this.prisma.client, actor, teamId);
    const rows = await this.prisma.client.teamSeason.findMany({
      where: { teamId },
      include: TEAM_SEASON_INCLUDE,
      orderBy: [{ season: { startDate: 'desc' } }, { id: 'asc' }],
    });
    return rows.map(toTeamSeasonView);
  }

  async enroll(
    actor: Actor,
    teamId: string,
    input: EnrollTeamInput,
    ip: string,
  ) {
    try {
      const id = await this.prisma.client.$transaction(async (tx) => {
        const team = await this.loadTeam(tx, actor, teamId);
        if (team.status !== 'activo')
          throw new ConflictException('El equipo está inactivo');
        const club = await tx.club.findUniqueOrThrow({
          where: { id: team.clubId },
          select: { status: true },
        });
        if (club.status !== 'activo')
          throw new ConflictException('El club no está activo');
        await this.assertSeasonEditable(tx, input.seasonId);
        await this.assertCategoryUsable(tx, input.categoryId);

        const name = input.name ?? team.name;
        const created = await tx.teamSeason.create({
          data: {
            teamId,
            sportId: team.sportId,
            seasonId: input.seasonId,
            categoryId: input.categoryId,
            name,
            nameKey: normalizeKey(name),
          },
          select: { id: true },
        });
        await this.record(tx, actor, ip, 'team.season_enroll', teamId, {
          after: {
            teamSeasonId: created.id,
            seasonId: input.seasonId,
            categoryId: input.categoryId,
            name,
          },
        });
        return created.id;
      });
      return await this.getTeamSeason(actor, teamId, id);
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async updateSeason(
    actor: Actor,
    teamId: string,
    seasonId: string,
    input: UpdateTeamSeasonInput,
    ip: string,
  ) {
    try {
      const id = await this.prisma.client.$transaction(async (tx) => {
        await this.loadTeam(tx, actor, teamId);
        const ts = await this.lockTeamSeason(tx, teamId, seasonId);
        await this.assertSeasonEditable(tx, seasonId);

        const data: Prisma.TeamSeasonUpdateInput = {};
        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        if (input.name !== undefined && input.name !== ts.name) {
          data.name = input.name;
          data.nameKey = normalizeKey(input.name);
          before.name = ts.name;
          after.name = input.name;
        }
        if (
          input.rosterClosed !== undefined &&
          input.rosterClosed !== ts.rosterClosed
        ) {
          data.rosterClosed = input.rosterClosed;
          before.rosterClosed = ts.rosterClosed;
          after.rosterClosed = input.rosterClosed;
        }
        if (
          input.categoryId !== undefined &&
          input.categoryId !== ts.categoryId
        ) {
          const category = await this.assertCategoryUsable(
            tx,
            input.categoryId,
          );
          await this.assertRosterFitsCategory(tx, ts.id, seasonId, category);
          data.category = { connect: { id: input.categoryId } };
          before.categoryId = ts.categoryId;
          after.categoryId = input.categoryId;
        }
        if (Object.keys(after).length > 0) {
          await tx.teamSeason.update({ where: { id: ts.id }, data });
          await this.record(tx, actor, ip, 'team.season_update', teamId, {
            before: { teamSeasonId: ts.id, ...before } as Prisma.InputJsonValue,
            after: { teamSeasonId: ts.id, ...after } as Prisma.InputJsonValue,
          });
        }
        return ts.id;
      });
      return await this.getTeamSeason(actor, teamId, id);
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async removeSeason(
    actor: Actor,
    teamId: string,
    seasonId: string,
    ip: string,
  ): Promise<void> {
    try {
      await this.prisma.client.$transaction(async (tx) => {
        await this.loadTeam(tx, actor, teamId);
        const ts = await this.lockTeamSeason(tx, teamId, seasonId);
        await this.assertSeasonEditable(tx, seasonId);
        await tx.teamSeason.delete({ where: { id: ts.id } });
        await this.record(tx, actor, ip, 'team.season_remove', teamId, {
          before: { teamSeasonId: ts.id, seasonId, name: ts.name },
        });
      });
    } catch (error) {
      translateDbError(error, {
        ...ERRORS,
        inUse:
          'La inscripción tiene deportistas en su plantilla: no se puede retirar',
      });
    }
  }

  async getTeamSeason(actor: Actor, teamId: string, teamSeasonId: string) {
    await this.loadTeam(this.prisma.client, actor, teamId);
    const row = await this.prisma.client.teamSeason.findFirst({
      where: { id: teamSeasonId, teamId },
      include: TEAM_SEASON_INCLUDE,
    });
    if (!row) throw new NotFoundException('Inscripción no encontrada');
    return toTeamSeasonView(row);
  }

  // ───────────────────────────── compartido con la plantilla ─────────────────────────────

  /** Carga un equipo dentro del alcance del actor; fuera de él responde 404. */
  async loadTeam(client: Client, actor: Actor, id: string): Promise<TeamRow> {
    const row = await client.team.findUnique({
      where: { id },
      include: TEAM_INCLUDE,
    });
    if (
      !row ||
      !(await this.access.canAccess(
        actor,
        row.clubId,
        client as Prisma.TransactionClient,
      ))
    ) {
      throw new NotFoundException('Equipo no encontrado');
    }
    return row;
  }

  /** Bloquea la inscripción para serializar altas, cierre de plantilla y cambio de categoría. */
  async lockTeamSeason(
    tx: Prisma.TransactionClient,
    teamId: string,
    seasonId: string,
  ) {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM team_seasons
      WHERE team_id = ${teamId}::uuid AND season_id = ${seasonId}::uuid
      FOR UPDATE`;
    const id = locked[0]?.id;
    if (!id) throw new NotFoundException('Inscripción no encontrada');
    return tx.teamSeason.findUniqueOrThrow({
      where: { id },
      include: {
        season: { select: { startDate: true, status: true } },
        category: true,
      },
    });
  }

  async assertSeasonEditable(client: Client, seasonId: string) {
    const season = await client.season.findUnique({
      where: { id: seasonId },
      select: { status: true },
    });
    if (!season) throw new NotFoundException('Temporada no encontrada');
    if (
      !(EDITABLE_SEASON_STATUSES as readonly string[]).includes(season.status)
    ) {
      throw new ConflictException(
        'La temporada está finalizada o archivada: su información es solo de consulta',
      );
    }
  }

  private async assertCategoryUsable(client: Client, categoryId: string) {
    const category = await client.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    if (category.status !== 'activo')
      throw new ConflictException('La categoría está inactiva');
    return category;
  }

  /** Al cambiar de categoría, los jugadores vigentes deben seguir cumpliendo la edad. */
  private async assertRosterFitsCategory(
    tx: Prisma.TransactionClient,
    teamSeasonId: string,
    seasonId: string,
    category: { ageMin: number | null; ageMax: number | null },
  ) {
    if (category.ageMin == null && category.ageMax == null) return;
    const season = await tx.season.findUniqueOrThrow({
      where: { id: seasonId },
      select: { startDate: true },
    });
    const members = await tx.teamMembership.findMany({
      where: { teamSeasonId, status: 'activo' },
      select: {
        athlete: { select: { person: { select: { birthDate: true } } } },
      },
    });
    const ref = iso(season.startDate);
    const misfits = members.filter(({ athlete }) => {
      const birth = athlete.person.birthDate;
      if (!birth) return true;
      const age = ageOn(iso(birth), ref);
      return (
        (category.ageMin != null && age < category.ageMin) ||
        (category.ageMax != null && age > category.ageMax)
      );
    });
    if (misfits.length > 0) {
      throw new ConflictException(
        `${misfits.length} jugador(es) de la plantilla no cumplen la edad de la nueva categoría`,
      );
    }
  }

  record(
    tx: Prisma.TransactionClient,
    actor: Actor,
    ip: string,
    action: string,
    entityId: string,
    change: { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue },
    reason?: string,
  ) {
    return this.audit.record(
      {
        userId: actor.user.id,
        action,
        entityType: 'team',
        entityId,
        before: change.before,
        after: change.after,
        reason,
        ipHash: this.hasher.hash('ip', ip),
      },
      tx,
    );
  }
}
