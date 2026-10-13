import { useState } from 'react';
import { apiRequest } from '../../api/client.ts';
import {
  Notice,
  type NoticeState,
  describeError,
} from '../../components/Notice.tsx';
import { Pagination } from '../../components/Pagination.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { CheckboxField, LoadState, SelectField } from '../people/fields.tsx';
import type { Club } from '../people/types.ts';
import {
  type AppNotification,
  NOTIFICATIONS_CHANGED,
  OUTBOX_STATUS_LABELS,
  type Outbox,
  type Page,
} from './types.ts';

const dateTime = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const announceChange = () =>
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));

/** Bandeja de avisos del usuario y, con permiso, administración del correo. */
export function NotificationsPage({
  permissions,
}: {
  permissions: readonly string[];
}) {
  const canManage = permissions.includes('notifications:manage');
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const query = new URLSearchParams({
    page: String(page),
    pageSize: '20',
    ...(unreadOnly && { unread: 'true' }),
  });
  const [list, reload] = useFetch<Page<AppNotification>>(
    `/notifications?${query.toString()}`,
  );

  async function markRead(id: string) {
    try {
      await apiRequest(`/notifications/${id}/read`, { method: 'POST' });
      announceChange();
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
    }
  }

  async function markAll() {
    try {
      await apiRequest('/notifications/read-all', { method: 'POST' });
      announceChange();
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
    }
  }

  return (
    <section aria-labelledby="notifications-title" className="catalog">
      <div className="catalog-header">
        <h1 id="notifications-title">Notificaciones</h1>
        <button type="button" onClick={() => void markAll()}>
          Marcar todas como leídas
        </button>
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      <div className="filters">
        <CheckboxField
          label="Mostrar solo las no leídas"
          checked={unreadOnly}
          onChange={(checked) => {
            setUnreadOnly(checked);
            setPage(1);
          }}
        />
      </div>

      <LoadState state={list} onRetry={reload} />
      {list.kind === 'ready' && list.data.items.length === 0 && (
        <p className="empty">
          {unreadOnly
            ? 'No tiene avisos sin leer.'
            : 'Todavía no tiene notificaciones.'}
        </p>
      )}
      {list.kind === 'ready' && list.data.items.length > 0 && (
        <>
          <ul className="notification-list">
            {list.data.items.map((n) => (
              <li
                key={n.id}
                className={n.readAt ? 'notification' : 'notification unread'}
              >
                <div>
                  <strong>{n.title}</strong>
                  {!n.readAt && <span className="badge badge-ok"> Nueva</span>}
                  <p>{n.body}</p>
                  <p className="hint">
                    {dateTime.format(new Date(n.createdAt))}
                  </p>
                </div>
                <div className="row-actions">
                  {n.link && <a href={n.link}>Ver</a>}
                  {!n.readAt && (
                    <button type="button" onClick={() => void markRead(n.id)}>
                      Marcar como leída
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onChange={setPage}
          />
        </>
      )}

      {canManage && <MailAdmin onNotice={setNotice} />}
    </section>
  );
}

function MailAdmin({ onNotice }: { onNotice: (n: NoticeState) => void }) {
  const [outbox, reloadOutbox] = useFetch<Outbox>(
    '/notifications/outbox?pageSize=10',
  );
  const [clubs] = useFetch<Page<Club>>('/clubs?pageSize=100');
  const [clubId, setClubId] = useState('');
  const [busy, setBusy] = useState(false);

  async function dispatch() {
    setBusy(true);
    try {
      const r = await apiRequest<{
        sent: number;
        failed: number;
        retrying: number;
      }>('/notifications/dispatch', { method: 'POST' });
      onNotice({
        type: 'success',
        text: `Correos enviados: ${r.sent}. Con error: ${r.failed}. En reintento: ${r.retrying}.`,
      });
      reloadOutbox();
    } catch (err) {
      onNotice({ type: 'error', text: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remind() {
    if (!clubId) return;
    setBusy(true);
    try {
      const r = await apiRequest<{ pending: number; notified: number }>(
        '/notifications/reminders/documents',
        { method: 'POST', body: { clubId } },
      );
      onNotice({
        type: 'success',
        text:
          r.pending === 0
            ? 'Todos los deportistas del club tienen documentos: no hay nada que recordar.'
            : `Se avisó a ${r.notified} usuario(s) del club: ${r.pending} deportista(s) sin documentos.`,
      });
    } catch (err) {
      onNotice({ type: 'error', text: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="mail-admin-title" className="catalog-form">
      <h2 id="mail-admin-title">Administración de avisos</h2>

      <h3>Recordatorio de documentación</h3>
      <p className="hint">
        Avisa a los usuarios de un club cuántos deportistas no tienen ningún
        documento de inscripción (solo la cantidad, sin nombres).
      </p>
      <SelectField
        label="Club"
        value={clubId}
        onChange={setClubId}
        placeholder="Seleccione un club"
        options={
          clubs.kind === 'ready'
            ? clubs.data.items.map((c) => ({ value: c.id, label: c.name }))
            : []
        }
      />
      <button
        type="button"
        disabled={!clubId || busy}
        onClick={() => void remind()}
      >
        Enviar recordatorio
      </button>

      <h3>Cola de correo</h3>
      <LoadState state={outbox} onRetry={reloadOutbox} />
      {outbox.kind === 'ready' && (
        <>
          <p>
            {outbox.data.mailEnabled
              ? 'El envío de correo está activado.'
              : 'El envío de correo está desactivado: solo se crean avisos dentro del sistema.'}
          </p>
          {outbox.data.items.length > 0 && (
            <table className="responsive-table">
              <caption className="visually-hidden">Últimos correos</caption>
              <thead>
                <tr>
                  <th scope="col">Destinatario</th>
                  <th scope="col">Asunto</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Intentos</th>
                </tr>
              </thead>
              <tbody>
                {outbox.data.items.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Destinatario">{m.user.displayName}</td>
                    <td data-label="Asunto">{m.title}</td>
                    <td data-label="Estado">
                      {OUTBOX_STATUS_LABELS[m.status]}
                      {m.lastError ? ` (${m.lastError})` : ''}
                    </td>
                    <td data-label="Intentos">{m.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {outbox.data.mailEnabled && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void dispatch()}
            >
              Enviar pendientes ahora
            </button>
          )}
        </>
      )}
    </section>
  );
}
