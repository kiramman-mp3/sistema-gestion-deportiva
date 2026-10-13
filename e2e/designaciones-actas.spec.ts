import { expect, test } from '@playwright/test';
import { ACCOUNTS, goToSection, login, logout } from './support.ts';

test.describe('flujo de designación de árbitros, registro de acta y aprobación oficial (D-72)', () => {
  test('comisión designa árbitro, árbitro confirma y registra acta, comisión aprueba y portal publica el resultado', async ({
    page,
  }) => {
    // 1. La comisión técnica inicia sesión y abre el campeonato Fútbol Liga A
    await login(page, ACCOUNTS.comision);
    await goToSection(page, 'Campeonatos');

    await page.getByRole('link', { name: 'Fútbol Liga A' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Fútbol Liga A',
    );

    // Va a la pestaña de partidos
    await page.getByRole('tab', { name: 'Calendario y partidos' }).click();

    // Localiza un partido programado en el fixture (evitando filas finalizadas con botón «Reprogramar»)
    const scheduledRow = page
      .locator('tbody tr')
      .filter({
        has: page.getByRole('cell', { name: 'Programado', exact: true }),
      })
      .first();
    await expect(scheduledRow).toBeVisible();

    // Abre el diálogo de designaciones del partido
    await scheduledRow.getByRole('button', { name: 'Designaciones' }).click();
    const assignDialog = page.locator('dialog[open]');
    await expect(assignDialog).toBeVisible();

    // Espera a que carguen las designaciones existentes y los candidatos
    await expect(assignDialog.locator('ul.plain-list, p.empty')).toBeVisible();
    await expect(
      assignDialog.getByRole('button', { name: 'Designar' }),
    ).toBeVisible();

    // Obtiene los roles ya ocupados en este partido
    const occupiedRoles = (
      await assignDialog.locator('ul.plain-list li strong').allInnerTexts()
    )
      .join(' ')
      .toLowerCase();

    // Elige un rol que no esté ocupado
    const candidateRoles: { value: string; match: string }[] = [
      { value: 'comisario', match: 'comisario' },
      { value: 'anotador', match: 'anotador' },
      { value: 'juez_de_mesa', match: 'juez de mesa' },
      { value: 'cuarto_arbitro', match: 'cuarto' },
      { value: 'cronometrista', match: 'cronometrista' },
    ];
    const freeRole =
      candidateRoles.find((r) => !occupiedRoles.includes(r.match))?.value ??
      'comisario';

    // Elige un oficial candidato disponible
    const officialSelect = assignDialog.getByLabel('Oficial');
    await expect(officialSelect).toBeVisible();
    await expect(officialSelect.locator('option')).not.toHaveCount(1);
    const availableOptions = await officialSelect
      .locator('option')
      .allInnerTexts();
    const validCandidate = availableOptions.find(
      (opt) =>
        opt && !opt.includes('Seleccione') && !opt.includes('con conflicto'),
    );

    if (validCandidate) {
      await officialSelect.selectOption({ label: validCandidate });
      const roleSelect = assignDialog.getByLabel('Función');
      await roleSelect.selectOption({ value: freeRole });
      await assignDialog.getByRole('button', { name: 'Designar' }).click();
      await expect(
        assignDialog.getByText('Se registró la designación.'),
      ).toBeVisible();
    }
    await assignDialog
      .getByRole('button', { name: 'Cerrar', exact: true })
      .click();
    await logout(page);

    // 2. El árbitro ingresa a «Mis designaciones», confirma y llena el acta
    await login(page, ACCOUNTS.arbitro1);
    await goToSection(page, 'Mis designaciones');
    await expect(
      page.getByRole('heading', { name: 'Mis designaciones' }),
    ).toBeVisible();

    // Selecciona la designación de arbitro1 y guarda el nombre del encuentro
    const card = page.locator('li.notification').first();
    await expect(card).toBeVisible();
    const assignedMatchTitle = await card.locator('strong').first().innerText();
    const [teamLocal, teamVisitante] = assignedMatchTitle
      .split(' vs ')
      .map((t) => t.trim());

    const confirmButton = card.getByRole('button', { name: 'Confirmar' });
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
      await expect(page.getByText('Confirmó su designación.')).toBeVisible();
    }

    // Abre el acta del partido
    await card.getByRole('button', { name: 'Acta / Resultado' }).click();
    const scoresheetDialog = page.locator('dialog[open]');
    await expect(scoresheetDialog).toBeVisible();
    await expect(
      scoresheetDialog.getByRole('heading', { name: /Acta de Juego/ }),
    ).toBeVisible();

    // Modifica los goles: 3 - 1
    const homeInput = scoresheetDialog.locator('#home-score-input');
    const awayInput = scoresheetDialog.locator('#away-score-input');
    await homeInput.fill('3');
    await awayInput.fill('1');

    // Agrega una incidencia registrada
    await scoresheetDialog
      .locator('#inc-notes')
      .fill('Gol de tiro libre en el minuto 40');
    await scoresheetDialog
      .getByRole('button', { name: '+ Agregar al acta' })
      .click();
    await expect(
      scoresheetDialog.getByText('Gol de tiro libre en el minuto 40'),
    ).toBeVisible();

    // Guarda borrador (al guardar con éxito, onSaved cierra el modal)
    await scoresheetDialog
      .getByRole('button', { name: 'Guardar borrador' })
      .click();
    await expect(scoresheetDialog).not.toBeVisible();

    // Reabre el acta para verificar estado borrador y ausencia de panel de aprobación
    await card.getByRole('button', { name: 'Acta / Resultado' }).click();
    await expect(scoresheetDialog).toBeVisible();
    await expect(
      scoresheetDialog.getByText('BORRADOR', { exact: true }),
    ).toBeVisible();

    // D-72: En estado borrador el panel de aprobación NO se muestra
    await expect(
      scoresheetDialog.getByText('Dictamen y Aprobación Oficial'),
    ).toHaveCount(0);

    // El árbitro envía el acta a revisión técnica (cierra el modal al completarse)
    await scoresheetDialog
      .getByRole('button', { name: 'Enviar a revisión' })
      .click();
    await expect(scoresheetDialog).not.toBeVisible();
    await logout(page);

    // 3. La comisión técnica revisa y aprueba el acta
    await login(page, ACCOUNTS.comision);
    await goToSection(page, 'Campeonatos');
    await page.getByRole('link', { name: 'Fútbol Liga A' }).click();
    await page.getByRole('tab', { name: 'Calendario y partidos' }).click();

    // Localiza el partido exacto que el árbitro envió a revisión
    const rowToOpen = page
      .locator('tbody tr')
      .filter({ hasText: teamLocal })
      .filter({ hasText: teamVisitante })
      .first();
    await expect(rowToOpen).toBeVisible();

    await rowToOpen.getByRole('button', { name: 'Acta / Resultado' }).click();
    const comisionScoresheet = page.locator('dialog[open]');
    await expect(comisionScoresheet).toBeVisible();
    await expect(
      comisionScoresheet.getByText(
        'Dictamen y Aprobación Oficial (Comisión Técnica)',
      ),
    ).toBeVisible();

    // Completa la justificación reglamentaria y aprueba
    await comisionScoresheet
      .locator('#app-reason')
      .fill('Acta validada y reglamentaria aprobada en sesión ordinaria');
    await comisionScoresheet
      .getByRole('button', { name: 'Aprobar acta oficial' })
      .click();
    await expect(comisionScoresheet).not.toBeVisible();
    await logout(page);

    // 4. En el portal público el resultado aprobado aparece publicado
    await page.goto('/#/portal');
    await expect(
      page.getByRole('heading', { name: 'Últimos resultados oficiales' }),
    ).toBeVisible();
    await expect(page.getByText('3 — 1').first()).toBeVisible();

    // Comprueba también en el calendario público
    await page.goto('/#/portal/calendario');
    await expect(
      page.getByRole('heading', { name: 'Calendario de partidos' }),
    ).toBeVisible();
    await expect(page.getByText('3 — 1').first()).toBeVisible();
  });

  test('D-72: validación estricta de backend rechaza aprobación de borradores y autoaprobación no autorizada', async ({
    page,
  }) => {
    // 1. Inicia sesión con la comisión técnica y obtiene el token CSRF desde /api/auth/session
    await login(page, ACCOUNTS.comision);
    const sessionRes = await page.request.get('/api/auth/session');
    expect(sessionRes.ok()).toBeTruthy();
    const sessionData = await sessionRes.json();
    const csrfToken = sessionData.csrfToken;
    expect(csrfToken).toBeDefined();

    // Busca un evento de fútbol programado
    const listRes = await page.request.get(
      '/api/public/events?status=programado&pageSize=5',
    );
    expect(listRes.ok()).toBeTruthy();
    const listData = await listRes.json();
    const summaryEvent = listData.items?.[0];
    expect(summaryEvent).toBeDefined();

    // Obtiene el detalle completo del evento con sus participantes
    const detailRes = await page.request.get(`/api/events/${summaryEvent.id}`);
    expect(detailRes.ok()).toBeTruthy();
    const event = await detailRes.json();

    // Guarda un resultado en borrador con la comisión (incluye cabecera X-CSRF-Token)
    const putRes = await page.request.put(`/api/events/${event.id}/result`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        values: [
          { eventParticipantId: event.participants[0].id, score: 1 },
          { eventParticipantId: event.participants[1].id, score: 0 },
        ],
        footballEvents: [],
      },
    });
    expect(putRes.ok()).toBeTruthy();

    // Intento 1: Aprobar mientras está en 'borrador' responde 409 Conflict
    const approveDraftRes = await page.request.post(
      `/api/events/${event.id}/result/approve`,
      {
        headers: { 'x-csrf-token': csrfToken },
        data: {
          approved: true,
          reason: 'Intento de aprobar borrador',
        },
      },
    );
    expect(approveDraftRes.status()).toBe(409);
    const errBody = await approveDraftRes.json();
    expect(errBody.message).toContain('pendientes de revisión');

    // Ahora envía a revisión técnica
    const submitRes = await page.request.post(
      `/api/events/${event.id}/result/submit`,
      {
        headers: { 'x-csrf-token': csrfToken },
      },
    );
    expect(submitRes.ok()).toBeTruthy();

    // Intento 2 (D-72): Quien registró y envió el acta no puede autoaprobarla (403 Forbidden)
    const selfApproveRes = await page.request.post(
      `/api/events/${event.id}/result/approve`,
      {
        headers: { 'x-csrf-token': csrfToken },
        data: {
          approved: true,
          reason: 'Intento de autoaprobación',
        },
      },
    );
    expect(selfApproveRes.status()).toBe(403);
    const selfErrBody = await selfApproveRes.json();
    expect(selfErrBody.message).toContain(
      'Quien registró el acta no puede aprobarla',
    );
  });
});
