import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { setCsrfToken, setUnauthorizedListener } from '../../api/client.ts';
import { CatalogAdmin } from './CatalogAdmin.tsx';
import {
  type Category,
  type Season,
  type Sport,
  categoriesConfig,
  seasonsConfig,
  sportsConfig,
} from './configs.tsx';

// ───────────────────────── API simulada ─────────────────────────

interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

type Handler = (call: Call) => Response | Promise<Response>;

const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
const noContent = () => new Response(null, { status: 204 });
const page = <T,>(
  items: T[],
  extra: Partial<{ page: number; total: number }> = {},
) =>
  json({
    items,
    page: extra.page ?? 1,
    pageSize: 20,
    total: extra.total ?? items.length,
  });

function mockApi(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const parsed = new URL(url, 'http://localhost');
      const call: Call = {
        method: init.method ?? 'GET',
        path: parsed.pathname.replace(/^\/api/, ''),
        query: parsed.searchParams,
        headers: (init.headers ?? {}) as Record<string, string>,
        body: init.body
          ? (JSON.parse(init.body as string) as Record<string, unknown>)
          : undefined,
      };
      calls.push(call);
      const handler = routes[`${call.method} ${call.path}`];
      if (!handler)
        throw new Error(`Petición no simulada: ${call.method} ${call.path}`);
      return handler(call);
    }),
  );
  return {
    calls,
    of: (method: string, path: string) =>
      calls.filter((c) => c.method === method && c.path === path),
  };
}

const MANAGE = ['sports:read', 'sports:manage', 'sports:delete'];
const FUTBOL: Sport = {
  id: 's1',
  code: 'futbol',
  name: 'Fútbol',
  status: 'activo',
};
const AJEDREZ: Sport = {
  id: 's2',
  code: 'ajedrez',
  name: 'Ajedrez',
  status: 'inactivo',
};

function renderSports(permissions: string[] = MANAGE) {
  return render(
    <CatalogAdmin config={sportsConfig} permissions={permissions} />,
  );
}

beforeEach(() => {
  setCsrfToken('csrf-de-prueba');
  window.location.hash = '';
});
afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedListener(null);
});

// ───────────────────────── listado y estados ─────────────────────────

