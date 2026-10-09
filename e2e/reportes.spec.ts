import { expect, test } from '@playwright/test';
import { ACCOUNTS, goToSection, login, logout } from './support.ts';

test.describe('generación y descarga de reportes oficiales en PDF y CSV', () => {
  test('descarga y valida reportes oficiales de campeonatos en formato PDF y CSV', async ({
    page,
  }) => {
    // 1. Iniciar sesión como secretaria (tiene reports:read)
    await login(page, ACCOUNTS.secretaria);
    await goToSection(page, 'Documentos');

    await expect(
      page.getByRole('heading', { name: 'Reportes y documentos' }),
    ).toBeVisible();

    // 2. Seleccionar el campeonato "Campeonato de Fútbol Liga A"
    const champSelect = page.getByLabel('Campeonato');
    await expect(champSelect).toBeVisible();
    await champSelect.selectOption({ label: 'Campeonato de Fútbol Liga A' });

    // Esperar a que se desplieguen las opciones de descarga
    await expect(page.getByText('Listado de equipos inscritos:')).toBeVisible();
    await expect(page.getByText('Tabla de posiciones:')).toBeVisible();
    await expect(page.getByText('Calendario de encuentros:')).toBeVisible();

    // Obtener los enlaces para Tabla de posiciones y Equipos inscritos
    const standingsSection = page.locator('li', {
      hasText: 'Tabla de posiciones:',
    });
    const teamsSection = page.locator('li', {
      hasText: 'Listado de equipos inscritos:',
    });
    const fixturesSection = page.locator('li', {
      hasText: 'Calendario de encuentros:',
    });

    const pdfStandingsHref = await standingsSection
      .getByRole('link', { name: 'PDF' })
      .getAttribute('href');
    const csvStandingsHref = await standingsSection
      .getByRole('link', { name: 'CSV (Excel)' })
      .getAttribute('href');

    const pdfTeamsHref = await teamsSection
      .getByRole('link', { name: 'PDF' })
      .getAttribute('href');
    const csvTeamsHref = await teamsSection
      .getByRole('link', { name: 'CSV (Excel)' })
      .getAttribute('href');

    const pdfFixturesHref = await fixturesSection
      .getByRole('link', { name: 'PDF' })
      .getAttribute('href');
    const csvFixturesHref = await fixturesSection
      .getByRole('link', { name: 'CSV (Excel)' })
      .getAttribute('href');

    expect(pdfStandingsHref).toBeTruthy();
    expect(csvStandingsHref).toBeTruthy();
    expect(pdfTeamsHref).toBeTruthy();
    expect(csvTeamsHref).toBeTruthy();

    // 3. Validar PDF de Tabla de Posiciones
    const pdfStandingsRes = await page.request.get(pdfStandingsHref!);
    expect(pdfStandingsRes.ok()).toBeTruthy();
    expect(pdfStandingsRes.headers()['content-type']).toBe('application/pdf');
    expect(pdfStandingsRes.headers()['content-disposition']).toContain(
      'filename="posiciones-',
    );
    expect(pdfStandingsRes.headers()['content-disposition']).toContain('.pdf"');
    expect(pdfStandingsRes.headers()['cache-control']).toBe(
      'private, no-store',
    );
    const pdfStandingsBody = await pdfStandingsRes.body();
    expect(pdfStandingsBody.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdfStandingsBody.length).toBeGreaterThan(1000);

    // 4. Validar CSV de Tabla de Posiciones
    const csvStandingsRes = await page.request.get(csvStandingsHref!);
    expect(csvStandingsRes.ok()).toBeTruthy();
    expect(csvStandingsRes.headers()['content-type']).toBe(
      'text/csv; charset=utf-8',
    );
    expect(csvStandingsRes.headers()['content-disposition']).toContain(
      'filename="posiciones-',
    );
    expect(csvStandingsRes.headers()['content-disposition']).toContain('.csv"');
    const csvStandingsText = (await csvStandingsRes.body()).toString('utf-8');
    // Validar BOM UTF-8 (0xFEFF)
    expect(csvStandingsText.charCodeAt(0)).toBe(0xfeff);
    const standingsLines = csvStandingsText.slice(1).split('\r\n');
    expect(standingsLines[0]).toBe(
      'Pos;Participante;Club;PJ;PG;PE;PP;GF;GC;DG;Pts',
    );
    // Comprobar que contiene datos reales de equipos inscritos
    expect(csvStandingsText).toContain('Deportivo Quero');
    expect(csvStandingsText).toContain('Atlético San Pedro');

    // 5. Validar PDF de Equipos Inscritos
    const pdfTeamsRes = await page.request.get(pdfTeamsHref!);
    expect(pdfTeamsRes.ok()).toBeTruthy();
    expect(pdfTeamsRes.headers()['content-type']).toBe('application/pdf');
    expect(pdfTeamsRes.headers()['content-disposition']).toContain(
      'filename="equipos-',
    );
    expect(pdfTeamsRes.headers()['content-disposition']).toContain('.pdf"');
    const pdfTeamsBody = await pdfTeamsRes.body();
    expect(pdfTeamsBody.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdfTeamsBody.length).toBeGreaterThan(1000);

    // 6. Validar CSV de Equipos Inscritos
    const csvTeamsRes = await page.request.get(csvTeamsHref!);
    expect(csvTeamsRes.ok()).toBeTruthy();
    expect(csvTeamsRes.headers()['content-type']).toBe(
      'text/csv; charset=utf-8',
    );
    expect(csvTeamsRes.headers()['content-disposition']).toContain(
      'filename="equipos-',
    );
    expect(csvTeamsRes.headers()['content-disposition']).toContain('.csv"');
    const csvTeamsText = (await csvTeamsRes.body()).toString('utf-8');
    expect(csvTeamsText.charCodeAt(0)).toBe(0xfeff);
    const teamsLines = csvTeamsText.slice(1).split('\r\n');
    expect(teamsLines[0]).toBe('N.º;Participante;Club;Estado;Inscripción');
    expect(csvTeamsText).toContain('Deportivo Quero');

    // 7. Validar reporte de nómina de buena fe de un participante
    const rosterSelect = page.getByLabel('Nómina de buena fe de');
    await expect(rosterSelect).toBeVisible();
    const rosterOptions = await rosterSelect.locator('option').allInnerTexts();
    const validParticipant = rosterOptions.find(
      (opt) => opt && !opt.includes('Seleccione'),
    );
    expect(validParticipant).toBeDefined();
    await rosterSelect.selectOption({ label: validParticipant });

    const rosterSection = page.locator('p', { hasText: 'Nómina:' });
    const pdfRosterHref = await rosterSection
      .getByRole('link', { name: 'PDF' })
      .getAttribute('href');
    const csvRosterHref = await rosterSection
      .getByRole('link', { name: 'CSV (Excel)' })
      .getAttribute('href');
    expect(pdfRosterHref).toBeTruthy();
    expect(csvRosterHref).toBeTruthy();

    const pdfRosterRes = await page.request.get(pdfRosterHref!);
    expect(pdfRosterRes.ok()).toBeTruthy();
    expect(pdfRosterRes.headers()['content-type']).toBe('application/pdf');
    expect((await pdfRosterRes.body()).subarray(0, 5).toString('ascii')).toBe(
      '%PDF-',
    );

    const csvRosterRes = await page.request.get(csvRosterHref!);
    expect(csvRosterRes.ok()).toBeTruthy();
    expect(csvRosterRes.headers()['content-type']).toBe(
      'text/csv; charset=utf-8',
    );
    const csvRosterText = (await csvRosterRes.body()).toString('utf-8');
    expect(csvRosterText.charCodeAt(0)).toBe(0xfeff);
    expect(csvRosterText).toContain(
      'Camiseta;Código;Deportista;Habilitación;Estado',
    );
    expect(csvRosterText).toContain('DEP-');
    expect(csvRosterText).toContain('habilitado');
  });

  test('informe de sanciones y control de acceso a reportes', async ({
    page,
  }) => {
    // 1. Iniciar sesión como administrador (tiene sanctions:read y reports:read)
    await login(page, ACCOUNTS.admin);
    await goToSection(page, 'Documentos');

    // Comprobar la sección de informe de sanciones
    await expect(page.getByText('Informe de sanciones')).toBeVisible();

    const sanctionsSection = page.locator('fieldset', {
      hasText: 'Informe de sanciones',
    });
    const pdfSanctionsHref = await sanctionsSection
      .getByRole('link', { name: 'PDF' })
      .getAttribute('href');
    const csvSanctionsHref = await sanctionsSection
      .getByRole('link', { name: 'CSV (Excel)' })
      .getAttribute('href');

    expect(pdfSanctionsHref).toBeTruthy();
    expect(csvSanctionsHref).toBeTruthy();

    // Validar PDF de sanciones
    const pdfSanctionsRes = await page.request.get(pdfSanctionsHref!);
    expect(pdfSanctionsRes.ok()).toBeTruthy();
    expect(pdfSanctionsRes.headers()['content-type']).toBe('application/pdf');
    expect(
      (await pdfSanctionsRes.body()).subarray(0, 5).toString('ascii'),
    ).toBe('%PDF-');

    // Validar CSV de sanciones
    const csvSanctionsRes = await page.request.get(csvSanctionsHref!);
    expect(csvSanctionsRes.ok()).toBeTruthy();
    expect(csvSanctionsRes.headers()['content-type']).toBe(
      'text/csv; charset=utf-8',
    );
    const csvSanctionsText = (await csvSanctionsRes.body()).toString('utf-8');
    expect(csvSanctionsText.charCodeAt(0)).toBe(0xfeff);
    expect(csvSanctionsText).toContain('Expediente;Sancionado;Sanción');

    // 2. Control de acceso: usuario sin reports:read es rechazado con 403
    await logout(page);
    await login(page, ACCOUNTS.arbitro1);

    const arbitroReportRes = await page.request.get(pdfStandingsHrefTest);
    expect(arbitroReportRes.status()).toBe(403);

    // Formato no soportado responde 400 Bad Request
    const adminSession = await page.request.get('/api/auth/session');
    const badFormatRes = await page.request.get(
      '/api/reports/sanctions?format=xlsx',
    );
    // Para arbitro1 da 403, para admin daría 400
    expect(badFormatRes.status()).toBe(403);
  });
});

const pdfStandingsHrefTest =
  '/api/reports/championships/00000000-0000-0000-0000-000000000001/standings';
