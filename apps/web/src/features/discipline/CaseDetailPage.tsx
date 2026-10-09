import { type FormEvent, useState } from 'react';
import { ApiError, apiRequest } from '../../api/client.ts';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import {
  Notice,
  type NoticeState,
  describeError,
} from '../../components/Notice.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import {
  LoadState,
  SelectField,
  TextAreaField,
  TextField,
} from '../people/fields.tsx';
import type { Athlete, Club, Team } from '../people/types.ts';
import {
  CASE_STATUS_LABELS,
  type CaseDetail,
  COMPLAINT_STATUS_LABELS,
  ENTRY_KIND_LABELS,
  type Page,
  SANCTION_STATUS_LABELS,
  SANCTION_TYPE_LABELS,
} from './types.ts';

const dateTimeFmt = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const dateFmt = new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' });
const day = (iso: string) =>
  dateFmt.format(new Date(iso.slice(0, 10) + 'T12:00:00'));

type Confirm =
  | { kind: 'reopen' }
  | { kind: 'archive' }
  | { kind: 'unpublish' }
  | { kind: 'annul'; sanctionId: string; label: string };

/** Expediente disciplinario: datos, historial, vínculos, sanciones, resolución y publicación. */
export function CaseDetailPage({
  caseId,
  permissions,
}: {
  caseId: string;
  permissions: readonly string[];
}) {
  const can = (p: string) => permissions.includes(p);
  const [data, reload] = useFetch<CaseDetail>(`/cases/${caseId}`);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  async function act(
    path: string,
    body: Record<string, unknown> | undefined,
    success: string,
  ): Promise<boolean> {
    try {
      await apiRequest(path, { method: 'POST', body });
      setNotice({ type: 'success', text: success });
      reload();
      return true;
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
      return false;
    }
  }

  return (
    <section aria-labelledby="case-title" className="catalog">
      <p>
        <a href="#/disciplina">← Volver a disciplina</a>
      </p>
      <LoadState state={data} onRetry={reload} />
      {data.kind === 'ready' && (
        <CaseBody
          detail={data.data}
          can={can}
          notice={notice}
          onNotice={setNotice}
          act={act}
          reload={reload}
          onConfirm={setConfirm}
        />
      )}

      {confirm && data.kind === 'ready' && (
        <ConfirmDialog
          title={
            confirm.kind === 'reopen'
              ? 'Reabrir expediente'
              : confirm.kind === 'archive'
                ? 'Archivar expediente'
                : confirm.kind === 'unpublish'
                  ? 'Retirar publicación'
                  : 'Anular sanción'
          }
          description={
            confirm.kind === 'reopen'
              ? 'El expediente vuelve a revisión: se conserva la resolución anterior en el historial y se retira su publicación.'
              : confirm.kind === 'archive'
                ? 'Un expediente archivado no admite nuevas notas ni sanciones.'
                : confirm.kind === 'unpublish'
                  ? 'La resolución dejará de verse en el portal público.'
                  : `Se anulará la sanción: ${confirm.label}.`
          }
          confirmLabel={
            confirm.kind === 'reopen'
              ? 'Reabrir'
              : confirm.kind === 'archive'
                ? 'Archivar'
                : confirm.kind === 'unpublish'
                  ? 'Retirar'
                  : 'Anular sanción'
          }
          reason="required"
          danger={confirm.kind === 'annul'}
          onCancel={() => setConfirm(null)}
          onConfirm={async (reason) => {
            const c = confirm;
            setConfirm(null);
            if (c.kind === 'annul') {
              await act(
                `/sanctions/${c.sanctionId}/annul`,
                { reason },
                'Se anuló la sanción.',
              );
            } else {
              await act(
                `/cases/${caseId}/${c.kind}`,
                { reason },
                c.kind === 'reopen'
                  ? 'Se reabrió el expediente.'
                  : c.kind === 'archive'
                    ? 'Se archivó el expediente.'
                    : 'Se retiró la publicación.',
              );
            }
          }}
        />
      )}
    </section>
  );
}

