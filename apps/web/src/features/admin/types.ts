export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export type UserStatus = 'pendiente' | 'activo' | 'inactivo' | 'bloqueado';

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  pendiente: 'Pendiente de activación',
  activo: 'Activa',
  inactivo: 'Inactiva',
  bloqueado: 'Bloqueada',
};

export interface RoleRef {
  id: string;
  code: string;
  name: string;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: RoleRef[];
}

export interface AdminRole extends RoleRef {
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

export interface PermissionInfo {
  code: string;
  description: string;
  module: string;
  moduleLabel: string;
  action: string;
  actionLabel: string;
}

export interface UserSession {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
}

export interface CredentialLink {
  token: string;
  kind: 'activacion' | 'restablecimiento';
  expiresAt: string;
}

export interface AuditEntry {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: { id: string; email: string; displayName: string } | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}

const dateTime = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Guayaquil',
});

/** Instante ISO → fecha y hora locales de Ecuador. */
export function formatDateTime(value: string | null): string {
  return value ? dateTime.format(new Date(value)) : '—';
}
