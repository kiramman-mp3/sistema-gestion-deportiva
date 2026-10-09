export interface NoticeState {
  type: 'success' | 'error';
  text: string;
}

/** Aviso de resultado: los éxitos se anuncian con cortesía; los errores como alerta. */
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
        <span aria-hidden="true">✔ </span>
        {notice.text} {close}
      </p>
    </div>
  ) : (
    <p className="notice error" role="alert">
      <span aria-hidden="true">✖ </span>
      {notice.text} {close}
    </p>
  );
}

export function describeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'No se pudo completar la operación.';
}
