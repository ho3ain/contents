import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Agent } from '../agents/agent.entity';
import { CreatorProfile } from '../identity/creator-profile.entity';

/** A4 §21 — Organic visibility is not a Promotion row (it is the default). */
export enum PromotionType {
  BOOST = 'boost',
  FEATURED = 'featured',
  MESH_SOCIAL = 'mesh_social',
}

/**
 * A4 §14/§47 — request-only lifecycle (no payment in this phase):
 * pending → under_review → approved → scheduled → active → completed,
 * or rejected / cancelled (creator withdrew before a decision).
 */
export enum PromotionStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

/** Where an approved promotion is shown. Fixed per type. */
export enum PromotionPlacement {
  /** Featured → the labelled «Sponsored» row on the marketplace page. */
  MARKETPLACE_FEATURED = 'marketplace_featured',
  /** Boost → the labelled «Sponsored» row on its category's listing. */
  CATEGORY_BOOST = 'category_boost',
  /** MESH Social → MESH's own channels (manual, off-site). */
  MESH_SOCIAL = 'mesh_social',
}

export const PLACEMENT_FOR_TYPE: Record<PromotionType, PromotionPlacement> = {
  [PromotionType.BOOST]: PromotionPlacement.CATEGORY_BOOST,
  [PromotionType.FEATURED]: PromotionPlacement.MARKETPLACE_FEATURED,
  [PromotionType.MESH_SOCIAL]: PromotionPlacement.MESH_SOCIAL,
};

/** States that keep a request "open" (unique per product + type). */
export const OPEN_PROMOTION_STATUSES: PromotionStatus[] = [
  PromotionStatus.PENDING,
  PromotionStatus.UNDER_REVIEW,
  PromotionStatus.APPROVED,
  PromotionStatus.SCHEDULED,
  PromotionStatus.ACTIVE,
];

@Entity({ name: 'promotions' })
export class Promotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;

  @ManyToOne(() => CreatorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creator_id' })
  creator: CreatorProfile;

  @Column({ name: 'requested_by', type: 'uuid' })
  requestedBy: string;

  @Column({ type: 'enum', enum: PromotionType, enumName: 'promotion_type' })
  type: PromotionType;

  @Column({
    type: 'enum',
    enum: PromotionStatus,
    enumName: 'promotion_status',
    default: PromotionStatus.PENDING,
  })
  status: PromotionStatus;

  @Column({
    type: 'enum',
    enum: PromotionPlacement,
    enumName: 'promotion_placement',
  })
  placement: PromotionPlacement;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  message: string | null;

  @Column({ name: 'preferred_start_at', type: 'timestamptz', nullable: true })
  preferredStartAt: Date | null;

  @Column({ name: 'start_at', type: 'timestamptz', nullable: true })
  startAt: Date | null;

  @Column({ name: 'end_at', type: 'timestamptz', nullable: true })
  endAt: Date | null;

  /** Foundation for a future paid tier — never collected or charged now. */
  @Column({
    name: 'budget_amount',
    type: 'numeric',
    precision: 14,
    scale: 0,
    nullable: true,
  })
  budgetAmount: string | null;

  @Column({
    name: 'budget_currency',
    type: 'varchar',
    length: 8,
    nullable: true,
  })
  budgetCurrency: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'admin_note', type: 'varchar', length: 1000, nullable: true })
  adminNote: string | null;

  @Column({
    name: 'rejection_reason',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  rejectionReason: string | null;

  /** MESH Social — the real post URL once MESH published it (manual). */
  @Column({
    name: 'published_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  publishedUrl: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
