import { type FormEvent, useState } from 'react';
import { ApiError, apiRequest } from '../../api/client.ts';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import {
  Notice,
  type NoticeState,
  describeError,
} from '../../components/Notice.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { LoadState, SelectField, TextField } from '../people/fields.tsx';
import type { Page } from '../people/types.ts';
import {
  CHAMPIONSHIP_FORMAT_LABELS,
  CHAMPIONSHIP_STATUS_LABELS,
  REGISTRATION_STATUS_LABELS,
  type Championship,
  type ChampionshipStatus,
  type Registration,
  type RegistrationStatus,
} from './types.ts';
import { FixturesTab } from './FixturesTab.tsx';
import { StandingsTab } from './StandingsTab.tsx';

export function ChampionshipDetailPage({
  championshipId,
  permissions,
}: {
  championshipId: string;
  permissions: readonly string[];
}) {
  const canManage = permissions.includes('championships:manage');
  const canRegManage = permissions.includes('registrations:manage');

  const [activeTab, setActiveTab] = useState<
    'registrations' | 'fixtures' | 'standings' | 'rules'
  >('registrations');
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [transitioning, setTransitioning] = useState<ChampionshipStatus | null>(
    null,
  );
  const [addingRegistration, setAddingRegistration] = useState(false);
  const [reviewingReg, setReviewingReg] = useState<{
    id: string;
    status: RegistrationStatus;
    label: string;
  } | null>(null);

  const [champState, reloadChamp] = useFetch<Championship>(
    `/championships/${championshipId}`,
  );
  const [regsState, reloadRegs] = useFetch<Registration[]>(
    `/championships/${championshipId}/registrations`,
  );

  return (
    <section aria-labelledby="champ-detail-title" className="catalog">
      <nav className="breadcrumb" aria-label="Navegación">
        <a href="#/campeonatos">← Volver a campeonatos</a>
      </nav>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      <LoadState state={champState} onRetry={reloadChamp} />

      {champState.kind === 'ready' && (
        <>
          <div className="catalog-header">
            <div>
              <h1 id="champ-detail-title">{champState.data.name}</h1>
              <p className="hint">
                {champState.data.sport.name} · {champState.data.category.name} ·
                Temporada {champState.data.season.name}
              </p>
            </div>
            <span
              className={`badge ${
                champState.data.status === 'en_curso'
                  ? 'badge-ok'
                  : champState.data.status === 'inscripciones_abiertas'
                    ? 'badge-info'
                    : ''
              }`}
            >
              {CHAMPIONSHIP_STATUS_LABELS[champState.data.status]}
            </span>
          </div>

          <dl className="details">
            <dt>Modalidad</dt>
            <dd>{CHAMPIONSHIP_FORMAT_LABELS[champState.data.format]}</dd>
            <dt>Inscripciones</dt>
            <dd>
              {champState.data.registrationStart
                ? `${champState.data.registrationStart} al ${champState.data.registrationEnd ?? '—'}`
                : 'Sin fechas fijadas'}
            </dd>
            <dt>Fechas del torneo</dt>
            <dd>
              {champState.data.startDate
                ? `${champState.data.startDate} al ${champState.data.endDate ?? '—'}`
                : 'Sin fechas fijadas'}
            </dd>
            <dt>Reglamento activo</dt>
            <dd>Versión {champState.data.ruleVersions?.[0]?.version ?? 1}</dd>
          </dl>

          {canManage && champState.data.status !== 'archivado' && (
            <div className="form-actions">
              {champState.data.status === 'borrador' && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => setTransitioning('inscripciones_abiertas')}
                >
                  Abrir inscripciones
                </button>
              )}
              {champState.data.status === 'inscripciones_abiertas' && (
                <>
                  <button
                    type="button"
                    onClick={() => setTransitioning('inscripciones_cerradas')}
                  >
                    Cerrar inscripciones
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setTransitioning('en_curso')}
                  >
                    Iniciar campeonato
                  </button>
                </>
              )}
              {champState.data.status === 'inscripciones_cerradas' && (
                <>
                  <button
                    type="button"
                    onClick={() => setTransitioning('inscripciones_abiertas')}
                  >
                    Reabrir inscripciones
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setTransitioning('en_curso')}
                  >
                    Iniciar campeonato
                  </button>
                </>
              )}
              {champState.data.status === 'en_curso' && (
                <button
                  type="button"
                  onClick={() => setTransitioning('finalizado')}
                >
                  Finalizar campeonato
                </button>
              )}
              {champState.data.status === 'finalizado' && (
                <button
                  type="button"
                  onClick={() => setTransitioning('archivado')}
                >
                  Archivar campeonato
                </button>
              )}
            </div>
          )}

          <div className="tab-buttons" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'registrations'}
              className={activeTab === 'registrations' ? 'tab-active' : ''}
              onClick={() => setActiveTab('registrations')}
            >
              Inscripciones
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'fixtures'}
              className={activeTab === 'fixtures' ? 'tab-active' : ''}
              onClick={() => setActiveTab('fixtures')}
            >
              Calendario y partidos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'standings'}
              className={activeTab === 'standings' ? 'tab-active' : ''}
              onClick={() => setActiveTab('standings')}
            >
              Tabla de posiciones
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'rules'}
              className={activeTab === 'rules' ? 'tab-active' : ''}
              onClick={() => setActiveTab('rules')}
            >
              Reglamento y puntuación
            </button>
          </div>

          {activeTab === 'registrations' && (
            <div className="tab-panel">
              <div className="catalog-header">
                <h2>Participantes inscritos</h2>
                {canRegManage && !addingRegistration && (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setAddingRegistration(true)}
                  >
                    Inscribir participante
                  </button>
                )}
              </div>

              {addingRegistration && (
                <RegisterParticipantForm
                  championship={champState.data}
                  onCancel={() => setAddingRegistration(false)}
                  onSaved={() => {
                    setAddingRegistration(false);
                    setNotice({
                      type: 'success',
                      text: 'Participante inscrito con éxito.',
                    });
                    reloadRegs();
                  }}
                />
              )}

              <LoadState state={regsState} onRetry={reloadRegs} />

              {regsState.kind === 'ready' && regsState.data.length === 0 && (
                <p className="empty">No hay participantes inscritos aún.</p>
              )}

              {regsState.kind === 'ready' && regsState.data.length > 0 && (
                <table className="responsive-table">
                  <caption className="visually-hidden">Inscripciones</caption>
                  <thead>
                    <tr>
                      <th scope="col">Participante</th>
                      <th scope="col">Tipo</th>
                      <th scope="col">Club</th>
                      <th scope="col">Fecha de registro</th>
                      <th scope="col">Estado</th>
                      {canRegManage && <th scope="col">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {regsState.data.map((r) => {
                      const isTeam = r.participant.kind === 'equipo';
                      const name = isTeam
                        ? (r.participant.team?.team.name ?? 'Equipo')
                        : `${r.participant.individual?.athlete.person.firstName ?? ''} ${r.participant.individual?.athlete.person.lastName ?? ''}`;
                      const clubName = isTeam
                        ? r.participant.team?.team.club.name
                        : r.participant.individual?.athlete.club.name;

                      return (
                        <tr key={r.id}>
                          <td data-label="Participante">
                            <strong>{name}</strong>
                            {r.notes && <p className="hint">{r.notes}</p>}
                          </td>
                          <td data-label="Tipo">
                            {isTeam ? 'Equipo' : 'Individual'}
                          </td>
                          <td data-label="Club">{clubName ?? '—'}</td>
                          <td data-label="Fecha de registro">
                            {new Date(r.submittedAt).toLocaleDateString()}
                          </td>
                          <td data-label="Estado">
                            <span
                              className={`badge ${
                                r.status === 'aprobada'
                                  ? 'badge-ok'
                                  : r.status === 'observada'
                                    ? 'badge-alert'
                                    : ''
                              }`}
                            >
                              {REGISTRATION_STATUS_LABELS[r.status]}
                            </span>
                          </td>
                          {canRegManage && (
                            <td data-label="Acciones" className="row-actions">
                              {r.status !== 'aprobada' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReviewingReg({
                                      id: r.id,
                                      status: 'aprobada',
                                      label: name,
                                    })
                                  }
                                >
                                  Aprobar
                                </button>
                              )}
                              {r.status !== 'observada' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReviewingReg({
                                      id: r.id,
                                      status: 'observada',
                                      label: name,
                                    })
                                  }
                                >
                                  Observar
                                </button>
                              )}
                              {r.status !== 'rechazada' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReviewingReg({
                                      id: r.id,
                                      status: 'rechazada',
                                      label: name,
                                    })
                                  }
                                >
                                  Rechazar
                                </button>
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
          )}

          {activeTab === 'fixtures' && (
            <FixturesTab
              championship={champState.data}
              registrations={regsState.kind === 'ready' ? regsState.data : []}
              permissions={permissions}
            />
          )}

          {activeTab === 'standings' && (
            <StandingsTab championship={champState.data} />
          )}

          {activeTab === 'rules' && (
            <div className="tab-panel">
              <h2>Reglamento de competencia</h2>
              <p className="hint">
                Las reglas se encuentran versionadas y quedan asociadas al
                historial de partidos y tablas de posiciones.
              </p>

              {champState.data.ruleVersions &&
                champState.data.ruleVersions.length > 0 && (
                  <div className="rules-display">
                    {champState.data.ruleVersions.map((rv) => (
                      <div key={rv.id} className="rule-card">
                        <h3>
                          Versión {rv.version}{' '}
                          {rv.version ===
                            champState.data.ruleVersions?.[0]?.version && (
                            <span className="badge badge-ok">Vigente</span>
                          )}
                        </h3>
                        <p className="hint">
                          Aprobado por:{' '}
                          {rv.approvedBy?.displayName ?? 'Oficial'} el{' '}
                          {rv.approvedAt
                            ? new Date(rv.approvedAt).toLocaleDateString()
                            : '—'}
                        </p>
                        <pre className="rules-json">
                          {JSON.stringify(rv.rulesJson, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}

          {transitioning && (
            <ConfirmDialog
              title={`Cambiar estado a «${CHAMPIONSHIP_STATUS_LABELS[transitioning]}»`}
              description={`Confirme el cambio de estado del campeonato ${champState.data.name}.`}
              confirmLabel="Confirmar cambio"
              reason="required"
              onCancel={() => setTransitioning(null)}
              onConfirm={async (reason) => {
                const targetStatus = transitioning;
                setTransitioning(null);
                try {
                  await apiRequest(
                    `/championships/${champState.data.id}/status`,
                    {
                      method: 'PATCH',
                      body: { status: targetStatus, reason },
                    },
                  );
                  setNotice({
                    type: 'success',
                    text: `Estado actualizado a «${CHAMPIONSHIP_STATUS_LABELS[targetStatus]}».`,
                  });
                  reloadChamp();
                } catch (err) {
                  setNotice({ type: 'error', text: describeError(err) });
                }
              }}
            />
          )}

          {reviewingReg && (
            <ConfirmDialog
              title={`Marcar inscripción como «${REGISTRATION_STATUS_LABELS[reviewingReg.status]}»`}
              description={`Participante: ${reviewingReg.label}`}
              confirmLabel="Confirmar"
              reason="optional"
              onCancel={() => setReviewingReg(null)}
              onConfirm={async (reason) => {
                const target = reviewingReg;
                setReviewingReg(null);
                try {
                  await apiRequest(
                    `/championships/${champState.data.id}/registrations/${target.id}/status`,
                    {
                      method: 'PATCH',
                      body: {
                        status: target.status,
                        reviewNotes: reason || undefined,
                      },
                    },
                  );
                  setNotice({
                    type: 'success',
                    text: `Inscripción marcada como «${REGISTRATION_STATUS_LABELS[target.status]}».`,
                  });
                  reloadRegs();
                } catch (err) {
                  setNotice({ type: 'error', text: describeError(err) });
                }
              }}
            />
          )}
        </>
      )}
    </section>
  );
}

function RegisterParticipantForm({
  championship,
  onCancel,
  onSaved,
}: {
  championship: Championship;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isIndividualSport =
    championship.sport.code === 'ajedrez' ||
    championship.sport.code === 'taekwondo';

  const [kind] = useState<'equipo' | 'individual'>(
    isIndividualSport ? 'individual' : 'equipo',
  );
  const [teamId, setTeamId] = useState('');
  const [athleteId, setAthleteId] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [teams] = useFetch<
    Page<{ id: string; name: string; club: { name: string }; sportId: string }>
  >(`/teams?sportId=${championship.sport.id}&pageSize=100`);
  const [athletes] = useFetch<
    Page<{
      id: string;
      person: { firstName: string; lastName: string };
      club: { name: string };
    }>
  >('/athletes?pageSize=100');

  const teamOptions =
    teams.kind === 'ready'
      ? teams.data.items.map((t) => ({
          value: t.id,
          label: `${t.name} (${t.club.name})`,
        }))
      : [];

  const athleteOptions =
    athletes.kind === 'ready'
      ? athletes.data.items.map((a) => ({
          value: a.id,
          label: `${a.person.firstName} ${a.person.lastName} (${a.club.name})`,
        }))
      : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const errs: Record<string, string> = {};
    if (kind === 'equipo' && !teamId) errs.teamId = 'Seleccione el equipo.';
    if (kind === 'individual' && !athleteId)
      errs.athleteId = 'Seleccione el deportista.';
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      await apiRequest(`/championships/${championship.id}/registrations`, {
        method: 'POST',
        body: {
          kind,
          ...(kind === 'equipo' ? { teamId } : { athleteId }),
          ...(notes.trim() && { notes: notes.trim() }),
        },
      });
      onSaved();
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
      <h3>Inscribir {kind === 'equipo' ? 'equipo' : 'deportista'}</h3>
      {kind === 'equipo' ? (
        <SelectField
          label="Equipo"
          value={teamId}
          onChange={setTeamId}
          required
          error={errors.teamId}
          placeholder="Seleccione el equipo…"
          options={teamOptions}
          disabled={submitting}
        />
      ) : (
        <SelectField
          label="Deportista"
          value={athleteId}
          onChange={setAthleteId}
          required
          error={errors.athleteId}
          placeholder="Seleccione el deportista…"
          options={athleteOptions}
          disabled={submitting}
        />
      )}
      <TextField
        label="Observaciones o notas de inscripción"
        value={notes}
        onChange={setNotes}
        maxLength={500}
        disabled={submitting}
      />
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Inscribiendo…' : 'Inscribir'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
