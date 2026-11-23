import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Agent } from './agent.entity';
import { Category } from '../catalog/category.entity';

/**
 * Many-to-many join between agents and categories. The MVP keeps listings in
 * a single primary category but the join table already supports growth into
 * multi-category tagging.
 */
@Entity({ name: 'agent_categories' })
export class AgentCategory {
  @PrimaryColumn({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  @PrimaryColumn({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
