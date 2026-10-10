import { expect, test } from '@playwright/test';
import { ACCOUNTS, goToSection, login, logout } from './support.ts';

test.describe('publicación de noticias y control de acceso', () => {
  test('el editor crea, publica y visualiza una noticia en el portal público', async ({
    page,
  }) => {
    // 1. Iniciar sesión como editor
    await login(page, ACCOUNTS.editor);
    await goToSection(page, 'Noticias');

    await expect(
      page.getByRole('heading', { name: 'Noticias y comunicados' }),
    ).toBeVisible();

    // 2. Iniciar creación de una nueva publicación
    await page.getByRole('button', { name: 'Nueva publicación' }).click();
    await expect(page.locator('fieldset legend')).toHaveText(
      'Nueva publicación',
    );

    const title = `Inauguración Campeonato Quero ${Date.now()}`;
    const summary =
      'La Liga Cantonal de Quero da inicio a la temporada deportiva 2026 con 24 clubes.';
    const content =
      'Este fin de semana se llevó a cabo el desfile inaugural en el estadio cantonal con la presencia de delegaciones de todos los clubes filiales y autoridades cantonales.';

    const form = page.locator('form.settings-form');
    await form
      .getByRole('textbox', { name: 'Título', exact: true })
      .fill(title);
    await form
      .getByRole('textbox', { name: 'Resumen', exact: true })
      .fill(summary);
    await form
      .getByRole('textbox', { name: 'Contenido', exact: true })
      .fill(content);

    await form.getByRole('button', { name: 'Guardar' }).click();

    // Confirmación de borrador creado
    await expect(page.locator('.notice.success')).toContainText(
      `Se creó el borrador «${title}».`,
    );

    // 3. Ubicar la fila en la tabla de publicaciones
    const row = page.locator('tbody tr', { hasText: title });
    await expect(row).toBeVisible();
    await expect(row.locator('.badge')).toHaveText('Borrador');

    // 4. Publicar la noticia
    await row.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.locator('.notice.success')).toContainText(
      `Se publicó «${title}».`,
    );
    await expect(row.locator('.badge')).toHaveText('Publicado');

    // 5. Verificar que aparece en el portal público (/portal/noticias)
    await page.goto('/#/portal/noticias');
    await expect(
      page.getByRole('heading', { name: 'Noticias y comunicados' }),
    ).toBeVisible();

    const newsCard = page.locator('.news-card', { hasText: title });
    await expect(newsCard).toBeVisible();
    await expect(newsCard).toContainText(summary);

    // 6. Abrir la noticia completa en el portal público
    await newsCard.getByRole('link', { name: title }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: title }),
    ).toBeVisible();
    await expect(page.locator('.lead')).toHaveText(summary);
    await expect(page.locator('.article')).toContainText(content);

    // 7. Verificar que también aparece en la portada general del portal (#/portal)
    await page.goto('/#/portal');
    await expect(page.locator('.news-card', { hasText: title })).toBeVisible();
  });

  test('restringe el acceso a usuarios sin permisos de noticias y protege la publicación', async ({
    page,
  }) => {
    // 1. Iniciar sesión como árbitro (sin permisos sobre noticias)
    await login(page, ACCOUNTS.arbitro1);

    // No debe aparecer la opción 'Noticias' en la barra de navegación
    await expect(
      page
        .getByRole('navigation', { name: 'Secciones' })
        .getByRole('link', { name: 'Noticias' }),
    ).toHaveCount(0);

    // Si intenta acceder por URL directa a #/noticias no debe cargar la sección
    await page.goto('/#/noticias');
    await expect(
      page.getByRole('heading', { name: 'Noticias y comunicados' }),
    ).toHaveCount(0);

    // 2. Restricciones a nivel de API para árbitro
    const arbitroSession = await page.request.get('/api/auth/session');
    expect(arbitroSession.ok()).toBeTruthy();
    const { csrfToken: arbitroCsrf } = await arbitroSession.json();

    // GET /api/announcements debe retornar 403
    const getRes = await page.request.get('/api/announcements');
    expect(getRes.status()).toBe(403);

    // POST /api/announcements debe retornar 403
    const postRes = await page.request.post('/api/announcements', {
      headers: { 'x-csrf-token': arbitroCsrf },
      data: {
        kind: 'noticia',
        title: 'Intento de publicación no autorizada',
        summary: 'Resumen de prueba para intento no autorizado.',
        content:
          'Contenido completo que debe ser denegado por falta de permisos.',
      },
    });
    expect(postRes.status()).toBe(403);

    await logout(page);

    // 3. Crear una noticia borrador con editor para comprobar permisos granulares
    await login(page, ACCOUNTS.editor);
    const editorSession = await page.request.get('/api/auth/session');
    expect(editorSession.ok()).toBeTruthy();
    const { csrfToken: editorCsrf } = await editorSession.json();

    const createDraftRes = await page.request.post('/api/announcements', {
      headers: { 'x-csrf-token': editorCsrf },
      data: {
        kind: 'noticia',
        title: `Borrador para prueba de eliminación ${Date.now()}`,
        summary: 'Resumen para validar que el editor no puede borrar.',
        content:
          'Contenido del borrador para comprobar que requiere permiso de borrado.',
      },
    });
    expect(createDraftRes.status()).toBe(201);
    const draft = await createDraftRes.json();

    // El editor no tiene permiso announcements:delete, por lo que DELETE /api/announcements/:id responde 403
    const deleteRes = await page.request.delete(
      `/api/announcements/${draft.id}`,
      {
        headers: { 'x-csrf-token': editorCsrf },
      },
    );
    expect(deleteRes.status()).toBe(403);
  });
});
