import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../identity/user.entity';
import { UserRole } from '../identity/user.entity';
import { SupportRequest } from './support-request.entity';

/** A single immutable message in a support conversation thread. */
@Entity({ name: 'support_messages' })
export class SupportMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_support_messages_request_id')
  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @ManyToOne(() => SupportRequest, (request) => request.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'request_id' })
  request: SupportRequest;

  @Column({ name: 'sender_id', type: 'uuid' })
  senderId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  /** Snapshot of the sender's role at message time (buyer/creator/admin). */
  @Column({ name: 'sender_role', type: 'varchar', length: 16 })
  senderRole: UserRole;

  @Column({ name: 'body', type: 'text' })
  body: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
