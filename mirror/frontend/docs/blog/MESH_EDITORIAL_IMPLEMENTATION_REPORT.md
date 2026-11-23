# گزارش پیاده‌سازی MESH Blog Experience

**وضعیت کلی: PASS WITH NOTES**
تاریخ: ۲۰۲۶/۱۰/۱۵ — تغییرات در دو مخزن محلی اعمال شده‌اند؛ commit، push یا استقرار production انجام نشده است.

## خلاصهٔ شواهد

| بررسی اجراشده | نتیجه |
|---|---|
| تست‌های مرتبط فرانت‌اند، ادمین، ترجمه، ShareMenu و WebsiteLayout | **PASS — ۱۴۷ تست، ۱۵ فایل** |
| تست‌های دامنهٔ بلاگ بک‌اند | **PASS — ۳۲ تست، ۳ مجموعه** |
| تست‌های یکپارچهٔ واقعی API، مجوزها، بلاگ و دیدگاه با PostgreSQL | **PASS — ۳۳ تست، ۲ مجموعه** |
| Playwright در Chromium روی production build | **PASS — ۱۴ سناریو** |
| اجرای مستقل مجموعهٔ جدید مرورگر روی دیتابیس تازهٔ seedشده | **PASS — ۵ سناریو؛ شامل پاک‌سازی fixtureهای خود مجموعه** |
| TypeScript و production build فرانت‌اند | **PASS؛ اجرای مجدد روی Node 22.18.0 نیز موفق** |
| Typecheck و build بک‌اند | **PASS** |
| lint سراسری فرانت‌اند | **PASS** |
| lint فایل‌های تغییرکردهٔ بک‌اند | **PASS** |
| lint سراسری بک‌اند | **FAIL — خطاها و هشدارهای فایل‌های دست‌نخورده، توضیح در پایین** |
| `git diff --check` هر دو مخزن | **PASS** |

تعداد سناریوهای مرورگر و unit/integration با هم جمع نشده‌اند؛ اجرای مجدد یک تست نیز تست جدید محسوب نشده است.

## ۱. ممیزی و خط مبنا — PASS WITH NOTES

معماری واقعی تأیید شد: React/TypeScript/Vite، React Router، NestJS/TypeORM/PostgreSQL و APIهای `/api/v1`. مسیرهای عمومی `/blog`، `/blog/:slug` و آرشیو دسته/برچسب/نویسنده حفظ شدند.

منبع محتوای مقاله Markdown است که سرور آن را به درخت بلوکیِ تایپ‌شده تبدیل می‌کند. رندر با React و بدون `dangerouslySetInnerHTML` انجام می‌شود. مدل‌های دسته، نویسنده، برچسب، منابع، ارتباط مقاله‌ها، SEO Studio، RSS، sitemap، امتیازها و دیدگاه‌ها از قبل موجود بودند. هیچ CMS، router، auth، taxonomy یا سیستم دیدگاه موازی ساخته نشد.

وضعیت‌های draft، in_review، scheduled، published، unpublished و archived و قواعد انتشار موجود حفظ شدند. پیش‌نمایش از قبل رندر مشترک داشت، ولی هدر/فوتر عمومی را نیز نمایش می‌داد؛ این بخش اصلاح شد.

خط مبنای قبل از تغییر: build فرانت‌اند موفق؛ ۱۰۴ تست مرتبط موفق و یک شکست در assertion فوری robots صفحهٔ 404؛ ۳۲ تست دامنهٔ بک‌اند و typecheck موفق. assertion یادشده اکنون برای effect غیرهم‌زمان metadata منتظر می‌ماند. اسکرین‌شات قبل از اولین تغییر تهیه نشد: **NOT VERIFIED برای baseline بصری قبل از تغییر**. اسکرین‌شات‌های تحویل پس از پیاده‌سازی واقعاً گرفته و نمونه‌های دسکتاپ و موبایل واقعاً مشاهده شدند.

## ۲. صفحهٔ فهرست — PASS WITH NOTES

