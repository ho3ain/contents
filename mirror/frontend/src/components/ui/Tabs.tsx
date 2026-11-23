import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { isRtlLocale } from '../../i18n';

export interface TabItem<K extends string = string> {
  key: K;
  label: ReactNode;
}

export interface TabsProps<K extends string> {
  items: Array<TabItem<K>>;
  active: K;
  onChange: (key: K) => void;
  /** Accessible name of the tab list. */
  label: string;
  /** Prefix for tab/panel ids (pair with <TabPanel idPrefix>). */
  idPrefix: string;
  className?: string;
}

/**
 * WAI-ARIA tabs (design-system primitive) on the existing `.tabs` styles.
 * Keyboard: ←/→ move (mirrored in RTL), Home/End jump; roving tabindex so
 * the list is ONE tab stop. Panels are rendered by the caller with
 * <TabPanel> so inactive content can stay unmounted.
 */
export function Tabs<K extends string>({
  items,
  active,
  onChange,
  label,
  idPrefix,
  className,
}: TabsProps<K>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusAt = (index: number) => {
    const count = items.length;
    const next = (index + count) % count;
    refs.current[next]?.focus();
    onChange(items[next].key);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const forward = isRtlLocale() ? 'ArrowLeft' : 'ArrowRight';
    const backward = isRtlLocale() ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === forward) focusAt(index + 1);
    else if (event.key === backward) focusAt(index - 1);
    else if (event.key === 'Home') focusAt(0);
    else if (event.key === 'End') focusAt(items.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <div role="tablist" aria-label={label} className={['tabs', className].filter(Boolean).join(' ')}>
      {items.map((item, index) => {
        const selected = item.key === active;
        return (
          <button
            key={item.key}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.key}`}
            aria-selected={selected}
            // Panels may mount lazily (only the active one exists) — never point
            // aria-controls at an element that is not in the DOM.
            aria-controls={selected ? `${idPrefix}-panel-${item.key}` : undefined}
            tabIndex={selected ? 0 : -1}
            className={`tabs__tab${selected ? ' tabs__tab--active' : ''}`}
            onClick={() => onChange(item.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idPrefix,
  tabKey,
  children,
}: {
  idPrefix: string;
  tabKey: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${tabKey}`}
      aria-labelledby={`${idPrefix}-tab-${tabKey}`}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
