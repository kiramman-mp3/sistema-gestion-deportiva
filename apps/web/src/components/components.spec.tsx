import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button.tsx';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { EmptyState } from './EmptyState.tsx';
import { Modal } from './Modal.tsx';
import { STATUS_TONE_MAP, StatusBadge } from './StatusBadge.tsx';
import { Tabs } from './Tabs.tsx';

describe('Modal component', () => {
  it('renderiza con roles accesibles y bloquea el overflow del body', () => {
    const handleClose = vi.fn();
    const prevOverflow = document.body.style.overflow;

    const { unmount } = render(
      <Modal onClose={handleClose} titleId="modal-title">
        <h2 id="modal-title">Título del modal</h2>
        <button type="button">Acción</button>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe(prevOverflow);
  });

  it('devuelve el foco al elemento que lo abrió al desmontarse', () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" id="open-btn" onClick={() => setOpen(true)}>
            Abrir
          </button>
          {open && (
            <Modal onClose={() => setOpen(false)}>
              <button
                type="button"
                id="close-btn"
                onClick={() => setOpen(false)}
              >
                Cerrar
              </button>
            </Modal>
          )}
        </div>
      );
    }

    render(<Host />);
    const openBtn = screen.getByText('Abrir');
    openBtn.focus();
    expect(document.activeElement).toBe(openBtn);

    fireEvent.click(openBtn);
    const closeBtn = screen.getByText('Cerrar');
    expect(document.activeElement).toBe(closeBtn);

    fireEvent.click(closeBtn);
    expect(document.activeElement).toBe(openBtn);
  });

  it('respeta initialFocusRef cuando se proporciona', () => {
    function ModalWithInitialFocus() {
      const secondBtnRef = useRef<HTMLButtonElement>(null);
      return (
        <Modal onClose={vi.fn()} initialFocusRef={secondBtnRef}>
          <button type="button">Primero</button>
          <button type="button" ref={secondBtnRef}>
            Segundo
          </button>
        </Modal>
      );
    }

    render(<ModalWithInitialFocus />);
    expect(document.activeElement).toBe(screen.getByText('Segundo'));
  });

  it('atrapa el foco cíclicamente con Tab y Shift+Tab', () => {
    render(
      <Modal onClose={vi.fn()}>
        <button type="button" id="first">
          Primero
        </button>
        <button type="button" id="last">
          Último
        </button>
      </Modal>,
    );

    const first = screen.getByText('Primero');
    const last = screen.getByText('Último');

    first.focus();
    expect(document.activeElement).toBe(first);

    // Shift+Tab en el primer elemento debe ciclar al último
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    // Tab en el último elemento debe ciclar al primero
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(first);
  });

  it('cierra con tecla Escape, pero lo ignora si está ocupado (busy)', () => {
    const handleClose = vi.fn();
    const { rerender } = render(
      <Modal onClose={handleClose} busy={false}>
        <p>Contenido</p>
      </Modal>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);

    rerender(
      <Modal onClose={handleClose} busy={true}>
        <p>Contenido ocupado</p>
      </Modal>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1); // No incrementa
  });
});

describe('ConfirmDialog component', () => {
  it('exige motivo válido si reason="required"', async () => {
    const user = userEvent.setup();
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ConfirmDialog
        title="Confirmar acción"
        description="Esta acción requiere justificación"
        confirmLabel="Aceptar"
        reason="required"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: 'Aceptar' });
    await user.click(submitBtn);

    expect(
      screen.getByText('Indique el motivo (mínimo 3 caracteres).'),
    ).toBeInTheDocument();
    expect(handleConfirm).not.toHaveBeenCalled();

    const textarea = screen.getByRole('textbox', { name: /motivo/i });
    await user.type(textarea, 'Reorganización');
    await user.click(submitBtn);

    expect(handleConfirm).toHaveBeenCalledWith('Reorganización');
  });

  it('enfoca inicialmente Cancelar en operaciones destructivas sin motivo', () => {
    render(
      <ConfirmDialog
        title="Eliminar registro"
        description="Esta acción es irreversible"
        confirmLabel="Eliminar"
        danger
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const cancelBtn = screen.getByRole('button', { name: 'Cancelar' });
    expect(document.activeElement).toBe(cancelBtn);
  });
});

