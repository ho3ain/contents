import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  integrityViolationsGauge,
  negativeCreatorBalances,
} from './finance-metrics';

export interface IntegrityCheckResult {
  check: string;
  description: string;
  violations: number;
  /** A few offending identifiers — never amounts of other people's money in bulk. */
  samples: Array<Record<string, unknown>>;
}

export interface IntegrityReport {
  ranAt: string;
  ok: boolean;
  totalViolations: number;
  checks: IntegrityCheckResult[];
}

interface CheckDefinition {
  check: string;
  description: string;
  sql: string;
}

/**
 * W1.5 — the ledger integrity checker. Every check is a read-only SQL
 * statement, all run inside ONE REPEATABLE READ transaction so they see the
 * same snapshot (a posting committed half-way through cannot create a false
 * alarm). A violation is reported, never "fixed".
 */
export const INTEGRITY_CHECKS: CheckDefinition[] = [
  {
    check: 'unbalanced_transactions',
    description:
      'Every ledger transaction has Σ debits = Σ credits and at least 2 entries',
    sql: `SELECT t.id::text AS id FROM ledger_transactions t
            LEFT JOIN ledger_entries e ON e.transaction_id = t.id
           GROUP BY t.id
          HAVING COALESCE(SUM(CASE WHEN e.side='D' THEN e.amount_minor END),0)
              <> COALESCE(SUM(CASE WHEN e.side='C' THEN e.amount_minor END),0)
              OR COUNT(e.id) < 2`,
  },
  {
    check: 'global_debits_equal_credits',
    description: 'Per currency, Σ all debits = Σ all credits',
    sql: `SELECT currency AS id FROM ledger_entries GROUP BY currency
          HAVING SUM(CASE WHEN side='D' THEN amount_minor ELSE 0 END)
              <> SUM(CASE WHEN side='C' THEN amount_minor ELSE 0 END)`,
  },
  {
    check: 'suspicious_duplicate_lines',
    description:
      'A transaction with two identical entries (same account, side, amount, creator) is suspicious',
    sql: `SELECT transaction_id::text AS id FROM ledger_entries
           GROUP BY transaction_id, account_id, side, amount_minor, creator_id
          HAVING COUNT(*) > 1
            AND transaction_id NOT IN (SELECT id FROM ledger_transactions WHERE type = 'SALE')`,
  },
  {
    check: 'closed_accounts_with_balance',
    description:
      'A CLOSED account has a zero balance (nothing may be stranded in it)',
    sql: `SELECT a.id::text AS id FROM ledger_accounts a
            JOIN ledger_entries e ON e.account_id = a.id
           WHERE a.status = 'CLOSED'
           GROUP BY a.id
          HAVING SUM(CASE WHEN e.side='D' THEN e.amount_minor ELSE -e.amount_minor END) <> 0`,
  },
  {
    check: 'creator_accounts_without_creator',
    description: 'Every entry on a creator account carries a creator',
    sql: `SELECT e.id::text AS id FROM ledger_entries e
            JOIN ledger_accounts a ON a.id = e.account_id
           WHERE a.requires_creator AND e.creator_id IS NULL`,
  },
  {
    check: 'orphan_sale_references',
    description:
      'Every SALE ledger transaction references an existing successful (or since refunded) payment',
    sql: `SELECT t.id::text AS id FROM ledger_transactions t
           WHERE t.type = 'SALE'
             AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.id::text = t.reference_id
                              AND p.status IN ('successful','refunded'))`,
  },
  {
    check: 'sale_amount_mismatch',
    description: 'A sale posting equals its payment amount (minor units)',
    sql: `SELECT t.id::text AS id FROM ledger_transactions t
            JOIN payments p ON p.id::text = t.reference_id
            JOIN LATERAL (SELECT COALESCE(SUM(amount_minor),0) AS gross FROM ledger_entries
                           WHERE transaction_id = t.id AND side = 'D') d ON true
           WHERE t.type = 'SALE'
             AND d.gross <> (p.amount * (CASE WHEN p.currency_code = 'IRR' THEN 1 ELSE 100 END))::bigint`,
  },
  {
    check: 'successful_payment_without_sale_or_exception',
    description:
      'Every paid, non-zero payment has a sale posting or an open finance exception explaining why not',
    sql: `SELECT p.id::text AS id FROM payments p
           WHERE p.status IN ('successful','refunded') AND p.amount > 0
             AND p.confirmed_at >= (SELECT MIN(effective_from) FROM finance_policies WHERE kind='COMMISSION' AND version = 1)
             AND NOT EXISTS (SELECT 1 FROM ledger_transactions t WHERE t.idempotency_key = 'sale:' || p.id::text)
             AND NOT EXISTS (SELECT 1 FROM finance_migration_exceptions x
                              WHERE x.reference_type = 'payment' AND x.reference_id = p.id::text)`,
  },
  {
    check: 'negative_balance_buckets',
    description:
      'No creator bucket is negative (a refund shortfall is a RECOVERY, never a negative bucket)',
    sql: `SELECT creator_id::text AS id FROM creator_balances
           WHERE held_minor < 0 OR available_minor < 0 OR payout_pending_minor < 0
              OR paid_minor < 0 OR recovery_minor < 0`,
  },
  {
    check: 'projection_matches_replay',
    description:
      'creator_balances equals the balances recomputed from ledger entries alone',
    sql: `WITH replay AS (
            SELECT e.creator_id, e.currency,
              SUM(CASE WHEN a.code='CREATOR_HELD' THEN CASE WHEN e.side='C' THEN e.amount_minor ELSE -e.amount_minor END ELSE 0 END) AS held,
              SUM(CASE WHEN a.code='CREATOR_AVAILABLE' THEN CASE WHEN e.side='C' THEN e.amount_minor ELSE -e.amount_minor END ELSE 0 END) AS available,
              SUM(CASE WHEN a.code='CREATOR_PAYOUT_PENDING' THEN CASE WHEN e.side='C' THEN e.amount_minor ELSE -e.amount_minor END ELSE 0 END) AS pending,
              SUM(CASE WHEN a.code='PLATFORM_CASH' THEN CASE WHEN e.side='C' THEN e.amount_minor ELSE -e.amount_minor END ELSE 0 END) AS paid,
              SUM(CASE WHEN a.code='CREATOR_RECOVERY' THEN CASE WHEN e.side='D' THEN e.amount_minor ELSE -e.amount_minor END ELSE 0 END) AS recovery
              FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id
             WHERE e.creator_id IS NOT NULL GROUP BY e.creator_id, e.currency)
          SELECT COALESCE(r.creator_id, b.creator_id)::text AS id
            FROM replay r FULL JOIN creator_balances b ON b.creator_id = r.creator_id AND b.currency = r.currency
           WHERE COALESCE(r.held,0) <> COALESCE(b.held_minor,0)
              OR COALESCE(r.available,0) <> COALESCE(b.available_minor,0)
              OR COALESCE(r.pending,0) <> COALESCE(b.payout_pending_minor,0)
              OR COALESCE(r.paid,0) <> COALESCE(b.paid_minor,0)
              OR COALESCE(r.recovery,0) <> COALESCE(b.recovery_minor,0)`,
  },
  {
    check: 'held_equals_open_entitlements',
    description:
      'A creator HELD bucket equals Σ (share − refunded part) of their HELD entitlements',
    sql: `SELECT COALESCE(x.creator_id, b.creator_id)::text AS id
            FROM (SELECT creator_id, currency, SUM(creator_share_minor - refunded_creator_minor) AS s
                    FROM creator_entitlements WHERE status = 'HELD' GROUP BY creator_id, currency) x
            FULL JOIN creator_balances b ON b.creator_id = x.creator_id AND b.currency = x.currency
           WHERE COALESCE(x.s,0) <> COALESCE(b.held_minor,0)`,
  },
  {
    check: 'payout_pending_equals_open_payouts',
    description:
      'A creator PAYOUT_PENDING bucket equals Σ amount of their open payouts',
    sql: `SELECT COALESCE(x.creator_id, b.creator_id)::text AS id
            FROM (SELECT creator_id, currency, SUM(amount_minor) AS s FROM payouts
                   WHERE status IN ('REQUESTED','APPROVED','PROCESSING') GROUP BY creator_id, currency) x
            FULL JOIN creator_balances b ON b.creator_id = x.creator_id AND b.currency = x.currency
           WHERE COALESCE(x.s,0) <> COALESCE(b.payout_pending_minor,0)`,
  },
  {
    check: 'paid_payouts_have_ledger_and_reference',
    description:
      'A PAID payout has its ledger transaction and a bank reference',
    sql: `SELECT id::text AS id FROM payouts
           WHERE status = 'PAID' AND (paid_transaction_id IS NULL OR bank_reference IS NULL)`,
  },
  {
    check: 'refund_settlements_have_ledger',
    description:
      'A POSTED refund settlement points at a REFUND ledger transaction',
    sql: `SELECT s.id::text AS id FROM refund_settlements s
            LEFT JOIN ledger_transactions t ON t.id = s.ledger_transaction_id
           WHERE s.outcome = 'POSTED' AND (t.id IS NULL OR t.type <> 'REFUND')`,
  },
  {
    check: 'processed_refund_without_settlement',
    description:
      'Every processed refund was settled by the finance engine (ledger or documented legacy)',
    sql: `SELECT r.id::text AS id FROM refunds r
           WHERE r.status = 'processed'
             AND r.processed_at >= (SELECT MIN(effective_from) FROM finance_policies WHERE kind='COMMISSION' AND version = 1)
             AND NOT EXISTS (SELECT 1 FROM refund_settlements s WHERE s.refund_id = r.id)`,
  },
  {
    check: 'entitlement_refund_bounds',
    description: 'Refunded amounts never exceed what was sold',
    sql: `SELECT id::text AS id FROM creator_entitlements
           WHERE refunded_gross_minor > gross_minor OR refunded_creator_minor > creator_share_minor`,
  },
];

@Injectable()
export class IntegrityService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async run(): Promise<IntegrityReport> {
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      const checks: IntegrityCheckResult[] = [];
      for (const def of INTEGRITY_CHECKS) {
        const rows = await manager.query<Array<{ id: string }>>(def.sql);
        checks.push({
          check: def.check,
          description: def.description,
          violations: rows.length,
          samples: rows.slice(0, 5).map((r) => ({ id: r.id })),
        });
        integrityViolationsGauge.set({ check: def.check }, rows.length);
      }
      const negative = checks.find(
        (c) => c.check === 'negative_balance_buckets',
      );
      negativeCreatorBalances.set(negative?.violations ?? 0);
      const total = checks.reduce((sum, c) => sum + c.violations, 0);
      return {
        ranAt: new Date().toISOString(),
        ok: total === 0,
        totalViolations: total,
        checks,
      };
    });
  }
}
