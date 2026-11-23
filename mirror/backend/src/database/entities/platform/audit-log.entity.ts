import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../identity/user.entity';

/**
 * Append-only audit trail for trust- and money-relevant events (PLAYBOOK
 * 8.17): logins, creator approvals, agent submission/review outcomes,
 * payment status changes, refunds, role and verification changes. Metadata
 * is minimized to what each event actually needs.
 */
@Entity({ name: 'audit_logs' })
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_audit_logs_actor_id')
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor: User | null;

  @Index('idx_audit_logs_action')
  @Column({ name: 'action', type: 'varchar', length: 64 })
  action: string;

  @Column({ name: 'entity', type: 'varchar', length: 64 })
  entity: string;

  @Index('idx_audit_logs_entity')
  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ name: 'ip', type: 'inet', nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'metadata', type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
