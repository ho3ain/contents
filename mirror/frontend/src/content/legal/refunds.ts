import { PLATFORM_FACTS as F } from '../platform-facts';

/**
 * Refund & Cancellation Policy — mirrors exactly what RefundsService and the
 * versioned REFUND finance policy enforce (window, states, exclusions).
 * DRAFT pending legal review; decision gaps are flagged inline.
 */
export const REFUNDS_FA = `
> [!warning] این متن پیش‌نویس محصولی است که قواعد فعلی سیستم را توصیف می‌کند و باید پیش از انتشار نهایی توسط مشاور حقوقی بازبینی شود. مقادیر زمانی، سیاست‌های نسخه‌دار پلتفرم‌اند و در صورت تغییر، نسخهٔ این سند به‌روز می‌شود.

## ۱. دامنه

این سیاست برای سفارش‌های **پولی** (به ریال) در MESH است. محصولات رایگان سفارش پولی ندارند و مشمول بازگشت وجه نیستند. این سند بخشی از [شرایط استفاده](/legal/terms) است.

## ۲. بازهٔ درخواست بازگشت وجه

در حال حاضر می‌توانید تا **${F.refundWindowDays} روز پس از زمان پرداخت** برای یک سفارش درخواست بازگشت وجه ثبت کنید. پس از پایان این بازه، دکمهٔ درخواست در کتابخانه غیرفعال می‌شود و سیستم درخواست را نمی‌پذیرد. زمان پایان بازه در صفحهٔ محصول خریداری‌شده نمایش داده می‌شود.

## ۳. چه زمانی درخواست پذیرفته نمی‌شود

سیستم در این حالت‌ها درخواست را ثبت نمی‌کند:

| وضعیت | معنا |
|---|---|
| محصول رایگان | سفارش پولی وجود ندارد |
| پرداخت‌نشده | سفارش در وضعیت پرداخت‌شده/تحویل‌شده نیست |
| قبلاً بازگشت داده شده | وجه این سفارش پیش‌تر بازگردانده شده است |
| درخواست باز | یک درخواست برای همین سفارش در حال بررسی است |
| پایان بازه | بیش از ${F.refundWindowDays} روز از پرداخت گذشته است |

## ۴. نحوهٔ ثبت درخواست

1. وارد حساب شوید و به **کتابخانه** بروید.
2. محصول موردنظر را باز کنید و «درخواست بازگشت وجه» را بزنید (یا از صفحهٔ جزئیات سفارش).
3. دلیل خود را بنویسید (دست‌کم ۵ و حداکثر ${F.refundReasonMax} نویسه). توضیح دقیق مشکل — مثلاً دریافت‌نکردن دسترسی وعده‌داده‌شده یا تفاوت اساسی با مشخصات اعلام‌شده — بررسی را سریع‌تر می‌کند.
4. درخواست با وضعیت «ثبت‌شده» ایجاد می‌شود و می‌توانید پیشرفت آن را در همان صفحه دنبال کنید.

## ۵. بررسی و تصمیم

درخواست‌ها توسط تیم عملیات MESH بررسی می‌شوند و مسیر زیر را طی می‌کنند:

**ثبت‌شده ← در حال بررسی ← تأیید / رد ← انجام‌شده**

- در بررسی، اظهارات شما، مشخصات اعلام‌شدهٔ محصول، وضعیت تحویل و در صورت نیاز توضیح سازنده در نظر گرفته می‌شود.
- در صورت **تأیید**، دستور بازگشت وجه صادر و پس از انجام، سفارش به وضعیت «بازگشت‌داده‌شده» می‌رود و دسترسی محصول از کتابخانهٔ شما برداشته می‌شود.
- در صورت **رد**، نتیجه در صفحهٔ درخواست نمایش داده می‌شود. اگر اطلاعات جدیدی دارید، می‌توانید از طریق پشتیبانی داخل حساب پیگیری کنید.

> [!warning] نیازمند تصمیم: معیارهای مکتوب پذیرش/رد (مثلاً نقش تأیید تحویل توسط خریدار) و بازهٔ زمانی تعهدآور برای اعلام نتیجه هنوز تعیین نشده‌اند. MESH زمان مشخصی برای پاسخ تعهد نمی‌کند.

## ۶. نحوه و زمان بازگشت مبلغ

مبلغ به همان روش پرداخت (از طریق درگاه پرداخت) بازگردانده می‌شود. زمان نشستن مبلغ به حساب شما به درگاه و بانک صادرکننده بستگی دارد و خارج از کنترل MESH است. رویداد بازگشت وجه در صورت داشتن ایمیل برایتان ایمیل می‌شود و در «سفارش‌ها» قابل مشاهده است.

## ۷. لغو سفارش

- اگر پرداخت را در صفحهٔ درگاه لغو کنید یا پرداخت ناموفق باشد، سفارش به وضعیت «لغوشده» یا «ناموفق» می‌رود؛ مبلغی کسر نمی‌شود و اگر مبلغی موقتاً بلوکه شده باشد، بانک/درگاه آن را آزاد می‌کند.
- سفارش «پرداخت‌شده» قابل لغو نیست؛ در این حالت از سازوکار بازگشت وجه (بخش ۴) استفاده کنید.
- MESH اشتراک دوره‌ای ندارد؛ هر خرید یک‌باره است و نیازی به لغو تمدید نیست.

## ۸. اثر بازگشت وجه برای سازندگان

درآمد هر فروش به مدت ${F.holdingDays} روز در نگهداشت می‌ماند تا بازهٔ بازگشت وجه سپری شود. اگر بازگشت وجهی تأیید شود، مبلغ متناظر از درآمد سازنده (و در صورت تسویه‌شدن، از تسویه‌های بعدی) کسر می‌شود. سازنده جزئیات را در صورت‌حساب مالی خود می‌بیند.

## ۹. سوءاستفاده

درخواست‌های مکرر یا غیرواقعی بازگشت وجه ممکن است منجر به رد درخواست و محدودیت حساب شود.

## ۱۰. تغییرات

نسخه و تاریخ اجرای این سند بالای صفحه نمایش داده می‌شود. تغییر بازهٔ بازگشت وجه فقط برای سفارش‌های پس از تاریخ اجرا اعمال می‌شود.

## ۱۱. تماس

برای پرسش دربارهٔ بازگشت وجه از [فرم تماس با موضوع «خرید و پرداخت»](/contact?topic=purchase) یا پشتیبانی داخل حساب استفاده کنید.
`;

