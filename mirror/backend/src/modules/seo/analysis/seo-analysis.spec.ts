import { renderBlogMarkdown } from '../../blog/domain/blog-markdown';
import { readability, englishSyllables } from './readability';
import {
  analyzeContent,
  CRITICAL_RULES,
  RULE_IDS,
  RULE_WEIGHTS,
  type AnalysisInput,
} from './seo-analysis';

const faBody = [
  '## چرا انتخاب ایجنت هوش مصنوعی سخت است؟',
  '',
  'انتخاب ایجنت هوش مصنوعی برای یک تیم کوچک تصمیم ساده‌ای نیست. باید نیاز واقعی را بشناسید. سپس مدل تحویل را بسنجید.',
  '',
  ...Array.from(
    { length: 12 },
    (_, i) =>
      `پاراگراف ${i + 1}: این متن برای رسیدن به حداقل طول است و دربارهٔ معیارهای ارزیابی، امنیت داده، هزینه و پشتیبانی توضیح می‌دهد. هر جمله کوتاه است. خواندن آن آسان است.\n`,
  ),
  '### معیارهای ارزیابی ایجنت هوش مصنوعی',
  '',
  'به [راهنمای خرید](/blog/buying-guide) و [محصول](/agents/invoice-sentinel) سر بزنید.',
  '',
  '![نمودار مقایسه](https://cdn.example/x.png "مقایسه")',
].join('\n');

const base = (over: Partial<AnalysisInput> = {}): AnalysisInput => {
  const rendered = renderBlogMarkdown(over.blocks ? '' : faBody);
  return {
    contentType: 'post',
    language: 'fa',
    basis: 'unsaved',
    title: 'چطور اولین ایجنت هوش مصنوعی خود را انتخاب کنیم؟',
    slug: 'choose-first-ai-agent',
    excerpt:
      'پیش از خرید ایجنت هوش مصنوعی سه چیز را بخوانید: نیازمندی‌ها، مدل تحویل و سیاست داده. این راهنما قدم‌به‌قدم کمک می‌کند.',
    seoTitle: 'انتخاب اولین ایجنت هوش مصنوعی: راهنمای عملی',
    seoDescription:
      'پیش از خرید ایجنت هوش مصنوعی سه چیز را بخوانید: نیازمندی‌ها، مدل تحویل و سیاست داده. راهنمای قدم‌به‌قدم MESH.',
    canonicalUrl: null,
    socialImageUrl: 'https://cdn.example/og.png',
    robotsIndex: true,
    focusKeyword: 'ایجنت هوش مصنوعی',
    relatedKeywords: [],
    blocks: rendered.blocks,
    links: [
      {
        href: '/blog/buying-guide',
        anchor: 'راهنمای خرید',
        position: 15,
        internal: true,
        status: 'ok',
      },
      {
        href: '/agents/invoice-sentinel',
        anchor: 'محصول',
        position: 15,
        internal: true,
        status: 'ok',
      },
    ],
    inboundLinks: 2,
    duplicates: { title: [], description: [] },
    siteOrigin: 'https://mesh.example',
    ...over,
  };
};

