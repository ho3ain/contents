import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../../../api/client';
import type { ContentSeoView, SeoAnalysisReport } from '../../../../../api/seo';
import { ThemeProvider } from '../../../../../theme';
import { SeoStudioPanel } from '../SeoStudioPanel';

/**
 * SEO Studio panel — stored vs fallback vs forced values, its own save path,
 * debounced unsaved analysis + saved analysis after the host saves, grouped
 * recommendations with go-to, translation linking, and the "save first" state.
 */

const api = vi.hoisted(() => ({
  view: vi.fn(),
  upsert: vi.fn(),
  analyze: vi.fn(),
  analysis: vi.fn(),
  linkTranslation: vi.fn(),
  unlinkTranslation: vi.fn(),
}));
vi.mock('../../../../../api/seo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../api/seo')>();
  return { ...actual, seoAdminApi: { ...actual.seoAdminApi, ...api } };
});

const field = <T,>(
  effective: T,
  stored: T | null = null,
  source: 'stored' | 'fallback' | 'forced' = stored === null ? 'fallback' : 'stored',
) => ({
  stored,
  effective,
  source,
});

const view = (over: Partial<ContentSeoView> = {}): ContentSeoView => ({
  content: {
    type: 'post',
    id: 'p1',
    title: 'راهنمای عامل',
    slug: 'agent-guide',
    path: '/blog/agent-guide',
    status: 'draft',
    published: false,
    updatedAt: '',
  },
  fields: {
    seoTitle: field('راهنمای عامل'),
    seoDescription: field('خلاصهٔ مقاله', 'توضیح ذخیره‌شده'),
    canonicalUrl: field('http://localhost:5173/blog/agent-guide'),
    ogImageUrl: field<string | null>(null),
    ogTitle: field('راهنمای عامل'),
    ogDescription: field('خلاصهٔ مقاله'),
    twitterCard: field<'summary' | 'summary_large_image'>('summary_large_image'),
    robotsIndex: { stored: true, effective: false, source: 'forced' },
    robotsFollow: field(true, true),
    language: field<'fa' | 'en'>('fa', 'fa'),
  },
  focusKeyword: 'عامل هوشمند',
  relatedKeywords: ['اتوماسیون'],
  translationGroupId: null,
  translations: [],
  storage: 'blog_posts+content_seo',
  updatedAt: '2026-10-15T08:00:00.000Z',
  ...over,
});

const report = (over: Partial<SeoAnalysisReport> = {}): SeoAnalysisReport => ({
  engine: 'mesh-rules',
  version: 1,
  basis: 'unsaved',
  language: 'fa',
  score: {
    value: 58,
    label: 'MESH internal metric',
    criticalFailed: true,
    weights: { seo_title: 10, images_alt: 8 },
    note: { fa: 'یادداشت', en: 'note' },
  },
  stats: {
    words: 120,
    sentences: 8,
    paragraphs: 4,
    headings: 2,
    images: 1,
    imagesWithoutAlt: 1,
    internalLinks: 0,
    externalLinks: 1,
    brokenLinks: 0,
    unpublishedLinks: 0,
    keyword: { occurrences: 3, density: 2.5 },
  },
  recommendations: [
    {
      rule: 'images_alt',
      severity: 'critical',
      passed: false,
      applicable: true,
      title: { fa: 'تصویر بدون متن جایگزین', en: 'Image without alt' },
      problem: { fa: 'یک تصویر alt ندارد', en: '1 image lacks alt' },
      why: { fa: 'دسترس‌پذیری', en: 'accessibility' },
      fix: { fa: 'alt بنویسید', en: 'write alt' },
      location: { kind: 'block', position: 3 },
    },
    {
      rule: 'internal_links',
      severity: 'warning',
      passed: false,
      applicable: true,
      title: { fa: 'پیوند داخلی ندارد', en: 'No internal links' },
      problem: { fa: 'صفر پیوند', en: 'zero links' },
      why: { fa: 'گراف', en: 'graph' },
      fix: { fa: 'پیوند بدهید', en: 'add links' },
      location: { kind: 'panel', panel: 'links' },
    },
    {
      rule: 'seo_title',
      severity: 'critical',
      passed: true,
      applicable: true,
      title: { fa: 'عنوان سئو', en: 'SEO title' },
      problem: { fa: '', en: '' },
      why: { fa: '', en: '' },
      fix: { fa: '', en: '' },
      location: { kind: 'field', field: 'seoTitle' },
    },
  ],
  ...over,
});

const snapshot = {
  title: 'راهنمای عامل',
  slug: 'agent-guide',
  excerpt: 'خلاصهٔ مقاله',
  bodyMarkdown: '## بخش\n\nمتن',
  seoTitle: '',
  seoDescription: '',
  canonicalUrl: '',
  ogImageUrl: '',
  featuredImageUrl: '',
  version: 3,
  published: false,
};

