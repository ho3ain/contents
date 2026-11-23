import { normalizeText, tokenize, stemToken } from './search-text';

/**
 * Bilingual concept dictionary for tolerant search (M2).
 *
 * A concept is a small cluster of terms that mean "the same thing" to a
 * buyer ("support" ⇄ "helpdesk" ⇄ "پشتیبانی"). A query token that matches
 * ANY term activates the concept and the whole cluster becomes OR
 * alternatives for that token. This is deliberately a plain, reviewable,
 * data-only dictionary — it is the extension point where embedding /
 * semantic retrieval can later be plugged in (see `SemanticExpander`),
 * without touching the SQL ranking.
 */
export interface Concept {
  id: string;
  /** Normalized terms; multi-word terms are phrases. */
  terms: string[];
}

const RAW_CONCEPTS: Array<{ id: string; terms: string[] }> = [
  {
    id: 'support',
    terms: [
      'support',
      'helpdesk',
      'help desk',
      'customer service',
      'customer support',
      'customer care',
      'service desk',
      'پشتیبانی',
      'پاسخگویی',
      'خدمات مشتریان',
      'خدمات مشتری',
      'میز خدمت',
      'پشتیبان',
    ],
  },
  {
    id: 'customer',
    terms: [
      'customer',
      'customers',
      'client',
      'clients',
      'مشتری',
      'مشتریان',
      'کاربران',
      'مراجعین',
    ],
  },
  {
    id: 'ticket',
    terms: [
      'ticket',
      'tickets',
      'ticketing',
      'triage',
      'zendesk',
      'freshdesk',
      'intercom',
      'تیکت',
      'درخواست پشتیبانی',
      'اولویت بندی',
    ],
  },
  {
    id: 'routing',
    terms: [
      'routing',
      'route',
      'assignment',
      'assign',
      'escalation',
      'classification',
      'classify',
      'categorization',
      'intent',
      'مسیریابی',
      'ارجاع',
      'دسته بندی',
      'طبقه بندی',
      'تشخیص نیت',
    ],
  },
  {
    id: 'automation',
    terms: [
      'automation',
      'automate',
      'automated',
      'automatic',
      'automating',
      'workflow',
      'workflows',
      'bot',
      'autopilot',
      'اتوماسیون',
      'خودکار',
      'خودکارسازی',
      'گردش کار',
      'ورکفلو',
      'ربات',
    ],
  },
  {
    id: 'chatbot',
    terms: [
      'chatbot',
      'chat bot',
      'assistant',
      'copilot',
      'conversational',
      'chat',
      'چت بات',
      'چتبات',
      'دستیار',
      'گفتگو',
      'چت',
    ],
  },
  {
    id: 'knowledge',
    terms: [
      'knowledge base',
      'knowledge',
      'faq',
      'documentation',
      'docs',
      'wiki',
      'پایگاه دانش',
      'سوالات متداول',
      'مستندات',
      'دانش',
    ],
  },
  {
    id: 'sales',
    terms: [
      'sales',
      'selling',
      'lead',
      'leads',
      'prospecting',
      'outreach',
      'crm',
      'pipeline',
      'deal',
      'فروش',
      'سرنخ',
      'مشتری بالقوه',
      'سی آر ام',
      'فروشندگی',
    ],
  },
  {
    id: 'marketing',
    terms: [
      'marketing',
      'campaign',
      'campaigns',
      'advertising',
      'ads',
      'seo',
      'social media',
      'newsletter',
      'بازاریابی',
      'تبلیغات',
      'کمپین',
      'شبکه اجتماعی',
      'سئو',
      'محتوا',
    ],
  },
  {
    id: 'content',
    terms: [
      'content',
      'writing',
      'copywriting',
      'blog',
      'article',
      'caption',
      'copy',
      'نویسندگی',
      'تولید محتوا',
      'مقاله',
      'بلاگ',
      'متن',
    ],
  },
  {
    id: 'email',
    terms: [
      'email',
      'emails',
      'inbox',
      'mail',
      'gmail',
      'ایمیل',
      'نامه',
      'صندوق ورودی',
    ],
  },
  {
    id: 'hr',
    terms: [
      'hr',
      'human resources',
      'recruiting',
      'recruitment',
      'hiring',
      'onboarding',
      'employee',
      'employees',
      'talent',
      'resume',
      'منابع انسانی',
      'استخدام',
      'جذب',
      'کارمند',
      'کارکنان',
      'رزومه',
      'آنبوردینگ',
      'پذیرش کارمند',
    ],
  },
  {
    id: 'finance',
    terms: [
      'finance',
      'financial',
      'accounting',
      'invoice',
      'invoices',
      'billing',
      'bookkeeping',
      'expense',
      'expenses',
      'payment',
      'payments',
      'accounts payable',
      'مالی',
      'حسابداری',
      'فاکتور',
      'صورتحساب',
      'هزینه',
      'پرداخت',
      'مالیات',
    ],
  },
  {
    id: 'data',
    terms: [
      'data',
      'analytics',
      'analysis',
      'report',
      'reports',
      'reporting',
      'dashboard',
      'spreadsheet',
      'sheet',
      'sheets',
      'excel',
      'csv',
      'داده',
      'داده ها',
      'تحلیل',
      'گزارش',
      'گزارش گیری',
      'داشبورد',
      'اکسل',
      'صفحه گسترده',
      'آنالیز',
      'دیتا',
      'آنالیز دیتا',
      'تحلیل داده',
    ],
  },
  {
    id: 'operations',
    terms: [
      'operations',
      'ops',
      'process',
      'processes',
      'productivity',
      'task',
      'tasks',
      'checklist',
      'عملیات',
      'فرایند',
      'فرآیند',
      'بهره وری',
      'وظیفه',
      'چک لیست',
    ],
  },
  {
    id: 'document',
    terms: [
      'document',
      'documents',
      'pdf',
      'extraction',
      'extract',
      'ocr',
      'contract',
      'contracts',
      'سند',
      'اسناد',
      'مدارک',
      'استخراج',
      'قرارداد',
      'پی دی اف',
    ],
  },
  {
    id: 'summary',
    terms: [
      'summary',
      'summarize',
      'summarization',
      'summarise',
      'digest',
      'خلاصه',
      'خلاصه سازی',
      'چکیده',
    ],
  },
  {
    id: 'translation',
    terms: [
      'translation',
      'translate',
      'translator',
      'localization',
      'ترجمه',
      'مترجم',
      'بومی سازی',
    ],
  },
  {
    id: 'scheduling',
    terms: [
      'scheduling',
      'schedule',
      'calendar',
      'meeting',
      'meetings',
      'appointment',
      'booking',
      'زمانبندی',
      'زمان بندی',
      'تقویم',
      'جلسه',
      'قرار ملاقات',
      'رزرو',
    ],
  },
  {
    id: 'ecommerce',
    terms: [
      'ecommerce',
      'e-commerce',
      'shop',
      'store',
      'shopify',
      'woocommerce',
      'product catalog',
      'فروشگاه',
      'فروشگاه اینترنتی',
      'تجارت الکترونیک',
      'کاتالوگ',
    ],
  },
  {
    id: 'code',
    terms: [
      'code',
      'coding',
      'developer',
      'developers',
      'programming',
      'devops',
      'api',
      'github',
      'کد',
      'برنامه نویسی',
      'توسعه دهنده',
      'برنامه نویس',
    ],
  },
  {
    id: 'security',
    terms: [
      'security',
      'compliance',
      'privacy',
      'audit',
      'risk',
      'امنیت',
      'انطباق',
      'حریم خصوصی',
      'ممیزی',
      'ریسک',
    ],
  },
  {
    id: 'design',
    terms: [
      'design',
      'image',
      'images',
      'graphic',
      'creative',
      'video',
      'طراحی',
      'تصویر',
      'گرافیک',
      'ویدیو',
      'ویدئو',
    ],
  },
  {
    id: 'research',
    terms: [
      'research',
      'market research',
      'competitor',
      'competitors',
      'scraping',
      'scrape',
      'تحقیق',
      'پژوهش',
      'رقبا',
      'تحلیل بازار',
      'ریسرچ',
      'انجام ریسرچ',
    ],
  },
  {
    id: 'notification',
    terms: [
      'notification',
      'notifications',
      'notify',
      'alert',
      'alerts',
      'reminder',
      'اعلان',
      'اطلاع رسانی',
      'هشدار',
      'یادآوری',
    ],
  },
  // ---- Taxonomy v2 (2026-10): concepts for the categories/industries that
  // were added from the AI Agent Store reference taxonomy. Terms mirror the
  // `aliases` stored on the catalog rows so search and taxonomy agree.
  {
    id: 'voice',
    terms: [
      'voice',
      'voice agent',
      'call',
      'calls',
      'phone',
      'telephony',
      'speech',
      'speech to text',
      'text to speech',
      'ivr',
      'صوتی',
      'صدا',
      'تماس',
      'تماس تلفنی',
      'تلفن',
      'منشی تلفنی',
      'تلفن گویا',
      'گفتار به متن',
    ],
  },
  {
    id: 'video',
    terms: [
      'video',
      'videos',
      'subtitle',
      'subtitles',
      'editing',
      'youtube',
      'ویدیو',
      'ویدئو',
      'فیلم',
      'زیرنویس',
      'تدوین',
      'یوتیوب',
    ],
  },
  {
    id: 'workflow',
    terms: [
      'workflow',
      'workflows',
      'n8n',
      'zapier',
      'make.com',
      'integration',
      'pipeline',
      'ورک فلو',
      'گردش کار',
      'فرایند',
      'اتصال ابزارها',
      'یکپارچه سازی',
    ],
  },
  {
    id: 'assistant',
    terms: [
      'assistant',
      'assistants',
      'personal assistant',
      'copilot',
      'secretary',
      'دستیار',
      'دستیار شخصی',
      'دستیار هوشمند',
      'منشی',
      'منشی هوشمند',
    ],
  },
  {
    id: 'testing',
    terms: [
      'testing',
      'test',
      'tests',
      'qa',
      'quality assurance',
      'bug',
      'bugs',
      'تست',
      'تست نرم افزار',
      'تضمین کیفیت',
      'باگ',
      'کیوای',
    ],
  },
  {
    id: 'observability',
    terms: [
      'observability',
      'monitoring',
      'monitor',
      'tracing',
      'logging',
      'evaluation',
      'مانیتورینگ',
      'پایش',
      'لاگ',
      'ارزیابی',
    ],
  },
  {
    id: 'framework',
    terms: [
      'framework',
      'frameworks',
      'sdk',
      'library',
      'libraries',
      'langchain',
      'crewai',
      'autogen',
      'فریم ورک',
      'چارچوب',
      'کتابخانه',
      'اس دی کی',
    ],
  },
  {
    id: 'platform',
    terms: [
      'platform',
      'no-code',
      'no code',
      'low-code',
      'low code',
      'dify',
      'flowise',
      'پلتفرم',
      'بدون کد',
      'کم کد',
      'نوکد',
    ],
  },
  {
    id: 'legal',
    terms: [
      'legal',
      'law',
      'lawyer',
      'contract',
      'contracts',
      'compliance',
      'حقوقی',
      'قانون',
      'وکیل',
      'قرارداد',
      'انطباق',
    ],
  },
  {
    id: 'health',
    terms: [
      'health',
      'healthcare',
      'medical',
      'clinic',
      'hospital',
      'patient',
      'سلامت',
      'درمان',
      'پزشکی',
      'کلینیک',
      'بیمارستان',
      'بیمار',
    ],
  },
  {
    id: 'education',
    terms: [
      'education',
      'learning',
      'course',
      'courses',
      'teacher',
      'student',
      'tutor',
      'آموزش',
      'یادگیری',
      'دوره',
      'معلم',
      'دانش آموز',
      'دانشجو',
    ],
  },
  {
    id: 'realestate',
    terms: [
      'real estate',
      'property',
      'housing',
      'املاک',
      'مسکن',
      'ملک',
      'مشاور املاک',
    ],
  },
  {
    id: 'restaurant',
    terms: [
      'restaurant',
      'restaurants',
      'cafe',
      'food',
      'menu',
      'رستوران',
      'کافه',
      'غذا',
      'منو',
    ],
  },
  {
    id: 'travel',
    terms: [
      'travel',
      'tourism',
      'hotel',
      'booking',
      'trip',
      'سفر',
      'گردشگری',
      'هتل',
      'رزرو',
      'تور',
    ],
  },
  {
    id: 'messaging',
    terms: [
      'telegram',
      'whatsapp',
      'messenger',
      'bale',
      'eitaa',
      'تلگرام',
      'واتساپ',
      'واتس اپ',
      'پیام رسان',
      'بله',
      'ایتا',
    ],
  },
];

