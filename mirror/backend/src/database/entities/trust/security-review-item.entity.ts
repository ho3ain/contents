import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SecurityReview } from './security-review.entity';

/**
 * A single checklist item outcome inside a security review. `item_key`
 * references the fixed checklist (e.g. `identity`, `demo`, `permissions`,
 * `data_handling`) defined in the security checklist constant.
 */
@Entity({ name: 'security_review_items' })
@Index(
  'uq_security_review_items_review_item',
  ['securityReviewId', 'itemKey'],
  { unique: true },
)
export class SecurityReviewItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_security_review_items_review_id')
  @Column({ name: 'security_review_id', type: 'uuid' })
  securityReviewId: string;

  @ManyToOne(() => SecurityReview, (review) => review.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'security_review_id' })
  securityReview: SecurityReview;

  @Column({ name: 'item_key', type: 'varchar', length: 64 })
  itemKey: string;

  @Column({ name: 'passed', type: 'boolean', nullable: true })
  passed: boolean | null;

  @Column({ name: 'note', type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
