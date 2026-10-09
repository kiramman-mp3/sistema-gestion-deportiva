import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { setCsrfToken, setUnauthorizedListener } from '../../api/client.ts';
import {
  error,
  json,
  mockApi,
  noContent,
  page,
  spyStorage,
} from '../../test/mockApi.ts';
import { AuditPage } from './AuditPage.tsx';
import { ChangePasswordForm } from './PasswordForms.tsx';
import { RoleDetailPage } from './RoleDetailPage.tsx';
import { RolesPage } from './RolesPage.tsx';
import { UserDetailPage } from './UserDetailPage.tsx';
import { UsersPage } from './UsersPage.tsx';
import type {
  AdminRole,
  AdminUser,
  AuditEntry,
  PermissionInfo,
  UserSession,
} from './types.ts';

const UID = '0197aaaa-0000-7000-8000-000000000001';
const SELF = '0197aaaa-0000-7000-8000-0000000000ff';
const RID = '0197aaaa-0000-7000-8000-0000000000a1';
const SYS = '0197aaaa-0000-7000-8000-0000000000a2';

const ANA: AdminUser = {
  id: UID,
  email: 'ana@liga.example',
  displayName: 'Ana Pérez',
  status: 'activo',
  lastLoginAt: '2026-10-01T15:00:00.000Z',
  createdAt: '2026-09-01T15:00:00.000Z',
  updatedAt: '2026-09-02T15:00:00.000Z',
  roles: [{ id: RID, code: 'delegado', name: 'Delegado' }],
};
const PENDING: AdminUser = {
  ...ANA,
  id: '0197aaaa-0000-7000-8000-000000000002',
  displayName: 'Luis Gómez',
  email: 'luis@liga.example',
  status: 'pendiente',
  lastLoginAt: null,
  roles: [],
};

const ROLE: AdminRole = {
  id: RID,
  code: 'delegado',
  name: 'Delegado',
  description: 'Gestiona deportes',
  isSystem: false,
  permissions: ['sports:read', 'sports:manage'],
  userCount: 3,
};
const SYSTEM_ROLE: AdminRole = {
  id: SYS,
  code: 'superadmin',
  name: 'Superadministrador',
  description: null,
  isSystem: true,
  permissions: ['sports:read', 'sports:manage', 'audit:read'],
  userCount: 1,
};

const CATALOG: PermissionInfo[] = [
  {
    code: 'users:read',
    description: 'Consultar usuarios',
    module: 'users',
    moduleLabel: 'Usuarios',
    action: 'read',
    actionLabel: 'Consultar',
  },
  {
    code: 'sports:read',
    description: 'Consultar deportes',
    module: 'sports',
    moduleLabel: 'Deportes',
    action: 'read',
    actionLabel: 'Consultar',
  },
  {
    code: 'sports:manage',
    description: 'Crear, modificar y activar o desactivar deportes',
    module: 'sports',
    moduleLabel: 'Deportes',
    action: 'manage',
    actionLabel: 'Gestionar',
  },
  {
    code: 'sports:delete',
    description: 'Eliminar deportes que no estén en uso',
    module: 'sports',
    moduleLabel: 'Deportes',
    action: 'delete',
    actionLabel: 'Eliminar',
  },
  {
    code: 'audit:read',
    description: 'Consultar la auditoría',
    module: 'audit',
    moduleLabel: 'Auditoría',
    action: 'read',
    actionLabel: 'Consultar',
  },
];

const TOKEN = 'T'.repeat(43);
const LINK = {
  token: TOKEN,
  kind: 'activacion' as const,
  expiresAt: '2030-01-02T10:00:00.000Z',
};

let storage: ReturnType<typeof spyStorage>;
beforeEach(() => {
  setCsrfToken('csrf-de-prueba');
  window.location.hash = '';
  storage = spyStorage();
  vi.stubGlobal('localStorage', storage.storage);
  vi.stubGlobal('sessionStorage', spyStorage().storage);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedListener(null);
});

// ───────────────────────── usuarios: listado y alta ─────────────────────────

