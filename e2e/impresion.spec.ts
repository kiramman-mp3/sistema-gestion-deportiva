import { expect, test, type Page } from '@playwright/test';

/**
 * Documentos oficiales imprimibles (D-53) y fundación visual (D-95): al imprimir solo
 * queda la hoja institucional, y las fuentes de la interfaz se sirven desde el mismo origen.
 */

interface Home {
  recent: { id: string }[];
}

async function firstApprovedEventId(page: Page): Promise<string> {
  const res = await page.request.get('/api/public/home');
  expect(res.ok()).toBe(true);
  const home = (await res.json()) as Home;
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

async function expectPrintLayout(page: Page) {
  await expect(page.locator('.institutional-sheet')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  for (const selector of ['.site-header', '.print-toolbar', '.skip-link'])
    await expect(page.locator(selector)).toBeHidden();
  await expect(page.locator('.institutional-sheet')).toBeVisible();
  // La hoja conserva su tipografía serif, no la de la interfaz.
  const fontFamily = await page
    .locator('.institutional-sheet h1')
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(fontFamily).toContain('Times New Roman');
  await page.emulateMedia({ media: 'screen' });
}

test.describe('documentos imprimibles', () => {
  test('el acta oficial se imprime sin la interfaz de la aplicación', async ({
    page,
  }) => {
    const eventId = await firstApprovedEventId(page);
    await page.goto(`/#/imprimir/acta/${eventId}`);
    await expectPrintLayout(page);
  });

  test('la nómina de buena fe se imprime sin la interfaz de la aplicación', async ({
    page,
  }) => {
    const registrationId = await firstRegistrationId(page);
    await page.goto(`/#/imprimir/nomina/${registrationId}`);
    await expectPrintLayout(page);
  });
});

test.describe('fundación visual', () => {
  test('las fuentes se cargan desde el propio sitio, sin servicios externos', async ({
    page,
    baseURL,
  }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      if (!req.url().startsWith(baseURL!) && !req.url().startsWith('data:'))
        external.push(req.url());
    });
    await page.goto('/#/portal');
    await expect(page.locator('.public-portal')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() =>
      [...document.fonts]
        .filter((f) => f.status === 'loaded')
        .map((f) => `${f.family.replaceAll('"', '')} ${f.weight}`),
    );
    expect(loaded).toEqual(
      expect.arrayContaining([
        'Atkinson Hyperlegible Next 400 700',
        'Barlow Condensed 700',
      ]),
    );
    expect(external).toEqual([]);
  });
});
