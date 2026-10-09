import { getTestDatabaseUrl } from './test-database.js';

// Cada archivo de prueba trabaja siempre contra la base de pruebas: así ningún
// código bajo prueba (PrismaService, loadEnv…) puede alcanzar DATABASE_URL.
process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.NODE_ENV = 'test';
