import { type FormEvent, useId, useRef, useState } from 'react';
import { Modal } from './Modal.tsx';

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

/**
 * Diálogo modal de confirmación construido sobre `Modal` (spec §8).
 * Conserva exactamente su API y accesibilidad.
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
  const cancelRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [reasonText, setReasonText] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Con motivo se enfoca el campo; en operaciones destructivas, «Cancelar».
  const initialFocusRef = reason !== 'none' ? reasonRef : cancelRef;

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
    <Modal
      titleId={titleId}
      descriptionId={descriptionId}
      onClose={onCancel}
      initialFocusRef={initialFocusRef}
      busy={submitting}
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
    </Modal>
  );
}
