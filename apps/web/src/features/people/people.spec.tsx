import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCsrfToken } from '../../api/client.ts';
import { CatalogsApp } from '../catalogs/CatalogsApp.tsx';
import { error, json, mockApi, noContent, page } from '../../test/mockApi.ts';
import { AthleteDetailPage } from './AthleteDetailPage.tsx';
import { AthletesPage } from './AthletesPage.tsx';
import { ClubsPage } from './ClubsPage.tsx';
import { TeamDetailPage } from './TeamDetailPage.tsx';
import type {
  Athlete,
  Club,
  Consent,
  RosterEntry,
  TeamDetail,
} from './types.ts';

const CLUB_ID = '0197aaaa-0000-7000-8000-0000000000c1';
const ATH_ID = '0197aaaa-0000-7000-8000-0000000000d1';
const TEAM_ID = '0197aaaa-0000-7000-8000-0000000000e1';
const SEASON_ID = '0197aaaa-0000-7000-8000-0000000000f1';
const CONSENT_ID = '0197aaaa-0000-7000-8000-0000000000b1';
const MEMBER_ID = '0197aaaa-0000-7000-8000-0000000000a1';

const CLUB: Club = {
  id: CLUB_ID,
  name: 'Deportivo Quero',
  shortName: null,
  slug: 'deportivo-quero',
  code: null,
  sector: 'Centro',
  contactEmail: null,
  contactPhone: null,
  status: 'activo',
};

const ATHLETE: Athlete = {
  id: ATH_ID,
  code: 'DEP-000001',
  firstName: 'María',
  lastName: 'Pérez',
  status: 'activo',
  eligibility: 'pendiente',
  publicProfile: false,
  club: { id: CLUB_ID, name: 'Deportivo Quero' },
};
const FULL: Athlete = {
  ...ATHLETE,
  full: {
    birthDate: '2012-05-04',
    age: 14,
    idType: 'cedula',
    idNumber: '1710034065',
    phone: '0991234567',
    guardianName: 'Rosa Pérez',
    guardianRelation: 'madre',
    guardianPhone: null,
  },
};

const CONSENT: Consent = {
  id: CONSENT_ID,
  type: 'publicacion_perfil',
  status: 'otorgado',
  purpose: null,
  grantedByName: 'Rosa Pérez',
  grantedByRelation: 'madre',
  recordedAt: '2026-10-01T15:00:00.000Z',
  expiresAt: null,
  revokedAt: null,
  revokeReason: null,
  active: true,
};

const TEAM: TeamDetail = {
  id: TEAM_ID,
  name: 'Halcones',
  status: 'activo',
  club: { id: CLUB_ID, name: 'Deportivo Quero' },
  sport: { id: 's1', name: 'Fútbol' },
  seasons: [
    {
      id: 'ts1',
      teamId: TEAM_ID,
      name: 'Halcones del Sur',
      rosterClosed: false,
      activeMembers: 1,
      season: {
        id: SEASON_ID,
        name: 'Temporada 2026',
        status: 'activa',
        startDate: '2026-01-01',
      },
      category: { id: 'c1', name: 'Infantil', ageMin: 10, ageMax: 14 },
    },
  ],
};
const ROSTER: RosterEntry[] = [
  {
    id: MEMBER_ID,
    status: 'activo',
    jerseyNumber: 9,
    leaveReason: null,
    athlete: {
      id: ATH_ID,
      code: 'DEP-000001',
      firstName: 'María',
      lastName: 'Pérez',
      eligibility: 'habilitado',
    },
  },
];

beforeEach(() => {
  setCsrfToken('csrf-de-prueba');
  window.location.hash = '';
});
afterEach(() => vi.unstubAllGlobals());

async function typeReason(text: string) {
  const dialog = screen.getByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText(/Motivo/), text);
  return dialog;
}

