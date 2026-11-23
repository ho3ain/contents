import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { FieldCryptoService } from '../../common/crypto/field-crypto.service';
import { CreatorResolver } from './creator-resolver';
import { IbanError, validateIranIban } from './domain/iban';
import { FinanceActor } from './finance-actor';
import { FinancialAuditService } from './financial-audit.service';
import { returned } from './sql';

interface BankRow {
  id: string;
  creator_id: string;
  holder_name: string;
  iban_encrypted: string;
  iban_last4: string;
  status: 'ACTIVE' | 'REPLACED' | 'DISABLED';
  ownership_status: 'UNVERIFIED' | 'ADMIN_VERIFIED';
  verified_at: Date | null;
  verification_note: string | null;
  created_at: Date;
}

/**
 * W6.5 — payout destination (Iranian Shaba).
 *
 *  - Stored AES-256-GCM encrypted with the row id as AAD (a ciphertext cannot
 *    be moved to another row), plus last4 for display and a keyed blind index
 *    for duplicate detection. The plaintext never touches a log or a response
 *    except the single audited admin "reveal" used to perform a transfer.
 *  - Never edited: a change is a NEW row, the previous one becomes REPLACED.
 *  - `ownershipStatus` is an ADMIN attestation. Mesh does NOT verify with the
 *    bank that the account belongs to the creator, and never claims to.
 */
