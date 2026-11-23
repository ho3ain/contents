import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Agent } from './agent.entity';
import { Permission } from '../catalog/permission.entity';

/**
 * Declared access levels an agent requires, each with a creator-supplied
 * justification — the heart of the security disclosure buyers see before
 * purchase (PLAYBOOK 7.6/7.8).
 */
@Entity({ name: 'agent_permissions' })
export class AgentPermission {
  @PrimaryColumn({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => Agent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;

  @PrimaryColumn({ name: 'permission_id', type: 'uuid' })
  permissionId: string;

  @ManyToOne(() => Permission, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'permission_id' })
  permission: Permission;

  @Column({ name: 'reason', type: 'varchar', length: 300, nullable: true })
  reason: string | null;

  @Column({ name: 'required', type: 'boolean', default: true })
  required: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
