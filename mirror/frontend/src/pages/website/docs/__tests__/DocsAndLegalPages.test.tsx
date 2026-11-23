import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../../api/client';
import { DOCS_ARTICLES, DOCS_SECTIONS } from '../../../../content/docs';
import { CURRENT_TERMS_VERSION, LEGAL_DOCUMENTS } from '../../../../content/legal/legal-documents';
import { I18nProvider, setLocale } from '../../../../i18n';
import { DocsPage } from '../DocsPage';
import { LegalDocumentPage, LegalIndexPage } from '../LegalDocumentPage';

const check = vi.fn();
vi.mock('../../../../api/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../api/endpoints')>();
  return { ...actual, healthApi: { check: () => check() } };
});

function Probe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.hash}`}</div>;
}

function ui(path: string, locale: 'fa' | 'en' = 'fa') {
  setLocale(locale);
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/docs/:slug" element={<DocsPage />} />
          <Route path="/legal" element={<LegalIndexPage />} />
          <Route path="/legal/:doc" element={<LegalDocumentPage />} />
        </Routes>
        <Probe />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('DocsPage — documentation center', () => {
  beforeEach(() => {
    check.mockReset();
    check.mockResolvedValue({ status: 'ok', database: 'up', time: '2026-10-13T00:00:00Z' });
  });

  it('renders the landing with one card per section and the legal shortcuts', () => {
    ui('/docs');
    expect(screen.getByTestId('docs-landing')).toBeInTheDocument();
    for (const section of DOCS_SECTIONS) expect(screen.getByTestId(`docs-card-${section.key}`)).toBeInTheDocument();
    expect(document.querySelector(`a[href="${LEGAL_DOCUMENTS.terms.path}"]`)).not.toBeNull();
    expect(document.querySelector(`a[href="${LEGAL_DOCUMENTS.refund.path}"]`)).not.toBeNull();
    expect(document.title).toContain('MESH');
  });

  it('lists every article in the sidebar and marks the current one', () => {
    ui('/docs/how-to-buy');
    const sidebar = screen.getByTestId('docs-sidebar');
    for (const article of DOCS_ARTICLES) expect(sidebar.querySelector(`a[href="/docs/${article.slug}"]`)).not.toBeNull();
    expect(sidebar.querySelector('a[aria-current="page"]')).toHaveAttribute('href', '/docs/how-to-buy');
    expect(screen.getByTestId('docs-article-title')).toBeInTheDocument();
    expect(screen.getByTestId('docs-toc').querySelectorAll('a').length).toBeGreaterThan(1);
    expect(screen.getByTestId('docs-prev')).toBeInTheDocument();
    expect(screen.getByTestId('docs-next')).toBeInTheDocument();
  });

  it('search opens from the sidebar in a dialog, works on real content in both languages, and opens the top hit on submit', () => {
    const { unmount } = ui('/docs');
    // The landing heading lives in the content column (no hero band).
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('هر آنچه باید دربارهٔ MESH بدانید');
    expect(screen.queryByRole('searchbox')).toBeNull();
    fireEvent.click(screen.getByTestId('docs-search-trigger'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const input = screen.getByRole('searchbox');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'بازگشت وجه' } });
    expect(screen.getByTestId('docs-search-status')).not.toHaveTextContent('نتیجه‌ای');
    const results = screen.getByTestId('docs-search-results');
    expect(results.querySelectorAll('li').length).toBeGreaterThan(0);
    expect(results.querySelector('a[href^="/docs/refunds"]')).not.toBeNull();
    fireEvent.submit(screen.getByTestId('docs-search'));
    expect(screen.getByTestId('location').textContent).toMatch(/^\/docs\//);
    // Submitting closes the dialog.
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();

    ui('/docs', 'en');
    fireEvent.click(screen.getByTestId('docs-search-trigger'));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'rate limit' } });
    expect(screen.getByTestId('docs-search-results').querySelector('a[href^="/docs/errors-and-rate-limits"]')).not.toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzqxv' } });
    expect(screen.queryByTestId('docs-search-results')).toBeNull();
    expect(screen.getByTestId('docs-search-status')).toHaveTextContent(/zzqxv/);
    // Esc closes and hands focus back to the trigger; `/` opens it again.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('docs-search-trigger')).toHaveFocus();
    fireEvent.keyDown(document, { key: '/' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('`?q=` opens the search dialog pre-filled', () => {
    ui('/docs?q=payout', 'en');
    const input = screen.getByRole('searchbox');
    expect(input).toHaveValue('payout');
    expect(screen.getByTestId('docs-search-results').querySelector('a[href^="/docs/earnings-and-payouts"]')).not.toBeNull();
  });

  it('shows a not-found state with navigation for an unknown slug', () => {
    ui('/docs/does-not-exist');
    expect(screen.getByTestId('docs-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('docs-article')).toBeNull();
    expect(document.querySelector('a[href="/docs"]')).not.toBeNull();
  });

  it('renders code blocks with a copy button and tables inside the developer docs', () => {
    ui('/docs/public-catalog-endpoints');
    const body = screen.getByTestId('docs-article-body');
    expect(body.querySelectorAll('pre').length).toBeGreaterThan(0);
    expect(body.querySelectorAll('table').length).toBeGreaterThan(0);
    expect(body.querySelectorAll('button.article-code-copy').length).toBeGreaterThan(0);
  });

  it('service status reflects the live health probe honestly', async () => {
    ui('/docs/service-status');
    const widget = await screen.findByTestId('service-status');
    await waitFor(() => expect(widget).toHaveAttribute('data-state', 'ok'));
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('service status reports degraded on 503 and unreachable on network failure', async () => {
    check.mockRejectedValueOnce(new ApiError('SERVICE_UNAVAILABLE', 'db down', 503));
    const { unmount } = ui('/docs/service-status');
    await waitFor(() => expect(screen.getByTestId('service-status')).toHaveAttribute('data-state', 'degraded'));
    unmount();
    check.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', 'offline', 0));
    ui('/docs/service-status');
    await waitFor(() => expect(screen.getByTestId('service-status')).toHaveAttribute('data-state', 'unreachable'));
  });

  it('the English dictionary renders English chrome (no untranslated keys)', () => {
    ui('/docs/how-to-buy', 'en');
    expect(screen.getByTestId('docs-page').textContent).not.toMatch(/\b(docs|site|legal)\.[a-z]+\./);
    expect(screen.getByTestId('docs-sidebar')).toHaveTextContent('Getting started');
  });
});

describe('LegalDocumentPage', () => {
  it('renders the /legal hub without exposing internal documentation and labels every current public text Draft', () => {
    ui('/legal');
    expect(screen.getByTestId('legal-index')).toBeInTheDocument();
    expect(screen.getByTestId('legal-index-no-effective')).toBeInTheDocument();
    for (const key of ['terms', 'privacy', 'refund'] as const) {
      const card = screen.getByTestId(`legal-index-${key}`);
      expect(card).toHaveTextContent('پیش‌نویس');
      expect(card.querySelector(`a[href="${LEGAL_DOCUMENTS[key].path}"]`)).not.toBeNull();
    }
    expect(document.querySelector('a[href*="decision"], a[href*="research"], a[href*="traceability"]')).toBeNull();
  });

  it.each(['terms', 'privacy', 'refunds'])('renders /legal/%s with Draft status, version, TOC and cross links', (slug) => {
    ui(`/legal/${slug}`);
    expect(screen.getByTestId('legal-page')).toBeInTheDocument();
    expect(screen.getByTestId('legal-version')).toHaveTextContent(CURRENT_TERMS_VERSION);
    expect(screen.getByTestId('legal-draft-notice')).toBeInTheDocument();
    expect(screen.getByTestId('legal-toc').querySelectorAll('a').length).toBeGreaterThan(2);
    expect(screen.getByTestId('legal-body').querySelectorAll('h2').length).toBeGreaterThan(2);
    for (const key of ['terms', 'privacy', 'refund'] as const) {
      expect(document.querySelector(`.legal-others a[href="${LEGAL_DOCUMENTS[key].path}"]`)).not.toBeNull();
    }
    expect(document.querySelector('a[href="/contact?topic=general"]')).not.toBeNull();
    expect(document.title).toContain('MESH');
  });

  it('uses the same version in both languages and never leaks a placeholder', () => {
    const { unmount } = ui('/legal/terms');
    const fa = screen.getByTestId('legal-body').textContent ?? '';
    unmount();
    ui('/legal/terms', 'en');
    const en = screen.getByTestId('legal-body').textContent ?? '';
    for (const text of [fa, en]) {
      expect(text).not.toMatch(/lorem|TODO|TBD|\[company\]|\[address\]/i);
      expect(text.length).toBeGreaterThan(2000);
    }
    expect(screen.getByTestId('legal-version')).toHaveTextContent(CURRENT_TERMS_VERSION);
  });

  it('shows a not-found state for unknown documents with links to the real ones', () => {
    ui('/legal/cookies');
    expect(screen.getByTestId('legal-not-found')).toBeInTheDocument();
    expect(document.querySelector(`a[href="${LEGAL_DOCUMENTS.privacy.path}"]`)).not.toBeNull();
  });
});