describe('usuarios', () => {
  const ADMIN = ['users:read', 'users:create', 'users:update', 'roles:read'];

  it('lista con estado en texto, roles y última conexión, y nunca muestra datos sensibles', async () => {
    mockApi({
      'GET /users': () => page([ANA, PENDING]),
      'GET /roles': () => json([ROLE]),
    });
    render(<UsersPage permissions={ADMIN} />);
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Ana Pérez')).toBeInTheDocument();
    expect(within(table).getByText(/Activa/)).toBeInTheDocument();
    expect(
      within(table).getByText(/Pendiente de activación/),
    ).toBeInTheDocument();
    expect(within(table).getByText('Delegado')).toBeInTheDocument();
    expect(within(table).getByText('Sin roles')).toBeInTheDocument();
    expect(table.textContent).not.toMatch(/hash|argon2|token/i);
    expect(
      screen.getByRole('link', { name: 'Ver y administrar a Ana Pérez' }),
    ).toHaveAttribute('href', `#/usuarios/${UID}`);
  });

  it('muestra los estados de error (con reintento) y vacío', async () => {
    let fail = true;
    mockApi({
      'GET /users': () => (fail ? error(500, 'Error interno') : page([])),
    });
    render(<UsersPage permissions={['users:read']} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByText('Todavía no hay usuarios registrados.'),
    ).toBeInTheDocument();
  });

  it('filtra por texto, estado y rol, y limpia los filtros', async () => {
    const api = mockApi({
      'GET /users': () => page([ANA]),
      'GET /roles': () => json([ROLE]),
    });
    render(<UsersPage permissions={ADMIN} />);
    await screen.findByRole('table');
    await userEvent.type(
      screen.getByLabelText('Buscar por nombre o correo'),
      ' ana ',
    );
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'activo');
    await userEvent.selectOptions(await screen.findByLabelText('Rol'), RID);
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() =>
      expect(api.of('GET', '/users').at(-1)!.query.get('q')).toBe('ana'),
    );
    const last = api.of('GET', '/users').at(-1)!;
    expect(last.query.get('status')).toBe('activo');
    expect(last.query.get('roleId')).toBe(RID);
    await userEvent.click(
      screen.getByRole('button', { name: 'Limpiar filtros' }),
    );
    await waitFor(() =>
      expect(api.of('GET', '/users').at(-1)!.query.get('q')).toBeNull(),
    );
  });

  it('sin permiso de creación no ofrece «Nuevo usuario»', async () => {
    mockApi({ 'GET /users': () => page([ANA]) });
    render(<UsersPage permissions={['users:read']} />);
    await screen.findByRole('table');
    expect(
      screen.queryByRole('button', { name: 'Nuevo usuario' }),
    ).not.toBeInTheDocument();
  });

  it('crea la cuenta sin contraseña y muestra el enlace de activación UNA sola vez', async () => {
    const api = mockApi({
      'GET /users': () => page([]),
      'GET /roles': () => json([ROLE]),
      'POST /users': () => json({ user: PENDING, activation: LINK }, 201),
    });
    render(<UsersPage permissions={ADMIN} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nuevo usuario' }),
    );

    // Validación antes de enviar
    await userEvent.click(
      screen.getByRole('button', { name: 'Crear usuario' }),
    );
    expect(
      screen.getByLabelText(/Nombre completo/),
    ).toHaveAccessibleDescription('Ingrese el nombre.');
    expect(
      screen.getByLabelText(/Correo electrónico/),
    ).toHaveAccessibleDescription('Ingrese el correo electrónico.');
    expect(api.of('POST', '/users')).toHaveLength(0);

    await userEvent.type(
      screen.getByLabelText(/Nombre completo/),
      'Luis Gómez',
    );
    await userEvent.type(
      screen.getByLabelText(/Correo electrónico/),
      'luis@liga.example',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Crear usuario' }),
    );

    // El cuerpo NO contiene contraseña, estado ni roles
    await screen.findByText(/Enlace de activación para Luis Gómez/);
    expect(api.of('POST', '/users')[0]!.body).toEqual({
      email: 'luis@liga.example',
      displayName: 'Luis Gómez',
    });
    expect(api.of('POST', '/users')[0]!.headers['X-CSRF-Token']).toBe(
      'csrf-de-prueba',
    );

    const url = (screen.getByLabelText('Enlace') as HTMLInputElement).value;
    expect(url).toBe(`${window.location.origin}/#/activar/${TOKEN}`);
    expect(screen.getByText(/se muestra una sola vez/)).toBeInTheDocument();
    expect(storage.writes).toEqual([]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Ya lo entregué, cerrar' }),
    );
    expect(screen.queryByLabelText('Enlace')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it('muestra el correo duplicado del servidor sin cerrar el formulario', async () => {
    mockApi({
      'GET /users': () => page([]),
      'GET /roles': () => json([]),
      'POST /users': () => error(409, 'Ya existe un usuario con ese correo'),
    });
    render(<UsersPage permissions={ADMIN} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nuevo usuario' }),
    );
    await userEvent.type(screen.getByLabelText(/Nombre completo/), 'Ana');
    await userEvent.type(
      screen.getByLabelText(/Correo electrónico/),
      'ana@liga.example',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Crear usuario' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe un usuario con ese correo',
    );
    expect(screen.getByLabelText(/Correo electrónico/)).toHaveValue(
      'ana@liga.example',
    );
  });
});

// ───────────────────────── usuarios: detalle ─────────────────────────

describe('detalle de usuario', () => {
  const ADMIN = ['users:read', 'users:update', 'roles:read', 'roles:manage'];
  const SESSIONS: UserSession[] = [
    {
      id: 's1',
      createdAt: '2026-10-01T15:00:00.000Z',
      lastSeenAt: '2026-10-01T16:00:00.000Z',
      expiresAt: '2026-10-02T03:00:00.000Z',
      userAgent: 'Firefox/130',
    },
  ];
  const routes = () => ({
    [`GET /users/${UID}`]: () => json(ANA),
    [`GET /users/${UID}/sessions`]: () => json(SESSIONS),
    'GET /roles': () => json([ROLE, SYSTEM_ROLE]),
  });
  const renderDetail = (permissions = ADMIN, selfId = SELF) =>
    render(
      <UserDetailPage userId={UID} selfId={selfId} permissions={permissions} />,
    );

  it('muestra datos, roles y sesiones activas', async () => {
    mockApi(routes());
    renderDetail();
    expect(
      await screen.findByRole('heading', { name: 'Ana Pérez' }),
    ).toBeInTheDocument();
    expect(screen.getByText('ana@liga.example')).toBeInTheDocument();
    expect(screen.getByText('Delegado')).toBeInTheDocument();
    expect(await screen.findByText('Firefox/130')).toBeInTheDocument();
  });

  it('en la propia cuenta no ofrece cambiar estado, roles ni enlaces', async () => {
    mockApi(routes());
    renderDetail(ADMIN, UID);
    expect(
      await screen.findByText(/Esta es su propia cuenta/),
    ).toBeInTheDocument();
    for (const name of [
      /Desactivar/,
      /Bloquear/,
      /Retirar/,
      /Asignar/,
      /Generar enlace/,
      /Editar datos/,
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('con solo lectura no muestra ninguna acción de escritura', async () => {
    mockApi(routes());
    renderDetail(['users:read']);
    await screen.findByRole('heading', { name: 'Ana Pérez' });
    for (const name of [
      /Editar/,
      /Desactivar/,
      /Retirar/,
      /Cerrar sesión/,
      /Generar/,
      /Cerrar todas/,
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('edita nombre y correo', async () => {
    const api = mockApi({
      ...routes(),
      [`PATCH /users/${UID}`]: () => json({ ...ANA, displayName: 'Ana María' }),
    });
    renderDetail();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Editar datos' }),
    );
    const name = screen.getByLabelText('Nombre completo');
    await userEvent.clear(name);
    await userEvent.type(name, 'Ana María');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Datos actualizados.')).toBeInTheDocument();
    expect(api.of('PATCH', `/users/${UID}`)[0]!.body).toEqual({
      displayName: 'Ana María',
      email: 'ana@liga.example',
    });
  });

  it('desactivar pide confirmación con motivo obligatorio', async () => {
    const api = mockApi({
      ...routes(),
      [`PATCH /users/${UID}/status`]: () =>
        json({ id: UID, status: 'inactivo', revokedSessions: 1 }),
    });
    renderDetail();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Desactivar' }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Desactivar' }),
    );
    expect(within(dialog).getByLabelText(/Motivo/)).toHaveAccessibleDescription(
      /Indique el motivo/,
    );
    expect(api.of('PATCH', `/users/${UID}/status`)).toHaveLength(0);

    await userEvent.type(
      within(dialog).getByLabelText(/Motivo/),
      'Baja del dirigente',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Desactivar' }),
    );
    expect(await screen.findByText(/Estado actualizado/)).toBeInTheDocument();
    expect(api.of('PATCH', `/users/${UID}/status`)[0]!.body).toEqual({
      status: 'inactivo',
      reason: 'Baja del dirigente',
    });
  });

  it('muestra el rechazo del servidor (p. ej. último superadministrador) como alerta', async () => {
    mockApi({
      ...routes(),
      [`PATCH /users/${UID}/status`]: () =>
        error(409, 'Debe existir al menos un superadministrador activo'),
    });
    renderDetail();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Bloquear' }),
    );
    await userEvent.type(
      within(screen.getByRole('dialog')).getByLabelText(/Motivo/),
      'prueba',
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Bloquear',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Debe existir al menos un superadministrador activo',
    );
  });

  it('genera el enlace de restablecimiento y lo muestra una sola vez', async () => {
    const api = mockApi({
      ...routes(),
      [`POST /users/${UID}/credential-link`]: () =>
        json({ ...LINK, kind: 'restablecimiento' }),
    });
    renderDetail();
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Generar enlace de restablecimiento',
      }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Generar enlace',
      }),
    );
    expect(
      await screen.findByText(/Enlace de restablecimiento para Ana Pérez/),
    ).toBeInTheDocument();
    expect((screen.getByLabelText('Enlace') as HTMLInputElement).value).toBe(
      `${window.location.origin}/#/restablecer/${TOKEN}`,
    );
    expect(api.of('POST', `/users/${UID}/credential-link`)).toHaveLength(1);
    await userEvent.click(
      screen.getByRole('button', { name: 'Ya lo entregué, cerrar' }),
    );
    expect(document.body.textContent).not.toContain(TOKEN);
    expect(storage.writes).toEqual([]);
  });

  it('una cuenta pendiente ofrece generar el enlace de activación', async () => {
    mockApi({ ...routes(), [`GET /users/${UID}`]: () => json(PENDING) });
    renderDetail();
    expect(
      await screen.findByRole('button', {
        name: 'Generar enlace de activación',
      }),
    ).toBeInTheDocument();
  });

  it('asigna un rol (solo los no asignados) y retira otro con confirmación', async () => {
    const api = mockApi({
      ...routes(),
      [`PUT /users/${UID}/roles/${SYS}`]: () => noContent(),
      [`DELETE /users/${UID}/roles/${RID}`]: () => noContent(),
    });
    renderDetail();
    const select = await screen.findByLabelText('Asignar rol');
    expect(
      within(select).queryByRole('option', { name: /Delegado/ }),
    ).not.toBeInTheDocument();
    await userEvent.selectOptions(select, SYS);
    await userEvent.click(screen.getByRole('button', { name: 'Asignar' }));
    expect(
      await screen.findByText(/Se asignó el rol «Superadministrador»/),
    ).toBeInTheDocument();
    expect(api.of('PUT', `/users/${UID}/roles/${SYS}`)).toHaveLength(1);

    await userEvent.click(
      screen.getByRole('button', { name: 'Retirar el rol Delegado' }),
    );
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'perderá de inmediato',
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Retirar rol',
      }),
    );
    expect(
      await screen.findByText(/Se retiró el rol «Delegado»/),
    ).toBeInTheDocument();
  });

  it('muestra el rechazo por escalada de privilegios al asignar un rol', async () => {
    mockApi({
      ...routes(),
      [`PUT /users/${UID}/roles/${SYS}`]: () =>
        error(403, 'No puede gestionar un rol con permisos que usted no posee'),
    });
    renderDetail();
    await userEvent.selectOptions(
      await screen.findByLabelText('Asignar rol'),
      SYS,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Asignar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No puede gestionar un rol con permisos que usted no posee',
    );
  });

  it('cierra una sesión concreta y todas, con motivo', async () => {
    const api = mockApi({
      ...routes(),
      [`POST /users/${UID}/sessions/s1/revoke`]: () => noContent(),
      [`POST /users/${UID}/sessions/revoke`]: () =>
        json({ revokedSessions: 1 }),
    });
    renderDetail();
    await screen.findByText('Firefox/130');
    await userEvent.click(
      screen.getByRole('button', { name: /Cerrar la sesión iniciada el/ }),
    );
    await userEvent.type(
      within(screen.getByRole('dialog')).getByLabelText(/Motivo/),
      'Equipo compartido',
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cerrar sesión',
      }),
    );
    expect(await screen.findByText('Sesión cerrada.')).toBeInTheDocument();
    expect(api.of('POST', `/users/${UID}/sessions/s1/revoke`)[0]!.body).toEqual(
      { reason: 'Equipo compartido' },
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Cerrar todas las sesiones' }),
    );
    await userEvent.type(
      within(screen.getByRole('dialog')).getByLabelText(/Motivo/),
      'Sospecha de acceso',
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cerrar todas',
      }),
    );
    expect(await screen.findByText('Sesiones cerradas.')).toBeInTheDocument();
  });

  it('un usuario inexistente muestra el error con enlace de regreso', async () => {
    mockApi({
      [`GET /users/${UID}`]: () => error(404, 'Usuario no encontrado'),
      [`GET /users/${UID}/sessions`]: () => error(404, 'x'),
      'GET /roles': () => json([]),
    });
    renderDetail();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Usuario no encontrado',
    );
    expect(
      screen.getByRole('link', { name: 'Volver al listado' }),
    ).toBeInTheDocument();
  });
});

