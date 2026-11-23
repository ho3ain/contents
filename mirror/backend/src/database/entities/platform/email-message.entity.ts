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

export enum EmailStatus {
  PENDING = 'pending',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
  PERMANENTLY_FAILED = 'permanently_failed',
}

/**
 * One transactional email delivery attempt chain (Batch 10 — Phase 19,
 * §21/§22).
 *
 * Business state is strictly separated from email submission state: a
 * committed payment stays committed even when its confirmation email fails.
 * `sent` means the configured transport accepted the message for submission;
 * it is not proof that a recipient mailbox received or read it. Each row
 * records what was queued (template, locale, payload), the
 * attempt count, the next retry time and the LAST safe error — enough to
 * reconstruct a "I never received the email" report. The render payload
 * (which for verification/reset templates contains the code/token) is kept
 * ONLY while the message is still retryable and is purged on every
 * terminal state (sent / permanently_failed) — tokens never outlive
 * delivery in this table.
 */
@Entity({ name: 'email_messages' })
@Index('idx_email_messages_status_next_attempt', ['status', 'nextAttemptAt'])
export class EmailMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_email_messages_user_id')
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ name: 'to_email', type: 'varchar', length: 255 })
  toEmail: string;

  /** Template id, e.g. email_verification_code, purchase_confirmation. */
  @Column({ name: 'template', type: 'varchar', length: 64 })
  template: string;

  @Column({ name: 'locale', type: 'varchar', length: 5, default: 'fa' })
  locale: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: EmailStatus,
    enumName: 'email_status',
    default: EmailStatus.PENDING,
  })
  status: EmailStatus;

  @Column({ name: 'attempts', type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'max_attempts', type: 'int', default: 5 })
  maxAttempts: number;

  /** Safe provider error code/class — never credentials or payload dumps. */
  @Column({
    name: 'last_error_code',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  lastErrorCode: string | null;

  @Column({ name: 'last_error', type: 'varchar', length: 500, nullable: true })
  lastError: string | null;

  @Column({
    name: 'provider_message_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerMessageId: string | null;

  /** Safe template variables (ids, names, amounts) — tokens excluded. */
  @Column({ name: 'payload', type: 'jsonb', default: () => "'{}'" })
  payload: Record<string, unknown>;

  @Column({
    name: 'related_entity_type',
    type: 'varchar',
    length: 48,
    nullable: true,
  })
  relatedEntityType: string | null;

  @Column({ name: 'related_entity_id', type: 'uuid', nullable: true })
  relatedEntityId: string | null;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt: Date | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
