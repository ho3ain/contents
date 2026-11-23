/**
 * Phase C4 — Review → Insight (§8) and Insight → Action (§9).
 *
 * PURE. The insight engine reads the structured topic arrays buyers already
 * fill in (`positive_topics` / `negative_topics`, the A5 §13 closed list)
 * and aggregates them.
 *
 * It does NOT attempt to interpret review prose, and that is a deliberate
 * refusal rather than a gap. §8 says that without model infrastructure the
 * system should implement rule/structured analysis, and that AI capability
 * must not be shown falsely. The project has no model provider, and
 * "sentiment analysis" of Persian prose written by regex would produce
 * confident nonsense — the kind of wrong insight that makes a creator edit
 * a product that did not need editing. Aggregating what buyers deliberately
 * tagged is real analysis, and it is honest about its own limits.
 *
 * Every insight therefore carries the count that produced it, so a creator
 * can see "4 خریدار" and judge for themselves rather than trusting a claim
 * with no evidence attached.
 */

import type { ReviewTopic } from '../../../database/entities/reviews/review.entity';

/** §8 — the categories an insight can fall into. */
export const INSIGHT_CATEGORIES = [
  'strength',
  'weakness',
  'feature_request',
  'usability_issue',
  'pricing_concern',
  'integration_issue',
  'support_issue',
] as const;

export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number];

/**
 * A single review's structured signal.
 *
 * `orderId` is carried so an insight can name the reviews behind it, which
 * is what lets a creator verify the pattern rather than take it on faith.
 */
export interface ReviewSignal {
  reviewId: string;
  agentId: string;
  rating: number;
  positiveTopics: ReviewTopic[];
  negativeTopics: ReviewTopic[];
  cons: string | null;
  pros: string | null;
  wouldRecommend: boolean | null;
  createdAt: Date;
}

export type OptimizationActionKey =
  | 'clarify_setup'
  | 'add_faq'
  | 'add_screenshots'
  | 'add_video'
  | 'fix_limitations'
  | 'add_integration'
  | 'improve_support'
  | 'review_pricing';

export interface ReviewInsight {
  key: string;
  category: InsightCategory;
  /** Persian, ready to render. */
  message: string;
  /** How many buyers raised this. Never less than 1. */
  count: number;
  topic: ReviewTopic;
  /** The reviews that produced it, so the claim is checkable. */
  reviewIds: string[];
  /** The concrete thing the creator can do about it (§9). */
  action: { key: OptimizationActionKey; label: string; href: string };
  /**
   * Confidence band. Below the threshold the insight is not shown at all —
   * a single complaint is an anecdote, and telling a creator "1 خریدار درباره
   * قیمت نارضایت داشت" as a pattern is noise dressed as analysis.
   */
  strength: 'weak' | 'moderate' | 'strong';
}

export const INSIGHT_MIN_COUNT = 2;
export const INSIGHT_STRONG_COUNT = 3;

/**
 * Topic → (category, action). One table, so the mapping is auditable
 * instead of scattered through branching logic.
 *
 * `missing_feature` is special: per A5 §13 a missing feature is only ever a
 * weakness, never a strength, so it never appears in the positive map.
 */
const POSITIVE_MAP: Partial<
  Record<
    ReviewTopic,
    {
      category: InsightCategory;
      actionKey: OptimizationActionKey;
      label: string;
    }
  >
> = {
  ux: {
    category: 'strength',
    actionKey: 'add_screenshots',
    label: 'از همین تجربهٔ خوب در صفحهٔ محصول استفاده کنید',
  },
  quality: {
    category: 'strength',
    actionKey: 'clarify_setup',
    label: 'کیفیت خروجی را در توضیحات محصول برجسته‌تر کنید',
  },
  docs: {
    category: 'strength',
    actionKey: 'add_faq',
    label: 'مستندات خوب را به یک بخش قابل استناد تبدیل کنید',
  },
  reliability: {
    category: 'strength',
    actionKey: 'clarify_setup',
    label: 'پایداری محصول را در صفحهٔ محصول بگویید',
  },
};

const NEGATIVE_MAP: Record<
  ReviewTopic,
  {
    category: InsightCategory;
    actionKey: OptimizationActionKey;
    label: string;
    message: string;
  }
> = {
  ux: {
    category: 'usability_issue',
    actionKey: 'clarify_setup',
    label: 'توضیحات راه‌اندازی را ساده‌تر کنید',
    message: 'خریداران از تجربهٔ کاربری محصول راضی نبوده‌اند',
  },
  quality: {
    category: 'weakness',
    actionKey: 'clarify_setup',
    label: 'کیفیت خروجی را بازبینی کنید',
    message: 'خریداران از کیفیت خروجی رضایت نداشته‌اند',
  },
  docs: {
    category: 'usability_issue',
    actionKey: 'add_faq',
    label: 'راهنما و پرسش‌های متداول اضافه کنید',
    message: 'خریداران مستندات یا توضیحات کافی پیدا نکرده‌اند',
  },
  price: {
    category: 'pricing_concern',
    actionKey: 'review_pricing',
    label: 'ارزش محصول در برابر قیمت را روشن‌تر کنید',
    message: 'خریداران دربارهٔ قیمت محصول تردید داشته‌اند',
  },
  integration: {
    category: 'integration_issue',
    actionKey: 'add_integration',
    label: 'سازگاری محصول را مشخص کنید',
    message: 'خریداران دربارهٔ اتصال و سازگاری مشکل داشته‌اند',
  },
  reliability: {
    category: 'weakness',
    actionKey: 'fix_limitations',
    label: 'پایداری و محدودیت‌ها را برطرف کنید',
    message: 'خریداران با مشکل پایداری محصول روبه‌رو شده‌اند',
  },
  missing_feature: {
    category: 'feature_request',
    actionKey: 'add_faq',
    label: 'در توضیحات، نبود این قابلیت را شفاف بگویید',
    message: 'خریداران به دنبال قابلیتی بوده‌اند که محصول ندارد',
  },
};

