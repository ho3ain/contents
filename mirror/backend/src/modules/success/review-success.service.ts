import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ReviewRequest } from '../../database/entities/success/review-request.entity';
import {
  Review,
  ReviewStatus,
  type ReviewTopic,
} from '../../database/entities/reviews/review.entity';
import { CrmEventsService } from '../crm/crm-events.service';
import { CREATOR_EVENTS } from '../crm/domain/events';
import {
  NotificationsService,
  NOTIFICATION_TYPES,
} from '../notifications/notifications.service';
import { buildInsights, type ReviewSignal } from './domain/insights';

/**
 * Phase C4 §5–§9 — review acquisition, the creator's review view, and the
 * insight engine's data.
 *
 * §5.1 sets the rule this service exists to enforce: a review request must
 * NOT go out blindly right after a purchase. A buyer who paid thirty seconds
 * ago has not used the product, and their "review" would be a reaction to a
 * payment screen. The delay is configurable and the eligibility is derived
 * from the ORDER's real state (paid, and old enough, and not already
 * reviewed).
 */
@Injectable()
export class ReviewSuccessService {
  private readonly logger = new Logger(ReviewSuccessService.name);

  constructor(
    @InjectRepository(ReviewRequest)
    private readonly requests: Repository<ReviewRequest>,
    @InjectRepository(Review)
    private readonly reviews: Repository<Review>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly events: CrmEventsService,
    private readonly notifications: NotificationsService,
  ) {}

  private get delayDays(): number {
    return this.config.get<number>('reviewRequestDelayDays') ?? 3;
  }

  /**
   * §5.1 — find the orders that should be asked about, and ask.
   *
   * Exactly-once is the database's job: UNIQUE (order_id, creator_id) means
   * two concurrent sweeps both trying to ask will both INSERT and exactly one
   * loses. The `NOT EXISTS` predicate is the fast path that keeps the sweep
   * cheap; the unique index is the guarantee that makes the fast path safe.
   *
   * Every condition is deliberate:
   *   - paid/fulfilled only, and not refunded: a refunded buyer's opinion of
   *     a product they no longer have is not a review of anything.
   *   - `paid_at` older than the delay window: §5.1's core rule.
   *   - no existing review for that buyer+product: §6 "one buyer cannot make
   *     many fake reviews for one order/product".
   *   - no open request already: so a re-sweep does not re-ask.
   */
  async runRequestSweep(
    options: { limit?: number; now?: Date } = {},
  ): Promise<{ considered: number; created: number }> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    const now = options.now ?? new Date();
    const cutoff = new Date(now.getTime() - this.delayDays * 86400000);

    const rows = await this.dataSource.query<
      Array<{
        order_id: string;
        buyer_id: string;
        agent_id: string;
        creator_id: string;
      }>
    >(
      `SELECT o.id AS order_id, o.buyer_id, oi.agent_id, a.creator_id
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN agents a ON a.id = oi.agent_id
        WHERE o.status IN ('paid','fulfilled')
          AND o.paid_at IS NOT NULL
          AND o.paid_at <= $1
          AND oi.is_free = false
          AND NOT EXISTS (
            SELECT 1 FROM reviews r
             WHERE r.user_id = o.buyer_id AND r.agent_id = oi.agent_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM review_requests rr
             WHERE rr.order_id = o.id AND rr.creator_id = a.creator_id
          )
        ORDER BY o.paid_at ASC
        LIMIT $2`,
      [cutoff, limit],
    );

    let created = 0;
    for (const row of rows) {
      // One INSERT per candidate, letting the unique index arbitrate. This is
      // slower than a bulk insert and deliberately so: a bulk insert that hit
      // one conflict would fail the whole batch, losing the good rows with it.
      const inserted = await this.dataSource.query<Array<{ id: string }>>(
        `INSERT INTO review_requests (buyer_id, order_id, agent_id, creator_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (order_id, creator_id) DO NOTHING
         RETURNING id`,
        [row.buyer_id, row.order_id, row.agent_id, row.creator_id],
      );
      if (!inserted[0]) continue;
      created += 1;

      await this.events.recordSafe({
        eventName: CREATOR_EVENTS.REVIEW_REQUEST_SENT,
        entityType: 'review_request',
        entityId: inserted[0].id,
        // One `review_request_sent` per request row — the event is the
        // exactly-once record, and §30 counts it for the request rate.
        dedupKey: `c4.review_request_sent:${inserted[0].id}`,
        metadata: { orderId: row.order_id, agentId: row.agent_id },
      });
      await this.notifications.notifyEventSafe(
        row.buyer_id,
        NOTIFICATION_TYPES.REVIEW_REQUEST,
        {},
        {
          link: '/me/reviews',
        },
      );
    }

