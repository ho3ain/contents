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
import { CreatorProfile } from '../identity/creator-profile.entity';

/**
 * Phase C1 — a lead is a PERSON the growth team knows about, who may not
 * have an account yet.
 *
 * "مدل Lead باید بتواند قبل از Registration وجود داشته باشد" — so this is
 * NOT the users table and NOT creator_profiles. It is a separate identity
 * that later RESOLVES onto a user/creator (user_id / creator_profile_id),
 * which is what keeps one human from showing up as three rows in the CRM.
 *
 * Attribution columns (source/medium/campaign/…) live HERE, on the lead,
 * and are never overwritten by later events — that is what makes
 * "landing → signup → product → first sale" a single attributable path.
 */
@Entity({ name: 'creator_leads' })
// There is deliberately NO stored `stage` column: the stage is derived from
// real facts at query time (crm-records.service.ts) and only the audited
// `manual_stage` override is persisted, so this index serves the override.
@Index('idx_creator_leads_stage', ['manualStage'])
@Index('idx_creator_leads_owner', ['ownerId'])
@Index('idx_creator_leads_source', ['source'])
@Index('idx_creator_leads_campaign', ['campaign'])
@Index('idx_creator_leads_last_activity', ['lastActivityAt'])
@Index('idx_creator_leads_created', ['createdAt'])
export class CreatorLead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ---- Identity (nullable until the person registers) ---------------------

  /** users.id once resolved — partial unique index in the migration. */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  /** creator_profiles.id once the person created a creator profile. */
  @Column({ name: 'creator_profile_id', type: 'uuid', nullable: true })
  creatorProfileId: string | null;

  @ManyToOne(() => CreatorProfile, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'creator_profile_id' })
  creatorProfile: CreatorProfile | null;

  // ---- Person ------------------------------------------------------------

  @Column({ name: 'name', type: 'varchar', length: 120, nullable: true })
  name: string | null;

  /** Stored NORMALIZED (lowercase, trimmed) — the duplicate-detection key. */
  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ name: 'username', type: 'varchar', length: 64, nullable: true })
  username: string | null;

  @Column({ name: 'company', type: 'varchar', length: 160, nullable: true })
  company: string | null;

  @Column({ name: 'website_url', type: 'text', nullable: true })
  websiteUrl: string | null;

  @Column({ name: 'social_links', type: 'jsonb', default: () => "'[]'::jsonb" })
  socialLinks: string[];

  // ---- Classification ----------------------------------------------------

  /** One of the closed CRM_SOURCES (taxonomy.ts). */
  @Column({ name: 'source', type: 'varchar', length: 32, default: 'other' })
  source: string;

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

  /** One of the closed CRM_CREATOR_TYPES; free to extend. */
  @Column({ name: 'creator_type', type: 'varchar', length: 32, nullable: true })
  creatorType: string | null;

  // ---- CRM state ---------------------------------------------------------

  /**
   * Audited admin override (funnel.ts). May only LOWER the derived stage —
   * the write path rejects anything above what the system measured.
   */
  @Column({ name: 'manual_stage', type: 'varchar', length: 24, nullable: true })
  manualStage: string | null;

  /** users.id of the internal owner (must be an admin / growth member). */
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner: User | null;

  /** Explicit qualification decision (also derivable from the live score). */
  @Column({ name: 'qualified_at', type: 'timestamptz', nullable: true })
  qualifiedAt: Date | null;

  @Column({ name: 'qualified_by', type: 'uuid', nullable: true })
  qualifiedBy: string | null;

  /**
   * Merge pointer (spec §19). A merged lead is RETAINED (not deleted) and
   * points at the survivor, which keeps the merge reversible and the audit
   * trail complete. Only ONE open lead may exist per person.
   */
  @Column({ name: 'merged_into_id', type: 'uuid', nullable: true })
  mergedIntoId: string | null;

  @ManyToOne(() => CreatorLead, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'merged_into_id' })
  mergedInto: CreatorLead | null;

  @Column({ name: 'merged_at', type: 'timestamptz', nullable: true })
  mergedAt: Date | null;

  /** When identity resolution linked this lead to a user/creator. */
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  // ---- C2: outcome (lost is a state, not a stage) -----------------------

  /**
   * C2 §6 "Lost" is deliberately NOT a funnel rung. A lead that we lost at
   * "interested" still genuinely reached "interested", and keeping the two
   * apart is what makes "where do we lose people" answerable.
   */
  @Column({ name: 'outcome', type: 'varchar', length: 16, default: 'active' })
  outcome: string;

  /** Required when lost (DB CHECK) — a shrug is not a loss reason. */
  @Column({ name: 'lost_reason', type: 'text', nullable: true })
  lostReason: string | null;

  @Column({ name: 'lost_at', type: 'timestamptz', nullable: true })
  lostAt: Date | null;

  // ---- C2: referral relationship ---------------------------------------

  /**
   * The lead that referred this one (C2 §12). A creator-to-creator referral
   * is a real relationship, not a text field, so it is a self FK.
   */
  @Column({ name: 'referred_by_id', type: 'uuid', nullable: true })
  referredById: string | null;

  @ManyToOne(() => CreatorLead, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'referred_by_id' })
  referredBy: CreatorLead | null;

  /** Last real interaction (event, outreach, login…). Drives inactivity. */
  @Column({ name: 'last_activity_at', type: 'timestamptz', nullable: true })
  lastActivityAt: Date | null;

  /** First time the growth team ever saw this person. */
  @Column({ name: 'first_contact_at', type: 'timestamptz', nullable: true })
  firstContactAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
