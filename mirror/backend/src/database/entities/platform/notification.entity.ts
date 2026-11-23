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
 * In-app notification. MVP notifications are written directly by the module
 * that owns the event (no event bus, PLAYBOOK 8.14).
 */
@Entity({ name: 'notifications' })
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_notifications_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'type', type: 'varchar', length: 48 })
  type: string;

  @Column({ name: 'title', type: 'varchar', length: 200 })
  title: string;

  @Column({ name: 'body', type: 'text', nullable: true })
  body: string | null;

  /**
   * Optional in-app deep link (BUY upgrade): lets a notification carry a
   * real CTA (purchase success → /library). Always an app-internal path,
   * never an external URL.
   */
  @Column({ name: 'link', type: 'varchar', length: 255, nullable: true })
  link: string | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  /** Sprint 2 — how loudly the UI should present it (info by default). */
  @Column({ name: 'severity', type: 'varchar', length: 12, default: 'info' })
  severity: 'info' | 'success' | 'warning' | 'critical';

  /** Sprint 2 — the domain object the notification is about (e.g. entitlement). */
  @Column({ name: 'related_type', type: 'varchar', length: 32, nullable: true })
  relatedType: string | null;

  @Column({ name: 'related_id', type: 'uuid', nullable: true })
  relatedId: string | null;

  /** Sprint 2 — same logical event ⇒ same key ⇒ at most one notification. */
  @Column({ name: 'dedup_key', type: 'varchar', length: 120, nullable: true })
  dedupKey: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
