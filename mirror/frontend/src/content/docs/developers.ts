import { API_EXAMPLE_ORIGIN, API_PREFIX, PLATFORM_FACTS as F } from '../platform-facts';
import type { DocArticle } from './types';

const UPDATED = '2026-10-13';
const BASE = `${API_EXAMPLE_ORIGIN}${API_PREFIX}`;

export const DEVELOPERS: DocArticle[] = [
  {
    slug: 'developer-api-overview',
    section: 'developers',
    owner: 'engineering',
    updatedAt: UPDATED,
    title: { fa: 'معرفی API توسعه‌دهندگان', en: 'Developer API overview' },
    summary: {
      fa: 'چه چیزی عمومی است، چه چیزی داخلی است، و قالب پاسخ‌ها.',
      en: 'What is public, what is internal, and the response format.',
    },
    body: {
      fa: `
## وضعیت فعلی — صادقانه

MESH در حال حاضر **یک API عمومیِ فقط‌خواندنی برای کاتالوگ** دارد: فهرست محصولات منتشرشده، جزئیات هر محصول، نظرات، نسخه‌ها، دسته‌بندی‌ها و داده‌های مرجع. این نقاط پایانی بدون احراز هویت در دسترس‌اند و همان چیزی‌اند که وب‌سایت MESH خودش از آن‌ها استفاده می‌کند.

> [!warning] موارد زیر **وجود ندارد** و در این مستندات ادعا نمی‌شود: کلید API برای شخص ثالث، SDK رسمی، وب‌هوک، API خرید یا تحویل برای اپلیکیشن‌های خارجی، و ضمانت پایداری (SLA). نقاط پایانی احراز هویت‌شده (حساب، خرید، کتابخانه، پنل سازنده، مدیریت) **داخلی** محسوب می‌شوند: به نشست مرورگر وابسته‌اند و بدون اطلاع قبلی تغییر می‌کنند.

## نشانی پایه و نسخه

همهٔ مسیرها زیر پیشوند \`${API_PREFIX}\` قرار دارند. در مثال‌ها از نشانی نمونهٔ \`${API_EXAMPLE_ORIGIN}\` استفاده شده است؛ نشانی واقعی همان مبدأ API محیط شماست.

\`\`\`http
GET ${BASE}/agents?sort=newest&pageSize=12
Accept: application/json
\`\`\`

## قالب پاسخ

پاسخ موفق همیشه در پاکت زیر است:

\`\`\`json
{
  "success": true,
  "data": { "items": [], "meta": { "page": 1, "pageSize": 24, "total": 0, "totalPages": 1 } }
}
\`\`\`

پاسخ خطا:

\`\`\`json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "pageSize must not be greater than 100", "details": {} }
}
\`\`\`

- هر پاسخ سرآیند \`X-Request-ID\` دارد؛ هنگام گزارش مشکل آن را ذکر کنید.
- زمان‌ها ISO 8601 (UTC) و مبالغ **رشتهٔ ریالی** هستند (نه عدد ممیز شناور).
- پاسخ‌های عمومی با \`Cache-Control: public, max-age=0, must-revalidate\` و داده‌های مرجع (دسته‌بندی‌ها، مجوزها، یکپارچه‌سازی‌ها) با \`max-age=60, stale-while-revalidate=300\` برمی‌گردند.

## CORS

مبدأهای مجاز توسط اپراتور پیکربندی می‌شوند (\`CORS_ORIGINS\`). فراخوانی مرورگری از دامنه‌ای غیر از وب‌سایت MESH تضمین نشده است؛ برای یکپارچه‌سازی سمت سرور این محدودیت وجود ندارد.

## قدم بعدی

- [نقاط پایانی کاتالوگ عمومی](/docs/public-catalog-endpoints)
- [خطاها و محدودیت نرخ](/docs/errors-and-rate-limits)
- اگر به چیزی فراتر از کاتالوگ نیاز دارید، از [فرم تماس](/contact?topic=general) بگویید؛ موارد درخواستی در اولویت‌بندی لحاظ می‌شود (بدون تعهد زمانی).
`,
      en: `
## Current state — honestly

MESH currently offers **a read-only public API for the catalogue**: published products, product details, reviews, versions, categories and reference data. These endpoints need no authentication and are the same ones the MESH website itself uses.

> [!warning] The following **do not exist** and are not claimed here: third-party API keys, an official SDK, webhooks, a purchase or delivery API for external apps, and stability guarantees (SLA). Authenticated endpoints (account, purchases, library, creator panel, administration) are **internal**: they are bound to the browser session and change without notice.

## Base URL and version

All routes live under the prefix \`${API_PREFIX}\`. Examples use the synthetic origin \`${API_EXAMPLE_ORIGIN}\`; the real origin is the API origin of your environment.

\`\`\`http
GET ${BASE}/agents?sort=newest&pageSize=12
Accept: application/json
\`\`\`

## Response format

A successful response is always wrapped:

\`\`\`json
{
  "success": true,
  "data": { "items": [], "meta": { "page": 1, "pageSize": 24, "total": 0, "totalPages": 1 } }
}
\`\`\`

An error response:

\`\`\`json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "pageSize must not be greater than 100", "details": {} }
}
\`\`\`

- Every response carries an \`X-Request-ID\` header; quote it when reporting a problem.
- Timestamps are ISO 8601 (UTC); amounts are **IRR strings** (never floating-point numbers).
- Public responses return \`Cache-Control: public, max-age=0, must-revalidate\`; reference data (categories, permissions, integrations) returns \`max-age=60, stale-while-revalidate=300\`.

## CORS

Allowed origins are configured by the operator (\`CORS_ORIGINS\`). Browser calls from a domain other than the MESH website are not guaranteed; server-side integrations are not affected.

## Next

- [Public catalogue endpoints](/docs/public-catalog-endpoints)
- [Errors and rate limits](/docs/errors-and-rate-limits)
- If you need more than the catalogue, tell us through the [contact form](/contact?topic=general); requests feed into prioritisation (no timeline commitment).
`,
    },
  },
  {
    slug: 'public-catalog-endpoints',
    section: 'developers',
    owner: 'engineering',
    updatedAt: UPDATED,
    title: { fa: 'نقاط پایانی کاتالوگ عمومی', en: 'Public catalogue endpoints' },
    summary: {
      fa: 'فهرست، جست‌وجو، فیلترها، جزئیات محصول، نظرات، نسخه‌ها و داده‌های مرجع.',
      en: 'List, search, filters, product detail, reviews, versions and reference data.',
    },
    body: {
      fa: `
## فهرست نقاط پایانی

| روش و مسیر | توضیح |
|---|---|
| \`GET /agents\` | فهرست محصولات منتشرشده با جست‌وجو، فیلتر، مرتب‌سازی و صفحه‌بندی |
| \`GET /agents/facets\` | شمارش فیلترها برای پرس‌وجوی فعلی |
| \`GET /agents/suggest?q=\` | پیشنهاد تکمیل خودکار (حداکثر ۸۰ نویسه) |
| \`GET /agents/discovery/no-results\` | راهنمای «نتیجه‌ای یافت نشد» برای یک پرس‌وجو |
| \`GET /agents/:slug\` | جزئیات کامل یک محصول منتشرشده |
| \`GET /agents/:slug/reviews\` | نظرات تأییدشدهٔ محصول (صفحه‌بندی‌شده) |
| \`GET /agents/:slug/versions\` | نسخه‌ها و یادداشت تغییرات |
| \`GET /categories\` | دسته‌بندی‌ها |
| \`GET /industries\` | صنعت‌ها |
| \`GET /reference/permissions\` | فهرست مرجع مجوزها |
| \`GET /reference/integrations\` | فهرست مرجع یکپارچه‌سازی‌ها |
| \`GET /creators/:slug\` | پروفایل عمومی سازنده |
| \`GET /creators/:slug/portfolio\` | محصولات منتشرشدهٔ سازنده |

## فهرست محصولات — \`GET /agents\`

### پارامترهای پرس‌وجو

| پارامتر | نوع | توضیح |
|---|---|---|
| \`q\` | رشته | جست‌وجوی متنی تحمل‌پذیر (فارسی/انگلیسی) |
| \`category\`, \`industry\`, \`integration\`, \`useCase\`, \`requirement\` | رشته (قابل تکرار) | فیلترهای طبقه‌بندی |
| \`productType\`, \`deliveryModel\`, \`executionModel\`, \`setupDifficulty\` | رشته | فیلتر قرارداد محصول |
| \`free\` | بولی | فقط رایگان‌ها |
| \`minPrice\`, \`maxPrice\` | عدد (ریال) | بازهٔ قیمت |
| \`ratingMin\` | ۱ تا ۵ | حداقل امتیاز |
| \`minReviews\` | عدد | حداقل تعداد نظر |
| \`popular\`, \`verified\`, \`securityReviewed\`, \`verifiedCreator\`, \`clearDataPolicy\`, \`noSensitiveData\` | بولی | فیلترهای اعتماد |
| \`creator\` | رشته | نام کاربری سازنده |
| \`sort\` | یکی از \`recommended\`, \`relevance\`, \`popular\`, \`price_asc\`, \`price_desc\`, \`rating\`, \`reviews\`, \`newest\` | مرتب‌سازی |
| \`page\` | ۱ تا ۱۰۰۰۰ (پیش‌فرض ۱) | شمارهٔ صفحه |
| \`pageSize\` | ۱ تا ۱۰۰ (پیش‌فرض ۲۴) | اندازهٔ صفحه |

### مثال

\`\`\`bash
curl "${BASE}/agents?q=invoice&free=false&sort=rating&pageSize=2"
\`\`\`

\`\`\`json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "7d1c9e0a-0000-4000-8000-000000000001",
        "slug": "example-invoice-assistant",
        "name": "Example Invoice Assistant",
        "shortDescription": "Example listing used in the documentation.",
        "logoUrl": null,
        "tags": ["finance", "automation"],
        "isFree": false,
        "price": "1500000",
        "currency": "IRR",
        "version": "1.2.0",
        "riskLevel": "low",
        "rating": { "average": 4.6, "count": 12 },
        "verified": true,
        "category": { "id": "0f0e0d0c-0000-4000-8000-000000000002", "slug": "productivity", "name": "Productivity", "nameFa": "بهره‌وری" },
        "creator": { "id": "a1b2c3d4-0000-4000-8000-000000000003", "slug": "example-creator", "displayName": "Example Creator", "avatarUrl": null, "verified": true },
        "productType": "workflow",
        "deliveryModel": "self_hosted",
        "executionModel": "buyer_infrastructure",
        "setupDifficulty": "medium",
        "useCases": ["invoice extraction"],
        "integrationNames": ["REST API"],
        "popular": false,
        "publishedAt": "2026-01-15T08:30:00.000Z"
      }
    ],
    "meta": { "page": 1, "pageSize": 2, "total": 1, "totalPages": 1 },
    "search": { "query": "invoice", "normalized": "invoice", "relaxed": false, "concepts": [], "sort": "rating" }
  }
}
\`\`\`

> [!note] مقادیر بالا **ساختگی** و فقط برای نمایش شکل پاسخ‌اند. فیلدهای قرارداد محصول در فهرست‌های قدیمی می‌توانند \`null\` باشند؛ در این حالت «نامشخص» نمایش دهید و مقدار نسازید.

## جزئیات محصول — \`GET /agents/:slug\`

همهٔ فیلدهای کارت به‌علاوهٔ \`fullDescription\`, \`capabilities\`, \`limitations\`, \`useCases\`, \`targetAudience\`, \`inputs\`, \`outputs\`, \`howItWorks\`, \`exampleInput\`, \`exampleOutput\`, \`usageGuide\`, \`demoUrl\`، قرارداد محصول (مجوزها با دلیل، نیازمندی‌ها، سیاست داده)، خلاصهٔ امتیاز و نظرات اخیر. محصولات منتشرنشده \`404\` با کد \`AGENT_NOT_FOUND\` برمی‌گردانند.

\`\`\`bash
curl "${BASE}/agents/example-invoice-assistant"
\`\`\`

## نظرات — \`GET /agents/:slug/reviews\`

پارامترهای \`page\` و \`pageSize\` مانند فهرست؛ فقط نظرات خریداران تأییدشده برمی‌گردد.

## داده‌های مرجع

\`GET /categories\`, \`GET /industries\`, \`GET /reference/permissions\`, \`GET /reference/integrations\` فهرست‌های کوچکی برمی‌گردانند که برای ساخت فیلتر مناسب‌اند و ۶۰ ثانیه قابل کش‌اند.
`,
      en: `
## Endpoint list

| Method and path | Description |
|---|---|
| \`GET /agents\` | Published products with search, filters, sorting and pagination |
| \`GET /agents/facets\` | Filter counts for the current query |
| \`GET /agents/suggest?q=\` | Autocomplete suggestions (max 80 characters) |
| \`GET /agents/discovery/no-results\` | Zero-result guidance for a query |
| \`GET /agents/:slug\` | Full detail of a published product |
| \`GET /agents/:slug/reviews\` | Approved reviews of the product (paginated) |
| \`GET /agents/:slug/versions\` | Versions and release notes |
| \`GET /categories\` | Categories |
| \`GET /industries\` | Industries |
| \`GET /reference/permissions\` | Reference list of permissions |
| \`GET /reference/integrations\` | Reference list of integrations |
| \`GET /creators/:slug\` | Public creator profile |
| \`GET /creators/:slug/portfolio\` | The creator's published products |

## Product list — \`GET /agents\`

### Query parameters

| Parameter | Type | Description |
|---|---|---|
| \`q\` | string | Tolerant text search (Persian / English) |
| \`category\`, \`industry\`, \`integration\`, \`useCase\`, \`requirement\` | string (repeatable) | Taxonomy filters |
| \`productType\`, \`deliveryModel\`, \`executionModel\`, \`setupDifficulty\` | string | Product-contract filters |
| \`free\` | boolean | Free products only |
| \`minPrice\`, \`maxPrice\` | number (IRR) | Price range |
| \`ratingMin\` | 1–5 | Minimum rating |
| \`minReviews\` | number | Minimum review count |
| \`popular\`, \`verified\`, \`securityReviewed\`, \`verifiedCreator\`, \`clearDataPolicy\`, \`noSensitiveData\` | boolean | Trust filters |
| \`creator\` | string | Creator username |
| \`sort\` | one of \`recommended\`, \`relevance\`, \`popular\`, \`price_asc\`, \`price_desc\`, \`rating\`, \`reviews\`, \`newest\` | Sort order |
| \`page\` | 1–10000 (default 1) | Page number |
| \`pageSize\` | 1–100 (default 24) | Page size |

### Example

\`\`\`bash
curl "${BASE}/agents?q=invoice&free=false&sort=rating&pageSize=2"
\`\`\`

\`\`\`json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "7d1c9e0a-0000-4000-8000-000000000001",
        "slug": "example-invoice-assistant",
        "name": "Example Invoice Assistant",
        "shortDescription": "Example listing used in the documentation.",
        "logoUrl": null,
        "tags": ["finance", "automation"],
        "isFree": false,
        "price": "1500000",
        "currency": "IRR",
        "version": "1.2.0",
        "riskLevel": "low",
        "rating": { "average": 4.6, "count": 12 },
        "verified": true,
        "category": { "id": "0f0e0d0c-0000-4000-8000-000000000002", "slug": "productivity", "name": "Productivity", "nameFa": "بهره‌وری" },
        "creator": { "id": "a1b2c3d4-0000-4000-8000-000000000003", "slug": "example-creator", "displayName": "Example Creator", "avatarUrl": null, "verified": true },
        "productType": "workflow",
        "deliveryModel": "self_hosted",
        "executionModel": "buyer_infrastructure",
        "setupDifficulty": "medium",
        "useCases": ["invoice extraction"],
        "integrationNames": ["REST API"],
        "popular": false,
        "publishedAt": "2026-01-15T08:30:00.000Z"
      }
    ],
    "meta": { "page": 1, "pageSize": 2, "total": 1, "totalPages": 1 },
    "search": { "query": "invoice", "normalized": "invoice", "relaxed": false, "concepts": [], "sort": "rating" }
  }
}
\`\`\`

> [!note] The values above are **synthetic** and only illustrate the shape. Product-contract fields can be \`null\` on legacy listings; render "unknown" in that case and never invent a value.

## Product detail — \`GET /agents/:slug\`

All card fields plus \`fullDescription\`, \`capabilities\`, \`limitations\`, \`useCases\`, \`targetAudience\`, \`inputs\`, \`outputs\`, \`howItWorks\`, \`exampleInput\`, \`exampleOutput\`, \`usageGuide\`, \`demoUrl\`, the product contract (permissions with reasons, requirements, data policy), the rating summary and recent reviews. Unpublished products return \`404\` with code \`AGENT_NOT_FOUND\`.

\`\`\`bash
curl "${BASE}/agents/example-invoice-assistant"
\`\`\`

## Reviews — \`GET /agents/:slug/reviews\`

\`page\` and \`pageSize\` as in the list; only reviews from verified buyers are returned.

## Reference data

\`GET /categories\`, \`GET /industries\`, \`GET /reference/permissions\`, \`GET /reference/integrations\` return small lists suitable for building filters and cacheable for 60 seconds.
`,
    },
  },
  {
    slug: 'errors-and-rate-limits',
    section: 'developers',
    owner: 'engineering',
    updatedAt: UPDATED,
    title: { fa: 'خطاها و محدودیت نرخ', en: 'Errors and rate limits' },
    summary: {
      fa: 'کدهای خطای پایدار، سرآیند Retry-After و سقف‌های درخواست.',
      en: 'Stable error codes, the Retry-After header and request caps.',
    },
    body: {
      fa: `
## پاکت خطا

\`\`\`json
{
  "success": false,
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Too many requests",
    "details": { "retryAfterSeconds": 42 }
  }
}
\`\`\`

\`code\` پایدار و قابل اتکاست؛ \`message\` برای انسان است و ممکن است تغییر کند. \`details\` اختیاری است.

## کدهای رایج در نقاط پایانی عمومی

| HTTP | کد | چه زمانی |
|---|---|---|
| 400 | \`VALIDATION_ERROR\` | پارامتر نامعتبر (مثلاً \`pageSize=500\` یا \`sort\` ناشناخته) |
| 404 | \`NOT_FOUND\` / \`AGENT_NOT_FOUND\` | مسیر یا محصول وجود ندارد یا منتشر نشده |
| 429 | \`TOO_MANY_REQUESTS\` | عبور از سقف نرخ؛ به \`Retry-After\` توجه کنید |
| 503 | \`SERVICE_UNAVAILABLE\` | سرویس موقتاً آمادهٔ پاسخ‌گویی نیست (مثلاً در حال استقرار) |
| 500 | \`INTERNAL_ERROR\` | خطای غیرمنتظره؛ \`X-Request-ID\` را گزارش کنید |

کدهای مربوط به نقاط پایانی احراز هویت‌شده (\`UNAUTHORIZED\`, \`FORBIDDEN\`, \`ALREADY_PURCHASED\`, …) خارج از دامنهٔ API عمومی‌اند.

## محدودیت نرخ

| محدوده | سقف فعلی |
|---|---|
| همهٔ نقاط پایانی (به ازای هر IP) | ${F.apiRateLimitPerMinute} درخواست در دقیقه |
| \`GET /agents/suggest\` | ۹۰ در دقیقه |
| \`GET /agents/facets\`, \`GET /agents/discovery/no-results\` و رویدادهای تحلیلی | ۶۰ در دقیقه |
| ورود | ${F.loginRateLimitPerMinute} در دقیقه |
| ثبت‌نام | ${F.registerRateLimitPerMinute} در دقیقه |
| فرم تماس | ${F.contactRateLimit.perIpPer10Min} در ۱۰ دقیقه به ازای هر IP، ${F.contactRateLimit.perEmailPerDay} در روز به ازای هر ایمیل |

هنگام دریافت \`429\`، سرآیند \`Retry-After\` (ثانیه) تعیین می‌کند چه زمانی تلاش دوباره مجاز است. این سقف‌ها پیکربندی اپراتور هستند و ممکن است در محیط‌های مختلف متفاوت باشند.

## توصیه‌ها

- پاسخ‌های کاتالوگ را سمت خودتان کش کنید؛ داده‌های مرجع ۶۰ ثانیه و فهرست‌ها تا تغییر بعدی معتبرند.
- به‌جای صفحه‌بندی عمیق، از فیلترها و \`sort=newest\` برای همگام‌سازی تدریجی استفاده کنید.
- برای تلاش مجدد، تأخیر نمایی با حداکثر چند تلاش محدود به کار ببرید.

\`\`\`js
// مثال: احترام به Retry-After
const res = await fetch("${BASE}/agents?page=1");
if (res.status === 429) {
  const wait = Number(res.headers.get("Retry-After") ?? "5") * 1000;
  await new Promise((r) => setTimeout(r, wait));
}
\`\`\`
`,
      en: `
## Error envelope

\`\`\`json
{
  "success": false,
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Too many requests",
    "details": { "retryAfterSeconds": 42 }
  }
}
\`\`\`

\`code\` is stable and safe to branch on; \`message\` is for humans and may change. \`details\` is optional.

## Common codes on public endpoints

| HTTP | Code | When |
|---|---|---|
| 400 | \`VALIDATION_ERROR\` | Invalid parameter (for example \`pageSize=500\` or an unknown \`sort\`) |
| 404 | \`NOT_FOUND\` / \`AGENT_NOT_FOUND\` | Route or product does not exist or is not published |
| 429 | \`TOO_MANY_REQUESTS\` | Rate limit exceeded; honour \`Retry-After\` |
| 503 | \`SERVICE_UNAVAILABLE\` | Service temporarily not ready (for example during a deployment) |
| 500 | \`INTERNAL_ERROR\` | Unexpected failure; report the \`X-Request-ID\` |

Codes belonging to authenticated endpoints (\`UNAUTHORIZED\`, \`FORBIDDEN\`, \`ALREADY_PURCHASED\`, …) are outside the public API scope.

## Rate limits

| Scope | Current cap |
|---|---|
| All endpoints (per IP) | ${F.apiRateLimitPerMinute} requests per minute |
| \`GET /agents/suggest\` | 90 per minute |
| \`GET /agents/facets\`, \`GET /agents/discovery/no-results\` and analytics events | 60 per minute |
| Login | ${F.loginRateLimitPerMinute} per minute |
| Registration | ${F.registerRateLimitPerMinute} per minute |
| Contact form | ${F.contactRateLimit.perIpPer10Min} per 10 minutes per IP, ${F.contactRateLimit.perEmailPerDay} per day per e-mail |

On \`429\`, the \`Retry-After\` header (seconds) tells you when a retry is allowed. These caps are operator configuration and may differ between environments.

## Recommendations

- Cache catalogue responses on your side; reference data is valid for 60 seconds and lists until the next change.
- Prefer filters and \`sort=newest\` for incremental sync over deep pagination.
- Retry with exponential back-off and a small bounded number of attempts.

\`\`\`js
// Example: honouring Retry-After
const res = await fetch("${BASE}/agents?page=1");
if (res.status === 429) {
  const wait = Number(res.headers.get("Retry-After") ?? "5") * 1000;
  await new Promise((r) => setTimeout(r, wait));
}
\`\`\`
`,
    },
  },
];
