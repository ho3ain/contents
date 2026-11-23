import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import type { FinanceActor } from './finance-actor';

export interface FinancialAuditInput {
  actor: FinanceActor;
  action: string;
  targetType: string;
  targetId: string;
  amountMinor?: bigint | null;
  currency?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  reference?: string | null;
  ledgerTransactionId?: string | null;
}

/**
 * W8.3 — the financial audit trail.
 *
 * Unlike the generic `AuditService` (which deliberately swallows its own
 * failures so it can never break a request), this one is written INSIDE the
 * caller's database transaction and its failure aborts that transaction:
 * a privileged financial action without an audit record must not happen.
 * The table is append-only at the database level.
 */
@Injectable()
export class FinancialAuditService {
  async record(
    manager: EntityManager,
    input: FinancialAuditInput,
  ): Promise<void> {
    const hasAmount =
      input.amountMinor !== undefined && input.amountMinor !== null;
    await manager.query(
      `INSERT INTO financial_audit_events
         (actor_id, actor_role, action, target_type, target_id, amount_minor,
          currency, before_state, after_state, reason, reference,
          ledger_transaction_id, ip, user_agent, request_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        input.actor.id,
        input.actor.role,
        input.action,
        input.targetType,
        input.targetId,
        hasAmount ? (input.amountMinor as bigint).toString() : null,
        hasAmount ? (input.currency ?? null) : null,
        input.before ? JSON.stringify(input.before) : null,
        input.after ? JSON.stringify(input.after) : null,
        input.reason ?? null,
        input.reference ?? null,
        input.ledgerTransactionId ?? null,
        input.actor.ip ?? null,
        input.actor.userAgent?.slice(0, 300) ?? null,
        input.actor.requestId ?? null,
      ],
    );
  }
}
