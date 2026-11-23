import { PLATFORM_FACTS as F } from '../platform-facts';

/**
 * Terms of Service — product-specific draft reflecting the behaviour the
 * platform actually enforces (see platform-facts.ts for every number).
 * Status: DRAFT — requires review by qualified legal counsel before it can be
 * presented as a binding agreement. Open items are marked with [!warning].
 */
export const TERMS_FA = `
> [!warning] این متن پیش‌نویس محصولی است و پیش از آنکه به‌عنوان توافق‌نامهٔ الزام‌آور ارائه شود، باید توسط مشاور حقوقی واجد شرایط بازبینی و تأیید شود. مواردی که هنوز تصمیم کسب‌وکاری یا حقوقی ندارند، در همین صفحه با برچسب «نیازمند تصمیم» مشخص شده‌اند.

## ۱. دربارهٔ این شرایط

MESH یک بازار آنلاین (Marketplace) برای عرضه و خرید محصولات هوش مصنوعی و اتوماسیون — مانند Agent، گردش‌کار (Workflow)، قالب و سرویس راه‌اندازی — است. این شرایط استفاده رابطهٔ میان شما و MESH را هنگام بازدید از وب‌سایت، ساخت حساب، خرید یا انتشار محصول تنظیم می‌کند.

با ساختن حساب کاربری، تیک «شرایط استفاده و سیاست حریم خصوصی را می‌پذیرم» را می‌زنید. این پذیرش به‌همراه نسخهٔ سندی که در آن لحظه منتشر بوده و زمان دقیق آن، در حساب شما ثبت می‌شود. [سیاست حریم خصوصی](/legal/privacy) و [سیاست بازگشت وجه و لغو](/legal/refunds) بخش جدایی‌ناپذیر این شرایط هستند.

> [!warning] نیازمند تصمیم: مشخصات حقوقی اپراتور پلتفرم (نام شخص حقوقی، شمارهٔ ثبت و نشانی) پس از بازبینی حقوقی در این بخش درج می‌شود. تا آن زمان، «MESH» در این سند به اپراتور پلتفرم اشاره دارد.

## ۲. تعاریف

- **پلتفرم**: وب‌سایت و رابط برنامه‌نویسی MESH.
- **خریدار**: کاربری که محصولی را از پلتفرم تهیه می‌کند (رایگان یا پولی).
- **سازنده**: کاربری که پروفایل سازندگی‌اش تأیید شده و محصول منتشر می‌کند.
- **محصول**: هر Agent، گردش‌کار، قالب، سرویس API یا سرویس راه‌اندازی که سازنده در پلتفرم فهرست می‌کند.
- **سفارش**: رکورد خرید یک محصول، با وضعیت‌های «ایجادشده»، «در انتظار پرداخت»، «پرداخت‌شده»، «تحویل‌شده»، «ناموفق»، «لغوشده» و «بازگشت‌داده‌شده».
- **دسترسی (Entitlement)**: حق استفاده از یک محصول که پس از پرداخت موفق (یا تهیهٔ محصول رایگان) در کتابخانهٔ حساب شما ثبت می‌شود.

## ۳. حساب کاربری

- ثبت‌نام با **شمارهٔ تلفن همراه** و رمز عبور انجام می‌شود؛ ایمیل اختیاری است اما برای دریافت رسید، هشدارهای امنیتی و بازیابی رمز عبور لازم است.
- شما مسئول صحت اطلاعات حساب و محرمانه نگه‌داشتن رمز عبور خود هستید. رمز عبور باید دست‌کم ${F.passwordMinLength} نویسه باشد. می‌توانید ورود دومرحله‌ای (TOTP) را فعال کنید و نشست‌های فعال خود را در تنظیمات ببینید و ببندید.
- هر شخص باید فقط یک حساب داشته باشد و حساب قابل انتقال به دیگری نیست.
- حساب‌های تازه با نقش «خریدار» ساخته می‌شوند. برای سازندگی باید فرایند «شروع کسب درآمد» را طی کنید (بخش ۶).

> [!warning] نیازمند تصمیم: حداقل سن قانونی برای ساخت حساب و نحوهٔ احراز آن هنوز تعیین نشده است. تا تعیین آن، تنها افرادی که به‌موجب قانون حاکم صلاحیت انعقاد قرارداد دارند مجاز به ساخت حساب‌اند.

## ۴. ماهیت پلتفرم و نقش MESH

MESH **واسطه** است. محصولات توسط سازندگان ساخته، نگهداری، میزبانی، اجرا و پشتیبانی می‌شوند. MESH هیچ محصولی را اجرا یا میزبانی نمی‌کند و خودش هیچ فایلی تحویل نمی‌دهد؛ آنچه پس از خرید در «دسترسی و تحویل» می‌بینید، اطلاعات و دستورالعمل‌هایی است که سازنده اعلام کرده و تحویل واقعی خارج از MESH انجام می‌شود.

مشخصات هر محصول (قابلیت‌ها، محدودیت‌ها، نیازمندی‌ها، مدل تحویل، مدل اجرا، سیاست داده) **اظهار سازنده** است. فرایند بازبینی MESH کامل‌بودن و سازگاری فهرست با قواعد پلتفرم را بررسی می‌کند و تضمینی دربارهٔ تناسب محصول با نیاز خاص شما نیست.

## ۵. خرید، پرداخت و دسترسی

- قیمت‌ها به **ریال (IRR)** اعلام می‌شوند. پرداخت از طریق درگاه پرداخت متصل به پلتفرم انجام می‌شود و MESH اطلاعات کارت بانکی شما را دریافت یا ذخیره نمی‌کند.
- پس از تأیید پرداخت توسط درگاه، سفارش به وضعیت «پرداخت‌شده» می‌رود و دسترسی محصول بی‌درنگ در **کتابخانه** حساب شما فعال می‌شود. برای محصولات رایگان، دسترسی بدون سفارش پولی ثبت می‌شود.
- هر حساب برای هر محصول تنها یک دسترسی دارد؛ خرید تکراری همان محصول پذیرفته نمی‌شود.
- اگر پرداخت ناموفق یا در درگاه لغو شود، سفارش «ناموفق» یا «لغوشده» ثبت می‌شود و مبلغی از شما کسر نشده یا توسط بانک/درگاه بازگردانده می‌شود؛ می‌توانید دوباره تلاش کنید.
- رسید هر سفارش در بخش «سفارش‌ها» و «رسیدها» در دسترس است و در صورت داشتن ایمیل، ایمیل تأیید خرید نیز برایتان ارسال می‌شود.
- دسترسی برای استفادهٔ خودتان است؛ بازفروش، اشتراک‌گذاری یا انتشار محتوای محصول خارج از مجوزی که سازنده اعلام کرده مجاز نیست.
- بازگشت وجه تابع [سیاست بازگشت وجه و لغو](/legal/refunds) است؛ در حال حاضر درخواست بازگشت وجه تا **${F.refundWindowDays} روز** پس از پرداخت امکان‌پذیر است.

## ۶. شرایط ویژهٔ سازندگان

- برای انتشار محصول باید پروفایل سازندگی شما **تأیید** شده باشد. پیش از تأیید می‌توانید پیش‌نویس بسازید، اما ارسال برای بازبینی و انتشار امکان‌پذیر نیست.
- شما تضمین می‌کنید که مالک محصول هستید یا حق عرضهٔ آن را دارید، و اطلاعات فهرست (از جمله قابلیت‌ها، محدودیت‌ها، مجوزها، نیازمندی‌ها و سیاست داده) دقیق و به‌روز است. تغییرات مهم باید در قالب **نسخهٔ جدید** همراه با یادداشت تغییرات منتشر شود.
- هر محصول پیش از انتشار و پس از هر نسخهٔ جدید از **بازبینی** MESH می‌گذرد. MESH می‌تواند انتشار را رد کند، اصلاح بخواهد یا محصولی را که با این شرایط ناسازگار است از انتشار خارج کند.
- پشتیبانی فنی محصول بر عهدهٔ شماست. پرسش‌های خریداران دربارهٔ محصول از طریق سیستم پشتیبانی به شما ارجاع می‌شود.
- با انتشار محصول، به MESH مجوز غیرانحصاری می‌دهید که نام، توضیحات، تصاویر و اطلاعات فهرست را برای نمایش، جست‌وجو و معرفی محصول در پلتفرم و کانال‌های آن استفاده کند. مالکیت محصول نزد شما باقی می‌ماند.
- **کارمزد**: در حال حاضر MESH از هر فروش موفق **${F.commissionPercent} درصد** کارمزد برمی‌دارد و **${F.creatorSharePercent} درصد** به سازنده تعلق می‌گیرد؛ کارمزد درگاه پرداخت توسط MESH پرداخت می‌شود. نرخ کارمزد یک سیاست نسخه‌دار است و هرگز به‌صورت عطف‌به‌ماسبق تغییر نمی‌کند.
- **نگهداشت و تسویه**: درآمد هر فروش به مدت **${F.holdingDays} روز** در وضعیت «نگهداشت» می‌ماند (هم‌راستا با بازهٔ بازگشت وجه) و سپس قابل برداشت می‌شود. برای برداشت باید احراز هویت (KYC) شما تأیید و حساب بانکی‌تان ثبت و تأیید شده باشد. درخواست برداشت حداکثر هر **${F.payoutCooldownDays} روز** یک‌بار امکان‌پذیر است و تسویه‌ها پس از تأیید اپراتور به‌صورت انتقال بانکی انجام می‌شود. در صورت بازگشت وجه یک فروش، مبلغ متناظر از درآمد شما کسر می‌شود.

> [!warning] نیازمند تصمیم: مسئولیت مالیاتی سازندگان، حداقل مبلغ برداشت و زمان‌بندی تعهدآور تسویه هنوز تعیین نشده‌اند. تا تعیین آن‌ها، سازنده مسئول تکالیف مالیاتی خود است و MESH زمان مشخصی برای واریز تعهد نمی‌کند.

## ۷. نظرات، گزارش‌ها و رفتار کاربران

- فقط خریدارانی که دسترسی محصول را دارند می‌توانند نظر ثبت کنند. نظرات باید تجربهٔ واقعی شما باشد؛ MESH می‌تواند نظرات جعلی یا توهین‌آمیز را حذف یا پنهان کند.
- می‌توانید محصول، نظر یا رفتار نامناسب را گزارش کنید؛ گزارش‌ها توسط تیم MESH بررسی می‌شوند.
- استفاده از پلتفرم برای فعالیت غیرقانونی، نقض حقوق دیگران، انتشار بدافزار، دور زدن سازوکارهای امنیتی یا پرداخت، و ایجاد حساب‌های متعدد برای سوءاستفاده ممنوع است.

## ۸. مالکیت فکری

نام و نشان MESH، طراحی، نرم‌افزار و محتوای پلتفرم متعلق به MESH است. محتوای محصولات متعلق به سازندگان آن‌هاست. استفاده از هر یک خارج از آنچه این شرایط یا مجوز سازنده اجازه می‌دهد ممنوع است.

## ۹. استفادهٔ فنی و رابط برنامه‌نویسی

MESH در حال حاضر رابط برنامه‌نویسی عمومی پشتیبانی‌شده‌ای عرضه نمی‌کند؛ نقاط دسترسی عمومی کاتالوگ برای وب‌سایت طراحی شده‌اند و ممکن است بدون اطلاع قبلی تغییر کنند. درخواست‌ها به‌صورت پیش‌فرض به **${F.apiRateLimitPerMinute} درخواست در دقیقه** برای هر نشانی IP محدود می‌شوند. استخراج انبوه داده، دور زدن محدودیت‌ها یا ایجاد بار غیرمتعارف مجاز نیست. جزئیات در [مرکز مستندات](/docs/developer-api-overview) آمده است.

## ۱۰. تعلیق و خاتمه

- MESH می‌تواند در صورت نقض این شرایط، تقلب در پرداخت، سوءاستفاده از سیستم یا الزام قانونی، حساب شما را تعلیق یا محصولی را از انتشار خارج کند. حساب تعلیق‌شده نمی‌تواند وارد شود.
- شما می‌توانید هر زمان استفاده از پلتفرم را متوقف کنید. حذف کامل حساب در حال حاضر از طریق [فرم تماس](/contact?topic=privacy) درخواست می‌شود (بخش ۷ سیاست حریم خصوصی).

> [!warning] نیازمند تصمیم: سرنوشت دسترسی‌های خریداری‌شده و درآمدهای تسویه‌نشده پس از تعلیق یا حذف حساب هنوز به‌صورت سیاست مکتوب تعیین نشده است.

## ۱۱. سلب مسئولیت و محدودیت مسئولیت

پلتفرم «همان‌گونه که هست» ارائه می‌شود. MESH در حد مجاز قانون، مسئولیتی در قبال عملکرد، در دسترس‌بودن یا نتایج استفاده از محصولات سازندگان ندارد و کیفیت، امنیت یا تناسب آن‌ها را تضمین نمی‌کند. مسئولیت MESH در هر حال به مبلغی که برای سفارش مربوطه پرداخت کرده‌اید محدود است.

> [!warning] نیازمند بازبینی حقوقی: دامنهٔ سلب مسئولیت و محدودیت مسئولیت باید با قانون حاکم تطبیق داده شود.

## ۱۲. ارتباطات

MESH برای رویدادهای تراکنشی (تأیید خرید، بازگشت وجه، نتیجهٔ بازبینی، هشدارهای امنیتی) اعلان درون‌برنامه‌ای و در صورت داشتن ایمیل، ایمیل ارسال می‌کند. اعلان‌های غیرضروری را می‌توانید در تنظیمات مدیریت کنید؛ هشدارهای امنیتی قابل غیرفعال‌سازی نیستند.

## ۱۳. تغییر شرایط

هر نسخهٔ این سند شناسهٔ تاریخ‌دار و تاریخ اجرا دارد که بالای صفحه نمایش داده می‌شود. تغییرات مهم پیش از اجرا در همین صفحه منتشر می‌شود. نسخه‌ای که هنگام ثبت‌نام پذیرفته‌اید در حساب شما ثبت می‌ماند و ادامهٔ استفاده پس از تاریخ اجرای نسخهٔ جدید به معنای پذیرش آن است.

## ۱۴. قانون حاکم و حل اختلاف

> [!warning] نیازمند تصمیم: قانون حاکم، مرجع صالح و سازوکار حل اختلاف پس از بازبینی حقوقی تعیین می‌شود.

## ۱۵. تماس با ما

پرسش دربارهٔ این شرایط را از طریق [فرم تماس](/contact?topic=general) بفرستید. پیام شما در صف بررسی تیم MESH ثبت می‌شود.
`;

