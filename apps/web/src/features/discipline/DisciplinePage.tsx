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
import {
  CheckboxField,
  LoadState,
  SelectField,
  TextAreaField,
  TextField,
} from '../people/fields.tsx';
import type { Club } from '../people/types.ts';
import {
  CASE_STATUS_LABELS,
  type CaseListItem,
  type CasePrefill,
  COMPLAINT_STATUS_LABELS,
  type ComplaintDetail,
  type ComplaintItem,
  type IncidentItem,
  type Page,
  SANCTION_STATUS_LABELS,
  type SanctionItem,
} from './types.ts';

type TabId = 'incidencias' | 'reclamos' | 'expedientes' | 'sanciones';

const dateFmt = new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' });
const dateTimeFmt = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const day = (iso: string) =>
  dateFmt.format(new Date(iso.slice(0, 10) + 'T12:00:00'));

/** Disciplina: incidencias, reclamos, expedientes y sanciones, según los permisos del usuario. */
export function DisciplinePage({
  permissions,
}: {
  permissions: readonly string[];
}) {
  const can = (p: string) => permissions.includes(p);
  const tabs: { id: TabId; label: string; allowed: boolean }[] = [
    { id: 'incidencias', label: 'Incidencias', allowed: can('incidents:read') },
    { id: 'reclamos', label: 'Reclamos', allowed: can('complaints:read') },
    { id: 'expedientes', label: 'Expedientes', allowed: can('cases:read') },
    { id: 'sanciones', label: 'Sanciones', allowed: can('sanctions:read') },
  ];
  const visible = tabs.filter((t) => t.allowed);
  const [tab, setTab] = useState<TabId | null>(null);
  const [prefill, setPrefill] = useState<CasePrefill | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const active = visible.find((t) => t.id === tab) ?? visible[0];

  function openCaseFrom(data: CasePrefill) {
    setPrefill(data);
    setTab('expedientes');
  }

  return (
    <section aria-labelledby="discipline-title" className="catalog">
      <div className="catalog-header">
        <h2 id="discipline-title">Disciplina</h2>
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />
      {visible.length === 0 ? (
        <p className="empty">Su cuenta no tiene acceso a esta sección.</p>
      ) : (
        <>
          <div role="tablist" aria-label="Disciplina" className="tabs">
            {visible.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={active?.id === t.id}
                aria-controls={`panel-${t.id}`}
                className={active?.id === t.id ? 'tab active' : 'tab'}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`panel-${active?.id}`}
            aria-labelledby={`tab-${active?.id}`}
          >
            {active?.id === 'incidencias' && (
              <IncidentsTab
                canOpenCase={can('cases:manage')}
                onOpenCase={openCaseFrom}
              />
            )}
            {active?.id === 'reclamos' && (
              <ComplaintsTab
                canSubmit={can('complaints:submit')}
                canManage={can('cases:manage')}
                onOpenCase={openCaseFrom}
                onNotice={setNotice}
              />
            )}
            {active?.id === 'expedientes' && (
              <CasesTab
                canManage={can('cases:manage')}
                prefill={prefill}
                onClearPrefill={() => setPrefill(null)}
                onNotice={setNotice}
              />
            )}
            {active?.id === 'sanciones' && <SanctionsTab />}
          </div>
        </>
      )}
    </section>
  );
}

// ───────────────────── Incidencias ─────────────────────

