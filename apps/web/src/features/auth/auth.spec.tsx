import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { setCsrfToken, setUnauthorizedListener } from '../../api/client.ts';

type Handler = (init: RequestInit) => Response | Promise<Response>;

interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  credentials: RequestCredentials | undefined;
}

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const SESSION = {
  user: { id: 'u1', email: 'ana@liga.example', displayName: 'Ana Pérez' },
  permissions: ['roles:read'],
  csrfToken: 'token-csrf-de-prueba',
  expiresAt: '2030-01-01T00:00:00.000Z',
};

/** Simula la API: cada clave es "MÉTODO /ruta". Devuelve las llamadas realizadas. */
function mockApi(handlers: Record<string, Handler>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const path = url.replace(/^\/api/, '');
      calls.push({
        method,
        path,
        headers: (init.headers ?? {}) as Record<string, string>,
        body: init.body ? JSON.parse(init.body as string) : undefined,
        credentials: init.credentials,
      });
      const handler = handlers[`${method} ${path}`];
      if (!handler) throw new Error(`Petición no simulada: ${method} ${path}`);
      return handler(init);
    }),
  );
  return calls;
}

const unauthorized = () =>
  json({ statusCode: 401, message: 'Sesión no válida o expirada' }, 401);
const health = () =>
  json({ status: 'ok', service: 'liga-api', timestamp: 'x' });

/** Almacenamiento que registra cualquier escritura (la app no debe escribir nada). */
function spyStorage() {
  const writes: string[] = [];
  const storage = {
    length: 0,
    getItem: () => null,
    key: () => null,
    removeItem: () => undefined,
    clear: () => undefined,
    setItem: (key: string) => void writes.push(key),
  };
  return { storage, writes };
}

