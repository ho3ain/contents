import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Card } from '../Card';
import { InlineSection } from '../InlineSection';
import { PriorityPanel } from '../PriorityPanel';
import { ProductRow, ProductRowList, ProductRowMenu, ProductRowSkeleton, RowMeta } from '../ProductRow';

/**
 * MESH card system (docs/MESH-CARD-DESIGN-SYSTEM.md) — behaviour and
 * semantics of the four patterns. No pixel/CSS assertions: the classes are
 * the contract between the component and mesh-cards.css, the DOM structure
 * is the contract with assistive tech.
 */

const LONG = 'یک نام خیلی خیلی طولانی برای محصول که باید بدون شکستن چیدمان بپیچد '.repeat(4);

describe('Card variants', () => {
  it('defaults to a neutral surface and exposes the product variant', () => {
    const { rerender } = render(<Card data-testid="c">x</Card>);
    expect(screen.getByTestId('c')).toHaveClass('card');
    expect(screen.getByTestId('c')).not.toHaveClass('card--product');
    rerender(
      <Card as="article" variant="product" data-testid="c">
        x
      </Card>,
    );
    expect(screen.getByTestId('c').tagName).toBe('ARTICLE');
    expect(screen.getByTestId('c')).toHaveClass('card', 'card--product');
    expect(screen.getByTestId('c')).not.toHaveClass('card--hover');
  });

  it('surface + hover keeps the legacy hover class', () => {
    render(
      <Card hover data-testid="c">
        x
      </Card>,
    );
    expect(screen.getByTestId('c')).toHaveClass('card--hover');
  });
});

