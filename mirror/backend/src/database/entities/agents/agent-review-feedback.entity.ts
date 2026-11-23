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
import { AgentReviewSubmission } from './agent-review-submission.entity';

/**
 * Phase A3 §13–§17, §22 — one structured review finding.
 *
 * Raised by a reviewer on a specific revision (`submission_id`) and carried
 * across later revisions of the same agent until the REVIEWER accepts it —
 * a creator can only mark it `resolved_by_creator`. Rows are never deleted
 * once the creator could see them (history, §21).
 */
@Entity({ name: 'agent_review_feedback' })
@Index('idx_review_feedback_agent_status', ['agentId', 'status'])
@Index('idx_review_feedback_submission', ['submissionId'])
export class AgentReviewFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  /** The revision on which the reviewer raised it. */
  @Column({ name: 'submission_id', type: 'uuid' })
  submissionId: string;

  @ManyToOne(() => AgentReviewSubmission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submission_id' })
  submission: AgentReviewSubmission;

  @Column({ name: 'category', type: 'varchar', length: 32 })
  category: string;

  @Column({ name: 'severity', type: 'varchar', length: 16 })
  severity: string;

  @Column({ name: 'title', type: 'varchar', length: 160 })
  title: string;

  /** «مشکل چیست؟» */
  @Column({ name: 'description', type: 'text' })
  description: string;

  /** «چرا مهم است؟» */
  @Column({ name: 'why_important', type: 'text', nullable: true })
  whyImportant: string | null;

  /** «چه چیزی باید اصلاح شود؟» */
  @Column({ name: 'required_action', type: 'text' })
  requiredAction: string;

  /** «کجا باید اصلاح شود؟» — wizard step key. */
  @Column({ name: 'affected_section', type: 'varchar', length: 24 })
  affectedSection: string;

  @Column({ name: 'status', type: 'varchar', length: 24, default: 'open' })
  status: string;

  /** Optional explanation the creator attaches when resolving. */
  @Column({ name: 'creator_note', type: 'text', nullable: true })
  creatorNote: string | null;

  /** users.id of the reviewer who raised it. */
  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  /** When the creator marked it resolved. */
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  /** When the reviewer last accepted / re-opened it. */
  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
