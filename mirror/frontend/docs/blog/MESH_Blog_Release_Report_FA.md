# MESH — گزارش آمادگی انتشار پلتفرم بلاگ

تاریخ: ۲۰۲۶-۱۰-۱۳ · محیط: sandbox غیرتولیدی (Node 20، PostgreSQL محلی، پایگاه‌دادهٔ `agenthub_test`/`agenthub`) · مخزن‌ها: `ho3ain/agentHub_backend` (پایه `220262c`) و `ho3ain/agentHub_frontend` (پایه `6f0b972`)
سند همراه: `docs/blog/MESH_Blog_Decisions_FA.md` (تصمیم‌های محصولی)

---

## A. خلاصهٔ اجرایی و وضعیت

**وضعیت نهایی: READY FOR STAGING VALIDATION**

پلتفرم بلاگ MESH از ابتدا به‌صورت یک CMS واقعی پیاده‌سازی شد: مدل دادهٔ کامل با مهاجرت نسخه‌دار (رفت/برگشت آزموده‌شده)، چرخهٔ عمر سمت‌سرور (`draft → in_review → scheduled/published → archived`) با چک‌لیست انتشار، ویرایشگر Markdown با پارسر امن اختصاصی (بدون HTML، بدون `innerHTML`)، نسخه‌ها و بازگردانی آزموده‌شده، ریدایرکت خودکار برای تغییر نامک، سئوی واقعی (canonical/robots/OG/JSON-LD/sitemap/RSS)، کش ETag و باطل‌سازی هنگام انتشار/خروج از انتشار، و صفحات عمومی کاملاً فارسی/RTL با وضعیت‌های بارگذاری/خالی/خطا/۴۰۴.

آنچه این وضعیت را «آمادهٔ اعتبارسنجی در staging» و نه «آمادهٔ پایلوت» نگه می‌دارد، نه نقص کد بلکه مواردی است که فقط در محیط staging قابل تأیید است (بخش I): اجرای مهاجرت روی دادهٔ staging، درایور ذخیره‌سازی رسانه (در این محیط فعال نیست و API صادقانه `503 STORAGE_DISABLED` می‌دهد)، اندازه‌گیری کارایی روی باندل تولیدی و دامنهٔ واقعی، و بازبینی رندر OG/JSON-LD توسط خزنده‌های واقعی.

**هیچ P0 بازی وجود ندارد.** تمام الزامات امنیتی مسدودکننده پیاده و با آزمون e2e پوشش داده شده‌اند. هیچ آزمونی حذف، ضعیف یا رد نشده است.

| شاخص | نتیجه |
|---|---|
| بک‌اند — واحد | ۱۱۶ مجموعه / ۱۶۷۲ آزمون PASS (پایه ۱۱۴/۱۶۵۳ + ۲/۱۹ بلاگ) |
| بک‌اند — e2e کامل | ۷۰ مجموعه / ۱۵۳۸ آزمون PASS |
| بک‌اند — e2e بلاگ | ۲۲/۲۲ PASS (۲۰ چرخهٔ عمر + ۲ مهاجرت up/down/up) |
| فرانت‌اند — vitest | ۷۹ فایل / ۹۷۷ آزمون PASS (۳ اجرای متوالی سبز؛ پایه ۷۶/۹۴۳) |
| فرانت‌اند — tsc / eslint / build | PASS / PASS / PASS |
| axe (WCAG 2.0/2.1/2.2 A+AA) | ۱۵ سطح بررسی‌شده، **۰ نقض** پس از رفع ۸ مورد |
| خطای کنسول مرورگر | ۰ (به‌جز لاگ شبکهٔ 404 در صفحات ۴۰۴ واقعی که انتظار می‌رود) |

---

## B. ماتریس الزامات

وضعیت‌ها: PASS / PARTIAL / FAIL / NOT RUN / BLOCKED / NEEDS PRODUCT DECISION. شواهد به آزمون (`Txx` = `test/blog/blog.e2e-spec.ts`)، فایل یا اجرای QA ارجاع می‌دهند.

### B.1 مسیرهای عمومی

