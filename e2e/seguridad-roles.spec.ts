import { expect, test } from '@playwright/test';
import { ACCOUNTS, goToSection, login, logout, pageText } from './support.ts';

test.describe('seguridad, separación de roles (RBAC) y privacidad de menores', () => {
  test('separación de roles en interfaz y backend: admin, editor, árbitro y dirigente', async ({
    page,
  }) => {
    // 1. Superadministrador: tiene acceso completo en UI y API
    await login(page, ACCOUNTS.admin);
    const navAdmin = page.getByRole('navigation', { name: 'Secciones' });
    await expect(
      navAdmin.getByRole('link', { name: 'Usuarios', exact: true }),
    ).toBeVisible();
    await expect(
      navAdmin.getByRole('link', { name: 'Roles y permisos', exact: true }),
    ).toBeVisible();
    await expect(
      navAdmin.getByRole('link', { name: 'Auditoría', exact: true }),
    ).toBeVisible();
    await expect(
      navAdmin.getByRole('link', { name: 'Institución', exact: true }),
    ).toBeVisible();

    // Verificamos respuestas de API autorizadas
    const usersRes = await page.request.get('/api/users');
    expect(usersRes.status()).toBe(200);
    const auditRes = await page.request.get('/api/audit-logs');
    expect(auditRes.status()).toBe(200);

    await logout(page);

    // 2. Editor de contenido: no puede acceder a usuarios, disciplina ni auditoría
    await login(page, ACCOUNTS.editor);
    const navEditor = page.getByRole('navigation', { name: 'Secciones' });
    await expect(
      navEditor.getByRole('link', { name: 'Noticias', exact: true }),
    ).toBeVisible();
    await expect(
      navEditor.getByRole('link', { name: 'Usuarios', exact: true }),
    ).not.toBeVisible();
    await expect(
      navEditor.getByRole('link', { name: 'Roles y permisos', exact: true }),
    ).not.toBeVisible();
    await expect(
      navEditor.getByRole('link', { name: 'Auditoría', exact: true }),
    ).not.toBeVisible();
    await expect(
      navEditor.getByRole('link', { name: 'Disciplina', exact: true }),
    ).not.toBeVisible();

    // Intentos de navegación directa por URL vuelven a inicio
    await page.goto('/#/usuarios');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Usuarios' }),
    ).not.toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Inicio' }),
    ).toBeVisible();

    // Peticiones directas a la API sin permiso son rechazadas con 403 Forbidden
    const editorUsersReq = await page.request.get('/api/users');
    expect(editorUsersReq.status()).toBe(403);

    const editorAuditReq = await page.request.get('/api/audit-logs');
    expect(editorAuditReq.status()).toBe(403);

    const editorCasesReq = await page.request.get('/api/cases');
    expect(editorCasesReq.status()).toBe(403);

    const editorAthletesReq = await page.request.get('/api/athletes');
    expect(editorAthletesReq.status()).toBe(403);

    await logout(page);

    // 3. Árbitro: solo tiene permisos de oficial deportivo y sus designaciones
    await login(page, ACCOUNTS.arbitro1);
    const navArbitro = page.getByRole('navigation', { name: 'Secciones' });
    await expect(
      navArbitro.getByRole('link', { name: 'Mis designaciones', exact: true }),
    ).toBeVisible();
    await expect(
      navArbitro.getByRole('link', { name: 'Usuarios', exact: true }),
    ).not.toBeVisible();
    await expect(
      navArbitro.getByRole('link', { name: 'Institución', exact: true }),
    ).not.toBeVisible();
    await expect(
      navArbitro.getByRole('link', { name: 'Clubes', exact: true }),
    ).not.toBeVisible();

    // Peticiones no autorizadas del árbitro son rechazadas con 403 Forbidden
    const arbitroUsersReq = await page.request.get('/api/users');
    expect(arbitroUsersReq.status()).toBe(403);

    const arbitroRolesReq = await page.request.get('/api/roles');
    expect(arbitroRolesReq.status()).toBe(403);

    const arbitroClubCreate = await page.request.post('/api/clubs', {
      data: { code: 'HACK', name: 'Club No Autorizado' },
    });
    expect(arbitroClubCreate.status()).toBe(403);

    await logout(page);

    // 4. Dirigente de club: alcance restringido por club (D-45)
    await login(page, ACCOUNTS.dirigente1);
    const navDirigente = page.getByRole('navigation', { name: 'Secciones' });
    await expect(
      navDirigente.getByRole('link', { name: 'Usuarios', exact: true }),
    ).not.toBeVisible();
    await expect(
      navDirigente.getByRole('link', { name: 'Auditoría', exact: true }),
    ).not.toBeVisible();

    // Petición a usuarios es 403
    const dirigenteUsersReq = await page.request.get('/api/users');
    expect(dirigenteUsersReq.status()).toBe(403);

    // Petición de clubes devuelve solo su club asignado, no todos
    const dirigenteClubsReq = await page.request.get('/api/clubs');
    expect(dirigenteClubsReq.status()).toBe(200);
    const dirigenteClubs = (await dirigenteClubsReq.json()) as {
      items: Array<{
        id: string;
        code: string;
      }>;
      total: number;
    };
    expect(dirigenteClubs.items.length).toBeLessThanOrEqual(2);
    expect(dirigenteClubs.total).toBeLessThanOrEqual(2);

    await logout(page);
  });

  test('D-72: separación de funciones en acta deportiva y prevención de autoaprobación', async ({
    page,
  }) => {
    // Arbitro inicia sesión y obtiene sus designaciones
    await login(page, ACCOUNTS.arbitro1);
    const assignmentsRes = await page.request.get('/api/assignments/mine');
    expect(assignmentsRes.status()).toBe(200);
    const assignments = (await assignmentsRes.json()) as {
      items: Array<{
        id: string;
        event: { id: string };
      }>;
    };

    if (assignments.items.length > 0) {
      const targetEventId = assignments.items[0]!.event.id;

      // El árbitro intenta autoaprobar el resultado -> Backend responde 403 Forbidden
      const selfApprovalRes = await page.request.post(
        `/api/events/${targetEventId}/result/approve`,
        {
          data: {
            approved: true,
            reason: 'Intento de autoaprobación por árbitro',
            notes: 'No permitido según D-72',
          },
        },
      );
      expect([403, 409]).toContain(selfApprovalRes.status());
    }

    await logout(page);
  });

  test('D-85: protección de la privacidad de menores en el portal público y API', async ({
    page,
  }) => {
    // 1. Petición anónima a la API privada de deportistas debe ser rechazada (401)
    const privateAthletesReq = await page.request.get('/api/athletes');
    expect(privateAthletesReq.status()).toBe(401);

    // 2. Consulta pública de la portada y calendario
    const publicHomeRes = await page.request.get('/api/public/home');
    expect(publicHomeRes.status()).toBe(200);
    const homeJson = JSON.stringify(await publicHomeRes.json());

    // La respuesta pública jamás debe contener campos privados como cédula, tutor o fecha de nacimiento
    expect(homeJson).not.toContain('idNumber');
    expect(homeJson).not.toContain('birthDate');
    expect(homeJson).not.toContain('guardianName');
    expect(homeJson).not.toContain('guardianPhone');
    expect(homeJson).not.toContain('identificationNumber');
    expect(homeJson).not.toContain('legalTutor');

    // 3. Verificamos que los eventos públicos del calendario respetan el mismo principio
    const publicEventsRes = await page.request.get('/api/public/events');
    expect(publicEventsRes.status()).toBe(200);
    const eventsJson = JSON.stringify(await publicEventsRes.json());
    expect(eventsJson).not.toContain('guardianPhone');
    expect(eventsJson).not.toContain('idNumber');

    // 4. Verificamos la navegación por el calendario público
    await page.goto('/#/portal/calendario');
    await expect(
      page.getByRole('heading', { level: 3, name: 'Calendario de partidos' }),
    ).toBeVisible();

    const text = await pageText(page);
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');

    // 5. Verificación de documento público: /api/public/verification/:code con código no existente
    const verifySearch = await page.request.get(
      '/api/public/verification/INVALIDCODE999999',
    );
    expect([400, 404]).toContain(verifySearch.status());
  });
});
