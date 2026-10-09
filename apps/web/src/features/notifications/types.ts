export type { Page } from '../admin/types.ts';

export interface AppNotification {
  id: string;
  templateKey: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface OutboxItem {
  id: string;
  templateKey: string;
  title: string;
  status: 'pendiente' | 'enviada' | 'fallida';
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
  user: { id: string; displayName: string };
}

export interface Outbox {
  mailEnabled: boolean;
  items: OutboxItem[];
  page: number;
  pageSize: number;
  total: number;
}

export const OUTBOX_STATUS_LABELS: Record<OutboxItem['status'], string> = {
  pendiente: 'Pendiente',
  enviada: 'Enviado',
  fallida: 'Fallido',
};

/** Evento que avisa a la navegación de que cambió el número de avisos sin leer. */
export const NOTIFICATIONS_CHANGED = 'liga:notifications-changed';