export const REFUNDS_EN = `
> [!warning] This is a product-specific draft describing the rules the system currently enforces. It must be reviewed by legal counsel before final publication. Time values are versioned platform policies; when they change, this document's version is updated.

## 1. Scope

This policy applies to **paid** orders (in IRR) on MESH. Free products have no paid order and are not subject to refunds. This document is part of the [Terms of Service](/legal/terms).

## 2. Refund request window

You can currently request a refund for an order up to **${F.refundWindowDays} days after the payment time**. After that the request button in your Library is disabled and the system refuses the request. The end of the window is shown on the purchased product's page.

## 3. When a request is not accepted

The system does not record a request in these cases:

| State | Meaning |
|---|---|
| Free product | There is no paid order |
| Not paid | The order is not in the paid/fulfilled state |
| Already refunded | The order was refunded before |
| Open request | A request for the same order is already under review |
| Window expired | More than ${F.refundWindowDays} days have passed since payment |

## 4. How to request a refund

1. Sign in and open your **Library**.
2. Open the product and choose "Request a refund" (also available from the order detail page).
3. Describe the reason (at least 5 and at most ${F.refundReasonMax} characters). A precise description — for example not receiving the promised access, or a material difference from the declared specification — speeds up the review.
4. The request is created with the status "submitted" and you can follow its progress on the same page.

## 5. Review and decision

Requests are reviewed by the MESH operations team and follow this path:

**Submitted → Under review → Approved / Rejected → Completed**

- The review considers your statement, the product's declared specification, the delivery state and, where needed, the creator's explanation.
- If **approved**, the refund is instructed; once processed the order becomes "refunded" and the product's access is removed from your Library.
- If **rejected**, the outcome is shown on the request page. If you have new information you can follow up through support inside your account.

> [!warning] Decision required: written acceptance/rejection criteria (for example the role of the buyer's delivery confirmation) and a binding time frame for the decision have not been defined. MESH does not commit to a response time.

## 6. How and when the money comes back

The amount is returned by the same payment method (through the payment gateway). When it appears on your account depends on the gateway and the issuing bank and is outside MESH's control. The refund event is e-mailed to you if your account has an e-mail address and is visible under "Orders".

## 7. Cancelling an order

- If you cancel the payment on the gateway page or the payment fails, the order becomes "cancelled" or "failed"; nothing is charged, and any temporary hold is released by the bank/gateway.
- A "paid" order cannot be cancelled; use the refund mechanism (section 4) instead.
- MESH has no recurring subscriptions; every purchase is one-time and there is no renewal to cancel.

## 8. Effect of refunds on creators

The earnings of each sale are held for ${F.holdingDays} days so that the refund window can pass. When a refund is approved, the corresponding amount is deducted from the creator's earnings (or from later settlements if already paid out). Creators see the details in their financial statement.

## 9. Abuse

Repeated or unfounded refund requests may lead to rejection and account restrictions.

## 10. Changes

The version and effective date of this document are shown at the top of the page. A change of the refund window applies only to orders placed after the effective date.

## 11. Contact

For questions about refunds use the [contact form with the topic "Purchases & payments"](/contact?topic=purchase) or support inside your account.
`;
