import { type FormEvent, useEffect, useId, useState } from 'react';
import { ApiError, apiRequest } from '../../api/client.ts';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { Notice, type NoticeState } from '../../components/Notice.tsx';
import { CatalogForm } from './CatalogForm.tsx';
import type {
  CatalogConfig,
  CatalogItem,
  Page,
  StatusAction,
} from './types.ts';

const PAGE_SIZE = 20;

type ListState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: Page<T> }
  | { kind: 'error'; message: string };

type Editor<T> = { mode: 'create' } | { mode: 'edit'; item: T };

type Pending<T> =
  | { kind: 'status'; item: T; action: StatusAction }
  | { kind: 'delete'; item: T };

/**
 * Administración genérica de un catálogo: listado con búsqueda, filtro y paginación,
 * formulario de alta/edición, cambio de estado y eliminación con confirmación.
 * Los controles se muestran según los permisos del usuario, pero la API es quien
 * autoriza cada operación.
 */
export function CatalogAdmin<T extends CatalogItem>({
  config,
  permissions,
}: {
  config: CatalogConfig<T>;
  permissions: readonly string[];
}) {
  const canManage = permissions.includes(config.permissions.manage);
  const canDelete = permissions.includes(config.permissions.delete);
  const searchId = useId();
  const statusId = useId();

  const [filters, setFilters] = useState({ q: '', status: '', page: 1 });
  const [searchText, setSearchText] = useState('');
  const [list, setList] = useState<ListState<T>>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [editor, setEditor] = useState<Editor<T> | null>(null);
  const [pending, setPending] = useState<Pending<T> | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(filters.page),
      pageSize: String(PAGE_SIZE),
    });
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);

    apiRequest<Page<T>>(`${config.path}?${params}`, {
      signal: controller.signal,
    })
      .then((data) => setList({ kind: 'ready', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setList({
          kind: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'No se pudo cargar el listado.',
        });
      });
    return () => controller.abort();
  }, [config.path, filters, reloadKey]);

  const reload = () => {
    setList({ kind: 'loading' });
    setReloadKey((k) => k + 1);
  };

  function applyFilters(next: Partial<typeof filters>) {
    setList({ kind: 'loading' });
    setFilters((current) => ({ ...current, page: 1, ...next }));
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilters({ q: searchText.trim() });
  }

  /** Ejecuta una operación, informa el resultado y recarga el listado. */
  async function perform(operation: () => Promise<unknown>, success: string) {
    try {
      await operation();
      setNotice({ type: 'success', text: success });
      reload();
    } catch (error) {
      // Un 401 lo gestiona el proveedor de sesión (vuelve al acceso).
      setNotice({
        type: 'error',
        text:
          error instanceof ApiError
            ? error.message
            : 'No se pudo completar la operación.',
      });
    }
  }

  async function save(payload: Record<string, unknown>) {
    if (!editor) return;
    // Los errores se muestran en el propio formulario, que queda abierto.
    if (editor.mode === 'create') {
      const created = await apiRequest<T>(config.path, {
        method: 'POST',
        body: payload,
      });
      setNotice({
        type: 'success',
        text: `Se creó: ${config.itemName(created)}.`,
      });
    } else {
      const updated = await apiRequest<T>(`${config.path}/${editor.item.id}`, {
        method: 'PATCH',
        body: payload,
      });
      setNotice({
        type: 'success',
        text: `Se actualizó: ${config.itemName(updated)}.`,
      });
    }
    setEditor(null);
    reload();
  }

  const filtersActive = Boolean(filters.q || filters.status);
  const rows = list.kind === 'ready' ? list.data : null;
  const totalPages = rows
    ? Math.max(1, Math.ceil(rows.total / rows.pageSize))
    : 1;

  return (
    <section aria-labelledby="catalog-title" className="catalog">
      <div className="catalog-header">
        <h1 id="catalog-title">{config.title}</h1>
        {canManage && !editor && (
          <button
            type="button"
            className="primary"
            onClick={() => {
              setNotice(null);
              setEditor({ mode: 'create' });
            }}
          >
            {config.newLabel}
          </button>
        )}
      </div>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      {editor && (
        <CatalogForm
          key={editor.mode === 'edit' ? editor.item.id : 'create'}
          config={config}
          mode={editor.mode}
          item={editor.mode === 'edit' ? editor.item : undefined}
          title={
            editor.mode === 'edit'
              ? config.editTitle(editor.item)
              : config.newLabel
          }
          onSubmit={save}
          onCancel={() => setEditor(null)}
        />
      )}

      <search>
        <form
          className="filters"
          onSubmit={onSearch}
          aria-label={`Buscar en ${config.title.toLowerCase()}`}
        >
          <div className="field">
            <label htmlFor={searchId}>{config.searchLabel}</label>
            <input
              id={searchId}
              type="search"
              value={searchText}
              maxLength={100}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={statusId}>Estado</label>
            <select
              id={statusId}
              value={filters.status}
              onChange={(e) => applyFilters({ status: e.target.value })}
            >
              <option value="">Todos</option>
              {config.statusFilter.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit">Buscar</button>
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setSearchText('');
                applyFilters({ q: '', status: '' });
              }}
            >
              Limpiar filtros
            </button>
          )}
        </form>
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

      {rows && rows.items.length === 0 && (
        <p className="empty">
          {filtersActive
            ? 'No se encontraron resultados con los filtros aplicados.'
            : config.emptyText}
        </p>
      )}

      {rows && rows.items.length > 0 && (
        <>
          <table className="responsive-table">
            <caption className="visually-hidden">{config.title}</caption>
            <thead>
              <tr>
                {config.columns.map((c) => (
                  <th key={c.header} scope="col">
                    {c.header}
                  </th>
                ))}
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((item) => {
                const editable = canManage && (config.canEdit?.(item) ?? true);
                const statusActions = canManage
                  ? config.statusActions(item)
                  : [];
                const deletable = canDelete && config.canDelete(item);
                return (
                  <tr key={item.id}>
                    {config.columns.map((c) => (
                      <td key={c.header} data-label={c.header}>
                        {c.render(item)}
                      </td>
                    ))}
                    <td data-label="Acciones" className="row-actions">
                      {editable && (
                        <button
                          type="button"
                          aria-label={`Editar ${config.itemName(item)}`}
                          onClick={() => {
                            setNotice(null);
                            setEditor({ mode: 'edit', item });
                          }}
                        >
                          Editar
                        </button>
                      )}
                      {statusActions.map((action) => (
                        <button
                          key={action.status}
                          type="button"
                          aria-label={`${action.label} ${config.itemName(item)}`}
                          onClick={() =>
                            setPending({ kind: 'status', item, action })
                          }
                        >
                          {action.label}
                        </button>
                      ))}
                      {deletable && (
                        <button
                          type="button"
                          className="danger-outline"
                          aria-label={`Eliminar ${config.itemName(item)}`}
                          onClick={() => setPending({ kind: 'delete', item })}
                        >
                          Eliminar
                        </button>
                      )}
                      {!editable &&
                        statusActions.length === 0 &&
                        !deletable && <span className="muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <nav className="pagination" aria-label="Paginación">
            <button
              type="button"
              disabled={filters.page <= 1}
              onClick={() => {
                setList({ kind: 'loading' });
                setFilters((f) => ({ ...f, page: f.page - 1 }));
              }}
            >
              Anterior
            </button>
            <span>
              Página {rows.page} de {totalPages} · {rows.total}{' '}
              {rows.total === 1 ? 'registro' : 'registros'}
            </span>
            <button
              type="button"
              disabled={filters.page >= totalPages}
              onClick={() => {
                setList({ kind: 'loading' });
                setFilters((f) => ({ ...f, page: f.page + 1 }));
              }}
            >
              Siguiente
            </button>
          </nav>
        </>
      )}

      {pending?.kind === 'status' && (
        <ConfirmDialog
          title={`${pending.action.label}: ${config.itemName(pending.item)}`}
          description={pending.action.description}
          confirmLabel={pending.action.label}
          reason={pending.action.reason}
          onCancel={() => setPending(null)}
          onConfirm={async (reason) => {
            const { item, action } = pending;
            setPending(null);
            await perform(
              () =>
                apiRequest(`${config.path}/${item.id}/status`, {
                  method: 'PATCH',
                  body: {
                    status: action.status,
                    ...(reason ? { reason } : {}),
                  },
                }),
              `${config.itemName(item)}: estado actualizado a «${config.statusLabel(action.status)}».`,
            );
          }}
        />
      )}

      {pending?.kind === 'delete' && (
        <ConfirmDialog
          title={`Eliminar ${config.itemName(pending.item)}`}
          description={config.deleteDescription(pending.item)}
          confirmLabel="Eliminar definitivamente"
          danger
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            const { item } = pending;
            setPending(null);
            await perform(
              () =>
                apiRequest(`${config.path}/${item.id}`, { method: 'DELETE' }),
              `Se eliminó: ${config.itemName(item)}.`,
            );
          }}
        />
      )}
    </section>
  );
}