describe('clubes', () => {
  it('la Liga puede crear clubes y cambiar su estado con motivo', async () => {
    const api = mockApi({
      'GET /clubs': () => page([CLUB]),
      'POST /clubs': () =>
        json({ ...CLUB, id: 'nuevo', name: 'Club Nuevo' }, 201),
      [`PATCH /clubs/${CLUB_ID}/status`]: () =>
        json({ ...CLUB, status: 'inactivo' }),
    });
    render(
      <ClubsPage
        permissions={['clubs:read', 'clubs:manage', 'clubs:access_all']}
      />,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Nuevo club' }),
    );
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Club Nuevo');
    await userEvent.click(screen.getByRole('button', { name: 'Crear club' }));
    expect(
      await screen.findByText(/Se creó el club Club Nuevo/),
    ).toBeInTheDocument();
    expect(api.of('POST', '/clubs')[0]!.body).toEqual({ name: 'Club Nuevo' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Desactivar Deportivo Quero' }),
    );
    const dialog = await typeReason('Cierre de temporada');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Desactivar' }),
    );
    expect(
      await screen.findByText(/Se actualizó el estado/),
    ).toBeInTheDocument();
    expect(api.of('PATCH', `/clubs/${CLUB_ID}/status`)[0]!.body).toEqual({
      status: 'inactivo',
      reason: 'Cierre de temporada',
    });
  });

  it('un dirigente de club no ve controles de creación ni de estado', async () => {
    mockApi({ 'GET /clubs': () => page([CLUB]) });
    render(<ClubsPage permissions={['clubs:read', 'clubs:manage']} />);
    expect(await screen.findByText('Deportivo Quero')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Nuevo club' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Desactivar/ }),
    ).not.toBeInTheDocument();
  });
});

describe('deportistas: listado y alta', () => {
  const routes = () => ({
    'GET /athletes': () => page([ATHLETE]),
    'GET /clubs': () => page([CLUB]),
  });

  it('lista los deportistas con su habilitación y filtra por texto', async () => {
    const api = mockApi(routes());
    render(<AthletesPage permissions={['athletes:read']} />);
    expect(await screen.findByText('Pérez, María')).toBeInTheDocument();
    expect(
      within(screen.getByRole('table')).getByText('Pendiente de validación'),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Buscar por nombre/), 'maría');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('Pérez, María');
    expect(api.calls.at(-1)!.query.get('q')).toBe('maría');
  });

  it('sin permiso de datos completos no ofrece ni envía documento, teléfono ni tutor', async () => {
    const api = mockApi({
      ...routes(),
      'POST /athletes': () => json(ATHLETE, 201),
    });
    render(<AthletesPage permissions={['athletes:read', 'athletes:manage']} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nuevo deportista' }),
    );
    expect(
      screen.queryByLabelText(/Número de documento/),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Teléfono/)).not.toBeInTheDocument();

    await screen.findByRole('option', { name: 'Deportivo Quero' });
    await userEvent.selectOptions(screen.getByLabelText(/Club/), CLUB_ID);
    await userEvent.type(screen.getByLabelText(/Nombres/), 'María');
    await userEvent.type(screen.getByLabelText(/Apellidos/), 'Pérez');
    await userEvent.click(
      screen.getByRole('button', { name: 'Registrar deportista' }),
    );
    expect(
      await screen.findByText(/Se registró a María Pérez \(DEP-000001\)/),
    ).toBeInTheDocument();
    expect(api.of('POST', '/athletes')[0]!.body).toEqual({
      clubId: CLUB_ID,
      firstName: 'María',
      lastName: 'Pérez',
    });
  });

  it('con permiso de datos completos envía el documento y valida los obligatorios', async () => {
    const api = mockApi({
      ...routes(),
      'POST /athletes': () => json(FULL, 201),
    });
    render(
      <AthletesPage
        permissions={['athletes:read', 'athletes:manage', 'athletes:read_full']}
      />,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nuevo deportista' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Registrar deportista' }),
    );
    expect(screen.getByText('Seleccione el club.')).toBeInTheDocument();
    expect(screen.getByText('Ingrese los nombres.')).toBeInTheDocument();
    expect(api.of('POST', '/athletes')).toHaveLength(0);

    await screen.findByRole('option', { name: 'Deportivo Quero' });
    await userEvent.selectOptions(screen.getByLabelText(/Club/), CLUB_ID);
    await userEvent.type(screen.getByLabelText(/Nombres/), 'María');
    await userEvent.type(screen.getByLabelText(/Apellidos/), 'Pérez');
    await userEvent.type(
      screen.getByLabelText(/Número de documento/),
      '1710034065',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Registrar deportista' }),
    );
    await screen.findByText(/Se registró a María Pérez/);
    expect(api.of('POST', '/athletes')[0]!.body).toMatchObject({
      idType: 'cedula',
      idNumber: '1710034065',
    });
  });

  it('ante un posible duplicado ofrece confirmar y reenvía con confirmDuplicate', async () => {
    let attempts = 0;
    const api = mockApi({
      ...routes(),
      'POST /athletes': () =>
        ++attempts === 1
          ? error(
              409,
              'Ya existe una persona con el mismo nombre y fecha de nacimiento.',
            )
          : json(ATHLETE, 201),
    });
    render(<AthletesPage permissions={['athletes:read', 'athletes:manage']} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nuevo deportista' }),
    );
    await screen.findByRole('option', { name: 'Deportivo Quero' });
    await userEvent.selectOptions(screen.getByLabelText(/Club/), CLUB_ID);
    await userEvent.type(screen.getByLabelText(/Nombres/), 'María');
    await userEvent.type(screen.getByLabelText(/Apellidos/), 'Pérez');
    await userEvent.click(
      screen.getByRole('button', { name: 'Registrar deportista' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Es otra persona/ }),
    );
    await screen.findByText(/Se registró a María Pérez/);
    expect(api.of('POST', '/athletes')[1]!.body).toMatchObject({
      confirmDuplicate: true,
    });
  });
});

