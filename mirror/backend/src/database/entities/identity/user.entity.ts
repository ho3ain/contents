import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  BUYER = 'buyer',
  CREATOR = 'creator',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * OPTIONAL (phone-primary auth): email is no longer required at
   * registration and may be NULL. Phone below is the primary identifier
   * for login. The unique index still guarantees one account per email
   * (PostgreSQL treats NULLs as distinct in unique indexes).
   */
  @Index('uq_users_email', { unique: true })
  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ name: 'username', type: 'varchar', length: 64, nullable: true })
  username: string | null;
  // NOTE: uniqueness is enforced by the PARTIAL unique index
  // uq_users_username (see migration 1750000000000) — a plain @Index
  // decorator here would misdescribe it (synchronize is and stays OFF).

  /**
   * Display name (AUTH upgrade — registration/onboarding). Optional profile
   * field; never used for authentication or uniqueness.
   */
  @Column({ name: 'full_name', type: 'varchar', length: 100, nullable: true })
  fullName: string | null;

  /** ISO 3166-1 alpha-2 country code (onboarding — contact step). */
  @Column({ name: 'country', type: 'varchar', length: 2, nullable: true })
  country: string | null;

  /**
   * Onboarding completion (AUTH upgrade): NULL = the user has not finished
   * the post-registration onboarding wizard; set once, backend-authoritative
   * (the frontend gate is UX only). A migration backfills every user that
   * existed BEFORE onboarding was introduced, so existing users never see
   * the wizard.
   */
  @Column({
    name: 'onboarding_completed_at',
    type: 'timestamptz',
    nullable: true,
  })
  onboardingCompletedAt: Date | null;

  /** Timestamp recorded by the legacy Terms/Privacy registration gate. */
  @Column({
    name: 'terms_accepted_at',
    type: 'timestamptz',
    nullable: true,
  })
  termsAcceptedAt: Date | null;

  /**
   * Date-shaped identifier of the Terms/Privacy bundle displayed by the
   * legacy registration gate (`LEGAL_DOCUMENTS`, YYYY-MM-DD). NULL for
   * accounts registered before versions were recorded — never back-filled.
   * This field is not a per-document consent or publication-status record.
   */
  @Column({
    name: 'terms_version',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  termsVersion: string | null;

  /**
   * Preferred UI/email language (Batch 10 — Phase 19, §20): 'fa' (default)
   * or 'en'. Drives localized transactional emails (RTL for fa).
   */
  @Column({
    name: 'preferred_locale',
    type: 'varchar',
    length: 5,
    default: 'fa',
  })
  preferredLocale: string;

  /**
   * PRIMARY login identifier (phone-primary auth): required for every new
   * registration. NULL only for legacy accounts created before the switch.
   * Stored normalized (`+<digits>` / `<digits>` — see normalizePhone).
   */
  @Index('uq_users_phone', { unique: true })
  @Column({ name: 'phone', type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({
    name: 'role',
    type: 'enum',
    enum: UserRole,
    enumName: 'user_role',
    default: UserRole.BUYER,
  })
  role: UserRole;

  @Column({
    name: 'status',
    type: 'enum',
    enum: UserStatus,
    enumName: 'user_status',
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ name: 'phone_verified_at', type: 'timestamptz', nullable: true })
  phoneVerifiedAt: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /**
   * Avatar system: DiceBear seed + background color.
   * The frontend renders the avatar from the seed; the backend stores
   * only the identifier and background so the UI is always derivable.
   */
  @Column({ name: 'avatar_id', type: 'varchar', length: 128, nullable: true })
  avatarId: string | null;

  @Column({ name: 'avatar_bg', type: 'varchar', length: 32, nullable: true })
  avatarBg: string | null;
}
