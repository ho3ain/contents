import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Phase C1 — first-party attribution capture (spec §7 "Attribution
 * Persistence").
 *
 * The scenario the spec calls out: a creator lands, leaves, and registers
 * three days later. A cookie-less, IP-based guess would lose that. So the
 * public site captures the UTM set ONCE, keyed by the same salted
 * visitor hash the analytics layer already uses (never a raw IP), and the
 * browser keeps only the row id. On registration the backend links that row
 * to the new user and copies its values onto the lead, which is what keeps
 * the whole path — landing → signup → product → first sale — attributable.
 *
 * No PII is stored here: visitor_key is a one-way hash.
 */
@Entity({ name: 'creator_attributions' })
// One capture row per visitor: the class-level index serves the unique key
// enforced by crm-attribution.service.ts (visitorKey is a SHA-256 digest).
@Index('uq_creator_attributions_visitor', ['visitorKey'], { unique: true })
@Index('idx_creator_attributions_user', ['userId'])
@Index('idx_creator_attributions_lead', ['leadId'])
export class CreatorAttribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Salted one-way visitor hash — never a raw IP, UA or user id. */
  @Column({ name: 'visitor_key', type: 'varchar', length: 64 })
  visitorKey: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  /** Set once identity resolution attached the capture to a CRM lead. */
  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId: string | null;

  @Column({ name: 'source', type: 'varchar', length: 32, nullable: true })
  source: string | null;

  @Column({ name: 'medium', type: 'varchar', length: 64, nullable: true })
  medium: string | null;

  @Column({ name: 'campaign', type: 'varchar', length: 120, nullable: true })
  campaign: string | null;

  @Column({ name: 'content', type: 'varchar', length: 120, nullable: true })
  content: string | null;

  @Column({ name: 'term', type: 'varchar', length: 120, nullable: true })
  term: string | null;

  @Column({
    name: 'landing_page',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  landingPage: string | null;

  @Column({ name: 'referrer', type: 'varchar', length: 500, nullable: true })
  referrer: string | null;

  /** How many times the same visitor came back before registering. */
  @Column({ name: 'touch_count', type: 'integer', default: 1 })
  touchCount: number;

  @Column({
    name: 'first_seen_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  firstSeenAt: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'now()' })
  lastSeenAt: Date;

  @Column({ name: 'converted_at', type: 'timestamptz', nullable: true })
  convertedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
