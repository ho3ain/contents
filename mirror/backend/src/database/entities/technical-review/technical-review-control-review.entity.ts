import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { HumanControlOutcome } from '../../../modules/technical-review/domain/technical-review.types';

/** Immutable human conclusion about an immutable automated control result. */
@Entity({ name: 'technical_review_control_reviews' })
@Index('idx_technical_review_control_reviews_case_created', [
  'caseId',
  'createdAt',
])
@Index('idx_technical_review_control_reviews_control', [
  'controlResultId',
  'createdAt',
])
export class TechnicalReviewControlReview {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'technical_review_case_id', type: 'uuid' }) caseId: string;
  @Column({ name: 'evaluation_control_result_id', type: 'uuid' })
  controlResultId: string;
  @Column({ type: 'varchar', length: 40 }) outcome: HumanControlOutcome;
  @Column({ name: 'rationale', type: 'varchar', length: 2000 })
  rationale: string;
  @Column({ name: 'scope_note', type: 'varchar', length: 1000, nullable: true })
  scopeNote: string | null;
  @Column({ name: 'reviewed_by', type: 'uuid' }) reviewedBy: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
