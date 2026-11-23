import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CreatorProfile } from '../identity/creator-profile.entity';

/** A5 §27 — creator-wide sales milestones (first, 10, 25, 50, 100). */
export const SALES_MILESTONES = [1, 10, 25, 50, 100] as const;
export type SalesMilestone = (typeof SALES_MILESTONES)[number];
export const milestoneKey = (count: number) => `sales_${count}`;

/**
 * One row per creator + milestone. The UNIQUE (creator_id, key) constraint
 * makes reaching a milestone exactly-once: a replayed webhook or two
 * concurrent sales can never produce a second "10 sales" moment.
 */
@Entity({ name: 'creator_milestones' })
@Unique('UQ_creator_milestones_creator_key', ['creatorId', 'key'])
export class CreatorMilestone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;

  @ManyToOne(() => CreatorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creator_id' })
  creator: CreatorProfile;

  @Column({ type: 'varchar', length: 32 })
  key: string;

  @Column({ name: 'achieved_at', type: 'timestamptz', default: () => 'now()' })
  achievedAt: Date;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
