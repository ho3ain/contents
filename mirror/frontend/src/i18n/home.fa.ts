/**
 * Public homepage (Persian). Keys: `home.*`. English twin: `home.en.ts` —
 * identical key set, asserted by `__tests__/home-i18n.test.ts`.
 *
 * Every number quoted here is interpolated from `content/platform-facts.ts`
 * (`{share}`, `{holding}`, `{days}`) or from live API data (`{count}`); the
 * copy never states a figure of its own.
 */
export const homeFa: Record<string, string> = {
  // ---- page meta
  'home.meta.title': 'MESH | بازار ایجنت‌های هوش مصنوعی',
  'home.meta.description':
    'ایجنت هوش مصنوعی مناسب کار خود را پیدا کنید: نیازتان را بنویسید، دسته‌ها را مرور کنید و ایجنت‌های منتشرشدهٔ سازندگان را با توضیحات کامل، قیمت شفاف و امتیاز خریداران مقایسه کنید.',

  // ---- hero + quick search
  'home.hero.title': 'ایجنت هوش مصنوعی مناسب کار خود را پیدا کنید.',
  'home.hero.lead':
    'MESH بازار ایجنت‌های هوش مصنوعی است. نیازتان را بنویسید، دسته‌ها را مرور کنید و ایجنت‌های منتشرشدهٔ سازندگان را با توضیحات کامل، قیمت شفاف و امتیاز خریداران مقایسه کنید.',
  'home.search.label': 'جستجوی ایجنت',
  'home.search.placeholder': 'چه کاری را می‌خواهید خودکار کنید؟',
  'home.search.submit': 'جستجو',
  'home.search.emptyHint': 'برای جستجو، ابتدا عبارتی وارد کنید.',
  'home.search.suggestionsLabel': 'جستجوهای پرتکرار',
  'home.search.chip.sales': 'فروش',
  'home.search.chip.data': 'آنالیز دیتا',
  'home.search.chip.support': 'پشتیبانی مشتریان',
  'home.search.chip.research': 'انجام ریسرچ',
  'home.path.label': 'مسیر کشف در MESH: از نیاز به دسته و سپس ایجنت',
  'home.path.need': 'نیاز',
  'home.path.needHint': 'کاری که می‌خواهید انجام شود',
  'home.path.category': 'دسته',
  'home.path.categoryHint': 'حوزهٔ کاری مرتبط',
  'home.path.agent': 'ایجنت',
  'home.path.agentHint': 'محصول منتشرشدهٔ یک سازنده',

  // ---- entry paths
  'home.entry.label': 'مسیرهای ورود',
  'home.entry.buyer.kicker': 'برای خریداران',
  'home.entry.buyer.title': 'ایجنت پیدا کنید و همان‌جا استفاده کنید',
  'home.entry.buyer.text': 'جستجو، مقایسهٔ قیمت و امتیازها، پرداخت از درگاه بانکی و دسترسی به خریدها از کتابخانهٔ شما.',
  'home.entry.buyer.cta': 'مرور ایجنت‌ها',
  'home.entry.buyer.ctaMember': 'کتابخانهٔ من',
  'home.entry.creator.kicker': 'برای سازندگان',
  'home.entry.creator.title': 'ایجنت خود را منتشر کنید و از هر فروش درآمد داشته باشید',
  'home.entry.creator.text': 'محصول خود را منتشر و مدیریت کنید. پیش از خرید، صفحهٔ محصول باید قیمت، شیوهٔ تحویل، محل اجرا و مسئول پشتیبانی را روشن کند.',
  'home.entry.creator.cta': 'شروع به‌عنوان سازنده',
  'home.entry.creator.learn': 'دربارهٔ برنامهٔ سازندگان',

  // ---- shared states
  'home.retry': 'تلاش دوباره',

  // ---- categories
  'home.categories.title': 'بر اساس حوزهٔ کاری مرور کنید',
  'home.categories.sub': 'دسته‌هایی که هم‌اکنون ایجنت منتشرشده دارند.',
  'home.categories.count': '{count} ایجنت',
  'home.categories.viewAll': 'همهٔ دسته‌ها',
  'home.categories.empty': 'هنوز دسته‌ای با ایجنت منتشرشده وجود ندارد.',
  'home.categories.error': 'فهرست دسته‌ها بارگذاری نشد.',
  'home.categories.loading': 'در حال بارگذاری دسته‌ها',

  // ---- featured agents
  'home.featured.title': 'ایجنت‌های پیشنهادی',
  'home.featured.sub': 'از میان ایجنت‌های منتشرشده، بر اساس امتیاز خریداران، استقبال و تازگی.',
  'home.featured.filtersLabel': 'فیلتر ایجنت‌های پیشنهادی',
  'home.featured.filter.all': 'همه',
  'home.featured.filter.free': 'رایگان',
  'home.featured.viewAll': 'مشاهدهٔ همهٔ ایجنت‌ها',
  'home.featured.viewAllFree': 'مشاهدهٔ همهٔ ایجنت‌های رایگان',
  'home.featured.empty': 'هنوز ایجنتی منتشر نشده است.',
  'home.featured.emptyFree': 'در حال حاضر ایجنت رایگانی منتشر نشده است.',
  'home.featured.error': 'فهرست ایجنت‌ها بارگذاری نشد.',
  'home.featured.loading': 'در حال بارگذاری ایجنت‌ها',
  'home.featured.few': 'در حال حاضر {count} ایجنت با این شرط منتشر شده است.',

  // ---- from need to outcome
  'home.steps.title': 'از نیاز تا نتیجه',
  'home.steps.sub': 'مسیر خرید در MESH همین چهار قدم است.',
  'home.steps.1.title': 'جستجو کنید',
  'home.steps.1.text': 'نیازتان را بنویسید یا از یک دسته شروع کنید.',
  'home.steps.2.title': 'بررسی کنید',
  'home.steps.2.text': 'توضیحات، نحوهٔ کار، قیمت نهایی و امتیاز خریداران هر ایجنت را ببینید.',
  'home.steps.3.title': 'دریافت کنید',
  'home.steps.3.text': 'ایجنت‌های رایگان را مستقیم فعال کنید؛ پرداخت ایجنت‌های پولی از درگاه بانکی انجام می‌شود.',
  'home.steps.4.title': 'استفاده کنید',
  'home.steps.4.text':
    'راهنمای راه‌اندازی و وضعیت دسترسی در کتابخانهٔ شماست؛ سفارش هم وضعیت هر درخواست بازگشت وجه را، در صورت در دسترس بودن، نشان می‌دهد.',

  // ---- creator ecosystem
  'home.creators.title': 'سازندگان پشت ایجنت‌ها',
  'home.creators.sub': 'هر ایجنت را یک سازنده منتشر می‌کند؛ پروفایل عمومی، سایر محصولات و وضعیت تأیید او برای همه قابل مشاهده است.',
  'home.creators.listLabel': 'سازندگان ایجنت‌های پیشنهادی',
  'home.creators.viewProfile': 'مشاهدهٔ پروفایل',
  'home.creators.point.share': 'جزئیات تجاری هر محصول، پیش از خرید در همان صفحه نمایش داده می‌شود',
  'home.creators.point.review': 'وضعیت بررسی فهرست از تضمین کیفیت، امنیت یا دسترس‌پذیری جداست',
  'home.creators.point.payout': 'خریدار می‌تواند از فضای محصول خود درخواست پشتیبانی ثبت کند',
  'home.creators.cta': 'شروع انتشار',
  'home.creators.learn': 'برنامهٔ سازندگان',

  // ---- trust & transparency
  'home.trust.title': 'آنچه پیش از خرید می‌بینید',
  'home.trust.sub': 'فقط چیزهایی که در خود محصول قابل بررسی است.',
  'home.trust.1.title': 'توضیحات و قیمت کامل',
  'home.trust.1.text': 'هر ایجنت توضیحات، نحوهٔ کار و قیمت نهایی را پیش از خرید نشان می‌دهد.',
  'home.trust.2.title': 'وضعیت بررسی فهرست',
  'home.trust.2.text': 'انتشار فهرست پس از بررسی فهرست انجام می‌شود؛ این وضعیت، گواهی امنیت، کیفیت، نتیجه یا دسترس‌پذیری نیست.',
  'home.trust.3.title': 'امتیاز فقط از خریداران',
  'home.trust.3.text': 'ثبت امتیاز و نظر تنها برای کسانی ممکن است که به آن ایجنت دسترسی گرفته‌اند.',
  'home.trust.4.title': 'پشتیبانی و وضعیت اسناد',
  'home.trust.4.text': 'راه تماس با پشتیبانی و وضعیت انتشار اسناد عمومی در دسترس است؛ ارسال درخواست پشتیبانی یا بازگشت وجه به‌تنهایی نتیجه یا تأیید آن را تضمین نمی‌کند.',
  'home.trust.link.contact': 'تماس با پشتیبانی',
  'home.trust.link.terms': 'شرایط استفاده',
  'home.trust.link.privacy': 'حریم خصوصی',
  'home.trust.link.refund': 'سیاست بازگشت وجه',
  'home.trust.link.docs': 'مرکز مستندات',

  // ---- FAQ
  // Answers restate behaviour that exists in the product and is already
  // documented; no finance figure appears here (Phase 9 keeps policy numbers
  // off the homepage — the docs and the terms own them).
  'home.faq.title': 'پرسش‌های پرتکرار',
  'home.faq.sub': 'پاسخ کوتاه؛ مرجع کامل هر موضوع در مرکز مستندات است.',
  'home.faq.1.q': 'MESH دقیقاً چه چیزی می‌فروشد؟',
  'home.faq.1.a': 'MESH یک بازار است: سازندگان محصول‌های هوش مصنوعی خود را اینجا معرفی و عرضه می‌کنند و شما آن‌ها را خریداری می‌کنید. خود MESH محصولی نمی‌سازد.',
  'home.faq.2.q': 'آیا MESH محصول‌ها را میزبانی یا اجرا می‌کند؟',
  'home.faq.2.a': 'نه. MESH هیچ محصولی را میزبانی، اجرا یا تحویل نمی‌دهد. میزبانی و اجرا بر عهدهٔ سازنده، خریدار یا یک سرویس ثالث است و در صفحهٔ هر محصول اعلام می‌شود.',
  'home.faq.3.q': 'پس از خرید دقیقاً چه چیزی دریافت می‌کنم؟',
  'home.faq.3.a': 'همان چیزی که سازنده در بخش «تحویل» محصول اعلام کرده است. دسترسی شما به نسخه‌ای که خریده‌اید پین می‌شود و در کتابخانهٔ شما باقی می‌ماند.',
  'home.faq.4.q': 'مشخصات محصول را چه کسی تأیید می‌کند؟',
  'home.faq.4.a': 'مشخصات، اظهار سازنده است. بازبینی MESH کامل‌بودن و سازگاری فهرست با قواعد پلتفرم را بررسی می‌کند و گواهی عملکرد، امنیت یا دسترس‌پذیری نیست.',
  'home.faq.5.q': 'اگر محصول آن چیزی نبود که اعلام شده بود چه؟',
  'home.faq.5.a': 'سیاست بازگشت وجه شرایط، بازهٔ زمانی و استثناها را مشخص می‌کند. درخواست را از بخش سفارش‌ها ثبت می‌کنید.',
  'home.faq.6.q': 'چطور خودم سازنده شوم؟',
  'home.faq.6.a': 'با هر ابزاری که می‌خواهید بسازید، سپس درخواست سازنده‌شدن بدهید. پس از تأیید پروفایل می‌توانید فهرست محصول را کامل و برای بازبینی ارسال کنید.',
  'home.faq.more': 'دیدن همهٔ مستندات',

  // ---- final CTA
  'home.cta.title': 'ایجنت بعدی‌تان را همین امروز پیدا کنید.',
  'home.cta.text': 'مرور ایجنت‌ها به حساب نیاز ندارد؛ برای خرید، ذخیرهٔ علاقه‌مندی‌ها و انتشار ایجنت، یک حساب رایگان بسازید.',
  'home.cta.textMember': 'از کتابخانهٔ خود به خریدها دسترسی دارید؛ ایجنت‌های تازه‌منتشرشده را در فهرست ایجنت‌ها ببینید.',
  'home.cta.register': 'ایجاد حساب رایگان',
  'home.cta.browse': 'مرور ایجنت‌ها',
  'home.cta.library': 'کتابخانهٔ من',
};
