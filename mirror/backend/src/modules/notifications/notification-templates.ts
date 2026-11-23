/**
 * Localized in-app notification templates (BUY upgrade §30–§31).
 *
 * Every notification the platform writes is rendered from THIS registry in
 * the RECIPIENT'S preferred locale (users.preferred_locale, default fa) —
 * no hardcoded English strings for buyers/creators/admins anywhere.
 *
 * Structure: TEMPLATES[type][variant] → { fa: {title, body}, en: {...} }.
 * `variant` distinguishes message shapes that share one notification type
 * (e.g. refund_processed: granted vs rejected). Params use {key}
 * interpolation and are always real values from the business event.
 */

export type NotificationLocale = 'fa' | 'en';

export interface NotificationTemplate {
  title: string;
  body: string;
}

type VariantTemplates = Record<NotificationLocale, NotificationTemplate>;

const TEMPLATES: Record<string, Record<string, VariantTemplates>> = {
  // ---- Phase 5: operational monitoring -----------------------------------
  monitoring_incident_opened: {
    default: {
      fa: {
        title: 'نیاز به بررسی عملیاتی Runtime',
        body: 'برای {product} یک رخداد عملیاتی ثبت شده است. جزئیات و مسیر پاسخ را در بخش پایش ببینید.',
      },
      en: {
        title: 'Runtime operational review needed',
        body: 'An operational incident was opened for {product}. Review the details and response path in Monitoring.',
      },
    },
  },
  monitoring_incident_update: {
    default: {
      fa: {
        title: 'به‌روزرسانی رخداد عملیاتی',
        body: 'وضعیت رخداد عملیاتی شما به‌روزرسانی شد: {outcome}.',
      },
      en: {
        title: 'Operational incident update',
        body: 'Your operational incident was updated: {outcome}.',
      },
    },
  },
  // ---- Phase 3: manual payout operations ---------------------------------
  payout_paid: {
    default: {
      fa: {
        title: 'برداشت شما پرداخت شد',
        body: 'مبلغ {amount} {currency} به حساب بانکی شما واریز شد. کد پیگیری بانکی: {reference}.',
      },
      en: {
        title: 'Your payout was paid',
        body: '{amount} {currency} was transferred to your bank account. Bank reference: {reference}.',
      },
    },
  },
  // ---- Phase C5: SCALE (§34) -------------------------------------------
  // These MUST live in the registry, not be passed as hardcoded strings from
  // the service. `renderNotification` looks a type up here and falls back to a
  // generic "Notification" when it is absent — so a type defined only at the
  // call site silently delivered "اعلان جدید" to every recipient and threw
  // away the real copy. That is exactly how all three C5 types behaved.
  c5_referral_signup: {
    default: {
      fa: {
        title: 'دعوت شما ثبت شد',
        body: '{referredName} با لینک دعوت شما ثبت‌نام کرد. برای فعال‌شدن و دریافت پاداش، یک خرید انجام دهد.',
      },
      en: {
        title: 'Your invite signed up',
        body: '{referredName} signed up with your referral link. They earn your reward once they make a purchase.',
      },
    },
  },
  c5_referral_conversion: {
    default: {
      fa: {
        title: 'اولین خرید یکی از دعوت‌های شما',
        body: '{referredName} اولین خرید خود را انجام داد. پاداش شما پس از تأیید تراکنش قابل دریافت می‌شود.',
      },
      en: {
        title: 'One of your invites made a purchase',
        body: '{referredName} made their first purchase. Your reward becomes available once the transaction settles.',
      },
    },
  },
  c5_reward_available: {
    default: {
      fa: {
        title: 'پاداش شما آماده دریافت است',
        body: 'مبلغ {amount} برای شما آماده برداشت است. پس از انتقال، آن را «پرداخت‌شده» علامت بزنید.',
      },
      en: {
        title: 'Your reward is ready to withdraw',
        body: '{amount} is available to withdraw. Mark it as paid once you have transferred it.',
      },
    },
  },
  c5_reward_reversed: {
    default: {
      fa: {
        title: 'پاداشی برگشت داده شد',
        body: 'یکی از پاداش‌های شما به دلیل {reason} معکوس شد. جزئیات در صفحهٔ پاداش‌های شماست.',
      },
      en: {
        title: 'A reward was reversed',
        body: 'One of your rewards was reversed because of {reason}. See your rewards page for details.',
      },
    },
  },
  c5_ambassador_invited: {
    default: {
      fa: {
        title: 'برای برنامهٔ سفیران MESH واجد شرایط شدید',
        body: 'مزایا و مسئولیت‌های برنامه را ببینید و تصمیم بگیرید که به برنامه بپیوندید.',
      },
      en: {
        title: 'You are eligible for the MESH Ambassador programme',
        body: 'Review the benefits and responsibilities, then decide whether to join the programme.',
      },
    },
  },
  c5_ambassador_active: {
    default: {
      fa: {
        title: 'عضویت شما در برنامهٔ سفیران فعال شد',
        body: 'اکنون می‌توانید لینک همکاری خود را به اشتراک بگذارید و درآمد کمیسیون خود را پیگیری کنید.',
      },
      en: {
        title: 'Your Ambassador membership is active',
        body: 'You can now share your referral link and track your commission earnings.',
      },
    },
  },
  c5_partnership_decision: {
    granted: {
      fa: {
        title: 'درخواست همکاری شما تأیید شد',
        body: 'همکاری شما با {partnerName} تأیید شد. جزئیات در صفحهٔ همکاری‌های شماست.',
      },
      en: {
        title: 'Your partnership request was approved',
        body: 'Your partnership with {partnerName} was approved. Details are on your partnerships page.',
      },
    },
    rejected: {
      fa: {
        title: 'درخواست همکاری شما تأیید نشد',
        body: 'دلیل: {reason}. می‌توانید پس از اصلاح، دوباره درخواست بدهید.',
      },
      en: {
        title: 'Your partnership request was not approved',
        body: 'Reason: {reason}. You may apply again once it is addressed.',
      },
    },
  },
  c5_affiliate_decision: {
    approved: {
      fa: {
        title: 'درخواست همکاری در فروش تأیید شد',
        body: 'کد همکاری شما فعال شد. لینک خود را به اشتراک بگذارید تا کمیسیون خریدها را کسب کنید.',
      },
      en: {
        title: 'Your affiliate application was approved',
        body: 'Your affiliate code is now live. Share your link to earn commission on referred purchases.',
      },
    },
    rejected: {
      fa: {
        title: 'درخواست همکاری در فروش تأیید نشد',
        body: 'دلیل: {reason}. می‌توانید پس از اصلاح، دوباره درخواست بدهید.',
      },
      en: {
        title: 'Your affiliate application was not approved',
        body: 'Reason: {reason}. You may apply again once it is addressed.',
      },
    },
  },
  c5_community_invited: {
    default: {
      fa: {
        title: 'به جامعهٔ سازندگان MESH دعوت شدید',
        body: '{inviterName} شما را به جامعه دعوت کرد. برای دیدن بحث‌ها وارد شوید.',
      },
      en: {
        title: 'You were invited to the MESH creator community',
        body: '{inviterName} invited you to the community. Join to see the discussions.',
      },
    },
  },
  c5_community_joined: {
    default: {
      fa: {
        title: 'به جامعهٔ سازندگان پیوستید',
        body: 'خوش آمدید. اولین پست خود را بنویسید تا با بقیهٔ سازندگان آشنا شوید.',
      },
      en: {
        title: 'You joined the creator community',
        body: 'Welcome. Write your first post to meet the other creators.',
      },
    },
  },
  c5_commission_available: {
    default: {
      fa: {
        title: 'کمیسیون شما آماده دریافت است',
        body: 'کمیسیون {amount} از خریدهای ارجاع‌شده آمادهٔ برداشت است.',
      },
      en: {
        title: 'Your commission is ready to withdraw',
        body: '{amount} in commission from referred purchases is available to withdraw.',
      },
    },
  },
  // ---- Notification hardening: active producers must never fall back -----
  // These messages were already emitted by authoritative server-side flows.
  // Keeping the copy here makes the event-specific FA/EN content explicit
  // rather than silently replacing it with the generic unknown-event text.
  system: {
    default: {
      fa: {
        title: 'اطلاعیه MESH',
        body: '{message}',
      },
      en: {
        title: 'MESH notice',
        body: '{message}',
      },
    },
  },
  creator_referral_available: {
    default: {
      fa: {
        title: 'لینک دعوت شما آماده است',
        body: 'اکنون می‌توانید سازندگان دیگر را به MESH دعوت کنید.',
      },
      en: {
        title: 'Your referral link is ready',
        body: 'You can now invite other creators to MESH.',
      },
    },
  },
  review_received: {
    default: {
      fa: {
        title: 'بازخورد جدید برای محصول شما',
        body: 'یک خریدار برای یکی از محصولات شما نظر جدیدی ثبت کرده است.',
      },
      en: {
        title: 'New feedback on your product',
        body: 'A buyer left a new review for one of your products.',
      },
    },
  },
  case_study_invited: {
    default: {
      fa: {
        title: 'برای ثبت داستان موفقیت دعوت شدید',
        body: 'می‌توانید داستان موفقیت خود را آماده و برای بررسی ارسال کنید.',
      },
      en: {
        title: 'You are invited to share a success story',
        body: 'You can prepare your success story and submit it for review.',
      },
    },
  },
  case_study_update: {
    published: {
      fa: {
        title: 'داستان موفقیت شما منتشر شد',
        body: 'داستان موفقیت شما اکنون در بخش عمومی قابل مشاهده است.',
      },
      en: {
        title: 'Your success story was published',
        body: 'Your success story is now visible in the public area.',
      },
    },
    changes_requested: {
      fa: {
        title: 'داستان موفقیت شما نیاز به اصلاح دارد',
        body: 'لطفاً داستان موفقیت خود را بازبینی و پس از اصلاح دوباره ارسال کنید.',
      },
      en: {
        title: 'Your success story needs changes',
        body: 'Please review your success story, make the requested changes, and submit it again.',
      },
    },
    default: {
      fa: {
        title: 'به‌روزرسانی داستان موفقیت',
        body: 'وضعیت داستان موفقیت شما به‌روزرسانی شد.',
      },
      en: {
        title: 'Success-story update',
        body: 'The status of your success story was updated.',
      },
    },
  },
  referral_first_sale: {
    default: {
      fa: {
        title: 'اولین فروش یک سازنده دعوت‌شده ثبت شد',
        body: 'یکی از سازندگانی که دعوت کرده‌اید، اولین فروش خود را ثبت کرد.',
      },
      en: {
        title: 'A referred creator made their first sale',
        body: 'One of the creators you referred made their first sale.',
      },
    },
  },
  'creator.assistance_resolved': {
    default: {
      fa: {
        title: 'پاسخ درخواست راهنمایی شما آماده است',
        body: 'درخواست راهنمایی شما رسیدگی شد. برای دیدن پاسخ، بخش راهنمایی را باز کنید.',
      },
      en: {
        title: 'Your assistance request has a response',
        body: 'Your assistance request was resolved. Open the assistance area to view the response.',
      },
    },
  },
  'activation.onboarding_not_started': {
    default: {
      fa: {
        title: 'شروع مسیر ساخت محصول',
        body: 'برای ادامه مسیر سازندگی، مرحله‌های آغازین را تکمیل کنید.',
      },
      en: {
        title: 'Start your creator journey',
        body: 'Complete the first steps to continue your creator journey.',
      },
    },
  },
  'activation.idea_selected_no_product': {
    default: {
      fa: {
        title: 'ایده شما آماده تبدیل‌شدن به محصول است',
        body: 'ایده انتخاب‌شده را به یک محصول اولیه تبدیل کنید تا مسیر انتشار را ادامه دهید.',
      },
      en: {
        title: 'Your idea is ready to become a product',
        body: 'Turn your selected idea into a first product to continue toward publication.',
      },
    },
  },
  'activation.product_incomplete': {
    default: {
      fa: {
        title: 'محصول شما هنوز کامل نشده است',
        body: 'موارد باقی‌مانده را تکمیل کنید تا محصول برای بررسی آماده شود.',
      },
      en: {
        title: 'Your product is not complete yet',
        body: 'Complete the remaining items to prepare your product for review.',
      },
    },
  },
  'activation.product_ready_not_submitted': {
    default: {
      fa: {
        title: 'محصول شما آماده ارسال برای بررسی است',
        body: 'وقتی آماده بودید، محصول را برای بررسی ارسال کنید.',
      },
      en: {
        title: 'Your product is ready for review',
        body: 'When you are ready, submit your product for review.',
      },
    },
  },
  purchase_success: {
    default: {
      fa: {
        title: 'خرید با موفقیت انجام شد',
        body: 'ایجنت «{agentName}» با موفقیت به کتابخانه شما اضافه شد.',
      },
      en: {
        title: 'Purchase complete',
        body: '"{agentName}" was added to your library.',
      },
    },
  },
  payment_failed: {
    default: {
      fa: {
        title: 'پرداخت ناموفق',
        body: 'پرداخت شما تکمیل نشد. می‌توانید هر زمان دوباره اقدام به خرید کنید.',
      },
      en: {
        title: 'Payment failed',
        body: 'Your payment was not completed. You can retry checkout at any time.',
      },
    },
  },
  new_sale: {
    default: {
      fa: {
        title: 'فروش جدید',
        body: 'ایجنت «{agentName}» توسط یک خریدار خریداری شد.',
      },
      en: {
        title: 'New sale',
        body: '"{agentName}" was purchased by a buyer.',
      },
    },
  },
  refund_requested: {
    default: {
      fa: {
        title: 'درخواست بازپرداخت',
        body: 'یک خریدار برای سفارش {orderId} درخواست بازپرداخت ثبت کرد.',
      },
      en: {
        title: 'Refund request',
        body: 'A buyer requested a refund for order {orderId}.',
      },
    },
  },
  refund_processed: {
    granted: {
      fa: {
        title: 'بازپرداخت انجام شد',
        body: 'بازپرداخت مبلغ {amount} برای سفارش {orderId} انجام شد.',
      },
      en: {
        title: 'Refund processed',
        body: 'Your refund of {amount} for order {orderId} was processed.',
      },
    },
    rejected: {
      fa: {
        title: 'درخواست بازپرداخت رد شد',
        body: '{note}',
      },
      en: {
        title: 'Refund request rejected',
        body: '{note}',
      },
    },
    under_review: {
      fa: {
        title: 'درخواست بازپرداخت در حال بررسی است',
        body: 'درخواست شما برای سفارش {orderId} توسط تیم پشتیبانی در حال بررسی است. نتیجه را به شما اطلاع می‌دهیم.',
      },
      en: {
        title: 'Your refund request is under review',
        body: 'Our team is reviewing your request for order {orderId}. We will let you know the outcome.',
      },
    },
    creator: {
      fa: {
        title: 'سفارش بازپرداخت شد',
        body: 'مبلغ {amount} از یکی از فروش‌های شما بازپرداخت شد.',
      },
      en: {
        title: 'Order refunded',
        body: 'A refund of {amount} was processed against one of your sales.',
      },
    },
  },
  // A5 §11 — the creator hears about every new buyer review, with a deep
  // link to that review in the creator's review center.
  review_submitted: {
    default: {
      fa: {
        title: 'نظر جدید برای «{agentName}»',
        body: 'یک خریدار برای «{agentName}» نظر جدیدی ثبت کرده است ({rating} از ۵).',
      },
      en: {
        title: 'New review for "{agentName}"',
        body: 'A buyer left a new review for "{agentName}" ({rating}/5).',
      },
    },
  },
  // A5 §12 — the creator marked the buyer's issue as fixed in a version.
  review_resolved: {
    default: {
      fa: {
        title: 'موضوع نظر شما در «{agentName}» برطرف شد',
        body: 'سازنده اعلام کرد این مورد در نسخهٔ {version} برطرف شده است.',
      },
      en: {
        title: 'Your feedback on "{agentName}" was addressed',
        body: 'The creator says this was fixed in version {version}.',
      },
    },
  },
  // A5 §27 — creator-wide sales milestones (10 / 25 / 50 / 100).
  sales_milestone: {
    default: {
      fa: {
        title: '{count} فروش ثبت شد',
        body: 'محصولات شما به {count} فروش رسیدند. گزارش رشد را در مرکز رشد ببینید.',
      },
      en: {
        title: '{count} sales reached',
        body: 'Your products reached {count} sales. See your growth report in the Growth Center.',
      },
    },
  },
  review_replied: {
    default: {
      fa: {
        title: 'پاسخ سازنده به دیدگاه شما',
        body: '«{agentName}» — {excerpt}',
      },
      en: {
        title: 'A creator replied to your review',
        body: '"{agentName}" — {excerpt}',
      },
    },
  },
  // ---- Blog engagement (2026-10-14) --------------------------------------
  blog_comment_new: {
    default: {
      fa: {
        title: 'دیدگاه تازه روی مقالهٔ شما',
        body: '«{postTitle}» — {excerpt}',
      },
      en: {
        title: 'New comment on your article',
        body: '"{postTitle}" — {excerpt}',
      },
    },
  },
  blog_comment_reply: {
    default: {
      fa: {
        title: 'پاسخ به دیدگاه شما',
        body: '«{postTitle}» — {excerpt}',
      },
      en: {
        title: 'Someone replied to your comment',
        body: '"{postTitle}" — {excerpt}',
      },
    },
  },
  blog_comment_removed: {
    default: {
      fa: {
        title: 'دیدگاه شما حذف شد',
        body: 'دیدگاه شما روی «{postTitle}» به دلیل نقض قوانین گفت‌وگو حذف شد. {reason}',
      },
      en: {
        title: 'Your comment was removed',
        body: 'Your comment on "{postTitle}" was removed for breaking the discussion rules. {reason}',
      },
    },
  },
  report_submitted: {
    default: {
      fa: {
        title: 'گزارش لیستینگ جدید',
        body: 'ایجنت «{agentName}» گزارش شد ({reason}).',
      },
      en: {
        title: 'New listing report',
        body: '"{agentName}" was reported ({reason}).',
      },
    },
  },
  report_status: {
    resolved: {
      fa: {
        title: 'گزارش حل شد',
        body: '{note}',
      },
      en: {
        title: 'Report resolved',
        body: '{note}',
      },
    },
    rejected: {
      fa: {
        title: 'گزارش رد شد',
        body: '{note}',
      },
      en: {
        title: 'Report rejected',
        body: '{note}',
      },
    },
  },
  support_request: {
    default: {
      fa: {
        title: 'درخواست پشتیبانی جدید',
        body: '«{subject}»',
      },
      en: {
        title: 'New support request',
        body: '"{subject}"',
      },
    },
  },
  support_reply: {
    default: {
      fa: {
        title: 'پیام پشتیبانی جدید',
        body: '«{subject}» — {excerpt}',
      },
      en: {
        title: 'New support message',
        body: '"{subject}" — {excerpt}',
      },
    },
  },
  support_status: {
    default: {
      fa: {
        title: 'وضعیت درخواست پشتیبانی',
        body: '«{subject}» اکنون در وضعیت «{status}» است.',
      },
      en: {
        title: 'Support request update',
        body: '"{subject}" is now {status}.',
      },
    },
    closed: {
      fa: {
        title: 'درخواست پشتیبانی بسته شد',
        body: '«{subject}» توسط درخواست‌کننده بسته شد.',
      },
      en: {
        title: 'Support request closed',
        body: '"{subject}" was closed by the requester.',
      },
    },
  },
  account_status: {
    suspended: {
      fa: {
        title: 'حساب شما مسدود شد',
        body: 'حساب کاربری شما توسط یک مدیر مسدود شده است.',
      },
      en: {
        title: 'Account suspended',
        body: 'Your account was suspended by an administrator.',
      },
    },
    active: {
      fa: {
        title: 'حساب شما فعال شد',
        body: 'حساب کاربری شما توسط یک مدیر دوباره فعال شد.',
      },
      en: {
        title: 'Account active',
        body: 'Your account was reactivated by an administrator.',
      },
    },
  },
  agent_submitted: {
    default: {
      fa: {
        title: 'لیستینگ برای بررسی ارسال شد',
        body: '«{agentName}» در انتظار بررسی است.',
      },
      en: {
        title: 'Listing submitted for review',
        body: '"{agentName}" awaits review.',
      },
    },
  },
  agent_review_result: {
    rejected: {
      fa: {
        title: 'لیستینگ رد شد',
        body: '{note}',
      },
      en: {
        title: 'Listing rejected',
        body: '{note}',
      },
    },
    changes_requested: {
      fa: {
        title: 'اصلاحات در لیستینگ درخواست شد',
        body: '{note}',
      },
      en: {
        title: 'Changes requested',
        body: '{note}',
      },
    },
    suspended: {
      fa: {
        title: 'لیستینگ تعلیق شد',
        body: '{note}',
      },
      en: {
        title: 'Listing suspended',
        body: '{note}',
      },
    },
  },
  // Phase A3 §36 — creator-facing review lifecycle. Short, warm, non
  // technical; the product name is always included and the notification
  // deep-links to the review center.
  agent_review: {
    submitted: {
      fa: {
        title: 'محصول شما برای بررسی ارسال شد.',
        body: '«{agentName}» دریافت شد. تیم Mesh به‌زودی بررسی آن را شروع می‌کند.',
      },
      en: {
        title: 'Your product was submitted for review.',
        body: '"{agentName}" was received. The Mesh team will start reviewing it soon.',
      },
    },
    review_started: {
      fa: {
        title: 'بررسی محصول شما آغاز شد.',
        body: 'تیم Mesh در حال بررسی «{agentName}» است. نتیجه را به شما اطلاع می‌دهیم.',
      },
      en: {
        title: 'Your product review has started.',
        body: 'The Mesh team is reviewing "{agentName}". We will let you know the result.',
      },
    },
    action_required: {
      fa: {
        title: 'برای ادامه بررسی، چند مورد نیاز به اصلاح دارد.',
        body: '«{agentName}»: {count} مورد نیاز به توجه شما دارد. موارد را ببینید و نسخه اصلاح‌شده را ارسال کنید.',
      },
      en: {
        title: 'A few things need your attention to continue the review.',
        body: '"{agentName}": {count} item(s) need your attention. Review them and send the corrected version.',
      },
    },
    resubmitted: {
      fa: {
        title: 'نسخه اصلاح‌شده محصول شما دریافت شد.',
        body: 'نسخه اصلاح‌شده «{agentName}» در صف بررسی مجدد قرار گرفت.',
      },
      en: {
        title: 'Your corrected product version was received.',
        body: 'The corrected version of "{agentName}" is queued for another review.',
      },
    },
    approved: {
      fa: {
        title: '🎉 محصول شما تأیید شد و آماده انتشار است.',
        body: '«{agentName}» بررسی را با موفقیت پشت سر گذاشت. هر زمان آماده بودید، آن را منتشر کنید.',
      },
      en: {
        title: '🎉 Your product was approved and is ready to publish.',
        body: '"{agentName}" passed review. Publish it whenever you are ready.',
      },
    },
    rejected: {
      fa: {
        title: 'محصول شما تأیید نشد.',
        body: '«{agentName}»: {reason}. جزئیات و توضیح کامل را در صفحه بررسی ببینید.',
      },
      en: {
        title: 'Your product was not approved.',
        body: '"{agentName}": {reason}. See the full explanation on the review page.',
      },
    },
    returned: {
      fa: {
        title: 'بررسی محصول شما ادامه پیدا کرد.',
        body: 'تیم Mesh «{agentName}» را دوباره در حال بررسی قرار داد.',
      },
      en: {
        title: 'Your product review continues.',
        body: 'The Mesh team moved "{agentName}" back into review.',
      },
    },
  },
  // Phase A3 — admin-facing queue signal.
  agent_review_queue: {
    submitted: {
      fa: {
        title: 'محصول جدید در صف بررسی',
        body: '«{agentName}» برای بررسی ارسال شد.',
      },
      en: {
        title: 'New product in the review queue',
        body: '"{agentName}" was submitted for review.',
      },
    },
    resubmitted: {
      fa: {
        title: 'نسخه اصلاح‌شده در صف بررسی',
        body: '«{agentName}» پس از اصلاحات دوباره ارسال شد.',
      },
      en: {
        title: 'Corrected version in the review queue',
        body: '"{agentName}" was resubmitted after changes.',
      },
    },
  },
  // Phase A3 §36 copy — also the "published" step of the review lifecycle.
  agent_published: {
    default: {
      fa: {
        title: '🎉 «{agentName}» با موفقیت منتشر شد.',
        body: 'نسخه {version} اکنون در MESH برای خریداران در دسترس است. محصولتان را به اشتراک بگذارید تا اولین بازدیدها را بگیرید.',
      },
      en: {
        title: '🎉 "{agentName}" was published successfully.',
        body: 'Version {version} is now available to buyers on MESH. Share it to get your first visitors.',
      },
    },
  },
  // Phase A4 §24 — first real paid sale (atomic, once per product).
  first_sale: {
    // The creator's very first sale across all products.
    creator: {
      fa: {
        title: '🎉 اولین فروش شما ثبت شد!',
        body: 'تبریک! اولین خریدار شما «{agentName}» را خریداری کرد — مبلغ {amount} {currency}، {saleDate}.',
      },
      en: {
        title: '🎉 Your first sale is in!',
        body: 'Congratulations! Your first buyer purchased "{agentName}" — {amount} {currency}, {saleDate}.',
      },
    },
    // The first sale of an additional product.
    product: {
      fa: {
        title: '🎉 اولین فروش «{agentName}» ثبت شد.',
        body: 'اولین خریدار این محصول ثبت شد — مبلغ {amount} {currency}، {saleDate}.',
      },
      en: {
        title: '🎉 First sale of "{agentName}".',
        body: 'This product just got its first buyer — {amount} {currency}, {saleDate}.',
      },
    },
  },
  // Gap closure — the creator's first product draft exists (once).
  first_product_created: {
    default: {
      fa: {
        title: 'اولین محصول شما ساخته شد',
        body: '«{agentName}» به‌صورت پیش‌نویس ذخیره شد. تغییرات خودکار ذخیره می‌شوند؛ هر وقت آماده بودید آن را برای بررسی ارسال کنید.',
      },
      en: {
        title: 'Your first product was created',
        body: '"{agentName}" was saved as a draft. Changes save automatically — submit it for review when you are ready.',
      },
    },
  },
  // Gap closure — a product received its FIRST save (once per product).
  first_favorite: {
    default: {
      fa: {
        title: 'اولین علاقه‌مند «{agentName}»',
        body: 'یک خریدار این محصول را در علاقه‌مندی‌هایش ذخیره کرد. صفحه محصول را کامل‌تر کنید تا این علاقه به خرید تبدیل شود.',
      },
      en: {
        title: 'First save for "{agentName}"',
        body: 'A buyer saved this product. Polish the product page so that interest turns into a purchase.',
      },
    },
  },
  // Gap closure — a new version of a product the user owns / saved is live.
  product_updated: {
    owner: {
      fa: {
        title: 'نسخه جدید «{agentName}» منتشر شد',
        body: 'نسخه {version} در دسترس است. تغییرات این نسخه را در صفحه محصول ببینید.',
      },
      en: {
        title: 'A new version of "{agentName}" is available',
        body: 'Version {version} is live. See what changed on the product page.',
      },
    },
    favorite: {
      fa: {
        title: '«{agentName}» به‌روزرسانی شد',
        body: 'محصولی که در علاقه‌مندی‌ها ذخیره کرده‌اید نسخه {version} را منتشر کرد.',
      },
      en: {
        title: '"{agentName}" was updated',
        body: 'A product in your saved list released version {version}.',
      },
    },
    follower: {
      fa: {
        title: '«{agentName}» به‌روزرسانی شد',
        body: 'محصولی که دنبال می‌کنید نسخه {version} را منتشر کرد. تغییرات را در صفحه محصول ببینید.',
      },
      en: {
        title: '"{agentName}" was updated',
        body: 'A product you follow released version {version}. See what changed on the product page.',
      },
    },
  },
  // Buyer discovery — a creator / category you follow published a new product.
  followed_new_product: {
    creator: {
      fa: {
        title: 'محصول جدید از {creatorName}',
        body: '«{agentName}» تازه منتشر شد. سازنده‌ای که دنبال می‌کنید محصول تازه‌ای دارد.',
      },
      en: {
        title: 'New product from {creatorName}',
        body: '"{agentName}" was just published by a creator you follow.',
      },
    },
    category: {
      fa: {
        title: 'محصول جدید در «{categoryName}»',
        body: '«{agentName}» تازه در دسته‌ای که دنبال می‌کنید منتشر شد.',
      },
      en: {
        title: 'New in "{categoryName}"',
        body: '"{agentName}" was just published in a category you follow.',
      },
    },
  },
  // Phase A4 §47 — admins: a creator asked for a promotion.
  promotion_requested: {
    default: {
      fa: {
        title: 'درخواست معرفی جدید',
        body: 'برای «{agentName}» درخواست معرفی ({promotionType}) ثبت شد.',
      },
      en: {
        title: 'New promotion request',
        body: 'A {promotionType} promotion was requested for "{agentName}".',
      },
    },
  },
  // Phase A4 §14/§47 — promotion request lifecycle (request-only).
  promotion_update: {
    under_review: {
      fa: {
        title: 'درخواست معرفی «{agentName}» در حال بررسی است.',
        body: 'تیم MESH درخواست شما را بررسی می‌کند و نتیجه را اطلاع می‌دهد.',
      },
      en: {
        title: 'Your promotion request for "{agentName}" is under review.',
        body: 'The MESH team is reviewing your request and will let you know.',
      },
    },
    approved: {
      fa: {
        title: 'درخواست معرفی «{agentName}» تأیید شد.',
        body: 'تیم MESH زمان انتشار را مشخص می‌کند و به شما اطلاع می‌دهد.',
      },
      en: {
        title: 'Your promotion request for "{agentName}" was approved.',
        body: 'The MESH team will set a publish date and let you know.',
      },
    },
    scheduled: {
      fa: {
        title: 'درخواست معرفی «{agentName}» تأیید و زمان‌بندی شد.',
        body: 'زمان شروع: {startDate}.',
      },
      en: {
        title: 'Your promotion for "{agentName}" was approved and scheduled.',
        body: 'Starts on {startDate}.',
      },
    },
    active: {
      fa: {
        title: 'معرفی ویژهٔ «{agentName}» فعال شد.',
        body: 'محصول شما اکنون در جایگاه ویژه و با برچسب «Sponsored» نمایش داده می‌شود.',
      },
      en: {
        title: 'The sponsored placement for "{agentName}" is active.',
        body: 'Your product is now shown in the sponsored placement, clearly labelled.',
      },
    },
    published: {
      fa: {
        title: 'MESH «{agentName}» را در کانال‌هایش معرفی کرد.',
        body: 'پست معرفی محصول شما منتشر شد.',
      },
      en: {
        title: 'MESH featured "{agentName}" on its channels.',
        body: 'The post introducing your product is live.',
      },
    },
    rejected: {
      fa: {
        title: 'درخواست معرفی «{agentName}» تأیید نشد.',
        body: '{reason}',
      },
      en: {
        title: 'Your promotion request for "{agentName}" was not approved.',
        body: '{reason}',
      },
    },
    completed: {
      fa: {
        title: 'دورهٔ معرفی ویژهٔ «{agentName}» به پایان رسید.',
        body: 'نتیجه را در بخش عملکرد محصول ببینید.',
      },
      en: {
        title: 'The promotion for "{agentName}" has ended.',
        body: 'See the results in your product performance.',
      },
    },
  },
  verification_update: {
    approved: {
      fa: {
        title: 'حساب سازنده تأیید شد',
        body: 'اکنون می‌توانید لیستینگ‌های ایجنت خود را برای بررسی ارسال کنید.',
      },
      en: {
        title: 'Creator account approved',
        body: 'You can now submit agent listings for review.',
      },
    },
    suspended: {
      fa: {
        title: 'حساب سازنده تعلیق شد',
        body: '{note}',
      },
      en: {
        title: 'Creator account suspended',
        body: '{note}',
      },
    },
    verified: {
      fa: {
        title: 'شما اکنون سازنده تأییدشده هستید',
        body: 'نشان سازنده تأییدشده روی پروفایل شما نمایش داده می‌شود.',
      },
      en: {
        title: 'You are now a verified creator',
        body: 'The Verified Creator badge is now shown on your profile.',
      },
    },
    changes_requested: {
      fa: {
        title: 'درخواست تأیید سازنده نیاز به اصلاح دارد',
        body: '{note}',
      },
      en: {
        title: 'Your creator verification request needs changes',
        body: '{note}',
      },
    },
    revoked: {
      fa: {
        title: 'نشان سازنده تأییدشده لغو شد',
        body: '{note}',
      },
      en: {
        title: 'Verified creator badge revoked',
        body: '{note}',
      },
    },
  },
  verification_request: {
    default: {
      fa: {
        title: 'درخواست تأیید سازنده جدید',
        body: '«{displayName}» درخواست نشان سازنده تأییدشده را ثبت کرد.',
      },
      en: {
        title: 'New creator verification request',
        body: '"{displayName}" requested the Verified Creator badge.',
      },
    },
  },
  // Sprint 2 — buyer activation journey. Short, human, actionable.
  product_ready: {
    default: {
      fa: {
        title: '«{agentName}» آماده راه‌اندازی است',
        body: 'دریافت محصول را تأیید کردید. مرحله بعد: راه‌اندازی. فقط چند قدم تا اولین نتیجه مانده است.',
      },
      en: {
        title: '"{agentName}" is ready to set up',
        body: 'You confirmed delivery. Next up: setup. Just a few steps to your first result.',
      },
    },
  },
  setup_reminder: {
    default: {
      fa: {
        title: 'راه‌اندازی «{agentName}» هنوز کامل نشده است',
        body: '{done} از {total} مرحله انجام شده. از همان‌جا که مانده‌اید ادامه دهید.',
      },
      en: {
        title: 'Setup of "{agentName}" is not finished yet',
        body: '{done} of {total} steps done. Pick up right where you left off.',
      },
    },
    not_started: {
      fa: {
        title: '«{agentName}» منتظر راه‌اندازی شماست',
        body: 'خریدتان انجام شده، اما راه‌اندازی هنوز شروع نشده است. شروع آن چند دقیقه بیشتر طول نمی‌کشد.',
      },
      en: {
        title: '"{agentName}" is waiting to be set up',
        body: 'Your purchase is done but setup has not started. It only takes a few minutes.',
      },
    },
  },
  review_request: {
    default: {
      fa: {
        title: 'تجربه‌تان از «{agentName}» را به اشتراک بگذارید',
        body: 'به اولین نتیجه رسیدید. یک نظر کوتاه به خریداران بعدی و سازنده کمک می‌کند.',
      },
      en: {
        title: 'Share your experience with "{agentName}"',
        body: 'You reached your first result. A short review helps future buyers and the creator.',
      },
    },
  },
  // Phase 10 — this is an in-app event only after the entitlement authority
  // has transitioned a genuinely term-bound grant to expired. It neither
  // promises renewal nor implies a subscription or an external message.
  entitlement_expired: {
    default: {
      fa: {
        title: 'دسترسی مدت‌دار شما پایان یافته است',
        body: 'دسترسی «{agentName}» بر اساس مدت ثبت‌شده پایان یافته است. جزئیات وضعیت را در فضای محصول ببینید.',
      },
      en: {
        title: 'Your term-bound access has ended',
        body: 'Access to "{agentName}" ended according to its recorded term. See the product workspace for its current status.',
      },
    },
  },
  password_changed: {
    default: {
      fa: {
        title: 'رمز عبور شما تغییر کرد',
        body: 'رمز عبور حساب شما با موفقیت تغییر کرد. تمام نشست‌های دیگر از شما خارج شدند.',
      },
      en: {
        title: 'Your password was changed',
        body: 'Your account password was changed successfully. All other sessions were signed out.',
      },
    },
  },
};

