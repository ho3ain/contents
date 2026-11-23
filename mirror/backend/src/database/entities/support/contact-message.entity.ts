import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Review states of a public contact-form message (Sprint 1 — C2). */
export const CONTACT_MESSAGE_STATUSES = [
  'new',
  'in_progress',
  'replied',
  'closed',
  'spam',
] as const;
export type ContactMessageStatus = (typeof CONTACT_MESSAGE_STATUSES)[number];

/** Topics the public form offers; mirrored by the frontend select. */
export const CONTACT_TOPICS = [
  'general',
  'purchase',
  'creator',
  'partnership',
  'privacy',
  'bug',
] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

/**
 * A message sent through the public website contact form.
 *
 * Deliberately NOT a `support_requests` row: that model requires a signed-in
 * requester (SLA timers, notifications and the user-360 view all assume one)
 * and anonymous visitors must be able to write to MESH. The two queues are
 * reviewed from the same admin page (`/admin/support-ops`).
 *
 * Privacy: only what the person typed is stored (name, e-mail, topic,
 * message, UI locale). No IP address or user agent is persisted; the
 * duplicate guard works on a hash of e-mail + message instead.
 */
@Entity({ name: 'contact_messages' })
@Index('idx_contact_messages_status_created', ['status', 'createdAt'])
@Index('idx_contact_messages_fingerprint_created', ['fingerprint', 'createdAt'])
@Index('idx_contact_messages_email_created', ['email', 'createdAt'])
export class ContactMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** Lower-cased reply address — the only channel back to the sender. */
  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 32 })
  topic: ContactTopic;

  @Column({ type: 'text' })
  message: string;

  /** UI locale at submission time — the reply e-mail is sent in it. */
  @Column({ type: 'varchar', length: 5, default: 'fa' })
  locale: 'fa' | 'en';

  @Column({ type: 'varchar', length: 16, default: 'new' })
  status: ContactMessageStatus;

  /** sha256(lower(email) + "\n" + normalised message) — duplicate guard. */
  @Column({ type: 'char', length: 64 })
  fingerprint: string;

  /** Admin who last changed the status / replied (no FK: audit trail is in admin_audit). */
  @Column({ name: 'handled_by', type: 'uuid', nullable: true })
  handledBy: string | null;

  /** Internal note, never shown to the sender. */
  @Column({ name: 'internal_note', type: 'text', nullable: true })
  internalNote: string | null;

  /** The last reply body sent to the sender (one reply thread is enough for a contact form). */
  @Column({ name: 'reply_body', type: 'text', nullable: true })
  replyBody: string | null;

  @Column({ name: 'replied_at', type: 'timestamptz', nullable: true })
  repliedAt: Date | null;

  /** Outbox row of the reply e-mail — lets the admin see delivery state. */
  @Column({ name: 'reply_email_id', type: 'uuid', nullable: true })
  replyEmailId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