    return { considered: rows.length, created };
  }

  /**
   * §29 `review_started` — the buyer opened the request.
   *
   * The buyer is identified by their own authenticated user id, so this
   * cannot be replayed for someone else's request. `openedAt` is set once:
   * a second view must not reset it, or the "time to first open" metric
   * would always be zero.
   */
  async markOpened(requestId: string, buyerUserId: string): Promise<boolean> {
    const opened = await this.dataSource.query<Array<{ id: string }>>(
      `UPDATE review_requests SET opened_at = COALESCE(opened_at, now()), updated_at = now()
        WHERE id = $1 AND buyer_id = $2 AND review_id IS NULL
        RETURNING id`,
      [requestId, buyerUserId],
    );
    if (!opened[0]) return false;

    await this.events.recordSafe({
      eventName: CREATOR_EVENTS.REVIEW_STARTED,
      userId: buyerUserId,
      entityType: 'review_request',
      entityId: requestId,
      dedupKey: `c4.review_started:${requestId}`,
    });
    return true;
  }

  /**
   * Links a submitted review back to the request that asked for it.
   *
   * Called from the review service's create path so §30's "review conversion"
   * (requests → reviews) is measurable without guessing. Ownership is
   * enforced in the WHERE clause: the request must belong to this buyer.
   */
  async attachReview(
    requestId: string,
    buyerUserId: string,
    reviewId: string,
  ): Promise<boolean> {
    const linked = await this.dataSource.query<Array<{ id: string }>>(
      `UPDATE review_requests
          SET review_id = $3, updated_at = now()
        WHERE id = $1 AND buyer_id = $2 AND review_id IS NULL
        RETURNING id`,
      [requestId, buyerUserId, reviewId],
    );
    return linked.length > 0;
  }

  /** The buyer's own pending requests (§5 — "a request at the right time"). */
  async forBuyer(buyerUserId: string) {
    const rows = await this.requests.find({
      where: { buyerId: buyerUserId, reviewId: IsNull() },
      order: { requestedAt: 'DESC' },
      take: 20,
    });
    return rows.map((row) => ({
      id: row.id,
      requestedAt: row.requestedAt.toISOString(),
      openedAt: row.openedAt?.toISOString() ?? null,
      agentId: row.agentId,
      orderId: row.orderId,
    }));
  }

  /**
   * §7 — the creator's Review Center data, and §8's insight source.
   *
   * Insights are computed from the reviews the creator can ALREADY see —
   * published only. Hiding a review (§6) must remove its influence, and a
   * cache would not know that.
   */
  async creatorCenter(creatorProfileId: string) {
    const rows = await this.dataSource.query<
      Array<{
        review_id: string;
        agent_id: string;
        rating: number;
        positive_topics: ReviewTopic[];
        negative_topics: ReviewTopic[];
        cons: string | null;
        pros: string | null;
        would_recommend: boolean | null;
        created_at: Date;
        agent_name: string;
        buyer_name: string;
        reply_id: string | null;
        reply_body: string | null;
      }>
    >(
      `SELECT r.id AS review_id, r.agent_id, r.rating, r.positive_topics,
              r.negative_topics, r.cons, r.pros, r.would_recommend, r.created_at,
              a.name AS agent_name,
              COALESCE(u.full_name, u.username, 'خریدار') AS buyer_name,
              rr.id AS reply_id, rr.body AS reply_body
         FROM reviews r
         JOIN agents a ON a.id = r.agent_id
         JOIN users u ON u.id = r.user_id
         LEFT JOIN review_replies rr ON rr.review_id = r.id
        WHERE a.creator_id = $1 AND r.status = 'published'
        ORDER BY r.created_at DESC
        LIMIT 200`,
      [creatorProfileId],
    );

    const items = rows.map((row) => ({
      id: row.review_id,
      agentId: row.agent_id,
      agentName: row.agent_name,
      rating: row.rating,
      pros: row.pros,
      cons: row.cons,
      positiveTopics: row.positive_topics ?? [],
      negativeTopics: row.negative_topics ?? [],
      wouldRecommend: row.would_recommend,
      createdAt: row.created_at,
      // §7 — the buyer's identity is shown only as a display name. Reviews are
      // public; exposing an email or phone next to a 1-star rating would be a
      // privacy failure the C4 spec does not ask for.
      buyerName: row.buyer_name,
      reply: row.reply_id ? { id: row.reply_id, body: row.reply_body } : null,
    }));

    const signals: ReviewSignal[] = rows.map((row) => ({
      reviewId: row.review_id,
      agentId: row.agent_id,
      rating: row.rating,
      positiveTopics: row.positive_topics ?? [],
      negativeTopics: row.negative_topics ?? [],
      cons: row.cons,
      pros: row.pros,
      wouldRecommend: row.would_recommend,
      createdAt: row.created_at,
    }));

    return {
      summary: this.summarize(items),
      reviews: items,
      insights: buildInsights(signals),
    };
  }

  /**
   * §7's summary block.
   *
   * The distribution is over the reviews a reader can see, and `average` is
   * `null` rather than 0 when there are none — "no reviews" and "reviews
   * averaging zero" are different facts and the UI must not conflate them.
   */
  private summarize(
    items: Array<{
      rating: number;
      reply: { id: string } | null;
      positiveTopics: unknown[];
      negativeTopics: unknown[];
    }>,
  ) {
    const total = items.length;
    const average =
      total === 0
        ? null
        : Math.round(
            (items.reduce((sum, r) => sum + r.rating, 0) / total) * 10,
          ) / 10;

    const distribution: Record<string, number> = {
      '5': 0,
      '4': 0,
      '3': 0,
      '2': 0,
      '1': 0,
    };
    for (const item of items) {
      const key = String(Math.min(Math.max(item.rating, 1), 5));
      distribution[key] = (distribution[key] ?? 0) + 1;
    }

    return {
      total,
      average,
      distribution,
      answered: items.filter((r) => r.reply !== null).length,
      unreplied: items.filter((r) => r.reply === null).length,
    };
  }

  /**
   * §9 — the creator acts on an insight: apply it, or dismiss it.
   *
   * The decision is stored as a C1 event with a dedup key, so "applied" and
   * "dismissed" are one fact each per insight rather than a column that could
   * be toggled forever. A second click on the same insight is a no-op.
   */
  async recordDecision(
    creatorProfileId: string,
    userId: string,
    insightKey: string,
    decision: 'applied' | 'dismissed',
  ): Promise<boolean> {
    const written = await this.events.recordSafe({
      eventName:
        decision === 'applied'
          ? CREATOR_EVENTS.OPTIMIZATION_APPLIED
          : CREATOR_EVENTS.OPTIMIZATION_DISMISSED,
      userId,
      creatorProfileId,
      entityType: 'review_insight',
      // No entityId: it is a uuid column and the insight key is text. The key
      // travels in metadata, which is what §30's analytics reads, and in the
      // dedup key, which is what makes the decision exactly-once.
      metadata: { insightKey, decision },
      dedupKey: `c4.optimization_${decision}:${creatorProfileId}:${insightKey}`,
    });
    return written;
  }

  /** §29 `optimization_viewed`. */
  async markInsightViewed(
    creatorProfileId: string,
    userId: string,
    insightKey: string,
  ): Promise<void> {
    await this.events.recordSafe({
      eventName: CREATOR_EVENTS.OPTIMIZATION_VIEWED,
      userId,
      creatorProfileId,
      entityType: 'review_insight',
      metadata: { insightKey },
      dedupKey: `c4.optimization_viewed:${creatorProfileId}:${insightKey}`,
    });
  }

  /** A review that changed a creator's metrics should still be idempotent. */
  async onReviewPublished(review: {
    id: string;
    agentId: string;
    userId: string;
  }): Promise<void> {
    try {
      const rows = await this.dataSource.query<Array<{ creator_id: string }>>(
        `SELECT creator_id FROM agents WHERE id = $1`,
        [review.agentId],
      );
      if (!rows[0]) return;
      const created = await this.events.recordSafe({
        eventName: CREATOR_EVENTS.REVIEW_SUBMITTED,
        userId: review.userId,
        creatorProfileId: rows[0].creator_id,
        entityType: 'review',
        entityId: review.id,
        dedupKey: `c4.review_submitted:${review.id}`,
      });
      if (!created) return;
      await this.notifications.notifyEventSafe(
        await this.creatorUserId(rows[0].creator_id),
        NOTIFICATION_TYPES.REVIEW_RECEIVED,
        {},
        { link: '/creator/reviews' },
      );
    } catch (error) {
      // A metrics side-effect must never fail the buyer's review submission.
      this.logger.error(
        `C4 review hook failed for review ${review.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async creatorUserId(creatorProfileId: string): Promise<string> {
    const rows = await this.dataSource.query<Array<{ user_id: string }>>(
      `SELECT user_id FROM creator_profiles WHERE id = $1`,
      [creatorProfileId],
    );
    return rows[0]?.user_id ?? '';
  }
}

export { ReviewStatus };
