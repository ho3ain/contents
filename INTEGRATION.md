# راهنمای یکپارچه‌سازی

سه سناریو. هر کدام را جدا بخوانید.

| سناریو | چه زمانی | کار لازم |
| --- | --- | --- |
| **الف) بازگرداندن به مش** | می‌خواهید همین کد را به مش برگردانید | کپی مسیربه‌مسیر |
| **ب) اجرای مستقل** | می‌خواهید فیچر به‌تنهایی بالا بیاید | `standalone/*/bootstrap.sh` |
| **ج) کاشت در پروژهٔ دیگر** | می‌خواهید بلاگ/گراف دانش را به محصول دیگری اضافه کنید | §۳ و §۴ |

---

## ۱) سناریو الف — بازگرداندن به مش

`mirror/` مسیرهای اصلی را نگه داشته، پس بازگرداندن یک کپی ساده است:

```bash
cp -a mirror/backend/src/.  /path/to/agentHub_backend/src/
cp -a mirror/backend/test/. /path/to/agentHub_backend/test/
cp -a mirror/frontend/src/. /path/to/agentHub_frontend/src/
```

> چون این بسته از همان دو مخزن و بدون هیچ تغییری ساخته شده، این کپی در وضعیت فعلی
> **هیچ تفاوتی ایجاد نمی‌کند** (`git status` خالی می‌ماند). اگر بعداً چیزی در این
> کپی ویرایش کردید، پیش از بازگرداندن حتماً `git diff` بگیرید.
>
> دقت کنید لایهٔ `reference` هم در `mirror/` هست (`app.module.ts`، `router.tsx`،
> `package.json`…). آن‌ها را برنگردانید مگر عمداً تغییرشان داده باشید.

---

## ۲) سناریو ب — اجرای مستقل

```bash
cd standalone/backend && ./bootstrap.sh && cd workdir
npm install
cp .env.example .env        # مقادیر PostgreSQL
npm run migration:run       # ۶ مایگریشن، ۱۹ جدول
npm run start:dev           # http://localhost:3000/api/v1

cd ../../frontend && ./bootstrap.sh && cd workdir
npm install
npm run dev                 # http://localhost:5173 (پراکسی /api → :3000)
```

`bootstrap.sh` فقط از `mirror/` می‌خواند و `workdir/` را از نو می‌سازد؛ `mirror/`
هرگز نوشته نمی‌شود. `workdir/` یک‌بارمصرف است — هر وقت خواستید پاکش کنید.

### آنچه داربست اضافه می‌کند

| فایل | نقش |
| --- | --- |
| `backend/overlay/src/content-app.module.ts` | ماژول ریشه: فقط `BlogModule` + `SeoModule` + TypeORM |
| `backend/overlay/src/main.ts` | بوت‌استرپ با پیشوند `/api/v1` و `ValidationPipe` |
| `backend/overlay/src/content-data-source.ts` | DataSource برای CLI مایگریشن و سیدها |
| `frontend/overlay/src/ContentApp.tsx` | درخت روت محتوا (۱۲ روت) |
| `frontend/overlay/src/main.tsx` | نقطهٔ ورود + ایمپورت استایل‌های محتوا |

این پنج فایل **کد مش نیستند** و در هر کدام صریحاً نوشته شده است.

### ⚠️ گاردهای حذف‌شده

`ContentAppModule` سه گارد سراسری مش را ثبت نمی‌کند:
`ThrottlerGuard` (محدودیت نرخ) · `RolesGuard` (احراز هویت و نقش) ·
`KillSwitchGuard` (قطع اضطراری).

نتیجه: در این حالت `/admin/blog/**` و `/admin/seo/**` **باز** هستند. پیش از قرار
دادن در دسترس کسی، لایهٔ احراز هویت خودتان را وصل کنید. نام مجوزهایی که کنترلرها
انتظار دارند در
`mirror/backend/src/modules/control-plane/authz/route-permissions.ts` است:

```
GET  /admin/blog.*                                               -> blog:view
ANY  /admin/blog/posts/:id/(publish|schedule|unpublish|
                            request-changes|cancel-schedule)     -> blog:publish
ANY  /admin/blog.*                                               -> blog:manage
GET  /admin/seo.*                                                -> blog:view
ANY  /admin/seo.*                                                -> blog:manage
```

---

## ۳) سناریو ج — کاشت در پروژه‌ای دیگر

### ۳-۱) پیش‌نیازهای بک‌اند

NestJS 11 · TypeORM 0.3 · PostgreSQL. فهرست دقیق وابستگی‌ها در
`standalone/backend/package.json` است که **از روی گراف واقعی import ساخته شده**،
نه دستی.

### ۳-۲) ترتیب کار

۱. انتیتی‌ها را بردارید: `src/database/entities/blog/` و `src/database/entities/seo/`
و آن‌ها را در آرایهٔ `ENTITIES` خودتان ثبت کنید.
۲. چهار مایگریشن محتوا را بردارید (`1772200000000` تا `1772700000000`). اگر
تاکسونومی مش را نمی‌خواهید، `1772000000000` و `1772100000000` را هم ببینید —
جدول‌های `industries` و `agent_industries` را می‌سازند.
۳. `BlogModule` و `SeoCoreModule` را ثبت کنید.
۴. `SeoModule` را **بعد از** قطع یال‌های §۴ ثبت کنید.
۵. سمت فرانت، `src/pages/blog/` و `src/pages/admin/blog/` را بردارید و
`blog.fa.ts` / `blog.en.ts` را در پراویدر i18n خود ثبت کنید.

### ۳-۳) چیزهایی که باید جایگزین کنید

| وابستگی | چرا لازم است | جایگزین ساده |
| --- | --- | --- |
| `StorageModule` | آپلود کاور و مدیای داخل مقاله | هر سرویس آپلودی با همان امضا |
| `AuditModule` | ثبت اقدام‌های تحریریه | می‌توان no-op کرد |
| `NotificationsModule` | اعلان کامنت و انتشار | می‌توان no-op کرد |
| `CategoriesModule` | تاکسونومی بازار برای آرشیو و لینک‌دهی | اگر بازار ندارید، حذف‌شدنی |
| `persian-normalize.ts` | فولدِ جست‌وجوی فارسی | **نگه دارید**؛ قلب جست‌وجوی فارسی است |

---

## ۴) یال‌های پل — مهم‌ترین بخش این سند

گراف import به‌طور خودکار پیمایش شد و دقیقاً مشخص است چه چیزی چه چیزی را می‌کشد.
سه یال بیشترین اثر را دارند:

| یال | فایل‌های `auto` عبوری | خط |
| --- | --- | --- |
| `SeoModule → AgentsModule` | **۱۷۵** | **۴۶٬۵۶۹** |
| `i18n/index.tsx → messages/{fa,en}` | ۲۰ | ۵٬۳۶۳ |
| `blog entities → user.entity` | ۰ (پوشش‌داده‌شده) | ۰ |

### ۴-۱) یال بحرانی: `SeoModule → AgentsModule`

در `mirror/backend/src/modules/seo/seo.module.ts`:

```ts
imports: [SeoCoreModule, BlogModule, CategoriesModule, AgentsModule],
```

`AgentsModule` به‌نوبهٔ خود `AuthModule` و `RuntimeModule` را می‌آورد، و آن‌ها
`FinanceModule`، `CommerceModule` و `CrmModule` را. **یعنی ۷۰٪ حجم این بسته از همین
یک خط می‌آید.**

چرا هست: گراف دانش و پیشنهاددهندهٔ لینک داخلی می‌توانند به صفحات محصول لینک بدهند.
کد مربوطه در `knowledge-graph.service.ts` و `link-suggestions.service.ts` است.

**اگر پروژهٔ شما محصول/ایجنت ندارد**، این یال را قطع کنید:

