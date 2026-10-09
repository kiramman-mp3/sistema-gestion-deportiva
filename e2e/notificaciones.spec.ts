import { expect, test } from '@playwright/test';
import { ACCOUNTS, goToSection, login, logout } from './support.ts';

test.describe('notificaciones: generación, lectura, persistencia y aislamiento entre usuarios', () => {
  test('un evento genera notificación para el usuario destinatario, se persiste y se puede marcar como leída', async ({
    page,
  }) => {
    // 1. Obtener un partido programado donde participe Deportivo Quero
    await login(page, ACCOUNTS.comision);
    const comisionSession = await page.request.get('/api/auth/session');
    expect(comisionSession.ok()).toBeTruthy();
    const { csrfToken: comisionCsrf } = await comisionSession.json();

    // 1. Obtener Deportivo Quero y su partido programado
    const clubsRes = await page.request.get('/api/clubs?q=Quero');
    expect(clubsRes.ok()).toBeTruthy();
    const clubsData = await clubsRes.json();
    const queroClub = clubsData.items?.[0];
    expect(queroClub).toBeDefined();

    const eventsRes = await page.request.get(
      `/api/public/events?clubId=${queroClub.id}&status=programado&pageSize=5`,
    );
    expect(eventsRes.ok()).toBeTruthy();
    const eventsData = await eventsRes.json();
    const event = eventsData.items?.[0];
    expect(event).toBeDefined();

    // Reprogramar el partido con un motivo específico
    const rescheduleReason = `Reprogramación por mantenimiento ${Date.now()}`;
    const newDate = new Date(Date.now() + 86400000 * 15).toISOString();

    const patchRes = await page.request.patch(
      `/api/events/${event.id}/schedule`,
      {
        headers: { 'x-csrf-token': comisionCsrf },
        data: {
          scheduledAt: newDate,
          reason: rescheduleReason,
        },
      },
    );
    expect(patchRes.ok()).toBeTruthy();

    await logout(page);

    // 2. Dirigente de Deportivo Quero inicia sesión y revisa sus notificaciones
    await login(page, ACCOUNTS.dirigente1);
    await goToSection(page, 'Notificaciones');

    await expect(
      page.getByRole('heading', { name: 'Notificaciones' }),
    ).toBeVisible();

    // Localizar la notificación generada
    const notifItem = page.locator('ul.notification-list li', {
      hasText: rescheduleReason,
    });
    await expect(notifItem).toBeVisible();
    await expect(notifItem.locator('.badge')).toHaveText('Nueva');
    await expect(notifItem).toContainText(
      'Se modificó la programación de un partido',
    );

    // 3. Marcar la notificación como leída
    const markReadBtn = notifItem.getByRole('button', {
      name: 'Marcar como leída',
    });
    await expect(markReadBtn).toBeVisible();
    await markReadBtn.click();

    // La notificación ya no debe tener el botón 'Marcar como leída' ni el badge 'Nueva'
    await expect(markReadBtn).toHaveCount(0);
    await expect(notifItem.locator('.badge')).toHaveCount(0);

    // 4. Filtrar por no leídas y comprobar que esta notificación ya no aparece
    await page.getByLabel('Mostrar solo las no leídas').check();
    await expect(
      page.locator('ul.notification-list li', { hasText: rescheduleReason }),
    ).toHaveCount(0);

    // Desmarcar filtro y comprobar persistencia (sigue existiendo en la base de datos)
    await page.getByLabel('Mostrar solo las no leídas').uncheck();
    await expect(
      page.locator('ul.notification-list li', { hasText: rescheduleReason }),
    ).toBeVisible();
  });

  test('aislamiento entre usuarios y protección de la bandeja y buzón de correo', async ({
    page,
  }) => {
    // 1. Acceso no autenticado es denegado con 401
    const anonRes = await page.request.get('/api/notifications');
    expect(anonRes.status()).toBe(401);

    // 2. Iniciar sesión como dirigente1 y obtener el ID de una notificación propia
    await login(page, ACCOUNTS.dirigente1);
    const dirSession = await page.request.get('/api/auth/session');
    expect(dirSession.ok()).toBeTruthy();
    const dirNotifsRes = await page.request.get('/api/notifications');
    expect(dirNotifsRes.ok()).toBeTruthy();
    const dirNotifsData = await dirNotifsRes.json();
    const firstNotif = dirNotifsData.items?.[0];
    expect(firstNotif).toBeDefined();

    await logout(page);

    // 3. Iniciar sesión como árbitro1 y verificar aislamiento
    await login(page, ACCOUNTS.arbitro1);
    const arbitroSession = await page.request.get('/api/auth/session');
    expect(arbitroSession.ok()).toBeTruthy();
    const { csrfToken: arbitroCsrf } = await arbitroSession.json();

    // arbitro1 no ve la notificación de dirigente1 en su listado
    const arbitroNotifsRes = await page.request.get('/api/notifications');
    expect(arbitroNotifsRes.ok()).toBeTruthy();
    const arbitroNotifsData = await arbitroNotifsRes.json();
    const containsDirigenteNotif = arbitroNotifsData.items?.some(
      (n: any) => n.id === firstNotif.id,
    );
    expect(containsDirigenteNotif).toBe(false);

    // arbitro1 no puede marcar como leída la notificación de dirigente1 (404 Not Found)
    const crossReadRes = await page.request.post(
      `/api/notifications/${firstNotif.id}/read`,
      {
        headers: { 'x-csrf-token': arbitroCsrf },
      },
    );
    expect(crossReadRes.status()).toBe(404);

    // 4. arbitro1 no tiene permiso para administrar el buzón de correo (notifications:manage)
    const outboxRes = await page.request.get('/api/notifications/outbox');
    expect(outboxRes.status()).toBe(403);

    const dispatchRes = await page.request.post('/api/notifications/dispatch', {
      headers: { 'x-csrf-token': arbitroCsrf },
    });
    expect(dispatchRes.status()).toBe(403);
  });
});
