import { expect, test, type Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { ACCOUNTS, goToSection, login, logout } from './support.ts';

function checkA11y(page: Page) {
  return new AxeBuilder({ page: page as never }).analyze();
}

test.describe('accesibilidad web (axe-core)', () => {
  test.describe('portal público', () => {
    test('la portada del portal (#/portal) cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await page.goto('/#/portal');
      await expect(
        page.getByRole('heading', {
          name: 'Liga Deportiva Cantonal de Quero',
          level: 1,
        }),
      ).toBeVisible();

      const results = await checkA11y(page);
      expect(results.violations).toEqual([]);
    });

    test('la página de noticias (#/portal/noticias) cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await page.goto('/#/portal/noticias');
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: 'Noticias y comunicados',
        }),
      ).toBeVisible();

      const results = await checkA11y(page);
      expect(results.violations).toEqual([]);
    });

    test('el calendario (#/portal/calendario) cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await page.goto('/#/portal/calendario');
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: 'Calendario de partidos',
        }),
      ).toBeVisible();

      const results = await checkA11y(page);
      expect(results.violations).toEqual([]);
    });

    test('la verificación pública (#/portal/verificar) cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await page.goto('/#/portal/verificar');
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: 'Verificar un documento',
        }),
      ).toBeVisible();

      const results = await checkA11y(page);
      expect(results.violations).toEqual([]);
    });

    test('la página institucional (#/portal/liga) cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await page.goto('/#/portal/liga');
      await expect(
        page.getByRole('heading', {
          level: 2,
          name: 'Contacto',
        }),
      ).toBeVisible();

      const results = await checkA11y(page);
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

      const results = await checkA11y(page);
      expect(results.violations).toEqual([]);
    });

    test('la sección de campeonatos en el panel cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await login(page, ACCOUNTS.admin);
      await goToSection(page, 'Campeonatos');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Campeonatos' }),
      ).toBeVisible();

      const results = await checkA11y(page);
      expect(results.violations).toEqual([]);
      await logout(page);
    });

    test('la sección de deportistas en el panel cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await login(page, ACCOUNTS.admin);
      await goToSection(page, 'Deportistas');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Deportistas' }),
      ).toBeVisible();

      const results = await checkA11y(page);
      expect(results.violations).toEqual([]);
      await logout(page);
    });

    test('la sección de notificaciones en el panel cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await login(page, ACCOUNTS.admin);
      await goToSection(page, 'Notificaciones');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Notificaciones' }),
      ).toBeVisible();

      const results = await checkA11y(page);
      expect(results.violations).toEqual([]);
      await logout(page);
    });

    test('las rutas principales tienen exactamente un h1 y no hay encabezados h1 duplicados', async ({
      page,
    }) => {
      // Portal
      await page.goto('/#/portal');
      await expect(page.locator('h1')).toHaveCount(1);

      await page.goto('/#/portal/noticias');
      await expect(page.locator('h1')).toHaveCount(1);

      await page.goto('/#/portal/calendario');
      await expect(page.locator('h1')).toHaveCount(1);

      await page.goto('/#/portal/verificar');
      await expect(page.locator('h1')).toHaveCount(1);

      // Login
      await page.goto('/#/');
      await expect(page.locator('h1')).toHaveCount(1);

      // Panel con sesión
      await login(page, ACCOUNTS.admin);
      await expect(page.locator('h1')).toHaveCount(1);

      await goToSection(page, 'Campeonatos');
      await expect(page.locator('h1')).toHaveCount(1);

      await goToSection(page, 'Deportistas');
      await expect(page.locator('h1')).toHaveCount(1);

      await goToSection(page, 'Notificaciones');
      await expect(page.locator('h1')).toHaveCount(1);

      await logout(page);
    });

    test('el menú móvil a 375 px abre el panel lateral y navega a una sección', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await login(page, ACCOUNTS.admin);
      await expect(page.locator('h1')).toHaveCount(1);

      const menuBtn = page.getByRole('button', { name: 'Menú' });
      await expect(menuBtn).toBeVisible();
      await menuBtn.click();

      const drawer = page.getByRole('dialog', { name: 'Secciones de la Liga' });
      await expect(drawer).toBeVisible();

      await drawer.getByRole('link', { name: 'Campeonatos' }).click();

      await expect(
        page.getByRole('heading', { level: 1, name: 'Campeonatos' }),
      ).toBeVisible();
      await expect(drawer).not.toBeVisible();
      await logout(page);
    });
  });

  test.describe('modo oscuro (colorScheme: "dark")', () => {
    test.use({ colorScheme: 'dark' });

    test.describe('portal público', () => {
      test('la portada del portal (#/portal) cumple las pautas en modo oscuro', async ({
        page,
      }) => {
        await page.goto('/#/portal');
        await expect(
          page.getByRole('heading', {
            name: 'Liga Deportiva Cantonal de Quero',
            level: 1,
          }),
        ).toBeVisible();

        const results = await checkA11y(page);
        expect(results.violations).toEqual([]);
      });

      test('la página de noticias (#/portal/noticias) cumple las pautas en modo oscuro', async ({
        page,
      }) => {
        await page.goto('/#/portal/noticias');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: 'Noticias y comunicados',
          }),
        ).toBeVisible();

        const results = await checkA11y(page);
        expect(results.violations).toEqual([]);
      });

      test('el calendario (#/portal/calendario) cumple las pautas en modo oscuro', async ({
        page,
      }) => {
        await page.goto('/#/portal/calendario');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: 'Calendario de partidos',
          }),
        ).toBeVisible();

        const results = await checkA11y(page);
        expect(results.violations).toEqual([]);
      });

      test('la verificación pública (#/portal/verificar) cumple las pautas en modo oscuro', async ({
        page,
      }) => {
        await page.goto('/#/portal/verificar');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: 'Verificar un documento',
          }),
        ).toBeVisible();

        const results = await checkA11y(page);
        expect(results.violations).toEqual([]);
      });

      test('la página institucional (#/portal/liga) cumple las pautas en modo oscuro', async ({
        page,
      }) => {
        await page.goto('/#/portal/liga');
        await expect(
          page.getByRole('heading', {
            level: 2,
            name: 'Contacto',
          }),
        ).toBeVisible();

        const results = await checkA11y(page);
        expect(results.violations).toEqual([]);
      });

      test('la página de competencias (#/portal/competencias) cumple las pautas en modo oscuro', async ({
        page,
      }) => {
        await page.goto('/#/portal/competencias');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: 'Competencias',
          }),
        ).toBeVisible();

        const results = await checkA11y(page);
        expect(results.violations).toEqual([]);
      });
    });

    test.describe('panel de administración', () => {
      test('la pantalla de inicio de sesión (#/) cumple las pautas en modo oscuro', async ({
        page,
      }) => {
        await page.goto('/#/');
        await expect(
          page.getByRole('heading', { name: 'Iniciar sesión' }),
        ).toBeVisible();

        const results = await checkA11y(page);
        expect(results.violations).toEqual([]);
      });

      test('la sección de campeonatos en el panel cumple las pautas en modo oscuro', async ({
        page,
      }) => {
        await login(page, ACCOUNTS.admin);
        await goToSection(page, 'Campeonatos');
        await expect(
          page.getByRole('heading', { level: 1, name: 'Campeonatos' }),
        ).toBeVisible();

        const results = await checkA11y(page);
        expect(results.violations).toEqual([]);
        await logout(page);
      });

      test('la sección de deportistas en el panel cumple las pautas en modo oscuro', async ({
        page,
      }) => {
        await login(page, ACCOUNTS.admin);
        await goToSection(page, 'Deportistas');
        await expect(
          page.getByRole('heading', { level: 1, name: 'Deportistas' }),
        ).toBeVisible();

        const results = await checkA11y(page);
        expect(results.violations).toEqual([]);
        await logout(page);
      });

      test('la sección de notificaciones en el panel cumple las pautas en modo oscuro', async ({
        page,
      }) => {
        await login(page, ACCOUNTS.admin);
        await goToSection(page, 'Notificaciones');
        await expect(
          page.getByRole('heading', { level: 1, name: 'Notificaciones' }),
        ).toBeVisible();

        const results = await checkA11y(page);
        expect(results.violations).toEqual([]);
        await logout(page);
      });
    });
  });
});
