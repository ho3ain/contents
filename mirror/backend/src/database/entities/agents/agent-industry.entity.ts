import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Agent } from './agent.entity';
import { Industry } from '../catalog/industry.entity';

@Entity({ name: 'agent_industries' })
export class AgentIndustry {
  @PrimaryColumn({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  @PrimaryColumn({ name: 'industry_id', type: 'uuid' })
  industryId: string;

  @ManyToOne(() => Industry, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'industry_id' })
  industry: Industry;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
