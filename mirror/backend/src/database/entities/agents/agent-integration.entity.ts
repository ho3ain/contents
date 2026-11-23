import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Agent } from './agent.entity';
import { Integration } from '../catalog/integration.entity';

@Entity({ name: 'agent_integrations' })
export class AgentIntegration {
  @PrimaryColumn({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  @PrimaryColumn({ name: 'integration_id', type: 'uuid' })
  integrationId: string;

  @ManyToOne(() => Integration, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'integration_id' })
  integration: Integration;

  @Column({ name: 'purpose', type: 'varchar', length: 300, nullable: true })
  purpose: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
