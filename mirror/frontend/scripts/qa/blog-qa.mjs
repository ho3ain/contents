// QA: blog platform — seeds real content through the admin API, then takes
// screenshots + axe scans + keyboard checks of every blog surface (public,
// admin, preview, mobile RTL). Needs the real backend on :3000 and vite on
// :5173. Output goes to OUT (default /home/user/qa-blog, outside the repo).
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173';
const OUT = process.env.OUT ?? '/home/user/qa-blog';
const PHONE = process.env.PHONE ?? '+989120000001';
const PASS = process.env.PASS ?? 'Admin@1234';
mkdirSync(OUT, { recursive: true });
const report = { shots: [], axe: {}, checks: {}, perf: {} };
const log = (...a) => console.log(...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: 'fa-IR', viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(`${page.url()} :: ${m.text().slice(0, 160)}`));
page.on('pageerror', (e) => consoleErrors.push(`${page.url()} :: pageerror ${e.message.slice(0, 160)}`));

// ---- login (real backend, through the vite proxy) --------------------------
await page.goto(`${BASE}/`, { waitUntil: 'commit' });
await page.waitForSelector('#root > *', { timeout: 30000 });
const login = await page.evaluate(
  async ({ phone, password }) => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    });
    const body = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      status: res.status,
      token: body?.data?.accessToken ?? body?.accessToken ?? null,
      body: JSON.stringify(body).slice(0, 200),
    };
  },
  { phone: PHONE, password: PASS },
);
if (!login.ok || !login.token) throw new Error(`login failed: ${login.status} ${login.body}`);
await ctx.addCookies([{ name: 'ah-session-hint', value: '1', url: BASE }]);
const api = async (method, path, body) =>
  page.evaluate(
    async ({ method, path, body, token }) => {
      const res = await fetch(`/api/v1${path}`, {
        method,
        credentials: 'include',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      return { status: res.status, data: json?.data ?? json };
    },
    { method, path, body, token: login.token },
  );

// ---- seed content (idempotent-ish: reuse by slug) -------------------------------
const cats = (await api('GET', '/admin/blog/categories')).data;
let cat = cats.find((c) => c.slug === 'buying-guides');
if (!cat)
  cat = (
    await api('POST', '/admin/blog/categories', {
      name: 'راهنمای خرید',
      slug: 'buying-guides',
      nameEn: 'Buying guides',
      description: 'چطور ایجنت مناسب کسب‌وکار خود را انتخاب، ارزیابی و راه‌اندازی کنید.',
    })
  ).data;
let cat2 = cats.find((c) => c.slug === 'case-studies');
if (!cat2)
  cat2 = (
    await api('POST', '/admin/blog/categories', {
      name: 'مطالعات موردی',
      slug: 'case-studies',
      description: 'تجربه‌های واقعی تیم‌ها از به‌کارگیری AI Agentها.',
    })
  ).data;
const tagsAll = (await api('GET', '/admin/blog/tags')).data;
const tag = async (name, slug) => tagsAll.find((t) => t.slug === slug) ?? (await api('POST', '/admin/blog/tags', { name, slug })).data;
const tAuto = await tag('اتوماسیون', 'automation');
const tEval = await tag('ارزیابی', 'evaluation');
const agents = (await api('GET', '/agents?pageSize=3')).data;
const agentIds = (agents?.items ?? []).slice(0, 2).map((a) => a.id);
const marketCats = (await api('GET', '/categories')).data;
const marketIds = (marketCats ?? []).slice(0, 1).map((c) => c.id);

const body = `## چرا انتخاب اولین ایجنت سخت است؟

بیشتر تیم‌ها اولین ایجنت را بر اساس **هیجان دمو** انتخاب می‌کنند، نه بر اساس کاری که واقعاً باید انجام شود. این راهنما یک چارچوب چهارمرحله‌ای پیشنهاد می‌کند.

> [!NOTE]
> این مقاله برای مدیران محصول و سرپرستان تیم نوشته شده و فرض می‌کند با مفهوم ایجنت آشنا هستید.

## مرحلهٔ ۱ — کار را تعریف کنید، نه ابزار را

- ورودی دقیقاً چیست؟ (ایمیل، تیکت، فایل)
- خروجی قابل بررسی چیست؟
- چه کسی خروجی را تأیید می‌کند؟

### نمونهٔ تعریف خوب

1. هر تیکت جدید پشتیبانی
2. دسته‌بندی + پیش‌نویس پاسخ
3. تأیید توسط اپراتور قبل از ارسال

## مرحلهٔ ۲ — معیارهای مقایسه

| معیار | وزن | چرا مهم است |
| --- | --- | --- |
| دسترسی به داده | بالا | حداقل دسترسی لازم |
| قابلیت بازبینی | بالا | انسان در حلقه |
| هزینهٔ ماهانه | متوسط | قابل پیش‌بینی باشد |

## مرحلهٔ ۳ — آزمون کوچک

یک مجموعهٔ ارزیابی ۲۰ تایی بسازید و قبل از خرید، نتیجه را روی آن بسنجید:

\`\`\`json
{ "sample": 20, "pass_threshold": 0.85, "reviewer": "ops-lead" }
\`\`\`

## مرحلهٔ ۴ — راه‌اندازی تدریجی

ایجنت را ابتدا در حالت *پیشنهاددهنده* فعال کنید و بعد از دو هفته به حالت خودکار ببرید. برای جزئیات مجوزها به [راهنمای توسعه‌دهندگان](/developers) مراجعه کنید.

---

نتیجه: ایجنت خوب، ایجنتی است که کار تعریف‌شده‌ای را با دسترسی حداقلی و خروجی قابل بازبینی انجام می‌دهد.`;

const existing = (await api('GET', '/admin/blog/posts?pageSize=50')).data;
const bySlug = (s) => existing?.items?.find((p) => p.slug === s);
const ensurePost = async (input) => {
  const found = bySlug(input.slug);
  if (found) return (await api('GET', `/admin/blog/posts/${found.id}`)).data;
  const created = await api('POST', '/admin/blog/posts', input);
  if (created.status !== 201) throw new Error(`create failed ${created.status} ${JSON.stringify(created.data).slice(0, 300)}`);
  return created.data;
};
const main = await ensurePost({
  title: 'چطور اولین AI Agent تیم خود را انتخاب کنیم؟ (چارچوب چهارمرحله‌ای)',
  slug: 'choose-your-first-ai-agent',
  excerpt: 'یک چارچوب عملی برای انتخاب اولین ایجنت: تعریف کار، معیارهای مقایسه، آزمون کوچک و راه‌اندازی تدریجی — بدون هیجان دمو.',
  bodyMarkdown: body,
  featuredImageUrl: '/og-cover.png',
  featuredImageAlt: 'نمودار چهار مرحلهٔ انتخاب ایجنت',
  featuredImageCaption: 'چهار مرحله: تعریف، مقایسه، آزمون، راه‌اندازی',
  primaryCategoryId: cat.id,
  tagIds: [tAuto.id, tEval.id],
  agentIds,
  marketCategoryIds: marketIds,
  isFeatured: true,
  sources: [{ title: 'Microsoft Learn — AI agent marketplace checklist', url: 'https://learn.microsoft.com/' }],
  seoDescription: 'چارچوب چهارمرحله‌ای انتخاب اولین AI Agent برای تیم‌ها: تعریف کار، معیارها، آزمون کوچک، راه‌اندازی تدریجی.',
});
const second = await ensurePost({
  title: 'مطالعهٔ موردی: اتوماسیون تیکت‌های پشتیبانی با یک ایجنت و یک اپراتور',
  slug: 'support-ticket-automation-case-study',
  excerpt: 'چطور یک تیم سه‌نفره با یک ایجنت دسته‌بندی و پیش‌نویس پاسخ، زمان پاسخ اول را ۶۰٪ کاهش داد.',
  bodyMarkdown:
    '## زمینه\n\nتیم پشتیبانی روزانه ۱۲۰ تیکت دریافت می‌کرد.\n\n## راه‌حل\n\nیک ایجنت دسته‌بندی + پیش‌نویس، با تأیید انسانی.\n\n## نتیجه\n\n- زمان پاسخ اول: از ۴ ساعت به ۹۰ دقیقه\n- رضایت: +۱۲ امتیاز',
  primaryCategoryId: cat2.id,
  tagIds: [tAuto.id],
  featuredImageUrl: '/og-cover.png',
  featuredImageAlt: 'داشبورد تیکت‌ها',
});
const draft = await ensurePost({
  title: 'پیش‌نویس: مقایسهٔ مدل‌های قیمت‌گذاری ایجنت‌ها',
  slug: 'agent-pricing-models-draft',
  excerpt: '',
  bodyMarkdown: 'در حال نگارش…',
  primaryCategoryId: cat.id,
});
for (const p of [main, second]) {
  if (p.status !== 'published') {
    const r = await api('POST', `/admin/blog/posts/${p.id}/publish`, {});
    log('publish', p.slug, r.status, r.status !== 200 ? JSON.stringify(r.data).slice(0, 300) : '');
  }
}
report.checks.seed = { main: main.id, second: second.id, draft: draft.id };

// ---- helpers ------------------------------------------------------------------
const shot = async (name, url, waitSel, { mobile = false, scope } = {}) => {
  // Same page for mobile (a second context would rotate the refresh cookie
  // and kill the first session) — only the viewport changes.
  const p = page;
  await p.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 });
  const t0 = Date.now();
  await p.goto(`${BASE}${url}`, { waitUntil: 'commit' });
  await p.waitForSelector(waitSel, { timeout: 30000 });
  await p.waitForTimeout(900);
  const ms = Date.now() - t0;
  const file = `${OUT}/${name}.png`;
  await p.screenshot({ path: file, fullPage: true });
  report.shots.push({ name, url, ms });
  report.perf[name] = ms;
  // Freeze CSS transitions so axe samples final colours, not mid-transition
  // interpolations (the sidebar's 150 ms colour fade produced false positives).
  await p.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  await p.waitForTimeout(100);
  const axe = await new AxeBuilder({ page: p })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .include(scope ?? '#root')
    .analyze();
  report.axe[name] = axe.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary?.slice(0, 160) })),
  }));
  log(
    `[shot] ${name} ${url} ${ms}ms axe=${axe.violations.length}`,
    axe.violations.map((v) => `${v.id}(${v.impact}×${v.nodes.length})`).join(' '),
  );
  for (const v of axe.violations)
    for (const n of v.nodes) log('    ', v.id, JSON.stringify(n.target), (n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 140));
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  const meta = await p.evaluate(() => ({
    title: document.title,
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href'),
    robots: document.querySelector('meta[name=robots]')?.getAttribute('content'),
    og: document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
    h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim().slice(0, 60)),
    ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent.slice(0, 80)),
  }));
  report.checks[name] = meta;
  if (mobile) await p.setViewportSize({ width: 1366, height: 900 });
  return p;
};

