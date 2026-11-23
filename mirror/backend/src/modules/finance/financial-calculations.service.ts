import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { allocate, parseMajorToMinor } from './domain/money';
import { calculateNetSales } from './domain/net-sales';
import { PolicyService } from './policy.service';

export interface SaleCalculationItem {
  id: string;
  creatorId: string;
  total: string;
}

export interface RecordSaleCalculationsInput {
  paymentId: string;
  orderId: string;
  currency: string;
  occurredAt: Date;
  providerFeeMinor: bigint | null;
  items: SaleCalculationItem[];
}

/**
 * Phase 4 calculation evidence. This service intentionally does not post to
 * the ledger: an approved NET_SALES policy is required before a net-basis
 * calculation exists, and changing the already-posted Phase 2 historical
 * split would be an unauthorized settlement adjustment.
 */
@Injectable()
export class FinancialCalculationsService {
  constructor(private readonly policies: PolicyService) {}

  async recordSale(
    manager: EntityManager,
    input: RecordSaleCalculationsInput,
  ): Promise<void> {
    const grossValues = input.items.map((item) =>
      parseMajorToMinor(item.total, input.currency),
    );
    const fees =
      input.providerFeeMinor === null
        ? grossValues.map(() => null)
        : allocate(input.providerFeeMinor, grossValues);

    const commission = await this.policies
      .resolve('COMMISSION', input.occurredAt, {
        manager,
        currency: input.currency,
      })
      .catch(() => null);
    const netSales = await this.policies
      .resolve('NET_SALES', input.occurredAt, {
        manager,
        currency: input.currency,
      })
      .catch(() => null);

    for (let index = 0; index < input.items.length; index += 1) {
      const item = input.items[index];
      const grossMinor = grossValues[index];
      const directFee = fees[index];
      const calculationKey = `sale:${input.paymentId}:${item.id}:${netSales?.id ?? 'no-net-sales-policy'}:${commission?.id ?? 'no-commission-policy'}`;
      let status:
        'CALCULATED' | 'BLOCKED_POLICY' | 'BLOCKED_UNKNOWN_DEDUCTION' =
        'BLOCKED_POLICY';
      let netSalesMinor: bigint | null = null;
      let commissionMinor: bigint | null = null;
      let creatorProceedsMinor: bigint | null = null;
      let evidence: Record<string, unknown> = {
        discount: 'not_recorded',
        taxCollected: 'not_recorded',
        directProcessingFee:
          directFee === null ? 'unknown' : 'actual_provider_reported',
        ledgerEffect: 'none',
        reason: null,
      };

      if (!commission || !netSales) {
        evidence = {
          ...evidence,
          reason: !netSales
            ? 'NET_SALES_POLICY_MISSING'
            : 'COMMISSION_POLICY_MISSING',
        };
      } else {
        const result = calculateNetSales({
          grossMinor,
          // Current commerce snapshots do not contain an allocated
          // discount/tax fact. Keep absence explicit rather than using zero.
          discountsMinor: null,
          taxesCollectedMinor: null,
          directProcessingFeesMinor: directFee,
          netSalesPolicy: netSales.params,
          commissionPolicy: commission.params,
        });
        if (result.status === 'CALCULATED') {
          status = 'CALCULATED';
          netSalesMinor = result.netSalesMinor;
          commissionMinor = result.commissionMinor;
          creatorProceedsMinor = result.creatorProceedsMinor;
          evidence = {
            ...evidence,
            appliedDeductions: netSales.params.allowedDeductions,
          };
        } else {
          status = 'BLOCKED_UNKNOWN_DEDUCTION';
          evidence = {
            ...evidence,
            reason: 'APPROVED_DEDUCTION_AMOUNT_UNKNOWN',
            missing: result.missing,
          };
        }
      }

      await manager.query(
        `INSERT INTO financial_calculations
           (calculation_key, payment_id, order_id, order_item_id, creator_id,
            currency, status, gross_minor, discount_minor, tax_collected_minor,
            direct_processing_fee_minor, net_sales_minor, commission_minor,
            creator_proceeds_minor, settlement_adjustment_minor,
            commission_policy_id, net_sales_policy_id, policy_snapshot, evidence,
            calculated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,NULL,$9,$10,$11,$12,0,$13,$14,$15,$16,$17)
         ON CONFLICT (calculation_key) DO NOTHING`,
        [
          calculationKey,
          input.paymentId,
          input.orderId,
          item.id,
          item.creatorId,
          input.currency,
          status,
          grossMinor.toString(),
          directFee?.toString() ?? null,
          netSalesMinor?.toString() ?? null,
          commissionMinor?.toString() ?? null,
          creatorProceedsMinor?.toString() ?? null,
          commission?.id ?? null,
          netSales?.id ?? null,
          JSON.stringify({
            commissionPolicyId: commission?.id ?? null,
            netSalesPolicyId: netSales?.id ?? null,
            commissionParams: commission?.params ?? null,
            netSalesParams: netSales?.params ?? null,
          }),
          JSON.stringify(evidence),
          input.occurredAt,
        ],
      );
    }
  }

  /** A refund/chargeback creates a new adjustment evidence row; it never edits the sale calculation or payout history. */
  async recordRefundAdjustment(
    manager: EntityManager,
    input: {
      refundId: string;
      orderId: string;
      currency: string;
      grossEffectMinor: bigint;
      commissionEffectMinor: bigint;
      creatorEffectMinor: bigint;
      settlementEffectMinor: bigint;
      recordedBy: string | null;
    },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO financial_calculation_adjustments
         (calculation_id, adjustment_type, reference_type, reference_id, currency,
          gross_effect_minor, commission_effect_minor, creator_effect_minor,
          settlement_effect_minor, status, detail, idempotency_key, recorded_by,
          recorded_at)
       VALUES (NULL,'REFUND','refund',$1,$2,$3,$4,$5,$6,'RECORDED',$7,$8,$9,now())
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        input.refundId,
        input.currency,
        (-input.grossEffectMinor).toString(),
        (-input.commissionEffectMinor).toString(),
        (-input.creatorEffectMinor).toString(),
        input.settlementEffectMinor.toString(),
        JSON.stringify({
          orderId: input.orderId,
          source: 'refund_settlement',
          note: 'Existing refund settlement ledger remains the money source of truth',
        }),
        `refund-adjustment:${input.refundId}`,
        input.recordedBy,
      ],
    );
  }
}
