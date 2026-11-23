import { Injectable, Logger } from '@nestjs/common';
import { businessEvent } from '../../common/logging/app-logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/platform/audit-log.entity';
import { AuditAction, AuditEntity } from './audit-actions';

export interface AuditContext {
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditRecordInput {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  context?: AuditContext;
}

/**
 * Thin append-only recorder. Modules call `record(...)` at the moment the
 * audited event happens; metadata is deliberately kept minimal (privacy,
 * PLAYBOOK 9.14).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async record(input: AuditRecordInput): Promise<void> {
    const entry = this.auditLogRepository.create({
      actorId: input.context?.actorId ?? null,
      ip: input.context?.ip ?? null,
      userAgent: input.context?.userAgent ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
    });

    try {
      await this.auditLogRepository.save(entry);
      businessEvent.info('audit.recorded', 'Audit record appended', {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? undefined,
        actorId: input.context?.actorId ?? undefined,
      });
    } catch (error) {
      // Auditing must never break the primary flow.
      this.logger.error(
        'Failed to write audit log',
        error instanceof Error ? error.stack : String(error),
      );
      businessEvent.error(
        'audit.write_failed',
        'Audit record could not be persisted',
        {
          action: input.action,
          entity: input.entity,
        },
      );
    }
  }
}