| الزام | وضعیت | شواهد |
|---|---|---|
| `/blog`: معرفی، مقالهٔ ویژه، تازه‌ها، دسته‌ها، جستجو، کارت با تاریخ/نویسنده/زمان مطالعه، صفحه‌بندی، لینک بازار | PASS | `BlogHomePage.tsx`; `BlogPages.test.tsx` (۱۳/۱۳); QA shot `01-blog-home`, `04-blog-search` |
| `/blog/{slug}`: مقالهٔ کامل، TOC، منابع، مرتبط‌ها، پیوند بازار، canonical/OG، ۴۰۴ واقعی، پنهان‌سازی بخش‌های خالی | PASS | `BlogArticlePage.tsx`, `BlogBlocks.tsx`; QA `02-blog-article`, `06-blog-404`, `07-blog-draft-is-404` (پیش‌نویس = 404 + `noindex,nofollow`) |
| `/blog/category/{slug}`, `/blog/tag/{slug}`, `/blog/author/{slug}` | PASS | `BlogArchivePage.tsx`; QA `03-blog-category`, `05-blog-tag`; نویسنده بدون مقالهٔ منتشرشده → 404 (`blog-public.service.ts`) |
| اعتبارسنجی جستجو/وضعیت URL | PASS | `q ≤ 120`, `page/pageSize` عددی، `sort` enum → مقادیر نامعتبر 400 (`L1`); فرانت فقط مقادیر معتبر را در URL نگه می‌دارد |
| ادغام ناوبری بدون تکرار | PASS | `WebsiteLayout.tsx` (یک ورودی «بلاگ»)؛ ۶ فایل بلاگ استاتیک قدیمی حذف شد (`src/content/blog.ts`, `WebsiteBlogPage`, …) |
| حالت‌های بارگذاری/خالی/خطا/۴۰۴ | PASS | `BlogCardsSkeleton`, `blog-article-error`, `blog-article-404`, آرشیو خالی `noindex,follow` |
| فارسی/RTL، تایپوگرافی سردبیری، موبایل | PASS | QA `08-mobile-home`, `09-mobile-article` (۳۹۰px)؛ `lang=fa dir=rtl` در همهٔ ۱۵ سطح |

### B.2 مدل محتوا و چرخهٔ عمر

| الزام | وضعیت | شواهد |
|---|---|---|
| فیلدهای کامل (عنوان، نامک یکتا، خلاصه، بدنهٔ ساخت‌یافته، تصویر+alt، نویسنده، بازبین، وضعیت، publishedAt، contentUpdatedAt، سئو، canonical، اجتماعی، دستهٔ اصلی، برچسب، خوشه، ویژه، مرتبط، منابع، پیوند بازار) | PASS | `blog-post.entity.ts`, `blog-post-links.entity.ts`, مهاجرت `1772200000000-blog-platform.ts` |
| چرخهٔ عمر سمت‌سرور؛ انتقال نامعتبر 409 | PASS | `domain/blog-status.ts` (+۵ آزمون واحد); `W5` |
| زمان‌بندی: قبل از موعد نامرئی؛ ارتقای تنبل با `publishedAt = scheduledFor` | PASS | `W6` |
| خروج از انتشار → حذف از جزئیات/ریدایرکت/فهرست/sitemap/feed | PASS | `W4` |
| ویرایش مقالهٔ منتشرشده `publishedAt` را تغییر نمی‌دهد | PASS | `W2` |
| دسته/برچسب سردبیری جدا از تاکسونومی بازار | PASS | جدول‌های `blog_categories/blog_tags` جدا؛ تاکسونومی بازار دست نخورده (`git diff` بدون تغییر در `categories/industries`) |
| حذف امن/بازتخصیص دسته؛ ادغام برچسب | PASS | `T2`, `T3`; UI: `blog-category-reassign`, `blog-tags-merge` |
| نویسنده/بازبین = کاربران موجود با مجوز | PASS | `GET /admin/blog/authors` فقط کارکنان با نقش ادمین؛ FK `ON DELETE SET NULL` |
| اعتبارسنجی ارجاع به بازار | PASS | `agentIds/marketCategoryIds` با FK واقعی؛ ناشناخته → 400/404 (`X1`, `W1`) |
| قیود/ایندکس/FK | PASS | `uq slug`, ایندکس‌های `status_published/category/author/scheduled`, `gin trgm` برای جستجو |
| مهاجرت نسخه‌دار + بازگشت + حفظ داده | PASS (غیرتولیدی) | `blog-migration.e2e-spec.ts`: up → down (فقط `blog_*` و enum حذف می‌شوند، سایر جدول‌ها دست‌نخورده) → up |

### B.3 CMS مدیریت `/admin/blog`

