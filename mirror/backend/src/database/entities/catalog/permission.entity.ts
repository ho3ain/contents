import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Global permission taxonomy (PLAYBOOK 7.6) — the fixed, human-readable set
 * of access levels an agent can declare. Admin-managed reference data.
 */
@Entity({ name: 'permissions' })
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_permissions_code', { unique: true })
  @Column({ name: 'code', type: 'varchar', length: 64 })
  code: string;

  @Column({ name: 'label', type: 'varchar', length: 120 })
  label: string;

  @Column({ name: 'description', type: 'varchar', length: 400, nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
