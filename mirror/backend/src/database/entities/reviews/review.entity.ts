import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../identity/user.entity';
import { Agent } from '../agents/agent.entity';
import { Order } from '../commerce/order.entity';
import { ReviewReply } from './review-reply.entity';

/**
 * A5 §13 — the closed list of review topics. `missing_feature` is only a
 * weakness (a missing feature is never a strength).
 */
export const REVIEW_TOPICS = [
  'ux',
  'quality',
  'price',
  'docs',
  'integration',
  'reliability',
  'missing_feature',
] as const;
export type ReviewTopic = (typeof REVIEW_TOPICS)[number];
export const POSITIVE_REVIEW_TOPICS = REVIEW_TOPICS.filter(
  (topic) => topic !== 'missing_feature',
);

export enum ReviewStatus {
  SUBMITTED = 'submitted',
  PUBLISHED = 'published',
  /** Hidden by its author — reversible, excluded from every public reader. */
  HIDDEN = 'hidden',
  /** Removed by moderation — terminal for the author. */
  REMOVED = 'removed',
}

/**
 * Buyer reviews. Only users holding a valid entitlement may review an
 * agent, and each user reviews a given agent once — later edits update the
 * same row (PLAYBOOK 9.7). `order_id` is present for paid purchases and
 * null for free-agent reviews.
 */
@Entity({ name: 'reviews' })
@Index('uq_reviews_user_agent', ['userId', 'agentId'], { unique: true })
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_reviews_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index('idx_reviews_agent_id')
  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @ManyToOne(() => Order, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'order_id' })
  order: Order | null;

  @Column({ name: 'rating', type: 'smallint' })
  rating: number;

  @Column({ name: 'text', type: 'text', default: '' })
  text: string;

  /** A5 §10 — optional structured feedback (what worked / what didn't). */
  @Column({ name: 'pros', type: 'text', nullable: true })
  pros: string | null;

  @Column({ name: 'cons', type: 'text', nullable: true })
  cons: string | null;

  /** What the buyer used the product for (optional, short). */
  /** Sprint 2 — optional one-line headline of the review. */
  @Column({ name: 'title', type: 'varchar', length: 120, nullable: true })
  title: string | null;

  @Column({ name: 'use_case', type: 'varchar', length: 200, nullable: true })
  useCase: string | null;

  /**
   * A5 §13 — topics the buyer tagged as strengths / weaknesses (closed list
   * REVIEW_TOPICS). Insights aggregate these tags; free text is never
   * "interpreted" by an AI that does not exist.
   */
  @Column({
    name: 'positive_topics',
    type: 'text',
    array: true,
    default: () => "'{}'",
  })
  positiveTopics: string[];

  @Column({
    name: 'negative_topics',
    type: 'text',
    array: true,
    default: () => "'{}'",
  })
  negativeTopics: string[];

  /**
   * Whether the reviewer held a valid (granted) entitlement when the review
   * was written. Derived server-side from the entitlement check — never
   * trusted from the client (PLAYBOOK 9.7).
   */
  /** Gap closure — "Did this product solve your problem?" (optional). */
  @Column({
    name: 'solved_problem',
    type: 'varchar',
    length: 8,
    nullable: true,
  })
  solvedProblem: 'yes' | 'partly' | 'no' | null;

  /** Gap closure — "Would you recommend it to others?" (optional). */
  @Column({ name: 'would_recommend', type: 'boolean', nullable: true })
  wouldRecommend: boolean | null;

  @Column({ name: 'verified', type: 'boolean', default: false })
  verified: boolean;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ReviewStatus,
    enumName: 'review_status',
    default: ReviewStatus.SUBMITTED,
  })
  status: ReviewStatus;

  /** When the author hid the review (NULL while visible). */
  @Column({ name: 'hidden_at', type: 'timestamptz', nullable: true })
  hiddenAt: Date | null;

  @OneToOne(() => ReviewReply, (reply) => reply.review, { nullable: true })
  reply: ReviewReply | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