/**
 * Phase A4 — locale-aware parameter formatting, done at render time in the
 * RECIPIENT's locale: keys ending in `Date` carry an ISO timestamp
 * (fa → Jalali calendar, en → Gregorian), `amount` carries a plain number
 * and `currency` an ISO code (IRR → «ریال» for fa).
 */
function localizeParams(
  params: Record<string, string>,
  locale: NotificationLocale,
): Record<string, string> {
  const out: Record<string, string> = { ...params };
  for (const [key, value] of Object.entries(params)) {
    if (key.endsWith('Date')) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        out[key] = new Intl.DateTimeFormat(
          locale === 'fa' ? 'fa-IR-u-ca-persian' : 'en-US',
          { dateStyle: 'medium', timeZone: 'Asia/Tehran' },
        ).format(date);
      }
    } else if (key === 'amount' && /^-?\d+(\.\d+)?$/.test(value)) {
      out[key] = new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US', {
        maximumFractionDigits: 0,
      }).format(Number(value));
    } else if (key === 'currency' && locale === 'fa' && value === 'IRR') {
      out[key] = 'ریال';
    }
  }
  return out;
}

function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    params[key] !== undefined ? params[key] : match,
  );
}

/**
 * Renders a localized notification. Unknown types/variants fall back to a
 * neutral, still-localized shape — a notification must never 500 a business
 * flow (notifySafe semantics).
 */
