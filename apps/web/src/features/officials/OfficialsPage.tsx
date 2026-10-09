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
import {
  CheckboxField,
  LoadState,
  SelectField,
  TextField,
} from '../people/fields.tsx';
import type { Club } from '../people/types.ts';
import {
  OFFICIAL_STATUS_LABELS,
  type Official,
  type OfficialStatus,
  type Page,
} from './types.ts';

interface SportOption {
  id: string;
  name: string;
}

/** Registro de árbitros, jueces y auxiliares de mesa. */
export function OfficialsPage({
  permissions,
}: {
  permissions: readonly string[];
}) {
  const canManage = permissions.includes('officials:manage');
  const canDelete = permissions.includes('officials:delete');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sportId, setSportId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Official | null>(null);
  const [deleting, setDeleting] = useState<Official | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const query = new URLSearchParams({
    page: String(page),
    pageSize: '20',
    ...(q && { q }),
    ...(status && { status }),
    ...(sportId && { sportId }),
  });
  const [list, reload] = useFetch<Page<Official>>(
    `/officials?${query.toString()}`,
  );
  const [sports] = useFetch<Page<SportOption>>('/sports?pageSize=100');
  const sportOptions = sports.kind === 'ready' ? sports.data.items : [];

  return (
    <section aria-labelledby="officials-title" className="catalog">
      <div className="catalog-header">
        <h2 id="officials-title">Árbitros y jueces</h2>
        {canManage && !creating && !editing && (
          <button
            type="button"
            className="primary"
            onClick={() => setCreating(true)}
          >
            Nuevo oficial
          </button>
        )}
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {(creating || editing) && (
        <OfficialForm
          official={editing ?? undefined}
          sports={sportOptions}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(saved) => {
            setNotice({
              type: 'success',
              text: editing
                ? `Se actualizó a ${saved.firstName} ${saved.lastName}.`
                : `Se registró a ${saved.firstName} ${saved.lastName}.`,
            });
            setCreating(false);
            setEditing(null);
            reload();
          }}
        />
      )}

      <div className="filters">
        <TextField
          label="Buscar oficial"
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          hint="Nombre o apellido"
        />
        <SelectField
          label="Estado"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          placeholder="Todos los estados"
          options={Object.entries(OFFICIAL_STATUS_LABELS).map(
            ([value, label]) => ({ value, label }),
          )}
        />
        <SelectField
          label="Deporte"
          value={sportId}
          onChange={(v) => {
            setSportId(v);
            setPage(1);
          }}
          placeholder="Todos los deportes"
          options={sportOptions.map((s) => ({ value: s.id, label: s.name }))}
        />
      </div>

      <LoadState state={list} onRetry={reload} />
      {list.kind === 'ready' && list.data.items.length === 0 && (
        <p className="empty">No se encontraron oficiales.</p>
      )}
      {list.kind === 'ready' && list.data.items.length > 0 && (
        <>
          <table className="responsive-table">
            <caption className="visually-hidden">
              Lista de árbitros y jueces
            </caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Deportes</th>
                <th scope="col">Licencia</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((o) => (
                <tr key={o.id}>
                  <td data-label="Nombre">
                    <a href={`#/arbitros/${o.id}`}>
                      {o.lastName}, {o.firstName}
                    </a>
                    {o.club && <div className="hint">Club: {o.club.name}</div>}
                  </td>
                  <td data-label="Deportes">
                    {o.sports.map((s) => s.name).join(', ')}
                  </td>
                  <td data-label="Licencia">{o.licenseNumber ?? '—'}</td>
                  <td data-label="Estado">
                    <span
                      className={`badge ${o.status === 'activo' ? 'badge-ok' : ''}`}
                    >
                      {OFFICIAL_STATUS_LABELS[o.status]}
                    </span>
                  </td>
                  <td data-label="Acciones" className="row-actions">
                    <a href={`#/arbitros/${o.id}`}>Ver ficha</a>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => {
                          setCreating(false);
                          setEditing(o);
                        }}
                      >
                        Editar
                      </button>
                    )}
                    {canDelete && (
                      <button type="button" onClick={() => setDeleting(o)}>
                        Eliminar
                      </button>
                    )}
                  </td>
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
          title="Eliminar oficial"
          description={`¿Confirma que desea eliminar a ${deleting.firstName} ${deleting.lastName}? Si tiene designaciones no se podrá eliminar: desactívelo para conservar su historial.`}
          confirmLabel="Eliminar oficial"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            const o = deleting;
            setDeleting(null);
            try {
              await apiRequest(`/officials/${o.id}`, { method: 'DELETE' });
              setNotice({
                type: 'success',
                text: `Se eliminó a ${o.firstName} ${o.lastName}.`,
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

function OfficialForm({
  official,
  sports,
  onCancel,
  onSaved,
}: {
  official?: Official;
  sports: SportOption[];
  onCancel: () => void;
  onSaved: (saved: Official) => void;
}) {
  const [firstName, setFirstName] = useState(official?.firstName ?? '');
  const [lastName, setLastName] = useState(official?.lastName ?? '');
  const [phone, setPhone] = useState(official?.phone ?? '');
  const [license, setLicense] = useState(official?.licenseNumber ?? '');
  const [clubId, setClubId] = useState(official?.club?.id ?? '');
  const [accountEmail, setAccountEmail] = useState(
    official?.account?.email ?? '',
  );
  const [status, setStatus] = useState<OfficialStatus>(
    official?.status ?? 'activo',
  );
  const [sportIds, setSportIds] = useState<string[]>(
    official?.sports.map((s) => s.id) ?? [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [clubs] = useFetch<Page<Club>>('/clubs?pageSize=100');

  const toggle = (id: string) =>
    setSportIds((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id],
    );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = 'Los nombres son obligatorios.';
    if (!lastName.trim()) errs.lastName = 'Los apellidos son obligatorios.';
    if (sportIds.length === 0)
      errs.sportIds = 'Seleccione al menos un deporte.';
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const body = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || null,
        licenseNumber: license.trim() || null,
        clubId: clubId || null,
        userEmail: accountEmail.trim() || null,
        sportIds,
        ...(official && { status }),
      };
      const saved = official
        ? await apiRequest<Official>(`/officials/${official.id}`, {
            method: 'PATCH',
            body,
          })
        : await apiRequest<Official>('/officials', { method: 'POST', body });
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors)
        setErrors(err.fieldErrors);
      setFormError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="catalog-form" onSubmit={submit} noValidate>
      <h3>{official ? 'Editar oficial' : 'Nuevo oficial'}</h3>
      <TextField
        label="Nombres"
        value={firstName}
        onChange={setFirstName}
        required
        error={errors.firstName}
        maxLength={80}
        disabled={submitting}
      />
      <TextField
        label="Apellidos"
        value={lastName}
        onChange={setLastName}
        required
        error={errors.lastName}
        maxLength={80}
        disabled={submitting}
      />
      <TextField
        label="Teléfono de contacto"
        value={phone}
        onChange={setPhone}
        error={errors.phone}
        maxLength={30}
        disabled={submitting}
      />
      <TextField
        label="Número de licencia"
        value={license}
        onChange={setLicense}
        error={errors.licenseNumber}
        maxLength={40}
        disabled={submitting}
      />
      <fieldset className="field">
        <legend>Deportes que puede arbitrar *</legend>
        {sports.length === 0 && (
          <p className="hint">No hay deportes disponibles para elegir.</p>
        )}
        {sports.map((s) => (
          <CheckboxField
            key={s.id}
            label={s.name}
            checked={sportIds.includes(s.id)}
            onChange={() => toggle(s.id)}
            disabled={submitting}
          />
        ))}
        {errors.sportIds && <p className="field-error">{errors.sportIds}</p>}
      </fieldset>
      {clubs.kind === 'ready' && (
        <SelectField
          label="Club de afiliación"
          value={clubId}
          onChange={setClubId}
          placeholder="Sin club"
          options={clubs.data.items.map((c) => ({
            value: c.id,
            label: c.name,
          }))}
          disabled={submitting}
        />
      )}
      <TextField
        label="Correo de su cuenta del sistema"
        type="email"
        value={accountEmail}
        onChange={setAccountEmail}
        error={errors.userEmail}
        hint="Opcional. Permite que consulte y responda sus designaciones."
        disabled={submitting}
      />
      {official && (
        <SelectField
          label="Estado"
          value={status}
          onChange={(v) => setStatus(v as OfficialStatus)}
          options={Object.entries(OFFICIAL_STATUS_LABELS).map(
            ([value, label]) => ({ value, label }),
          )}
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
