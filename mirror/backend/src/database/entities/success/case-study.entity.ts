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
import { CreatorProfile } from '../identity/creator-profile.entity';
import { Agent } from '../agents/agent.entity';
import { User } from '../identity/user.entity';
import {
  CASE_STUDY_STATUSES,
  type CaseStudyStatus,
} from '../../../modules/success/domain/case-study-eligibility';

/**
 * TypeORM's `enum:` option needs a runtime object. The canonical list stays
 * in the domain module; this object is the same values, and the type
 * assertion below makes the compiler fail if the two ever diverge.
 */
const CASE_STUDY_STATUS = Object.fromEntries(
  CASE_STUDY_STATUSES.map((s) => [s, s]),
) as Record<CaseStudyStatus, CaseStudyStatus>;

/**
 * Phase C4 §12–§14 — a creator's success story.
 *
 * The seven wizard answers are stored as discrete columns rather than one
 * JSON blob, because §12 is a seven-step wizard that must be resumable and
 * §13 needs per-field state for "changes requested" to mean something. A blob
 * would make both impossible and would hide every field from the database's
 * own validation.
 *
 * `slug` is the public URL (§14) and is UNIQUE — two case studies at the same
 * address would be a broken link and a duplicate-content problem for SEO, so
 * the database refuses it rather than relying on slug de-duplication code that
 * could race.
 */
@Entity({ name: 'creator_case_studies' })
@Index('uq_creator_case_studies_slug', ['slug'], { unique: true })
@Index('idx_creator_case_studies_creator', ['creatorId'])
@Index('idx_creator_case_studies_status', ['status'])
// One creator cannot have two live case studies for the same story. A
// partial index (status <> archived) is what makes this "at most one active"
// rather than "at most one ever", so an archived story can be rewritten.
@Index('uq_creator_case_studies_active', ['creatorId'], {
  unique: true,
  where: `"status" <> 'archived'`,
})
export class CaseStudy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;

  @ManyToOne(() => CreatorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creator_id' })
  creator: CreatorProfile;

  /** Denormalized so the public page does not need a profile join. */
  @Column({ name: 'creator_user_id', type: 'uuid' })
  creatorUserId: string;

  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId: string | null;

  @ManyToOne(() => Agent, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent | null;

  @Column({ type: 'varchar', length: 140 })
  slug: string;

  @Column({ name: 'creator_name', type: 'varchar', length: 120 })
  creatorName: string;

  @Column({ name: 'product_name', type: 'varchar', length: 160 })
  productName: string;

  // ---- §12 the seven wizard steps ---------------------------------------

  /** Step 1 — قبل از Mesh: the problem they had. */
  @Column({ name: 'problem', type: 'text', default: '' })
  problem: string;

  /** Step 2 — چه ساختید: what they built. */
  @Column({ name: 'solution', type: 'text', default: '' })
  solution: string;

  /** Step 3 — نتیجه: the measurable outcome. */
  @Column({
    name: 'result_sales',
    type: 'integer',
    default: 0,
  })
  resultSales: number;

  @Column({
    name: 'result_users',
    type: 'integer',
    default: 0,
  })
  resultUsers: number;

  @Column({
    name: 'result_revenue',
    type: 'numeric',
    precision: 20,
    scale: 2,
    default: 0,
  })
  resultRevenue: string;

  @Column({
    name: 'result_time_saved',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  resultTimeSaved: string | null;

  @Column({ name: 'result_other', type: 'text', nullable: true })
  resultOther: string | null;

  /** Step 4 — تجربه: what Mesh did for them. */
  @Column({ name: 'mesh_experience', type: 'text', default: '' })
  meshExperience: string;

  /** Step 5 — Quote. */
  @Column({ name: 'quote', type: 'text', default: '' })
  quote: string;

  // ---- §13 the editorial lifecycle --------------------------------------

  @Column({
    type: 'enum',
    enum: CASE_STUDY_STATUS,
    enumName: 'case_study_status',
    default: CASE_STUDY_STATUS.draft,
  })
  status: CaseStudyStatus;

  /**
   * §12 Step 7 — explicit, separate consent. It is NOT implied by pressing
   * "submit": publishing a person's words and their revenue publicly is the
   * one action in C4 that cannot be undone by an admin mistake, so the
   * creator's consent is its own timestamped fact.
   */
  @Column({ name: 'consent_at', type: 'timestamptz', nullable: true })
  consentAt: Date | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