export function buildInsights(
  signals: ReviewSignal[],
  options: { minCount?: number; strongCount?: number } = {},
): ReviewInsight[] {
  const minCount = options.minCount ?? INSIGHT_MIN_COUNT;
  const strongCount = options.strongCount ?? INSIGHT_STRONG_COUNT;

  const positive = tally(signals, (s) => s.positiveTopics);
  const negative = tally(signals, (s) => s.negativeTopics);

  const insights: ReviewInsight[] = [];

  for (const [topic, count] of positive) {
    const mapped = POSITIVE_MAP[topic];
    if (!mapped || count < minCount) continue;
    insights.push({
      key: `strength:${topic}`,
      category: mapped.category,
      message: `${count} خریدار از ${TOPIC_LABELS[topic]} تعریف کرده‌اند`,
      count,
      topic,
      reviewIds: reviewsWith(signals, (s) => s.positiveTopics, topic),
      action: {
        key: mapped.actionKey,
        label: mapped.label,
        href: '/creator/agents',
      },
      strength: count >= strongCount ? 'strong' : 'moderate',
    });
  }

  for (const [topic, count] of negative) {
    const mapped = NEGATIVE_MAP[topic];
    if (!mapped || count < minCount) continue;
    insights.push({
      key: `weakness:${topic}`,
      category: mapped.category,
      message: `${count} خریدار دربارهٔ ${TOPIC_LABELS[topic]} اشاره کرده‌اند`,
      count,
      topic,
      reviewIds: reviewsWith(signals, (s) => s.negativeTopics, topic),
      action: {
        key: mapped.actionKey,
        label: mapped.label,
        href: actionHref(mapped.actionKey),
      },
      strength: count >= strongCount ? 'strong' : 'moderate',
    });
  }

  // Untagged complaints still count as evidence. A buyer who wrote "cons" but
  // tagged nothing has still said something, and dropping it would mean the
  // insight engine only sees buyers who used the taxonomy.
  const untagged = signals.filter(
    (s) => s.cons && s.cons.trim().length > 0 && s.negativeTopics.length === 0,
  );
  if (untagged.length >= minCount) {
    insights.push({
      key: 'weakness:untagged_concern',
      category: 'weakness',
      message: `${untagged.length} خریدار نکتهٔ منفی نوشته‌اند بدون انتخاب دسته‌بندی`,
      count: untagged.length,
      topic: 'quality',
      reviewIds: untagged.map((s) => s.reviewId),
      action: {
        key: 'clarify_setup',
        label: 'این بازخوردها را بخوانید و محصول را بر اساس آن اصلاح کنید',
        href: '/creator/reviews',
      },
      strength: untagged.length >= strongCount ? 'strong' : 'moderate',
    });
  }

  // Recommenders who rated low are a specific, actionable signal: the product
  // works but does not delight, which is a different fix than a broken one.
  const lukewarm = signals.filter(
    (s) => s.wouldRecommend === false || (s.rating > 0 && s.rating <= 3),
  );
  if (lukewarm.length >= minCount) {
    insights.push({
      key: 'weakness:would_not_recommend',
      category: 'weakness',
      message: `${lukewarm.length} خریدار محصول را پیشنهاد نکرده‌اند یا امتیاز پایین داده‌اند`,
      count: lukewarm.length,
      topic: 'quality',
      reviewIds: lukewarm.map((s) => s.reviewId),
      action: {
        key: 'improve_support',
        label: 'دلیل نارضایت را از خریدار بپرسید و برطرف کنید',
        href: '/creator/reviews',
      },
      strength: lukewarm.length >= strongCount ? 'strong' : 'moderate',
    });
  }

  // Weaknesses first: a creator with one compliment and three complaints
  // should act on the complaints.
  const rank = { strong: 0, moderate: 1, weak: 2 } as const;
  const categoryRank = (insight: ReviewInsight) =>
    insight.category === 'strength' ? 1 : 0;
  return insights.sort(
    (a, b) =>
      rank[a.strength] - rank[b.strength] ||
      b.count - a.count ||
      // On a tie a complaint still outranks a compliment. `Array.sort` is
      // stable, so without this the insertion order decides — and positives
      // are built first, which would put a compliment above a complaint the
      // creator should be acting on.
      categoryRank(a) - categoryRank(b),
  );
}

const TOPIC_LABELS: Record<ReviewTopic, string> = {
  ux: 'سادگی استفاده',
  quality: 'کیفیت خروجی',
  price: 'قیمت',
  docs: 'توضیحات و مستندات',
  integration: 'اتصال و سازگاری',
  reliability: 'پایداری',
  missing_feature: 'قابلیت‌های موجود نبود',
};

function actionHref(key: OptimizationActionKey): string {
  return key === 'improve_support' ? '/creator/reviews' : '/creator/agents';
}

function tally(
  signals: ReviewSignal[],
  pick: (signal: ReviewSignal) => ReviewTopic[],
): Map<ReviewTopic, number> {
  const counts = new Map<ReviewTopic, number>();
  for (const signal of signals) {
    for (const topic of pick(signal)) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }
  return counts;
}

function reviewsWith(
  signals: ReviewSignal[],
  pick: (signal: ReviewSignal) => ReviewTopic[],
  topic: ReviewTopic,
): string[] {
  return signals
    .filter((signal) => pick(signal).includes(topic))
    .map((signal) => signal.reviewId);
}
