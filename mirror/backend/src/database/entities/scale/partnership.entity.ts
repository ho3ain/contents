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
import { CreatorLead } from '../crm/creator-lead.entity';
import {
  PARTNERSHIP_STAGES,
  PARTNERSHIP_TYPES,
  ATTRIBUTION_METHODS,
  AGREEMENT_STATUSES,
  type PartnershipStage,
  type PartnershipType,
  type AttributionMethod,
  type AgreementStatus,
} from '../../../modules/scale/domain/partnership';

const STAGE = Object.fromEntries(
  PARTNERSHIP_STAGES.map((s) => [s, s]),
) as Record<PartnershipStage, PartnershipStage>;
const TYPE = Object.fromEntries(PARTNERSHIP_TYPES.map((s) => [s, s])) as Record<
  PartnershipType,
  PartnershipType
>;
const METHOD = Object.fromEntries(
  ATTRIBUTION_METHODS.map((s) => [s, s]),
) as Record<AttributionMethod, AttributionMethod>;
const AGREEMENT = Object.fromEntries(
  AGREEMENT_STATUSES.map((s) => [s, s]),
) as Record<AgreementStatus, AgreementStatus>;

/**
 * Phase C5 §15–§18 — a partnership with an external organisation.
 *
 * `lead_id` is what stops this from duplicating C2. A partner is, at the
 * start, a lead: somebody an admin is talking to. Rather than inventing a
 * parallel contact record and re-entering the same person's name, email and
 * website, a partnership points at the `creator_leads` row that already holds
 * them. The fields that are genuinely partnership-specific (stage, agreement,
 * attribution method, contract dates) live here; the contact details do not.
 *
 * The columns C2 does not have — `owner_id` for the internal staff member,
 * `notes` for the relationship narrative — exist because a partnership has a
 * lifecycle a lead does not.
 */
@Entity({ name: 'partnerships' })
@Index('uq_partnerships_lead', ['leadId'], { unique: true })
@Index('uq_partnerships_code', ['code'], { unique: true })
@Index('idx_partnerships_stage', ['stage'])
@Index('idx_partnerships_owner', ['ownerId'])
export class Partnership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lead_id', type: 'uuid' })
  leadId: string;

  @ManyToOne(() => CreatorLead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: CreatorLead;

  @Column({ name: 'name', type: 'varchar', length: 160 })
  name: string;

  @Column({
    type: 'enum',
    enum: TYPE,
    enumName: 'partnership_type',
    default: TYPE.other,
  })
  type: PartnershipType;

  @Column({
    type: 'enum',
    enum: STAGE,
    enumName: 'partnership_stage',
    default: STAGE.prospect,
  })
  stage: PartnershipStage;

  @Column({
    name: 'agreement_status',
    type: 'enum',
    enum: AGREEMENT,
    enumName: 'agreement_status',
    default: AGREEMENT.none,
  })
  agreementStatus: AgreementStatus;

  /** The internal staff member responsible (§15 "Owner"). */
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner: User | null;

  /** §15/§17 — the partner's own referral code, minted on activation. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  code: string | null;

  @Column({ name: 'campaign', type: 'varchar', length: 120, nullable: true })
  campaign: string | null;

  @Column({
    name: 'attribution_method',
    type: 'enum',
    enum: METHOD,
    enumName: 'attribution_method',
    default: METHOD.referral_link,
  })
  attributionMethod: AttributionMethod;

  @Column({ name: 'start_date', type: 'timestamptz', nullable: true })
  startDate: Date | null;

  @Column({ name: 'end_date', type: 'timestamptz', nullable: true })
  endDate: Date | null;

  /** §15 "Notes" — the relationship narrative, safe to render as text. */
  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  /**
   * §15 "Internal notes". Kept SEPARATE from `notes` on purpose: `notes` is
   * the shared summary, `internal_notes` is staff-only. They are different
   * audiences, and merging them is how a partner ends up reading an internal
   * assessment. No public endpoint reads either.
   */
  @Column({ name: 'internal_notes', type: 'text', nullable: true })
  internalNotes: string | null;

  /** §14 — which side of MESH this partner brings. Drives §18 reporting. */
  @Column({ name: 'brings', type: 'varchar', length: 16, default: 'both' })
  brings: string;

  /**
   * §16 — public partnership link views.
   *
   * A partnership has its own public code, so it needs the same counter the
   * referral and affiliate channels already had. Without it the public
   * endpoint answered `recorded: true` for a partnership link while no
   * number anywhere reflected the click.
   */
  @Column({ name: 'click_count', type: 'integer', default: 0 })
  clickCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