- معرفی کوتاه‌تر و سلسله‌مراتب آرام‌تر؛ حذف بلوک تبلیغاتی بزرگ انتهای فهرست.
- مقالهٔ برجسته از آخرین مقالهٔ واقعاً published انتخاب می‌شود، نه صرفاً مقالهٔ دارای پرچم featured. تاریخ برابر با ID مرتب‌سازی ثانویهٔ قطعی دارد.
- مقالهٔ برجسته، فیلترها و نتایج اکنون در یک جریان پیوسته قرار دارند؛ فهرست پیش‌فرض نیز واقعاً صفحه‌بندی‌شده است.
- صفحهٔ کامل دقیقاً **۹ نتیجه** دارد؛ سه ستون دسکتاپ، دو ستون تبلت و یک ستون موبایل. تعداد نتیجه با تغییر اندازهٔ نمایشگر تغییر نمی‌کند.
- skeleton، خطا با retry، حالت خالی، تعداد نتایج، لینک مقاله و صفحه‌بندی واقعی حفظ/تکمیل شده‌اند.
- شمارندهٔ نتیجهٔ قبلی هنگام بارگیری فیلتر جدید پنهان می‌شود؛ نتایج قدیمی زیر عنوان فیلتر جدید نمایش داده نمی‌شوند.
- کارت‌های مرتبط نیز از همان `BlogCardGrid` استفاده می‌کنند.

### مرتب‌سازی، دسته‌ها و URL

**PASS:** جدیدترین بر اساس `publishedAt DESC`؛ دسته‌ها با مدل و API موجود؛ جستجو، برچسب و بازهٔ مطالعه با همان قرارداد موجود. فیلترها و صفحه در query string نگهداری می‌شوند. تغییر فیلتر صفحه را به ۱ برمی‌گرداند؛ reload و back/forward در مرورگر تست شده‌اند. pagination سمت سرور است، نه دانلود کل کاتالوگ.

**PASS WITH NOTES:** محبوب‌ترین از امتیازهای واقعیِ کاربران استفاده می‌کند: مقاله‌های دارای رأی، میانگین امتیاز بیشتر، تعداد رأی بیشتر، تاریخ انتشار و سپس ID. تعریف آن در خود UI توضیح داده شده است. این معیار «تعداد بازدید» یا یک مدل آماری تعدیل‌شده نیست؛ مقاله‌ای با رأی کم هم می‌تواند رتبهٔ بالایی داشته باشد.

**PASS WITH NOTES:** معیار قابل‌اعتماد برای بازدید مقاله در مدل موجود پیدا نشد. «پربازدیدترین» فقط با توضیح ناموجود بودن داده نمایش داده می‌شود و کنترل رتبه‌بندی فعال/جعلی ندارد. افزودن tracking جدید و اعلام رتبهٔ ساختگی انجام نشده است. بخش دسته‌بندی‌ها به انتخاب‌گر واقعی دسته‌ها هدایت می‌کند؛ انتخاب دسته روی query واقعی اعمال می‌شود.

## ۳. صفحهٔ مقاله — PASS

ترتیب هدر: همهٔ مقالات، دسته و تاریخ انتشار، عنوان، خلاصه و ردیف زمان مطالعه در مقابل نویسنده. تاریخ و هویت از دادهٔ واقعی می‌آیند؛ نبود نویسنده موجب ساخت هویت تازه نمی‌شود. پیش‌نویسی که تاریخ انتشار ندارد، دیگر تاریخ ایجاد را به‌عنوان تاریخ انتشار در Preview نشان نمی‌دهد.

لینک بازگشت به بلاگ، context فهرست را از React Router state برای کارت‌ها و مقالهٔ برجسته حفظ می‌کند؛ فقط مسیرهای داخلی معتبر بلاگ پذیرفته می‌شوند و ورود مستقیم fallback `/blog` دارد.

ستون اصلی تا ۷۲۰ پیکسل عرض دارد، متن آزادانه رشد می‌کند و جدول/کد overflow محلی دارند. typography، لینک‌ها، تصاویر، نقل‌قول‌ها، تیترها و کارت‌های پایین صفحه با زبان طراحی موجود ترکیب شده‌اند.

