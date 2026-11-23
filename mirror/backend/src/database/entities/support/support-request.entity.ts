import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../identity/user.entity';
import { CreatorProfile } from '../identity/creator-profile.entity';
import { Agent } from '../agents/agent.entity';
import { Order } from '../commerce/order.entity';
import { SupportMessage } from './support-message.entity';
import { SupportDestination, SupportStatus } from './support-enums';

/**
 * A minimal support request. One conversation thread is attached via the
 * `messages` relation. Destination is either a specific Creator (for Agent
 * questions) or MESH Support (for purchase/account/complaint issues).
 */
@Entity({ name: 'support_requests' })
export class SupportRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_support_requests_requester_id')
  @Column({ name: 'requester_id', type: 'uuid' })
  requesterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_id' })
  requester: User;

  @Column({ name: 'destination_type', type: 'varchar', length: 16 })
  destinationType: SupportDestination;

  @Index('idx_support_requests_creator_id')
  @Column({ name: 'creator_id', type: 'uuid', nullable: true })
  creatorId: string | null;

  @ManyToOne(() => CreatorProfile, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'creator_id' })
  creator: CreatorProfile | null;

  @Index('idx_support_requests_agent_id')
  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId: string | null;

  @ManyToOne(() => Agent, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent | null;

  @Index('idx_support_requests_order_id')
  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @ManyToOne(() => Order, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'order_id' })
  order: Order | null;

  /** Sprint 2 — product / setup / access / payment / other (nullable: old rows). */
  @Column({ name: 'category', type: 'varchar', length: 24, nullable: true })
  category: string | null;

  @Column({ name: 'subject', type: 'varchar', length: 200 })
  subject: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 24,
    default: SupportStatus.OPEN,
  })
  status: SupportStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @OneToMany(() => SupportMessage, (message) => message.request)
  messages: SupportMessage[];
}
