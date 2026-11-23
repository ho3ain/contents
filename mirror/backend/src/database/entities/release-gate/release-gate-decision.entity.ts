import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ReleaseGateDecisionKind =
  | 'PublicationRequested'
  | 'PublicationSucceeded'
  | 'PublicationBlocked'
  | 'ReadinessObserved';

/** Append-only explanation snapshots; never substitutes for canonical evaluation/review/product state. */
@Entity({ name: 'release_gate_decisions' })
@Index('idx_release_gate_decisions_agent_created', ['agentId', 'createdAt'])
@Index('idx_release_gate_decisions_submission_created', [
  'reviewSubmissionId',
  'createdAt',
])
export class ReleaseGateDecision {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'agent_id', type: 'uuid' }) agentId: string;
  @Column({ name: 'creator_id', type: 'uuid' }) creatorId: string;
  @Column({ name: 'review_submission_id', type: 'uuid', nullable: true })
  reviewSubmissionId: string | null;
  @Column({ name: 'release_gate_operation_id', type: 'uuid', nullable: true })
  operationId: string | null;
  @Column({ name: 'decision_kind', type: 'varchar', length: 32 })
  kind: ReleaseGateDecisionKind;
  @Column({ name: 'actor_id', type: 'uuid', nullable: true }) actorId:
    string | null;
  @Column({ name: 'anchors', type: 'jsonb' }) anchors: Record<string, unknown>;
  @Column({ name: 'blockers', type: 'jsonb', default: () => "'[]'::jsonb" })
  blockers: unknown[];
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
