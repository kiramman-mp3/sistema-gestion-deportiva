import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { error, json, mockApi, page } from '../../test/mockApi.ts';
import { CaseDetailPage } from './CaseDetailPage.tsx';
import { DisciplinePage } from './DisciplinePage.tsx';
import { IncidentDialog } from './IncidentDialog.tsx';
import type {
  CaseDetail,
  ComplaintItem,
  IncidentItem,
  SanctionItem,
} from './types.ts';

const CASE_ID = '0197aaaa-0000-7000-8000-0000000000c1';
const CLUB_ID = '0197aaaa-0000-7000-8000-0000000000b1';
const CHAMP_ID = '0197aaaa-0000-7000-8000-0000000000d1';
const EVENT_ID = '0197aaaa-0000-7000-8000-0000000000e1';
const COMPLAINT_ID = '0197aaaa-0000-7000-8000-0000000000f1';
const INCIDENT_ID = '0197aaaa-0000-7000-8000-0000000000a1';

const INCIDENT: IncidentItem = {
  id: INCIDENT_ID,
  type: 'agresion_verbal',
  typeLabel: 'Agresión verbal',
  description: 'Insultos reiterados a la terna',
  createdAt: '2026-06-25T18:00:00.000Z',
  caseId: null,
  reportedBy: 'Mario Vela',
  event: { id: EVENT_ID, scheduledAt: null, match: 'Local vs Visitante' },
  championship: { id: CHAMP_ID, name: 'Torneo 2026' },
  athlete: null,
  club: { id: CLUB_ID, name: 'Deportivo Quero' },
};

const COMPLAINT: ComplaintItem = {
  id: COMPLAINT_ID,
  subject: 'Alineación indebida del rival',
  description: 'Jugó un deportista no inscrito.',
  status: 'recibido',
  submittedAt: '2026-06-26T10:00:00.000Z',
  resolvedAt: null,
  dismissReason: null,
  eventId: EVENT_ID,
  club: { id: CLUB_ID, name: 'Deportivo Quero' },
  championship: { id: CHAMP_ID, name: 'Torneo 2026' },
  submittedBy: 'Ana Dirigente',
  case: null,
  attachmentCount: 1,
};

