import { type FormEvent, useState } from 'react';
import { ApiError, apiRequest } from '../../api/client.ts';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import {
  Notice,
  type NoticeState,
  describeError,
} from '../../components/Notice.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { SelectField, TextField } from './fields.tsx';
import {
  type Athlete,
  type CatalogItem,
  EDITABLE_SEASONS,
  type Page,
  type RosterEntry,
  type TeamDetail,
  type TeamSeason,
} from './types.ts';

interface Props {
  teamId: string;
  permissions: readonly string[];
}

export function TeamDetailPage({ teamId, permissions }: Props) {
  const canManage = permissions.includes('teams:manage');
  const [team, reload] = useFetch<TeamDetail>(`/teams/${teamId}`);
  const [selected, setSelected] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  // Al recargar se sigue mostrando el último dato (la plantilla abierta no se desmonta).
  const [cached, setCached] = useState<TeamDetail | null>(null);
  if (team.kind === 'ready' && cached !== team.data) setCached(team.data);
  const shown = team.kind === 'ready' ? team.data : cached;

  if (!shown && team.kind === 'loading')
    return <output className="loading">Cargando…</output>;
  if (!shown && team.kind === 'error') {
    return (
      <div className="state-error" role="alert">
        <p>{team.message}</p>
        <button type="button" onClick={reload}>
          Reintentar
        </button>{' '}
        <a href="#/equipos">Volver al listado</a>
      </div>
    );
  }
  const t = shown!;
  const current = t.seasons.find((s) => s.season.id === selected);

  return (
    <section aria-labelledby="team-title" className="catalog">
      <p>
        <a href="#/equipos">← Volver a equipos</a>
      </p>
      <div className="catalog-header">
        <h1 id="team-title">{t.name}</h1>
      </div>
      <p>
        {t.club.name} · {t.sport.name} ·{' '}
        {t.status === 'activo' ? 'Activo' : 'Inactivo'}
      </p>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      <h2>Temporadas</h2>
      {t.seasons.length === 0 && (
        <p className="empty">
          El equipo aún no está inscrito en ninguna temporada.
        </p>
      )}
      {t.seasons.length > 0 && (
        <table className="responsive-table">
          <caption className="visually-hidden">Temporadas del equipo</caption>
          <thead>
            <tr>
              <th scope="col">Temporada</th>
              <th scope="col">Nombre en la temporada</th>
              <th scope="col">Categoría</th>
              <th scope="col">Jugadores</th>
              <th scope="col">Plantilla</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {t.seasons.map((s) => (
              <tr key={s.id}>
                <td data-label="Temporada">{s.season.name}</td>
                <td data-label="Nombre en la temporada">{s.name}</td>
                <td data-label="Categoría">{s.category.name}</td>
                <td data-label="Jugadores">{s.activeMembers}</td>
                <td data-label="Plantilla">
                  {!EDITABLE_SEASONS.includes(s.season.status)
                    ? 'Historial'
                    : s.rosterClosed
                      ? 'Cerrada'
                      : 'Abierta'}
                </td>
                <td data-label="Acciones" className="row-actions">
                  <button
                    type="button"
                    aria-label={`Ver plantilla de ${s.season.name}`}
                    onClick={() => setSelected(s.season.id)}
                  >
                    Ver plantilla
                  </button>
                  {permissions.includes('credentials:issue') && (
                    <a href={`/api/reports/team-seasons/${s.id}/credentials`}>
                      Carnés (PDF)
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canManage && !enrolling && t.status === 'activo' && (
        <button type="button" onClick={() => setEnrolling(true)}>
          Inscribir en una temporada
        </button>
      )}
      {enrolling && (
        <EnrollForm
          team={t}
          onCancel={() => setEnrolling(false)}
          onEnrolled={(ts) => {
            setEnrolling(false);
            setSelected(ts.season.id);
            setNotice({
              type: 'success',
              text: `Se inscribió el equipo en ${ts.season.name}.`,
            });
            reload();
          }}
        />
      )}

      {current && (
        <RosterPanel
          key={current.id}
          team={t}
          teamSeason={current}
          permissions={permissions}
          onChanged={reload}
        />
      )}
    </section>
  );
}

function EnrollForm({
  team,
  onEnrolled,
  onCancel,
}: {
  team: TeamDetail;
  onEnrolled: (ts: TeamSeason) => void;
  onCancel: () => void;
}) {
  const [seasons] = useFetch<
    Page<CatalogItem & { startDate?: string; status: string }>
  >('/seasons?pageSize=100');
  const [categories] = useFetch<Page<CatalogItem>>('/categories?pageSize=100');
  const [seasonId, setSeasonId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const taken = new Set(team.seasons.map((s) => s.season.id));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found: Record<string, string> = {};
    if (!seasonId) found.seasonId = 'Seleccione la temporada.';
    if (!categoryId) found.categoryId = 'Seleccione la categoría.';
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setSubmitting(true);
    try {
      onEnrolled(
        await apiRequest<TeamSeason>(`/teams/${team.id}/seasons`, {
          method: 'POST',
          body: {
            seasonId,
            categoryId,
            ...(name.trim() && { name: name.trim() }),
          },
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
      aria-label="Inscribir en una temporada"
    >
      <h2>Inscribir en una temporada</h2>
      <SelectField
        label="Temporada"
        required
        value={seasonId}
        onChange={setSeasonId}
        placeholder="Seleccione…"
        error={errors.seasonId}
        disabled={submitting}
        options={
          seasons.kind === 'ready'
            ? seasons.data.items
                .filter(
                  (s) =>
                    EDITABLE_SEASONS.includes(s.status) && !taken.has(s.id),
                )
                .map((s) => ({ value: s.id, label: s.name }))
            : []
        }
      />
      <SelectField
        label="Categoría"
        required
        value={categoryId}
        onChange={setCategoryId}
        placeholder="Seleccione…"
        error={errors.categoryId}
        disabled={submitting}
        options={
          categories.kind === 'ready'
            ? categories.data.items
                .filter((c) => c.status === 'activo')
                .map((c) => ({ value: c.id, label: c.name }))
            : []
        }
      />
      <TextField
        label="Nombre en esta temporada (opcional)"
        value={name}
        onChange={setName}
        error={errors.name}
        maxLength={100}
        disabled={submitting}
        hint={`Si se deja vacío se usa «${team.name}».`}
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

type RosterPending =
  { kind: 'leave'; entry: RosterEntry } | { kind: 'annul'; entry: RosterEntry };

function RosterPanel({
  team,
  teamSeason,
  permissions,
  onChanged,
}: {
  team: TeamDetail;
  teamSeason: TeamSeason;
  permissions: readonly string[];
  onChanged: () => void;
}) {
  const can = (permission: string) => permissions.includes(permission);
  const editable = EDITABLE_SEASONS.includes(teamSeason.season.status);
  const base = `/teams/${team.id}/seasons/${teamSeason.season.id}`;
  const [roster, reloadRoster] = useFetch<RosterEntry[]>(`${base}/roster`);
  const [candidates] = useFetch<Page<Athlete>>(
    can('teams:manage') && can('athletes:read') && editable
      ? `/athletes?clubId=${team.club.id}&eligibility=habilitado&status=activo&pageSize=100`
      : null,
  );
  const [athleteId, setAthleteId] = useState('');
  const [jersey, setJersey] = useState('');
  const [pending, setPending] = useState<RosterPending | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = () => {
    reloadRoster();
    onChanged();
  };
  async function perform(operation: () => Promise<unknown>, success: string) {
    try {
      await operation();
      setNotice({ type: 'success', text: success });
      refresh();
    } catch (error) {
      setNotice({ type: 'error', text: describeError(error) });
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!athleteId || submitting) return;
    setSubmitting(true);
    await perform(
      () =>
        apiRequest(`${base}/roster`, {
          method: 'POST',
          body: {
            athleteId,
            ...(jersey.trim() && { jerseyNumber: Number(jersey) }),
          },
        }),
      'Se agregó al deportista a la plantilla.',
    );
    setAthleteId('');
    setJersey('');
    setSubmitting(false);
  }

  const inRoster = new Set(
    roster.kind === 'ready' ? roster.data.map((r) => r.athlete.id) : [],
  );

  return (
    <section aria-labelledby="roster-title">
      <h2 id="roster-title">
        Plantilla · {teamSeason.name} · {teamSeason.season.name} ·{' '}
        {teamSeason.category.name}
      </h2>
      {!editable && (
        <p className="hint">
          La temporada está cerrada: la plantilla es solo de consulta.
        </p>
      )}
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {can('teams:manage') && editable && (
        <button
          type="button"
          onClick={() =>
            void perform(
              () =>
                apiRequest(base, {
                  method: 'PATCH',
                  body: { rosterClosed: !teamSeason.rosterClosed },
                }),
              teamSeason.rosterClosed
                ? 'Se abrió la plantilla.'
                : 'Se cerró la plantilla.',
            )
          }
        >
          {teamSeason.rosterClosed ? 'Abrir plantilla' : 'Cerrar plantilla'}
        </button>
      )}

      {roster.kind === 'loading' && (
        <output className="loading">Cargando…</output>
      )}
      {roster.kind === 'error' && (
        <div className="state-error" role="alert">
          <p>{roster.message}</p>
          <button type="button" onClick={reloadRoster}>
            Reintentar
          </button>
        </div>
      )}
      {roster.kind === 'ready' && roster.data.length === 0 && (
        <p className="empty">La plantilla está vacía.</p>
      )}
      {roster.kind === 'ready' && roster.data.length > 0 && (
        <table className="responsive-table">
          <caption className="visually-hidden">Plantilla</caption>
          <thead>
            <tr>
              <th scope="col">N.º</th>
              <th scope="col">Código</th>
              <th scope="col">Deportista</th>
              <th scope="col">Estado</th>
              {editable && <th scope="col">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {roster.data.map((r) => {
              const name = `${r.athlete.firstName} ${r.athlete.lastName}`;
              return (
                <tr key={r.id}>
                  <td data-label="N.º">{r.jerseyNumber ?? '—'}</td>
                  <td data-label="Código">{r.athlete.code}</td>
                  <td data-label="Deportista">{name}</td>
                  <td data-label="Estado">
                    {r.status === 'activo'
                      ? 'Vigente'
                      : `Baja: ${r.leaveReason ?? ''}`}
                  </td>
                  {editable && (
                    <td data-label="Acciones" className="row-actions">
                      {can('teams:manage') && r.status === 'activo' && (
                        <button
                          type="button"
                          aria-label={`Dar de baja a ${name}`}
                          onClick={() =>
                            setPending({ kind: 'leave', entry: r })
                          }
                        >
                          Dar de baja
                        </button>
                      )}
                      {can('teams:delete') && (
                        <button
                          type="button"
                          aria-label={`Anular el alta de ${name}`}
                          onClick={() =>
                            setPending({ kind: 'annul', entry: r })
                          }
                        >
                          Anular alta
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

      {can('teams:manage') && editable && !teamSeason.rosterClosed && (
        <form
          className="catalog-form"
          onSubmit={add}
          aria-label="Agregar a la plantilla"
        >
          <h3>Agregar deportista</h3>
          <p className="hint">
            Solo deportistas habilitados del club. Un deportista no puede estar
            en dos equipos del mismo deporte en la misma temporada.
          </p>
          <SelectField
            label="Deportista"
            value={athleteId}
            onChange={setAthleteId}
            placeholder="Seleccione…"
            disabled={submitting}
            options={
              candidates.kind === 'ready'
                ? candidates.data.items
                    .filter((a) => !inRoster.has(a.id))
                    .map((a) => ({
                      value: a.id,
                      label: `${a.code} · ${a.lastName}, ${a.firstName}`,
                    }))
                : []
            }
          />
          <TextField
            label="Número de camiseta (opcional)"
            type="number"
            value={jersey}
            onChange={setJersey}
            disabled={submitting}
          />
          <div className="form-actions">
            <button
              type="submit"
              className="primary"
              disabled={!athleteId || submitting}
            >
              Agregar a la plantilla
            </button>
          </div>
        </form>
      )}

      {pending && (
        <ConfirmDialog
          title={pending.kind === 'leave' ? 'Dar de baja' : 'Anular el alta'}
          description={
            pending.kind === 'leave'
              ? 'La baja no libera el cupo del deporte en esta temporada: el cambio de equipo se habilita en la temporada siguiente.'
              : 'Se elimina el alta y se libera el cupo del deporte en esta temporada. Es una excepción administrativa y queda auditada.'
          }
          confirmLabel={
            pending.kind === 'leave' ? 'Dar de baja' : 'Anular alta'
          }
          danger={pending.kind === 'annul'}
          reason="required"
          onCancel={() => setPending(null)}
          onConfirm={async (reason) => {
            const p = pending;
            setPending(null);
            if (p.kind === 'leave')
              await perform(
                () =>
                  apiRequest(`${base}/roster/${p.entry.id}/leave`, {
                    method: 'POST',
                    body: { reason },
                  }),
                'Se registró la baja.',
              );
            else
              await perform(
                () =>
                  apiRequest(`${base}/roster/${p.entry.id}`, {
                    method: 'DELETE',
                    body: { reason },
                  }),
                'Se anuló el alta.',
              );
          }}
        />
      )}
    </section>
  );
}