| الزام | وضعیت | شواهد |
|---|---|---|
| فهرست با جستجو/فیلتر/مرتب‌سازی/صفحه‌بندی/نشان‌ها، شمارش واقعی | PASS | `AdminBlogPage.tsx`; `L1`; QA `10-admin-list` |
| ایجاد/ویرایش، ویژه، عملیات گروهی امن | PASS | `L2` (قواعد هر آیتم + گزارش ردشده‌ها)؛ `blog-bulk-confirm` |
| ویرایشگر با پیش‌نمایش، ذخیره/انتشار، اعتبارسنجی، ذخیرهٔ پاک‌سازی‌شده | PASS | `POST /admin/blog/render`; تب پیش‌نمایش (QA `12-admin-editor-preview-tab`) |
| ذخیرهٔ دستی + خودکار، وضعیت نمایان، بدون موفقیت کاذب | PASS | `SaveIndicator`; autosave ۳۰ ثانیه فقط برای پیش‌نویس؛ روی مقالهٔ زنده 400 (`W2`) |
| محافظ ناوبری با تغییرات ذخیره‌نشده | PASS | QA `[guard] dirty=true, modal shown, save-and-leave persisted=true` (`17-admin-leave-guard`) |
| تشخیص تعارض | PASS | `version` اجباری، 409 `STALE_STATE` (`D3`); UI `blog-conflict` |
| بدون نسخه به‌ازای هر کلید | PASS | ادغام <۱۰ دقیقه، autosave بدون نسخه، سقف ۵۰ (`D4`) |
| پیش‌نمایش مجاز | PASS | `D2`: ویرایشگر/بینندهٔ مجاز 200، ناشناس 401، خریدار 403؛ QA ناشناس → `/login` |
| آپلود رسانه با اعتبارسنجی، alt/caption | PASS (کد) / BLOCKED (محیط) | `media-rules.ts` نوع `blog` (۳ MB، ۴۸۰×۲۷۰ تا ۴۰۹۶²، نسبت ۰٫۵–۳٫۲)، `media-storage.e2e-spec.ts` ۸/۸؛ در این sandbox درایور ذخیره‌سازی غیرفعال است → API `503 STORAGE_DISABLED` و UI دکمهٔ آپلود را غیرفعال و «نشانی دستی» را فعال می‌کند (`M1`) |
| کنترل‌های سئوی صادقانه | PASS | شمارندهٔ طول، هشدار `seo_title_long/seo_description_long`، canonical فقط `https://` |
| تأیید گردش کار | PASS | `blog-confirm-action` برای publish/unpublish/archive/… |
| مدیریت تاکسونومی (CRUD، ادغام، بازتخصیص قبل از حذف) | PASS | `AdminBlogTaxonomyPage.tsx`; `AdminBlogPages.test.tsx` (۱۸/۱۸); QA `14-admin-taxonomy` |
| تاریخچهٔ نسخه‌های محدود + بازگردانی | PASS | `R1` (بازگردانی = نسخهٔ جدید، بدون تغییر وضعیت انتشار) |

### B.4 سئو

| الزام | وضعیت | شواهد |
|---|---|---|
| meta/canonical/robots/OG/lang/dir واقعی برای هر مسیر | PASS | QA `report.json → checks.*` (title/canonical/robots/og برای ۱۵ سطح) |
| ۴۰۴ واقعی | PASS | API 404 `NOT_FOUND` → صفحهٔ ۴۰۴ + `noindex,nofollow` |
| تغییر نامک → ریدایرکت بدون زنجیره | PASS | `W3` (`blog_slug_redirects`؛ بازگشت به نامک قبلی ریدایرکت را حذف می‌کند؛ نامک‌های رزرو 409) |
| sitemap فقط منتشرشده‌ها با lastmod | PASS | `GET /blog/sitemap`; `scripts/emit-seo.mjs` در build با `SEO_API_BASE`؛ canonical خارجی حذف می‌شود |
| JSON-LD BlogPosting + BreadcrumbList + Organization | PASS | `BlogArticlePage.tsx` (`@graph`); `report.json → checks.02-blog-article.ld` |
| سیاست ایندکس مستند | PASS | `MESH_Blog_Decisions_FA.md` §۱۲ |
| RSS | PASS | `GET /blog/feed.xml` (`application/rss+xml`, ۲۰ آیتم، فقط خلاصه، `max-age=300`) + `<link rel=alternate>` در `/blog` |

### B.5 امنیت (همهٔ موارد مسدودکننده)

| الزام | وضعیت | شواهد |
|---|---|---|
| مجوز سمت‌سرور برای همهٔ عملیات CMS | PASS | ۳۲ مسیر `/admin/blog/*` زیر `@Roles(ADMIN)` + مجوزهای `blog:view < blog:manage < blog:publish` در `route-permissions.ts`; `P1` |
| پاک‌سازی/XSS | PASS | پارسر Markdown اختصاصی بدون HTML خام؛ خروجی JSON بلوکی؛ رندر React بدون `innerHTML` (۱۴ آزمون واحد `blog-markdown.spec.ts`) |
| لینک‌های امن | PASS | `unsafe_url` (javascript:/data:/vbscript:) رد می‌شود؛ `IsSafeLink` فقط http(s) یا مسیر نسبی؛ `D4` |
| اعتبارسنجی آپلود | PASS (کد) | بخش B.3 |
| CSRF | N/A (مستند) | احراز هویت Bearer در حافظه + کوکی refresh فقط `httpOnly` که برای نوشتن استفاده نمی‌شود؛ هیچ endpoint نوشتنی با کوکی احراز نمی‌شود |
| اعتبارسنجی ورودی | PASS | DTOهای `class-validator` با `whitelist`؛ `L1`/`X1` |
| بدون نشت داده | PASS | API عمومی فقط `name/username/avatar` نویسنده؛ QA ناشناس: `draftLeaked=false`, `publicRowsExposeStatus=false`, `adminList=401` |
| محدودیت نرخ | PASS | عمومی: فهرست ۱۲۰/۶۰s، feed ۶۰/۶۰s؛ آپلود ۲۰/۶۰s؛ سایر مسیرها زیر throttler سراسری |
| پیش‌نویس‌ها هرگز نشت نمی‌کنند | PASS | `D1`, `W4`, QA `07-blog-draft-is-404` |
| باطل‌سازی کش | PASS | `PublicCache('revalidate')` (ETag) → پس از publish/unpublish پاسخ جدید؛ `W4` |
| مستندات پشتیبان/بازگشت صادقانه | PASS | بخش C.4 |

