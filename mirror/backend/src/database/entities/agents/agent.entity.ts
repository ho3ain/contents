import type { AgentChangelog } from './agent-version.entity';
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
import { AgentVersion } from './agent-version.entity';
import {
  AdditionalCost,
  BuildTool,
  CommercialProfile,
  DeliveryModel,
  ExecutionModel,
  HostingResponsibility,
  ProductType,
  SupportOwner,
  UsageModel,
} from './product-model';

/** A5 §19 — groups copied from the source that must be re-confirmed. */
export const DUPLICATE_CONFIRM_GROUPS = [
  'pricing',
  'commercial_terms',
  'product_type',
  'delivery',
  'runtime',
  'security',
  'data_policy',
  'integrations',
  'requirements',
] as const;
export type DuplicateConfirmGroup = (typeof DUPLICATE_CONFIRM_GROUPS)[number];

export interface DuplicateMeta {
  mode: 'duplicate' | 'complement';
  sourceAgentId: string;
  sourceName: string;
  /**
   * Groups still waiting for the creator's explicit confirmation. Exposed
   * to readiness as `content.confirmPending`, where each one is a REQUIRED
   * item — a duplicated draft cannot be submitted until all are confirmed.
   */
  unconfirmed: DuplicateConfirmGroup[];
  createdAt: string;
}

export enum AgentStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  /** Phase A3 ACTION_REQUIRED (label «نیاز به اصلاح») — value kept for API compatibility. */
  CHANGES_REQUESTED = 'changes_requested',
  /** Phase A3 — a corrected revision was sent back for review. */
  RESUBMITTED = 'resubmitted',
  APPROVED = 'approved',
  /** Phase A3 — approved by review, waiting for the publish step. */
  READY_TO_PUBLISH = 'ready_to_publish',
  PUBLISHED = 'published',
  /** Phase A4 — the creator took the live listing offline (re-publishable). */
  UNPUBLISHED = 'unpublished',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
  ARCHIVED = 'archived',
  DEPRECATED = 'deprecated',
}

export enum AgentRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * The marketplace listing (never the agent runtime itself — MESH does
 * not execute agents, PLAYBOOK 8.1). Variable, filterable metadata lives in
 * structured JSON columns; declared permissions, integrations, requirements
 * and data policy live in their own normalized tables.
 */
