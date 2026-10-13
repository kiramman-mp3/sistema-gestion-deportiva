import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { error, json, mockApi, page } from '../../test/mockApi.ts';
import { PublicPortalPage } from '../public/PublicPortalPage.tsx';
import { DocumentsPage } from './DocumentsPage.tsx';
import { IssuedDocumentsPanel } from './IssuedDocumentsPanel.tsx';
import type { IssuedDocument } from './types.ts';

const ATHLETE = '0197aaaa-0000-7000-8000-0000000000a1';
const CHAMP = '0197aaaa-0000-7000-8000-0000000000c1';
const REG = '0197aaaa-0000-7000-8000-0000000000d1';

const DOC: IssuedDocument = {
  id: '0197aaaa-0000-7000-8000-0000000000e1',
  kind: 'carne',
  label: 'CAR-000001',
  version: 1,
  season: 'Temporada 2026',
  verificationCode: 'ABCDEFGHIJKLMNOP',
  issuedAt: '2026-06-20T12:00:00.000Z',
  revokedAt: null,
  revokeReason: null,
  valid: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('carnés y certificados de un deportista', () => {
  it('lista los documentos, emite uno nuevo y descarga el vigente', async () => {
    let docs: IssuedDocument[] = [
      {
        ...DOC,
        id: 'old',
        label: 'CAR-000000',
        valid: false,
        revokedAt: '2026-06-01T00:00:00.000Z',
        revokeReason: 'Reemplazado por una versión más reciente',
      },
      DOC,
    ];
    const api = mockApi({
      [`GET /athletes/${ATHLETE}/issued-documents`]: () => json(docs),
      [`POST /athletes/${ATHLETE}/issued-documents`]: () => {
        const created = { ...DOC, id: 'new', label: 'CAR-000002', version: 2 };
        docs = [created, { ...DOC, valid: false }];
        return json(created, 201);
      },
    });
    render(<IssuedDocumentsPanel athleteId={ATHLETE} canRevoke={false} />);
    expect(await screen.findByText('CAR-000001')).toBeVisible();
    expect(screen.getByText('Anulado')).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Descargar PDF' })).toHaveLength(
      1,
    );
    expect(screen.getByRole('link', { name: 'Descargar PDF' })).toHaveAttribute(
      'href',
      `/api/issued-documents/${DOC.id}/pdf`,
    );
    // Sin permiso de anulación no hay botón.
    expect(
      screen.queryByRole('button', { name: 'Anular' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Emitir carné' }));
    expect(
      await screen.findByText('Se emitió CAR-000002 (versión 2).'),
    ).toBeVisible();
    expect(
      api.of('POST', `/athletes/${ATHLETE}/issued-documents`)[0]!.body,
    ).toEqual({
      kind: 'carne',
    });
  });

  it('muestra el motivo cuando no se puede emitir', async () => {
    mockApi({
      [`GET /athletes/${ATHLETE}/issued-documents`]: () => json([]),
      [`POST /athletes/${ATHLETE}/issued-documents`]: () =>
        error(
          409,
          'Solo se emiten documentos a deportistas activos y habilitados',
        ),
    });
    render(<IssuedDocumentsPanel athleteId={ATHLETE} canRevoke />);
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Emitir certificado de inscripción',
      }),
    );
    expect(await screen.findByText(/activos y habilitados/)).toBeVisible();
  });

  it('anula un documento con motivo obligatorio', async () => {
    const api = mockApi({
      [`GET /athletes/${ATHLETE}/issued-documents`]: () => json([DOC]),
      [`POST /issued-documents/${DOC.id}/revoke`]: () =>
        json({ ...DOC, valid: false }),
    });
    render(<IssuedDocumentsPanel athleteId={ATHLETE} canRevoke />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Anular' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Anular documento' }),
    );
    expect(api.of('POST', `/issued-documents/${DOC.id}/revoke`)).toHaveLength(
      0,
    );
    await userEvent.type(
      within(dialog).getByRole('textbox'),
      'Se perdió el carné',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Anular documento' }),
    );
    expect(await screen.findByText('Se anuló CAR-000001.')).toBeVisible();
    expect(
      api.of('POST', `/issued-documents/${DOC.id}/revoke`)[0]!.body,
    ).toEqual({
      reason: 'Se perdió el carné',
    });
  });
});