function CaseBody({
  detail,
  can,
  notice,
  onNotice,
  act,
  reload,
  onConfirm,
}: {
  detail: CaseDetail;
  can: (p: string) => boolean;
  notice: NoticeState | null;
  onNotice: (n: NoticeState | null) => void;
  act: (
    path: string,
    body: Record<string, unknown> | undefined,
    success: string,
  ) => Promise<boolean>;
  reload: () => void;
  onConfirm: (c: Confirm) => void;
}) {
  const open = ['abierto', 'en_revision'].includes(detail.status);
  const resolved = detail.status === 'resuelto';
  const canSanction =
    can('sanctions:manage') &&
    ['en_revision', 'resuelto'].includes(detail.status);

  return (
    <>
      <div className="catalog-header">
        <h2 id="case-title">
          {detail.code}: {detail.subject}
        </h2>
        <span className={`badge ${resolved ? 'badge-ok' : ''}`}>
          {CASE_STATUS_LABELS[detail.status]}
        </span>
      </div>
      <Notice notice={notice} onClose={() => onNotice(null)} />

      <dl className="detail-list">
        <dt>Descripción</dt>
        <dd>{detail.description}</dd>
        <dt>Campeonato</dt>
        <dd>{detail.championship?.name ?? '—'}</dd>
        <dt>Abierto por</dt>
        <dd>
          {detail.openedBy} el {dateTimeFmt.format(new Date(detail.openedAt))}
        </dd>
        <dt>Revisor</dt>
        <dd>{detail.reviewer?.displayName ?? 'Sin asignar'}</dd>
        {detail.resolution && (
          <>
            <dt>Resolución</dt>
            <dd>
              {detail.resolution}
              <div className="hint">
                {detail.resolvedBy}
                {detail.resolvedAt
                  ? ` · ${dateTimeFmt.format(new Date(detail.resolvedAt))}`
                  : ''}
              </div>
            </dd>
          </>
        )}
        {detail.publication && (
          <>
            <dt>Publicación</dt>
            <dd>
              <strong>{detail.publication.publicTitle}</strong>
              <p>{detail.publication.publicSummary}</p>
              <div className="hint">
                Publicada por {detail.publication.publishedBy}
              </div>
            </dd>
          </>
        )}
      </dl>

      {can('cases:manage') && open && (
        <ReviewerForm caseId={detail.id} act={act} />
      )}

      {detail.incidents.length > 0 && (
        <>
          <h3>Incidencias vinculadas</h3>
          <ul className="plain-list">
            {detail.incidents.map((i) => (
              <li key={i.id}>
                <strong>{i.typeLabel}</strong>
                {i.athlete
                  ? ` — ${i.athlete}`
                  : i.club
                    ? ` — ${i.club}`
                    : ''}: {i.description}
              </li>
            ))}
          </ul>
        </>
      )}
      {detail.complaints.length > 0 && (
        <>
          <h3>Reclamos vinculados</h3>
          <ul className="plain-list">
            {detail.complaints.map((c) => (
              <li key={c.id}>
                <strong>{c.subject}</strong> ({c.club.name}) —{' '}
                {COMPLAINT_STATUS_LABELS[c.status]}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Sanciones</h3>
      {detail.sanctions.length === 0 ? (
        <p className="empty">Este expediente no tiene sanciones.</p>
      ) : (
        <table className="responsive-table">
          <caption className="visually-hidden">
            Sanciones del expediente
          </caption>
          <thead>
            <tr>
              <th scope="col">Sancionado</th>
              <th scope="col">Sanción</th>
              <th scope="col">Vigencia</th>
              <th scope="col">Estado</th>
              {can('sanctions:manage') && <th scope="col">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {detail.sanctions.map((s) => {
              const who = s.athlete ?? s.team?.name ?? s.club?.name ?? '';
              return (
                <tr key={s.id}>
                  <td data-label="Sancionado">{who}</td>
                  <td data-label="Sanción">
                    {s.typeLabel}
                    {s.matchesCount ? ` (${s.matchesCount} partidos)` : ''}
                    {s.points ? ` (${s.points} puntos)` : ''}
                    <div className="hint">{s.reason}</div>
                  </td>
                  <td data-label="Vigencia">
                    {day(s.startsAt)} —{' '}
                    {s.endsAt ? day(s.endsAt) : 'sin fecha final'}
                  </td>
                  <td data-label="Estado">
                    {s.isActive ? 'Rige hoy' : SANCTION_STATUS_LABELS[s.status]}
                    {s.statusReason && (
                      <div className="hint">{s.statusReason}</div>
                    )}
                  </td>
                  {can('sanctions:manage') && (
                    <td data-label="Acciones" className="row-actions">
                      {s.status === 'vigente' && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              void act(
                                `/sanctions/${s.id}/fulfill`,
                                undefined,
                                'Se marcó la sanción como cumplida.',
                              )
                            }
                          >
                            Marcar cumplida
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onConfirm({
                                kind: 'annul',
                                sanctionId: s.id,
                                label: `${s.typeLabel} a ${who}`,
                              })
                            }
                          >
                            Anular
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
      {canSanction && (
        <SanctionForm caseId={detail.id} onSaved={reload} onNotice={onNotice} />
      )}

      <h3>Historial</h3>
      <ol className="timeline">
        {detail.entries.map((e) => (
          <li key={e.id}>
            <strong>{ENTRY_KIND_LABELS[e.kind] ?? e.kind}</strong> · {e.author}{' '}
            · {dateTimeFmt.format(new Date(e.createdAt))}
            <p>{e.body}</p>
          </li>
        ))}
      </ol>
      {can('cases:manage') && detail.status !== 'archivado' && (
        <EntryForm caseId={detail.id} act={act} />
      )}

      {can('cases:resolve') && open && (
        <ResolveForm caseId={detail.id} act={act} />
      )}
      {can('cases:resolve') && resolved && (
        <div className="form-actions">
          <button type="button" onClick={() => onConfirm({ kind: 'reopen' })}>
            Reabrir expediente
          </button>
          <button type="button" onClick={() => onConfirm({ kind: 'archive' })}>
            Archivar expediente
          </button>
        </div>
      )}
      {can('cases:publish') && resolved && !detail.publication && (
        <PublishForm caseId={detail.id} act={act} />
      )}
      {can('cases:publish') && detail.publication && (
        <div className="form-actions">
          <button
            type="button"
            onClick={() => onConfirm({ kind: 'unpublish' })}
          >
            Retirar publicación
          </button>
        </div>
      )}
    </>
  );
}

function ReviewerForm({
  caseId,
  act,
}: {
  caseId: string;
  act: (p: string, b: Record<string, unknown>, s: string) => Promise<boolean>;
}) {
  const [reviewers] =
    useFetch<{ id: string; displayName: string }[]>('/cases/reviewers');
  const [reviewerId, setReviewerId] = useState('');
  return (
    <div className="catalog-form">
      <h4>Asignar revisor</h4>
      <SelectField
        label="Revisor"
        value={reviewerId}
        onChange={setReviewerId}
        placeholder="Seleccione un revisor"
        options={
          reviewers.kind === 'ready'
            ? reviewers.data.map((r) => ({ value: r.id, label: r.displayName }))
            : []
        }
      />
      <button
        type="button"
        disabled={!reviewerId}
        onClick={() =>
          void act(
            `/cases/${caseId}/reviewer`,
            { reviewerId },
            'Se asignó el revisor.',
          )
        }
      >
        Asignar revisor
      </button>
    </div>
  );
}

function EntryForm({
  caseId,
  act,
}: {
  caseId: string;
  act: (p: string, b: Record<string, unknown>, s: string) => Promise<boolean>;
}) {
  const [kind, setKind] = useState('nota');
  const [body, setBody] = useState('');
  return (
    <form
      className="catalog-form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await act(
            `/cases/${caseId}/entries`,
            { kind, body },
            'Se anexó la entrada.',
          )
        ) {
          setBody('');
        }
      }}
    >
      <h4>Anexar al historial</h4>
      <SelectField
        label="Tipo"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'nota', label: 'Nota' },
          { value: 'recurso', label: 'Recurso presentado' },
          { value: 'notificacion', label: 'Notificación a las partes' },
        ]}
      />
      <TextAreaField
        label="Texto"
        value={body}
        onChange={setBody}
        maxLength={4000}
        rows={3}
      />
      <button type="submit" disabled={body.trim().length < 3}>
        Anexar
      </button>
    </form>
  );
}

function ResolveForm({
  caseId,
  act,
}: {
  caseId: string;
  act: (p: string, b: Record<string, unknown>, s: string) => Promise<boolean>;
}) {
  const [resolution, setResolution] = useState('');
  return (
    <form
      className="catalog-form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        await act(
          `/cases/${caseId}/resolve`,
          { resolution: resolution.trim() },
          'Se resolvió el expediente.',
        );
      }}
    >
      <h4>Resolver expediente</h4>
      <p className="hint">
        Documente la decisión de la autoridad. El sistema no decide asuntos
        disciplinarios.
      </p>
      <TextAreaField
        label="Resolución"
        value={resolution}
        onChange={setResolution}
        maxLength={4000}
        rows={5}
      />
      <button
        type="submit"
        className="primary"
        disabled={resolution.trim().length < 10}
      >
        Resolver expediente
      </button>
    </form>
  );
}

function PublishForm({
  caseId,
  act,
}: {
  caseId: string;
  act: (p: string, b: Record<string, unknown>, s: string) => Promise<boolean>;
}) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  return (
    <form
      className="catalog-form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        await act(
          `/cases/${caseId}/publish`,
          { publicTitle: title.trim(), publicSummary: summary.trim() },
          'Se publicó la resolución.',
        );
      }}
    >
      <h4>Publicar en el portal</h4>
      <p className="hint">
        Redacte un texto para el público{' '}
        <strong>sin nombres de personas</strong> (menores incluidos). La
        publicación solo se ve si la Liga activó las resoluciones en la
        configuración institucional.
      </p>
      <TextField
        label="Título público"
        value={title}
        onChange={setTitle}
        maxLength={150}
      />
      <TextAreaField
        label="Resumen público"
        value={summary}
        onChange={setSummary}
        maxLength={2000}
        rows={4}
      />
      <button
        type="submit"
        disabled={title.trim().length < 5 || summary.trim().length < 20}
      >
        Publicar resolución
      </button>
    </form>
  );
}