describe('ProductRow', () => {
  function rows(extra?: Partial<Parameters<typeof ProductRow>[0]>) {
    return render(
      <MemoryRouter>
        <ProductRowList data-testid="list">
          <ProductRow
            data-testid="row-a"
            thumb={<span>A</span>}
            title={<a href="/a">Alpha</a>}
            status={<span data-testid="status">وضعیت</span>}
            meta={<RowMeta items={['از سازنده', null, 'خرید ۱۰ مهر', false, 'نسخه ۱']} />}
            action={<a href="/a/open">بازکردن</a>}
            menu={
              <ProductRowMenu
                label="گزینه‌های بیشتر"
                testId="more-a"
                items={[
                  { key: 'd', label: 'جزئیات', to: '/a' },
                  { key: 's', label: 'پشتیبانی', to: '/a/support' },
                ]}
              />
            }
            {...extra}
          />
          <ProductRow data-testid="row-b" title={LONG} inactive menu={<ProductRowMenu label="m" testId="more-b" items={[{ key: 'd', label: 'x', to: '/b' }]} />} />
        </ProductRowList>
      </MemoryRouter>,
    );
  }

  it('renders a list of list items with a heading per row and separators between meta items only', () => {
    rows();
    expect(screen.getByTestId('list').tagName).toBe('UL');
    const row = screen.getByTestId('row-a');
    expect(row.tagName).toBe('LI');
    expect(within(row).getByRole('heading', { level: 3 })).toHaveTextContent('Alpha');
    // 3 visible meta items → 2 separators (null/false skipped)
    expect(row.querySelectorAll('.product-row__sep')).toHaveLength(2);
    expect(row.querySelectorAll('.product-row__sep')[0]).toHaveAttribute('aria-hidden', 'true');
  });

  it('marks inactive rows and still renders long titles without extra markup', () => {
    rows();
    const b = screen.getByTestId('row-b');
    expect(b).toHaveClass('product-row--inactive');
    expect(within(b).getByRole('heading', { level: 3 })).toHaveTextContent(LONG.trim().slice(0, 20));
  });

  it('overflow menu: only one open at a time, Escape and outside click close it', () => {
    rows();
    const a = screen.getByTestId('more-a').closest('details') as HTMLDetailsElement;
    const b = screen.getByTestId('more-b').closest('details') as HTMLDetailsElement;
    a.open = true;
    expect(a.open).toBe(true);
    // opening another via pointer closes the first
    b.open = true;
    fireEvent.pointerDown(screen.getByTestId('more-b'));
    expect(a.open).toBe(false);
    expect(b.open).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(b.open).toBe(false);
    a.open = true;
    fireEvent.pointerDown(document.body);
    expect(a.open).toBe(false);
  });

  it('menu items navigate and fire the optional side effect; button items call onSelect', () => {
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <ProductRowList>
          <ProductRow
            title="x"
            menu={
              <ProductRowMenu
                label="m"
                items={[
                  { key: 'l', label: 'لینک', to: '/x', onSelect, testId: 'item-link' },
                  { key: 'b', label: 'دکمه', onSelect, testId: 'item-btn' },
                ]}
              />
            }
          />
        </ProductRowList>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('item-link')).toHaveAttribute('href', '/x');
    fireEvent.click(screen.getByTestId('item-link'));
    fireEvent.click(screen.getByTestId('item-btn'));
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('empty menu renders nothing; skeleton is busy and hidden from AT per row', () => {
    render(
      <MemoryRouter>
        <ProductRowMenu label="m" items={[]} />
        <ProductRowSkeleton rows={2} label="loading" />
      </MemoryRouter>,
    );
    expect(document.querySelector('details.row-menu')).toBeNull();
    const skel = screen.getByTestId('product-rows-skeleton');
    expect(skel).toHaveAttribute('aria-busy', 'true');
    expect(skel.querySelectorAll('li[aria-hidden="true"]')).toHaveLength(2);
  });
});

describe('PriorityPanel', () => {
  it('is a labelled section with one heading, semantic tone and optional parts', () => {
    const { rerender } = render(
      <PriorityPanel titleId="pp" title="دریافت را تأیید کنید" eyebrow="ادامه" description="چرا مهم است" actions={<button>تأیید</button>} data-testid="pp" />,
    );
    const panel = screen.getByTestId('pp');
    expect(panel.tagName).toBe('SECTION');
    expect(panel).toHaveAttribute('aria-labelledby', 'pp');
    expect(panel).toHaveAttribute('data-tone', 'accent');
    expect(panel).toHaveClass('priority-panel--plain');
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveTextContent('دریافت را تأیید کنید');
    expect(within(panel).getByRole('button')).toHaveTextContent('تأیید');

    rerender(<PriorityPanel titleId="pp" title="t" tone="danger" media={<span>L</span>} footer="۲ محصول دیگر" headingLevel={3} data-testid="pp" />);
    expect(screen.getByTestId('pp')).toHaveClass('priority-panel--danger');
    expect(screen.getByTestId('pp')).not.toHaveClass('priority-panel--plain');
    expect(within(screen.getByTestId('pp')).getByRole('heading', { level: 3 })).toBeInTheDocument();
    expect(screen.getByText('۲ محصول دیگر')).toBeInTheDocument();
  });
});

describe('InlineSection', () => {
  it('groups content under a heading without a card container', () => {
    render(
      <InlineSection titleId="s" title="محصولات من" count="۲ محصول" hint="راهنما" aside={<a href="/all">همه</a>} data-testid="s">
        <p>body</p>
      </InlineSection>,
    );
    const s = screen.getByTestId('s');
    expect(s.tagName).toBe('SECTION');
    expect(s).toHaveAttribute('aria-labelledby', 's');
    expect(s).not.toHaveClass('card');
    expect(within(s).getByRole('heading', { level: 2 })).toHaveTextContent('محصولات من');
    expect(within(s).getByText('۲ محصول')).toBeInTheDocument();
    expect(within(s).getByText('راهنما')).toBeInTheDocument();
    expect(within(s).getByRole('link', { name: 'همه' })).toHaveAttribute('href', '/all');
    expect(within(s).getByText('body')).toBeInTheDocument();
  });

  it('renders in RTL and LTR documents without depending on direction', () => {
    document.documentElement.dir = 'ltr';
    render(
      <InlineSection titleId="s2" title="Saved" data-testid="s2">
        <p>x</p>
      </InlineSection>,
    );
    expect(screen.getByTestId('s2')).toBeInTheDocument();
    document.documentElement.dir = 'rtl';
  });
});
