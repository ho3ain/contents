import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Agent } from './agent.entity';

export const AGENT_REQUIREMENT_TYPES = [
  'api_key',
  'external_service',
  'infrastructure',
  'model_access',
  'license',
  'other',
] as const;

export type AgentRequirementType = (typeof AGENT_REQUIREMENT_TYPES)[number];

/**
 * What the buyer must provide or have in place to actually run the agent
 * (the marketplace lists agents, it does not host them).
 */
@Entity({ name: 'agent_requirements' })
@Index('idx_agent_requirements_agent_id', ['agentId'])
export class AgentRequirement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  @Column({ name: 'type', type: 'varchar', length: 32 })
  type: AgentRequirementType;

  /** Short requirement name, e.g. "OpenAI API key" (A2 §13). */
  @Column({ name: 'name', type: 'varchar', length: 120, nullable: true })
  name: string | null;

  @Column({ name: 'description', type: 'text' })
  description: string;

  /** Why the buyer needs it (A2 §13). */
  @Column({ name: 'reason', type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @Column({ name: 'required', type: 'boolean', default: true })
  required: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
