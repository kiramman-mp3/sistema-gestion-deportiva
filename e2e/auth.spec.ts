import { expect, test } from '@playwright/test';
import { ACCOUNTS, goToSection, login, logout } from './support.ts';

test.describe('inicio de sesión y permisos en la interfaz', () => {
  test('rechaza una contraseña incorrecta sin revelar si la cuenta existe', async ({
    page,
  }) => {
    await page.goto('/#/');
    await page.getByLabel('Correo electrónico').fill(ACCOUNTS.secretaria);
    await page
      .getByLabel('Contraseña', { exact: true })
      .fill('contraseña-equivocada-123');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeVisible();
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue(
      '',
    );
    // La misma respuesta para una cuenta que no existe.
    const first = await page.getByRole('alert').innerText();
    await page.getByLabel('Correo electrónico').fill('nadie@demo.liga.invalid');
    await page
      .getByLabel('Contraseña', { exact: true })
      .fill('contraseña-equivocada-123');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert')).toHaveText(first);
  });

  test('la sesión sobrevive a una recarga y se cierra al salir', async ({
    page,
  }) => {
    await login(page, ACCOUNTS.secretaria);
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Cerrar sesión' }),
    ).toBeVisible();
    await logout(page);
    // Tras salir, una dirección protegida muestra el inicio de sesión, no datos.
    await page.goto('/#/auditoria');
    await expect(
      page.getByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeVisible();
  });

  test('cada rol ve solo las secciones que le corresponden', async ({
    page,
  }) => {
    await login(page, ACCOUNTS.dirigente1);
    const menu = page.getByRole('navigation', { name: 'Secciones' });
    await expect(
      menu.getByRole('link', { name: 'Deportistas', exact: true }),
    ).toBeVisible();
    await expect(
      menu.getByRole('link', { name: /^Notificaciones/ }),
    ).toBeVisible();
    for (const hidden of [
      'Usuarios',
      'Roles y permisos',
      'Auditoría',
      'Institución',
      'Noticias',
    ]) {
      await expect(
        menu.getByRole('link', { name: hidden, exact: true }),
      ).toHaveCount(0);
    }
    // Aunque escriba la dirección, la sección no se muestra.
    await page.goto('/#/auditoria');
    await expect(page.getByRole('heading', { name: 'Auditoría' })).toHaveCount(
      0,
    );

    await logout(page);
    await login(page, ACCOUNTS.editor);
    const editorMenu = page.getByRole('navigation', { name: 'Secciones' });
    await expect(
      editorMenu.getByRole('link', { name: 'Noticias', exact: true }),
    ).toBeVisible();
    await expect(
      editorMenu.getByRole('link', { name: 'Campeonatos', exact: true }),
    ).toHaveCount(0);

    await logout(page);
    await login(page, ACCOUNTS.admin);
    await goToSection(page, 'Auditoría');
    await expect(
      page.getByRole('heading', { name: 'Auditoría' }),
    ).toBeVisible();
  });

  test('un dirigente solo ve su club', async ({ page }) => {
    await login(page, ACCOUNTS.dirigente1);
    await goToSection(page, 'Clubes');
    await expect(page.getByRole('heading', { name: 'Clubes' })).toBeVisible();
    await expect(page.getByText('Deportivo Quero').first()).toBeVisible();
    await expect(page.getByText('Sporting Rumipamba')).toHaveCount(0);
  });
});
