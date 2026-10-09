import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, dbFailure, resetDatabase } from '../support/db.js';

describe('deportes, categorías y temporadas', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('deportes', () => {
    it('exige código y nombre únicos', async () => {
      await prisma.sport.create({ data: { code: 'futbol', name: 'Fútbol' } });
      const dupCode = await dbFailure(
        prisma.sport.create({ data: { code: 'futbol', name: 'Otro' } }),
      );
      expect(dupCode.message).toContain('sports_code_key');
      const dupName = await dbFailure(
        prisma.sport.create({ data: { code: 'otro', name: 'Fútbol' } }),
      );
      expect(dupName.message).toContain('sports_name_key');
    });

    it('valida el formato del código y el nombre', async () => {
      const badCode = await dbFailure(
        prisma.sport.create({ data: { code: 'Fútbol!', name: 'X' } }),
      );
      expect(badCode.message).toContain('sports_code_format_chk');
      const blank = await dbFailure(
        prisma.sport.create({ data: { code: 'x', name: ' ' } }),
      );
      expect(blank.message).toContain('sports_name_chk');
    });

    it('se desactiva sin perder el registro', async () => {
      const sport = await prisma.sport.create({
        data: { code: 'ajedrez', name: 'Ajedrez' },
      });
      expect(sport.status).toBe('activo');
      const updated = await prisma.sport.update({
        where: { id: sport.id },
        data: { status: 'inactivo' },
      });
      expect(updated.status).toBe('inactivo');
      expect(await prisma.sport.count()).toBe(1);
    });
  });

  describe('categorías', () => {
    it('no asume reglas: la edad es opcional y el orden configurable', async () => {
      const category = await prisma.category.create({
        data: { code: 'liga_a', name: 'Liga A' },
      });
      expect(category).toMatchObject({
        ageMin: null,
        ageMax: null,
        sortOrder: 0,
        status: 'activo',
      });
    });

    it('acepta rangos de edad coherentes y rechaza los incoherentes', async () => {
      await prisma.category.create({
        data: { code: 'a', name: 'A', ageMin: 10, ageMax: 12 },
      });
      await prisma.category.create({
        data: { code: 'b', name: 'B', ageMin: 18 },
      });
      await prisma.category.create({
        data: { code: 'c', name: 'C', ageMax: 8 },
      });

      for (const data of [
        { code: 'd', name: 'D', ageMin: 15, ageMax: 10 },
        { code: 'e', name: 'E', ageMin: -1 },
        { code: 'f', name: 'F', ageMax: 200 },
      ]) {
        const failure = await dbFailure(prisma.category.create({ data }));
        expect(failure.sqlState).toBe('23514');
        expect(failure.message).toContain('categories_age_range_chk');
      }
    });

    it('exige código y nombre únicos', async () => {
      await prisma.category.create({
        data: { code: 'juvenil', name: 'Juvenil' },
      });
      expect(
        (
          await dbFailure(
            prisma.category.create({ data: { code: 'juvenil', name: 'Otra' } }),
          )
        ).sqlState,
      ).toBe('23505');
      expect(
        (
          await dbFailure(
            prisma.category.create({ data: { code: 'otra', name: 'Juvenil' } }),
          )
        ).sqlState,
      ).toBe('23505');
    });
  });

  describe('temporadas', () => {
    const season = (overrides: Record<string, unknown> = {}) => ({
      name: 'Temporada 2026',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-11-30'),
      ...overrides,
    });

    it('nace en borrador y conserva las fechas de calendario sin desplazamientos de zona horaria', async () => {
      const created = await prisma.season.create({ data: season() });
      expect(created.status).toBe('borrador');
      const [row] = await prisma.$queryRaw<
        { start_date: string; end_date: string }[]
      >`SELECT start_date::text, end_date::text FROM seasons WHERE id = ${created.id}::uuid`;
      expect(row).toEqual({ start_date: '2026-03-01', end_date: '2026-11-30' });
    });

    it('rechaza fechas incoherentes (fin igual o anterior al inicio)', async () => {
      for (const endDate of [new Date('2026-03-01'), new Date('2026-02-01')]) {
        const failure = await dbFailure(
          prisma.season.create({ data: season({ endDate }) }),
        );
        expect(failure.sqlState).toBe('23514');
        expect(failure.message).toContain('seasons_dates_chk');
      }
    });

    it('exige nombre único y permite recorrer los estados', async () => {
      const created = await prisma.season.create({ data: season() });
      expect(
        (await dbFailure(prisma.season.create({ data: season() }))).message,
      ).toContain('seasons_name_key');

      for (const status of ['activa', 'finalizada', 'archivada'] as const) {
        const updated = await prisma.season.update({
          where: { id: created.id },
          data: { status },
        });
        expect(updated.status).toBe(status);
      }
    });
  });
});
