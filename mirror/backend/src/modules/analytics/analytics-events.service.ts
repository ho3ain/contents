import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  ANALYTICS_EVENTS,
  AnalyticsEventType,
} from '../../database/entities/growth/agent-analytics-event.entity';
import { buyerDedupKey, insertBuyerEvent } from '../discovery/interest-scoring';

/** Traffic sources / share channels we accept (anything else → other). */
export const ANALYTICS_SOURCES = [
  'direct',
  'copy_link',
  'native',
  'telegram',
  'whatsapp',
  'linkedin',
  'x',
  'email',
  'qr',
  'marketplace',
  'promoted',
  /** Gap closure — marketplace list filtered by a search query. */
  'search',
  /** Gap closure — marketplace list filtered by a category. */
  'category',
  'other',
] as const;
export type AnalyticsSource = (typeof ANALYTICS_SOURCES)[number];

/** Channels a creator can share through (subset of the sources). */
export const SHARE_CHANNELS = [
  'copy_link',
  'copy_text',
  'native',
  'telegram',
  'whatsapp',
  'linkedin',
  'x',
  'email',
  'qr_download',
  'card_download',
] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

/**
 * Crawlers / link-preview fetchers never count as views. Headless browsers
 * are NOT excluded by UA (real E2E journeys use them) — the daily dedup
 * already bounds any automated inflation to one view per visitor per day.
 */
const BOT_UA =
  /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|embedly|quora link preview|whatsapp\/|telegrambot|linkedinbot|twitterbot|discordbot|preview|curl\/|wget\/|python-requests|go-http-client|okhttp|java\//i;

export interface RecordEventInput {
  agentId: string;
  type: AnalyticsEventType;
  /** Logical identity of the event — the SAME event always has the SAME key. */
  dedupKey: string;
  userId?: string | null;
  visitorKey?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
  /** A5 §9 — promotion the event is attributed to. */
  promotionId?: string | null;
}

export interface ViewerContext {
  userId?: string | null;
  role?: string | null;
  /** Anonymous, client-generated random id (UUID) — optional. */
  visitorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  source?: string | null;
  /** A5 §9 — claimed sponsored-placement origin (validated before use). */
  promotionId?: string | null;
}

export type ViewResult =
  | { counted: true }
  | { counted: false; reason: 'bot' | 'owner' | 'staff' | 'duplicate' };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Phase A4 §16 — the ONE writer of product analytics events.
 *
 * Every event is inserted with `ON CONFLICT (dedup_key) DO NOTHING`, so a
 * replayed webhook, a double click, a refresh or a network retry can never
 * double count (§34/§45). Callers on business-critical paths use
 * recordSafe(): analytics must never break a purchase or a publish.
 */
