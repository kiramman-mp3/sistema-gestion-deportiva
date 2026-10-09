import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { PasswordService } from '../auth/password.service.js';
import { PERMISSIONS } from '../authz/permissions.js';
import { normalizeKey, slugify } from '../common/keys.js';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { seedAuthorization } from './seed.js';
import { seedProvisionalCatalogs } from './seed-provisional.js';

/**
 * Datos de prueba semi-reales para probar la aplicación completa (docs/demo-data.md).
 *
 * Todo es ficticio: clubes, personas, documentos y teléfonos no corresponden a nadie real. Se pueden
 * reconocer porque las cuentas usan el dominio reservado `.invalid`, los clubes tienen código `DEMO-nn`
 * y los documentos de identidad son `DEMO-nnnn`. La generación es determinista (misma semilla, mismos
 * datos) y se niega a ejecutarse si ya se cargó.
 */
export const DEMO_DOMAIN = 'demo.liga.invalid';
const SEED = 20260101;

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoOptions {
  /** Contraseña común de las cuentas de demostración (mínimo 12 caracteres). */
  password: string;
  /** Carpeta donde se guardan las imágenes de ejemplo. */
  storageDir: string;
  /** «Hoy» para fechar el calendario (por omisión, la fecha actual). */
  now?: Date;
}

export interface DemoSummary {
  clubs: number;
  athletes: number;
  championships: number;
  matches: number;
  playedMatches: number;
  officials: number;
  cases: number;
  announcements: number;
  accounts: { email: string; role: string; name: string }[];
}

export async function isDemoLoaded(prisma: PrismaClient): Promise<boolean> {
  return (
    (await prisma.user.count({
      where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
    })) > 0
  );
}

/** Desactiva las cuentas de demostración y cierra sus sesiones (los datos permanecen). */
export async function deactivateDemoUsers(
  prisma: PrismaClient,
): Promise<number> {
  const users = await prisma.user.findMany({
    where: {
      email: { endsWith: `@${DEMO_DOMAIN}` },
      status: { not: 'inactivo' },
    },
    select: { id: true },
  });
  if (users.length === 0) return 0;
  const ids = users.map((u) => u.id);
  await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: { in: ids } },
      data: { status: 'inactivo' },
    }),
    prisma.session.updateMany({
      where: { userId: { in: ids }, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: 'cuenta_desactivada' },
    }),
  ]);
  return ids.length;
}

// ───────────────────── Datos base ─────────────────────

const MALE = [
  'Juan',
  'Luis',
  'Carlos',
  'José',
  'Pedro',
  'Diego',
  'Kevin',
  'Anthony',
  'Mateo',
  'Santiago',
  'Bryan',
  'Marco',
  'Fernando',
  'Henry',
  'Wilson',
  'Edison',
  'Cristian',
  'Jorge',
  'Byron',
  'Darwin',
  'Andrés',
  'Patricio',
  'Ricardo',
  'Álvaro',
  'Javier',
  'Esteban',
  'Israel',
  'Washington',
  'Klever',
  'Nelson',
];
const FEMALE = [
  'María',
  'Ana',
  'Lucía',
  'Rosa',
  'Karla',
  'Andrea',
  'Daniela',
  'Paola',
  'Sofía',
  'Valeria',
  'Gabriela',
  'Jessica',
  'Verónica',
  'Mónica',
  'Carmen',
  'Silvia',
  'Johana',
  'Nataly',
  'Estefanía',
  'Alexandra',
];
const SURNAMES = [
  'Pérez',
  'Morocho',
  'Guamán',
  'Chiluisa',
  'Tipán',
  'Tenesaca',
  'Cando',
  'Lema',
  'Yánez',
  'Naranjo',
  'Cisneros',
  'Vásconez',
  'Gavilanes',
  'Caiza',
  'Toapanta',
  'Llerena',
  'Mera',
  'Sánchez',
  'Ortiz',
  'Freire',
  'Silva',
  'Paredes',
  'Moreta',
  'Quishpe',
  'Allauca',
  'Sisa',
  'Pilamunga',
  'Chango',
  'Andrade',
  'Villacís',
  'Salazar',
  'Barrera',
  'Cevallos',
  'Pazmiño',
  'Ramos',
  'Olmedo',
  'Altamirano',
  'Bonilla',
  'Carrillo',
  'Jácome',
];

const CLUBS = [
  { name: 'Deportivo Quero', sector: 'Centro' },
  { name: 'Sporting Rumipamba', sector: 'Rumipamba' },
  { name: 'Yanayacu Fútbol Club', sector: 'Yanayacu' },
  { name: 'Unión Mochapata', sector: 'Mochapata' },
  { name: 'Juventud Centro', sector: 'Centro' },
  { name: 'Atlético San Pedro', sector: 'San Pedro' },
  { name: 'Real El Rosario', sector: 'El Rosario' },
  { name: 'Quero Basket Club', sector: 'Centro' },
  { name: 'Dragones de Quero Taekwondo', sector: 'La Merced' },
  { name: 'Club de Ajedrez Peón Rey', sector: 'Centro' },
  { name: 'Escuela Futuros Campeones', sector: 'San Francisco' },
  { name: 'Club Social Tungurahua', sector: 'Centro' },
] as const;

const VENUES = [
  {
    name: 'Estadio Cantonal de Quero',
    address: 'Av. 12 de Noviembre, Quero',
    capacity: 2500,
  },
  {
    name: 'Cancha Municipal de Rumipamba',
    address: 'Centro parroquial, Rumipamba',
    capacity: 800,
  },
  {
    name: 'Coliseo Cubierto de Quero',
    address: 'Calle Sucre y García Moreno, Quero',
    capacity: 1200,
  },
  {
    name: 'Salón de Eventos del Cabildo',
    address: 'Plaza central, Quero',
    capacity: 150,
  },
  {
    name: 'Gimnasio de Artes Marciales',
    address: 'Barrio La Merced, Quero',
    capacity: 300,
  },
];

/** Permisos de los roles de demostración (la matriz real la define la Liga: D-14, D-63). */
const DEMO_ROLES: Record<
  string,
  { name: string; permissions: (keyof typeof PERMISSIONS)[] }