@Injectable()
export class BankAccountsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly crypto: FieldCryptoService,
    private readonly audit: FinancialAuditService,
    private readonly creators: CreatorResolver,
  ) {}

  private view(row: BankRow) {
    return {
      id: row.id,
      holderName: row.holder_name,
      ibanMasked: `IR${'•'.repeat(20)}${row.iban_last4}`,
      ibanLast4: row.iban_last4,
      status: row.status,
      ownershipStatus: row.ownership_status,
      ownershipNote:
        row.ownership_status === 'ADMIN_VERIFIED'
          ? 'Confirmed by a Mesh administrator; not verified with the bank.'
          : 'Not yet reviewed.',
      verifiedAt: row.verified_at,
      createdAt: row.created_at,
    };
  }

  async add(actor: FinanceActor, input: { iban: string; holderName: string }) {
    const holder = input.holderName?.trim();
    if (!holder || holder.length < 3 || holder.length > 160) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'The account holder name must be 3–160 characters',
      );
    }
    let iban: string;
    try {
      iban = validateIranIban(input.iban ?? '');
    } catch (error) {
      if (error instanceof IbanError)
        throw new ApiException('VALIDATION_ERROR', error.message);
      throw error;
    }
    const creatorId = await this.creators.creatorIdOfUser(actor.id as string);
    const id = randomUUID();
    const encrypted = this.crypto.encrypt(
      iban,
      `creator_bank_account.iban:${id}`,
    );
    const blind = this.crypto.blindIndex(iban, 'creator_bank_account.iban');
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `SELECT 1 FROM creator_profiles WHERE id = $1 FOR UPDATE`,
        [creatorId],
      );
      const replaced = returned<Array<{ id: string }>>(
        await manager.query(
          `UPDATE creator_bank_accounts SET status = 'REPLACED', updated_at = now()
          WHERE creator_id = $1 AND status = 'ACTIVE' RETURNING id`,
          [creatorId],
        ),
      );
      let row: BankRow;
      try {
        const inserted = await manager.query<BankRow[]>(
          `INSERT INTO creator_bank_accounts (id, creator_id, holder_name, iban_encrypted, iban_last4, iban_blind_index)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [id, creatorId, holder, encrypted, iban.slice(-4), blind],
        );
        row = inserted[0];
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          // Deliberately generic: do not reveal that someone else has it.
          throw new ApiException(
            'CONFLICT',
            'This bank account cannot be registered',
            HttpStatus.CONFLICT,
          );
        }
        throw error;
      }
      await this.audit.record(manager, {
        actor,
        action: 'finance.bank_account.added',
        targetType: 'creator_bank_account',
        targetId: id,
        after: { last4: row.iban_last4, replaced: replaced.map((r) => r.id) },
      });
      return this.view(row);
    });
  }

  async activeForCreator(userId: string) {
    const creatorId = await this.creators.creatorIdOfUser(userId);
    return this.activeViewForCreatorId(creatorId);
  }

  /** Admin read (masked view, with the row id the verify/disable routes need). */
  async activeViewForCreatorId(creatorId: string) {
    const rows = await this.dataSource.query<BankRow[]>(
      `SELECT * FROM creator_bank_accounts WHERE creator_id = $1 AND status = 'ACTIVE'`,
      [creatorId],
    );
    return rows[0] ? this.view(rows[0]) : null;
  }

  async activeRow(
    manager: EntityManager,
    creatorId: string,
    lock = false,
  ): Promise<BankRow | null> {
    const rows = await manager.query<BankRow[]>(
      `SELECT * FROM creator_bank_accounts WHERE creator_id = $1 AND status = 'ACTIVE' ${lock ? 'FOR SHARE' : ''}`,
      [creatorId],
    );
    return rows[0] ?? null;
  }

  async verifyOwnership(actor: FinanceActor, accountId: string, note: string) {
    if (!note || note.trim().length < 5) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'A verification note of at least 5 characters is required',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<BankRow[]>(
        `SELECT * FROM creator_bank_accounts WHERE id = $1 FOR UPDATE`,
        [accountId],
      );
      const row = rows[0];
      if (!row)
        throw new ApiException(
          'NOT_FOUND',
          'Bank account not found',
          HttpStatus.NOT_FOUND,
        );
      if (row.status !== 'ACTIVE') {
        throw new ApiException(
          'CONFLICT',
          'Only the active bank account can be verified',
          HttpStatus.CONFLICT,
        );
      }
      const owner = await this.creators.userIdOfCreator(
        row.creator_id,
        manager,
      );
      if (owner === actor.id) {
        throw new ApiException(
          'FORBIDDEN',
          'You cannot verify your own bank account',
          HttpStatus.FORBIDDEN,
        );
      }
      const updated = returned<BankRow[]>(
        await manager.query(
          `UPDATE creator_bank_accounts
            SET ownership_status = 'ADMIN_VERIFIED', verified_by = $2, verified_at = now(),
                verification_note = $3, updated_at = now()
          WHERE id = $1 RETURNING *`,
          [accountId, actor.id, note],
        ),
      );
      await this.audit.record(manager, {
        actor,
        action: 'finance.bank_account.verified',
        targetType: 'creator_bank_account',
        targetId: accountId,
        reason: note,
      });
      return this.view(updated[0]);
    });
  }

  async disable(actor: FinanceActor, accountId: string, reason: string) {
    if (!reason || reason.trim().length < 5) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'A reason of at least 5 characters is required',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const updated = returned<BankRow[]>(
        await manager.query(
          `UPDATE creator_bank_accounts SET status = 'DISABLED', disabled_reason = $2, updated_at = now()
          WHERE id = $1 AND status = 'ACTIVE' RETURNING *`,
          [accountId, reason],
        ),
      );
      if (!updated[0])
        throw new ApiException(
          'NOT_FOUND',
          'No active bank account with this id',
          HttpStatus.NOT_FOUND,
        );
      await this.audit.record(manager, {
        actor,
        action: 'finance.bank_account.disabled',
        targetType: 'creator_bank_account',
        targetId: accountId,
        reason,
      });
      return this.view(updated[0]);
    });
  }

  /** The single place the full Shaba is decrypted: an admin executing a transfer. Audited in the same transaction. */
  async revealForTransfer(
    manager: EntityManager,
    actor: FinanceActor,
    accountId: string,
    payoutId: string,
  ) {
    const rows = await manager.query<BankRow[]>(
      `SELECT * FROM creator_bank_accounts WHERE id = $1`,
      [accountId],
    );
    const row = rows[0];
    if (!row)
      throw new ApiException(
        'NOT_FOUND',
        'Bank account not found',
        HttpStatus.NOT_FOUND,
      );
    await this.audit.record(manager, {
      actor,
      action: 'finance.bank_account.revealed',
      targetType: 'creator_bank_account',
      targetId: accountId,
      reference: `payout:${payoutId}`,
    });
    return {
      holderName: row.holder_name,
      iban: this.crypto.decrypt(
        row.iban_encrypted,
        `creator_bank_account.iban:${row.id}`,
      ),
    };
  }
}
