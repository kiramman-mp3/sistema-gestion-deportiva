import { type KeyboardEvent, type ReactNode, useId, useRef } from 'react';

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * Pestañas accesibles según spec §8:
 * role="tablist", tab, tabpanel, aria-selected, aria-controls,
 * navegación por flechas (Izq/Der/Arriba/Abajo) e Inicio/Fin.
 */
export function Tabs({
  items,
  activeId,
  onChange,
  ariaLabel,
  className = '',
}: TabsProps) {
  const baseId = useId();
  const tabListRef = useRef<HTMLDivElement>(null);

  const enabledItems = items.filter((item) => !item.disabled);
  const activeIndex = enabledItems.findIndex((item) => item.id === activeId);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (enabledItems.length === 0) return;

    let targetIndex = -1;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        targetIndex = (activeIndex + 1) % enabledItems.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        targetIndex =
          (activeIndex - 1 + enabledItems.length) % enabledItems.length;
        break;
      case 'Home':
        event.preventDefault();
        targetIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        targetIndex = enabledItems.length - 1;
        break;
    }

    if (targetIndex >= 0) {
      const nextTab = enabledItems[targetIndex]!;
      onChange(nextTab.id);
      const tabButton = tabListRef.current?.querySelector<HTMLButtonElement>(
        `#${baseId}-tab-${nextTab.id}`,
      );
      tabButton?.focus();
    }
  }

  const activeItem = items.find((item) => item.id === activeId) ?? items[0];

  return (
    <div className={`tabs-container ${className}`.trim()}>
      <div
        ref={tabListRef}
        role="tablist"
        aria-label={ariaLabel}
        className="tabs-list"
      >
        {items.map((item) => {
          const isSelected = item.id === activeId;
          const tabId = `${baseId}-tab-${item.id}`;
          const panelId = `${baseId}-panel-${item.id}`;
          return (
            <button
              key={item.id}
              id={tabId}
              role="tab"
              type="button"
              aria-selected={isSelected}
              aria-controls={panelId}
              tabIndex={isSelected ? 0 : -1}
              disabled={item.disabled}
              className={`tab-btn tab ${isSelected ? 'active tab-active' : ''}`.trim()}
              onClick={() => onChange(item.id)}
              onKeyDown={handleKeyDown}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {activeItem && (
        <div
          id={`${baseId}-panel-${activeItem.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${activeItem.id}`}
          tabIndex={0}
          className="tab-panel"
        >
          {activeItem.content}
        </div>
      )}
    </div>
  );
}
