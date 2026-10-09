import { expect, test } from '@playwright/test';
import { ACCOUNTS, goToSection, login, logout } from './support.ts';

test.describe('emisión, descarga, verificación y anulación de carnés deportivos', () => {
  test('flujo completo: secretaria emite carné, descarga pdf, verifica autenticidad en portal, anula carné y comprueba estado anulado en datos reales', async ({
    page,
  }) => {
    // 1. Iniciar sesión como secretaria
    await login(page, ACCOUNTS.secretaria);
    await goToSection(page, 'Deportistas');

    await expect(
      page.getByRole('heading', { name: 'Deportistas' }),
    ).toBeVisible();

    // Localizar un deportista habilitado
    const athleteRow = page
      .locator('tbody tr', { hasText: 'Habilitado' })
      .first();
    await expect(athleteRow).toBeVisible();

    // Obtener el código o nombre del deportista para referencias
    const athleteName = await athleteRow.locator('td').nth(1).innerText();

    // Abrir ficha del deportista
    await athleteRow.getByRole('link', { name: /Ver a|Ver ficha/ }).click();
    await expect(
      page.getByRole('heading', { level: 3, name: 'Carnés y certificados' }),
    ).toBeVisible();

    // Ubicar el panel de Carnés y certificados
    const issuedSection = page.getByRole('region', {
      name: 'Carnés y certificados',
    });
    await expect(issuedSection).toBeVisible();

    // 2. Emitir carné deportivo
    await issuedSection.getByRole('button', { name: 'Emitir carné' }).click();

    // Esperar aviso de éxito
    await expect(page.locator('.notice.success')).toContainText('Se emitió');

    // Ubicar la fila del carné recién emitido
    const carnetRow = issuedSection
      .locator('tbody tr', { hasText: 'Carné' })
      .first();
    await expect(carnetRow).toBeVisible();
    await expect(carnetRow.locator('.badge')).toHaveText('Vigente');

    // Extraer el código de verificación
    const hintText = await carnetRow.locator('.hint').first().innerText();
    const match = hintText.match(/Verificación:\s*([A-Za-z0-9_-]+)/);
    expect(match).toBeTruthy();
    const verificationCode = match![1];

    // 3. Descarga del PDF
    const pdfLink = carnetRow.getByRole('link', { name: 'Descargar PDF' });
    await expect(pdfLink).toBeVisible();
    const pdfHref = await pdfLink.getAttribute('href');
    expect(pdfHref).toBeTruthy();

    const pdfRes = await page.request.get(pdfHref!);
    expect(pdfRes.ok()).toBeTruthy();
    expect(pdfRes.headers()['content-type']).toBe('application/pdf');
    const pdfBytes = await pdfRes.body();
    // Validar encabezado mágico %PDF-
    const magic = pdfBytes.subarray(0, 5).toString('ascii');
    expect(magic).toBe('%PDF-');
    expect(pdfBytes.length).toBeGreaterThan(500);

    const athleteUrl = page.url();

    // 4. Verificación pública del carné vigente en el portal
    await page.goto(`/#/portal/verificar/${verificationCode}`);
    await expect(
      page.getByRole('heading', {
        level: 3,
        name: 'Verificar un documento',
      }),
    ).toBeVisible();

    const cardOutput = page.locator('output.championship-card');
    await expect(cardOutput).toBeVisible();
    await expect(cardOutput.getByRole('heading', { level: 4 })).toContainText(
      'Documento auténtico y vigente',
    );
    await expect(cardOutput).toContainText('Carné de deportista');

    // 5. Anulación del carné por parte de secretaria
    // Regresar a la ficha del deportista
    await page.goto(athleteUrl);
    await expect(issuedSection).toBeVisible();

    const revokeButton = carnetRow.getByRole('button', { name: 'Anular' });
    await expect(revokeButton).toBeVisible();
    await revokeButton.click();

    // ConfirmDialog con campo de motivo requerido
    const reasonInput = page.getByLabel('Motivo');
    await expect(reasonInput).toBeVisible();
    const revokeReason =
      'Pase intercantonal aprobado y retiro definitivo de ficha deportiva';
    await reasonInput.fill(revokeReason);

    await page.getByRole('button', { name: 'Anular documento' }).click();

    // Esperar confirmación
    await expect(page.locator('.notice.success')).toContainText('Se anuló');
    await expect(carnetRow.locator('.badge')).toHaveText('Anulado');
    await expect(carnetRow).toContainText(revokeReason);
    // El enlace para descargar PDF ya no debe existir
    await expect(
      carnetRow.getByRole('link', { name: 'Descargar PDF' }),
    ).toHaveCount(0);

    // 6. Verificación posterior en el portal mostrando claramente el estado ANULADO
    await page.goto(`/#/portal/verificar/${verificationCode}`);
    await expect(cardOutput).toBeVisible();
    await expect(cardOutput.getByRole('heading', { level: 4 })).toContainText(
      'Documento anulado o reemplazado',
    );
    await expect(
      cardOutput.locator('dt', { hasText: 'Anulado' }),
    ).toBeVisible();

    // 7. Comprobar que la anulación se refleja en los datos reales del backend
    const apiVerify = await page.request.get(
      `/api/public/verify/${verificationCode}`,
    );
    expect(apiVerify.ok()).toBeTruthy();
    const apiData = await apiVerify.json();
    expect(apiData.valid).toBe(false);
    expect(apiData.revokedAt).toBeDefined();
    expect(new Date(apiData.revokedAt).getTime()).toBeGreaterThan(0);
  });

  test('control de permisos: usuarios no autorizados no pueden emitir ni anular credenciales', async ({
    page,
  }) => {
    // 1. Árbitro no tiene credenciales:issue ni credenciales:revoke
    await login(page, ACCOUNTS.arbitro1);
    const arbitroSession = await page.request.get('/api/auth/session');
    const { csrfToken: arbitroCsrf } = await arbitroSession.json();

    const dummyAthleteId = '00000000-0000-0000-0000-000000000001';
    const issueRes = await page.request.post(
      `/api/athletes/${dummyAthleteId}/issued-documents`,
      {
        headers: { 'x-csrf-token': arbitroCsrf },
        data: { kind: 'carne' },
      },
    );
    expect(issueRes.status()).toBe(403);

    const revokeRes = await page.request.post(
      `/api/issued-documents/${dummyAthleteId}/revoke`,
      {
        headers: { 'x-csrf-token': arbitroCsrf },
        data: { reason: 'Intento no autorizado' },
      },
    );
    expect(revokeRes.status()).toBe(403);
  });
});
