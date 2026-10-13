import { type FormEvent, useState } from 'react';
import { apiRequest } from '../../api/client.ts';
import {
  Notice,
  type NoticeState,
  describeError,
} from '../../components/Notice.tsx';
import { Pagination } from '../../components/Pagination.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { LoadState, TextField } from '../people/fields.tsx';
import {
  ASSIGNMENT_ROLE_LABELS,
  ASSIGNMENT_STATUS_LABELS,
  type HistoryItem,
  OFFICIAL_STATUS_LABELS,
  type OfficialDetail,
  type Page,
} from './types.ts';

const dateTime = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const fmt = (iso: string | null) =>
  iso ? dateTime.format(new Date(iso)) : '—';

/** Ficha de un oficial: datos, disponibilidad e historial de participación. */
export function OfficialDetailPage({
  officialId,
  permissions,
}: {
  officialId: string;
  permissions: readonly string[];
}) {
  const canManage = permissions.includes('officials:manage');
  const [official, reload] = useFetch<OfficialDetail>(
    `/officials/${officialId}`,
  );
  const [historyPage, setHistoryPage] = useState(1);
  const [history] = useFetch<Page<HistoryItem>>(
    `/officials/${officialId}/history?page=${historyPage}&pageSize=10`,
  );
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function addUnavailability(e: FormEvent) {
    e.preventDefault();
    if (!startsAt || !endsAt) {
      setNotice({
        type: 'error',
        text: 'Indique la fecha inicial y la final.',
      });
      return;
    }
    setBusy(true);
    try {
      await apiRequest(`/officials/${officialId}/unavailability`, {
        method: 'POST',
        body: {
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          reason: reason.trim() || null,
        },
      });
      setStartsAt('');
      setEndsAt('');
      setReason('');
      setNotice({ type: 'success', text: 'Se registró el período.' });
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  async function removeUnavailability(id: string) {
    try {
      await apiRequest(`/officials/${officialId}/unavailability/${id}`, {
        method: 'DELETE',
      });
      setNotice({ type: 'success', text: 'Se quitó el período.' });
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
    }
  }

  return (
    <section aria-labelledby="official-title" className="catalog">
      <p>
        <a href="#/arbitros">← Volver a árbitros y jueces</a>
      </p>
      <LoadState state={official} onRetry={reload} />
      {official.kind === 'ready' && (
        <>
          <div className="catalog-header">
            <h1 id="official-title">
              {official.data.firstName} {official.data.lastName}
            </h1>
            <span
              className={`badge ${official.data.status === 'activo' ? 'badge-ok' : ''}`}
            >
              {OFFICIAL_STATUS_LABELS[official.data.status]}
            </span>
          </div>
          <Notice notice={notice} onClose={() => setNotice(null)} />

          <dl className="detail-list">
            <dt>Deportes</dt>
            <dd>{official.data.sports.map((s) => s.name).join(', ')}</dd>
            <dt>Licencia</dt>
            <dd>{official.data.licenseNumber ?? '—'}</dd>
            <dt>Club de afiliación</dt>
            <dd>{official.data.club?.name ?? 'Sin club'}</dd>
            {official.data.phone !== undefined && (
              <>
                <dt>Teléfono</dt>
                <dd>{official.data.phone ?? '—'}</dd>
              </>
            )}
            <dt>Cuenta del sistema</dt>
            <dd>
              {official.data.account
                ? official.data.account.email
                : official.data.hasAccount
                  ? 'Vinculada'
                  : 'Sin cuenta vinculada'}
            </dd>
            <dt>Próximas designaciones</dt>
            <dd>{official.data.upcomingAssignments}</dd>
          </dl>

          <h2>Disponibilidad</h2>
          <p className="hint">
            Períodos futuros en los que no se le puede designar.
          </p>
          {official.data.unavailabilities.length === 0 ? (
            <p className="empty">No hay períodos de indisponibilidad.</p>
          ) : (
            <table className="responsive-table">
              <caption className="visually-hidden">
                Períodos de indisponibilidad
              </caption>
              <thead>
                <tr>
                  <th scope="col">Desde</th>
                  <th scope="col">Hasta</th>
                  <th scope="col">Motivo</th>
                  {canManage && <th scope="col">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {official.data.unavailabilities.map((u) => (
                  <tr key={u.id}>
                    <td data-label="Desde">{fmt(u.startsAt)}</td>
                    <td data-label="Hasta">{fmt(u.endsAt)}</td>
                    <td data-label="Motivo">{u.reason ?? '—'}</td>
                    {canManage && (
                      <td data-label="Acciones" className="row-actions">
                        <button
                          type="button"
                          onClick={() => void removeUnavailability(u.id)}
                        >
                          Quitar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canManage && (
            <form
              className="catalog-form"
              onSubmit={addUnavailability}
              noValidate
            >
              <h3>Registrar indisponibilidad</h3>
              <TextField
                label="Desde"
                type="datetime-local"
                value={startsAt}
                onChange={setStartsAt}
                disabled={busy}
              />
              <TextField
                label="Hasta"
                type="datetime-local"
                value={endsAt}
                onChange={setEndsAt}
                disabled={busy}
              />
              <TextField
                label="Motivo"
                value={reason}
                onChange={setReason}
                maxLength={200}
                disabled={busy}
              />
              <button type="submit" disabled={busy}>
                Agregar período
              </button>
            </form>
          )}

          <h2>Historial de participación</h2>
          <LoadState state={history} onRetry={() => undefined} />
          {history.kind === 'ready' && history.data.items.length === 0 && (
            <p className="empty">Todavía no tiene designaciones.</p>
          )}
          {history.kind === 'ready' && history.data.items.length > 0 && (
            <>
              <table className="responsive-table">
                <caption className="visually-hidden">
                  Historial de designaciones
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Campeonato</th>
                    <th scope="col">Función</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.items.map((h) => (
                    <tr key={h.id}>
                      <td data-label="Fecha">{fmt(h.event.scheduledAt)}</td>
                      <td data-label="Campeonato">
                        <a href={`#/campeonatos/${h.championship.id}`}>
                          {h.championship.name}
                        </a>{' '}
                        ({h.championship.sport})
                      </td>
                      <td data-label="Función">
                        {ASSIGNMENT_ROLE_LABELS[h.role]}
                      </td>
                      <td data-label="Estado">
                        {ASSIGNMENT_STATUS_LABELS[h.status]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={history.data.page}
                pageSize={history.data.pageSize}
                total={history.data.total}
                onChange={setHistoryPage}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
