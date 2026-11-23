# استخراج فیچر تولید محتوای مش

کپی کامل و مستقل از هر چیزی که در مش مربوط به **تولید محتوا** است: بلاگ، گراف دانش،
استودیو سئو، ادیتور محتوا، محتوای ایستا (مستندات و اسناد حقوقی)، تست‌ها و مستندات —
هم در بک‌اند و هم در فرانت‌اند.

> **در خود مش هیچ چیز تغییر نکرده است.** هر دو مخزن `agentHub_backend` و
> `agentHub_frontend` دقیقاً روی همان کامیتی هستند که بودند و `git status` هر دو
> خالی است. این موضوع با `_tools/verify_mirror.py` به‌صورت ماشینی اثبات می‌شود:
> هر ۶۵۷ فایل هم در کپی و هم در **نسخهٔ اصلی** با sha256 بررسی می‌شود.

---

## ۱) در یک نگاه

| | |
| --- | --- |
| مجموع فایل | **۶۵۷** |
| مجموع خط | **۱۶۵٬۶۲۰** |
| حجم | **۶٫۵ مگابایت** |
| کامیت مبدأ بک‌اند | `1421c7b` |
| کامیت مبدأ فرانت‌اند | `3bcfe83` |
| تست‌های اجراشده روی همین کپی | **۴۱۱ تست سبز** (۱۲۳ بک‌اند + ۲۸۸ فرانت‌اند) |
| تایپ‌چک روی همین کپی | بک‌اند `exit 0` · فرانت‌اند `exit 0` |

جزئیات کامل فرمان‌ها و خروجی واقعی: **[VERIFICATION.md](VERIFICATION.md)**

---

## ۲) ساختار پوشه

```
mesh-content-platform/
├── README.md             ← همین فایل
├── MANIFEST.md           ← فهرست تک‌تک ۶۵۷ فایل با خط، بایت و sha256
├── INTEGRATION.md        ← چطور این فیچر را در یک پروژهٔ دیگر بکارید
├── VERIFICATION.md       ← فرمان‌ها و خروجی واقعی تست‌ها و تایپ‌چک
├── manifest.json         ← همان فهرست، ماشین‌خوان
│
├── mirror/               ← کپی بایت‌به‌بایت، با همان مسیرهای اصلی مش
│   ├── backend/
│   └── frontend/
│
├── standalone/           ← لایهٔ داربست برای اجرای مستقل (کد مش را دست نمی‌زند)
│   ├── backend/          ← package.json، tsconfig، ماژول ریشه، bootstrap.sh
│   └── frontend/         ← package.json، vite، روت‌ها، bootstrap.sh
│
└── _tools/               ← اسکریپت‌های بازتولید و راستی‌آزمایی
    ├── extract.py            استخراج + بستار importها + تأیید sha256
    ├── verify_mirror.py      اثبات اینکه کپی = اصل و اصل دست‌نخورده است
    ├── verify_closure.py     اثبات اینکه هیچ importی معلق نمانده
    ├── make_manifest_md.py   تولید MANIFEST.md
    └── make_standalone_pkg.py تولید package.jsonهای مستقل
```

`mirror/` مرجع است و **هرگز ویرایش نمی‌شود**. `standalone/bootstrap.sh` از روی آن یک
`workdir/` یک‌بارمصرف می‌سازد و داربست را رویش می‌چیند.

---

## ۳) چه چیزی استخراج شد

فایل‌ها در چهار لایه دسته‌بندی شده‌اند تا بدانید کدام بخش واقعاً «فیچر» است:

| لایه | فایل | خط | یعنی چه |
| --- | --- | --- | --- |
| `core` | ۱۵۲ | ۴۵٬۷۳۴ | **خودِ فیچر تولید محتوا.** اگر فقط یک چیز برمی‌دارید، همین است. |
| `shared` | ۲۱۸ | ۳۷٬۱۰۰ | وابستگی واقعی و دستی‌اعلام‌شده (استوریج، اودیت، نوتیفیکیشن، تم، کامپوننت‌های UI…) |
| `auto` | ۲۷۵ | ۶۷٬۳۰۰ | با پیمایش خودکار گراف import کشیده شد. زنجیرهٔ علت هر کدام در `MANIFEST.md` هست. |
| `reference` | ۱۲ | ۱۵٬۴۸۶ | جزو فیچر نیست؛ فقط برای دیدن نقاط اتصال (`app.module.ts`، `router.tsx`…) |

