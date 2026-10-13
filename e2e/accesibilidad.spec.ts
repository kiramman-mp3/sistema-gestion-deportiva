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
    test('la pantalla de inicio de sesión (#/ingresar) cumple las pautas de accesibilidad', async ({
      page,
    }) => {
      await page.goto('/#/ingresar');
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
      await page.goto('/#/ingresar');
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
      test('la pantalla de inicio de sesión (#/ingresar) cumple las pautas en modo oscuro', async ({
        page,
      }) => {
        await page.goto('/#/ingresar');
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

/** Saltos de nivel entre encabezados visibles (p. ej. h1 → h3). */
async function headingJumps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(
      (h) => (h as HTMLElement).offsetParent !== null,
    );
    const jumps: string[] = [];
    for (let i = 1; i < hs.length; i++) {
      const prev = Number(hs[i - 1]!.tagName[1]);
      const cur = Number(hs[i]!.tagName[1]);
      if (cur > prev + 1)
        jumps.push(
          `${hs[i - 1]!.tagName}→${hs[i]!.tagName} «${hs[i]!.textContent?.trim()}»`,
        );
    }
    return jumps;
  });
}

async function firstId(page: Page, path: string): Promise<string> {
  const res = await page.request.get(`/api${path}`);
  const { items } = (await res.json()) as { items: { id: string }[] };
  return items[0]!.id;
}

test.describe('accesibilidad en móvil y estructura de encabezados', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`a 375 px (${colorScheme})`, () => {
      test.use({ viewport: { width: 375, height: 800 }, colorScheme });

      test('las páginas del portal cumplen las pautas', async ({ page }) => {
        const champ = await firstId(page, '/public/championships');
        const failures: string[] = [];
        for (const route of [
          '#/portal',
          '#/portal/competencias',
          `#/portal/competencias/${champ}`,
          '#/portal/calendario',
          '#/portal/noticias',
          '#/portal/clubes',
          '#/portal/liga',
          '#/portal/verificar',
        ]) {
          await page.goto(`/${route}`);
          await expect(page.locator('h1')).toHaveCount(1);
          const { violations } = await checkA11y(page);
          failures.push(...violations.map((v) => `${route}: ${v.id}`));
        }
        expect(failures).toEqual([]);
      });

      test('el inicio del panel cumple las pautas y «Cerrar sesión» queda a la vista', async ({
        page,
      }) => {
        await login(page, ACCOUNTS.admin);
        await expect(
          page.getByRole('heading', { level: 1, name: 'Inicio' }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Cerrar sesión' }),
        ).toBeInViewport({ ratio: 1 });
        const { violations } = await checkA11y(page);
        expect(violations).toEqual([]);
        await logout(page);
      });
    });
  }

  test('las rutas del panel y sus fichas no saltan niveles de encabezado', async ({
    page,
  }) => {
    await login(page, ACCOUNTS.admin);
    const routes = [
      '#/',
      '#/usuarios',
      '#/roles',
      '#/deportes',
      '#/clubes',
      '#/deportistas',
      '#/equipos',
      '#/campeonatos',
      '#/arbitros',
      '#/disciplina',
      '#/documentos',
      '#/noticias',
      '#/institucion',
      '#/auditoria',
      '#/notificaciones',
      '#/cuenta',
      `#/usuarios/${await firstId(page, '/users?page=1&pageSize=1')}`,
      `#/deportistas/${await firstId(page, '/athletes?page=1&pageSize=1')}`,
      `#/equipos/${await firstId(page, '/teams?page=1&pageSize=1')}`,
      `#/campeonatos/${await firstId(page, '/championships?page=1&pageSize=1')}`,
      `#/arbitros/${await firstId(page, '/officials?page=1&pageSize=1')}`,
      `#/disciplina/${await firstId(page, '/cases?page=1&pageSize=1')}`,
    ];
    const failures: string[] = [];
    for (const route of routes) {
      await page.goto(`/${route}`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1')).toHaveCount(1);
      failures.push(...(await headingJumps(page)).map((j) => `${route}: ${j}`));
    }
    expect(failures).toEqual([]);
    await logout(page);
  });
});
