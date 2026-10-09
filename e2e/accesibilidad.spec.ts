import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ACCOUNTS, goToSection, login, logout } from './support.ts';

test.describe('accesibilidad web (axe-core)', () => {
  test.describe('portal público', () => {
    test('la portada del portal (#/portal) cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await page.goto('/#/portal');
      await expect(
        page.getByRole('heading', {
          name: 'Liga Deportiva Cantonal de Quero',
          level: 2,
        }),
      ).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });

    test('la página de noticias (#/portal/noticias) cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await page.goto('/#/portal/noticias');
      await expect(
        page.getByRole('heading', {
          level: 3,
          name: 'Noticias y comunicados',
        }),
      ).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });

    test('el calendario (#/portal/calendario) cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await page.goto('/#/portal/calendario');
      await expect(
        page.getByRole('heading', {
          level: 3,
          name: 'Calendario de partidos',
        }),
      ).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });

    test('la verificación pública (#/portal/verificar) cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await page.goto('/#/portal/verificar');
      await expect(
        page.getByRole('heading', {
          level: 3,
          name: 'Verificar un documento',
        }),
      ).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });

    test('la página institucional (#/portal/liga) cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await page.goto('/#/portal/liga');
      await expect(
        page.getByRole('heading', {
          level: 3,
          name: 'Contacto',
        }),
      ).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  });

  test.describe('panel de administración', () => {
    test('la pantalla de inicio de sesión (#/) cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await page.goto('/#/');
      await expect(
        page.getByRole('heading', { name: 'Iniciar sesión' }),
      ).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });

    test('la sección de campeonatos en el panel cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await login(page, ACCOUNTS.admin);
      await goToSection(page, 'Campeonatos');
      await expect(
        page.getByRole('heading', { level: 2, name: 'Campeonatos' }),
      ).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
      await logout(page);
    });

    test('la sección de deportistas en el panel cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await login(page, ACCOUNTS.admin);
      await goToSection(page, 'Deportistas');
      await expect(
        page.getByRole('heading', { level: 2, name: 'Deportistas' }),
      ).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
      await logout(page);
    });

    test('la sección de notificaciones en el panel cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await login(page, ACCOUNTS.admin);
      await goToSection(page, 'Notificaciones');
      await expect(
        page.getByRole('heading', { level: 2, name: 'Notificaciones' }),
      ).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
      await logout(page);
    });
  });
});
