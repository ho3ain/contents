import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import {
  MoneyError,
  isSupportedCurrency,
  parseMajorToMinor,
  parseMinorText,
} from './domain/money';
import { FinanceActor } from './finance-actor';
import {
  openReconciliationExceptions,
  reconciliationMismatchesTotal,
} from './finance-metrics';
import { FinancialAuditService } from './financial-audit.service';
import { LedgerService } from './ledger.service';
import { FinanceClock } from './finance-clock';
import { returned } from './sql';

/**
 * The Mesh reconciliation import format. A PSP's own settlement file must be
 * mapped to it by an operator: no PSP file layout is assumed here.
 */
export interface ReconciliationInputRow {
  providerReference: string;
  /** Major units, decimal string (exact). */
  amount: string;
  fee?: string | null;
  /** One of SUCCESSFUL | FAILED | REFUNDED; anything else is classified UNKNOWN. */
  status: string;
  occurredAt?: string | null;
}

export const KNOWN_PROVIDER_STATUSES = [
  'SUCCESSFUL',
  'FAILED',
  'REFUNDED',
] as const;

export type ReconClass =
  | 'MATCHED'
  | 'MISSING_INTERNAL'
  | 'MISSING_PROVIDER'
  | 'AMOUNT_MISMATCH'
  | 'STATUS_MISMATCH'
  | 'DUPLICATE'
  | 'UNKNOWN';

export interface LineFacts {
  providerStatus: string;
  amountMinor: bigint;
  duplicateOfEarlierLine: boolean;
}
export interface PaymentFacts {
  status:
    | 'initiated'
    | 'pending'
    | 'successful'
    | 'failed'
    | 'cancelled'
    | 'refunded';
  amountMinor: bigint;
}

/** PURE classification of one provider line against our payment. */
export function classifyLine(
  line: LineFacts,
  payment: PaymentFacts | null,
): ReconClass {
  if (line.duplicateOfEarlierLine) return 'DUPLICATE';
  if (
    !(KNOWN_PROVIDER_STATUSES as readonly string[]).includes(
      line.providerStatus,
    )
  )
    return 'UNKNOWN';
  if (!payment) return 'MISSING_INTERNAL';
  const ourStatus =
    payment.status === 'successful'
      ? 'SUCCESSFUL'
      : payment.status === 'refunded'
        ? 'REFUNDED'
        : 'FAILED';
  // A refunded payment was SUCCESSFUL at the provider first; a provider line saying SUCCESSFUL for our refunded payment is consistent.
  const consistent =
    ourStatus === line.providerStatus ||
    (ourStatus === 'REFUNDED' && line.providerStatus === 'SUCCESSFUL') ||
    (ourStatus === 'FAILED' && line.providerStatus === 'FAILED');
  if (!consistent) return 'STATUS_MISMATCH';
  if (payment.amountMinor !== line.amountMinor) return 'AMOUNT_MISMATCH';
  return 'MATCHED';
}

export interface ItemRow {
  id: string;
  run_id: string;
  line_id: string | null;
  payment_id: string | null;
  classification: ReconClass;
  status: 'DETECTED' | 'CLASSIFIED' | 'INVESTIGATING' | 'RESOLVED';
  detail: Record<string, unknown>;
  resolution_note: string | null;
  created_at: Date;
}

/**
 * W9 — reconciliation of provider settlement lines against our payments.
 * Import is idempotent (content hash of the batch + per-line fingerprint);
 * a run is idempotent per batch; nothing here edits a payment or the ledger:
 * a mismatch becomes a tracked exception for a human to resolve.
 */
