# راستی‌آزمایی

هر عددی که در این بسته ادعا شده، از اجرای واقعی فرمان‌های زیر آمده است.
تاریخ اجرا: **۲۰۲۶-۱۱-۲۳**. محیط: Node **v20.20.2**، npm 10.8.2، بدون PostgreSQL.

> ⚠️ هر دو مخزن `engines.node` را `^22.18.0 || >=24.11.0` اعلام کرده‌اند، اما محیط
> استخراج Node 20.20.2 داشت. تایپ‌چک و تست‌های واحد با همین نسخه سبز شدند، ولی
> این یعنی بسته روی نسخهٔ موردنظر پروژه آزموده **نشده** است.

---

## ۱) مش دست‌نخورده است

```
$ cd agentHub_backend  && git status --porcelain && git rev-parse --short HEAD
1421c7b

$ cd agentHub_frontend && git status --porcelain && git rev-parse --short HEAD
3bcfe83
```

خروجی `git status` در هر دو مخزن **خالی** است — یعنی هیچ فایل ردیابی‌شده‌ای تغییر
نکرده، اضافه نشده و حذف نشده است.

به‌علاوه، تک‌تک ۶۵۷ فایل در **نسخهٔ اصلی** دوباره هش شده و با هشِ زمان استخراج مقایسه
شده است:

```
$ python3 _tools/verify_mirror.py
manifest entries        : 657
copies verified         : 657
originals re-verified   : 657
missing copies          : 0
copies that differ      : 0
ORIGINALS that differ   : 0

OK: every file in the mirror is byte-identical to MESH,
    and every MESH original is unchanged.
```

تنها چیزی که در مخازن مش ایجاد شد `node_modules/` بود (با `npm ci`، برای اینکه
بشود تایپ‌چک و تست گرفت). `node_modules` در `.gitignore` هر دو مخزن است و در
`git status` ظاهر نمی‌شود.

---

## ۲) بستار importها — چیزی جا نمانده

```
$ python3 _tools/verify_closure.py
scanned         : 615 code files
dangling imports: 206
```

۲۰۶ ارجاع حل‌نشده **همگی** از فایل‌هایی می‌آیند که عمداً پیمایش نمی‌شوند، چون کل
اپلیکیشن مش را import می‌کنند:

| فایل اعلام‌کننده | لایه | تعداد |
| --- | --- | --- |
| `frontend/src/app/router.tsx` | `reference` | ۱۳۰ |
| `backend/src/app.module.ts` | `reference` | ۳۰ |
| `frontend/src/main.tsx` | `reference` | ۲۰ |
| `backend/src/database/seeds/seed.ts` | `reference` | ۲ |
| `backend/test/**` و `frontend/e2e/**` | تست | ۲۳ |
| `frontend/src/components/Header.tsx` | `reference` | ۱ |
| **مجموع** | | **۲۰۶** |

**از کد خودِ فیچر، صفر ارجاع حل‌نشده وجود دارد.** این همان تعریف «کامل بودن
استخراج» است.

### سه گپ واقعی که همین بررسی پیدا کرد و رفع شد

۱. **فایل‌های اعلان همسایه.** `scripts/icons/export-mesh-icons.d.mts` کپی نشده بود،
چون هیچ `import`ی مستقیماً نامش را نمی‌برد — TypeScript آن را ضمنی برمی‌دارد.
`extract.py` حالا برای هر `.js/.mjs/.cjs` دنبال اعلان همسایه می‌گردد.

۲. **اعلان‌های محیطی.** `src/vite-env.d.ts` و `src/types/multiavatar.d.ts` هم همین
وضع را داشتند و حالا صریحاً اعلام شده‌اند.

۳. **دارایی‌های روی دیسک.** دو سوییت تست فایل‌های واقعی را از دیسک می‌خوانند و
بایت‌به‌بایت مقایسه می‌کنند: `public/sitemap.xml` و
`docs/icon-system/mesh-icon-specimen.svg`. هر دو اضافه شدند.

> هر سهٔ این‌ها اگر پیدا نمی‌شدند، بسته «ظاهراً کامل» تحویل می‌شد و بعداً سر
> کامپایل یا تست می‌شکست.

---

## ۳) بک‌اند — تایپ‌چک

```
$ cd standalone/backend && ./bootstrap.sh
$ cd workdir && npx tsc -p tsconfig.json --noEmit
exit=0
```

بدون خطا. دامنه: کل `src/**` به‌جز دو فایل لایهٔ `reference`
(`app.module.ts` و `database/seeds/seed.ts`) که کل مش را import می‌کنند.

یک سنجش دقیق‌تر هم گرفته شد — فقط گراف `BlogModule` + `SeoModule`:

```
$ npx tsc --noEmit   # files: [src/modules/blog/blog.module.ts, src/modules/seo/seo.module.ts]
exit=0
$ npx tsc --noEmit --listFiles | grep -v node_modules | wc -l
369
```

یعنی ۳۶۹ فایل محلی در گراف این دو ماژول هستند و همه بدون خطا کامپایل می‌شوند —
**بدون حتی یک خط تغییر در کد مش**.

