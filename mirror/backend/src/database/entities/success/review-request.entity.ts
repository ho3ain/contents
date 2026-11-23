import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../identity/user.entity';
import { Order } from '../commerce/order.entity';
import { Agent } from '../agents/agent.entity';

/**
 * Phase C4 §5 — a request for a review, sent to a buyer who has actually used
 * the product.
 *
 * This is a new table rather than a column on `reviews`, and the reason is
 * exactly-once. A review request is an *outbound* lifecycle object with its
 * own state and its own history: when we asked, when they opened it, whether
 * it was dismissed. `reviews` records the answer; nothing there can say the
 * question was ever asked, so a buyer could be asked the same question on
 * every page load forever.
 *
 * UNIQUE (order_id, requested_by_creator) is the anti-duplicate mechanism
 * (§32 "duplicate review prevention"). Two concurrent sweeps both deciding
 * to ask will both insert, and exactly one will be rejected by the index —
 * the only approach that actually holds under concurrency, because an
 * application-level "have I already?" check loses the race by definition.
 */
@Entity({ name: 'review_requests' })
@Index('uq_review_requests_order_creator', ['orderId', 'creatorId'], {
  unique: true,
})
@Index('idx_review_requests_buyer', ['buyerId'])
@Index('idx_review_requests_creator', ['creatorId'])
export class ReviewRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'buyer_id', type: 'uuid' })
  buyerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'buyer_id' })
  buyer: User;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  /** The creator who earned the sale and may therefore ask for the review. */
  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;

  @Column({ name: 'requested_at', type: 'timestamptz', default: () => 'now()' })
  requestedAt: Date;

  /**
   * When the buyer actually opened the request (§29 `review_started`).
   * Set server-side on first view; the UNIQUE index above means a replayed
   * request cannot reset it.
   */
  @Column({ name: 'opened_at', type: 'timestamptz', nullable: true })
  openedAt: Date | null;

  /** The review this request produced, once the buyer answered. */
  @Column({ name: 'review_id', type: 'uuid', nullable: true })
  reviewId: string | null;

  /**
   * §5.1 — a request stops being useful once the buyer has reviewed or
   * once the window has passed. `dismissed` is terminal and stops the
   * reminder engine from asking again.
   */
  @Column({ name: 'dismissed_at', type: 'timestamptz', nullable: true })
  dismissedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
