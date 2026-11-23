import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Bounded textual response, deliberately not an arbitrary file/URL upload surface. */
@Entity({ name: 'technical_review_creator_responses' })
@Index('idx_technical_review_creator_responses_case_created', [
  'caseId',
  'createdAt',
])
export class TechnicalReviewCreatorResponse {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'technical_review_case_id', type: 'uuid' }) caseId: string;
  @Column({ name: 'finding_id', type: 'uuid' }) findingId: string;
  @Column({ name: 'creator_id', type: 'uuid' }) creatorId: string;
  @Column({ type: 'varchar', length: 2000 }) response: string;
  @Column({
    name: 'evidence_reference',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  evidenceReference: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