## ۴. زمان مطالعه و TOC — PASS WITH NOTES

زمان مطالعه از همان محاسبهٔ قطعی سرور استفاده می‌کند: متن استخراج‌شده از بلوک‌ها، شمارش Unicode-aware کلمات و `ceil(words / 200)` با حداقل یک دقیقه. این تخمین موجود برای فارسی و انگلیسی یک سرعت اسمی ۲۰۰ کلمه در دقیقه دارد، نه اندازه‌گیری سرعت هر خواننده. در UI با «حدود / About» نمایش داده می‌شود.

anchorها و TOC از همان parse سرور می‌آیند؛ الگوریتم موجود تیترهای Unicode و تکراری را پوشش می‌دهد. ناوبری H2/H3، `aria-current` و scroll margin زیر هدر استفاده شده‌اند. IntersectionObserver موجود حفظ شده و observer پاک‌سازی می‌شود. بدنهٔ `BlogBlocks` memo شده تا تغییر active section باعث رندر مجدد درخت مقاله نشود. TOC تک‌تیتر نیز نمایش داده می‌شود و حالت بدون تیتر حذف می‌شود.

## ۵. ریل‌های Sticky و واکنش‌گرایی — PASS

چیدمان دسکتاپ به‌صورت صریح TOC در راست، متن در مرکز و اشتراک‌گذاری در چپ را در هر دو جهت UI نگه می‌دارد. جهت خود محتوای مقاله از metadata زبان مقاله می‌آید.

ریل‌ها **CSS sticky** هستند، نه fixed. عنصر sticky داخل aside کشیده‌شدهٔ grid قرار دارد. خود grid قبل از بخش مرتبط و دیدگاه پایان می‌یابد؛ در نتیجه ریل نمی‌تواند همراه footer شناور بماند. TOC بلند در ارتفاع در دسترس، اسکرول داخلی دارد. در عرض‌های باریک، sticky حذف و ابزارها به ردیف/بخش فشرده تبدیل می‌شوند.

در Chromium مختصات ریل‌ها با مرز grid در ابتدا، میانه، نزدیکی انتها، بعد از بدنه و footer مقایسه شد. مقالهٔ بلند با ۶۴ مدخل TOC، مقالهٔ کوتاه، فارسی و انگلیسی و عرض‌های ۳۶۰، ۳۹۰، ۷۶۸، ۱۰۲۴، ۱۲۸۰ و ۱۴۴۰ بررسی شدند. تصاویر lazy در تست هندسی decode می‌شوند تا ارتفاع مقاله هنگام ثبت مرز ثابت باشد. پس از آن، تست جداگانهٔ تعامل واقعی تصاویر نیز اجرا شده است.

## ۶. چهار اقدام اشتراک‌گذاری — PASS

۱. کپی لینک؛ ۲. LinkedIn؛ ۳. X؛ ۴. Telegram.

Telegram یکی از مقصدهای موجود MESH است و به‌جای وابستگی به native share نامطمئن انتخاب شد. URLهای شبکه‌ها با utility موجود `shareTargets` ساخته می‌شوند. canonical واقعی، encoding، نام دسترس‌پذیر و `noopener noreferrer` رعایت شده‌اند. موفقیت کپی فقط پس از resolve شدن clipboard اعلام می‌شود؛ شکست کپی پیام مستقل دارد. ShareMenu مشترک محصول دست‌نخورده مانده و مصرف‌کنندهٔ صفحهٔ Agent در مرورگر تست شده است.

## ۷. مقاله‌های مرتبط — PASS

سه نتیجه در صورت وجود: انتخاب‌های تحریریه، تکمیل با همان دسته و سپس مقالات اخیر. تنها published، بدون مقالهٔ فعلی و بدون نتیجهٔ تکراری. انتخاب‌های صریح به سه مورد محدود و self-reference نیز فیلتر می‌شود. شرط حذف مقالهٔ فعلی، تعداد سه و یکتایی در تست API بررسی شده است.

