import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RuntimeRegistration } from './runtime-registration.entity';

/** Closed least-privilege scopes for a Runtime's own control-plane calls. */
export const RUNTIME_CREDENTIAL_SCOPES = [
  'health:write',
  // Phase 4: closed Runtime-to-control-plane consumption reporting. This is
  // never a buyer/payment credential and cannot mutate balances or payouts.
  'usage:write',
] as const;
export type RuntimeCredentialScope = (typeof RUNTIME_CREDENTIAL_SCOPES)[number];

/**
 * Opaque per-Runtime identity credential. Only bcrypt `secretHash` is stored;
 * its plaintext companion is returned once at issue/rotation and never audited.
 */
@Entity({ name: 'runtime_credentials' })
@Index('idx_runtime_credentials_runtime', ['runtimeId'])
@Index('idx_runtime_credentials_expiry', ['expiresAt'])
export class RuntimeCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'runtime_id', type: 'uuid' })
  runtimeId: string;

  @ManyToOne(() => RuntimeRegistration, (runtime) => runtime.credentials, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'runtime_id' })
  runtime: RuntimeRegistration;

  @Column({ name: 'secret_hash', type: 'varchar', length: 100 })
  secretHash: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  scopes: RuntimeCredentialScope[];

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'rotated_from_id', type: 'uuid', nullable: true })
  rotatedFromId: string | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
