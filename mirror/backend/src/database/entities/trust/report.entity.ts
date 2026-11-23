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
import { Agent } from '../agents/agent.entity';
import { Review } from '../reviews/review.entity';

export enum ReportReason {
  MISLEADING_CLAIMS = 'misleading_claims',
  SECURITY_CONCERN = 'security_concern',
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  COPYRIGHT_VIOLATION = 'copyright_violation',
  SPAM_OR_FAKE = 'spam_or_fake',
  OTHER = 'other',
}

export enum ReportStatus {
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  RESOLVED = 'resolved',
  REJECTED = 'rejected',
}

/**
 * Buyer reports of an agent listing. Reports are identified (never
 * anonymous) so admins can follow up and prevent abuse of the button
 * (PLAYBOOK 7.15).
 */
@Entity({ name: 'reports' })
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_reports_reporter_id')
  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;

  @Index('idx_reports_agent_id')
  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId: string | null;

  @ManyToOne(() => Agent, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent | null;

  /**
   * A5 §37 — a report about one REVIEW (rather than the listing). The
   * listing (agent_id) is still recorded so admins see the context.
   */
  @Index('idx_reports_review_id')
  @Column({ name: 'review_id', type: 'uuid', nullable: true })
  reviewId: string | null;

  @ManyToOne(() => Review, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'review_id' })
  review: Review | null;

  @Column({
    name: 'reason',
    type: 'enum',
    enum: ReportReason,
    enumName: 'report_reason',
  })
  reason: ReportReason;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'evidence', type: 'jsonb', default: () => "'[]'" })
  evidence: string[];

  @Column({
    name: 'status',
    type: 'enum',
    enum: ReportStatus,
    enumName: 'report_status',
    default: ReportStatus.SUBMITTED,
  })
  status: ReportStatus;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer: User | null;

  @Column({ name: 'resolution', type: 'text', nullable: true })
  resolution: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