// ───────────────────────── roles y permisos ─────────────────────────

describe('roles', () => {
  it('lista roles distinguiendo los de sistema de los configurables', async () => {
    mockApi({ 'GET /roles': () => json([SYSTEM_ROLE, ROLE]) });
    render(<RolesPage permissions={['roles:read', 'roles:manage']} />);
    const table = await screen.findByRole('table');
    expect(within(table).getByText('De sistema')).toBeInTheDocument();
    expect(within(table).getByText('Configurable')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Ver el rol Superadministrador' }),
    ).toHaveTextContent('Ver');
    expect(
      screen.getByRole('link', { name: 'Ver el rol Delegado' }),
    ).toHaveTextContent('Ver y editar');
  });

  it('crea un rol sin permisos tras validar el código', async () => {
    const api = mockApi({
      'GET /roles': () => json([]),
      'POST /roles': () =>
        json({ ...ROLE, permissions: [], userCount: 0 }, 201),
    });
    render(<RolesPage permissions={['roles:read', 'roles:manage']} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nuevo rol' }),
    );
    await userEvent.type(screen.getByLabelText(/Código/), 'Rol Malo');
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Delegado');
    await userEvent.click(screen.getByRole('button', { name: 'Crear rol' }));
    expect(screen.getByLabelText(/Código/)).toHaveAccessibleDescription(
      /minúsculas, números y guion bajo/,
    );
    expect(api.of('POST', '/roles')).toHaveLength(0);

    await userEvent.clear(screen.getByLabelText(/Código/));
    await userEvent.type(screen.getByLabelText(/Código/), 'delegado');
    await userEvent.click(screen.getByRole('button', { name: 'Crear rol' }));
    expect(
      await screen.findByText(/Se creó el rol «Delegado»/),
    ).toBeInTheDocument();
    expect(api.of('POST', '/roles')[0]!.body).toEqual({
      code: 'delegado',
      name: 'Delegado',
    });
  });

  it('solo con lectura no ofrece crear roles', async () => {
    mockApi({ 'GET /roles': () => json([ROLE]) });
    render(<RolesPage permissions={['roles:read']} />);
    await screen.findByRole('table');
    expect(
      screen.queryByRole('button', { name: 'Nuevo rol' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Ver el rol Delegado' }),
    ).toHaveTextContent('Ver');
    expect(
      screen.getByRole('link', { name: 'Ver el rol Delegado' }),
    ).not.toHaveTextContent('editar');
  });
});

describe('editor de permisos de un rol', () => {
  const HELD = ['roles:read', 'roles:manage', 'sports:read', 'sports:manage'];
  const routes = (role: AdminRole) => ({
    [`GET /roles/${role.id}`]: () => json(role),
    'GET /permissions': () => json(CATALOG),
  });

  it('agrupa los permisos por módulo y explica que leer, gestionar y eliminar son distintos', async () => {
    mockApi(routes(ROLE));
    render(<RoleDetailPage roleId={RID} permissions={HELD} />);
    await screen.findByRole('heading', { name: 'Delegado' });
    for (const group of ['Usuarios', 'Deportes', 'Auditoría']) {
      expect(screen.getByRole('group', { name: group })).toBeInTheDocument();
    }
    const sports = screen.getByRole('group', { name: 'Deportes' });
    expect(within(sports).getAllByRole('checkbox')).toHaveLength(3);
    expect(
      screen.getByText(/Cada capacidad es independiente/),
    ).toBeInTheDocument();
    expect(
      within(sports).getByRole('checkbox', { name: /Consultar/ }),
    ).toBeChecked();
    expect(
      within(sports).getByRole('checkbox', { name: /Eliminar/ }),
    ).not.toBeChecked();
  });

  it('deshabilita los permisos que el usuario no posee (no puede delegarlos)', async () => {
    mockApi(routes(ROLE));
    render(<RoleDetailPage roleId={RID} permissions={HELD} />);
    await screen.findByRole('heading', { name: 'Delegado' });
    expect(
      screen.getByRole('checkbox', { name: /Eliminar deportes/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: /Consultar la auditoría/ }),
    ).toBeDisabled();
    expect(screen.getAllByText(/no puede delegarlo/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('checkbox', { name: /Consultar usuarios/ }),
    ).toBeDisabled();
  });

  it('un rol de sistema es de solo lectura, incluso para quien lo posee todo', async () => {
    mockApi(routes(SYSTEM_ROLE));
    render(
      <RoleDetailPage
        roleId={SYS}
        permissions={[...HELD, 'audit:read', 'sports:delete', 'users:read']}
      />,
    );
    await screen.findByRole('heading', { name: 'Superadministrador' });
    expect(
      screen.getByText(/no puede modificarse desde la interfaz/),
    ).toBeInTheDocument();
    for (const box of screen.getAllByRole('checkbox'))
      expect(box).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Guardar permisos' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Editar nombre/ }),
    ).not.toBeInTheDocument();
  });

  it('si el rol tiene permisos que el usuario no posee, avisa y no permite editarlo', async () => {
    mockApi(routes({ ...ROLE, permissions: ['sports:read', 'audit:read'] }));
    render(<RoleDetailPage roleId={RID} permissions={HELD} />);
    expect(
      await screen.findByText(
        /incluye permisos que usted no posee \(audit:read\)/,
      ),
    ).toBeInTheDocument();
    for (const box of screen.getAllByRole('checkbox'))
      expect(box).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Guardar permisos' }),
    ).not.toBeInTheDocument();
  });

  it('confirma el cambio explicando el impacto y envía la lista completa', async () => {
    const api = mockApi({
      ...routes(ROLE),
      [`PUT /roles/${RID}/permissions`]: () =>
        json({ ...ROLE, added: [], removed: ['sports:manage'] }),
    });
    render(<RoleDetailPage roleId={RID} permissions={HELD} />);
    await screen.findByRole('heading', { name: 'Delegado' });
    expect(
      screen.getByRole('button', { name: 'Guardar permisos' }),
    ).toBeDisabled();

    await userEvent.click(
      screen.getByRole('checkbox', { name: /Crear, modificar y activar/ }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar permisos' }),
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Afecta a 3 usuarios');
    expect(dialog).toHaveTextContent('Se retirarán: sports:manage');
    expect(dialog).toHaveTextContent('Se añadirán: ninguno');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Guardar cambios' }),
    );

    expect(
      await screen.findByText('Permisos actualizados.'),
    ).toBeInTheDocument();
    expect(api.of('PUT', `/roles/${RID}/permissions`)[0]!.body).toEqual({
      permissions: ['sports:read'],
    });
    expect(
      api.of('PUT', `/roles/${RID}/permissions`)[0]!.headers['X-CSRF-Token'],
    ).toBe('csrf-de-prueba');
  });

  it('cancelar el diálogo no envía nada, y descartar cambios restablece la selección', async () => {
    const api = mockApi(routes(ROLE));
    render(<RoleDetailPage roleId={RID} permissions={HELD} />);
    await screen.findByRole('heading', { name: 'Delegado' });
    const manage = screen.getByRole('checkbox', {
      name: /Crear, modificar y activar/,
    });
    await userEvent.click(manage);
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar permisos' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancelar',
      }),
    );
    expect(api.calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
    await userEvent.click(
      screen.getByRole('button', { name: 'Descartar cambios' }),
    );
    expect(manage).toBeChecked();
  });

  it('explica el rechazo del servidor (p. ej. escalada) sin perder la pantalla', async () => {
    mockApi({
      ...routes(ROLE),
      [`PUT /roles/${RID}/permissions`]: () =>
        error(403, 'No puede modificar un rol que usted mismo tiene asignado'),
    });
    render(<RoleDetailPage roleId={RID} permissions={HELD} />);
    await screen.findByRole('heading', { name: 'Delegado' });
    await userEvent.click(
      screen.getByRole('checkbox', { name: /Crear, modificar y activar/ }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar permisos' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Guardar cambios',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No puede modificar un rol que usted mismo tiene asignado',
    );
  });

  it('edita nombre y descripción de un rol configurable', async () => {
    const api = mockApi({
      ...routes(ROLE),
      [`PATCH /roles/${RID}`]: () => json(ROLE),
    });
    render(<RoleDetailPage roleId={RID} permissions={HELD} />);
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Editar nombre y descripción',
      }),
    );
    const name = screen.getByLabelText('Nombre');
    await userEvent.clear(name);
    await userEvent.type(name, 'Delegado de deportes');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      await screen.findByText('Datos del rol actualizados.'),
    ).toBeInTheDocument();
    expect(api.of('PATCH', `/roles/${RID}`)[0]!.body).toEqual({
      name: 'Delegado de deportes',
      description: 'Gestiona deportes',
    });
  });
});

