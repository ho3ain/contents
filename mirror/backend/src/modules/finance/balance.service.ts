import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import {
  CreatorBuckets,
  EntryFact,
  PostingLine,
  replayCreatorBuckets,
} from './domain/ledger';
import { parseMinorText } from './domain/money';

export interface BalanceRow {
  creatorId: string;
  currency: string;
  held: bigint;
  available: bigint;
  payoutPending: bigint;
  paid: bigint;
  recovery: bigint;
  version: bigint;
}

interface BalanceDb {
  creator_id: string;
  currency: string;
  held_minor: string;
  available_minor: string;
  payout_pending_minor: string;
  paid_minor: string;
  recovery_minor: string;
  version: string;
}

const fromDb = (row: BalanceDb): BalanceRow => ({
  creatorId: row.creator_id,
  currency: row.currency,
  held: parseMinorText(row.held_minor),
  available: parseMinorText(row.available_minor),
  payoutPending: parseMinorText(row.payout_pending_minor),
  paid: parseMinorText(row.paid_minor),
  recovery: parseMinorText(row.recovery_minor),
  version: parseMinorText(row.version),
});

export interface BalanceDelta {
  held: bigint;
  available: bigint;
  payoutPending: bigint;
  paid: bigint;
  recovery: bigint;
}

/** The effect of ledger lines on a creator's buckets (the projection rule). */
export function deltasFromLines(
  lines: readonly PostingLine[],
): Map<string, BalanceDelta> {
  const result = new Map<string, BalanceDelta>();
  const bucket = (creatorId: string): BalanceDelta => {
    let delta = result.get(creatorId);
    if (!delta) {
      delta = {
        held: 0n,
        available: 0n,
        payoutPending: 0n,
        paid: 0n,
        recovery: 0n,
      };
      result.set(creatorId, delta);
    }
    return delta;
  };
  for (const line of lines) {
    if (!line.creatorId) continue;
    const credit = line.side === 'C' ? line.amount : -line.amount;
    switch (line.account) {
      case 'CREATOR_HELD':
        bucket(line.creatorId).held += credit;
        break;
      case 'CREATOR_AVAILABLE':
        bucket(line.creatorId).available += credit;
        break;
      case 'CREATOR_PAYOUT_PENDING':
        bucket(line.creatorId).payoutPending += credit;
        break;
      case 'CREATOR_RECOVERY':
        // Asset (debit-normal): a debit increases the receivable.
        bucket(line.creatorId).recovery -= credit;
        break;
      case 'PLATFORM_CASH':
        // Cash leaving the platform for this creator is a CREDIT.
        bucket(line.creatorId).paid += credit;
        break;
      default:
        break;
    }
  }
  return result;
}

/**
 * W3 — the creator balance PROJECTION.
 *
 * Written only here, only inside the transaction that inserts the ledger
 * lines (LedgerService.post calls `applyLines`). The row is the lock that
 * serialises everything that moves a creator's money (release, refund,
 * payout reservation): `lock()` takes it FOR UPDATE and every decision about
 * "is there enough available" is made on the value read under that lock.
 */