### B.6 کارایی، دسترس‌پذیری، RTL، QA بصری

| الزام | وضعیت | شواهد |
|---|---|---|
| axe + صفحه‌کلید | PASS | ۱۵ سطح × tags `wcag2a, wcag2aa, wcag22aa` → ۰ نقض؛ پیمایش TOC با Tab/Enter (`outline:true`, hash تغییر می‌کند) |
| اسکرین‌شات صفحات کلیدی | PASS (خارج از مخزن) | `/home/user/qa-blog/01…17-*.png` (۱۸ فایل، ۳٫۸ MB؛ عمداً commit نشده) |
| اندازه‌گیری کارایی | PARTIAL | زمان تا رندر محتوای اصلی در dev-server (Vite، بدون minify): ۱٫۸–۲٫۳ s برای همهٔ سطوح؛ اندازهٔ chunkهای تولیدی در بخش C.5؛ Lighthouse روی باندل تولیدی و دامنهٔ واقعی: **NOT RUN** (نیازمند staging) |
| ریسپانسیو | PASS | ۱۳۶۶px و ۳۹۰px برای خانه، مقاله، ویرایشگر |

### B.7 آزمون

| الزام | وضعیت |
|---|---|
| پایهٔ اولیه قبل از تغییر | PASS (BE ۱۱۴/۱۶۵۳ واحد، ۶۸/۱۵۱۵ e2e؛ FE ۷۶/۹۴۳) |
| واحد / API / E2E چرخهٔ عمر / a11y-ریسپانسیو / رگرسیون | PASS — بخش G |

---

## C. معماری و داده

### C.1 جریان محتوا
`bodyMarkdown` (منبع حقیقت) → پارسر سرور `domain/blog-markdown.ts` → `blocks` JSON (heading/paragraph/list/quote(note|tip|warning)/code/image/table/hr با inlineهای text/strong/em/code/link/br) + `toc` + `wordCount` + `readingMinutes` + `warnings` → ذخیره در `blog_posts` → فرانت فقط JSON بلوکی را رندر می‌کند (`BlogBlocks.tsx`). پیش‌نمایش زنده با `POST /admin/blog/render` (بدون ذخیره).

### C.2 جدول‌ها (مهاجرت `1772200000000-blog-platform.ts`)
`blog_categories` (یک سطح والد، slug یکتا) · `blog_tags` · `blog_posts` (uq `slug`؛ ایندکس‌های `(status, published_at)`, `category`, `author`, `scheduled_for`؛ GIN `pg_trgm` روی عنوان/خلاصه) · `blog_post_tags` · `blog_post_relations` (مرتبط‌ها) · `blog_post_agents` (FK به `agents`) · `blog_post_market_categories` (FK به `categories`) · `blog_slug_redirects` (uq نامک قدیمی، بدون زنجیره) · `blog_post_revisions` (snapshot JSON، سقف ۵۰). enum وضعیت: `draft|in_review|scheduled|published|archived`.

### C.3 سرویس‌ها و API
- `blog-posts.service.ts` (۱۱۱۷ خط): CRUD، چرخهٔ عمر، چک‌لیست انتشار (`422 PUBLISH_CHECKLIST_FAILED {issues}`)، همزمانی خوش‌بینانه، نسخه‌ها، ریدایرکت، bulk، `promoteDue()`.
- `blog-taxonomy.service.ts`: دسته/برچسب، ادغام، بازتخصیص.
- `blog-public.service.ts`: خانه، فهرست/جستجو، جزئیات (+`redirectTo`)، دسته/برچسب/نویسنده، sitemap، RSS.
- ۱۰ مسیر عمومی `/blog/*` (ETag) و ۳۲ مسیر `/admin/blog/*` — فهرست کامل در `docs/admin/generated/admin-routes.md` و `contracts/api-routes.json` (هر دو مخزن هم‌گام).
- مجوزها: `blog:view|manage|publish` در `admin-permissions.ts`; اقدام‌های حسابرسی در `audit-actions.ts`.

### C.4 پشتیبان و بازگشت (صادقانه)
- **قبل از اجرای مهاجرت در staging/prod:** `pg_dump` کامل. مهاجرت فقط جدول‌های جدید `blog_*` و یک enum می‌سازد؛ هیچ جدول موجودی تغییر نمی‌کند (به‌جز افزودن مقدار `blog` به قاعدهٔ رسانه در کد، نه در DB).
- **بازگشت:** `npm run migration:revert` → `down()` فقط `blog_*` و enum را حذف می‌کند (آزمون `blog-migration.e2e-spec.ts` تأیید می‌کند سایر جدول‌ها دست‌نخورده می‌مانند). **محتوای بلاگ با revert از بین می‌رود** — بنابراین revert پس از ورود محتوای واقعی فقط با پشتیبان معنا دارد.
- **بازگشت کد بدون revert DB** امن است: جدول‌های `blog_*` بلااستفاده می‌مانند و هیچ مسیر دیگری به آن‌ها وابسته نیست.
- در این sandbox: مهاجرت روی `agenthub` و `agenthub_test` اجرا شد (`migration:show → [X] 45 BlogPlatform`)؛ چرخهٔ up/down/up فقط روی `agenthub_test`.

