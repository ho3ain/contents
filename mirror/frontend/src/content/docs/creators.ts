import { PLATFORM_FACTS as F } from '../platform-facts';
import type { DocArticle } from './types';

const UPDATED = '2026-10-13';

export const CREATORS: DocArticle[] = [
  {
    slug: 'becoming-a-creator',
    section: 'creators',
    owner: 'product',
    updatedAt: '2026-10-18',
    title: { fa: 'سازنده شدن', en: 'Becoming a creator' },
    summary: {
      fa: 'از «شروع کسب درآمد» تا تأیید پروفایل سازندگی.',
      en: 'From "Start earning" to an approved creator profile.',
    },
    body: {
      fa: `
## چه کسی می‌تواند سازنده شود؟

هر حساب MESH. سازندگی یک **نقش اضافه** روی همان حساب است؛ حساب جداگانه لازم نیست.

## مراحل

1. از سربرگ پنل یا **تنظیمات**، «کسب درآمد» را بزنید. پروفایل سازندگی شما با وضعیت **در انتظار تأیید** ساخته می‌شود و پنل سازنده باز می‌شود.
2. پروفایل عمومی را کامل کنید: نام نمایشی، معرفی، تخصص‌ها، لینک‌ها و آواتار. این اطلاعات در صفحهٔ عمومی سازنده نمایش داده می‌شود.
3. در صورت درخواست، مدارک «تأیید سازنده» را ارسال کنید. تیم MESH پروفایل را بررسی می‌کند.
4. پس از **تأیید**، می‌توانید محصول برای بازبینی بفرستید و منتشر کنید. نتیجه در اعلان‌ها و (در صورت داشتن ایمیل) با ایمیل اطلاع داده می‌شود.

> [!note] پیش از تأیید می‌توانید پیش‌نویس محصول بسازید و چک‌لیست آمادگی را کامل کنید، اما «ارسال برای بازبینی» و «انتشار» تا تأیید پروفایل غیرفعال است. MESH زمان مشخصی برای بررسی پروفایل تعهد نمی‌کند.

## وضعیت‌های پروفایل

| وضعیت | معنا |
|---|---|
| در انتظار تأیید | پروفایل ساخته شده، بررسی انجام نشده |
| تأییدشده | انتشار محصول مجاز است |
| تعلیق‌شده | انتشار و تسویه متوقف شده (نقض قوانین یا ریسک) |

## قبل از اولین محصول

- [انتشار محصول](/docs/publishing-a-product) را بخوانید تا بدانید چه اطلاعاتی لازم است.
- [مرکز اسناد حقوقی](/legal) وضعیت پیش‌نویس‌های عمومی را نشان می‌دهد. فرایند فعلی سازنده، پذیرش یا نسخهٔ یک توافق‌نامهٔ جداگانهٔ سازندگان را ثبت نمی‌کند؛ پیش از تبدیل آن به الزام انتشار، کنترل و متن تأییدشده لازم است.
`,
      en: `
## Who can become a creator?

Any MESH account. Creating is an **additional role** on the same account; no separate account is needed.

## Steps

1. From the panel header or **Settings**, press "Start earning". Your creator profile is created with the state **pending approval** and the creator panel opens.
2. Complete the public profile: display name, bio, expertise, links and avatar. It is shown on your public creator page.
3. When asked, submit the "creator verification" information. The MESH team reviews the profile.
4. After **approval** you can submit products for review and publish them. The result arrives as a notification and (if your account has an e-mail) by e-mail.

> [!note] Before approval you can create product drafts and complete the readiness checklist, but "Submit for review" and "Publish" stay disabled until the profile is approved. MESH does not commit to a review time for profiles.

## Profile states

| State | Meaning |
|---|---|
| Pending approval | Profile created, not reviewed yet |
| Approved | Publishing is allowed |
| Suspended | Publishing and payouts stopped (policy breach or risk) |

## Before your first product

- Read [Publishing a product](/docs/publishing-a-product) to know what information is required.
- The [legal documents hub](/legal) shows the public drafts and their status. The current creator flow does not record acceptance or a version of a separate creator agreement; approved text and a control are needed before that becomes a publishing requirement.
`,
    },
  },
  {
    slug: 'publishing-a-product',
    section: 'creators',
    owner: 'product',
    updatedAt: UPDATED,
    title: { fa: 'انتشار محصول', en: 'Publishing a product' },
    summary: {
      fa: 'اطلاعات لازم برای فهرست، چک‌لیست آمادگی، نسخه‌ها و یادداشت تغییرات.',
      en: 'What a listing needs, the readiness checklist, versions and release notes.',
    },
    body: {
      fa: `
## چه چیزی یک فهرست کامل می‌سازد؟

صفحهٔ محصول از اظهارات شما ساخته می‌شود. خریداران و بازبین‌ها به این بخش‌ها تکیه می‌کنند:

| بخش | محتوا |
|---|---|
| معرفی | نام، توضیح کوتاه و کامل، مسئله‌ای که حل می‌کند، مخاطب هدف، موارد استفاده |
| نحوهٔ کار | مراحل کار، نمونهٔ ورودی و خروجی، قابلیت‌ها و **محدودیت‌ها** |
| مدل محصول | نوع محصول، ابزار ساخت، مدل تحویل، مدل اجرا، مسئولیت میزبانی، دشواری راه‌اندازی |
| نیازمندی‌ها و مجوزها | هر چیزی که خریدار باید خودش فراهم کند (مثلاً کلید API) و دلیل هر مجوز |
| سیاست داده | آیا داده‌های کاربر ذخیره می‌شود، چه نوع داده‌ای، کجا |
| تحویل | دستورالعملی که پس از خرید در زبانهٔ «دسترسی و تحویل» نمایش داده می‌شود |
| قیمت | رایگان یا مبلغ یک‌بارهٔ ریالی |

> [!tip] محدودیت‌ها را صادقانه بنویسید. فهرستی که محدودیت‌هایش روشن است، درخواست بازگشت وجه کمتری می‌گیرد و در فیلترهای اعتماد خریداران بهتر دیده می‌شود.

## چک‌لیست آمادگی و انتشار

ویرایشگر محصول دو چک‌لیست دارد: **آمادگی** (کامل‌بودن اطلاعات) و **انتشار** (پیش‌نیازهای نهایی). تا همهٔ موارد اجباری سبز نشوند، ارسال برای بازبینی ممکن نیست؛ هر مورد توضیح می‌دهد چه چیزی کم است.

## ارسال، بازبینی و انتشار

1. **ارسال برای بازبینی** — وضعیت: ارسال‌شده → در حال بازبینی.
2. اگر اصلاحی لازم باشد: **نیاز به اصلاح** با بازخورد مورد‌به‌مورد؛ پس از رفع، «ارسال مجدد» کنید.
3. **تأییدشده / آمادهٔ انتشار** — دکمهٔ انتشار فعال می‌شود.
4. **منتشرشده** — در کاتالوگ عمومی دیده می‌شود. جزئیات در [فرایند بازبینی](/docs/review-process).

## نسخه‌ها و یادداشت تغییرات

- ویرایش یک محصول منتشرشده، **نسخهٔ جدید** می‌سازد که دوباره بازبینی می‌شود؛ نسخهٔ فعلی تا تأیید نسخهٔ جدید در دسترس می‌ماند.
- برای هر نسخه **یادداشت تغییرات** بنویسید؛ خریداران آن را در زبانهٔ «به‌روزرسانی‌ها» می‌بینند.
- می‌توانید محصول را از انتشار خارج و دوباره منتشر کنید؛ خریداران فعلی دسترسی خود را حفظ می‌کنند.

## رسانه‌ها

تصویر محصول باید متعلق به شما باشد یا مجوز استفاده داشته باشید. اگر بارگذاری فایل در محیط فعال نباشد، می‌توانید نشانی تصویر را وارد کنید.
`,
      en: `
## What makes a complete listing?

The product page is built from your declarations. Buyers and reviewers rely on these parts:

| Part | Content |
|---|---|
| Introduction | Name, short and full description, the problem it solves, target audience, use cases |
| How it works | Steps, example input and output, capabilities and **limitations** |
| Product model | Product type, build tool, delivery model, execution model, hosting responsibility, setup difficulty |
| Requirements and permissions | Everything the buyer must provide (for example an API key) and the reason for each permission |
| Data policy | Whether user data is stored, what kind, where |
| Delivery | The instructions shown after purchase in the "Access & delivery" tab |
| Price | Free, or a one-time amount in IRR |

> [!tip] Write limitations honestly. A listing with clear limitations gets fewer refund requests and ranks better in buyers' trust filters.

## Readiness and publish checklists

The product editor has two checklists: **readiness** (completeness) and **publish** (final prerequisites). Submission is not possible until every mandatory item is green; each item explains what is missing.

## Submit, review, publish

1. **Submit for review** — state: submitted → under review.
2. If changes are needed: **action required** with item-by-item feedback; after fixing, "resubmit".
3. **Approved / ready to publish** — the publish button becomes active.
4. **Published** — visible in the public catalogue. Details in [Review process](/docs/review-process).

## Versions and release notes

- Editing a published product creates a **new version** that is reviewed again; the current version stays available until the new one is approved.
- Write **release notes** for every version; buyers see them in the "Updates" tab.
- You can unpublish and republish a product; existing buyers keep their access.

## Media

Product images must be yours or licensed to you. If file upload is not enabled in the environment, you can enter an image URL instead.
`,
    },
  },
  {
    slug: 'review-process',
    section: 'creators',
    owner: 'operations',
    updatedAt: UPDATED,
    title: { fa: 'فرایند بازبینی', en: 'Review process' },
    summary: {
      fa: 'وضعیت‌های بازبینی، بازخورد مورد‌به‌مورد و دلایل رایج «نیاز به اصلاح».',
      en: 'Review states, item-by-item feedback and common reasons for "action required".',
    },
    body: {
      fa: `
## چرا بازبینی؟

بازبینی بررسی می‌کند که فهرست محصول **کامل، منسجم و مطابق قواعد پلتفرم** باشد: مشخصات با توضیحات هم‌خوانی داشته باشد، مجوزها و نیازمندی‌ها دلیل داشته باشند، سیاست داده روشن باشد و محتوا ممنوع نباشد. بازبینی تضمین عملکرد محصول نیست و مسئولیت صحت اظهارات با سازنده است.

## وضعیت‌ها

| وضعیت | معنا | کار شما |
|---|---|---|
| ارسال‌شده | در صف بازبینی | — |
| در حال بازبینی | بازبین مشغول بررسی است | — |
| نیاز به اصلاح | موارد مشخصی باید اصلاح شود | هر بازخورد را رفع و «حل‌شده» علامت بزنید، سپس ارسال مجدد کنید |
| ارسال مجدد | نسخهٔ اصلاح‌شده در صف است | — |
| تأییدشده / آمادهٔ انتشار | بازبینی موفق | «انتشار» را بزنید |
| منتشرشده | در کاتالوگ | — |
| رد‌شده | با قواعد سازگار نیست | دلیل را بخوانید؛ در صورت امکان محصول تازه با اصلاحات اساسی بسازید |

## دلایل رایج «نیاز به اصلاح»

- محدودیت‌ها یا نمونهٔ خروجی خالی/کلی است.
- مجوز یا نیازمندی بدون دلیل اعلام شده است.
- سیاست داده با توضیحات محصول تناقض دارد (مثلاً «داده‌ای ذخیره نمی‌شود» اما مجوز خواندن داده‌ها خواسته شده).
- دستورالعمل تحویل عملی نیست یا به چیزی ارجاع می‌دهد که خریدار نمی‌تواند پیدا کند.
- ادعای عملکردی غیرقابل‌راستی‌آزمایی (مثل «۱۰۰٪ دقت»).

> [!note] MESH زمان مشخصی برای بازبینی تعهد نمی‌کند. وضعیت لحظه‌ای هر محصول در صفحهٔ «وضعیت» آن و در اعلان‌ها نمایش داده می‌شود.
`,
      en: `
## Why review?

Review checks that a product listing is **complete, consistent and compliant with platform rules**: the specification matches the description, permissions and requirements have reasons, the data policy is clear and the content is not prohibited. Review is not a guarantee of the product's performance; the creator remains responsible for the accuracy of the declarations.

## States

| State | Meaning | Your action |
|---|---|---|
| Submitted | In the review queue | — |
| Under review | A reviewer is working on it | — |
| Action required | Specific items must be fixed | Resolve each feedback item and mark it resolved, then resubmit |
| Resubmitted | The corrected revision is queued | — |
| Approved / ready to publish | Review passed | Press "Publish" |
| Published | In the catalogue | — |
| Rejected | Incompatible with the rules | Read the reason; if possible create a new product with substantial changes |

## Common reasons for "action required"

- Limitations or the example output are empty or generic.
- A permission or requirement is declared without a reason.
- The data policy contradicts the description (for example "no data stored" but a read-user-data permission is requested).
- Delivery instructions are not actionable or refer to something the buyer cannot find.
- Unverifiable performance claims (such as "100 % accuracy").

> [!note] MESH does not commit to a review time. The current state of each product is shown on its "Status" page and in your notifications.
`,
    },
  },
  {
    slug: 'earnings-and-payouts',
    section: 'creators',
    owner: 'operations',
    updatedAt: '2026-10-18',
    title: { fa: 'درآمد، کارمزد و تسویه', en: 'Earnings, commission and payouts' },
    summary: {
      fa: `کارمزد ${F.commissionPercent}٪، نگهداشت ${F.holdingDays} روزه، KYC، حساب بانکی و درخواست تسویه.`,
      en: `${F.commissionPercent} % commission, ${F.holdingDays}-day holding, KYC, bank account and payout requests.`,
    },
    body: {
      fa: `
## سهم شما از هر فروش

| مورد | مقدار فعلی |
|---|---|
| کارمزد MESH | ${F.commissionPercent}٪ از مبلغ فروش |
| سهم سازنده | ${F.creatorSharePercent}٪ |
| کارمزد درگاه پرداخت | بر عهدهٔ MESH |
| واحد پول | ریال (IRR) |

نرخ‌های نمایش‌داده‌شده اطلاعات عملیاتی فعلی‌اند. هر تغییر تجاری، تاریخ اجرا و نحوهٔ اثر آن نیازمند تصمیم و متن تأییدشده است؛ از این راهنما تعهدی دربارهٔ تغییرات آینده استنباط نکنید.

## چرخهٔ درآمد

1. **فروش ثبت می‌شود** → سهم شما وارد وضعیت **نگهداشت** می‌شود.
2. پس از **${F.holdingDays} روز** (هم‌راستا با بازهٔ بازگشت وجه) مبلغ **قابل برداشت** می‌شود.
3. اگر در این مدت بازگشت وجه تأیید شود، همان مبلغ از درآمد شما برمی‌گردد (و در صورت تسویه‌شدن، به‌عنوان «بازیافت» از تسویه‌های بعدی کسر می‌شود).

همهٔ این مقادیر در **مالی و تسویه → صورت‌حساب** با جزئیات هر تراکنش و خروجی CSV در دسترس است.

## پیش‌نیازهای تسویه

| پیش‌نیاز | کجا |
|---|---|
| احراز هویت (KYC) تأییدشده: نام قانونی و شمارهٔ ملی | مالی و تسویه → احراز هویت |
| حساب بانکی ثبت و تأییدشده (شبا به نام خودتان) | مالی و تسویه → حساب بانکی |
| مبلغ قابل برداشت بیشتر از صفر | — |

شمارهٔ شبا در رابط کاربری همیشه پوشانده نمایش داده می‌شود. تأیید مالکیت حساب توسط اپراتور انجام می‌شود.

## درخواست تسویه

- درخواست حداکثر هر **${F.payoutCooldownDays} روز** یک‌بار ممکن است. دکمهٔ درخواست، دلیل غیرفعال‌بودن را (KYC، حساب بانکی، مبلغ، زمان) نشان می‌دهد.
- مسیر: درخواست‌شده → تأییدشده → در حال پردازش → پرداخت‌شده. تا پیش از پردازش می‌توانید درخواست را لغو کنید.
- تسویهٔ خودکار هر ${F.payoutAutoIntervalDays} روز نیز با تأیید اپراتور انجام می‌شود.
- پرداخت به‌صورت انتقال بانکی به حساب تأییدشده انجام می‌شود.

> [!warning] MESH زمان مشخصی برای واریز تعهد نمی‌کند و حداقل مبلغ تسویه هنوز تعریف نشده است. این راهنما دربارهٔ مسئولیت یا رفتار مالیاتی مشاوره یا نتیجهٔ حقوقی ارائه نمی‌کند.
`,
      en: `
## Your share of each sale

| Item | Current value |
|---|---|
| MESH commission | ${F.commissionPercent} % of the sale amount |
| Creator share | ${F.creatorSharePercent} % |
| Payment-gateway fee | Borne by MESH |
| Currency | Iranian rial (IRR) |

The displayed rates are current operational information. Any commercial change, effective date, and treatment of existing sales need an approved decision and text; do not infer a commitment about future changes from this guide.

## Earnings cycle

1. **A sale is recorded** → your share enters the **holding** state.
2. After **${F.holdingDays} days** (aligned with the refund window) the amount becomes **payable**.
3. If a refund is approved in the meantime, the same amount is reversed from your earnings (and, if already paid out, deducted from later settlements as a "recovery").

All of this is available under **Finance → Statement** with every transaction and a CSV export.

## Payout prerequisites

| Prerequisite | Where |
|---|---|
| Approved identity verification (KYC): legal name and national ID | Finance → Identity verification |
| Registered and verified bank account (IBAN in your own name) | Finance → Bank account |
| Payable balance above zero | — |

The IBAN is always shown masked in the interface. Ownership verification is done by an operator.

## Requesting a payout

- A request is possible at most once every **${F.payoutCooldownDays} days**. The request button explains why it is disabled (KYC, bank account, amount, timing).
- Path: requested → approved → processing → paid. You can cancel a request until it is being processed.
- An automatic settlement also runs every ${F.payoutAutoIntervalDays} days, subject to operator approval.
- Payment is made by bank transfer to the verified account.

> [!warning] MESH does not commit to a transfer date and a minimum payout amount is not defined yet. This guide does not give tax advice or a legal conclusion about tax responsibility.
`,
    },
  },
  {
    slug: 'creator-faq',
    section: 'creators',
    owner: 'product',
    updatedAt: '2026-10-18',
    title: { fa: 'پرسش‌های رایج سازندگان', en: 'Creator FAQ' },
    summary: { fa: 'پاسخ کوتاه به پرسش‌های پرتکرار سازندگان.', en: 'Short answers to the questions creators ask most.' },
    body: {
      fa: `
## آیا MESH محصول من را میزبانی می‌کند؟

برای همهٔ محصولات پاسخ یکسانی ندارد. «اجرای مدیریت‌شده» فقط بار مرجع محدود MESH است؛ «اجرای متصل» به نقطهٔ پایانیِ تحت کنترل شما وصل می‌شود؛ و تحویل مستقل یا پیشنهاد بیرونی هیچ مسیر اجرای MESH ندارد. مدل تحویل/اجرا، تعهد تحویل، نیازمندی‌ها و پشتیبانی را در اطلاعات تجاری همان محصول شفاف اعلام کنید.

## خریداران چه چیزی از من می‌بینند؟

پروفایل عمومی، محصولات منتشرشده، امتیازها و نظرات. شما نام کاربری خریداران سفارش‌های موفق را در «فروش‌ها» می‌بینید، نه ایمیل یا تلفن آن‌ها.

## پشتیبانی محصول چطور انجام می‌شود؟

پرسش‌های خریداران از طریق سیستم پشتیبانی به صف شما می‌رسد (پنل سازنده → پشتیبانی). پاسخ‌گویی به‌موقع در تجربهٔ خریدار و تصمیم‌های بازگشت وجه اثر دارد.

## می‌توانم قیمت را تغییر دهم؟

بله، با نسخهٔ جدید. سفارش‌های قبلی با قیمت زمان خرید ثبت شده‌اند.

## اگر خریدار درخواست بازگشت وجه بدهد؟

تیم MESH بررسی می‌کند و ممکن است توضیح شما را بخواهد. در صورت تأیید، مبلغ از درآمد نگهداشت‌شده یا تسویه‌های بعدی کسر می‌شود. جزئیات در [درآمد و تسویه](/docs/earnings-and-payouts).

## محصولم رد شد؛ چه کنم؟

دلیل را در صفحهٔ وضعیت محصول بخوانید. اگر «نیاز به اصلاح» است، موارد را رفع و ارسال مجدد کنید. اگر «رد‌شده» است، با اصلاحات اساسی محصول تازه بسازید یا از [فرم تماس](/contact?topic=creator) بپرسید.

## چطور تبلیغ کنم؟

پنل سازنده ابزار «رشد» (لینک اشتراک‌گذاری با ردیابی، تخفیف‌های زمان‌دار) دارد. ادعاهای غیرقابل‌راستی‌آزمایی در فهرست مجاز نیست.
`,
      en: `
## Does MESH host my product?

There is no single answer for every product. Managed Runtime is only a limited MESH reference workload; Connected Runtime reaches an endpoint you control; and independent delivery or an external offer has no MESH execution path. Clearly declare the delivery/execution model, delivery commitment, requirements, and support in that product’s commercial information.

## What do buyers see about me?

Your public profile, published products, ratings and reviews. You see the usernames of buyers of successful orders under "Sales", not their e-mail or phone.

## How does product support work?

Buyer questions reach your queue through the support system (creator panel → Support). Timely answers affect the buyer experience and refund decisions.

## Can I change the price?

Yes, with a new version. Earlier orders keep the price at the time of purchase.

## What if a buyer requests a refund?

The MESH team reviews it and may ask for your explanation. If approved, the amount is deducted from held earnings or later settlements. Details in [Earnings and payouts](/docs/earnings-and-payouts).

## My product was rejected — what now?

Read the reason on the product's status page. If it is "action required", fix the items and resubmit. If it is "rejected", create a new product with substantial changes or ask through the [contact form](/contact?topic=creator).

## How do I promote?

The creator panel has growth tools (tracked share links, time-limited promotions). Unverifiable claims in the listing are not allowed.
`,
    },
  },
];
