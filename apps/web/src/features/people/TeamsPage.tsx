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
import { LoadState, SelectField, TextField } from './fields.tsx';
import type { CatalogItem, Club, Page, Team } from './types.ts';

export function TeamsPage({ permissions }: { permissions: readonly string[] }) {
  const canCreate = permissions.includes('teams:manage');
  const [pageNumber, setPageNumber] = useState(1);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [list, reload] = useFetch<Page<Team>>(
    `/teams?page=${pageNumber}&pageSize=20`,
  );

  return (
    <section aria-labelledby="teams-title" className="catalog">
      <div className="catalog-header">
        <h1 id="teams-title">Equipos</h1>
        {canCreate && (
          <button
            type="button"
            className="primary"
            onClick={() => setCreating(true)}
          >
            Nuevo equipo
          </button>
        )}
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {creating && (
        <Modal onClose={() => setCreating(false)} className="dialog-complex">
          <CreateTeamForm
            onCancel={() => setCreating(false)}
            onCreated={(team) => {
              setCreating(false);
              setNotice({
                type: 'success',
                text: `Se creó el equipo ${team.name}.`,
              });
              reload();
            }}
          />
        </Modal>
      )}

      <LoadState state={list} onRetry={reload} />
      {list.kind === 'ready' && list.data.items.length === 0 && (
        <p className="empty">Todavía no hay equipos registrados.</p>
      )}
      {list.kind === 'ready' && list.data.items.length > 0 && (
        <>
          <table className="responsive-table">
            <caption className="visually-hidden">Equipos</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Club</th>
                <th scope="col">Deporte</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((t) => (
                <tr key={t.id}>
                  <td data-label="Nombre">{t.name}</td>
                  <td data-label="Club">{t.club.name}</td>
                  <td data-label="Deporte">{t.sport.name}</td>
                  <td data-label="Estado">
                    {t.status === 'activo' ? 'Activo' : 'Inactivo'}
                  </td>
                  <td data-label="Acciones" className="row-actions">
                    <a
                      className="button-link"
                      href={`#/equipos/${t.id}`}
                      aria-label={`Administrar el equipo ${t.name}`}
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
            onChange={setPageNumber}
          />
        </>
      )}
    </section>
  );
}

function CreateTeamForm({
  onCreated,
  onCancel,
}: {
  onCreated: (team: Team) => void;
  onCancel: () => void;
}) {
  const [clubs] = useFetch<Page<Club>>('/clubs?pageSize=100');
  const [sports] = useFetch<Page<CatalogItem>>('/sports?pageSize=100');
  const [clubId, setClubId] = useState('');
  const [sportId, setSportId] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found: Record<string, string> = {};
    if (!clubId) found.clubId = 'Seleccione el club.';
    if (!sportId) found.sportId = 'Seleccione el deporte.';
    if (!name.trim()) found.name = 'Ingrese el nombre del equipo.';
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setSubmitting(true);
    try {
      onCreated(
        await apiRequest<Team>('/teams', {
          method: 'POST',
          body: { clubId, sportId, name: name.trim() },
        }),
      );
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
      aria-label="Nuevo equipo"
    >
      <h3>Nuevo equipo</h3>
      <SelectField
        label="Club"
        required
        value={clubId}
        onChange={setClubId}
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
      <SelectField
        label="Deporte"
        required
        value={sportId}
        onChange={setSportId}
        placeholder="Seleccione…"
        error={errors.sportId}
        disabled={submitting}
        options={
          sports.kind === 'ready'
            ? sports.data.items
                .filter((s) => s.status === 'activo')
                .map((s) => ({ value: s.id, label: s.name }))
            : []
        }
      />
      <TextField
        label="Nombre"
        required
        value={name}
        onChange={setName}
        error={errors.name}
        maxLength={100}
        disabled={submitting}
        hint="El nombre puede cambiar de una temporada a otra al inscribir el equipo."
      />
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear equipo'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