export function renderNotification(
  type: string,
  variant: string,
  locale: string,
  params: Record<string, string> = {},
): NotificationTemplate {
  const localeKey: NotificationLocale = locale === 'en' ? 'en' : 'fa';
  const template = TEMPLATES[type]?.[variant]?.[localeKey] ??
    TEMPLATES[type]?.default?.[localeKey] ?? {
      title: localeKey === 'fa' ? 'اعلان جدید' : 'Notification',
      body:
        localeKey === 'fa'
          ? 'یک رویداد جدید در حساب شما رخ داد.'
          : 'A new event occurred in your account.',
    };
  const localized = localizeParams(params, localeKey);
  return {
    title: interpolate(template.title, localized),
    body: interpolate(template.body, localized),
  };
}

/** Sprint 2 — how loudly the UI presents a notification. */
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';

const SEVERITY_BY_TYPE: Record<string, NotificationSeverity> = {
  purchase_success: 'success',
  product_ready: 'success',
  review_request: 'info',
  setup_reminder: 'warning',
  entitlement_expired: 'warning',
  payment_failed: 'warning',
  refund_processed: 'info',
  account_status: 'warning',
  report_status: 'info',
  product_updated: 'info',
  blog_comment_removed: 'warning',
};

/** Variants that change the tone of their type. */
const SEVERITY_BY_VARIANT: Record<string, NotificationSeverity> = {
  'refund_processed:granted': 'success',
  'refund_processed:rejected': 'warning',
};

export function defaultSeverity(
  type: string,
  variant?: string,
): NotificationSeverity {
  return (
    (variant ? SEVERITY_BY_VARIANT[`${type}:${variant}`] : undefined) ??
    SEVERITY_BY_TYPE[type] ??
    'info'
  );
}