describe('listado', () => {
  it('muestra la carga y luego la tabla con estado en texto', async () => {
    mockApi({ 'GET /sports': () => page([FUTBOL, AJEDREZ]) });
    renderSports();

    expect(screen.getByText('Cargando…')).toBeInTheDocument();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Fútbol')).toBeInTheDocument();
    expect(within(table).getByText('futbol')).toBeInTheDocument();
    expect(within(table).getByText(/Activo/)).toBeInTheDocument();
    expect(within(table).getByText(/Inactivo/)).toBeInTheDocument();
    expect(screen.getByText(/Página 1 de 1 · 2 registros/)).toBeInTheDocument();
  });

  it('consulta la API con credenciales y paginación por defecto', async () => {
    const api = mockApi({ 'GET /sports': () => page([FUTBOL]) });
    renderSports();
    await screen.findByRole('table');
    expect(api.calls[0]!.query.get('page')).toBe('1');
    expect(api.calls[0]!.query.get('pageSize')).toBe('20');
  });

  it('muestra el estado vacío sin datos ficticios', async () => {
    mockApi({ 'GET /sports': () => page([]) });
    renderSports();
    expect(
      await screen.findByText('Todavía no hay deportes registrados.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('muestra el error de carga y permite reintentar', async () => {
    let fail = true;
    mockApi({
      'GET /sports': () =>
        fail
          ? json({ statusCode: 500, message: 'Error interno' }, 500)
          : page([FUTBOL]),
    });
    renderSports();
    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno');

    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Fútbol')).toBeInTheDocument();
  });

  it('informa si no hay conexión', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    renderSports();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo conectar con el servidor',
    );
  });

  it('busca, filtra por estado, limpia filtros y pagina', async () => {
    const api = mockApi({
      'GET /sports': (c) =>
        c.query.get('q') === 'zzz'
          ? page([])
          : page([FUTBOL], {
              total: 45,
              page: Number(c.query.get('page') ?? 1),
            }),
    });
    renderSports();
    await screen.findByRole('table');
    expect(
      screen.getByText(/Página 1 de 3 · 45 registros/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() =>
      expect(api.of('GET', '/sports').at(-1)!.query.get('page')).toBe('2'),
    );
    expect(await screen.findByText(/Página 2 de 3/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'inactivo');
    await waitFor(() =>
      expect(api.of('GET', '/sports').at(-1)!.query.get('status')).toBe(
        'inactivo',
      ),
    );
    expect(api.of('GET', '/sports').at(-1)!.query.get('page')).toBe('1');

    await userEvent.type(
      screen.getByLabelText('Buscar por nombre o código'),
      '  zzz ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(
      await screen.findByText(
        'No se encontraron resultados con los filtros aplicados.',
      ),
    ).toBeInTheDocument();
    expect(api.of('GET', '/sports').at(-1)!.query.get('q')).toBe('zzz');

    await userEvent.click(
      screen.getByRole('button', { name: 'Limpiar filtros' }),
    );
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(api.of('GET', '/sports').at(-1)!.query.get('q')).toBeNull();
  });
});

// ───────────────────────── permisos visuales ─────────────────────────

describe('controles según permisos', () => {
  it('con solo lectura no muestra acciones de escritura', async () => {
    mockApi({ 'GET /sports': () => page([FUTBOL]) });
    renderSports(['sports:read']);
    await screen.findByRole('table');
    expect(
      screen.queryByRole('button', { name: /Nuevo deporte/ }),
    ).not.toBeInTheDocument();
    for (const name of [/Editar/, /Desactivar/, /Eliminar/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('gestionar no implica eliminar', async () => {
    mockApi({ 'GET /sports': () => page([FUTBOL]) });
    renderSports(['sports:read', 'sports:manage']);
    await screen.findByRole('table');
    expect(
      screen.getByRole('button', { name: 'Editar Deporte «Fútbol»' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Desactivar Deporte «Fútbol»' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Eliminar/ }),
    ).not.toBeInTheDocument();
  });
});

// ───────────────────────── creación y edición ─────────────────────────

describe('creación', () => {
  it('valida antes de enviar y asocia los errores a los campos', async () => {
    const api = mockApi({
      'GET /sports': () => page([]),
      'POST /sports': () => json({}, 201),
    });
    renderSports();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nuevo deporte' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByLabelText(/Código/)).toHaveAccessibleDescription(
      /Ingrese el código\./,
    );
    expect(screen.getByLabelText(/Nombre/)).toHaveAccessibleDescription(
      'Ingrese el nombre.',
    );
    expect(api.of('POST', '/sports')).toHaveLength(0);

    await userEvent.type(screen.getByLabelText(/Código/), 'Fútbol!');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByLabelText(/Código/)).toHaveAccessibleDescription(
      /Use minúsculas/,
    );
  });

  it('envía los datos normalizados con el token CSRF, informa el éxito y recarga el listado', async () => {
    let items: Sport[] = [];
    const api = mockApi({
      'GET /sports': () => page(items),
      'POST /sports': (c) => {
        items = [
          {
            id: 's9',
            status: 'activo',
            code: String(c.body!.code),
            name: String(c.body!.name),
          },
        ];
        return json(items[0], 201);
      },
    });
    renderSports();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nuevo deporte' }),
    );
    await userEvent.type(screen.getByLabelText(/Código/), 'basquet');
    await userEvent.type(screen.getByLabelText(/Nombre/), '  Bás   quet ');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText(/Se creó: Deporte «Bás quet»/),
    ).toBeInTheDocument();
    const post = api.of('POST', '/sports')[0]!;
    expect(post.body).toEqual({ code: 'basquet', name: 'Bás quet' });
    expect(post.headers['X-CSRF-Token']).toBe('csrf-de-prueba');
    expect(post.headers['Content-Type']).toBe('application/json');
    expect(screen.queryByLabelText(/Código/)).not.toBeInTheDocument();
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('muestra el conflicto del servidor sin cerrar el formulario', async () => {
    mockApi({
      'GET /sports': () => page([]),
      'POST /sports': () =>
        json(
          { statusCode: 409, message: 'Ya existe un deporte con ese código' },
          409,
        ),
    });
    renderSports();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nuevo deporte' }),
    );
    await userEvent.type(screen.getByLabelText(/Código/), 'futbol');
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Fútbol');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe un deporte con ese código',
    );
    expect(screen.getByLabelText(/Código/)).toHaveValue('futbol');
  });

  it('asigna los errores de validación del servidor a cada campo', async () => {
    mockApi({
      'GET /sports': () => page([]),
      'POST /sports': () =>
        json(
          {
            statusCode: 400,
            message: 'Solicitud inválida',
            errors: [{ field: 'name', message: 'Máximo 100 caracteres' }],
          },
          400,
        ),
    });
    renderSports();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nuevo deporte' }),
    );
    await userEvent.type(screen.getByLabelText(/Código/), 'futbol');
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Fútbol');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText('Máximo 100 caracteres'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Nombre/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('deshabilita el guardado mientras se envía (sin dobles envíos)', async () => {
    let release: (() => void) | undefined;
    const api = mockApi({
      'GET /sports': () => page([]),
      'POST /sports': () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(json(FUTBOL, 201));
        }),
    });
    renderSports();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nuevo deporte' }),
    );
    await userEvent.type(screen.getByLabelText(/Código/), 'futbol');
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Fútbol');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByRole('button', { name: 'Guardando…' }),
    ).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Guardando…' }));
    release!();
    await screen.findByText(/Se creó/);
    expect(api.of('POST', '/sports')).toHaveLength(1);
  });

  it('cancelar cierra el formulario sin enviar nada', async () => {
    const api = mockApi({ 'GET /sports': () => page([]) });
    renderSports();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nuevo deporte' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByLabelText(/Código/)).not.toBeInTheDocument();
    expect(api.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });
});

