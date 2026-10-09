import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  /** Operación destructiva: el foco inicial va a «Cancelar» y el botón se destaca. */
  danger?: boolean;
  /** `none`: sin motivo; `optional`/`required`: pide un motivo que se auditará. */
  reason?: 'none' | 'optional' | 'required';
  onConfirm: (reason: string) => Promise<void> | void;
  onCancel: () => void;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal de confirmación. Accesible: role="dialog", foco atrapado,
 * Escape para cancelar y devolución del foco al elemento que lo abrió.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger = false,
  reason = 'none',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const reasonId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [reasonText, setReasonText] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Con motivo se enfoca el campo; en operaciones destructivas, «Cancelar».
    (reason !== 'none' ? reasonRef.current : cancelRef.current)?.focus();
    return () => opener?.focus?.();
  }, [reason]);

  // Escape cancela y Tab queda atrapado dentro del diálogo.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        event.stopPropagation();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!items || items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (!dialogRef.current?.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel, submitting]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const text = reasonText.trim();
    if (reason === 'required' && text.length < 3) {
      setReasonError('Indique el motivo (mínimo 3 caracteres).');
      reasonRef.current?.focus();
      return;
    }
    if (reason === 'optional' && text.length > 0 && text.length < 3) {
      setReasonError(
        'El motivo debe tener al menos 3 caracteres, o déjelo vacío.',
      );
      reasonRef.current?.focus();
      return;
    }
    setReasonError(null);
    setSubmitting(true);
    try {
      await onConfirm(text);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <dialog
        ref={dialogRef}
        className="dialog"
        open
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <form onSubmit={submit} noValidate>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>

          {reason !== 'none' && (
            <div className="field">
              <label htmlFor={reasonId}>
                Motivo {reason === 'optional' ? '(opcional)' : ''}
              </label>
              <textarea
                id={reasonId}
                ref={reasonRef}
                rows={3}
                maxLength={500}
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                aria-invalid={reasonError ? true : undefined}
                aria-describedby={reasonError ? `${reasonId}-error` : undefined}
                disabled={submitting}
              />
              {reasonError && (
                <p className="field-error" id={`${reasonId}-error`}>
                  {reasonError}
                </p>
              )}
            </div>
          )}

          <div className="dialog-actions">
            <button
              type="button"
              ref={cancelRef}
              onClick={onCancel}
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={danger ? 'danger' : 'primary'}
              disabled={submitting}
            >
              {submitting ? 'Procesando…' : confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
