import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogsApp } from '../catalogs/CatalogsApp.tsx';
import { error, json, mockApi, noContent, page } from '../../test/mockApi.ts';
import { NotificationsPage } from './NotificationsPage.tsx';
import type { AppNotification } from './types.ts';

const NOTIF_1 = '0197aaaa-0000-7000-8000-0000000000a1';
const NOTIF_2 = '0197aaaa-0000-7000-8000-0000000000a2';
const CLUB_ID = '0197aaaa-0000-7000-8000-0000000000c1';

const unread: AppNotification = {
  id: NOTIF_1,
  templateKey: 'event.rescheduled',
  title: 'Se modificó la programación de un partido',
  body: 'Local vs Visitante se reprogramó para 1 jul 2026. Motivo: Lluvia.',
  link: '#/campeonatos',
  readAt: null,
  createdAt: '2026-06-30T15:00:00.000Z',
};
const read: AppNotification = {
  ...unread,
  id: NOTIF_2,
  title: 'Cambió el estado de una inscripción',
  readAt: '2026-06-30T16:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('bandeja de notificaciones', () => {
  it('lista los avisos, distingue los no leídos y marca uno como leído', async () => {
    const items = [{ ...unread }, { ...read }];
    const api = mockApi({
      'GET /notifications': (call) =>
        page(
          call.query.get('unread') === 'true'
            ? items.filter((n) => !n.readAt)
            : items,
        ),
      [`POST /notifications/${NOTIF_1}/read`]: () => {
        items[0]!.readAt = '2026-07-01T00:00:00.000Z';
        return noContent();
      },
    });
    render(<NotificationsPage permissions={[]} />);

    expect(
      await screen.findByText('Se modificó la programación de un partido'),
    ).toBeVisible();
    expect(screen.getAllByText(/Motivo: Lluvia/)).toHaveLength(2);
    expect(screen.getAllByText('Nueva')).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Ver' })[0]).toHaveAttribute(
      'href',
      '#/campeonatos',
    );
    // Sin permiso de administración no aparece el panel de correo.
    expect(
      screen.queryByText('Administración de avisos'),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Marcar como leída' }),
    );
    await vi.waitFor(() =>
      expect(screen.queryByText('Nueva')).not.toBeInTheDocument(),
    );
    expect(api.of('POST', `/notifications/${NOTIF_1}/read`)).toHaveLength(1);
  });

  it('filtra por no leídas y marca todas como leídas', async () => {
    const api = mockApi({
      'GET /notifications': (call) =>
        page(call.query.get('unread') === 'true' ? [] : [unread, read]),
      'POST /notifications/read-all': () => json({ marked: 1 }),
    });
    render(<NotificationsPage permissions={[]} />);
    await screen.findByText('Cambió el estado de una inscripción');

    await userEvent.click(screen.getByLabelText('Mostrar solo las no leídas'));
    expect(await screen.findByText('No tiene avisos sin leer.')).toBeVisible();
    expect(api.calls.some((c) => c.query.get('unread') === 'true')).toBe(true);

    await userEvent.click(
      screen.getByRole('button', { name: 'Marcar todas como leídas' }),
    );
    await vi.waitFor(() =>
      expect(api.of('POST', '/notifications/read-all')).toHaveLength(1),
    );
  });

  it('muestra el error de carga con opción de reintentar', async () => {
    mockApi({ 'GET /notifications': () => error(500, 'Fallo del servidor') });
    render(<NotificationsPage permissions={[]} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Fallo del servidor',
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });
});

describe('administración de avisos', () => {
  it('envía el recordatorio de documentación a un club y explica el resultado', async () => {
    const api = mockApi({
      'GET /notifications': () => page([]),
      'GET /notifications/outbox': () =>
        json({
          mailEnabled: false,
          items: [],
          page: 1,
          pageSize: 10,
          total: 0,
        }),
      'GET /clubs': () =>
        page([{ id: CLUB_ID, name: 'Deportivo Quero', status: 'activo' }]),
      'POST /notifications/reminders/documents': () =>
        json({ pending: 3, notified: 2 }),
    });
    render(<NotificationsPage permissions={['notifications:manage']} />);

    expect(
      await screen.findByText(/envío de correo está desactivado/),
    ).toBeVisible();
    const send = screen.getByRole('button', { name: 'Enviar recordatorio' });
    expect(send).toBeDisabled();
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Club' }),
      CLUB_ID,
    );
    await userEvent.click(send);

    expect(
      await screen.findByText(
        'Se avisó a 2 usuario(s) del club: 3 deportista(s) sin documentos.',
      ),
    ).toBeVisible();
    expect(
      api.of('POST', '/notifications/reminders/documents')[0]!.body,
    ).toEqual({ clubId: CLUB_ID });
  });

  it('con el correo activado lista la cola y permite enviar los pendientes', async () => {
    mockApi({
      'GET /notifications': () => page([]),
      'GET /notifications/outbox': () =>
        json({
          mailEnabled: true,
          items: [
            {
              id: NOTIF_1,
              templateKey: 'event.rescheduled',
              title: 'Se modificó la programación de un partido',
              status: 'fallida',
              attempts: 5,
              lastError: 'EAUTH',
              createdAt: '2026-06-30T15:00:00.000Z',
              sentAt: null,
              user: { id: 'u1', displayName: 'Ana Dirigente' },
            },
          ],
          page: 1,
          pageSize: 10,
          total: 1,
        }),
      'GET /clubs': () => page([]),
      'POST /notifications/dispatch': () =>
        json({ sent: 2, failed: 0, retrying: 1 }),
    });
    render(<NotificationsPage permissions={['notifications:manage']} />);
    const row = (await screen.findByText('Ana Dirigente')).closest('tr')!;
    expect(within(row).getByText('Fallido (EAUTH)')).toBeVisible();

    await userEvent.click(
      screen.getByRole('button', { name: 'Enviar pendientes ahora' }),
    );
    expect(
      await screen.findByText(
        'Correos enviados: 2. Con error: 0. En reintento: 1.',
      ),
    ).toBeVisible();
  });
});

describe('contador de avisos en el menú', () => {
  it('muestra los avisos sin leer junto a «Notificaciones»', async () => {
    mockApi({
      'GET /notifications/unread-count': () => json({ unread: 3 }),
      'GET /health': () => json({ status: 'ok' }),
    });
    render(<CatalogsApp permissions={[]} selfId="u1" />);
    // El inicio también enlaza a Notificaciones: se busca en el menú de secciones.
    const menu = screen.getByRole('navigation', { name: 'Secciones' });
    const link = await within(menu).findByRole('link', {
      name: /Notificaciones/,
    });
    await vi.waitFor(() => expect(link).toHaveTextContent('(3)'));
    expect(link).toHaveTextContent('3 sin leer');
  });
});
