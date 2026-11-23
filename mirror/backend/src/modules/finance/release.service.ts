import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { businessEvent } from '../../common/logging/app-logger';
import { parseMinorText } from './domain/money';
import { FinanceClock } from './finance-clock';
import {
  jobRetriesTotal,
  releaseRunsTotal,
  releasedEntitlementsTotal,
} from './finance-metrics';
import { LedgerService } from './ledger.service';
import { RecoveryService } from './recovery.service';

export interface ReleaseRunResult {
  scanned: number;
  released: number;
  failed: number;
  skipped: number;
}

/**
 * W3.2 — HELD → AVAILABLE once the holding window has passed.
 *
 * Each entitlement is released in ITS OWN transaction under a row lock, with
 * the ledger idempotency key `release:{entitlementId}` as the last line of
 * defence: a crashed run, a second worker or a re-run releases each sale
 * exactly once, and one failing row cannot block the rest.
 */
@Injectable()
export class ReleaseService {
  private readonly logger = new Logger(ReleaseService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
    private readonly recovery: RecoveryService,
    private readonly clock: FinanceClock,
  ) {}

  async releaseDue(batchSize = 200): Promise<ReleaseRunResult> {
    const now = this.clock.now();
    const due = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM creator_entitlements
        WHERE status = 'HELD' AND held_until <= $1
        ORDER BY held_until, id LIMIT $2`,
      [now, batchSize],
    );
    const result: ReleaseRunResult = {
      scanned: due.length,
      released: 0,
      failed: 0,
      skipped: 0,
    };
    for (const row of due) {
      try {
        const outcome = await this.releaseOne(row.id, now);
        if (outcome === 'released') result.released += 1;
        else result.skipped += 1;
      } catch (error) {
        result.failed += 1;
        jobRetriesTotal.inc({ job: 'finance_release' });
        businessEvent.error(
          'finance.release.failed',
          'Entitlement release failed; it will be retried',
          {
            entitlementId: row.id,
            message: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
    releaseRunsTotal.inc({ outcome: result.failed > 0 ? 'partial' : 'ok' });
    releasedEntitlementsTotal.inc(result.released);
    return result;
  }

  /** Releases one entitlement. 'skipped' = someone else got there first / not due. */
  async releaseOne(
    entitlementId: string,
    now: Date = this.clock.now(),
  ): Promise<'released' | 'skipped'> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<
        Array<{
          id: string;
          creator_id: string;
          currency: string;
          creator_share_minor: string;
          refunded_creator_minor: string;
        }>
      >(
        `SELECT id, creator_id, currency, creator_share_minor::text, refunded_creator_minor::text
           FROM creator_entitlements
          WHERE id = $1 AND status = 'HELD' AND held_until <= $2
          FOR UPDATE SKIP LOCKED`,
        [entitlementId, now],
      );
      const ent = rows[0];
      if (!ent) return 'skipped';
      const amount =
        parseMinorText(ent.creator_share_minor) -
        parseMinorText(ent.refunded_creator_minor);
      if (amount > 0n) {
        await this.ledger.post(manager, {
          type: 'RELEASE',
          currency: ent.currency,
          occurredAt: now,
          referenceType: 'creator_entitlement',
          referenceId: ent.id,
          idempotencyKey: `release:${ent.id}`,
          actorType: 'system',
          description: `Holding period ended for entitlement ${ent.id}`,
          lines: [
            {
              account: 'CREATOR_HELD',
              side: 'D',
              amount,
              creatorId: ent.creator_id,
            },
            {
              account: 'CREATOR_AVAILABLE',
              side: 'C',
              amount,
              creatorId: ent.creator_id,
            },
          ],
        });
        // Newly available money first repays any outstanding recovery.
        await this.recovery.offset(manager, {
          creatorId: ent.creator_id,
          currency: ent.currency,
          idempotencyKey: `recovery_offset:release:${ent.id}`,
          referenceType: 'creator_entitlement',
          referenceId: ent.id,
          occurredAt: now,
          actorType: 'system',
          actorId: null,
          description: `Recovery offset on release of entitlement ${ent.id}`,
        });
      }
      await manager.query(
        `UPDATE creator_entitlements
            SET status = 'RELEASED', released_at = $2, version = version + 1, updated_at = now()
          WHERE id = $1`,
        [ent.id, now],
      );
      return 'released';
    });
  }
}
