import { type FormEvent, useState } from 'react';
import { ApiError, apiRequest } from '../../api/client.ts';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import {
  Notice,
  type NoticeState,
  describeError,
} from '../../components/Notice.tsx';
import { Pagination } from '../../components/Pagination.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { LoadState, SelectField, TextField } from '../people/fields.tsx';
import type { Page } from '../people/types.ts';
import type { Venue } from './types.ts';

export function VenuesPage({
  permissions,
}: {
  permissions: readonly string[];
}) {
  const canManage = permissions.includes('venues:manage');
  const canDelete = permissions.includes('venues:delete');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Venue | null>(null);
  const [deleting, setDeleting] = useState<Venue | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const query = new URLSearchParams({
    page: String(page),
    pageSize: '20',
    ...(q && { q }),
    ...(status && { status }),
  });

  const [list, reload] = useFetch<Page<Venue>>(`/venues?${query.toString()}`);

  return (
    <section aria-labelledby="venues-title" className="catalog">
      <div className="catalog-header">
        <h2 id="venues-title">Escenarios deportivos</h2>
        {canManage && !creating && !editing && (
          <button
            type="button"
            className="primary"
            onClick={() => setCreating(true)}
          >
            Nuevo escenario
          </button>
        )}
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {creating && (
        <VenueForm
          onCancel={() => setCreating(false)}
          onSaved={(venue) => {
            setCreating(false);
            setNotice({
              type: 'success',
              text: `Se creó el escenario «${venue.name}».`,
            });
            reload();
          }}
        />
      )}

      {editing && (
        <VenueForm
          venue={editing}
          onCancel={() => setEditing(null)}
          onSaved={(venue) => {
            setEditing(null);
            setNotice({
              type: 'success',
              text: `Se actualizó el escenario «${venue.name}».`,
            });
            reload();
          }}
        />
      )}

      <div className="filters">
        <TextField
          label="Buscar escenario"
          value={q}
          onChange={(val) => {
            setQ(val);
            setPage(1);
          }}
          hint="Nombre del estadio, cancha o coliseo"
        />
        <SelectField
          label="Estado"
          value={status}
          onChange={(val) => {
            setStatus(val);
            setPage(1);
          }}
          placeholder="Todos los estados"
          options={[
            { value: 'activo', label: 'Activo' },
            { value: 'inactivo', label: 'Inactivo' },
          ]}
        />
      </div>

      <LoadState state={list} onRetry={reload} />

      {list.kind === 'ready' && list.data.items.length === 0 && (
        <p className="empty">No se encontraron escenarios deportivos.</p>
      )}

      {list.kind === 'ready' && list.data.items.length > 0 && (
        <>
          <table className="responsive-table">
            <caption className="visually-hidden">Lista de escenarios</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Dirección</th>
                <th scope="col">Capacidad</th>
                <th scope="col">Estado</th>
                {(canManage || canDelete) && <th scope="col">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((v) => (
                <tr key={v.id}>
                  <td data-label="Nombre">
                    <strong>{v.name}</strong>
                  </td>
                  <td data-label="Dirección">{v.address ?? '—'}</td>
                  <td data-label="Capacidad">
                    {v.capacity
                      ? `${v.capacity.toLocaleString()} espectadores`
                      : '—'}
                  </td>
                  <td data-label="Estado">
                    <span
                      className={`badge ${v.status === 'activo' ? 'badge-ok' : ''}`}
                    >
                      {v.status === 'activo' ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {(canManage || canDelete) && (
                    <td data-label="Acciones" className="row-actions">
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => {
                            setCreating(false);
                            setEditing(v);
                          }}
                        >
                          Editar
                        </button>
                      )}
                      {canDelete && (
                        <button type="button" onClick={() => setDeleting(v)}>
                          Eliminar
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onChange={setPage}
          />
        </>
      )}

      {deleting && (
        <ConfirmDialog
          title="Eliminar escenario"
          description={`¿Confirma que desea eliminar el escenario «${deleting.name}»? Solo es posible si no tiene eventos asignados.`}
          confirmLabel="Eliminar escenario"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            const v = deleting;
            setDeleting(null);
            try {
              await apiRequest(`/venues/${v.id}`, { method: 'DELETE' });
              setNotice({
                type: 'success',
                text: `Se eliminó el escenario «${v.name}».`,
              });
              reload();
            } catch (err) {
              setNotice({ type: 'error', text: describeError(err) });
            }
          }}
        />
      )}
    </section>
  );
}

function VenueForm({
  venue,
  onCancel,
  onSaved,
}: {
  venue?: Venue;
  onCancel: () => void;
  onSaved: (v: Venue) => void;
}) {
  const [name, setName] = useState(venue?.name ?? '');
  const [address, setAddress] = useState(venue?.address ?? '');
  const [capacity, setCapacity] = useState(
    venue?.capacity ? String(venue.capacity) : '',
  );
  const [status, setStatus] = useState<'activo' | 'inactivo'>(
    venue?.status ?? 'activo',
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'El nombre es obligatorio.';
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        address: address.trim() || null,
        capacity: capacity.trim() ? Number(capacity) : null,
        ...(venue && { status }),
      };

      const result = venue
        ? await apiRequest<Venue>(`/venues/${venue.id}`, {
            method: 'PATCH',
            body,
          })
        : await apiRequest<Venue>('/venues', {
            method: 'POST',
            body,
          });

      onSaved(result);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        setErrors(err.fieldErrors);
      }
      setFormError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="catalog-form" onSubmit={submit} noValidate>
      <h3>{venue ? 'Editar escenario' : 'Nuevo escenario deportivo'}</h3>
      <TextField
        label="Nombre del escenario"
        value={name}
        onChange={setName}
        required
        error={errors.name}
        maxLength={120}
        disabled={submitting}
      />
      <TextField
        label="Dirección o ubicación"
        value={address}
        onChange={setAddress}
        error={errors.address}
        maxLength={255}
        disabled={submitting}
      />
      <TextField
        label="Capacidad aproximada (espectadores)"
        type="number"
        value={capacity}
        onChange={setCapacity}
        error={errors.capacity}
        disabled={submitting}
      />
      {venue && (
        <SelectField
          label="Estado"
          value={status}
          onChange={(val) => setStatus(val as 'activo' | 'inactivo')}
          options={[
            { value: 'activo', label: 'Activo' },
            { value: 'inactivo', label: 'Inactivo' },
          ]}
          disabled={submitting}
        />
      )}
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