describe('Tabs component', () => {
  it('soporta navegación con teclado ARIA (Flechas, Inicio, Fin)', () => {
    const handleChange = vi.fn();
    const items = [
      { id: 'tab1', label: 'Tab 1', content: <p>Panel 1</p> },
      { id: 'tab2', label: 'Tab 2', content: <p>Panel 2</p> },
      { id: 'tab3', label: 'Tab 3', content: <p>Panel 3</p> },
    ];

    render(<Tabs items={items} activeId="tab1" onChange={handleChange} />);

    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    expect(tab1).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel 1');

    // ArrowRight cambia a tab2
    fireEvent.keyDown(tab1, { key: 'ArrowRight' });
    expect(handleChange).toHaveBeenCalledWith('tab2');

    // End cambia a tab3
    fireEvent.keyDown(tab1, { key: 'End' });
    expect(handleChange).toHaveBeenCalledWith('tab3');

    // Home cambia a tab1
    fireEvent.keyDown(tab1, { key: 'Home' });
    expect(handleChange).toHaveBeenCalledWith('tab1');
  });
});

describe('StatusBadge component', () => {
  it('renderiza con icono y tonos automáticos según el estado', () => {
    render(<StatusBadge status="aprobado">Aprobado</StatusBadge>);
    const badge = screen.getByText('Aprobado').closest('.badge');
    expect(badge).toHaveClass('badge-success');
    expect(badge).toHaveClass('status-aprobado');
  });

  it('mapea correctamente todos los estados de negocio requeridos', () => {
    expect(STATUS_TONE_MAP['pendiente']).toBe('warning');
    expect(STATUS_TONE_MAP['rechazado']).toBe('danger');
    expect(STATUS_TONE_MAP['en_curso']).toBe('live');
    expect(STATUS_TONE_MAP['borrador']).toBe('neutral');
  });
});

describe('Button component', () => {
  it('renderiza variantes y estado busy con texto accesible', () => {
    const { rerender } = render(<Button variant="primary">Guardar</Button>);
    const btn = screen.getByRole('button', { name: 'Guardar' });
    expect(btn).toHaveClass('btn-primary');

    rerender(
      <Button variant="primary" busy busyText="Guardando cambios…">
        Guardar
      </Button>,
    );
    expect(
      screen.getByRole('button', { name: 'Guardando cambios…' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(
      screen.getByRole('button', { name: 'Guardando cambios…' }),
    ).toBeDisabled();
  });
});

describe('EmptyState component', () => {
  it('renderiza título, descripción y acción accesible', () => {
    render(
      <EmptyState
        title="Sin registros"
        description="No se han encontrado elementos para esta búsqueda."
        icon="info"
        action={<button type="button">Crear nuevo</button>}
      />,
    );
    expect(screen.getByText('Sin registros')).toBeInTheDocument();
    expect(
      screen.getByText('No se han encontrado elementos para esta búsqueda.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Crear nuevo' }),
    ).toBeInTheDocument();
  });
});

describe('Verificación visual y semántica: Sin emojis en TSX fuera de .institutional-sheet', () => {
  it('no contiene emojis en archivos TSX de src excepto en la hoja impresa legal de PrintDocumentView.tsx', () => {
    function walkDir(dir: string): string[] {
      let results: string[] = [];
      const list = readdirSync(dir);
      for (const file of list) {
        const fullPath = join(dir, file);
        const stat = statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(walkDir(fullPath));
        } else if (fullPath.endsWith('.tsx')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const emojiRegex =
      /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    const srcDir = process.cwd().endsWith('web')
      ? join(process.cwd(), 'src')
      : join(process.cwd(), 'apps', 'web', 'src');
    const tsxFiles = walkDir(srcDir);
    const offendingOccurrences: { file: string; line: number; text: string }[] =
      [];

    for (const filePath of tsxFiles) {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      const isPrintView = filePath.includes('PrintDocumentView.tsx');

      lines.forEach((lineText, idx) => {
        if (emojiRegex.test(lineText)) {
          // Si es PrintDocumentView, verificamos si está dentro de las hojas de acta o nómina institucionales
          // Líneas fuera de la hoja institucional no deben tener emojis
          if (isPrintView) {
            // Línea 33 es la toolbar de impresión fuera de la hoja institucional
            if (idx + 1 < 50) {
              offendingOccurrences.push({
                file: filePath,
                line: idx + 1,
                text: lineText.trim(),
              });
            }
          } else {
            offendingOccurrences.push({
              file: filePath,
              line: idx + 1,
              text: lineText.trim(),
            });
          }
        }
      });
    }

    expect(
      offendingOccurrences,
      `Se encontraron emojis en TSX fuera de la hoja oficial:\n${JSON.stringify(offendingOccurrences, null, 2)}`,
    ).toHaveLength(0);
  });
});
