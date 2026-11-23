import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { businessEvent } from '../../common/logging/app-logger';

export type ExceptionSeverity = 'P0' | 'P1' | 'P2';

export type FinanceExceptionKind =
  | 'ORDER_ITEMS_TOTAL_MISMATCH'
  | 'MISSING_CREATOR_SNAPSHOT'
  | 'POLICY_MISSING'
  | 'UNSUPPORTED_CURRENCY'
  | 'INVALID_AMOUNT'
  | 'HISTORICAL_SALE_NOT_POSTED'
  | 'REFUND_WITHOUT_LEDGER_SALE'
  | 'GATEWAY_FEE_UNKNOWN'
  | 'GATEWAY_FEE_INVALID'
  | 'LEDGER_POSTING_FAILED'
  | 'DUPLICATE_SUCCESSFUL_PAYMENT'
  | 'DUPLICATE_OPEN_REFUND'
  | 'FINANCIAL_CALCULATION_EVIDENCE_FAILED';

/**
 * W0 / §26 — the register of money events the finance engine could NOT map
 * deterministically. The engine never fabricates ledger entries to make a
 * gap disappear: it records the gap here, once (UNIQUE kind+reference), for
 * an operator to resolve.
 */
@Injectable()
export class FinanceExceptionsService {
  async record(
    manager: EntityManager,
    input: {
      kind: FinanceExceptionKind;
      severity: ExceptionSeverity;
      referenceType: string;
      referenceId: string;
      detail: Record<string, unknown>;
    },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO finance_migration_exceptions
         (kind, severity, reference_type, reference_id, detail)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (kind, reference_type, reference_id) DO NOTHING`,
      [
        input.kind,
        input.severity,
        input.referenceType,
        input.referenceId,
        JSON.stringify(input.detail),
      ],
    );
    businessEvent.error(
      'finance.exception.recorded',
      'A money event could not be posted deterministically',
      {
        kind: input.kind,
        severity: input.severity,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      },
    );
  }
}