describe('seo-analysis — engine', () => {
  it('weights cover every rule and critical rules are a subset', () => {
    for (const id of RULE_IDS)
      expect(RULE_WEIGHTS[id]).toBeGreaterThanOrEqual(0);
    for (const id of CRITICAL_RULES) expect(RULE_IDS).toContain(id);
  });

  it('scores a well-formed Persian article highly and reports stats', () => {
    const report = analyzeContent(base());
    expect(report.engine).toBe('mesh-rules');
    expect(report.score.label).toBe('MESH internal metric');
    expect(report.score.criticalFailed).toBe(false);
    expect(report.score.value).toBeGreaterThanOrEqual(85);
    expect(report.stats.words).toBeGreaterThan(300);
    expect(report.stats.internalLinks).toBe(2);
    expect(report.stats.images).toBe(1);
    expect(report.stats.keyword?.occurrences).toBeGreaterThan(0);
    const byRule = Object.fromEntries(
      report.recommendations.map((r) => [r.rule, r]),
    );
    expect(byRule.keyword_in_title.passed).toBe(true);
    expect(byRule.keyword_in_intro.passed).toBe(true);
    expect(byRule.keyword_in_headings.passed).toBe(true);
    expect(byRule.heading_structure.passed).toBe(true);
    expect(byRule.readability.passed).toBe(true);
    expect(report.recommendations.every((r) => r.title.fa && r.title.en)).toBe(
      true,
    );
  });

  it('caps the score at 49 when a critical rule fails and points at the field', () => {
    const report = analyzeContent(
      base({ seoTitle: 'کوتاه', seoDescription: null, excerpt: 'کم' }),
    );
    expect(report.score.criticalFailed).toBe(true);
    expect(report.score.value).toBeLessThanOrEqual(49);
    const title = report.recommendations.find((r) => r.rule === 'seo_title');
    expect(title?.passed).toBe(false);
    expect(title?.location).toEqual({ kind: 'field', field: 'seoTitle' });
    const desc = report.recommendations.find(
      (r) => r.rule === 'seo_description',
    );
    expect(desc?.data?.fallback).toBe(true);
    // failed rules come first
    expect(report.recommendations[0].passed).toBe(false);
  });

  it('flags keyword stuffing as critical and never asks for more repetitions', () => {
    const stuffed =
      Array.from({ length: 60 }, () => 'ایجنت هوش مصنوعی').join(' ') + ' تمام.';
    const report = analyzeContent(
      base({ blocks: renderBlogMarkdown(stuffed).blocks, links: [] }),
    );
    const density = report.recommendations.find(
      (r) => r.rule === 'keyword_density',
    );
    expect(density?.passed).toBe(false);
    expect(density?.severity).toBe('critical');
    expect(density?.data?.stuffing).toBe(true);
    expect(density?.fix.fa).toContain('حذف');
  });

  it('detects broken/unpublished links, missing alt, heading skips and long paragraphs with block positions', () => {
    const md = [
      '#### پرش سطح',
      '',
      Array.from({ length: 160 }, (_, i) => `کلمه${i}`).join(' '),
      '',
      '![](https://cdn.example/no-alt.png)',
      '',
      '[شکسته](/blog/missing) و [پیش‌نویس](/blog/draft-only)',
    ].join('\n');
    const report = analyzeContent(
      base({
        blocks: renderBlogMarkdown(md).blocks,
        links: [
          {
            href: '/blog/missing',
            anchor: 'شکسته',
            position: 3,
            internal: true,
            status: 'broken',
          },
          {
            href: '/blog/draft-only',
            anchor: 'پیش‌نویس',
            position: 3,
            internal: true,
            status: 'unpublished',
          },
        ],
      }),
    );
    const by = Object.fromEntries(
      report.recommendations.map((r) => [r.rule, r]),
    );
    expect(by.broken_links.passed).toBe(false);
    expect(by.broken_links.location).toEqual({ kind: 'block', position: 3 });
    expect(by.unpublished_links.passed).toBe(false);
    expect(by.images_alt.passed).toBe(false);
    expect(by.images_alt.location).toEqual({ kind: 'block', position: 2 });
    expect(by.heading_structure.passed).toBe(false);
    expect(by.heading_structure.location).toEqual({
      kind: 'block',
      position: 0,
    });
    expect(by.paragraph_length.passed).toBe(false);
    expect(by.paragraph_length.location).toEqual({
      kind: 'block',
      position: 1,
    });
  });

  it('marks inbound/duplicate rules not applicable without saved data and labels the basis', () => {
    const unsaved = analyzeContent(base({ inboundLinks: null }));
    expect(
      unsaved.recommendations.find((r) => r.rule === 'inbound_links'),
    ).toBeUndefined();
    expect(unsaved.score.note.fa).toContain('ذخیره‌نشده');
    const saved = analyzeContent(
      base({
        basis: 'saved',
        inboundLinks: 0,
        duplicates: { title: ['x'], description: [] },
      }),
    );
    const by = Object.fromEntries(
      saved.recommendations.map((r) => [r.rule, r]),
    );
    expect(by.inbound_links.passed).toBe(false);
    expect(by.duplicate_title.passed).toBe(false);
    expect(by.duplicate_title.data?.count).toBe(1);
    expect(saved.score.note.en).toContain('saved');
  });

  it('handles English content with Flesch readability and keyword rules', () => {
    const en = [
      '## Why choosing an AI agent is hard',
      '',
      'Choosing an AI agent for a small team is not simple. You need to know the real need. Then weigh the delivery model.',
      '',
      ...Array.from(
        { length: 14 },
        (_, i) =>
          `Paragraph ${i + 1} explains evaluation criteria, data security, cost and support in short sentences. Each sentence is short. Reading is easy.\n`,
      ),
      '### Evaluation criteria for an AI agent',
      '',
      'See the [buying guide](/blog/buying-guide).',
    ].join('\n');
    const report = analyzeContent(
      base({
        language: 'en',
        title: 'How to choose your first AI agent',
        seoTitle: 'How to choose your first AI agent: a practical guide',
        seoDescription:
          'Before buying an AI agent read three things: requirements, delivery model and data policy. A step-by-step MESH guide.',
        focusKeyword: 'AI agent',
        blocks: renderBlogMarkdown(en).blocks,
        links: [
          {
            href: '/blog/buying-guide',
            anchor: 'buying guide',
            position: 17,
            internal: true,
            status: 'ok',
          },
        ],
      }),
    );
    expect(report.language).toBe('en');
    expect(report.stats.readability.fleschReadingEase).not.toBeNull();
    const by = Object.fromEntries(
      report.recommendations.map((r) => [r.rule, r]),
    );
    expect(by.keyword_in_title.passed).toBe(true);
    expect(by.readability.passed).toBe(true);
    expect(report.score.value).toBeGreaterThanOrEqual(80);
  });

  it('validates canonical and robots', () => {
    const bad = analyzeContent(
      base({ canonicalUrl: 'not a url', robotsIndex: false }),
    );
    const by = Object.fromEntries(bad.recommendations.map((r) => [r.rule, r]));
    expect(by.canonical.passed).toBe(false);
    expect(by.robots.passed).toBe(false);
    const cross = analyzeContent(
      base({ canonicalUrl: 'https://other.example/a' }),
    );
    expect(
      cross.recommendations.find((r) => r.rule === 'canonical')?.data
        ?.crossDomain,
    ).toBe(true);
  });
});

describe('readability', () => {
  it('estimates English syllables and Flesch', () => {
    expect(englishSyllables('agent')).toBe(2);
    expect(englishSyllables('the')).toBe(1);
    expect(englishSyllables('evaluation')).toBeGreaterThanOrEqual(4);
    const r = readability(
      'The cat sat on the mat. It was a sunny day. We went out to play.',
      'en',
    );
    expect(r.sentences).toBe(3);
    expect(r.grade).toBe('easy');
  });
  it('grades Persian by sentence length', () => {
    const long =
      Array.from({ length: 40 }, (_, i) => `کلمه${i}`).join(' ') +
      '. ' +
      Array.from({ length: 35 }, (_, i) => `واژه${i}`).join(' ') +
      '. کوتاه است.';
    expect(readability(long, 'fa').grade).toBe('hard');
    expect(
      readability('این جمله کوتاه است. این هم کوتاه است. و این یکی هم.', 'fa')
        .grade,
    ).toBe('easy');
  });
});
