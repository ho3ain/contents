import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * A persisted login session. Only the SHA-256 hash of the refresh token is
 * stored; sessions rotate on every refresh and are revoked on logout. A
 * revoked token being reused revokes every session of that user (theft
 * detection).
 */
@Entity({ name: 'user_sessions' })
export class UserSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_user_sessions_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index('uq_user_sessions_refresh_token_hash', { unique: true })
  @Column({ name: 'refresh_token_hash', type: 'char', length: 64 })
  refreshTokenHash: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'ip', type: 'inet', nullable: true })
  ip: string | null;

  /**
   * Identifies the login this row belongs to across refresh rotations. The
   * access token carries it as `sid`; a family with no active row is dead.
   */
  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /**
   * Set ONLY when this session was superseded by a refresh rotation — never
   * by logout, suspension or password reset. Distinguishes a benign
   * rapid-reload race (a new document's bootstrap replaying the just-rotated
   * cookie) from genuine reuse of a revoked token. See AuthSessionsService.
   */
  @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true })
  rotatedAt: Date | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
