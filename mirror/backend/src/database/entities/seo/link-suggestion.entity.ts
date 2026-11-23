import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { SeoContentType } from './content-seo.entity';

export const SUGGESTION_REASONS = [
  'shared_keyword',
  'same_category',
  'orphan_target',
  'title_overlap',
] as const;
export type SuggestionReason = (typeof SUGGESTION_REASONS)[number];

export const SUGGESTION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export interface SuggestionEvidence {
  /** Keywords/words shared between source and target (as typed in source). */
  terms?: string[];
  /** Category id/name when the reason is `same_category`. */
  category?: { id: string; name: string };
  /** Inbound link count of the target at generation time. */
  inbound?: number;
  /** Anchor the server would link if approved (first occurrence in body). */
  anchor?: string | null;
}

/**
 * A proposed internal link, computed from real data (shared keywords, same
 * category, orphan targets, title overlap) — never from a paid/AI service.
 * Approving one edits the source content on the server; rejecting hides it.
 */
@Entity({ name: 'link_suggestions' })
@Index(
  'uq_link_suggestions_pair',
  ['sourceType', 'sourceId', 'targetType', 'targetId', 'reason'],
  { unique: true },
)
@Index('idx_link_suggestions_status', ['status'])
@Index('idx_link_suggestions_source', ['sourceType', 'sourceId'])
export class LinkSuggestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source_type', type: 'varchar', length: 16 })
  sourceType: SeoContentType;

  @Column({ name: 'source_id', type: 'uuid' })
  sourceId: string;

  @Column({ name: 'target_type', type: 'varchar', length: 16 })
  targetType: SeoContentType;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @Column({ type: 'varchar', length: 32 })
  reason: SuggestionReason;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  evidence: SuggestionEvidence;

  /** 0–100, explained by `evidence`; used for ordering only. */
  @Column({ type: 'smallint', default: 0 })
  score: number;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: SuggestionStatus;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
