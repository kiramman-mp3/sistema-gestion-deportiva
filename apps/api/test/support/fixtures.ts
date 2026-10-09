import { randomUUID } from 'node:crypto';
import { PasswordService } from '../../src/auth/password.service.js';
import { seedAuthorization } from '../../src/database/seed.js';
import type {
  PrismaClient,
  UserStatus,
} from '../../src/generated/prisma/client.js';
import { type TestApp, TEST_ORIGIN, cookieValue } from './app.js';

export const PASSWORD = 'una-contraseña-larga-de-prueba-1';
const passwords = new PasswordService();

/** Catálogo de permisos + rol superadmin, como tras `db:seed`. */
export async function seedCatalog(prisma: PrismaClient): Promise<void> {
  await seedAuthorization(prisma);
}

export async function createUser(
  prisma: PrismaClient,
  options: {
    email?: string;
    password?: string;
    status?: UserStatus;
    displayName?: string;
    /** Permisos otorgados mediante un rol propio creado para este usuario. */
    permissions?: string[];
    roleCodes?: string[];
  } = {},
) {
  const user = await prisma.user.create({
    data: {
      email: options.email ?? `usuario-${randomUUID()}@example.com`,
      displayName: options.displayName ?? 'Usuario de prueba',
      passwordHash: await passwords.hash(options.password ?? PASSWORD),
      status: options.status ?? 'activo',
    },
  });
  if (options.permissions?.length) {
    await grantPermissions(prisma, user.id, options.permissions);
  }
  for (const code of options.roleCodes ?? []) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code } });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
  }
  return user;
}

