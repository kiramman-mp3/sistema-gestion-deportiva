import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * Valores PROVISIONALES de la Liga (docs/requirements.md §2 y decisión D-44): deportes,
 * categorías y rangos de edad. La Liga aún debe confirmarlos, por eso son solo un punto
 * de partida: se crean si NO existen y nunca se sobrescriben, de modo que lo que se
 * edite desde el sistema permanece. No se ejecuta de forma automática.
 */
export const PROVISIONAL_SPORTS = [
  { code: 'futbol', name: 'Fútbol' },
  { code: 'basquet', name: 'Básquet' },
  { code: 'taekwondo', name: 'Taekwondo' },
  { code: 'ajedrez', name: 'Ajedrez' },
] as const;

export const PROVISIONAL_CATEGORIES = [
  { code: 'ninos', name: 'Niños', ageMin: 6, ageMax: 13, sortOrder: 10 },
  { code: 'juvenil', name: 'Juvenil', ageMin: 14, ageMax: 17, sortOrder: 20 },
  { code: 'liga_d', name: 'Liga D', ageMin: 18, ageMax: null, sortOrder: 30 },
  { code: 'liga_c', name: 'Liga C', ageMin: 18, ageMax: null, sortOrder: 40 },
  { code: 'liga_b', name: 'Liga B', ageMin: 18, ageMax: null, sortOrder: 50 },
  { code: 'liga_a', name: 'Liga A', ageMin: 18, ageMax: null, sortOrder: 60 },
] as const;

export async function seedProvisionalCatalogs(
  prisma: PrismaClient,
): Promise<{ sports: number; categories: number }> {
  let sports = 0;
  let categories = 0;
  await prisma.$transaction(async (tx) => {
    for (const sport of PROVISIONAL_SPORTS) {
      const exists = await tx.sport.findFirst({
        where: { OR: [{ code: sport.code }, { name: sport.name }] },
        select: { id: true },
      });
      if (!exists) {
        await tx.sport.create({ data: sport });
        sports++;
      }
    }
    for (const category of PROVISIONAL_CATEGORIES) {
      const exists = await tx.category.findFirst({
        where: { OR: [{ code: category.code }, { name: category.name }] },
        select: { id: true },
      });
      if (!exists) {
        await tx.category.create({ data: category });
        categories++;
      }
    }
  });
  return { sports, categories };
}
