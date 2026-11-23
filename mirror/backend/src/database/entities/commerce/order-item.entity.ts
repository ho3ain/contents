import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { Agent } from '../agents/agent.entity';
import { AgentVersion } from '../agents/agent-version.entity';
import type { CommercialProfile } from '../agents/product-model';

/**
 * Line item of an order. The *_snapshot columns denormalize the agent
 * exactly as it was at purchase time (name, slug, version, creator, price,
 * currency) so historical orders stay financially and factually accurate
 * even when the listing changes later (PLAYBOOK 9.8).
 */
@Entity({ name: 'order_items' })
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_order_items_order_id')
  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  @Column({ name: 'agent_version_id', type: 'uuid', nullable: true })
  agentVersionId: string | null;

  @ManyToOne(() => AgentVersion, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agent_version_id' })
  agentVersion: AgentVersion | null;

  // ---- Historical snapshot (written once, never mutated) ----
  @Column({ name: 'agent_name_snapshot', type: 'varchar', length: 160 })
  agentNameSnapshot: string;

  @Column({ name: 'agent_slug_snapshot', type: 'varchar', length: 140 })
  agentSlugSnapshot: string;

  @Column({ name: 'agent_version_snapshot', type: 'varchar', length: 32 })
  agentVersionSnapshot: string;

  /** Listing picture at purchase time; NULL for orders placed before it was captured. */
  @Column({
    name: 'agent_logo_url_snapshot',
    type: 'varchar',
    length: 1024,
    nullable: true,
  })
  agentLogoUrlSnapshot: string | null;

  @Column({ name: 'creator_id_snapshot', type: 'uuid', nullable: true })
  creatorIdSnapshot: string | null;

  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 20,
    scale: 2,
    default: 0,
  })
  unitPrice: string;

  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'IRR' })
  currencyCode: string;

  @Column({ name: 'quantity', type: 'smallint', default: 1 })
  quantity: number;

  @Column({
    name: 'total',
    type: 'numeric',
    precision: 20,
    scale: 2,
    default: 0,
  })
  total: string;

  @Column({ name: 'is_free', type: 'boolean', default: false })
  isFree: boolean;

  /**
   * Phase 1 immutable purchase-time commitment. This deliberately stores
   * only commercial terms, never a mutable/full agent document. Null is a
   * truthful legacy-order state.
   */
  @Column({ name: 'commercial_terms_snapshot', type: 'jsonb', nullable: true })
  commercialTermsSnapshot: CommercialProfile | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
