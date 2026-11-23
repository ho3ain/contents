import { PLATFORM_FACTS as F } from '../platform-facts';

/**
 * Privacy Policy — describes the data the platform verifiably collects and
 * how it is processed today (sources: backend entities, auth/session model,
 * analytics beacons, e-mail outbox, finance KYC). DRAFT pending legal review.
 */
export const PRIVACY_FA = `
> [!warning] این متن پیش‌نویس محصولی است که رفتار فعلی پلتفرم را توصیف می‌کند و باید پیش از انتشار نهایی توسط مشاور حقوقی بازبینی شود. مواردی که سیاست مکتوب ندارند با برچسب «نیازمند تصمیم» مشخص شده‌اند.

## ۱. این سیاست دربارهٔ چیست

این سیاست توضیح می‌دهد MESH هنگام استفادهٔ شما از وب‌سایت، حساب کاربری، خرید و سازندگی چه داده‌هایی را جمع‌آوری می‌کند، چرا، چه کسانی به آن دسترسی دارند و چه اختیاراتی دارید. این سند بخشی از [شرایط استفاده](/legal/terms) است.

> [!warning] نیازمند تصمیم: مشخصات کنترل‌کنندهٔ داده (شخص حقوقی اپراتور) و مبنای قانونی پردازش بر اساس حوزهٔ قضایی حاکم پس از بازبینی حقوقی درج می‌شود.

## ۲. داده‌هایی که جمع‌آوری می‌کنیم

### ۲.۱ داده‌های حساب

| داده | الزامی؟ | چرا |
|---|---|---|
| شمارهٔ تلفن همراه | بله | شناسهٔ ورود و یکتایی حساب |
| رمز عبور | بله | فقط به‌صورت هش (bcrypt) ذخیره می‌شود؛ هرگز متن اصلی |
| نام کاربری | بله | نمایش عمومی در نظرات و فروش‌ها به سازنده |
| ایمیل | خیر | رسید، کد تأیید، هشدار امنیتی، بازیابی رمز |
| نام کامل، کشور، علاقه‌مندی‌ها، زبان ترجیحی، شناسهٔ آواتار | خیر | شخصی‌سازی و پروفایل؛ آواتار به‌صورت محلی و بدون سرویس خارجی ساخته می‌شود |
| پذیرش شرایط (نسخه و زمان) | خودکار | سابقهٔ رضایت شما |

### ۲.۲ خرید و پرداخت

سفارش‌ها، وضعیت پرداخت، شناسهٔ مرجع درگاه و رسیدها را نگه می‌داریم. **اطلاعات کارت بانکی هرگز به MESH نمی‌رسد**؛ پرداخت در صفحهٔ درگاه پرداخت انجام می‌شود و تنها نتیجهٔ تراکنش و شناسهٔ مرجع آن به ما بازمی‌گردد. دسترسی‌های محصول (کتابخانه)، تأیید تحویل و پیشرفت راه‌اندازی نیز در حساب شما ثبت می‌شود.

### ۲.۳ داده‌های سازندگان

پروفایل سازنده، محصولات و نسخه‌ها، آمار فروش (شامل نام کاربری خریداران سفارش‌های موفق)، و برای تسویه: **نام قانونی و شمارهٔ ملی** (احراز هویت) و **شمارهٔ شبا**. شبا در رابط کاربری همیشه پوشانده نمایش داده می‌شود و نمایش کامل آن فقط برای اپراتور مجاز و با ثبت در گزارش ممیزی امکان‌پذیر است. رویدادهای احراز هویت به‌صورت فقط‌افزودنی ثبت می‌شوند.

### ۲.۴ پشتیبانی و تماس

درخواست‌های پشتیبانی داخل حساب، و برای فرم تماس عمومی: نام، ایمیل، موضوع، متن پیام و زبان رابط. فرم تماس **نشانی IP یا مرورگر** شما را ذخیره نمی‌کند؛ برای جلوگیری از ارسال تکراری، تنها هش ایمیل + متن نگه داشته می‌شود.

### ۲.۵ داده‌های فنی و امنیتی

- **نشست‌ها**: برای هر ورود، نشانی IP و نوع مرورگر نگهداری می‌شود تا بتوانید نشست‌های فعال را ببینید و ببندید. نشست با توکن تازه‌سازی حداکثر ${F.refreshSessionDays} روز معتبر است.
- **گزارش ممیزی**: اقدامات حساس (ورود، تغییر رمز، اقدامات مدیریتی) با زمان، IP و مرورگر ثبت می‌شوند و زنجیرهٔ ممیزی تغییرناپذیر است.
- **آمار استفادهٔ ناشناس**: بازدید و نمایش محصولات با یک کلید بازدیدکنندهٔ هش‌شده (SHA-256 با نمک سرور) شمارش می‌شود؛ این کلید به هویت شما برنمی‌گردد و برای تبلیغات استفاده نمی‌شود.
- **گزارش خطای مرورگر**: اگر صفحه‌ای دچار خطا شود، پیام خطا پس از پاک‌سازی (بدون توکن یا داده‌های شخصی) ارسال می‌شود.

## ۳. کوکی‌ها و حافظهٔ مرورگر

MESH از کوکی ردیابی یا تبلیغاتی استفاده نمی‌کند. موارد زیر برای کارکرد سرویس لازم‌اند:

- یک کوکی **HttpOnly** برای توکن تازه‌سازی نشست (فقط برای حفظ ورود شما).
- حافظهٔ محلی مرورگر برای ترجیحات: زبان، پوسته (روشن/تاریک)، پنل فعال و نشانهٔ وجود نشست.

## ۴. چرا داده‌ها را پردازش می‌کنیم

- ارائهٔ سرویس: حساب، خرید، دسترسی به محصول، پشتیبانی، تسویهٔ سازندگان.
- امنیت: جلوگیری از تقلب و سوءاستفاده، محدودیت نرخ درخواست، قفل پیشروندهٔ ورود، هشدارهای امنیتی.
- بهبود محصول: آمار تجمیعی و ناشناس بازدید و جست‌وجو.
- الزامات قانونی و حسابداری: نگهداری سوابق سفارش‌ها، بازگشت وجه و تسویه.

## ۵. چه کسانی به داده دسترسی دارند

- **سازندگان**: نام کاربری خریدارانِ محصولشان و متن درخواست‌های پشتیبانی که برایشان ارسال می‌کنید. ایمیل و تلفن شما به سازنده داده نمی‌شود.
- **درگاه پرداخت**: برای انجام پرداخت، مبلغ و شناسهٔ سفارش به درگاه پرداخت ارسال می‌شود و خودِ درگاه سیاست حریم خصوصی مستقل دارد.
- **ارسال‌کنندهٔ ایمیل**: ایمیل‌های تراکنشی از طریق سرویس ایمیل پیکربندی‌شده توسط اپراتور ارسال می‌شوند؛ محتوای حساس ایمیل (مانند کدها) پس از ارسال از صف ایمیل پاک می‌شود.
- **تیم عملیات MESH**: با نقش‌ها و سطوح دسترسی مشخص، تأیید دومرحله‌ای برای اقدامات حساس و ثبت کامل در گزارش ممیزی.
- **مراجع قانونی**: در صورت الزام قانونی.

MESH داده‌های شما را نمی‌فروشد.

## ۶. نگهداری داده‌ها

- داده‌های حساب تا زمانی که حساب فعال است نگه داشته می‌شود.
- نشست‌های منقضی‌شده و باطل‌شده پس از انقضا بی‌اثر می‌شوند.
- محتوای حساس ایمیل‌ها (کدها) بلافاصله پس از ارسال موفق یا شکست قطعی پاک می‌شود.
- سوابق سفارش، پرداخت، بازگشت وجه، تسویه و گزارش ممیزی برای اهداف حسابداری و امنیتی نگهداری می‌شوند.

> [!warning] نیازمند تصمیم: مدت‌زمان مشخص نگهداری برای گزارش‌های ممیزی، پیام‌های فرم تماس و حساب‌های غیرفعال هنوز به‌صورت سیاست مکتوب تعیین نشده است.

## ۷. اختیارات شما

- **مشاهده و ویرایش**: اطلاعات پروفایل، ایمیل، علاقه‌مندی‌ها و زبان را در تنظیمات ویرایش کنید.
- **امنیت**: رمز عبور را تغییر دهید، ورود دومرحله‌ای را فعال کنید و نشست‌های دیگر را ببندید.
- **اعلان‌ها**: اعلان‌های غیرضروری را در تنظیمات مدیریت کنید.
- **نظرات**: نظرات خود را پنهان یا دوباره نمایان کنید.
- **حذف حساب و درخواست داده**: در حال حاضر حذف کامل حساب به‌صورت خودکار در تنظیمات در دسترس نیست؛ درخواست حذف یا دریافت نسخه‌ای از داده‌هایتان را از طریق [فرم تماس با موضوع «حریم خصوصی»](/contact?topic=privacy) ثبت کنید تا توسط تیم MESH بررسی و اجرا شود.

> [!warning] نیازمند تصمیم: حذف خودکار حساب و بازهٔ پاسخ‌گویی به درخواست‌های داده هنوز تعریف نشده‌اند.

## ۸. امنیت

رمزهای عبور با bcrypt هش می‌شوند؛ نشست‌ها با توکن کوتاه‌مدت (${F.accessTokenMinutes} دقیقه) و کوکی تازه‌سازی HttpOnly مدیریت می‌شوند؛ ورود با قفل پیشرونده در برابر حدس رمز محافظت می‌شود؛ اقدامات مدیریتی حساس نیازمند تأیید دومرحله‌ای‌اند و در زنجیرهٔ ممیزی تغییرناپذیر ثبت می‌شوند؛ درخواست‌های API به ${F.apiRateLimitPerMinute} درخواست در دقیقه برای هر IP محدودند. هیچ سیستمی کاملاً بی‌خطر نیست؛ اگر مشکلی امنیتی دیدید، از طریق [فرم تماس](/contact?topic=bug) اطلاع دهید.

## ۹. کودکان

> [!warning] نیازمند تصمیم: حداقل سن و نحوهٔ برخورد با داده‌های افراد زیر سن قانونی هنوز تعیین نشده است. پلتفرم برای استفادهٔ افراد زیر سن قانونی طراحی نشده است.

## ۱۰. تغییرات این سیاست

هر نسخه شناسهٔ تاریخ‌دار و تاریخ اجرا دارد که بالای صفحه نمایش داده می‌شود. تغییرات مهم پیش از اجرا در همین صفحه اعلام می‌شود.

## ۱۱. تماس

پرسش‌ها و درخواست‌های مربوط به حریم خصوصی را از طریق [فرم تماس با موضوع «حریم خصوصی»](/contact?topic=privacy) بفرستید.
`;