export const CONCEPTS: Concept[] = RAW_CONCEPTS.map((concept) => ({
  id: concept.id,
  terms: [...new Set(concept.terms.map((term) => normalizeText(term).trim()))],
}));

interface TermIndexEntry {
  concept: Concept;
  words: string[];
  stems: string[];
}

const TERM_INDEX: TermIndexEntry[] = CONCEPTS.flatMap((concept) =>
  concept.terms.map((term) => {
    const words = tokenize(term);
    return { concept, words, stems: words.map((word) => stemToken(word)) };
  }),
);

/** Single-word terms: stem → concepts. */
const SINGLE_WORD_INDEX = new Map<string, Set<Concept>>();
for (const entry of TERM_INDEX) {
  if (entry.words.length !== 1) continue;
  const key = entry.stems[0];
  const set = SINGLE_WORD_INDEX.get(key) ?? new Set<Concept>();
  set.add(entry.concept);
  SINGLE_WORD_INDEX.set(key, set);
}

/** Concepts triggered by one (stemmed) query token. */
export function conceptsForToken(stem: string): Concept[] {
  return [...(SINGLE_WORD_INDEX.get(stem) ?? [])];
}

/**
 * Multi-word phrase terms that occur as a consecutive run inside the query
 * token stems. Returns the concept and the [start, end) token range.
 */
export function conceptPhrasesIn(
  stems: string[],
): Array<{ concept: Concept; start: number; end: number }> {
  const found: Array<{ concept: Concept; start: number; end: number }> = [];
  for (const entry of TERM_INDEX) {
    if (entry.words.length < 2) continue;
    for (
      let start = 0;
      start + entry.stems.length <= stems.length;
      start += 1
    ) {
      if (entry.stems.every((stem, offset) => stems[start + offset] === stem)) {
        found.push({
          concept: entry.concept,
          start,
          end: start + entry.stems.length,
        });
      }
    }
  }
  // Longest phrase first so a 3-word phrase wins over its 2-word part.
  return found.sort((a, b) => b.end - b.start - (a.end - a.start));
}

/**
 * Extension point for a future semantic layer (embeddings, LLM query
 * rewriting). The default implementation is the dictionary above; a
 * replacement only has to return extra alternative terms for a token.
 */
export interface SemanticExpander {
  expand(token: string): string[];
}