const settle = () => act(() => new Promise((r) => setTimeout(r, 900)));
type PanelProps = Parameters<typeof SeoStudioPanel>[0];
const ui = (props: PanelProps) => (
  <ThemeProvider>
    <SeoStudioPanel {...props} />
  </ThemeProvider>
);

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.view.mockResolvedValue(view());
  api.analyze.mockResolvedValue(report());
  api.analysis.mockResolvedValue(report({ basis: 'saved', score: { ...report().score, value: 61 } }));
});

describe('SeoStudioPanel', () => {
  it('shows the save-first state for an unsaved article but still previews the SERP', () => {
    render(ui({ contentType: 'post', contentId: null, snapshot, readOnly: false, onGoTo: vi.fn() }));
    expect(screen.getByText(/ابتدا مقاله را ذخیره کنید|Save the article first/)).toBeInTheDocument();
    expect(screen.getByTestId('seo-serp')).toHaveTextContent('راهنمای عامل');
    expect(api.view).not.toHaveBeenCalled();
  });

  it('distinguishes stored, fallback and forced values and toggles the SERP device', async () => {
    render(ui({ contentType: 'post', contentId: 'p1', snapshot, readOnly: false, onGoTo: vi.fn() }));
    const effective = await screen.findByTestId('seo-effective');
    const badges = within(effective).getAllByText(/ذخیره‌شده|جایگزین خودکار|اجباری|stored|fallback|forced/);
    expect(badges.map((b) => b.getAttribute('data-source'))).toEqual(['fallback', 'stored', 'fallback', 'fallback', 'forced']);
    expect(screen.getByText(/محتوای منتشرنشده همیشه noindex|Unpublished content is always noindex/)).toBeInTheDocument();
    expect(screen.getByTestId('seo-serp')).toHaveAttribute('data-device', 'desktop');
    fireEvent.click(within(screen.getByTestId('seo-serp-device')).getByText(/موبایل|Mobile/));
    expect(screen.getByTestId('seo-serp')).toHaveAttribute('data-device', 'mobile');
    expect(screen.getByText(/تخمین است|an approximation/)).toBeInTheDocument();
  });

  it('shows the analysis of the saved copy while nothing is edited, then switches to the live analysis on the first edit', async () => {
    const { rerender } = render(ui({ contentType: 'post', contentId: 'p1', snapshot, readOnly: false, onGoTo: vi.fn(), hostDirty: false }));
    await screen.findByTestId('seo-fields');
    await waitFor(() => expect(screen.getByTestId('seo-basis')).toHaveTextContent(/ذخیره‌شده|saved copy/));
    expect(api.analysis).toHaveBeenCalledWith('post', 'p1');
    expect(screen.getByTestId('seo-score')).toHaveAttribute('data-value', '61');
    await settle();
    expect(api.analyze).not.toHaveBeenCalled();
    // The host edits the body → live analysis of the unsaved state.
    rerender(
      ui({
        contentType: 'post',
        contentId: 'p1',
        snapshot: { ...snapshot, bodyMarkdown: '## بخش\n\nمتن تازه' },
        readOnly: false,
        onGoTo: vi.fn(),
        hostDirty: true,
      }),
    );
    await settle();
    expect(api.analyze).toHaveBeenCalledTimes(1);
    expect(api.analyze.mock.calls[0][0]).toMatchObject({ bodyMarkdown: '## بخش\n\nمتن تازه' });
    expect(screen.getByTestId('seo-basis')).toHaveTextContent(/ذخیره‌نشده|unsaved/);
    expect(screen.getByTestId('seo-score')).toHaveAttribute('data-value', '58');
  });

  it('runs the debounced unsaved analysis, groups recommendations and routes go-to locations', async () => {
    const onGoTo = vi.fn();
    render(ui({ contentType: 'post', contentId: 'p1', snapshot, readOnly: false, onGoTo, hostDirty: true }));
    await screen.findByTestId('seo-fields');
    expect(api.analyze).not.toHaveBeenCalled();
    await settle();
    expect(api.analyze).toHaveBeenCalledTimes(1);
    expect(api.analyze.mock.calls[0][0]).toMatchObject({
      contentType: 'post',
      contentId: 'p1',
      language: 'fa',
      focusKeyword: 'عامل هوشمند',
      bodyMarkdown: '## بخش\n\nمتن',
    });
    expect(screen.getByTestId('seo-score')).toHaveAttribute('data-value', '58');
    expect(screen.getByText('MESH internal metric', { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId('seo-basis')).toHaveTextContent(/ذخیره‌نشده|unsaved/);
    const recs = screen.getAllByTestId('seo-rec');
    expect(recs.map((r) => r.getAttribute('data-rule'))).toEqual(['images_alt', 'internal_links']);
    fireEvent.click(within(recs[0]).getByTestId('seo-rec-goto'));
    expect(onGoTo).toHaveBeenCalledWith({ kind: 'block', position: 3 });
    fireEvent.click(screen.getByRole('button', { name: /نمایش قواعد پاس‌شده|Show passed rules/ }));
    expect(screen.getAllByTestId('seo-rec').map((r) => r.getAttribute('data-rule'))).toContain('seo_title');
    fireEvent.click(screen.getByRole('button', { name: /وزن امتیازها|Score weights/ }));
    expect(screen.getByTestId('seo-weights')).toHaveTextContent('seo_title');
  });

  it('saves its own fields through PUT and reports a language conflict', async () => {
    api.upsert
      .mockRejectedValueOnce(new ApiError('CONFLICT', 'conflict', 409))
      .mockResolvedValueOnce(view({ fields: { ...view().fields, language: field<'fa' | 'en'>('en', 'en') }, focusKeyword: 'agent' }));
    const onLanguage = vi.fn();
    render(ui({ contentType: 'post', contentId: 'p1', snapshot, readOnly: false, onGoTo: vi.fn(), onLanguage }));
    const save = await screen.findByTestId('seo-save');
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByTestId('seo-focus'), { target: { value: 'agent' } });
    fireEvent.click(within(screen.getByTestId('seo-language')).getByText('English (en)'));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(await screen.findByRole('alert')).toHaveTextContent(/گروه ترجمه|translation group/);
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText(/فیلدهای سئو ذخیره شد|SEO fields saved/)).toBeInTheDocument());
    expect(api.upsert).toHaveBeenLastCalledWith(
      'post',
      'p1',
      expect.objectContaining({ focusKeyword: 'agent', language: 'en', robotsIndex: true, relatedKeywords: ['اتوماسیون'] }),
    );
    expect(onLanguage).toHaveBeenLastCalledWith('en');
    expect(screen.getByTestId('seo-save')).toBeDisabled();
  });

  it('fetches the saved analysis when the host saves (version bump, no longer dirty)', async () => {
    const { rerender } = render(ui({ contentType: 'post', contentId: 'p1', snapshot, readOnly: false, onGoTo: vi.fn(), hostDirty: true }));
    await screen.findByTestId('seo-fields');
    await settle();
    expect(api.analysis).not.toHaveBeenCalled();
    rerender(
      ui({
        contentType: 'post',
        contentId: 'p1',
        snapshot: { ...snapshot, version: 4 },
        readOnly: false,
        onGoTo: vi.fn(),
        hostDirty: false,
      }),
    );
    await waitFor(() => expect(screen.getByTestId('seo-basis')).toHaveTextContent(/ذخیره‌شده|saved copy/));
    expect(api.analysis).toHaveBeenCalledWith('post', 'p1');
    expect(screen.getByTestId('seo-score')).toHaveAttribute('data-value', '61');
    // A version bump alone must not re-run the unsaved analysis.
    expect(api.analyze).toHaveBeenCalledTimes(1);
  });

  it('links and unlinks translations with validation', async () => {
    api.linkTranslation.mockResolvedValue(
      view({
        translationGroupId: 'g1',
        translations: [{ type: 'post', id: 'p2', language: 'en', title: 'Agent guide', path: '/blog/agent-guide-en', published: true }],
      }),
    );
    api.unlinkTranslation.mockResolvedValue(view());
    render(ui({ contentType: 'post', contentId: 'p1', snapshot, readOnly: false, onGoTo: vi.fn() }));
    const section = await screen.findByTestId('seo-translations');
    const input = within(section).getByPlaceholderText(/UUID/);
    fireEvent.change(input, { target: { value: 'nope' } });
    fireEvent.click(within(section).getByText(/پیوند ترجمه|Link translation/));
    expect(within(section).getByRole('alert')).toHaveTextContent(/UUID/);
    expect(api.linkTranslation).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '11111111-2222-3333-4444-555555555555' } });
    fireEvent.click(within(section).getByText(/پیوند ترجمه|Link translation/));
    expect(await within(section).findByText('Agent guide')).toBeInTheDocument();
    expect(api.linkTranslation).toHaveBeenCalledWith('post', 'p1', 'post', '11111111-2222-3333-4444-555555555555');
    fireEvent.click(within(section).getByText(/خروج از گروه|Leave group/));
    await waitFor(() => expect(within(section).queryByText('Agent guide')).not.toBeInTheDocument());
  });

  it('keeps saving possible when the analysis engine fails', async () => {
    api.analyze.mockRejectedValue(new Error('engine down'));
    api.analysis.mockRejectedValue(new Error('engine down'));
    render(ui({ contentType: 'post', contentId: 'p1', snapshot, readOnly: false, onGoTo: vi.fn() }));
    await screen.findByTestId('seo-fields');
    await settle();
    expect(screen.getByText(/تحلیل در دسترس نیست|Analysis unavailable/)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('seo-focus'), { target: { value: 'x' } });
    expect(screen.getByTestId('seo-save')).toBeEnabled();
  });
});