## ۸. دیدگاه‌ها — PASS

همان مدل‌ها و APIهای واقعی موجود استفاده شدند؛ بخش دیدگاه از grid بدنه بیرون و بعد از مقالات مرتبط قرار گرفت تا ریل‌ها هرگز روی آن ادامه پیدا نکنند.

سیاست موجود پروژه **ثبت توسط کاربر واردشده و انتشار فوری با moderation پس از انتشار** است، نه تأیید پیش از نمایش. هویت نویسنده از سرور تعیین می‌شود؛ قواعد مالکیت، validation، throttling، وضعیت‌های hidden/removed و پنل moderation موجود حفظ شده‌اند. قابلیت‌های قدیمی مانند پاسخ/گزارش/پسند حذف نشده و قابلیت اضافهٔ موازی ساخته نشده است.

جریان واقعی مرورگر شامل امتیازدادن، ثبت، پسند، ویرایش، حذف/بازگردانی توسط ادمین و پاک‌سازی توسط نویسنده موفق بود. تست API نیز draft privacy، مجوزها، اعتبارسنجی و رفتارهای دیدگاه را پوشش می‌دهد.

## ۹. Admin Preview — PASS

- همان لینک ادمین با `target="_blank"` و `rel="noopener"` حفظ شد؛ بازشدن از تعامل مستقیم کاربر است.
- مسیر همان `/admin/blog/posts/:id/preview` است؛ URL عمومی تغییر نکرد.
- `WebsiteLayout chrome={false}` فقط header/footer/support عمومی را حذف می‌کند و استایل واقعی مقاله و Suspense/ErrorBoundary را نگه می‌دارد.
- `AdminBlogPreviewPage` همچنان **همان `ArticleView`** را مصرف می‌کند، نه کپی صفحه.
- منبع داده آخرین نسخهٔ ذخیره‌شدهٔ `GET /admin/blog/posts/:id/preview` است؛ قرارداد unsaved preview جدید تحمیل نشده است. بنر و توضیح لینک این موضوع را شفاف می‌کنند.
- RequireRole و مجوز backend موجود `blog:view` حفظ شدند. ناشناس 401 و کاربر عادی 403 در تست یکپارچهٔ API بررسی شدند؛ سایر نقش‌های مجاز/غیرمجاز نیز در مجموعهٔ موجود آزموده شده‌اند.
- صفحه noindex است؛ هیچ token دائمی یا secret در URL اضافه نشد.
- مرورگر واقعاً عنوان را ویرایش و ذخیره کرد، Preview جدید را باز کرد، عنوان ذخیره‌شده را دید و باقی‌ماندن صفحه و مقدار فرم ادمین و `window.opener === null` را تأیید کرد.

## ۱۰. زوم تصاویر بدنه — PASS WITH NOTES

`ArticleImage` فقط در شاخهٔ image از renderer بلوکی استفاده می‌شود. کاور، آواتار و تصاویر UI به‌صورت اتفاقی interactive نشده‌اند. به‌دلیل اشتراک renderer، عمومی و Preview یک رفتار دارند.

دکمهٔ بومی تصویر با Enter/Space قابل‌فعال‌سازی است. تصویر بزرگ از Modal موجود، از طریق portal، استفاده می‌کند. کلیک روی تصویر بزرگ، دکمهٔ بستن، پس‌زمینه یا Escape آن را می‌بندد. Modal موجود focus trap و بازگرداندن focus را مدیریت می‌کند. بهبود کوچک مشترک: مقدار قبلی `body.style.overflow` اکنون دقیقاً بازیابی می‌شود، نه اینکه همیشه پاک شود.

نسبت تصویر حفظ می‌شود، تصویر بزرگ در viewport محدود است، انیمیشن کوتاه و reduced-motion رعایت می‌شود؛ URL تصویر عوض نمی‌شود. تصویر بدون alt متن بی‌معنای ساختگی نمی‌گیرد، ولی دکمه نام عملیاتی قابل‌فهم دارد. unmount، Escape، focus، scroll، کلیک مجدد، تصاویر مختلف و موبایل در تست‌ها بررسی شده‌اند.