describe('edición', () => {
  it('el código es de solo lectura y solo se envía lo editable', async () => {
    const api = mockApi({
      'GET /sports': () => page([FUTBOL]),
      'PATCH /sports/s1': () => json({ ...FUTBOL, name: 'Fútbol sala' }),
    });
    renderSports();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Editar Deporte «Fútbol»' }),
    );

    const code = screen.getByLabelText(/Código/);
    expect(code).toHaveAttribute('readonly');
    expect(code).toHaveValue('futbol');
    expect(
      screen.getByText('No se puede modificar una vez creado.'),
    ).toBeInTheDocument();

    const name = screen.getByLabelText(/Nombre/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Fútbol sala');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText(/Se actualizó: Deporte «Fútbol sala»/),
    ).toBeInTheDocument();
    expect(api.of('PATCH', '/sports/s1')[0]!.body).toEqual({
      name: 'Fútbol sala',
    });
  });
});

// ───────────────────────── estado y eliminación ─────────────────────────

describe('cambio de estado', () => {
  it('pide confirmación con motivo opcional y lo envía', async () => {
    const api = mockApi({
      'GET /sports': () => page([FUTBOL]),
      'PATCH /sports/s1/status': () => json({ ...FUTBOL, status: 'inactivo' }),
    });
    renderSports();
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Desactivar Deporte «Fútbol»',
      }),
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Desactivar: Deporte «Fútbol»');
    await userEvent.type(
      within(dialog).getByLabelText(/Motivo/),
      'Sin competencia',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Desactivar' }),
    );

    expect(
      await screen.findByText(/estado actualizado a «Inactivo»/),
    ).toBeInTheDocument();
    expect(api.of('PATCH', '/sports/s1/status')[0]!.body).toEqual({
      status: 'inactivo',
      reason: 'Sin competencia',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Escape cancela sin hacer ninguna petición y devuelve el foco', async () => {
    const api = mockApi({ 'GET /sports': () => page([FUTBOL]) });
    renderSports();
    const trigger = await screen.findByRole('button', {
      name: 'Desactivar Deporte «Fútbol»',
    });
    await userEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('el foco queda atrapado dentro del diálogo', async () => {
    mockApi({ 'GET /sports': () => page([FUTBOL]) });
    renderSports();
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Desactivar Deporte «Fútbol»',
      }),
    );
    const dialog = screen.getByRole('dialog');
    for (let i = 0; i < 6; i++) {
      await userEvent.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < 6; i++) {
      await userEvent.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('un error del servidor se informa como aviso', async () => {
    mockApi({
      'GET /sports': () => page([FUTBOL]),
      'PATCH /sports/s1/status': () =>
        json({ statusCode: 404, message: 'Deporte no encontrado' }, 404),
    });
    renderSports();
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Desactivar Deporte «Fútbol»',
      }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Desactivar',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Deporte no encontrado',
    );
  });
});

