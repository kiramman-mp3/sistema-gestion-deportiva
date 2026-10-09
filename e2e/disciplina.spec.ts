import { expect, test } from '@playwright/test';
import { ACCOUNTS, goToSection, login, logout } from './support.ts';

test.describe('flujo disciplinario: reclamos, expedientes, resolución y publicación', () => {
  test('flujo completo: dirigente presenta reclamo, comisión abre expediente, resuelve, publica y valida en el portal según configuración institucional', async ({
    page,
  }) => {
    // Asegurar que por defecto la publicación de resoluciones esté desactivada
    await login(page, ACCOUNTS.admin);
    const adminSession = await page.request.get('/api/auth/session');
    expect(adminSession.ok()).toBeTruthy();
    const { csrfToken: adminCsrf } = await adminSession.json();

    const patchDisabledRes = await page.request.patch('/api/institution', {
      headers: { 'x-csrf-token': adminCsrf },
      data: { publicResolutions: false },
    });
    expect(patchDisabledRes.ok()).toBeTruthy();
    await logout(page);

    // 1. Dirigente presenta reclamo
    await login(page, ACCOUNTS.dirigente1);
    await goToSection(page, 'Disciplina');

    // Abre el formulario de nuevo reclamo
    await page.getByRole('button', { name: 'Nuevo reclamo' }).click();
    await expect(
      page.getByRole('heading', { level: 3, name: 'Nuevo reclamo' }),
    ).toBeVisible();

    // Selecciona club Deportivo Quero (al que pertenece dirigente1)
    const clubSelect = page.getByLabel('Club que reclama');
    await expect(clubSelect).toBeVisible();
    await clubSelect.selectOption({ label: 'Deportivo Quero' });

    // Selecciona campeonato en el que participa Deportivo Quero
    const champSelect = page.getByLabel('Campeonato');
    await expect(champSelect).toBeVisible();
    await champSelect.selectOption({ label: 'Campeonato de Fútbol Liga A' });

    const complaintSubject = `Reclamo reglamentario ${Date.now()}`;
    const complaintDesc =
      'Se reclama por infracción flagrante a los estatutos deportivos en la última fecha.';

    await page.getByLabel('Asunto').fill(complaintSubject);
    await page.getByLabel('Descripción de los hechos').fill(complaintDesc);

    await page.getByRole('button', { name: 'Presentar reclamo' }).click();

    await expect(page.locator('.notice.success')).toContainText(
      `Se presentó el reclamo «${complaintSubject}».`,
    );

    await logout(page);

    // 2. Comisión disciplinaria tramita el reclamo y abre expediente
    await login(page, ACCOUNTS.disciplinaria);
    await goToSection(page, 'Disciplina');

    // Cambia a la pestaña de reclamos
    await page.getByRole('tab', { name: 'Reclamos' }).click();

    const complaintRow = page.locator('tbody tr', {
      hasText: complaintSubject,
    });
    await expect(complaintRow).toBeVisible();

    // Clic en abrir expediente
    await complaintRow
      .getByRole('button', { name: 'Abrir expediente' })
      .click();

    // El formulario de nuevo expediente se muestra prellenado
    await expect(
      page.getByRole('heading', {
        level: 3,
        name: 'Nuevo expediente disciplinario',
      }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Abrir expediente' }).click();

    // Espera redirección a la página de detalle del expediente (#/disciplina/:id)
    await expect(page).toHaveURL(/#\/disciplina\/[0-9a-f-]{36}/);
    await expect(page.locator('#case-title')).toContainText(complaintSubject);
    await expect(page.locator('.badge')).toHaveText('Abierto');

    // 3. Resolver el expediente
    const resolutionText =
      'La Comisión Disciplinaria resuelve acoger el reclamo e imponer sanción institucional conforme al reglamento.';
    await page.getByLabel('Resolución').fill(resolutionText);
    await page.getByRole('button', { name: 'Resolver expediente' }).click();

    await expect(page.locator('.notice.success')).toContainText(
      'Se resolvió el expediente.',
    );
    await expect(page.locator('.badge')).toHaveText('Resuelto');

    // 4. Publicar la resolución para el portal
    const publicTitle = `Resolución de la comisión sobre fecha cantonal ${Date.now()}`;
    const publicSummary =
      'La comisión disciplinaria resolvió sancionar administrativamente al club infractor sin suspender la fecha.';

    await page.getByLabel('Título público').fill(publicTitle);
    await page.getByLabel('Resumen público').fill(publicSummary);

    await page.getByRole('button', { name: 'Publicar resolución' }).click();
    await expect(page.locator('.notice.success')).toContainText(
      'Se publicó la resolución.',
    );

    // 5. Verificar que mientras el parámetro esté desactivado, NO se ve en el portal público
    const publicCheck1 = await page.request.get('/api/public/resolutions');
    expect(publicCheck1.status()).toBe(404);

    await logout(page);

    await page.goto('/#/portal');
    await expect(
      page
        .getByRole('navigation', { name: 'Portal' })
        .getByRole('link', { name: 'Resoluciones' }),
    ).toHaveCount(0);

    // 6. Activar el parámetro de configuración institucional (publicResolutions: true)
    await login(page, ACCOUNTS.admin);
    const adminSession2 = await page.request.get('/api/auth/session');
    const { csrfToken: adminCsrf2 } = await adminSession2.json();

    const patchEnabledRes = await page.request.patch('/api/institution', {
      headers: { 'x-csrf-token': adminCsrf2 },
      data: { publicResolutions: true },
    });
    expect(patchEnabledRes.ok()).toBeTruthy();
    await logout(page);

    // 7. Verificar que ahora SÍ aparece en el portal público
    await page.goto('/#/portal');
    await expect(
      page
        .getByRole('navigation', { name: 'Portal' })
        .getByRole('link', { name: 'Resoluciones' }),
    ).toBeVisible();

    await page.goto('/#/portal/resoluciones');
    await expect(
      page.getByRole('heading', {
        level: 3,
        name: 'Resoluciones disciplinarias',
      }),
    ).toBeVisible();

    const resolutionArticle = page.locator('article.championship-card', {
      hasText: publicTitle,
    });
    await expect(resolutionArticle).toBeVisible();
    await expect(resolutionArticle).toContainText(publicSummary);

    // Restaurar parámetro a false para mantener aislamiento entre pruebas
    await login(page, ACCOUNTS.admin);
    const adminCleanup = await page.request.get('/api/auth/session');
    const { csrfToken: cleanupCsrf } = await adminCleanup.json();
    await page.request.patch('/api/institution', {
      headers: { 'x-csrf-token': cleanupCsrf },
      data: { publicResolutions: false },
    });
    await logout(page);
  });

  test('restringe operaciones disciplinarias a usuarios sin autorización y valida nombres protegidos', async ({
    page,
  }) => {
    // 1. Árbitro no tiene acceso a expedientes ni reclamos
    await login(page, ACCOUNTS.arbitro1);
    const arbitroSession = await page.request.get('/api/auth/session');
    expect(arbitroSession.ok()).toBeTruthy();
    const { csrfToken: arbitroCsrf } = await arbitroSession.json();

    const getCasesRes = await page.request.get('/api/cases');
    expect(getCasesRes.status()).toBe(403);

    const postCasesRes = await page.request.post('/api/cases', {
      headers: { 'x-csrf-token': arbitroCsrf },
      data: {
        subject: 'Intento no autorizado de expediente',
        description: 'Descripción que debe ser rechazada con 403.',
      },
    });
    expect(postCasesRes.status()).toBe(403);

    const postComplaintRes = await page.request.post('/api/complaints', {
      headers: { 'x-csrf-token': arbitroCsrf },
      data: {
        subject: 'Intento de reclamo por árbitro',
        description: 'Descripción que debe ser rechazada con 403.',
      },
    });
    expect(postComplaintRes.status()).toBe(403);

    await logout(page);

    // 2. Dirigente tiene permiso de reclamos, pero NO de resolver ni publicar expedientes
    await login(page, ACCOUNTS.disciplinaria);
    const discSession = await page.request.get('/api/auth/session');
    const { csrfToken: discCsrf } = await discSession.json();

    // Crear un expediente de prueba con la comisión
    const createCaseRes = await page.request.post('/api/cases', {
      headers: { 'x-csrf-token': discCsrf },
      data: {
        subject: `Expediente para pruebas de seguridad ${Date.now()}`,
        description: 'Descripción para validar restricciones y permisos.',
      },
    });
    expect(createCaseRes.status()).toBe(201);
    const testCase = await createCaseRes.json();

    // Intentar publicar mientras está abierto debe fallar con 409 Conflict
    const publishOpenRes = await page.request.post(
      `/api/cases/${testCase.id}/publish`,
      {
        headers: { 'x-csrf-token': discCsrf },
        data: {
          publicTitle: 'Título de resolución prematura',
          publicSummary:
            'Resumen que no debe publicarse porque el expediente sigue abierto.',
        },
      },
    );
    expect(publishOpenRes.status()).toBe(409);

    await logout(page);

    // Iniciar como dirigente1 e intentar resolver o publicar
    await login(page, ACCOUNTS.dirigente1);
    const dirSession = await page.request.get('/api/auth/session');
    const { csrfToken: dirCsrf } = await dirSession.json();

    const dirResolveRes = await page.request.post(
      `/api/cases/${testCase.id}/resolve`,
      {
        headers: { 'x-csrf-token': dirCsrf },
        data: {
          resolution: 'Intento de dirigente de resolver un expediente.',
        },
      },
    );
    expect(dirResolveRes.status()).toBe(403);

    const dirPublishRes = await page.request.post(
      `/api/cases/${testCase.id}/publish`,
      {
        headers: { 'x-csrf-token': dirCsrf },
        data: {
          publicTitle: 'Intento de publicación por dirigente',
          publicSummary: 'Resumen intentado por dirigente no autorizado.',
        },
      },
    );
    expect(dirPublishRes.status()).toBe(403);
  });
});