export const PRIVACY_EN = `
> [!warning] This is a product-specific draft describing the platform's current behaviour. It must be reviewed by legal counsel before final publication. Items without a written policy are marked "decision required".

## 1. What this policy covers

This policy explains what data MESH collects when you use the website, your account, purchases and creator tools — why, who can access it and what choices you have. It is part of the [Terms of Service](/legal/terms).

> [!warning] Decision required: the identity of the data controller (the operator's legal entity) and the legal basis of processing under the governing jurisdiction will be inserted after legal review.

## 2. Data we collect

### 2.1 Account data

| Data | Required? | Why |
|---|---|---|
| Mobile phone number | Yes | Sign-in identifier and account uniqueness |
| Password | Yes | Stored only as a bcrypt hash — never in clear text |
| Username | Yes | Shown publicly on reviews and to creators on sales |
| E-mail | No | Receipts, verification codes, security alerts, password recovery |
| Full name, country, interests, preferred language, avatar id | No | Personalisation and profile; avatars are generated locally without an external service |
| Terms acceptance (version and time) | Automatic | Your consent record |

### 2.2 Purchases and payment

We keep orders, payment status, the gateway reference and receipts. **Card details never reach MESH**: payment happens on the payment gateway's page and only the transaction result and reference come back to us. Product entitlements (your library), delivery confirmation and setup progress are also recorded on your account.

### 2.3 Creator data

Creator profile, products and versions, sales statistics (including the usernames of buyers of successful orders), and for settlement: **legal name and national ID** (identity verification) and the **IBAN**. The IBAN is always shown masked in the interface; revealing it in full is limited to authorised operators and is written to the audit trail. Identity-verification events are stored append-only.

### 2.4 Support and contact

Support requests inside your account, and for the public contact form: name, e-mail, topic, message text and interface language. The contact form does **not** store your IP address or browser; only a hash of e-mail + text is kept to prevent duplicate submissions.

### 2.5 Technical and security data

- **Sessions**: for every sign-in we keep the IP address and browser type so you can see and end active sessions. A refresh session is valid for at most ${F.refreshSessionDays} days.
- **Audit trail**: sensitive actions (sign-in, password changes, administrative actions) are recorded with time, IP and browser in a tamper-evident audit chain.
- **Anonymous usage statistics**: product views and impressions are counted with a hashed visitor key (SHA-256 with a server-side salt); the key cannot be traced back to you and is not used for advertising.
- **Browser error reports**: if a page crashes, the error message is sent after scrubbing (no tokens or personal data).

## 3. Cookies and browser storage

MESH does not use tracking or advertising cookies. The following are needed for the service to work:

- one **HttpOnly** cookie holding the session refresh token (only to keep you signed in);
- browser local storage for preferences: language, theme (light/dark), active panel and a session hint.

## 4. Why we process data

- Providing the service: account, purchases, product access, support, creator settlements.
- Security: fraud and abuse prevention, request rate limits, progressive sign-in lockout, security alerts.
- Improving the product: aggregated, anonymous view and search statistics.
- Legal and accounting obligations: keeping records of orders, refunds and settlements.

## 5. Who can access data

- **Creators**: the usernames of buyers of their products and the text of support requests you send them. Your e-mail and phone are not shared with creators.
- **Payment gateway**: to process a payment, the amount and order identifier are sent to the gateway, which has its own privacy policy.
- **E-mail delivery**: transactional e-mails are sent through the e-mail service configured by the operator; sensitive content (such as codes) is purged from the outbox after delivery.
- **The MESH operations team**: with defined roles and permission levels, two-step verification for sensitive actions and full audit logging.
- **Authorities**: where required by law.

MESH does not sell your data.

## 6. Retention

- Account data is kept while the account is active.
- Expired and revoked sessions become ineffective on expiry.
- Sensitive e-mail content (codes) is purged immediately after successful delivery or permanent failure.
- Order, payment, refund, settlement and audit records are kept for accounting and security purposes.

> [!warning] Decision required: specific retention periods for audit logs, contact-form messages and inactive accounts have not yet been defined as a written policy.

## 7. Your choices

- **View and edit**: edit your profile, e-mail, interests and language in Settings.
- **Security**: change your password, enable two-step sign-in and end other sessions.
- **Notifications**: manage non-essential notifications in Settings.
- **Reviews**: hide or unhide your own reviews.
- **Account deletion and data requests**: self-service account deletion is not available in Settings yet; submit a deletion request or a request for a copy of your data through the [contact form with the topic "Privacy"](/contact?topic=privacy) and the MESH team will review and carry it out.

> [!warning] Decision required: self-service deletion and the response time for data requests have not been defined.

## 8. Security

Passwords are hashed with bcrypt; sessions use a short-lived access token (${F.accessTokenMinutes} minutes) and an HttpOnly refresh cookie; sign-in is protected by progressive lockout against password guessing; sensitive administrative actions require two-step verification and are written to a tamper-evident audit chain; API requests are limited to ${F.apiRateLimitPerMinute} per minute per IP. No system is perfectly secure — if you notice a security problem, tell us through the [contact form](/contact?topic=bug).

## 9. Children

> [!warning] Decision required: the minimum age and the handling of minors' data have not been defined. The platform is not designed for use by minors.

## 10. Changes to this policy

Each version has a dated identifier and an effective date shown at the top of the page. Material changes are announced on this page before they take effect.

## 11. Contact

Send privacy questions and requests through the [contact form with the topic "Privacy"](/contact?topic=privacy).
`;