// ───────────────────────── auditoría ─────────────────────────

describe('auditoría', () => {
  const ENTRY: AuditEntry = {
    id: 'a1',
    createdAt: '2026-10-01T15:00:00.000Z',
    action: 'user.status_change',
    entityType: 'user',
    entityId: UID,
    actor: {
      id: SELF,
      email: 'root@liga.example',
      displayName: 'Administrador',
    },
    reason: 'Baja del dirigente',
    before: { status: 'activo' },
    after: { status: 'inactivo', passwordHash: '[oculto]' },
  };

  it('muestra los registros con actor, acción, entidad y detalle seguro, sin acciones de edición', async () => {
    mockApi({
      'GET /audit-logs': () =>
        page([
          ENTRY,
          {
            ...ENTRY,
            id: 'a2',
            actor: null,
            reason: null,
            before: null,
            after: null,
            action: 'auth.login_failed',
          },
        ]),
    });
    render(<AuditPage />);
    const table = await screen.findByRole('table');
    expect(within(table).getByText('user.status_change')).toBeInTheDocument();
    expect(
      within(table).getByText(/Administrador \(root@liga.example\)/),
    ).toBeInTheDocument();
    expect(within(table).getByText('Sistema o anónimo')).toBeInTheDocument();

    await userEvent.click(within(table).getByText('Ver detalle'));
    expect(within(table).getByText(/Baja del dirigente/)).toBeInTheDocument();
    expect(table.textContent).toContain('"status": "inactivo"');
    expect(table.textContent).toContain('[oculto]');
    // Solo lectura
    expect(
      screen.queryByRole('button', {
        name: /Editar|Eliminar|Borrar|Modificar/,
      }),
    ).not.toBeInTheDocument();
  });

  it('envía los filtros a la API, valida el rango de fechas y permite limpiarlos', async () => {
    const api = mockApi({ 'GET /audit-logs': () => page([ENTRY]) });
    render(<AuditPage />);
    await screen.findByRole('table');

    await userEvent.type(screen.getByLabelText('Desde'), '2026-10-05');
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-10-01');
    await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      '«Desde» no puede ser posterior a «Hasta»',
    );

    await userEvent.clear(screen.getByLabelText('Hasta'));
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-10-31');
    await userEvent.type(
      screen.getByLabelText('Actor (nombre o correo)'),
      ' root ',
    );
    await userEvent.type(screen.getByLabelText(/Acción/), 'user.create');
    await userEvent.type(screen.getByLabelText('Tipo de entidad'), 'user');
    await userEvent.type(
      screen.getByLabelText('Identificador de entidad'),
      UID,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    await waitFor(() =>
      expect(api.of('GET', '/audit-logs').at(-1)!.query.get('actor')).toBe(
        'root',
      ),
    );
    const q = api.of('GET', '/audit-logs').at(-1)!.query;
    expect([
      q.get('from'),
      q.get('to'),
      q.get('action'),
      q.get('entityType'),
      q.get('entityId'),
    ]).toEqual(['2026-10-05', '2026-10-31', 'user.create', 'user', UID]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Limpiar filtros' }),
    );
    await waitFor(() =>
      expect(
        api.of('GET', '/audit-logs').at(-1)!.query.get('actor'),
      ).toBeNull(),
    );
  });

  it('muestra estado vacío con y sin filtros, error con reintento y paginación', async () => {
    let mode: 'empty' | 'error' | 'many' = 'empty';
    const api = mockApi({
      'GET /audit-logs': (c) =>
        mode === 'error'
          ? error(500, 'Error interno')
          : mode === 'many'
            ? page([ENTRY], { total: 60, page: Number(c.query.get('page')) })
            : page([]),
    });
    render(<AuditPage />);
    expect(
      await screen.findByText('Todavía no hay registros de auditoría.'),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Acción/), 'x.y');
    await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(
      await screen.findByText('No hay registros con los filtros aplicados.'),
    ).toBeInTheDocument();

    mode = 'error';
    await userEvent.type(screen.getByLabelText(/Acción/), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno');
    mode = 'many';
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByText(/Página 1 de 3 · 60 registros/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() =>
      expect(api.of('GET', '/audit-logs').at(-1)!.query.get('page')).toBe('2'),
    );
  });
});