### C.5 اندازهٔ chunkهای تولیدی (vite build, gzip)
`AdminBlogEditorPage` 34.4 KB (9.7) · `AdminBlogTaxonomyPage` 14.8 KB (3.7) · `BlogArticlePage` 10.8 KB (3.7) · `AdminBlogPage` 10.3 KB (3.1) · `BlogHomePage` 8.9 KB (3.2) · `blogShared` 5.0 KB (2.2) · `BlogArchivePage` 3.5 KB (1.6) · `BlogBlocks` 3.1 KB (1.1) · `blogAdminShared` 2.9 KB (1.3) · `api/blog` 2.0 KB (0.7) · `AdminBlogPreviewPage` 1.4 KB (0.7). همهٔ صفحات lazy هستند؛ هیچ وابستگی جدیدی اضافه نشده (بدون کتابخانهٔ Markdown/sanitizer شخص ثالث).

---

## D. UX و QA بصری

اجرا: `cd agentHub_frontend && node scripts/qa/blog-qa.mjs` (Playwright Chromium + axe-core؛ ورود واقعی با حساب seed ادمین؛ محتوای آزمایشی از طریق API ادمین ساخته می‌شود؛ خروجی در `OUT=/home/user/qa-blog` خارج از مخزن). آخرین اجرا: exit 0، ۱۵/۱۵ سطح `axe=0`.

| # | سطح | نتیجه |
|---|---|---|
| 01 | `/blog` دسکتاپ | PASS — ویژه، تازه‌ها، چیپ دسته، جستجو، آرشیو |
| 02 | `/blog/{slug}` | PASS — سرتیتر، تصویر+caption، TOC افقی چسبان، callout، لیست، منابع، نویسنده، مرتبط، CTA بازار |
| 03/05 | دسته / برچسب | PASS |
| 04 | جستجو `?q=` | PASS — `noindex,follow` |
| 06/07 | ۴۰۴ و پیش‌نویس | PASS — HTTP 404 + صفحهٔ ۴۰۴ واقعی |
| 08/09 | موبایل ۳۹۰px خانه/مقاله | PASS |
| — | صفحه‌کلید TOC | PASS (فوکوس مرئی، Enter → پرش) |
| 10 | فهرست ادمین | PASS — کاشی‌های وضعیتِ قابل‌کلیک (`aria-pressed`)، فیلترها، جدول، شمارش |
| 11/12 | ویرایشگر + تب پیش‌نمایش | PASS |
| 13 | پیش‌نمایش مجاز | PASS — بنر پیش‌نمایش، `noindex` |
| 14 | تاکسونومی | PASS |
| 15 | مقالهٔ جدید | PASS |
| 16 | ویرایشگر موبایل | PASS |
| 17 | محافظ خروج + ذخیره | PASS |
| — | ناشناس | PASS — admin API 401، پیش‌نمایش → `/login`، پیش‌نویس در فهرست عمومی نیست |

**نقص‌های واقعی که در این مرحله پیدا و رفع شد (همه در کد):**
1. کنتراست متن‌های ریز (`#8993a3`/`#7e8793` ≈ ۳٫۱:۱) در کارت، TOC، caption، نویسنده، مرتبط‌ها → `#5f6b7a` (۵٫۴:۱).
2. چیپ شمارش دسته‌ها با `opacity` → رنگ صریح.
3. `<pre>` قابل اسکرول بدون فوکوس → `tabIndex=0` + `aria-label`.
4. کارت «تازه‌ها» با تصویر شاخص: ارتفاع تصویر کل کارت را می‌گرفت و بدنه بریده می‌شد → ارتفاع ثابت ۱۵۰/۱۳۵px.
5. کاشی‌های آمار ادمین: کادر تو‌در‌تو (دکمه + `Stat`) → مارک‌آپ یکپارچه با `aria-pressed`.
6. پوستهٔ داشبورد (پیش‌موجود، ≤۴۰۰px): پیل‌های تعویض پنل هم برچسب و هم آیکن را پنهان می‌کردند → هدف ۱۶px خالی (WCAG 2.5.8) → آیکن حفظ شد، `min-width:32px`.
7. صفحات ادمین بلاگ بدون `<h1>` (ویرایشگر) و بدون `noindex` → اصلاح شد (۳ صفحه).
8. اسکریپت QA: context دوم برای موبایل، کوکی refresh را می‌چرخاند و نشست اصلی را باطل می‌کرد → viewport در همان صفحه تغییر می‌کند؛ transitionها قبل از axe خاموش می‌شوند تا رنگ میان‌راه نمونه‌برداری نشود.

---

## E. سئو — خلاصهٔ اعتبارسنجی

