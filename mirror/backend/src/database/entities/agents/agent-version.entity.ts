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
import { Agent } from './agent.entity';
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

export enum AgentVersionStatus {
  DRAFT = 'draft',
  IN_REVIEW = 'in_review',
  CHANGES_REQUESTED = 'changes_requested',
  /** Phase A3 — approved by review, waiting for the publish step. */
  APPROVED = 'approved',
  /** Phase A3 — this version was rejected (final for this version). */
  REJECTED = 'rejected',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated',
}

/**
 * Working-copy versioning (Creator Studio §5/§11): each meaningful release
 * of an agent records a MAJOR.MINOR version row. While an agent is live,
 * the creator's next version is edited as `draftContent` on a draft version
 * row — the live agent row (what buyers see) is never touched until an
 * admin approves the version, at which point the content is atomically
 * copied onto the agent row and snapshotted on the version. Buyers keep the
 * version they purchased (recorded on the entitlement).
 */
export interface AgentVersionContent {
  name: string;
  shortDescription: string;
  fullDescription: string;
  logoUrl: string | null;
  demoUrl: string | null;
  capabilities: Array<{ title: string; description?: string }>;
  limitations: string[];
  useCases: string[];
  targetAudience: string[];
  inputs: string[];
  outputs: string[];
  howItWorks: Array<{ title: string; description?: string }>;
  exampleInput: string | null;
  exampleOutput: string | null;
  usageGuide: string | null;
  price: string;
  currency: string;
  isFree: boolean;
  category: string | null;
  /** Taxonomy v2 — industry slugs (max MAX_AGENT_INDUSTRIES); optional for legacy content. */
  industries?: string[];
  permissions: Array<{
    code: string;
    reason: string | null;
    required: boolean;
  }>;
  integrations: Array<{ slug: string; purpose: string | null }>;
  requirements: Array<{
    type: string;
    description: string;
    required: boolean;
    /** Phase A2 (optional: content captured before A2 has none). */
    name?: string | null;
    reason?: string | null;
  }>;
  dataPolicy: AgentVersionDataPolicy | null;
  /**
   * Product Creation (Phase A2) — all optional so version content captured
   * before A2 stays valid; missing values read as empty.
   */
  problemStatement?: string;
  bestFor?: string[];
  notFor?: string[];
  infrastructureNeeds?: string | null;
  noRequirements?: boolean;
  pricingNote?: string | null;
  coverUrl?: string | null;
  screenshots?: string[];
  /** Buyer Discovery: optional demo video URL + creator search keywords. */
  demoVideoUrl?: string | null;
  keywords?: string[];
  /**
   * Product Contract dimensions (product-model.ts; §5–§20). All optional:
   * legacy content predates the contract and stays valid — readiness gates
   * them only at SUBMIT time for NEW submissions.
   */
  productType?: ProductType | null;
  /** Phase 1 commercial commitment; absent in historical version JSON. */
  commercialProfile?: CommercialProfile | null;
  /**
   * A5 §19 — groups copied from another product that the creator has not
   * re-confirmed yet (see DUPLICATE_CONFIRM_GROUPS). Each pending group is
   * a REQUIRED readiness item, so a duplicated draft can never be
   * submitted with an unverified price, runtime, data policy, etc.
   */
  confirmPending?: string[];
  buildTool?: BuildTool | null;
  buildToolDetail?: string | null;
  deliveryModel?: DeliveryModel | null;
  executionModel?: ExecutionModel | null;
  hostingResponsibility?: HostingResponsibility | null;
  whatBuyerReceives?: string[];
  whatBuyerDoesNotReceive?: string[];
  additionalCosts?: AdditionalCost[];
  /** Server-derived from isFree/price — never client input. */
  usageModel?: UsageModel;
  supportOwner?: SupportOwner | null;
  supportScope?: string | null;
  supportPeriod?: string | null;
}

export interface AgentVersionDataPolicy {
  storesUserData: boolean;
  retentionDays: number | null;
  processingLocation: string | null;
  sharesWithThirdParties: boolean;
  thirdParties: string[];
  handlesSensitiveData: boolean;
  sensitiveDataCategories: string[];
  dataAccessed: string[];
  inputsDescription: string;
  outputsDescription: string;
  /** Phase A2: which user data is stored (optional for pre-A2 content). */
  storedData?: string[];
}
/** Buyer-facing release notes of one version (all parts optional). */
export interface AgentChangelog {
  whatsNew: string;
  major: string[];
  improvements: string[];
  fixes: string[];
  /**
   * Sprint 2 — what the buyer must DO after updating (migrate a setting,
   * re-connect an account…). Optional; absent on older changelogs.
   */
  actionRequired?: string;
}

@Entity({ name: 'agent_versions' })
@Index('idx_agent_versions_agent_id', ['agentId'])
@Index('uq_agent_versions_agent_version', ['agentId', 'versionNumber'], {
  unique: true,
})
export class AgentVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  @Column({ name: 'version_number', type: 'varchar', length: 16 })
  versionNumber: string;

  @Column({ name: 'change_summary', type: 'text', nullable: true })
  changeSummary: string | null;

  /**
   * Creator's working copy for the NEXT version of a published agent
   * (null on published/deprecated history rows). The live agent row stays
   * untouched while this draft is edited or awaits review.
   */
  @Column({ name: 'draft_content', type: 'jsonb', nullable: true })
  draftContent: AgentVersionContent | null;

  /** Immutable content snapshot captured when this version published. */
  @Column({ name: 'snapshot', type: 'jsonb', nullable: true })
  snapshot: AgentVersionContent | null;

  /**
   * Gap closure — buyer-facing release notes. Written by the creator with
   * the version, reviewed with it, locked for the creator once published
   * (admin may still correct it). Distinct from `changeSummary` /
   * `reviewNote`, which are review-internal and never public.
   */
  @Column({ type: 'jsonb', nullable: true })
  changelog: AgentChangelog | null;

  /** Admin feedback when the version was returned for changes. */
  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AgentVersionStatus,
    enumName: 'agent_version_status',
    default: AgentVersionStatus.DRAFT,
  })
  status: AgentVersionStatus;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
