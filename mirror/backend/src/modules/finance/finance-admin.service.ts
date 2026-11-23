import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { BalanceService } from './balance.service';
import { FinanceActor } from './finance-actor';
import { FinanceClock } from './finance-clock';
import { FinancialAuditService } from './financial-audit.service';
import { LedgerService } from './ledger.service';
import { formatMinorToMajor } from './domain/money';
import { returned } from './sql';

/** Ledger transaction types whose reversal does not desynchronise a domain table. */
const REVERSIBLE_TYPES = [
  'GATEWAY_FEE',
  'PSP_SETTLEMENT',
  'REFUND_DISBURSEMENT',
  'MIGRATION_OPENING',
  'CORRECTION',
];

/** Admin-only operations that are not part of a single domain flow. */
@Injectable()
export class FinanceAdminService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
    private readonly balances: BalanceService,
    private readonly audit: FinancialAuditService,
    private readonly clock: FinanceClock,
  ) {}

  async exceptions(
    status: 'OPEN' | 'RESOLVED' | undefined,
    limit = 50,
    offset = 0,
  ) {
    return this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT id, kind, severity, reference_type, reference_id, detail, status, resolved_at, resolution_note, created_at
         FROM finance_migration_exceptions WHERE ($1::text IS NULL OR status = $1)
        ORDER BY severity, created_at DESC LIMIT $2 OFFSET $3`,
      [status ?? null, Math.min(limit, 200), offset],
    );
  }

  async resolveException(actor: FinanceActor, id: string, note: string) {
    return this.dataSource.transaction(async (manager) => {
      const updated = returned<Array<Record<string, unknown>>>(
        await manager.query(
          `UPDATE finance_migration_exceptions SET status='RESOLVED', resolved_by=$2, resolved_at=now(), resolution_note=$3
          WHERE id=$1 AND status='OPEN' RETURNING id, kind, status`,
          [id, actor.id, note],
        ),
      );
      if (updated.length === 0)
        throw new ApiException(
          'NOT_FOUND',
          'No open exception with this id',
          HttpStatus.NOT_FOUND,
        );
      await this.audit.record(manager, {
        actor,
        action: 'finance.exception.resolved',
        targetType: 'finance_exception',
        targetId: id,
        reason: note,
      });
      return updated[0];
    });
  }

  async ledgerTransaction(id: string) {
    const tx = await this.ledger.findById(this.dataSource.manager, id);
    if (!tx)
      throw new ApiException(
        'NOT_FOUND',
        'Ledger transaction not found',
        HttpStatus.NOT_FOUND,
      );
    return {
      id: tx.id,
      seq: tx.seq.toString(),
      type: tx.type,
      currency: tx.currency,
      occurredAt: tx.occurredAt,
      referenceType: tx.referenceType,
      referenceId: tx.referenceId,
      idempotencyKey: tx.idempotencyKey,
      reversesTransactionId: tx.reversesTransactionId,
      lines: tx.lines.map((l) => ({
        account: l.account,
        side: l.side,
        amount: formatMinorToMajor(l.amount, tx.currency),
        creatorId: l.creatorId,
        memo: l.memo,
      })),
    };
  }

  async reverse(actor: FinanceActor, id: string, reason: string) {
    return this.dataSource.transaction(async (manager) => {
      const original = await this.ledger.findById(manager, id);
      if (!original)
        throw new ApiException(
          'NOT_FOUND',
          'Ledger transaction not found',
          HttpStatus.NOT_FOUND,
        );
      if (!REVERSIBLE_TYPES.includes(original.type)) {
        throw new ApiException(
          'FINANCE_RULE_VIOLATION',
          `A ${original.type} transaction carries domain state (entitlements, payouts, refunds) and cannot be reversed directly; use the domain operation (refund, payout rejection) instead`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const posted = await this.ledger.reverse(manager, id, {
        actorType: actor.type,
        actorId: actor.id,
        reason,
        occurredAt: this.clock.now(),
      });
      await this.audit.record(manager, {
        actor,
        action: 'finance.ledger.reversed',
        targetType: 'ledger_transaction',
        targetId: id,
        reason,
        ledgerTransactionId: posted.id,
      });
      return { reversalTransactionId: posted.id, replayed: posted.replayed };
    });
  }

  /** `rebuildCreatorBalance` — reports a projection/replay discrepancy; `repair` replaces ONLY the projection, audited. */
  async rebuildBalance(
    actor: FinanceActor,
    creatorId: string,
    currency: string,
    options: { repair?: boolean; reason?: string },
  ) {
    if (
      options.repair &&
      (!options.reason || options.reason.trim().length < 5)
    ) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'A reason is required to repair a projection',
      );
    }
    const result = await this.balances.rebuildCreatorBalance(
      creatorId,
      currency,
      { repair: options.repair },
    );
    if (result.repaired) {
      await this.dataSource.transaction((manager) =>
        this.audit.record(manager, {
          actor,
          action: 'finance.balance.projection_repaired',
          targetType: 'creator',
          targetId: creatorId,
          before: {
            ...Object.fromEntries(
              Object.entries(result.projection).map(([k, v]) => [k, String(v)]),
            ),
          },
          after: {
            ...Object.fromEntries(
              Object.entries(result.replay).map(([k, v]) => [k, String(v)]),
            ),
          },
          reason: options.reason ?? null,
        }),
      );
    }
    const f = (v: bigint) => formatMinorToMajor(v, currency);
    return {
      creatorId,
      currency,
      matches: result.matches,
      repaired: result.repaired,
      replay: {
        held: f(result.replay.held),
        available: f(result.replay.available),
        payoutPending: f(result.replay.payoutPending),
        paidOut: f(result.replay.paid),
        recovery: f(result.replay.recovery),
      },
      projection: {
        held: f(result.projection.held),
        available: f(result.projection.available),
        payoutPending: f(result.projection.payoutPending),
        paidOut: f(result.projection.paid),
        recovery: f(result.projection.recovery),
      },
    };
  }
}
