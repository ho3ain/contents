import { PLATFORM_FACTS as F } from '../platform-facts';
import type { DocArticle } from './types';

const UPDATED = '2026-10-13';

export const SECURITY: DocArticle[] = [
  {
    slug: 'account-security',
    section: 'security',
    owner: 'engineering',
    updatedAt: UPDATED,
    title: { fa: 'امنیت حساب', en: 'Account security' },
    summary: {
      fa: 'گذرواژه، نشست‌ها، ورود دومرحله‌ای، بازیابی و کارهایی که MESH هرگز نمی‌کند.',
      en: 'Passwords, sessions, two-step sign-in, recovery and what MESH never does.',
    },
    body: {
      fa: `
## چطور وارد می‌شوید

- ورود با **شمارهٔ تلفن یا ایمیل** به‌علاوهٔ گذرواژه. ایمیل اختیاری است؛ تا زمانی که ایمیل تأیید نشده، بخش‌های داخل حساب در دسترس نیست.
- گذرواژه حداقل **${F.passwordMinLength} نویسه** دارد و فقط به‌صورت هش‌شده ذخیره می‌شود؛ هیچ‌کس در MESH گذرواژهٔ شما را نمی‌بیند.
- پس از ورود، یک **توکن دسترسی ${F.accessTokenMinutes} دقیقه‌ای** در حافظهٔ مرورگر و یک **کوکی نشست HttpOnly** به مدت ${F.refreshSessionDays} روز نگهداری می‌شود. «خروج از همهٔ دستگاه‌ها» همهٔ نشست‌ها را باطل می‌کند.
- تلاش‌های ورود به ازای هر IP محدودند (${F.loginRateLimitPerMinute} در دقیقه) و پس از تلاش‌های ناموفق پی‌درپی، حساب موقتاً قفل می‌شود؛ زمان باقی‌مانده نمایش داده می‌شود.

## نشست‌های فعال

در **تنظیمات → امنیت** می‌توانید همهٔ دستگاه‌های واردشده را ببینید (مرورگر، تاریخ آخرین استفاده، IP) و هر نشست یا «همهٔ نشست‌های دیگر» را خاتمه دهید. تغییر گذرواژه نیز نشست‌های دیگر را می‌بندد.

## ورود دومرحله‌ای (TOTP)

هر کاربر می‌تواند از همان بخش، ورود دومرحله‌ای را با یک برنامهٔ احراز هویت (مثل Aegis، Google Authenticator یا 1Password) فعال کند. هنگام فعال‌سازی **کدهای بازیابی** یک‌بارمصرف دریافت می‌کنید؛ آن‌ها را جایی امن نگه دارید، چون تنها راه ورود بدون دستگاه احراز هویت‌اند. مدیران پلتفرم برای عملیات حساس باید ورود دومرحله‌ای داشته باشند.

## بازیابی حساب

- **فراموشی گذرواژه**: درخواست کد بازیابی به ایمیل یا تلفن ثبت‌شده؛ کد پس از ${F.codeExpiryMinutes} دقیقه منقضی می‌شود. اگر ارسال پیامک در محیط فعال نباشد، فقط ایمیل در دسترس است.
- **تغییر گذرواژه** از داخل حساب نیاز به گذرواژهٔ فعلی دارد.
- حساب بدون ایمیلِ تأییدشده و بدون دسترسی به تلفن، از طریق [فرم تماس](/contact?topic=general) بررسی دستی می‌شود؛ MESH بدون احراز هویت، دسترسی به حساب نمی‌دهد.

## پشتیبانی و دسترسی اپراتور

برای رفع اشکال، پشتیبانی MESH ممکن است با مجوز ویژه حساب شما را **فقط‌خواندنی** مشاهده کند. این نشست‌ها ثبت می‌شوند، با بنر در حساب شما قابل مشاهده‌اند (و خودتان می‌توانید آن را پایان دهید) و هرگز اجازهٔ تغییر گذرواژه، ایمیل، تلفن، ورود دومرحله‌ای، احراز هویت مالی، تسویه یا خرید را ندارند.

## MESH هرگز …

- گذرواژه، کد تأیید یا کد بازیابی شما را نمی‌پرسد — نه با ایمیل، نه با پیامک، نه با تلفن.
- شما را به صفحه‌ای غیر از دامنهٔ MESH برای «تأیید حساب» هدایت نمی‌کند.
- اطلاعات کارت بانکی را نمی‌خواهد؛ پرداخت در درگاه بانکی انجام می‌شود.

> [!tip] اگر پیامی مشکوک با نام MESH دریافت کردید، پاسخ ندهید و از طریق [فرم تماس](/contact?topic=bug) گزارش کنید.

## گزارش آسیب‌پذیری

اگر ضعف امنیتی یافتید، لطفاً به‌صورت مسئولانه و خصوصی از طریق [فرم تماس](/contact?topic=bug) با موضوع «امنیت» گزارش دهید و تا رفع آن منتشر نکنید. برنامهٔ پاداش (Bug Bounty) فعلاً وجود ندارد.
`,
      en: `
## How you sign in

- Sign in with **phone number or e-mail** plus password. E-mail is optional; until the e-mail is verified, the account area is not accessible.
- Passwords are at least **${F.passwordMinLength} characters** and stored only as a hash; nobody at MESH can see your password.
- After sign-in, a **${F.accessTokenMinutes}-minute access token** is kept in browser memory and an **HttpOnly session cookie** for ${F.refreshSessionDays} days. "Sign out of all devices" invalidates every session.
- Login attempts are limited per IP (${F.loginRateLimitPerMinute} per minute) and the account is temporarily locked after repeated failures; the remaining time is shown.

## Active sessions

Under **Settings → Security** you can see every signed-in device (browser, last used, IP) and end any session or "all other sessions". Changing your password also closes the other sessions.

## Two-step sign-in (TOTP)

Any user can enable two-step sign-in from the same section with an authenticator app (such as Aegis, Google Authenticator or 1Password). When enabling it you receive single-use **recovery codes**; keep them somewhere safe — they are the only way in without your authenticator device. Platform administrators must have two-step sign-in for sensitive operations.

## Account recovery

- **Forgotten password**: request a recovery code to the registered e-mail or phone; the code expires after ${F.codeExpiryMinutes} minutes. If SMS delivery is not enabled in the environment, only e-mail is available.
- **Changing the password** from inside the account requires the current password.
- An account without a verified e-mail and without access to the phone is reviewed manually through the [contact form](/contact?topic=general); MESH never grants account access without identity verification.

## Support and operator access

To debug a problem, MESH support may, with a dedicated permission, view your account **read-only**. Such sessions are logged, visible to you as a banner in your account (you can end them yourself), and can never change your password, e-mail, phone, two-step sign-in, financial verification, payouts or purchases.

## MESH never …

- asks for your password, verification code or recovery code — not by e-mail, SMS or phone.
- sends you to a page outside the MESH domain to "verify your account".
- asks for card details; payment happens on the bank gateway.

> [!tip] If you receive a suspicious message in MESH's name, do not reply and report it through the [contact form](/contact?topic=bug).

## Reporting a vulnerability

If you find a security weakness, please report it responsibly and privately through the [contact form](/contact?topic=bug) with the topic "Security" and do not publish it until it is fixed. There is currently no bug-bounty programme.
`,
    },
  },
  {
    slug: 'data-and-privacy',
    section: 'security',
    owner: 'legal',
    updatedAt: UPDATED,
    title: { fa: 'داده‌ها و حریم خصوصی', en: 'Data and privacy' },
    summary: {
      fa: 'خلاصهٔ عملی سیاست حریم خصوصی: چه داده‌ای، چرا، چه کسی می‌بیند.',
      en: 'The practical summary of the privacy policy: what data, why, who sees it.',
    },
    body: {
      fa: `
این صفحه خلاصهٔ کاربردی [سیاست حریم خصوصی](/legal/privacy) است؛ در صورت اختلاف، متن سیاست ملاک است.

## چه داده‌ای نگه می‌داریم

| دسته | نمونه | چرا |
|---|---|---|
| حساب | نام کاربری، تلفن، ایمیل (اختیاری)، هش گذرواژه، نسخهٔ شرایط پذیرفته‌شده | ورود، اعلان، سابقهٔ رضایت |
| امنیت | نشست‌ها (IP، مرورگر)، رویدادهای حسابرسی | محافظت از حساب، پیگیری تغییرات |
| خرید | سفارش‌ها، وضعیت پرداخت، شناسهٔ تراکنش درگاه، حق دسترسی‌ها، درخواست بازگشت وجه | اجرای قرارداد، پشتیبانی، حسابداری |
| سازندگی | پروفایل عمومی، محصولات، فروش‌ها، درآمد | انتشار و تسویه |
| احراز هویت مالی (فقط سازندگان) | نام قانونی، شمارهٔ ملی، شبا (پوشانده) | تسویه و الزامات قانونی |
| استفاده | بازدید صفحه‌ها با کلید بازدید‌کنندهٔ ناشناس، رویدادهای محصول | بهبود کاتالوگ و آمار سازندگان (بدون کوکی ردیابی) |
| پشتیبانی | درخواست‌ها، پیام‌های فرم تماس | پاسخ‌گویی |

## چه چیزی را **نگه نمی‌داریم**

- اطلاعات کارت بانکی (در درگاه پرداخت می‌ماند).
- گذرواژهٔ خام.
- کوکی تبلیغاتی یا ردیابی شخص ثالث.
- IP یا مرورگر فرستندهٔ فرم تماس.

## چه کسی چه چیزی می‌بیند

| | خریدار | سازنده | اپراتور MESH |
|---|---|---|---|
| پروفایل عمومی سازنده | ✓ | ✓ | ✓ |
| نام کاربری خریداران موفق | — | ✓ (فقط برای محصولات خودش) | ✓ |
| ایمیل / تلفن خریدار | — | — | ✓ (با ثبت دسترسی) |
| مدارک احراز هویت سازنده | — | خودش | ✓ (آشکارسازی شمارهٔ ملی ثبت می‌شود) |

## حقوق و درخواست‌ها

- **مشاهده و ویرایش** پروفایل، ایمیل، تلفن و آواتار از تنظیمات.
- **خروج از دستگاه‌ها** و تغییر گذرواژه از تنظیمات → امنیت.
- **درخواست حذف حساب یا دریافت نسخه‌ای از داده‌ها** فعلاً خودکار نیست و از طریق [فرم تماس](/contact?topic=privacy) انجام می‌شود؛ سوابق مالی تا پایان دوره‌های قانونی حفظ می‌شوند.

> [!warning] موارد زیر هنوز تعریف‌نشده‌اند و در سیاست حریم خصوصی هم «نیازمند تصمیم» علامت خورده‌اند: مدت نگهداری هر دسته داده، هویت حقوقی اپراتور و حداقل سن. تا تعیین آن‌ها، MESH تعهدی فراتر از متن فعلی نمی‌دهد.

## داده‌ای که به سازندگان می‌رود

سازنده‌ها هیچ داده‌ای از سمت MESH دربارهٔ کاربرد شما از محصول دریافت نمی‌کنند. اگر محصول خودش داده جمع‌آوری کند، باید در «سیاست داده»ی همان محصول اعلام شده باشد؛ پیش از خرید آن را بخوانید. قسمت ۸ [شرایط استفاده](/legal/terms) را ببینید.
`,
      en: `
This page is the practical summary of the [Privacy Policy](/legal/privacy); if they differ, the policy text prevails.

## What we keep

| Category | Examples | Why |
|---|---|---|
| Account | Username, phone, e-mail (optional), password hash, accepted Terms version | Sign-in, notifications, consent record |
| Security | Sessions (IP, browser), audit events | Account protection, change tracking |
| Purchases | Orders, payment status, gateway transaction id, entitlements, refund requests | Contract performance, support, accounting |
| Creating | Public profile, products, sales, earnings | Publishing and settlement |
| Financial verification (creators only) | Legal name, national ID, IBAN (masked) | Payouts and legal requirements |
| Usage | Page views with an anonymous visitor key, product events | Catalogue improvement and creator statistics (no tracking cookies) |
| Support | Requests, contact-form messages | Responding to you |

## What we **do not** keep

- Card details (they stay with the payment gateway).
- Plain-text passwords.
- Advertising or third-party tracking cookies.
- IP or browser of contact-form senders.

## Who sees what

| | Buyer | Creator | MESH operator |
|---|---|---|---|
| Public creator profile | ✓ | ✓ | ✓ |
| Usernames of successful buyers | — | ✓ (own products only) | ✓ |
| Buyer e-mail / phone | — | — | ✓ (access is logged) |
| Creator verification documents | — | Own | ✓ (revealing the national ID is logged) |

## Rights and requests

- **View and edit** profile, e-mail, phone and avatar under Settings.
- **Sign out of devices** and change the password under Settings → Security.
- **Account deletion or a copy of your data** is not self-service yet and goes through the [contact form](/contact?topic=privacy); financial records are kept for the statutory periods.

> [!warning] The following are still undefined and are marked "Decision required" in the Privacy Policy too: retention period per data category, the operator's legal entity and the minimum age. Until they are set, MESH makes no commitment beyond the current text.

## Data that goes to creators

Creators receive no data from MESH about how you use a product. If the product itself collects data, that must be declared in that product's "Data policy"; read it before buying. See section 8 of the [Terms of Service](/legal/terms).
`,
    },
  },
];