describe('ficha del deportista', () => {
  const routes = (athlete: Athlete = ATHLETE) => ({
    [`GET /athletes/${ATH_ID}`]: () => json(athlete),
    [`GET /athletes/${ATH_ID}/consents`]: () => json([CONSENT]),
    [`GET /athletes/${ATH_ID}/teams`]: () => json([]),
    'GET /clubs': () => page([CLUB, { ...CLUB, id: 'otro', name: 'Club Dos' }]),
  });
  const render_ = (permissions: string[]) =>
    render(<AthleteDetailPage athleteId={ATH_ID} permissions={permissions} />);

  it('sin permiso de datos completos no muestra datos personales y lo explica', async () => {
    mockApi(routes());
    render_(['athletes:read']);
    expect(
      await screen.findByRole('heading', { name: 'María Pérez' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no están disponibles para su cuenta/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/1710034065/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Editar datos|Publicar/ }),
    ).not.toBeInTheDocument();
  });

  it('con permiso de datos completos muestra edad, documento y tutor', async () => {
    mockApi(routes(FULL));
    render_(['athletes:read', 'athletes:read_full']);
    expect(await screen.findByText(/14 años/)).toBeInTheDocument();
    expect(screen.getByText('cedula: 1710034065')).toBeInTheDocument();
    expect(screen.getAllByText(/Rosa Pérez \(madre\)/).length).toBeGreaterThan(
      0,
    );
  });

  it('habilita con motivo y muestra los impedimentos que informa el servidor', async () => {
    let attempts = 0;
    const api = mockApi({
      ...routes(),
      [`PATCH /athletes/${ATH_ID}/eligibility`]: () =>
        ++attempts === 1
          ? error(409, 'No se puede habilitar: falta la fecha de nacimiento')
          : json({ ...ATHLETE, eligibility: 'habilitado' }),
    });
    render_(['athletes:read', 'athletes:validate']);
    await userEvent.click(
      await screen.findByRole('button', { name: /Marcar como «Habilitado»/ }),
    );
    let dialog = await typeReason('Documentos revisados');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Confirmar' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /falta la fecha de nacimiento/,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /Marcar como «Habilitado»/ }),
    );
    dialog = await typeReason('Documentos completos');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Confirmar' }),
    );
    expect(
      await screen.findByText(/Se actualizó la habilitación/),
    ).toBeInTheDocument();
    expect(api.of('PATCH', `/athletes/${ATH_ID}/eligibility`)[1]!.body).toEqual(
      {
        eligibility: 'habilitado',
        reason: 'Documentos completos',
      },
    );
  });

  it('publicar solo aparece con el permiso de publicación y alterna el estado', async () => {
    const api = mockApi({
      ...routes(),
      [`PUT /athletes/${ATH_ID}/publication`]: () =>
        json({ ...ATHLETE, publicProfile: true }),
    });
    render_(['athletes:read', 'athletes:publish']);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Publicar perfil' }),
    );
    expect(
      await screen.findByText(/Se publicó el perfil resumido/),
    ).toBeInTheDocument();
    expect(api.of('PUT', `/athletes/${ATH_ID}/publication`)[0]!.body).toEqual({
      published: true,
    });
  });

  it('revoca un consentimiento con motivo', async () => {
    const api = mockApi({
      ...routes(),
      [`POST /athletes/${ATH_ID}/consents/${CONSENT_ID}/revoke`]: () =>
        json([]),
    });
    render_(['athletes:read', 'athletes:manage']);
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Revocar consentimiento de Publicación del perfil',
      }),
    );
    const dialog = await typeReason('Retira la autorización');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Confirmar' }),
    );
    expect(
      await screen.findByText(/Se revocó el consentimiento/),
    ).toBeInTheDocument();
    expect(
      api.of('POST', `/athletes/${ATH_ID}/consents/${CONSENT_ID}/revoke`)[0]!
        .body,
    ).toEqual({ reason: 'Retira la autorización' });
  });

  it('transfiere de club solo con el permiso y pidiendo motivo', async () => {
    const api = mockApi({
      ...routes(),
      [`POST /athletes/${ATH_ID}/transfer`]: () => json(ATHLETE),
    });
    render_(['athletes:read', 'athletes:transfer']);
    await screen.findByRole('option', { name: 'Club Dos' });
    await userEvent.selectOptions(
      await screen.findByLabelText('Club de destino'),
      'otro',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Transferir' }));
    const dialog = await typeReason('Cambio de domicilio');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Confirmar' }),
    );
    expect(
      await screen.findByText(/Se transfirió al deportista a Club Dos/),
    ).toBeInTheDocument();
    expect(api.of('POST', `/athletes/${ATH_ID}/transfer`)[0]!.body).toEqual({
      clubId: 'otro',
      reason: 'Cambio de domicilio',
    });
  });
});

