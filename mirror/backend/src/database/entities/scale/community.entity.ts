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
import { User } from '../identity/user.entity';

/**
 * Phase C5 §27, §28, §30 — creator community.
 *
 * Owner decision (C5 §55): build a REAL, small community, not an
 * integration placeholder. The four tables below are the whole of it —
 * membership, posts, comments, reactions — plus a category enum on the post.
 *
 * It is scoped to creator collaboration on purpose. MESH is a marketplace, not
 * a social network, and the spec's own list (§26) is help, education,
 * feedback, product ideas and success stories. A general-purpose forum was not
 * asked for and would be a different product.
 *
 * The provider point (§28) is `post.category`: swapping the storage for
 * Discourse later means re-implementing this module against that API, not
 * rewriting the rest of the system, because nothing outside `community/`
 * touches these tables.
 */

export const COMMUNITY_CATEGORIES = [
  'getting_started',
  'product_ideas',
  'building',
  'launch',
  'marketing',
  'sales',
  'automation',
  'ai',
  'success_stories',
  'help',
  'announcements',
] as const;

export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number];

const COMMUNITY_CATEGORY = Object.fromEntries(
  COMMUNITY_CATEGORIES.map((c) => [c, c]),
) as Record<CommunityCategory, CommunityCategory>;

@Entity({ name: 'community_memberships' })
@Index('uq_community_memberships_profile', ['creatorProfileId'], {
  unique: true,
})
@Index('idx_community_memberships_status', ['status'])
export class CommunityMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'creator_profile_id', type: 'uuid' })
  creatorProfileId: string;

  @ManyToOne(() => CreatorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creator_profile_id' })
  creator: CreatorProfile;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** §27 — an invitation is not a membership until it is accepted. */
  @Column({ type: 'varchar', length: 16, default: 'invited' })
  status: 'invited' | 'active' | 'left';

  @Column({ name: 'invited_at', type: 'timestamptz', default: () => 'now()' })
  invitedAt: Date;

  @Column({ name: 'joined_at', type: 'timestamptz', nullable: true })
  joinedAt: Date | null;

  /** §32 "returning creators" — the last time they were actually seen. */
  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @Column({ name: 'post_count', type: 'integer', default: 0 })
  postCount: number;

  @Column({ name: 'comment_count', type: 'integer', default: 0 })
  commentCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity({ name: 'community_posts' })
@Index('idx_community_posts_category', ['category'])
@Index('idx_community_posts_pinned', ['pinned'])
@Index('idx_community_posts_created', ['createdAt'])
@Index('idx_community_posts_author', ['authorId'])
export class CommunityPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ name: 'author_profile_id', type: 'uuid', nullable: true })
  authorProfileId: string | null;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({
    type: 'enum',
    enum: COMMUNITY_CATEGORY,
    enumName: 'community_category',
    default: COMMUNITY_CATEGORY.getting_started,
  })
  category: CommunityCategory;

  /** §29 — pinned posts float above the feed. */
  @Column({ type: 'boolean', default: false })
  pinned: boolean;

  @Column({ type: 'boolean', default: false })
  announcement: boolean;

  /** §29 — moderation. A hidden post disappears from every read path. */
  @Column({ type: 'boolean', default: false })
  hidden: boolean;

  @Column({ name: 'comment_count', type: 'integer', default: 0 })
  commentCount: number;

  @Column({ name: 'reaction_count', type: 'integer', default: 0 })
  reactionCount: number;

  @Column({
    name: 'last_activity_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  lastActivityAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity({ name: 'community_comments' })
@Index('idx_community_comments_post', ['postId'])
@Index('idx_community_comments_author', ['authorId'])
export class CommunityComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ManyToOne(() => CommunityPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: CommunityPost;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ name: 'author_profile_id', type: 'uuid', nullable: true })
  authorProfileId: string | null;

  @Column({ type: 'text' })
  body: string;

  /**
   * §29 — one level of threading. A full parent/child tree would be a
   * different forum; one reply level covers "help" threads, which is what
   * the category is for.
   */
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @Column({ name: 'is_answer', type: 'boolean', default: false })
  isAnswer: boolean;

  @Column({ type: 'boolean', default: false })
  hidden: boolean;

  @Column({ name: 'reaction_count', type: 'integer', default: 0 })
  reactionCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity({ name: 'community_reactions' })
@Index('uq_community_reactions_post', ['postId', 'actorId'], { unique: true })
@Index('uq_community_reactions_comment', ['commentId', 'actorId'], {
  unique: true,
})
export class CommunityReaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id', type: 'uuid', nullable: true })
  postId: string | null;

  @Column({ name: 'comment_id', type: 'uuid', nullable: true })
  commentId: string | null;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  actor: User;

  @Column({ type: 'varchar', length: 24, default: 'like' })
  kind: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