@Injectable()
export class BalanceService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Creates the row if missing and locks it FOR UPDATE for this transaction. */
  async lock(
    manager: EntityManager,
    creatorId: string,
    currency: string,
  ): Promise<BalanceRow> {
    await manager.query(
      `INSERT INTO creator_balances (creator_id, currency)
       VALUES ($1, $2) ON CONFLICT (creator_id, currency) DO NOTHING`,
      [creatorId, currency],
    );
    const rows = await manager.query<BalanceDb[]>(
      `SELECT * FROM creator_balances
        WHERE creator_id = $1 AND currency = $2 FOR UPDATE`,
      [creatorId, currency],
    );
    return fromDb(rows[0]);
  }

  async get(
    creatorId: string,
    currency: string,
    manager?: EntityManager,
  ): Promise<BalanceRow> {
    const runner = manager ?? this.dataSource.manager;
    const rows = await runner.query<BalanceDb[]>(
      `SELECT * FROM creator_balances WHERE creator_id = $1 AND currency = $2`,
      [creatorId, currency],
    );
    if (rows.length === 0) {
      return {
        creatorId,
        currency,
        held: 0n,
        available: 0n,
        payoutPending: 0n,
        paid: 0n,
        recovery: 0n,
        version: 0n,
      };
    }
    return fromDb(rows[0]);
  }

  /**
   * Applies the deltas of freshly inserted ledger lines. A CHECK constraint
   * rejects any result below zero, which aborts the posting transaction:
   * an accidental negative bucket cannot be written.
   */
  async applyLines(
    manager: EntityManager,
    currency: string,
    seq: bigint,
    lines: readonly PostingLine[],
  ): Promise<void> {
    const deltas = deltasFromLines(lines);
    // Deterministic order → no deadlock between two postings touching the same creators.
    const ids = [...deltas.keys()].sort();
    for (const creatorId of ids) {
      const d = deltas.get(creatorId) as BalanceDelta;
      try {
        // Ensure the row exists first: a single INSERT .. ON CONFLICT would
        // have its proposed (negative-delta) tuple checked against the
        // CHECK (>= 0) constraints before the conflict is resolved.
        await manager.query(
          `INSERT INTO creator_balances (creator_id, currency)
           VALUES ($1, $2) ON CONFLICT (creator_id, currency) DO NOTHING`,
          [creatorId, currency],
        );
        await manager.query(
          `UPDATE creator_balances SET
             held_minor = held_minor + $3::bigint,
             available_minor = available_minor + $4::bigint,
             payout_pending_minor = payout_pending_minor + $5::bigint,
             paid_minor = paid_minor + $6::bigint,
             recovery_minor = recovery_minor + $7::bigint,
             last_ledger_seq = GREATEST(last_ledger_seq, $8::bigint),
             version = version + 1,
             updated_at = now()
           WHERE creator_id = $1 AND currency = $2`,
          [
            creatorId,
            currency,
            d.held.toString(),
            d.available.toString(),
            d.payoutPending.toString(),
            d.paid.toString(),
            d.recovery.toString(),
            seq.toString(),
          ],
        );
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          (error as { code?: string }).code === '23514'
        ) {
          throw new ApiException(
            'INSUFFICIENT_FUNDS',
            'The posting would make a creator balance bucket negative and was rejected',
            HttpStatus.CONFLICT,
          );
        }
        throw error;
      }
    }
  }

  /** Reads every ledger entry of a creator (for replay). */
  async entriesOf(
    manager: EntityManager,
    creatorId: string,
    currency: string,
  ): Promise<EntryFact[]> {
    const rows = await manager.query<
      Array<{ code: EntryFact['account']; side: 'D' | 'C'; amount: string }>
    >(
      `SELECT a.code, e.side, e.amount_minor::text AS amount
         FROM ledger_entries e
         JOIN ledger_accounts a ON a.id = e.account_id
        WHERE e.creator_id = $1 AND e.currency = $2`,
      [creatorId, currency],
    );
    return rows.map((r) => ({
      account: r.code,
      side: r.side,
      amount: parseMinorText(r.amount),
      creatorId,
    }));
  }

  /** W3.4 — recomputes the buckets from the ledger alone. */
  async replay(
    creatorId: string,
    currency: string,
    manager?: EntityManager,
  ): Promise<CreatorBuckets> {
    const runner = manager ?? this.dataSource.manager;
    return replayCreatorBuckets(
      creatorId,
      await this.entriesOf(runner, creatorId, currency),
    );
  }

  /**
   * `rebuildCreatorBalance` — replay vs projection, from ONE consistent
   * snapshot. Reports a discrepancy; it never edits the ledger. With
   * `repair: true` ONLY the projection row is replaced by the replayed value
   * (the ledger is the authority), and the caller records the audit event.
   */
  async rebuildCreatorBalance(
    creatorId: string,
    currency: string,
    options: { repair?: boolean } = {},
  ): Promise<{
    creatorId: string;
    currency: string;
    replay: CreatorBuckets;
    projection: BalanceRow;
    matches: boolean;
    repaired: boolean;
  }> {
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const replay = await this.replay(creatorId, currency, manager);
      const projection = await this.get(creatorId, currency, manager);
      const matches =
        replay.held === projection.held &&
        replay.available === projection.available &&
        replay.payoutPending === projection.payoutPending &&
        replay.paid === projection.paid &&
        replay.recovery === projection.recovery;
      let repaired = false;
      if (!matches && options.repair) {
        await manager.query(
          `INSERT INTO creator_balances AS b
             (creator_id, currency, held_minor, available_minor,
              payout_pending_minor, paid_minor, recovery_minor, version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,1)
           ON CONFLICT (creator_id, currency) DO UPDATE SET
             held_minor = EXCLUDED.held_minor,
             available_minor = EXCLUDED.available_minor,
             payout_pending_minor = EXCLUDED.payout_pending_minor,
             paid_minor = EXCLUDED.paid_minor,
             recovery_minor = EXCLUDED.recovery_minor,
             version = b.version + 1, updated_at = now()`,
          [
            creatorId,
            currency,
            replay.held.toString(),
            replay.available.toString(),
            replay.payoutPending.toString(),
            replay.paid.toString(),
            replay.recovery.toString(),
          ],
        );
        repaired = true;
      }
      return { creatorId, currency, replay, projection, matches, repaired };
    });
  }
}
