import { expect, test, type Page } from '@playwright/test';
import { ACCOUNTS, login } from './support.ts';

/**
 * Ninguna pantalla debe obligar a desplazarse en horizontal (D-95).
 * Se cubren todas las rutas del portal, panel de administración y
 * las vistas previas de documentos oficiales imprimibles (acta y nómina)
 * con contenedor con desplazamiento horizontal propio en pantalla.
 */

const WIDTHS = [320, 375, 768, 1024, 1280];

const ADMIN_ROUTES = [
  '#/',
  '#/usuarios',
  '#/roles',
  '#/deportes',
  '#/categorias',
  '#/temporadas',
  '#/clubes',
  '#/deportistas',
  '#/equipos',
  '#/campeonatos',
  '#/arbitros',
  '#/disciplina',
  '#/documentos',
  '#/noticias',
  '#/escenarios',
  '#/institucion',
  '#/auditoria',
  '#/notificaciones',
  '#/cuenta',
];

const PORTAL_ROUTES: [string, number[]][] = [
  ['#/portal', WIDTHS],
  ['#/portal/competencias', WIDTHS],
  ['#/portal/calendario', WIDTHS],
  ['#/portal/noticias', WIDTHS],
  ['#/portal/clubes', WIDTHS],
  ['#/portal/liga', WIDTHS],
  ['#/portal/verificar', WIDTHS],
];

/** Anchos en los que la página obliga a desplazarse en horizontal. */
async function overflowingWidths(
  page: Page,
  route: string,
  widths: number[],
): Promise<string[]> {
  await page.setViewportSize({ width: WIDTHS.at(-1)!, height: 900 });
  await page.goto(`/${route}`);
  await page.waitForLoadState('networkidle');
  const failures: string[] = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    if (scrollWidth > width)
      failures.push(`${route} a ${width}px mide ${scrollWidth}px`);
  }
  return failures;
}

async function firstId(page: Page, path: string): Promise<string> {
  const res = await page.request.get(`/api${path}`);
  expect(res.ok()).toBe(true);
  const { items } = (await res.json()) as { items: { id: string }[] };
  expect(items.length).toBeGreaterThan(0);
  return items[0]!.id;
}

async function firstApprovedEventId(page: Page): Promise<string> {
  const res = await page.request.get('/api/public/home');
  expect(res.ok()).toBe(true);
  const home = (await res.json()) as { recent: { id: string }[] };
  expect(home.recent.length).toBeGreaterThan(0);
  return home.recent[0]!.id;
}

async function firstRegistrationId(page: Page): Promise<string> {
  const res = await page.request.get('/api/public/championships');
  const { items } = (await res.json()) as { items: { id: string }[] };
  for (const { id } of items) {
    const standings = JSON.stringify(
      await (
        await page.request.get(`/api/public/championships/${id}/standings`)
      ).json(),
    );
    const match = /"registrationId":"([0-9a-f-]{36})"/.exec(standings);
    if (match) return match[1]!;
  }
  throw new Error('Ningún campeonato público tiene inscripciones');
}

test.describe('sin desplazamiento horizontal', () => {
  test('portal público', async ({ page }) => {
    const failures: string[] = [];
    // Detalle de campeonato (dirección compartible).
    const { items } = (await (
      await page.request.get('/api/public/championships')
    ).json()) as { items: { id: string }[] };
    for (const { id } of items)
      failures.push(
        ...(await overflowingWidths(
          page,
          `#/portal/competencias/${id}`,
          WIDTHS,
        )),
      );
    for (const [route, widths] of PORTAL_ROUTES)
      failures.push(...(await overflowingWidths(page, route, widths)));
    expect(failures).toEqual([]);
  });

  test('vista previa de documentos imprimibles (acta y nómina)', async ({
    page,
  }) => {
    const eventId = await firstApprovedEventId(page);
    const registrationId = await firstRegistrationId(page);
    const failures: string[] = [];
    for (const route of [
      `#/imprimir/acta/${eventId}`,
      `#/imprimir/nomina/${registrationId}`,
    ]) {
      failures.push(...(await overflowingWidths(page, route, WIDTHS)));
    }
    expect(failures).toEqual([]);
  });

  test('panel de administración, listados y fichas', async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    const details = [
      `#/usuarios/${await firstId(page, '/users?page=1&pageSize=1')}`,
      `#/deportistas/${await firstId(page, '/athletes?page=1&pageSize=1')}`,
      `#/equipos/${await firstId(page, '/teams?page=1&pageSize=1')}`,
      `#/campeonatos/${await firstId(page, '/championships?page=1&pageSize=1')}`,
      `#/arbitros/${await firstId(page, '/officials?page=1&pageSize=1')}`,
    ];
    const failures: string[] = [];
    for (const route of [...ADMIN_ROUTES, ...details])
      failures.push(...(await overflowingWidths(page, route, WIDTHS)));
    expect(failures).toEqual([]);
  });
});
