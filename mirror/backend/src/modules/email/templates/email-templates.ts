/**
 * Localized transactional email templates (Batch 10 — Phase 19, §19/§20).
 *
 * - Two complete locales: `fa` (RTL) and `en` (LTR). A missing key in the
 *   requested locale falls back to `en` — never a broken/empty email.
 * - No user-facing text is hard-coded in services; they reference template
 *   ids and pass safe data (ids, names, amounts, codes).
 * - Responsive, accessible-ish table layout with inline styles (email
 *   clients strip stylesheets); Persian layouts render RTL via dir="rtl".
 */

export type EmailLocale = 'fa' | 'en';

export type EmailTemplateId =
  | 'email_verification_code'
  | 'password_reset'
  | 'purchase_confirmation'
  | 'new_sale'
  | 'payment_failed'
  | 'refund_processed'
  | 'creator_verification_result'
  // Phase A3 §38 — creator review lifecycle.
  | 'review_submission_received'
  | 'review_started'
  | 'review_action_required'
  | 'review_resubmission_received'
  | 'review_approved'
  | 'review_published'
  | 'review_rejected'
  // Gap closure — creator journey milestones.
  | 'creator_profile_approved'
  | 'creator_first_product_created'
  | 'creator_first_sale'
  // Account security alerts (sent to the account's own email address).
  | 'security_password_changed'
  | 'security_login_locked'
  | 'security_2fa_enabled'
  | 'security_2fa_disabled'
  // Phase C5 §35 — the six MEANINGFUL events only. §35 is explicit that C5
  // must not spam creators, so there is deliberately no email for a click, a
  // post, a comment or a reaction: those stay in-app.
  | 'c5_ambassador_invitation'
  | 'c5_affiliate_approved'
  | 'c5_referral_milestone'
  | 'c5_reward_available'
  | 'c5_partnership_update'
  | 'c5_community_invitation'
  // Phase C2 — the manual conversion invite. NOT a confirmation: nothing has
  // happened yet, this only asks the person to come and sign up.
  | 'creator_conversion_invite'
  // Phase C4 §11 — the case-study invitation.
  | 'creator_case_study_invite'
  // Sprint 1 (C2) — public contact form: operator notification + reply.
  | 'contact_received'
  | 'contact_reply';

/** Shared payload of every review lifecycle email. */
export interface ReviewEmailData {
  agentName: string;
  agentId: string;
  revisionNumber: number;
  recipientName?: string;
  /** action_required: open items; rejected: the reason line. */
  count?: number;
  reason?: string;
  version?: string;
}

export interface EmailTemplateData {
  email_verification_code: { code: string };
  password_reset: { code: string };
  purchase_confirmation: {
    agentName: string;
    orderId: string;
    amount: string;
    currency: string;
    /** Optional enrichment (§20): personalized greeting + deep links. */
    recipientName?: string;
    agentSlug?: string;
  };
  new_sale: {
    agentName: string;
    orderId: string;
    amount: string;
    currency: string;
    recipientName?: string;
    agentSlug?: string;
  };
  payment_failed: { orderId: string; recipientName?: string };
  refund_processed: {
    orderId: string;
    approved: boolean;
    recipientName?: string;
  };
  creator_verification_result: { approved: boolean; recipientName?: string };
  review_submission_received: ReviewEmailData;
  review_started: ReviewEmailData;
  review_action_required: ReviewEmailData;
  review_resubmission_received: ReviewEmailData;
  review_approved: ReviewEmailData;
  review_published: ReviewEmailData;
  review_rejected: ReviewEmailData;
  creator_profile_approved: { recipientName?: string; creatorSlug?: string };
  creator_first_product_created: {
    agentName: string;
    agentId: string;
    recipientName?: string;
  };
  creator_conversion_invite: {
    /** The growth team member's name — a warm invite, not a system mail. */
    senderName?: string;
    /** Optional personal note typed by the admin. */
    message?: string;
    /** Pre-filled referral code, so the invite credits the right channel. */
    referralCode?: string;
    recipientName?: string;
  };
  // ---- Phase C5 §35 payloads -------------------------------------------
  c5_ambassador_invitation: {
    recipientName?: string;
    benefits?: string[];
    referralCode?: string;
  };
  c5_affiliate_approved: {
    recipientName?: string;
    affiliateCode: string;
    rateBps?: number;
  };
  c5_referral_milestone: {
    recipientName?: string;
    count: number;
    milestone: string;
  };
  c5_reward_available: {
    recipientName?: string;
    amount: string;
    currency: string;
  };
  c5_partnership_update: {
    recipientName?: string;
    partnerName: string;
    status: string;
  };
  c5_community_invitation: {
    recipientName?: string;
    inviterName?: string;
  };

  creator_first_sale: {
    agentName: string;
    orderId: string;
    amount: string;
    currency: string;
    recipientName?: string;
    agentSlug?: string;
    /** Enables the secondary «رشد محصولم را ببین» link (product insights). */
    agentId?: string;
  };
  security_password_changed: { recipientName?: string };
  security_login_locked: { recipientName?: string };
  security_2fa_enabled: { recipientName?: string };
  security_2fa_disabled: { recipientName?: string };
  // Phase C4 §11 — the case-study invitation. Sent at most once per
  // eligibility moment; the outbox dedups on (template, user, entity).
  creator_case_study_invite: {
    recipientName?: string;
    /** Used for the «ساخت داستان موفقیت» CTA. */
    caseStudyId?: string;
  };
  /** To the operator inbox (SUPPORT_INBOX_EMAIL) when a website message arrives. */
  contact_received: {
    messageId: string;
    senderName: string;
    senderEmail: string;
    topic: string;
    /** First ~300 characters; the full text is in the admin inbox. */
    excerpt: string;
  };
  /** To the sender when an operator answers from the admin inbox. */
  contact_reply: {
    recipientName?: string;
    topic: string;
    /** Operator's answer (plain text; paragraphs split on blank lines). */
    reply: string;
    /** The sender's original message, quoted for context. */
    original: string;
  };
}

interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const BRAND_FA = 'MESH';
const BRAND_EN = 'MESH';

/**
 * Where an e-mail tells people to turn for help. The operator mailbox is
 * configuration (`SUPPORT_INBOX_EMAIL`); when none is configured the public
 * contact page is the truthful channel — the templates never print a
 * mailbox that nobody reads.
 */
function supportContact(): string {
  const inbox = process.env.SUPPORT_INBOX_EMAIL?.trim();
  return inbox && inbox.length > 0 ? inbox : `${frontendBaseUrl()}/contact`;
}

/**
 * Frontend origin for email CTA links. Reuses the same server-side config
 * the payment callback redirect is built from (PAYMENT_CALLBACK_BASE) so
 * emails and callbacks can never disagree about where the app lives.
 */
