import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { BalanceService } from './balance.service';
import { ActorType } from './domain/ledger';
import { LedgerService } from './ledger.service';

/**
 * W4.4 — repaying a creator's RECOVERY receivable (the negative-balance
 * state created when a refund exceeded what the creator still had
 * available). A recovery is only ever cleared by offsetting it against the
 * creator's own AVAILABLE funds, as a normal balanced ledger transaction.
 */
@Injectable()
export class RecoveryService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly balances: BalanceService,
  ) {}

  /**
   * Offsets min(recovery, available) under the balance lock.
   * Returns the amount offset (0 when there was nothing to do).
   */
  async offset(
    manager: EntityManager,
    input: {
      creatorId: string;
      currency: string;
      idempotencyKey: string;
      referenceType: string;
      referenceId: string;
      occurredAt: Date;
      actorType: ActorType;
      actorId: string | null;
      description: string;
    },
  ): Promise<bigint> {
    const balance = await this.balances.lock(
      manager,
      input.creatorId,
      input.currency,
    );
    const amount =
      balance.recovery < balance.available
        ? balance.recovery
        : balance.available;
    if (amount <= 0n) return 0n;
    const posted = await this.ledger.post(manager, {
      type: 'RECOVERY_OFFSET',
      currency: input.currency,
      occurredAt: input.occurredAt,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      actorType: input.actorType,
      actorId: input.actorId,
      description: input.description,
      lines: [
        {
          account: 'CREATOR_AVAILABLE',
          side: 'D',
          amount,
          creatorId: input.creatorId,
        },
        {
          account: 'CREATOR_RECOVERY',
          side: 'C',
          amount,
          creatorId: input.creatorId,
        },
      ],
    });
    return posted.replayed ? 0n : amount;
  }
}
