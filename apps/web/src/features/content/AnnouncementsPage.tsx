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
  LoadState,
  SelectField,
  TextAreaField,
  TextField,
} from '../people/fields.tsx';
import {
  type Announcement,
  type AnnouncementKind,
  KIND_LABELS,
  type MediaItem,
  type Page,
  STATUS_LABELS,
} from './types.ts';

const dateFmt = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Redacción de noticias y comunicados del portal, y biblioteca de imágenes. */
export function AnnouncementsPage({
  permissions,
}: {
  permissions: readonly string[];
}) {
  const can = (p: string) => permissions.includes(p);
  const canManage = can('announcements:manage');
  const canPublish = can('announcements:publish');
  const canDelete = can('announcements:delete');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const [showMedia, setShowMedia] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const query = new URLSearchParams({
    page: String(page),
    pageSize: '20',
    ...(q && { q }),
    ...(status && { status }),
  });
  const [list, reload] = useFetch<Page<Announcement>>(
    `/announcements?${query.toString()}`,
  );

  async function act(a: Announcement, action: string, success: string) {
    try {
      await apiRequest(`/announcements/${a.id}/${action}`, { method: 'POST' });
      setNotice({ type: 'success', text: success });
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
    }
  }

  async function startEdit(a: Announcement) {
    try {
      setEditing(await apiRequest<Announcement>(`/announcements/${a.id}`));
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
    }
  }

  return (
    <section aria-labelledby="content-title" className="catalog">
      <div className="catalog-header">
        <h2 id="content-title">Noticias y comunicados</h2>
        <div className="row-actions">
          <button type="button" onClick={() => setShowMedia((v) => !v)}>
            {showMedia ? 'Ocultar imágenes' : 'Imágenes'}
          </button>
          {canManage && !editing && (
            <button
              type="button"
              className="primary"
              onClick={() => setEditing('new')}
            >
              Nueva publicación
            </button>
          )}
        </div>
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {showMedia && <MediaLibrary canManage={canManage} onNotice={setNotice} />}

      {editing && (
        <AnnouncementForm
          announcement={editing === 'new' ? undefined : editing}
          onCancel={() => setEditing(null)}
          onSaved={(saved) => {
            setNotice({
              type: 'success',
              text:
                editing === 'new'
                  ? `Se creó el borrador «${saved.title}».`
                  : `Se guardó «${saved.title}».`,
            });
            setEditing(null);
            reload();
          }}
        />
      )}

      <div className="filters">
        <TextField
          label="Buscar por título"
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
        <SelectField
          label="Estado"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          placeholder="Todos los estados"
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </div>

      <LoadState state={list} onRetry={reload} />
      {list.kind === 'ready' && list.data.items.length === 0 && (
        <p className="empty">No hay publicaciones.</p>
      )}
      {list.kind === 'ready' && list.data.items.length > 0 && (
        <>
          <table className="responsive-table">
            <caption className="visually-hidden">
              Noticias y comunicados
            </caption>
            <thead>
              <tr>
                <th scope="col">Título</th>
                <th scope="col">Tipo</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((a) => (
                <tr key={a.id}>
                  <td data-label="Título">
                    <strong>{a.title}</strong>
                    <div className="hint">
                      {a.author} ·{' '}
                      {a.publishedAt
                        ? `publicada el ${dateFmt.format(new Date(a.publishedAt))}`
                        : `editada el ${dateFmt.format(new Date(a.updatedAt))}`}
                    </div>
                  </td>
                  <td data-label="Tipo">{KIND_LABELS[a.kind]}</td>
                  <td data-label="Estado">
                    <span
                      className={`badge ${a.status === 'publicado' ? 'badge-ok' : ''}`}
                    >
                      {STATUS_LABELS[a.status]}
                    </span>
                  </td>
                  <td data-label="Acciones" className="row-actions">
                    {a.status === 'publicado' && (
                      <a href={`#/portal/noticias/${a.slug}`}>
                        Ver en el portal
                      </a>
                    )}
                    {canManage && a.status !== 'archivado' && (
                      <button type="button" onClick={() => void startEdit(a)}>
                        Editar
                      </button>
                    )}
                    {canPublish && a.status === 'borrador' && (
                      <button
                        type="button"
                        onClick={() =>
                          void act(a, 'publish', `Se publicó «${a.title}».`)
                        }
                      >
                        Publicar
                      </button>
                    )}
                    {canPublish && a.status === 'publicado' && (
                      <button
                        type="button"
                        onClick={() =>
                          void act(
                            a,
                            'unpublish',
                            `«${a.title}» volvió a borrador.`,
                          )
                        }
                      >
                        Retirar
                      </button>
                    )}
                    {canPublish && a.status !== 'archivado' && (
                      <button
                        type="button"
                        onClick={() =>
                          void act(a, 'archive', `Se archivó «${a.title}».`)
                        }
                      >
                        Archivar
                      </button>
                    )}
                    {canPublish && a.status === 'archivado' && (
                      <button
                        type="button"
                        onClick={() =>
                          void act(a, 'unpublish', `Se restauró «${a.title}».`)
                        }
                      >
                        Restaurar
                      </button>
                    )}
                    {canDelete && a.status === 'borrador' && (
                      <button type="button" onClick={() => setDeleting(a)}>
                        Eliminar
                      </button>
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

      {deleting && (
        <ConfirmDialog
          title="Eliminar borrador"
          description={`¿Eliminar el borrador «${deleting.title}»? No se puede deshacer.`}
          confirmLabel="Eliminar borrador"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            const a = deleting;
            setDeleting(null);
            try {
              await apiRequest(`/announcements/${a.id}`, { method: 'DELETE' });
              setNotice({ type: 'success', text: 'Se eliminó el borrador.' });
              reload();
            } catch (err) {
              setNotice({ type: 'error', text: describeError(err) });
            }
          }}
        />
      )}
    </section>
  );
}

function AnnouncementForm({
  announcement,
  onCancel,
  onSaved,
}: {
  announcement?: Announcement;
  onCancel: () => void;
  onSaved: (a: Announcement) => void;
}) {
  const [kind, setKind] = useState<AnnouncementKind>(
    announcement?.kind ?? 'noticia',
  );
  const [title, setTitle] = useState(announcement?.title ?? '');
  const [summary, setSummary] = useState(announcement?.summary ?? '');
  const [content, setContent] = useState(announcement?.content ?? '');
  const [coverId, setCoverId] = useState(announcement?.cover?.id ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [media] = useFetch<Page<MediaItem>>('/media?pageSize=100');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const errs: Record<string, string> = {};
    if (title.trim().length < 5)
      errs.title = 'El título necesita al menos 5 caracteres.';
    if (summary.trim().length < 10)
      errs.summary = 'El resumen necesita al menos 10 caracteres.';
    if (content.trim().length < 20)
      errs.content = 'El contenido necesita al menos 20 caracteres.';
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const body = {
        kind,
        title: title.trim(),
        summary: summary.trim(),
        content: content.trim(),
        coverId: coverId || null,
      };
      onSaved(
        announcement
          ? await apiRequest<Announcement>(
              `/announcements/${announcement.id}`,
              {
                method: 'PATCH',
                body,
              },
            )
          : await apiRequest<Announcement>('/announcements', {
              method: 'POST',
              body,
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
    <form className="settings-form" onSubmit={submit} noValidate>
      <fieldset>
        <legend>
          {announcement ? 'Editar publicación' : 'Nueva publicación'}
        </legend>
        <SelectField
          label="Tipo"
          value={kind}
          onChange={(v) => setKind(v as AnnouncementKind)}
          options={Object.entries(KIND_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
          disabled={submitting}
        />
        <TextField
          label="Título"
          value={title}
          onChange={setTitle}
          required
          error={errors.title}
          maxLength={150}
          disabled={submitting}
        />
        <TextAreaField
          label="Resumen"
          value={summary}
          onChange={setSummary}
          required
          error={errors.summary}
          maxLength={300}
          rows={2}
          hint="Aparece en las listas y al compartir el enlace."
          disabled={submitting}
        />
        <TextAreaField
          label="Contenido"
          value={content}
          onChange={setContent}
          required
          error={errors.content}
          maxLength={20000}
          rows={12}
          hint="Texto plano. Separe los párrafos con una línea en blanco. No use datos personales de menores."
          disabled={submitting}
        />
        <SelectField
          label="Imagen de portada"
          value={coverId}
          onChange={setCoverId}
          placeholder="Sin imagen"
          options={
            media.kind === 'ready'
              ? media.data.items
                  .filter((m) => m.visibility === 'publico')
                  .map((m) => ({ value: m.id, label: m.altText }))
              : []
          }
          disabled={submitting}
        />
        {coverId && (
          <img
            className="logo-preview"
            src={`/api/public/media/${coverId}`}
            alt="Vista previa de la portada"
          />
        )}
      </fieldset>
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function MediaLibrary({
  canManage,
  onNotice,
}: {
  canManage: boolean;
  onNotice: (n: NoticeState) => void;
}) {
  const [media, reload] = useFetch<Page<MediaItem>>('/media?pageSize=100');
  const [altText, setAltText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file || altText.trim().length < 3) {
      onNotice({
        type: 'error',
        text: 'Elija una imagen y describa su contenido (mínimo 3 caracteres).',
      });
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('altText', altText.trim());
      body.append('file', file);
      await apiRequest('/media', { method: 'POST', body });
      setAltText('');
      setFile(null);
      onNotice({ type: 'success', text: 'Se subió la imagen.' });
      reload();
    } catch (err) {
      onNotice({ type: 'error', text: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: MediaItem) {
    try {
      await apiRequest(`/media/${m.id}`, { method: 'DELETE' });
      onNotice({ type: 'success', text: 'Se eliminó la imagen.' });
      reload();
    } catch (err) {
      onNotice({ type: 'error', text: describeError(err) });
    }
  }

  return (
    <section className="catalog-form" aria-label="Biblioteca de imágenes">
      <h3>Imágenes</h3>
      {canManage && (
        <form onSubmit={upload} noValidate>
          <TextField
            label="Descripción de la imagen"
            value={altText}
            onChange={setAltText}
            maxLength={200}
            hint="Texto alternativo para personas que no ven la imagen."
            disabled={busy}
          />
          <div className="field">
            <label htmlFor="media-file">
              Archivo (JPG, PNG o WEBP, máx. 5 MB)
            </label>
            <input
              id="media-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </div>
          <button type="submit" disabled={busy}>
            Subir imagen
          </button>
        </form>
      )}
      <LoadState state={media} onRetry={reload} />
      {media.kind === 'ready' && media.data.items.length === 0 && (
        <p className="empty">Todavía no hay imágenes.</p>
      )}
      {media.kind === 'ready' && media.data.items.length > 0 && (
        <ul className="media-grid">
          {media.data.items.map((m) => (
            <li key={m.id}>
              <img src={`/api/public/media/${m.id}`} alt={m.altText} />
              <p>{m.altText}</p>
              {canManage && (
                <button
                  type="button"
                  disabled={m.usedIn > 0}
                  title={m.usedIn > 0 ? 'Se usa como portada' : undefined}
                  onClick={() => void remove(m)}
                >
                  Eliminar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
