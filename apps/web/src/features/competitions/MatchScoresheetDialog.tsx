import { useEffect, useState, type FormEvent } from 'react';
import { apiRequest } from '../../api/client.ts';
import { Modal } from '../../components/Modal.tsx';
import { describeError } from '../../components/Notice.tsx';
import type { CompetitionEvent, Registration } from './types.js';

interface MatchScoresheetDialogProps {
  event: CompetitionEvent;
  permissions: readonly string[];
  onClose: () => void;
  onSaved: () => void;
}

interface IncidentItem {
  eventParticipantId: string;
  eventType: 'gol' | 'tarjeta_amarilla' | 'tarjeta_roja' | 'sustitucion';
  minute: number;
  notes?: string;
}

export function MatchScoresheetDialog({
  event,
  permissions,
  onClose,
  onSaved,
}: MatchScoresheetDialogProps) {
  const canManage =
    permissions.includes('results:manage') ||
    permissions.includes('results:manage_assigned');
  const canApprove = permissions.includes('results:approve');

  const homeParticipant =
    event.participants.find((p) => p.side === 'local') ?? event.participants[0];
  const awayParticipant =
    event.participants.find((p) => p.side === 'visitante') ??
    event.participants[1];

  const [homeScore, setHomeScore] = useState<number>(0);
  const [awayScore, setAwayScore] = useState<number>(0);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [resultStatus, setResultStatus] = useState<string>('borrador');

  // Incidencia nueva
  const [newParticipantId, setNewParticipantId] = useState(
    homeParticipant?.id ?? '',
  );
  const [newType, setNewType] = useState<
    'gol' | 'tarjeta_amarilla' | 'tarjeta_roja' | 'sustitucion'
  >('gol');
  const [newMinute, setNewMinute] = useState<number>(1);
  const [newNotes, setNewNotes] = useState('');

  // Aprobación
  const [approvalReason, setApprovalReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [revisions, setRevisions] = useState<
    Array<{
      id: string;
      reason: string;
      changedAt: string;
      changedBy: { displayName: string };
    }>
  >([]);

  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    async function loadResult() {
      setLoading(true);
      try {
        const res = await apiRequest<{
          result: {
            status: string;
            values: Array<{ eventParticipantId: string; score: number }>;
            footballEvents: Array<{
              eventParticipantId: string;
              eventType:
                'gol' | 'tarjeta_amarilla' | 'tarjeta_roja' | 'sustitucion';
              minute: number;
              notes?: string | null;
            }>;
            revisions: Array<{
              id: string;
              reason: string;
              changedAt: string;
              changedBy: { displayName: string };
            }>;
          } | null;
        }>(`/events/${event.id}/result`);

        if (res.result) {
          setResultStatus(res.result.status);
          if (res.result.revisions) {
            setRevisions(res.result.revisions);
          }
          if (res.result.values) {
            const hVal = res.result.values.find(
              (v) => v.eventParticipantId === homeParticipant?.id,
            );
            const aVal = res.result.values.find(
              (v) => v.eventParticipantId === awayParticipant?.id,
            );
            if (hVal) setHomeScore(hVal.score);
            if (aVal) setAwayScore(aVal.score);
          }
          if (res.result.footballEvents) {
            setIncidents(
              res.result.footballEvents.map((fe) => ({
                eventParticipantId: fe.eventParticipantId,
                eventType: fe.eventType,
                minute: fe.minute,
                notes: fe.notes ?? '',
              })),
            );
          }
        }
      } catch (err) {
        setNotice({ type: 'error', text: describeError(err) });
      } finally {
        setLoading(false);
      }
    }
    void loadResult();
  }, [event.id, homeParticipant?.id, awayParticipant?.id]);

  const handleAddIncident = (e: FormEvent) => {
    e.preventDefault();
    if (!newParticipantId) return;
    setIncidents((prev) => [
      ...prev,
      {
        eventParticipantId: newParticipantId,
        eventType: newType,
        minute: newMinute,
        notes: newNotes.trim() || undefined,
      },
    ]);
    setNewNotes('');
    setNewMinute(1);
  };

  const handleRemoveIncident = (index: number) => {
    setIncidents((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveDraft = async () => {
    if (!homeParticipant || !awayParticipant) return;
    try {
      await apiRequest(`/events/${event.id}/result`, {
        method: 'PUT',
        body: {
          values: [
            { eventParticipantId: homeParticipant.id, score: homeScore },
            { eventParticipantId: awayParticipant.id, score: awayScore },
          ],
          footballEvents: incidents,
        },
      });
      setResultStatus('borrador');
      setNotice({
        type: 'success',
        text: 'Acta guardada en borrador exitosamente.',
      });
      onSaved();
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
    }
  };

  const handleSubmitReview = async () => {
    try {
      await apiRequest(`/events/${event.id}/result/submit`, {
        method: 'POST',
      });
      setResultStatus('pendiente_revision');
      setNotice({ type: 'success', text: 'Acta enviada a revisión técnica.' });
      onSaved();
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
    }
  };

  const handleApprove = async (approved: boolean) => {
    if (!approvalReason.trim()) {
      setNotice({
        type: 'error',
        text: 'Debe ingresar el motivo de la resolución técnica.',
      });
      return;
    }
    try {
      await apiRequest(`/events/${event.id}/result/approve`, {
        method: 'POST',
        body: {
          approved,
          reason: approvalReason.trim(),
          notes: approvalNotes.trim() || undefined,
        },
      });
      setResultStatus(approved ? 'aprobado' : 'rechazado');
      setNotice({
        type: 'success',
        text: approved
          ? 'Acta oficial aprobada y resultado consolidado.'
          : 'Acta rechazada.',
      });
      onSaved();
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
    }
  };

  const getName = (reg?: Registration) => {
    if (!reg) return 'Participante';
    if (reg.participant.kind === 'equipo' && reg.participant.team) {
      return reg.participant.team.team.name;
    }
    if (reg.participant.kind === 'individual' && reg.participant.individual) {
      const ind = reg.participant.individual;
      return `${ind.athlete.person.firstName} ${ind.athlete.person.lastName}`;
    }
    return 'Participante';
  };

  return (
    <Modal onClose={onClose} className="dialog-complex">
      <div
        className="dialog-content"
        style={{ maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <h4>Acta de Juego y Resultado Oficial</h4>
            <p className="catalog-intro" style={{ margin: 0 }}>
              {event.round.stage.name} · {event.round.name}
            </p>
          </div>
          <span
            className={`badge ${
              resultStatus === 'aprobado'
                ? 'badge-ok'
                : resultStatus === 'pendiente_revision'
                  ? 'badge-warning'
                  : ''
            }`}
          >
            {resultStatus.replace('_', ' ').toUpperCase()}
          </span>
        </div>

        {notice && (
          <output
            className={
              notice.type === 'error' ? 'catalog-error' : 'catalog-notice'
            }
            style={{ marginTop: '1rem', display: 'block' }}
          >
            {notice.text}
          </output>
        )}

        {loading ? (
          <p>Cargando información del acta...</p>
        ) : (
          <div>
            {/* Marcador Principal */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                gap: '1rem',
                alignItems: 'center',
                textAlign: 'center',
                margin: '1.5rem 0',
                padding: '1rem',
                background: 'var(--surface-sunken)',
                borderRadius: '8px',
              }}
            >
              <div>
                <h5>{getName(homeParticipant?.registration)}</h5>
                <span className="badge badge-neutral">Local</span>
                <div style={{ marginTop: '0.75rem' }}>
                  <label htmlFor="home-score-input" className="visually-hidden">
                    Goles Local
                  </label>
                  <input
                    id="home-score-input"
                    type="number"
                    min="0"
                    disabled={!canManage || resultStatus === 'aprobado'}
                    value={homeScore}
                    onChange={(e) =>
                      setHomeScore(Math.max(0, parseInt(e.target.value) || 0))
                    }
                    style={{
                      fontSize: '1.75rem',
                      width: '5rem',
                      textAlign: 'center',
                      fontWeight: 'bold',
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  color: 'var(--text-muted)',
                }}
              >
                —
              </div>

              <div>
                <h5>{getName(awayParticipant?.registration)}</h5>
                <span className="badge badge-neutral">Visitante</span>
                <div style={{ marginTop: '0.75rem' }}>
                  <label htmlFor="away-score-input" className="visually-hidden">
                    Goles Visitante
                  </label>
                  <input
                    id="away-score-input"
                    type="number"
                    min="0"
                    disabled={!canManage || resultStatus === 'aprobado'}
                    value={awayScore}
                    onChange={(e) =>
                      setAwayScore(Math.max(0, parseInt(e.target.value) || 0))
                    }
                    style={{
                      fontSize: '1.75rem',
                      width: '5rem',
                      textAlign: 'center',
                      fontWeight: 'bold',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Incidencias del partido */}
            <h5>Incidencias Registradas (Goles, Tarjetas, Sustituciones)</h5>
            {incidents.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                No se han registrado incidencias en el acta.
              </p>
            ) : (
              <table className="catalog-table" style={{ marginBottom: '1rem' }}>
                <thead>
                  <tr>
                    <th scope="col">Min</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Participante</th>
                    <th scope="col">Detalle</th>
                    {canManage && resultStatus !== 'aprobado' && (
                      <th scope="col">Acción</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((inc, idx) => {
                    const isHome =
                      inc.eventParticipantId === homeParticipant?.id;
                    const participantName = isHome
                      ? getName(homeParticipant?.registration)
                      : getName(awayParticipant?.registration);

                    return (
                      <tr key={idx}>
                        <td data-label="Min">{inc.minute}'</td>
                        <td data-label="Tipo">
                          <span
                            className={`badge ${
                              inc.eventType === 'gol'
                                ? 'badge-ok'
                                : inc.eventType === 'tarjeta_amarilla'
                                  ? 'badge-warning'
                                  : inc.eventType === 'tarjeta_roja'
                                    ? 'badge-alert'
                                    : ''
                            }`}
                          >
                            {inc.eventType.replace('_', ' ')}
                          </span>
                        </td>
                        <td data-label="Participante">{participantName}</td>
                        <td data-label="Detalle">{inc.notes || '—'}</td>
                        {canManage && resultStatus !== 'aprobado' && (
                          <td data-label="Acción">
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => handleRemoveIncident(idx)}
                            >
                              Quitar
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Agregar incidencia */}
            {canManage && resultStatus !== 'aprobado' && (
              <form
                onSubmit={handleAddIncident}
                className="catalog-form"
                style={{ marginBottom: '1.5rem' }}
              >
                <h6>Añadir incidencia</h6>
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="inc-part">Equipo</label>
                    <select
                      id="inc-part"
                      value={newParticipantId}
                      onChange={(e) => setNewParticipantId(e.target.value)}
                    >
                      {homeParticipant && (
                        <option value={homeParticipant.id}>
                          {getName(homeParticipant.registration)} (Local)
                        </option>
                      )}
                      {awayParticipant && (
                        <option value={awayParticipant.id}>
                          {getName(awayParticipant.registration)} (Visitante)
                        </option>
                      )}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="inc-type">Tipo</label>
                    <select
                      id="inc-type"
                      value={newType}
                      onChange={(e) =>
                        setNewType(
                          e.target.value as
                            | 'gol'
                            | 'tarjeta_amarilla'
                            | 'tarjeta_roja'
                            | 'sustitucion',
                        )
                      }
                    >
                      <option value="gol">Gol</option>
                      <option value="tarjeta_amarilla">Tarjeta Amarilla</option>
                      <option value="tarjeta_roja">Tarjeta Roja</option>
                      <option value="sustitucion">Sustitución</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="inc-min">Minuto (1-120)</label>
                    <input
                      id="inc-min"
                      type="number"
                      min="1"
                      max="130"
                      required
                      value={newMinute}
                      onChange={(e) =>
                        setNewMinute(parseInt(e.target.value) || 1)
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="inc-notes">Observación / Dorsal</label>
                    <input
                      id="inc-notes"
                      type="text"
                      value={newNotes}
                      placeholder="Ej. Remate #9 / Penal"
                      onChange={(e) => setNewNotes(e.target.value)}
                    />
                  </div>
                </div>
                <button type="submit" style={{ marginTop: '0.5rem' }}>
                  + Agregar al acta
                </button>
              </form>
            )}

            {/* Acciones de vocalía */}
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                marginBottom: '1.5rem',
                flexWrap: 'wrap',
              }}
            >
              {canManage && resultStatus !== 'aprobado' && (
                <>
                  <button type="button" onClick={handleSaveDraft}>
                    Guardar borrador
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={handleSubmitReview}
                  >
                    Enviar a revisión
                  </button>
                </>
              )}
            </div>

            {/* Panel de Aprobación Oficial */}
            {canApprove && resultStatus === 'pendiente_revision' && (
              <div
                style={{
                  border: '1px solid var(--border)',
                  padding: '1rem',
                  borderRadius: '6px',
                  background: 'var(--surface-sunken)',
                  marginBottom: '1.5rem',
                }}
              >
                <h5>Dictamen y Aprobación Oficial (Comisión Técnica)</h5>
                <p style={{ fontSize: '0.875rem' }}>
                  Al aprobar el acta, el resultado se consolida en la tabla de
                  posiciones y se genera un snapshot inmutable auditado.
                </p>
                <div className="form-group">
                  <label htmlFor="app-reason">
                    Motivo reglamentario (obligatorio)
                  </label>
                  <input
                    id="app-reason"
                    type="text"
                    required
                    value={approvalReason}
                    onChange={(e) => setApprovalReason(e.target.value)}
                    placeholder="Ej. Revisión y validación de firmas de vocales y árbitros"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="app-notes">
                    Observaciones del dictamen (opcional)
                  </label>
                  <input
                    id="app-notes"
                    type="text"
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    placeholder="Ej. Partido sin novedades disciplinarias adicionales"
                  />
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => handleApprove(true)}
                  >
                    Aprobar acta oficial
                  </button>
                  <button
                    type="button"
                    style={{ color: 'var(--danger-text)' }}
                    onClick={() => handleApprove(false)}
                  >
                    Rechazar acta
                  </button>
                </div>
              </div>
            )}

            {/* Historial de revisiones */}
            {revisions.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <h6>Historial de revisiones del acta</h6>
                <ul style={{ fontSize: '0.875rem', paddingLeft: '1.25rem' }}>
                  {revisions.map((rev) => (
                    <li key={rev.id}>
                      <strong>{rev.reason}</strong> — Modificado por{' '}
                      {rev.changedBy.displayName} el{' '}
                      {new Date(rev.changedAt).toLocaleString('es-EC')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="form-actions" style={{ marginTop: '1.5rem' }}>
          <button type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  );
}