**یادداشت:** مرورگر می‌تواند با cache policy سرور، دوباره URL تصویر را revalidate کند؛ «صفر درخواست شبکه در تمام مرورگرها» ادعا نمی‌شود. متادیتای ابعاد تصویر در مدل قدیمی موجود نیست؛ fallback نسبت قبل از بارگذاری گذاشته شده، اما حذف مطلق layout shift برای هر تصویر خارجی ادعا نمی‌شود.

## ۱۱. Design System و مصرف‌کنندگان غیر بلاگ — PASS WITH NOTES

از WebsiteLayout، Modal، AppIcon، SocialIcon، دکمه‌ها، skeleton، BlogPager، API client، Toast، auth و localization موجود استفاده شد. renderer یا taxonomy دوم ایجاد نشده است. CSS editorial فقط با گزینهٔ مشخص layout روی مسیرهای بلاگ/Preview تزریق می‌شود؛ docs/legal که از کلاس article-page استفاده می‌کنند، سه‌ستونه نمی‌شوند.

مصرف‌کنندگان واقعی تست‌شده: shared header/footer، صفحهٔ Agent listing، Agent detail و ShareMenu آن، ورود و ثبت‌نام؛ همچنین ۳۱ تست WebsiteLayout/WebsitePages. هیچ dashboard بازطراحی نشد.

**NOT VERIFIED:** تست مرورگری مستقل و جامع Creator profile و همهٔ صفحات غیر بلاگ انجام نشده است. همهٔ مصرف‌کنندگان Modal در کل محصول جداگانه پیمایش نشدند؛ رفتار تغییرکردهٔ overflow در تست ابزار تصویر پوشش داده شد.

## ۱۲. API و persistence — PASS

- `GET /blog/posts?sort=popular` به enum و ordering موجود افزوده شد.
- `GET /blog/home` آخرین published را به‌عنوان featured برمی‌گرداند.
- `PublicBlogPostDetail.publishedAt` برای Preview پیش‌نویس واقعاً `null` است؛ نوع کلاینت/سرور هماهنگ شد. مقالهٔ عمومی published همچنان تاریخ واقعی دارد.
- هیچ endpoint تازه، entity تازه، migration تازه یا تغییر destructive محتوا اضافه نشد.
- migrationهای موجود فقط روی PostgreSQL محلی تازه اجرا شدند، نه production.
- `contracts/api-routes.json` در این پروژه inventory متد/مسیر است؛ مسیر و متدی عوض نشده، بنابراین تغییر صوری در آن انجام نشد. توضیح query در مستندات همراه ثبت شده است.

## ۱۳. دسترس‌پذیری، زبان، تم و SEO — PASS WITH NOTES

رابط خواندن، ابزارها، دیدگاه‌ها، فیلترها و آرشیوها به فایل‌های ترجمهٔ موجود متصل شدند. تاریخ انگلیسی Gregorian و فارسی Jalali است؛ اعداد و زمان مطالعه با locale تغییر می‌کنند. محتوای نویسنده به‌طور مصنوعی ترجمه نشده است.

Axe در صفحات بلاگ، نتایج جستجو، فیلترها، مقاله و تم تیره اجرا شد؛ خطاهای serious/critical مربوط به این سطوح اصلاح شدند. keyboard، focus visible، لینک‌های TOC، کنترل‌های اشتراک‌گذاری، dialog و reduced motion بررسی شدند.

**PASS WITH NOTES برای صفحات auth:** یک یافتهٔ `target-size` در کنترل‌های دست‌نخوردهٔ ورود/ثبت‌نام ثبت شد. تست مرورگر فقط همان استثنای ثبت‌شده را برای مسیرهای auth می‌پذیرد و هر نوع خطای دیگر را fail می‌کند. جزئیات در `evidence/auth-login-a11y.json` و `auth-register-a11y.json` است؛ این صفحات AA کامل اعلام نمی‌شوند.

