import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * MESH card pattern #2 — Product Row (management lists).
 * docs/MESH-CARD-DESIGN-SYSTEM.md › Product Row
 *
 * A row is for scanning many owned/managed items: identity › status ›
 * ONE primary action (+ optional overflow). The row itself is not a link —
 * the title is, so nested interactive content stays valid. Content is
 * passed in; the row never knows about the domain.
 */

export interface ProductRowProps extends Omit<HTMLAttributes<HTMLLIElement>, 'title'> {
  /** Fixed-size identity thumbnail (e.g. `<AgentLogo size={40} />`). */
  thumb?: ReactNode;
  /** Dominant line — usually a `<Link>`; rendered inside an `<h3>`. */
  title: ReactNode;
  /** Scannable status chip, kept beside the title. */
  status?: ReactNode;
  /** Secondary line: creator · purchase date · version… Use `<RowMeta>`. */
  meta?: ReactNode;
  /** The single primary, state-based action (button or link). */
  action?: ReactNode;
  /** Optional overflow menu (`<ProductRowMenu>`). */
  menu?: ReactNode;
  /** Refunded/suspended/archived — dims text, keeps actions readable. */
  inactive?: boolean;
  /** Heading level of the title (defaults to h3). */
  headingLevel?: 2 | 3 | 4;
}

export function ProductRow({
  thumb,
  title,
  status,
  meta,
  action,
  menu,
  inactive = false,
  headingLevel = 3,
  className,
  ...rest
}: ProductRowProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <li className={['product-row', inactive && 'product-row--inactive', className].filter(Boolean).join(' ')} {...rest}>
      {thumb && <div className="product-row__thumb">{thumb}</div>}
      <div className="product-row__main">
        <div className="product-row__head">
          <Heading className="product-row__title">{title}</Heading>
          {status && <span className="product-row__status">{status}</span>}
        </div>
        {meta && <div className="product-row__meta">{meta}</div>}
      </div>
      {(action || menu) && (
        <div className="product-row__actions">
          {action}
          {menu}
        </div>
      )}
    </li>
  );
}

/** Meta fragments separated by a hairline dot; children can be any inline nodes. */
export function RowMeta({ items }: { items: ReactNode[] }) {
  const visible = items.filter((item) => item !== null && item !== undefined && item !== false);
  return (
    <>
      {visible.map((item, index) => (
        <span key={index} className="product-row__meta-item">
          {index > 0 && (
            <span className="product-row__sep" aria-hidden="true">
              ·
            </span>
          )}
          {item}
        </span>
      ))}
    </>
  );
}

/**
 * The list container. Owns the single light-dismiss handler for every
 * `<ProductRowMenu>` inside (only one menu open at a time; Escape closes).
 */
export function ProductRowList({ children, className, ...rest }: HTMLAttributes<HTMLUListElement>) {
  const rootRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const closeAll = (except?: Element | null) => {
      root.querySelectorAll<HTMLDetailsElement>('details.row-menu[open]').forEach((menu) => {
        if (menu !== except) menu.open = false;
      });
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      closeAll(target?.closest('details.row-menu') ?? null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAll();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <ul ref={rootRef} className={['product-list', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </ul>
  );
}

export interface ProductRowMenuItem {
  key: string;
  label: ReactNode;
  /** Navigates when set; `onSelect` then runs as a click side-effect. */
  to?: string;
  onSelect?: () => void;
  testId?: string;
}

/**
 * Overflow menu for secondary, navigational actions. Native `<details>`
 * keeps it keyboard-operable without a positioning dependency; the parent
 * `ProductRowList` handles light dismiss.
 */
export function ProductRowMenu({ label, items, testId }: { label: string; items: ProductRowMenuItem[]; testId?: string }) {
  if (items.length === 0) return null;
  return (
    <details className="row-menu">
      <summary aria-label={label} title={label} data-testid={testId}>
        <span aria-hidden="true">⋯</span>
      </summary>
      <ul className="row-menu__list">
        {items.map((item) => (
          <li key={item.key}>
            {item.to ? (
              <Link to={item.to} onClick={item.onSelect} data-testid={item.testId}>
                {item.label}
              </Link>
            ) : (
              <button type="button" onClick={item.onSelect} data-testid={item.testId}>
                {item.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Loading rows with the exact geometry of real rows — no layout shift. */
function Bone({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function ProductRowSkeleton({ rows = 3, label }: { rows?: number; label?: string }) {
  return (
    <ul className="product-list" aria-busy="true" aria-label={label} data-testid="product-rows-skeleton">
      {Array.from({ length: rows }).map((_, index) => (
        <li key={index} className="product-row product-row--skeleton" aria-hidden="true">
          <div className="product-row__thumb">
            <Bone className="skel-thumb" />
          </div>
          <div className="product-row__main">
            <Bone className="skel-line skel-line--title" />
            <Bone className="skel-line skel-line--meta" />
          </div>
          <div className="product-row__actions">
            <Bone className="skel-action" />
          </div>
        </li>
      ))}
    </ul>
  );
}
