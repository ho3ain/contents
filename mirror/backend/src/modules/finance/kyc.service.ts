import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { FieldCryptoService } from '../../common/crypto/field-crypto.service';
import { CreatorResolver } from './creator-resolver';
import {
  isValidIranNationalId,
  normalizeNationalId,
} from './domain/national-id';
import { KycState } from './domain/payout-rules';
import {
  IllegalTransitionError,
  KYC_MACHINE,
  assertTransition,
} from './domain/state-machines';
import { FinanceActor } from './finance-actor';
import { FinancialAuditService } from './financial-audit.service';

/**
 * W6.1 — the abstraction for WHO decides KYC. Today an admin does; a future
 * external identity provider implements the same port and records its own
 * `authority` + reference without any change to payout rules.
 */
export interface KycAuthority {
  readonly name: 'ADMIN' | 'EXTERNAL_PROVIDER';
}
export const ADMIN_KYC_AUTHORITY: KycAuthority = { name: 'ADMIN' };

interface KycRow {
  creator_id: string;
  state: KycState;
  authority: 'ADMIN' | 'EXTERNAL_PROVIDER';
  provider_reference: string | null;
  legal_name_encrypted: string | null;
  national_id_encrypted: string | null;
  national_id_last4: string | null;
  submission_note: string | null;
  submitted_at: Date | null;
  decided_by: string | null;
  decided_at: Date | null;
  decision_reason: string | null;
  version: number;
}

export interface SubmitKycInput {
  legalName: string;
  nationalId: string;
  note?: string;
}

interface CreatorIdentityRow {
  display_name: string;
  slug: string;
  user_id: string;
}

export interface CreatorIdentity {
  displayName: string;
  slug: string;
  userId: string;
}

const identityOf = (row: CreatorIdentityRow): CreatorIdentity => ({
  displayName: row.display_name,
  slug: row.slug,
  userId: row.user_id,
});

