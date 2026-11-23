import type { DocArticle } from './types';

const UPDATED = '2026-10-13';

export const STATUS: DocArticle[] = [
  {
    slug: 'service-status',
    section: 'status',
    owner: 'engineering',
    updatedAt: UPDATED,
    widget: 'service-status',
    title: { fa: 'وضعیت سرویس', en: 'Service status' },
    summary: {
      fa: 'بررسی زندهٔ در دسترس بودن API — بدون تاریخچه یا درصد آپ‌تایم.',
      en: 'Live availability check of the API — no history or uptime percentage.',
    },
    body: {
      fa: `
## این صفحه چه چیزی نشان می‌دهد

ویجت پایین صفحه، همین حالا از مرورگر شما نقطهٔ پایانی عمومی \`GET /api/v1/health\` را فراخوانی می‌کند و نتیجهٔ واقعی (برنامه و پایگاه داده) را نمایش می‌دهد.

## این صفحه چه چیزی **نشان نمی‌دهد**

- تاریخچهٔ رخدادها یا درصد آپ‌تایم — MESH هنوز منبع پایش مستقلی برای این اعداد منتشر نکرده و عددی که نتوان اثبات کرد اینجا نمی‌آید.
- وضعیت درگاه پرداخت یا ارسال ایمیل — این‌ها فقط برای اپراتور قابل مشاهده‌اند.
- SLA یا تعهد در دسترس بودن.

اگر ویجت «در دسترس» را نشان می‌دهد اما شما خطا می‌بینید، شناسهٔ \`X-Request-ID\` یا متن خطا را از طریق [فرم تماس](/contact?topic=bug) بفرستید.

## یادداشت تغییرات

تغییرات محصول در [وبلاگ](/blog) و تغییرات هر محصول در زبانهٔ «به‌روزرسانی‌ها»ی همان محصول منتشر می‌شود. تغییرات اسناد حقوقی در پایین هر سند با تاریخ نسخه ثبت است.
`,
      en: `
## What this page shows

The widget below calls the public endpoint \`GET /api/v1/health\` from your browser right now and shows the real result (application and database).

## What this page does **not** show

- Incident history or an uptime percentage — MESH has not published an independent monitoring source for these numbers yet, and no number that cannot be proven appears here.
- Payment-gateway or e-mail delivery status — those are visible to the operator only.
- An SLA or availability commitment.

If the widget says "available" but you see errors, send the \`X-Request-ID\` or the error text through the [contact form](/contact?topic=bug).

## Changelog

Product changes are published on the [blog](/blog); changes to an individual product appear in that product's "Updates" tab. Changes to the legal documents are recorded with the version date at the bottom of each document.
`,
    },
  },
];
