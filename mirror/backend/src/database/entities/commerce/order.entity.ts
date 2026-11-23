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
import { OrderItem } from './order-item.entity';

export enum OrderStatus {
  CREATED = 'created',
  PENDING_PAYMENT = 'pending_payment',
  PAID = 'paid',
  FULFILLED = 'fulfilled',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

/**
 * A purchase. Order and payment are deliberately separate (PLAYBOOK 6.1):
 * the order tracks what was bought and delivered, the payment tracks the
 * money movement. Order totals are maintained in lock-step with items.
 */
@Entity({ name: 'orders' })
@Index('idx_orders_buyer_id', ['buyerId'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'buyer_id', type: 'uuid' })
  buyerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyer_id' })
  buyer: User;

  @Column({
    name: 'status',
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status',
    default: OrderStatus.CREATED,
  })
  status: OrderStatus;

  @Column({
    name: 'amount',
    type: 'numeric',
    precision: 20,
    scale: 2,
    default: 0,
  })
  amount: string;

  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'IRR' })
  currency: string;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'fulfilled_at', type: 'timestamptz', nullable: true })
  fulfilledAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'refunded_at', type: 'timestamptz', nullable: true })
  refundedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