### هستهٔ بک‌اند (۶۱ فایل / ۱۷٬۹۵۰ خط)

| بخش | فایل | خط |
| --- | --- | --- |
| ماژول بلاگ | ۱۹ | ۶٬۶۳۸ |
| استودیو سئو و گراف دانش | ۲۰ | ۵٬۷۷۴ |
| تست‌های e2e محتوا | ۶ | ۳٬۴۸۳ |
| انتیتی‌های بلاگ | ۶ | ۷۸۱ |
| مایگریشن‌های محتوا | ۴ | ۶۰۸ |
| انتیتی‌های سئو | ۴ | ۳۰۵ |
| سیدِ محتوای نمونه | ۱ | ۳۳۰ |

### هستهٔ فرانت‌اند (۹۱ فایل / ۲۷٬۷۸۴ خط)

| بخش | فایل | خط |
| --- | --- | --- |
| CMS تحریریه، ادیتور و گراف دانش | ۲۲ | ۹٬۴۰۶ |
| استایل‌های محتوا | ۳ | ۴٬۱۳۸ |
| صفحات عمومی بلاگ | ۱۵ | ۳٬۸۵۶ |
| محتوای ایستا (مستندات، اسناد حقوقی) | ۱۹ | ۳٬۱۸۶ |
| i18n فارسی/انگلیسی محتوا | ۳ | ۱٬۸۱۰ |
| سایر سطوح نویسندگی (چنج‌لاگ، صفحات داکس) | ۶ | ۱٬۳۷۷ |
| مستندات فیچر | ۹ | ۱٬۰۶۸ |
| کلاینت‌های API | ۲ | ۹۵۹ |
| کتابخانه‌های محتوا (سئو، search-fold، page-meta) | ۷ | ۹۰۰ |
| تست‌های Playwright | ۳ | ۵۳۴ |
| ابزار (sitemap/robots، QA بلاگ) | ۲ | ۵۵۰ |

---

## ۴) سطح واقعی فیچر

### API بک‌اند — ۸۱ روت

| کنترلر | پیشوند | تعداد |
| --- | --- | --- |
| `blog-admin.controller.ts` | `/admin/blog` | ۳۲ |
| `seo-admin.controller.ts` | `/admin/seo` | ۱۶ |
| `blog-engagement.controller.ts` | `/blog` | ۱۱ |
| `blog-public.controller.ts` | `/blog` | ۱۰ |
| `blog-comments-admin.controller.ts` | `/admin/blog` | ۸ |
| `seo.controller.ts` | `/seo` | ۴ |
| **مجموع** | | **۸۱** |

همه زیر پیشوند سراسری `/api/v1` قرار می‌گیرند.

### جدول‌های دیتابیس — ۱۹ جدول در ۶ مایگریشن

`blog_posts` · `blog_categories` · `blog_tags` · `blog_post_tags` ·
`blog_post_relations` · `blog_post_agents` · `blog_post_market_categories` ·
`blog_post_revisions` · `blog_slug_redirects` · `blog_comments` ·
`blog_comment_likes` · `blog_comment_reports` · `blog_comment_bans` ·
`blog_post_ratings` · `content_seo` · `content_links` · `link_suggestions` ·
`industries` · `agent_industries`

### صفحات فرانت‌اند — ۱۲ روت

عمومی: `/blog` · `/blog/:slug` · `/blog/category/:slug` · `/blog/tag/:slug` ·
`/blog/author/:slug`
تحریریه: `/admin/blog` · `/admin/blog/posts/new` · `/admin/blog/posts/:id` ·
`/admin/blog/posts/:id/preview` · `/admin/blog/taxonomy` · `/admin/blog/comments` ·
`/admin/blog/graph`

### مجوزها

`blog:view` < `blog:manage` < `blog:publish` — در
`mirror/backend/src/modules/control-plane/authz/route-permissions.ts` اعلام شده‌اند.
روت‌های استودیو سئو و گراف دانش از همین سه مجوز استفاده می‌کنند.

---

## ۵) شروع سریع

```bash
# بک‌اند
cd standalone/backend && ./bootstrap.sh
cd workdir && npm install
cp .env.example .env     # مقادیر PostgreSQL خودتان
npm run migration:run
npm run start:dev        # http://localhost:3000/api/v1

# فرانت‌اند (ترمینال دوم)
cd standalone/frontend && ./bootstrap.sh
cd workdir && npm install
npm run dev              # http://localhost:5173
```

