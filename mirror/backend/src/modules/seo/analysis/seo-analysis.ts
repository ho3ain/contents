import type { BlogBlock } from '../../blog/domain/blog-markdown';
import { blocksPlainText, inlineText } from '../../blog/domain/blog-markdown';
import {
  countOccurrences,
  keywordKey,
  tokenize,
} from '../../../common/utils/persian-normalize';
import { readability, type ReadabilityResult } from './readability';

/**
 * MESH SEO analysis engine — rule based, language aware (fa/en), no external
 * service. Every rule is a pure function of {@link AnalysisInput}; the engine
 * is the single implementation used by the editor's live panel (unsaved
 * content, `basis: 'unsaved'`) and by server-side reports (`basis: 'saved'`).
 *
 * The score is an INTERNAL MESH METRIC: a weighted share of passed rules with
 * the weights listed in {@link RULE_WEIGHTS}. It says nothing about rankings
 * or indexation and the UI labels it accordingly.
 */

export type AnalysisLanguage = 'fa' | 'en';
export type AnalysisBasis = 'unsaved' | 'saved';
export type Severity = 'critical' | 'warning' | 'info';

export interface AnalysisLink {
  href: string;
  anchor: string;
  position: number;
  internal: boolean;
  status: 'ok' | 'broken' | 'unpublished' | 'unknown';
}

export interface AnalysisInput {
  contentType: 'post' | 'agent';
  language: AnalysisLanguage;
  basis: AnalysisBasis;
  title: string;
  slug: string;
  excerpt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  socialImageUrl: string | null;
  robotsIndex: boolean;
  focusKeyword: string | null;
  relatedKeywords: string[];
  blocks: BlogBlock[];
  links: AnalysisLink[];
  /** Inbound internal links from other content; null when not known (unsaved/new). */
  inboundLinks: number | null;
  /** Other published content using the same SEO title / description. */
  duplicates: { title: string[]; description: string[] };
  siteOrigin: string | null;
}

export interface Localized {
  fa: string;
  en: string;
}

export interface Recommendation {
  rule: RuleId;
  severity: Severity;
  /** true = rule satisfied (shown as resolved). */
  passed: boolean;
  /** false = rule not applicable to this input (excluded from score). */
  applicable: boolean;
  title: Localized;
  problem: Localized;
  why: Localized;
  fix: Localized;
  location:
    | { kind: 'field'; field: string }
    | { kind: 'block'; position: number }
    | { kind: 'panel'; panel: 'seo' | 'links' | 'content' };
  /** Numbers the UI may show next to the text. */
  data?: Record<string, number | string | boolean | null>;
}

export interface AnalysisStats {
  words: number;
  paragraphs: number;
  longParagraphs: number;
  headings: { h2: number; h3: number; h4: number };
  images: number;
  imagesWithoutAlt: number;
  internalLinks: number;
  externalLinks: number;
  brokenLinks: number;
  unpublishedLinks: number;
  keyword: { occurrences: number; density: number } | null;
  readability: ReadabilityResult;
}

export interface AnalysisReport {
  engine: 'mesh-rules';
  version: 1;
  basis: AnalysisBasis;
  language: AnalysisLanguage;
  score: {
    value: number;
    label: 'MESH internal metric';
    criticalFailed: boolean;
    weights: Record<RuleId, number>;
    note: Localized;
  };
  stats: AnalysisStats;
  recommendations: Recommendation[];
}

