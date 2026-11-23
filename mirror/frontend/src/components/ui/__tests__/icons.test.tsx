/**
 * MESH icon system — contract tests (PHASE H).
 *
 *  1. Registry: every base and custom name renders a real inline <svg>.
 *  2. Sizes: tokens resolve to the documented pixel values.
 *  3. Colour: nothing hard-codes a colour — fill/stroke are `currentColor`.
 *  4. A11y: decorative by default (aria-hidden); `label` → role="img" + name.
 *  5. Direction: logical names mirror via the `icon--dir` class, physical never.
 *  6. Data maps (nav, notifications, review, toasts) only reference known names.
 *  7. Exported SVG assets, the specimen and the favicon match the registry
 *     (no drift between `mesh.ts` and the files in the repo).
 */
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppIcon, type IconName } from '../AppIcon';
import { MeshIcon } from '../icons/MeshIcon';
import { StateIcon } from '../icons/StateIcon';
import { BASE_ICONS, DIRECTIONAL, baseIconNames } from '../icons/base';
import { MESH_ICONS, isMeshIconName, meshIconNames } from '../icons/mesh';
import { ICON_SIZES, iconPx } from '../icons/types';
import { iconForItem } from '../../../lib/nav';
import { notificationVisual } from '../../../lib/buy';
import { reviewStateInfo, REVIEW_STATES } from '../../../lib/review';
import { checkStatusIcon } from '../../../lib/launch';
import { toastIcons } from '../../feedback/toastConfig';
import { PANELS } from '../../../lib/panel-storage';
import { exportAll, loadRegistry } from '../../../../scripts/icons/export-mesh-icons.mjs';

const ROOT = resolve(__dirname, '../../../..');
const ALL_NAMES: IconName[] = [...baseIconNames, ...meshIconNames];
const isKnown = (name: string): name is IconName => name in BASE_ICONS || isMeshIconName(name);

describe('icon registry', () => {
  it('has no overlap between the Lucide catalogue and the custom MESH family', () => {
    const overlap = baseIconNames.filter((name) => isMeshIconName(name));
    expect(overlap).toEqual([]);
  });

  it('renders every base name as an inline svg with the system class', () => {
    for (const name of baseIconNames) {
      const { container, unmount } = render(<AppIcon name={name} />);
      const svg = container.querySelector('svg');
      expect(svg, name).not.toBeNull();
      expect(svg, name).toHaveClass('icon');
      expect(svg?.getAttribute('data-icon'), name).toBe(name);
      unmount();
    }
  });

  it('renders every MESH name with ≥1 path/circle and a 24-grid viewBox', () => {
    for (const name of meshIconNames) {
      const { container, unmount } = render(<MeshIcon name={name} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('viewBox'), name).toBe('0 0 24 24');
      expect(svg?.querySelectorAll('path, circle').length, name).toBeGreaterThan(0);
      expect(svg, name).toHaveClass('icon--mesh');
      unmount();
    }
  });

  it('AppIcon dispatches custom names to the MESH renderer', () => {
    const { container } = render(<AppIcon name="agent" />);
    expect(container.querySelector('svg')).toHaveClass('icon--mesh-agent');
  });

  it('every MESH definition carries a documented meaning', () => {
    for (const [name, def] of Object.entries(MESH_ICONS)) {
      expect(def.meaning.length, name).toBeGreaterThan(10);
      expect(def.shapes.length, name).toBeGreaterThan(0);
      expect(def.shapes.length, `${name} stays minimal`).toBeLessThanOrEqual(8);
    }
  });
});

describe('size tokens', () => {
  it('map to the documented pixel values', () => {
    expect(ICON_SIZES).toEqual({ xs: 16, sm: 20, md: 24, lg: 32 });
    expect(iconPx('xs')).toBe(16);
    expect(iconPx(undefined)).toBe(20);
    expect(iconPx(14)).toBe(14);
  });

  it('set width and height on both families', () => {
    const base = render(<AppIcon name="bell" size="md" />).container.querySelector('svg');
    expect(base?.getAttribute('width')).toBe('24');
    expect(base?.getAttribute('height')).toBe('24');
    const mesh = render(<MeshIcon name="builder" size="xs" />).container.querySelector('svg');
    expect(mesh?.getAttribute('width')).toBe('16');
    expect(mesh?.getAttribute('height')).toBe('16');
  });
});

