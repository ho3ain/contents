import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A time-boxed, invocation-capped permission for ONE authorized reviewer to
 * exercise ONE runtime while reviewing ONE exact product version.
 *
 * This is deliberately NOT an entitlement:
 *  - it never appears in commerce/entitlement queries;
 *  - it grants no commercial right, no download, no refund surface;
 *  - it cannot outlive its review case, its expiry or its invocation budget;
 *  - it is revocable at any moment and every use is audited.
 *
 * It exists so a reviewer never has to buy a product in order to review it,
 * which previously was the only way to reach the execution gateway.
 */
@Entity({ name: 'review_access_grants' })
@Index('idx_review_access_grants_case', ['technicalReviewCaseId', 'createdAt'])
@Index('idx_review_access_grants_reviewer', ['reviewerId', 'revokedAt'])
@Index('idx_review_access_grants_runtime', ['runtimeId', 'revokedAt'])
export class ReviewAccessGrant {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'technical_review_case_id', type: 'uuid' })
  technicalReviewCaseId: string;

  @Column({ name: 'agent_id', type: 'uuid' }) agentId: string;

  /** The exact version under review. A new version needs a new grant. */
  @Column({ name: 'agent_version_id', type: 'uuid' }) agentVersionId: string;

  /** The single runtime this grant may exercise. */
  @Column({ name: 'runtime_id', type: 'uuid' }) runtimeId: string;

  /** The one user who may use this grant. Never a role, never a group. */
  @Column({ name: 'reviewer_id', type: 'uuid' }) reviewerId: string;

  @Column({ name: 'granted_by', type: 'uuid' }) grantedBy: string;

  @Column({ type: 'varchar', length: 300 }) reason: string;

  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;

  @Column({ name: 'max_invocations', type: 'int' }) maxInvocations: number;

  @Column({ name: 'used_invocations', type: 'int', default: 0 })
  usedInvocations: number;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy: string | null;

  @Column({
    name: 'revoke_reason',
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  revokeReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
