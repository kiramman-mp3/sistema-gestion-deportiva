import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Si 5173 está ocupado, fallar en lugar de saltar a otro puerto: la API solo
    // acepta el origen de WEB_ORIGIN y rechazaría el login con 403 «Origen no permitido».
    strictPort: true,
    // En desarrollo, las llamadas a /api se reenvían a la API local.
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT ?? 3000}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
