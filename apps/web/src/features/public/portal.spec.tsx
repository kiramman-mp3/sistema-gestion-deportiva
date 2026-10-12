import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { error, json, mockApi, page } from '../../test/mockApi.ts';
import { parsePortalRoute, PublicPortalPage } from './PublicPortalPage.tsx';
import { ScoreboardBand } from './PortalPages.tsx';
import type {
  PublicEventDetail,
  PublicEventSummary,
  PublicInstitution,
} from './types.ts';

const INSTITUTION: PublicInstitution = {
  name: 'Liga Deportiva Cantonal de Quero',
  shortName: 'Liga de Quero',
  affiliation: 'Afiliada a Federación Deportiva de Tungurahua',
  canton: 'Quero - Tungurahua - Ecuador',
  address: 'Calle Bolívar y Sucre',
  email: 'info@liga.example',
  phone: '032 777 000',
  website: null,
  about: 'Somos la Liga del cantón.\n\nOrganizamos cuatro deportes.',
  contactInfo: 'Atención de lunes a viernes.',
  privacyPolicy: null,
  presidentName: 'Presidente Demo',
  secretaryName: null,
  hasLogo: true,
  hasCover: false,
  publication: { clubs: true, athletes: true, news: true, resolutions: true },
};

const EVENT: PublicEventSummary = {
  id: '0197aaaa-0000-7000-8000-0000000000e1',
  scheduledAt: '2099-07-01T15:00:00.000Z',
  status: 'programado',
  postponementReason: null,
  venue: { id: 'v1', name: 'Estadio Cantonal' },
  stage: 'Primera etapa',
  round: 'Fecha 1',
  championship: {
    id: 'c1',
    name: 'Torneo 2026',
    sport: { id: 's1', code: 'futbol', name: 'Fútbol' },
    category: { id: 'k1', name: 'Libre' },
    season: { id: 'se1', name: '2026' },
  },
  participants: [
    {
      id: 'p1',
      side: 'local',
      name: 'Real Quero',
      clubName: 'Club A',
      score: null,
      outcome: null,
    },
    {
      id: 'p2',
      side: 'visitante',
      name: 'Atlético',
      clubName: 'Club B',
      score: null,
      outcome: null,
    },
  ],
  hasResult: false,
};

