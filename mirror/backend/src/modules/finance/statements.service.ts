import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { BalanceService } from './balance.service';
import { CreatorResolver } from './creator-resolver';
import { formatMinorToMajor, parseMinorText } from './domain/money';

export interface StatementLine {
  occurredAt: Date;
  transactionId: string;
  transactionType: string;
  description: string;
  referenceType: string;
  referenceId: string;
  bucket: string;
  /** Signed effect on the creator's bucket (credit increases a liability bucket). */
  effect: string;
  currency: string;
}

const BUCKET_OF: Record<string, { label: string; sign: 1 | -1 }> = {
  CREATOR_HELD: { label: 'HELD', sign: 1 },
  CREATOR_AVAILABLE: { label: 'AVAILABLE', sign: 1 },
  CREATOR_PAYOUT_PENDING: { label: 'PAYOUT_PENDING', sign: 1 },
  CREATOR_RECOVERY: { label: 'RECOVERY', sign: -1 },
  PLATFORM_CASH: { label: 'PAID_OUT', sign: 1 },
};

/** Spreadsheet-injection safe CSV cell (a leading = + - @ would be executed as a formula). */
export function csvCell(value: unknown): string {
  let text = '';
  if (typeof value === 'string') text = value;
  else if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  )
    text = String(value);
  else if (value !== null && value !== undefined) text = JSON.stringify(value);
  // A plain signed number cannot execute anything; ledger effects are often negative.
  const plainNumber = /^-?\d+(\.\d+)?$/.test(text);
  if (!plainNumber && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: Array<Array<unknown>>): string {
  return (
    [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
  );
}

/**
 * W8 — statements derived from LEDGER ENTRIES, never from the projection or
 * a second set of totals: a statement can only say what the ledger says.
 */
@Injectable()
export class StatementsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly balances: BalanceService,
    private readonly creators: CreatorResolver,
  ) {}

  async creatorBalance(userId: string, currency = 'IRR') {
    const creatorId = await this.creators.creatorIdOfUser(userId);
    return this.balanceView(creatorId, currency);
  }

  async balanceView(creatorId: string, currency = 'IRR') {
    const b = await this.balances.get(creatorId, currency);
    const f = (v: bigint) => formatMinorToMajor(v, currency);
    return {
      creatorId,
      currency,
      held: f(b.held),
      available: f(b.available),
      payoutPending: f(b.payoutPending),
      paidOut: f(b.paid),
      recoveryOutstanding: f(b.recovery),
      asOfLedgerSeq: undefined,
      note: 'Derived from the ledger. "Recovery outstanding" is money the creator owes Mesh after a refund that exceeded their available balance.',
    };
  }

  async lines(
    creatorId: string,
    options: {
      currency?: string;
      from?: Date;
      to?: Date;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ lines: StatementLine[]; total: number }> {
    const currency = options.currency ?? 'IRR';
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);
    const offset = Math.max(options.offset ?? 0, 0);
    if (options.from && options.to && options.from > options.to) {
      throw new ApiException(
        'VALIDATION_ERROR',
        '`from` must not be after `to`',
        HttpStatus.BAD_REQUEST,
      );
    }
    const params = [
      creatorId,
      currency,
      options.from ?? null,
      options.to ?? null,
    ];
    const where = `e.creator_id = $1 AND e.currency = $2
        AND a.code IN ('CREATOR_HELD','CREATOR_AVAILABLE','CREATOR_PAYOUT_PENDING','CREATOR_RECOVERY','PLATFORM_CASH')
        AND ($3::timestamptz IS NULL OR t.occurred_at >= $3) AND ($4::timestamptz IS NULL OR t.occurred_at < $4)`;
    const rows = await this.dataSource.query<
      Array<{
        occurred_at: Date;
        tx: string;
        type: string;
        description: string;
        ref_type: string;
        ref_id: string;
        code: string;
        side: 'D' | 'C';
        amount: string;
      }>
    >(
      `SELECT t.occurred_at, t.id::text AS tx, t.type, t.description, t.reference_type AS ref_type,
              t.reference_id AS ref_id, a.code, e.side, e.amount_minor::text AS amount
         FROM ledger_entries e
         JOIN ledger_transactions t ON t.id = e.transaction_id
         JOIN ledger_accounts a ON a.id = e.account_id
        WHERE ${where}
        ORDER BY t.seq, e.line_no LIMIT $5 OFFSET $6`,
      [...params, limit, offset],
    );
    const total = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT count(*)::text AS n FROM ledger_entries e
         JOIN ledger_transactions t ON t.id = e.transaction_id
         JOIN ledger_accounts a ON a.id = e.account_id WHERE ${where}`,
      params,
    );
    return {
      total: Number(total[0].n),
      lines: rows.map((r) => {
        const bucket = BUCKET_OF[r.code];
        // Liability buckets: credit = +. Recovery (asset): debit = +. Cash-out: credit = +.
        const credit =
          r.side === 'C' ? parseMinorText(r.amount) : -parseMinorText(r.amount);
        const effect = bucket.label === 'RECOVERY' ? -credit : credit;
        return {
          occurredAt: r.occurred_at,
          transactionId: r.tx,
          transactionType: r.type,
          description: r.description,
          referenceType: r.ref_type,
          referenceId: r.ref_id,
          bucket: bucket.label,
          effect:
            (effect < 0n ? '-' : '') +
            formatMinorToMajor(effect < 0n ? -effect : effect, currency),
          currency,
        };
      }),
    };
  }

  async creatorStatementCsv(
    creatorId: string,
    options: { currency?: string; from?: Date; to?: Date },
  ) {
    const { lines } = await this.lines(creatorId, { ...options, limit: 1000 });
    return toCsv(
      [
        'occurred_at',
        'transaction_id',
        'type',
        'description',
        'reference_type',
        'reference_id',
        'bucket',
        'effect',
        'currency',
      ],
      lines.map((l) => [
        l.occurredAt.toISOString(),
        l.transactionId,
        l.transactionType,
        l.description,
        l.referenceType,
        l.referenceId,
        l.bucket,
        l.effect,
        l.currency,
      ]),
    );
  }

  /** Admin: trial balance — Σ debits, Σ credits and net per ledger account. */
  async trialBalance(currency = 'IRR') {
    const rows = await this.dataSource.query<
      Array<{ code: string; type: string; debit: string; credit: string }>
    >(
      `SELECT a.code, a.type,
              COALESCE(SUM(CASE WHEN e.side='D' THEN e.amount_minor END),0)::text AS debit,
              COALESCE(SUM(CASE WHEN e.side='C' THEN e.amount_minor END),0)::text AS credit
         FROM ledger_accounts a LEFT JOIN ledger_entries e ON e.account_id = a.id
        WHERE a.currency = $1 GROUP BY a.code, a.type ORDER BY a.code`,
      [currency],
    );
    let debit = 0n;
    let credit = 0n;
    const accounts = rows.map((r) => {
      const d = parseMinorText(r.debit);
      const c = parseMinorText(r.credit);
      debit += d;
      credit += c;
      return {
        account: r.code,
        type: r.type,
        debit: formatMinorToMajor(d, currency),
        credit: formatMinorToMajor(c, currency),
      };
    });
    return {
      currency,
      accounts,
      totalDebit: formatMinorToMajor(debit, currency),
      totalCredit: formatMinorToMajor(credit, currency),
      balanced: debit === credit,
    };
  }

  /** Admin: the headline numbers of the finance dashboard. */
  async dashboard(currency = 'IRR') {
    const f = (v: string | null) =>
      formatMinorToMajor(parseMinorText(v ?? '0'), currency);
    const sums = await this.dataSource.query<Array<Record<string, string>>>(
      `SELECT COALESCE(SUM(held_minor),0)::text AS held, COALESCE(SUM(available_minor),0)::text AS available,
              COALESCE(SUM(payout_pending_minor),0)::text AS pending, COALESCE(SUM(paid_minor),0)::text AS paid,
              COALESCE(SUM(recovery_minor),0)::text AS recovery,
              COUNT(*) FILTER (WHERE recovery_minor > 0)::text AS creators_in_recovery
         FROM creator_balances WHERE currency = $1`,
      [currency],
    );
    const led = await this.dataSource.query<Array<Record<string, string>>>(
      `SELECT
         COALESCE(SUM(e.amount_minor) FILTER (WHERE a.code='PLATFORM_COMMISSION' AND e.side='C'),0)::text AS commission_in,
         COALESCE(SUM(e.amount_minor) FILTER (WHERE a.code='PLATFORM_COMMISSION' AND e.side='D'),0)::text AS commission_out,
         COALESCE(SUM(e.amount_minor) FILTER (WHERE a.code='GATEWAY_FEE_EXPENSE' AND e.side='D'),0)::text AS fees,
         COALESCE(SUM(e.amount_minor) FILTER (WHERE a.code='PSP_CLEARING' AND e.side='D' AND t.type='SALE'),0)::text AS gross_sales,
         COALESCE(SUM(e.amount_minor) FILTER (WHERE a.code='BUYER_REFUNDS_PAYABLE' AND e.side='C'),0)::text AS refunds_due,
         COALESCE(SUM(e.amount_minor) FILTER (WHERE a.code='BUYER_REFUNDS_PAYABLE' AND e.side='D'),0)::text AS refunds_paid
         FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id
         JOIN ledger_transactions t ON t.id = e.transaction_id WHERE e.currency = $1`,
      [currency],
    );
    const counts = await this.dataSource.query<Array<Record<string, string>>>(
      `SELECT (SELECT count(*) FROM payouts WHERE status IN ('REQUESTED','APPROVED','PROCESSING'))::text AS open_payouts,
              (SELECT count(*) FROM finance_migration_exceptions WHERE status='OPEN')::text AS open_exceptions,
              (SELECT count(*) FROM reconciliation_items WHERE status <> 'RESOLVED' AND classification <> 'MATCHED')::text AS open_recon,
              (SELECT count(*) FROM creator_kyc WHERE state IN ('SUBMITTED','UNDER_REVIEW'))::text AS kyc_waiting`,
    );
    const commissionNet =
      parseMinorText(led[0].commission_in) -
      parseMinorText(led[0].commission_out);
    return {
      currency,
      creatorLiabilities: {
        held: f(sums[0].held),
        available: f(sums[0].available),
        payoutPending: f(sums[0].pending),
      },
      paidOutToCreators: f(sums[0].paid),
      recoveryOutstanding: f(sums[0].recovery),
      creatorsInRecovery: Number(sums[0].creators_in_recovery),
      grossSales: f(led[0].gross_sales),
      platformCommissionNet: formatMinorToMajor(commissionNet, currency),
      gatewayFeesBorneByMesh: f(led[0].fees),
      refundsOwedToBuyers: formatMinorToMajor(
        parseMinorText(led[0].refunds_due) -
          parseMinorText(led[0].refunds_paid),
        currency,
      ),
      openPayouts: Number(counts[0].open_payouts),
      openFinanceExceptions: Number(counts[0].open_exceptions),
      openReconciliationItems: Number(counts[0].open_recon),
      kycWaitingForReview: Number(counts[0].kyc_waiting),
    };
  }

  async financialAudit(options: {
    targetType?: string;
    targetId?: string;
    action?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    return this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT id::text, occurred_at, actor_id, actor_role, action, target_type, target_id,
              amount_minor::text, currency, reason, reference, ledger_transaction_id, request_id
         FROM financial_audit_events
        WHERE ($1::text IS NULL OR target_type = $1) AND ($2::text IS NULL OR target_id = $2)
          AND ($3::text IS NULL OR action = $3)
        ORDER BY id DESC LIMIT $4 OFFSET $5`,
      [
        options.targetType ?? null,
        options.targetId ?? null,
        options.action ?? null,
        limit,
        Math.max(options.offset ?? 0, 0),
      ],
    );
  }
}
