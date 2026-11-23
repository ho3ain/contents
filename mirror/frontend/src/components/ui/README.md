# Agent Hub UI Kit

کامپوننت‌های طراحی در یک نقطه مرکزی (`src/components/ui`). همه کامپوننت‌ها از توکن‌های
طراحی (`src/constants`) و تم (`src/theme`) تغذیه می‌کنند.

## استفاده

```tsx
import { Button, Card, Input, Badge, Alert, PageHeader, EmptyState, ThemeProvider } from '../components/ui';

function Example() {
  return (
    <ThemeProvider>
      <PageHeader title="عنوان" description="توضیحات" />
      <Card>
        <Input placeholder="..." />
        <Button variant="primary">تأیید</Button>
        <Badge tone="success">بررسی‌شده</Badge>
        <Alert kind="info">پیام</Alert>
      </Card>
    </ThemeProvider>
  );
}
```

## کامپوننت‌ها

- **Button** — `variant`: `primary | secondary | ghost | success | danger`، `size`: `sm | md | lg`، `block`،
  **`loading`** (اسپینر + `aria-busy` + غیرفعال‌سازی؛ برای هر submit ناهمگام — به‌جای ternary «در حال ارسال…»).
- **TextButton / PrimaryTextButton / IconButton** — دکمه‌های متنی/آیکونی.
- **Spinner** — حلقه بارگذاری با `size`.
- **Card / CardBody / CardFooter / SectionCard** — سطوح کارت. `Card` دو واریانت صریح دارد: `surface` (پیش‌فرض) و
  `product` (کارت محصول برای کشف/مقایسه؛ `as="article"`). رفتار hover و اندازه لوگو از `mesh-cards.css` می‌آید.
- **ProductRow / ProductRowList / ProductRowMenu / RowMeta / ProductRowSkeleton** — الگوی «ردیف محصول» برای
  فهرست‌های مدیریتی (یک اقدام اصلی + منوی سرریز؛ اسکلت هم‌هندسه).
- **PriorityPanel** — «پنل اولویت»: فقط یک اقدام/مانع معلق در هر صفحه، `tone` معنایی (`accent|warning|danger`).
- **InlineSection** — «بخش درون‌خطی»: گروه‌بندی با تایپوگرافی و فاصله، بدون جعبه.
  مرجع کامل الگوها، توکن‌ها و قواعد Do/Don't: `docs/MESH-CARD-DESIGN-SYSTEM.md`.
- **Input / Textarea / SearchField / Field** — ورودی‌ها با برچسب/راهنما/خطا.
- **Chip / Badge / Stat** — برچسب‌های کوچک و آمار.
- **Modal** — دیالوگ با مدیریت فوکس، بستن با Esc/بک‌دراپ، `aria-label` بومی‌سازی‌شده.
- **ConfirmDialog** — جایگزین استاندارد `window.confirm/prompt` برای اعمال مخرب:
  `{open, title, description, confirmLabel, cancelLabel?, destructive?, reasonRequired?, reasonOptional?,
  reasonLabel?, reasonPlaceholder?, onConfirm(reason), onClose}` — ضد ارسال دوباره، خطای درون‌خطی.
- **Skeleton\*** — `SkeletonText{lines}` / `SkeletonAvatar` / `SkeletonCard` / `SkeletonCardGrid{count}` /
  `SkeletonList{rows}` / `SkeletonTable{rows}` / `SkeletonStatGrid{count}` / `SkeletonDetail` —
  جایگزین `<div className="skeleton" style={{height:N}}/>` های دستی.
- **Alert** — `kind` + `title?` اختیاری + نقش ARIA (`alert` برای خطا).
- **Dialog / EmptyState / ErrorState / LoadingState / ErrorBanner / NotFoundState / ForbiddenState** — وضعیت‌ها
  (`NotFoundState`/`ForbiddenState` از `components/feedback`).
- **Divider / Spacer / AppText / FloatingActionButton / CodeInput / Toggle / BackLink** — المان‌های کمکی.

## آیکون‌ها (MESH Icon System v1.0)

مرجع کامل: `docs/icon-system/MESH-ICON-SYSTEM.md`. خلاصهٔ قرارداد:

- **`AppIcon`** تنها نقطهٔ ورود برای UI دادهٔمحور (منوها، نقشه‌های وضعیت): `name` تایپ‌شده
  (`IconName = BaseIconName | MeshIconName`)، `size` توکنی (`xs 16 | sm 20 | md 24 | lg 32` یا عدد)،
  `tone` معنایی (`success|warning|danger|info|accent|muted`)، `label` برای آیکون معنادار (در غیر این صورت
  `aria-hidden`)، `filled` برای ستاره/قلب، `flip` برای کنترل آینه‌شدن.
- **`MeshIcon`** خانوادهٔ اختصاصی MESH (۱۴ نام: `mark agent builder tools workflow publish version review
  growth success ideas portfolio opportunity network`) — فقط برای مفاهیم محصول؛ رجیستری در `icons/mesh.ts`.
- **`StateIcon`** حالت‌های چک‌لیست (`done|todo|current|failed|warning|skipped`) به‌جای گلیف‌های متنی ✓/○/●.
- **نام‌های منطقی جهت‌دار** (`arrowBack/arrowForward/chevronStart/chevronEnd`) در RTL خودکار آینه می‌شوند؛
  نام‌های فیزیکی (`arrowLeft`, `chevronDown`, …) هرگز.
- **ممنوع:** ایموجی/یونیکد به‌عنوان آیکون، نصب کتابخانهٔ آیکون جدید، رنگ ثابت داخل SVG، SVG داخل `<option>`.
- اسکریپت‌ها: `node scripts/icons/export-mesh-icons.mjs` (خروجی SVG/اسپسیمن/فاوآیکون از رجیستری؛
  تست drift در `__tests__/icons.test.tsx`)، `node scripts/qa/icon-qa.mjs` (ماتریس QA بصری).

## تم

تمام کامپوننت‌ها از متغیرهای CSS (`--bg`, `--accent`, `--sp-4`, ...) استفاده می‌کنند که
توسط `ThemeProvider` از روی توکن‌ها تزریق می‌شوند؛ تغییر تم (روشن/تاریک) کل رابط را به‌روزرسانی می‌کند.
اینترنت با `useTheme()` یا `useThemeMode()` در دسترس است.


## قواعد (Contract)

1. **رشته‌های کاربر همیشه `t()`** — هیچ متن فارسی/انگلیسی hardcoded در JSX؛ کلیدها در
   `src/i18n/messages/{fa,en}.ts` (پایپ‌لاین `scripts/`).
2. **لیبل‌های وضعیت به‌صورت تابع** — رکوردهای module-level با `t()` در زمان import فریز می‌شوند؛
   الگوی درست: `reportReasonLabel(reason)` در `lib/ui.ts`.
3. **فقط از این کیت** — دکمه/کارت/دیالوگ جدید نسازید؛ API موجود را گسترش دهید.
4. **اعمال مخرب** فقط از طریق `ConfirmDialog` (با دلیل در صورت نیاز) — `window.confirm/prompt` ممنوع.
