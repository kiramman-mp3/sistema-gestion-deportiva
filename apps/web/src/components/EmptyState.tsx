import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon.tsx';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: IconName;
  action?: ReactNode;
  className?: string;
}

/**
 * Estado vacío estructurado según spec §8 y §10:
 * Título descriptivo que dice qué falta, explicación de qué hacer y acción opcional.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <section
      className={`empty-state-card empty-state ${className}`.trim()}
      aria-label={title}
    >
      {icon && (
        <div className="empty-state-icon" aria-hidden="true">
          <Icon name={icon} size={32} />
        </div>
      )}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </section>
  );
}