۱. `AgentsModule` را از `imports` در `seo.module.ts` بردارید.
۲. در `knowledge-graph.service.ts` و `link-suggestions.service.ts` هر جا نوع گرهٔ
   `agent` پردازش می‌شود را حذف یا به آرایهٔ خالی کوتاه کنید.
۳. انتیتی `blog_post_agents` را نگه دارید یا مایگریشن را ویرایش کنید — ولی
   **مایگریشن منتشرشده را دست نزنید** اگر دیتابیس قبلاً اجرا شده؛ یک مایگریشن
   افزایشی تازه بنویسید.

پس از این کار، گراف بک‌اند تقریباً به اندازهٔ لایه‌های `core` + `shared` می‌رسد:
حدود **۱۸۲ فایل / ۳۵٬۲۰۶ خط** به‌جای ۴۰۵ فایل.

> `MANIFEST.md` §۶ برای هر فایل لایهٔ `auto` زنجیرهٔ کاملِ «چه چیزی آن را کشید» را
> دارد. پیش از حذف هر چیزی، آنجا را نگاه کنید.

### ۴-۲) یال فرانت‌اند: `i18n/index.tsx`

پراویدر i18n همهٔ بسته‌های پیام را ثبت می‌کند، نه فقط `blog.fa` / `blog.en`. اگر
فقط محتوا را می‌خواهید، در `messages/fa.ts` و `messages/en.ts` بقیهٔ بسته‌ها را
حذف کنید؛ ۲۰ فایل و حدود ۵٬۳۶۳ خط کم می‌شود.

---

## ۵) پیکربندی

### بک‌اند (`standalone/backend/.env.example`)

| متغیر | نقش |
| --- | --- |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USERNAME` / `DB_PASSWORD` | اتصال PostgreSQL |
| `PORT` | پورت HTTP (پیش‌فرض ۳۰۰۰) |
| `SITE_URL` | مبنای URL کانونیکال، sitemap و JSON-LD. بدون اسلش پایانی. |
| `UPLOAD_DIR` | محل نوشتن مدیای تحریریه |

> `ContentAppModule` از `loadEnvironment` مش استفاده نمی‌کند، پس این مقادیر در زمان
> بوت اعتبارسنجی **نمی‌شوند**. مقدار اشتباه، بعداً و سرِ اولین استفاده خطا می‌دهد.
> اسکیمای کامل مش برای مقایسه در `mirror/backend/src/config/env.validation.ts` هست.

### فرانت‌اند

| متغیر | نقش |
| --- | --- |
| `VITE_API_PROXY_TARGET` | مقصد پراکسی `/api` در حالت dev (پیش‌فرض `http://127.0.0.1:3000`) |

---

## ۶) ترتیب مایگریشن‌ها

به همین ترتیب اجرا کنید (نام فایل = timestamp = ترتیب):

| مایگریشن | جدول |
| --- | --- |
| `1772000000000-taxonomy-persian-industries` | ۲ (`industries`, `agent_industries`) |
| `1772100000000-taxonomy-search-document` | ۰ (ستون و ایندکس جست‌وجو) |
| `1772200000000-blog-platform` | ۹ |
| `1772500000000-blog-search-fold` | ۰ (ستون فولد فارسی + ایندکس) |
| `1772600000000-blog-engagement` | ۵ |
| `1772700000000-seo-studio` | ۳ |

مجموع **۱۹ جدول**.

> هیچ‌کدام از این مایگریشن‌ها در محیط استخراج اجرا **نشدند** — PostgreSQL در دسترس
> نبود. پیش از اجرا روی داده‌های واقعی، روی یک دیتابیس خالی بیازمایید.

---

## ۷) سیدِ محتوای نمونه

`mirror/backend/src/database/seeds/seed-blog-demo.ts` (۳۳۰ خط) دسته‌بندی، برچسب و
چند نوشتهٔ نمونه می‌سازد تا بلاگ خالی بالا نیاید. در مش از `seed.ts` صدا زده می‌شود؛
در نسخهٔ مستقل باید خودتان صدایش بزنید.
