import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Catalog of known external services an agent can integrate with. Admin-
 * managed reference data used to keep agent listings consistent and
 * filterable.
 */
@Entity({ name: 'integrations' })
export class Integration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_integrations_slug', { unique: true })
  @Column({ name: 'slug', type: 'varchar', length: 80 })
  slug: string;

  @Index('uq_integrations_name', { unique: true })
  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'website_url', type: 'text', nullable: true })
  websiteUrl: string | null;

  @Column({ name: 'description', type: 'varchar', length: 300, nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
