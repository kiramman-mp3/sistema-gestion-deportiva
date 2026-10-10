import { useState } from 'react';
import { apiRequest } from '../../api/client.ts';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { Modal } from '../../components/Modal.tsx';
import {
  Notice,
  type NoticeState,
  describeError,
} from '../../components/Notice.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { LoadState, SelectField } from '../people/fields.tsx';
import {
  ASSIGNMENT_ROLE_LABELS,
  ASSIGNMENT_STATUS_LABELS,
  type AssignmentRole,
  type Candidate,
  type EventAssignmentItem,
} from './types.ts';

/** Designaciones de un partido: lista, alta con candidatos (y sus conflictos) y retiro. */
export function EventAssignmentsDialog({
  eventId,
  title,
  canManage,
  onClose,
}: {
  eventId: string;
  title: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const [assignments, reloadAssignments] = useFetch<EventAssignmentItem[]>(
    `/events/${eventId}/assignments`,
  );
  const [candidates, reloadCandidates] = useFetch<Candidate[]>(
    canManage ? `/events/${eventId}/assignment-candidates` : null,
  );
  const [officialId, setOfficialId] = useState('');
  const [role, setRole] = useState<AssignmentRole>('arbitro_central');
  const [removing, setRemoving] = useState<EventAssignmentItem | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () => {
    reloadAssignments();
    reloadCandidates();
  };

  const selected =
    candidates.kind === 'ready'
      ? candidates.data.find((c) => c.id === officialId)
      : undefined;

  async function assign() {
    if (!officialId) return;
    setBusy(true);
    try {
      await apiRequest(`/events/${eventId}/assignments`, {
        method: 'POST',
        body: { officialId, role },
      });
      setOfficialId('');
      setNotice({ type: 'success', text: 'Se registró la designación.' });
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} className="dialog-complex" busy={busy}>
      <div className="dialog-content">
        <h4>Designaciones: {title}</h4>
        <Notice notice={notice} onClose={() => setNotice(null)} />

        <LoadState state={assignments} onRetry={reloadAssignments} />
        {assignments.kind === 'ready' && assignments.data.length === 0 && (
          <p className="empty">Este partido no tiene oficiales designados.</p>
        )}
        {assignments.kind === 'ready' && assignments.data.length > 0 && (
          <ul className="plain-list">
            {assignments.data.map((a) => (
              <li key={a.id}>
                <strong>{a.roleLabel}:</strong> {a.official.lastName},{' '}
                {a.official.firstName} — {ASSIGNMENT_STATUS_LABELS[a.status]}
                {a.responseNote ? ` (${a.responseNote})` : ''}
                {canManage && (
                  <>
                    {' '}
                    <button type="button" onClick={() => setRemoving(a)}>
                      Retirar
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <>
            <h5>Designar un oficial</h5>
            <LoadState state={candidates} onRetry={reloadCandidates} />
            {candidates.kind === 'ready' && (
              <>
                <SelectField
                  label="Oficial"
                  value={officialId}
                  onChange={setOfficialId}
                  placeholder="Seleccione un oficial"
                  options={candidates.data
                    .filter((c) => !c.alreadyAssigned)
                    .map((c) => ({
                      value: c.id,
                      label: `${c.lastName}, ${c.firstName}${
                        c.conflicts.length > 0 ? ' (con conflicto)' : ''
                      }`,
                    }))}
                />
                {selected && selected.conflicts.length > 0 && (
                  <ul className="form-error" role="alert">
                    {selected.conflicts.map((c) => (
                      <li key={c.code}>{c.message}</li>
                    ))}
                  </ul>
                )}
                <SelectField
                  label="Función"
                  value={role}
                  onChange={(v) => setRole(v as AssignmentRole)}
                  options={Object.entries(ASSIGNMENT_ROLE_LABELS).map(
                    ([value, label]) => ({ value, label }),
                  )}
                />
                <button
                  type="button"
                  className="primary"
                  disabled={!officialId || busy}
                  onClick={() => void assign()}
                >
                  Designar
                </button>
              </>
            )}
          </>
        )}

        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>

      {removing && (
        <ConfirmDialog
          title="Retirar designación"
          description={`¿Retirar a ${removing.official.firstName} ${removing.official.lastName} como ${removing.roleLabel}? Se le avisará.`}
          confirmLabel="Retirar"
          reason="optional"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={async (reason) => {
            const a = removing;
            setRemoving(null);
            try {
              await apiRequest(`/events/${eventId}/assignments/${a.id}`, {
                method: 'DELETE',
                body: { reason: reason || null },
              });
              setNotice({ type: 'success', text: 'Se retiró la designación.' });
              reload();
            } catch (err) {
              setNotice({ type: 'error', text: describeError(err) });
            }
          }}
        />
      )}
    </Modal>
  );
}
