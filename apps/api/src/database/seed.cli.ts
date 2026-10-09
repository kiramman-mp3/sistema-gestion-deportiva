import { loadRootDotenv } from '../config/dotenv.js';
import { loadEnv } from '../config/env.js';
import { createPrismaClient } from './prisma-client.js';
import { seedAuthorization } from './seed.js';

loadRootDotenv();
const prisma = createPrismaClient(loadEnv().DATABASE_URL);
try {
  await seedAuthorization(prisma);
  console.log('Catálogo de permisos y rol superadmin sincronizados.');
} finally {
  await prisma.$disconnect();
}