describe('autenticación en la interfaz', () => {
  let local: ReturnType<typeof spyStorage>;
  let session: ReturnType<typeof spyStorage>;

  beforeEach(() => {
    setCsrfToken(null);
    local = spyStorage();
    session = spyStorage();
    vi.stubGlobal('localStorage', local.storage);
    vi.stubGlobal('sessionStorage', session.storage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthorizedListener(null);
  });

  it('sin sesión muestra el formulario de acceso accesible', async () => {
    mockApi({ 'GET /auth/session': unauthorized });
    render(<App />);

    expect(screen.getByText(/Comprobando sesión/)).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute(
      'type',
      'password',
    );
    expect(screen.queryByText('Cerrar sesión')).not.toBeInTheDocument();
  });

  it('recupera la sesión existente consultando al servidor, con credenciales', async () => {
    const calls = mockApi({
      'GET /auth/session': () => json(SESSION),
      'GET /health': health,
    });
    render(<App />);

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cerrar sesión' }),
    ).toBeInTheDocument();
    expect(calls[0]).toMatchObject({
      method: 'GET',
      path: '/auth/session',
      credentials: 'include',
    });
  });

  it('valida los campos antes de enviar y asocia los errores a cada campo', async () => {
    const calls = mockApi({ 'GET /auth/session': unauthorized });
    render(<App />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Ingresar' }),
    );

    const email = screen.getByLabelText('Correo electrónico');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Ingrese su correo electrónico.');
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription(
      'Ingrese su contraseña.',
    );
    expect(calls.filter((c) => c.path === '/auth/login')).toHaveLength(0);

    await userEvent.type(email, 'no-es-correo');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(email).toHaveAccessibleDescription(
      'Ingrese un correo electrónico válido.',
    );
  });

  it('inicia sesión, guarda el token CSRF en memoria y no usa almacenamiento del navegador', async () => {
    const calls = mockApi({
      'GET /auth/session': unauthorized,
      'POST /auth/login': () => json(SESSION),
      'GET /health': health,
    });
    render(<App />);

    await userEvent.type(
      await screen.findByLabelText('Correo electrónico'),
      'ana@liga.example',
    );
    await userEvent.type(
      screen.getByLabelText('Contraseña'),
      'mi-contraseña-secreta',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    const login = calls.find((c) => c.path === '/auth/login')!;
    expect(login).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: { email: 'ana@liga.example', password: 'mi-contraseña-secreta' },
    });
    // Ni contraseñas ni tokens en el almacenamiento del navegador
    expect(local.writes).toEqual([]);
    expect(session.writes).toEqual([]);
    expect(document.cookie).toBe('');
    expect(document.body.innerHTML).not.toContain('token-csrf-de-prueba');
    expect(document.body.innerHTML).not.toContain('mi-contraseña-secreta');
  });

  it('muestra un mensaje genérico ante credenciales inválidas, bloquea reenvíos y borra la contraseña', async () => {
    let release: (() => void) | undefined;
    mockApi({
      'GET /auth/session': unauthorized,
      'POST /auth/login': () =>
        new Promise<Response>((resolve) => {
          release = () =>
            resolve(
              json({ statusCode: 401, message: 'Credenciales inválidas' }, 401),
            );
        }),
    });
    render(<App />);

    await userEvent.type(
      await screen.findByLabelText('Correo electrónico'),
      'ana@liga.example',
    );
    await userEvent.type(screen.getByLabelText('Contraseña'), 'incorrecta');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    // Estado de carga: el botón queda deshabilitado
    const busy = await screen.findByRole('button', { name: 'Ingresando…' });
    expect(busy).toBeDisabled();
    release!();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Correo o contraseña incorrectos.',
    );
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
    expect(screen.queryByText('Cerrar sesión')).not.toBeInTheDocument();
  });

  it('informa del bloqueo temporal por demasiados intentos (429)', async () => {
    mockApi({
      'GET /auth/session': unauthorized,
      'POST /auth/login': () =>
        json(
          {
            statusCode: 429,
            message: 'Demasiados intentos. Intente más tarde.',
          },
          429,
          {
            'Retry-After': '600',
          },
        ),
    });
    render(<App />);
    await userEvent.type(
      await screen.findByLabelText('Correo electrónico'),
      'ana@liga.example',
    );
    await userEvent.type(screen.getByLabelText('Contraseña'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiados intentos. Espere 10 minutos antes de volver a intentarlo.',
    );
  });

  it('informa si no hay conexión con el servidor', async () => {
    mockApi({
      'GET /auth/session': unauthorized,
      'POST /auth/login': () => {
        throw new TypeError('network');
      },
    });
    render(<App />);
    await userEvent.type(
      await screen.findByLabelText('Correo electrónico'),
      'ana@liga.example',
    );
    await userEvent.type(screen.getByLabelText('Contraseña'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo conectar con el servidor',
    );
  });

  it('cierra sesión enviando el token CSRF y vuelve al formulario', async () => {
    const calls = mockApi({
      'GET /auth/session': () => json(SESSION),
      'GET /health': health,
      'POST /auth/logout': () => new Response(null, { status: 204 }),
    });
    render(<App />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Cerrar sesión' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeInTheDocument();
    const logout = calls.find((c) => c.path === '/auth/logout')!;
    expect(logout.method).toBe('POST');
    expect(logout.headers['X-CSRF-Token']).toBe('token-csrf-de-prueba');
    expect(logout.credentials).toBe('include');
    // Sin aviso de "sesión expirada": fue un cierre voluntario
    expect(screen.queryByText(/expiró/)).not.toBeInTheDocument();
  });

  it('cierra la sesión local aunque el servidor falle al cerrar', async () => {
    mockApi({
      'GET /auth/session': () => json(SESSION),
      'GET /health': health,
      'POST /auth/logout': unauthorized,
    });
    render(<App />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Cerrar sesión' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeInTheDocument();
  });

  it('las lecturas no envían token CSRF', async () => {
    const calls = mockApi({
      'GET /auth/session': () => json(SESSION),
      'GET /health': health,
    });
    render(<App />);
    await screen.findByText('Ana Pérez');
    await waitFor(() =>
      expect(calls.some((c) => c.path === '/health')).toBe(true),
    );
    for (const call of calls.filter((c) => c.method === 'GET')) {
      expect(call.headers['X-CSRF-Token']).toBeUndefined();
    }
  });

  it('una respuesta 401 en una petición autenticada se trata como sesión expirada', async () => {
    mockApi({
      'GET /auth/session': () => json(SESSION),
      'GET /health': unauthorized,
    });
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Su sesión expiró o fue cerrada',
    );
    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument();
  });
});
