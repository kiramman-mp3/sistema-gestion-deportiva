import { type FormEvent, useId, useMemo, useState } from 'react';
import { ApiError, apiRequest } from '../../api/client.ts';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { Icon } from '../../components/Icon.tsx';
import {
  Notice,
  type NoticeState,
  describeError,
} from '../../components/Notice.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import type { AdminRole, PermissionInfo } from './types.ts';

interface Props {
  roleId: string;
  /** Permisos del usuario actual: solo puede delegar los que posee. */
  permissions: readonly string[];
}

/** Agrupa el catálogo (ya ordenado por el backend) por módulo. */
function groupByModule(catalog: PermissionInfo[]) {
  const groups = new Map<string, { label: string; items: PermissionInfo[] }>();
  for (const p of catalog) {
    const g = groups.get(p.module) ?? { label: p.moduleLabel, items: [] };
    g.items.push(p);
    groups.set(p.module, g);
  }
  return [...groups.entries()];
}

export function RoleDetailPage({ roleId, permissions }: Props) {
  const canManage = permissions.includes('roles:manage');
  const held = useMemo(() => new Set(permissions), [permissions]);
  const [role, reloadRole] = useFetch<AdminRole>(`/roles/${roleId}`);
  const [catalog] = useFetch<PermissionInfo[]>('/permissions');
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [editingInfo, setEditingInfo] = useState(false);

  if (role.kind === 'loading' || catalog.kind === 'loading')
    return <output className="loading">Cargando…</output>;
  if (role.kind === 'error' || catalog.kind === 'error') {
    return (
      <div className="state-error" role="alert">
        <p>
          {role.kind === 'error'
            ? role.message
            : catalog.kind === 'error'
              ? catalog.message
              : ''}
        </p>
        <button type="button" onClick={reloadRole}>
          Reintentar
        </button>{' '}
        <a href="#/roles">Volver a roles</a>
      </div>
    );
  }

  const r = role.data;
  // Para modificar un rol hay que poseer TODOS sus permisos actuales (el servidor lo exige).
  const missing = r.permissions.filter((code) => !held.has(code));
  const editable = canManage && !r.isSystem && missing.length === 0;

  return (
    <section aria-labelledby="role-title" className="catalog">
      <p>
        <a href="#/roles">← Volver a roles</a>
      </p>
      <div className="catalog-header">
        <h1 id="role-title">{r.name}</h1>
        <span className={`badge badge-${r.isSystem ? 'neutral' : 'ok'}`}>
          <Icon name={r.isSystem ? 'lock' : 'pencil'} size={14} />{' '}
          {r.isSystem ? 'Rol de sistema' : 'Rol configurable'}
        </span>
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {r.isSystem && (
        <p className="notice">
          Este rol lo mantiene la plataforma (<code>npm run db:seed</code>): no
          puede modificarse desde la interfaz, ni siquiera por un
          superadministrador.
        </p>
      )}
      {!r.isSystem && canManage && missing.length > 0 && (
        <p className="notice error" role="alert">
          Este rol incluye permisos que usted no posee ({missing.join(', ')}),
          por lo que no puede modificarlo. Solo puede gestionar roles cuyos
          permisos también tiene.
        </p>
      )}

      {editingInfo ? (
        <EditRoleInfo
          role={r}
          onCancel={() => setEditingInfo(false)}
          onSaved={() => {
            setEditingInfo(false);
            setNotice({ type: 'success', text: 'Datos del rol actualizados.' });
            reloadRole();
          }}
        />
      ) : (
        <dl className="definition-list">
          <dt>Código</dt>
          <dd>
            <code>{r.code}</code>
          </dd>
          <dt>Descripción</dt>
          <dd>
            {r.description ?? <span className="muted">Sin descripción</span>}
          </dd>
          <dt>Usuarios con este rol</dt>
          <dd>{r.userCount}</dd>
        </dl>
      )}
      {canManage && !r.isSystem && !editingInfo && (
        <button type="button" onClick={() => setEditingInfo(true)}>
          Editar nombre y descripción
        </button>
      )}

      <PermissionsEditor
        key={r.permissions.join('|')}
        role={r}
        catalog={catalog.data}
        held={held}
        editable={editable}
        onSaved={(summary) => {
          setNotice({ type: 'success', text: summary });
          reloadRole();
        }}
        onError={(text) => setNotice({ type: 'error', text })}
      />
    </section>
  );
}

