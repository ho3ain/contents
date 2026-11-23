import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Blog platform — free editorial tag (flat). `slug` is unique; merging keeps one row. */
@Entity({ name: 'blog_tags' })
@Index('uq_blog_tags_slug', ['slug'], { unique: true })
export class BlogTag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 110 })
  slug: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