- هر ۱۵ سطح: `lang=fa`, `dir=rtl`, `title` و `og:title` واقعی؛ canonical مطلق برای `/blog`, مقاله، دسته، برچسب؛ `robots` طبق جدول §۱۲ سند تصمیم‌ها (جستجو `noindex,follow`، ۴۰۴ و ادمین `noindex,nofollow`).
- JSON-LD: `@graph[Organization, BreadcrumbList, BlogPosting(headline, datePublished, dateModified, author, image, wordCount, articleSection, keywords)]`.
- sitemap: `GET /blog/sitemap` فقط `published` با `lastmod=contentUpdatedAt`؛ build فرانت با `SEO_API_BASE` آن را در `public/sitemap.xml` ادغام می‌کند (بدون آن، فقط هشدار لاگ و بدون نشانی اشتباه). ۴ نشانی مقالهٔ استاتیک قدیمی (localhost) از `public/sitemap.xml` حذف شد.
- ریدایرکت نامک: API `{data:{redirectTo}}` → فرانت `<Navigate replace>`؛ در لایهٔ HTTP واقعی (CDN/Nginx) ریدایرکت 301 باید از همین جدول تغذیه شود — **تا استقرار staging NOT RUN**.
- نکتهٔ صادقانه: SPA است؛ meta/JSON-LD سمت کلاینت تزریق می‌شوند. Googlebot آن را رندر می‌کند، اما پیش‌نمایش شبکه‌های اجتماعی (OG scraper بدون JS) تصویر/عنوان مقاله را نمی‌بیند مگر اینکه لایهٔ pre-render/SSR یا قاعدهٔ edge برای `/blog/*` وجود داشته باشد. این محدودیت پیش از این برای کل سایت وجود داشت و با بلاگ ایجاد نشده؛ در I فهرست شده است.

---

## F. امنیت — خلاصه

| حوزه | پیاده‌سازی | آزمون |
|---|---|---|
| احراز/مجوز | JWT Bearer + نقش ادمین + مجوزهای سه‌سطحی بلاگ؛ پیش‌نمایش نیازمند `blog:view` | `P1`, `D2` |
| XSS | بدون HTML خام در هیچ مسیری؛ پارسر خودی؛ رندر React | `blog-markdown.spec.ts`, `D4` |
| URL ناامن | رد در پارسر (`unsafe_url`) و DTO (`IsSafeLink`, canonical فقط https) | `D4` |
| آپلود | نوع/اندازه/ابعاد/نسبت؛ ۲۰ درخواست/دقیقه؛ 503 صادقانه بدون درایور | `media-storage.e2e-spec.ts`, `M1` |
| CSRF | N/A — نوشتن فقط با Bearer | — |
| نشت | سریالایزرهای عمومی جدا (`blog-serializers.ts`)؛ نویسندهٔ بدون مقاله 404 | QA ناشناس، `D1` |
| نرخ | فهرست عمومی ۱۲۰/دقیقه، feed ۶۰/دقیقه | پیکربندی در کنترلر |
| همزمانی | `version` اجباری → 409 | `D3` |
| حسابرسی | اقدام‌های `blog.*` در `audit-actions.ts` | — |
| ۵۰۰ روی ورودی بد | هیچ‌کدام؛ ناشناخته‌ها 404/400 | `X1`, `L1` |

---

## G. شواهد آزمون (دستور دقیق، محیط، کد خروج)

محیط مشترک: Ubuntu sandbox، Node v20.20.2، PostgreSQL محلی (`agenthub`/`agenthub_test`)، ۲ GB RAM.