// ---- public ------------------------------------------------------------------
await shot('01-blog-home', '/blog', '[data-testid="blog-featured"], [data-testid="blog-card"]');
await shot('02-blog-article', `/blog/${main.slug}`, '[data-testid="blog-article-body"]');
await shot('03-blog-category', `/blog/category/${cat.slug}`, '[data-testid="blog-archive-title"]');
await shot(
  '04-blog-search',
  '/blog?q=%D8%A7%DB%8C%D8%AC%D9%86%D8%AA',
  '[data-testid="blog-list-count"], .blog-notice, [data-testid="blog-card"]',
);
await shot('05-blog-tag', `/blog/tag/${tAuto.slug}`, '[data-testid="blog-archive-title"]');
await shot('06-blog-404', '/blog/this-does-not-exist', '[data-testid="blog-article-404"]');
await shot('07-blog-draft-is-404', `/blog/${draft.slug}`, '[data-testid="blog-article-404"]');
await shot('08-mobile-home', '/blog', '[data-testid="blog-featured"], [data-testid="blog-card"]', { mobile: true });
await shot('09-mobile-article', `/blog/${main.slug}`, '[data-testid="blog-article-body"]', { mobile: true });

// keyboard walk on the article: TOC links reachable, focus visible
await page.goto(`${BASE}/blog/${main.slug}`, { waitUntil: 'commit' });
await page.waitForSelector('[data-testid="blog-toc"] a');
await page.focus('[data-testid="blog-toc"] a');
const focusInfo = await page.evaluate(() => {
  const el = document.activeElement;
  const cs = getComputedStyle(el);
  return { tag: el.tagName, href: el.getAttribute('href'), outline: cs.outlineStyle !== 'none' || cs.boxShadow !== 'none' };
});
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
report.checks.keyboard = { ...focusInfo, hashAfterEnter: await page.evaluate(() => location.hash) };
log('[keyboard]', report.checks.keyboard);

