import { type FormEvent, useId, useState } from 'react';
import { ApiError, apiRequest } from '../../api/client.ts';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import {
  Notice,
  type NoticeState,
  describeError,
} from '../../components/Notice.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { CredentialLinkPanel } from './CredentialLinkPanel.tsx';
import {
  type AdminRole,
  type AdminUser,
  type CredentialLink,
  USER_STATUS_LABELS,
  type UserSession,
  formatDateTime,
} from './types.ts';
import { StatusBadge } from './UsersPage.tsx';

type Pending =
  | {
      kind: 'status';
      status: 'activo' | 'inactivo' | 'bloqueado';
      label: string;
      description: string;
    }
  | { kind: 'revoke-one'; session: UserSession }
  | { kind: 'revoke-all' }
  | { kind: 'remove-role'; role: AdminRole['id']; name: string }
  | { kind: 'credential-link' };

interface Props {
  userId: string;
  selfId: string;
  permissions: readonly string[];
}

export function UserDetailPage({ userId, selfId, permissions }: Props) {
  const isSelf = userId === selfId;
  const canUpdate = permissions.includes('users:update') && !isSelf;
  const canManageRoles = permissions.includes('roles:manage') && !isSelf;
  const canReadRoles = permissions.includes('roles:read');
  const canReadSessions = permissions.includes('users:read');

  const [user, reloadUser] = useFetch<AdminUser>(`/users/${userId}`);
  const [sessions, reloadSessions] = useFetch<UserSession[]>(
    canReadSessions ? `/users/${userId}/sessions` : null,
  );
  const [roles] = useFetch<AdminRole[]>(canReadRoles ? '/roles' : null);

  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [link, setLink] = useState<CredentialLink | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [roleToAssign, setRoleToAssign] = useState('');
  const roleSelectId = useId();

  async function perform(operation: () => Promise<unknown>, success: string) {
    try {
      await operation();
      setNotice({ type: 'success', text: success });
      reloadUser();
      reloadSessions();
    } catch (error) {
      // Un 401 lo gestiona el proveedor de sesión (vuelve al acceso).
      setNotice({ type: 'error', text: describeError(error) });
    }
  }

  if (user.kind === 'loading')
    return <output className="loading">Cargando…</output>;
  if (user.kind === 'error') {
    return (
      <div className="state-error" role="alert">
        <p>{user.message}</p>
        <button type="button" onClick={reloadUser}>
          Reintentar
        </button>{' '}
        <a href="#/usuarios">Volver al listado</a>
      </div>
    );
  }

  const u = user.data;
  const statusActions =
    u.status === 'activo'
      ? ([
          {
            status: 'inactivo',
            label: 'Desactivar',
            description:
              'La cuenta no podrá iniciar sesión y se cerrarán todas sus sesiones. Se conserva su historial.',
          },
          {
            status: 'bloqueado',
            label: 'Bloquear',
            description:
              'La cuenta quedará bloqueada y se cerrarán todas sus sesiones.',
          },
        ] as const)
      : u.status === 'pendiente'
        ? ([
            {
              status: 'inactivo',
              label: 'Cancelar la cuenta',
              description:
                'La cuenta pendiente se desactivará y su enlace de activación dejará de servir.',
            },
          ] as const)
        : ([
            {
              status: 'activo',
              label: 'Activar',
              description:
                'La cuenta podrá iniciar sesión de nuevo con su contraseña actual.',
            },
          ] as const);

  const assigned = new Set(u.roles.map((r) => r.id));
  const assignable =
    roles.kind === 'ready' ? roles.data.filter((r) => !assigned.has(r.id)) : [];
  const linkKind =
    u.status === 'pendiente'
      ? 'activación'
      : u.status === 'activo'
        ? 'restablecimiento'
        : null;

  return (
    <section aria-labelledby="user-title" className="catalog">
      <p>
        <a href="#/usuarios">← Volver a usuarios</a>
      </p>
      <div className="catalog-header">
        <h1 id="user-title">{u.displayName}</h1>
        <StatusBadge status={u.status} />
      </div>
      {isSelf && (
        <p className="notice">
          Esta es su propia cuenta: por seguridad no puede cambiar aquí su
          estado ni sus roles. Para cambiar su contraseña use{' '}
          <a href="#/cuenta">Mi cuenta</a>.
        </p>
      )}
      <Notice notice={notice} onClose={() => setNotice(null)} />
      {link && (
        <CredentialLinkPanel
          link={link}
          userLabel={u.displayName}
          onClose={() => setLink(null)}
        />
      )}

      <h2>Datos</h2>
      {editing ? (
        <EditUserForm
          user={u}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setNotice({ type: 'success', text: 'Datos actualizados.' });
            reloadUser();
          }}
        />
      ) : (
        <dl className="definition-list">
          <dt>Correo</dt>
          <dd>{u.email}</dd>
          <dt>Estado</dt>
          <dd>{USER_STATUS_LABELS[u.status]}</dd>
          <dt>Última conexión</dt>
          <dd>{formatDateTime(u.lastLoginAt)}</dd>
          <dt>Creada</dt>
          <dd>{formatDateTime(u.createdAt)}</dd>
          <dt>Modificada</dt>
          <dd>{formatDateTime(u.updatedAt)}</dd>
        </dl>
      )}
      {canUpdate && !editing && (
        <div className="form-actions">
          <button type="button" onClick={() => setEditing(true)}>
            Editar datos
          </button>
          {statusActions.map((a) => (
            <button
              key={a.status}
              type="button"
              onClick={() => setPending({ kind: 'status', ...a })}
            >
              {a.label}
            </button>
          ))}
          {linkKind && (
            <button
              type="button"
              onClick={() => setPending({ kind: 'credential-link' })}
            >
              Generar enlace de {linkKind}
            </button>
          )}
        </div>
      )}

      <h2>Roles</h2>
      {u.roles.length === 0 ? (
        <p className="muted">Esta cuenta no tiene roles ni permisos.</p>
      ) : (
        <ul className="plain-list">
          {u.roles.map((r) => (
            <li key={r.id}>
              <strong>{r.name}</strong> <code>{r.code}</code>
              {canManageRoles && (
                <button
                  type="button"
                  aria-label={`Retirar el rol ${r.name}`}
                  onClick={() =>
                    setPending({
                      kind: 'remove-role',
                      role: r.id,
                      name: r.name,
                    })
                  }
                >
                  Retirar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManageRoles && canReadRoles && (
        <div className="filters">
          <div className="field">
            <label htmlFor={roleSelectId}>Asignar rol</label>
            <select
              id={roleSelectId}
              value={roleToAssign}
              onChange={(e) => setRoleToAssign(e.target.value)}
            >
              <option value="">Seleccione un rol…</option>
              {assignable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.permissions.length} permisos)
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="primary"
            disabled={!roleToAssign}
            onClick={() => {
              const roleId = roleToAssign;
              const name =
                assignable.find((r) => r.id === roleId)?.name ?? 'rol';
              setRoleToAssign('');
              void perform(
                () =>
                  apiRequest(`/users/${userId}/roles/${roleId}`, {
                    method: 'PUT',
                  }),
                `Se asignó el rol «${name}».`,
              );
            }}
          >
            Asignar
          </button>
        </div>
      )}
      {canManageRoles && (
        <p className="hint">
          Solo puede asignar roles cuyos permisos usted también posee. Los
          cambios se aplican en la siguiente petición del usuario.
        </p>
      )}

      {canReadSessions && (
        <>
          <h2>Sesiones activas</h2>
          {sessions.kind === 'loading' && (
            <output className="loading">Cargando…</output>
          )}
          {sessions.kind === 'error' && (
            <div className="state-error" role="alert">
              <p>{sessions.message}</p>
              <button type="button" onClick={reloadSessions}>
                Reintentar
              </button>
            </div>
          )}
          {sessions.kind === 'ready' && sessions.data.length === 0 && (
            <p className="empty">No hay sesiones activas.</p>
          )}
          {sessions.kind === 'ready' && sessions.data.length > 0 && (
            <>
              <table className="responsive-table">
                <caption className="visually-hidden">Sesiones activas</caption>
                <thead>
                  <tr>
                    <th scope="col">Inicio</th>
                    <th scope="col">Última actividad</th>
                    <th scope="col">Vence</th>
                    <th scope="col">Dispositivo</th>
                    {permissions.includes('users:update') && (
                      <th scope="col">Acciones</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sessions.data.map((s) => (
                    <tr key={s.id}>
                      <td data-label="Inicio">{formatDateTime(s.createdAt)}</td>
                      <td data-label="Última actividad">
                        {formatDateTime(s.lastSeenAt)}
                      </td>
                      <td data-label="Vence">{formatDateTime(s.expiresAt)}</td>
                      <td data-label="Dispositivo">
                        {s.userAgent ?? 'Desconocido'}
                      </td>
                      {permissions.includes('users:update') && (
                        <td data-label="Acciones" className="row-actions">
                          <button
                            type="button"
                            aria-label={`Cerrar la sesión iniciada el ${formatDateTime(s.createdAt)}`}
                            onClick={() =>
                              setPending({ kind: 'revoke-one', session: s })
                            }
                          >
                            Cerrar sesión
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {permissions.includes('users:update') && (
                <button
                  type="button"
                  className="danger-outline"
                  onClick={() => setPending({ kind: 'revoke-all' })}
                >
                  Cerrar todas las sesiones
                </button>
              )}
            </>
          )}
        </>
      )}

      {pending?.kind === 'status' && (
        <ConfirmDialog
          title={`${pending.label}: ${u.displayName}`}
          description={pending.description}
          confirmLabel={pending.label}
          reason="required"
          danger={pending.status !== 'activo'}
          onCancel={() => setPending(null)}
          onConfirm={async (reason) => {
            const p = pending;
            setPending(null);
            await perform(
              () =>
                apiRequest(`/users/${userId}/status`, {
                  method: 'PATCH',
                  body: { status: p.status, reason },
                }),
              `Estado actualizado: ${p.label.toLowerCase()}.`,
            );
          }}
        />
      )}
      {pending?.kind === 'revoke-all' && (
        <ConfirmDialog
          title="Cerrar todas las sesiones"
          description={`${u.displayName} tendrá que iniciar sesión de nuevo en todos sus dispositivos.`}
          confirmLabel="Cerrar todas"
          reason="required"
          danger
          onCancel={() => setPending(null)}
          onConfirm={async (reason) => {
            setPending(null);
            await perform(
              () =>
                apiRequest(`/users/${userId}/sessions/revoke`, {
                  method: 'POST',
                  body: { reason },
                }),
              'Sesiones cerradas.',
            );
          }}
        />
      )}
      {pending?.kind === 'revoke-one' && (
        <ConfirmDialog
          title="Cerrar sesión"
          description={`Se cerrará la sesión iniciada el ${formatDateTime(pending.session.createdAt)}.`}
          confirmLabel="Cerrar sesión"
          reason="required"
          danger
          onCancel={() => setPending(null)}
          onConfirm={async (reason) => {
            const sessionId = pending.session.id;
            setPending(null);
            await perform(
              () =>
                apiRequest(`/users/${userId}/sessions/${sessionId}/revoke`, {
                  method: 'POST',
                  body: { reason },
                }),
              'Sesión cerrada.',
            );
          }}
        />
      )}
      {pending?.kind === 'remove-role' && (
        <ConfirmDialog
          title={`Retirar el rol «${pending.name}»`}
          description={`${u.displayName} perderá de inmediato los permisos que este rol le otorga.`}
          confirmLabel="Retirar rol"
          danger
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            const roleId = pending.role;
            const name = pending.name;
            setPending(null);
            await perform(
              () =>
                apiRequest(`/users/${userId}/roles/${roleId}`, {
                  method: 'DELETE',
                }),
              `Se retiró el rol «${name}».`,
            );
          }}
        />
      )}
      {pending?.kind === 'credential-link' && (
        <ConfirmDialog
          title={`Generar enlace de ${linkKind}`}
          description={
            u.status === 'pendiente'
              ? 'Se anulará el enlace de activación anterior, si existe. El nuevo enlace se mostrará una sola vez.'
              : 'Se anulará cualquier enlace anterior. Con el nuevo enlace el titular fijará una nueva contraseña y se cerrarán todas sus sesiones. Se mostrará una sola vez.'
          }
          confirmLabel="Generar enlace"
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            setPending(null);
            try {
              const issued = await apiRequest<CredentialLink>(
                `/users/${userId}/credential-link`,
                { method: 'POST' },
              );
              setLink(issued);
              setNotice(null);
            } catch (error) {
              setNotice({ type: 'error', text: describeError(error) });
            }
          }}
        />
      )}
    </section>
  );
}

function EditUserForm({
  user,
  onSaved,
  onCancel,
}: {
  user: AdminUser;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found: Record<string, string> = {};
    if (!displayName.trim()) found.displayName = 'Ingrese el nombre.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim()))
      found.email = 'Ingrese un correo electrónico válido.';
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setSubmitting(true);
    try {
      await apiRequest(`/users/${user.id}`, {
        method: 'PATCH',
        body: { displayName: displayName.trim(), email: email.trim() },
      });
      onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors)
        setErrors(error.fieldErrors);
      setFormError(describeError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="catalog-form"
      onSubmit={submit}
      noValidate
      aria-label="Editar datos del usuario"
    >
      <div className="field">
        <label htmlFor={`${id}-n`}>Nombre completo</label>
        <input
          id={`${id}-n`}
          value={displayName}
          maxLength={120}
          onChange={(e) => setDisplayName(e.target.value)}
          aria-invalid={errors.displayName ? true : undefined}
          aria-describedby={errors.displayName ? `${id}-n-e` : undefined}
          disabled={submitting}
        />
        {errors.displayName && (
          <p className="field-error" id={`${id}-n-e`}>
            {errors.displayName}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${id}-e`}>Correo electrónico</label>
        <input
          id={`${id}-e`}
          type="email"
          value={email}
          maxLength={254}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? `${id}-e-e` : undefined}
          disabled={submitting}
        />
        {errors.email && (
          <p className="field-error" id={`${id}-e-e`}>
            {errors.email}
          </p>
        )}
        <p className="hint">
          Cambiar el correo anula cualquier enlace de contraseña pendiente.
        </p>
      </div>
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