@Injectable()
export class AnalyticsEventsService {
  private readonly logger = new Logger(AnalyticsEventsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  /** Inserts the event once. Returns true only when a NEW row was written. */
  async record(
    input: RecordEventInput,
    manager?: EntityManager,
  ): Promise<boolean> {
    const runner = manager ?? this.dataSource.manager;
    const rows = await runner.query<Array<{ id: string }>>(
      `INSERT INTO agent_analytics_events
         (agent_id, event_type, visitor_key, user_id, source, dedup_key,
          metadata, occurred_at, promotion_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, COALESCE($8, now()), $9)
       ON CONFLICT (dedup_key) DO NOTHING
       RETURNING id`,
      [
        input.agentId,
        input.type,
        input.visitorKey ?? null,
        input.userId ?? null,
        input.source ?? null,
        input.dedupKey.slice(0, 200),
        JSON.stringify(input.metadata ?? {}),
        input.occurredAt ?? null,
        input.promotionId ?? null,
      ],
    );
    const inserted = rows.length > 0;
    if (
      inserted &&
      input.userId &&
      (input.type === ANALYTICS_EVENTS.CHECKOUT_STARTED ||
        input.type === ANALYTICS_EVENTS.PURCHASE_COMPLETED)
    ) {
      await this.mirrorToBuyerEvents(input, runner, manager !== undefined);
    }
    return inserted;
  }

  /**
   * M12 — the money-path events also join the buyer behaviour log (one row
   * per order, same logical key) so the recommendation foundation sees the
   * whole journey. Isolated by a savepoint inside a transaction: a problem
   * here can never abort or roll back a purchase.
   */
  private async mirrorToBuyerEvents(
    input: RecordEventInput,
    runner: Pick<DataSource, 'query'>,
    inTransaction: boolean,
  ): Promise<void> {
    try {
      if (inTransaction) await runner.query('SAVEPOINT buyer_event_mirror');
      await insertBuyerEvent(runner, {
        type:
          input.type === ANALYTICS_EVENTS.CHECKOUT_STARTED
            ? 'checkout_started'
            : 'purchase_completed',
        userId: input.userId,
        visitorKey: input.visitorKey ?? null,
        agentId: input.agentId,
        source: input.source ?? null,
        dedupKey: buyerDedupKey('mirror', input.dedupKey),
        occurredAt: input.occurredAt,
      });
      if (inTransaction) {
        await runner.query('RELEASE SAVEPOINT buyer_event_mirror');
      }
    } catch (error) {
      if (inTransaction) {
        await runner
          .query('ROLLBACK TO SAVEPOINT buyer_event_mirror')
          .catch(() => undefined);
      }
      this.logger.warn(
        `Buyer event mirror failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** record() that logs instead of throwing (non-critical call sites). */
  async recordSafe(
    input: RecordEventInput,
    manager?: EntityManager,
  ): Promise<boolean> {
    try {
      return await this.record(input, manager);
    } catch (error) {
      this.logger.error(
        `Failed to record ${input.type} for agent ${input.agentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  /**
   * A real product-page view (beacon from the rendered public page).
   * De-duplicated per visitor per product per (Tehran) calendar day; the
   * owner's and staff views are excluded; crawlers are ignored. The legacy
   * agents.views counter moves ONLY when a new unique daily view is stored,
   * so it stays consistent with the event table.
   */
  async recordView(
    agent: { id: string; creatorUserId: string | null; isFree?: boolean },
    viewer: ViewerContext,
  ): Promise<ViewResult> {
    if (viewer.userAgent && BOT_UA.test(viewer.userAgent)) {
      return { counted: false, reason: 'bot' };
    }
    if (viewer.userId && viewer.userId === agent.creatorUserId) {
      return { counted: false, reason: 'owner' };
    }
    if (viewer.role === 'admin') {
      return { counted: false, reason: 'staff' };
    }
    const visitorKey = this.visitorKey(viewer);
    const day = this.tehranDay(new Date());
    const promotionId = await this.activePromotionFor(
      agent.id,
      viewer.promotionId,
    );
    const inserted = await this.dataSource.transaction(async (manager) => {
      const fresh = await this.record(
        {
          agentId: agent.id,
          type: ANALYTICS_EVENTS.PRODUCT_VIEWED,
          dedupKey: `view:${agent.id}:${visitorKey}:${day}`,
          userId: viewer.userId ?? null,
          visitorKey,
          source: promotionId
            ? 'promoted'
            : this.normalizeSource(viewer.source),
          metadata: { day, isFree: agent.isFree ?? null },
          promotionId,
        },
        manager,
      );
      if (fresh) {
        await manager.query(
          `UPDATE agents SET views = views + 1 WHERE id = $1`,
          [agent.id],
        );
      }
      return fresh;
    });
    return inserted
      ? { counted: true }
      : { counted: false, reason: 'duplicate' };
  }

  /**
   * Gap closure — a visitor engaged with a PUBLISHED product page: opened
   * the demo (`preview`) or actually saw the usage guide (`documentation`).
   * Same exclusions as views (bots, the owner, staff) and one event per
   * visitor + product + kind per (Tehran) day, so repeated clicks or
   * scrolling are not "more engagement".
   */
  async recordEngagement(
    agent: { id: string; creatorUserId: string | null },
    kind: 'preview' | 'documentation',
    viewer: ViewerContext,
  ): Promise<ViewResult> {
    if (viewer.userAgent && BOT_UA.test(viewer.userAgent)) {
      return { counted: false, reason: 'bot' };
    }
    if (viewer.userId && viewer.userId === agent.creatorUserId) {
      return { counted: false, reason: 'owner' };
    }
    if (viewer.role === 'admin') {
      return { counted: false, reason: 'staff' };
    }
    const visitorKey = this.visitorKey(viewer);
    const day = this.tehranDay(new Date());
    const fresh = await this.record({
      agentId: agent.id,
      type:
        kind === 'preview'
          ? ANALYTICS_EVENTS.PRODUCT_PREVIEW
          : ANALYTICS_EVENTS.DOCUMENTATION_VIEWED,
      dedupKey: `${kind === 'preview' ? 'prev' : 'docs'}:${agent.id}:${visitorKey}:${day}`,
      userId: viewer.userId ?? null,
      visitorKey,
      source: this.normalizeSource(viewer.source),
      metadata: { day },
    });
    return fresh ? { counted: true } : { counted: false, reason: 'duplicate' };
  }

  /**
   * Gap closure — a buyer saved a product for the first time. Counted once
   * per user + product EVER (removing and saving again is not new
   * interest). The current saved count lives in `agent_favorites`.
   */
  async recordInterest(agentId: string, userId: string): Promise<boolean> {
    return this.recordSafe({
      agentId,
      type: ANALYTICS_EVENTS.PRODUCT_INTERESTED,
      dedupKey: `fav:${agentId}:${userId}`,
      userId,
    });
  }

  /**
   * Gap closure — an entitled buyer opened the product (activation). One
   * event per user + product per day ("active days"); entitlement is
   * checked by the caller before recording.
   */
  async recordAccess(agentId: string, userId: string): Promise<boolean> {
    const day = this.tehranDay(new Date());
    return this.record({
      agentId,
      type: ANALYTICS_EVENTS.PRODUCT_ACCESSED,
      dedupKey: `access:${agentId}:${userId}:${day}`,
      userId,
      metadata: { day },
    });
  }

  /**
   * A creator share action (copy link, quick share, QR/card download…).
   * One event per product + actor + channel per hour: repeated clicks are
   * not "more sharing".
   */
  async recordShare(
    agentId: string,
    userId: string,
    channel: ShareChannel,
  ): Promise<boolean> {
    const hour = new Date().toISOString().slice(0, 13);
    return this.record({
      agentId,
      type: ANALYTICS_EVENTS.PRODUCT_SHARED,
      dedupKey: `share:${agentId}:${userId}:${channel}:${hour}`,
      userId,
      source: channel,
      metadata: { channel },
    });
  }

  /**
   * A5 §9 — returns the promotion id only when it is an ACTIVE promotion of
   * this product; anything else (forged, expired, another product's) is
   * dropped so attribution can never be forged from the client.
   */
  async activePromotionFor(
    agentId: string,
    promotionId?: string | null,
  ): Promise<string | null> {
    if (!promotionId || !UUID_RE.test(promotionId)) return null;
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM promotions
        WHERE id = $1 AND agent_id = $2 AND status = 'active'`,
      [promotionId, agentId],
    );
    return rows[0]?.id ?? null;
  }

  /**
   * A5 §23/§25 — listing cards actually shown in a marketplace list
   * (IntersectionObserver beacon). Only PUBLISHED products count; one
   * impression per visitor per product per day (bulk ON CONFLICT DO
   * NOTHING), crawlers ignored, the owner's own cards excluded. Returns
   * the number of NEW impressions stored.
   */
  async recordImpressions(
    slugs: string[],
    viewer: ViewerContext,
  ): Promise<number> {
    if (viewer.userAgent && BOT_UA.test(viewer.userAgent)) return 0;
    if (viewer.role === 'admin') return 0;
    const unique = [...new Set(slugs)].slice(0, 48);
    if (!unique.length) return 0;
    const visitorKey = this.visitorKey(viewer);
    const day = this.tehranDay(new Date());
    const source = this.normalizeSource(viewer.source ?? 'marketplace');
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO agent_analytics_events
         (agent_id, event_type, visitor_key, user_id, source, dedup_key,
          metadata)
       SELECT a.id, $2::text, $3::text, $4::uuid, $5::text,
              'imp:' || a.id || ':' || $3::text || ':' || $6::text,
              jsonb_build_object('day', $6::text, 'isFree', a.is_free)
         FROM agents a
         LEFT JOIN creator_profiles cp ON cp.id = a.creator_id
        WHERE a.slug = ANY($1::text[])
          AND a.status = 'published'
          AND ($4::uuid IS NULL OR cp.user_id IS DISTINCT FROM $4::uuid)
       ON CONFLICT (dedup_key) DO NOTHING
       RETURNING id`,
      [
        unique,
        ANALYTICS_EVENTS.PRODUCT_IMPRESSION,
        visitorKey,
        viewer.userId ?? null,
        source,
        day,
      ],
    );
    return rows.length;
  }

  /**
   * A5 §9 — a sponsored placement card was shown / clicked. Only for an
   * ACTIVE promotion of a published product (checked in SQL, so a forged
   * id records nothing); one per visitor + promotion + kind per day.
   */
  async recordPromotionEvent(
    promotionId: string,
    kind: 'impression' | 'click',
    viewer: ViewerContext,
  ): Promise<boolean> {
    if (viewer.userAgent && BOT_UA.test(viewer.userAgent)) return false;
    if (viewer.role === 'admin') return false;
    const visitorKey = this.visitorKey(viewer);
    const day = this.tehranDay(new Date());
    const type =
      kind === 'click'
        ? ANALYTICS_EVENTS.PROMOTION_CLICKED
        : ANALYTICS_EVENTS.PROMOTION_IMPRESSION;
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO agent_analytics_events
         (agent_id, event_type, visitor_key, user_id, source, dedup_key,
          metadata, promotion_id)
       SELECT p.agent_id, $2::text, $3::text, $4::uuid, 'promoted',
              $5::text || ':' || p.id || ':' || $3::text || ':' || $6::text,
              jsonb_build_object('day', $6::text, 'placement', p.placement),
              p.id
         FROM promotions p
         JOIN agents a ON a.id = p.agent_id
         LEFT JOIN creator_profiles cp ON cp.id = a.creator_id
        WHERE p.id = $1
          AND p.status = 'active'
          AND a.status = 'published'
          AND ($4::uuid IS NULL OR cp.user_id IS DISTINCT FROM $4::uuid)
       ON CONFLICT (dedup_key) DO NOTHING
       RETURNING id`,
      [
        promotionId,
        type,
        visitorKey,
        viewer.userId ?? null,
        kind === 'click' ? 'pclick' : 'pimp',
        day,
      ],
    );
    return rows.length > 0;
  }

  /** Salted one-way visitor identity — raw ids/IPs are never stored. */
  visitorKey(viewer: ViewerContext): string {
    const salt = this.config.get<string>('analyticsSalt') ?? 'analytics';
    const identity = viewer.userId
      ? `u:${viewer.userId}`
      : viewer.visitorId && UUID_RE.test(viewer.visitorId)
        ? `v:${viewer.visitorId.toLowerCase()}`
        : `n:${viewer.ip ?? ''}|${viewer.userAgent ?? ''}`;
    return createHash('sha256').update(`${salt}|${identity}`).digest('hex');
  }

  normalizeSource(source?: string | null): AnalyticsSource {
    if (!source) return 'direct';
    const value = source.trim().toLowerCase();
    return (ANALYTICS_SOURCES as readonly string[]).includes(value)
      ? (value as AnalyticsSource)
      : 'other';
  }

  /** YYYY-MM-DD in Asia/Tehran (the product's home timezone). */
  tehranDay(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}
