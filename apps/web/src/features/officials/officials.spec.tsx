import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { error, json, mockApi, noContent, page } from '../../test/mockApi.ts';
import { EventAssignmentsDialog } from './EventAssignmentsDialog.tsx';
import { MyAssignmentsPage } from './MyAssignmentsPage.tsx';
import { OfficialDetailPage } from './OfficialDetailPage.tsx';
import { OfficialsPage } from './OfficialsPage.tsx';
import type { Official } from './types.ts';

const SPORT_ID = '0197aaaa-0000-7000-8000-0000000000b1';
const OFFICIAL_ID = '0197aaaa-0000-7000-8000-0000000000d1';
const EVENT_ID = '0197aaaa-0000-7000-8000-0000000000e1';
const ASSIGNMENT_ID = '0197aaaa-0000-7000-8000-0000000000f1';

const OFFICIAL: Official = {
  id: OFFICIAL_ID,
  firstName: 'Carlos',
  lastName: 'Mena',
  status: 'activo',
  licenseNumber: 'LIC-001',
  club: null,
  sports: [{ id: SPORT_ID, code: 'futbol', name: 'Fútbol' }],
  hasAccount: false,
  phone: '0991112222',
  account: null,
  createdAt: '2026-06-01T00:00:00.000Z',
};