> = {
  demo_secretaria: {
    name: 'Secretaría (demostración)',
    permissions: [
      'clubs:read',
      'clubs:manage',
      'clubs:access_all',
      'athletes:read',
      'athletes:read_full',
      'athletes:manage',
      'athletes:validate',
      'athletes:publish',
      'teams:read',
      'teams:manage',
      'documents:read',
      'documents:manage',
      'registrations:read',
      'registrations:manage',
      'championships:read',
      'fixtures:read',
      'results:read',
      'reports:read',
      'credentials:issue',
      'credentials:revoke',
      'announcements:read',
      'notifications:manage',
      'officials:read',
      'assignments:read',
      'cases:read',
      'sanctions:read',
      'institution:read',
      'seasons:read',
      'sports:read',
      'categories:read',
      'venues:read',
    ],
  },
  demo_comision_tecnica: {
    name: 'Comisión técnica (demostración)',
    permissions: [
      'championships:read',
      'championships:manage',
      'registrations:read',
      'registrations:manage',
      'fixtures:read',
      'fixtures:manage',
      'results:read',
      'results:manage',
      'results:approve',
      'venues:read',
      'venues:manage',
      'officials:read',
      'officials:manage',
      'assignments:read',
      'assignments:manage',
      'athletes:read',
      'athletes:validate',
      'teams:read',
      'reports:read',
      'clubs:read',
      'clubs:access_all',
      'sanctions:read',
      'notifications:manage',
      'seasons:read',
      'sports:read',
      'categories:read',
      'incidents:read',
    ],
  },
  demo_arbitro: {
    name: 'Árbitro o juez (demostración)',
    permissions: [
      'assignments:read_own',
      'results:read',
      'results:manage_assigned',
      'fixtures:read',
      'incidents:report',
      'athletes:read',
      'championships:read',
    ],
  },
  demo_dirigente: {
    name: 'Dirigente de club (demostración)',
    permissions: [
      'clubs:read',
      'athletes:read',
      'athletes:read_full',
      'athletes:manage',
      'teams:read',
      'teams:manage',
      'documents:read',
      'documents:manage',
      'registrations:read',
      'registrations:manage',
      'championships:read',
      'fixtures:read',
      'results:read',
      'reports:read',
      'credentials:issue',
      'complaints:submit',
      'complaints:read',
      'sanctions:read',
      'seasons:read',
      'sports:read',
      'categories:read',
    ],
  },
  demo_editor: {
    name: 'Editor de contenido (demostración)',
    permissions: [
      'announcements:read',
      'announcements:manage',
      'announcements:publish',
    ],
  },
  demo_disciplinaria: {
    name: 'Comisión disciplinaria (demostración)',
    permissions: [
      'cases:read',
      'cases:manage',
      'cases:resolve',
      'cases:publish',
      'incidents:read',
      'complaints:read',
      'sanctions:read',
      'sanctions:manage',
      'reports:read',
      'clubs:read',
      'clubs:access_all',
      'athletes:read',
      'teams:read',
      'championships:read',
      'fixtures:read',
      'results:read',
    ],
  },
};

// ───────────────────── Utilidades ─────────────────────

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** PNG de color con degradado (imagen de ejemplo para las noticias). */
function makePng(
  width: number,
  height: number,
  [r, g, b]: [number, number, number],
): Buffer {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < width; x++) {
      const shade = 0.55 + 0.45 * (x / width) * (1 - y / (height * 2));
      const o = y * stride + 1 + x * 3;
      raw[o] = Math.min(255, Math.round(r * shade));
      raw[o + 1] = Math.min(255, Math.round(g * shade));
      raw[o + 2] = Math.min(255, Math.round(b * shade));
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Emparejamientos de todos contra todos (método del círculo). Devuelve una lista de jornadas. */
export function roundRobin(n: number): [number, number][][] {
  const ids = Array.from({ length: n }, (_, i) => i);
  const rounds: [number, number][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i]!;
      const b = ids[n - 1 - i]!;
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop()!);
  }
  return rounds;
}

const idKey = (n: number) => `otro:DEMO${String(n).padStart(5, '0')}`;

interface Player {
  athleteId: string;
  personId: string;
  jersey: number;
}
interface TeamEntry {
  teamId: string;
  teamSeasonId: string;
  registrationId: string;
  clubId: string;
  name: string;
  players: Player[];
}