@Injectable()
export class KycService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly crypto: FieldCryptoService,
    private readonly audit: FinancialAuditService,
    private readonly creators: CreatorResolver,
  ) {}

  private view(row: KycRow | undefined, creatorId: string) {
    return {
      creatorId,
      state: row?.state ?? 'NOT_STARTED',
      authority: row?.authority ?? 'ADMIN',
      nationalIdLast4: row?.national_id_last4 ?? null,
      submittedAt: row?.submitted_at ?? null,
      decidedAt: row?.decided_at ?? null,
      decisionReason: row?.decision_reason ?? null,
    };
  }

  /** The state used by payout eligibility; a creator without a row is NOT_STARTED. */
  async stateOf(
    manager: EntityManager,
    creatorId: string,
    lock = false,
  ): Promise<KycState> {
    const rows = await manager.query<Array<{ state: KycState }>>(
      `SELECT state FROM creator_kyc WHERE creator_id = $1 ${lock ? 'FOR SHARE' : ''}`,
      [creatorId],
    );
    return rows[0]?.state ?? 'NOT_STARTED';
  }

  async getForCreator(userId: string) {
    const creatorId = await this.creators.creatorIdOfUser(userId);
    const rows = await this.dataSource.query<KycRow[]>(
      `SELECT * FROM creator_kyc WHERE creator_id = $1`,
      [creatorId],
    );
    return this.view(rows[0], creatorId);
  }

  private async lockRow(
    manager: EntityManager,
    creatorId: string,
  ): Promise<KycRow> {
    await manager.query(
      `INSERT INTO creator_kyc (creator_id) VALUES ($1) ON CONFLICT (creator_id) DO NOTHING`,
      [creatorId],
    );
    const rows = await manager.query<KycRow[]>(
      `SELECT * FROM creator_kyc WHERE creator_id = $1 FOR UPDATE`,
      [creatorId],
    );
    return rows[0];
  }

  private async transition(
    manager: EntityManager,
    row: KycRow,
    to: KycState,
    actor: FinanceActor,
    reason: string | null,
    extra: { sql?: string; params?: unknown[] } = {},
  ): Promise<void> {
    try {
      assertTransition(KYC_MACHINE, row.state, to);
    } catch (error) {
      if (error instanceof IllegalTransitionError) {
        throw new ApiException(
          'FINANCE_RULE_VIOLATION',
          `KYC cannot move from ${row.state} to ${to}`,
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
    await manager.query(
      `UPDATE creator_kyc SET state = $2, version = version + 1, updated_at = now() ${extra.sql ?? ''}
        WHERE creator_id = $1`,
      [row.creator_id, to, ...(extra.params ?? [])],
    );
    await manager.query(
      `INSERT INTO creator_kyc_events (creator_id, from_state, to_state, actor_id, actor_role, reason)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [row.creator_id, row.state, to, actor.id, actor.role, reason],
    );
    await this.audit.record(manager, {
      actor,
      action: `finance.kyc.${to.toLowerCase()}`,
      targetType: 'creator_kyc',
      targetId: row.creator_id,
      before: { state: row.state },
      after: { state: to },
      reason,
    });
  }

  async submit(actor: FinanceActor, input: SubmitKycInput) {
    const legalName = input.legalName?.trim();
    if (!legalName || legalName.length < 3 || legalName.length > 160) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'A legal name of 3–160 characters is required',
      );
    }
    if (!isValidIranNationalId(input.nationalId ?? '')) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'The national ID is not valid',
      );
    }
    const nationalId = normalizeNationalId(input.nationalId);
    const creatorId = await this.creators.creatorIdOfUser(actor.id as string);
    return this.dataSource.transaction(async (manager) => {
      const row = await this.lockRow(manager, creatorId);
      await this.transition(manager, row, 'SUBMITTED', actor, null, {
        sql: `, legal_name_encrypted = $3, national_id_encrypted = $4, national_id_last4 = $5,
                submission_note = $6, submitted_at = now(), decision_reason = NULL,
                decided_by = NULL, decided_at = NULL`,
        params: [
          this.crypto.encrypt(legalName, `creator_kyc.legal_name:${creatorId}`),
          this.crypto.encrypt(
            nationalId,
            `creator_kyc.national_id:${creatorId}`,
          ),
          nationalId.slice(-4),
          input.note?.slice(0, 1000) ?? null,
        ],
      });
      return this.view(
        { ...row, state: 'SUBMITTED', national_id_last4: nationalId.slice(-4) },
        creatorId,
      );
    });
  }

  private async adminTransition(
    actor: FinanceActor,
    creatorId: string,
    to: KycState,
    reason: string | null,
    needsReason: boolean,
    approverMustNotBeOwner: boolean,
  ) {
    if (needsReason && (!reason || reason.trim().length < 5)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'A reason of at least 5 characters is required',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const row = await this.lockRow(manager, creatorId);
      if (approverMustNotBeOwner) {
        const owner = await this.creators.userIdOfCreator(creatorId, manager);
        if (owner && owner === actor.id) {
          throw new ApiException(
            'FORBIDDEN',
            'You cannot approve your own KYC',
            HttpStatus.FORBIDDEN,
          );
        }
      }
      const decided =
        to === 'APPROVED' || to === 'REJECTED' || to === 'SUSPENDED';
      await this.transition(manager, row, to, actor, reason, {
        sql: decided
          ? `, decided_by = $3, decided_at = now(), decision_reason = $4, authority = 'ADMIN'`
          : '',
        params: decided ? [actor.id, reason] : [],
      });
      return this.view(
        { ...row, state: to, decision_reason: reason },
        creatorId,
      );
    });
  }

  startReview(actor: FinanceActor, creatorId: string, reason?: string) {
    return this.adminTransition(
      actor,
      creatorId,
      'UNDER_REVIEW',
      reason ?? null,
      false,
      false,
    );
  }
  approve(actor: FinanceActor, creatorId: string, reason?: string) {
    return this.adminTransition(
      actor,
      creatorId,
      'APPROVED',
      reason ?? null,
      false,
      true,
    );
  }
  reject(actor: FinanceActor, creatorId: string, reason: string) {
    return this.adminTransition(
      actor,
      creatorId,
      'REJECTED',
      reason,
      true,
      false,
    );
  }
  suspend(actor: FinanceActor, creatorId: string, reason: string) {
    return this.adminTransition(
      actor,
      creatorId,
      'SUSPENDED',
      reason,
      true,
      false,
    );
  }

  async list(state: KycState | undefined, limit = 50, offset = 0) {
    const rows = await this.dataSource.query<
      Array<KycRow & CreatorIdentityRow>
    >(
      `SELECT k.*, p.display_name, p.slug, p.user_id
         FROM creator_kyc k
         JOIN creator_profiles p ON p.id = k.creator_id
        WHERE ($1::text IS NULL OR k.state = $1)
        ORDER BY k.updated_at DESC, k.creator_id LIMIT $2 OFFSET $3`,
      [state ?? null, limit, offset],
    );
    return rows.map((r) => ({
      ...this.view(r, r.creator_id),
      creator: identityOf(r),
    }));
  }

  /** Who a KYC record belongs to — the reviewer must see a name, not a UUID. */
  private async identity(
    manager: EntityManager,
    creatorId: string,
  ): Promise<CreatorIdentity | null> {
    const rows = await manager.query<CreatorIdentityRow[]>(
      `SELECT display_name, slug, user_id FROM creator_profiles WHERE id = $1`,
      [creatorId],
    );
    return rows[0] ? identityOf(rows[0]) : null;
  }

  /** Admin review view: decrypts the submission. Every read is audited. */
  async reviewDetail(actor: FinanceActor, creatorId: string) {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<KycRow[]>(
        `SELECT * FROM creator_kyc WHERE creator_id = $1`,
        [creatorId],
      );
      const row = rows[0];
      if (!row)
        throw new ApiException(
          'NOT_FOUND',
          'No KYC record',
          HttpStatus.NOT_FOUND,
        );
      await this.audit.record(manager, {
        actor,
        action: 'finance.kyc.viewed',
        targetType: 'creator_kyc',
        targetId: creatorId,
      });
      const events = await manager.query<unknown[]>(
        `SELECT from_state, to_state, actor_id, actor_role, reason, created_at
           FROM creator_kyc_events WHERE creator_id = $1 ORDER BY id`,
        [creatorId],
      );
      return {
        ...this.view(row, creatorId),
        creator: await this.identity(manager, creatorId),
        legalName: row.legal_name_encrypted
          ? this.crypto.decrypt(
              row.legal_name_encrypted,
              `creator_kyc.legal_name:${creatorId}`,
            )
          : null,
        nationalId: row.national_id_encrypted
          ? this.crypto.decrypt(
              row.national_id_encrypted,
              `creator_kyc.national_id:${creatorId}`,
            )
          : null,
        submissionNote: row.submission_note,
        events,
      };
    });
  }
}