function frontendBaseUrl(): string {
  // Trailing slashes are stripped once here so every CTA/support link is
  // `<origin>/path`, never `<origin>//path` (Sprint 3 F-01).
  return (process.env.PAYMENT_CALLBACK_BASE ?? 'http://localhost:5173').replace(
    /\/+$/,
    '',
  );
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

function toPersianDigits(value: string): string {
  return value.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/** Thousands separators: Persian «٬» for fa, plain comma for en. */
function groupThousands(value: string, fa: boolean): string {
  const [intPart, decimalPart] = value.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, fa ? '٬' : ',');
  return decimalPart ? `${grouped}.${decimalPart}` : grouped;
}

const CURRENCY_FA: Record<string, string> = {
  IRR: 'ریال',
  IRT: 'تومان',
  USD: 'دلار',
  EUR: 'یورو',
};

/**
 * Locale-aware amount (§20 premium copy): the Persian email reads
 * «۱٬۵۰۰٬۰۰۰ ریال», the English one "1,500,000 IRR" — never the raw
 * "1500000.00 IRR" machine format.
 */
function formatAmount(
  amount: string,
  currency: string,
  locale: EmailLocale,
): string {
  const normalized = String(amount).replace(/,/g, '').trim();
  const match = normalized.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return `${amount} ${currency}`;
  const intPart = match[1];
  const decimal = match[2] ? match[2].replace(/0+$/, '') : '';
  const value = decimal
    ? `${groupThousands(intPart, locale === 'fa')}.${decimal}`
    : groupThousands(intPart, locale === 'fa');
  if (locale === 'fa') {
    const unit =
      CURRENCY_FA[String(currency).toUpperCase()] ?? String(currency);
    return `${toPersianDigits(value)} ${unit}`;
  }
  return `${value} ${currency}`;
}

/** Short, human-friendly order reference: UUID → "AH-XXXXXXXX". */
function formatOrderRef(orderId: string): string {
  const raw = String(orderId).replace(/-/g, '');
  return `AH-${raw.slice(0, 8).toUpperCase()}`;
}

/** Personalized greeting, falling back gracefully (§20). */
function greeting(
  locale: EmailLocale,
  recipientName: string | undefined,
): string {
  const name = recipientName?.trim();
  if (locale === 'fa') {
    return name ? `${name} عزیز، سلام؛` : 'سلام؛';
  }
  return name ? `Hi ${name},` : 'Hello,';
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------
const SUBJECTS: Record<EmailTemplateId, Record<EmailLocale, string>> = {
  c5_ambassador_invitation: {
    fa: `شما به برنامهٔ سفیران MESH دعوت شدید — ${BRAND_FA}`,
    en: `You are invited to the MESH Ambassador programme`,
  },
  c5_affiliate_approved: {
    fa: `درخواست همکاری شما تأیید شد — ${BRAND_FA}`,
    en: `Your affiliate application was approved`,
  },
  c5_referral_milestone: {
    fa: `دعوت‌های شما به یک نقطهٔ مهم رسید — ${BRAND_FA}`,
    en: `Your referrals reached a milestone`,
  },
  c5_reward_available: {
    fa: `پاداش شما آماده دریافت است — ${BRAND_FA}`,
    en: `Your reward is ready to withdraw`,
  },
  c5_partnership_update: {
    fa: `وضعیت همکاری شما تغییر کرد — ${BRAND_FA}`,
    en: `Your partnership status changed`,
  },
  c5_community_invitation: {
    fa: `به جامعهٔ سازندگان MESH دعوت شدید — ${BRAND_FA}`,
    en: `You are invited to the MESH creator community`,
  },

  email_verification_code: {
    fa: `کد تأیید ایمیل شما — ${BRAND_FA}`,
    en: `Your MESH verification code`,
  },
  password_reset: {
    fa: `بازنشانی رمز عبور — ${BRAND_FA}`,
    en: `Reset your MESH password`,
  },
  purchase_confirmation: {
    fa: `خرید شما تأیید شد — ${BRAND_FA}`,
    en: `Your purchase is confirmed`,
  },
  new_sale: {
    fa: `فروش جدید! — ${BRAND_FA}`,
    en: `You made a new sale`,
  },
  payment_failed: {
    fa: `پرداخت ناموفق بود — ${BRAND_FA}`,
    en: `Your payment failed`,
  },
  refund_processed: {
    fa: `نتیجه درخواست بازپرداخت — ${BRAND_FA}`,
    en: `Your refund request has been processed`,
  },
  creator_verification_result: {
    fa: `نتیجه احراز هویت سازنده — ${BRAND_FA}`,
    en: `Creator verification result`,
  },
  review_submission_received: {
    fa: `محصول شما برای بررسی دریافت شد — ${BRAND_FA}`,
    en: `Your product was received for review`,
  },
  review_started: {
    fa: `بررسی محصول شما آغاز شد — ${BRAND_FA}`,
    en: `Your product review has started`,
  },
  review_action_required: {
    fa: `محصول شما نیاز به اصلاح دارد — ${BRAND_FA}`,
    en: `Your product needs a few changes`,
  },
  review_resubmission_received: {
    fa: `نسخه اصلاح‌شده دریافت شد — ${BRAND_FA}`,
    en: `Your corrected version was received`,
  },
  review_approved: {
    fa: `محصول شما تأیید شد 🎉 — ${BRAND_FA}`,
    en: `Your product was approved 🎉`,
  },
  review_published: {
    fa: `محصول شما منتشر شد 🎉 — ${BRAND_FA}`,
    en: `Your product is live 🎉`,
  },
  review_rejected: {
    fa: `نتیجه بررسی محصول شما — ${BRAND_FA}`,
    en: `The result of your product review`,
  },
  creator_profile_approved: {
    fa: `پروفایل سازنده شما تأیید شد — ${BRAND_FA}`,
    en: `Your creator profile is approved`,
  },
  creator_first_product_created: {
    fa: `اولین محصول شما ساخته شد — ${BRAND_FA}`,
    en: `You created your first product`,
  },
  creator_first_sale: {
    fa: `اولین فروش شما ثبت شد 🎉 — ${BRAND_FA}`,
    en: `You made your first sale 🎉`,
  },
  security_password_changed: {
    fa: `رمز عبور حساب شما تغییر کرد — ${BRAND_FA}`,
    en: `Your MESH password was changed`,
  },
  security_login_locked: {
    fa: `تلاش‌های ناموفق برای ورود به حساب شما — ${BRAND_FA}`,
    en: `Failed sign-in attempts on your MESH account`,
  },
  security_2fa_enabled: {
    fa: `ورود دومرحله‌ای حساب شما فعال شد — ${BRAND_FA}`,
    en: `Two-step sign-in is now on for your MESH account`,
  },
  security_2fa_disabled: {
    fa: `ورود دومرحله‌ای حساب شما غیرفعال شد — ${BRAND_FA}`,
    en: `Two-step sign-in was turned off on your MESH account`,
  },
  contact_received: {
    fa: `پیام جدید از فرم تماس — ${BRAND_FA}`,
    en: `New website contact message — ${BRAND_EN}`,
  },
  contact_reply: {
    fa: `پاسخ به پیام شما — ${BRAND_FA}`,
    en: `Reply to your message — ${BRAND_EN}`,
  },
  creator_conversion_invite: {
    fa: `دعوت به ساخت محصول روی ${BRAND_FA}`,
    en: `An invitation to build on ${BRAND_EN}`,
  },
  // Phase C4 §11 — deliberately warm, not congratulatory. The creator has
  // already done the hard part; this only says the story is worth telling.
  creator_case_study_invite: {
    fa: `داستان موفقیت شما آمادهٔ روایت شدن است 🌟 — ${BRAND_FA}`,
    en: `Your success story is ready to be told`,
  },
};

// ---------------------------------------------------------------------------
// Creator journey copy (gap closure): one source for text + HTML, one CTA.
// ---------------------------------------------------------------------------
/**
 * Phase C5 §35 — exactly six events, and no more.
 *
 * §35 warns against spamming creators, so the list is deliberately short: no
 * email for a click, a view, a post, a comment or a reaction. Those stay
 * in-app, where they are free to be frequent.
 */
type ScaleTemplateId =
  | 'c5_ambassador_invitation'
  | 'c5_affiliate_approved'
  | 'c5_referral_milestone'
  | 'c5_reward_available'
  | 'c5_partnership_update'
  | 'c5_community_invitation';

const SCALE_TEMPLATES: readonly ScaleTemplateId[] = [
  'c5_ambassador_invitation',
  'c5_affiliate_approved',
  'c5_referral_milestone',
  'c5_reward_available',
  'c5_partnership_update',
  'c5_community_invitation',
];

function isScaleTemplate(
  template: EmailTemplateId,
): template is ScaleTemplateId {
  return (SCALE_TEMPLATES as readonly string[]).includes(template);
}

type JourneyTemplateId =
  | 'creator_profile_approved'
  | 'creator_first_product_created'
  | 'creator_first_sale'
  | 'security_password_changed'
  | 'security_login_locked'
  | 'security_2fa_enabled'
  | 'security_2fa_disabled'
  | 'creator_conversion_invite'
  | 'creator_case_study_invite'
  | 'contact_received'
  | 'contact_reply';

const JOURNEY_TEMPLATES: readonly JourneyTemplateId[] = [
  'creator_profile_approved',
  'creator_first_product_created',
  'creator_first_sale',
  'security_password_changed',
  'security_login_locked',
  'security_2fa_enabled',
  'security_2fa_disabled',
  'creator_conversion_invite',
  'creator_case_study_invite',
  'contact_received',
  'contact_reply',
];

function isJourneyTemplate(
  template: EmailTemplateId,
): template is JourneyTemplateId {
  return (JOURNEY_TEMPLATES as readonly string[]).includes(template);
}

interface JourneyCopy {
  lines: string[];
  rows: Array<[string, string]>;
  cta: string;
  url: string;
  /** Optional quiet text link under the ONE primary button. */
  secondary?: { label: string; url: string };
}

function journeyCopy(
  template: JourneyTemplateId,
  locale: EmailLocale,
  data: Record<string, unknown>,
): JourneyCopy {
  const fa = locale === 'fa';
  const base = frontendBaseUrl();
  switch (template) {
    case 'creator_profile_approved':
      return fa
        ? {
            lines: [
              'پروفایل سازنده شما تأیید شد. حالا می‌توانید محصولتان را برای بررسی ارسال کنید و بعد از تأیید، آن را منتشر کنید.',
              'قدم بعدی: اولین محصولتان را بسازید یا پیش‌نویس فعلی را کامل کنید.',
            ],
            rows: [],
            cta: 'رفتن به استودیوی سازنده',
            url: `${base}/creator`,
          }
        : {
            lines: [
              'Your creator profile is approved. You can now submit products for review and publish them once approved.',
              'Next step: create your first product or finish your current draft.',
            ],
            rows: [],
            cta: 'Open Creator Studio',
            url: `${base}/creator`,
          };
    case 'creator_first_product_created': {
      const url = `${base}/creator/agents/${encodeURIComponent(textOf(data.agentId))}/edit`;
      return fa
        ? {
            lines: [
              `اولین محصول شما «${textOf(data.agentName)}» ساخته شد.`,
              'تغییرات شما خودکار ذخیره می‌شود. هر وقت آماده بودید، چک‌لیست آمادگی را کامل کنید و محصول را برای بررسی بفرستید.',
            ],
            rows: [['محصول', textOf(data.agentName)]],
            cta: 'ادامه ساخت محصول',
            url,
          }
        : {
            lines: [
              `Your first product "${textOf(data.agentName)}" was created.`,
              'Your changes are saved automatically. When you are ready, complete the readiness checklist and submit it for review.',
            ],
            rows: [['Product', textOf(data.agentName)]],
            cta: 'Continue building',
            url,
          };
    }
    case 'contact_received': {
      const topic = textOf(data.topic);
      const sender = `${textOf(data.senderName)} <${textOf(data.senderEmail)}>`;
      const inboxUrl = `${base}/admin/support-ops?tab=contact&id=${encodeURIComponent(textOf(data.messageId))}`;
      return fa
        ? {
            lines: [
              'یک پیام جدید از فرم تماس وب‌سایت دریافت شد. متن کامل و امکان پاسخ در صندوق پیام‌های ادمین است.',
              textOf(data.excerpt),
            ],
            rows: [
              ['فرستنده', sender],
              ['موضوع', topic],
              ['شناسه', textOf(data.messageId)],
            ],
            cta: 'باز کردن در صندوق پیام‌ها',
            url: inboxUrl,
          }
        : {
            lines: [
              'A new message arrived through the website contact form. The full text and the reply action are in the admin inbox.',
              textOf(data.excerpt),
            ],
            rows: [
              ['From', sender],
              ['Topic', topic],
              ['Reference', textOf(data.messageId)],
            ],
            cta: 'Open in the inbox',
            url: inboxUrl,
          };
    }
    case 'contact_reply': {
      const paragraphs = textOf(data.reply)
        .split(/\n\s*\n/)
        .map((part) => part.replace(/\s+/g, ' ').trim())
        .filter((part) => part.length > 0);
      const original = textOf(data.original).replace(/\s+/g, ' ').trim();
      const quoted =
        original.length > 400 ? `${original.slice(0, 400)}…` : original;
      return fa
        ? {
            lines: [
              'پشتیبانی MESH به پیامی که از طریق فرم تماس فرستاده بودید پاسخ داده است:',
              ...paragraphs,
              `پیام شما: «${quoted}»`,
              'اگر سؤال دیگری دارید، دوباره از فرم تماس وب‌سایت استفاده کنید تا پیام شما در صف بررسی ثبت شود.',
            ],
            rows: [['موضوع', textOf(data.topic)]],
            cta: 'ارسال پیام جدید',
            url: `${base}/contact`,
          }
        : {
            lines: [
              'MESH support has answered the message you sent through the contact form:',
              ...paragraphs,
              `Your message: "${quoted}"`,
              'If you have another question, please use the website contact form again so it is recorded in our review queue.',
            ],
            rows: [['Topic', textOf(data.topic)]],
            cta: 'Send a new message',
            url: `${base}/contact`,
          };
    }
    case 'security_password_changed':
      return fa
        ? {
            lines: [
              'رمز عبور حساب شما هم‌اکنون تغییر کرد و نشست‌های دیگرتان از حساب خارج شدند.',
              'اگر خودتان این کار را کرده‌اید، نیازی به اقدام نیست. اگر نه، همین حالا رمز عبور را بازنشانی کنید تا دسترسی دیگران قطع شود.',
            ],
            rows: [],
            cta: 'بازنشانی رمز عبور',
            url: `${base}/forgot-password`,
            secondary: {
              label: 'بررسی نشست‌های فعال',
              url: `${base}/settings`,
            },
          }
        : {
            lines: [
              'Your account password was just changed and your other sessions were signed out.',
              'If this was you, no action is needed. If not, reset your password now to cut off anyone else.',
            ],
            rows: [],
            cta: 'Reset password',
            url: `${base}/forgot-password`,
            secondary: {
              label: 'Review active sessions',
              url: `${base}/settings`,
            },
          };
    case 'security_login_locked':
      return fa
        ? {
            lines: [
              'چند تلاش ناموفق برای ورود به حساب شما ثبت شد و برای محافظت از حساب، ورود برای مدتی محدود شد.',
              'اگر خودتان بودید، کمی بعد دوباره امتحان کنید. اگر نه، رمز عبورتان را عوض کنید تا مطمئن باشید حساب در امان است.',
            ],
            rows: [],
            cta: 'تغییر رمز عبور',
            url: `${base}/forgot-password`,
          }
        : {
            lines: [
              'We recorded several failed sign-in attempts on your account and temporarily limited sign-in to protect it.',
              'If it was you, try again a little later. If not, change your password to be sure the account is safe.',
            ],
            rows: [],
            cta: 'Change password',
            url: `${base}/forgot-password`,
          };
    case 'security_2fa_enabled':
      return fa
        ? {
            lines: [
              'ورود دومرحله‌ای با برنامه‌ی احراز هویت برای حساب شما فعال شد؛ از این پس هنگام ورود، علاوه بر رمز عبور، یک کد شش‌رقمی هم لازم است.',
              'اگر خودتان این کار را نکرده‌اید، همین حالا رمز عبور را عوض کنید و نشست‌های فعال را بررسی کنید.',
            ],
            rows: [],
            cta: 'بررسی امنیت حساب',
            url: `${base}/settings`,
          }
        : {
            lines: [
              'Two-step sign-in with an authenticator app is now on for your account: from now on you need a six-digit code as well as your password.',
              'If you did not do this, change your password right away and review your active sessions.',
            ],
            rows: [],
            cta: 'Review account security',
            url: `${base}/settings`,
          };
    case 'security_2fa_disabled':
      return fa
        ? {
            lines: [
              'ورود دومرحله‌ای حساب شما غیرفعال شد و ورود دوباره فقط با رمز عبور انجام می‌شود.',
              'اگر خودتان این کار را نکرده‌اید، همین حالا رمز عبور را عوض کنید.',
            ],
            rows: [],
            cta: 'تغییر رمز عبور',
            url: `${base}/forgot-password`,
            secondary: {
              label: 'بررسی نشست‌های فعال',
              url: `${base}/settings`,
            },
          }
        : {
            lines: [
              'Two-step sign-in was turned off for your account; signing in now needs only your password.',
              'If you did not do this, change your password right away.',
            ],
            rows: [],
            cta: 'Change password',
            url: `${base}/forgot-password`,
            secondary: {
              label: 'Review active sessions',
              url: `${base}/settings`,
            },
          };
    case 'creator_case_study_invite': {
      // §11's invitation. Short and warm: the creator already knows they
      // succeeded, so this does not congratulate them — it points at the
      // wizard. One CTA, per the journey convention.
      const url = `${base}/creator/success/case-study`;
      return fa
        ? {
            lines: [
              'محصول شما به اندازه‌ای رشد کرده که تجربه‌تان می‌تواند برای سازندگان دیگر راهنما باشد.',
              'داستان موفقیت شما در هفت گام کوتاه نوشته می‌شود: چه مشکلی داشتید، چه ساختید، چه نتیجه‌ای گرفتید و تجربه‌تان از Mesh.',
              'قبل از انتشار، پیش‌نمایش کامل را می‌بینید و خودتان تصمیم می‌گیرید.',
            ],
            rows: [],
            cta: 'ساخت داستان موفقیت',
            url,
          }
        : {
            lines: [
              'Your product has grown enough that your experience could guide other creators.',
              'The story takes seven short steps: the problem, what you built, the results, and your experience with Mesh.',
              'You see a full preview before anything is published, and you decide.',
            ],
            rows: [],
            cta: 'Build your success story',
            url,
          };
    }
    case 'creator_conversion_invite': {
      // The invite link carries the referral code, so the person who sends
      // the invite is credited for the signup even if it lands weeks later.
      const url = data.referralCode
        ? `${base}/auth/signup?ref=${encodeURIComponent(textOf(data.referralCode))}`
        : `${base}/auth/signup`;
      const from = textOf(data.senderName);
      const note = textOf(data.message);
      return fa
        ? {
            lines: [
              from
                ? `${from} از تیم ${BRAND_FA} دعوت می‌کند محصولتان را اینجا بسازید.`
                : `از طرف تیم ${BRAND_FA} دعوت می‌کنیم محصولتان را اینجا بسازید.`,
              'با ساخت اولین محصول، صفحه اختصاصی، فروشگاه و ابزارهای رشد در اختیار شما قرار می‌گیرد.',
              ...(note ? [note] : []),
            ],
            rows: data.referralCode
              ? [['کد معرف', textOf(data.referralCode)]]
              : [],
            cta: 'ساخت حساب سازنده',
            url,
          }
        : {
            lines: [
              from
                ? `${from} from the ${BRAND_EN} team invites you to build here.`
                : `The ${BRAND_EN} team invites you to build here.`,
              'Create your first product and get your own page, storefront and growth tools.',
              ...(note ? [note] : []),
            ],
            rows: data.referralCode
              ? [['Referral code', textOf(data.referralCode)]]
              : [],
            cta: 'Create your creator account',
            url,
          };
    }
    case 'creator_first_sale': {
      const detail = formatAmount(
        textOf(data.amount),
        textOf(data.currency),
        locale,
      );
      const url = `${base}/creator/sales/${encodeURIComponent(textOf(data.orderId))}`;
      // Gap closure (P2) — «رشد محصولم را ببین» → the product's insights.
      const growthUrl = textOf(data.agentId)
        ? `${base}/creator/agents/${encodeURIComponent(textOf(data.agentId))}/insights`
        : null;
      return fa
        ? {
            lines: [
              `تبریک! اولین فروش شما ثبت شد: «${textOf(data.agentName)}».`,
              'این اولین قدم واقعی رشد است. پیشنهاد ما: از خریدار بخواهید تجربه‌اش را در قالب نظر ثبت کند و لینک محصول را در کانال‌هایتان به اشتراک بگذارید.',
            ],
            rows: [
              ['محصول', textOf(data.agentName)],
              ['مبلغ', detail],
              ['شماره سفارش', formatOrderRef(textOf(data.orderId))],
            ],
            cta: 'مشاهده سفارش',
            url,
            ...(growthUrl
              ? { secondary: { label: 'رشد محصولم را ببین', url: growthUrl } }
              : {}),
          }
        : {
            lines: [
              `Congratulations! You made your first sale: "${textOf(data.agentName)}".`,
              'This is your first real growth step. Suggestion: ask the buyer to leave a review and share the product link on your channels.',
            ],
            rows: [
              ['Product', textOf(data.agentName)],
              ['Amount', detail],
              ['Order ref', formatOrderRef(textOf(data.orderId))],
            ],
            cta: 'View order',
            url,
            ...(growthUrl
              ? {
                  secondary: {
                    label: 'See how my product grows',
                    url: growthUrl,
                  },
                }
              : {}),
          };
    }
  }
}

/**
 * Phase C5 §35 copy.
 *
 * Every message names the next action a creator can take, in their language,
 * and every one links to the page where that action is possible. A C5 email
 * that informs without enabling is a notification, and the platform already
 * has notifications.
 */
function scaleCopy(
  template: ScaleTemplateId,
  locale: EmailLocale,
  data: Record<string, unknown>,
): { lines: string[]; cta: string; url: string } {
  const fa = locale === 'fa';
  const name = (v: unknown) =>
    typeof v === 'string' && v ? v : fa ? 'شما' : 'you';
  switch (template) {
    case 'c5_ambassador_invitation':
      return {
        lines: fa
          ? [
              'برنامهٔ سفیران MESH برای سازندگانی است که محصول موفقی ساخته‌اند و می‌خواهند رشد MESH را جلو ببرند.',
              'مزایا و مسئولیت‌های برنامه را ببینید و تصمیم بگیرید که به آن بپیوندید.',
            ]
          : [
              'The MESH Ambassador programme is for creators with a proven product who want to help MESH grow.',
              'Review the benefits and responsibilities, then decide whether to join.',
            ],
        cta: fa ? 'مشاهدهٔ برنامهٔ سفیران' : 'View the Ambassador programme',
        url: scaleUrl('/creator/scale/ambassador'),
      };
    case 'c5_affiliate_approved':
      return {
        lines: fa
          ? [
              'درخواست همکاری در فروش شما تأیید شد.',
              `کد همکاری شما ${name(data.affiliateCode)} است. آن را در شبکه و محتوای خود به اشتراک بگذارید تا کمیسیون خریدهای ارجاع‌شده را کسب کنید.`,
            ]
          : [
              'Your affiliate application was approved.',
              `Your affiliate code is ${name(data.affiliateCode)}. Share it to earn commission on referred purchases.`,
            ],
        cta: fa ? 'دیدن کمیسیون من' : 'View my commission',
        url: scaleUrl('/creator/scale/affiliate'),
      };
    case 'c5_referral_milestone':
      return {
        lines: fa
          ? [
              `تا این لحظه ${name(data.count)} نفر با لینک شما وارد MESH شده‌اند.`,
              `${name(data.milestone)} — این نقطهٔ مسیر رشد شماست.`,
            ]
          : [
              `${name(data.count)} people have joined MESH through your link so far.`,
              `${name(data.milestone)} — that is a real milestone on your growth path.`,
            ],
        cta: fa ? 'دیدن نتیجهٔ دعوت‌ها' : 'See my referral results',
        url: scaleUrl('/creator/scale/referral'),
      };
    case 'c5_reward_available':
      return {
        lines: fa
          ? [
              `مبلغ ${name(data.amount)} ${name(data.currency)} برای شما آمادهٔ دریافت است.`,
              'پس از انتقال، آن را در صفحهٔ پاداش‌ها «پرداخت‌شده» علامت بزنید تا سوابق مالی شما دقیق بماند.',
            ]
          : [
              `${name(data.amount)} ${name(data.currency)} is available to withdraw.`,
              'Once you have transferred it, mark it as paid so your financial record stays accurate.',
            ],
        cta: fa ? 'دریافت پاداش' : 'Withdraw my reward',
        url: scaleUrl('/creator/scale/referral'),
      };
    case 'c5_partnership_update':
      return {
        lines: fa
          ? [
              `وضعیت همکاری شما با ${name(data.partnerName)} به «${name(data.status)}» تغییر کرد.`,
            ]
          : [
              `Your partnership with ${name(data.partnerName)} moved to "${name(data.status)}".`,
            ],
        cta: fa ? 'دیدن همکاری‌های من' : 'View my partnerships',
        url: scaleUrl('/creator/scale/affiliate'),
      };
    case 'c5_community_invitation':
      return {
        lines: fa
          ? [
              `${name(data.inviterName)} شما را به جامعهٔ سازندگان MESH دعوت کرد.`,
              'در این جامعه، سازندگان محصول و روش کار خود را با هم به اشتراک می‌گذارند.',
            ]
          : [
              `${name(data.inviterName)} invited you to the MESH creator community.`,
              'In the community, creators share what they build and how they built it.',
            ],
        cta: fa ? 'ورود به جامعه' : 'Join the community',
        url: scaleUrl('/creator/scale/community'),
      };
  }
}

/**
 * Absolute URL for a creator-facing C5 page. Sprint 3 (S3-02 F-01): built
 * from the same frontend origin every other e-mail CTA uses
 * (`frontendBaseUrl()` ← PAYMENT_CALLBACK_BASE); the previous `APP_URL`
 * variable was never declared in `.env.example`/`env.validation`, so in a
 * real deployment these links were relative paths with no host.
 */
function scaleUrl(path: string): string {
  return `${frontendBaseUrl()}${path}`;
}

function scaleText(
  template: ScaleTemplateId,
  locale: EmailLocale,
  data: Record<string, unknown>,
): string {
  const copy = scaleCopy(template, locale, data);
  return [
    greeting(locale, data.recipientName as string | undefined),
    ...copy.lines,
    `${copy.cta}: ${copy.url}`,
    supportLine(locale),
  ].join('\n');
}

function scaleHtml(
  template: ScaleTemplateId,
  locale: EmailLocale,
  data: Record<string, unknown>,
): string {
  const copy = scaleCopy(template, locale, data);
  return (
    p(greeting(locale, data.recipientName as string | undefined)) +
    copy.lines.map((line) => p(line)).join('') +
    ctaButton(locale, copy.cta, copy.url) +
    p(supportLine(locale))
  );
}

function journeyText(
  template: JourneyTemplateId,
  locale: EmailLocale,
  data: Record<string, unknown>,
): string {
  const copy = journeyCopy(template, locale, data);
  return [
    greeting(locale, data.recipientName as string | undefined),
    ...copy.lines,
    ...copy.rows.map(([label, value]) => `${label}: ${value}`),
    `${copy.cta}: ${copy.url}`,
    ...(copy.secondary
      ? [`${copy.secondary.label}: ${copy.secondary.url}`]
      : []),
    supportLine(locale),
  ].join('\n');
}

function journeyHtml(
  template: JourneyTemplateId,
  locale: EmailLocale,
  data: Record<string, unknown>,
): string {
  const copy = journeyCopy(template, locale, data);
  return (
    p(greeting(locale, data.recipientName as string | undefined)) +
    copy.lines.map((line) => p(line)).join('') +
    (copy.rows.length ? detailTable(locale, copy.rows) : '') +
    ctaButton(locale, copy.cta, copy.url) +
    (copy.secondary
      ? secondaryLink(copy.secondary.label, copy.secondary.url)
      : '') +
    p(supportLine(locale))
  );
}

// ---------------------------------------------------------------------------
// Review lifecycle copy (Phase A3 §38): friendly, non-technical, always
// naming the product, its status and a direct link to its review page.
// ---------------------------------------------------------------------------
type ReviewTemplateId = Extract<EmailTemplateId, `review_${string}`>;

function isReviewTemplate(
  template: EmailTemplateId,
): template is ReviewTemplateId {
  return template.startsWith('review_');
}

interface ReviewCopy {
  lines: string[];
  status: string;
  cta: string;
}

/** Payload primitive → display text (never "[object Object]"). */
function textOf(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function reviewCopy(
  template: ReviewTemplateId,
  locale: EmailLocale,
  data: Record<string, unknown>,
): ReviewCopy {
  const fa = locale === 'fa';
  const name = textOf(data.agentName);
  const count = Number(data.count ?? 0);
  const reason = textOf(data.reason);
  const version = textOf(data.version);
  const countFa = toPersianDigits(String(count));
  switch (template) {
    case 'review_submission_received':
      return fa
        ? {
            lines: [
              `محصول «${name}» برای بررسی دریافت شد.`,
              'تیم Mesh اطلاعات محصول، امنیت، نحوه اجرا و نحوه تحویل آن را بررسی می‌کند. هر تغییری در وضعیت را به شما خبر می‌دهیم.',
            ],
            status: 'ارسال‌شده برای بررسی',
            cta: 'مشاهده وضعیت بررسی',
          }
        : {
            lines: [
              `"${name}" was received for review.`,
              'The Mesh team reviews the product information, security, runtime and delivery. We will let you know about every status change.',
            ],
            status: 'Submitted for review',
            cta: 'View review status',
          };
    case 'review_started':
      return fa
        ? {
            lines: [
              `بررسی «${name}» آغاز شد.`,
              'در این مرحله نیازی به اقدام شما نیست. اگر اصلاحی لازم باشد، دقیقاً می‌گوییم چه چیزی و کجا.',
            ],
            status: 'در حال بررسی',
            cta: 'مشاهده بررسی',
          }
        : {
            lines: [
              `The review of "${name}" has started.`,
              'Nothing is needed from you right now. If anything needs changing, we will tell you exactly what and where.',
            ],
            status: 'Under review',
            cta: 'View review',
          };
    case 'review_action_required':
      return fa
        ? {
            lines: [
              `برای ادامه بررسی «${name}»، ${countFa} مورد نیاز به اصلاح دارد.`,
              'هر مورد توضیح می‌دهد مشکل چیست، چرا مهم است و کجا باید اصلاح شود. پس از اصلاح، نسخه اصلاح‌شده را ارسال کنید.',
            ],
            status: 'نیاز به اصلاح',
            cta: 'مشاهده و اصلاح',
          }
        : {
            lines: [
              `To continue the review of "${name}", ${count} item(s) need changes.`,
              'Each item explains the problem, why it matters and where to fix it. After fixing, send the corrected version.',
            ],
            status: 'Action required',
            cta: 'View and fix',
          };
    case 'review_resubmission_received':
      return fa
        ? {
            lines: [
              `نسخه اصلاح‌شده «${name}» دریافت شد.`,
              'این نسخه دوباره بررسی می‌شود و نتیجه را به شما اطلاع می‌دهیم.',
            ],
            status: 'ارسال مجدد',
            cta: 'مشاهده وضعیت بررسی',
          }
        : {
            lines: [
              `The corrected version of "${name}" was received.`,
              'It will be reviewed again and we will let you know the result.',
            ],
            status: 'Resubmitted',
            cta: 'View review status',
          };
    case 'review_approved':
      return fa
        ? {
            lines: [
              `🎉 «${name}» تأیید شد و آماده انتشار است.`,
              'محصول شما بررسی را با موفقیت پشت سر گذاشت. به‌محض انتشار، دوباره به شما خبر می‌دهیم.',
            ],
            status: 'آماده انتشار',
            cta: 'مشاهده بررسی',
          }
        : {
            lines: [
              `🎉 "${name}" was approved and is ready to publish.`,
              'Your product passed review. We will let you know as soon as it is live.',
            ],
            status: 'Ready to publish',
            cta: 'View review',
          };
    case 'review_published':
      return fa
        ? {
            lines: [
              `🎉 «${name}» منتشر شد و اکنون در Marketplace قابل مشاهده است.`,
              version ? `نسخه منتشرشده: ${toPersianDigits(version)}` : '',
            ].filter(Boolean),
            status: 'منتشرشده',
            cta: 'مشاهده محصول',
          }
        : {
            lines: [
              `🎉 "${name}" is live and visible in the Marketplace.`,
              version ? `Published version: ${version}` : '',
            ].filter(Boolean),
            status: 'Published',
            cta: 'View product',
          };
    case 'review_rejected':
      return fa
        ? {
            lines: [
              `متأسفانه «${name}» در این بررسی تأیید نشد.`,
              reason ? `دلیل: ${reason}` : '',
              'توضیح کامل را در صفحه بررسی ببینید. اگر سؤالی دارید، با پشتیبانی در تماس باشید.',
            ].filter(Boolean),
            status: 'ردشده',
            cta: 'مشاهده توضیحات',
          }
        : {
            lines: [
              `Unfortunately "${name}" was not approved in this review.`,
              reason ? `Reason: ${reason}` : '',
              'See the full explanation on the review page. Contact support if you have questions.',
            ].filter(Boolean),
            status: 'Rejected',
            cta: 'View explanation',
          };
  }
}

function reviewUrl(data: Record<string, unknown>): string {
  return `${frontendBaseUrl()}/creator/agents/${encodeURIComponent(textOf(data.agentId))}/review`;
}

function reviewText(
  template: ReviewTemplateId,
  locale: EmailLocale,
  data: Record<string, unknown>,
): string {
  const fa = locale === 'fa';
  const copy = reviewCopy(template, locale, data);
  return [
    greeting(locale, data.recipientName as string | undefined),
    ...copy.lines,
    fa ? `وضعیت: ${copy.status}` : `Status: ${copy.status}`,
    `${copy.cta}: ${reviewUrl(data)}`,
    fa ? `پشتیبانی: ${supportContact()}` : `Support: ${supportContact()}`,
  ].join('\n');
}

function reviewHtml(
  template: ReviewTemplateId,
  locale: EmailLocale,
  data: Record<string, unknown>,
): string {
  const fa = locale === 'fa';
  const copy = reviewCopy(template, locale, data);
  const revision = textOf(data.revisionNumber);
  return (
    p(greeting(locale, data.recipientName as string | undefined)) +
    copy.lines.map((line) => p(line)).join('') +
    detailTable(locale, [
      [fa ? 'محصول' : 'Product', textOf(data.agentName)],
      [fa ? 'وضعیت' : 'Status', copy.status],
      [fa ? 'ویرایش' : 'Revision', fa ? toPersianDigits(revision) : revision],
    ]) +
    ctaButton(locale, copy.cta, reviewUrl(data)) +
    p(supportLine(locale))
  );
}

// ---------------------------------------------------------------------------
// Plain-text bodies (locale-aware; codes/tokens use Latin digits so
// automated dev/test tooling can parse them in both languages).
// ---------------------------------------------------------------------------
function textBody(
  template: EmailTemplateId,
  locale: EmailLocale,
  data: Record<string, unknown>,
): string {
  const fa = locale === 'fa';
  if (isReviewTemplate(template)) return reviewText(template, locale, data);
  if (isScaleTemplate(template)) return scaleText(template, locale, data);
  if (isJourneyTemplate(template)) return journeyText(template, locale, data);
  switch (template) {
    case 'email_verification_code': {
      const code = String(data.code);
      return fa
        ? [
            `${BRAND_FA} — تأیید ایمیل`,
            `کد تأیید شما: ${code}`,
            'این کد تا ۳۰ دقیقه اعتبار دارد. اگر شما درخواست نکرده‌اید، این پیام را نادیده بگیرید.',
          ].join('\n')
        : [
            `MESH — confirm your email`,
            `Your verification code is: ${code}`,
            'This code expires in 30 minutes. If you did not request it, ignore this message.',
          ].join('\n');
    }
    case 'password_reset': {
      const code = String(data.code);
      return fa
        ? [
            `${BRAND_FA} — بازنشانی رمز عبور`,
            `کد تغییر رمز عبور: ${code}`,
            'این کد تا ۳۰ دقیقه اعتبار دارد. اگر شما درخواست نکرده‌اید، این پیام را نادیده بگیرید.',
          ].join('\n')
        : [
            `MESH — password reset`,
            `Your password reset code: ${code}`,
            'This code expires in 30 minutes. If you did not request a reset, ignore this message.',
          ].join('\n');
    }
    case 'purchase_confirmation': {
      const locale2 = locale;
      const detail = formatAmount(
        String(data.amount),
        String(data.currency),
        locale2,
      );
      const cta = `${frontendBaseUrl()}/library`;
      return fa
        ? [
            greeting(locale2, data.recipientName as string | undefined),
            'پرداخت شما با موفقیت تأیید شد و ایجنت خریداری‌شده به کتابخانه شما اضافه شد.',
            `ایجنت: ${String(data.agentName)}`,
            `مبلغ: ${detail}`,
            `شماره سفارش: ${formatOrderRef(String(data.orderId))}`,
            `مشاهده کتابخانه: ${cta}`,
            `سؤالی دارید؟ پشتیبانی: ${supportContact()}`,
          ].join('\n')
        : [
            greeting(locale2, data.recipientName as string | undefined),
            'Your payment was confirmed and the agent has been added to your library.',
            `Agent: ${String(data.agentName)}`,
            `Amount: ${detail}`,
            `Order ref: ${formatOrderRef(String(data.orderId))}`,
            `Open your library: ${cta}`,
            `Questions? Support: ${supportContact()}`,
          ].join('\n');
    }
    case 'new_sale': {
      const locale2 = locale;
      const detail = formatAmount(
        String(data.amount),
        String(data.currency),
        locale2,
      );
      const cta = data.agentSlug
        ? `${frontendBaseUrl()}/agents/${data.agentSlug as string}`
        : `${frontendBaseUrl()}/creator`;
      return fa
        ? [
            greeting(locale2, data.recipientName as string | undefined),
            'تبریک! یکی از ایجنت‌های شما فروش رفت.',
            `ایجنت: ${String(data.agentName)}`,
            `مبلغ: ${detail}`,
            `شماره سفارش: ${formatOrderRef(String(data.orderId))}`,
            `مشاهده ایجنت: ${cta}`,
            `سؤالی دارید؟ پشتیبانی: ${supportContact()}`,
          ].join('\n')
        : [
            greeting(locale2, data.recipientName as string | undefined),
            'Congratulations! One of your agents was purchased.',
            `Agent: ${String(data.agentName)}`,
            `Amount: ${detail}`,
            `Order ref: ${formatOrderRef(String(data.orderId))}`,
            `View the agent: ${cta}`,
            `Questions? Support: ${supportContact()}`,
          ].join('\n');
    }
    case 'payment_failed': {
      const locale2 = locale;
      const cta = `${frontendBaseUrl()}/orders`;
      return fa
        ? [
            greeting(locale2, data.recipientName as string | undefined),
            'متأسفانه پرداخت شما تکمیل نشد. مبلغی از حساب شما کسر نشده است.',
            `شماره سفارش: ${formatOrderRef(String(data.orderId))}`,
            'می‌توانید هر زمان دوباره خرید را انجام دهید.',
            `سفارش‌های من: ${cta}`,
            `سؤالی دارید؟ پشتیبانی: ${supportContact()}`,
          ].join('\n')
        : [
            greeting(locale2, data.recipientName as string | undefined),
            'Your payment was not completed. Nothing was charged.',
            `Order ref: ${formatOrderRef(String(data.orderId))}`,
            'You can retry the purchase at any time.',
            `My orders: ${cta}`,
            `Questions? Support: ${supportContact()}`,
          ].join('\n');
    }
    case 'refund_processed': {
      const approved = data.approved === true;
      const locale2 = locale;
      const cta = `${frontendBaseUrl()}/orders`;
      return fa
        ? [
            greeting(locale2, data.recipientName as string | undefined),
            approved
              ? 'درخواست بازپرداخت شما تأیید و انجام شد. مبلغ حداکثر تا چند روز کاری به حساب شما بازمی‌گردد.'
              : 'متأسفانه درخواست بازپرداخت شما تأیید نشد. برای جزئیات بیشتر با پشتیبانی در تماس باشید.',
            `شماره سفارش: ${formatOrderRef(String(data.orderId))}`,
            `سفارش‌های من: ${cta}`,
            `پشتیبانی: ${supportContact()}`,
          ].join('\n')
        : [
            greeting(locale2, data.recipientName as string | undefined),
            approved
              ? 'Your refund request was approved and processed. The amount will be returned to your account within a few business days.'
              : 'Unfortunately, your refund request was not approved. Contact support for details.',
            `Order ref: ${formatOrderRef(String(data.orderId))}`,
            `My orders: ${cta}`,
            `Support: ${supportContact()}`,
          ].join('\n');
    }
    case 'creator_verification_result': {
      const approved = data.approved === true;
      const locale2 = locale;
      return fa
        ? [
            greeting(locale2, data.recipientName as string | undefined),
            approved
              ? 'درخواست احراز هویت سازنده شما تأیید شد. حساب شما اکنون تأییدشده است.'
              : 'متأسفانه درخواست احراز هویت سازنده شما تأیید نشد. برای پیگیری با پشتیبانی در تماس باشید.',
            `پشتیبانی: ${supportContact()}`,
          ].join('\n')
        : [
            greeting(locale2, data.recipientName as string | undefined),
            approved
              ? 'Your creator verification request was approved. Your profile is now verified.'
              : 'Unfortunately, your creator verification request was not approved. Contact support to follow up.',
            `Support: ${supportContact()}`,
          ].join('\n');
    }
  }
}

// ---------------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------------
const COLORS = {
  bg: '#f4f5f7',
  card: '#ffffff',
  text: '#1a1d21',
  muted: '#5f6b7a',
  accent: '#4f46e5',
  accentText: '#ffffff',
  success: '#0f766e',
  danger: '#b91c1c',
  border: '#e4e7eb',
};

function htmlShell(
  locale: EmailLocale,
  title: string,
  bodyHtml: string,
): string {
  const dir = locale === 'fa' ? 'rtl' : 'ltr';
  const brand = locale === 'fa' ? BRAND_FA : BRAND_EN;
  const footer =
    locale === 'fa'
      ? 'این ایمیل به‌صورت خودکار ارسال شده است؛ لطفاً به آن پاسخ ندهید.'
      : 'This message was sent automatically — please do not reply.';
  const lang = locale === 'fa' ? 'fa" lang="fa' : 'en';
  return `<!DOCTYPE html>
<html dir="${dir}" lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:Tahoma,Arial,Helvetica,sans-serif;direction:${dir};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;overflow:hidden;">
        <tr><td style="padding:20px 28px;background:${COLORS.accent};">
          <span style="font-size:18px;font-weight:700;color:${COLORS.accentText};">${escapeHtml(brand)}</span>
        </td></tr>
        <tr><td style="padding:28px;color:${COLORS.text};font-size:14px;line-height:1.9;${dir === 'rtl' ? 'text-align:right;' : ''}">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid ${COLORS.border};color:${COLORS.muted};font-size:12px;${dir === 'rtl' ? 'text-align:right;' : ''}">
          ${escapeHtml(footer)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function p(text: string): string {
  return `<p style="margin:0 0 14px 0;">${escapeHtml(text)}</p>`;
}

function codeBox(code: string): string {
  return `<div style="margin:8px 0 18px 0;padding:14px 18px;background:#eef0ff;border:1px dashed ${COLORS.accent};border-radius:8px;font-size:24px;letter-spacing:6px;font-weight:700;color:${COLORS.accent};direction:ltr;text-align:center;">${escapeHtml(code)}</div>`;
}

function detailTable(
  locale: EmailLocale,
  rows: Array<[string, string]>,
): string {
  const header = locale === 'fa' ? 'جزئیات' : 'Details';
  const cells = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px;color:${COLORS.muted};border:1px solid ${COLORS.border};">${escapeHtml(label)}</td><td style="padding:6px 12px;font-weight:600;border:1px solid ${COLORS.border};word-break:break-all;">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
  return `<p style="margin:18px 0 8px 0;font-weight:700;">${escapeHtml(header)}</p><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:13px;">${cells}</table>`;
}

/** Prominent single primary action button (email-client safe: table + a). */
function ctaButton(locale: EmailLocale, label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px 0;"><tr><td style="border-radius:8px;background:${COLORS.accent};"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:${COLORS.accentText};text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
}

/** A quiet text link under the primary button (never a second button). */
function secondaryLink(label: string, url: string): string {
  return `<p style="margin:4px 0 18px 0;"><a href="${escapeHtml(url)}" style="color:${COLORS.accent};font-weight:600;">${escapeHtml(label)}</a></p>`;
}

/** One quiet support line — every commerce email names a human channel. */
function supportLine(locale: EmailLocale): string {
  return locale === 'fa'
    ? `سؤالی دارید؟ با پشتیبانی ما تماس بگیرید: ${supportContact()}`
    : `Questions? Contact our support team: ${supportContact()}`;
}

function htmlBody(
  template: EmailTemplateId,
  locale: EmailLocale,
  data: Record<string, unknown>,
): string {
  const fa = locale === 'fa';
  if (isReviewTemplate(template)) return reviewHtml(template, locale, data);
  if (isScaleTemplate(template)) return scaleHtml(template, locale, data);
  if (isJourneyTemplate(template)) return journeyHtml(template, locale, data);
  switch (template) {
    case 'email_verification_code':
      return (
        p(
          fa
            ? 'برای تأیید ایمیل خود، از کد زیر استفاده کنید:'
            : 'Use the code below to confirm your email:',
        ) +
        codeBox(String(data.code)) +
        p(
          fa
            ? 'این کد تا ۳۰ دقیقه اعتبار دارد.'
            : 'This code expires in 30 minutes.',
        ) +
        p(
          fa
            ? 'اگر شما این درخواست را نداده‌اید، این پیام را نادیده بگیرید.'
            : 'If you did not request it, ignore this message.',
        )
      );
    case 'password_reset':
      return (
        p(
          fa
            ? 'برای انتخاب رمز عبور جدید، این کد را وارد کنید:'
            : 'Enter this code to choose a new password:',
        ) +
        codeBox(String(data.code)) +
        p(
          fa
            ? 'این کد تا ۳۰ دقیقه اعتبار دارد.'
            : 'This code expires in 30 minutes.',
        ) +
        p(
          fa
            ? 'اگر شما این درخواست را نداده‌اید، این پیام را نادیده بگیرید.'
            : 'If you did not request a reset, ignore this message.',
        )
      );
    case 'purchase_confirmation': {
      const detail = formatAmount(
        String(data.amount),
        String(data.currency),
        locale,
      );
      return (
        p(greeting(locale, data.recipientName as string | undefined)) +
        p(
          fa
            ? 'پرداخت شما با موفقیت تأیید شد و ایجنت خریداری‌شده به کتابخانه شما اضافه شد.'
            : 'Your payment was confirmed and the agent has been added to your library.',
        ) +
        detailTable(locale, [
          [fa ? 'ایجنت' : 'Agent', String(data.agentName)],
          [fa ? 'مبلغ' : 'Amount', detail],
          [
            fa ? 'شماره سفارش' : 'Order ref',
            formatOrderRef(String(data.orderId)),
          ],
        ]) +
        ctaButton(
          locale,
          fa ? 'مشاهده کتابخانه' : 'Open your library',
          `${frontendBaseUrl()}/library`,
        ) +
        p(supportLine(locale))
      );
    }
    case 'new_sale': {
      const detail = formatAmount(
        String(data.amount),
        String(data.currency),
        locale,
      );
      const agentUrl = data.agentSlug
        ? `${frontendBaseUrl()}/agents/${data.agentSlug as string}`
        : `${frontendBaseUrl()}/creator`;
      return (
        p(greeting(locale, data.recipientName as string | undefined)) +
        p(
          fa
            ? 'تبریک! یکی از ایجنت‌های شما فروش رفت.'
            : 'Congratulations! One of your agents was purchased.',
        ) +
        detailTable(locale, [
          [fa ? 'ایجنت' : 'Agent', String(data.agentName)],
          [fa ? 'مبلغ' : 'Amount', detail],
          [
            fa ? 'شماره سفارش' : 'Order ref',
            formatOrderRef(String(data.orderId)),
          ],
        ]) +
        ctaButton(locale, fa ? 'مشاهده ایجنت' : 'View the agent', agentUrl) +
        p(supportLine(locale))
      );
    }
    case 'payment_failed':
      return (
        p(greeting(locale, data.recipientName as string | undefined)) +
        p(
          fa
            ? 'متأسفانه پرداخت شما تکمیل نشد. مبلغی از حساب شما کسر نشده است.'
            : 'Your payment was not completed. Nothing was charged.',
        ) +
        detailTable(locale, [
          [
            fa ? 'شماره سفارش' : 'Order ref',
            formatOrderRef(String(data.orderId)),
          ],
        ]) +
        p(
          fa
            ? 'می‌توانید هر زمان دوباره خرید را انجام دهید.'
            : 'You can retry the purchase at any time.',
        ) +
        ctaButton(
          locale,
          fa ? 'سفارش‌های من' : 'My orders',
          `${frontendBaseUrl()}/orders`,
        ) +
        p(supportLine(locale))
      );
    case 'refund_processed':
      return (
        p(greeting(locale, data.recipientName as string | undefined)) +
        p(
          data.approved === true
            ? fa
              ? 'درخواست بازپرداخت شما تأیید و انجام شد. مبلغ حداکثر تا چند روز کاری به حساب شما بازمی‌گردد.'
              : 'Your refund request was approved and processed. The amount will be returned within a few business days.'
            : fa
              ? 'متأسفانه درخواست بازپرداخت شما تأیید نشد. برای جزئیات بیشتر با پشتیبانی در تماس باشید.'
              : 'Unfortunately, your refund request was not approved. Contact support for details.',
        ) +
        detailTable(locale, [
          [
            fa ? 'شماره سفارش' : 'Order ref',
            formatOrderRef(String(data.orderId)),
          ],
        ]) +
        ctaButton(
          locale,
          fa ? 'سفارش‌های من' : 'My orders',
          `${frontendBaseUrl()}/orders`,
        ) +
        p(supportLine(locale))
      );
    case 'creator_verification_result':
      return (
        p(greeting(locale, data.recipientName as string | undefined)) +
        p(
          data.approved === true
            ? fa
              ? 'درخواست احراز هویت سازنده شما تأیید شد. حساب شما اکنون تأییدشده است.'
              : 'Your creator verification request was approved. Your profile is now verified.'
            : fa
              ? 'متأسفانه درخواست احراز هویت سازنده شما تأیید نشد. برای پیگیری با پشتیبانی در تماس باشید.'
              : 'Unfortunately, your creator verification request was not approved. Contact support to follow up.',
        ) +
        p(supportLine(locale))
      );
  }
}

/**
 * Renders a template for a locale. Unknown locales fall back to English —
 * never a broken email (§20).
 */
export function renderEmail(
  template: EmailTemplateId,
  locale: string,
  data: Record<string, unknown>,
): RenderedEmail {
  const emailLocale: EmailLocale = locale === 'fa' ? 'fa' : 'en';
  const subject = SUBJECTS[template][emailLocale] ?? SUBJECTS[template].en;
  const text = textBody(template, emailLocale, data);
  const html = htmlShell(
    emailLocale,
    subject,
    htmlBody(template, emailLocale, data),
  );
  return { subject, text, html };
}