describe('equipo y plantilla', () => {
  const base = `/teams/${TEAM_ID}/seasons/${SEASON_ID}`;
  const routes = (team: TeamDetail = TEAM) => ({
    [`GET /teams/${TEAM_ID}`]: () => json(team),
    [`GET ${base}/roster`]: () => json(ROSTER),
    'GET /athletes': () =>
      page([
        {
          ...ATHLETE,
          id: 'a2',
          code: 'DEP-000002',
          firstName: 'Luis',
          lastName: 'Mora',
          eligibility: 'habilitado',
        },
      ]),
  });
  const open = async (permissions: string[]) => {
    render(<TeamDetailPage teamId={TEAM_ID} permissions={permissions} />);
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Ver plantilla de Temporada 2026',
      }),
    );
  };

  it('muestra el nombre del equipo en cada temporada y su plantilla', async () => {
    mockApi(routes());
    await open(['teams:read']);
    expect(
      screen.getByRole('heading', { name: 'Halcones' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Halcones del Sur').length).toBeGreaterThan(0);
    expect(await screen.findByText('María Pérez')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Dar de baja/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Deportista')).not.toBeInTheDocument();
  });

  it('agrega un deportista habilitado y muestra el rechazo del servidor (un equipo por deporte)', async () => {
    let attempts = 0;
    const api = mockApi({
      ...routes(),
      [`POST ${base}/roster`]: () =>
        ++attempts === 1
          ? error(
              409,
              'Ya está inscrito en «Rayos» en este deporte y temporada',
            )
          : json(ROSTER[0], 201),
    });
    await open(['teams:read', 'teams:manage', 'athletes:read']);
    await userEvent.selectOptions(
      await screen.findByLabelText('Deportista'),
      'a2',
    );
    await userEvent.type(screen.getByLabelText(/Número de camiseta/), '7');
    await userEvent.click(
      screen.getByRole('button', { name: 'Agregar a la plantilla' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Ya está inscrito en «Rayos»/,
    );

    await userEvent.selectOptions(screen.getByLabelText('Deportista'), 'a2');
    await userEvent.click(
      screen.getByRole('button', { name: 'Agregar a la plantilla' }),
    );
    expect(
      await screen.findByText(/Se agregó al deportista/),
    ).toBeInTheDocument();
    expect(api.of('POST', `${base}/roster`)[1]!.body).toEqual({
      athleteId: 'a2',
    });
    expect(api.of('POST', `${base}/roster`)[0]!.body).toEqual({
      athleteId: 'a2',
      jerseyNumber: 7,
    });
  });

  it('la baja pide motivo y avisa que no libera el cupo', async () => {
    const api = mockApi({
      ...routes(),
      [`POST ${base}/roster/${MEMBER_ID}/leave`]: () =>
        json({ ...ROSTER[0], status: 'baja' }),
    });
    await open(['teams:read', 'teams:manage']);
    await screen.findByRole('button', { name: 'Dar de baja a María Pérez' });
    expect(
      screen.queryByRole('button', { name: /Anular el alta/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Dar de baja a María Pérez' }),
    );
    const dialog = await typeReason('Se mudó de ciudad');
    expect(within(dialog).getByText(/no libera el cupo/)).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Dar de baja' }),
    );
    expect(await screen.findByText(/Se registró la baja/)).toBeInTheDocument();
    expect(
      api.of('POST', `${base}/roster/${MEMBER_ID}/leave`)[0]!.body,
    ).toEqual({
      reason: 'Se mudó de ciudad',
    });
  });

  it('anular el alta solo está disponible con teams:delete y envía el motivo', async () => {
    const api = mockApi({
      ...routes(),
      [`DELETE ${base}/roster/${MEMBER_ID}`]: () => noContent(),
    });
    await open(['teams:read', 'teams:manage', 'teams:delete']);
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Anular el alta de María Pérez',
      }),
    );
    const dialog = await typeReason('Excepción autorizada');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Anular alta' }),
    );
    expect(await screen.findByText(/Se anuló el alta/)).toBeInTheDocument();
    expect(api.of('DELETE', `${base}/roster/${MEMBER_ID}`)[0]!.body).toEqual({
      reason: 'Excepción autorizada',
    });
  });

  it('una temporada finalizada es solo de consulta', async () => {
    const closed: TeamDetail = {
      ...TEAM,
      seasons: [
        {
          ...TEAM.seasons[0]!,
          season: { ...TEAM.seasons[0]!.season, status: 'finalizada' },
        },
      ],
    };
    mockApi(routes(closed));
    await open(['teams:read', 'teams:manage', 'teams:delete', 'athletes:read']);
    expect(await screen.findByText(/solo de consulta/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /Dar de baja|Anular|Cerrar plantilla/,
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Deportista')).not.toBeInTheDocument();
  });
});

describe('navegación', () => {
  it('muestra Clubes, Deportistas y Equipos solo con el permiso de lectura correspondiente', () => {
    mockApi({});
    const { unmount } = render(
      <CatalogsApp
        permissions={['athletes:read']}
        selfId="yo"
        userName="Usuaria de prueba"
        onLogout={() => undefined}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Secciones' });
    expect(
      within(nav).getByRole('link', { name: 'Deportistas' }),
    ).toBeInTheDocument();
    expect(
      within(nav).queryByRole('link', { name: 'Clubes' }),
    ).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole('link', { name: 'Equipos' }),
    ).not.toBeInTheDocument();
    unmount();
  });
});
