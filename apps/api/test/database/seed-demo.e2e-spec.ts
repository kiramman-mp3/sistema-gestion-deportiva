import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  deactivateDemoUsers,
  DEMO_DOMAIN,
  isDemoLoaded,
  roundRobin,
  seedDemo,
  type DemoSummary,
} from '../../src/database/seed-demo.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, TEST_ORIGIN, type TestApp } from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import { authed, login } from '../support/fixtures.js';

const PASSWORD = 'demostracion-segura-2026';

describe('datos de demostración', () => {
  let prisma: PrismaClient;
  let t: TestApp;
  let storage: string;
  let summary: DemoSummary;

  beforeAll(async () => {
    prisma = createTestPrisma();
    storage = await mkdtemp(join(tmpdir(), 'liga-demo-'));
    t = await createTestApp({ env: { STORAGE_PATH: storage } });
    await resetDatabase(prisma);
    summary = await seedDemo(prisma, {
      password: PASSWORD,
      storageDir: storage,
    });
  }, 180_000);

  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
    await rm(storage, { recursive: true, force: true });
  });

  it('carga una liga completa y coherente', async () => {
    expect(summary).toMatchObject({
      clubs: 12,
      championships: 5,
      officials: 8,
      cases: 2,
      announcements: 4,
    });
    expect(summary.athletes).toBeGreaterThan(200);
    expect(summary.matches).toBeGreaterThan(60);
    expect(summary.playedMatches).toBeGreaterThan(20);

    expect(await prisma.club.count()).toBe(12);
    expect(await prisma.athlete.count()).toBe(summary.athletes);
    expect(await prisma.event.count()).toBe(summary.matches);
    expect(await prisma.event.count({ where: { status: 'finalizado' } })).toBe(
      summary.playedMatches,
    );
    // Todo partido jugado tiene su acta aprobada y su revisión.
    expect(await prisma.result.count({ where: { status: 'aprobado' } })).toBe(
      summary.playedMatches,
    );
    // Los 4 deportes oficiales.
    const sports = await prisma.sport.findMany({
      where: { championships: { some: {} } },
      select: { code: true },
    });
    expect(sports.map((s) => s.code).sort()).toEqual([
      'ajedrez',
      'basquet',
      'futbol',
      'taekwondo',
    ]);
  });

  it('todo es ficticio y reconocible como demostración', async () => {
    const emails = (await prisma.user.findMany()).map((u) => u.email);
    expect(emails.length).toBe(summary.accounts.length);
    expect(emails.every((e) => e.endsWith(`@${DEMO_DOMAIN}`))).toBe(true);
    const ids = await prisma.personPrivateData.findMany({
      where: { idType: { not: null } },
      select: { idNumber: true, idType: true },
    });
    expect(
      ids.every(
        (i) => i.idType === 'otro' && /^DEMO-\d{5}$/.test(i.idNumber ?? ''),
      ),
    ).toBe(true);
    expect(
      (await prisma.club.findMany({ select: { code: true } })).every((c) =>
        /^DEMO-\d{2}$/.test(c.code ?? ''),
      ),
    ).toBe(true);
    // Hay menores y adultos, con tutor en los menores.
    const minors = await prisma.personPrivateData.count({
      where: { guardianName: { not: null } },
    });
    expect(minors).toBeGreaterThan(50);
  });

  it('se niega a cargarse dos veces y no duplica datos', async () => {
    expect(await isDemoLoaded(prisma)).toBe(true);
    const before = await prisma.athlete.count();
    await expect(
      seedDemo(prisma, { password: PASSWORD, storageDir: storage }),
    ).rejects.toThrow(/ya están cargados/);
    expect(await prisma.athlete.count()).toBe(before);
  });

  it('exige una contraseña de al menos 12 caracteres', async () => {
    await expect(
      seedDemo(prisma, { password: 'corta', storageDir: storage }),
    ).rejects.toThrow(/al menos 12/);
  });

  it('las cuentas de prueba entran con la contraseña indicada y solo ven lo de su rol', async () => {
    const leader = await login(t, `dirigente1@${DEMO_DOMAIN}`, PASSWORD);
    const asLeader = authed(t, leader);
    const clubs = await asLeader.get('/api/clubs').expect(200);
    expect(clubs.body.total).toBe(1);
    await asLeader.get('/api/audit-logs').expect(403);
    await asLeader.get('/api/users').expect(403);

    const commission = await login(
      t,
      `comision.tecnica@${DEMO_DOMAIN}`,
      PASSWORD,
    );
    const championships = await authed(t, commission)
      .get('/api/championships')
      .expect(200);
    expect(championships.body.total).toBe(5);

    const referee = await login(t, `arbitro1@${DEMO_DOMAIN}`, PASSWORD);
    const mine = await authed(t, referee)
      .get('/api/assignments/mine?scope=todas')
      .expect(200);
    expect(mine.body).toMatchObject({ linked: true });
    expect(mine.body.total).toBeGreaterThan(0);
  });

  it('las tablas de posiciones se calculan, con el descuento de puntos del expediente abierto', async () => {
    const juvenil = await prisma.championship.findFirstOrThrow({
      where: { name: 'Campeonato de Fútbol Juvenil' },
    });
    const commission = await login(
      t,
      `comision.tecnica@${DEMO_DOMAIN}`,
      PASSWORD,
    );
    const standings = await authed(t, commission)
      .get(`/api/championships/${juvenil.id}/standings`)
      .expect(200);
    expect(standings.body.standings).toHaveLength(6);
    const played = (standings.body.standings as { played: number }[]).reduce(
      (s, r) => s + r.played,
      0,
    );
    expect(played).toBe(6 * 3); // 3 jornadas jugadas, 6 equipos
    expect(
      standings.body.standings.some(
        (r: { pointsDeducted?: number }) => r.pointsDeducted === 1,
      ),
    ).toBe(true);

    const league = await prisma.championship.findFirstOrThrow({
      where: { name: 'Campeonato de Fútbol Liga A' },
    });
    const table = await authed(t, commission)
      .get(`/api/championships/${league.id}/standings`)
      .expect(200);
    expect(table.body.standings).toHaveLength(8);
    const positions = table.body.standings.map(
      (r: { position: number }) => r.position,
    );
    expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('el portal público muestra datos reales sin exponer menores', async () => {
    const home = await t.http().get('/api/public/home').expect(200);
    expect(home.body.news.length).toBeGreaterThanOrEqual(3);
    expect(home.body.upcoming.length).toBeGreaterThan(0);
    expect(home.body.recent.length).toBeGreaterThan(0);

    // El torneo de taekwondo es de adolescentes: se nombran por código.
    const tkd = await prisma.championship.findFirstOrThrow({
      where: { name: 'Torneo de Taekwondo Juvenil' },
    });
    const events = await t
      .http()
      .get(`/api/public/events?championshipId=${tkd.id}&pageSize=50`)
      .expect(200);
    const names = events.body.items.flatMap(
      (e: { participants: { name: string }[] }) =>
        e.participants.map((p) => p.name),
    );
    expect(names.length).toBeGreaterThan(8);
    const nonCode = names.filter(
      (n: string) => !/^Deportista DEP-\d{6}$/.test(n),
    );
    // Solo pueden aparecer por nombre los menores con perfil público y consentimiento vigente.
    const consented = await prisma.athlete.count({
      where: {
        publicProfile: true,
        person: { consents: { some: { type: 'publicacion_perfil' } } },
      },
    });
    expect(nonCode.length).toBeLessThanOrEqual(consented * 4);

    // Los borradores no se publican y el sistema de resoluciones está apagado por defecto.
    const news = await t.http().get('/api/public/announcements').expect(200);
    expect(
      news.body.items.map((n: { title: string }) => n.title).join(),
    ).not.toContain('Borrador');
    await t.http().get('/api/public/resolutions').expect(404);
  });

  it('las imágenes de ejemplo existen en el almacenamiento y se sirven', async () => {
    expect((await readdir(storage)).length).toBe(2);
    const covers = await t.http().get('/api/public/announcements').expect(200);
    const withCover = covers.body.items.find(
      (n: { cover: unknown }) => n.cover,
    );
    const image = await t
      .http()
      .get(`/api/public/media/${withCover.cover.id}`)
      .expect(200);
    expect(image.headers['content-type']).toBe('image/png');
  });

  it('los árbitros no quedan con designaciones traslapadas', async () => {
    const rows = await prisma.eventAssignment.findMany({
      include: { event: { select: { scheduledAt: true } } },
      orderBy: { officialId: 'asc' },
    });
    expect(rows.length).toBeGreaterThan(10);
    const byOfficial = new Map<string, number[]>();
    for (const r of rows) {
      const list = byOfficial.get(r.officialId) ?? [];
      list.push(r.event.scheduledAt!.getTime());
      byOfficial.set(r.officialId, list);
    }
    for (const times of byOfficial.values()) {
      const sorted = [...times].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(90 * 60_000);
      }
    }
  });

  it('desactivar las cuentas de prueba cierra sus sesiones y conserva los datos', async () => {
    const session = await login(t, `secretaria@${DEMO_DOMAIN}`, PASSWORD);
    await authed(t, session).get('/api/clubs').expect(200);
    const count = await deactivateDemoUsers(prisma);
    expect(count).toBe(summary.accounts.length);
    await authed(t, session).get('/api/clubs').expect(401);
    await t
      .http()
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email: `secretaria@${DEMO_DOMAIN}`, password: PASSWORD })
      .expect(401);
    expect(await prisma.club.count()).toBe(12);
    expect(await deactivateDemoUsers(prisma)).toBe(0);
  });
});

describe('calendario todos contra todos', () => {
  it.each([4, 6, 8, 10])(
    'con %i equipos cada uno juega una vez contra cada rival',
    (n) => {
      const rounds = roundRobin(n);
      expect(rounds).toHaveLength(n - 1);
      const seen = new Set<string>();
      for (const round of rounds) {
        expect(round).toHaveLength(n / 2);
        const inRound = new Set<number>();
        for (const [a, b] of round) {
          expect(inRound.has(a) || inRound.has(b)).toBe(false);
          inRound.add(a).add(b);
          const key = [a, b].sort((x, y) => x - y).join('-');
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
      expect(seen.size).toBe((n * (n - 1)) / 2);
    },
  );
});
