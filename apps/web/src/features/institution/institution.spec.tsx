import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { error, json, mockApi } from '../../test/mockApi.ts';
import { InstitutionPage } from './InstitutionPage.tsx';
import type { Institution } from './types.ts';

const INSTITUTION: Institution = {
  name: 'Liga Deportiva Cantonal de Quero',
  shortName: 'Liga de Quero',
  affiliation: null,
  canton: 'Quero - Tungurahua - Ecuador',
  address: null,
  email: null,
  phone: null,
  website: null,
  about: null,
  contactInfo: null,
  privacyPolicy: null,
  documentFooter: null,
  presidentName: null,
  secretaryName: null,
  publicClubs: true,
  publicAthletes: true,
  publicNews: true,
  publicResolutions: false,
  allowSelfApproval: false,
  hasLogo: false,
};

afterEach(() => vi.unstubAllGlobals());

describe('configuración institucional', () => {
  it('con permiso de gestión guarda los datos y los parámetros de publicación', async () => {
    const api = mockApi({
      'GET /institution': () => json(INSTITUTION),
      'PATCH /institution': () => json(INSTITUTION),
    });
    render(
      <InstitutionPage
        permissions={['institution:read', 'institution:manage']}
      />,
    );
    const name = await screen.findByLabelText(/Nombre institucional/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Liga de Quero Oficial');
    await userEvent.type(
      screen.getByLabelText('Correo electrónico'),
      'info@liga.example',
    );
    await userEvent.click(
      screen.getByLabelText('Publicar resoluciones disciplinarias'),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar configuración' }),
    );

    expect(
      await screen.findByText('Se guardó la configuración.'),
    ).toBeVisible();
    const body = api.of('PATCH', '/institution')[0]!.body!;
    expect(body).toMatchObject({
      name: 'Liga de Quero Oficial',
      email: 'info@liga.example',
      publicResolutions: true,
      publicClubs: true,
    });
  });

  it('exige el nombre institucional antes de enviar', async () => {
    const api = mockApi({ 'GET /institution': () => json(INSTITUTION) });
    render(
      <InstitutionPage
        permissions={['institution:read', 'institution:manage']}
      />,
    );
    await userEvent.clear(await screen.findByLabelText(/Nombre institucional/));
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar configuración' }),
    );
    expect(
      await screen.findByText('El nombre institucional es obligatorio.'),
    ).toBeVisible();
    expect(api.of('PATCH', '/institution')).toHaveLength(0);
  });

  it('muestra los errores de campo que devuelve el servidor', async () => {
    mockApi({
      'GET /institution': () => json(INSTITUTION),
      'PATCH /institution': () =>
        error(400, 'Solicitud inválida', [
          { field: 'website', message: 'Indique una dirección válida' },
        ]),
    });
    render(
      <InstitutionPage
        permissions={['institution:read', 'institution:manage']}
      />,
    );
    await userEvent.type(await screen.findByLabelText('Sitio web'), 'liga');
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar configuración' }),
    );
    expect(
      await screen.findByText('Indique una dirección válida'),
    ).toBeVisible();
  });

  it('en solo lectura deshabilita los campos y no ofrece guardar ni subir logotipo', async () => {
    mockApi({ 'GET /institution': () => json(INSTITUTION) });
    render(<InstitutionPage permissions={['institution:read']} />);
    expect(await screen.findByLabelText(/Nombre institucional/)).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Guardar configuración' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Subir logotipo')).not.toBeInTheDocument();
    expect(screen.getByText(/Solo puede consultar/)).toBeVisible();
  });

  it('sube y quita el logotipo', async () => {
    let hasLogo = false;
    const api = mockApi({
      'GET /institution': () => json({ ...INSTITUTION, hasLogo }),
      'PUT /institution/logo': () => {
        hasLogo = true;
        return json({ success: true });
      },
      'DELETE /institution/logo': () => {
        hasLogo = false;
        return new Response(null, { status: 204 });
      },
    });
    render(
      <InstitutionPage
        permissions={['institution:read', 'institution:manage']}
      />,
    );
    const input = await screen.findByLabelText('Logotipo');
    await userEvent.upload(
      input,
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', {
        type: 'image/png',
      }),
    );
    expect(await screen.findByText('Se actualizó el logotipo.')).toBeVisible();
    expect(api.of('PUT', '/institution/logo')).toHaveLength(1);
    expect(
      await screen.findByAltText('Logotipo actual de la Liga'),
    ).toBeVisible();

    await userEvent.click(
      screen.getByRole('button', { name: 'Quitar logotipo' }),
    );
    expect(await screen.findByText('Se quitó el logotipo.')).toBeVisible();
    expect(screen.queryByAltText('Logotipo actual de la Liga')).toBeNull();
  });
});
