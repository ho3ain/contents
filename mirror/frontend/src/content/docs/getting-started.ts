import { PLATFORM_FACTS as F } from '../platform-facts';
import type { DocArticle } from './types';

const UPDATED = '2026-10-13';

export const GETTING_STARTED: DocArticle[] = [
  {
    slug: 'what-is-mesh',
    section: 'getting-started',
    owner: 'product',
    updatedAt: '2026-10-18',
    title: { fa: 'MESH چیست؟', en: 'What is MESH?' },
    summary: {
      fa: 'بازار محصولات هوش مصنوعی و اتوماسیون؛ نقش MESH، سازندگان و خریداران در یک نگاه.',
      en: 'The marketplace for AI and automation products — the roles of MESH, creators and buyers at a glance.',
    },
    body: {
      fa: `
MESH یک **بازار آنلاین** است که سازندگان، محصولات هوش مصنوعی و اتوماسیون خود را در آن عرضه می‌کنند و خریداران آن‌ها را پیدا، مقایسه و تهیه می‌کنند.

## چه چیزهایی در MESH عرضه می‌شود

| نوع محصول | مثال |
|---|---|
| Agent / دستیار هوشمند | دستیار پاسخ‌گویی به مشتری |
| گردش‌کار (Workflow) و اتوماسیون | گردش‌کار n8n برای همگام‌سازی سفارش‌ها |
| قالب (Template) | قالب آمادهٔ پرامپت یا پایپ‌لاین |
| سرویس API | دسترسی به یک سرویس هوش مصنوعی سازنده |
| سرویس راه‌اندازی | نصب و پیکربندی توسط سازنده |

## نقش‌ها

- **خریدار**: محصولی را رایگان یا با پرداخت تهیه می‌کند و از طریق «کتابخانه» به اطلاعات دسترسی و تحویل آن می‌رسد.
- **سازنده**: پس از تأیید پروفایل، محصول می‌سازد، برای بازبینی می‌فرستد و منتشر می‌کند؛ ${F.creatorSharePercent} درصد هر فروش به او تعلق می‌گیرد.
- **MESH**: بستر فهرست‌کردن، بازبینی، پرداخت، بازگشت وجه، پشتیبانی پلتفرمی و تسویهٔ سازندگان. مسئولیت عملی هر پیشنهاد به مدل تحویل و اطلاعات همان محصول وابسته است.

> [!note] مدل فنی همهٔ پیشنهادها یکسان نیست: «اجرای مدیریت‌شده» فقط برای بار مرجع محدود MESH است؛ «اجرای متصل» به نقطهٔ پایانیِ تحت کنترل سازنده وصل می‌شود؛ و پیشنهاد مستقل یا بیرونی مسیر اجرای MESH ندارد. مشخصات محصول، اظهار سازنده است و بازبینی، تضمین عملکرد یا تأیید حقوقیِ تقسیم مسئولیت نیست.

## از کجا شروع کنم؟

- خرید: [راهنمای خرید](/docs/how-to-buy)
- سازندگی: [سازنده شدن](/docs/becoming-a-creator)
- امنیت حساب: [امنیت حساب کاربری](/docs/account-security)
- گزارش مشکل: [گزارش محصول یا محتوای مشکل‌دار](/docs/reporting-a-problem)
- قواعد: [شرایط استفاده](/legal/terms)، [حریم خصوصی](/legal/privacy)، [بازگشت وجه](/legal/refunds)
`,
      en: `
MESH is an **online marketplace** where creators offer their AI and automation products and buyers find, compare and acquire them.

## What is offered on MESH

| Product type | Example |
|---|---|
| Agent / AI assistant | A customer-support reply assistant |
| Workflow / automation | An n8n workflow that syncs orders |
| Template | A ready-made prompt or pipeline template |
| API service | Access to a creator's AI service |
| Setup service | Installation and configuration by the creator |

## Roles

- **Buyer**: acquires a product for free or by paying and reaches its access and delivery information through the Library.
- **Creator**: after profile approval builds products, submits them for review and publishes them; ${F.creatorSharePercent} % of each sale accrues to the creator.
- **MESH**: the platform for listing, review, payment, refunds, platform support and creator settlements. The operational responsibility for an offer depends on its delivery model and product-specific disclosure.

> [!note] Offers do not all have the same technical model: Managed Runtime is only for a limited MESH reference workload; Connected Runtime connects to a creator-controlled endpoint; and an independent or external offer has no MESH execution path. Product details are creator declarations; review is not a performance guarantee or legal allocation of responsibility.

## Where to start

- Buying: [How to buy](/docs/how-to-buy)
- Creating: [Becoming a creator](/docs/becoming-a-creator)
- Account safety: [Account security](/docs/account-security)
- Reporting: [Reporting a problem with a product](/docs/reporting-a-problem)
- Rules: [Terms of Service](/legal/terms), [Privacy Policy](/legal/privacy), [Refunds](/legal/refunds)
`,
    },
  },
  {
    slug: 'accounts-and-roles',
    section: 'getting-started',
    owner: 'product',
    updatedAt: '2026-10-18',
    title: { fa: 'حساب کاربری و نقش‌ها', en: 'Accounts and roles' },
    summary: {
      fa: 'ثبت‌نام با شمارهٔ تلفن، ایمیل اختیاری، تأیید ایمیل، نقش خریدار و سازنده.',
      en: 'Phone-based sign-up, optional e-mail, e-mail verification, buyer and creator roles.',
    },
    body: {
      fa: `
## ثبت‌نام

- **شمارهٔ تلفن همراه** شناسهٔ ورود شماست و الزامی است. در این مرحله کد پیامکی ارسال نمی‌شود.
- **ایمیل** اختیاری است؛ اگر وارد کنید، یک کد تأیید ${F.codeExpiryMinutes} دقیقه‌ای برایتان ارسال می‌شود و تا تأیید آن، بخش‌های داخل حساب (داشبورد، کتابخانه و خرید) در دسترس نیستند. بدون ایمیل، حساب از ابتدا تأییدشده است اما رسید، هشدار امنیتی و بازیابی رمز عبور را از دست می‌دهید.
- رمز عبور دست‌کم ${F.passwordMinLength} نویسه است.
- فرایند فعلی ثبت‌نام مرور [شرایط استفاده](/legal/terms) و [سیاست حریم خصوصی](/legal/privacy) را لازم می‌داند و یک شناسهٔ نسخه و زمان را در حساب ثبت می‌کند (در تنظیمات قابل مشاهده است). تا زمانی که وضعیت انتشار سند «لازم‌الاجرا» نباشد، این رکورد تأیید حقوقی یا پذیرش تفکیک‌شدهٔ هر سند را اثبات نمی‌کند.

## نقش‌ها

| نقش | چطور به دست می‌آید | چه می‌تواند بکند |
|---|---|---|
| خریدار | هر حساب تازه | جست‌وجو، خرید، کتابخانه، نظر، پشتیبانی |
| سازنده | «شروع کسب درآمد» → تکمیل پروفایل → تأیید MESH | همهٔ موارد خریدار + ساخت و انتشار محصول، مالی و تسویه |
| ادمین | فقط توسط تیم MESH | عملیات پلتفرم |

یک حساب می‌تواند هم‌زمان خریدار و سازنده باشد؛ بین «پنل خریدار» و «پنل سازنده» از منوی حساب جابه‌جا شوید.

## ورود و نشست‌ها

- ورود با شمارهٔ تلفن و رمز عبور؛ در صورت فعال‌بودن ورود دومرحله‌ای، کد TOTP هم لازم است.
- نشست شما با توکن کوتاه‌مدت (${F.accessTokenMinutes} دقیقه) و کوکی تازه‌سازی تا ${F.refreshSessionDays} روز حفظ می‌شود.
- تلاش‌های ناموفق مکرر، ورود را به‌صورت موقت قفل می‌کند؛ بیش از ${F.loginRateLimitPerMinute} تلاش در دقیقه از یک IP پذیرفته نمی‌شود.
- فهرست نشست‌های فعال و امکان بستن آن‌ها در **تنظیمات → امنیت** است.

## تغییر زبان و پوسته

زبان رابط (فارسی/انگلیسی) و پوسته (روشن/تاریک) از سربرگ تغییر می‌کند و در مرورگر شما ذخیره می‌شود. زبان ترجیحی شما برای ایمیل‌ها نیز استفاده می‌شود.
`,
      en: `
## Sign-up

- Your **mobile phone number** is the sign-in identifier and is required. No SMS code is sent at this stage.
- **E-mail** is optional; if you enter one, a verification code valid for ${F.codeExpiryMinutes} minutes is sent and the in-account areas (dashboard, Library and buying) stay locked until it is confirmed. Without an e-mail the account starts verified, but you lose receipts, security alerts and password recovery.
- Passwords are at least ${F.passwordMinLength} characters.
- The current registration flow requires review of the [Terms of Service](/legal/terms) and [Privacy Policy](/legal/privacy), and records one version identifier and time on your account (visible in Settings). Until a document has Effective status, that record does not prove legal approval or separate acceptance of each document.

## Roles

| Role | How you get it | What it can do |
|---|---|---|
| Buyer | Every new account | Search, buy, library, reviews, support |
| Creator | "Start earning" → complete profile → MESH approval | Everything a buyer can + build and publish products, finance and payouts |
| Admin | Only by the MESH team | Platform operations |

One account can be both buyer and creator; switch between the buyer and creator panels from the account menu.

## Sign-in and sessions

- Sign in with phone number and password; with two-step sign-in enabled a TOTP code is also required.
- Your session uses a short-lived token (${F.accessTokenMinutes} minutes) and a refresh cookie valid for up to ${F.refreshSessionDays} days.
- Repeated failed attempts lock sign-in temporarily; more than ${F.loginRateLimitPerMinute} attempts per minute from one IP are refused.
- Active sessions, and the option to end them, are under **Settings → Security**.

## Language and theme

Interface language (Persian/English) and theme (light/dark) change from the header and are stored in your browser. Your preferred language is also used for e-mails.
`,
    },
  },
  {
    slug: 'glossary',
    section: 'getting-started',
    owner: 'product',
    updatedAt: UPDATED,
    title: { fa: 'واژه‌نامه', en: 'Glossary' },
    summary: { fa: 'اصطلاحاتی که در MESH می‌بینید.', en: 'The terms you will meet across MESH.' },
    body: {
      fa: `
| اصطلاح | معنا |
|---|---|
| Agent | واحد عرضه در MESH؛ هر محصول (دستیار، گردش‌کار، قالب…) یک «Agent» است |
| کتابخانه | فهرست محصولاتی که به آن‌ها دسترسی دارید |
| دسترسی (Entitlement) | حق استفاده از یک محصول که پس از خرید یا تهیهٔ رایگان ثبت می‌شود |
| سفارش | رکورد خرید با وضعیت‌های پرداخت |
| مدل تحویل | اظهار سازنده دربارهٔ نحوهٔ دریافت محصول: دانلودی، میزبانی‌شده، میزبانی خارجی، دسترسی API، راه‌اندازی، ترکیبی |
| مدل اجرا | کجا محصول اجرا می‌شود: نزد سازنده، نزد خریدار، شخص ثالث، ترکیبی |
| تأیید تحویل | اعلام شما که آنچه سازنده وعده داده بود دریافت شده است |
| نسخه | هر انتشار محصول؛ تغییرات مهم با نسخهٔ جدید و یادداشت تغییرات منتشر می‌شود |
| بازبینی | بررسی فهرست محصول توسط MESH پیش از انتشار |
| نگهداشت | دورهٔ ${F.holdingDays} روزه‌ای که درآمد سازنده پیش از قابل‌برداشت‌شدن در آن می‌ماند |
| KYC | احراز هویت سازنده (نام قانونی و شمارهٔ ملی) برای تسویه |
| تسویه (Payout) | انتقال درآمد قابل برداشت سازنده به حساب بانکی |
`,
      en: `
| Term | Meaning |
|---|---|
| Agent | The unit of listing on MESH; every product (assistant, workflow, template…) is an "agent" |
| Library | The list of products you have access to |
| Entitlement | The right to use a product, recorded after a purchase or a free acquisition |
| Order | The purchase record with its payment states |
| Delivery model | The creator's declaration of how you receive the product: downloadable, hosted, externally hosted, API access, setup, hybrid |
| Execution model | Where the product runs: creator, buyer, third party, hybrid |
| Delivery confirmation | Your statement that you received what the creator promised |
| Version | Each release of a product; material changes ship as a new version with release notes |
| Review | MESH's check of a product listing before publication |
| Holding | The ${F.holdingDays}-day period creator earnings wait before becoming payable |
| KYC | Creator identity verification (legal name and national ID) for settlements |
| Payout | Transfer of a creator's payable earnings to a bank account |
`,
    },
  },
];
