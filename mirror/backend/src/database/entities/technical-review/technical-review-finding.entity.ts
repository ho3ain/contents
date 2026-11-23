import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { TechnicalFindingSeverity } from '../../../modules/technical-review/domain/technical-review.types';

/** Immutable actionable finding. A later case/decision records resolution; old text is never rewritten. */
@Entity({ name: 'technical_review_findings' })
@Index('idx_technical_review_findings_case_created', ['caseId', 'createdAt'])
export class TechnicalReviewFinding {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'technical_review_case_id', type: 'uuid' }) caseId: string;
  @Column({
    name: 'evaluation_control_result_id',
    type: 'uuid',
    nullable: true,
  })
  controlResultId: string | null;
  @Column({
    name: 'evaluation_claim_assessment_id',
    type: 'uuid',
    nullable: true,
  })
  claimAssessmentId: string | null;
  @Column({ type: 'varchar', length: 16 }) severity: TechnicalFindingSeverity;
  @Column({ type: 'varchar', length: 32 }) category:
    'Technical' | 'Security' | 'Policy';
  @Column({ name: 'creator_visible', type: 'boolean', default: true })
  creatorVisible: boolean;
  @Column({ type: 'varchar', length: 180 }) title: string;
  @Column({ type: 'varchar', length: 2000 }) description: string;
  @Column({
    name: 'required_action',
    type: 'varchar',
    length: 2000,
    nullable: true,
  })
  requiredAction: string | null;
  @Column({ name: 'created_by', type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
