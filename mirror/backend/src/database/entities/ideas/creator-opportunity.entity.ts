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
import type { BuildTool } from '../agents/product-model';
import { User } from '../identity/user.entity';

export type CreatorOpportunityStatus = 'draft' | 'published' | 'archived';

/** Admin-authored, explicitly targeted opportunity; distinct from CreatorIdea. */
@Entity({ name: 'creator_opportunities' })
@Index('idx_creator_opportunities_status_published', ['status', 'publishedAt'])
@Index('idx_creator_opportunities_created', ['createdAt'])
export class CreatorOpportunity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'title', type: 'varchar', length: 140 })
  title: string;

  @Column({ name: 'summary', type: 'varchar', length: 1000 })
  summary: string;

  @Column({ name: 'category_slug', type: 'varchar', length: 110 })
  categorySlug: string;

  @Column({ name: 'use_cases', type: 'jsonb', default: () => "'[]'::jsonb" })
  useCases: string[];

  @Column({
    name: 'target_audience',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  targetAudience: string[];

  @Column({ name: 'problem_statement', type: 'text', nullable: true })
  problemStatement: string | null;

  /** Only values accepted by the existing Agent Wizard's buildTool field. */
  @Column({ name: 'build_tool', type: 'varchar', length: 32, nullable: true })
  buildTool: BuildTool | null;

  @Column({
    name: 'build_tool_detail',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  buildToolDetail: string | null;

  /** Explicit, validated profile criteria; empty criteria are never published. */
  @Column({ name: 'targeting', type: 'jsonb' })
  targeting: {
    activityAreas?: string[];
    expertise?: string[];
    tools?: string[];
    experienceLevels?: Array<'beginner' | 'intermediate' | 'professional'>;
    productReadiness?: Array<'ready' | 'idea' | 'no_idea'>;
  };

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'draft' })
  status: CreatorOpportunityStatus;

  @Column({ name: 'created_by_admin_id', type: 'uuid' })
  createdByAdminId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_admin_id' })
  createdByAdmin: User;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
