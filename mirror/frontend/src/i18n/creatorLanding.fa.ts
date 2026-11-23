/**
 * Creator landing page (`/developers`) — Persian copy.
 *
 * Every string on the public creator page lives here; the page itself holds
 * no literal copy. Rules enforced by `__tests__/creator-landing-i18n.test.ts`:
 *
 *  - all keys are namespaced `creatorLanding.` and exist in both languages;
 *  - no platform figure is written as a literal — commission, share, holding,
 *    cooldown and the refund window arrive through `{…}` placeholders fed from
 *    `PLATFORM_FACTS`, which is itself verified against the backend finance
 *    migration. A number typed here could drift from the ledger; a placeholder
 *    cannot;
 *  - no capability is described that the product does not implement. The
 *    boundary copy (`creatorLanding.boundary.*`) restates Terms §4 rather than
 *    inventing a new promise, and the commercial copy links to the documents
 *    that own each figure instead of becoming a second source of truth.
 *
 * Product type titles are NOT defined here: they reuse `product.type.*` from
 * the base dictionary so the public page and the product UI always print the
 * same seven labels as the backend `PRODUCT_TYPES` enum.
 */
export const creatorLandingFa: Record<string, string> = {
  // ---- document meta -------------------------------------------------------
  'creatorLanding.meta.title': 'برای سازندگان | MESH',
  'creatorLanding.meta.description':
    'محصول هوش مصنوعی خود را در MESH معرفی و منتشر کنید: انواع محصول، مسیر بازبینی، شرایط تجاری و مرز مسئولیت پلتفرم.',

  // ---- hero ----------------------------------------------------------------
  'creatorLanding.hero.title': 'محصول هوشمند خود را معرفی کنید،',
  'creatorLanding.hero.titleEm': 'منتشر کنید و به خریدار برسانید.',
  'creatorLanding.hero.lead':
    'هرجا ساخته‌اید، اینجا بفروشید. MESH بستر معرفی، بازبینی و فروش محصول شماست؛ ساخت، میزبانی و اجرای محصول نزد شما می‌ماند.',
  'creatorLanding.hero.cta.secondary': 'مسیر انتشار را ببینید',

  // ---- hero card: the real publication path --------------------------------
  'creatorLanding.path.title': 'مسیر واقعی انتشار',
  'creatorLanding.path.step.draft.title': 'پیش‌نویس محصول',
  'creatorLanding.path.step.draft.detail': 'ویزارد محصول را گام‌به‌گام پر می‌کنید و هر لحظه ذخیره می‌شود.',
  'creatorLanding.path.step.readiness.title': 'چک‌لیست آمادگی',
  'creatorLanding.path.step.readiness.detail': 'سرور کامل‌بودن اطلاعات را بررسی می‌کند و می‌گوید چه چیزی کم است.',
  'creatorLanding.path.step.review.title': 'بازبینی و بازخورد',
  'creatorLanding.path.step.review.detail': 'تیم بازبینی فهرست را بررسی می‌کند؛ بازخورد مشخص و قابل پیگیری است.',
  'creatorLanding.path.step.publish.title': 'انتشار نسخه',
  'creatorLanding.path.step.publish.detail': 'نسخهٔ منتشرشده تغییرناپذیر است و دسترسی خریدار به همان نسخه پین می‌شود.',
  'creatorLanding.path.note':
    'تا پیش از تأیید پروفایل سازنده می‌توانید پیش‌نویس بسازید، اما «ارسال برای بازبینی» و «انتشار» غیرفعال است. MESH زمان مشخصی برای بررسی تعهد نمی‌کند.',

  // ---- proof story ---------------------------------------------------------
  'creatorLanding.proof.title': 'از ایده تا',
  'creatorLanding.proof.titleEm': 'محصولی که استفاده می‌شود.',
  'creatorLanding.proof.lead': 'چهار قدم روشن برای تبدیل یک نیاز واقعی به محصولی که در عمل به کار می‌آید.',
  'creatorLanding.proof.step.need.title': 'نیاز واقعی را پیدا کنید',
  'creatorLanding.proof.step.need.detail': 'نیازی را شناسایی کنید که ارزش حل کردن دارد.',
  'creatorLanding.proof.step.build.title': 'محصول را بسازید',
  'creatorLanding.proof.step.build.detail': 'با هر ابزاری که می‌خواهید بسازید؛ MESH ابزار ساخت ندارد و محدودتان نمی‌کند.',
  'creatorLanding.proof.step.describe.title': 'شفاف معرفی کنید',
  'creatorLanding.proof.step.describe.detail': 'قابلیت‌ها، پیش‌نیازها و روش تحویل را دقیق اعلام کنید.',
  'creatorLanding.proof.step.improve.title': 'بهتر کنید',
  'creatorLanding.proof.step.improve.detail': 'از بازخورد خریداران برای نسخهٔ بعدی استفاده کنید.',

  // ---- product types -------------------------------------------------------
  'creatorLanding.types.title': 'چه محصولی می‌توانید عرضه کنید؟',
  'creatorLanding.types.lead':
    'هفت نوع محصول در MESH تعریف شده است. نوع محصول، مدل تحویل و مدل اجرا را هنگام ساخت فهرست خودتان اعلام می‌کنید.',
  'creatorLanding.types.more': 'جزئیات بیشتر',
  'creatorLanding.types.field.delivery': 'تحویل به خریدار:',
  'creatorLanding.types.field.fit': 'مناسب برای:',
  'creatorLanding.types.field.execution': 'اجرا:',
  'creatorLanding.types.field.prereq': 'پیش‌نیاز:',
  'creatorLanding.types.field.coding': 'برنامه‌نویسی:',

  'creatorLanding.types.ai_agent.summary':
    'راهکاری که یک وظیفهٔ مشخص را برای خریدار انجام می‌دهد و می‌تواند بخشی از کار را مستقل پیش ببرد.',
  'creatorLanding.types.ai_agent.delivery': 'ایجنت آمادهٔ استفاده، دسترسی یا پیکربندی مشخص.',
  'creatorLanding.types.ai_agent.fit': 'حل یک مسئلهٔ تکرارشونده و دقیق.',
  'creatorLanding.types.ai_agent.execution': 'روی زیرساخت شما، خریدار یا سرویس ثالث — هرکدام را که اعلام کنید.',
  'creatorLanding.types.ai_agent.prereq': 'تعریف روشن وظیفه، ورودی و خروجی.',
  'creatorLanding.types.ai_agent.coding': 'الزامی نیست؛ به پیچیدگی ایجنت بستگی دارد.',

  'creatorLanding.types.ai_assistant.summary':
    'دستیار تعاملی برای پاسخ‌گویی، راهنمایی و کمک به کاربران در طول یک فرایند مشخص.',
  'creatorLanding.types.ai_assistant.delivery': 'دستیار آماده با دستورالعمل و محدودهٔ عملکرد.',
  'creatorLanding.types.ai_assistant.fit': 'پشتیبانی، آموزش و هدایت کاربران.',
  'creatorLanding.types.ai_assistant.execution': 'محیط گفت‌وگو یا کانالی که خودتان تعیین می‌کنید.',
  'creatorLanding.types.ai_assistant.prereq': 'محتوای معتبر، لحن و سناریوهای پاسخ.',
  'creatorLanding.types.ai_assistant.coding': 'معمولاً نه؛ اتصال‌های اختصاصی ممکن است کدنویسی بخواهد.',

  'creatorLanding.types.ai_workflow.summary':
    'فرایندی چندمرحله‌ای که وظایف و ابزارهای مختلف را به هم متصل می‌کند تا یک کار کامل انجام شود.',
  'creatorLanding.types.ai_workflow.delivery': 'جریان کار آماده، مراحل اجرا و راهنمای راه‌اندازی.',
  'creatorLanding.types.ai_workflow.fit': 'تیم‌هایی که یک فرایند کامل را خودکار می‌کنند.',
  'creatorLanding.types.ai_workflow.execution': 'در ابزارها، APIها یا زیرساختی که معرفی می‌کنید.',
  'creatorLanding.types.ai_workflow.prereq': 'تعریف مراحل، ورودی‌ها، خروجی‌ها و اتصال‌ها.',
  'creatorLanding.types.ai_workflow.coding': 'بسته به اتصال‌ها؛ از بدون کد تا فنی.',

  'creatorLanding.types.automation.summary': 'راهکاری برای خودکارسازی کارهای تکرارشونده و کاهش فعالیت‌های دستی.',
  'creatorLanding.types.automation.delivery': 'سناریوی اتوماسیون، تنظیمات و دستور استفاده.',
  'creatorLanding.types.automation.fit': 'عملیات، فروش، گزارش‌گیری و کارهای تکراری.',
  'creatorLanding.types.automation.execution': 'میان سرویس‌ها و ابزارهای متصل، در محیطی که اعلام می‌کنید.',
  'creatorLanding.types.automation.prereq': 'دسترسی به ابزارها و تعریف رویداد آغازگر و اقدام.',
  'creatorLanding.types.automation.coding': 'معمولاً نه؛ API یا منطق سفارشی ممکن است لازم باشد.',

  'creatorLanding.types.template.summary': 'قالبی آماده برای شروع سریع که خریدار می‌تواند آن را سفارشی‌سازی کند.',
  'creatorLanding.types.template.delivery': 'فایل، ساختار یا قالب قابل استفاده و مستند.',
  'creatorLanding.types.template.fit': 'شروع سریع پروژه‌ها و فرایندهای مشابه.',
  'creatorLanding.types.template.execution': 'در ابزار یا محیطی که قالب برای آن ساخته شده است.',
  'creatorLanding.types.template.prereq': 'ابزار مقصد و راهنمای نصب یا استفاده.',
  'creatorLanding.types.template.coding': 'بسته به قالب؛ می‌تواند کاملاً بدون کد باشد.',

  'creatorLanding.types.api_service.summary':
    'سرویسی که تیم‌های فنی می‌توانند از طریق API در محصولات و سیستم‌های دیگر به کار بگیرند.',
  'creatorLanding.types.api_service.delivery': 'نقطهٔ پایانی، دسترسی، مستندات و محدودیت‌های سرویس.',
  'creatorLanding.types.api_service.fit': 'تیم‌های فنی و محصول‌هایی که اتصال مستقیم می‌خواهند.',
  'creatorLanding.types.api_service.execution': 'روی زیرساخت شما یا محیط توافق‌شده با خریدار.',
  'creatorLanding.types.api_service.prereq': 'کلید دسترسی، مستندات و آشنایی با یکپارچه‌سازی.',
  'creatorLanding.types.api_service.coding': 'بله؛ برای اتصال و استفاده معمولاً لازم است.',

  'creatorLanding.types.setup_service.summary':
    'خدمتی برای نصب، پیکربندی و راه‌اندازی تا خریدار سریع‌تر استفاده را شروع کند.',
  'creatorLanding.types.setup_service.delivery': 'راه‌اندازی انجام‌شده، تنظیمات و آموزش اولیه.',
  'creatorLanding.types.setup_service.fit': 'تیم‌هایی که راهکار را می‌خواهند اما اجرا را برون‌سپاری می‌کنند.',
  'creatorLanding.types.setup_service.prereq': 'دسترسی، اطلاعات پروژه و محدودهٔ خدمات روشن.',
  'creatorLanding.types.setup_service.execution': 'در محیط خریدار یا زیرساخت توافق‌شده.',
  'creatorLanding.types.setup_service.coding': 'وابسته به پروژه؛ ممکن است لازم باشد.',

  'creatorLanding.types.disclosure.title': 'آنچه اعلام می‌کنید، همان چیزی است که خریدار می‌بیند.',
  'creatorLanding.types.disclosure.body':
    'مدل تحویل، مدل اجرا و مسئولیت میزبانی، اظهار شماست. MESH آن را برای کامل‌بودن و سازگاری بررسی می‌کند، اما عملکرد، دسترس‌پذیری یا میزبانی محصول را تضمین نمی‌کند.',

  // ---- readiness -----------------------------------------------------------
  'creatorLanding.readiness.title': 'برای شروع چه چیزهایی لازم دارید؟',
  'creatorLanding.readiness.lead':
    'لازم نیست همه‌چیز کامل باشد؛ کافی است بدانید چه مسئله‌ای را حل می‌کنید، برای چه کسی و چگونه تحویل می‌دهید.',
  'creatorLanding.readiness.node.problem.title': 'مسئلهٔ واقعی',
  'creatorLanding.readiness.node.problem.detail': 'می‌دانید چه مسئله‌ای را حل می‌کنید و چرا اهمیت دارد.',
  'creatorLanding.readiness.node.audience.title': 'مخاطب مشخص',
  'creatorLanding.readiness.node.audience.detail': 'می‌دانید محصول برای چه کسی ساخته می‌شود.',
  'creatorLanding.readiness.node.delivery.title': 'تحویل شفاف',
  'creatorLanding.readiness.node.delivery.detail': 'می‌دانید خریدار چه چیزی دریافت می‌کند و چگونه از آن استفاده می‌کند.',
  'creatorLanding.readiness.not.title': 'برای شروع لازم نیست',
  'creatorLanding.readiness.not.1': 'برنامه‌نویس حرفه‌ای باشید',
  'creatorLanding.readiness.not.2': 'محصول بسیار پیچیده‌ای داشته باشید',
  'creatorLanding.readiness.not.3': 'زیرساخت اختصاصی آماده کرده باشید',
  'creatorLanding.readiness.not.4': 'سابقهٔ فروش قبلی داشته باشید',
  'creatorLanding.readiness.not.5': 'تیم بزرگی در اختیار داشته باشید',
  'creatorLanding.readiness.yes.title': 'برای شروع باید داشته باشید',
  'creatorLanding.readiness.yes.1': 'یک مسئلهٔ واقعی که می‌خواهید حل کنید',
  'creatorLanding.readiness.yes.2': 'توضیح روشن دربارهٔ محصولی که ارائه می‌دهید',
  'creatorLanding.readiness.yes.3': 'مخاطب مشخص',
  'creatorLanding.readiness.yes.4': 'روش تحویل و استفادهٔ قابل فهم',
  'creatorLanding.readiness.yes.5': 'پیش‌نیازها و محدودیت‌های شفاف',
  'creatorLanding.readiness.bottom.title': 'کامل بودن شرط شروع نیست؛',
  'creatorLanding.readiness.bottom.detail': 'شفاف بودن مسئله، مخاطب و مسیر تحویل مهم‌تر است.',

  // ---- commercial terms ----------------------------------------------------
  'creatorLanding.terms.title': 'شرایط تجاری، پیش از آنکه وقت بگذارید',
  'creatorLanding.terms.lead':
    'این ارقام سیاست فعلی پلتفرم‌اند، نسخه‌دار هستند و تغییرشان عطف‌به‌ماسبق اعمال نمی‌شود. مرجع رسمی، مستندات درآمد و شرایط استفاده است.',
  'creatorLanding.terms.days': '{days} روز',
  'creatorLanding.terms.share.label': 'سهم شما از هر فروش',
  'creatorLanding.terms.share.detail': 'کمیسیون پلتفرم در حال حاضر {commission} است.',
  'creatorLanding.terms.holding.label': 'دورهٔ نگهداشت درآمد',
  'creatorLanding.terms.holding.detail': 'درآمد هر فروش پس از این دوره قابل برداشت می‌شود.',
  'creatorLanding.terms.payout.label': 'فاصلهٔ بین دو تسویه',
  'creatorLanding.terms.payout.detail': 'هر درخواست تسویه نیازمند تأیید ادمین و احراز هویت تأییدشده است.',
  'creatorLanding.terms.refund.label': 'پنجرهٔ بازگشت وجه خریدار',
  'creatorLanding.terms.refund.detail': 'شرایط و استثناها در سیاست بازگشت وجه آمده است.',
  'creatorLanding.terms.pricing.label': 'مدل قیمت‌گذاری',
  'creatorLanding.terms.pricing.value': 'رایگان یا پرداخت یک‌باره',
  'creatorLanding.terms.pricing.detail': 'اشتراک دوره‌ای و صورتحساب مصرفی در حال حاضر پشتیبانی نمی‌شود.',
  'creatorLanding.terms.currency.label': 'واحد پول',
  'creatorLanding.terms.currency.value': 'ریال ایران',
  'creatorLanding.terms.currency.detail': 'پرداخت از طریق درگاه داخلی انجام می‌شود.',
  'creatorLanding.terms.tax.note':
    'سیاست مکتوبی دربارهٔ تعهدات مالیاتی سازندگان هنوز منتشر نشده است؛ سهم اعلام‌شده پیش از هرگونه تعهد مالیاتی احتمالی است.',
  'creatorLanding.terms.link.earnings': 'مستندات درآمد و تسویه',
  'creatorLanding.terms.link.terms': 'شرایط استفاده',
  'creatorLanding.terms.link.refunds': 'سیاست بازگشت وجه',

  // ---- platform boundary (P13) ---------------------------------------------
  'creatorLanding.boundary.title': 'مرز مسئولیت: MESH چه کاری انجام نمی‌دهد',
  'creatorLanding.boundary.lead':
    'MESH یک واسطه است. دانستن این مرز پیش از انتشار، هم برای شما و هم برای خریدار ضروری است.',
  'creatorLanding.boundary.hosting.title': 'میزبانی نمی‌کند',
  'creatorLanding.boundary.hosting.detail':
    'هیچ محصولی روی زیرساخت MESH میزبانی نمی‌شود. مسئولیت میزبانی نزد شما، خریدار یا یک سرویس ثالث است.',
  'creatorLanding.boundary.execution.title': 'اجرا نمی‌کند',
  'creatorLanding.boundary.execution.detail':
    'MESH محصول شما را اجرا نمی‌کند. اجرا در محیطی انجام می‌شود که خودتان اعلام کرده‌اید.',
  'creatorLanding.boundary.delivery.title': 'تحویل نمی‌دهد',
  'creatorLanding.boundary.delivery.detail':
    'آنچه خریدار پس از خرید می‌بیند، اطلاعات و دستورالعمل اعلامی شماست؛ تحویل واقعی خارج از MESH انجام می‌شود.',
  'creatorLanding.boundary.build.title': 'ابزار ساخت نیست',
  'creatorLanding.boundary.build.detail':
    'MESH سازندهٔ محصول ندارد. با n8n، Dify، کد اختصاصی یا هر ابزار دیگری بسازید و نتیجه را اینجا معرفی کنید.',
  'creatorLanding.boundary.link': 'این مرز در شرایط استفاده تعریف شده است',

  // ---- trust ---------------------------------------------------------------
  'creatorLanding.trust.title': 'مسیر روشن محصول شما؛',
  'creatorLanding.trust.titleEm': 'از آماده‌سازی تا انتشار',
  'creatorLanding.trust.lead':
    'می‌دانید برای انتشار چه اطلاعاتی لازم است، چه مراحلی پیش رو دارید و محصولتان چگونه به خریدار معرفی می‌شود.',
  'creatorLanding.trust.status.head': 'یک مسیر قابل فهم برای بررسی',
  'creatorLanding.trust.status.info.title': 'اطلاعات محصول',
  'creatorLanding.trust.status.info.detail': 'توضیحات، قابلیت‌ها و کاربرد مشخص',
  'creatorLanding.trust.status.profile.title': 'پروفایل سازنده',
  'creatorLanding.trust.status.profile.detail': 'اطلاعات تکمیل‌شده و تأییدشده',
  'creatorLanding.trust.status.review.title': 'بررسی و بازخورد',
  'creatorLanding.trust.status.review.detail': 'معیارها و اصلاحات قابل پیگیری',
  'creatorLanding.trust.status.publish.title': 'آمادهٔ انتشار',
  'creatorLanding.trust.status.publish.detail': 'نمایش در بازار',
  'creatorLanding.trust.principles.title': 'اعتماد سازنده با',
  'creatorLanding.trust.principles.titleEm': 'شفافیت',
  'creatorLanding.trust.principles.titleAfter': 'ساخته می‌شود.',
  'creatorLanding.trust.principles.lead': 'می‌دانید محصولتان چگونه بررسی و نمایش داده می‌شود و در هر مرحله چه پیش روست.',
  'creatorLanding.trust.principle.ownership.title': 'مالکیت نزد شما می‌ماند',
  'creatorLanding.trust.principle.ownership.detail':
    'مالکیت محصول از آنِ شماست. با انتشار، مجوزی غیرانحصاری به MESH می‌دهید تا نام، توضیحات، تصاویر و اطلاعات فهرست را برای نمایش، جست‌وجو و معرفی محصول در پلتفرم به کار ببرد.',
  'creatorLanding.trust.principle.review.title': 'بررسی شفاف',
  'creatorLanding.trust.principle.review.detail':
    'از ابتدا می‌دانید فهرست بر چه اساسی بررسی می‌شود: کامل‌بودن اطلاعات، سازگاری مشخصات با توضیحات و انطباق با قواعد پلتفرم.',
  'creatorLanding.trust.principle.version.title': 'نسخهٔ منتشرشده تغییرناپذیر است',
  'creatorLanding.trust.principle.version.detail':
    'پس از انتشار، آن نسخه ثابت می‌ماند و دسترسی خریدار به همان نسخه پین می‌شود. تغییر محصول از مسیر نسخهٔ جدید انجام می‌شود.',
  'creatorLanding.trust.principle.feedback.title': 'بازخورد قابل اقدام',
  'creatorLanding.trust.principle.feedback.detail':
    'اگر اصلاحی لازم باشد، دلیل آن را می‌بینید و پیش از انتشار فرصت تکمیل دارید.',

  // ---- examples ------------------------------------------------------------
  'creatorLanding.examples.title': 'ایده‌هایی برای ساخت',
  'creatorLanding.examples.lead': 'این نمونه‌ها نشان می‌دهند چگونه یک مسئلهٔ واقعی به یک محصول تبدیل می‌شود.',
  'creatorLanding.examples.disclaimer':
    'این موارد نمونهٔ فرضی برای الهام‌گرفتن‌اند و محصول واقعی منتشرشده در MESH نیستند. محصول‌های واقعی را در بازار ببینید.',
  'creatorLanding.examples.browse': 'دیدن محصول‌های واقعی بازار',
  'creatorLanding.examples.filterLabel': 'فیلتر نمونه‌ها',
  'creatorLanding.examples.meta.delivery': 'تحویل',
  'creatorLanding.examples.meta.fit': 'مناسب برای',
  'creatorLanding.examples.structure': 'ساختار محصول را ببینید',
  'creatorLanding.examples.cat.sales': 'فروش',
  'creatorLanding.examples.cat.data': 'تحلیل داده',
  'creatorLanding.examples.cat.support': 'پشتیبانی مشتریان',
  'creatorLanding.examples.cat.research': 'تحقیق',
  'creatorLanding.examples.sales.1.title': 'پیشنهاددهندهٔ فرصت فروش',
  'creatorLanding.examples.sales.1.detail': 'کمک به تیم فروش برای اولویت‌بندی فرصت‌ها.',
  'creatorLanding.examples.sales.2.title': 'پیگیری خودکار مشتریان',
  'creatorLanding.examples.sales.2.detail': 'ثبت و پیگیری مرحله‌های فروش در یک مسیر ساده.',
  'creatorLanding.examples.sales.3.title': 'گزارش روزانهٔ فروش',
  'creatorLanding.examples.sales.3.detail': 'جمع‌آوری داده‌ها و آماده‌سازی گزارش.',
  'creatorLanding.examples.data.1.title': 'تحلیل‌گر الگوی داده',
  'creatorLanding.examples.data.1.detail': 'پیدا کردن الگوهای مهم در داده‌های کاری.',
  'creatorLanding.examples.data.2.title': 'داشبورد تصمیم‌گیری',
  'creatorLanding.examples.data.2.detail': 'اتصال داده‌ها و آماده‌سازی خلاصهٔ مدیریتی.',
  'creatorLanding.examples.data.3.title': 'پاک‌سازی داده‌ها',
  'creatorLanding.examples.data.3.detail': 'کاهش کارهای دستی پیش از تحلیل.',
  'creatorLanding.examples.support.1.title': 'دستیار پاسخ‌گویی مشتری',
  'creatorLanding.examples.support.1.detail': 'پاسخ به پرسش‌های تکراری و هدایت کاربر.',
  'creatorLanding.examples.support.2.title': 'دسته‌بندی درخواست‌ها',
  'creatorLanding.examples.support.2.detail': 'دریافت، دسته‌بندی و ارجاع تیکت‌ها.',
  'creatorLanding.examples.support.3.title': 'پیگیری رضایت مشتری',
  'creatorLanding.examples.support.3.detail': 'ثبت بازخورد و ارسال یادآوری خودکار.',
  'creatorLanding.examples.research.1.title': 'دستیار تحقیق بازار',
  'creatorLanding.examples.research.1.detail': 'جمع‌آوری و خلاصه‌سازی اطلاعات مرتبط.',
  'creatorLanding.examples.research.2.title': 'مقایسهٔ منابع',
  'creatorLanding.examples.research.2.detail': 'ساخت مسیری منظم برای بررسی منابع.',
  'creatorLanding.examples.research.3.title': 'گزارش‌سازی تحقیق',
  'creatorLanding.examples.research.3.detail': 'تبدیل داده‌های جمع‌آوری‌شده به خروجی اولیه.',

  // ---- journey -------------------------------------------------------------
  'creatorLanding.journey.title': 'از ایده تا رسیدن به خریدار',
  'creatorLanding.journey.lead': 'هفت مرحله از شکل‌گیری ایده تا اولین خریدار واقعی.',
  'creatorLanding.journey.step.discover.title': 'کشف',
  'creatorLanding.journey.step.discover.detail': 'مسئله‌ای واقعی پیدا کنید که ارزش حل کردن دارد.',
  'creatorLanding.journey.step.build.title': 'ساخت',
  'creatorLanding.journey.step.build.detail': 'با ابزار دلخواه خود محصول را بسازید.',
  'creatorLanding.journey.step.describe.title': 'معرفی',
  'creatorLanding.journey.step.describe.detail': 'اطلاعات محصول، مخاطب و روش تحویل را کامل کنید.',
  'creatorLanding.journey.step.review.title': 'بازبینی',
  'creatorLanding.journey.step.review.detail': 'بازخورد مشخص بگیرید و فهرست را برای انتشار آماده کنید.',
  'creatorLanding.journey.step.publish.title': 'انتشار',
  'creatorLanding.journey.step.publish.detail': 'نسخهٔ تغییرناپذیر محصول در بازار منتشر می‌شود.',
  'creatorLanding.journey.step.reach.title': 'رسیدن به مخاطب',
  'creatorLanding.journey.step.reach.detail': 'محصول در جست‌وجو، دسته‌ها و صنایع بازار دیده می‌شود.',
  'creatorLanding.journey.step.grow.title': 'رشد',
  'creatorLanding.journey.step.grow.detail': 'از فروش و بازخورد واقعی برای نسخهٔ بعدی استفاده کنید.',

  // ---- studio capabilities -------------------------------------------------
  'creatorLanding.studio.title': 'در استودیوی سازنده',
  'creatorLanding.studio.titleEm': 'چه چیزی در اختیار دارید؟',
  'creatorLanding.studio.lead': 'این موارد در محصول پیاده‌سازی شده‌اند و پس از تأیید پروفایل در دسترس شما هستند.',
  'creatorLanding.studio.item.wizard.title': 'ویزارد محصول با ذخیرهٔ خودکار',
  'creatorLanding.studio.item.wizard.detail': 'فهرست را گام‌به‌گام کامل کنید؛ پیش‌نویس همیشه ذخیره می‌شود.',
  'creatorLanding.studio.item.readiness.title': 'چک‌لیست آمادگی سمت سرور',
  'creatorLanding.studio.item.readiness.detail': 'پیش از ارسال دقیقاً می‌دانید چه چیزی کم است.',
  'creatorLanding.studio.item.versions.title': 'مدیریت نسخه و یادداشت تغییرات',
  'creatorLanding.studio.item.versions.detail': 'نسخهٔ جدید بسازید و تغییرها را برای خریدار بنویسید.',
  'creatorLanding.studio.item.finance.title': 'داشبورد مالی و تسویه',
  'creatorLanding.studio.item.finance.detail': 'فروش، درآمد نگهداشت‌شده و وضعیت درخواست تسویه را ببینید.',
  'creatorLanding.studio.item.feedback.title': 'بازخورد بازبینی',
  'creatorLanding.studio.item.feedback.detail': 'موارد اصلاحی را با دلیل دریافت و پیگیری کنید.',

  // ---- documentation links -------------------------------------------------
  'creatorLanding.docs.title': 'پیش از شروع، این‌ها را بخوانید',
  'creatorLanding.docs.lead': 'مستندات رسمی سازندگان؛ هر صفحه مرجع همان موضوع است.',
  'creatorLanding.docs.becoming.title': 'سازنده شدن',
  'creatorLanding.docs.becoming.detail': 'شرایط، مراحل درخواست و وضعیت تأیید پروفایل.',
  'creatorLanding.docs.publishing.title': 'انتشار محصول',
  'creatorLanding.docs.publishing.detail': 'اطلاعات لازم برای فهرست، چک‌لیست آمادگی و نسخه‌ها.',
  'creatorLanding.docs.review.title': 'فرایند بازبینی',
  'creatorLanding.docs.review.detail': 'چه چیزی بررسی می‌شود و بازخورد چگونه داده می‌شود.',
  'creatorLanding.docs.earnings.title': 'درآمد و تسویه',
  'creatorLanding.docs.earnings.detail': 'کمیسیون، نگهداشت، شرایط برداشت و احراز هویت.',
  'creatorLanding.docs.faq.title': 'پرسش‌های متداول سازندگان',
  'creatorLanding.docs.faq.detail': 'پاسخ کوتاه به پرتکرارترین پرسش‌ها.',
  'creatorLanding.docs.all': 'همهٔ مستندات',

  // ---- FAQ -----------------------------------------------------------------
  'creatorLanding.faq.title': 'پیش از انتشار، این‌ها را بدانید',
  'creatorLanding.faq.lead': 'پاسخ کوتاه به پرسش‌هایی که معمولاً پیش از ثبت‌نام مطرح می‌شوند.',
  'creatorLanding.faq.q.types': 'چه نوع محصولی می‌توانم منتشر کنم؟',
  'creatorLanding.faq.a.types':
    'هفت نوع محصول تعریف شده است: اتوماسیون، جریان کار، ایجنت، دستیار، قالب، سرویس API و سرویس راه‌اندازی. محصول باید نیاز مشخصی را حل کند و کاربرد، مخاطب و روش تحویل روشنی داشته باشد.',
  'creatorLanding.faq.q.tools': 'باید با ابزار خاصی ساخته باشم؟',
  'creatorLanding.faq.a.tools':
    'نه. MESH ابزار ساخت ندارد. با n8n، Dify، پایتون، Node.js، کد اختصاصی یا هر ابزار دیگری بسازید؛ ابزار ساخت را فقط هنگام ساخت فهرست اعلام می‌کنید.',
  'creatorLanding.faq.q.hosting': 'MESH محصول من را میزبانی یا اجرا می‌کند؟',
  'creatorLanding.faq.a.hosting':
    'نه. MESH هیچ محصولی را میزبانی، اجرا یا تحویل نمی‌دهد. مسئولیت میزبانی و اجرا نزد شما، خریدار یا یک سرویس ثالث است و خودتان آن را در فهرست اعلام می‌کنید.',
  'creatorLanding.faq.q.revenue': 'سهم من از هر فروش چقدر است؟',
  'creatorLanding.faq.a.revenue':
    'در حال حاضر {share} از هر فروش سهم شماست و {commission} کمیسیون پلتفرم است. درآمد پس از دورهٔ نگهداشت {holding} روزه قابل برداشت می‌شود. این ارقام سیاست فعلی‌اند و تغییرشان عطف‌به‌ماسبق اعمال نمی‌شود.',
  'creatorLanding.faq.q.payout': 'چه زمانی می‌توانم تسویه بگیرم؟',
  'creatorLanding.faq.a.payout':
    'پس از پایان دورهٔ نگهداشت و با رعایت فاصلهٔ {cooldown} روزه بین دو درخواست. تسویه نیازمند احراز هویت تأییدشده و تأیید ادمین است.',
  'creatorLanding.faq.q.pricing': 'می‌توانم محصولم را اشتراکی بفروشم؟',
  'creatorLanding.faq.a.pricing':
    'در حال حاضر نه. قیمت‌گذاری فقط رایگان یا پرداخت یک‌باره است و واحد پول ریال ایران است.',
  'creatorLanding.faq.q.refund': 'اگر خریدار درخواست بازگشت وجه بدهد چه می‌شود؟',
  'creatorLanding.faq.a.refund':
    'پنجرهٔ بازگشت وجه {refund} روز است و شرایط و استثناهای آن در سیاست بازگشت وجه آمده است. بازگشت وجه تأییدشده روی درآمد نگهداشت‌شدهٔ همان فروش اثر می‌گذارد.',
  'creatorLanding.faq.q.timeline': 'بازبینی چقدر طول می‌کشد؟',
  'creatorLanding.faq.a.timeline':
    'MESH زمان مشخصی برای بررسی تعهد نمی‌کند. وضعیت و بازخورد بازبینی در استودیوی سازنده قابل پیگیری است.',
  'creatorLanding.faq.q.ownership': 'مالکیت محصولم چه می‌شود؟',
  'creatorLanding.faq.a.ownership':
    'مالکیت نزد شما می‌ماند. با انتشار، مجوزی غیرانحصاری به MESH می‌دهید تا اطلاعات فهرست را برای نمایش، جست‌وجو و معرفی محصول در پلتفرم به کار ببرد. جزئیات در شرایط استفاده آمده است.',

  // ---- final CTA -----------------------------------------------------------
  'creatorLanding.final.title': 'محصولی بسازید که',
  'creatorLanding.final.titleEm': 'به کار بیاید.',
  'creatorLanding.final.lead': 'هر محصول کاربردی، از یک مسئلهٔ واقعی شروع می‌شود.',
  'creatorLanding.final.kicker': 'آماده‌اید شروع کنید؟',
  'creatorLanding.final.panel': 'محصولتان را معرفی کنید، به خریدار برسید و با بازخورد واقعی رشد کنید.',
  'creatorLanding.final.benefit.share': 'سهم {share} از هر فروش',
  'creatorLanding.final.benefit.version': 'نسخهٔ منتشرشدهٔ تغییرناپذیر',
  'creatorLanding.final.benefit.feedback': 'بازخورد بازبینی قابل پیگیری',
};
