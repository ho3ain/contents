import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { businessEvent } from '../../common/logging/app-logger';
import { BalanceService } from './balance.service';
import { BankAccountsService } from './bank-accounts.service';
import { CreatorResolver } from './creator-resolver';
import {
  PayoutEligibility,
  PayoutIneligibleReason,
  evaluatePayoutEligibility,
} from './domain/payout-rules';
import {
  formatMinorToMajor,
  parseMajorToMinor,
  parseMinorText,
} from './domain/money';
import {
  IllegalTransitionError,
  PAYOUT_MACHINE,
  assertTransition,
} from './domain/state-machines';
import { FinanceActor, SYSTEM_ACTOR } from './finance-actor';
import { FinanceClock } from './finance-clock';
import { kycPayoutBlocksTotal, payoutsTotal } from './finance-metrics';
import { FinancialAuditService } from './financial-audit.service';
import { FinancialHoldsService } from './financial-holds.service';
import { KycService } from './kyc.service';
import { LedgerService } from './ledger.service';
import { PAYOUT_PROVIDER, type PayoutProviderPort } from './payout-provider';
import { PolicyService } from './policy.service';
import { RecoveryService } from './recovery.service';
import { returned } from './sql';

type PayoutStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REJECTED';

interface PayoutRow {
  id: string;
  creator_id: string;
  currency: string;
  amount_minor: string;
  recovery_offset_minor: string;
  kind: 'MANUAL' | 'AUTOMATIC';
  status: PayoutStatus;
  idempotency_key: string;
  bank_account_id: string;
  iban_last4: string;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  processing_at: Date | null;
  paid_at: Date | null;
  closed_at: Date | null;
  bank_reference: string | null;
  status_reason: string | null;
  created_at: Date;
}

const IN_FLIGHT: PayoutStatus[] = ['REQUESTED', 'APPROVED', 'PROCESSING'];
const VOIDED: PayoutStatus[] = ['REJECTED', 'CANCELLED', 'FAILED'];

export interface AutoRunResult {
  scanned: number;
  created: number;
  skipped: number;
  failed: number;
}

/**
 * W5/W6 — payouts.
 *
 * The creator's money is RESERVED (AVAILABLE → PAYOUT_PENDING) in the same
 * transaction that creates the payout row, under the creator's balance-row
 * lock, so two simultaneous requests can never reserve the same funds and a
 * payout can never exceed what was available. Everything after that is a
 * state machine over the row (locked FOR UPDATE), every edge posts its own
 * idempotent ledger transaction, and eligibility (KYC, hold, bank account)
 * is re-evaluated at approval, processing and settlement — not only at
 * request time.
 */