function PermissionsEditor({
  role,
  catalog,
  held,
  editable,
  onSaved,
  onError,
}: {
  role: AdminRole;
  catalog: PermissionInfo[];
  held: ReadonlySet<string>;
  editable: boolean;
  onSaved: (summary: string) => void;
  onError: (message: string) => void;
}) {
  const [selected, setSelected] = useState(() => new Set(role.permissions));
  const [confirming, setConfirming] = useState(false);
  const current = new Set(role.permissions);
  const added = [...selected].filter((c) => !current.has(c)).sort();
  const removed = [...current].filter((c) => !selected.has(c)).sort();
  const changed = added.length + removed.length > 0;

  function toggle(code: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  return (
    <>
      <h2>Permisos</h2>
      <p className="hint">
        Cada capacidad es independiente: <strong>Consultar</strong> permite ver
        información, <strong>Gestionar</strong> permite crear y modificar, y{' '}
        <strong>Eliminar</strong> es un permiso aparte. Conceder una no concede
        las demás.
        {editable &&
          ' Solo puede conceder permisos que usted mismo posee; los demás aparecen deshabilitados.'}
      </p>

      {groupByModule(catalog).map(([module, group]) => (
        <fieldset
          className="permission-group"
          key={module}
          disabled={!editable}
        >
          <legend>{group.label}</legend>
          {group.items.map((p) => {
            // Solo es delegable lo que el propio actor posee (el servidor lo vuelve a exigir).
            const disabled = !editable || !held.has(p.code);
            const id = `perm-${p.code.replace(':', '-')}`;
            return (
              <div className="permission" key={p.code}>
                <input
                  id={id}
                  type="checkbox"
                  checked={selected.has(p.code)}
                  disabled={disabled}
                  onChange={() => toggle(p.code)}
                />
                <label htmlFor={id}>
                  <strong>{p.actionLabel}</strong> — {p.description}
                  {editable && !held.has(p.code) && (
                    <span className="muted">
                      {' '}
                      (no puede delegarlo: usted no lo posee)
                    </span>
                  )}
                </label>
              </div>
            );
          })}
        </fieldset>
      ))}

      {editable && (
        <div className="form-actions">
          <button
            type="button"
            className="primary"
            disabled={!changed}
            onClick={() => setConfirming(true)}
          >
            Guardar permisos
          </button>
          <button
            type="button"
            disabled={!changed}
            onClick={() => setSelected(new Set(role.permissions))}
          >
            Descartar cambios
          </button>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title={`Cambiar los permisos de «${role.name}»`}
          description={
            `${role.userCount === 0 ? 'Ningún usuario tiene este rol por ahora.' : `Afecta a ${role.userCount} ${role.userCount === 1 ? 'usuario' : 'usuarios'}: el cambio se aplica en su siguiente petición, sin que deban volver a iniciar sesión.`}` +
            ` Se añadirán: ${added.length ? added.join(', ') : 'ninguno'}. Se retirarán: ${removed.length ? removed.join(', ') : 'ninguno'}.`
          }
          confirmLabel="Guardar cambios"
          danger={removed.length > 0}
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            setConfirming(false);
            try {
              await apiRequest(`/roles/${role.id}/permissions`, {
                method: 'PUT',
                body: { permissions: [...selected].sort() },
              });
              onSaved('Permisos actualizados.');
            } catch (error) {
              onError(describeError(error));
            }
          }}
        />
      )}
    </>
  );
}

function EditRoleInfo({
  role,
  onSaved,
  onCancel,
}: {
  role: AdminRole;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!name.trim()) {
      setError('Ingrese el nombre.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest(`/roles/${role.id}`, {
        method: 'PATCH',
        body: { name: name.trim(), description: description.trim() || null },
      });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : describeError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="catalog-form"
      onSubmit={submit}
      noValidate
      aria-label="Editar rol"
    >
      <div className="field">
        <label htmlFor={`${id}-n`}>Nombre</label>
        <input
          id={`${id}-n`}
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-d`}>Descripción</label>
        <textarea
          id={`${id}-d`}
          rows={2}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={submitting}
        />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
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