// ───────────────────────── contraseñas ─────────────────────────

describe('cambio de la propia contraseña', () => {
  const fill = async (current: string, next: string, confirm: string) => {
    await userEvent.type(screen.getByLabelText('Contraseña actual'), current);
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), next);
    await userEvent.type(
      screen.getByLabelText('Repita la nueva contraseña'),
      confirm,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Cambiar contraseña' }),
    );
  };

  it('valida longitud y coincidencia antes de enviar', async () => {
    const api = mockApi({});
    render(<ChangePasswordForm />);
    await fill('actual-actual-1', 'corta', 'otra');
    expect(
      screen.getByLabelText('Nueva contraseña'),
    ).toHaveAccessibleDescription(/al menos 12 caracteres/);
    expect(
      screen.getByLabelText('Repita la nueva contraseña'),
    ).toHaveAccessibleDescription('Las contraseñas no coinciden.');
    expect(api.calls).toHaveLength(0);
  });

  it('cambia la contraseña, informa las sesiones cerradas y vacía los campos', async () => {
    const api = mockApi({
      'POST /auth/password/change': () => json({ revokedSessions: 2 }),
    });
    render(<ChangePasswordForm />);
    await fill(
      'actual-actual-1',
      'nueva-contraseña-larga-9',
      'nueva-contraseña-larga-9',
    );
    expect(await screen.findByText(/Contraseña actualizada/)).toHaveTextContent(
      'Se cerraron 2 sesiones en otros dispositivos',
    );
    expect(api.of('POST', '/auth/password/change')[0]!.body).toEqual({
      currentPassword: 'actual-actual-1',
      newPassword: 'nueva-contraseña-larga-9',
    });
    expect(
      api.of('POST', '/auth/password/change')[0]!.headers['X-CSRF-Token'],
    ).toBe('csrf-de-prueba');
    for (const label of [
      'Contraseña actual',
      'Nueva contraseña',
      'Repita la nueva contraseña',
    ]) {
      expect(screen.getByLabelText(label)).toHaveValue('');
    }
    expect(storage.writes).toEqual([]);
    expect(document.body.textContent).not.toContain('nueva-contraseña-larga-9');
  });

  it('muestra el error de contraseña actual en su campo, sin cerrar la sesión', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedListener(onUnauthorized);
    mockApi({
      'POST /auth/password/change': () =>
        error(400, 'Solicitud inválida', [
          {
            field: 'currentPassword',
            message: 'La contraseña actual no es correcta',
          },
        ]),
    });
    render(<ChangePasswordForm />);
    await fill(
      'equivocada-1234',
      'nueva-contraseña-larga-9',
      'nueva-contraseña-larga-9',
    );
    expect(
      await screen.findByText('La contraseña actual no es correcta'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña actual')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('informa del bloqueo temporal por demasiados intentos', async () => {
    mockApi({
      'POST /auth/password/change': () =>
        json({ statusCode: 429, message: 'Demasiados intentos' }, 429, {
          'Retry-After': '300',
        }),
    });
    render(<ChangePasswordForm />);
    await fill(
      'actual-actual-1',
      'nueva-contraseña-larga-9',
      'nueva-contraseña-larga-9',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiados intentos',
    );
  });
});

