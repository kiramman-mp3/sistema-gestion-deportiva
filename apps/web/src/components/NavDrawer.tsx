import { type ReactNode, type RefObject, useEffect, useRef } from 'react';
import { Icon } from './Icon.tsx';

export interface NavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
  title?: string;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function NavDrawer({
  isOpen,
  onClose,
  triggerRef,
  title = 'Secciones',
  children,
}: NavDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const triggerEl = triggerRef?.current;
    // Guarda el elemento activo actual si no se proveyó triggerRef
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    // Bloquea el scroll del fondo
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Coloca el foco inicial en el primer elemento interactivo del diálogo
    const timer = setTimeout(() => {
      const focusables =
        drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables && focusables.length > 0) {
        focusables[0]?.focus();
      } else {
        drawerRef.current?.focus();
      }
    }, 10);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusables = Array.from(
          drawerRef.current?.querySelectorAll<HTMLElement>(
            FOCUSABLE_SELECTOR,
          ) ?? [],
        ).filter(
          (el) =>
            el.offsetParent !== null || getComputedStyle(el).display !== 'none',
        );

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;

      // Devolución del foco
      const toRestore = triggerEl ?? previouslyFocusedRef.current;
      if (toRestore && typeof toRestore.focus === 'function') {
        setTimeout(() => toRestore.focus(), 0);
      }
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return (
    <div
      className="nav-drawer-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="nav-drawer"
      >
        <div className="nav-drawer-header">
          <span className="nav-drawer-title">{title}</span>
          <button
            type="button"
            className="nav-drawer-close"
            onClick={onClose}
            aria-label="Cerrar menú"
          >
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="nav-drawer-content">{children}</div>
      </div>
    </div>
  );
}