describe('eliminación', () => {
  it('cancelar no elimina; confirmar elimina y recarga', async () => {
    let items = [FUTBOL];
    const api = mockApi({
      'GET /sports': () => page(items),
      'DELETE /sports/s1': () => {
        items = [];
        return noContent();
      },
    });
    renderSports();
    const trigger = await screen.findByRole('button', {
      name: 'Eliminar Deporte «Fútbol»',
    });

    await userEvent.click(trigger);
    expect(screen.getByRole('dialog')).toHaveTextContent('de forma permanente');
    // El foco inicial está en «Cancelar» (operación destructiva)
    expect(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancelar',
      }),
    ).toHaveFocus();
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancelar',
      }),
    );
    expect(api.of('DELETE', '/sports/s1')).toHaveLength(0);

    await userEvent.click(
      screen.getByRole('button', { name: 'Eliminar Deporte «Fútbol»' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Eliminar definitivamente' }),
    );
    expect(
      await screen.findByText(/Se eliminó: Deporte «Fútbol»/),
    ).toBeInTheDocument();
    expect(api.of('DELETE', '/sports/s1')[0]!.headers['X-CSRF-Token']).toBe(
      'csrf-de-prueba',
    );
    expect(
      await screen.findByText('Todavía no hay deportes registrados.'),
    ).toBeInTheDocument();
  });

  it('muestra el 409 de un registro en uso y conserva el listado', async () => {
    mockApi({
      'GET /sports': () => page([FUTBOL]),
      'DELETE /sports/s1': () =>
        json(
          {
            statusCode: 409,
            message:
              'El deporte está en uso y no puede eliminarse. Desactívelo en su lugar.',
          },
          409,
        ),
    });
    renderSports();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Eliminar Deporte «Fútbol»' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Eliminar definitivamente' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('está en uso');
    expect(await screen.findByText('Fútbol')).toBeInTheDocument();
  });
});

// ───────────────────────── categorías ─────────────────────────

describe('categorías', () => {
  const CATS: Category[] = [
    {
      id: 'c1',
      code: 'liga_a',
      name: 'Liga A',
      ageMin: null,
      ageMax: null,
      sortOrder: 10,
      status: 'activo',
    },
    {
      id: 'c2',
      code: 'veteranos',
      name: 'Veteranos',
      ageMin: 40,
      ageMax: null,
      sortOrder: 20,
      status: 'activo',
    },
    {
      id: 'c3',
      code: 'ninos',
      name: 'Niños',
      ageMin: 6,
      ageMax: 12,
      sortOrder: 30,
      status: 'inactivo',
    },
    {
      id: 'c4',
      code: 'sub8',
      name: 'Sub 8',
      ageMin: null,
      ageMax: 8,
      sortOrder: 40,
      status: 'activo',
    },
  ];
  const perms = ['categories:read', 'categories:manage', 'categories:delete'];

  it('muestra las edades sin inventar valores cuando no están definidas', async () => {
    mockApi({ 'GET /categories': () => page(CATS) });
    render(<CatalogAdmin config={categoriesConfig} permissions={perms} />);
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Sin definir')).toBeInTheDocument();
    expect(within(table).getByText('Desde 40 años')).toBeInTheDocument();
    expect(within(table).getByText('6 a 12 años')).toBeInTheDocument();
    expect(within(table).getByText('Hasta 8 años')).toBeInTheDocument();
  });

  it('valida el rango de edad y no envía datos incoherentes', async () => {
    const api = mockApi({
      'GET /categories': () => page([]),
      'POST /categories': () => json({}, 201),
    });
    render(<CatalogAdmin config={categoriesConfig} permissions={perms} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nueva categoría' }),
    );
    await userEvent.type(screen.getByLabelText(/Código/), 'sub15');
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Sub 15');
    await userEvent.type(screen.getByLabelText(/Edad mínima/), '15');
    await userEvent.type(screen.getByLabelText(/Edad máxima/), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByLabelText(/Edad máxima/)).toHaveAccessibleDescription(
      'La edad máxima no puede ser menor que la mínima.',
    );
    expect(api.of('POST', '/categories')).toHaveLength(0);

    await userEvent.clear(screen.getByLabelText(/Edad mínima/));
    await userEvent.type(screen.getByLabelText(/Edad mínima/), '150');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByLabelText(/Edad mínima/)).toHaveAccessibleDescription(
      /máximo 120/,
    );
  });

  it('envía null para los límites vacíos y números para los completados', async () => {
    const api = mockApi({
      'GET /categories': () => page([]),
      'POST /categories': () => json(CATS[1], 201),
    });
    render(<CatalogAdmin config={categoriesConfig} permissions={perms} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nueva categoría' }),
    );
    await userEvent.type(screen.getByLabelText(/Código/), 'veteranos');
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Veteranos');
    await userEvent.type(screen.getByLabelText(/Edad mínima/), '40');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await screen.findByText(/Se creó/);
    expect(api.of('POST', '/categories')[0]!.body).toEqual({
      code: 'veteranos',
      name: 'Veteranos',
      ageMin: 40,
      ageMax: null,
      sortOrder: 0,
    });
  });

  it('en edición permite borrar un límite (null) y no envía el código', async () => {
    const api = mockApi({
      'GET /categories': () => page([CATS[2]!]),
      'PATCH /categories/c3': () => json(CATS[2]),
    });
    render(<CatalogAdmin config={categoriesConfig} permissions={perms} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Editar Categoría «Niños»' }),
    );
    await userEvent.clear(screen.getByLabelText(/Edad máxima/));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText(/Se actualizó/);
    expect(api.of('PATCH', '/categories/c3')[0]!.body).toEqual({
      name: 'Niños',
      ageMin: 6,
      ageMax: null,
      sortOrder: 30,
    });
  });
});