function SanctionForm({
  caseId,
  onSaved,
  onNotice,
}: {
  caseId: string;
  onSaved: () => void;
  onNotice: (n: NoticeState) => void;
}) {
  const [subjectKind, setSubjectKind] = useState<'athlete' | 'team' | 'club'>(
    'athlete',
  );
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [championshipId, setChampionshipId] = useState('');
  const [type, setType] = useState('amonestacion');
  const [reason, setReason] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [matchesCount, setMatchesCount] = useState('');
  const [points, setPoints] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmed = search.trim();
  const [athletes] = useFetch<Page<Athlete>>(
    subjectKind === 'athlete' && trimmed.length >= 2
      ? `/athletes?q=${encodeURIComponent(trimmed)}&pageSize=10`
      : null,
  );
  const [teams] = useFetch<Page<Team>>(
    subjectKind === 'team' && trimmed.length >= 2
      ? `/teams?q=${encodeURIComponent(trimmed)}&pageSize=10`
      : null,
  );
  const [clubs] = useFetch<Page<Club>>(
    subjectKind === 'club' ? '/clubs?pageSize=100' : null,
  );
  const [champs] = useFetch<Page<{ id: string; name: string }>>(
    '/championships?pageSize=100',
  );

  const options =
    subjectKind === 'athlete' && athletes.kind === 'ready'
      ? athletes.data.items.map((a) => ({
          value: a.id,
          label: `${a.firstName} ${a.lastName} (${a.code}) — ${a.club.name}`,
        }))
      : subjectKind === 'team' && teams.kind === 'ready'
        ? teams.data.items.map((t) => ({
            value: t.id,
            label: `${t.name} — ${t.club.name}`,
          }))
        : subjectKind === 'club' && clubs.kind === 'ready'
          ? clubs.data.items.map((c) => ({ value: c.id, label: c.name }))
          : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errs: Record<string, string> = {};
    if (!subjectId) errs.subject = 'Seleccione a quién se sanciona.';
    if (reason.trim().length < 5)
      errs.reason = 'Indique el motivo (mínimo 5 caracteres).';
    if (!startsAt) errs.startsAt = 'Indique la fecha de inicio.';
    if (type === 'suspension_partidos' && !matchesCount)
      errs.matchesCount = 'Indique el número de partidos.';
    if (type === 'suspension_temporal' && !endsAt)
      errs.endsAt = 'Indique la fecha final.';
    if (
      type === 'descuento_puntos' &&
      (!points || !championshipId || subjectKind !== 'team')
    )
      errs.points = 'El descuento exige un equipo, un campeonato y los puntos.';
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    try {
      await apiRequest(`/cases/${caseId}/sanctions`, {
        method: 'POST',
        body: {
          athleteId: subjectKind === 'athlete' ? subjectId : null,
          teamId: subjectKind === 'team' ? subjectId : null,
          clubId: subjectKind === 'club' ? subjectId : null,
          championshipId: championshipId || null,
          type,
          reason: reason.trim(),
          startsAt,
          endsAt: endsAt || null,
          matchesCount:
            type === 'suspension_partidos' ? Number(matchesCount) : null,
          points: type === 'descuento_puntos' ? Number(points) : null,
        },
      });
      onNotice({ type: 'success', text: 'Se registró la sanción.' });
      setSubjectId('');
      setSearch('');
      setReason('');
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors)
        setErrors(err.fieldErrors);
      setFormError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="catalog-form" onSubmit={submit} noValidate>
      <h4>Registrar sanción</h4>
      <SelectField
        label="Se sanciona a"
        value={subjectKind}
        onChange={(v) => {
          setSubjectKind(v as typeof subjectKind);
          setSubjectId('');
          setSearch('');
        }}
        options={[
          { value: 'athlete', label: 'Un deportista' },
          { value: 'team', label: 'Un equipo' },
          { value: 'club', label: 'Un club' },
        ]}
      />
      {subjectKind !== 'club' && (
        <TextField
          label="Buscar (nombre o código, mínimo 2 letras)"
          value={search}
          onChange={setSearch}
          disabled={busy}
        />
      )}
      <SelectField
        label="Sancionado"
        value={subjectId}
        onChange={setSubjectId}
        placeholder="Seleccione"
        required
        error={errors.subject}
        options={options}
        disabled={busy}
      />
      <SelectField
        label="Campeonato al que aplica"
        value={championshipId}
        onChange={setChampionshipId}
        placeholder="Todas las competencias"
        options={
          champs.kind === 'ready'
            ? champs.data.items.map((c) => ({ value: c.id, label: c.name }))
            : []
        }
        disabled={busy}
      />
      <SelectField
        label="Tipo de sanción"
        value={type}
        onChange={setType}
        options={Object.entries(SANCTION_TYPE_LABELS).map(([value, label]) => ({
          value,
          label,
        }))}
        disabled={busy}
      />
      <TextAreaField
        label="Motivo"
        value={reason}
        onChange={setReason}
        required
        error={errors.reason}
        maxLength={1000}
        rows={3}
        disabled={busy}
      />
      <TextField
        label="Desde"
        type="date"
        value={startsAt}
        onChange={setStartsAt}
        required
        error={errors.startsAt}
        disabled={busy}
      />
      <TextField
        label="Hasta"
        type="date"
        value={endsAt}
        onChange={setEndsAt}
        error={errors.endsAt}
        hint="Opcional, salvo en la suspensión temporal."
        disabled={busy}
      />
      {type === 'suspension_partidos' && (
        <TextField
          label="Número de partidos"
          type="number"
          value={matchesCount}
          onChange={setMatchesCount}
          error={errors.matchesCount}
          disabled={busy}
        />
      )}
      {type === 'descuento_puntos' && (
        <TextField
          label="Puntos a descontar"
          type="number"
          value={points}
          onChange={setPoints}
          error={errors.points}
          hint="Se restan de la tabla del campeonato mientras la sanción esté vigente."
          disabled={busy}
        />
      )}
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <button type="submit" className="primary" disabled={busy}>
        {busy ? 'Registrando…' : 'Registrar sanción'}
      </button>
    </form>
  );
}