describe('enlaces de activación y restablecimiento', () => {
  const fillNew = async (password: string, confirm = password) => {
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), password);
    await userEvent.type(
      screen.getByLabelText(/Repita la contraseña/),
      confirm,
    );
  };

  it('la ruta del enlace muestra el formulario, borra el token de la dirección y lo canjea una vez', async () => {
    window.location.hash = `#/activar/${TOKEN}`;
    const api = mockApi({
      'GET /auth/session': () => error(401, 'Sesión no válida o expirada'),
      'POST /auth/password/complete': () => noContent(),
    });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Activar su cuenta' }),
    ).toBeInTheDocument();
    // El token ya no está en la dirección (ni en el historial)
    expect(window.location.hash).toBe('#/');
    expect(window.location.href).not.toContain(TOKEN);

    await fillNew('mi-contraseña-segura-9');
    await userEvent.click(
      screen.getByRole('button', { name: 'Activar cuenta' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Cuenta activada' }),
    ).toBeInTheDocument();
    const post = api.of('POST', '/auth/password/complete')[0]!;
    expect(post.body).toEqual({
      token: TOKEN,
      password: 'mi-contraseña-segura-9',
    });
    expect(storage.writes).toEqual([]);
    expect(document.body.textContent).not.toContain('mi-contraseña-segura-9');

    await userEvent.click(
      screen.getByRole('button', { name: 'Ir a iniciar sesión' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeInTheDocument();
  });

  it('un enlace de restablecimiento usa el texto y la ruta correspondientes', async () => {
    window.location.hash = `#/restablecer/${TOKEN}`;
    mockApi({
      'GET /auth/session': () => error(401, 'x'),
      'POST /auth/password/complete': () => noContent(),
    });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Restablecer su contraseña' }),
    ).toBeInTheDocument();
    await fillNew('mi-contraseña-segura-9');
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar contraseña' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Contraseña restablecida' }),
    ).toBeInTheDocument();
  });

  it('muestra el error de un enlace inválido o vencido sin revelar más', async () => {
    window.location.hash = `#/activar/${TOKEN}`;
    mockApi({
      'GET /auth/session': () => error(401, 'x'),
      'POST /auth/password/complete': () =>
        error(400, 'El enlace no es válido o ya venció'),
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Activar su cuenta' });
    await fillNew('mi-contraseña-segura-9');
    await userEvent.click(
      screen.getByRole('button', { name: 'Activar cuenta' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El enlace no es válido o ya venció',
    );
    // Los campos de contraseña se vacían tras el intento
    expect(screen.getByLabelText('Nueva contraseña')).toHaveValue('');
  });

  it('valida la contraseña antes de enviar y muestra el rechazo de política del servidor', async () => {
    window.location.hash = `#/activar/${TOKEN}`;
    const api = mockApi({
      'GET /auth/session': () => error(401, 'x'),
      'POST /auth/password/complete': () =>
        error(400, 'Solicitud inválida', [
          {
            field: 'password',
            message:
              'La contraseña no debe contener el nombre de usuario del correo.',
          },
        ]),
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Activar su cuenta' });
    await fillNew('corta', 'distinta');
    await userEvent.click(
      screen.getByRole('button', { name: 'Activar cuenta' }),
    );
    expect(
      screen.getByLabelText('Nueva contraseña'),
    ).toHaveAccessibleDescription(/al menos 12 caracteres/);
    expect(api.of('POST', '/auth/password/complete')).toHaveLength(0);

    await userEvent.clear(screen.getByLabelText('Nueva contraseña'));
    await userEvent.clear(screen.getByLabelText(/Repita la contraseña/));
    await userEvent.type(
      screen.getByLabelText('Nueva contraseña'),
      'luis-luis-luis-luis',
    );
    await userEvent.type(
      screen.getByLabelText(/Repita la contraseña/),
      'luis-luis-luis-luis',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Activar cuenta' }),
    );
    expect(
      await screen.findByText(/no debe contener el nombre de usuario/),
    ).toBeInTheDocument();
  });

  it('una dirección con un token mal formado no abre el formulario', async () => {
    window.location.hash = '#/activar/corto';
    mockApi({ 'GET /auth/session': () => error(401, 'x') });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeInTheDocument();
  });
});

// ───────────────────────── navegación ─────────────────────────

describe('navegación de administración', () => {
  const session = (permissions: string[]) => ({
    user: {
      id: SELF,
      email: 'root@liga.example',
      displayName: 'Administrador',
    },
    permissions,
    csrfToken: 'csrf-de-prueba',
    expiresAt: '2030-01-01T00:00:00.000Z',
  });
  const health = () =>
    json({ status: 'ok', service: 'liga-api', timestamp: 'x' });

  it('muestra solo las secciones permitidas y siempre «Mi cuenta»', async () => {
    mockApi({
      'GET /auth/session': () => json(session(['users:read', 'audit:read'])),
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
      'Usuarios',
      'Auditoría',
      'Notificaciones',
      'Mi cuenta',
    ]);
  });

  it('una dirección de auditoría sin permiso no la muestra ni consulta la API', async () => {
    window.location.hash = '#/auditoria';
    const api = mockApi({
      'GET /auth/session': () => json(session(['users:read'])),
      'GET /health': health,
    });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Inicio' }),
    ).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/audit-logs')).toBe(false);
  });

  it('abre el detalle de un usuario desde su dirección', async () => {
    window.location.hash = `#/usuarios/${UID}`;
    mockApi({
      'GET /auth/session': () => json(session(['users:read'])),
      'GET /health': health,
      [`GET /users/${UID}`]: () => json(ANA),
      [`GET /users/${UID}/sessions`]: () => json([]),
    });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Ana Pérez' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('si la sesión expira durante una operación administrativa, vuelve al acceso', async () => {
    window.location.hash = `#/usuarios/${UID}`;
    mockApi({
      'GET /auth/session': () => json(session(['users:read', 'users:update'])),
      'GET /health': health,
      [`GET /users/${UID}`]: () => json(ANA),
      [`GET /users/${UID}/sessions`]: () => json([]),
      [`PATCH /users/${UID}/status`]: () =>
        error(401, 'Sesión no válida o expirada'),
    });
    render(<App />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Desactivar' }),
    );
    await userEvent.type(
      within(screen.getByRole('dialog')).getByLabelText(/Motivo/),
      'prueba',
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Desactivar',
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Su sesión expiró o fue cerrada/),
    ).toBeInTheDocument();
  });
});
