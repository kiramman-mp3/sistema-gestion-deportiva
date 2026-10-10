import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { error, json, mockApi, page } from '../../test/mockApi.ts';
import { AdminHome } from './AdminHome.tsx';
import type { Championship } from '../competitions/types.ts';
import type { MyAssignmentsPageData } from '../officials/types.ts';
import type { PublicHome } from '../public/types.ts';

const SAMPLE_PUBLIC_HOME: PublicHome = {
  institution: {
    name: 'Liga Cantonal de Quero',
    shortName: 'Liga Quero',
    affiliation: null,
    canton: 'Quero',
    address: 'Quero, Tungurahua',
    email: 'info@liga.invalid',
    phone: '0991112233',
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
      resolutions: true,
    },
  },
  news: [],
  upcoming: [
    {
      id: 'evt-1',
      scheduledAt: '2026-06-15T15:00:00.000Z',
      status: 'programado',
      postponementReason: null,
      venue: { id: 'v-1', name: 'Estadio Central' },
      stage: 'Fase Regular',
      round: 'Fecha 1',
      championship: {
        id: 'champ-1',
        name: 'Torneo Apertura 2026',
        sport: { id: 'sp-1', code: 'futbol', name: 'Fútbol' },
        category: { id: 'cat-1', name: 'Senior' },
        season: { id: 'sea-1', name: '2026' },
      },
      participants: [
        {
          id: 'part-1',
          side: 'local',
          name: 'Club Sport Quero',
          clubName: 'Club Sport Quero',
          score: null,
          outcome: null,
        },
        {
          id: 'part-2',
          side: 'visitante',
          name: 'Atlético Quero',
          clubName: 'Atlético Quero',
          score: null,
          outcome: null,
        },
      ],
      hasResult: false,
    },
  ],
  recent: [
    {
      id: 'evt-2',
      scheduledAt: '2026-06-10T15:00:00.000Z',
      status: 'finalizado',
      postponementReason: null,
      venue: { id: 'v-1', name: 'Estadio Central' },
      stage: 'Fase Regular',
      round: 'Fecha 1',
      championship: {
        id: 'champ-1',
        name: 'Torneo Apertura 2026',
        sport: { id: 'sp-1', code: 'futbol', name: 'Fútbol' },
        category: { id: 'cat-1', name: 'Senior' },
        season: { id: 'sea-1', name: '2026' },
      },
      participants: [
        {
          id: 'part-3',
          side: 'local',
          name: 'Club Sport Quero',
          clubName: 'Club Sport Quero',
          score: 2,
          outcome: 'victoria',
        },
        {
          id: 'part-4',
          side: 'visitante',
          name: 'Atlético Quero',
          clubName: 'Atlético Quero',
          score: 1,
          outcome: 'derrota',
        },
      ],
      hasResult: true,
    },
  ],
};

const SAMPLE_CHAMPIONSHIPS: Championship[] = [
  {
    id: 'champ-1',
    name: 'Torneo Apertura 2026',
    format: 'todos_contra_todos',
    status: 'en_curso',
    season: { id: 'sea-1', name: '2026', status: 'activa' },
    sport: { id: 'sp-1', code: 'futbol', name: 'Fútbol' },
    category: { id: 'cat-1', code: 'senior', name: 'Senior' },
  },
];