export async function seedDemo(
  prisma: PrismaClient,
  options: DemoOptions,
): Promise<DemoSummary> {
  if (options.password.length < 12) {
    throw new Error(
      'La contraseña de demostración necesita al menos 12 caracteres.',
    );
  }
  if (await isDemoLoaded(prisma)) {
    throw new Error('Los datos de demostración ya están cargados.');
  }
  for (const role of Object.values(DEMO_ROLES)) {
    for (const code of role.permissions) {
      if (!(code in PERMISSIONS))
        throw new Error(`Permiso inexistente: ${code}`);
    }
  }

  // Catálogo de permisos y deportes/categorías: se crean solo si faltan.
  await seedAuthorization(prisma);
  await seedProvisionalCatalogs(prisma);
  const passwordHash = await new PasswordService().hash(options.password);
  await mkdir(options.storageDir, { recursive: true });

  const now = options.now ?? new Date();
  const rng = mulberry32(SEED);
  const pick = <T>(list: readonly T[]): T =>
    list[Math.floor(rng() * list.length)]!;
  const int = (min: number, max: number) =>
    min + Math.floor(rng() * (max - min + 1));
  let personCounter = 0;
  const summary: DemoSummary = {
    clubs: 0,
    athletes: 0,
    championships: 0,
    matches: 0,
    playedMatches: 0,
    officials: 0,
    cases: 0,
    announcements: 0,
    accounts: [],
  };

  await prisma.$transaction(
    async (tx) => {
      // ───────── Roles y cuentas ─────────
      const roleIds = new Map<string, string>();
      for (const [code, def] of Object.entries(DEMO_ROLES)) {
        const role = await tx.role.upsert({
          where: { code },
          update: {},
          create: {
            code,
            name: def.name,
            description: 'Rol de demostración (datos de prueba).',
          },
        });
        roleIds.set(code, role.id);
        const perms = await tx.permission.findMany({
          where: { code: { in: def.permissions } },
          select: { id: true },
        });
        await tx.rolePermission.createMany({
          data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
          skipDuplicates: true,
        });
      }
      const createUser = async (
        local: string,
        displayName: string,
        roleCode: string,
      ) => {
        const email = `${local}@${DEMO_DOMAIN}`;
        const user = await tx.user.create({
          data: { email, displayName, passwordHash, status: 'activo' },
        });
        await tx.userRole.create({
          data: { userId: user.id, roleId: roleIds.get(roleCode)! },
        });
        summary.accounts.push({
          email,
          role: DEMO_ROLES[roleCode]!.name,
          name: displayName,
        });
        return user;
      };
      const secretaria = await createUser(
        'secretaria',
        'Rosa Quishpe (secretaría)',
        'demo_secretaria',
      );
      const comision = await createUser(
        'comision.tecnica',
        'Marco Cisneros (comisión técnica)',
        'demo_comision_tecnica',
      );
      const disciplinaria = await createUser(
        'disciplinaria',
        'Verónica Allauca (disciplinaria)',
        'demo_disciplinaria',
      );
      const editor = await createUser(
        'editor',
        'Andrea Freire (editora)',
        'demo_editor',
      );
      const refUser1 = await createUser(
        'arbitro1',
        'Luis Moreta (árbitro)',
        'demo_arbitro',
      );
      const refUser2 = await createUser(
        'arbitro2',
        'Esteban Paredes (árbitro)',
        'demo_arbitro',
      );

      // ───────── Institución ─────────
      const inst = await tx.institutionSettings.upsert({
        where: { id: 1 },
        update: {},
        create: {
          id: 1,
          name: 'Liga Deportiva Cantonal de Quero',
          shortName: 'Liga de Quero',
        },
      });
      const fill = <T extends string | null>(
        current: T,
        value: string,
      ): string => (current && current.trim() ? current : value);
      await tx.institutionSettings.update({
        where: { id: 1 },
        data: {
          address: fill(
            inst.address,
            'Calle Bolívar y Sucre, Quero, Tungurahua',
          ),
          email: fill(inst.email, `info@${DEMO_DOMAIN}`),
          phone: fill(inst.phone, '032 000 000'),
          about: fill(
            inst.about,
            'Texto de demostración. La Liga Deportiva Cantonal de Quero organiza los campeonatos de fútbol, básquet, taekwondo y ajedrez del cantón.\n\nPublique aquí la historia, la misión y los datos que la Liga considere importantes.',
          ),
          contactInfo: fill(
            inst.contactInfo,
            'Texto de demostración. Atención de lunes a viernes de 08:00 a 16:00 en las oficinas de la Liga.',
          ),
          privacyPolicy: fill(
            inst.privacyPolicy,
            'TEXTO DE DEMOSTRACIÓN: sustitúyalo por la política de privacidad aprobada por la Liga y validada por su asesoría legal. Los datos de menores no se publican sin el consentimiento de su representante.',
          ),
          presidentName: fill(
            inst.presidentName,
            'Presidente de la Liga (demostración)',
          ),
          secretaryName: fill(
            inst.secretaryName,
            'Secretaria de la Liga (demostración)',
          ),
        },
      });

      // ───────── Temporada, categorías, deportes, escenarios ─────────
      const year = now.getUTCFullYear();
      const seasonName = `Temporada ${year}`;
      const season =
        (await tx.season.findUnique({ where: { name: seasonName } })) ??
        (await tx.season.create({
          data: {
            name: seasonName,
            status: 'activa',
            startDate: new Date(`${year}-01-01T00:00:00.000Z`),
            endDate: new Date(`${year}-12-31T00:00:00.000Z`),
          },
        }));
      const sport = Object.fromEntries(
        (
          await tx.sport.findMany({
            where: {
              code: { in: ['futbol', 'basquet', 'taekwondo', 'ajedrez'] },
            },
          })
        ).map((s) => [s.code, s]),
      );
      const category = Object.fromEntries(
        (await tx.category.findMany()).map((c) => [c.code, c]),
      );
      const venues: { id: string; name: string }[] = [];
      for (const v of VENUES) {
        venues.push(
          await tx.venue.upsert({
            where: { name: v.name },
            update: {},
            create: v,
          }),
        );
      }

      // ───────── Clubes, dirigentes y representantes ─────────
      const clubs: { id: string; name: string }[] = [];
      for (const [i, c] of CLUBS.entries()) {
        const club = await tx.club.create({
          data: {
            name: c.name,
            nameKey: normalizeKey(c.name),
            slug: slugify(c.name),
            code: `DEMO-${String(i + 1).padStart(2, '0')}`,
            sector: c.sector,
            contactEmail: `club${i + 1}@${DEMO_DOMAIN}`,
            contactPhone: `0990000${String(100 + i)}`,
          },
        });
        clubs.push(club);
        const rep = await tx.person.create({
          data: {
            firstName: pick(MALE),
            lastName: `${pick(SURNAMES)} ${pick(SURNAMES)}`,
            birthDate: new Date(
              `${year - int(35, 60)}-0${int(1, 9)}-1${int(0, 9)}T00:00:00.000Z`,
            ),
          },
        });
        await tx.clubRepresentative.create({
          data: {
            clubId: club.id,
            personId: rep.id,
            roleName: 'Presidente',
            validFrom: new Date(`${year}-01-01T00:00:00.000Z`),
          },
        });
        summary.clubs++;
      }
      for (let i = 0; i < 4; i++) {
        const leader = await createUser(
          `dirigente${i + 1}`,
          `Dirigente de ${CLUBS[i]!.name}`,
          'demo_dirigente',
        );
        await tx.clubUser.create({
          data: {
            clubId: clubs[i]!.id,
            userId: leader.id,
            createdById: secretaria.id,
          },
        });
      }

      // ───────── Personas y deportistas ─────────
      const makeAthlete = async (
        clubId: string,
        minAge: number,
        maxAge: number,
        opts: {
          eligibility?: 'pendiente' | 'habilitado' | 'inhabilitado';
          female?: boolean;
        } = {},
      ) => {
        const n = ++personCounter;
        const minor = maxAge < 18;
        const age = int(minAge, maxAge);
        const birth = new Date(Date.UTC(year - age, int(0, 11), int(1, 28)));
        const person = await tx.person.create({
          data: {
            firstName: opts.female ? pick(FEMALE) : pick(MALE),
            lastName: `${pick(SURNAMES)} ${pick(SURNAMES)}`,
            birthDate: birth,
          },
        });
        await tx.personPrivateData.create({
          data: {
            personId: person.id,
            idType: 'otro',
            idNumber: `DEMO-${String(n).padStart(5, '0')}`,
            idKey: idKey(n),
            phone: `099000${String(1000 + n).slice(-4)}`,
            ...(minor && {
              guardianName: `${pick([...MALE, ...FEMALE])} ${pick(SURNAMES)}`,
              guardianRelation: pick(['madre', 'padre', 'tutor legal']),
              guardianPhone: `098000${String(1000 + n).slice(-4)}`,
            }),
          },
        });
        const publicProfile = rng() < (minor ? 0.08 : 0.15);
        const athlete = await tx.athlete.create({
          data: {
            personId: person.id,
            clubId,
            eligibility: opts.eligibility ?? 'habilitado',
            publicProfile,
          },
        });
        await tx.consentRecord.create({
          data: {
            personId: person.id,
            type: 'tratamiento_datos',
            purpose: 'Gestión deportiva de la Liga (datos de demostración)',
            grantedByName: minor
              ? 'Representante legal (demostración)'
              : `${person.firstName} ${person.lastName}`,
            grantedByRelation: minor ? 'representante' : 'propio',
            recordedById: secretaria.id,
          },
        });
        if (publicProfile) {
          await tx.consentRecord.create({
            data: {
              personId: person.id,
              type: 'publicacion_perfil',
              grantedByName: minor
                ? 'Representante legal (demostración)'
                : `${person.firstName} ${person.lastName}`,
              grantedByRelation: minor ? 'representante' : 'propio',
              recordedById: secretaria.id,
            },
          });
        }
        summary.athletes++;
        return { athleteId: athlete.id, personId: person.id };
      };

      // ───────── Equipos y plantillas ─────────
      const teamCount = { n: 0 };
      const buildTeam = async (
        clubIndex: number,
        sportCode: string,
        categoryCode: string,
        name: string,
        size: number,
        minAge: number,
        maxAge: number,
        statuses: ('pendiente' | 'habilitado' | 'inhabilitado')[] = [],
      ): Promise<TeamEntry> => {
        const club = clubs[clubIndex]!;
        const team = await tx.team.create({
          data: {
            clubId: club.id,
            sportId: sport[sportCode]!.id,
            name,
            nameKey: normalizeKey(name),
          },
        });
        const teamSeason = await tx.teamSeason.create({
          data: {
            teamId: team.id,
            sportId: sport[sportCode]!.id,
            seasonId: season.id,
            categoryId: category[categoryCode]!.id,
            name,
            nameKey: normalizeKey(name),
          },
        });
        const players: Player[] = [];
        const jerseys = Array.from({ length: 30 }, (_, i) => i + 1).sort(
          () => rng() - 0.5,
        );
        for (let i = 0; i < size; i++) {
          const eligibility = statuses[i] ?? 'habilitado';
          const a = await makeAthlete(club.id, minAge, maxAge, { eligibility });
          await tx.teamMembership.create({
            data: {
              teamSeasonId: teamSeason.id,
              athleteId: a.athleteId,
              sportId: sport[sportCode]!.id,
              seasonId: season.id,
              jerseyNumber: jerseys[i]!,
              createdById: secretaria.id,
            },
          });
          players.push({ ...a, jersey: jerseys[i]! });
        }
        const participant = await tx.participant.create({
          data: { kind: 'equipo', team: { create: { teamId: team.id } } },
        });
        teamCount.n++;
        return {
          teamId: team.id,
          teamSeasonId: teamSeason.id,
          registrationId: '',
          clubId: club.id,
          name,
          players,
          // El participante se guarda para inscribirlo después en el campeonato.
          ...({ participantId: participant.id } as object),
        } as TeamEntry & { participantId: string };
      };

      const futbolA: (TeamEntry & { participantId: string })[] = [];
      const clubFootballNames = [
        'Deportivo Quero',
        'Sporting Rumipamba',
        'Yanayacu FC',
        'Unión Mochapata',
        'Juventud Centro',
        'Atlético San Pedro',
        'Real El Rosario',
        'Club Social Tungurahua',
      ];
      const clubIndexA = [0, 1, 2, 3, 4, 5, 6, 11];
      for (const [i, name] of clubFootballNames.entries()) {
        futbolA.push(
          (await buildTeam(
            clubIndexA[i]!,
            'futbol',
            'liga_a',
            name,
            14,
            18,
            34,
            i === 2
              ? ['pendiente', 'pendiente']
              : i === 5
                ? ['inhabilitado']
                : [],
          )) as TeamEntry & { participantId: string },
        );
      }
      const juvenil: (TeamEntry & { participantId: string })[] = [];
      for (const [i, ci] of [0, 1, 2, 3, 4, 10].entries()) {
        juvenil.push(
          (await buildTeam(
            ci,
            'futbol',
            'juvenil',
            `${clubs[ci]!.name} Juvenil`,
            12,
            14,
            17,
            i === 1 ? ['pendiente'] : [],
          )) as TeamEntry & { participantId: string },
        );
      }
      const basket: (TeamEntry & { participantId: string })[] = [];
      for (const ci of [7, 0, 1, 2, 4, 5]) {
        basket.push(
          (await buildTeam(
            ci,
            'basquet',
            'liga_b',
            `${clubs[ci]!.name} Básquet`,
            9,
            18,
            30,
          )) as TeamEntry & { participantId: string },
        );
      }

      // ───────── Campeonatos ─────────
      const rules = (sportCode: string) =>
        sportCode === 'basquet'
          ? { pointsWin: 2, pointsLoss: 1 }
          : sportCode === 'futbol'
            ? { pointsWin: 3, pointsDraw: 1, pointsLoss: 0 }
            : {};
      const makeChampionship = async (
        name: string,
        sportCode: string,
        categoryCode: string,
        format: 'todos_contra_todos' | 'sistema_suizo' | 'cuadro_combates',
      ) => {
        const champ = await tx.championship.create({
          data: {
            seasonId: season.id,
            sportId: sport[sportCode]!.id,
            categoryId: category[categoryCode]!.id,
            name,
            format,
            status: 'en_curso',
            startDate: new Date(now.getTime() - 40 * 86_400_000),
            endDate: new Date(now.getTime() + 60 * 86_400_000),
          },
        });
        await tx.competitionRuleVersion.create({
          data: {
            championshipId: champ.id,
            version: 1,
            rulesJson: rules(sportCode),
            approvedById: comision.id,
            approvedAt: new Date(now.getTime() - 41 * 86_400_000),
          },
        });
        summary.championships++;
        return champ;
      };
      const register = async (championshipId: string, participantId: string) =>
        (
          await tx.registration.create({
            data: {
              championshipId,
              participantId,
              status: 'aprobada',
              submittedAt: new Date(now.getTime() - 45 * 86_400_000),
              reviewedById: comision.id,
              reviewedAt: new Date(now.getTime() - 44 * 86_400_000),
              reviewNotes: 'Inscripción revisada (datos de demostración)',
            },
          })
        ).id;

      // Hora local de Ecuador (UTC-5).
      const kickoff = (daysFromNow: number, hourLocal: number) => {
        const d = new Date(now.getTime() + daysFromNow * 86_400_000);
        return new Date(
          Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate(),
            hourLocal + 5,
            0,
            0,
          ),
        );
      };

      const playedEvents: { eventId: string; resultId: string }[] = [];
      const upcomingEvents: { id: string; when: Date }[] = [];

      /** Calendario de todos contra todos con las primeras jornadas ya jugadas. */
      const league = async (
        champName: string,
        sportCode: string,
        categoryCode: string,
        entries: (TeamEntry & { participantId: string })[],
        venueIdx: number[],
        playedRounds: number,
        play: (
          a: TeamEntry,
          b: TeamEntry,
          ids: {
            eventId: string;
            resultId: string;
            pa: string;
            pb: string;
            when: Date;
          },
        ) => Promise<void>,
        startOffset: number,
      ) => {
        const champ = await makeChampionship(
          champName,
          sportCode,
          categoryCode,
          'todos_contra_todos',
        );
        for (const e of entries)
          e.registrationId = await register(champ.id, e.participantId);
        const stage = await tx.stage.create({
          data: {
            championshipId: champ.id,
            name: 'Fase regular',
            sequence: 1,
            stageType: 'grupo',
          },
        });
        const schedule = roundRobin(entries.length);
        for (const [r, pairs] of schedule.entries()) {
          const round = await tx.round.create({
            data: {
              stageId: stage.id,
              name: `Fecha ${r + 1}`,
              roundNumber: r + 1,
            },
          });
          const dayOffset = startOffset + r * 7;
          for (const [m, [ia, ib]] of pairs.entries()) {
            const a = entries[ia]!;
            const b = entries[ib]!;
            const when = kickoff(dayOffset, 9 + m * 2);
            const played = r < playedRounds;
            const venueId = venues[venueIdx[m % venueIdx.length]!]!.id;
            const event = await tx.event.create({
              data: {
                roundId: round.id,
                venueId,
                scheduledAt: when,
                status: played ? 'finalizado' : 'programado',
                actualStartAt: played ? when : null,
                actualEndAt: played
                  ? new Date(when.getTime() + 105 * 60_000)
                  : null,
                participants: {
                  create: [
                    { registrationId: a.registrationId, side: 'local' },
                    { registrationId: b.registrationId, side: 'visitante' },
                  ],
                },
              },
              include: { participants: { orderBy: { id: 'asc' } } },
            });
            summary.matches++;
            if (played) {
              const result = await tx.result.create({
                data: {
                  eventId: event.id,
                  status: 'aprobado',
                  submittedById: r % 2 === 0 ? refUser1.id : refUser2.id,
                  submittedAt: new Date(when.getTime() + 2 * 3_600_000),
                  approvedById: comision.id,
                  approvedAt: new Date(when.getTime() + 20 * 3_600_000),
                  approvalNotes:
                    'Acta revisada y aprobada (datos de demostración)',
                },
              });
              await tx.resultRevision.create({
                data: {
                  resultId: result.id,
                  previousSnapshot: { status: 'pendiente_revision' },
                  newSnapshot: { status: 'aprobado' },
                  reason: 'Revisión reglamentaria (datos de demostración)',
                  changedById: comision.id,
                  changedAt: result.approvedAt ?? when,
                },
              });
              const pa = event.participants.find((p) => p.side === 'local')!.id;
              const pb = event.participants.find(
                (p) => p.side === 'visitante',
              )!.id;
              await play(a, b, {
                eventId: event.id,
                resultId: result.id,
                pa,
                pb,
                when,
              });
              playedEvents.push({ eventId: event.id, resultId: result.id });
              summary.playedMatches++;
            } else {
              upcomingEvents.push({ id: event.id, when });
            }
          }
        }
        return champ;
      };

      const footballPlay = async (
        a: TeamEntry,
        b: TeamEntry,
        ids: { eventId: string; resultId: string; pa: string; pb: string },
      ) => {
        const goalsA = int(0, 4);
        const goalsB = int(0, 3);
        await tx.resultValue.createMany({
          data: [
            {
              resultId: ids.resultId,
              eventParticipantId: ids.pa,
              score: goalsA,
              outcome:
                goalsA > goalsB
                  ? 'victoria'
                  : goalsA < goalsB
                    ? 'derrota'
                    : 'empate',
            },
            {
              resultId: ids.resultId,
              eventParticipantId: ids.pb,
              score: goalsB,
              outcome:
                goalsB > goalsA
                  ? 'victoria'
                  : goalsB < goalsA
                    ? 'derrota'
                    : 'empate',
            },
          ],
        });
        const events: Prisma.FootballEventCreateManyInput[] = [];
        const add = (
          team: TeamEntry,
          ep: string,
          type: 'gol' | 'tarjeta_amarilla' | 'tarjeta_roja',
        ) => {
          events.push({
            resultId: ids.resultId,
            eventParticipantId: ep,
            athleteId: pick(team.players).athleteId,
            eventType: type,
            minute: int(2, 90),
          });
        };
        for (let g = 0; g < goalsA; g++) add(a, ids.pa, 'gol');
        for (let g = 0; g < goalsB; g++) add(b, ids.pb, 'gol');
        for (let y = int(0, 3); y > 0; y--)
          add(
            rng() < 0.5 ? a : b,
            rng() < 0.5 ? ids.pa : ids.pb,
            'tarjeta_amarilla',
          );
        if (rng() < 0.1) add(a, ids.pa, 'tarjeta_roja');
        // Una tarjeta debe asociarse al equipo correcto: se corrige el participante según el deportista.
        const owner = new Map<string, string>([
          ...a.players.map((p) => [p.athleteId, ids.pa] as [string, string]),
          ...b.players.map((p) => [p.athleteId, ids.pb] as [string, string]),
        ]);
        for (const ev of events)
          ev.eventParticipantId =
            owner.get(ev.athleteId!) ?? ev.eventParticipantId;
        await tx.footballEvent.createMany({ data: events });
      };

      const basketPlay = async (
        _a: TeamEntry,
        _b: TeamEntry,
        ids: { resultId: string; pa: string; pb: string },
      ) => {
        const quarters = (ep: string) =>
          Array.from({ length: 4 }, (_, i) => ({
            resultId: ids.resultId,
            eventParticipantId: ep,
            periodNumber: i + 1,
            score: int(10, 26),
          }));
        const qa = quarters(ids.pa);
        const qb = quarters(ids.pb);
        let ta = qa.reduce((s, q) => s + q.score, 0);
        const tb = qb.reduce((s, q) => s + q.score, 0);
        if (ta === tb) {
          qa[3]!.score += 2;
          ta += 2;
        }
        await tx.eventPeriodScore.createMany({ data: [...qa, ...qb] });
        await tx.resultValue.createMany({
          data: [
            {
              resultId: ids.resultId,
              eventParticipantId: ids.pa,
              score: ta,
              outcome: ta > tb ? 'victoria' : 'derrota',
            },
            {
              resultId: ids.resultId,
              eventParticipantId: ids.pb,
              score: tb,
              outcome: tb > ta ? 'victoria' : 'derrota',
            },
          ],
        });
      };

      const ligaA = await league(
        'Campeonato de Fútbol Liga A',
        'futbol',
        'liga_a',
        futbolA,
        [0, 1],
        4,
        footballPlay,
        -26,
      );
      const juv = await league(
        'Campeonato de Fútbol Juvenil',
        'futbol',
        'juvenil',
        juvenil,
        [1, 0],
        3,
        footballPlay,
        -19,
      );
      await league(
        'Campeonato de Básquet Liga B',
        'basquet',
        'liga_b',
        basket,
        [2],
        3,
        basketPlay,
        -17,
      );

      // ───────── Taekwondo (individual, adolescentes) ─────────
      const tkd = await makeChampionship(
        'Torneo de Taekwondo Juvenil',
        'taekwondo',
        'juvenil',
        'cuadro_combates',
      );
      const fighters: {
        athleteId: string;
        registrationId: string;
        participantId: string;
      }[] = [];
      for (let i = 0; i < 8; i++) {
        const a = await makeAthlete(clubs[8]!.id, 14, 17, {
          female: i % 3 === 0,
        });
        const participant = await tx.participant.create({
          data: {
            kind: 'individual',
            individual: { create: { athleteId: a.athleteId } },
          },
        });
        fighters.push({
          athleteId: a.athleteId,
          participantId: participant.id,
          registrationId: await register(tkd.id, participant.id),
        });
      }
      const tkdStage = await tx.stage.create({
        data: {
          championshipId: tkd.id,
          name: 'Cuartos de final',
          sequence: 1,
          stageType: 'eliminatoria',
        },
      });
      const tkdRound = await tx.round.create({
        data: { stageId: tkdStage.id, name: 'Combates', roundNumber: 1 },
      });
      for (let m = 0; m < 4; m++) {
        const when = kickoff(-9, 9 + m);
        const f1 = fighters[m * 2]!;
        const f2 = fighters[m * 2 + 1]!;
        const event = await tx.event.create({
          data: {
            roundId: tkdRound.id,
            venueId: venues[4]!.id,
            scheduledAt: when,
            status: 'finalizado',
            participants: {
              create: [
                { registrationId: f1.registrationId, side: 'individual' },
                { registrationId: f2.registrationId, side: 'individual' },
              ],
            },
          },
          include: { participants: { orderBy: { id: 'asc' } } },
        });
        const result = await tx.result.create({
          data: {
            eventId: event.id,
            status: 'aprobado',
            submittedById: refUser1.id,
            submittedAt: when,
            approvedById: comision.id,
            approvedAt: new Date(when.getTime() + 3_600_000),
            approvalNotes: 'Combate aprobado (datos de demostración)',
          },
        });
        const [pa, pb] = event.participants.map((p) => p.id) as [
          string,
          string,
        ];
        const bouts = [pa, pb].flatMap((ep) =>
          [1, 2, 3].map((n) => ({
            resultId: result.id,
            eventParticipantId: ep,
            roundNumber: n,
            points: int(0, 12),
            penalties: int(0, 1) === 1 && rng() < 0.3 ? 1 : 0,
          })),
        );
        await tx.taekwondoBout.createMany({ data: bouts });
        const total = (ep: string) =>
          bouts
            .filter((b) => b.eventParticipantId === ep)
            .reduce((s, b) => s + b.points, 0);
        const ta = total(pa);
        const tb = total(pb) === ta ? total(pb) + 1 : total(pb);
        await tx.resultValue.createMany({
          data: [
            {
              resultId: result.id,
              eventParticipantId: pa,
              score: ta,
              outcome: ta > tb ? 'victoria' : 'derrota',
            },
            {
              resultId: result.id,
              eventParticipantId: pb,
              score: tb,
              outcome: tb > ta ? 'victoria' : 'derrota',
            },
          ],
        });
        summary.matches++;
        summary.playedMatches++;
        playedEvents.push({ eventId: event.id, resultId: result.id });
      }
      const semis = await tx.round.create({
        data: {
          stageId: (
            await tx.stage.create({
              data: {
                championshipId: tkd.id,
                name: 'Semifinales',
                sequence: 2,
                stageType: 'eliminatoria',
              },
            })
          ).id,
          name: 'Combates',
          roundNumber: 1,
        },
      });
      for (let m = 0; m < 2; m++) {
        const when = kickoff(6, 10 + m);
        const event = await tx.event.create({
          data: {
            roundId: semis.id,
            venueId: venues[4]!.id,
            scheduledAt: when,
            participants: {
              create: [
                {
                  registrationId: fighters[m * 4]!.registrationId,
                  side: 'individual',
                },
                {
                  registrationId: fighters[m * 4 + 2]!.registrationId,
                  side: 'individual',
                },
              ],
            },
          },
        });
        upcomingEvents.push({ id: event.id, when });
        summary.matches++;
      }

      // ───────── Ajedrez (individual, suizo) ─────────
      const chess = await makeChampionship(
        'Torneo de Ajedrez Abierto',
        'ajedrez',
        'liga_c',
        'sistema_suizo',
      );
      const players: { registrationId: string }[] = [];
      for (let i = 0; i < 8; i++) {
        const a = await makeAthlete(clubs[9]!.id, 18, 45, {
          female: i % 4 === 0,
        });
        const participant = await tx.participant.create({
          data: {
            kind: 'individual',
            individual: { create: { athleteId: a.athleteId } },
          },
        });
        players.push({
          registrationId: await register(chess.id, participant.id),
        });
      }
      const chessStage = await tx.stage.create({
        data: {
          championshipId: chess.id,
          name: 'Sistema suizo',
          sequence: 1,
          stageType: 'unico',
        },
      });
      for (let r = 0; r < 4; r++) {
        const round = await tx.round.create({
          data: {
            stageId: chessStage.id,
            name: `Ronda ${r + 1}`,
            roundNumber: r + 1,
          },
        });
        const order = players.map((_, i) => (i + r * 2) % 8);
        for (let m = 0; m < 4; m++) {
          const white = players[order[m * 2]!]!;
          const black = players[order[m * 2 + 1]!]!;
          const when = kickoff(-14 + r * 4, 15);
          const played = r < 3;
          const event = await tx.event.create({
            data: {
              roundId: round.id,
              venueId: venues[3]!.id,
              scheduledAt: new Date(when.getTime() + m * 60_000),
              status: played ? 'finalizado' : 'programado',
              participants: {
                create: [
                  { registrationId: white.registrationId, side: 'individual' },
                  { registrationId: black.registrationId, side: 'individual' },
                ],
              },
            },
            include: { participants: { orderBy: { id: 'asc' } } },
          });
          summary.matches++;
          if (!played) {
            upcomingEvents.push({ id: event.id, when });
            continue;
          }
          const result = await tx.result.create({
            data: {
              eventId: event.id,
              status: 'aprobado',
              submittedById: refUser2.id,
              submittedAt: when,
              approvedById: comision.id,
              approvedAt: new Date(when.getTime() + 3_600_000),
              approvalNotes: 'Partida aprobada (datos de demostración)',
            },
          });
          const roll = rng();
          const [pw, pbk] =
            roll < 0.4 ? [1, 0] : roll < 0.8 ? [0, 1] : [0.5, 0.5];
          const [e1, e2] = event.participants.map((p) => p.id) as [
            string,
            string,
          ];
          await tx.chessPairing.createMany({
            data: [
              {
                resultId: result.id,
                eventParticipantId: e1,
                color: 'blancas',
                points: pw,
              },
              {
                resultId: result.id,
                eventParticipantId: e2,
                color: 'negras',
                points: pbk,
              },
            ],
          });
          await tx.resultValue.createMany({
            data: [
              {
                resultId: result.id,
                eventParticipantId: e1,
                score: pw === 1 ? 1 : 0,
                outcome:
                  pw === 1 ? 'victoria' : pw === 0 ? 'derrota' : 'empate',
              },
              {
                resultId: result.id,
                eventParticipantId: e2,
                score: pbk === 1 ? 1 : 0,
                outcome:
                  pbk === 1 ? 'victoria' : pbk === 0 ? 'derrota' : 'empate',
              },
            ],
          });
          playedEvents.push({ eventId: event.id, resultId: result.id });
          summary.playedMatches++;
        }
      }

      // ───────── Árbitros y designaciones ─────────
      const officialDefs = [
        {
          user: refUser1,
          first: 'Luis',
          last: 'Moreta',
          sports: ['futbol', 'basquet'],
        },
        {
          user: refUser2,
          first: 'Esteban',
          last: 'Paredes',
          sports: ['futbol', 'taekwondo', 'ajedrez'],
        },
        { user: null, first: 'Patricio', last: 'Cevallos', sports: ['futbol'] },
        {
          user: null,
          first: 'Wilson',
          last: 'Barrera',
          sports: ['futbol', 'basquet'],
        },
        {
          user: null,
          first: 'Gabriela',
          last: 'Sisa',
          sports: ['basquet', 'ajedrez'],
        },
        {
          user: null,
          first: 'Jorge',
          last: 'Pilamunga',
          sports: ['taekwondo'],
        },
        { user: null, first: 'Daniela', last: 'Jácome', sports: ['futbol'] },
        {
          user: null,
          first: 'Marco',
          last: 'Altamirano',
          sports: ['futbol', 'basquet'],
        },
      ];
      const officials: { id: string; sports: string[] }[] = [];
      for (const [i, d] of officialDefs.entries()) {
        const person = await tx.person.create({
          data: { firstName: d.first, lastName: d.last },
        });
        const official = await tx.official.create({
          data: {
            personId: person.id,
            userId: d.user?.id ?? null,
            licenseNumber: `LIC-DEMO-${String(i + 1).padStart(3, '0')}`,
            phone: `097000${String(1000 + i).slice(-4)}`,
            sports: {
              create: d.sports.map((c) => ({ sportId: sport[c]!.id })),
            },
          },
        });
        officials.push({ id: official.id, sports: d.sports });
        summary.officials++;
      }
      // Designaciones en los próximos partidos de fútbol Liga A (3 oficiales cada uno, sin traslapes).
      const footballOfficials = officials.filter((o) =>
        o.sports.includes('futbol'),
      );
      const nextFootball = await tx.event.findMany({
        where: {
          round: { stage: { championshipId: ligaA.id } },
          status: 'programado',
        },
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        take: 8,
      });
      const roles = ['arbitro_central', 'asistente_1', 'asistente_2'] as const;
      let cursor = 0;
      for (const [i, ev] of nextFootball.entries()) {
        for (const role of roles) {
          const official =
            footballOfficials[cursor % footballOfficials.length]!;
          cursor++;
          await tx.eventAssignment.create({
            data: {
              eventId: ev.id,
              officialId: official.id,
              role,
              status: i < 2 ? 'confirmado' : 'designado',
              respondedAt: i < 2 ? new Date(now.getTime() - 86_400_000) : null,
              assignedById: comision.id,
            },
          });
        }
      }

      // ───────── Disciplina ─────────
      const sampleEvents = playedEvents.slice(0, 6);
      const sampleOf = async (eventId: string) => {
        const eps = await tx.eventParticipant.findMany({
          where: { eventId },
          include: {
            registration: {
              include: {
                participant: { include: { team: { include: { team: true } } } },
              },
            },
          },
        });
        const team = eps.find((e) => e.registration.participant.team)
          ?.registration.participant.team?.team;
        return team ?? null;
      };
      const team1 = await sampleOf(sampleEvents[1]!.eventId);
      const team2 = await sampleOf(sampleEvents[2]!.eventId);
      const entry = (
        caseId: string,
        kind: 'apertura' | 'nota' | 'asignacion' | 'decision' | 'publicacion',
        body: string,
        authorId: string,
      ) => tx.caseEntry.create({ data: { caseId, kind, body, authorId } });

      if (team1 && team2) {
        const t1Athlete =
          futbolA.find((t) => t.teamId === team1.id)?.players[0] ??
          juvenil.find((t) => t.teamId === team1.id)?.players[0];
        const incident = await tx.eventIncident.create({
          data: {
            eventId: sampleEvents[1]!.eventId,
            athleteId: t1Athlete?.athleteId ?? null,
            clubId: team1.clubId,
            type: 'conducta_antideportiva',
            description:
              'Insultos reiterados a la terna arbitral al finalizar el primer tiempo (dato de demostración).',
            reportedById: refUser1.id,
          },
        });
        await tx.eventIncident.create({
          data: {
            eventId: sampleEvents[2]!.eventId,
            clubId: team2.clubId,
            type: 'invasion_campo',
            description:
              'Aficionados ingresaron a la cancha tras el pitazo final (dato de demostración).',
            reportedById: refUser2.id,
          },
        });
        const resolved = await tx.disciplinaryCase.create({
          data: {
            subject: 'Conducta antideportiva en la fecha 2',
            description:
              'Se investiga la conducta de un jugador durante el encuentro.',
            championshipId: ligaA.id,
            eventId: sampleEvents[1]!.eventId,
            clubId: team1.clubId,
            status: 'resuelto',
            reviewerId: disciplinaria.id,
            openedById: disciplinaria.id,
            resolution:
              'Se sanciona al jugador con dos partidos de suspensión por conducta antideportiva (demostración).',
            resolvedById: disciplinaria.id,
            resolvedAt: new Date(now.getTime() - 3 * 86_400_000),
            publicTitle:
              'Resolución sobre conducta antideportiva en la fecha 2',
            publicSummary:
              'La comisión disciplinaria resolvió sancionar con dos partidos de suspensión a un deportista por conducta antideportiva durante la fecha 2 del campeonato.',
            publishedAt: new Date(now.getTime() - 2 * 86_400_000),
            publishedById: disciplinaria.id,
          },
        });
        await tx.eventIncident.update({
          where: { id: incident.id },
          data: { caseId: resolved.id },
        });
        await entry(
          resolved.id,
          'apertura',
          'Expediente abierto (demostración).',
          disciplinaria.id,
        );
        await entry(
          resolved.id,
          'asignacion',
          'Revisor asignado: Verónica Allauca.',
          disciplinaria.id,
        );
        await entry(
          resolved.id,
          'decision',
          'Se sanciona al jugador con dos partidos de suspensión por conducta antideportiva (demostración).',
          disciplinaria.id,
        );
        await entry(
          resolved.id,
          'publicacion',
          'Resolución publicada en el portal.',
          disciplinaria.id,
        );
        if (t1Athlete) {
          await tx.sanction.create({
            data: {
              caseId: resolved.id,
              athleteId: t1Athlete.athleteId,
              championshipId: ligaA.id,
              type: 'suspension_partidos',
              matchesCount: 2,
              reason: 'Conducta antideportiva comprobada (demostración).',
              startsAt: new Date(
                Date.UTC(
                  now.getUTCFullYear(),
                  now.getUTCMonth(),
                  now.getUTCDate() - 3,
                ),
              ),
              createdById: disciplinaria.id,
            },
          });
        }
        await tx.sanction.create({
          data: {
            caseId: resolved.id,
            clubId: team1.clubId,
            type: 'multa',
            reason: 'Falta administrativa del club (demostración).',
            startsAt: new Date(
              Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() - 3,
              ),
            ),
            createdById: disciplinaria.id,
          },
        });

        // Reclamo de un club y expediente en revisión con descuento de puntos.
        const complaint = await tx.complaint.create({
          data: {
            championshipId: juv.id,
            clubId: juvenil[0]!.clubId,
            submittedById: (
              await tx.user.findFirstOrThrow({
                where: { email: `dirigente1@${DEMO_DOMAIN}` },
              })
            ).id,
            subject: 'Alineación indebida de un jugador del equipo rival',
            description:
              'El club solicita la revisión de la alineación de un jugador sin habilitación vigente (dato de demostración).',
            status: 'en_revision',
          },
        });
        const open = await tx.disciplinaryCase.create({
          data: {
            subject: 'Alineación indebida en el campeonato juvenil',
            description: 'Reclamo del club sobre la alineación de un jugador.',
            championshipId: juv.id,
            status: 'en_revision',
            reviewerId: disciplinaria.id,
            openedById: disciplinaria.id,
          },
        });
        await tx.complaint.update({
          where: { id: complaint.id },
          data: { caseId: open.id },
        });
        await entry(
          open.id,
          'apertura',
          'Expediente abierto a partir de un reclamo (demostración).',
          disciplinaria.id,
        );
        await entry(
          open.id,
          'asignacion',
          'Revisor asignado: Verónica Allauca.',
          disciplinaria.id,
        );
        await entry(
          open.id,
          'nota',
          'Se solicitó la nómina de buena fe del equipo rival.',
          disciplinaria.id,
        );
        await tx.sanction.create({
          data: {
            caseId: open.id,
            teamId: juvenil[1]!.teamId,
            championshipId: juv.id,
            type: 'descuento_puntos',
            points: 1,
            reason:
              'Descuento de un punto por alineación indebida (demostración).',
            startsAt: new Date(
              Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() - 1,
              ),
            ),
            createdById: disciplinaria.id,
          },
        });
        summary.cases += 2;
      }

      // ───────── Noticias e imágenes ─────────
      const media: string[] = [];
      for (const [idx, color] of (
        [
          [11, 61, 110],
          [15, 107, 50],
        ] as [number, number, number][]
      ).entries()) {
        const buffer = makePng(640, 320, color);
        const filename = `${randomBytes(16).toString('hex')}.png`;
        await writeFile(join(options.storageDir, filename), buffer);
        const file = await tx.storedFile.create({
          data: {
            filename,
            originalName: `portada-demo-${idx + 1}.png`,
            mimeType: 'image/png',
            sizeBytes: buffer.length,
            checksumSha256: createHash('sha256').update(buffer).digest('hex'),
            createdById: editor.id,
          },
        });
        const asset = await tx.mediaAsset.create({
          data: {
            fileId: file.id,
            altText:
              idx === 0
                ? 'Imagen de portada azul de demostración'
                : 'Imagen de portada verde de demostración',
            uploadedById: editor.id,
          },
        });
        media.push(asset.id);
      }
      const posts = [
        {
          kind: 'noticia' as const,
          title: 'Arrancó el campeonato de fútbol Liga A',
          summary:
            'Ocho equipos del cantón disputan la temporada con partidos cada fin de semana.',
          content:
            'Con la participación de ocho equipos de las parroquias del cantón, la Liga dio inicio al campeonato de fútbol Liga A.\n\nLos partidos se juegan los sábados en el Estadio Cantonal y en la cancha de Rumipamba. Los resultados oficiales se publican en este portal una vez aprobada el acta.',
          status: 'publicado' as const,
          cover: media[0],
          ago: 20,
        },
        {
          kind: 'comunicado' as const,
          title: 'Calendario de la fecha 5 y designaciones arbitrales',
          summary:
            'La comisión técnica publicó los horarios de la próxima jornada.',
          content:
            'La comisión técnica informa que la fecha 5 se jugará según el calendario publicado en el portal.\n\nSe recuerda a los clubes presentar la nómina de buena fe antes de cada encuentro.',
          status: 'publicado' as const,
          cover: null,
          ago: 4,
        },
        {
          kind: 'noticia' as const,
          title: 'Torneo de taekwondo juvenil: ya hay semifinalistas',
          summary:
            'Los cuartos de final dejaron cuatro combatientes clasificados.',
          content:
            'Terminaron los cuartos de final del torneo de taekwondo juvenil en el Gimnasio de Artes Marciales.\n\nLas semifinales se disputarán la próxima semana.',
          status: 'publicado' as const,
          cover: media[1],
          ago: 8,
        },
        {
          kind: 'noticia' as const,
          title: 'Borrador: inscripciones del torneo de básquet femenino',
          summary:
            'Borrador sin publicar, solo visible en el panel de administración.',
          content:
            'Este texto es un borrador de demostración para probar el flujo de publicación.',
          status: 'borrador' as const,
          cover: null,
          ago: 0,
        },
      ];
      for (const p of posts) {
        await tx.announcement.create({
          data: {
            kind: p.kind,
            title: p.title,
            slug: slugify(p.title).slice(0, 80),
            summary: p.summary,
            content: p.content,
            status: p.status,
            publishedAt:
              p.status === 'publicado'
                ? new Date(now.getTime() - p.ago * 86_400_000)
                : null,
            authorId: editor.id,
            coverId: p.cover ?? null,
          },
        });
        summary.announcements++;
      }

      await tx.auditLog.create({
        data: {
          action: 'seed.demo_loaded',
          entityType: 'system',
          afterSnapshot: {
            clubs: summary.clubs,
            athletes: summary.athletes,
            championships: summary.championships,
            matches: summary.matches,
          },
          reason: 'Carga de datos de demostración (npm run db:seed:demo)',
        },
      });
    },
    { timeout: 600_000, maxWait: 30_000 },
  );

  return summary;
}