/** Crea un rol con exactamente esos permisos y se lo asigna al usuario. */
export async function grantPermissions(
  prisma: PrismaClient,
  userId: string,
  codes: string[],
) {
  const permissions = await prisma.permission.findMany({
    where: { code: { in: codes } },
  });
  if (permissions.length !== codes.length) {
    throw new Error('Permiso inexistente en el catálogo de pruebas');
  }
  const role = await prisma.role.create({
    data: {
      code: `rol_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      name: 'Rol de prueba',
      permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
    },
  });
  await prisma.userRole.create({ data: { userId, roleId: role.id } });
  return role;
}

export interface LoggedIn {
  cookieName: string;
  /** Valor de la cookie de sesión. */
  token: string;
  /** Cabecera `Cookie` lista para reenviar. */
  cookie: string;
  csrf: string;
  body: {
    user: { id: string };
    permissions: string[];
    csrfToken: string;
    expiresAt: string;
  };
}

export async function login(
  t: TestApp,
  email: string,
  password = PASSWORD,
  extraHeaders: Record<string, string> = {},
): Promise<LoggedIn> {
  const res = await t
    .http()
    .post('/api/auth/login')
    .set('Origin', TEST_ORIGIN)
    .set(extraHeaders)
    .send({ email, password })
    .expect(200);
  const cookieName =
    t.env.NODE_ENV === 'production' ? '__Host-liga_sid' : 'liga_sid';
  const token = cookieValue(res, cookieName);
  if (!token) throw new Error('El login no estableció la cookie de sesión');
  return {
    cookieName,
    token,
    cookie: `${cookieName}=${token}`,
    csrf: res.body.csrfToken,
    body: res.body,
  };
}

/** Petición autenticada con cookie + token CSRF + origen válido. */
export function authed(t: TestApp, session: LoggedIn) {
  const set = <R extends { set: (k: string, v: string) => R }>(r: R) =>
    r
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf)
      .set('Origin', TEST_ORIGIN);
  return {
    get: (url: string) => set(t.http().get(url)),
    post: (url: string) => set(t.http().post(url)),
    put: (url: string) => set(t.http().put(url)),
    patch: (url: string) => set(t.http().patch(url)),
    delete: (url: string) => set(t.http().delete(url)),
  };
}

/**
 * Crea una sesión directamente en la base de datos (sin pasar por el login).
 * Útil cuando el login no puede funcionar, p. ej. con la auditoría simulada caída.
 */
export async function fabricateSession(
  t: TestApp,
  prisma: PrismaClient,
  userId: string,
): Promise<LoggedIn> {
  const { SessionService } = await import('../../src/auth/session.service.js');
  const created = await prisma.$transaction((tx) =>
    t.app.get(SessionService).create(tx, { userId }),
  );
  return {
    cookieName: 'liga_sid',
    token: created.token,
    cookie: `liga_sid=${created.token}`,
    csrf: created.csrfToken,
    body: {} as LoggedIn['body'],
  };
}

/** Usuario con exactamente esos permisos y su sesión iniciada por el login real. */
export async function adminWith(
  t: TestApp,
  prisma: PrismaClient,
  permissions: string[],
) {
  const user = await createUser(prisma, { permissions });
  return { user, session: await login(t, user.email) };
}

// ───────────────────── Clubes y personas ─────────────────────

/** Cédula ecuatoriana válida a partir de 9 dígitos (calcula el verificador). */
export function cedula(first9 = '171003406'): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(first9[i]) * (i % 2 === 0 ? 2 : 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return first9 + String((10 - (sum % 10)) % 10);
}

let clubCounter = 0;
export async function createClub(
  prisma: PrismaClient,
  name?: string,
  status: 'activo' | 'inactivo' | 'suspendido' | 'archivado' = 'activo',
) {
  const { normalizeKey, slugify } = await import('../../src/common/keys.js');
  const label = name ?? `Club de Prueba ${++clubCounter}`;
  return prisma.club.create({
    data: {
      name: label,
      nameKey: normalizeKey(label),
      slug: slugify(label),
      status,
    },
  });
}

/**
 * Usuario con exactamente esos permisos, vinculado a esos clubes (alcance), con la
 * sesión iniciada. Sin `clubs:access_all` solo alcanza a los clubes indicados.
 */
export async function leaderWith(
  t: TestApp,
  prisma: PrismaClient,
  permissions: string[],
  clubIds: string[] = [],
) {
  const user = await createUser(prisma, { permissions });
  for (const clubId of clubIds)
    await prisma.clubUser.create({ data: { clubId, userId: user.id } });
  return { user, session: await login(t, user.email) };
}

// ───────────────────── Deporte, temporadas, equipos ─────────────────────

let athleteCounter = 0;
/** Deportista creado directamente en la base de datos (habilitado por defecto). */
export async function createAthlete(
  prisma: PrismaClient,
  clubId: string,
  over: {
    birthDate?: string | null;
    eligibility?: 'pendiente' | 'habilitado' | 'inhabilitado';
    status?: 'activo' | 'inactivo';
    firstName?: string;
  } = {},
) {
  const n = ++athleteCounter;
  const person = await prisma.person.create({
    data: {
      firstName: over.firstName ?? `Jugador${n}`,
      lastName: `Prueba${n}`,
      birthDate:
        over.birthDate === null
          ? null
          : new Date(`${over.birthDate ?? '2013-06-15'}T00:00:00.000Z`),
      status: over.status ?? 'activo',
    },
  });
  return prisma.athlete.create({
    data: {
      personId: person.id,
      clubId,
      eligibility: over.eligibility ?? 'habilitado',
    },
  });
}

const codeOf = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase()
    .slice(0, 8);

export async function createSport(prisma: PrismaClient, name: string) {
  return prisma.sport.create({
    data: { code: codeOf(name), name },
  });
}

export async function createCategory(
  prisma: PrismaClient,
  name: string,
  ageMin: number | null = null,
  ageMax: number | null = null,
) {
  return prisma.category.create({
    data: {
      code: codeOf(name),
      name,
      ageMin,
      ageMax,
    },
  });
}

export async function createSeason(
  prisma: PrismaClient,
  name: string,
  status: 'borrador' | 'activa' | 'finalizada' | 'archivada' = 'activa',
  startDate = '2026-01-01',
  endDate = '2026-12-31',
) {
  return prisma.season.create({
    data: {
      name,
      status,
      startDate: new Date(`${startDate}T00:00:00.000Z`),
      endDate: new Date(`${endDate}T00:00:00.000Z`),
    },
  });
}

// ───────────────────── Escenario de un partido ─────────────────────

let scenarioCounter = 0;

/**
 * Campeonato de fútbol en curso con dos equipos de dos clubes, sus inscripciones aprobadas y un
 * partido programado entre ambos. Cada equipo tiene un deportista habilitado en su plantilla.
 */
export async function createMatchScenario(
  prisma: PrismaClient,
  over: { scheduledAt?: string; status?: 'programado' | 'en_curso' } = {},
) {
  const n = ++scenarioCounter;
  const club1 = await createClub(prisma, `Club Local ${n}`);
  const club2 = await createClub(prisma, `Club Visitante ${n}`);
  const season = await createSeason(prisma, `Temporada ${n}`);
  const sport = await prisma.sport.create({
    data: { code: `futbol${n}`, name: `Fútbol ${n}` },
  });
  const category = await prisma.category.create({
    data: { code: `libre${n}`, name: `Libre ${n}` },
  });
  const championship = await prisma.championship.create({
    data: {
      name: `Campeonato ${n}`,
      seasonId: season.id,
      sportId: sport.id,
      categoryId: category.id,
      format: 'todos_contra_todos',
      status: 'en_curso',
    },
  });
  await prisma.competitionRuleVersion.create({
    data: {
      championshipId: championship.id,
      version: 1,
      rulesJson: { pointsWin: 3, pointsDraw: 1, pointsLoss: 0 },
    },
  });

  const sides = [] as {
    club: typeof club1;
    team: Awaited<ReturnType<typeof prisma.team.create>>;
    teamSeason: Awaited<ReturnType<typeof prisma.teamSeason.create>>;
    athlete: Awaited<ReturnType<typeof createAthlete>>;
    registrationId: string;
  }[];
  for (const [i, club] of [club1, club2].entries()) {
    const name = i === 0 ? `Local ${n}` : `Visitante ${n}`;
    const team = await prisma.team.create({
      data: { clubId: club.id, sportId: sport.id, name, nameKey: `eq ${name}` },
    });
    const teamSeason = await prisma.teamSeason.create({
      data: {
        teamId: team.id,
        sportId: sport.id,
        seasonId: season.id,
        categoryId: category.id,
        name,
        nameKey: `eq ${name}`,
      },
    });
    const athlete = await createAthlete(prisma, club.id);
    const creator = await prisma.user.findFirstOrThrow();
    await prisma.teamMembership.create({
      data: {
        teamSeasonId: teamSeason.id,
        athleteId: athlete.id,
        sportId: sport.id,
        seasonId: season.id,
        createdById: creator.id,
        jerseyNumber: 10,
      },
    });
    const participant = await prisma.participant.create({
      data: { kind: 'equipo', team: { create: { teamId: team.id } } },
    });
    const registration = await prisma.registration.create({
      data: {
        championshipId: championship.id,
        participantId: participant.id,
        status: 'aprobada',
      },
    });
    sides.push({
      club,
      team,
      teamSeason,
      athlete,
      registrationId: registration.id,
    });
  }

  const stage = await prisma.stage.create({
    data: {
      championshipId: championship.id,
      name: 'Primera Etapa',
      sequence: 1,
    },
  });
  const round = await prisma.round.create({
    data: { stageId: stage.id, name: 'Fecha 1', roundNumber: 1 },
  });
  const event = await prisma.event.create({
    data: {
      roundId: round.id,
      scheduledAt: new Date(over.scheduledAt ?? '2026-06-25T15:00:00.000Z'),
      status: over.status ?? 'programado',
      participants: {
        create: [
          { registrationId: sides[0]!.registrationId, side: 'local' },
          { registrationId: sides[1]!.registrationId, side: 'visitante' },
        ],
      },
    },
    include: { participants: true },
  });

  return {
    season,
    sport,
    category,
    championship,
    stage,
    round,
    event,
    home: sides[0]!,
    away: sides[1]!,
    eventParticipants: event.participants,
  };
}
