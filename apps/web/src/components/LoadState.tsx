export interface LoadStateProps {
  state: { kind: 'loading' | 'error' | 'ready'; message?: string };
  onRetry: () => void;
  className?: string;
}

/**
 * Estado de carga y error unificado según spec §8 y §10:
 * Carga accesible con puntos suspensivos tipográficos y error con acción de recuperación («Reintentar»).
 */
export function LoadState({ state, onRetry, className = '' }: LoadStateProps) {
  if (state.kind === 'loading') {
    return (
      <output className={`loading ${className}`.trim()} aria-live="polite">
        Cargando…
      </output>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className={`state-error ${className}`.trim()} role="alert">
        <p>{state.message ?? 'Ocurrió un error al cargar la información.'}</p>
        <button type="button" onClick={onRetry} className="btn btn-secondary">
          Reintentar
        </button>
      </div>
    );
  }
  return null;
}
