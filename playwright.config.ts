import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

try {
  process.loadEnvFile(resolve(import.meta.dirname, '.env'));
} catch {
  // En CI las variables ya vienen definidas.
}

// Puertos propios para no chocar con los servidores de desarrollo (3000 y 5173).
const API_PORT = 3100;
const WEB_PORT = 5183;
const WEB_URL = `http://localhost:${WEB_PORT}`;

// La base se prepara con `e2e/prepare.mjs` (npm run test:e2e). Debe coincidir con E2E_DB.
const dbUrl = new URL(
  process.env.DATABASE_URL ?? 'postgresql://liga:liga@localhost:5434/x',
);
dbUrl.pathname = '/liga_quero_e2e';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // Las pruebas comparten una base de datos y cuentan una historia: se ejecutan en orden.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: WEB_URL,
    locale: 'es-EC',
    timezoneId: 'America/Guayaquil',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // En equipos sin Chromium de Playwright: E2E_BROWSER=chrome (o msedge).
        channel: process.env.E2E_BROWSER || undefined,
      },
    },
  ],
  webServer: [
    {
      command: 'node apps/api/dist/main.js',
      url: `http://localhost:${API_PORT}/api/health/ready`,
      timeout: 90_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'development',
        API_PORT: String(API_PORT),
        WEB_ORIGIN: WEB_URL,
        DATABASE_URL: dbUrl.toString(),
        SECURITY_HASH_KEY: 'e2e-only-hash-key-not-a-real-secret-0123456789',
        STORAGE_PATH: resolve(import.meta.dirname, 'e2e/.storage'),
        TRUST_PROXY: '0',
      },
    },
    {
      command: `npm run dev -w @liga/web -- --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      timeout: 90_000,
      reuseExistingServer: false,
      env: { API_PORT: String(API_PORT) },
    },
  ],
});