canonical، metadata، OG، JSON-LD، locale metadata و معماری SEO Studio موجود حفظ شدند. فهرست schema Blog دارد؛ مقاله BlogPosting و Preview noindex است. RSS و sitemap عمومی در تست API موجود بررسی شده‌اند.

**NOT VERIFIED:** indexing واقعی موتور جستجو، Lighthouse/Core Web Vitals و crawler output مستقرشده تأیید نشده‌اند. بیلد محلی بدون `SEO_API_BASE` هشدار می‌دهد که مقاله‌های داینامیک در sitemap ایستای build اضافه نشده‌اند؛ تنظیمات SEO محیط production باید مطابق معماری موجود تأمین شود. صفحه CSR به‌عنوان SSR معرفی نشده است.

## ۱۴. نتایج و محدودیت ابزارها

### فرمان‌های اجراشده

```sh
# frontend
npm run build
npm run lint
npm test -- src/pages/blog src/pages/admin/blog src/i18n/__tests__/blog-i18n.test.ts src/components/share src/pages/website/__tests__/WebsiteLayout.test.tsx src/pages/website/__tests__/WebsitePages.test.tsx --maxWorkers=1
npx playwright test e2e/26-blog-discovery.spec.ts e2e/27-blog-engagement.spec.ts e2e/28-blog-editorial.spec.ts --project=desktop
npx playwright test e2e/28-blog-editorial.spec.ts --project=desktop

# backend
npm run typecheck
npm run build
npm test -- --runInBand modules/blog
DB_USERNAME=agenthub DB_PASSWORD=agenthub DB_NAME=agenthub npm run test:e2e -- --runInBand --forceExit test/blog/blog.e2e-spec.ts test/blog/blog-engagement.e2e-spec.ts
NODE_OPTIONS=--max-old-space-size=1100 npm run lint:check
NODE_OPTIONS=--max-old-space-size=1100 npx eslint src/modules/blog/blog-public.service.ts src/modules/blog/blog-serializers.ts src/modules/blog/dto/blog-public.dto.ts test/blog/blog.e2e-spec.ts --max-warnings 0
```

پسورد مثال بالا صرفاً credential دیتابیس محلیِ توسعه است. اطلاعات GitHub در فایل‌ها یا remoteها ذخیره نشده‌اند.

**FAIL — lint سراسری بک‌اند:** ۶ خطای formatting در فایل‌های دست‌نخوردهٔ raw-sql-hygiene.spec.ts، migration قدیمی creator-public-portfolio، creator-view.spec.ts و referral.service.ts و ۳ هشدار unsafe-argument در seo-studio.e2e-spec.ts باقی‌اند. هشدار تازهٔ تست افزوده‌شده اصلاح شد؛ lint فایل‌های تغییرکرده صفر خطا/هشدار است. برای پنهان‌کردن این نتیجه فایل‌های نامرتبط تغییر نکردند.

اجرای هم‌زمان lint دو مخزن به محدودیت حافظه برخورد کرد؛ آن اجراها موفق محسوب نشده‌اند. اجرای جداگانهٔ بعدی lint فرانت‌اند موفق و نتیجهٔ واقعی lint بک‌اند همان شکست بالاست. Jest integration با `--forceExit` پایان داده شد؛ ۳۳ assertion/test موفق هستند، اما ادعای پاک‌شدن تمام open handleهای قدیمی زیرساخت تست نداریم.

**NOT VERIFIED:** کل unit suite هر دو محصول، کل E2E محصول، Firefox و WebKit اجرا نشده‌اند. آزمون مرورگر این تحویل Chromium است؛ اندازه‌های موبایل در همین مرورگر پوشش داده شده‌اند. هشدار chunkهای بزرگ‌تر از ۵۰۰KB در build از قبل وجود داشت و حذف نشده است. هیچ عدد performance تخمینی به‌عنوان اندازه‌گیری ارائه نشده است.

### فایل‌های شواهد در workspace

