import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Agent } from './agent.entity';

/**
 * Structured data-handling disclosure (PLAYBOOK 7.5) — one row per agent
 * answering what the agent does with user data, where it is processed, who
 * it is shared with and how long it is retained. Shown to buyers verbatim
 * alongside permissions.
 */
@Entity({ name: 'agent_data_policies' })
export class AgentDataPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_agent_data_policies_agent_id', { unique: true })
  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @OneToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  @Column({ name: 'stores_user_data', type: 'boolean', default: false })
  storesUserData: boolean;

  @Column({ name: 'retention_days', type: 'smallint', nullable: true })
  retentionDays: number | null;

  @Column({
    name: 'processing_location',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  processingLocation: string | null;

  @Column({
    name: 'shares_with_third_parties',
    type: 'boolean',
    default: false,
  })
  sharesWithThirdParties: boolean;

  @Column({ name: 'third_parties', type: 'jsonb', default: () => "'[]'" })
  thirdParties: string[];

  @Column({ name: 'handles_sensitive_data', type: 'boolean', default: false })
  handlesSensitiveData: boolean;

  @Column({
    name: 'sensitive_data_categories',
    type: 'jsonb',
    default: () => "'[]'",
  })
  sensitiveDataCategories: string[];

  @Column({ name: 'data_accessed', type: 'jsonb', default: () => "'[]'" })
  dataAccessed: string[];

  /** Which user data is STORED when storesUserData is true (A2 §15). */
  @Column({ name: 'stored_data', type: 'jsonb', default: () => "'[]'" })
  storedData: string[];

  @Column({ name: 'inputs_description', type: 'text', default: '' })
  inputsDescription: string;

  @Column({ name: 'outputs_description', type: 'text', default: '' })
  outputsDescription: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
