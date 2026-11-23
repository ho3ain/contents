import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { FinanceActor } from './finance-actor';
import { FinancialAuditService } from './financial-audit.service';
import { returned } from './sql';

/** A financial hold blocks payouts (fraud / compliance); it never moves money. */
@Injectable()
export class FinancialHoldsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: FinancialAuditService,
  ) {}

  async isHeld(manager: EntityManager, creatorId: string): Promise<boolean> {
    const rows = await manager.query<unknown[]>(
      `SELECT 1 FROM creator_financial_holds WHERE creator_id = $1 AND released_at IS NULL`,
      [creatorId],
    );
    return rows.length > 0;
  }

  async place(actor: FinanceActor, creatorId: string, reason: string) {
    if (!reason || reason.trim().length < 5) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'A reason of at least 5 characters is required',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const creator = await manager.query<unknown[]>(
        `SELECT 1 FROM creator_profiles WHERE id = $1`,
        [creatorId],
      );
      if (creator.length === 0)
        throw new ApiException(
          'NOT_FOUND',
          'Creator not found',
          HttpStatus.NOT_FOUND,
        );
      const inserted = await manager.query<Array<{ id: string }>>(
        `INSERT INTO creator_financial_holds (creator_id, reason, placed_by)
         VALUES ($1,$2,$3) ON CONFLICT (creator_id) WHERE released_at IS NULL DO NOTHING RETURNING id`,
        [creatorId, reason, actor.id],
      );
      if (inserted.length === 0) {
        throw new ApiException(
          'CONFLICT',
          'The creator already has an active financial hold',
          HttpStatus.CONFLICT,
        );
      }
      await this.audit.record(manager, {
        actor,
        action: 'finance.hold.placed',
        targetType: 'creator',
        targetId: creatorId,
        reason,
      });
      return { id: inserted[0].id, creatorId, active: true };
    });
  }

  async release(actor: FinanceActor, creatorId: string, reason: string) {
    if (!reason || reason.trim().length < 5) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'A reason of at least 5 characters is required',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const updated = returned<Array<{ id: string }>>(
        await manager.query(
          `UPDATE creator_financial_holds
            SET released_at = now(), released_by = $2, release_reason = $3
          WHERE creator_id = $1 AND released_at IS NULL RETURNING id`,
          [creatorId, actor.id, reason],
        ),
      );
      if (updated.length === 0) {
        throw new ApiException(
          'NOT_FOUND',
          'No active financial hold',
          HttpStatus.NOT_FOUND,
        );
      }
      await this.audit.record(manager, {
        actor,
        action: 'finance.hold.released',
        targetType: 'creator',
        targetId: creatorId,
        reason,
      });
      return { creatorId, active: false };
    });
  }
}
