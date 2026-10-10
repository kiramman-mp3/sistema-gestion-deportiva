import { useState } from 'react';
import { apiRequest } from '../../api/client.ts';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import {
  Notice,
  type NoticeState,
  describeError,
} from '../../components/Notice.tsx';
import { Pagination } from '../../components/Pagination.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { MatchScoresheetDialog } from '../competitions/MatchScoresheetDialog.tsx';
import type { CompetitionEvent } from '../competitions/types.ts';
import { LoadState, SelectField } from '../people/fields.tsx';
import {
  ASSIGNMENT_STATUS_LABELS,
  type MyAssignment,
  type MyAssignmentsPageData,
} from './types.ts';

const dateTime = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'full',
  timeStyle: 'short',
});

/** «Mis designaciones»: partidos asignados al usuario, con confirmación, rechazo y acceso al acta. */
export function MyAssignmentsPage({
  permissions,
}: {
  permissions: readonly string[];
}) {
  const canWriteRecord =
    permissions.includes('results:manage_assigned') &&
    permissions.includes('fixtures:read');
  const [scope, setScope] = useState('proximas');
  const [page, setPage] = useState(1);
  const [data, reload] = useFetch<MyAssignmentsPageData>(
    `/assignments/mine?scope=${scope}&page=${page}&pageSize=20`,
  );
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [rejecting, setRejecting] = useState<MyAssignment | null>(null);
  const [scoresheet, setScoresheet] = useState<CompetitionEvent | null>(null);

  async function respond(
    a: MyAssignment,
    response: 'confirmar' | 'rechazar',
    reason?: string,
  ) {
    try {
      await apiRequest(`/assignments/${a.id}/respond`, {
        method: 'POST',
        body: { response, reason: reason || null },
      });
      setNotice({
        type: 'success',
        text:
          response === 'confirmar'
            ? 'Confirmó su designación.'
            : 'Rechazó la designación. Se avisó a quien la realizó.',
      });
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
    }
  }

  async function openRecord(a: MyAssignment) {
    try {
      setScoresheet(
        await apiRequest<CompetitionEvent>(`/events/${a.event.id}`),
      );
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
    }
  }

  return (
    <section aria-labelledby="mine-title" className="catalog">
      <div className="catalog-header">
        <h1 id="mine-title">Mis designaciones</h1>
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <div className="filters">
        <SelectField
          label="Mostrar"
          value={scope}
          onChange={(v) => {
            setScope(v);
            setPage(1);
          }}
          options={[
            { value: 'proximas', label: 'Próximas' },
            { value: 'pasadas', label: 'Pasadas' },
            { value: 'todas', label: 'Todas' },
          ]}
        />
      </div>

      <LoadState state={data} onRetry={reload} />
      {data.kind === 'ready' && !data.data.linked && (
        <p className="empty">
          Su cuenta no está vinculada a un árbitro o juez. Solicite a la
          secretaría de la Liga que la vincule.
        </p>
      )}
      {data.kind === 'ready' &&
        data.data.linked &&
        data.data.items.length === 0 && (
          <p className="empty">No tiene designaciones para mostrar.</p>
        )}
      {data.kind === 'ready' && data.data.items.length > 0 && (
        <>
          <ul className="notification-list">
            {data.data.items.map((a) => (
              <li key={a.id} className="notification">
                <div>
                  <strong>{a.event.match}</strong>
                  <p>
                    {a.roleLabel} · {a.championship.name}
                  </p>
                  <p className="hint">
                    {a.event.scheduledAt
                      ? dateTime.format(new Date(a.event.scheduledAt))
                      : 'Fecha por definir'}
                    {a.event.venue ? ` · ${a.event.venue.name}` : ''}
                  </p>
                  <p>
                    <span
                      className={`badge ${a.status === 'confirmado' ? 'badge-ok' : ''}`}
                    >
                      {ASSIGNMENT_STATUS_LABELS[a.status]}
                    </span>
                    {a.responseNote ? ` — ${a.responseNote}` : ''}
                  </p>
                </div>
                <div className="row-actions">
                  {a.status === 'designado' && (
                    <button
                      type="button"
                      onClick={() => void respond(a, 'confirmar')}
                    >
                      Confirmar
                    </button>
                  )}
                  {a.status !== 'rechazado' &&
                    !['finalizado', 'cancelado'].includes(a.event.status) && (
                      <button type="button" onClick={() => setRejecting(a)}>
                        Rechazar
                      </button>
                    )}
                  {canWriteRecord && a.status !== 'rechazado' && (
                    <button type="button" onClick={() => void openRecord(a)}>
                      Acta / Resultado
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={data.data.page}
            pageSize={data.data.pageSize}
            total={data.data.total}
            onChange={setPage}
          />
        </>
      )}

      {rejecting && (
        <ConfirmDialog
          title="Rechazar designación"
          description={`¿Rechazar la designación como ${rejecting.roleLabel} en ${rejecting.event.match}? Indique el motivo: se le avisará a quien la realizó para buscar un reemplazo.`}
          confirmLabel="Rechazar designación"
          reason="required"
          danger
          onCancel={() => setRejecting(null)}
          onConfirm={async (reason) => {
            const a = rejecting;
            setRejecting(null);
            await respond(a, 'rechazar', reason);
          }}
        />
      )}

      {scoresheet && (
        <MatchScoresheetDialog
          event={scoresheet}
          permissions={permissions}
          onClose={() => setScoresheet(null)}
          onSaved={() => {
            setScoresheet(null);
            reload();
          }}
        />
      )}
    </section>
  );
}