---

## ۴) بک‌اند — تست واحد

```
$ cd standalone/backend/workdir && npx jest --silent

PASS src/modules/notifications/notifications.service.spec.ts
PASS src/modules/storage/storage.spec.ts
PASS src/modules/categories/categories.service.spec.ts
PASS src/modules/seo/domain/content-links.spec.ts
PASS src/modules/notifications/notification-templates.spec.ts
PASS src/modules/seo/analysis/seo-analysis.spec.ts
PASS src/modules/blog/domain/blog-markdown.spec.ts
PASS src/database/entities/agents/commercial-profile.spec.ts
PASS src/modules/blog/domain/blog-search.spec.ts
PASS src/modules/blog/domain/blog-status.spec.ts
PASS src/modules/seo/domain/blocks-html.spec.ts
PASS src/modules/seo/domain/markdown-link-edit.spec.ts

Test Suites: 12 passed, 12 total
Tests:       123 passed, 123 total
Time:        3.284 s
exit=0
```

---

## ۵) فرانت‌اند — تایپ‌چک

```
$ cd standalone/frontend && ./bootstrap.sh
$ cd workdir && npx tsc -p tsconfig.json --noEmit
exit=0
```

دامنه: کل `src/**` به‌جز سه فایل لایهٔ `reference` (`app/router.tsx`،
`lib/nav.ts`، `components/Header.tsx`).

> نکتهٔ مهم: مخزن فرانت‌اند مش **اسکریپت `typecheck` ندارد** (فقط `test` و
> `test:mutation`). پس این تایپ‌چک چیزی است که در خود مش هرگز اجرا نمی‌شود.
> پیکربندی استفاده‌شده، گزینه‌های `tsconfig.app.json` خود پروژه است، به‌اضافهٔ
> `node` و `vitest/globals` در `types`.

### یک هشدار دربارهٔ تایپ‌چکِ محدود

در میانهٔ کار، یک خطای ظاهری در `src/lib/avatar.ts` دیده شد. بررسی نشان داد **خطا
واقعی نبود**: فایل اعلان محیطی `src/types/multiavatar.d.ts` در آن مرحله هنوز کپی
نشده بود، و چون `include` محدود بود TypeScript آن را برنمی‌داشت و به‌جایش از تایپ‌های
خود پکیج استفاده می‌کرد. پس از افزودن آن فایل، خطا بدون هیچ تغییری در کد از بین
رفت. **هیچ خطای تایپ از پیش‌موجودی در مش وجود ندارد** و هیچ وصله‌ای لازم نشد.

---

## ۶) فرانت‌اند — تست واحد

```
$ cd standalone/frontend/workdir && npx vitest run

Test Files  26 passed (26)
     Tests  288 passed | 1 skipped (289)
  Duration  47.34s
exit=0
```

شامل سوییت‌های اصلی محتوا: `BlogPages` · `BlogEngagement` · `EditorialTools` ·
`blogListState` · `AdminBlogPages` · `AdminBlogCommentsPage` · `ContentEditor` ·
`SeoStudioPanel` · `markdownBridge` · `AdminKnowledgeGraphPage` · `graphLayout` ·
`blog-i18n` · `seo` · `searchFold` · `sitemap-coverage` · `docs-content` ·
`legal-version-parity` · `social-links`.

---

## ۷) جمع‌بندی

| سنجه | نتیجه |
| --- | --- |
| تایپ‌چک بک‌اند | ✅ `exit 0` |
| تست واحد بک‌اند | ✅ ۱۲ سوییت / **۱۲۳ تست** |
| تایپ‌چک فرانت‌اند | ✅ `exit 0` |
| تست واحد فرانت‌اند | ✅ ۲۶ فایل / **۲۸۸ تست** (۱ skipped) |
| یکپارچگی کپی | ✅ ۶۵۷/۶۵۷ sha256 |
| دست‌نخوردگی مش | ✅ ۶۵۷/۶۵۷ sha256 + `git status` خالی |
| **مجموع تست سبز** | **۴۱۱** |

---

## ۸) آنچه اجرا نشد — و دلیلش

| مورد | چرا |
| --- | --- |
| مایگریشن‌ها | هیچ نمونهٔ PostgreSQL در محیط نبود |
| بوت واقعی `ContentAppModule` | همان؛ به دیتابیس نیاز دارد |
| ۶ سوییت e2e بک‌اند (`test/blog`, `test/seo`) | همان؛ ضمناً `AppModule` کامل مش را می‌خواهند |
| ۳ سوییت Playwright (`e2e/26..28`) | به مرورگر و یک استقرار کامل بالا نیاز دارند |
| `npm install` در `workdir` | برای صرفه‌جویی، `node_modules` مخازن مش با symlink استفاده شد |
| اجرا روی Node 22.18.0 | محیط فقط Node 20.20.2 داشت |

این فایل‌ها کپی شده‌اند و در `MANIFEST.md` فهرست‌اند، اما **هیچ نتیجه‌ای از آن‌ها
گزارش نمی‌شود** چون اجرا نشده‌اند.