| # | دستور | نتیجه | خروج |
|---|---|---|---|
| 1 | BE `npx tsc --noEmit -p tsconfig.build.json` | بدون خطا | 0 |
| 2 | BE `DB_NAME=agenthub_test npm run migration:show` | `[X] 45 BlogPlatform` | 0 |
| 3 | BE `DB_NAME=agenthub_test npx jest --config ./test/jest-e2e.json test/blog` | ۲ مجموعه، **۲۲/۲۲** | 0 |
| 4 | BE `DB_NAME=agenthub_test npx jest --config ./test/jest-e2e.json --maxWorkers=1 --workerIdleMemoryLimit=700MB` (لاگ `/home/user/.be-e2e-full.log`, ۵۷۸ s) | ۷۰ مجموعه؛ اجرای اول ۱ شکست در `contract-envelope.e2e-spec.ts K1` چون `/blog/feed.xml` به‌درستی `application/rss+xml` برمی‌گرداند (نه پاکت JSON) → مسیر به نقشهٔ `FILE_DOWNLOADS` همان spec اضافه شد (تغییر آزمون، نه محصول) → اجرای مجدد spec ۲/۲؛ مجموع **۱۵۳۸/۱۵۳۸** | 0 |
| 5 | BE `npx jest --maxWorkers=2` (واحد، ۳۴۷ s) | **۱۱۶ مجموعه / ۱۶۷۲ آزمون** | 0 |
| 6 | BE `npx eslint src/modules/blog test/blog test/contract-envelope.e2e-spec.ts` + prettier | بدون خطا | 0 |
| 7 | BE `npm run build` | `dist/main.js` | 0 |
| 8 | FE `npx tsc --noEmit` | بدون خطا | 0 |
| 9 | FE `npx eslint src/pages/blog src/pages/admin/blog src/api/blog.ts src/i18n scripts/qa/blog-qa.mjs` | بدون خطا | 0 |
| 10 | FE `npx vitest run` (×۴) | اجرای ۱: ۷۸ فایل PASS / ۱ شکست (۹۷۶/۹۷۷) — خروجی شکست ضبط نشد؛ اجراهای ۲، ۳، ۴: **۷۹ فایل / ۹۷۷ آزمون PASS** (لاگ‌ها `/home/user/.fe-vitest-3.log`, `.fe-vitest-4.log`). شکست اول تکرارپذیر نبود و به‌عنوان ناپایداری ناشناخته ثبت می‌شود (نه پنهان) | 0 |
| 11 | FE `npm run build` | PASS (۱٫۰۸ s، chunkها در C.5)؛ هشدار اندازهٔ chunk مربوط به باندل vendor پیش‌موجود (۱٫۰۴ MB) است، نه بلاگ | 0 |
| 12 | FE `node scripts/qa/blog-qa.mjs` (BE `node dist/main.js` روی :3000 با DB `agenthub`، Vite روی :5173) | ۱۵ سطح axe=0؛ guard PASS؛ ناشناس PASS؛ `report.json` + ۱۸ PNG در `/home/user/qa-blog/` | 0 |

پوشش آزمون‌های جدید: BE واحد ۱۹ (پارسر ۱۴، وضعیت ۵)؛ BE e2e ۲۲؛ FE `BlogPages.test.tsx` ۱۳، `AdminBlogPages.test.tsx` ۱۸، `blog-i18n.test.ts` (برابری ۳۲۳ کلید fa/en)، `WebsitePages.test.tsx` به‌روزرسانی‌شده، `contracts` ۶/۶.

---

## H. فایل‌های تغییریافته

### بک‌اند (۱۶ تغییر، ۱۰۰۱+/۲۱− · ۲۱ فایل جدید ≈ ۶٬۴۶۰ خط)
جدید: `src/modules/blog/{blog.module,blog-admin.controller,blog-public.controller,blog-posts.service,blog-public.service,blog-taxonomy.service,blog-serializers}.ts`, `src/modules/blog/domain/{blog-markdown,blog-status}.ts` (+spec)، `src/modules/blog/dto/{blog-admin,blog-public}.dto.ts`, `src/database/entities/blog/*` (۵)، `src/database/migrations/1772200000000-blog-platform.ts`, `test/blog/{blog,blog-migration}.e2e-spec.ts`.
تغییر: `src/app.module.ts`, `src/database/entities/index.ts`, `platform/media-asset.entity.ts`, `storage/{storage.service,media-rules}.ts`, `audit/audit-actions.ts`, `control-plane/authz/{admin-permissions,route-permissions}.ts`, `test/fixtures/public-routes.ts`, `test/media-storage.e2e-spec.ts`, `test/contract-envelope.e2e-spec.ts`, `contracts/api-routes.json`, `docs/foundation/generated/api-inventory.{json,md}`, `docs/admin/generated/{permission-matrix,admin-routes}.md`.

### فرانت‌اند (۱۶ تغییر، ۳۵۴+/۱۵۸۳− · ۲۱ فایل جدید ≈ ۸٬۰۴۰ خط)
جدید: `src/api/blog.ts`, `src/pages/blog/{blogShared,BlogBlocks,BlogHomePage,BlogArticlePage,BlogArchivePage}.tsx` (+`__tests__/BlogPages.test.tsx`), `src/pages/admin/blog/{blogAdminShared,AdminBlogPage,editorPanels,AdminBlogEditorPage,AdminBlogPreviewPage,AdminBlogTaxonomyPage}.tsx` (+`__tests__/AdminBlogPages.test.tsx`), `src/styles/{blog,blog-admin}.css`, `src/i18n/blog.{fa,en}.ts` (+`__tests__/blog-i18n.test.ts`), `scripts/qa/blog-qa.mjs`, `docs/blog/{MESH_Blog_Decisions_FA,MESH_Blog_Release_Report_FA}.md`.
تغییر: `src/app/router.tsx`, `src/main.tsx`, `src/pages/admin/AdminArea.tsx`, `src/pages/website/WebsiteLayout.tsx`, `src/pages/website/__tests__/WebsitePages.test.tsx`, `src/i18n/index.tsx`, `src/index.css` (فقط قاعدهٔ ≤۴۰۰px پیل‌ها)، `scripts/emit-seo.mjs`, `public/sitemap.xml`, `contracts/api-routes.json`.
حذف: `src/content/blog.ts`, `src/pages/marketing/{BlogPage,BlogArticlePage}.tsx`, `src/pages/website/{WebsiteBlogPage,WebsiteArticlePage}.tsx`, `src/pages/reference/RefArticlePage.tsx`.
خارج از مخزن (عمداً): اسکرین‌شات‌ها و `report.json` در `/home/user/qa-blog/`.

