import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../identity/user.entity';
import { Agent } from '../agents/agent.entity';

/**
 * Gap closure — a buyer saved a product ("علاقه‌مندی"). UNIQUE (user, agent)
 * makes adding idempotent; removing deletes the row. The count per product
 * is private to its creator (never used for ranking).
 */
@Entity({ name: 'agent_favorites' })
@Unique('UQ_agent_favorites_user_agent', ['userId', 'agentId'])
@Index('IDX_agent_favorites_agent_time', ['agentId', 'createdAt'])
export class AgentFavorite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
