import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { Payment } from './payment.entity';
import { User } from '../identity/user.entity';

export enum RefundStatus {
  REQUESTED = 'requested',
  /** Sprint 2 — an admin opened the request (buyer sees «under review»). */
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  PROCESSED = 'processed',
  REJECTED = 'rejected',
}

/**
 * Refund requests are manually reviewed by admins in the MVP (PLAYBOOK
 * 6.10). Processing a refund reverses the payment, marks the order refunded
 * and revokes the entitlement inside one transaction.
 */
@Entity({ name: 'refunds' })
@Index('idx_refunds_order_id', ['orderId'])
export class Refund {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId: string | null;

  @ManyToOne(() => Payment, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'payment_id' })
  payment: Payment | null;

  @Column({
    name: 'amount',
    type: 'numeric',
    precision: 20,
    scale: 2,
  })
  amount: string;

  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'IRR' })
  currency: string;

  @Column({ name: 'reason', type: 'text' })
  reason: string;

  @Column({ name: 'requested_by', type: 'uuid' })
  requestedBy: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requested_by' })
  requester: User;

  @Column({
    name: 'status',
    type: 'enum',
    enum: RefundStatus,
    enumName: 'refund_status',
    default: RefundStatus.REQUESTED,
  })
  status: RefundStatus;

  @Index('idx_refunds_reviewed_by')
  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer: User | null;

  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote: string | null;

  @Column({ name: 'review_started_at', type: 'timestamptz', nullable: true })
  reviewStartedAt: Date | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
