import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon.tsx';

export type BadgeTone =
  'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'live';

export interface StatusBadgeProps {
  tone?: BadgeTone;
  icon?: IconName;
  status?: string;
  className?: string;
  children: ReactNode;
}

const DEFAULT_ICONS: Record<BadgeTone, IconName> = {
  neutral: 'pause',
  warning: 'alert-triangle',
  success: 'check',
  danger: 'x',
  info: 'info',
  live: 'clock',
};

// Mapeo automático de estados de negocio a tonos (spec §8 y §10)
export const STATUS_TONE_MAP: Record<string, BadgeTone> = {
  // Neutral
  borrador: 'neutral',
  archivado: 'neutral',
  finalizado: 'neutral',
  inactivo: 'neutral',
  // Warning
  pendiente: 'warning',
  suspendido: 'warning',
  postergado: 'warning',
  designado: 'warning',
  recibido: 'warning',
  en_revision: 'warning',
  // Success
  aprobado: 'success',
  habilitado: 'success',
  activo: 'success',
  vigente: 'success',
  confirmado: 'success',
  resuelto: 'success',
  // Danger
  rechazado: 'danger',
  inhabilitado: 'danger',
  anulado: 'danger',
  cancelado: 'danger',
  bloqueado: 'danger',
  desestimado: 'danger',
  // Info
  publicado: 'info',
  inscripciones_abiertas: 'info',
  programado: 'info',
  // Live
  en_curso: 'live',
};

/**
 * Píldora de estado accesible según spec §8:
 * Icono SVG + texto, tonos definidos en diseño, y conserva la clase `badge`.
 */
export function StatusBadge({
  tone,
  icon,
  status,
  className = '',
  children,
}: StatusBadgeProps) {
  const resolvedTone: BadgeTone =
    tone ?? (status ? (STATUS_TONE_MAP[status] ?? 'neutral') : 'neutral');
  const resolvedIcon = icon ?? DEFAULT_ICONS[resolvedTone];

  return (
    <span
      className={`badge status-pill badge-${resolvedTone} status-${status ?? resolvedTone} ${className}`.trim()}
    >
      {resolvedIcon && <Icon name={resolvedIcon} size={14} />}
      <span>{children}</span>
    </span>
  );
}