const CASE: CaseDetail = {
  id: CASE_ID,
  code: 'EXP-000001',
  subject: 'Conducta antideportiva en la fecha 1',
  status: 'en_revision',
  openedAt: '2026-06-27T10:00:00.000Z',
  resolvedAt: null,
  publishedAt: null,
  championship: { id: CHAMP_ID, name: 'Torneo 2026' },
  club: null,
  reviewer: { id: 'u2', displayName: 'Rosa Revisora' },
  counts: { incidents: 1, complaints: 0, sanctions: 1 },
  description: 'Se investiga la conducta del jugador.',
  resolution: null,
  resolvedBy: null,
  openedBy: 'Comisión',
  publication: null,
  event: { id: EVENT_ID, scheduledAt: null },
  entries: [
    {
      id: 'e1',
      kind: 'apertura',
      body: 'Expediente EXP-000001 abierto',
      author: 'Comisión',
      createdAt: '2026-06-27T10:00:00.000Z',
    },
  ],
  incidents: [
    {
      id: INCIDENT_ID,
      typeLabel: 'Agresión verbal',
      description: 'Insultos reiterados a la terna',
      createdAt: '2026-06-25T18:00:00.000Z',
      athlete: 'Juan Pérez',
      club: 'Deportivo Quero',
    },
  ],
  complaints: [],
  sanctions: [
    {
      id: 's1',
      type: 'suspension_partidos',
      typeLabel: 'Suspensión por partidos',
      reason: 'Insultos comprobados',
      startsAt: '2026-06-28',
      endsAt: null,
      matchesCount: 2,
      points: null,
      status: 'vigente',
      statusReason: null,
      isActive: true,
      athlete: 'Juan Pérez',
      team: null,
      club: null,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('disciplina: pestañas según permisos', () => {
  it('muestra solo las pestañas permitidas y avisa si no hay ninguna', async () => {
    mockApi({ 'GET /sanctions': () => page([]) });
    const { unmount } = render(
      <DisciplinePage permissions={['sanctions:read']} />,
    );
    const tabs = await screen.findByRole('tablist', { name: 'Disciplina' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Sanciones']);
    expect(await screen.findByText('No hay sanciones.')).toBeVisible();
    unmount();

    render(<DisciplinePage permissions={['sports:read']} />);
    expect(
      screen.getByText('Su cuenta no tiene acceso a esta sección.'),
    ).toBeVisible();
  });

  it('lista las sanciones y marca las que rigen hoy', async () => {
    const sanction: SanctionItem = {
      id: 's1',
      case: { id: CASE_ID, code: 'EXP-000001' },
      type: 'suspension_partidos',
      typeLabel: 'Suspensión por partidos',
      reason: 'Insultos comprobados',
      startsAt: '2026-06-28',
      endsAt: null,
      matchesCount: 2,
      points: null,
      status: 'vigente',
      statusReason: null,
      isActive: true,
      athlete: { id: 'a1', name: 'Juan Pérez' },
      team: null,
      club: null,
      championship: null,
    };
    const api = mockApi({ 'GET /sanctions': () => page([sanction]) });
    render(<DisciplinePage permissions={['sanctions:read']} />);
    expect(await screen.findByText('Juan Pérez')).toBeVisible();
    expect(screen.getByText('Rige hoy')).toBeVisible();
    expect(screen.getByText(/2 partidos/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'EXP-000001' })).toHaveAttribute(
      'href',
      `#/disciplina/${CASE_ID}`,
    );
    await userEvent.click(screen.getByLabelText('Solo las que rigen hoy'));
    await vi.waitFor(() =>
      expect(api.calls.at(-1)!.query.get('active')).toBe('true'),
    );
  });
});

describe('incidencias', () => {
  it('ofrece abrir un expediente solo a quien lo gestiona', async () => {
    mockApi({ 'GET /incidents': () => page([INCIDENT]) });
    const { unmount } = render(
      <DisciplinePage permissions={['incidents:read']} />,
    );
    expect(
      await screen.findByText('Insultos reiterados a la terna'),
    ).toBeVisible();
    expect(screen.getByText('Sin expediente')).toBeVisible();
    unmount();

    mockApi({
      'GET /incidents': () => page([INCIDENT]),
      'GET /cases': () => page([]),
      'POST /cases': () => json({ id: CASE_ID, code: 'EXP-000001' }, 201),
    });
    render(
      <DisciplinePage
        permissions={['incidents:read', 'cases:read', 'cases:manage']}
      />,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Abrir expediente' }),
    );
    // Pasa a expedientes con el formulario precargado desde la incidencia.
    expect(
      await screen.findByDisplayValue('Insultos reiterados a la terna'),
    ).toBeVisible();
    expect(screen.getByText(/Se vincularán: 1 incidencia\(s\)/)).toBeVisible();
  });

  it('el diálogo de reporte exige la descripción y envía los datos', async () => {
    const api = mockApi({
      [`POST /events/${EVENT_ID}/incidents`]: () => json({ id: 'i1' }, 201),
    });
    const onReported = vi.fn();
    render(
      <IncidentDialog
        eventId={EVENT_ID}
        title="Local vs Visitante"
        clubs={[{ id: CLUB_ID, name: 'Deportivo Quero' }]}
        canListAthletes={false}
        onClose={() => undefined}
        onReported={onReported}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Reportar incidencia' }),
    );
    expect(
      screen.getByText('Describa lo ocurrido (mínimo 5 caracteres).'),
    ).toBeVisible();
    expect(api.calls).toHaveLength(0);

    await userEvent.selectOptions(
      screen.getByLabelText('Tipo de incidencia'),
      'invasion_campo',
    );
    await userEvent.selectOptions(
      screen.getByLabelText('Club involucrado'),
      CLUB_ID,
    );
    await userEvent.type(
      screen.getByLabelText(/Descripción/),
      'Hinchas en la cancha',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Reportar incidencia' }),
    );
    await vi.waitFor(() => expect(onReported).toHaveBeenCalled());
    expect(api.of('POST', `/events/${EVENT_ID}/incidents`)[0]!.body).toEqual({
      type: 'invasion_campo',
      description: 'Hinchas en la cancha',
      clubId: CLUB_ID,
      athleteId: null,
    });
  });

  it('muestra el error del servidor al reportar', async () => {
    mockApi({
      [`POST /events/${EVENT_ID}/incidents`]: () =>
        error(
          403,
          'Solo puede reportar incidencias de los partidos en que está designado',
        ),
    });
    render(
      <IncidentDialog
        eventId={EVENT_ID}
        title="Local vs Visitante"
        clubs={[]}
        canListAthletes={false}
        onClose={() => undefined}
        onReported={() => undefined}
      />,
    );
    await userEvent.type(
      screen.getByLabelText(/Descripción/),
      'Algo ocurrió aquí',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Reportar incidencia' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'en que está designado',
    );
  });
});

describe('reclamos', () => {
  it('un club presenta un reclamo validando los campos', async () => {
    const api = mockApi({
      'GET /complaints': () => page([]),
      'GET /clubs': () =>
        page([{ id: CLUB_ID, name: 'Deportivo Quero', status: 'activo' }]),
      'GET /championships': () => page([{ id: CHAMP_ID, name: 'Torneo 2026' }]),
      'POST /complaints': () => json(COMPLAINT, 201),
      [`GET /complaints/${COMPLAINT_ID}`]: () =>
        json({ ...COMPLAINT, attachments: [] }),
    });
    render(
      <DisciplinePage permissions={['complaints:read', 'complaints:submit']} />,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nuevo reclamo' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Presentar reclamo' }),
    );
    expect(screen.getByText('Seleccione el club que reclama.')).toBeVisible();
    expect(screen.getByText('Seleccione el campeonato.')).toBeVisible();
    expect(api.of('POST', '/complaints')).toHaveLength(0);

    await userEvent.selectOptions(
      await screen.findByLabelText(/Club que reclama/),
      CLUB_ID,
    );
    await userEvent.selectOptions(
      screen.getByLabelText(/Campeonato/),
      CHAMP_ID,
    );
    await userEvent.type(
      screen.getByLabelText(/Asunto/),
      'Alineación indebida del rival',
    );
    await userEvent.type(
      screen.getByLabelText(/Descripción de los hechos/),
      'Jugó un deportista no inscrito.',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Presentar reclamo' }),
    );
    expect(await screen.findByText(/Se presentó el reclamo/)).toBeVisible();
    expect(api.of('POST', '/complaints')[0]!.body).toMatchObject({
      clubId: CLUB_ID,
      championshipId: CHAMP_ID,
    });
    // Se abre el detalle para adjuntar evidencia.
    expect(
      await screen.findByLabelText(/Archivo \(PDF o imagen/),
    ).toBeVisible();
  });

  it('la comisión desestima con motivo y abre expediente desde el reclamo', async () => {
    const api = mockApi({
      'GET /complaints': () => page([COMPLAINT]),
      [`POST /complaints/${COMPLAINT_ID}/dismiss`]: () => json({}),
      'GET /cases': () => page([]),
    });
    render(
      <DisciplinePage
        permissions={['complaints:read', 'cases:read', 'cases:manage']}
      />,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Desestimar' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Desestimar reclamo' }),
    );
    expect(api.of('POST', `/complaints/${COMPLAINT_ID}/dismiss`)).toHaveLength(
      0,
    );
    await userEvent.type(
      within(dialog).getByRole('textbox'),
      'No está comprobado',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Desestimar reclamo' }),
    );
    expect(await screen.findByText('Se desestimó el reclamo.')).toBeVisible();
    expect(
      api.of('POST', `/complaints/${COMPLAINT_ID}/dismiss`)[0]!.body,
    ).toEqual({ reason: 'No está comprobado' });
  });
});

describe('expediente', () => {
  const routes = (detail: CaseDetail) => ({
    [`GET /cases/${CASE_ID}`]: () => json(detail),
    'GET /cases/reviewers': () =>
      json([{ id: 'u2', displayName: 'Rosa Revisora' }]),
    'GET /championships': () => page([{ id: CHAMP_ID, name: 'Torneo 2026' }]),
    'GET /clubs': () => page([]),
    'GET /athletes': () => page([]),
    'GET /teams': () => page([]),
  });

  it('muestra el historial, los vínculos y las sanciones', async () => {
    mockApi(routes(CASE));
    render(<CaseDetailPage caseId={CASE_ID} permissions={['cases:read']} />);
    expect(
      await screen.findByRole('heading', { name: /EXP-000001/ }),
    ).toBeVisible();
    expect(screen.getByText('Expediente EXP-000001 abierto')).toBeVisible();
    expect(screen.getByText(/Insultos reiterados a la terna/)).toBeVisible();
    expect(screen.getByText('Rige hoy')).toBeVisible();
    // Solo lectura: sin acciones.
    expect(
      screen.queryByRole('button', { name: 'Resolver expediente' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Marcar cumplida' }),
    ).not.toBeInTheDocument();
  });

  it('resuelve exigiendo una resolución documentada', async () => {
    const api = mockApi({
      ...routes(CASE),
      [`POST /cases/${CASE_ID}/resolve`]: () => json({ status: 'resuelto' }),
    });
    render(
      <CaseDetailPage
        caseId={CASE_ID}
        permissions={['cases:read', 'cases:resolve']}
      />,
    );
    const button = await screen.findByRole('button', {
      name: 'Resolver expediente',
    });
    expect(button).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText('Resolución'),
      'Se sanciona con dos partidos de suspensión.',
    );
    await userEvent.click(button);
    expect(await screen.findByText('Se resolvió el expediente.')).toBeVisible();
    expect(api.of('POST', `/cases/${CASE_ID}/resolve`)[0]!.body).toEqual({
      resolution: 'Se sanciona con dos partidos de suspensión.',
    });
  });

  it('anula una sanción con motivo obligatorio', async () => {
    const api = mockApi({
      ...routes(CASE),
      'POST /sanctions/s1/annul': () => json({}),
    });
    render(
      <CaseDetailPage
        caseId={CASE_ID}
        permissions={['cases:read', 'sanctions:manage']}
      />,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Anular' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(
      within(dialog).getByRole('textbox'),
      'Se aceptó la apelación',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Anular sanción' }),
    );
    expect(await screen.findByText('Se anuló la sanción.')).toBeVisible();
    expect(api.of('POST', '/sanctions/s1/annul')[0]!.body).toEqual({
      reason: 'Se aceptó la apelación',
    });
  });

  it('publica con título y resumen, y avisa de que no se nombren personas', async () => {
    const resolved: CaseDetail = {
      ...CASE,
      status: 'resuelto',
      resolution: 'Se sanciona con dos partidos.',
      resolvedBy: 'Comisión',
      resolvedAt: '2026-06-28T10:00:00.000Z',
    };
    const api = mockApi({
      ...routes(resolved),
      [`POST /cases/${CASE_ID}/publish`]: () =>
        error(
          400,
          'El texto público no debe mencionar por su nombre a deportistas del expediente.',
        ),
    });
    render(
      <CaseDetailPage
        caseId={CASE_ID}
        permissions={['cases:read', 'cases:publish']}
      />,
    );
    expect(await screen.findByText(/sin nombres de personas/)).toBeVisible();
    const button = screen.getByRole('button', { name: 'Publicar resolución' });
    expect(button).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText('Título público'),
      'Resolución disciplinaria',
    );
    await userEvent.type(
      screen.getByLabelText('Resumen público'),
      'Se sancionó con dos partidos a un deportista del club.',
    );
    await userEvent.click(button);
    expect(await screen.findByText(/no debe mencionar/)).toBeVisible();
    expect(api.of('POST', `/cases/${CASE_ID}/publish`)).toHaveLength(1);
  });

  it('registra una sanción validando los datos propios de cada tipo', async () => {
    const api = mockApi({
      ...routes(CASE),
      'GET /clubs': () =>
        page([{ id: CLUB_ID, name: 'Deportivo Quero', status: 'activo' }]),
      [`POST /cases/${CASE_ID}/sanctions`]: () => json({}, 201),
    });
    render(
      <CaseDetailPage
        caseId={CASE_ID}
        permissions={['cases:read', 'sanctions:manage']}
      />,
    );
    await userEvent.selectOptions(
      await screen.findByLabelText('Se sanciona a'),
      'club',
    );
    await userEvent.selectOptions(
      await screen.findByLabelText(/Sancionado/),
      CLUB_ID,
    );
    await userEvent.selectOptions(
      screen.getByLabelText('Tipo de sanción'),
      'suspension_partidos',
    );
    await userEvent.type(
      screen.getByLabelText(/Motivo/),
      'Reiteración de la falta',
    );
    await userEvent.type(screen.getByLabelText(/Desde/), '2026-07-01');
    await userEvent.click(
      screen.getByRole('button', { name: 'Registrar sanción' }),
    );
    expect(screen.getByText('Indique el número de partidos.')).toBeVisible();
    expect(api.of('POST', `/cases/${CASE_ID}/sanctions`)).toHaveLength(0);

    await userEvent.type(screen.getByLabelText('Número de partidos'), '3');
    await userEvent.click(
      screen.getByRole('button', { name: 'Registrar sanción' }),
    );
    expect(await screen.findByText('Se registró la sanción.')).toBeVisible();
    expect(
      api.of('POST', `/cases/${CASE_ID}/sanctions`)[0]!.body,
    ).toMatchObject({
      clubId: CLUB_ID,
      athleteId: null,
      teamId: null,
      type: 'suspension_partidos',
      matchesCount: 3,
      startsAt: '2026-07-01',
    });
  });
});
