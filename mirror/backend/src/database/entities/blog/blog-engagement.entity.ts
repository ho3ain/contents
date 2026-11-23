import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../identity/user.entity';
import { BlogPost } from './blog-post.entity';

/**
 * Reader engagement on blog articles (2026-10-14): star ratings, threaded
 * comments (one reply level), comment likes, reader reports and the
 * moderation block list. Signed-in readers only; comments publish
 * immediately (post-moderation, same policy as product reviews) and the
 * editorial team hides/removes from the admin queue.
 */

export const BLOG_RATING_MIN = 1;
export const BLOG_RATING_MAX = 5;
export const BLOG_COMMENT_MIN_LENGTH = 2;
export const BLOG_COMMENT_MAX_LENGTH = 2000;

export const BLOG_COMMENT_STATUSES = [
  'published',
  'hidden',
  'removed',
] as const;
/** `hidden` = withdrawn by its author (reversible); `removed` = moderation (terminal for the author). */
export type BlogCommentStatus = (typeof BLOG_COMMENT_STATUSES)[number];

export const BLOG_COMMENT_REPORT_REASONS = [
  'spam',
  'abuse',
  'off_topic',
  'other',
] as const;
export type BlogCommentReportReason =
  (typeof BLOG_COMMENT_REPORT_REASONS)[number];

export const BLOG_COMMENT_REPORT_STATUSES = [
  'open',
  'resolved',
  'dismissed',
] as const;
export type BlogCommentReportStatus =
  (typeof BLOG_COMMENT_REPORT_STATUSES)[number];

/** One rating per reader per article; later changes update the same row. */
@Entity({ name: 'blog_post_ratings' })
@Index('uq_blog_post_ratings_post_user', ['postId', 'userId'], { unique: true })
export class BlogPostRating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ManyToOne(() => BlogPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: BlogPost;

  @Index('idx_blog_post_ratings_user')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'smallint' })
  rating: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity({ name: 'blog_comments' })
@Index('idx_blog_comments_post_status_created', [
  'postId',
  'status',
  'createdAt',
])
@Index('idx_blog_comments_parent', ['parentId'])
@Index('idx_blog_comments_user', ['userId'])
export class BlogComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ManyToOne(() => BlogPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: BlogPost;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** Top-level comments have no parent; replies point at a top-level comment (depth 1). */
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @ManyToOne(() => BlogComment, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: BlogComment | null;

  @Column({ type: 'text' })
  body: string;

  @Column({
    type: 'enum',
    enum: BLOG_COMMENT_STATUSES,
    enumName: 'blog_comment_status',
    default: 'published',
  })
  status: BlogCommentStatus;

  @Column({ name: 'like_count', type: 'int', default: 0 })
  likeCount: number;

  /** Published replies under a top-level comment (0 for replies). */
  @Column({ name: 'reply_count', type: 'int', default: 0 })
  replyCount: number;

  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  /** Moderation (status = removed): who, when, why — shown to the author only. */
  @Column({ name: 'removed_by', type: 'uuid', nullable: true })
  removedBy: string | null;

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt: Date | null;

  @Column({
    name: 'removed_reason',
    type: 'varchar',
    length: 240,
    nullable: true,
  })
  removedReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity({ name: 'blog_comment_likes' })
@Index('idx_blog_comment_likes_user', ['userId'])
export class BlogCommentLike {
  @PrimaryColumn({ name: 'comment_id', type: 'uuid' })
  commentId: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => BlogComment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comment_id' })
  comment: BlogComment;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

/** A reader flags a comment; one report per reader per comment. */
@Entity({ name: 'blog_comment_reports' })
@Index(
  'uq_blog_comment_reports_comment_reporter',
  ['commentId', 'reporterId'],
  {
    unique: true,
  },
)
@Index('idx_blog_comment_reports_status', ['status', 'createdAt'])
export class BlogCommentReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'comment_id', type: 'uuid' })
  commentId: string;

  @ManyToOne(() => BlogComment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comment_id' })
  comment: BlogComment;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;

  @Column({
    type: 'enum',
    enum: BLOG_COMMENT_REPORT_REASONS,
    enumName: 'blog_comment_report_reason',
  })
  reason: BlogCommentReportReason;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @Column({
    type: 'enum',
    enum: BLOG_COMMENT_REPORT_STATUSES,
    enumName: 'blog_comment_report_status',
    default: 'open',
  })
  status: BlogCommentReportStatus;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

/** Readers the editorial team barred from commenting (ratings stay allowed). */
@Entity({ name: 'blog_comment_bans' })
export class BlogCommentBan {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ type: 'varchar', length: 240, nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