const baseRoutes = () => ({
  'GET /sports': () =>
    page([{ id: SPORT_ID, code: 'futbol', name: 'Fútbol', status: 'activo' }]),
  'GET /clubs': () => page([]),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registro de árbitros y jueces', () => {
  it('lista oficiales y filtra por deporte', async () => {
    const api = mockApi({
      ...baseRoutes(),
      'GET /officials': () => page([OFFICIAL]),
    });
    render(<OfficialsPage permissions={['officials:read']} />);
    expect(await screen.findByText('Mena, Carlos')).toBeVisible();
    expect(screen.getByText('LIC-001')).toBeVisible();
    // Sin permiso de gestión no hay alta ni edición.
    expect(
      screen.queryByRole('button', { name: 'Nuevo oficial' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Editar' }),
    ).not.toBeInTheDocument();

    await userEvent.selectOptions(
      await screen.findByLabelText('Deporte'),
      SPORT_ID,
    );
    await vi.waitFor(() =>
      expect(api.calls.at(-1)!.query.get('sportId')).toBe(SPORT_ID),
    );
  });

  it('exige nombres y al menos un deporte, y registra al oficial', async () => {
    const api = mockApi({
      ...baseRoutes(),
      'GET /officials': () => page([]),
      'POST /officials': () => json(OFFICIAL, 201),
    });
    render(
      <OfficialsPage permissions={['officials:read', 'officials:manage']} />,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nuevo oficial' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText('Los nombres son obligatorios.')).toBeVisible();
    expect(screen.getByText('Seleccione al menos un deporte.')).toBeVisible();
    expect(api.of('POST', '/officials')).toHaveLength(0);

    await userEvent.type(screen.getByLabelText(/Nombres/), 'Carlos');
    await userEvent.type(screen.getByLabelText(/Apellidos/), 'Mena');
    await userEvent.click(await screen.findByLabelText('Fútbol'));
    await userEvent.type(
      screen.getByLabelText('Correo de su cuenta del sistema'),
      'carlos@liga.example',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Se registró a Carlos Mena.')).toBeVisible();
    expect(api.of('POST', '/officials')[0]!.body).toMatchObject({
      firstName: 'Carlos',
      lastName: 'Mena',
      sportIds: [SPORT_ID],
      userEmail: 'carlos@liga.example',
      clubId: null,
    });
  });

  it('muestra el error del servidor al guardar', async () => {
    mockApi({
      ...baseRoutes(),
      'GET /officials': () => page([OFFICIAL]),
      [`PATCH /officials/${OFFICIAL_ID}`]: () =>
        error(409, 'Esa cuenta ya está vinculada a otro oficial'),
    });
    render(
      <OfficialsPage permissions={['officials:read', 'officials:manage']} />,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Editar' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esa cuenta ya está vinculada a otro oficial',
    );
  });
});

describe('ficha del oficial', () => {
  it('registra y quita períodos de indisponibilidad y muestra el historial', async () => {
    let unavailabilities = [
      {
        id: 'u1',
        startsAt: '2099-01-01T10:00:00.000Z',
        endsAt: '2099-01-02T10:00:00.000Z',
        reason: 'Viaje',
      },
    ];
    const api = mockApi({
      [`GET /officials/${OFFICIAL_ID}`]: () =>
        json({ ...OFFICIAL, unavailabilities, upcomingAssignments: 2 }),
      [`GET /officials/${OFFICIAL_ID}/history`]: () =>
        page([
          {
            id: ASSIGNMENT_ID,
            role: 'arbitro_central',
            status: 'confirmado',
            event: {
              id: EVENT_ID,
              scheduledAt: '2026-06-25T15:00:00.000Z',
              status: 'finalizado',
            },
            championship: { id: 'c1', name: 'Torneo 2026', sport: 'Fútbol' },
          },
        ]),
      [`POST /officials/${OFFICIAL_ID}/unavailability`]: () => json({}, 201),
      [`DELETE /officials/${OFFICIAL_ID}/unavailability/u1`]: () => {
        unavailabilities = [];
        return noContent();
      },
    });
    render(
      <OfficialDetailPage
        officialId={OFFICIAL_ID}
        permissions={['officials:read', 'officials:manage']}
      />,
    );
    expect(
      await screen.findByRole('heading', { name: 'Carlos Mena' }),
    ).toBeVisible();
    expect(screen.getByText('0991112222')).toBeVisible();
    expect(await screen.findByText('Torneo 2026')).toBeVisible();
    expect(screen.getByText('Árbitro central')).toBeVisible();

    await userEvent.type(screen.getByLabelText('Desde'), '2099-03-01T08:00');
    await userEvent.type(screen.getByLabelText('Hasta'), '2099-03-02T08:00');
    await userEvent.type(screen.getByLabelText('Motivo'), 'Estudios');
    await userEvent.click(
      screen.getByRole('button', { name: 'Agregar período' }),
    );
    expect(await screen.findByText('Se registró el período.')).toBeVisible();
    expect(
      api.of('POST', `/officials/${OFFICIAL_ID}/unavailability`)[0]!.body,
    ).toMatchObject({ reason: 'Estudios' });

    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(await screen.findByText('Se quitó el período.')).toBeVisible();
    expect(
      await screen.findByText('No hay períodos de indisponibilidad.'),
    ).toBeVisible();
  });

  it('sin permiso de gestión no ofrece registrar disponibilidad', async () => {
    const { phone: _phone, account: _account, ...restricted } = OFFICIAL;
    mockApi({
      [`GET /officials/${OFFICIAL_ID}`]: () =>
        json({ ...restricted, unavailabilities: [], upcomingAssignments: 0 }),
      [`GET /officials/${OFFICIAL_ID}/history`]: () => page([]),
    });
    render(
      <OfficialDetailPage
        officialId={OFFICIAL_ID}
        permissions={['officials:read']}
      />,
    );
    await screen.findByRole('heading', { name: 'Carlos Mena' });
    expect(screen.queryByText('Teléfono')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Agregar período' }),
    ).not.toBeInTheDocument();
  });
});

describe('designaciones de un partido', () => {
  it('muestra los conflictos del candidato y designa al elegido', async () => {
    const api = mockApi({
      [`GET /events/${EVENT_ID}/assignments`]: () => json([]),
      [`GET /events/${EVENT_ID}/assignment-candidates`]: () =>
        json([
          {
            id: OFFICIAL_ID,
            firstName: 'Carlos',
            lastName: 'Mena',
            alreadyAssigned: false,
            conflicts: [
              {
                code: 'traslape',
                message:
                  'El oficial ya tiene otra designación en un horario cercano',
              },
            ],
          },
          {
            id: 'o2',
            firstName: 'Ana',
            lastName: 'Lema',
            alreadyAssigned: false,
            conflicts: [],
          },
        ]),
      [`POST /events/${EVENT_ID}/assignments`]: () => json({}, 201),
    });
    render(
      <EventAssignmentsDialog
        eventId={EVENT_ID}
        title="Local vs Visitante"
        canManage
        onClose={() => undefined}
      />,
    );
    expect(
      await screen.findByText('Este partido no tiene oficiales designados.'),
    ).toBeVisible();
    await userEvent.selectOptions(
      await screen.findByLabelText('Oficial'),
      OFFICIAL_ID,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'horario cercano',
    );
    expect(
      screen.getByRole('option', { name: 'Mena, Carlos (con conflicto)' }),
    ).toBeVisible();

    await userEvent.selectOptions(screen.getByLabelText('Oficial'), 'o2');
    await userEvent.selectOptions(
      screen.getByLabelText('Función'),
      'asistente_1',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Designar' }));
    expect(
      await screen.findByText('Se registró la designación.'),
    ).toBeVisible();
    expect(api.of('POST', `/events/${EVENT_ID}/assignments`)[0]!.body).toEqual({
      officialId: 'o2',
      role: 'asistente_1',
    });
  });

  it('en solo lectura lista las designaciones sin ofrecer cambios', async () => {
    mockApi({
      [`GET /events/${EVENT_ID}/assignments`]: () =>
        json([
          {
            id: ASSIGNMENT_ID,
            role: 'arbitro_central',
            roleLabel: 'árbitro central',
            status: 'confirmado',
            notes: null,
            responseNote: null,
            respondedAt: null,
            official: {
              id: OFFICIAL_ID,
              firstName: 'Carlos',
              lastName: 'Mena',
            },
          },
        ]),
    });
    render(
      <EventAssignmentsDialog
        eventId={EVENT_ID}
        title="Local vs Visitante"
        canManage={false}
        onClose={() => undefined}
      />,
    );
    const item = (await screen.findByText(/Mena, Carlos/)).closest('li')!;
    expect(within(item).getByText(/Confirmada/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Retirar' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Designar un oficial')).not.toBeInTheDocument();
  });
});

describe('mis designaciones', () => {
  const mine = {
    linked: true,
    page: 1,
    pageSize: 20,
    total: 1,
    items: [
      {
        id: ASSIGNMENT_ID,
        role: 'arbitro_central',
        roleLabel: 'árbitro central',
        status: 'designado',
        responseNote: null,
        event: {
          id: EVENT_ID,
          scheduledAt: '2099-06-25T15:00:00.000Z',
          status: 'programado',
          match: 'Local vs Visitante',
          venue: { name: 'Estadio Cantonal', address: null },
        },
        championship: { id: 'c1', name: 'Torneo 2026' },
      },
    ],
  };

  it('explica cuando la cuenta no está vinculada a un oficial', async () => {
    mockApi({
      'GET /assignments/mine': () =>
        json({ linked: false, items: [], page: 1, pageSize: 20, total: 0 }),
    });
    render(<MyAssignmentsPage permissions={['assignments:read_own']} />);
    expect(
      await screen.findByText(/no está vinculada a un árbitro o juez/),
    ).toBeVisible();
  });

  it('confirma una designación', async () => {
    const api = mockApi({
      'GET /assignments/mine': () => json(mine),
      [`POST /assignments/${ASSIGNMENT_ID}/respond`]: () => json({}),
    });
    render(<MyAssignmentsPage permissions={['assignments:read_own']} />);
    expect(await screen.findByText('Local vs Visitante')).toBeVisible();
    expect(screen.getByText(/Estadio Cantonal/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Confirmó su designación.')).toBeVisible();
    expect(
      api.of('POST', `/assignments/${ASSIGNMENT_ID}/respond`)[0]!.body,
    ).toEqual({ response: 'confirmar', reason: null });
  });

  it('exige el motivo para rechazar y avisa del resultado', async () => {
    const api = mockApi({
      'GET /assignments/mine': () => json(mine),
      [`POST /assignments/${ASSIGNMENT_ID}/respond`]: () => json({}),
    });
    render(<MyAssignmentsPage permissions={['assignments:read_own']} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Rechazar' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Rechazar designación' }),
    );
    expect(
      api.of('POST', `/assignments/${ASSIGNMENT_ID}/respond`),
    ).toHaveLength(0);
    await userEvent.type(
      within(dialog).getByRole('textbox'),
      'Viaje de trabajo',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Rechazar designación' }),
    );
    expect(await screen.findByText(/Rechazó la designación/)).toBeVisible();
    expect(
      api.of('POST', `/assignments/${ASSIGNMENT_ID}/respond`)[0]!.body,
    ).toEqual({ response: 'rechazar', reason: 'Viaje de trabajo' });
  });
});
