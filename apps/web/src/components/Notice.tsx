import { Icon } from './Icon.tsx';

export interface NoticeState {
  type: 'success' | 'error';
  text: string;
}

/** Aviso de resultado: los éxitos se anuncian con cortesía; los errores como alerta (spec §8). */
export function Notice({
  notice,
  onClose,
}: {
  notice: NoticeState | null;
  onClose: () => void;
}) {
  if (!notice) return <div aria-live="polite" />;
  const close = (
    <button type="button" className="link" onClick={onClose}>
      Cerrar aviso
    </button>
  );
  return notice.type === 'success' ? (
    <div aria-live="polite">
      <p className="notice success">
        <Icon name="check" size={16} />
        <span>{notice.text}</span> {close}
      </p>
    </div>
  ) : (
    <p className="notice error" role="alert">
      <Icon name="x" size={16} />
      <span>{notice.text}</span> {close}
    </p>
  );
}

export function describeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'No se pudo completar la operación.';
}