@Entity({ name: 'agents' })
@Index('idx_agents_creator_id', ['creatorId'])
@Index('idx_agents_status', ['status'])
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;

  @ManyToOne(() => CreatorProfile, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'creator_id' })
  creator: CreatorProfile;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name: string;

  @Index('uq_agents_slug', { unique: true })
  @Column({ name: 'slug', type: 'varchar', length: 140 })
  slug: string;

  @Column({
    name: 'short_description',
    type: 'varchar',
    length: 300,
    default: '',
  })
  shortDescription: string;

  @Column({ name: 'full_description', type: 'text', default: '' })
  fullDescription: string;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl: string | null;

  /** Creator-curated position in the public showcase; null means not selected. */
  @Column({ name: 'portfolio_order', type: 'integer', nullable: true })
  portfolioOrder: number | null;

  @Column({ name: 'capabilities', type: 'jsonb', default: () => "'[]'" })
  capabilities: Array<{ title: string; description?: string }>;

  @Column({ name: 'limitations', type: 'jsonb', default: () => "'[]'" })
  limitations: string[];

  /** Concrete scenarios the agent is built for (wizard §2, buyer detail). */
  @Column({ name: 'use_cases', type: 'jsonb', default: () => "'[]'" })
  useCases: string[];

  /** Who the agent is meant for (wizard §2, buyer detail). */
  @Column({ name: 'target_audience', type: 'jsonb', default: () => "'[]'" })
  targetAudience: string[];

  /** What the agent takes in, one entry per input (wizard §3). */
  @Column({ name: 'inputs', type: 'jsonb', default: () => "'[]'" })
  inputs: string[];

  /** What the agent produces, one entry per output (wizard §3). */
  @Column({ name: 'outputs', type: 'jsonb', default: () => "'[]'" })
  outputs: string[];

  /** Ordered how-it-works steps (wizard §3, buyer detail). */
  @Column({
    name: 'how_it_works',
    type: 'jsonb',
    default: () => "'[]'",
  })
  howItWorks: Array<{ title: string; description?: string }>;

  // ---- Product Creation (Phase A2) — Problem & Audience -----------------

  /** What problem the product solves, in business terms (wizard step 2). */
  @Column({ name: 'problem_statement', type: 'text', default: '' })
  problemStatement: string;

  /** Who gets the most value (wizard step 2, buyer detail). */
  @Column({ name: 'best_for', type: 'jsonb', default: () => "'[]'" })
  bestFor: string[];

  /** Who the product is NOT a fit for (wizard step 2, buyer detail). */
  @Column({ name: 'not_for', type: 'jsonb', default: () => "'[]'" })
  notFor: string[];

  @Column({ name: 'example_input', type: 'text', nullable: true })
  exampleInput: string | null;

  @Column({ name: 'example_output', type: 'text', nullable: true })
  exampleOutput: string | null;

  @Column({ name: 'usage_guide', type: 'text', nullable: true })
  usageGuide: string | null;

  @Column({ name: 'demo_url', type: 'text', nullable: true })
  demoUrl: string | null;

  // ---- Product Creation (Phase A2) — Media ------------------------------
  // URLs only: MESH has no upload/video-hosting infrastructure (A2 §18/§50).
  // A future upload service returns the same URL values — no schema change.

  @Column({ name: 'cover_url', type: 'text', nullable: true })
  coverUrl: string | null;

  /** Ordered screenshot image URLs (max 6, validated in the DTO). */
  @Column({ name: 'screenshots', type: 'jsonb', default: () => "'[]'" })
  screenshots: string[];

  /** Buyer Discovery (M7) — optional demo video URL (shown for known hosts only). */
  @Column({ name: 'demo_video_url', type: 'text', nullable: true })
  demoVideoUrl: string | null;

  /** Buyer Discovery (M2) — creator-provided search keywords (max 12). */
  @Column({ name: 'keywords', type: 'jsonb', default: () => "'[]'" })
  keywords: string[];

  @Column({
    name: 'price',
    type: 'numeric',
    precision: 20,
    scale: 2,
    default: 0,
  })
  price: string;

  @Column({ name: 'currency', type: 'varchar', length: 8, default: 'IRR' })
  currency: string;

  @Column({ name: 'is_free', type: 'boolean', default: true })
  isFree: boolean;

  /** Optional buyer-facing pricing explanation (A2 §17). */
  @Column({ name: 'pricing_note', type: 'text', nullable: true })
  pricingNote: string | null;

  /**
   * Phase 1 canonical commercial commitment. Null means a legacy listing
   * that predates the profile; no migration infers a license or payment plan.
   */
  @Column({ name: 'commercial_profile', type: 'jsonb', nullable: true })
  commercialProfile: CommercialProfile | null;

  // ---- Product Contract (product-model.ts; §5–§20) ----------------------
  // All nullable: legacy listings predate the contract and remain valid;
  // they honestly surface as "نامشخص"/"Unknown" until a new version is
  // published with a complete declaration (§39 decision 21).

  @Column({ name: 'product_type', type: 'varchar', length: 32, nullable: true })
  productType: ProductType | null;

  @Column({ name: 'build_tool', type: 'varchar', length: 32, nullable: true })
  buildTool: BuildTool | null;

  @Column({
    name: 'build_tool_detail',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  buildToolDetail: string | null;

  @Column({
    name: 'delivery_model',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  deliveryModel: DeliveryModel | null;

  @Column({
    name: 'execution_model',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  executionModel: ExecutionModel | null;

  @Column({
    name: 'hosting_responsibility',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  hostingResponsibility: HostingResponsibility | null;

  @Column({
    name: 'what_buyer_receives',
    type: 'jsonb',
    nullable: true,
  })
  whatBuyerReceives: string[] | null;

  @Column({
    name: 'what_buyer_does_not_receive',
    type: 'jsonb',
    nullable: true,
  })
  whatBuyerDoesNotReceive: string[] | null;

  @Column({ name: 'additional_costs', type: 'jsonb', nullable: true })
  additionalCosts: AdditionalCost[] | null;

  /** Server-derived from isFree/price — never accepted from the client. */
  @Column({ name: 'usage_model', type: 'varchar', length: 16, nullable: true })
  usageModel: UsageModel | null;

  @Column({
    name: 'support_owner',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  supportOwner: SupportOwner | null;

  @Column({ name: 'support_scope', type: 'text', nullable: true })
  supportScope: string | null;

  @Column({
    name: 'support_period',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  supportPeriod: string | null;

  // ---- Product Creation (Phase A2) — declarations -----------------------

  /** What infrastructure the buyer (or runner) needs (A2 §14). */
  @Column({ name: 'infrastructure_needs', type: 'text', nullable: true })
  infrastructureNeeds: string | null;

  /**
   * Explicit "the buyer needs nothing extra" declaration (A2 §13/§26):
   * distinguishes a deliberate "no requirements" from "not filled in yet".
   */
  @Column({ name: 'no_requirements', type: 'boolean', default: false })
  noRequirements: boolean;

  // ---- Product Creation (Phase A2) — draft workflow (creator-only) ------

  /** Wizard resume point (A2 §5/§30) — never shown to buyers. */
  @Column({ name: 'wizard_step', type: 'varchar', length: 24, nullable: true })
  wizardStep: string | null;

  /**
   * Optimistic-concurrency counter for the draft working copy (A2 §31/§45):
   * incremented on every save; a save carrying a stale revision is rejected
   * instead of silently overwriting newer content from another tab.
   */
  @Column({ name: 'draft_revision', type: 'integer', default: 0 })
  draftRevision: number;

  /** When the current review cycle was submitted (A2 §28 submission status). */
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AgentStatus,
    enumName: 'agent_status',
    default: AgentStatus.DRAFT,
  })
  status: AgentStatus;

  @Column({
    name: 'risk_level',
    type: 'enum',
    enum: AgentRiskLevel,
    enumName: 'agent_risk_level',
    default: AgentRiskLevel.LOW,
  })
  riskLevel: AgentRiskLevel;

  /** The agent version currently being sold — set when a version publishes. */
  @Column({ name: 'published_version_id', type: 'uuid', nullable: true })
  publishedVersionId: string | null;

  @ManyToOne(() => AgentVersion, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'published_version_id' })
  publishedVersion: AgentVersion | null;

  /**
   * Admin's changes-requested feedback for the CURRENT review cycle
   * (§8). Cleared when the agent is approved; version-cycle feedback
   * lives on the agent_versions row instead.
   */
  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'views', type: 'integer', default: 0 })
  views: number;

  @Column({ name: 'demo_clicks', type: 'integer', default: 0 })
  demoClicks: number;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  /** Phase A4 — atomic first-sale marker (set once, never cleared). */
  @Column({ name: 'first_sale_at', type: 'timestamptz', nullable: true })
  firstSaleAt: Date | null;

  /** Phase A4 — when the creator last took the listing offline. */
  @Column({ name: 'unpublished_at', type: 'timestamptz', nullable: true })
  unpublishedAt: Date | null;

  /**
   * A5 §19 — provenance of a duplicated / complementary draft (source +
   * mode) and the groups still awaiting re-confirmation. Null for ordinary
   * products.
   */
  @Column({ name: 'duplicate_meta', type: 'jsonb', nullable: true })
  duplicateMeta: DuplicateMeta | null;

  /**
   * Gap closure — release notes for the FIRST release. No version row exists
   * before the first publish, so the notes live here and are copied into
   * the published version by `publishInitialListing`.
   */
  @Column({ name: 'pending_changelog', type: 'jsonb', nullable: true })
  pendingChangelog: AgentChangelog | null;

  /**
   * Full-text search vector maintained by a trigger (name, descriptions,
   * capabilities, limitations). Never written from the application.
   */
  @Column({
    name: 'search_vector',
    type: 'tsvector',
    select: false,
    nullable: true,
  })
  searchVector: unknown;

  /** Normalized short text for typo-tolerant (trigram) matching. Trigger-maintained. */
  @Column({ name: 'search_text', type: 'text', select: false, nullable: true })
  searchText: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