describe('colour', () => {
  it('inherits currentColor — no fixed colours in base or custom glyphs', () => {
    for (const name of ALL_NAMES) {
      const { container, unmount } = render(<AppIcon name={name} />);
      const html = container.innerHTML;
      expect(html, name).not.toMatch(/#[0-9a-f]{3,8}/i);
      expect(html, name).not.toMatch(/rgb\(/);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('stroke'), name).toBe('currentColor');
      unmount();
    }
  });

  it('filled variants fill with currentColor only', () => {
    const svg = render(<AppIcon name="star" filled />).container.querySelector('svg');
    expect(svg?.getAttribute('fill')).toBe('currentColor');
    const outline = render(<AppIcon name="star" />).container.querySelector('svg');
    expect(outline?.getAttribute('fill')).toBe('none');
  });

  it('tones are classes bound to semantic tokens, never inline colours', () => {
    const svg = render(<AppIcon name="checkCircle" tone="success" />).container.querySelector('svg');
    expect(svg).toHaveClass('icon--success');
    expect(svg?.getAttribute('style')).toBeNull();
  });
});

describe('accessibility', () => {
  it('is decorative by default (aria-hidden, no role)', () => {
    const svg = render(<AppIcon name="search" />).container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
    expect(svg).toHaveAttribute('focusable', 'false');
  });

  it('becomes an image with a name when `label` is given (both families)', () => {
    const base = render(<AppIcon name="verified" label="Verified creator" />).container.querySelector('svg');
    expect(base).toHaveAttribute('role', 'img');
    expect(base).toHaveAttribute('aria-label', 'Verified creator');
    expect(base).not.toHaveAttribute('aria-hidden');
    const mesh = render(<MeshIcon name="mark" label="MESH" />).container.querySelector('svg');
    expect(mesh).toHaveAttribute('role', 'img');
    expect(mesh).toHaveAttribute('aria-label', 'MESH');
  });

  it('StateIcon exposes the state as data and a tone, decorative by default', () => {
    const svg = render(<StateIcon state="done" />).container.querySelector('svg');
    expect(svg).toHaveAttribute('data-state', 'done');
    expect(svg).toHaveClass('icon--success');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('RTL / LTR policy', () => {
  it('logical names carry the mirror class; physical names never do', () => {
    for (const name of ['arrowBack', 'arrowForward', 'chevronStart', 'chevronEnd', 'logOut', 'external'] as const) {
      expect(DIRECTIONAL.has(name), name).toBe(true);
      const svg = render(<AppIcon name={name} />).container.querySelector('svg');
      expect(svg, name).toHaveClass('icon--dir');
    }
    for (const name of ['arrowLeft', 'arrowRight', 'chevronLeft', 'chevronRight', 'chevronDown', 'search', 'close', 'star'] as const) {
      expect(DIRECTIONAL.has(name), name).toBe(false);
      const svg = render(<AppIcon name={name} />).container.querySelector('svg');
      expect(svg, name).not.toHaveClass('icon--dir');
    }
  });

  it('custom MESH icons are symmetrical/non-directional and never mirror', () => {
    for (const name of meshIconNames) {
      const svg = render(<MeshIcon name={name} />).container.querySelector('svg');
      expect(svg, name).not.toHaveClass('icon--dir');
    }
  });

  it('`flip` overrides the default per instance', () => {
    expect(render(<AppIcon name="arrowBack" flip="never" />).container.querySelector('svg')).not.toHaveClass('icon--dir');
    expect(render(<AppIcon name="search" flip="always" />).container.querySelector('svg')).toHaveClass('icon--dir');
  });

  it('the stylesheet mirrors `.icon--dir` only under dir="rtl"', () => {
    const css = readFileSync(resolve(ROOT, 'src/index.css'), 'utf8');
    expect(css).toMatch(/\[dir='rtl'\]\s+\.icon--dir\s*\{[^}]*scaleX\(-1\)/);
    expect(css).not.toMatch(/\[dir='ltr'\]\s+\.icon--dir/);
  });
});

describe('data-driven icon maps reference only known names', () => {
  it('sidebar heuristics (incl. the previously wrong routes)', () => {
    expect(iconForItem({ to: '/admin/support-ops', label: '' })).toBe('headphones');
    expect(iconForItem({ to: '/creator/agents/new', label: '' })).toBe('builder');
    expect(iconForItem({ to: '/admin/creator-opportunities', label: '' })).toBe('ideas');
    expect(iconForItem({ to: '/x', label: '', icon: 'wallet' })).toBe('wallet');
    for (const to of [
      '/creator', '/creator/agents', '/creator/agents/new', '/creator/review', '/creator/sales', '/creator/analytics', '/creator/growth',
      '/creator/success', '/creator/portfolio', '/creator/ideas', '/creator/support', '/creator/settings', '/library', '/buyer/products',
      '/me/favorites', '/me/follows', '/me/interests', '/orders', '/me/reviews', '/me/reports', '/support', '/me/notifications', '/settings',
      '/admin', '/admin/agents', '/admin/review-queue', '/admin/users', '/admin/roles', '/admin/promotions', '/admin/crm', '/admin/refunds',
      '/admin/payments', '/admin/moderation', '/admin/risk', '/admin/audit', '/admin/taxonomy', '/admin/blog', '/admin/platform', '/unknown',
    ]) {
      expect(isKnown(iconForItem({ to, label: '' })), to).toBe(true);
    }
  });

  it('notification visuals, review states, publish checks, toasts, panels', () => {
    for (const type of [
      'purchase_success', 'new_sale', 'first_sale', 'promotion_update', 'payment_failed', 'refund_requested', 'review_submitted',
      'report_status', 'support_reply', 'account_status', 'agent_published', 'first_product_created', 'product_updated', 'first_favorite',
      'followed_new_product', 'product_ready', 'setup_reminder', 'review_request', 'agent_review_result', 'verification_update', 'nope',
    ]) {
      expect(isKnown(notificationVisual(type).icon), type).toBe(true);
    }
    for (const state of [...REVIEW_STATES, 'draft'] as const) expect(isKnown(reviewStateInfo(state).icon), state).toBe(true);
    for (const status of ['complete', 'needs_attention', 'required'] as const) expect(isKnown(checkStatusIcon(status))).toBe(true);
    for (const icon of Object.values(toastIcons)) expect(isKnown(icon)).toBe(true);
    for (const panel of Object.values(PANELS)) expect(isKnown(panel.icon)).toBe(true);
  });
});

describe('exported assets stay in sync with the registry', () => {
  const generated = exportAll(loadRegistry());

  it('the exporter sees the same names as the TypeScript registry', () => {
    const names = Object.keys(generated)
      .filter((file) => file.startsWith('src/assets/icons/mesh/'))
      .map((file) => file.replace('src/assets/icons/mesh/', '').replace('.svg', ''));
    expect(names.sort()).toEqual([...meshIconNames].sort());
  });

  it('every svg, the specimen and the favicon on disk equal the generated output', () => {
    for (const [rel, content] of Object.entries(generated)) {
      expect(readFileSync(resolve(ROOT, rel), 'utf8'), rel).toBe(content);
    }
  });

  it('exported svgs are clean: 24-grid, currentColor, no raster/metadata/scripts/fixed colours', () => {
    for (const [rel, content] of Object.entries(generated)) {
      if (!rel.startsWith('src/assets/icons/mesh/')) continue;
      expect(content, rel).toContain('viewBox="0 0 24 24"');
      expect(content, rel).toContain('stroke="currentColor"');
      expect(content, rel).not.toMatch(/<(image|script|metadata|style|g)\b/);
      expect(content, rel).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });
});

describe('website chrome marks (flags + social brands)', () => {
  it('FlagIcon draws both locale flags as inline SVG, decorative by default, named when labelled', async () => {
    const { FlagIcon } = await import('../icons/FlagIcon');
    const { container, unmount } = render(
      <>
        <FlagIcon code="ir" />
        <FlagIcon code="gb" width={30} label="English" />
      </>,
    );
    const [ir, gb] = container.querySelectorAll('svg');
    expect(ir).toHaveAttribute('aria-hidden', 'true');
    expect(ir).toHaveAttribute('width', '22');
    expect(ir).toHaveAttribute('height', '15'); // 3:2
    expect(ir.querySelectorAll('rect, path').length).toBeGreaterThan(3);
    expect(gb).toHaveAttribute('role', 'img');
    expect(gb).toHaveAccessibleName('English');
    // two instances must not share clipPath ids
    const ids = [...container.querySelectorAll('clipPath')].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    unmount();
  });

  it('SocialIcon renders every network as an inline svg inheriting currentColor', async () => {
    const { SocialIcon } = await import('../icons/SocialIcon');
    const { SOCIAL_LINKS } = await import('../../../content/social-links');
    const { container, unmount } = render(
      <>
        {SOCIAL_LINKS.map((l) => (
          <SocialIcon key={l.id} network={l.id} />
        ))}
      </>,
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(SOCIAL_LINKS.length);
    for (const svg of svgs) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg.getAttribute('fill')).toBe('currentColor');
      expect(svg.querySelector('path')).not.toBeNull();
      expect(svg.outerHTML).not.toMatch(/#[0-9a-f]{3,6}/i); // no baked-in brand colour
    }
    unmount();
  });
});
