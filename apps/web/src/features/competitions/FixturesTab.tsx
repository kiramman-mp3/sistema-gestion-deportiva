import { useState, type FormEvent } from 'react';
import { apiRequest } from '../../api/client.ts';
import { Modal } from '../../components/Modal.tsx';
import { describeError } from '../../components/Notice.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import {
  EVENT_STATUS_LABELS,
  STAGE_TYPE_LABELS,
  type Championship,
  type CompetitionEvent,
  type Registration,
  type Stage,
  type StageType,
  type Venue,
} from './types.js';
import { IncidentDialog } from '../discipline/IncidentDialog.tsx';
import { EventAssignmentsDialog } from '../officials/EventAssignmentsDialog.tsx';
import { MatchScoresheetDialog } from './MatchScoresheetDialog.tsx';

interface FixturesTabProps {
  championship: Championship;
  registrations: Registration[];
  permissions: readonly string[];
}

export function FixturesTab({
  championship,
  registrations,
  permissions,
}: FixturesTabProps) {
  const canManage = permissions.includes('fixtures:manage');
  const canSeeAssignments = permissions.includes('assignments:read');
  const canAssign = permissions.includes('assignments:manage');
  const canReport = permissions.includes('incidents:report');

  const [stagesState, reloadStages] = useFetch<Stage[]>(
    `/championships/${championship.id}/stages`,
  );
  const [eventsState, reloadEvents] = useFetch<CompetitionEvent[]>(
    `/championships/${championship.id}/events`,
  );
  const [venuesState] = useFetch<{ items: Venue[] }>('/venues?limit=100');

  const stages = stagesState.kind === 'ready' ? stagesState.data : [];
  const events = eventsState.kind === 'ready' ? eventsState.data : [];
  const venues = venuesState.kind === 'ready' ? venuesState.data.items : [];
  const loading =
    stagesState.kind === 'loading' || eventsState.kind === 'loading';
  const error =
    stagesState.kind === 'error'
      ? stagesState.message
      : eventsState.kind === 'error'
        ? eventsState.message
        : null;

  const reloadAll = () => {
    reloadStages();
    reloadEvents();
  };

  const [notice, setNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Modales y formularios
  const [addingStage, setAddingStage] = useState(false);
  const [stageName, setStageName] = useState('');
  const [stageType, setStageType] = useState<StageType>('grupo');

  const [addingRoundStageId, setAddingRoundStageId] = useState<string | null>(
    null,
  );
  const [roundName, setRoundName] = useState('');

  const [schedulingRoundId, setSchedulingRoundId] = useState<string | null>(
    null,
  );
  const [homeRegId, setHomeRegId] = useState('');
  const [awayRegId, setAwayRegId] = useState('');
  const [eventVenueId, setEventVenueId] = useState('');
  const [eventDate, setEventDate] = useState('');

  const [reschedulingEvent, setReschedulingEvent] =
    useState<CompetitionEvent | null>(null);
  const [rescheduleVenueId, setRescheduleVenueId] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');

  const [scoresheetEvent, setScoresheetEvent] =
    useState<CompetitionEvent | null>(null);
  const [assignmentsEvent, setAssignmentsEvent] =
    useState<CompetitionEvent | null>(null);
  const [incidentEvent, setIncidentEvent] = useState<CompetitionEvent | null>(
    null,
  );

  const handleCreateStage = async (e: FormEvent) => {
    e.preventDefault();
    if (!stageName.trim()) return;

    try {
      await apiRequest(`/championships/${championship.id}/stages`, {
        method: 'POST',
        body: { name: stageName.trim(), stageType },
      });
      setAddingStage(false);
      setStageName('');
      setNotice({ type: 'success', text: 'Etapa creada correctamente' });
      reloadAll();
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
    }
  };

  const handleCreateRound = async (stageId: string, e: FormEvent) => {
    e.preventDefault();
    if (!roundName.trim()) return;

    try {
      await apiRequest(`/stages/${stageId}/rounds`, {
        method: 'POST',
        body: { name: roundName.trim() },
      });
      setAddingRoundStageId(null);
      setRoundName('');
      setNotice({ type: 'success', text: 'Jornada creada correctamente' });
      reloadAll();
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
    }
  };

  const handleScheduleEvent = async (roundId: string, e: FormEvent) => {
    e.preventDefault();
    if (!homeRegId || !awayRegId || homeRegId === awayRegId) {
      setNotice({
        type: 'error',
        text: 'Seleccione dos participantes distintos',
      });
      return;
    }

    try {
      await apiRequest(`/rounds/${roundId}/events`, {
        method: 'POST',
        body: {
          homeRegistrationId: homeRegId,
          awayRegistrationId: awayRegId,
          venueId: eventVenueId || null,
          scheduledAt: eventDate ? new Date(eventDate).toISOString() : null,
        },
      });
      setSchedulingRoundId(null);
      setHomeRegId('');
      setAwayRegId('');
      setEventVenueId('');
      setEventDate('');
      setNotice({ type: 'success', text: 'Partido programado exitosamente' });
      reloadAll();
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
    }
  };

  const handleReschedule = async (e: FormEvent) => {
    e.preventDefault();
    if (!reschedulingEvent) return;
    if (!rescheduleReason.trim()) {
      setNotice({
        type: 'error',
        text: 'Debe ingresar el motivo de la reprogramación',
      });
      return;
    }

    try {
      await apiRequest(`/events/${reschedulingEvent.id}/schedule`, {
        method: 'PATCH',
        body: {
          venueId: rescheduleVenueId || null,
          scheduledAt: rescheduleDate
            ? new Date(rescheduleDate).toISOString()
            : null,
          reason: rescheduleReason.trim(),
        },
      });
      setReschedulingEvent(null);
      setNotice({ type: 'success', text: 'Partido reprogramado con éxito' });
      reloadAll();
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
    }
  };

  const approvedRegistrations = registrations.filter(
    (r) => r.status === 'aprobada' || r.status === 'pendiente',
  );

  const clubsOf = (ev: CompetitionEvent) => {
    const found = new Map<string, string>();
    for (const p of ev.participants) {
      const club =
        p.registration.participant.team?.team.club ??
        p.registration.participant.individual?.athlete.club;
      if (club) found.set(club.id, club.name);
    }
    return [...found].map(([id, name]) => ({ id, name }));
  };

  const getParticipantName = (r: Registration) => {
    if (r.participant.kind === 'equipo' && r.participant.team) {
      return `${r.participant.team.team.name} (${r.participant.team.team.club.name})`;
    }
    if (r.participant.kind === 'individual' && r.participant.individual) {
      const ind = r.participant.individual;
      return `${ind.athlete.person.firstName} ${ind.athlete.person.lastName} (${ind.athlete.club.name})`;
    }
    return 'Participante desconocido';
  };

  return (
    <div className="tab-panel">
      {notice && (
        <output
          className={
            notice.type === 'error' ? 'catalog-error' : 'catalog-notice'
          }
        >
          {notice.text}
          <button
            type="button"
            className="link-button ms-4"
            onClick={() => setNotice(null)}
          >
            Cerrar
          </button>
        </output>
      )}

      <div className="catalog-header">
        <div>
          <h2>Etapas y Calendario de Partidos</h2>
          <p className="catalog-intro">
            Organice las fases del campeonato (grupos, playoffs), defina
            jornadas y programe partidos en escenarios oficiales.
          </p>
        </div>
        {canManage && !addingStage && (
          <button
            type="button"
            className="primary"
            onClick={() => setAddingStage(true)}
          >
            Nueva etapa
          </button>
        )}
      </div>

      {addingStage && (
        <form onSubmit={handleCreateStage} className="catalog-form mb-6">
          <h3>Crear nueva etapa</h3>
          <div className="form-group">
            <label htmlFor="stage-name">Nombre de la etapa</label>
            <input
              id="stage-name"
              type="text"
              required
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
              placeholder="Ej. Fase de Clasificación / Grupo A"
            />
          </div>
          <div className="form-group">
            <label htmlFor="stage-type">Tipo de etapa</label>
            <select
              id="stage-type"
              value={stageType}
              onChange={(e) => setStageType(e.target.value as StageType)}
            >
              <option value="grupo">{STAGE_TYPE_LABELS.grupo}</option>
              <option value="eliminatoria">
                {STAGE_TYPE_LABELS.eliminatoria}
              </option>
              <option value="unico">{STAGE_TYPE_LABELS.unico}</option>
            </select>
          </div>
          <div className="form-actions">
            <button type="submit" className="primary">
              Guardar etapa
            </button>
            <button type="button" onClick={() => setAddingStage(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p>Cargando calendario...</p>
      ) : error ? (
        <div className="catalog-error">{error}</div>
      ) : stages.length === 0 ? (
        <div className="empty-state">
          <p>No se han definido etapas para este campeonato.</p>
          {canManage && (
            <button
              type="button"
              className="primary"
              onClick={() => setAddingStage(true)}
            >
              Crear primera etapa
            </button>
          )}
        </div>
      ) : (
        <div className="stages-container">
          {stages.map((stage) => (
            <div key={stage.id} className="catalog-card mb-8">
              <div className="catalog-header mb-4">
                <div>
                  <h3>
                    Etapa {stage.sequence}: {stage.name}
                  </h3>
                  <span className="badge badge-neutral">
                    {STAGE_TYPE_LABELS[stage.stageType]}
                  </span>
                </div>
                {canManage && addingRoundStageId !== stage.id && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddingRoundStageId(stage.id);
                      setRoundName(`Fecha ${stage.rounds.length + 1}`);
                    }}
                  >
                    Agregar jornada / ronda
                  </button>
                )}
              </div>

              {addingRoundStageId === stage.id && (
                <form
                  onSubmit={(e) => handleCreateRound(stage.id, e)}
                  className="catalog-form mb-4"
                >
                  <h4>Nueva Jornada en {stage.name}</h4>
                  <div className="form-group">
                    <label htmlFor="round-name">Nombre de la jornada</label>
                    <input
                      id="round-name"
                      type="text"
                      required
                      value={roundName}
                      onChange={(e) => setRoundName(e.target.value)}
                    />
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="primary">
                      Crear jornada
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingRoundStageId(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}

              {stage.rounds.length === 0 ? (
                <p className="text-muted">
                  No hay jornadas registradas en esta etapa.
                </p>
              ) : (
                stage.rounds.map((round) => {
                  const roundEvents = events.filter(
                    (ev) => ev.round.id === round.id,
                  );

                  return (
                    <div key={round.id} className="round-card">
                      <div className="round-header">
                        <h4 className="m-0">{round.name}</h4>
                        {canManage && schedulingRoundId !== round.id && (
                          <button
                            type="button"
                            className="primary text-sm"
                            onClick={() => setSchedulingRoundId(round.id)}
                          >
                            Programar partido
                          </button>
                        )}
                      </div>

                      {schedulingRoundId === round.id && (
                        <form
                          onSubmit={(e) => handleScheduleEvent(round.id, e)}
                          className="catalog-form mb-4 event-schedule-form"
                        >
                          <h5>Programar partido en {round.name}</h5>
                          <div className="form-grid">
                            <div className="form-group">
                              <label htmlFor="home-reg">Local</label>
                              <select
                                id="home-reg"
                                required
                                value={homeRegId}
                                onChange={(e) => setHomeRegId(e.target.value)}
                              >
                                <option value="">
                                  Seleccione participante local
                                </option>
                                {approvedRegistrations.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {getParticipantName(r)}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="form-group">
                              <label htmlFor="away-reg">Visitante</label>
                              <select
                                id="away-reg"
                                required
                                value={awayRegId}
                                onChange={(e) => setAwayRegId(e.target.value)}
                              >
                                <option value="">
                                  Seleccione participante visitante
                                </option>
                                {approvedRegistrations
                                  .filter((r) => r.id !== homeRegId)
                                  .map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {getParticipantName(r)}
                                    </option>
                                  ))}
                              </select>
                            </div>

                            <div className="form-group">
                              <label htmlFor="ev-venue">
                                Escenario deportivo
                              </label>
                              <select
                                id="ev-venue"
                                value={eventVenueId}
                                onChange={(e) =>
                                  setEventVenueId(e.target.value)
                                }
                              >
                                <option value="">Sin escenario asignado</option>
                                {venues.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="form-group">
                              <label htmlFor="ev-date">
                                Fecha y hora programada
                              </label>
                              <input
                                id="ev-date"
                                type="datetime-local"
                                value={eventDate}
                                onChange={(e) => setEventDate(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="form-actions">
                            <button type="submit" className="primary">
                              Guardar programación
                            </button>
                            <button
                              type="button"
                              onClick={() => setSchedulingRoundId(null)}
                            >
                              Cancelar
                            </button>
                          </div>
                        </form>
                      )}

                      {roundEvents.length === 0 ? (
                        <p className="m-0 text-sm text-muted">
                          No hay partidos programados en esta jornada.
                        </p>
                      ) : (
                        <table className="catalog-table">
                          <thead>
                            <tr>
                              <th scope="col">Encuentro</th>
                              <th scope="col">Fecha / Hora</th>
                              <th scope="col">Escenario</th>
                              <th scope="col">Estado</th>
                              {canManage && <th scope="col">Acciones</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {roundEvents.map((ev) => {
                              const home =
                                ev.participants.find(
                                  (p) => p.side === 'local',
                                ) ?? ev.participants[0];
                              const away =
                                ev.participants.find(
                                  (p) => p.side === 'visitante',
                                ) ?? ev.participants[1];

                              return (
                                <tr key={ev.id}>
                                  <td data-label="Encuentro">
                                    <strong>
                                      {home
                                        ? getParticipantName(home.registration)
                                        : 'Por definir'}
                                    </strong>
                                    {' vs '}
                                    <strong>
                                      {away
                                        ? getParticipantName(away.registration)
                                        : 'Por definir'}
                                    </strong>
                                  </td>
                                  <td data-label="Fecha / Hora">
                                    {ev.scheduledAt
                                      ? new Date(ev.scheduledAt).toLocaleString(
                                          'es-EC',
                                          {
                                            dateStyle: 'medium',
                                            timeStyle: 'short',
                                          },
                                        )
                                      : 'Por programar'}
                                    {ev.postponementReason && (
                                      <div className="text-xs text-warning">
                                        Motivo: {ev.postponementReason}
                                      </div>
                                    )}
                                  </td>
                                  <td data-label="Escenario">
                                    {ev.venue ? ev.venue.name : 'Por definir'}
                                  </td>
                                  <td data-label="Estado">
                                    <span
                                      className={`badge ${
                                        ev.status === 'en_curso'
                                          ? 'badge-ok'
                                          : ev.status === 'finalizado'
                                            ? 'badge-neutral'
                                            : ev.status === 'postergado'
                                              ? 'badge-warning'
                                              : ''
                                      }`}
                                    >
                                      {EVENT_STATUS_LABELS[ev.status]}
                                    </span>
                                  </td>
                                  {(canManage ||
                                    canSeeAssignments ||
                                    canReport ||
                                    permissions.includes('reports:read')) && (
                                    <td data-label="Acciones">
                                      {canSeeAssignments && (
                                        <button
                                          type="button"
                                          className="btn-action-sm"
                                          onClick={() =>
                                            setAssignmentsEvent(ev)
                                          }
                                        >
                                          Designaciones
                                        </button>
                                      )}
                                      {permissions.includes('reports:read') &&
                                        permissions.includes(
                                          'results:read',
                                        ) && (
                                          <a
                                            href={`/api/reports/events/${ev.id}/scoresheet`}
                                            className="btn-action-sm"
                                          >
                                            Acta PDF
                                          </a>
                                        )}
                                      {canReport && (
                                        <button
                                          type="button"
                                          className="btn-action-sm"
                                          onClick={() => setIncidentEvent(ev)}
                                        >
                                          Reportar incidencia
                                        </button>
                                      )}
                                      {canManage && (
                                        <>
                                          <button
                                            type="button"
                                            className="btn-action-sm"
                                            onClick={() =>
                                              setScoresheetEvent(ev)
                                            }
                                          >
                                            Acta / Resultado
                                          </button>
                                          <button
                                            type="button"
                                            className="btn-action-sm"
                                            onClick={() => {
                                              setReschedulingEvent(ev);
                                              setRescheduleVenueId(
                                                ev.venue?.id ?? '',
                                              );
                                              setRescheduleDate(
                                                ev.scheduledAt
                                                  ? new Date(ev.scheduledAt)
                                                      .toISOString()
                                                      .slice(0, 16)
                                                  : '',
                                              );
                                              setRescheduleReason('');
                                            }}
                                          >
                                            Reprogramar
                                          </button>
                                        </>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal de reprogramación */}
      {reschedulingEvent && (
        <Modal onClose={() => setReschedulingEvent(null)}>
          <div className="dialog-content">
            <h3>Reprogramar partido</h3>
            <p className="text-sm">
              Modifique la fecha, hora o escenario del partido. Debe justificar
              el motivo para fines de auditoría.
            </p>
            <form onSubmit={handleReschedule}>
              <div className="form-group">
                <label htmlFor="res-date">Nueva fecha y hora</label>
                <input
                  id="res-date"
                  type="datetime-local"
                  required
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="res-venue">Escenario deportivo</label>
                <select
                  id="res-venue"
                  value={rescheduleVenueId}
                  onChange={(e) => setRescheduleVenueId(e.target.value)}
                >
                  <option value="">Sin escenario</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="res-reason">
                  Motivo de reprogramación (obligatorio)
                </label>
                <textarea
                  id="res-reason"
                  required
                  rows={3}
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="Ej. Suspensión por clima, acuerdo formal entre clubes..."
                />
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => setReschedulingEvent(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="primary">
                  Confirmar reprogramación
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {assignmentsEvent && (
        <EventAssignmentsDialog
          eventId={assignmentsEvent.id}
          title={assignmentsEvent.participants
            .map((p) => getParticipantName(p.registration))
            .join(' vs ')}
          canManage={canAssign}
          onClose={() => setAssignmentsEvent(null)}
        />
      )}

      {incidentEvent && (
        <IncidentDialog
          eventId={incidentEvent.id}
          title={incidentEvent.participants
            .map((p) => getParticipantName(p.registration))
            .join(' vs ')}
          clubs={clubsOf(incidentEvent)}
          canListAthletes={permissions.includes('athletes:read')}
          onClose={() => setIncidentEvent(null)}
          onReported={() => {
            setIncidentEvent(null);
            setNotice({ type: 'success', text: 'Se reportó la incidencia.' });
          }}
        />
      )}

      {scoresheetEvent && (
        <MatchScoresheetDialog
          event={scoresheetEvent}
          permissions={permissions}
          onClose={() => setScoresheetEvent(null)}
          onSaved={() => {
            setScoresheetEvent(null);
            reloadAll();
          }}
        />
      )}
    </div>
  );
}
