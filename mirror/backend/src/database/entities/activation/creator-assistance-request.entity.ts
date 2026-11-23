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
import { User } from '../identity/user.entity';

/**
 * Phase C3 — a creator asking for help from inside the panel (spec §12).
 *
 * This is a SUPPORT record, not a stage. It deliberately holds no
 * activation state: a request must never be able to advance or rewrite
 * where the creator is. The linkage to the real stage is by observation
 * (captured at creation time, for the operator's context) and never written
 * back.
 */
@Entity({ name: 'creator_assistance_requests' })
@Index('idx_creator_assistance_creator_created', ['creatorId', 'createdAt'])
// The admin queue's hot path: open requests, oldest first.
@Index('idx_creator_assistance_status_created', ['status', 'createdAt'])
export class CreatorAssistanceRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creator_id' })
  creator: User;

  @Column({ name: 'type', type: 'varchar', length: 32 })
  type: 'IDEA_HELP' | 'PRODUCT_HELP' | 'SUBMISSION_HELP' | 'GENERAL';

  @Column({ name: 'message', type: 'text' })
  message: string;

  /**
   * A SNAPSHOT of the creator's real stage when they asked, kept so the
   * operator can answer "where were you?" without reconstructing history.
   * It is a record of the past and is never updated.
   */
  @Column({ name: 'stage_snapshot', type: 'varchar', length: 32 })
  stageSnapshot: string;

  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId: string | null;

  @Column({ name: 'priority', type: 'varchar', length: 16, default: 'normal' })
  priority: 'low' | 'normal' | 'high';

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'open' })
  status: 'open' | 'in_progress' | 'resolved' | 'closed';

  @Column({ name: 'assigned_admin_id', type: 'uuid', nullable: true })
  assignedAdminId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_admin_id' })
  assignedAdmin: User | null;

  /** The operator's reply. Creators can READ this; it is not internal. */
  @Column({ name: 'response', type: 'text', nullable: true })
  response: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
