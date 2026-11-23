import { PLATFORM_FACTS as F } from '../platform-facts';
import type { DocArticle } from './types';

const UPDATED = '2026-10-13';

export const BUYING: DocArticle[] = [
  {
    slug: 'how-to-buy',
    section: 'buying',
    owner: 'product',
    updatedAt: '2026-10-18',
    title: { fa: 'راهنمای خرید', en: 'How to buy' },
    summary: {
      fa: 'از پیدا کردن محصول تا پرداخت و فعال‌شدن دسترسی در کتابخانه.',
      en: 'From finding a product to paying and getting access in your Library.',
    },
    body: {
      fa: `
## ۱. پیدا کردن محصول

در [کشف Agent ها](/agents) می‌توانید با جست‌وجو، دسته‌بندی، صنعت، نوع محصول، مدل تحویل، قیمت، امتیاز و فیلترهای اعتماد (بازبینی امنیتی، سازندهٔ تأییدشده، سیاست دادهٔ شفاف) محصول مناسب را پیدا کنید. صفحهٔ هر محصول شامل قابلیت‌ها، محدودیت‌ها، نیازمندی‌ها (مثلاً کلید API سرویس ثالث)، مجوزها، سیاست داده، نسخه‌ها و نظرات خریداران است.

> [!tip] پیش از خرید، بخش «نیازمندی‌ها» و «مدل تحویل» را بخوانید؛ این‌ها اظهار سازنده دربارهٔ چیزی است که باید خودتان فراهم کنید و نحوه‌ای که محصول را دریافت می‌کنید.

## ۲. خرید یا تهیهٔ رایگان

- برای خرید باید وارد حساب شده باشید.
- محصول **رایگان**: دکمهٔ «دریافت» دسترسی را بلافاصله در کتابخانه ثبت می‌کند.
- محصول **پولی**: دکمهٔ خرید یک سفارش می‌سازد و شما را به صفحهٔ درگاه پرداخت هدایت می‌کند. مبلغ به ریال است و همان مبلغ صفحهٔ محصول (و در صورت وجود، با اعمال تخفیف فعال) است.
- هر حساب هر محصول را فقط یک‌بار می‌تواند تهیه کند؛ اگر قبلاً آن را دارید، به کتابخانه هدایت می‌شوید.

## ۳. پرداخت

پرداخت در صفحهٔ درگاه انجام می‌شود و MESH اطلاعات کارت شما را نمی‌بیند. پس از بازگشت از درگاه، نتیجه در صفحهٔ «نتیجهٔ پرداخت» نمایش داده می‌شود:

| نتیجه | معنا | قدم بعدی |
|---|---|---|
| موفق | سفارش «پرداخت‌شده»، دسترسی فعال شد | رفتن به کتابخانه |
| لغو شده | شما در درگاه انصراف دادید | می‌توانید دوباره تلاش کنید |
| ناموفق | بانک/درگاه پرداخت را رد کرد | مبلغی کسر نشده؛ دوباره تلاش کنید |

جزئیات بیشتر: [وضعیت پرداخت و سفارش](/docs/payment-status).

## ۴. بعد از خرید

- محصول در [کتابخانه](/library) ظاهر می‌شود. در صفحهٔ محصولِ خریداری‌شده، زبانهٔ **دسترسی و تحویل** اطلاعات و دستورالعمل‌های سازنده را نشان می‌دهد.
- پس از دریافت آنچه وعده داده شده، «تأیید تحویل» را بزنید تا مراحل راه‌اندازی باز شود.
- رسید سفارش در [سفارش‌ها](/orders) موجود است و اگر ایمیل دارید، ایمیل تأیید خرید هم دریافت می‌کنید.
- پرسش دربارهٔ خود محصول را از طریق پشتیبانی داخل حساب برای سازنده بفرستید؛ مشکلات پرداخت را برای MESH.

## ۵. اگر به بازگشت وجه نیاز داشتید

برای سفارش پولی، اگر رابط امکان ثبت درخواست را نشان می‌دهد، از همان سفارش یا کتابخانه درخواست را ثبت کنید. [سیاست بازگشت وجه و لغو](/legal/refunds) در حال حاضر پیش‌نویس عمومی است؛ پیش از نهایی و لازم‌الاجرا شدن آن، بازه، معیار تصمیم و روش بازگشت وجه را به‌عنوان تعهد نهایی تلقی نکنید. راهنمای عملی در [بازگشت وجه](/docs/refunds) است.
`,
      en: `
## 1. Find a product

In [Discover agents](/agents) you can search and filter by category, industry, product type, delivery model, price, rating and trust filters (security reviewed, verified creator, clear data policy). Each product page shows capabilities, limitations, requirements (for example a third-party API key), permissions, data policy, versions and buyer reviews.

> [!tip] Before buying, read "Requirements" and "Delivery model": they are the creator's declaration of what you must provide yourself and how you will receive the product.

## 2. Buy or acquire for free

- You must be signed in to buy.
- **Free** product: the "Get" button records the access in your Library immediately.
- **Paid** product: the buy button creates an order and sends you to the payment gateway page. The amount is in IRR and equals the product page price (with an active promotion applied, if any).
- Each account can acquire a product only once; if you already own it you are taken to the Library.

## 3. Payment

Payment happens on the gateway page; MESH never sees your card details. After returning from the gateway, the outcome is shown on the "Payment result" page:

| Outcome | Meaning | Next step |
|---|---|---|
| Successful | Order "paid", access activated | Go to the Library |
| Cancelled | You abandoned the payment at the gateway | You can try again |
| Failed | The bank/gateway refused the payment | Nothing charged; try again |

More detail: [Payment and order status](/docs/payment-status).

## 4. After the purchase

- The product appears in your [Library](/library). On the purchased product's page, the **Access & delivery** tab shows the creator's information and instructions.
- Once you have received what was promised, press "Confirm delivery" to unlock the setup steps.
- The receipt is available under [Orders](/orders) and, if your account has an e-mail, a purchase confirmation is e-mailed to you.
- Send questions about the product itself to the creator through in-account support; payment problems go to MESH.

## 5. If you need a refund

For a paid order, submit a request from that order or the Library when the interface makes it available. The [Refund & Cancellation Policy](/legal/refunds) is currently a public draft; until it is final and Effective, do not treat its window, decision criteria, or refund method as a final commitment. The practical guide is in [Refunds](/docs/refunds).
`,
    },
  },
  {
    slug: 'payment-status',
    section: 'buying',
    owner: 'operations',
    updatedAt: UPDATED,
    title: { fa: 'وضعیت پرداخت و سفارش', en: 'Payment and order status' },
    summary: {
      fa: 'معنای هر وضعیت سفارش و اینکه چه زمانی دسترسی فعال می‌شود.',
      en: 'What every order state means and when access is activated.',
    },
    body: {
      fa: `
## وضعیت‌های سفارش

| وضعیت | معنا |
|---|---|
| ایجادشده | سفارش ساخته شده، هنوز به درگاه نرفته‌اید |
| در انتظار پرداخت | به درگاه هدایت شده‌اید و نتیجه هنوز نرسیده است |
| پرداخت‌شده | درگاه پرداخت را تأیید کرد؛ دسترسی در کتابخانه فعال است |
| تحویل‌شده | شما دریافت محصول را تأیید کرده‌اید |
| ناموفق | بانک یا درگاه پرداخت را رد کرد |
| لغوشده | شما در درگاه انصراف دادید |
| بازگشت‌داده‌شده | بازگشت وجه انجام و دسترسی برداشته شد |

## چه زمانی دسترسی فعال می‌شود؟

دسترسی **همان لحظه‌ای** فعال می‌شود که درگاه پرداخت را تأیید کند و سرور MESH تأیید را ثبت کند (بازگشت از درگاه یا اعلان مستقیم درگاه به سرور). اگر پس از پرداخت موفق محصول در کتابخانه نیست، صفحهٔ سفارش را تازه‌سازی کنید؛ اگر همچنان نیست، با شمارهٔ سفارش به [پشتیبانی](/contact?topic=purchase) پیام دهید.

## چند نکته

- مبلغ هر سفارش در لحظهٔ ساخت سفارش ثابت می‌شود (قیمت و نام و نسخهٔ محصول در سفارش ذخیره می‌شود).
- پرداخت «در انتظار» که هرگز تکمیل نشود، سفارش را به حالت ناموفق/لغوشده می‌برد و می‌توانید سفارش تازه‌ای بسازید.
- مبلغی که از کارت کسر شده اما سفارش ناموفق مانده، توسط بانک/درگاه بازگردانده می‌شود؛ زمان آن به بانک بستگی دارد. اگر بیش از انتظار طول کشید، با مرجع تراکنش به پشتیبانی پیام دهید.
`,
      en: `
## Order states

| State | Meaning |
|---|---|
| Created | The order exists; you have not reached the gateway yet |
| Pending payment | You were sent to the gateway and no result has arrived |
| Paid | The gateway confirmed the payment; access is active in the Library |
| Fulfilled | You confirmed that you received the product |
| Failed | The bank or gateway refused the payment |
| Cancelled | You abandoned the payment at the gateway |
| Refunded | The refund was processed and access removed |

## When is access activated?

Access is activated **the moment** the gateway confirms the payment and the MESH server records the confirmation (on your return from the gateway or through the gateway's direct server notification). If the product is not in your Library after a successful payment, refresh the order page; if it is still missing, message [support](/contact?topic=purchase) with the order number.

## Notes

- The amount of an order is fixed when the order is created (price, product name and version are stored on the order).
- A "pending" payment that never completes moves the order to failed/cancelled and you can create a new order.
- An amount debited from your card while the order stays failed is reversed by the bank/gateway; the timing depends on the bank. If it takes longer than expected, contact support with the transaction reference.
`,
    },
  },
  {
    slug: 'access-and-delivery',
    section: 'buying',
    owner: 'product',
    updatedAt: '2026-10-18',
    title: { fa: 'دسترسی، تحویل و راه‌اندازی', en: 'Access, delivery and setup' },
    summary: {
      fa: 'کتابخانه، زبانهٔ دسترسی و تحویل، تأیید تحویل، مراحل راه‌اندازی و به‌روزرسانی‌ها.',
      en: 'Library, the Access & delivery tab, delivery confirmation, setup steps and updates.',
    },
    body: {
      fa: `
## کتابخانه

[کتابخانه](/library) همهٔ محصولاتی را که به آن‌ها دسترسی دارید نشان می‌دهد — پولی و رایگان — به‌همراه وضعیت هر کدام (در انتظار دریافت، در حال راه‌اندازی، فعال).

## زبانهٔ «دسترسی و تحویل»

برای هر محصول، سازنده مدل تحویل و دستورالعمل دریافت را اعلام کرده است:

| مدل تحویل/اجرا | معمولاً یعنی |
|---|---|
| اجرای مدیریت‌شده | فقط یک بار مرجع محدود در MESH اجرا می‌شود؛ این مدل به‌معنای میزبانی آزاد یا نامحدود محصول سازنده نیست. |
| اجرای متصل | درخواست به نقطهٔ پایانی‌ای می‌رود که سازنده کنترل می‌کند. |
| تحویل مستقل | MESH مسیر اجرای محصول ندارد؛ ممکن است فایل، راهنما یا اطلاعات دسترسی دریافت کنید. |
| پیشنهاد بیرونی | دسترسی یا خدمت در سامانهٔ دیگری است و MESH مسیر اجرای آن را ندارد. |

> [!warning] پیش از خرید، تعهد تحویل، نیازمندی‌ها، هزینه‌های بیرونی و پشتیبانی همان محصول را بخوانید. بررسی فهرست یا نمایش آن در MESH تضمین عملکرد، دسترس‌پذیری یا تأیید حقوقیِ مسئولیت‌ها نیست.

## تأیید تحویل و راه‌اندازی

پس از دریافت، «تأیید تحویل» را بزنید. سپس مراحل راه‌اندازی (در صورت تعریف توسط سازنده) باز می‌شود و می‌توانید پیشرفت را علامت بزنید. این مراحل راهنما هستند و توسط سازنده نوشته شده‌اند.

## به‌روزرسانی‌ها

وقتی سازنده نسخهٔ جدیدی منتشر کند، یادداشت تغییرات در زبانهٔ «به‌روزرسانی‌ها» و در اعلان‌ها نمایش داده می‌شود. نسخه‌ها و تغییرات جدید را در همان محصول بررسی کنید؛ دسترسی، دامنهٔ خدمات یا مجوزهای نسخهٔ بعدی به‌طور خودکار فراتر از اطلاعات ثبت‌شدهٔ سفارش تغییر نمی‌کند.
`,
      en: `
## Library

The [Library](/library) shows every product you have access to — paid and free — with its state (awaiting delivery, setting up, active).

## The "Access & delivery" tab

For each product the creator has declared a delivery model and the instructions to receive it:

| Delivery / execution model | Usually means |
|---|---|
| Managed Runtime | Only a limited MESH reference workload runs; it is not open-ended hosting of a creator product. |
| Connected Runtime | A request reaches an endpoint controlled by the creator. |
| Independent delivery | MESH has no product-execution path; you may receive a file, guide, or access information. |
| External offer | Access or service is on another system and MESH has no execution path. |

> [!warning] Before buying, read that product’s delivery commitment, requirements, external costs, and support details. Listing review or display on MESH is not a performance, availability, or legal-responsibility guarantee.

## Delivery confirmation and setup

After receiving the product press "Confirm delivery". The setup steps (if the creator defined any) then unlock and you can tick off your progress. These steps are guidance written by the creator.

## Updates

When the creator publishes a new version, the release notes appear in the "Updates" tab and in your notifications. Review later versions and changes on that product; a later version does not automatically expand access, service scope, or licence rights beyond the recorded order information.
`,
    },
  },
  {
    slug: 'refunds',
    section: 'buying',
    owner: 'operations',
    updatedAt: '2026-10-18',
    title: { fa: 'بازگشت وجه', en: 'Refunds' },
    summary: {
      fa: `خلاصهٔ عملی: بازهٔ ${F.refundWindowDays} روزه، نحوهٔ درخواست و مسیر بررسی.`,
      en: `Practical summary: the ${F.refundWindowDays}-day window, how to request and the review path.`,
    },
    body: {
      fa: `
این صفحه راهنمای عملیِ رفتار فعلی رابط است؛ [سیاست بازگشت وجه و لغو](/legal/refunds) یک پیش‌نویس عمومی است و هنوز متن نهایی یا لازم‌الاجرا نیست.

## در یک نگاه

- فقط سفارش‌های پولی می‌توانند در رابط فرایند درخواست بازگشت وجه داشته باشند؛ محصول رایگان سفارش پرداختی ندارد.
- برای هر سفارش هم‌زمان فقط یک درخواست باز می‌تواند وجود داشته باشد.
- مسیر عملی فعلی «ثبت‌شده ← در حال بررسی ← تأیید/رد ← انجام‌شده» است.
- بازه، معیار تصمیم، مبلغ/روش بازگشت و هر اثر حقوقی نیازمند متن تأییدشده و لازم‌الاجرا است؛ آن‌ها را از این راهنما استنباط نکنید.

## مراحل

1. [کتابخانه](/library) → محصول → «درخواست بازگشت وجه» (یا از [سفارش‌ها](/orders) → جزئیات سفارش)، اگر گزینه در دسترس است.
2. دلیل را بنویسید (۵ تا ${F.refundReasonMax} نویسه). دقیق بنویسید چه چیزی مطابق وعده نبود.
3. وضعیت درخواست را در همان صفحه دنبال کنید. در صورت تأیید، نتیجهٔ ثبت‌شده در سفارش و وضعیت دسترسی نمایش داده می‌شود؛ روش و زمان رسیدن وجه نباید از این راهنما تضمین‌شده تلقی شود.

> [!note] MESH زمان مشخصی برای اعلام نتیجه یا رسیدن وجه تعهد نمی‌کند.

## چرا دکمه غیرفعال است؟

| پیام | دلیل |
|---|---|
| محصول رایگان | سفارش پولی وجود ندارد |
| پرداخت‌نشده | سفارش هنوز پرداخت نشده است |
| قبلاً بازگشت داده شده | نتیجهٔ بازگشت پیش‌تر ثبت شده است |
| درخواست باز | درخواستی در حال بررسی است |
| پایان بازه | دورهٔ درخواستِ پیکربندی‌شده برای سفارش به پایان رسیده است |
`,
      en: `
This page is a practical guide to current interface behaviour; the [Refund & Cancellation Policy](/legal/refunds) is a public draft and is not yet final or Effective.

## At a glance

- Only paid orders can have a refund-request flow in the interface; a free product has no paid order.
- Only one open request per order can exist at once.
- The current operational path is "submitted → under review → approved/rejected → completed".
- The window, decision criteria, amount/method of refund, and any legal effect need approved, Effective text; do not infer them from this guide.

## Steps

1. [Library](/library) → product → "Request a refund" (or [Orders](/orders) → order detail), when the option is available.
2. Describe the reason (5 to ${F.refundReasonMax} characters). Be precise about what did not match the promise.
3. Follow the request status on the same page. If approved, the recorded result and access status appear on the order; this guide does not guarantee the method or time at which funds arrive.

> [!note] MESH does not commit to a decision time or a time at which funds arrive.

## Why is the button disabled?

| Message | Reason |
|---|---|
| Free product | There is no paid order |
| Not paid | The order has not been paid |
| Already refunded | A refund outcome was already recorded |
| Open request | A request is under review |
| Window expired | The configured request period for the order has ended |
`,
    },
  },
  {
    slug: 'payment-problems',
    section: 'buying',
    owner: 'operations',
    updatedAt: UPDATED,
    title: { fa: 'مشکلات رایج پرداخت', en: 'Common payment problems' },
    summary: {
      fa: 'پول کسر شد اما سفارش ناموفق است؟ محصول در کتابخانه نیست؟ از اینجا شروع کنید.',
      en: 'Money debited but the order failed? Product missing from the Library? Start here.',
    },
    body: {
      fa: `
## پرداخت کردم اما محصول در کتابخانه نیست

1. صفحهٔ [سفارش‌ها](/orders) را باز کنید و وضعیت سفارش را ببینید.
2. اگر «پرداخت‌شده» است، [کتابخانه](/library) را تازه‌سازی کنید.
3. اگر «در انتظار پرداخت» مانده، چند دقیقه صبر کنید؛ اعلان درگاه ممکن است با تأخیر برسد.
4. همچنان مشکل دارید؟ از [فرم تماس (موضوع: خرید و پرداخت)](/contact?topic=purchase) با ذکر شمارهٔ سفارش و مرجع تراکنش پیام دهید.

## مبلغ کسر شد اما سفارش «ناموفق» است

درگاه یا بانک مبلغ تراکنش‌های ناموفق را بازمی‌گرداند. این فرایند خارج از MESH است و زمانش به بانک بستگی دارد. اگر طولانی شد، با مرجع تراکنش به پشتیبانی پیام دهید تا وضعیت را با درگاه پیگیری کنیم.

## در صفحهٔ درگاه خطا دیدم

- دوباره تلاش کنید؛ هر تلاش یک سفارش تازه می‌سازد و سفارش قبلی ناموفق/لغوشده ثبت می‌شود.
- اگر درگاه در دسترس نیست، پیام «درگاه پرداخت در دسترس نیست» نمایش داده می‌شود؛ کمی بعد دوباره تلاش کنید.

## خطای «قبلاً خریداری شده»

این محصول را از قبل دارید؛ به کتابخانه بروید.

## ایمیل رسید نرسیده

رسید فقط به حساب‌هایی ارسال می‌شود که ایمیل تأییدشده دارند. رسید همیشه در جزئیات سفارش در دسترس است.
`,
      en: `
## I paid but the product is not in my Library

1. Open [Orders](/orders) and check the order state.
2. If it is "paid", refresh the [Library](/library).
3. If it is still "pending payment", wait a few minutes; the gateway notification can arrive late.
4. Still stuck? Use the [contact form (topic: Purchases & payments)](/contact?topic=purchase) with the order number and the transaction reference.

## Money was debited but the order says "failed"

The gateway or bank reverses the amount of failed transactions. This happens outside MESH and the timing depends on the bank. If it takes long, contact support with the transaction reference so we can follow up with the gateway.

## I saw an error on the gateway page

- Try again; each attempt creates a new order and the previous one is recorded as failed/cancelled.
- If the gateway is unavailable, the message "Payment provider unavailable" is shown; try again a little later.

## "Already purchased" error

You already own this product; go to the Library.

## No receipt e-mail

Receipts are e-mailed only to accounts with a verified e-mail address. The receipt is always available in the order details.
`,
    },
  },
  {
    slug: 'reporting-a-problem',
    section: 'buying',
    owner: 'operations',
    updatedAt: '2026-10-18',
    title: { fa: 'گزارش محصول یا محتوای مشکل‌دار', en: 'Reporting a problem with a product' },
    summary: {
      fa: 'چه چیزی قابل گزارش است، چگونه گزارش می‌دهید و بعد از آن چه اتفاقی می‌افتد.',
      en: 'What you can report, how to report it and what happens afterwards.',
    },
    body: {
      fa: `
## چه چیزی قابل گزارش است

روی صفحهٔ هر محصول، گزینهٔ گزارش برای حساب‌های واردشده در دسترس است. دلیل گزارش یکی از این موارد است:

| دلیل | یعنی چه |
|---|---|
| ادعای گمراه‌کننده | توضیحات محصول با آنچه واقعاً تحویل می‌شود هم‌خوانی ندارد. |
| نگرانی امنیتی | محصول دسترسی یا رفتاری دارد که ایمن به نظر نمی‌رسد. |
| محتوای نامناسب | متن، تصویر یا کاربرد محصول نامناسب است. |
| نقض کپی‌رایت | محصول یا دارایی‌های آن متعلق به شخص دیگری است. |
| هرزنامه یا ایجنت جعلی | فهرست واقعی نیست یا برای فریب ساخته شده است. |
| مورد دیگر | موردی که در دسته‌های بالا نمی‌گنجد. |

می‌توانید توضیح و شواهد (مثلاً نشانی یا شمارهٔ سفارش) هم اضافه کنید.

> [!note] گزارش با درخواست بازگشت وجه فرق دارد. گزارش دربارهٔ خودِ فهرست است؛ برای پس‌گرفتن پول، [سیاست بازگشت وجه](/legal/refunds) و [راهنمای بازگشت وجه](/docs/refunds) را ببینید.

## بعد از ثبت گزارش چه می‌شود

گزارش شما در صف بررسی تیم MESH ثبت می‌شود و وضعیت آن یکی از این چهار حالت است: **ثبت‌شده**، **در حال بررسی**، **حل‌شده** یا **ردشده**.

وضعیت گزارش‌های خودتان را در [اعلان‌ها ← گزارش‌ها](/me/notifications/reports) می‌بینید.

> [!warning] MESH زمان مشخصی برای رسیدگی به گزارش‌ها تعهد نمی‌کند و ثبت گزارش به‌تنهایی به معنای حذف محصول، بازگشت وجه یا تأیید ادعای شما نیست.

## گزارش یک نظر

نظرات هم جداگانه قابل گزارش‌اند؛ گزینهٔ گزارش روی خود نظر قرار دارد و همان مسیر بررسی را دارد.

## مواردی که از راه دیگری پیگیری می‌شوند

- **مشکل پرداخت یا سفارش** → [فرم تماس (موضوع: خرید و پرداخت)](/contact?topic=purchase)
- **نگرانی دربارهٔ دادهٔ شخصی** → [فرم تماس (موضوع: حریم خصوصی)](/contact?topic=privacy)
- **ایراد فنی سایت** → [فرم تماس (موضوع: گزارش اشکال)](/contact?topic=bug)
`,
      en: `
## What you can report

A report option is available on every product page for signed-in accounts. The reason is one of:

| Reason | What it means |
|---|---|
| Misleading claims | The description does not match what is actually delivered. |
| Security concern | The product requests access or behaves in a way that does not look safe. |
| Inappropriate content | The text, imagery or use case is inappropriate. |
| Copyright violation | The product or its assets belong to someone else. |
| Spam or fake agent | The listing is not genuine or exists to deceive. |
| Other | Something the categories above do not cover. |

You can add a description and evidence (an address or an order number, for example).

> [!note] A report is not a refund request. A report is about the listing itself; to get money back see the [refund policy](/legal/refunds) and the [refund guide](/docs/refunds).

## What happens next

Your report enters the MESH review queue and carries one of four states: **submitted**, **under review**, **resolved** or **rejected**.

You can follow your own reports in [Notifications → Reports](/me/notifications/reports).

> [!warning] MESH does not commit to a handling time for reports, and filing one does not by itself mean a product will be removed, a refund will be issued, or your claim has been accepted.

## Reporting a review

Reviews can be reported separately; the option sits on the review itself and follows the same review path.

## Things handled through another route

- **A payment or order problem** → [contact form (topic: Purchases & payments)](/contact?topic=purchase)
- **A personal-data concern** → [contact form (topic: Privacy)](/contact?topic=privacy)
- **A technical fault on the site** → [contact form (topic: Bug report)](/contact?topic=bug)
`,
    },
  },
];
