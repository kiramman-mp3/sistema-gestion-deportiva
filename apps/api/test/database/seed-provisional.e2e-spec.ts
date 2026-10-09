import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  PROVISIONAL_CATEGORIES,
  PROVISIONAL_SPORTS,
  seedProvisionalCatalogs,
} from '../../src/database/seed-provisional.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';

describe('valores provisionales de la Liga', () => {
  let prisma: PrismaClient;
  beforeAll(() => {
    prisma = createTestPrisma();
  });
  beforeEach(() => resetDatabase(prisma));
  afterAll(() => prisma.$disconnect());

  it('crea deportes y categorías que cumplen las reglas de la base de datos', async () => {
    const created = await seedProvisionalCatalogs(prisma);
    expect(created).toEqual({
      sports: PROVISIONAL_SPORTS.length,
      categories: PROVISIONAL_CATEGORIES.length,
    });
  });

  it('es idempotente y no sobrescribe lo que la Liga haya editado', async () => {
    await seedProvisionalCatalogs(prisma);
    await prisma.category.update({
      where: { code: 'juvenil' },
      data: { ageMin: 15, ageMax: 19 },
    });
    await prisma.sport.update({
      where: { code: 'futbol' },
      data: { name: 'Fútbol de salón' },
    });

    expect(await seedProvisionalCatalogs(prisma)).toEqual({
      sports: 0,
      categories: 0,
    });
    const juvenil = await prisma.category.findUniqueOrThrow({
      where: { code: 'juvenil' },
    });
    expect([juvenil.ageMin, juvenil.ageMax]).toEqual([15, 19]);
    expect(
      (await prisma.sport.findUniqueOrThrow({ where: { code: 'futbol' } }))
        .name,
    ).toBe('Fútbol de salón');
    expect(await prisma.sport.count()).toBe(PROVISIONAL_SPORTS.length);
  });
});
