import { DataSource } from 'typeorm';
import { BlogCategory } from '../entities/blog/blog-category.entity';
import { BlogPostTag } from '../entities/blog/blog-post-links.entity';
import { BlogPost } from '../entities/blog/blog-post.entity';
import { BlogTag } from '../entities/blog/blog-tag.entity';
import { User } from '../entities/identity/user.entity';
import { renderBlogMarkdown } from '../../modules/blog/domain/blog-markdown';
import { buildSearchText } from '../../modules/blog/domain/blog-search';

/**
 * Demo blog content (never in production). The seeded database used to ship
 * with ZERO blog posts, so `/blog` rendered its empty state on every fresh
 * checkout and looked broken. These articles are rendered through the same
 * markdown domain the admin editor uses (`renderBlogMarkdown`), carry the
 * platform's real rules (15 % commission, 14-day holding and refund window,
 * 7-day payout cooldown) and are idempotent: nothing is written when any
 * blog post already exists.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

interface DemoCategory {
  slug: string;
  name: string;
  nameEn: string;
  description: string;
  sortOrder: number;
}

interface DemoPost {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  daysAgo: number;
  featured?: boolean;
  seoTitle: string;
  seoDescription: string;
  body: string;
}

const DEMO_BLOG_CATEGORIES: DemoCategory[] = [
  {
    slug: 'buyers-guide',
    name: 'راهنمای خریداران',
    nameEn: 'Buyer guides',
    description:
      'انتخاب، خرید و استفادهٔ مطمئن از Agentها: از اولین خرید تا بازگشت وجه.',
    sortOrder: 1,
  },
  {
    slug: 'creator-playbook',
    name: 'دفترچهٔ سازندگان',
    nameEn: 'Creator playbook',
    description:
      'انتشار، بازبینی، درآمد و تسویه برای کسانی که در MESH محصول می‌سازند.',
    sortOrder: 2,
  },
];

const DEMO_BLOG_TAGS: Array<{ slug: string; name: string }> = [
  { slug: 'getting-started', name: 'شروع کار' },
  { slug: 'payments', name: 'پرداخت' },
  { slug: 'refunds', name: 'بازگشت وجه' },
  { slug: 'payouts', name: 'تسویه' },
  { slug: 'publishing', name: 'انتشار' },
];

const DEMO_BLOG_POSTS: DemoPost[] = [
  {
    slug: 'how-to-choose-your-first-ai-agent',
    title: 'چطور اولین Agent خود را انتخاب کنیم؟',
    excerpt:
      'پیش از خرید، سه چیز را بخوانید: نیازمندی‌ها، مدل تحویل و سیاست داده. این راهنما نشان می‌دهد هر کدام را کجا پیدا کنید.',
    category: 'buyers-guide',
    tags: ['getting-started'],
    daysAgo: 21,
    featured: true,
    seoTitle: 'انتخاب اولین Agent در MESH',
    seoDescription:
      'راهنمای کوتاه انتخاب اولین Agent: نیازمندی‌ها، مدل تحویل، سیاست داده و نشانه‌های اعتماد در صفحهٔ محصول.',
    body: `هر صفحهٔ محصول در MESH یک قرارداد کوچک است: سازنده می‌گوید محصول چه می‌کند، چه چیزی لازم دارد و با دادهٔ شما چه می‌کند. اگر این سه بخش را پیش از خرید بخوانید، تقریباً هیچ‌وقت غافلگیر نمی‌شوید.

## ۱. نیازمندی‌ها را جدی بگیرید

بخش «نیازمندی‌ها» می‌گوید برای اجرای محصول به چه چیزی نیاز دارید — مثلاً کلید API یک سرویس ثالث، یک حساب کاری یا دسترسی به یک ابزار مشخص. اگر یکی از این‌ها را ندارید، محصول برای شما کار نمی‌کند؛ هرچند خرید انجام شده باشد.

> [!TIP]
> اگر نیازمندی مبهم است، از همان صفحهٔ محصول با سازنده تماس بگیرید. پاسخ سازنده بخشی از سابقهٔ محصول می‌ماند.

## ۲. مدل تحویل را بشناسید

- **دانلود**: فایل یا بستهٔ محصول پس از پرداخت در کتابخانهٔ شما قرار می‌گیرد.
- **لینک دسترسی**: محصول روی زیرساخت سازنده اجرا می‌شود و شما لینک یا اعتبار دسترسی می‌گیرید.
- **راهنمای راه‌اندازی**: محصول با یک سند گام‌به‌گام همراه است و خودتان آن را مستقر می‌کنید.

## ۳. سیاست داده و مجوزها

سازنده باید بگوید محصول چه داده‌ای را می‌خواند، کجا می‌فرستد و چقدر نگه می‌دارد. محصولات با نشان «دادهٔ شفاف» این بخش را کامل پر کرده‌اند. اگر این بخش خالی است، فرض کنید محصول به همهٔ چیزی که به آن می‌دهید دسترسی دارد.

## نشانه‌های اعتماد

| نشانه | معنی |
| --- | --- |
| بازبینی امنیتی | تیم MESH محصول را پیش از انتشار بررسی کرده است |
| سازندهٔ تأییدشده | هویت سازنده احراز شده است |
| امتیاز و نظرات | فقط خریداران واقعی می‌توانند نظر بدهند |

اگر پس از خرید محصول با توضیحاتش نمی‌خواند، تا ۱۴ روز می‌توانید درخواست بازگشت وجه ثبت کنید. جزئیات در [راهنمای بازگشت وجه](/docs/refunds) آمده است.`,
  },
  {
    slug: 'refunds-explained',
    title: 'بازگشت وجه در MESH دقیقاً چطور کار می‌کند؟',
    excerpt:
      'پنجرهٔ ۱۴ روزه، دلایل پذیرفته‌شده و اینکه پول شما در این مدت کجاست — بدون ابهام.',
    category: 'buyers-guide',
    tags: ['refunds', 'payments'],
    daysAgo: 14,
    seoTitle: 'بازگشت وجه در MESH',
    seoDescription:
      'پنجرهٔ ۱۴ روزهٔ بازگشت وجه، دلایل پذیرفته‌شده، مسیر درخواست و زمان برگشت مبلغ.',
    body: `قاعده ساده است: تا **۱۴ روز** پس از پرداخت می‌توانید برای هر خرید درخواست بازگشت وجه ثبت کنید. در همین مدت، سهم سازنده هم در وضعیت «نگه‌داشت» است و هنوز قابل برداشت نیست؛ یعنی بازگشت وجه هیچ‌وقت به «پول خرج‌شده» برنمی‌خورد.

## چه دلایلی پذیرفته می‌شود؟

1. محصول با توضیحات صفحهٔ آن نمی‌خواند.
2. محصول با نیازمندی‌های اعلام‌شده اجرا نمی‌شود و سازنده پاسخ نمی‌دهد.
3. دسترسی یا فایل تحویل داده نشده است.

> [!NOTE]
> «نظرم عوض شد» برای محصولات دانلودی پس از دریافت فایل پذیرفته نمی‌شود، اما پیش از آن بله.

## مسیر درخواست

از صفحهٔ **سفارش‌ها** روی سفارش موردنظر بروید و «درخواست بازگشت وجه» را بزنید. دلیل را انتخاب کنید و اگر لازم است توضیح بدهید. سازنده ۳ روز فرصت پاسخ دارد؛ اگر پاسخ ندهد یا اختلاف حل نشود، تیم MESH تصمیم می‌گیرد.

## پول کی برمی‌گردد؟

پس از تأیید، مبلغ به همان روش پرداخت برمی‌گردد. زمان رسیدن مبلغ به حساب شما به بانک بستگی دارد و معمولاً بین ۲ تا ۷ روز کاری است. وضعیت هر مرحله در صفحهٔ سفارش ثبت می‌شود.

متن کامل و الزام‌آور در [سیاست بازگشت وجه و لغو](/legal/refunds) آمده است.`,
  },
  {
    slug: 'from-draft-to-published',
    title: 'از پیش‌نویس تا انتشار: چرخهٔ بازبینی محصول',
    excerpt:
      'هر محصول پیش از انتشار یک بار بازبینی می‌شود. این مقاله می‌گوید بازبین دقیقاً چه چیزی را نگاه می‌کند و چطور بار اول قبول شوید.',
    category: 'creator-playbook',
    tags: ['publishing'],
    daysAgo: 9,
    seoTitle: 'چرخهٔ بازبینی محصول برای سازندگان',
    seoDescription:
      'بازبینی محصول در MESH چه چیزی را می‌سنجد، چقدر طول می‌کشد و چطور بار اول قبول شوید.',
    body: `بازبینی برای این نیست که جلوی شما را بگیرد؛ برای این است که خریدار به صفحهٔ محصول اعتماد کند. بیشتر ردشدن‌ها به چهار دلیل تکراری اتفاق می‌افتد — و هر چهار تا پیش از ارسال قابل پیشگیری است.

## بازبین چه چیزی را نگاه می‌کند؟

- **صداقت توضیحات**: آنچه محصول انجام می‌دهد و آنچه انجام نمی‌دهد، هر دو نوشته شده باشد.
- **نیازمندی‌ها**: هر کلید، حساب یا ابزار لازم فهرست شده باشد.
- **سیاست داده**: داده‌ها کجا می‌روند و چقدر می‌مانند.
- **قابل اجرا بودن**: راهنمای راه‌اندازی روی یک محیط تمیز واقعاً جواب بدهد.

## چرخه

1. پیش‌نویس را کامل کنید و «ارسال برای بازبینی» را بزنید.
2. وضعیت محصول به **در حال بازبینی** می‌رود؛ در این مدت می‌توانید پیش‌نویس را ویرایش کنید اما نسخهٔ ارسالی ثابت می‌ماند.
3. نتیجه یکی از این دو است: **منتشر شد** یا **نیاز به تغییر** همراه با یادداشت دقیق بازبین.
4. پس از اعمال تغییرات، دوباره ارسال کنید؛ فقط موارد یادداشت‌شده دوباره بررسی می‌شود.

> [!WARNING]
> نسخه‌های بعدی محصول هم بازبینی می‌شوند، اما خریداران فعلی تا تأیید نسخهٔ جدید همچنان به نسخهٔ قبلی دسترسی دارند.

## چطور بار اول قبول شوید

یک نفر دیگر را پیدا کنید که با راهنمای شما و بدون کمک، محصول را راه بیندازد. اگر او موفق شد، بازبین هم موفق می‌شود.`,
  },
  {
    slug: 'earnings-holding-and-payouts',
    title: 'درآمد، نگه‌داشت و تسویه: پول شما چه مسیری را طی می‌کند',
    excerpt:
      'کارمزد ۱۵ درصدی، نگه‌داشت ۱۴ روزه و فاصلهٔ ۷ روزهٔ بین برداشت‌ها — با یک مثال عددی.',
    category: 'creator-playbook',
    tags: ['payouts', 'payments'],
    daysAgo: 3,
    seoTitle: 'درآمد و تسویهٔ سازندگان در MESH',
    seoDescription:
      'کارمزد ۱۵ درصد، نگه‌داشت ۱۴ روزه و قواعد برداشت برای سازندگان MESH، با مثال عددی.',
    body: `هر فروش در MESH یک مسیر مشخص دارد: پرداخت خریدار، کسر کارمزد، نگه‌داشت، و در نهایت موجودی قابل برداشت. اگر این مسیر را بشناسید، هیچ عددی در صفحهٔ درآمد غافلگیرتان نمی‌کند.

## اعداد

| مرحله | قاعده |
| --- | --- |
| کارمزد پلتفرم | ۱۵٪ از مبلغ فروش |
| سهم سازنده | ۸۵٪ |
| نگه‌داشت | ۱۴ روز پس از پرداخت (هم‌راستا با پنجرهٔ بازگشت وجه) |
| فاصلهٔ برداشت‌ها | دست‌کم ۷ روز بین دو درخواست |

## یک مثال

خریدار محصولی را به مبلغ ۱٬۰۰۰٬۰۰۰ ریال می‌خرد.

- ۱۵۰٬۰۰۰ ریال کارمزد پلتفرم است.
- ۸۵۰٬۰۰۰ ریال به‌عنوان «در نگه‌داشت» در درآمد شما ثبت می‌شود.
- پس از ۱۴ روز — اگر بازگشت وجهی ثبت نشده باشد — همان مبلغ به «قابل برداشت» منتقل می‌شود.
- اگر در این مدت بازگشت وجه تأیید شود، مبلغ از نگه‌داشت کسر می‌شود، نه از برداشت‌های قبلی.

> [!NOTE]
> برای اولین برداشت باید احراز هویت (KYC) کامل و یک حساب بانکی تأییدشده داشته باشید. تا پیش از آن موجودی قابل برداشت جمع می‌شود اما قابل درخواست نیست.

## درخواست برداشت

از بخش **درآمد** مبلغ را وارد کنید و درخواست را ثبت کنید. هر درخواست در صفحهٔ درآمد با وضعیت و زمان ثبت می‌شود و پس از پرداخت، شناسهٔ تراکنش بانک هم به آن اضافه می‌شود. جزئیات قراردادی در [راهنمای درآمد و تسویه](/docs/earnings-and-payouts) آمده است.`,
  },
];

export interface BlogDemoSummary {
  skipped: boolean;
  categories: number;
  tags: number;
  posts: number;
}

export async function seedBlogDemo(
  dataSource: DataSource,
  adminEmail: string,
): Promise<BlogDemoSummary> {
  const posts = dataSource.getRepository(BlogPost);
  if ((await posts.count()) > 0) {
    return { skipped: true, categories: 0, tags: 0, posts: 0 };
  }
  const admin = await dataSource
    .getRepository(User)
    .findOneByOrFail({ email: adminEmail });

  return dataSource.transaction(async (em) => {
    const categoryIds = new Map<string, string>();
    for (const category of DEMO_BLOG_CATEGORIES) {
      const existing = await em
        .getRepository(BlogCategory)
        .findOneBy({ slug: category.slug });
      const row =
        existing ??
        (await em.getRepository(BlogCategory).save(
          em.getRepository(BlogCategory).create({
            slug: category.slug,
            name: category.name,
            nameEn: category.nameEn,
            description: category.description,
            sortOrder: category.sortOrder,
            isActive: true,
          }),
        ));
      categoryIds.set(category.slug, row.id);
    }

    const tagIds = new Map<string, string>();
    for (const tag of DEMO_BLOG_TAGS) {
      const existing = await em
        .getRepository(BlogTag)
        .findOneBy({ slug: tag.slug });
      const row =
        existing ??
        (await em
          .getRepository(BlogTag)
          .save(
            em
              .getRepository(BlogTag)
              .create({ slug: tag.slug, name: tag.name }),
          ));
      tagIds.set(tag.slug, row.id);
    }

    let created = 0;
    for (const demo of DEMO_BLOG_POSTS) {
      const rendered = renderBlogMarkdown(demo.body);
      const publishedAt = new Date(Date.now() - demo.daysAgo * DAY_MS);
      const saved = await em.getRepository(BlogPost).save(
        em.getRepository(BlogPost).create({
          slug: demo.slug,
          title: demo.title,
          excerpt: demo.excerpt,
          bodyMarkdown: demo.body,
          bodyBlocks: rendered.blocks,
          toc: rendered.toc,
          wordCount: rendered.wordCount,
          readingMinutes: rendered.readingMinutes,
          // Same composition and folding as BlogPostsService.applyRender.
          searchText: buildSearchText(
            demo.title,
            demo.excerpt,
            rendered.plainText,
          ),
          authorUserId: admin.id,
          status: 'published',
          publishedAt,
          contentUpdatedAt: publishedAt,
          seoTitle: demo.seoTitle,
          seoDescription: demo.seoDescription,
          primaryCategoryId: categoryIds.get(demo.category) ?? null,
          isFeatured: demo.featured === true,
          sources: [],
          version: 1,
          createdBy: admin.id,
          updatedBy: admin.id,
        }),
      );
      for (const tagSlug of demo.tags) {
        const tagId = tagIds.get(tagSlug);
        if (!tagId) continue;
        await em
          .getRepository(BlogPostTag)
          .save(
            em.getRepository(BlogPostTag).create({ postId: saved.id, tagId }),
          );
      }
      created += 1;
    }
    console.log(
      `[seed] demo blog created: ${DEMO_BLOG_CATEGORIES.length} categories, ${DEMO_BLOG_TAGS.length} tags, ${created} published posts`,
    );
    return {
      skipped: false,
      categories: DEMO_BLOG_CATEGORIES.length,
      tags: DEMO_BLOG_TAGS.length,
      posts: created,
    };
  });
}