@Injectable()
export class ReconciliationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: FinancialAuditService,
    private readonly ledger: LedgerService,
    private readonly clock: FinanceClock,
  ) {}

  async import(
    actor: FinanceActor,
    input: {
      provider: string;
      currency: string;
      sourceName: string;
      rows: ReconciliationInputRow[];
    },
  ) {
    if (!/^[a-z0-9_-]{2,40}$/.test(input.provider)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'provider must be 2–40 chars of [a-z0-9_-]',
      );
    }
    if (!isSupportedCurrency(input.currency)) {
      throw new ApiException('VALIDATION_ERROR', 'Unsupported currency');
    }
    if (
      !Array.isArray(input.rows) ||
      input.rows.length === 0 ||
      input.rows.length > 5000
    ) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Between 1 and 5000 rows are required',
      );
    }
    const parsed = input.rows.map((row, index) => {
      try {
        if (!row.providerReference || row.providerReference.length > 128)
          throw new MoneyError(
            'INVALID_AMOUNT',
            'providerReference is required (≤128 chars)',
          );
        const amountMinor = parseMajorToMinor(row.amount, input.currency);
        const feeMinor =
          row.fee === undefined || row.fee === null || row.fee === ''
            ? null
            : parseMajorToMinor(row.fee, input.currency);
        const occurredAt = row.occurredAt ? new Date(row.occurredAt) : null;
        if (occurredAt && Number.isNaN(occurredAt.getTime()))
          throw new MoneyError('INVALID_AMOUNT', 'occurredAt is not a date');
        return {
          providerReference: row.providerReference,
          amountMinor,
          feeMinor,
          status: String(row.status).toUpperCase(),
          occurredAt,
          raw: row,
        };
      } catch (error) {
        throw new ApiException(
          'VALIDATION_ERROR',
          `Row ${index + 1}: ${error instanceof Error ? error.message : 'invalid'}`,
        );
      }
    });
    const sha = createHash('sha256')
      .update(
        JSON.stringify(
          parsed.map((p) => [
            p.providerReference,
            p.amountMinor.toString(),
            p.feeMinor?.toString() ?? null,
            p.status,
            p.occurredAt?.toISOString() ?? null,
          ]),
        ),
      )
      .digest('hex');

    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.query<
        Array<{ id: string; line_count: number }>
      >(
        `SELECT id, line_count FROM reconciliation_batches WHERE provider = $1 AND content_sha256 = $2`,
        [input.provider, sha],
      );
      if (existing[0]) {
        return {
          batchId: existing[0].id,
          lines: existing[0].line_count,
          duplicate: true,
        };
      }
      const batch = await manager.query<Array<{ id: string }>>(
        `INSERT INTO reconciliation_batches (provider, source_name, content_sha256, currency, line_count, imported_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          input.provider,
          input.sourceName.slice(0, 200),
          sha,
          input.currency,
          parsed.length,
          actor.id,
        ],
      );
      let inserted = 0;
      for (let i = 0; i < parsed.length; i += 1) {
        const p = parsed[i];
        const fingerprint = createHash('sha256')
          .update(
            [
              input.provider,
              p.providerReference,
              p.amountMinor,
              p.status,
              p.occurredAt?.toISOString() ?? '',
            ].join('|'),
          )
          .digest('hex');
        const r = await manager.query<unknown[]>(
          `INSERT INTO reconciliation_lines
             (batch_id, line_no, provider, provider_reference, occurred_at, amount_minor, fee_minor,
              currency, provider_status, fingerprint, raw)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (provider, fingerprint) DO NOTHING RETURNING id`,
          [
            batch[0].id,
            i + 1,
            input.provider,
            p.providerReference,
            p.occurredAt,
            p.amountMinor.toString(),
            p.feeMinor?.toString() ?? null,
            input.currency,
            p.status,
            fingerprint,
            JSON.stringify(p.raw),
          ],
        );
        inserted += r.length;
      }
      await this.audit.record(manager, {
        actor,
        action: 'finance.reconciliation.imported',
        targetType: 'reconciliation_batch',
        targetId: batch[0].id,
        reference: sha,
        after: {
          provider: input.provider,
          rows: parsed.length,
          newLines: inserted,
        },
      });
      return {
        batchId: batch[0].id,
        lines: parsed.length,
        newLines: inserted,
        duplicate: false,
      };
    });
  }

  async run(actor: FinanceActor, batchId: string) {
    return this.dataSource.transaction(async (manager) => {
      const batches = await manager.query<
        Array<{ id: string; provider: string; currency: string }>
      >(
        `SELECT id, provider, currency FROM reconciliation_batches WHERE id = $1 FOR UPDATE`,
        [batchId],
      );
      const batch = batches[0];
      if (!batch)
        throw new ApiException(
          'NOT_FOUND',
          'Batch not found',
          HttpStatus.NOT_FOUND,
        );
      const prior = await manager.query<
        Array<{ id: string; counts: Record<string, number> }>
      >(
        `SELECT id, counts FROM reconciliation_runs WHERE batch_id = $1 ORDER BY created_at LIMIT 1`,
        [batchId],
      );
      if (prior[0])
        return {
          runId: prior[0].id,
          counts: prior[0].counts,
          alreadyRun: true,
        };

      const lines = await manager.query<
        Array<{
          id: string;
          provider_reference: string;
          amount_minor: string;
          provider_status: string;
          occurred_at: Date | null;
        }>
      >(
        `SELECT id, provider_reference, amount_minor::text, provider_status, occurred_at
           FROM reconciliation_lines WHERE batch_id = $1 ORDER BY line_no`,
        [batchId],
      );
      const run = await manager.query<Array<{ id: string }>>(
        `INSERT INTO reconciliation_runs (batch_id, started_by) VALUES ($1,$2) RETURNING id`,
        [batchId, actor.id],
      );
      const counts: Record<string, number> = {};
      const seenRef = new Set<string>();
      const matchedPayments = new Set<string>();
      const bump = (c: ReconClass) => {
        counts[c] = (counts[c] ?? 0) + 1;
      };
      for (const line of lines) {
        const duplicate = seenRef.has(line.provider_reference);
        seenRef.add(line.provider_reference);
        const pay = await manager.query<
          Array<{
            id: string;
            status: PaymentFactsStatus;
            amount: string;
            currency_code: string;
          }>
        >(
          `SELECT id, status, amount::text AS amount, currency_code FROM payments
            WHERE gateway = $1 AND (gateway_transaction_id = $2 OR provider_payload->>'providerRef' = $2)
            ORDER BY created_at LIMIT 1`,
          [batch.provider, line.provider_reference],
        );
        const payment = pay[0]
          ? {
              status: pay[0].status,
              amountMinor: parseMajorToMinor(
                pay[0].amount,
                pay[0].currency_code,
              ),
            }
          : null;
        const classification = classifyLine(
          {
            providerStatus: line.provider_status,
            amountMinor: parseMinorText(line.amount_minor),
            duplicateOfEarlierLine: duplicate,
          },
          payment,
        );
        bump(classification);
        if (pay[0]) matchedPayments.add(pay[0].id);
        await manager.query(
          `INSERT INTO reconciliation_items (run_id, line_id, payment_id, classification, detail)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            run[0].id,
            line.id,
            pay[0]?.id ?? null,
            classification,
            JSON.stringify({
              providerReference: line.provider_reference,
              providerStatus: line.provider_status,
              providerAmountMinor: line.amount_minor,
              paymentStatus: pay[0]?.status ?? null,
              paymentAmountMinor: payment?.amountMinor.toString() ?? null,
            }),
          ],
        );
        if (classification !== 'MATCHED')
          reconciliationMismatchesTotal.inc({ status: classification });
      }
      // Our successful payments inside the statement's time window that the provider never listed.
      const times = lines
        .map((l) => l.occurred_at)
        .filter((d): d is Date => d !== null)
        .map((d) => new Date(d).getTime());
      if (times.length > 0) {
        const missing = await manager.query<
          Array<{ id: string; amount: string }>
        >(
          `SELECT id, amount::text AS amount FROM payments
            WHERE gateway = $1 AND status = 'successful' AND confirmed_at >= $2 AND confirmed_at <= $3
              AND NOT (id = ANY($4::uuid[]))`,
          [
            batch.provider,
            new Date(Math.min(...times)),
            new Date(Math.max(...times)),
            [...matchedPayments],
          ],
        );
        for (const m of missing) {
          bump('MISSING_PROVIDER');
          reconciliationMismatchesTotal.inc({ status: 'MISSING_PROVIDER' });
          await manager.query(
            `INSERT INTO reconciliation_items (run_id, payment_id, classification, detail) VALUES ($1,$2,'MISSING_PROVIDER',$3)`,
            [run[0].id, m.id, JSON.stringify({ paymentAmount: m.amount })],
          );
        }
      }
      await manager.query(
        `UPDATE reconciliation_runs SET counts = $2 WHERE id = $1`,
        [run[0].id, JSON.stringify(counts)],
      );
      await this.audit.record(manager, {
        actor,
        action: 'finance.reconciliation.run',
        targetType: 'reconciliation_run',
        targetId: run[0].id,
        after: counts,
      });
      await this.refreshGauge(manager);
      return { runId: run[0].id, counts, alreadyRun: false };
    });
  }

  private async refreshGauge(manager: EntityManager) {
    const open = await manager.query<Array<{ n: string }>>(
      `SELECT count(*)::text AS n FROM reconciliation_items WHERE status <> 'RESOLVED' AND classification <> 'MATCHED'`,
    );
    openReconciliationExceptions.set(Number(open[0].n));
  }

  async listItems(filter: {
    classification?: ReconClass;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    return this.dataSource.query<ItemRow[]>(
      `SELECT id, run_id, line_id, payment_id, classification, status, detail, resolution_note, created_at
         FROM reconciliation_items
        WHERE classification <> 'MATCHED' AND ($1::text IS NULL OR classification = $1) AND ($2::text IS NULL OR status = $2)
        ORDER BY created_at DESC, id LIMIT $3 OFFSET $4`,
      [
        filter.classification ?? null,
        filter.status ?? null,
        Math.min(filter.limit ?? 50, 200),
        filter.offset ?? 0,
      ],
    );
  }

  /** DETECTED → CLASSIFIED → INVESTIGATING → RESOLVED (note required to resolve). */
  async advance(
    actor: FinanceActor,
    itemId: string,
    to: 'CLASSIFIED' | 'INVESTIGATING' | 'RESOLVED',
    note?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<ItemRow[]>(
        `SELECT * FROM reconciliation_items WHERE id = $1 FOR UPDATE`,
        [itemId],
      );
      const item = rows[0];
      if (!item)
        throw new ApiException(
          'NOT_FOUND',
          'Item not found',
          HttpStatus.NOT_FOUND,
        );
      const order = ['DETECTED', 'CLASSIFIED', 'INVESTIGATING', 'RESOLVED'];
      if (item.status === to) return item;
      if (order.indexOf(to) !== order.indexOf(item.status) + 1) {
        throw new ApiException(
          'FINANCE_RULE_VIOLATION',
          `Cannot move ${item.status} → ${to}`,
          HttpStatus.CONFLICT,
        );
      }
      if (to === 'RESOLVED' && (!note || note.trim().length < 5)) {
        throw new ApiException(
          'VALIDATION_ERROR',
          'A resolution note of at least 5 characters is required',
        );
      }
      const updated = returned<ItemRow[]>(
        await manager.query(
          `UPDATE reconciliation_items SET status = $2::varchar, updated_at = now(),
                assigned_to = COALESCE(assigned_to, $3::uuid),
                resolved_by = CASE WHEN $2::varchar = 'RESOLVED' THEN $3::uuid ELSE resolved_by END,
                resolved_at = CASE WHEN $2::varchar = 'RESOLVED' THEN now() ELSE resolved_at END,
                resolution_note = CASE WHEN $2::varchar = 'RESOLVED' THEN $4::text ELSE resolution_note END
          WHERE id = $1 RETURNING *`,
          [itemId, to, actor.id, note ?? null],
        ),
      );
      await this.audit.record(manager, {
        actor,
        action: `finance.reconciliation.${to.toLowerCase()}`,
        targetType: 'reconciliation_item',
        targetId: itemId,
        before: { status: item.status },
        after: { status: to },
        reason: note ?? null,
      });
      await this.refreshGauge(manager);
      return updated[0];
    });
  }

  /**
   * Posts the PSP settlement for a fully-matched batch:
   * Dr PLATFORM_CASH / Cr PSP_CLEARING for (Σ amount − Σ provider fee), after
   * topping up GATEWAY_FEE_EXPENSE for any provider fee we did not already
   * post at sale time. Refused when the batch has any unresolved exception.
   */
  async postSettlement(actor: FinanceActor, batchId: string) {
    return this.dataSource.transaction(async (manager) => {
      const batches = await manager.query<
        Array<{ id: string; currency: string }>
      >(
        `SELECT id, currency FROM reconciliation_batches WHERE id = $1 FOR UPDATE`,
        [batchId],
      );
      if (!batches[0])
        throw new ApiException(
          'NOT_FOUND',
          'Batch not found',
          HttpStatus.NOT_FOUND,
        );
      const currency = batches[0].currency;
      const open = await manager.query<unknown[]>(
        `SELECT 1 FROM reconciliation_items i JOIN reconciliation_runs r ON r.id = i.run_id
          WHERE r.batch_id = $1 AND i.classification <> 'MATCHED' AND i.status <> 'RESOLVED' LIMIT 1`,
        [batchId],
      );
      const runs = await manager.query<unknown[]>(
        `SELECT 1 FROM reconciliation_runs WHERE batch_id = $1`,
        [batchId],
      );
      if (runs.length === 0 || open.length > 0) {
        throw new ApiException(
          'FINANCE_RULE_VIOLATION',
          'Run the reconciliation and resolve every exception before posting the settlement',
          HttpStatus.CONFLICT,
        );
      }
      const matched = await manager.query<
        Array<{
          line_id: string;
          payment_id: string;
          amount: string;
          fee: string | null;
          posted_fee: string;
        }>
      >(
        `SELECT l.id AS line_id, i.payment_id, l.amount_minor::text AS amount, l.fee_minor::text AS fee,
                COALESCE((SELECT SUM(e.amount_minor) FROM ledger_transactions t JOIN ledger_entries e ON e.transaction_id = t.id
                           JOIN ledger_accounts a ON a.id = e.account_id AND a.code = 'GATEWAY_FEE_EXPENSE'
                          WHERE t.idempotency_key = 'gateway_fee:' || i.payment_id::text AND e.side = 'D'),0)::text AS posted_fee
           FROM reconciliation_items i JOIN reconciliation_runs r ON r.id = i.run_id
           JOIN reconciliation_lines l ON l.id = i.line_id
          WHERE r.batch_id = $1 AND i.classification = 'MATCHED' AND l.provider_status = 'SUCCESSFUL'`,
        [batchId],
      );
      let cash = 0n;
      for (const m of matched) {
        const amount = parseMinorText(m.amount);
        const posted = parseMinorText(m.posted_fee);
        const fee = m.fee === null ? posted : parseMinorText(m.fee);
        if (fee < posted || fee > amount) {
          throw new ApiException(
            'FINANCE_RULE_VIOLATION',
            `Provider fee on line ${m.line_id} contradicts the fee already posted; resolve manually`,
            HttpStatus.CONFLICT,
          );
        }
        if (fee > posted) {
          await this.ledger.post(manager, {
            type: 'GATEWAY_FEE',
            currency,
            occurredAt: this.clock.now(),
            referenceType: 'reconciliation_line',
            referenceId: m.line_id,
            idempotencyKey: `gateway_fee_adj:${m.line_id}`,
            actorType: actor.type,
            actorId: actor.id,
            description: `Gateway fee top-up from provider statement (line ${m.line_id})`,
            lines: [
              {
                account: 'GATEWAY_FEE_EXPENSE',
                side: 'D',
                amount: fee - posted,
              },
              { account: 'PSP_CLEARING', side: 'C', amount: fee - posted },
            ],
          });
        }
        cash += amount - fee;
      }
      if (cash <= 0n) {
        throw new ApiException(
          'FINANCE_RULE_VIOLATION',
          'Nothing to settle in this batch',
          HttpStatus.CONFLICT,
        );
      }
      const posted = await this.ledger.post(manager, {
        type: 'PSP_SETTLEMENT',
        currency,
        occurredAt: this.clock.now(),
        referenceType: 'reconciliation_batch',
        referenceId: batchId,
        idempotencyKey: `psp_settlement:${batchId}`,
        actorType: actor.type,
        actorId: actor.id,
        description: `PSP settlement received for batch ${batchId}`,
        lines: [
          { account: 'PLATFORM_CASH', side: 'D', amount: cash },
          { account: 'PSP_CLEARING', side: 'C', amount: cash },
        ],
      });
      await this.audit.record(manager, {
        actor,
        action: 'finance.reconciliation.settlement_posted',
        targetType: 'reconciliation_batch',
        targetId: batchId,
        amountMinor: cash,
        currency,
        ledgerTransactionId: posted.id,
      });
      return {
        ledgerTransactionId: posted.id,
        amountMinor: cash.toString(),
        replayed: posted.replayed,
      };
    });
  }
}

type PaymentFactsStatus = PaymentFacts['status'];
