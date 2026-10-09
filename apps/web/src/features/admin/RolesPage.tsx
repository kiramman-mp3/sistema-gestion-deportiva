import { type FormEvent, useId, useState } from 'react';
import { ApiError, apiRequest } from '../../api/client.ts';
import {
  Notice,
  type NoticeState,
  describeError,
} from '../../components/Notice.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import type { AdminRole } from './types.ts';

export function RolesPage({ permissions }: { permissions: readonly string[] }) {
  const canManage = permissions.includes('roles:manage');
  const [roles, reload] = useFetch<AdminRole[]>('/roles');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  return (
    <section aria-labelledby="roles-title" className="catalog">
      <div className="catalog-header">
        <h2 id="roles-title">Roles y permisos</h2>
        {canManage && !creating && (
          <button
            type="button"
            className="primary"
            onClick={() => {
              setNotice(null);
              setCreating(true);
            }}
          >
            Nuevo rol
          </button>
        )}
      </div>
      <p className="hint">
        Un rol agrupa permisos. Los roles <strong>de sistema</strong> los
        mantiene la plataforma y no pueden modificarse; los roles{' '}
        <strong>configurables</strong> se crean y editan aquí.
      </p>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {creating && (
        <CreateRoleForm
          onCancel={() => setCreating(false)}
          onCreated={(role) => {
            setCreating(false);
            setNotice({
              type: 'success',
              text: `Se creó el rol «${role.name}». Ahora puede asignarle permisos.`,
            });
            reload();
          }}
        />
      )}

      {roles.kind === 'loading' && (
        <output className="loading">Cargando…</output>
      )}
      {roles.kind === 'error' && (
        <div className="state-error" role="alert">
          <p>{roles.message}</p>
          <button type="button" onClick={reload}>
            Reintentar
          </button>
        </div>
      )}
      {roles.kind === 'ready' && roles.data.length === 0 && (
        <p className="empty">Todavía no hay roles.</p>
      )}
      {roles.kind === 'ready' && roles.data.length > 0 && (
        <table className="responsive-table">
          <caption className="visually-hidden">Roles</caption>
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Código</th>
              <th scope="col">Tipo</th>
              <th scope="col">Permisos</th>
              <th scope="col">Usuarios</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {roles.data.map((r) => (
              <tr key={r.id}>
                <td data-label="Nombre">{r.name}</td>
                <td data-label="Código">
                  <code>{r.code}</code>
                </td>
                <td data-label="Tipo">
                  <span
                    className={`badge badge-${r.isSystem ? 'neutral' : 'ok'}`}
                  >
                    <span aria-hidden="true">{r.isSystem ? '🔒 ' : '✎ '}</span>
                    {r.isSystem ? 'De sistema' : 'Configurable'}
                  </span>
                </td>
                <td data-label="Permisos">{r.permissions.length}</td>
                <td data-label="Usuarios">{r.userCount}</td>
                <td data-label="Acciones" className="row-actions">
                  <a
                    className="button-link"
                    href={`#/roles/${r.id}`}
                    aria-label={`Ver el rol ${r.name}`}
                  >
                    {canManage && !r.isSystem ? 'Ver y editar' : 'Ver'}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function CreateRoleForm({
  onCreated,
  onCancel,
}: {
  onCreated: (role: AdminRole) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found: Record<string, string> = {};
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(code.trim())) {
      found.code =
        'Use de 2 a 40 caracteres: minúsculas, números y guion bajo, empezando con una letra.';
    }
    if (!name.trim()) found.name = 'Ingrese el nombre.';
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      const role = await apiRequest<AdminRole>('/roles', {
        method: 'POST',
        body: {
          code: code.trim(),
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
        },
      });
      onCreated(role);
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
      aria-labelledby={`${id}-t`}
    >
      <h3 id={`${id}-t`}>Nuevo rol</h3>
      <p className="hint">
        El rol se crea sin permisos. Después podrá elegir cuáles concede (solo
        los que usted posee).
      </p>
      <div className="field">
        <label htmlFor={`${id}-c`}>
          Código<span aria-hidden="true"> *</span>
        </label>
        <input
          id={`${id}-c`}
          value={code}
          maxLength={40}
          autoComplete="off"
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={errors.code ? true : undefined}
          aria-describedby={`${id}-c-h${errors.code ? ` ${id}-c-e` : ''}`}
          disabled={submitting}
        />
        <p className="hint" id={`${id}-c-h`}>
          Identificador estable, no se podrá cambiar (p. ej. delegado_deportes).
        </p>
        {errors.code && (
          <p className="field-error" id={`${id}-c-e`}>
            {errors.code}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${id}-n`}>
          Nombre<span aria-hidden="true"> *</span>
        </label>
        <input
          id={`${id}-n`}
          value={name}
          maxLength={100}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${id}-n-e` : undefined}
          disabled={submitting}
        />
        {errors.name && (
          <p className="field-error" id={`${id}-n-e`}>
            {errors.name}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${id}-d`}>Descripción (opcional)</label>
        <textarea
          id={`${id}-d`}
          rows={2}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={submitting}
        />
        {errors.description && (
          <p className="field-error">{errors.description}</p>
        )}
      </div>
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear rol'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
