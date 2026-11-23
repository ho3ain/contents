import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { businessEvent } from '../../common/logging/app-logger';
import { BalanceService } from './balance.service';
import {
  ACCOUNT_CODES,
  AccountCode,
  CHART_OF_ACCOUNTS,
  LedgerRuleError,
  PostingLine,
  PostingRequest,
  mirrorLines,
  postingFingerprint,
  validatePosting,
} from './domain/ledger';
import { parseMinorText } from './domain/money';
import {
  duplicateFinancialEventsTotal,
  idempotencyConflictsTotal,
  ledgerPostFailuresTotal,
  ledgerPostsTotal,
} from './finance-metrics';

export interface PostedTransaction {
  id: string;
  seq: bigint;
  /** true when the idempotency key already existed: nothing was written. */
  replayed: boolean;
}

export interface StoredTransaction {
  id: string;
  seq: bigint;
  type: string;
  currency: string;
  occurredAt: Date;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  reversesTransactionId: string | null;
  lines: Array<{
    account: AccountCode;
    side: 'D' | 'C';
    amount: bigint;
    creatorId: string | null;
    memo: string | null;
  }>;
}

/**
 * W1 — the ONLY writer of the ledger.
 *
 * `post()` runs inside the caller's database transaction, so the business
 * change and its financial effect commit or roll back together. The
 * database independently refuses an unbalanced or partial transaction at
 * commit (deferred constraint trigger) and an update/delete of history.
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);
  private readonly accountCache = new Map<string, Map<AccountCode, string>>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly balances: BalanceService,
  ) {}

  /** account code → id for a currency, creating the chart on first use. */
  async accountIds(
    manager: EntityManager,
    currency: string,
  ): Promise<Map<AccountCode, string>> {
    const cached = this.accountCache.get(currency);
    if (cached) return cached;
    await this.ensureChart(manager, currency);
    const rows = await manager.query<Array<{ code: AccountCode; id: string }>>(
      `SELECT code, id FROM ledger_accounts WHERE currency = $1`,
      [currency],
    );
    const map = new Map(rows.map((r) => [r.code, r.id]));
    if (ACCOUNT_CODES.some((code) => !map.has(code))) {
      throw new LedgerRuleError(
        'UNKNOWN_ACCOUNT',
        `The chart of accounts for ${currency} is incomplete`,
      );
    }
    this.accountCache.set(currency, map);
    return map;
  }

  private async ensureChart(
    manager: EntityManager,
    currency: string,
  ): Promise<void> {
    for (const code of ACCOUNT_CODES) {
      const d = CHART_OF_ACCOUNTS[code];
      await manager.query(
        `INSERT INTO ledger_accounts
           (code, currency, type, normal_side, title, requires_creator, allow_negative)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (code, currency) DO NOTHING`,
        [
          code,
          currency,
          d.type,
          d.normalSide,
          d.title,
          d.requiresCreator,
          d.allowNegative,
        ],
      );
    }
  }

  async post(
    manager: EntityManager,
    request: PostingRequest,
  ): Promise<PostedTransaction> {
    try {
      validatePosting(request);
    } catch (error) {
      ledgerPostsTotal.inc({ type: request.type, outcome: 'rejected' });
      ledgerPostFailuresTotal.inc({
        reason: error instanceof LedgerRuleError ? error.code : 'invalid',
      });
      businessEvent.error('finance.ledger.rejected', 'Ledger posting refused', {
        type: request.type,
        reason: error instanceof LedgerRuleError ? error.code : 'invalid',
      });
      throw new ApiException(
        'FINANCE_RULE_VIOLATION',
        error instanceof Error ? error.message : 'Invalid ledger posting',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const fingerprint = postingFingerprint(request);
    const accounts = await this.accountIds(manager, request.currency);

    const inserted = await manager.query<Array<{ id: string; seq: string }>>(
      `INSERT INTO ledger_transactions
         (type, currency, occurred_at, reference_type, reference_id,
          idempotency_key, request_fingerprint, actor_type, actor_id,
          description, policy_versions, metadata, reverses_transaction_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id, seq::text AS seq`,
      [
        request.type,
        request.currency,
        request.occurredAt,
        request.referenceType,
        request.referenceId,
        request.idempotencyKey,
        fingerprint,
        request.actorType,
        request.actorId ?? null,
        request.description,
        JSON.stringify(request.policyVersions ?? {}),
        JSON.stringify(request.metadata ?? {}),
        request.reversesTransactionId ?? null,
      ],
    );

    if (inserted.length === 0) {
      // Same financial event again: exactly one effect, so write nothing.
      const existing = await manager.query<
        Array<{ id: string; seq: string; request_fingerprint: string }>
      >(
        `SELECT id, seq::text AS seq, request_fingerprint
           FROM ledger_transactions WHERE idempotency_key = $1`,
        [request.idempotencyKey],
      );
      const row = existing[0];
      if (row.request_fingerprint.trim() !== fingerprint) {
        idempotencyConflictsTotal.inc();
        ledgerPostFailuresTotal.inc({ reason: 'idempotency_conflict' });
        businessEvent.error(
          'finance.ledger.idempotency_conflict',
          'Idempotency key reused with different content',
          { type: request.type, referenceType: request.referenceType },
        );
        throw new ApiException(
          'IDEMPOTENCY_CONFLICT',
          'This financial event was already posted with different content',
          HttpStatus.CONFLICT,
        );
      }
      duplicateFinancialEventsTotal.inc({ type: request.type });
      ledgerPostsTotal.inc({ type: request.type, outcome: 'replayed' });
      return { id: row.id, seq: parseMinorText(row.seq), replayed: true };
    }

    const tx = inserted[0];
    const values: unknown[] = [];
    const tuples = request.lines.map((line, index) => {
      const base = values.length;
      values.push(
        tx.id,
        index + 1,
        accounts.get(line.account),
        request.currency,
        line.side,
        line.amount.toString(),
        line.creatorId ?? null,
        line.memo ?? null,
      );
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`;
    });
    await manager.query(
      `INSERT INTO ledger_entries
         (transaction_id, line_no, account_id, currency, side, amount_minor, creator_id, memo)
       VALUES ${tuples.join(',')}`,
      values,
    );
    await this.balances.applyLines(
      manager,
      request.currency,
      parseMinorText(tx.seq),
      request.lines,
    );
    ledgerPostsTotal.inc({ type: request.type, outcome: 'posted' });
    businessEvent.info('finance.ledger.posted', 'Ledger transaction posted', {
      type: request.type,
      referenceType: request.referenceType,
      transactionId: tx.id,
      lines: request.lines.length,
    });
    return { id: tx.id, seq: parseMinorText(tx.seq), replayed: false };
  }

  async findByKey(
    manager: EntityManager,
    idempotencyKey: string,
  ): Promise<StoredTransaction | null> {
    const rows = await manager.query<
      Array<{
        id: string;
        seq: string;
        type: string;
        currency: string;
        occurred_at: Date;
        reference_type: string;
        reference_id: string;
        idempotency_key: string;
        reverses_transaction_id: string | null;
      }>
    >(
      `SELECT id, seq::text AS seq, type, currency, occurred_at, reference_type,
              reference_id, idempotency_key, reverses_transaction_id
         FROM ledger_transactions WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    if (rows.length === 0) return null;
    return this.hydrate(manager, rows[0]);
  }

  async findById(
    manager: EntityManager,
    id: string,
  ): Promise<StoredTransaction | null> {
    const rows = await manager.query<
      Array<{
        id: string;
        seq: string;
        type: string;
        currency: string;
        occurred_at: Date;
        reference_type: string;
        reference_id: string;
        idempotency_key: string;
        reverses_transaction_id: string | null;
      }>
    >(
      `SELECT id, seq::text AS seq, type, currency, occurred_at, reference_type,
              reference_id, idempotency_key, reverses_transaction_id
         FROM ledger_transactions WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    return this.hydrate(manager, rows[0]);
  }

  private async hydrate(
    manager: EntityManager,
    row: {
      id: string;
      seq: string;
      type: string;
      currency: string;
      occurred_at: Date;
      reference_type: string;
      reference_id: string;
      idempotency_key: string;
      reverses_transaction_id: string | null;
    },
  ): Promise<StoredTransaction> {
    const lines = await manager.query<
      Array<{
        code: AccountCode;
        side: 'D' | 'C';
        amount: string;
        creator_id: string | null;
        memo: string | null;
      }>
    >(
      `SELECT a.code, e.side, e.amount_minor::text AS amount, e.creator_id, e.memo
         FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id
        WHERE e.transaction_id = $1 ORDER BY e.line_no`,
      [row.id],
    );
    return {
      id: row.id,
      seq: parseMinorText(row.seq),
      type: row.type,
      currency: row.currency,
      occurredAt: new Date(row.occurred_at),
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      idempotencyKey: row.idempotency_key,
      reversesTransactionId: row.reverses_transaction_id,
      lines: lines.map((l) => ({
        account: l.code,
        side: l.side,
        amount: parseMinorText(l.amount),
        creatorId: l.creator_id,
        memo: l.memo,
      })),
    };
  }

  /**
   * W1.3 — the only legal "correction": a REVERSAL that mirrors the original
   * exactly (once; the database refuses a second one), to be followed by a
   * CORRECTION transaction where needed. The original is never touched.
   */
  async reverse(
    manager: EntityManager,
    originalId: string,
    context: {
      actorType: PostingRequest['actorType'];
      actorId: string | null;
      reason: string;
      occurredAt: Date;
    },
  ): Promise<PostedTransaction> {
    const original = await this.findById(manager, originalId);
    if (!original) {
      throw new ApiException(
        'NOT_FOUND',
        'Ledger transaction not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (original.type === 'REVERSAL') {
      throw new ApiException(
        'FINANCE_RULE_VIOLATION',
        'A reversal cannot itself be reversed; post a correction instead',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const lines: PostingLine[] = mirrorLines(
      original.lines.map((l) => ({
        account: l.account,
        side: l.side,
        amount: l.amount,
        creatorId: l.creatorId,
        memo: l.memo ?? undefined,
      })),
    );
    return this.post(manager, {
      type: 'REVERSAL',
      currency: original.currency,
      occurredAt: context.occurredAt,
      referenceType: 'ledger_transaction',
      referenceId: original.id,
      idempotencyKey: `reversal:${original.id}`,
      actorType: context.actorType,
      actorId: context.actorId,
      description: `Reversal of ${original.type}: ${context.reason}`.slice(
        0,
        500,
      ),
      reversesTransactionId: original.id,
      lines,
    });
  }
}