const defaultRoutes = () => ({
  'GET /athletes': () => page([], { total: 7 }),
  'GET /complaints': () => page([], { total: 3 }),
  'GET /cases': () => page([], { total: 2 }),
  'GET /championships': (call: { query: URLSearchParams }) => {
    const status = call.query.get('status');
    if (status === 'inscripciones_abiertas') {
      return page([], { total: 4 });
    }
    return page(SAMPLE_CHAMPIONSHIPS, { total: 1 });
  },
  'GET /assignments/mine': () =>
    json({
      linked: true,
      items: [
        {
          id: 'asg-1',
          role: 'arbitro_central',
          roleLabel: 'Árbitro central',
          status: 'designado',
          responseNote: null,
          event: {
            id: 'evt-1',
            scheduledAt: '2026-06-15T15:00:00.000Z',
            status: 'programado',
            match: 'Club Sport Quero vs Atlético Quero',
            venue: { name: 'Estadio Central', address: 'Quero' },
          },
          championship: { id: 'champ-1', name: 'Torneo Apertura 2026' },
        },
      ],
      page: 1,
      pageSize: 3,
      total: 1,
    } satisfies MyAssignmentsPageData),
  'GET /public/home': () => json(SAMPLE_PUBLIC_HOME),
  'GET /health': () =>
    json({
      status: 'ok',
      service: 'liga-api',
      timestamp: '2026-06-01T00:00:00Z',
    }),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdminHome (spec §11)', () => {
  it('sin permiso no hay petición a esa ruta protegida', async () => {
    const { calls } = mockApi(defaultRoutes());
    // Usuario únicamente con permiso de campeonatos
    render(<AdminHome permissions={['championships:read']} unreadCount={2} />);

    // Esperar a que cargue la información pública y de campeonatos
    expect(
      (await screen.findAllByText('Torneo Apertura 2026'))[0],
    ).toBeInTheDocument();
    expect(screen.getByText('Inscripciones abiertas')).toBeInTheDocument();

    const paths = calls.map((c) => c.path);
    // Rutas permitidas y públicas llamadas
    expect(paths).toContain('/championships');
    expect(paths).toContain('/public/home');

    // Rutas no permitidas NO deben haber sido llamadas
    expect(paths).not.toContain('/athletes');
    expect(paths).not.toContain('/complaints');
    expect(paths).not.toContain('/cases');
    expect(paths).not.toContain('/assignments/mine');
  });

  it('un error 500 en un bloque no afecta a los demás bloques', async () => {
    mockApi({
      ...defaultRoutes(),
      'GET /athletes': () => error(500, 'Error interno del servidor'),
    });

    render(
      <AdminHome
        permissions={[
          'athletes:read',
          'complaints:read',
          'cases:read',
          'championships:read',
        ]}
      />,
    );

    // El bloque con error muestra su estado de error y botón de reintento
    expect(await screen.findByText('Error')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reintentar' }),
    ).toBeInTheDocument();

    // Pero los otros bloques cargaron sus métricas y contenido exitosamente
    expect(await screen.findByText('3')).toBeInTheDocument(); // reclamos
    expect(screen.getByText('2')).toBeInTheDocument(); // expedientes
    expect(screen.getByText('4')).toBeInTheDocument(); // inscripciones abiertas
    expect(screen.getAllByText('Torneo Apertura 2026')[0]).toBeInTheDocument();
  });

  it('muestra «de sus clubes» cuando el usuario no tiene clubs:access_all', async () => {
    mockApi(defaultRoutes());

    const { rerender } = render(
      <AdminHome permissions={['athletes:read', 'complaints:read']} />,
    );

    expect(
      await screen.findByText('Deportistas por habilitar de sus clubes'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Reclamos recibidos de sus clubes'),
    ).toBeInTheDocument();

    // Con clubs:access_all, la etiqueta no añade «de sus clubes»
    rerender(
      <AdminHome
        permissions={['athletes:read', 'complaints:read', 'clubs:access_all']}
      />,
    );

    expect(
      await screen.findByText('Deportistas por habilitar'),
    ).toBeInTheDocument();
    expect(screen.getByText('Reclamos recibidos')).toBeInTheDocument();
  });

  it('muestra aviso explicativo cuando linked: false en mis designaciones', async () => {
    mockApi({
      ...defaultRoutes(),
      'GET /assignments/mine': () =>
        json({
          linked: false,
          items: [],
          page: 1,
          pageSize: 3,
          total: 0,
        } satisfies MyAssignmentsPageData),
    });

    render(<AdminHome permissions={['assignments:read_own']} />);

    expect(
      await screen.findByText(
        'Su cuenta no está vinculada a un árbitro u oficial de mesa.',
      ),
    ).toBeInTheDocument();
  });
});
