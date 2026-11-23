import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { TechnicalAssignmentType } from '../../../modules/technical-review/domain/technical-review.types';

/** Append-only assignment/reassignment history; case has the current assignee projection. */
@Entity({ name: 'technical_review_assignments' })
@Index('idx_technical_review_assignments_case_created', ['caseId', 'createdAt'])
export class TechnicalReviewAssignment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'technical_review_case_id', type: 'uuid' }) caseId: string;
  @Column({ name: 'assignment_type', type: 'varchar', length: 16 })
  assignmentType: TechnicalAssignmentType;
  @Column({ name: 'assignee_id', type: 'uuid' }) assigneeId: string;
  @Column({ name: 'assigned_by', type: 'uuid' }) assignedBy: string;
  @Column({ type: 'varchar', length: 300 }) reason: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