describe('reportes y documentos', () => {
  it('ofrece PDF y CSV según el campeonato elegido y la nómina de un participante', async () => {
    mockApi({
      'GET /championships': () => page([{ id: CHAMP, name: 'Torneo 2026' }]),
      [`GET /championships/${CHAMP}/registrations`]: () =>
        json([
          {
            id: REG,
            status: 'aprobada',
            participant: { team: { team: { name: 'Real Quero' } } },
          },
        ]),
    });
    render(<DocumentsPage permissions={['reports:read']} />);
    expect(screen.queryByText('Informe de sanciones')).not.toBeInTheDocument();
    await userEvent.selectOptions(
      await screen.findByLabelText('Campeonato'),
      CHAMP,
    );
    const teams = (
      await screen.findByText(/Listado de equipos inscritos/)
    ).closest('li')!;
    expect(within(teams).getByRole('link', { name: 'PDF' })).toHaveAttribute(
      'href',
      `/api/reports/championships/${CHAMP}/teams?format=pdf`,
    );
    expect(
      within(teams).getByRole('link', { name: 'CSV (Excel)' }),
    ).toHaveAttribute(
      'href',
      `/api/reports/championships/${CHAMP}/teams?format=csv`,
    );
    await userEvent.selectOptions(
      await screen.findByLabelText('Nómina de buena fe de'),
      REG,
    );
    const roster = screen.getByText(/^Nómina:/).closest('p')!;
    expect(within(roster).getByRole('link', { name: 'PDF' })).toHaveAttribute(
      'href',
      `/api/reports/registrations/${REG}/roster?format=pdf`,
    );
  });

  it('con permiso de sanciones muestra el informe con su filtro de estado', async () => {
    mockApi({ 'GET /championships': () => page([]) });
    render(<DocumentsPage permissions={['reports:read', 'sanctions:read']} />);
    await userEvent.selectOptions(
      await screen.findByLabelText('Estado'),
      'vigente',
    );
    const section = screen.getByText(/^Informe:/).closest('p')!;
    expect(within(section).getByRole('link', { name: 'PDF' })).toHaveAttribute(
      'href',
      '/api/reports/sanctions?status=vigente&format=pdf',
    );
  });
});

describe('verificación pública de documentos', () => {
  const institution = {
    name: 'Liga Deportiva Cantonal de Quero',
    shortName: null,
    affiliation: null,
    canton: null,
    address: null,
    email: null,
    phone: null,
    website: null,
    about: null,
    contactInfo: null,
    privacyPolicy: null,
    presidentName: null,
    secretaryName: null,
    hasLogo: false,
    publication: {
      clubs: true,
      athletes: true,
      news: true,
      resolutions: false,
    },
  };

  it('confirma un documento vigente mostrando lo mínimo', async () => {
    window.location.hash = '#/portal/verificar/ABCDEFGHIJKLMNOP';
    mockApi({
      'GET /public/institution': () => json(institution),
      'GET /public/verify/ABCDEFGHIJKLMNOP': () =>
        json({
          valid: true,
          kind: 'carne',
          label: 'CAR-000001',
          version: 1,
          season: 'Temporada 2026',
          issuedAt: '2026-06-20T12:00:00.000Z',
          revokedAt: null,
          holder: 'Deportista DEP-000007',
          club: 'Deportivo Quero',
        }),
    });
    render(<PublicPortalPage />);
    expect(
      await screen.findByText(/Documento auténtico y vigente/),
    ).toBeVisible();
    expect(screen.getByText('Deportista DEP-000007')).toBeVisible();
    expect(screen.getByText(/Carné de deportista · CAR-000001/)).toBeVisible();
  });

  it('informa de un documento anulado y de uno que no existe', async () => {
    window.location.hash = '#/portal/verificar/ZZZZZZZZZZZZZZZZ';
    mockApi({
      'GET /public/institution': () => json(institution),
      'GET /public/verify/ZZZZZZZZZZZZZZZZ': () =>
        error(404, 'Documento no encontrado'),
    });
    render(<PublicPortalPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Documento no encontrado',
    );
  });

  it('normaliza el código escrito y navega a su resultado', async () => {
    window.location.hash = '#/portal/verificar';
    mockApi({ 'GET /public/institution': () => json(institution) });
    render(<PublicPortalPage />);
    await userEvent.type(
      await screen.findByLabelText('Código de verificación'),
      'abcd2345',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(window.location.hash).toBe('#/portal/verificar/ABCD2345');
  });
});
