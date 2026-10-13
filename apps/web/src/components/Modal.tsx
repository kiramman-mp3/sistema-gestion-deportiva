import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from 'react';

export interface ModalProps {
  isOpen?: boolean;
  titleId?: string;
  descriptionId?: string;
  onClose: () => void;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  busy?: boolean;
  className?: string;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal accesible (spec §8): role="dialog", aria-modal, foco inicial configurable,
 * foco atrapado, Escape para cerrar (ignorado mientras busy), devolución del foco al opener,
 * y bloqueo de desplazamiento del fondo.
 */
export function Modal({
  isOpen = true,
  titleId,
  descriptionId,
  onClose,
  children,
  initialFocusRef,
  busy = false,
  className = '',
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const autoTitleId = useId();

  // Sin titleId, el diálogo toma su nombre del primer encabezado (los formularios ya traen el suyo).
  useEffect(() => {
    if (!isOpen || titleId) return;
    const heading = dialogRef.current?.querySelector('h2, h3, legend');
    if (!heading) return;
    if (!heading.id) heading.id = autoTitleId;
    dialogRef.current?.setAttribute('aria-labelledby', heading.id);
  }, [isOpen, titleId, autoTitleId]);

  // Guarda el elemento que abrió el modal para devolverle el foco al desmontar
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Foco inicial
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else {
      const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [isOpen, initialFocusRef]);

  // Escape cierra (ignorado si busy), Tab queda atrapado
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (!busy) {
          event.stopPropagation();
          onClose();
        }
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
  }, [isOpen, onClose, busy]);

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop">
      <dialog
        ref={dialogRef}
        className={`dialog ${className}`.trim()}
        open
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        {children}
      </dialog>
    </div>
  );
}