function IncidentsTab({
  canOpenCase,
  onOpenCase,
}: {
  canOpenCase: boolean;
  onOpenCase: (data: CasePrefill) => void;
}) {
  const [page, setPage] = useState(1);
  const [unlinked, setUnlinked] = useState(false);
  const query = new URLSearchParams({
    page: String(page),
    pageSize: '20',
    ...(unlinked && { unlinked: 'true' }),
  });
  const [list, reload] = useFetch<Page<IncidentItem>>(
    `/incidents?${query.toString()}`,
  );
  return (
    <>
      <div className="filters">
        <CheckboxField
          label="Solo incidencias sin expediente"
          checked={unlinked}
          onChange={(v) => {
            setUnlinked(v);
            setPage(1);
          }}
        />
      </div>
      <LoadState state={list} onRetry={reload} />
      {list.kind === 'ready' && list.data.items.length === 0 && (
        <p className="empty">No hay incidencias registradas.</p>
      )}
      {list.kind === 'ready' && list.data.items.length > 0 && (
        <>
          <table className="responsive-table">
            <caption className="visually-hidden">
              Incidencias reportadas
            </caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Partido</th>
                <th scope="col">Tipo</th>
                <th scope="col">Involucrado</th>
                <th scope="col">Descripción</th>
                <th scope="col">Expediente</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((i) => (
                <tr key={i.id}>
                  <td data-label="Fecha">
                    {dateTimeFmt.format(new Date(i.createdAt))}
                    <div className="hint">Reportó: {i.reportedBy}</div>
                  </td>
                  <td data-label="Partido">
                    {i.event.match}
                    <div className="hint">{i.championship.name}</div>
                  </td>
                  <td data-label="Tipo">{i.typeLabel}</td>
                  <td data-label="Involucrado">
                    {i.athlete?.name ?? i.club?.name ?? '—'}
                  </td>
                  <td data-label="Descripción">{i.description}</td>
                  <td data-label="Expediente">
                    {i.caseId ? (
                      <a href={`#/disciplina/${i.caseId}`}>Ver expediente</a>
                    ) : canOpenCase ? (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenCase({
                            subject: `${i.typeLabel}: ${i.event.match}`,
                            description: i.description,
                            championshipId: i.championship.id,
                            eventId: i.event.id,
                            incidentIds: [i.id],
                          })
                        }
                      >
                        Abrir expediente
                      </button>
                    ) : (
                      'Sin expediente'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onChange={setPage}
          />
        </>
      )}
    </>
  );
}

// ───────────────────── Reclamos ─────────────────────

function ComplaintsTab({
  canSubmit,
  canManage,
  onOpenCase,
  onNotice,
}: {
  canSubmit: boolean;
  canManage: boolean;
  onOpenCase: (data: CasePrefill) => void;
  onNotice: (n: NoticeState) => void;
}) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<ComplaintItem | null>(null);
  const query = new URLSearchParams({
    page: String(page),
    pageSize: '20',
    ...(status && { status }),
  });
  const [list, reload] = useFetch<Page<ComplaintItem>>(
    `/complaints?${query.toString()}`,
  );

  return (
    <>
      {canSubmit && !creating && (
        <p>
          <button
            type="button"
            className="primary"
            onClick={() => setCreating(true)}
          >
            Nuevo reclamo
          </button>
        </p>
      )}
      {creating && (
        <ComplaintForm
          onCancel={() => setCreating(false)}
          onSaved={(c) => {
            setCreating(false);
            onNotice({
              type: 'success',
              text: `Se presentó el reclamo «${c.subject}». Puede adjuntar evidencia desde su detalle.`,
            });
            setOpenId(c.id);
            reload();
          }}
        />
      )}
      <div className="filters">
        <SelectField
          label="Estado"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          placeholder="Todos los estados"
          options={Object.entries(COMPLAINT_STATUS_LABELS).map(
            ([value, label]) => ({ value, label }),
          )}
        />
      </div>
      <LoadState state={list} onRetry={reload} />
      {list.kind === 'ready' && list.data.items.length === 0 && (
        <p className="empty">No hay reclamos.</p>
      )}
      {list.kind === 'ready' && list.data.items.length > 0 && (
        <>
          <table className="responsive-table">
            <caption className="visually-hidden">Reclamos</caption>
            <thead>
              <tr>
                <th scope="col">Asunto</th>
                <th scope="col">Club</th>
                <th scope="col">Campeonato</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((c) => (
                <tr key={c.id}>
                  <td data-label="Asunto">
                    <strong>{c.subject}</strong>
                    <div className="hint">
                      {dateFmt.format(new Date(c.submittedAt))} ·{' '}
                      {c.attachmentCount} adjunto(s)
                    </div>
                  </td>
                  <td data-label="Club">{c.club.name}</td>
                  <td data-label="Campeonato">{c.championship.name}</td>
                  <td data-label="Estado">
                    {COMPLAINT_STATUS_LABELS[c.status] ?? c.status}
                    {c.case && (
                      <div>
                        <a href={`#/disciplina/${c.case.id}`}>{c.case.code}</a>
                      </div>
                    )}
                  </td>
                  <td data-label="Acciones" className="row-actions">
                    <button type="button" onClick={() => setOpenId(c.id)}>
                      Ver detalle
                    </button>
                    {canManage && c.status === 'recibido' && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            onOpenCase({
                              subject: c.subject,
                              description: c.description,
                              championshipId: c.championship.id,
                              eventId: c.eventId ?? undefined,
                              complaintIds: [c.id],
                            })
                          }
                        >
                          Abrir expediente
                        </button>
                        <button type="button" onClick={() => setDismissing(c)}>
                          Desestimar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onChange={setPage}
          />
        </>
      )}

      {openId && (
        <ComplaintDialog
          complaintId={openId}
          canAttach={canSubmit}
          onClose={() => {
            setOpenId(null);
            reload();
          }}
        />
      )}
      {dismissing && (
        <ConfirmDialog
          title="Desestimar reclamo"
          description={`¿Desestimar el reclamo «${dismissing.subject}»? Se le avisará al club con el motivo.`}
          confirmLabel="Desestimar reclamo"
          reason="required"
          onCancel={() => setDismissing(null)}
          onConfirm={async (reason) => {
            const c = dismissing;
            setDismissing(null);
            try {
              await apiRequest(`/complaints/${c.id}/dismiss`, {
                method: 'POST',
                body: { reason },
              });
              onNotice({ type: 'success', text: 'Se desestimó el reclamo.' });
              reload();
            } catch (err) {
              onNotice({ type: 'error', text: describeError(err) });
            }
          }}
        />
      )}
    </>
  );
}

function ComplaintForm({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: (c: ComplaintItem) => void;
}) {
  const [clubs] = useFetch<Page<Club>>('/clubs?pageSize=100');
  const [champs] = useFetch<Page<{ id: string; name: string }>>(
    '/championships?pageSize=100',
  );
  const [clubId, setClubId] = useState('');
  const [championshipId, setChampionshipId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const errs: Record<string, string> = {};
    if (!clubId) errs.clubId = 'Seleccione el club que reclama.';
    if (!championshipId) errs.championshipId = 'Seleccione el campeonato.';
    if (subject.trim().length < 5)
      errs.subject = 'Describa el asunto (mínimo 5 caracteres).';
    if (description.trim().length < 10)
      errs.description = 'Detalle el hecho (mínimo 10 caracteres).';
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) return;
    setSubmitting(true);
    try {
      onSaved(
        await apiRequest<ComplaintItem>('/complaints', {
          method: 'POST',
          body: {
            clubId,
            championshipId,
            subject: subject.trim(),
            description: description.trim(),
          },
        }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors)
        setErrors(err.fieldErrors);
      setFormError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="catalog-form" onSubmit={submit} noValidate>
      <h3>Nuevo reclamo</h3>
      <SelectField
        label="Club que reclama"
        value={clubId}
        onChange={setClubId}
        placeholder="Seleccione un club"
        required
        error={errors.clubId}
        options={
          clubs.kind === 'ready'
            ? clubs.data.items.map((c) => ({ value: c.id, label: c.name }))
            : []
        }
        disabled={submitting}
      />
      <SelectField
        label="Campeonato"
        value={championshipId}
        onChange={setChampionshipId}
        placeholder="Seleccione un campeonato"
        required
        error={errors.championshipId}
        options={
          champs.kind === 'ready'
            ? champs.data.items.map((c) => ({ value: c.id, label: c.name }))
            : []
        }
        disabled={submitting}
      />
      <TextField
        label="Asunto"
        value={subject}
        onChange={setSubject}
        required
        error={errors.subject}
        maxLength={200}
        disabled={submitting}
      />
      <TextAreaField
        label="Descripción de los hechos"
        value={description}
        onChange={setDescription}
        required
        error={errors.description}
        maxLength={4000}
        rows={6}
        disabled={submitting}
      />
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Enviando…' : 'Presentar reclamo'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ComplaintDialog({
  complaintId,
  canAttach,
  onClose,
}: {
  complaintId: string;
  canAttach: boolean;
  onClose: () => void;
}) {
  const [detail, reload] = useFetch<ComplaintDetail>(
    `/complaints/${complaintId}`,
  );
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function attach(e: FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) {
      setError('Indique un título y elija un archivo.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('title', title.trim());
      body.append('file', file);
      await apiRequest(`/complaints/${complaintId}/attachments`, {
        method: 'POST',
        body,
      });
      setTitle('');
      setFile(null);
      reload();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const closed =
    detail.kind === 'ready' &&
    ['resuelto', 'desestimado'].includes(detail.data.status);

  return (
    <dialog open className="dialog-backdrop" aria-modal="true">
      <div className="dialog-content">
        <LoadState state={detail} onRetry={reload} />
        {detail.kind === 'ready' && (
          <>
            <h4>{detail.data.subject}</h4>
            <p className="hint">
              {detail.data.club.name} · {detail.data.championship.name} ·{' '}
              {COMPLAINT_STATUS_LABELS[detail.data.status]}
            </p>
            <p>{detail.data.description}</p>
            {detail.data.dismissReason && (
              <p>
                <strong>Motivo de la desestimación:</strong>{' '}
                {detail.data.dismissReason}
              </p>
            )}
            <h5>Adjuntos</h5>
            {detail.data.attachments.length === 0 ? (
              <p className="empty">Sin adjuntos.</p>
            ) : (
              <ul className="plain-list">
                {detail.data.attachments.map((a) => (
                  <li key={a.id}>
                    <a
                      href={`/api/complaints/${complaintId}/attachments/${a.id}/file`}
                    >
                      {a.title}
                    </a>{' '}
                    <span className="hint">
                      ({Math.max(1, Math.round(a.sizeBytes / 1024))} KB)
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canAttach && !closed && (
              <form onSubmit={attach} noValidate>
                <TextField
                  label="Título del adjunto"
                  value={title}
                  onChange={setTitle}
                  maxLength={150}
                  disabled={busy}
                />
                <div className="field">
                  <label htmlFor="attachment-file">
                    Archivo (PDF o imagen, máx. 10 MB)
                  </label>
                  <input
                    id="attachment-file"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    disabled={busy}
                  />
                </div>
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <button type="submit" disabled={busy}>
                  Adjuntar
                </button>
              </form>
            )}
          </>
        )}
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  );
}

// ───────────────────── Expedientes ─────────────────────

function CasesTab({
  canManage,
  prefill,
  onClearPrefill,
  onNotice,
}: {
  canManage: boolean;
  prefill: CasePrefill | null;
  onClearPrefill: () => void;
  onNotice: (n: NoticeState) => void;
}) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const query = new URLSearchParams({
    page: String(page),
    pageSize: '20',
    ...(q && { q }),
    ...(status && { status }),
  });
  const [list, reload] = useFetch<Page<CaseListItem>>(
    `/cases?${query.toString()}`,
  );
  const showForm = canManage && (creating || prefill !== null);

  return (
    <>
      {canManage && !showForm && (
        <p>
          <button
            type="button"
            className="primary"
            onClick={() => setCreating(true)}
          >
            Nuevo expediente
          </button>
        </p>
      )}
      {showForm && (
        <CaseForm
          prefill={prefill}
          onCancel={() => {
            setCreating(false);
            onClearPrefill();
          }}
          onSaved={(created) => {
            setCreating(false);
            onClearPrefill();
            onNotice({
              type: 'success',
              text: `Se abrió el expediente ${created.code}.`,
            });
            window.location.hash = `#/disciplina/${created.id}`;
            reload();
          }}
        />
      )}
      <div className="filters">
        <TextField
          label="Buscar expediente"
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          hint="Asunto o código (EXP-000123)"
        />
        <SelectField
          label="Estado"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          placeholder="Todos los estados"
          options={Object.entries(CASE_STATUS_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </div>
      <LoadState state={list} onRetry={reload} />
      {list.kind === 'ready' && list.data.items.length === 0 && (
        <p className="empty">No hay expedientes.</p>
      )}
      {list.kind === 'ready' && list.data.items.length > 0 && (
        <>
          <table className="responsive-table">
            <caption className="visually-hidden">Expedientes</caption>
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Asunto</th>
                <th scope="col">Estado</th>
                <th scope="col">Revisor</th>
                <th scope="col">Vínculos</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((c) => (
                <tr key={c.id}>
                  <td data-label="Código">
                    <a href={`#/disciplina/${c.id}`}>{c.code}</a>
                  </td>
                  <td data-label="Asunto">
                    {c.subject}
                    <div className="hint">
                      {c.championship?.name ?? 'Sin campeonato'} · abierto el{' '}
                      {dateFmt.format(new Date(c.openedAt))}
                    </div>
                  </td>
                  <td data-label="Estado">
                    {CASE_STATUS_LABELS[c.status] ?? c.status}
                    {c.publishedAt && <div className="hint">Publicado</div>}
                  </td>
                  <td data-label="Revisor">{c.reviewer?.displayName ?? '—'}</td>
                  <td data-label="Vínculos">
                    {c.counts.incidents} inc. · {c.counts.complaints} rec. ·{' '}
                    {c.counts.sanctions} san.
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onChange={setPage}
          />
        </>
      )}
    </>
  );
}

function CaseForm({
  prefill,
  onCancel,
  onSaved,
}: {
  prefill: CasePrefill | null;
  onCancel: () => void;
  onSaved: (created: { id: string; code: string }) => void;
}) {
  const [subject, setSubject] = useState(prefill?.subject ?? '');
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const errs: Record<string, string> = {};
    if (subject.trim().length < 5)
      errs.subject = 'El asunto necesita al menos 5 caracteres.';
    if (description.trim().length < 10)
      errs.description = 'La descripción necesita al menos 10 caracteres.';
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) return;
    setSubmitting(true);
    try {
      onSaved(
        await apiRequest<{ id: string; code: string }>('/cases', {
          method: 'POST',
          body: {
            subject: subject.trim(),
            description: description.trim(),
            championshipId: prefill?.championshipId,
            eventId: prefill?.eventId,
            incidentIds: prefill?.incidentIds,
            complaintIds: prefill?.complaintIds,
          },
        }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors)
        setErrors(err.fieldErrors);
      setFormError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const links = [
    prefill?.incidentIds?.length
      ? `${prefill.incidentIds.length} incidencia(s)`
      : null,
    prefill?.complaintIds?.length
      ? `${prefill.complaintIds.length} reclamo(s)`
      : null,
  ].filter(Boolean);

  return (
    <form className="catalog-form" onSubmit={submit} noValidate>
      <h3>Nuevo expediente disciplinario</h3>
      {links.length > 0 && (
        <p className="hint">Se vincularán: {links.join(' y ')}.</p>
      )}
      <TextField
        label="Asunto"
        value={subject}
        onChange={setSubject}
        required
        error={errors.subject}
        maxLength={200}
        disabled={submitting}
      />
      <TextAreaField
        label="Descripción"
        value={description}
        onChange={setDescription}
        required
        error={errors.description}
        maxLength={4000}
        rows={6}
        disabled={submitting}
      />
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Abriendo…' : 'Abrir expediente'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ───────────────────── Sanciones ─────────────────────

function SanctionsTab() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);
  const query = new URLSearchParams({
    page: String(page),
    pageSize: '20',
    ...(status && { status }),
    ...(onlyActive && { active: 'true' }),
  });
  const [list, reload] = useFetch<Page<SanctionItem>>(
    `/sanctions?${query.toString()}`,
  );
  return (
    <>
      <div className="filters">
        <SelectField
          label="Estado"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          placeholder="Todos los estados"
          options={Object.entries(SANCTION_STATUS_LABELS).map(
            ([value, label]) => ({ value, label }),
          )}
        />
        <CheckboxField
          label="Solo las que rigen hoy"
          checked={onlyActive}
          onChange={(v) => {
            setOnlyActive(v);
            setPage(1);
          }}
        />
      </div>
      <LoadState state={list} onRetry={reload} />
      {list.kind === 'ready' && list.data.items.length === 0 && (
        <p className="empty">No hay sanciones.</p>
      )}
      {list.kind === 'ready' && list.data.items.length > 0 && (
        <>
          <table className="responsive-table">
            <caption className="visually-hidden">Sanciones</caption>
            <thead>
              <tr>
                <th scope="col">Sancionado</th>
                <th scope="col">Sanción</th>
                <th scope="col">Vigencia</th>
                <th scope="col">Estado</th>
                <th scope="col">Expediente</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((s) => (
                <tr key={s.id}>
                  <td data-label="Sancionado">
                    {s.athlete?.name ?? s.team?.name ?? s.club?.name}
                    <div className="hint">
                      {s.athlete ? 'Deportista' : s.team ? 'Equipo' : 'Club'}
                      {s.championship
                        ? ` · ${s.championship.name}`
                        : ' · Todas las competencias'}
                    </div>
                  </td>
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
                    <span
                      className={`badge ${s.isActive ? 'badge-warning' : ''}`}
                    >
                      {s.isActive
                        ? 'Rige hoy'
                        : SANCTION_STATUS_LABELS[s.status]}
                    </span>
                    {s.statusReason && (
                      <div className="hint">{s.statusReason}</div>
                    )}
                  </td>
                  <td data-label="Expediente">
                    <a href={`#/disciplina/${s.case.id}`}>{s.case.code}</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onChange={setPage}
          />
        </>
      )}
    </>
  );
}
