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
import { LoadState, TextField } from './fields.tsx';
import {
  CLUB_STATUS_LABELS,
  type Club,
  type ClubStatus,
  type Page,
} from './types.ts';

export function ClubsPage({ permissions }: { permissions: readonly string[] }) {
  // Crear y cambiar el estado de un club son funciones de la Liga (acceso a todos los clubes).
  const isLeague =
    permissions.includes('clubs:manage') &&
    permissions.includes('clubs:access_all');
  const [pageNumber, setPageNumber] = useState(1);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<{
    club: Club;
    status: ClubStatus;
  } | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [list, reload] = useFetch<Page<Club>>(
    `/clubs?page=${pageNumber}&pageSize=20`,
  );

  return (
    <section aria-labelledby="clubs-title" className="catalog">
      <div className="catalog-header">
        <h2 id="clubs-title">Clubes</h2>
        {isLeague && !creating && (
          <button
            type="button"
            className="primary"
            onClick={() => setCreating(true)}
          >
            Nuevo club
          </button>
        )}
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {creating && (
        <CreateClubForm
          onCancel={() => setCreating(false)}
          onCreated={(club) => {
            setCreating(false);
            setNotice({
              type: 'success',
              text: `Se creó el club ${club.name}.`,
            });
            reload();
          }}
        />
      )}

      <LoadState state={list} onRetry={reload} />
      {list.kind === 'ready' && list.data.items.length === 0 && (
        <p className="empty">No hay clubes disponibles para su cuenta.</p>
      )}
      {list.kind === 'ready' && list.data.items.length > 0 && (
        <>
          <table className="responsive-table">
            <caption className="visually-hidden">Clubes</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Sector</th>
                <th scope="col">Estado</th>
                {isLeague && <th scope="col">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((club) => (
                <tr key={club.id}>
                  <td data-label="Nombre">{club.name}</td>
                  <td data-label="Sector">{club.sector ?? '—'}</td>
                  <td data-label="Estado">{CLUB_STATUS_LABELS[club.status]}</td>
                  {isLeague && (
                    <td data-label="Acciones" className="row-actions">
                      {club.status === 'activo' ? (
                        <button
                          type="button"
                          aria-label={`Desactivar ${club.name}`}
                          onClick={() =>
                            setPending({ club, status: 'inactivo' })
                          }
                        >
                          Desactivar
                        </button>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Activar ${club.name}`}
                          onClick={() => setPending({ club, status: 'activo' })}
                        >
                          Activar
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
            onChange={setPageNumber}
          />
        </>
      )}

      {pending && (
        <ConfirmDialog
          title={`${pending.status === 'activo' ? 'Activar' : 'Desactivar'} club`}
          description={
            pending.status === 'activo'
              ? `${pending.club.name} volverá a operar.`
              : `${pending.club.name} no podrá registrar deportistas ni equipos nuevos. Se conserva su historial.`
          }
          confirmLabel={pending.status === 'activo' ? 'Activar' : 'Desactivar'}
          reason="required"
          onCancel={() => setPending(null)}
          onConfirm={async (reason) => {
            try {
              await apiRequest(`/clubs/${pending.club.id}/status`, {
                method: 'PATCH',
                body: { status: pending.status, reason },
              });
              setNotice({
                type: 'success',
                text: `Se actualizó el estado de ${pending.club.name}.`,
              });
              reload();
            } catch (error) {
              setNotice({ type: 'error', text: describeError(error) });
            }
            setPending(null);
          }}
        />
      )}
    </section>
  );
}

function CreateClubForm({
  onCreated,
  onCancel,
}: {
  onCreated: (club: Club) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [sector, setSector] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!name.trim()) {
      setErrors({ name: 'Ingrese el nombre del club.' });
      return;
    }
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      const club = await apiRequest<Club>('/clubs', {
        method: 'POST',
        body: {
          name: name.trim(),
          ...(sector.trim() && { sector: sector.trim() }),
        },
      });
      onCreated(club);
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
      aria-label="Nuevo club"
    >
      <h3>Nuevo club</h3>
      <TextField
        label="Nombre"
        required
        value={name}
        onChange={setName}
        error={errors.name}
        maxLength={100}
        disabled={submitting}
      />
      <TextField
        label="Sector"
        value={sector}
        onChange={setSector}
        error={errors.sector}
        maxLength={100}
        disabled={submitting}
      />
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear club'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