---

## I. موارد باقی‌مانده / تأییدنشده

هیچ‌کدام P0 نیست؛ همه پیش از پایلوت محتوا باید در staging بسته شوند.

1. **اجرای مهاجرت روی staging** (`npm run migration:run` با پشتیبان قبلی) — در این محیط فقط روی DB محلی اجرا شده.
2. **درایور ذخیره‌سازی رسانه** در staging باید فعال باشد تا آپلود تصویر شاخص واقعی آزموده شود؛ در غیر این صورت سردبیر فقط می‌تواند نشانی تصویر وارد کند (UI این را صریح نشان می‌دهد).
3. **کارایی تولیدی**: Lighthouse/Core Web Vitals روی باندل build و دامنهٔ واقعی NOT RUN؛ اعداد موجود فقط dev-server هستند.
4. **ریدایرکت 301 در لایهٔ HTTP** برای نامک‌های قدیمی (در حال حاضر client-side با `replace`) — پیشنهاد: قاعدهٔ edge که `blog_slug_redirects` را می‌خواند، یا پذیرش ریدایرکت کلاینتی (Google آن را دنبال می‌کند ولی اعتبار کندتر منتقل می‌شود).
5. **OG برای اسکرِیپرهای بدون JS** (تلگرام/لینکدین): محدودیت SPA کل سایت؛ نیازمند pre-render برای `/blog/*` در صورت اهمیت اشتراک‌گذاری اجتماعی.
6. **ناپایداری یک‌بارهٔ vitest** (اجرای ۱) شناسایی نشد؛ سه اجرای بعدی سبز بودند. پیشنهاد: اجرای CI با `--retry=0` و ضبط گزارش JSON برای ردیابی.
7. **بار واقعی ~۱۰۰ مقاله**: فیکسچرها ۳ مقاله‌اند؛ ایندکس‌ها برای این مقیاس طراحی شده‌اند (GIN trgm، ایندکس وضعیت/تاریخ) ولی اندازه‌گیری با دادهٔ حجیم NOT RUN.
8. **ارتقای تنبل زمان‌بندی**: بدون ترافیک، ارتقا در اولین درخواست پس از موعد انجام می‌شود (مستند در سند تصمیم‌ها §۵)؛ اگر دقت دقیقه‌ای لازم شد یک job روی `promoteDue()` اضافه شود.
9. **مهاجرت معوق قبلی**: حذف `recently_viewed_agents` (از فاز پیشین) همچنان باز است و ربطی به بلاگ ندارد.

---

## J. توصیهٔ نهایی — پاسخ به ۸ پرسش

1. **آیا برای پایلوت محتوا آماده است؟** از نظر کد و آزمون، بله؛ از نظر عملیاتی، پس از بستن موارد ۱ و ۲ بخش I در staging. وضعیت رسمی: **READY FOR STAGING VALIDATION**.
2. **آیا انتشار محتوا در محیط غیرتولیدی امن است؟** بله. چرخهٔ عمر، مجوزها، پاک‌سازی و عدم نشت پیش‌نویس همگی با e2e پوشش داده شده‌اند.
3. **چه چیزهایی تأیید نشده؟** بخش I: مهاجرت staging، درایور رسانه، کارایی تولیدی، ریدایرکت HTTP 301، OG بدون JS، بار ۱۰۰ مقاله.
4. **آیا مهاجرت لازم است؟** بله، یک مهاجرت (`1772200000000-blog-platform`) که فقط جدول‌های `blog_*` و یک enum می‌سازد؛ هیچ جدول موجودی تغییر نمی‌کند.
5. **بازگشت کجا تأیید شده؟** روی `agenthub_test` با آزمون خودکار up→down→up (`blog-migration.e2e-spec.ts`): down فقط `blog_*` را حذف می‌کند و سایر جدول‌ها دست‌نخورده‌اند. روی staging/prod تأیید نشده.
6. **آیا بازار دست‌نخورده مانده؟** بله. هیچ تغییری در تاکسونومی/ایجنت‌ها/جریان خرید نیست؛ رگرسیون کامل بک‌اند (۱۵۳۸ e2e، ۱۶۷۲ واحد) و فرانت (۹۷۷) سبز است؛ پیوندهای بلاگ↔بازار فقط FK افزودنی‌اند.
7. **کوچک‌ترین گام بعدی چیست؟** روی staging: پشتیبان → `migration:run` → فعال‌سازی درایور رسانه → اجرای `scripts/qa/blog-qa.mjs` با `BASE=<staging>` → انتشار ۲–۳ مقالهٔ واقعی توسط تیم محتوا و بررسی Search Console.
8. **آیا تولید همچنان ممنوع است؟** بله. هیچ استقرار، مهاجرت یا تغییر پیکربندی تولیدی انجام نشده و تا پایان اعتبارسنجی staging نباید انجام شود.
