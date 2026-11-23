import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Append-only state/event timeline, safe bounded metadata only. */
@Entity({ name: 'technical_review_events' })
@Index('idx_technical_review_events_case_created', ['caseId', 'createdAt'])
export class TechnicalReviewEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'technical_review_case_id', type: 'uuid' }) caseId: string;
  @Column({ type: 'varchar', length: 64 }) type: string;
  @Column({ name: 'from_state', type: 'varchar', length: 32, nullable: true })
  fromState: string | null;
  @Column({ name: 'to_state', type: 'varchar', length: 32, nullable: true })
  toState: string | null;
  @Column({ name: 'actor_id', type: 'uuid', nullable: true }) actorId:
    string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) reason:
    string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata: Record<
    string,
    unknown
  >;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
