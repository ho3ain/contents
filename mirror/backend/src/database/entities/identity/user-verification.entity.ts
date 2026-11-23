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

export enum UserVerificationType {
  EMAIL = 'email',
  PHONE = 'phone',
  PASSWORD_RESET = 'password_reset',
}

/**
 * One-time verification records: email confirmation codes, phone codes and
 * password-reset tokens. Only hashes are stored; every record expires.
 */
@Entity({ name: 'user_verifications' })
export class UserVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_user_verifications_user_type')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    name: 'type',
    type: 'enum',
    enum: UserVerificationType,
    enumName: 'user_verification_type',
  })
  type: UserVerificationType;

  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'attempts', type: 'smallint', default: 0 })
  attempts: number;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