const withRoute = (hash: string) => {
  window.location.hash = hash;
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('rutas del portal', () => {
  it('interpreta cada dirección compartible', () => {
    expect(parsePortalRoute('#/portal')).toEqual({ page: 'inicio' });
    expect(parsePortalRoute('#/portal/competencias')).toEqual({
      page: 'competencias',
    });
    expect(parsePortalRoute('#/portal/competencias?deporte=futbol')).toEqual({
      page: 'competencias',
      sport: 'futbol',
    });
    expect(parsePortalRoute('#/portal/competencias/champ-123')).toEqual({
      page: 'competencias',
      championshipId: 'champ-123',
    });
    expect(parsePortalRoute('#/portal/calendario')).toEqual({
      page: 'calendario',
    });
    expect(parsePortalRoute('#/portal/partido/abc')).toEqual({
      page: 'partido',
      id: 'abc',
    });
    expect(parsePortalRoute('#/portal/partido')).toEqual({
      page: 'calendario',
    });
    expect(parsePortalRoute('#/portal/noticias')).toEqual({ page: 'noticias' });
    expect(parsePortalRoute('#/portal/noticias/mi-noticia')).toEqual({
      page: 'noticia',
      slug: 'mi-noticia',
    });
    expect(parsePortalRoute('#/portal/clubes')).toEqual({ page: 'clubes' });
    expect(parsePortalRoute('#/portal/resoluciones')).toEqual({
      page: 'resoluciones',
    });
    expect(parsePortalRoute('#/portal/liga')).toEqual({ page: 'liga' });
    expect(parsePortalRoute('#/portal/desconocida')).toEqual({
      page: 'inicio',
    });
  });
});

describe('portal público', () => {
  it('el inicio muestra noticias, próximos partidos y resultados, con el nombre y logotipo de la Liga', async () => {
    withRoute('#/portal');
    mockApi({
      'GET /public/institution': () => json(INSTITUTION),
      'GET /public/home': () =>
        json({
          institution: INSTITUTION,
          news: [
            {
              slug: 'gran-apertura',
              kind: 'noticia',
              title: 'Gran apertura del torneo',
              summary: 'Arranca la temporada con ocho equipos.',
              publishedAt: '2026-06-20T12:00:00.000Z',
              cover: { id: 'm1', altText: 'Cancha llena de público' },
            },
          ],
          upcoming: [EVENT],
          recent: [
            {
              ...EVENT,
              id: 'ev2',
              hasResult: true,
              participants: EVENT.participants.map((p, i) => ({
                ...p,
                score: i === 0 ? 3 : 1,
                outcome: i === 0 ? 'victoria' : 'derrota',
              })),
            },
          ],
        }),
    });
    render(<PublicPortalPage onLoginClick={() => undefined} />);
    expect(
      await screen.findByRole('heading', {
        name: 'Liga Deportiva Cantonal de Quero',
      }),
    ).toBeVisible();
    expect(screen.getByAltText(/Logotipo de Liga Deportiva/)).toHaveAttribute(
      'src',
      '/api/public/institution/logo',
    );
    expect(
      await screen.findByRole('link', { name: 'Gran apertura del torneo' }),
    ).toHaveAttribute('href', '#/portal/noticias/gran-apertura');
    expect(screen.getByAltText('Cancha llena de público')).toHaveAttribute(
      'src',
      '/api/public/media/m1',
    );
    expect(screen.getByText('3 — 1')).toBeVisible();
    expect(screen.getByText('VS')).toBeVisible();
    expect(
      screen.getAllByRole('link', { name: 'Ver detalle del partido' }),
    ).toHaveLength(3);
    // El próximo partido se destaca en la portada y la franja resume la semana.
    expect(
      screen.getByRole('heading', { name: 'Próximo partido' }),
    ).toBeVisible();
    const ticker = screen.getByRole('navigation', {
      name: 'Marcadores de la semana',
    });
    expect(within(ticker).getAllByRole('link')).toHaveLength(2);
    expect(within(ticker).getByText('Final')).toBeVisible();
    expect(
      screen.getByRole('navigation', { name: 'Secciones del portal' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Acceso para dirigentes/ }),
    ).toBeVisible();
  });

  it('oculta del menú lo que la Liga no publica', async () => {
    withRoute('#/portal');
    mockApi({
      'GET /public/institution': () =>
        json({
          ...INSTITUTION,
          publication: {
            clubs: false,
            athletes: false,
            news: false,
            resolutions: false,
          },
        }),
      'GET /public/home': () =>
        json({ institution: INSTITUTION, news: [], upcoming: [], recent: [] }),
    });
    render(<PublicPortalPage />);
    const nav = await screen.findByRole('navigation', {
      name: 'Secciones del portal',
    });
    await vi.waitFor(() =>
      expect(
        within(nav).queryByRole('link', { name: 'Noticias' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(nav).queryByRole('link', { name: 'Clubes' }),
    ).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole('link', { name: 'Resoluciones' }),
    ).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Calendario' })).toBeVisible();
    expect(
      await screen.findByText('No hay partidos programados por ahora.'),
    ).toBeVisible();
  });

  it('una noticia se muestra como texto plano: el HTML no se ejecuta', async () => {
    withRoute('#/portal/noticias/aviso');
    mockApi({
      'GET /public/institution': () => json(INSTITUTION),
      'GET /public/announcements/aviso': () =>
        json({
          slug: 'aviso',
          kind: 'comunicado',
          title: 'Aviso importante',
          summary: 'Resumen del aviso importante.',
          publishedAt: '2026-06-20T12:00:00.000Z',
          cover: null,
          content:
            '<script>window.hackeado = true</script>\n\nSegundo párrafo del aviso.',
        }),
    });
    const { container } = render(<PublicPortalPage />);
    expect(
      await screen.findByRole('heading', { name: 'Aviso importante' }),
    ).toBeVisible();
    expect(
      screen.getByText('<script>window.hackeado = true</script>'),
    ).toBeVisible();
    expect(screen.getByText('Segundo párrafo del aviso.')).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    expect(
      (window as unknown as { hackeado?: boolean }).hackeado,
    ).toBeUndefined();
    expect(
      screen.getByRole('link', { name: '← Todas las noticias' }),
    ).toHaveAttribute('href', '#/portal/noticias');
    expect(screen.getByRole('link', { name: 'Noticias' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('el calendario aplica los filtros y pagina', async () => {
    withRoute('#/portal/calendario');
    const api = mockApi({
      'GET /public/institution': () => json(INSTITUTION),
      'GET /public/championships': () =>
        json({
          items: [
            {
              id: 'c1',
              name: 'Torneo 2026',
              format: 'todos_contra_todos',
              status: 'en_curso',
              startDate: null,
              endDate: null,
              season: { id: 'se1', name: '2026' },
              sport: { id: 's1', code: 'futbol', name: 'Fútbol' },
              category: { id: 'k1', code: 'libre', name: 'Libre' },
              _count: { registrations: 8 },
            },
          ],
          page: 1,
          pageSize: 100,
          total: 1,
        }),
      'GET /public/events': () => page([EVENT]),
    });
    render(<PublicPortalPage />);
    expect(await screen.findByText('Real Quero')).toBeVisible();
    await userEvent.selectOptions(
      await screen.findByLabelText('Deporte'),
      's1',
    );
    await userEvent.type(screen.getByLabelText('Desde'), '2099-07-01');
    await vi.waitFor(() => {
      const last = api.calls.filter((c) => c.path === '/public/events').at(-1)!;
      expect(last.query.get('sportId')).toBe('s1');
      expect(last.query.get('from')).toBe('2099-07-01');
    });
  });

  it('el detalle del partido muestra incidencias y permite imprimir el acta', async () => {
    withRoute(`#/portal/partido/${EVENT.id}`);
    const onPrint = vi.fn();
    const detail: PublicEventDetail = {
      ...EVENT,
      hasResult: true,
      venue: { id: 'v1', name: 'Estadio Cantonal', address: 'Av. Principal' },
      result: {
        approvedAt: '2026-06-25T20:00:00.000Z',
        periodScores: [],
        taekwondoBouts: [],
        chessPairings: [],
        footballEvents: [
          {
            minute: 15,
            eventType: 'gol',
            athleteName: 'Carlos Morocho',
            team: 'Real Quero',
          },
        ],
      },
    };
    mockApi({
      'GET /public/institution': () => json(INSTITUTION),
      [`GET /public/events/${EVENT.id}`]: () => json(detail),
    });
    render(<PublicPortalPage onOpenPrintDocument={onPrint} />);
    expect(
      await screen.findByText(/Min\. 15: Gol — Carlos Morocho \(Real Quero\)/),
    ).toBeVisible();
    expect(screen.getByText(/Av\. Principal/)).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: /Ver \/ imprimir acta oficial/ }),
    );
    expect(onPrint).toHaveBeenCalledWith('acta', EVENT.id);
  });

  it('muestra un mensaje cuando el partido no existe', async () => {
    withRoute('#/portal/partido/0197aaaa-0000-7000-8000-0000000000ff');
    mockApi({
      'GET /public/institution': () => json(INSTITUTION),
      'GET /public/events/0197aaaa-0000-7000-8000-0000000000ff': () =>
        error(404, 'Partido no encontrado'),
    });
    render(<PublicPortalPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Partido no encontrado',
    );
  });

  it('las resoluciones muestran el resumen sin nombres y la página de la Liga, el contacto', async () => {
    withRoute('#/portal/resoluciones');
    mockApi({
      'GET /public/institution': () => json(INSTITUTION),
      'GET /public/resolutions': () =>
        page([
          {
            id: 'r1',
            code: 'EXP-000007',
            title: 'Resolución de la comisión',
            summary: 'Se sancionó a un deportista del club.',
            publishedAt: '2026-06-28T12:00:00.000Z',
            championship: 'Torneo 2026',
            sanctions: [
              {
                type: 'suspension_partidos',
                typeLabel: 'suspensión por partidos',
                subject: 'deportista',
                club: 'Club A',
                team: null,
                startsAt: '2026-06-29',
                endsAt: null,
                matchesCount: 2,
                points: null,
                status: 'vigente',
              },
            ],
          },
        ]),
    });
    render(<PublicPortalPage />);
    expect(await screen.findByText('Resolución de la comisión')).toBeVisible();
    expect(
      screen.getByText(
        /suspensión por partidos a deportista del club Club A, 2 partidos/,
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('link', { name: 'La Liga' }));
    expect(await screen.findByText('Somos la Liga del cantón.')).toBeVisible();
    expect(screen.getByText('Organizamos cuatro deportes.')).toBeVisible();
    expect(screen.getByText('Presidente Demo')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'info@liga.example' }),
    ).toHaveAttribute('href', 'mailto:info@liga.example');
    expect(
      screen.getByText('La política de privacidad todavía no fue publicada.'),
    ).toBeVisible();
  });

  it('permite acceder directamente al detalle de un campeonato por URL compartible y volver al listado', async () => {
    withRoute('#/portal/competencias/c1');
    mockApi({
      'GET /public/institution': () => json(INSTITUTION),
      // El detalle se pide por su id; el listado no debe pedirse (mockApi falla si ocurre).
      'GET /public/championships/c1': () =>
        json({
          id: 'c1',
          name: 'Torneo Oficial 2026',
          format: 'todos_contra_todos',
          status: 'en_curso',
          startDate: null,
          endDate: null,
          season: { id: 'se1', name: '2026' },
          sport: { id: 's1', code: 'futbol', name: 'Fútbol' },
          category: { id: 'k1', code: 'libre', name: 'Libre' },
          _count: { registrations: 8 },
        }),
      'GET /public/championships/c1/fixtures': () => json([]),
      'GET /public/championships/c1/standings': () =>
        json({
          championship: {
            id: 'c1',
            name: 'Torneo Oficial 2026',
            sport: { id: 's1', code: 'futbol', name: 'Fútbol' },
            category: { id: 'k1', code: 'libre', name: 'Libre' },
            season: { id: 'se1', name: '2026' },
          },
          rules: { pointsWin: 3, pointsDraw: 1, pointsLoss: 0 },
          standings: [
            {
              position: 1,
              registrationId: 'reg1',
              participantId: 'p1',
              name: 'Club Alfa',
              clubName: 'Alfa',
              played: 5,
              won: 4,
              drawn: 1,
              lost: 0,
              goalsFor: 12,
              goalsAgainst: 3,
              goalDifference: 9,
              points: 13,
              yellowCards: 4,
              redCards: 0,
            },
          ],
        }),
    });
    render(<PublicPortalPage />);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Torneo Oficial 2026',
      }),
    ).toBeVisible();

    const standingsTab = screen.getByRole('tab', {
      name: /Tabla de Posiciones Oficial/,
    });
    await userEvent.click(standingsTab);
    expect(await screen.findByText('Club Alfa')).toBeVisible();
    expect(screen.getByText('1°')).toBeVisible();
    expect(screen.getByText('+9')).toBeVisible();
    expect(screen.getByText('Amarillas:')).toBeVisible();

    const backBtn = screen.getByRole('button', { name: '← Volver al listado' });
    await userEvent.click(backBtn);
    expect(window.location.hash).toBe('#/portal/competencias');
  });

  it('la dirección ?deporte= abre las competencias filtradas por ese deporte', async () => {
    withRoute('#/portal/competencias?deporte=ajedrez');
    const champ = (id: string, name: string, code: string, sport: string) => ({
      id,
      name,
      format: 'todos_contra_todos',
      status: 'en_curso',
      startDate: null,
      endDate: null,
      season: { id: 'se1', name: '2026' },
      sport: { id: code, code, name: sport },
      category: { id: 'k1', code: 'libre', name: 'Libre' },
      _count: { registrations: 4 },
    });
    mockApi({
      'GET /public/institution': () => json(INSTITUTION),
      'GET /public/championships': () =>
        page([
          champ('c1', 'Copa de Fútbol', 'futbol', 'Fútbol'),
          champ('c2', 'Abierto de Ajedrez', 'ajedrez', 'Ajedrez'),
        ]),
    });
    render(<PublicPortalPage />);
    expect(await screen.findByText('Abierto de Ajedrez')).toBeVisible();
    expect(screen.queryByText('Copa de Fútbol')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ajedrez' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Todos los deportes' }),
    );
    expect(screen.getByText('Copa de Fútbol')).toBeVisible();
  });

  it('un enlace a un campeonato que no existe o no es público lo explica y permite volver', async () => {
    withRoute('#/portal/competencias/zz');
    mockApi({
      'GET /public/institution': () => json(INSTITUTION),
      'GET /public/championships/zz': () =>
        error(404, 'Campeonato no encontrado'),
    });
    render(<PublicPortalPage />);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Campeonato no disponible',
      }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Volver al listado' }),
    );
    expect(window.location.hash).toBe('#/portal/competencias');
  });
});