// ───────────────────────── temporadas ─────────────────────────

describe('temporadas', () => {
  const draft: Season = {
    id: 't1',
    name: 'Temporada 2026',
    startDate: '2026-03-01',
    endDate: '2026-11-30',
    status: 'borrador',
    allowedTransitions: ['activa'],
  };
  const finished: Season = {
    ...draft,
    id: 't2',
    name: 'Temporada 2025',
    status: 'finalizada',
    allowedTransitions: ['archivada', 'activa'],
  };
  const archived: Season = {
    ...draft,
    id: 't3',
    name: 'Temporada 2024',
    status: 'archivada',
    allowedTransitions: ['finalizada'],
  };
  const perms = ['seasons:read', 'seasons:manage', 'seasons:delete'];

  it('muestra las fechas en formato local sin desplazamientos de zona horaria', async () => {
    mockApi({ 'GET /seasons': () => page([draft]) });
    render(<CatalogAdmin config={seasonsConfig} permissions={perms} />);
    const table = await screen.findByRole('table');
    expect(within(table).getByText('01/03/2026')).toBeInTheDocument();
    expect(within(table).getByText('30/11/2026')).toBeInTheDocument();
    expect(within(table).getByText(/Borrador/)).toBeInTheDocument();
  });

  it('valida el orden de las fechas antes de enviar', async () => {
    const api = mockApi({
      'GET /seasons': () => page([]),
      'POST /seasons': () => json({}, 201),
    });
    render(<CatalogAdmin config={seasonsConfig} permissions={perms} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nueva temporada' }),
    );
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Temporada 2026');
    await userEvent.type(
      screen.getByLabelText(/Fecha de inicio/),
      '2026-03-01',
    );
    await userEvent.type(screen.getByLabelText(/Fecha de fin/), '2026-03-01');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByLabelText(/Fecha de fin/)).toHaveAccessibleDescription(
      'La fecha de fin debe ser posterior a la de inicio.',
    );
    expect(api.of('POST', '/seasons')).toHaveLength(0);
  });

  it('crea la temporada enviando solo nombre y fechas (el estado lo fija el servidor)', async () => {
    const api = mockApi({
      'GET /seasons': () => page([]),
      'POST /seasons': () => json(draft, 201),
    });
    render(<CatalogAdmin config={seasonsConfig} permissions={perms} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nueva temporada' }),
    );
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Temporada 2026');
    await userEvent.type(
      screen.getByLabelText(/Fecha de inicio/),
      '2026-03-01',
    );
    await userEvent.type(screen.getByLabelText(/Fecha de fin/), '2026-11-30');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText(/Se creó/);
    expect(api.of('POST', '/seasons')[0]!.body).toEqual({
      name: 'Temporada 2026',
      startDate: '2026-03-01',
      endDate: '2026-11-30',
    });
  });

  it('ofrece solo las transiciones que permite el servidor y exige un motivo', async () => {
    const api = mockApi({
      'GET /seasons': () => page([draft, finished]),
      'PATCH /seasons/t1/status': () => json({ ...draft, status: 'activa' }),
    });
    render(<CatalogAdmin config={seasonsConfig} permissions={perms} />);
    await screen.findByRole('table');
    expect(
      screen.getByRole('button', {
        name: 'Archivar Temporada «Temporada 2025»',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Reabrir Temporada «Temporada 2025»',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Finalizar Temporada «Temporada 2026»',
      }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Activar Temporada «Temporada 2026»',
      }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Activar' }),
    );
    expect(within(dialog).getByLabelText(/Motivo/)).toHaveAccessibleDescription(
      /Indique el motivo/,
    );
    expect(api.of('PATCH', '/seasons/t1/status')).toHaveLength(0);

    await userEvent.type(
      within(dialog).getByLabelText(/Motivo/),
      'Inicio del campeonato',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Activar' }),
    );
    expect(
      await screen.findByText(/estado actualizado a «Activa»/),
    ).toBeInTheDocument();
    expect(api.of('PATCH', '/seasons/t1/status')[0]!.body).toEqual({
      status: 'activa',
      reason: 'Inicio del campeonato',
    });
  });

  it('solo permite eliminar borradores y no editar las archivadas', async () => {
    mockApi({ 'GET /seasons': () => page([draft, finished, archived]) });
    render(<CatalogAdmin config={seasonsConfig} permissions={perms} />);
    await screen.findByRole('table');
    expect(
      screen.getByRole('button', {
        name: 'Eliminar Temporada «Temporada 2026»',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Eliminar Temporada «Temporada 2025»',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Eliminar Temporada «Temporada 2024»',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Editar Temporada «Temporada 2025»' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Editar Temporada «Temporada 2024»',
      }),
    ).not.toBeInTheDocument();
  });
});

