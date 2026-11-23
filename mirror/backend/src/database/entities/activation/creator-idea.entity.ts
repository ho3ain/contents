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
import { CreatorProfile } from '../identity/creator-profile.entity';

/**
 * Phase C3 — a product idea the creator worked out with the guided flow
 * (spec §8–§10).
 *
 * A DRAFT holds the creator's raw answers; a SELECTED idea is one they chose.
 * The answers are kept because the idea is a function of them: a creator who
 * comes back and says "that wasn't right" needs the questions editable, and
 * re-asking six questions because we threw them away would be a dead end —
 * exactly what C3 §3 forbids.
 *
 * Note there is deliberately NO status column beyond `selected_at`. The
 * "which stage am I in" question is answered by the derived activation
 * machine, not stored here, so this table can never disagree with it.
 */
@Entity({ name: 'creator_ideas' })
@Index('idx_creator_ideas_user_created', ['userId', 'createdAt'])
@Index('idx_creator_ideas_user_selected', ['userId', 'selectedAt'])
export class CreatorIdea {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'creator_profile_id', type: 'uuid', nullable: true })
  creatorProfileId: string | null;

  @ManyToOne(() => CreatorProfile, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'creator_profile_id' })
  creatorProfile: CreatorProfile | null;

  @Column({ name: 'title', type: 'varchar', length: 160 })
  title: string;

  /** The problem this idea solves, in the creator's own framing. */
  @Column({ name: 'problem', type: 'text' })
  problem: string;

  @Column({
    name: 'target_audience',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  targetAudience: string[];

  @Column({ name: 'use_cases', type: 'jsonb', default: () => "'[]'::jsonb" })
  useCases: string[];

  /**
   * Why we think this is worth building. C3 §9 is explicit that we must never
   * promise a sale, so this text is about FIT, never about demand being
   * guaranteed.
   */
  @Column({ name: 'rationale', type: 'text' })
  rationale: string;

  /** The creator's raw guided-flow answers, preserved. */
  @Column({ name: 'answers', type: 'jsonb', default: () => "'{}'::jsonb" })
  /**
   * Stored as a loose record rather than the guided-flow shape on purpose:
   * these are the creator's own words, and the question set is expected to
   * grow. Pinning the column to a fixed interface would mean a migration the
   * first time a question is added.
   */
  answers: Record<string, any>;

  @Column({ name: 'selected_at', type: 'timestamptz', nullable: true })
  selectedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
