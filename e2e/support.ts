import { expect, type Page } from '@playwright/test';

export const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-demostracion-2026';
const DEMO = 'demo.liga.invalid';

/** Cuentas cargadas por `e2e/prepare.mjs` (ver docs/demo-data.md). */
export const ACCOUNTS = {
  admin: 'admin@e2e.liga.invalid',
  secretaria: `secretaria@${DEMO}`,
  comision: `comision.tecnica@${DEMO}`,
  disciplinaria: `disciplinaria@${DEMO}`,
  editor: `editor@${DEMO}`,
  arbitro1: `arbitro1@${DEMO}`,
  arbitro2: `arbitro2@${DEMO}`,
  dirigente1: `dirigente1@${DEMO}`,
  dirigente2: `dirigente2@${DEMO}`,
} as const;

/** Inicia sesión por la interfaz y espera a que el panel esté listo. */
export async function login(
  page: Page,
  email: string,
  password: string = PASSWORD,
): Promise<void> {
  await page.goto('/#/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(
    page.getByRole('button', { name: 'Cerrar sesión' }),
  ).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(
    page.getByRole('heading', { name: 'Iniciar sesión' }),
  ).toBeVisible();
}

/** Abre una sección del panel por su enlace del menú. */
export async function goToSection(page: Page, name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Secciones' })
    .getByRole('link', { name: new RegExp(`^${name}(\\b|\\s|$)`) })
    .click();
}

/** Texto visible de la página, para comprobar que algo NO aparece. */
export async function pageText(page: Page): Promise<string> {
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
}