describe('ScoreboardBand', () => {
  it('muestra marcadores oficiales recientes y partidos próximos con enlace al calendario', () => {
    const recentMatch = {
      ...EVENT,
      id: 'recent-1',
      hasResult: true,
      participants: EVENT.participants.map((p, i) => ({
        ...p,
        score: i === 0 ? 2 : 0,
        outcome: i === 0 ? ('victoria' as const) : ('derrota' as const),
      })),
    };
    render(<ScoreboardBand recent={[recentMatch]} upcoming={[EVENT]} />);
    expect(screen.getByRole('heading', { name: 'Esta semana' })).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Calendario completo' }),
    ).toHaveAttribute('href', '#/portal/calendario');
    expect(screen.getByText('2 — 0')).toBeVisible();
    expect(screen.getByText('VS')).toBeVisible();
    expect(screen.getAllByText('Real Quero').length).toBeGreaterThan(0);
  });

  it('muestra el estado vacío diseñado cuando no hay partidos ni resultados', () => {
    render(<ScoreboardBand recent={[]} upcoming={[]} />);
    expect(screen.getByRole('heading', { name: 'Esta semana' })).toBeVisible();
    expect(
      screen.getByText('No hay partidos programados por ahora.'),
    ).toBeVisible();
    expect(screen.getByText('Aún no hay resultados aprobados.')).toBeVisible();
  });

  it('muestra el estado de error diseñado y permite reintentar', async () => {
    const onRetry = vi.fn();
    render(
      <ScoreboardBand
        error="No se pudo cargar la información de la jornada"
        onRetry={onRetry}
      />,
    );
    expect(
      screen.getByText('No se pudo cargar la información de la jornada'),
    ).toBeVisible();
    const retryBtn = screen.getByRole('button', { name: 'Reintentar' });
    expect(retryBtn).toBeVisible();
    await userEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('muestra el estado de carga diseñado', () => {
    render(<ScoreboardBand loading />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Cargando marcadores…',
    );
  });
});
