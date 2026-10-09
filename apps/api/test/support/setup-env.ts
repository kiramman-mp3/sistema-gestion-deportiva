import { getTestDatabaseUrl } from './test-database.js';

// Cada archivo de prueba trabaja siempre contra la base de pruebas: así ningún
// código bajo prueba (PrismaService, loadEnv…) puede alcanzar DATABASE_URL.
process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.NODE_ENV = 'test';
// Clave fija solo para pruebas; no es un secreto real.
process.env.SECURITY_HASH_KEY = 'test-only-hash-key-0123456789-abcdefghij';
