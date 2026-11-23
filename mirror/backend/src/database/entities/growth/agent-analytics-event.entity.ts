import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Agent } from '../agents/agent.entity';

/**
 * Phase A4 §16/§42 — conceptual product events, stored with the project's
 * snake_case naming. Only REAL events are ever written (a beacon from a
 * rendered product page, a creator share action, a created order, a
 * captured payment…).
 */
export const ANALYTICS_EVENTS = {
  PRODUCT_VIEWED: 'product_viewed',
  PRODUCT_SHARED: 'product_shared',
  PRODUCT_PUBLISHED: 'product_published',
  PRODUCT_UNPUBLISHED: 'product_unpublished',
  PRODUCT_REPUBLISHED: 'product_republished',
  PROMOTION_REQUESTED: 'promotion_requested',
  PROMOTION_STARTED: 'promotion_started',
  CHECKOUT_STARTED: 'checkout_started',
  PURCHASE_COMPLETED: 'purchase_completed',
  /** A5 §25 — standard name (renamed from A4's `review_created`). */
  REVIEW_SUBMITTED: 'review_submitted',
  /** A5 §23/§25 — a listing card was shown in a marketplace list. */
  PRODUCT_IMPRESSION: 'product_impression',
  /** A5 §25 — a new version of a live product went public. */
  PRODUCT_UPDATED: 'product_updated',
  /** A5 §9 — a promoted placement card was shown / clicked. */
  PROMOTION_IMPRESSION: 'promotion_impression',
  PROMOTION_CLICKED: 'promotion_clicked',
  /** Gap closure — a visitor opened the product demo (live preview). */
  PRODUCT_PREVIEW: 'product_preview',
  /** Gap closure — the usage guide (documentation) was actually seen. */
  DOCUMENTATION_VIEWED: 'documentation_viewed',
  /** Gap closure — a signed-in buyer saved the product (first time only). */
  PRODUCT_INTERESTED: 'product_interested',
  /** Gap closure — an entitled buyer opened the product from the library. */
  PRODUCT_ACCESSED: 'product_accessed',
} as const;
export type AnalyticsEventType =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * One row per real, de-duplicated product event. `dedup_key` is UNIQUE:
 * the same logical event (a visitor's view of a product on a given day, a
 * given order's purchase…) can be replayed any number of times and is
 * counted once (A4 §34 / §45).
 */
@Entity({ name: 'agent_analytics_events' })
@Index('IDX_agent_analytics_events_agent_type_time', [
  'agentId',
  'eventType',
  'occurredAt',
])
export class AgentAnalyticsEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  @Column({ name: 'event_type', type: 'varchar', length: 40 })
  eventType: AnalyticsEventType;

  /** Salted one-way hash of the visitor identity — never raw PII. */
  @Column({ name: 'visitor_key', type: 'varchar', length: 64, nullable: true })
  visitorKey: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  /** Traffic source / share channel (e.g. telegram, linkedin, direct). */
  @Column({ name: 'source', type: 'varchar', length: 32, nullable: true })
  source: string | null;

  /** A5 §9 — the promotion this event is attributed to (if any). */
  @Column({ name: 'promotion_id', type: 'uuid', nullable: true })
  promotionId: string | null;

  @Column({ name: 'dedup_key', type: 'varchar', length: 200, unique: true })
  dedupKey: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @Column({
    name: 'occurred_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  occurredAt: Date;
}
