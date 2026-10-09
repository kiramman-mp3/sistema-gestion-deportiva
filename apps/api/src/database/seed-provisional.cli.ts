import { loadRootDotenv } from '../config/dotenv.js';
import { loadEnv } from '../config/env.js';
import { createPrismaClient } from './prisma-client.js';
import { seedProvisionalCatalogs } from './seed-provisional.js';

loadRootDotenv();
const prisma = createPrismaClient(loadEnv().DATABASE_URL);
try {
  const created = await seedProvisionalCatalogs(prisma);
  console.log(
    `Valores provisionales creados: ${created.sports} deportes, ${created.categories} categorías (los existentes no se modifican).`,
  );
} finally {
  await prisma.$disconnect();
}
