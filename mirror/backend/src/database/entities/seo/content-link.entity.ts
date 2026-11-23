import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { SeoContentType } from './content-seo.entity';

export const LINK_TARGET_TYPES = [
  'post',
  'agent',
  'route',
  'external',
] as const;
export type LinkTargetType = (typeof LINK_TARGET_TYPES)[number];

export const LINK_STATUSES = ['ok', 'broken', 'unpublished'] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];

/**
 * A real hyperlink found in stored content (rebuilt from the block tree on
 * every save and by the rescan job). This is the ONLY source for the graph's
 * "internal link" edges, orphan detection and broken-link reports — never
 * guessed from text similarity.
 */
@Entity({ name: 'content_links' })
@Index('idx_content_links_source', ['sourceType', 'sourceId'])
@Index('idx_content_links_target', ['targetType', 'targetId'])
@Index('idx_content_links_status', ['status'])
export class ContentLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source_type', type: 'varchar', length: 16 })
  sourceType: SeoContentType;

  @Column({ name: 'source_id', type: 'uuid' })
  sourceId: string;

  @Column({ name: 'target_type', type: 'varchar', length: 16 })
  targetType: LinkTargetType;

  /** Resolved content id for `post`/`agent` targets, null otherwise. */
  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId: string | null;

  @Column({ type: 'text' })
  href: string;

  @Column({ type: 'varchar', length: 300, default: '' })
  anchor: string;

  /** Block index inside the body (0-based) — where the "go to" button lands. */
  @Column({ type: 'int', default: 0 })
  position: number;

  @Column({ type: 'varchar', length: 16, default: 'ok' })
  status: LinkStatus;

  @Column({ name: 'checked_at', type: 'timestamptz', nullable: true })
  checkedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
