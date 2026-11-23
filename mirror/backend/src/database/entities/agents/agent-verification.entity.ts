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
import { User } from '../identity/user.entity';

export enum AgentVerificationStatus {
  GRANTED = 'granted',
  REVOKED = 'revoked',
}

export enum AgentVerificationType {
  /** The "Listing Reviewed" badge (PLAYBOOK 7.9). */
  LISTING_REVIEWED = 'listing_reviewed',
}

/**
 * Verification badges for an agent listing. One current row per
 * (agent, verification_type); grants and revocations update that row so the
 * badge state is unambiguous (PLAYBOOK 7.9/7.14).
 */
@Entity({ name: 'agent_verifications' })
@Index('uq_agent_verifications_agent_type', ['agentId', 'verificationType'], {
  unique: true,
})
export class AgentVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  @Column({
    name: 'verification_type',
    type: 'enum',
    enum: AgentVerificationType,
    enumName: 'agent_verification_type',
    default: AgentVerificationType.LISTING_REVIEWED,
  })
  verificationType: AgentVerificationType;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AgentVerificationStatus,
    enumName: 'agent_verification_status',
  })
  status: AgentVerificationStatus;

  @Index('idx_agent_verifications_reviewed_by')
  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer: User | null;

  @Column({ name: 'note', type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'granted_at', type: 'timestamptz', nullable: true })
  grantedAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
