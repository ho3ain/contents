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
 * Phase C3 — the reminder ledger (spec §20).
 *
 * C3 requires per-trigger "cooldown, deduplication, maximum frequency, last
 * sent timestamp". The pure rule engine decides WHETHER to send; this table is
 * what makes the answer survive a restart and hold under concurrency.
 *
 * The unique (creator_id, kind) pair is the real anti-spam guarantee: two
 * reminder sweeps racing each other will both try to insert, and exactly one
 * wins. Without it, anti-spam would depend on the engine being called once,
 * which is precisely the assumption that breaks in production.
 */
@Entity({ name: 'creator_activation_reminders' })
@Index('uq_creator_activation_reminder_creator_kind', ['creatorId', 'kind'], {
  unique: true,
})
export class CreatorActivationReminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creator_id' })
  creator: User;

  @Column({ name: 'kind', type: 'varchar', length: 48 })
  kind: string;

  @Column({ name: 'last_sent_at', type: 'timestamptz' })
  lastSentAt: Date;

  @Column({ name: 'send_count', type: 'integer', default: 0 })
  sendCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
