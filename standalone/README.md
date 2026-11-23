# لایهٔ مستقل (standalone)

این پوشه **کد مش نیست**. داربستی است که به کپی بایت‌به‌بایتِ داخل `../mirror/` اجازه
می‌دهد به‌تنهایی کامپایل و اجرا شود.

## قاعدهٔ اصلی

`../mirror/` هرگز نوشته نمی‌شود. `bootstrap.sh` یک `workdir/` یک‌بارمصرف می‌سازد:

```
../mirror/<repo>/…   ──کپی──►   workdir/…
./overlay/…          ──روکش──►  workdir/…
./package.json ...   ──کپی──►   workdir/…
```

پس هر وقت خواستید می‌توانید `workdir/` را پاک کنید و دوباره بسازید.

## فایل‌های داربست

| فایل | چیست |
| --- | --- |
| `backend/overlay/src/content-app.module.ts` | ماژول ریشه: `BlogModule` + `SeoModule` + TypeORM |
| `backend/overlay/src/main.ts` | بوت‌استرپ، پیشوند `/api/v1`، `ValidationPipe` |
| `backend/overlay/src/content-data-source.ts` | DataSource برای CLI مایگریشن |
| `backend/package.json` | وابستگی‌ها، **تولیدشده از گراف واقعی import** |
| `backend/tsconfig.json` | کپی از `agentHub_backend/tsconfig.json` |
| `backend/.env.example` | متغیرهای لازم |
| `frontend/overlay/src/ContentApp.tsx` | درخت ۱۲ روت محتوا |
| `frontend/overlay/src/main.tsx` | نقطهٔ ورود + استایل‌های محتوا |
| `frontend/package.json` | وابستگی‌ها، تولیدشده از گراف واقعی import |
| `frontend/tsconfig.json` | گزینه‌های `tsconfig.app.json` پروژه |
| `frontend/vite.config.ts` | سرور dev + پراکسی `/api` |
| `frontend/vitest.config.ts` | کپی بدون تغییر از مخزن فرانت‌اند |
| `frontend/index.html` | `lang="fa" dir="rtl"` |

`package.json`ها دستی نوشته نشده‌اند: `_tools/make_standalone_pkg.py` آن‌ها را از
`closure-report.json` می‌سازد و هر نسخه را عیناً از `package.json` مخزن مبدأ
برمی‌دارد. اگر چیزی در مبدأ نباشد، اسکریپت با خطا متوقف می‌شود.

## اجرا

```bash
./backend/bootstrap.sh  && cd backend/workdir  && npm install && npm run typecheck && npm test
./frontend/bootstrap.sh && cd frontend/workdir && npm install && npm run typecheck && npm test
```

برای بالا آوردن واقعی، `../INTEGRATION.md` §۲ را ببینید (به PostgreSQL نیاز است).

## ⚠️ بدون مجوز

`ContentAppModule` گاردهای `ThrottlerGuard` / `RolesGuard` / `KillSwitchGuard` مش
را ثبت نمی‌کند، چون متعلق به زیرسیستم auth هستند نه به فیچر محتوا.
**یعنی `/admin/blog/**` و `/admin/seo/**` در این حالت محافظت‌شده نیستند.**
جزئیات و نام مجوزها در `../INTEGRATION.md` §۲.