export const TERMS_EN = `
> [!warning] This is a product-specific draft. It must be reviewed and approved by qualified legal counsel before it is presented as a binding agreement. Items that still lack a business or legal decision are marked "decision required" on this page.

## 1. About these terms

MESH is an online marketplace for AI and automation products — agents, workflows, templates and setup services. These Terms of Service govern the relationship between you and MESH when you visit the website, create an account, buy a product or publish one.

When you create an account you tick "I accept the Terms of Service and the Privacy Policy". That acceptance is recorded on your account together with the version of the document published at that moment and the exact time. The [Privacy Policy](/legal/privacy) and the [Refund & Cancellation Policy](/legal/refunds) form part of these terms.

> [!warning] Decision required: the legal identity of the platform operator (entity name, registration number, address) will be inserted here after legal review. Until then "MESH" in this document refers to the platform operator.

## 2. Definitions

- **Platform**: the MESH website and its programming interface.
- **Buyer**: a user who acquires a product (free or paid).
- **Creator**: a user whose creator profile has been approved and who publishes products.
- **Product**: any agent, workflow, template, API service or setup service a creator lists on the platform.
- **Order**: the record of a purchase, with the states created, pending payment, paid, fulfilled, failed, cancelled and refunded.
- **Entitlement (access)**: the right to use a product, recorded in your account's library after a successful payment (or after acquiring a free product).

## 3. Your account

- Registration uses a **mobile phone number** and a password; an e-mail address is optional but required for receipts, security alerts and password recovery.
- You are responsible for the accuracy of your account details and for keeping your password confidential. Passwords must be at least ${F.passwordMinLength} characters. You can enable two-step sign-in (TOTP) and review or end your active sessions in Settings.
- One account per person; accounts are not transferable.
- New accounts start with the Buyer role. To publish products you must complete the "Start earning" flow (section 6).

> [!warning] Decision required: the minimum age for an account and how it is verified have not been defined. Until then, only persons who can enter into a binding contract under the applicable law may create an account.

## 4. Nature of the platform and MESH's role

MESH is an **intermediary**. Products are built, maintained, hosted, executed and supported by their creators. MESH does not run or host any product and does not itself deliver files; what you see under "Access & delivery" after a purchase is the information and instructions the creator declared, and the actual delivery happens outside MESH.

Product details (capabilities, limitations, requirements, delivery model, execution model, data policy) are the **creator's declarations**. MESH's review checks that a listing is complete and consistent with platform rules; it is not a warranty that the product fits your specific needs.

## 5. Purchases, payment and access

- Prices are shown in **Iranian rial (IRR)**. Payment is processed by the payment gateway connected to the platform; MESH never receives or stores your card details.
- Once the gateway confirms the payment, the order becomes "paid" and access to the product is activated immediately in your **Library**. Free products are added without a paid order.
- Each account holds one entitlement per product; buying the same product twice is refused.
- If a payment fails or is cancelled at the gateway, the order is recorded as "failed" or "cancelled"; nothing is charged, or the bank/gateway reverses the amount, and you can try again.
- The receipt of each order is available under "Orders" and "Receipts"; if your account has an e-mail address a purchase confirmation is also e-mailed.
- Access is for your own use; reselling, sharing or republishing product content beyond the licence the creator declared is not permitted.
- Refunds follow the [Refund & Cancellation Policy](/legal/refunds); currently a refund can be requested up to **${F.refundWindowDays} days** after payment.

## 6. Additional terms for creators

- Publishing requires an **approved** creator profile. Before approval you can create drafts but cannot submit them for review or publish.
- You warrant that you own the product or have the right to offer it, and that the listing (including capabilities, limitations, permissions, requirements and data policy) is accurate and up to date. Material changes must be released as a **new version** with release notes.
- Every product goes through MESH **review** before publication and after each new version. MESH may refuse publication, request changes, or unpublish a product that conflicts with these terms.
- Technical support for the product is your responsibility. Buyer questions about the product are routed to you through the support system.
- By publishing you grant MESH a non-exclusive licence to use the product's name, descriptions, images and listing information to display, index and promote it on the platform and its channels. You keep ownership of the product.
- **Commission**: MESH currently retains **${F.commissionPercent} %** of each successful sale and **${F.creatorSharePercent} %** accrues to the creator; the payment-gateway fee is borne by MESH. The commission rate is a versioned policy and is never applied retroactively.
- **Holding and payouts**: the earnings of each sale stay in a **${F.holdingDays}-day** holding period (aligned with the refund window) before they become payable. Payouts require an approved identity verification (KYC) and a registered, verified bank account. A payout can be requested at most once every **${F.payoutCooldownDays} days**; settlements are made by bank transfer after operator approval. When a sale is refunded, the corresponding amount is deducted from your earnings.

> [!warning] Decision required: creators' tax responsibilities, a minimum payout amount and a binding settlement schedule have not been defined. Until then creators are responsible for their own tax obligations and MESH does not commit to a transfer date.

## 7. Reviews, reports and conduct

- Only buyers who hold an entitlement can review a product. Reviews must reflect your genuine experience; MESH may remove or hide fake or abusive reviews.
- You can report a product, a review or abusive behaviour; reports are handled by the MESH team.
- Using the platform for unlawful activity, infringing others' rights, distributing malware, circumventing security or payment mechanisms, or creating multiple accounts to abuse the service is prohibited.

## 8. Intellectual property

The MESH name and mark, the design, software and content of the platform belong to MESH. Product content belongs to its creators. Any use beyond what these terms or the creator's licence allow is prohibited.

## 9. Technical use and API

MESH does not currently offer a supported public API; the public catalogue endpoints exist for the website and may change without notice. Requests are limited by default to **${F.apiRateLimitPerMinute} requests per minute** per IP address. Bulk extraction, circumventing limits or generating abnormal load is not permitted. Details are in the [documentation center](/docs/developer-api-overview).

## 10. Suspension and termination

- MESH may suspend your account or unpublish a product in case of a breach of these terms, payment fraud, abuse of the system or a legal obligation. A suspended account cannot sign in.
- You may stop using the platform at any time. Full account deletion is currently requested through the [contact form](/contact?topic=privacy) (section 7 of the Privacy Policy).

> [!warning] Decision required: what happens to purchased entitlements and unsettled earnings after a suspension or deletion has not yet been defined as a written policy.

## 11. Disclaimers and limitation of liability

The platform is provided "as is". To the extent permitted by law, MESH is not liable for the performance, availability or results of creators' products and does not warrant their quality, security or fitness for a purpose. In any case MESH's liability is limited to the amount you paid for the order concerned.

> [!warning] Legal review required: the scope of the disclaimer and the limitation of liability must be aligned with the governing law.

## 12. Communications

MESH sends in-app notifications and, when your account has an e-mail address, e-mails for transactional events (purchase confirmation, refunds, review results, security alerts). Non-essential notifications can be managed in Settings; security alerts cannot be turned off.

## 13. Changes to these terms

Each version of this document has a dated identifier and an effective date shown at the top of the page. Material changes are published on this page before they take effect. The version you accepted at registration stays recorded on your account; continued use after the effective date of a new version constitutes acceptance.

## 14. Governing law and disputes

> [!warning] Decision required: the governing law, competent forum and dispute-resolution mechanism will be defined after legal review.

## 15. Contact

Send questions about these terms through the [contact form](/contact?topic=general). Your message is recorded in the MESH review queue.
`;
