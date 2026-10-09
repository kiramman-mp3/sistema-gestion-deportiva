import { expect, test } from '@playwright/test';
import { pageText } from './support.ts';

test.describe('portal público (sin iniciar sesión)', () => {
  test('el inicio reúne noticias, próximos partidos y últimos resultados', async ({
    page,
  }) => {
    await page.goto('/#/portal');
    await expect(
      page.getByRole('heading', {
        name: 'Liga Deportiva Cantonal de Quero',
        level: 2,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Últimas noticias' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Próximos partidos' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Últimos resultados oficiales' }),
    ).toBeVisible();
    await expect(page.locator('.match-card').first()).toBeVisible();
    // Los resultados aprobados muestran el marcador.
    await expect(page.locator('.score-numbers').first()).toContainText('—');
    // Las imágenes tienen texto alternativo.
    for (const img of await page.locator('.news-card img').all()) {
      await expect(img).toHaveAttribute('alt', /.+/);
    }
  });

  test('una noticia se abre desde el inicio, tiene enlace directo y los borradores no aparecen', async ({
    page,
  }) => {
    await page.goto('/#/portal');
    await page
      .getByRole('link', { name: 'Arrancó el campeonato de fútbol Liga A' })
      .click();
    await expect(page).toHaveURL(
      /#\/portal\/noticias\/arranco-el-campeonato-de-futbol-liga-a$/,
    );
    await expect(
      page.getByRole('heading', {
        name: 'Arrancó el campeonato de fútbol Liga A',
      }),
    ).toBeVisible();
    await expect(
      page.getByText('Estadio Cantonal y en la cancha de Rumipamba'),
    ).toBeVisible();

    // El enlace directo funciona al abrirlo de nuevo.
    await page.reload();
    await expect(
      page.getByRole('heading', {
        name: 'Arrancó el campeonato de fútbol Liga A',
      }),
    ).toBeVisible();

    await page.getByRole('link', { name: '← Todas las noticias' }).click();
    await expect(
      page.getByRole('heading', { name: 'Noticias y comunicados' }),
    ).toBeVisible();
    expect(await pageText(page)).not.toContain('Borrador: inscripciones');
    await page.goto(
      '/#/portal/noticias/borrador-inscripciones-del-torneo-de-basquet-femenino',
    );
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('el calendario se filtra por deporte y lleva al detalle de un partido', async ({
    page,
  }) => {
    await page.goto('/#/portal/calendario');
    await expect(page.locator('.match-card').first()).toBeVisible();
    await page.getByLabel('Deporte').selectOption({ label: 'Básquet' });
    await expect(page.locator('.match-card').first()).toContainText('Básquet');
    for (const card of await page.locator('.match-card').all()) {
      await expect(card).toContainText('Básquet');
    }

    await page
      .getByRole('link', { name: 'Ver detalle del partido' })
      .first()
      .click();
    await expect(page).toHaveURL(/#\/portal\/partido\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 3 }).first()).toContainText(
      ' vs ',
    );
    await page.getByRole('link', { name: '← Volver al calendario' }).click();
    await expect(
      page.getByRole('heading', { name: 'Calendario de partidos' }),
    ).toBeVisible();
  });

  test('la tabla de posiciones de fútbol se muestra completa y se puede descargar', async ({
    page,
  }) => {
    await page.goto('/#/portal/competencias');
    const card = page.locator('.championship-card', {
      hasText: 'Fútbol Liga A',
    });
    await card
      .getByRole('button', { name: /Ver Calendario y Posiciones/ })
      .click();
    await page
      .getByRole('tab', { name: /Tabla de Posiciones Oficial/ })
      .click();
    const rows = page.locator('.portal-table tbody tr');
    await expect(rows).toHaveCount(8);
    await expect(rows.first().locator('td').first()).toHaveText('1°');
    await expect(page.getByRole('link', { name: 'CSV' })).toHaveAttribute(
      'href',
      /\/api\/public\/championships\/[0-9a-f-]{36}\/export\/standings\?format=csv/,
    );

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'PDF' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^posiciones-.*\.pdf$/);
  });

  test('los menores no aparecen por su nombre en las competencias', async ({
    page,
  }) => {
    await page.goto('/#/portal/competencias');
    const card = page.locator('.championship-card', {
      hasText: 'Taekwondo Juvenil',
    });
    await card
      .getByRole('button', { name: /Ver Calendario y Posiciones/ })
      .click();
    await page
      .getByRole('tab', { name: /Tabla de Posiciones Oficial/ })
      .click();
    const rows = page.locator('.portal-table tbody tr');
    await expect(rows).toHaveCount(8);
    const names = await page
      .locator('.portal-table tbody tr td:nth-child(2)')
      .allInnerTexts();
    expect(names.length).toBe(8);
    // Los 8 son adolescentes: solo se nombran los que tienen perfil público con consentimiento.
    const coded = names.filter((n) => /^Deportista DEP-\d{6}$/.test(n.trim()));
    expect(coded.length).toBeGreaterThanOrEqual(5);
  });

  test('clubes, información de la Liga y verificación de documentos', async ({
    page,
  }) => {
    await page.goto('/#/portal/clubes');
    await expect(page.getByText('Deportivo Quero').first()).toBeVisible();
    await expect(page.getByText('Dragones de Quero Taekwondo')).toBeVisible();
    await expect(page.locator('.club-pill')).toHaveCount(12);

    await page.goto('/#/portal/liga');
    await expect(page.getByRole('heading', { name: 'Contacto' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Política de privacidad' }),
    ).toBeVisible();
    await expect(
      page.getByText('TEXTO DE DEMOSTRACIÓN: sustitúyalo'),
    ).toBeVisible();

    // Un código inexistente no revela nada.
    await page.goto('/#/portal/verificar');
    await page.getByLabel('Código de verificación').fill('aaaabbbbccccdddd');
    await page.getByRole('button', { name: 'Verificar' }).click();
    await expect(page).toHaveURL(/verificar\/AAAABBBBCCCCDDDD$/);
    await expect(page.getByRole('alert')).toContainText('no encontrado');
  });

  test('las resoluciones están apagadas hasta que la Liga las activa', async ({
    page,
  }) => {
    await page.goto('/#/portal');
    await expect(
      page
        .getByRole('navigation', { name: 'Secciones del portal' })
        .getByRole('link', {
          name: 'Resoluciones',
        }),
    ).toHaveCount(0);
    const res = await page.request.get('/api/public/resolutions');
    expect(res.status()).toBe(404);
  });

  test('se adapta a un teléfono sin desplazamiento horizontal', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    for (const hash of [
      '#/portal',
      '#/portal/calendario',
      '#/portal/noticias',
      '#/portal/competencias',
    ]) {
      await page.goto(`/${hash}`);
      await expect(page.locator('.public-portal').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, hash).toBeLessThanOrEqual(1);
    }
  });
});