// ───────────────────────── navegación y sesión ─────────────────────────

describe('aplicación autenticada', () => {
  const session = (permissions: string[]) => ({
    user: { id: 'u1', email: 'ana@liga.example', displayName: 'Ana Pérez' },
    permissions,
    csrfToken: 'csrf-de-prueba',
    expiresAt: '2030-01-01T00:00:00.000Z',
  });
  const health = () =>
    json({ status: 'ok', service: 'liga-api', timestamp: 'x' });

  it('muestra solo las secciones permitidas', async () => {
    mockApi({
      'GET /auth/session': () => json(session(['sports:read', 'seasons:read'])),
      'GET /health': health,
    });
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Secciones' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual([
      'Inicio',
      'Deportes',
      'Temporadas',
      'Notificaciones',
      'Mi cuenta',
    ]);
    expect(within(nav).queryByText('Categorías')).not.toBeInTheDocument();
  });

  it('sin permisos de catálogo informa cómo proceder, sin pantallas falsas', async () => {
    mockApi({
      'GET /auth/session': () => json(session([])),
      'GET /health': health,
    });
    render(<App />);
    expect(
      await screen.findByText(/no tiene permisos de administración/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Deportes' }),
    ).not.toBeInTheDocument();
  });

  it('navega entre secciones y marca la actual', async () => {
    mockApi({
      'GET /auth/session': () => json(session(MANAGE)),
      'GET /health': health,
      'GET /sports': () => page([FUTBOL]),
    });
    render(<App />);
    await userEvent.click(
      await screen.findByRole('link', { name: 'Deportes' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Deportes' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Deportes' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await screen.findByText('Fútbol')).toBeInTheDocument();
  });

  it('una sección sin permiso no se muestra aunque se escriba la dirección', async () => {
    window.location.hash = '#/temporadas';
    const api = mockApi({
      'GET /auth/session': () => json(session(['sports:read'])),
      'GET /health': health,
    });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Inicio' }),
    ).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/seasons')).toBe(false);
  });

  it('si la sesión expira durante una operación, vuelve al acceso con el aviso', async () => {
    mockApi({
      'GET /auth/session': () => json(session(MANAGE)),
      'GET /health': health,
      'GET /sports': () => page([FUTBOL]),
      'DELETE /sports/s1': () =>
        json({ statusCode: 401, message: 'Sesión no válida o expirada' }, 401),
    });
    render(<App />);
    await userEvent.click(
      await screen.findByRole('link', { name: 'Deportes' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Eliminar Deporte «Fútbol»' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Eliminar definitivamente' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Su sesión expiró o fue cerrada/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Fútbol')).not.toBeInTheDocument();
  });

  it('si la sesión expira al cargar un listado, también vuelve al acceso', async () => {
    mockApi({
      'GET /auth/session': () => json(session(MANAGE)),
      'GET /health': health,
      'GET /sports': () =>
        json({ statusCode: 401, message: 'Sesión no válida o expirada' }, 401),
    });
    render(<App />);
    await userEvent.click(
      await screen.findByRole('link', { name: 'Deportes' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeInTheDocument();
  });
});
