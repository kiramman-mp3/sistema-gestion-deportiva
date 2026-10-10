import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  busy?: boolean;
  busyText?: string;
  children: ReactNode;
}

/**
 * Botón accesible según spec §8:
 * Variantes: primary, secondary, danger, ghost.
 * Alto mínimo 44px, estado busy accesible, y compatibilidad con clases CSS existentes.
 */
export function Button({
  variant = 'secondary',
  busy = false,
  busyText,
  disabled,
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const variantClass =
    variant === 'primary'
      ? 'primary'
      : variant === 'danger'
        ? 'danger'
        : variant === 'ghost'
          ? 'link'
          : 'secondary';

  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy ? true : undefined}
      className={`btn btn-${variant} ${variantClass} ${className}`.trim()}
      {...props}
    >
      {busy ? (busyText ?? 'Procesando…') : children}
    </button>
  );
}
