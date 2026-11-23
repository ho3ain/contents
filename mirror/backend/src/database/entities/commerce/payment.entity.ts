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

export enum PaymentStatus {
  INITIATED = 'initiated',
  PENDING = 'pending',
  SUCCESSFUL = 'successful',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

/**
 * A financial transaction for an order — deliberately independent of the
 * order row (PLAYBOOK 6.1). Gateway webhooks are the only trusted source of
 * success and are processed idempotently via the unique
 * (gateway, gateway_transaction_id) constraint (PLAYBOOK 6.8/9.24).
 */
@Entity({ name: 'payments' })
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_payments_order_id')
  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'gateway', type: 'varchar', length: 40 })
  gateway: string;

  @Column({
    name: 'gateway_transaction_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  gatewayTransactionId: string | null;

  @Column({
    name: 'amount',
    type: 'numeric',
    precision: 20,
    scale: 2,
  })
  amount: string;

  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'IRR' })
  currency: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status',
    default: PaymentStatus.INITIATED,
  })
  status: PaymentStatus;

  @Column({ name: 'provider_payload', type: 'jsonb', default: () => "'{}'" })
  providerPayload: Record<string, unknown>;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
