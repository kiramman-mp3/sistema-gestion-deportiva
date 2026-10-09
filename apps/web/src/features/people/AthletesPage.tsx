import { type FormEvent, useId, useState } from 'react';
import { ApiError, apiRequest } from '../../api/client.ts';
import {
  Notice,
  type NoticeState,
  describeError,
} from '../../components/Notice.tsx';
import { Pagination } from '../../components/Pagination.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { LoadState, SelectField, TextField } from './fields.tsx';
import {
  type Athlete,
  type Club,
  ELIGIBILITY_LABELS,
  type Eligibility,
  PERSON_STATUS_LABELS,
  type Page,
} from './types.ts';

export function AthletesPage({
  permissions,
}: {
  permissions: readonly string[];
}) {
  const canCreate = permissions.includes('athletes:manage');
  const canSeeFull = permissions.includes('athletes:read_full');
  const searchId = useId();
  const [filters, setFilters] = useState({
    q: '',
    eligibility: '',
    page: 1,
  });
  const [searchText, setSearchText] = useState('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: '20',
  });
  if (filters.q) params.set('q', filters.q);
  if (filters.eligibility) params.set('eligibility', filters.eligibility);
  const [list, reload] = useFetch<Page<Athlete>>(`/athletes?${params}`);
  const apply = (next: Partial<typeof filters>) =>
    setFilters((f) => ({ ...f, page: 1, ...next }));
  const filtersActive = Boolean(filters.q || filters.eligibility);

  return (
    <section aria-labelledby="athletes-title" className="catalog">
      <div className="catalog-header">
        <h2 id="athletes-title">Deportistas</h2>
        {canCreate && !creating && (
          <button
            type="button"
            className="primary"
            onClick={() => setCreating(true)}
          >
            Nuevo deportista
          </button>
        )}
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {creating && (
        <CreateAthleteForm
          canSeeFull={canSeeFull}
          onCancel={() => setCreating(false)}
          onCreated={(athlete) => {
            setCreating(false);
            setNotice({
              type: 'success',
              text: `Se registró a ${athlete.firstName} ${athlete.lastName} (${athlete.code}).`,
            });
            reload();
          }}
        />
      )}

      <search>
        <form
          className="filters"
          aria-label="Buscar deportistas"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: searchText.trim() });
          }}
        >
          <div className="field">
            <label htmlFor={searchId}>Buscar por nombre o código</label>
            <input
              id={searchId}
              type="search"
              maxLength={100}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <SelectField
            label="Habilitación"
            value={filters.eligibility}
            onChange={(eligibility) => apply({ eligibility })}
            placeholder="Todas"
            options={(Object.keys(ELIGIBILITY_LABELS) as Eligibility[]).map(
              (e) => ({ value: e, label: ELIGIBILITY_LABELS[e] }),
            )}
          />
          <button type="submit">Buscar</button>
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setSearchText('');
                apply({ q: '', eligibility: '' });
              }}
            >
              Limpiar filtros
            </button>
          )}
        </form>
      </search>

      <LoadState state={list} onRetry={reload} />
      {list.kind === 'ready' && list.data.items.length === 0 && (
        <p className="empty">
          {filtersActive
            ? 'No se encontraron deportistas con los filtros aplicados.'
            : 'Todavía no hay deportistas registrados.'}
        </p>
      )}
      {list.kind === 'ready' && list.data.items.length > 0 && (
        <>
          <table className="responsive-table">
            <caption className="visually-hidden">Deportistas</caption>
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Nombre</th>
                <th scope="col">Club</th>
                <th scope="col">Estado</th>
                <th scope="col">Habilitación</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((a) => (
                <tr key={a.id}>
                  <td data-label="Código">{a.code}</td>
                  <td data-label="Nombre">
                    {a.lastName}, {a.firstName}
                  </td>
                  <td data-label="Club">{a.club.name}</td>
                  <td data-label="Estado">{PERSON_STATUS_LABELS[a.status]}</td>
                  <td data-label="Habilitación">
                    {ELIGIBILITY_LABELS[a.eligibility]}
                  </td>
                  <td data-label="Acciones" className="row-actions">
                    <a
                      className="button-link"
                      href={`#/deportistas/${a.id}`}
                      aria-label={`Ver a ${a.firstName} ${a.lastName}`}
                    >
                      Ver ficha
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

const EMPTY = {
  clubId: '',
  firstName: '',
  lastName: '',
  birthDate: '',
  idType: 'cedula',
  idNumber: '',
  phone: '',
  guardianName: '',
  guardianRelation: '',
  guardianPhone: '',
};

function CreateAthleteForm({
  canSeeFull,
  onCreated,
  onCancel,
}: {
  canSeeFull: boolean;
  onCreated: (athlete: Athlete) => void;
  onCancel: () => void;
}) {
  const [clubs] = useFetch<Page<Club>>('/clubs?pageSize=100');
  const [v, setV] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const set = (key: keyof typeof EMPTY) => (value: string) =>
    setV((c) => ({ ...c, [key]: value }));

  async function submit(confirmDuplicate: boolean) {
    if (submitting) return;
    const found: Record<string, string> = {};
    if (!v.clubId) found.clubId = 'Seleccione el club.';
    if (!v.firstName.trim()) found.firstName = 'Ingrese los nombres.';
    if (!v.lastName.trim()) found.lastName = 'Ingrese los apellidos.';
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    const body: Record<string, unknown> = {
      clubId: v.clubId,
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
    };
    if (v.birthDate) body.birthDate = v.birthDate;
    if (canSeeFull) {
      if (v.idNumber.trim()) {
        body.idType = v.idType;
        body.idNumber = v.idNumber.trim();
      }
      for (const key of [
        'phone',
        'guardianName',
        'guardianRelation',
        'guardianPhone',
      ] as const) {
        if (v[key].trim()) body[key] = v[key].trim();
      }
    }
    if (confirmDuplicate) body.confirmDuplicate = true;

    setSubmitting(true);
    try {
      onCreated(
        await apiRequest<Athlete>('/athletes', { method: 'POST', body }),
      );
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors)
        setErrors(error.fieldErrors);
      setDuplicate(
        error instanceof ApiError &&
          error.status === 409 &&
          /mismo nombre y fecha de nacimiento/.test(error.message),
      );
      setFormError(describeError(error));
    } finally {
      setSubmitting(false);
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit(false);
  };

  return (
    <form
      className="catalog-form"
      onSubmit={onSubmit}
      noValidate
      aria-label="Nuevo deportista"
    >
      <h3>Nuevo deportista</h3>
      <SelectField
        label="Club"
        required
        value={v.clubId}
        onChange={set('clubId')}
        placeholder="Seleccione…"
        error={errors.clubId}
        disabled={submitting}
        options={
          clubs.kind === 'ready'
            ? clubs.data.items
                .filter((c) => c.status === 'activo')
                .map((c) => ({ value: c.id, label: c.name }))
            : []
        }
      />
      <TextField
        label="Nombres"
        required
        value={v.firstName}
        onChange={set('firstName')}
        error={errors.firstName}
        maxLength={80}
        disabled={submitting}
      />
      <TextField
        label="Apellidos"
        required
        value={v.lastName}
        onChange={set('lastName')}
        error={errors.lastName}
        maxLength={80}
        disabled={submitting}
      />
      <TextField
        label="Fecha de nacimiento"
        type="date"
        value={v.birthDate}
        onChange={set('birthDate')}
        error={errors.birthDate}
        disabled={submitting}
        hint="Necesaria para validar la categoría y para habilitar al deportista."
      />
      {canSeeFull ? (
        <>
          <SelectField
            label="Tipo de documento"
            value={v.idType}
            onChange={set('idType')}
            disabled={submitting}
            options={[
              { value: 'cedula', label: 'Cédula' },
              { value: 'pasaporte', label: 'Pasaporte' },
              { value: 'otro', label: 'Otro' },
            ]}
          />
          <TextField
            label="Número de documento"
            value={v.idNumber}
            onChange={set('idNumber')}
            error={errors.idNumber ?? errors.idType}
            maxLength={30}
            disabled={submitting}
          />
          <TextField
            label="Teléfono"
            type="tel"
            value={v.phone}
            onChange={set('phone')}
            error={errors.phone}
            maxLength={30}
            disabled={submitting}
          />
          <TextField
            label="Tutor (menores de edad)"
            value={v.guardianName}
            onChange={set('guardianName')}
            error={errors.guardianName}
            maxLength={120}
            disabled={submitting}
          />
          <TextField
            label="Parentesco del tutor"
            value={v.guardianRelation}
            onChange={set('guardianRelation')}
            error={errors.guardianRelation}
            maxLength={40}
            disabled={submitting}
          />
          <TextField
            label="Teléfono del tutor"
            type="tel"
            value={v.guardianPhone}
            onChange={set('guardianPhone')}
            error={errors.guardianPhone}
            maxLength={30}
            disabled={submitting}
          />
        </>
      ) : (
        <p className="hint">
          Su cuenta no puede registrar documento, teléfono ni datos del tutor:
          quien tenga el permiso de datos personales completos los completará en
          la ficha.
        </p>
      )}
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Registrando…' : 'Registrar deportista'}
        </button>
        {duplicate && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit(true)}
          >
            Es otra persona: registrar de todos modos
          </button>
        )}
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