// ---- admin --------------------------------------------------------------------
await shot('10-admin-list', '/admin/blog', '[data-testid="blog-admin-table"], [data-testid="admin-blog"]');
await shot('11-admin-editor', `/admin/blog/posts/${main.id}`, '[data-testid="blog-title"]');
// editor preview tab
await page.click('[role="tab"]:has-text("پیش‌نمایش")');
await page.waitForSelector('.blog-md-preview .article-body, .blog-md-preview', { timeout: 15000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/12-admin-editor-preview-tab.png`, fullPage: true });
report.shots.push({ name: '12-admin-editor-preview-tab' });
await shot('13-admin-preview', `/admin/blog/posts/${draft.id}/preview`, '[data-testid="blog-preview-banner"]');
await shot('14-admin-taxonomy', '/admin/blog/taxonomy', '[data-testid="blog-categories-table"]');
await shot('15-admin-new', '/admin/blog/posts/new', '[data-testid="blog-title"]');
await shot('16-mobile-admin-editor', `/admin/blog/posts/${main.id}`, '[data-testid="blog-title"]', { mobile: true });

// unsaved guard + save round trip through the UI
await page.goto(`${BASE}/admin/blog/posts/${draft.id}`, { waitUntil: 'commit' });
await page.waitForSelector('[data-testid="blog-title"]');
const uiExcerpt = `خلاصهٔ آزمایشی که از طریق UI ذخیره می‌شود (${Date.now()}).`;
await page.fill('[data-testid="blog-excerpt"]', uiExcerpt);
report.checks.dirtyAfterEdit = await page.getAttribute('[data-testid="blog-editor"]', 'data-dirty');
await page.click('.blog-editor-crumbs a[href="/admin/blog"]');
await page.waitForSelector('[data-testid="blog-leave-save"]', { timeout: 5000 });
report.checks.leaveGuardShown = true;
await page.screenshot({ path: `${OUT}/17-admin-leave-guard.png` });
await page.click('[data-testid="blog-leave-save"]');
await page.waitForURL('**/admin/blog', { timeout: 15000 });
const after = (await api('GET', `/admin/blog/posts/${draft.id}`)).data;
report.checks.saveAndLeavePersisted = after.excerpt === uiExcerpt;
log('[guard]', report.checks.dirtyAfterEdit, report.checks.saveAndLeavePersisted);

// anonymous: admin preview and admin API are rejected
const anon = await (await browser.newContext()).newPage();
await anon.goto(`${BASE}/blog`, { waitUntil: 'commit' });
await anon.waitForSelector('[data-testid="blog-list-count"], [data-testid="blog-featured"]');
const anonApi = await anon.evaluate(
  async ({ base, draftSlug }) => {
    const r1 = await fetch(`${base}/api/v1/admin/blog/posts`);
    const r2 = await fetch(`${base}/api/v1/blog/posts?pageSize=100`);
    const j2 = await r2.json();
    const items = j2.data?.items ?? [];
    return {
      adminList: r1.status,
      publicCount: items.length,
      draftLeaked: items.some((it) => it.slug === draftSlug),
      publicRowsExposeStatus: items.some((it) => 'status' in it || 'editorialNote' in it || 'bodyMarkdown' in it),
    };
  },
  { base: BASE, draftSlug: draft.slug },
);
await anon.goto(`${BASE}/admin/blog/posts/${draft.id}/preview`, { waitUntil: 'commit' });
await anon.waitForTimeout(2500);
report.checks.anonymous = { ...anonApi, previewLandedOn: new URL(anon.url()).pathname };
log('[anon]', report.checks.anonymous);
await anon.context().close();

report.consoleErrors = consoleErrors;
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
log('console errors:', consoleErrors.length);
for (const e of consoleErrors.slice(0, 20)) log('  ', e);
await browser.close();