- `frontend-delivery-tests.log`: اجرای ۱۴۷ تست.
- `node22-validation.log`: build و همان ۱۴۷ تست روی Node 22.18.0 سازگار با engines مخزن نیز موفق شدند.
- `shared-layout-tests.log`: اجرای مستقل ۳۱ تست layout/pages.
- `frontend-final-lint.log`, `frontend-production.log`.
- `backend-after.log`, `backend-final-e2e.log`, `backend-final-types.log`, `backend-build.log`.
- `backend-final-lint.log`, `backend-target-lint.log`.
- `browser-final.log`: ۱۴ سناریوی موفق.
- `browser-clean-db.log`: ۵ سناریوی موفق روی DB تازه و teardown.
- `audit-baseline.md` و logهای baseline.
- `evidence/list-seeded-desktop.png`, `list-seeded-mobile.png`.
- `evidence/article-seeded-desktop.png`, `article-seeded-dark.png`, `article-seeded-mobile.png`.

اسکرین‌شات‌های `seeded` از چهار مقالهٔ demo موجود خود پروژه گرفته شده‌اند. اسکرین‌شات‌های fixture در تست‌های مرورگر ممکن است عبارت Test fixture داشته باشند؛ آن‌ها دادهٔ production نیستند.

## ۱۵. فهرست فایل‌های تغییرکرده

### Frontend

- `src/api/blog.ts`
- `src/app/router.tsx`
- `src/components/Modal.tsx`
- `src/i18n/blog.fa.ts`, `src/i18n/blog.en.ts`
- `src/pages/blog/BlogHomePage.tsx`, `BlogArchivePage.tsx`, `BlogArticlePage.tsx`
- `src/pages/blog/BlogBlocks.tsx`, `BlogEngagement.tsx`, `BlogFilters.tsx`
- `src/pages/blog/blogListState.ts`, `blogShared.tsx`
- **جدید:** `src/pages/blog/ArticleImage.tsx`, `ArticleShareRail.tsx`
- `src/pages/admin/blog/AdminBlogEditorPage.tsx`
- `src/pages/reference/referenceStyles.ts`
- `src/pages/website/WebsiteLayout.tsx`
- **جدید:** `src/styles/blog-editorial.css`
- `src/pages/blog/__tests__/BlogPages.test.tsx`, `blogListState.test.ts`
- **جدید:** `src/pages/blog/__tests__/EditorialTools.test.tsx`
- `e2e/26-blog-discovery.spec.ts`, `27-blog-engagement.spec.ts`
- **جدید:** `e2e/28-blog-editorial.spec.ts`

### Backend

- `src/modules/blog/blog-public.service.ts`
- `src/modules/blog/blog-serializers.ts`
- `src/modules/blog/dto/blog-public.dto.ts`
- `test/blog/blog.e2e-spec.ts`

مستندات همراه نیز در پوشهٔ `docs/blog` هر مخزن قرار دارند.

## تحویل و راه‌اندازی

پیش‌نمایش زندهٔ **MESH Blog** روی پورت ۴۱۷۳ فعال است؛ مسیر اصلی مشاهده `/blog` است. API روی پورت ۳۰۰۰ با دیتابیس توسعهٔ مجزای `mesh_blog_preview` اجرا می‌شود. این DB فقط چهار مقالهٔ seed اصلی دارد؛ تست‌های API در DB محلی `agenthub` جدا نگه داشته شده‌اند و اطلاعات آن حذف نشده‌اند.

برای اجرای مجدد پس از بازسازی محیط، وابستگی‌ها را با lockfile نصب کنید، PostgreSQL و متغیرهای `.env.example` را آماده کنید، migrationهای موجود را اجرا کنید، فقط در محیط توسعه seed بزنید، سپس backend و frontend را اجرا کنید. دیتابیس زنده و node_modules بخشی از فایل‌های منبع قابل‌حمل نیستند.

**تصمیم محصول باقی‌مانده:** اگر «پربازدیدترین» باید فعال شود، ابتدا تعریف و سیاست قابل‌اتکای شمارش readership، deduplication و ربات‌ها لازم است. این تحویل هیچ عدد یا رتبهٔ ساختگی جای آن قرار نداده است.
