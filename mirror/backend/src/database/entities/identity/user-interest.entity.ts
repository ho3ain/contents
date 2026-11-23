import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';
import { Category } from '../catalog/category.entity';

/**
 * User interest in a marketplace category (AUTH upgrade — onboarding).
 *
 * Reuses the EXISTING category taxonomy (no parallel interest taxonomy):
 * onboarding "what are you interested in?" maps directly onto marketplace
 * categories, so interests stay useful for recommendations/discovery and
 * never drift from the catalog.
 */
@Entity({ name: 'user_interests' })
@Unique('uq_user_interests_user_category', ['userId', 'categoryId'])
export class UserInterest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('ix_user_interests_user')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Index('ix_user_interests_category')
  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: Category;
}
