import { useEffect, useState } from 'react';
import { apiGet } from '../../api/client.ts';
import { NOTIFICATIONS_CHANGED } from './types.ts';

const POLL_MS = 60_000;

/** Avisos sin leer del usuario; se actualiza cada minuto y cuando la bandeja cambia. */
export function useUnreadCount(enabled = true): number {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const controller = new AbortController();
    const load = () => {
      apiGet<{ unread: number }>(
        '/notifications/unread-count',
        controller.signal,
      )
        .then((data) => {
          if (!cancelled) setUnread(data.unread);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
    };
  }, [enabled]);

  return unread;
}