export const RULE_IDS = [
  'seo_title',
  'seo_description',
  'content_length',
  'broken_links',
  'images_alt',
  'heading_structure',
  'paragraph_length',
  'readability',
  'keyword_in_title',
  'keyword_in_description',
  'keyword_in_intro',
  'keyword_in_headings',
  'keyword_density',
  'keyword_distribution',
  'internal_links',
  'inbound_links',
  'unpublished_links',
  'duplicate_title',
  'duplicate_description',
  'social_image',
  'canonical',
  'slug',
  'robots',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** Documented weights. Critical rules also cap the score at 49 when failed. */
export const RULE_WEIGHTS: Record<RuleId, number> = {
  seo_title: 10,
  seo_description: 10,
  content_length: 10,
  broken_links: 10,
  images_alt: 8,
  heading_structure: 8,
  paragraph_length: 6,
  readability: 6,
  keyword_in_title: 6,
  keyword_in_description: 4,
  keyword_in_intro: 4,
  keyword_in_headings: 3,
  keyword_density: 6,
  keyword_distribution: 3,
  internal_links: 6,
  inbound_links: 4,
  unpublished_links: 3,
  duplicate_title: 4,
  duplicate_description: 4,
  social_image: 3,
  canonical: 3,
  slug: 3,
  robots: 0,
};

export const CRITICAL_RULES: ReadonlySet<RuleId> = new Set<RuleId>([
  'seo_title',
  'seo_description',
  'content_length',
  'broken_links',
  'images_alt',
]);

export const LIMITS = {
  titleMin: 30,
  titleMax: 60,
  descriptionMin: 70,
  descriptionMax: 160,
  minWords: 300,
  longParagraphWords: 150,
  densityMin: 0.5,
  densityMax: 2.5,
  slugMax: 75,
} as const;

const L = (fa: string, en: string): Localized => ({ fa, en });

type Ctx = AnalysisInput & {
  plainText: string;
  words: number;
  paragraphs: Array<{ position: number; words: number; text: string }>;
  headings: Array<{ position: number; level: 2 | 3 | 4; text: string }>;
  images: Array<{ position: number; alt: string }>;
  keyword: string | null;
};

function ctxOf(input: AnalysisInput): Ctx {
  const paragraphs: Ctx['paragraphs'] = [];
  const headings: Ctx['headings'] = [];
  const images: Ctx['images'] = [];
  input.blocks.forEach((block, position) => {
    if (block.type === 'paragraph') {
      const text = inlineText(block.c);
      paragraphs.push({ position, words: tokenize(text).length, text });
    } else if (block.type === 'heading') {
      headings.push({ position, level: block.level, text: block.text });
    } else if (block.type === 'image') {
      images.push({ position, alt: block.alt });
    }
  });
  const plainText = blocksPlainText(input.blocks);
  const keyword = input.focusKeyword?.trim() ? input.focusKeyword.trim() : null;
  return {
    ...input,
    plainText,
    words: tokenize(plainText).length,
    paragraphs,
    headings,
    images,
    keyword,
  };
}

type Rule = (c: Ctx) => Recommendation;

const rec = (
  rule: RuleId,
  severity: Severity,
  passed: boolean,
  texts: {
    title: Localized;
    problem: Localized;
    why: Localized;
    fix: Localized;
  },
  location: Recommendation['location'],
  data?: Recommendation['data'],
  applicable = true,
): Recommendation => ({
  rule,
  severity,
  passed,
  applicable,
  ...texts,
  location,
  data,
});

const notApplicable = (
  rule: RuleId,
  title: Localized,
  location: Recommendation['location'],
) =>
  rec(
    rule,
    'info',
    true,
    { title, problem: L('', ''), why: L('', ''), fix: L('', '') },
    location,
    undefined,
    false,
  );

const rules: Record<RuleId, Rule> = {
  seo_title: (c) => {
    const value = (c.seoTitle ?? c.title).trim();
    const len = [...value].length;
    const usingFallback = !c.seoTitle?.trim();
    const ok = len >= LIMITS.titleMin && len <= LIMITS.titleMax;
    return rec(
      'seo_title',
      'critical',
      ok,
      {
        title: L('عنوان سئو', 'SEO title'),
        problem: usingFallback
          ? L(
              `عنوان سئو تنظیم نشده و عنوان مقاله (${len} نویسه) استفاده می‌شود.`,
              `No SEO title is set; the article title (${len} chars) is used instead.`,
            )
          : L(
              `طول عنوان سئو ${len} نویسه است (بازهٔ پیشنهادی ${LIMITS.titleMin}–${LIMITS.titleMax}).`,
              `The SEO title is ${len} characters (recommended ${LIMITS.titleMin}–${LIMITS.titleMax}).`,
            ),
        why: L(
          'عنوان کوتاه فرصت توضیح را از دست می‌دهد و عنوان بلند در نتایج جست‌وجو بریده می‌شود. عرض واقعی بر حسب پیکسل است؛ این شمارش یک تخمین است.',
          'Short titles waste the snippet; long ones get truncated. Real limits are pixel-based — this count is an estimate.',
        ),
        fix: L(
          'یک عنوان سئوی مشخص بین ۳۰ تا ۶۰ نویسه بنویسید که موضوع اصلی را در ابتدای آن بیاورد.',
          'Write a dedicated SEO title of 30–60 characters that leads with the main topic.',
        ),
      },
      { kind: 'field', field: 'seoTitle' },
      { length: len, fallback: usingFallback },
    );
  },

  seo_description: (c) => {
    const value = (c.seoDescription ?? c.excerpt).trim();
    const len = [...value].length;
    const usingFallback = !c.seoDescription?.trim();
    const ok = len >= LIMITS.descriptionMin && len <= LIMITS.descriptionMax;
    return rec(
      'seo_description',
      'critical',
      ok,
      {
        title: L('توضیح متا', 'Meta description'),
        problem: usingFallback
          ? L(
              `توضیح متا تنظیم نشده و خلاصهٔ مقاله (${len} نویسه) استفاده می‌شود.`,
              `No meta description is set; the excerpt (${len} chars) is used instead.`,
            )
          : L(
              `طول توضیح متا ${len} نویسه است (بازهٔ پیشنهادی ${LIMITS.descriptionMin}–${LIMITS.descriptionMax}).`,
              `The meta description is ${len} characters (recommended ${LIMITS.descriptionMin}–${LIMITS.descriptionMax}).`,
            ),
        why: L(
          'توضیح متا متن زیر عنوان در نتایج جست‌وجو است؛ موتور جست‌وجو ممکن است آن را جایگزین کند، اما یک توضیح خوب نرخ کلیک را بهتر می‌کند.',
          'The description is the snippet text; engines may rewrite it, but a good one improves click-through.',
        ),
        fix: L(
          'یک توضیح ۷۰ تا ۱۶۰ نویسه‌ای بنویسید که ارزش مقاله را بگوید و کلیدواژهٔ کانونی را به‌طور طبیعی داشته باشد.',
          'Write 70–160 characters stating the article’s value and naturally including the focus keyword.',
        ),
      },
      { kind: 'field', field: 'seoDescription' },
      { length: len, fallback: usingFallback },
    );
  },

  content_length: (c) =>
    rec(
      'content_length',
      'critical',
      c.words >= LIMITS.minWords,
      {
        title: L('طول محتوا', 'Content length'),
        problem: L(
          `متن ${c.words} کلمه دارد (حداقل پیشنهادی ${LIMITS.minWords}).`,
          `The body has ${c.words} words (recommended minimum ${LIMITS.minWords}).`,
        ),
        why: L(
          'متن خیلی کوتاه معمولاً پرسش خواننده را کامل پاسخ نمی‌دهد و برای موتور جست‌وجو هم زمینهٔ کافی ندارد.',
          'Very short pages rarely answer the reader fully and give engines little context.',
        ),
        fix: L(
          'فقط در صورتی متن را گسترش دهید که ارزش واقعی اضافه می‌کند: مثال، گام عملی، محدودیت‌ها.',
          'Extend only with real value: examples, concrete steps, limitations.',
        ),
      },
      { kind: 'panel', panel: 'content' },
      { words: c.words },
    ),

  broken_links: (c) => {
    const broken = c.links.filter((l) => l.status === 'broken');
    return rec(
      'broken_links',
      'critical',
      broken.length === 0,
      {
        title: L('لینک‌های شکسته', 'Broken links'),
        problem: L(
          `${broken.length} لینک داخلی به مقصدی اشاره می‌کند که وجود ندارد.`,
          `${broken.length} internal link(s) point to content that does not exist.`,
        ),
        why: L(
          'لینک شکسته تجربهٔ خواننده را خراب می‌کند و اعتبار صفحه را هدر می‌دهد.',
          'Broken links hurt readers and waste the page’s link equity.',
        ),
        fix: L(
          'لینک را اصلاح کنید یا به مقصد درست تغییر دهید.',
          'Fix the URL or point the link at the right destination.',
        ),
      },
      broken.length
        ? { kind: 'block', position: broken[0].position }
        : { kind: 'panel', panel: 'links' },
      { count: broken.length, first: broken[0]?.href ?? null },
      c.basis === 'saved' || c.links.some((l) => l.status !== 'unknown'),
    );
  },

  images_alt: (c) => {
    const missing = c.images.filter((i) => !i.alt.trim());
    if (c.images.length === 0)
      return notApplicable(
        'images_alt',
        L('متن جایگزین تصاویر', 'Image alt text'),
        { kind: 'panel', panel: 'content' },
      );
    return rec(
      'images_alt',
      'critical',
      missing.length === 0,
      {
        title: L('متن جایگزین تصاویر', 'Image alt text'),
        problem: L(
          `${missing.length} از ${c.images.length} تصویر متن جایگزین ندارد.`,
          `${missing.length} of ${c.images.length} images have no alt text.`,
        ),
        why: L(
          'متن جایگزین برای خوانندگان نابینا و برای درک تصویر توسط موتور جست‌وجو ضروری است.',
          'Alt text is required for screen-reader users and lets engines understand the image.',
        ),
        fix: L(
          'برای هر تصویر توضیح کوتاه و دقیقی بنویسید که محتوای تصویر را بیان کند.',
          'Describe what each image shows in a short, specific sentence.',
        ),
      },
      missing.length
        ? { kind: 'block', position: missing[0].position }
        : { kind: 'panel', panel: 'content' },
      { missing: missing.length, total: c.images.length },
    );
  },

  heading_structure: (c) => {
    const problems: string[] = [];
    let last: 1 | 2 | 3 | 4 = 1;
    let firstSkip: number | null = null;
    for (const h of c.headings) {
      if (h.level > last + 1) {
        problems.push('skip');
        firstSkip ??= h.position;
      }
      last = h.level;
    }
    const needsHeadings = c.words >= LIMITS.minWords && c.headings.length === 0;
    const ok = !needsHeadings && problems.length === 0;
    return rec(
      'heading_structure',
      'warning',
      ok,
      {
        title: L('ساختار تیترها', 'Heading structure'),
        problem: needsHeadings
          ? L(
              'متن بلند است اما هیچ تیتر H2 ندارد.',
              'The body is long but has no H2 headings.',
            )
          : L(
              `${problems.length} پرش سطح تیتر (مثلاً H2 → H4) پیدا شد.`,
              `${problems.length} heading level skip(s) found (e.g. H2 → H4).`,
            ),
        why: L(
          'عنوان مقاله H1 است؛ تیترهای H2/H3/H4 باید پله‌پله باشند تا فهرست مطالب و خوانش توسط صفحه‌خوان درست کار کند.',
          'The article title is the H1; H2/H3/H4 must step down one level at a time for the TOC and screen readers.',
        ),
        fix: L(
          'بخش‌های اصلی را H2 و زیربخش‌ها را H3 کنید؛ از H4 فقط زیر H3 استفاده کنید.',
          'Use H2 for sections and H3 for sub-sections; use H4 only under an H3.',
        ),
      },
      firstSkip !== null
        ? { kind: 'block', position: firstSkip }
        : { kind: 'panel', panel: 'content' },
      {
        h2: c.headings.filter((h) => h.level === 2).length,
        skips: problems.length,
      },
    );
  },

  paragraph_length: (c) => {
    const long = c.paragraphs.filter(
      (p) => p.words > LIMITS.longParagraphWords,
    );
    return rec(
      'paragraph_length',
      'warning',
      long.length === 0,
      {
        title: L('پاراگراف‌های بلند', 'Long paragraphs'),
        problem: L(
          `${long.length} پاراگراف بیش از ${LIMITS.longParagraphWords} کلمه دارد.`,
          `${long.length} paragraph(s) exceed ${LIMITS.longParagraphWords} words.`,
        ),
        why: L(
          'پاراگراف‌های بلند روی موبایل دیوار متن می‌سازند و خوانده نمی‌شوند.',
          'Long paragraphs become walls of text on mobile and are skipped.',
        ),
        fix: L(
          'هر پاراگراف را حول یک ایده نگه دارید و پاراگراف‌های بلند را بشکنید.',
          'Keep one idea per paragraph; split the long ones.',
        ),
      },
      long.length
        ? { kind: 'block', position: long[0].position }
        : { kind: 'panel', panel: 'content' },
      { count: long.length },
      c.paragraphs.length > 0,
    );
  },

  readability: (c) => {
    const r = readability(c.plainText, c.language);
    const ok = r.grade !== 'hard';
    const detail =
      c.language === 'fa'
        ? L(
            `میانگین ${r.avgWordsPerSentence} کلمه در هر جمله؛ ${Math.round(r.longSentenceShare * 100)}٪ جمله‌ها بیش از ${r.longSentenceWords} کلمه دارند.`,
            `Average ${r.avgWordsPerSentence} words per sentence; ${Math.round(r.longSentenceShare * 100)}% of sentences exceed ${r.longSentenceWords} words.`,
          )
        : L(
            `امتیاز Flesch Reading Ease برابر ${r.fleschReadingEase ?? '—'} است؛ میانگین ${r.avgWordsPerSentence} کلمه در هر جمله.`,
            `Flesch Reading Ease ${r.fleschReadingEase ?? '—'}; average ${r.avgWordsPerSentence} words per sentence.`,
          );
    return rec(
      'readability',
      'warning',
      ok,
      {
        title: L('خوانایی (تخمینی)', 'Readability (estimate)'),
        problem: detail,
        why: L(
          'این یک تخمین آماری است، نه سنجش درک. جمله‌های کوتاه‌تر برای خوانندهٔ فارسی‌زبان و موبایل راحت‌ترند.',
          'This is a statistical estimate, not a comprehension test. Shorter sentences read better, especially on mobile.',
        ),
        fix: L(
          'جمله‌های خیلی بلند را به دو جمله بشکنید و از فعل‌های ساده استفاده کنید.',
          'Split very long sentences and prefer simple verbs.',
        ),
      },
      { kind: 'panel', panel: 'content' },
      {
        grade: r.grade,
        avg: r.avgWordsPerSentence,
        flesch: r.fleschReadingEase,
      },
      r.sentences >= 3,
    );
  },

  keyword_in_title: (c) => {
    if (!c.keyword)
      return notApplicable(
        'keyword_in_title',
        L('کلیدواژه در عنوان', 'Keyword in title'),
        { kind: 'field', field: 'focusKeyword' },
      );
    const title = c.seoTitle?.trim() || c.title;
    const ok = countOccurrences(title, c.keyword) > 0;
    return rec(
      'keyword_in_title',
      'warning',
      ok,
      {
        title: L('کلیدواژه در عنوان', 'Keyword in title'),
        problem: L(
          `کلیدواژهٔ کانونی «${c.keyword}» در عنوان سئو نیست.`,
          `The focus keyword “${c.keyword}” is not in the SEO title.`,
        ),
        why: L(
          'عنوان مهم‌ترین نشانهٔ موضوع صفحه است.',
          'The title is the strongest topical signal of the page.',
        ),
        fix: L(
          'اگر طبیعی است، کلیدواژه را نزدیک ابتدای عنوان بیاورید؛ عنوان را مصنوعی نکنید.',
          'If it reads naturally, place the keyword near the start of the title; never force it.',
        ),
      },
      { kind: 'field', field: 'seoTitle' },
    );
  },

  keyword_in_description: (c) => {
    if (!c.keyword)
      return notApplicable(
        'keyword_in_description',
        L('کلیدواژه در توضیح متا', 'Keyword in description'),
        { kind: 'field', field: 'focusKeyword' },
      );
    const desc = c.seoDescription?.trim() || c.excerpt;
    return rec(
      'keyword_in_description',
      'warning',
      countOccurrences(desc, c.keyword) > 0,
      {
        title: L('کلیدواژه در توضیح متا', 'Keyword in description'),
        problem: L(
          'کلیدواژهٔ کانونی در توضیح متا نیامده است.',
          'The focus keyword does not appear in the meta description.',
        ),
        why: L(
          'عبارت جست‌وجوشده در اسنیپت پررنگ می‌شود و توجه را جلب می‌کند.',
          'Matching terms are bolded in the snippet and draw attention.',
        ),
        fix: L(
          'یک بار، به‌صورت طبیعی، کلیدواژه را در توضیح بیاورید.',
          'Mention the keyword once, naturally, in the description.',
        ),
      },
      { kind: 'field', field: 'seoDescription' },
    );
  },

  keyword_in_intro: (c) => {
    if (!c.keyword)
      return notApplicable(
        'keyword_in_intro',
        L('کلیدواژه در مقدمه', 'Keyword in introduction'),
        { kind: 'field', field: 'focusKeyword' },
      );
    const intro = c.paragraphs
      .slice(0, 2)
      .map((p) => p.text)
      .join(' ');
    return rec(
      'keyword_in_intro',
      'warning',
      countOccurrences(intro, c.keyword) > 0,
      {
        title: L('کلیدواژه در مقدمه', 'Keyword in introduction'),
        problem: L(
          'کلیدواژهٔ کانونی در دو پاراگراف اول نیست.',
          'The focus keyword is not in the first two paragraphs.',
        ),
        why: L(
          'مقدمه به خواننده و موتور جست‌وجو می‌گوید صفحه دربارهٔ چیست.',
          'The introduction tells readers and engines what the page is about.',
        ),
        fix: L(
          'موضوع را در همان ابتدای متن روشن کنید.',
          'State the topic plainly at the very start.',
        ),
      },
      c.paragraphs[0]
        ? { kind: 'block', position: c.paragraphs[0].position }
        : { kind: 'panel', panel: 'content' },
      undefined,
      c.paragraphs.length > 0,
    );
  },

  keyword_in_headings: (c) => {
    if (!c.keyword)
      return notApplicable(
        'keyword_in_headings',
        L('کلیدواژه در تیترها', 'Keyword in headings'),
        { kind: 'field', field: 'focusKeyword' },
      );
    const hit = c.headings.some(
      (h) => countOccurrences(h.text, c.keyword as string) > 0,
    );
    return rec(
      'keyword_in_headings',
      'info',
      hit,
      {
        title: L('کلیدواژه در تیترها', 'Keyword in headings'),
        problem: L(
          'هیچ تیتری کلیدواژهٔ کانونی را ندارد.',
          'No heading contains the focus keyword.',
        ),
        why: L(
          'تیترها ساختار موضوعی صفحه را نشان می‌دهند.',
          'Headings outline the page’s topical structure.',
        ),
        fix: L(
          'اگر بخشی واقعاً دربارهٔ کلیدواژه است، آن را در تیترش بیاورید؛ در غیر این صورت نادیده بگیرید.',
          'If a section is really about the keyword, say so in its heading; otherwise ignore this.',
        ),
      },
      { kind: 'panel', panel: 'content' },
      undefined,
      c.headings.length > 0,
    );
  },

  keyword_density: (c) => {
    if (!c.keyword || c.words === 0)
      return notApplicable(
        'keyword_density',
        L('تراکم کلیدواژه', 'Keyword density'),
        { kind: 'field', field: 'focusKeyword' },
      );
    const occurrences = countOccurrences(c.plainText, c.keyword);
    const kwWords = tokenize(c.keyword).length;
    const density = Math.round(((occurrences * kwWords) / c.words) * 1000) / 10;
    const stuffing = density > LIMITS.densityMax;
    const ok = occurrences > 0 && !stuffing;
    return rec(
      'keyword_density',
      stuffing ? 'critical' : 'warning',
      ok,
      {
        title: L('تراکم کلیدواژه', 'Keyword density'),
        problem: stuffing
          ? L(
              `کلیدواژه ${occurrences} بار (${density}٪) تکرار شده — بیش از حد.`,
              `The keyword appears ${occurrences} times (${density}%) — too often.`,
            )
          : L(
              `کلیدواژه ${occurrences} بار (${density}٪) در متن آمده است.`,
              `The keyword appears ${occurrences} times (${density}%).`,
            ),
        why: stuffing
          ? L(
              'تکرار غیرطبیعی کلیدواژه (keyword stuffing) خوانایی را خراب می‌کند و ممکن است جریمه شود.',
              'Unnatural repetition (keyword stuffing) hurts readability and can be penalised.',
            )
          : L(
              'کلیدواژه باید جایی که معنا دارد بیاید؛ هیچ تراکم «درستی» وجود ندارد — فقط حد بالا مهم است.',
              'The keyword should appear where it makes sense; there is no “correct” density — only an upper bound.',
            ),
        fix: stuffing
          ? L(
              'تکرارها را حذف کنید و از مترادف‌ها و ضمیر استفاده کنید.',
              'Remove repetitions; use synonyms and pronouns.',
            )
          : L(
              'اگر صفر است، فقط جایی که طبیعی است یک بار از آن استفاده کنید.',
              'If it is zero, use it once where it reads naturally.',
            ),
      },
      { kind: 'panel', panel: 'content' },
      { occurrences, density, stuffing },
    );
  },

  keyword_distribution: (c) => {
    if (!c.keyword || c.paragraphs.length < 3)
      return notApplicable(
        'keyword_distribution',
        L('توزیع کلیدواژه', 'Keyword distribution'),
        { kind: 'field', field: 'focusKeyword' },
      );
    const thirds = [0, 0, 0];
    const size = Math.ceil(c.paragraphs.length / 3);
    c.paragraphs.forEach((p, i) => {
      thirds[Math.min(2, Math.floor(i / size))] += countOccurrences(
        p.text,
        c.keyword as string,
      );
    });
    const covered = thirds.filter((n) => n > 0).length;
    return rec(
      'keyword_distribution',
      'info',
      covered >= 2,
      {
        title: L('توزیع کلیدواژه', 'Keyword distribution'),
        problem: L(
          `کلیدواژه فقط در ${covered} از ۳ بخش متن آمده است.`,
          `The keyword appears in only ${covered} of 3 sections of the body.`,
        ),
        why: L(
          'اگر کلیدواژه فقط در یک جا جمع شده باشد، بقیهٔ متن احتمالاً از موضوع دور شده است.',
          'If the keyword clusters in one place, the rest of the text may have drifted off-topic.',
        ),
        fix: L(
          'بخش‌های دیگر را بازبینی کنید که واقعاً به موضوع مرتبط باشند — بدون تکرار مصنوعی.',
          'Review the other sections for topical relevance — without artificial repetition.',
        ),
      },
      { kind: 'panel', panel: 'content' },
      { start: thirds[0], middle: thirds[1], end: thirds[2] },
    );
  },

  internal_links: (c) => {
    const internal = c.links.filter((l) => l.internal);
    return rec(
      'internal_links',
      'warning',
      internal.length > 0,
      {
        title: L('لینک‌های داخلی', 'Internal links'),
        problem: L(
          'این محتوا به هیچ صفحهٔ دیگری از MESH لینک نمی‌دهد.',
          'This content links to no other MESH page.',
        ),
        why: L(
          'لینک داخلی خواننده را به مطالب مرتبط می‌برد و ساختار سایت را برای موتور جست‌وجو روشن می‌کند.',
          'Internal links guide readers to related content and expose the site structure to engines.',
        ),
        fix: L(
          'به ۲ تا ۳ مقاله یا محصول مرتبط لینک بدهید؛ پیشنهادهای گراف دانش را ببینید.',
          'Link to 2–3 related articles or products; see the knowledge-graph suggestions.',
        ),
      },
      { kind: 'panel', panel: 'links' },
      { internal: internal.length },
    );
  },

  inbound_links: (c) => {
    if (c.inboundLinks === null)
      return notApplicable(
        'inbound_links',
        L('لینک‌های ورودی', 'Inbound links'),
        { kind: 'panel', panel: 'links' },
      );
    return rec(
      'inbound_links',
      'warning',
      c.inboundLinks > 0,
      {
        title: L('لینک‌های ورودی (صفحهٔ یتیم)', 'Inbound links (orphan page)'),
        problem: L(
          'هیچ محتوای منتشرشده‌ای به این صفحه لینک نمی‌دهد.',
          'No published content links to this page.',
        ),
        why: L(
          'صفحهٔ بدون لینک ورودی برای خواننده و خزنده سخت پیدا می‌شود.',
          'A page with no inbound links is hard to discover for readers and crawlers.',
        ),
        fix: L(
          'از یک مقالهٔ مرتبط به این صفحه لینک بدهید (گراف دانش → پیشنهادها).',
          'Link to this page from a related article (Knowledge Graph → suggestions).',
        ),
      },
      { kind: 'panel', panel: 'links' },
      { inbound: c.inboundLinks },
    );
  },

  unpublished_links: (c) => {
    const bad = c.links.filter((l) => l.status === 'unpublished');
    return rec(
      'unpublished_links',
      'warning',
      bad.length === 0,
      {
        title: L('لینک به محتوای منتشرنشده', 'Links to unpublished content'),
        problem: L(
          `${bad.length} لینک به مقاله/محصولی اشاره می‌کند که هنوز منتشر نشده است.`,
          `${bad.length} link(s) point to an article/product that is not published.`,
        ),
        why: L(
          'خوانندهٔ عمومی به مقصد ۴۰۴ می‌رسد.',
          'Public readers land on a 404.',
        ),
        fix: L(
          'مقصد را منتشر کنید یا لینک را تا آن زمان بردارید.',
          'Publish the target or remove the link until then.',
        ),
      },
      bad.length
        ? { kind: 'block', position: bad[0].position }
        : { kind: 'panel', panel: 'links' },
      { count: bad.length },
      c.links.some((l) => l.status !== 'unknown') || c.basis === 'saved',
    );
  },

  duplicate_title: (c) =>
    rec(
      'duplicate_title',
      'warning',
      c.duplicates.title.length === 0,
      {
        title: L('عنوان تکراری', 'Duplicate title'),
        problem: L(
          `همین عنوان سئو در ${c.duplicates.title.length} محتوای منتشرشدهٔ دیگر استفاده شده است.`,
          `The same SEO title is used by ${c.duplicates.title.length} other published item(s).`,
        ),
        why: L(
          'عنوان‌های یکسان صفحات را در نتایج با هم رقیب می‌کنند.',
          'Identical titles make pages compete with each other.',
        ),
        fix: L(
          'عنوان را طوری تغییر دهید که تفاوت این صفحه را بگوید.',
          'Differentiate the title so it states what is unique about this page.',
        ),
      },
      { kind: 'field', field: 'seoTitle' },
      { count: c.duplicates.title.length },
      c.basis === 'saved' || c.duplicates.title.length > 0,
    ),

  duplicate_description: (c) =>
    rec(
      'duplicate_description',
      'warning',
      c.duplicates.description.length === 0,
      {
        title: L('توضیح متای تکراری', 'Duplicate description'),
        problem: L(
          `همین توضیح متا در ${c.duplicates.description.length} محتوای دیگر استفاده شده است.`,
          `The same description is used by ${c.duplicates.description.length} other item(s).`,
        ),
        why: L(
          'توضیح تکراری اسنیپت را بی‌فایده می‌کند.',
          'A duplicated description makes the snippet meaningless.',
        ),
        fix: L(
          'توضیحی مخصوص این صفحه بنویسید.',
          'Write a description specific to this page.',
        ),
      },
      { kind: 'field', field: 'seoDescription' },
      { count: c.duplicates.description.length },
      c.basis === 'saved' || c.duplicates.description.length > 0,
    ),

  social_image: (c) =>
    rec(
      'social_image',
      'info',
      Boolean(c.socialImageUrl),
      {
        title: L('تصویر اشتراک‌گذاری', 'Social image'),
        problem: L(
          'تصویر اختصاصی برای اشتراک‌گذاری (OG) تنظیم نشده؛ تصویر پیش‌فرض سایت استفاده می‌شود.',
          'No dedicated social (OG) image; the site default is used.',
        ),
        why: L(
          'پیش‌نمایش لینک در تلگرام/لینکدین با تصویر مرتبط بسیار بیشتر کلیک می‌گیرد.',
          'Link previews on Telegram/LinkedIn get far more clicks with a relevant image.',
        ),
        fix: L(
          'تصویر شاخص یا یک تصویر ۱۲۰۰×۶۳۰ اختصاصی تنظیم کنید.',
          'Set the featured image or a dedicated 1200×630 image.',
        ),
      },
      { kind: 'field', field: 'ogImageUrl' },
    ),

  canonical: (c) => {
    const value = c.canonicalUrl?.trim();
    if (!value)
      return notApplicable('canonical', L('آدرس کانونیکال', 'Canonical URL'), {
        kind: 'field',
        field: 'canonicalUrl',
      });
    let ok = false;
    let crossDomain = false;
    try {
      const url = new URL(value);
      ok = url.protocol === 'https:' || url.protocol === 'http:';
      crossDomain = Boolean(c.siteOrigin) && url.origin !== c.siteOrigin;
    } catch {
      ok = value.startsWith('/');
    }
    return rec(
      'canonical',
      ok ? 'info' : 'warning',
      ok,
      {
        title: L('آدرس کانونیکال', 'Canonical URL'),
        problem: ok
          ? crossDomain
            ? L(
                'کانونیکال به دامنهٔ دیگری اشاره می‌کند؛ این صفحه اعتبار خود را به آن می‌دهد.',
                'The canonical points to another domain; this page yields its authority to it.',
              )
            : L('', '')
          : L('آدرس کانونیکال معتبر نیست.', 'The canonical URL is not valid.'),
        why: L(
          'کانونیکال نسخهٔ اصلی محتوا را اعلام می‌کند؛ مقدار اشتباه باعث حذف صفحه از نتایج می‌شود.',
          'Canonical declares the original version; a wrong value can drop this page from results.',
        ),
        fix: L(
          'فقط برای بازنشر از منبع دیگر مقدار بدهید؛ در غیر این صورت خالی بگذارید تا آدرس خود صفحه استفاده شود.',
          'Set it only for content republished from elsewhere; otherwise leave empty so the page URL is used.',
        ),
      },
      { kind: 'field', field: 'canonicalUrl' },
      { crossDomain },
    );
  },

  slug: (c) => {
    const len = [...c.slug].length;
    const ok =
      len > 0 &&
      len <= LIMITS.slugMax &&
      /^[a-z0-9\u0600-\u06FF]+(?:-[a-z0-9\u0600-\u06FF]+)*$/u.test(c.slug);
    return rec(
      'slug',
      'warning',
      ok,
      {
        title: L('نامک (slug)', 'Slug'),
        problem: L(
          `نامک ${len} نویسه دارد یا قالب آن معتبر نیست.`,
          `The slug is ${len} characters or not in a valid shape.`,
        ),
        why: L(
          'نامک کوتاه و خوانا در نتایج و هنگام اشتراک‌گذاری اعتماد می‌سازد. تغییر نامک پس از انتشار یک ریدایرکت خودکار می‌سازد.',
          'Short readable slugs build trust in results and when shared. Changing a published slug creates an automatic redirect.',
        ),
        fix: L(
          'حروف کوچک، اعداد و خط تیره؛ ۳ تا ۶ کلمهٔ معنادار.',
          'Lowercase letters, digits and hyphens; 3–6 meaningful words.',
        ),
      },
      { kind: 'field', field: 'slug' },
      { length: len },
    );
  },

  robots: (c) =>
    rec(
      'robots',
      'info',
      c.robotsIndex,
      {
        title: L('ایندکس‌شدن', 'Indexability'),
        problem: L(
          'این صفحه روی noindex است و در نتایج جست‌وجو نمایش داده نمی‌شود.',
          'This page is set to noindex and will not appear in search results.',
        ),
        why: L(
          'noindex فقط برای صفحات تکراری یا کم‌ارزش مناسب است.',
          'noindex is only appropriate for duplicate or low-value pages.',
        ),
        fix: L(
          'اگر عمدی نیست، «ایندکس» را فعال کنید.',
          'Turn “index” back on unless this is intentional.',
        ),
      },
      { kind: 'field', field: 'robotsIndex' },
    ),
};

export function analyzeContent(input: AnalysisInput): AnalysisReport {
  const c = ctxOf(input);
  const recommendations = RULE_IDS.map((id) => rules[id](c));

  let total = 0;
  let earned = 0;
  let criticalFailed = false;
  for (const r of recommendations) {
    if (!r.applicable) continue;
    const w = RULE_WEIGHTS[r.rule];
    total += w;
    if (r.passed) earned += w;
    else if (CRITICAL_RULES.has(r.rule) || r.severity === 'critical')
      criticalFailed = true;
  }
  let value = total ? Math.round((earned / total) * 100) : 0;
  if (criticalFailed) value = Math.min(value, 49);

  const kw = recommendations.find((r) => r.rule === 'keyword_density');
  const stats: AnalysisStats = {
    words: c.words,
    paragraphs: c.paragraphs.length,
    longParagraphs: c.paragraphs.filter(
      (p) => p.words > LIMITS.longParagraphWords,
    ).length,
    headings: {
      h2: c.headings.filter((h) => h.level === 2).length,
      h3: c.headings.filter((h) => h.level === 3).length,
      h4: c.headings.filter((h) => h.level === 4).length,
    },
    images: c.images.length,
    imagesWithoutAlt: c.images.filter((i) => !i.alt.trim()).length,
    internalLinks: c.links.filter((l) => l.internal).length,
    externalLinks: c.links.filter((l) => !l.internal).length,
    brokenLinks: c.links.filter((l) => l.status === 'broken').length,
    unpublishedLinks: c.links.filter((l) => l.status === 'unpublished').length,
    keyword:
      kw?.applicable && kw.data
        ? {
            occurrences: Number(kw.data.occurrences),
            density: Number(kw.data.density),
          }
        : null,
    readability: readability(c.plainText, c.language),
  };

  // Failed first (critical → warning → info), then resolved ones.
  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  const sorted = recommendations
    .filter((r) => r.applicable)
    .sort(
      (a, b) =>
        Number(a.passed) - Number(b.passed) ||
        order[a.severity] - order[b.severity],
    );

  return {
    engine: 'mesh-rules',
    version: 1,
    basis: input.basis,
    language: input.language,
    score: {
      value,
      label: 'MESH internal metric',
      criticalFailed,
      weights: RULE_WEIGHTS,
      note:
        input.basis === 'unsaved'
          ? L(
              'بر اساس محتوای ذخیره‌نشدهٔ فعلی ویرایشگر محاسبه شده است.',
              'Computed from the current unsaved editor content.',
            )
          : L(
              'بر اساس آخرین نسخهٔ ذخیره‌شده محاسبه شده است.',
              'Computed from the last saved version.',
            ),
    },
    stats,
    recommendations: sorted,
  };
}

/** Normalised comparison key for duplicate detection (exported for the service). */
export const seoTextKey = (value: string | null | undefined): string | null =>
  value?.trim() ? keywordKey(value) : null;
