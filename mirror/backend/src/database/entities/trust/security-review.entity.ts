import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Agent } from '../agents/agent.entity';
import { User } from '../identity/user.entity';
import { SecurityReviewItem } from './security-review-item.entity';

export enum SecurityReviewVerdict {
  PASSED = 'passed',
  FAILED = 'failed',
}

/**
 * One manual security review cycle for an agent listing (PLAYBOOK 7.11) —
 * the 14-point checklist an admin walks through before a listing can earn
 * the "Listing Reviewed" badge. Each checklist outcome is a
 * security_review_items row.
 */
@Entity({ name: 'security_reviews' })
@Index('uq_security_reviews_agent_id', ['agentId'], { unique: true })
export class SecurityReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_security_reviews_agent_id')
  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  @Index('idx_security_reviews_reviewer_id')
  @Column({ name: 'reviewer_id', type: 'uuid', nullable: true })
  reviewerId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: User | null;

  @Column({
    name: 'verdict',
    type: 'enum',
    enum: SecurityReviewVerdict,
    enumName: 'security_review_verdict',
    nullable: true,
  })
  verdict: SecurityReviewVerdict | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => SecurityReviewItem, (item) => item.securityReview, {
    cascade: true,
  })
  items: SecurityReviewItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
