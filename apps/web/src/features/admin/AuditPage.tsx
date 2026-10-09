import { type FormEvent, useId, useState } from 'react';
import { Pagination } from '../../components/Pagination.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { type AuditEntry, type Page, formatDateTime } from './types.ts';

const PAGE_SIZE = 25;

interface Filters {
  from: string;
  to: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
}
const EMPTY: Filters = {
  from: '',
  to: '',
  actor: '',
  action: '',
  entityType: '',
  entityId: '',
};

/** Consulta de auditoría. Solo lectura: no hay ninguna acción para alterar registros. */
export function AuditPage() {
  const id = useId();
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [dateError, setDateError] = useState<string | null>(null);

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  for (const [key, value] of Object.entries(applied))
    if (value) params.set(key, value);
  const [list, reload] = useFetch<Page<AuditEntry>>(`/audit-logs?${params}`);
  const active = Object.values(applied).some(Boolean);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setDateError('La fecha «Desde» no puede ser posterior a «Hasta».');
      return;
    }
    setDateError(null);
    setPage(1);
    setApplied({
      ...draft,
      actor: draft.actor.trim(),
      action: draft.action.trim(),
      entityType: draft.entityType.trim(),
      entityId: draft.entityId.trim(),
    });
  }

  const field = (key: keyof Filters, label: string, type = 'text') => (
    <div className="field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <input
        id={`${id}-${key}`}
        type={type}
        value={draft[key]}
        maxLength={100}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        aria-invalid={key === 'to' && dateError ? true : undefined}
        aria-describedby={
          key === 'to' && dateError ? `${id}-date-error` : undefined
        }
      />
    </div>
  );

  return (
    <section aria-labelledby="audit-title" className="catalog">
      <h2 id="audit-title">Auditoría</h2>
      <p className="hint">
        Registro de las operaciones sensibles. Es de solo lectura: los registros
        no pueden modificarse ni eliminarse. Los valores que podrían contener
        secretos se muestran ocultos.
      </p>

      <search>
        <form
          className="filters"
          onSubmit={onSubmit}
          aria-label="Filtrar auditoría"
        >
          {field('from', 'Desde', 'date')}
          {field('to', 'Hasta', 'date')}
          {field('actor', 'Actor (nombre o correo)')}
          {field('action', 'Acción (p. ej. user.create)')}
          {field('entityType', 'Tipo de entidad')}
          {field('entityId', 'Identificador de entidad')}
          <button type="submit" className="primary">
            Filtrar
          </button>
          {active && (
            <button
              type="button"
              onClick={() => {
                setDraft(EMPTY);
                setApplied(EMPTY);
                setPage(1);
                setDateError(null);
              }}
            >
              Limpiar filtros
            </button>
          )}
        </form>
        {dateError && (
          <p className="field-error" id={`${id}-date-error`} role="alert">
            {dateError}
          </p>
        )}
      </search>

      {list.kind === 'loading' && (
        <output className="loading">Cargando…</output>
      )}
      {list.kind === 'error' && (
        <div className="state-error" role="alert">
          <p>{list.message}</p>
          <button type="button" onClick={reload}>
            Reintentar
          </button>
        </div>
      )}
      {list.kind === 'ready' && list.data.items.length === 0 && (
        <p className="empty">
          {active
            ? 'No hay registros con los filtros aplicados.'
            : 'Todavía no hay registros de auditoría.'}
        </p>
      )}
      {list.kind === 'ready' && list.data.items.length > 0 && (
        <>
          <table className="responsive-table">
            <caption className="visually-hidden">
              Registros de auditoría
            </caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Acción</th>
                <th scope="col">Actor</th>
                <th scope="col">Entidad</th>
                <th scope="col">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((e) => (
                <tr key={e.id}>
                  <td data-label="Fecha">{formatDateTime(e.createdAt)}</td>
                  <td data-label="Acción">
                    <code>{e.action}</code>
                  </td>
                  <td data-label="Actor">
                    {e.actor ? (
                      `${e.actor.displayName} (${e.actor.email})`
                    ) : (
                      <span className="muted">Sistema o anónimo</span>
                    )}
                  </td>
                  <td data-label="Entidad">
                    {e.entityType}
                    {e.entityId ? (
                      <>
                        {' '}
                        · <code>{e.entityId}</code>
                      </>
                    ) : null}
                  </td>
                  <td data-label="Detalle">
                    <AuditDetail entry={e} />
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
    </section>
  );
}

function AuditDetail({ entry }: { entry: AuditEntry }) {
  const hasValues = entry.before !== null || entry.after !== null;
  if (!entry.reason && !hasValues) return <span className="muted">—</span>;
  return (
    <details>
      <summary>Ver detalle</summary>
      {entry.reason && (
        <p>
          <strong>Motivo:</strong> {entry.reason}
        </p>
      )}
      {entry.before !== null && (
        <>
          <p className="detail-label">Antes</p>
          <pre className="json">{JSON.stringify(entry.before, null, 2)}</pre>
        </>
      )}
      {entry.after !== null && (
        <>
          <p className="detail-label">Después</p>
          <pre className="json">{JSON.stringify(entry.after, null, 2)}</pre>
        </>
      )}
    </details>
  );
}
