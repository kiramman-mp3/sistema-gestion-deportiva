import { defineConfig } from 'vitest/config';

// Pruebas que requieren PostgreSQL real (base de datos *_test aislada).
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.int-spec.ts', 'test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/support/global-setup.ts'],
    setupFiles: ['./test/support/setup-env.ts'],
    // Todas las pruebas comparten una base de datos: no se ejecutan en paralelo.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
