import { useEffect, useState } from 'react';
import { apiGet } from '../../api/client.ts';
import { Icon } from '../../components/Icon.tsx';

interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: HealthResponse }
  | { kind: 'error'; message: string };

/** Muestra el estado real de la API. Texto e icono acompañan al color. */
export function ApiStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiGet<HealthResponse>('/health', controller.signal)
      .then((data) => setState({ kind: 'ready', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: 'error',
          message:
            error instanceof Error ? error.message : 'Error desconocido.',
        });
      });
    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }

  return (
    <section className="status" aria-labelledby="status-title">
      <h2 id="status-title">Estado del sistema</h2>
      <output>
        {state.kind === 'loading' && (
          <p>Comprobando conexión con el servidor…</p>
        )}
        {state.kind === 'ready' && (
          <p className="status-ok">
            <Icon name="check" size={14} /> Servidor operativo
          </p>
        )}
        {state.kind === 'error' && (
          <p className="status-error">
            <Icon name="alert-triangle" size={14} /> {state.message}
          </p>
        )}
      </output>
      {state.kind === 'error' && (
        <button type="button" onClick={retry}>
          Reintentar
        </button>
      )}
    </section>
  );
}
