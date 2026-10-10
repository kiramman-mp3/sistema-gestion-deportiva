import { type FormEvent, useId, useState } from 'react';
import { ApiError, apiRequest } from '../../api/client.ts';
import {
  Notice,
  type NoticeState,
  describeError,
} from '../../components/Notice.tsx';
import { Pagination } from '../../components/Pagination.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { CredentialLinkPanel } from './CredentialLinkPanel.tsx';
import {
  type AdminRole,
  type AdminUser,
  type CredentialLink,
  type Page,
  USER_STATUS_LABELS,
  type UserStatus,
  formatDateTime,
} from './types.ts';

const PAGE_SIZE = 20;

export function StatusBadge({ status }: { status: UserStatus }) {
  const symbol = status === 'activo' ? '●' : status === 'pendiente' ? '◐' : '○';
  return (
    <span
      className={`badge ${status === 'activo' ? 'badge-success' : status === 'pendiente' ? 'badge-warning' : 'badge-neutral'}`}
    >
      <span aria-hidden="true">{symbol} </span>
      {USER_STATUS_LABELS[status]}
    </span>
  );
}

interface UsersPageProps {
  permissions: readonly string[];
}

export function UsersPage({ permissions }: UsersPageProps) {
  const canCreate = permissions.includes('users:create');
  const canReadRoles = permissions.includes('roles:read');
  const searchId = useId();
  const statusId = useId();
  const roleId = useId();

  const [filters, setFilters] = useState({
    q: '',
    status: '',
    roleId: '',
    page: 1,
  });
  const [searchText, setSearchText] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{
    user: AdminUser;
    link: CredentialLink;
  } | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(PAGE_SIZE),
  });
  if (filters.q) params.set('q', filters.q);
  if (filters.status) params.set('status', filters.status);
  if (filters.roleId) params.set('roleId', filters.roleId);
  const [list, reload] = useFetch<Page<AdminUser>>(`/users?${params}`);
  const [roles] = useFetch<AdminRole[]>(canReadRoles ? '/roles' : null);

  const filtersActive = Boolean(filters.q || filters.status || filters.roleId);
  const apply = (next: Partial<typeof filters>) =>
    setFilters((f) => ({ ...f, page: 1, ...next }));

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply({ q: searchText.trim() });
  }

  return (
    <section aria-labelledby="users-title" className="catalog">
      <div className="catalog-header">
        <h1 id="users-title">Usuarios</h1>
        {canCreate && !creating && (
          <button
            type="button"
            className="primary"
            onClick={() => {
              setNotice(null);
              setCreating(true);
            }}
          >
            Nuevo usuario
          </button>
        )}
      </div>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      {created && (
        <CredentialLinkPanel
          link={created.link}
          userLabel={created.user.displayName}
          onClose={() => setCreated(null)}
        />
      )}

      {creating && (
        <CreateUserForm
          onCancel={() => setCreating(false)}
          onCreated={(user, link) => {
            setCreating(false);
            setCreated({ user, link });
            setNotice({
              type: 'success',
              text: `Se creó la cuenta de ${user.displayName}, pendiente de activación.`,
            });
            reload();
          }}
        />
      )}

      <search>
        <form
          className="filters"
          onSubmit={onSearch}
          aria-label="Buscar usuarios"
        >
          <div className="field">
            <label htmlFor={searchId}>Buscar por nombre o correo</label>
            <input
              id={searchId}
              type="search"
              maxLength={100}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={statusId}>Estado</label>
            <select
              id={statusId}
              value={filters.status}
              onChange={(e) => apply({ status: e.target.value })}
            >
              <option value="">Todos</option>
              {(Object.keys(USER_STATUS_LABELS) as UserStatus[]).map((s) => (
                <option key={s} value={s}>
                  {USER_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          {canReadRoles && roles.kind === 'ready' && (
            <div className="field">
              <label htmlFor={roleId}>Rol</label>
              <select
                id={roleId}
                value={filters.roleId}
                onChange={(e) => apply({ roleId: e.target.value })}
              >
                <option value="">Todos</option>
                {roles.data.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="submit">Buscar</button>
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setSearchText('');
                apply({ q: '', status: '', roleId: '' });
              }}
            >
              Limpiar filtros
            </button>
          )}
        </form>
      </search>

      {list.kind === 'loading' && (
        <output className="loading">Cargando…</output>
      )}
      {list.kind === 'error' && (
        <div className="state-error" role="alert">
          <p>{list.message}</p>
          <button type="button" onClick={reload}>
            Reintentar
          </button>
        </div>
      )}
      {list.kind === 'ready' && list.data.items.length === 0 && (
        <p className="empty">
          {filtersActive
            ? 'No se encontraron usuarios con los filtros aplicados.'
            : 'Todavía no hay usuarios registrados.'}
        </p>
      )}
      {list.kind === 'ready' && list.data.items.length > 0 && (
        <>
          <table className="responsive-table">
            <caption className="visually-hidden">Usuarios</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Correo</th>
                <th scope="col">Estado</th>
                <th scope="col">Roles</th>
                <th scope="col">Última conexión</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((u) => (
                <tr key={u.id}>
                  <td data-label="Nombre">{u.displayName}</td>
                  <td data-label="Correo">{u.email}</td>
                  <td data-label="Estado">
                    <StatusBadge status={u.status} />
                  </td>
                  <td data-label="Roles">
                    {u.roles.length ? (
                      u.roles.map((r) => r.name).join(', ')
                    ) : (
                      <span className="muted">Sin roles</span>
                    )}
                  </td>
                  <td data-label="Última conexión">
                    {formatDateTime(u.lastLoginAt)}
                  </td>
                  <td data-label="Acciones" className="row-actions">
                    <a
                      className="button-link"
                      href={`#/usuarios/${u.id}`}
                      aria-label={`Ver y administrar a ${u.displayName}`}
                    >
                      Administrar
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onChange={(page) => setFilters((f) => ({ ...f, page }))}
          />
        </>
      )}
    </section>
  );
}

function CreateUserForm({
  onCreated,
  onCancel,
}: {
  onCreated: (user: AdminUser, link: CredentialLink) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found: Record<string, string> = {};
    if (!displayName.trim()) found.displayName = 'Ingrese el nombre.';
    if (!email.trim()) found.email = 'Ingrese el correo electrónico.';
    else if (!/^\S+@\S+\.\S+$/.test(email.trim()))
      found.email = 'Ingrese un correo electrónico válido.';
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      const res = await apiRequest<{
        user: AdminUser;
        activation: CredentialLink;
      }>('/users', {
        method: 'POST',
        body: { email: email.trim(), displayName: displayName.trim() },
      });
      onCreated(res.user, res.activation);
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
      aria-labelledby={`${id}-title`}
    >
      <h3 id={`${id}-title`}>Nuevo usuario</h3>
      <p className="hint">
        La cuenta se crea sin contraseña y sin permisos. Recibirá un enlace de
        activación de un solo uso para que su titular fije su propia contraseña.
      </p>
      <div className="field">
        <label htmlFor={`${id}-name`}>
          Nombre completo<span aria-hidden="true"> *</span>
        </label>
        <input
          id={`${id}-name`}
          value={displayName}
          maxLength={120}
          autoComplete="off"
          onChange={(e) => setDisplayName(e.target.value)}
          aria-invalid={errors.displayName ? true : undefined}
          aria-describedby={errors.displayName ? `${id}-name-e` : undefined}
          disabled={submitting}
        />
        {errors.displayName && (
          <p className="field-error" id={`${id}-name-e`}>
            {errors.displayName}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${id}-email`}>
          Correo electrónico<span aria-hidden="true"> *</span>
        </label>
        <input
          id={`${id}-email`}
          type="email"
          value={email}
          maxLength={254}
          autoComplete="off"
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? `${id}-email-e` : undefined}
          disabled={submitting}
        />
        {errors.email && (
          <p className="field-error" id={`${id}-email-e`}>
            {errors.email}
          </p>
        )}
      </div>
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear usuario'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
