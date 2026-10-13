import { type FormEvent, useState } from 'react';
import { ApiError, apiRequest } from '../../api/client.ts';
import {
  Notice,
  type NoticeState,
  describeError,
} from '../../components/Notice.tsx';
import { Modal } from '../../components/Modal.tsx';
import { Pagination } from '../../components/Pagination.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { LoadState, SelectField, TextField } from '../people/fields.tsx';
import type { Page } from '../people/types.ts';
import {
  CHAMPIONSHIP_FORMAT_LABELS,
  CHAMPIONSHIP_STATUS_LABELS,
  type Championship,
  type ChampionshipFormat,
} from './types.ts';

interface Option {
  value: string;
  label: string;
}

export function ChampionshipsPage({
  permissions,
}: {
  permissions: readonly string[];
}) {
  const canManage = permissions.includes('championships:manage');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const query = new URLSearchParams({
    page: String(page),
    pageSize: '20',
    ...(q && { q }),
    ...(status && { status }),
  });

  const [list, reload] = useFetch<Page<Championship>>(
    `/championships?${query.toString()}`,
  );

  return (
    <section aria-labelledby="championships-title" className="catalog">
      <div className="catalog-header">
        <h1 id="championships-title">Campeonatos</h1>
        {canManage && (
          <button
            type="button"
            className="primary"
            onClick={() => setCreating(true)}
          >
            Nuevo campeonato
          </button>
        )}
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {creating && (
        <Modal onClose={() => setCreating(false)} className="dialog-complex">
          <CreateChampionshipForm
            onCancel={() => setCreating(false)}
            onCreated={(champ) => {
              setCreating(false);
              setNotice({
                type: 'success',
                text: `Se creó el campeonato «${champ.name}».`,
              });
              reload();
            }}
          />
        </Modal>
      )}

      <div className="filters">
        <TextField
          label="Buscar campeonato"
          value={q}
          onChange={(val) => {
            setQ(val);
            setPage(1);
          }}
          hint="Nombre del torneo o copa"
        />
        <SelectField
          label="Estado"
          value={status}
          onChange={(val) => {
            setStatus(val);
            setPage(1);
          }}
          placeholder="Todos los estados"
          options={Object.entries(CHAMPIONSHIP_STATUS_LABELS).map(
            ([value, label]) => ({ value, label }),
          )}
        />
      </div>

      <LoadState state={list} onRetry={reload} />

      {list.kind === 'ready' && list.data.items.length === 0 && (
        <p className="empty">No hay campeonatos registrados.</p>
      )}

      {list.kind === 'ready' && list.data.items.length > 0 && (
        <>
          <table className="responsive-table">
            <caption className="visually-hidden">Lista de campeonatos</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Deporte / Categoría</th>
                <th scope="col">Temporada</th>
                <th scope="col">Modalidad</th>
                <th scope="col">Inscritos</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((c) => (
                <tr key={c.id}>
                  <td data-label="Nombre">
                    <a
                      href={`#/campeonatos/${c.id}`}
                      aria-label={`Ver campeonato ${c.name}`}
                    >
                      <strong>{c.name}</strong>
                    </a>
                  </td>
                  <td data-label="Deporte / Categoría">
                    {c.sport.name} · {c.category.name}
                  </td>
                  <td data-label="Temporada">{c.season.name}</td>
                  <td data-label="Modalidad">
                    {CHAMPIONSHIP_FORMAT_LABELS[c.format]}
                  </td>
                  <td data-label="Inscritos">
                    {c._count?.registrations ?? 0} participantes
                  </td>
                  <td data-label="Estado">
                    <span
                      className={`badge ${
                        c.status === 'en_curso'
                          ? 'badge-ok'
                          : c.status === 'inscripciones_abiertas'
                            ? 'badge-info'
                            : ''
                      }`}
                    >
                      {CHAMPIONSHIP_STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td data-label="Acciones" className="row-actions">
                    <a href={`#/campeonatos/${c.id}`} className="button-link">
                      Ver detalle
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
            onChange={setPage}
          />
        </>
      )}
    </section>
  );
}

function CreateChampionshipForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (c: Championship) => void;
}) {
  const [seasons] = useFetch<
    Page<{ id: string; name: string; status: string }>
  >('/seasons?pageSize=100');
  const [sports] = useFetch<Page<{ id: string; name: string; status: string }>>(
    '/sports?pageSize=100',
  );
  const [categories] = useFetch<
    Page<{ id: string; name: string; status: string }>
  >('/categories?pageSize=100');

  const [seasonId, setSeasonId] = useState('');
  const [sportId, setSportId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [format, setFormat] =
    useState<ChampionshipFormat>('todos_contra_todos');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [registrationStart, setRegistrationStart] = useState('');
  const [registrationEnd, setRegistrationEnd] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const seasonOptions: Option[] =
    seasons.kind === 'ready'
      ? seasons.data.items
          .filter((s) => s.status !== 'archivada')
          .map((s) => ({ value: s.id, label: s.name }))
      : [];
  const sportOptions: Option[] =
    sports.kind === 'ready'
      ? sports.data.items
          .filter((s) => s.status === 'activo')
          .map((s) => ({ value: s.id, label: s.name }))
      : [];
  const categoryOptions: Option[] =
    categories.kind === 'ready'
      ? categories.data.items
          .filter((c) => c.status === 'activo')
          .map((c) => ({ value: c.id, label: c.name }))
      : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const errs: Record<string, string> = {};
    if (!seasonId) errs.seasonId = 'Seleccione la temporada.';
    if (!sportId) errs.sportId = 'Seleccione el deporte.';
    if (!categoryId) errs.categoryId = 'Seleccione la categoría.';
    if (!name.trim()) errs.name = 'El nombre es obligatorio.';
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const created = await apiRequest<Championship>('/championships', {
        method: 'POST',
        body: {
          seasonId,
          sportId,
          categoryId,
          name: name.trim(),
          format,
          ...(startDate && { startDate }),
          ...(endDate && { endDate }),
          ...(registrationStart && { registrationStart }),
          ...(registrationEnd && { registrationEnd }),
        },
      });
      onCreated(created);
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
      <h2>Nuevo campeonato deportivo</h2>
      <SelectField
        label="Temporada deportiva"
        value={seasonId}
        onChange={setSeasonId}
        required
        error={errors.seasonId}
        placeholder="Seleccione la temporada…"
        options={seasonOptions}
        disabled={submitting}
      />
      <div className="form-row">
        <SelectField
          label="Deporte"
          value={sportId}
          onChange={setSportId}
          required
          error={errors.sportId}
          placeholder="Seleccione el deporte…"
          options={sportOptions}
          disabled={submitting}
        />
        <SelectField
          label="Categoría"
          value={categoryId}
          onChange={setCategoryId}
          required
          error={errors.categoryId}
          placeholder="Seleccione la categoría…"
          options={categoryOptions}
          disabled={submitting}
        />
      </div>
      <TextField
        label="Nombre del campeonato"
        value={name}
        onChange={setName}
        required
        error={errors.name}
        maxLength={120}
        hint="Ej. Torneo Apertura Masculino 2026"
        disabled={submitting}
      />
      <SelectField
        label="Modalidad de competencia"
        value={format}
        onChange={(v) => setFormat(v as ChampionshipFormat)}
        options={Object.entries(CHAMPIONSHIP_FORMAT_LABELS).map(
          ([value, label]) => ({ value, label }),
        )}
        disabled={submitting}
      />
      <div className="form-row">
        <TextField
          label="Inicio de inscripciones"
          type="date"
          value={registrationStart}
          onChange={setRegistrationStart}
          error={errors.registrationStart}
          disabled={submitting}
        />
        <TextField
          label="Cierre de inscripciones"
          type="date"
          value={registrationEnd}
          onChange={setRegistrationEnd}
          error={errors.registrationEnd}
          disabled={submitting}
        />
      </div>
      <div className="form-row">
        <TextField
          label="Fecha estimada de inicio"
          type="date"
          value={startDate}
          onChange={setStartDate}
          error={errors.startDate}
          disabled={submitting}
        />
        <TextField
          label="Fecha estimada de finalización"
          type="date"
          value={endDate}
          onChange={setEndDate}
          error={errors.endDate}
          disabled={submitting}
        />
      </div>
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear campeonato'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
