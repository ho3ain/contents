import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum CreatorProfileStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  SUSPENDED = 'suspended',
}

export enum CreatorVerificationStatus {
  UNVERIFIED = 'unverified',
  PENDING = 'pending',
  VERIFIED = 'verified',
  REVOKED = 'revoked',
}

@Entity({ name: 'creator_profiles' })
export class CreatorProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_creator_profiles_user_id', { unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index('uq_creator_profiles_slug', { unique: true })
  @Column({ name: 'slug', type: 'varchar', length: 80 })
  slug: string;

  @Column({ name: 'display_name', type: 'varchar', length: 120 })
  displayName: string;

  @Column({ name: 'bio', type: 'text', default: '' })
  bio: string;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  @Column({ name: 'website_url', type: 'text', nullable: true })
  websiteUrl: string | null;

  @Column({ name: 'social_links', type: 'jsonb', default: () => "'[]'" })
  socialLinks: string[];

  @Column({ name: 'expertise', type: 'jsonb', default: () => "'[]'" })
  expertise: string[];

  @Column({
    name: 'status',
    type: 'enum',
    enum: CreatorProfileStatus,
    enumName: 'creator_profile_status',
    default: CreatorProfileStatus.PENDING,
  })
  status: CreatorProfileStatus;

  @Column({
    name: 'verification_status',
    type: 'enum',
    enum: CreatorVerificationStatus,
    enumName: 'creator_verification_status',
    default: CreatorVerificationStatus.UNVERIFIED,
  })
  verificationStatus: CreatorVerificationStatus;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  // ---- Creator Foundation (Phase A1) ------------------------------------

  /**
   * Public "field of activity": marketplace category slugs (the existing
   * catalog taxonomy — no parallel list). Validated server-side against
   * the categories table on every write.
   */
  @Column({ name: 'activity_areas', type: 'jsonb', default: () => "'[]'" })
  activityAreas: string[];

  /**
   * The admin's note on the latest verification decision (e.g. what must
   * be corrected). PRIVATE to the owner — never part of the public view.
   * Cleared when the creator re-submits a verification request.
   */
  @Column({ name: 'verification_note', type: 'text', nullable: true })
  verificationNote: string | null;

  /** When the current/last verification request was submitted. */
  @Column({
    name: 'verification_requested_at',
    type: 'timestamptz',
    nullable: true,
  })
  verificationRequestedAt: Date | null;

  /**
   * Why the account is restricted (admin suspension reason). PRIVATE to the
   * owner; cleared when an admin (re)approves the profile.
   */
  @Column({ name: 'status_reason', type: 'text', nullable: true })
  statusReason: string | null;

  /**
   * Creator onboarding persistence (backend-authoritative — survives
   * refresh, logout and device switches):
   * - onboardingStep: the last step the creator was on (resume point)
   * - onboardingCompletedAt: the creator finished the guided onboarding
   * - onboardingDismissedAt: the creator chose "later" (no auto-redirect)
   * Step COMPLETION is never stored here — it is derived from real state
   * (profile fields, verification, agents) by creator-foundation.ts.
   */
  @Column({
    name: 'onboarding_step',
    type: 'varchar',
    length: 24,
    nullable: true,
  })
  onboardingStep: string | null;

  @Column({
    name: 'onboarding_completed_at',
    type: 'timestamptz',
    nullable: true,
  })
  onboardingCompletedAt: Date | null;

  @Column({
    name: 'onboarding_dismissed_at',
    type: 'timestamptz',
    nullable: true,
  })
  onboardingDismissedAt: Date | null;

  /**
   * Gap closure — optional personalization (never blocks onboarding). Values
   * are validated against the closed sets in `creator-personalization.ts`.
   */
  @Column({ name: 'creator_goal', type: 'varchar', length: 32, nullable: true })
  creatorGoal: string | null;

  @Column({
    name: 'experience_level',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  experienceLevel: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  tools: string[];

  /** 'ready' | 'idea' | 'no_idea' — drives idea suggestions. */
  @Column({
    name: 'product_readiness',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  productReadiness: string | null;

  /** Country + city only (never an address). Public only if showLocation. */
  @Column({
    name: 'location_country',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  locationCountry: string | null;

  @Column({
    name: 'location_city',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  locationCity: string | null;

  @Column({ name: 'show_location', type: 'boolean', default: true })
  showLocation: boolean;

  /**
   * Whether the public profile shows a picture at all. Covers BOTH the
   * uploaded `avatarUrl` and the account's generated avatar; off means
   * initials everywhere a buyer can look.
   */
  @Column({ name: 'show_avatar', type: 'boolean', default: true })
  showAvatar: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
