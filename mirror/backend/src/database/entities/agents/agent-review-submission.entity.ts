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
import { Agent } from './agent.entity';
import { AgentVersion, AgentVersionContent } from './agent-version.entity';

/** Kind of review cycle: first publication vs next version of a live listing. */
export enum ReviewSubmissionKind {
  INITIAL = 'initial',
  VERSION = 'version',
}

export interface ReviewChangeEntry {
  field: string;
  section: string;
  kind: 'added' | 'removed' | 'changed';
}

/**
 * Phase A3 §6–§9, §18 — one submitted REVISION of a listing.
 *
 * Every submit (first submit or resubmission) creates exactly one row; the
 * submitted content is frozen in `snapshot` and never overwritten
 * (immutable history). The review state machine (review-states.ts) runs on
 * `status`; `is_current` marks the revision the review queue works on
 * (exactly one per agent — partial unique index).
 */
@Entity({ name: 'agent_review_submissions' })
@Index('uq_review_submissions_agent_revision', ['agentId', 'revisionNumber'], {
  unique: true,
})
@Index('idx_review_submissions_queue', ['isCurrent', 'status', 'submittedAt'])
@Index('idx_review_submissions_creator', ['creatorId'])
export class AgentReviewSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  /** creator_profiles.id of the listing owner (denormalized for queries). */
  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;

  @Column({ name: 'version_id', type: 'uuid', nullable: true })
  versionId: string | null;

  @ManyToOne(() => AgentVersion, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'version_id' })
  version: AgentVersion | null;

  @Column({
    name: 'kind',
    type: 'varchar',
    length: 16,
    default: ReviewSubmissionKind.INITIAL,
  })
  kind: ReviewSubmissionKind;

  /** 1, 2, 3 … per agent across all cycles (§18 "Revision N"). */
  @Column({ name: 'revision_number', type: 'integer' })
  revisionNumber: number;

  /** Human version label shown with the revision (§18 "Version 1.1"). */
  @Column({ name: 'version_label', type: 'varchar', length: 16 })
  versionLabel: string;

  /** ReviewState value (review-states.ts). */
  @Column({ name: 'status', type: 'varchar', length: 24 })
  status: string;

  @Column({ name: 'is_current', type: 'boolean', default: true })
  isCurrent: boolean;

  @Column({ name: 'is_resubmission', type: 'boolean', default: false })
  isResubmission: boolean;

  /** Frozen submitted content (null only for pre-A3 backfilled rows). */
  @Column({ name: 'snapshot', type: 'jsonb', nullable: true })
  snapshot: AgentVersionContent | null;

  /** §20 structured diff against the previous revision. */
  @Column({ name: 'change_summary', type: 'jsonb', default: () => "'[]'" })
  changeSummary: ReviewChangeEntry[];

  /** Optional creator note sent with a resubmission. */
  @Column({ name: 'creator_note', type: 'text', nullable: true })
  creatorNote: string | null;

  /** §26 checklist state (keys from REVIEW_CHECKLIST). */
  @Column({ name: 'checklist', type: 'jsonb', default: () => "'{}'" })
  checklist: Record<string, boolean>;

  @Column({ name: 'submitted_by', type: 'uuid', nullable: true })
  submittedBy: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt: Date;

  @Column({ name: 'review_started_at', type: 'timestamptz', nullable: true })
  reviewStartedAt: Date | null;

  /** users.id of the admin who owns the review (never shown to creators). */
  @Column({ name: 'reviewer_id', type: 'uuid', nullable: true })
  reviewerId: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  /** Summary note of the decision (request changes / approve). */
  @Column({ name: 'decision_note', type: 'text', nullable: true })
  decisionNote: string | null;

  @Column({
    name: 'rejection_category',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  rejectionCategory: string | null;

  @Column({
    name: 'rejection_reason',
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  rejectionReason: string | null;

  @Column({ name: 'rejection_explanation', type: 'text', nullable: true })
  rejectionExplanation: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
