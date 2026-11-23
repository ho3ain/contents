import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Review } from './review.entity';
import { User } from '../identity/user.entity';

/**
 * A single public reply to a review, written by the agent's creator
 * (PLAYBOOK 9.7).
 */
@Entity({ name: 'review_replies' })
export class ReviewReply {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_review_replies_review_id', { unique: true })
  @Column({ name: 'review_id', type: 'uuid' })
  reviewId: string;

  @OneToOne(() => Review, (review) => review.reply, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'review_id' })
  review: Review;

  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'creator_id' })
  creator: User;

  @Column({ name: 'body', type: 'text' })
  body: string;

  /**
   * A5 §12 — "fixed in version X": set only to a version that really was
   * published for this product (validated server-side).
   */
  @Column({
    name: 'resolved_in_version',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  resolvedInVersion: string | null;

  /** Public "edited" marker — set when the creator edits the reply. */
  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