فقط می‌خواهید مطمئن شوید همه چیز سالم است، بدون دیتابیس:

```bash
cd standalone/backend  && ./bootstrap.sh && cd workdir && npm install && npm run typecheck && npm test
cd standalone/frontend && ./bootstrap.sh && cd workdir && npm install && npm run typecheck && npm test
```

---

## ۶) چیزهایی که باید بدانید

### ۶-۱) یک یال، نیمی از بک‌اند را با خودش می‌آورد

`SeoModule` ماژول `AgentsModule` را import می‌کند (برای لینک‌دهی داخلی به محصولات).
همین یک یال، به‌صورت ترابرد `runtime`، `finance`، `commerce`، `crm` و `auth` را
می‌کشد: **۱۷۵ فایل / ۴۶٬۵۶۹ خط** از لایهٔ `auto`.

اگر این فیچر را در پروژه‌ای تازه می‌کارید و محصولات مش را ندارید، همین‌جا را قطع کنید.
نقطهٔ دقیق و راه‌حل در `INTEGRATION.md` §۴ آمده است. سه یال پل‌مانند در
`MANIFEST.md` §۴ فهرست شده‌اند.

### ۶-۲) در نسخهٔ مستقل، هیچ مجوزی اعمال نمی‌شود

ماژول ریشهٔ داربست (`standalone/backend/overlay/src/content-app.module.ts`) سه گاردِ
سراسری مش — `ThrottlerGuard`، `RolesGuard`، `KillSwitchGuard` — را ثبت **نمی‌کند**،
چون متعلق به زیرسیستم auth/control-plane هستند نه به فیچر محتوا.

> نتیجهٔ مستقیم: با این ماژول به‌تنهایی، `/admin/blog/**` و `/admin/seo/**` محافظت‌شده
> نیستند. پیش از در دسترس قرار دادن، احراز هویت و مجوزدهی خودتان را وصل کنید.
> همین هشدار در خود فایل هم نوشته شده است.

### ۶-۳) چه چیزی تست شده و چه چیزی نشده

**تست‌شده** (فرمان و خروجی در `VERIFICATION.md`): تایپ‌چک هر دو سمت، ۱۲۳ تست واحد
بک‌اند، ۲۸۸ تست فرانت‌اند — همه روی همین کپی، نه روی مخزن اصلی.

**تست‌نشده:** در محیط استخراج هیچ نمونهٔ PostgreSQL در دسترس نبود. بنابراین
مایگریشن‌ها هرگز اجرا نشدند، ماژول هرگز بوت نشد، و هیچ‌کدام از ۶ سوییت e2e بک‌اند و
۳ سوییت Playwright اجرا نشدند. آن فایل‌ها کپی شده‌اند اما نتیجه‌ای از آن‌ها گزارش
نمی‌شود.

### ۶-۴) `docs/` چه چیزی را پوشش می‌دهد

۹ سند فارسی/انگلیسی دربارهٔ همین فیچر از مخزن فرانت‌اند کپی شده: تصمیم‌های بلاگ،
گزارش انتشار، گزارش پیاده‌سازی تحریریه و پنج سند استودیو سئو (اودیت فاز صفر،
معماری، مدل داده، مایگریشن/رول‌بک، تست‌ها و محدودیت‌ها). به‌علاوهٔ
`EDITORIAL_API_NOTES.md` از بک‌اند.

---

## ۷) بازتولید

کل بسته از روی مخازن اصلی بازساختنی است:

```bash
cd _tools
python3 extract.py            # کپی + بستار import + تأیید sha256
python3 verify_closure.py     # هیچ import نسبیِ معلقی نباشد
python3 verify_mirror.py      # کپی = اصل، و اصل دست‌نخورده
python3 make_manifest_md.py   # MANIFEST.md
python3 make_standalone_pkg.py # package.jsonهای مستقل
```

`extract.py` پیش از هر کپی، وجود تک‌تک مسیرهای اعلام‌شده را بررسی می‌کند و اگر یکی
نباشد بدون نوشتن هیچ فایلی متوقف می‌شود؛ پس یک بستهٔ نیمه‌کاره هرگز تولید نمی‌شود.