@Injectable()
export class PayoutsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
    private readonly balances: BalanceService,
    private readonly recovery: RecoveryService,
    private readonly policies: PolicyService,
    private readonly kyc: KycService,
    private readonly banks: BankAccountsService,
    private readonly holds: FinancialHoldsService,
    private readonly audit: FinancialAuditService,
    private readonly creators: CreatorResolver,
    private readonly clock: FinanceClock,
    @Inject(PAYOUT_PROVIDER) private readonly provider: PayoutProviderPort,
  ) {}

  // ------------------------------------------------------------------ views

  private view(row: PayoutRow) {
    return {
      id: row.id,
      creatorId: row.creator_id,
      currency: row.currency,
      amount: formatMinorToMajor(
        parseMinorText(row.amount_minor),
        row.currency,
      ),
      amountMinor: row.amount_minor,
      recoveryOffset: formatMinorToMajor(
        parseMinorText(row.recovery_offset_minor),
        row.currency,
      ),
      kind: row.kind,
      status: row.status,
      ibanLast4: row.iban_last4,
      requestedAt: row.created_at,
      approvedAt: row.approved_at,
      processingAt: row.processing_at,
      paidAt: row.paid_at,
      closedAt: row.closed_at,
      bankReference: row.bank_reference,
      statusReason: row.status_reason,
      provider: this.provider.name,
    };
  }

  // ------------------------------------------------------------ eligibility

  private async gather(
    manager: EntityManager,
    creatorId: string,
    currency: string,
    kind: 'MANUAL' | 'AUTOMATIC',
    requested: bigint | null,
    now: Date,
    excludePayoutId?: string,
  ) {
    const balance = await this.balances.lock(manager, creatorId, currency);
    const kycPolicy = await this.policies.resolve('KYC_ELIGIBILITY', now, {
      manager,
    });
    const payoutPolicy = await this.policies.resolve('PAYOUT', now, {
      manager,
    });
    const kycState = await this.kyc.stateOf(manager, creatorId, true);
    const bank = await this.banks.activeRow(manager, creatorId, true);
    const held = await this.holds.isHeld(manager, creatorId);
    const open = await manager.query<unknown[]>(
      `SELECT 1 FROM payouts WHERE creator_id = $1 AND currency = $2
          AND status IN ('REQUESTED','APPROVED','PROCESSING') AND ($3::uuid IS NULL OR id <> $3)`,
      [creatorId, currency, excludePayoutId ?? null],
    );
    const last = await manager.query<Array<{ at: Date }>>(
      `SELECT max(created_at) AS at FROM payouts
        WHERE creator_id = $1 AND currency = $2 AND kind = $3
          AND status NOT IN ('REJECTED','CANCELLED','FAILED')`,
      [creatorId, currency, kind],
    );
    const eligibility = evaluatePayoutEligibility({
      kind,
      kycState,
      kycAllowedStates: kycPolicy.params.payoutAllowedStates,
      hasActiveBankAccount: bank !== null,
      bankAccountExists: bank !== null,
      financialHold: held,
      openPayoutExists: open.length > 0,
      available: balance.available,
      recovery: balance.recovery,
      requested,
      now,
      lastSameKindAt: last[0]?.at ? new Date(last[0].at) : null,
      cooldownDays: payoutPolicy.params.requestCooldownDays,
      autoIntervalDays: payoutPolicy.params.autoIntervalDays,
    });
    return { balance, kycPolicy, payoutPolicy, kycState, bank, eligibility };
  }

  private refuse(eligibility: PayoutEligibility): never {
    const only =
      eligibility.reasons.length === 1 ? eligibility.reasons[0] : null;
    if (eligibility.reasons.includes('KYC_NOT_APPROVED'))
      kycPayoutBlocksTotal.inc();
    throw new ApiException(
      only === 'KYC_NOT_APPROVED' ? 'KYC_REQUIRED' : 'PAYOUT_NOT_ELIGIBLE',
      only === 'KYC_NOT_APPROVED'
        ? 'Identity verification (KYC) must be approved before a payout'
        : 'A payout is not possible right now',
      HttpStatus.CONFLICT,
      {
        reasons: eligibility.reasons,
        nextEligibleAt: eligibility.nextEligibleAt,
        payable: eligibility.payable.toString(),
      },
    );
  }

  /** Read-only view of what a creator may do now (UI "can I request a payout?"). */
  async eligibilityForCreator(userId: string) {
    const creatorId = await this.creators.creatorIdOfUser(userId);
    const currency = 'IRR';
    return this.dataSource.transaction(async (manager) => {
      const g = await this.gather(
        manager,
        creatorId,
        currency,
        'MANUAL',
        null,
        this.clock.now(),
      );
      return {
        currency,
        eligible: g.eligibility.eligible,
        reasons: g.eligibility.reasons,
        nextEligibleAt: g.eligibility.nextEligibleAt,
        payable: formatMinorToMajor(g.eligibility.payable, currency),
        recoveryOutstanding: formatMinorToMajor(g.balance.recovery, currency),
        kycState: g.kycState,
        policy: {
          cooldownDays: g.payoutPolicy.params.requestCooldownDays,
          autoIntervalDays: g.payoutPolicy.params.autoIntervalDays,
        },
      };
    });
  }

  // ----------------------------------------------------------------- create

  async requestManual(
    actor: FinanceActor,
    input: {
      amount?: string | null;
      idempotencyKey: string;
      currency?: string;
    },
  ) {
    const creatorId = await this.creators.creatorIdOfUser(actor.id as string);
    const currency = input.currency ?? 'IRR';
    const requested =
      input.amount === undefined || input.amount === null || input.amount === ''
        ? null
        : this.parseAmount(input.amount, currency);
    return this.dataSource.transaction(async (manager) => {
      const created = await this.create(manager, {
        creatorId,
        currency,
        kind: 'MANUAL',
        requested,
        actor,
        idempotencyKey: `manual:${creatorId}:${input.idempotencyKey}`,
      });
      return this.view(created);
    });
  }

  private parseAmount(text: string, currency: string): bigint {
    try {
      return parseMajorToMinor(text, currency);
    } catch {
      throw new ApiException(
        'VALIDATION_ERROR',
        'The amount is not a valid money amount',
      );
    }
  }

  private async create(
    manager: EntityManager,
    input: {
      creatorId: string;
      currency: string;
      kind: 'MANUAL' | 'AUTOMATIC';
      requested: bigint | null;
      actor: FinanceActor;
      idempotencyKey: string;
    },
  ): Promise<PayoutRow> {
    if (
      input.idempotencyKey.length > 190 ||
      !/^[A-Za-z0-9:_.-]{3,190}$/.test(input.idempotencyKey)
    ) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Idempotency key must be 3–190 characters of [A-Za-z0-9:_.-]',
      );
    }
    const now = this.clock.now();
    // Serialise everything that moves this creator's money (balance row lock),
    // THEN look for a replay: a retry returns the original, never a second payout.
    await this.balances.lock(manager, input.creatorId, input.currency);
    const prior = await manager.query<PayoutRow[]>(
      `SELECT * FROM payouts WHERE idempotency_key = $1`,
      [input.idempotencyKey],
    );
    if (prior[0]) {
      if (prior[0].creator_id !== input.creatorId) {
        throw new ApiException(
          'IDEMPOTENCY_CONFLICT',
          'Idempotency key already used',
          HttpStatus.CONFLICT,
        );
      }
      payoutsTotal.inc({ status: 'replayed', kind: input.kind });
      return prior[0];
    }

    const g = await this.gather(
      manager,
      input.creatorId,
      input.currency,
      input.kind,
      input.requested,
      now,
    );
    if (!g.eligibility.eligible || !g.bank) {
      payoutsTotal.inc({ status: 'refused', kind: input.kind });
      this.refuse(g.eligibility);
    }
    const bank = g.bank;
    const amount = g.eligibility.amount;
    const autoApprove =
      input.kind === 'AUTOMATIC' &&
      !g.payoutPolicy.params.autoRequiresAdminApproval;

    let inserted: PayoutRow[];
    try {
      inserted = await manager.query<PayoutRow[]>(
        `INSERT INTO payouts
           (creator_id, currency, amount_minor, recovery_offset_minor, kind, status, idempotency_key,
            bank_account_id, iban_last4, requested_by, approved_at, policy_snapshot, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [
          input.creatorId,
          input.currency,
          amount.toString(),
          g.eligibility.recoveryOffset.toString(),
          input.kind,
          autoApprove ? 'APPROVED' : 'REQUESTED',
          input.idempotencyKey,
          bank.id,
          bank.iban_last4,
          input.actor.id,
          autoApprove ? now : null,
          JSON.stringify({
            payoutPolicy: g.payoutPolicy.id,
            kycPolicy: g.kycPolicy.id,
            provider: this.provider.name,
          }),
          now,
        ],
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        this.refuse({
          ...g.eligibility,
          reasons: ['OPEN_PAYOUT_EXISTS'] as PayoutIneligibleReason[],
        });
      }
      throw error;
    }
    const payout = inserted[0];

    if (g.eligibility.recoveryOffset > 0n) {
      await this.recovery.offset(manager, {
        creatorId: input.creatorId,
        currency: input.currency,
        idempotencyKey: `recovery_offset:payout:${payout.id}`,
        referenceType: 'payout',
        referenceId: payout.id,
        occurredAt: now,
        actorType: input.actor.type,
        actorId: input.actor.id,
        description: `Recovery offset before payout ${payout.id}`,
      });
    }
    const reserve = await this.ledger.post(manager, {
      type: 'PAYOUT_RESERVE',
      currency: input.currency,
      occurredAt: now,
      referenceType: 'payout',
      referenceId: payout.id,
      idempotencyKey: `payout_reserve:${payout.id}`,
      actorType: input.actor.type,
      actorId: input.actor.id,
      description: `Funds reserved for payout ${payout.id}`,
      policyVersions: {
        payout: g.payoutPolicy.id,
        kycEligibility: g.kycPolicy.id,
      },
      lines: [
        {
          account: 'CREATOR_AVAILABLE',
          side: 'D',
          amount,
          creatorId: input.creatorId,
        },
        {
          account: 'CREATOR_PAYOUT_PENDING',
          side: 'C',
          amount,
          creatorId: input.creatorId,
        },
      ],
    });
    await manager.query(
      `UPDATE payouts SET reserve_transaction_id = $2 WHERE id = $1`,
      [payout.id, reserve.id],
    );
    await this.audit.record(manager, {
      actor: input.actor,
      action: 'finance.payout.requested',
      targetType: 'payout',
      targetId: payout.id,
      amountMinor: amount,
      currency: input.currency,
      after: {
        kind: input.kind,
        status: payout.status,
        recoveryOffset: g.eligibility.recoveryOffset.toString(),
      },
      ledgerTransactionId: reserve.id,
    });
    payoutsTotal.inc({ status: 'requested', kind: input.kind });
    return { ...payout, reserve_transaction_id: reserve.id } as PayoutRow;
  }

  /**
   * Daily automatic settlement (frozen policy: every 14 days). One payout per
   * creator per UTC day at most (idempotency key), each in its own
   * transaction so a failing creator cannot block the others.
   */
  async runAutomatic(currency = 'IRR'): Promise<AutoRunResult> {
    const now = this.clock.now();
    const day = now.toISOString().slice(0, 10);
    const candidates = await this.dataSource.query<
      Array<{ creator_id: string }>
    >(
      `SELECT creator_id FROM creator_balances WHERE currency = $1 AND available_minor > 0 ORDER BY creator_id`,
      [currency],
    );
    const result: AutoRunResult = {
      scanned: candidates.length,
      created: 0,
      skipped: 0,
      failed: 0,
    };
    for (const { creator_id: creatorId } of candidates) {
      try {
        await this.dataSource.transaction(async (manager) => {
          await this.create(manager, {
            creatorId,
            currency,
            kind: 'AUTOMATIC',
            requested: null,
            actor: SYSTEM_ACTOR,
            idempotencyKey: `auto:${creatorId}:${currency}:${day}`,
          });
        });
        result.created += 1;
      } catch (error) {
        if (error instanceof ApiException) result.skipped += 1;
        else {
          result.failed += 1;
          businessEvent.error(
            'finance.payout.auto_failed',
            'Automatic payout failed for a creator',
            {
              creatorId,
              message: error instanceof Error ? error.message : String(error),
            },
          );
        }
      }
    }
    return result;
  }

  // ------------------------------------------------------------ transitions

  private async lockPayout(
    manager: EntityManager,
    id: string,
  ): Promise<PayoutRow> {
    const rows = await manager.query<PayoutRow[]>(
      `SELECT * FROM payouts WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!rows[0])
      throw new ApiException(
        'NOT_FOUND',
        'Payout not found',
        HttpStatus.NOT_FOUND,
      );
    return rows[0];
  }

  private assertEdge(row: PayoutRow, to: PayoutStatus): void {
    try {
      assertTransition(PAYOUT_MACHINE, row.status, to);
    } catch (error) {
      if (error instanceof IllegalTransitionError) {
        throw new ApiException(
          'FINANCE_RULE_VIOLATION',
          `A payout in status ${row.status} cannot become ${to}`,
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  /** Re-checks KYC / hold / bank at a later step (never trusts the request-time answer). */
  private async recheck(
    manager: EntityManager,
    row: PayoutRow,
    requireVerifiedBank: boolean,
  ): Promise<void> {
    const now = this.clock.now();
    const kycPolicy = await this.policies.resolve('KYC_ELIGIBILITY', now, {
      manager,
    });
    const kycState = await this.kyc.stateOf(manager, row.creator_id, true);
    const reasons: PayoutIneligibleReason[] = [];
    if (!kycPolicy.params.payoutAllowedStates.includes(kycState))
      reasons.push('KYC_NOT_APPROVED');
    if (await this.holds.isHeld(manager, row.creator_id))
      reasons.push('FINANCIAL_HOLD');
    const bank = await this.banks.activeRow(manager, row.creator_id, true);
    if (!bank) reasons.push('NO_BANK_ACCOUNT');
    else if (bank.id !== row.bank_account_id)
      reasons.push('BANK_ACCOUNT_INACTIVE');
    else if (requireVerifiedBank && bank.ownership_status !== 'ADMIN_VERIFIED')
      reasons.push('BANK_ACCOUNT_INACTIVE');
    if (reasons.length > 0) {
      this.refuse({
        eligible: false,
        reasons,
        recoveryOffset: 0n,
        payable: 0n,
        amount: 0n,
        nextEligibleAt: null,
      });
    }
  }

  async approve(actor: FinanceActor, payoutId: string) {
    return this.dataSource.transaction(async (manager) => {
      const row = await this.lockPayout(manager, payoutId);
      if (row.status === 'APPROVED' && row.approved_by === actor.id)
        return this.view(row); // idempotent
      this.assertEdge(row, 'APPROVED');
      const owner = await this.creators.userIdOfCreator(
        row.creator_id,
        manager,
      );
      if (owner === actor.id) {
        throw new ApiException(
          'FORBIDDEN',
          'You cannot approve your own payout',
          HttpStatus.FORBIDDEN,
        );
      }
      await this.recheck(manager, row, true);
      const updated = returned<PayoutRow[]>(
        await manager.query(
          `UPDATE payouts SET status='APPROVED', approved_by=$2, approved_at=$3, version=version+1, updated_at=now()
          WHERE id=$1 RETURNING *`,
          [payoutId, actor.id, this.clock.now()],
        ),
      );
      await this.audit.record(manager, {
        actor,
        action: 'finance.payout.approved',
        targetType: 'payout',
        targetId: payoutId,
        amountMinor: parseMinorText(row.amount_minor),
        currency: row.currency,
        before: { status: row.status },
        after: { status: 'APPROVED' },
      });
      payoutsTotal.inc({ status: 'approved', kind: row.kind });
      return this.view(updated[0]);
    });
  }

  async startProcessing(actor: FinanceActor, payoutId: string) {
    return this.dataSource.transaction(async (manager) => {
      const row = await this.lockPayout(manager, payoutId);
      if (row.status === 'PROCESSING') return this.view(row); // idempotent
      this.assertEdge(row, 'PROCESSING');
      await this.recheck(manager, row, true);
      const updated = returned<PayoutRow[]>(
        await manager.query(
          `UPDATE payouts SET status='PROCESSING', processing_at=$2, version=version+1, updated_at=now()
          WHERE id=$1 RETURNING *`,
          [payoutId, this.clock.now()],
        ),
      );
      await this.audit.record(manager, {
        actor,
        action: 'finance.payout.processing',
        targetType: 'payout',
        targetId: payoutId,
        amountMinor: parseMinorText(row.amount_minor),
        currency: row.currency,
        before: { status: row.status },
        after: { status: 'PROCESSING' },
      });
      return this.view(updated[0]);
    });
  }

  /** The operator needs the full Shaba to make the transfer. Audited. */
  async destinationForTransfer(actor: FinanceActor, payoutId: string) {
    return this.dataSource.transaction(async (manager) => {
      const row = await this.lockPayout(manager, payoutId);
      if (row.status !== 'APPROVED' && row.status !== 'PROCESSING') {
        throw new ApiException(
          'CONFLICT',
          'The destination is only available for approved payouts',
          HttpStatus.CONFLICT,
        );
      }
      await this.recheck(manager, row, true);
      const destination = await this.banks.revealForTransfer(
        manager,
        actor,
        row.bank_account_id,
        payoutId,
      );
      return {
        payoutId,
        amount: formatMinorToMajor(
          parseMinorText(row.amount_minor),
          row.currency,
        ),
        currency: row.currency,
        ...destination,
      };
    });
  }

  async markPaid(actor: FinanceActor, payoutId: string, bankReference: string) {
    const reference = this.provider.validateReference(bankReference);
    if (!reference) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'A bank transfer reference (6–64 letters/digits) is required',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const row = await this.lockPayout(manager, payoutId);
      if (row.status === 'PAID') {
        if (row.bank_reference === reference) return this.view(row); // idempotent replay
        throw new ApiException(
          'CONFLICT',
          'This payout is already paid with a different reference',
          HttpStatus.CONFLICT,
        );
      }
      this.assertEdge(row, 'PAID');
      await this.recheck(manager, row, true);
      const amount = parseMinorText(row.amount_minor);
      const now = this.clock.now();
      const posted = await this.ledger.post(manager, {
        type: 'PAYOUT_PAID',
        currency: row.currency,
        occurredAt: now,
        referenceType: 'payout',
        referenceId: row.id,
        idempotencyKey: `payout_paid:${row.id}`,
        actorType: actor.type,
        actorId: actor.id,
        description: `Payout ${row.id} paid (ref ${reference})`,
        lines: [
          {
            account: 'CREATOR_PAYOUT_PENDING',
            side: 'D',
            amount,
            creatorId: row.creator_id,
          },
          {
            account: 'PLATFORM_CASH',
            side: 'C',
            amount,
            creatorId: row.creator_id,
          },
        ],
      });
      let updated: PayoutRow[];
      try {
        updated = returned<PayoutRow[]>(
          await manager.query(
            `UPDATE payouts SET status='PAID', bank_reference=$2, paid_at=$3, closed_at=$3,
                  paid_transaction_id=$4, version=version+1, updated_at=now()
            WHERE id=$1 RETURNING *`,
            [payoutId, reference, now, posted.id],
          ),
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new ApiException(
            'CONFLICT',
            'This bank reference was already used for another payout',
            HttpStatus.CONFLICT,
          );
        }
        throw error;
      }
      await this.audit.record(manager, {
        actor,
        action: 'finance.payout.paid',
        targetType: 'payout',
        targetId: payoutId,
        amountMinor: amount,
        currency: row.currency,
        before: { status: row.status },
        after: { status: 'PAID' },
        reference,
        ledgerTransactionId: posted.id,
      });
      payoutsTotal.inc({ status: 'paid', kind: row.kind });
      return this.view(updated[0]);
    });
  }

  private async releaseReserved(
    actor: FinanceActor,
    payoutId: string,
    to: 'REJECTED' | 'CANCELLED' | 'FAILED',
    reason: string,
    allowedActor: (row: PayoutRow, ownerUserId: string | null) => boolean,
  ) {
    if (!reason || reason.trim().length < 3) {
      throw new ApiException('VALIDATION_ERROR', 'A reason is required');
    }
    return this.dataSource.transaction(async (manager) => {
      const row = await this.lockPayout(manager, payoutId);
      const owner = await this.creators.userIdOfCreator(
        row.creator_id,
        manager,
      );
      if (actor.role !== 'admin' && owner !== actor.id) {
        // Do not reveal other creators' payouts.
        throw new ApiException(
          'NOT_FOUND',
          'Payout not found',
          HttpStatus.NOT_FOUND,
        );
      }
      if (row.status === to) return this.view(row); // idempotent
      if (!allowedActor(row, owner)) {
        throw new ApiException(
          'FORBIDDEN',
          'You can only cancel your own payout while it is still waiting for review',
          HttpStatus.FORBIDDEN,
        );
      }
      this.assertEdge(row, to);
      const amount = parseMinorText(row.amount_minor);
      const now = this.clock.now();
      await this.balances.lock(manager, row.creator_id, row.currency);
      const posted = await this.ledger.post(manager, {
        type: 'PAYOUT_RELEASE',
        currency: row.currency,
        occurredAt: now,
        referenceType: 'payout',
        referenceId: row.id,
        idempotencyKey: `payout_release:${row.id}`,
        actorType: actor.type,
        actorId: actor.id,
        description: `Payout ${row.id} ${to.toLowerCase()}: reserved funds returned`,
        lines: [
          {
            account: 'CREATOR_PAYOUT_PENDING',
            side: 'D',
            amount,
            creatorId: row.creator_id,
          },
          {
            account: 'CREATOR_AVAILABLE',
            side: 'C',
            amount,
            creatorId: row.creator_id,
          },
        ],
      });
      const updated = returned<PayoutRow[]>(
        await manager.query(
          `UPDATE payouts SET status=$2, status_reason=$3, closed_at=$4, release_transaction_id=$5,
                version=version+1, updated_at=now()
          WHERE id=$1 RETURNING *`,
          [payoutId, to, reason, now, posted.id],
        ),
      );
      await this.audit.record(manager, {
        actor,
        action: `finance.payout.${to.toLowerCase()}`,
        targetType: 'payout',
        targetId: payoutId,
        amountMinor: amount,
        currency: row.currency,
        before: { status: row.status },
        after: { status: to },
        reason,
        ledgerTransactionId: posted.id,
      });
      payoutsTotal.inc({ status: to.toLowerCase(), kind: row.kind });
      return this.view(updated[0]);
    });
  }

  reject(actor: FinanceActor, payoutId: string, reason: string) {
    return this.releaseReserved(
      actor,
      payoutId,
      'REJECTED',
      reason,
      () => actor.role === 'admin',
    );
  }

  markFailed(actor: FinanceActor, payoutId: string, reason: string) {
    return this.releaseReserved(
      actor,
      payoutId,
      'FAILED',
      reason,
      () => actor.role === 'admin',
    );
  }

  /** Admin may cancel REQUESTED/APPROVED; a creator only their own (and only while still REQUESTED, enforced by the machine's actor rules below). */
  async cancel(actor: FinanceActor, payoutId: string, reason: string) {
    if (actor.role === 'admin') {
      return this.releaseReserved(
        actor,
        payoutId,
        'CANCELLED',
        reason,
        () => true,
      );
    }
    return this.releaseReserved(
      actor,
      payoutId,
      'CANCELLED',
      reason,
      (row, owner) => {
        return owner === actor.id && row.status === 'REQUESTED';
      },
    );
  }

  // ------------------------------------------------------------------ reads

  async listForCreator(userId: string) {
    const creatorId = await this.creators.creatorIdOfUser(userId);
    const rows = await this.dataSource.query<PayoutRow[]>(
      `SELECT * FROM payouts WHERE creator_id = $1 ORDER BY created_at DESC, id LIMIT 100`,
      [creatorId],
    );
    return rows.map((r) => this.view(r));
  }

  async listForAdmin(status: PayoutStatus | undefined, limit = 50, offset = 0) {
    const rows = await this.dataSource.query<PayoutRow[]>(
      `SELECT * FROM payouts WHERE ($1::text IS NULL OR status = $1)
        ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`,
      [status ?? null, limit, offset],
    );
    const total = await this.dataSource.query<Array<{ n: string }>>(
      `SELECT count(*)::text AS n FROM payouts WHERE ($1::text IS NULL OR status = $1)`,
      [status ?? null],
    );
    return { items: rows.map((r) => this.view(r)), total: Number(total[0].n) };
  }

  async getForAdmin(payoutId: string) {
    const rows = await this.dataSource.query<PayoutRow[]>(
      `SELECT * FROM payouts WHERE id = $1`,
      [payoutId],
    );
    if (!rows[0])
      throw new ApiException(
        'NOT_FOUND',
        'Payout not found',
        HttpStatus.NOT_FOUND,
      );
    return this.view(rows[0]);
  }

  static readonly IN_FLIGHT = IN_FLIGHT;
  static readonly VOIDED = VOIDED;
}
