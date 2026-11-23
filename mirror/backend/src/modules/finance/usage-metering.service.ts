import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import type { RuntimeRegistration } from '../../database/entities/runtime/runtime-registration.entity';
import { CreatorResolver } from './creator-resolver';
import { isSupportedCurrency } from './domain/money';
import type { PolicyRow } from './domain/policy';
import type { FinanceActor } from './finance-actor';
import { FinancialAuditService } from './financial-audit.service';
import { PolicyMissingError, PolicyService } from './policy.service';

const USAGE_UNITS = [
  'execution',
  'input_bytes',
  'output_bytes',
  'tokens',
  'requests',
  'custom',
] as const;
export type UsageUnit = (typeof USAGE_UNITS)[number];

export interface UsagePolicyInput {
  agentId: string;
  enabled: boolean;
  maxExecutionsPerBuyer?: number | null;
  periodDays?: number | null;
  maxInputBytes?: number | null;
  enforcementNote?: string | null;
}

interface UsagePolicyRow {
  id: string;
  agent_id: string;
  creator_id: string;
  version: number;
  status: 'ACTIVE' | 'SUPERSEDED';
  enabled: boolean;
  max_executions_per_buyer: number | null;
  period_days: number | null;
  max_input_bytes: number | null;
  enforcement_note: string | null;
  created_at: Date;
}

interface UsageEventRow {
  id: string;
  metadata: Record<string, unknown>;
}

const sha256 = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const asInt = (value: number | null | undefined, min: number, max: number) =>
  value !== null &&
  value !== undefined &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;

/**
 * Transactional Phase 4 usage evidence, cost states and the narrowly
 * enforceable creator limit. The service never charges a buyer or posts an
 * AI/provider cost into the creator balance/ledger.
 */
@Injectable()
export class UsageMeteringService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly creators: CreatorResolver,
    private readonly audit: FinancialAuditService,
    private readonly policies: PolicyService,
  ) {}

  async listCreatorPolicies(userId: string) {
    const creatorId = await this.creators.creatorIdOfUser(userId);
    const rows = await this.dataSource.query<UsagePolicyRow[]>(
      `SELECT p.*, a.name AS agent_name
         FROM agent_usage_policies p JOIN agents a ON a.id = p.agent_id
        WHERE p.creator_id=$1 AND p.status='ACTIVE'
        ORDER BY p.created_at DESC`,
      [creatorId],
    );
    return rows.map((row) => this.policyView(row));
  }

  async setCreatorPolicy(
    userId: string,
    actor: FinanceActor,
    input: UsagePolicyInput,
  ) {
    this.validatePolicyInput(input);
    const creatorId = await this.creators.creatorIdOfUser(userId);
    return this.dataSource.transaction(async (manager) => {
      const owns = await manager.query<Array<{ id: string }>>(
        `SELECT id FROM agents WHERE id=$1 AND creator_id=$2`,
        [input.agentId, creatorId],
      );
      if (!owns[0]) {
        throw new ApiException(
          'NOT_FOUND',
          'Product not found',
          HttpStatus.NOT_FOUND,
        );
      }
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `usage-policy:${input.agentId}`,
      ]);
      const previous = await manager.query<UsagePolicyRow[]>(
        `SELECT * FROM agent_usage_policies
          WHERE agent_id=$1 AND status='ACTIVE' FOR UPDATE`,
        [input.agentId],
      );
      const version = (previous[0]?.version ?? 0) + 1;
      const inserted = await manager.query<UsagePolicyRow[]>(
        `INSERT INTO agent_usage_policies
           (agent_id, creator_id, version, enabled, max_executions_per_buyer,
            period_days, max_input_bytes, enforcement_note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          input.agentId,
          creatorId,
          version,
          input.enabled,
          input.enabled ? (input.maxExecutionsPerBuyer ?? null) : null,
          input.enabled ? (input.periodDays ?? null) : null,
          input.enabled ? (input.maxInputBytes ?? null) : null,
          input.enforcementNote?.trim() || null,
          userId,
        ],
      );
      if (previous[0]) {
        await manager.query(
          `UPDATE agent_usage_policies
              SET status='SUPERSEDED', superseded_at=now(), superseded_by=$2
            WHERE id=$1`,
          [previous[0].id, inserted[0].id],
        );
      }
      await this.audit.record(manager, {
        actor,
        action: 'finance.usage_policy.published',
        targetType: 'agent_usage_policy',
        targetId: inserted[0].id,
        after: {
          agentId: input.agentId,
          version,
          enabled: input.enabled,
          maxExecutionsPerBuyer: input.enabled
            ? (input.maxExecutionsPerBuyer ?? null)
            : null,
          periodDays: input.enabled ? (input.periodDays ?? null) : null,
          maxInputBytes: input.enabled ? (input.maxInputBytes ?? null) : null,
          enforcement: 'MESH_GATEWAY_ONLY',
        },
        reason: input.enforcementNote?.trim() || null,
        reference: `usage-policy:${input.agentId}:v${version}`,
      });
      return this.policyView(inserted[0]);
    });
  }

  /**
   * The gateway calls this before it invokes a serving Runtime. The locked
   * per-(agent,buyer) window plus the immutable usage row makes the only
   * supported count limit real rather than a buyer-provided declaration.
   */
  async reserveGatewayExecution(input: {
    runtime: RuntimeRegistration;
    buyerId: string;
    releaseId: string;
    correlationId: string;
    inputBytes: number;
  }): Promise<{ usageEventId: string; policyId: string | null }> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `usage-window:${input.runtime.agentId}:${input.buyerId}`,
      ]);
      const policy = await this.activePolicy(manager, input.runtime.agentId);
      // Platform caps are optional, versioned financial policy. There is no
      // fallback number in code: an absent cap means no platform ceiling is
      // declared. When one exists it is checked in addition to (and therefore
      // can override) a creator policy.
      let platformCap: PolicyRow<'USAGE_CAP'> | null = null;
      try {
        platformCap = await this.policies.resolve('USAGE_CAP', new Date(), {
          manager,
        });
      } catch (error) {
        // An absent optional policy is normal; a database/validation failure
        // must fail closed rather than quietly remove a published cap.
        if (!(error instanceof PolicyMissingError)) throw error;
      }
      const inputLimits = [
        ...(policy?.enabled && policy.max_input_bytes !== null
          ? [{ value: policy.max_input_bytes, source: 'creator' as const }]
          : []),
        ...(platformCap?.params.maxInputBytes !== undefined
          ? [
              {
                value: platformCap.params.maxInputBytes,
                source: 'platform' as const,
              },
            ]
          : []),
      ];
      const strictestInput = inputLimits.sort((a, b) => a.value - b.value)[0];
      if (strictestInput && input.inputBytes > strictestInput.value) {
        throw new ApiException(
          'USAGE_LIMIT_EXCEEDED',
          'This Runtime input exceeds an applicable usage limit',
          HttpStatus.TOO_MANY_REQUESTS,
          {
            kind: 'input_bytes',
            limit: strictestInput.value,
            source: strictestInput.source,
          },
        );
      }
      const executionLimits = [
        ...(policy?.enabled &&
        policy.max_executions_per_buyer !== null &&
        policy.period_days !== null
          ? [
              {
                value: policy.max_executions_per_buyer,
                periodDays: policy.period_days,
                source: 'creator' as const,
              },
            ]
          : []),
        ...(platformCap?.params.maxExecutionsPerBuyer !== undefined &&
        platformCap.params.periodDays !== undefined
          ? [
              {
                value: platformCap.params.maxExecutionsPerBuyer,
                periodDays: platformCap.params.periodDays,
                source: 'platform' as const,
              },
            ]
          : []),
      ];
      for (const limit of executionLimits) {
        const counted = await manager.query<Array<{ quantity: string }>>(
          `SELECT COALESCE(SUM(quantity),0)::text AS quantity
             FROM usage_events
            WHERE agent_id=$1 AND buyer_id=$2
              AND source='MESH_GATEWAY' AND usage_unit='execution'
              AND occurred_at >= now() - ($3::text || ' days')::interval`,
          [input.runtime.agentId, input.buyerId, String(limit.periodDays)],
        );
        if (BigInt(counted[0]?.quantity ?? '0') >= BigInt(limit.value)) {
          throw new ApiException(
            'USAGE_LIMIT_EXCEEDED',
            'This product has reached an applicable Runtime usage limit',
            HttpStatus.TOO_MANY_REQUESTS,
            {
              kind: 'executions',
              limit: limit.value,
              periodDays: limit.periodDays,
              source: limit.source,
            },
          );
        }
      }
      const fingerprint = sha256({
        runtimeId: input.runtime.id,
        agentId: input.runtime.agentId,
        buyerId: input.buyerId,
        releaseId: input.releaseId,
        correlationId: input.correlationId,
      });
      const key = `gateway-execution:${input.runtime.id}:${input.correlationId}`;
      const rows = await manager.query<UsageEventRow[]>(
        `INSERT INTO usage_events
           (runtime_id, agent_id, creator_id, buyer_id, source, source_event_id,
            idempotency_key, correlation_id, occurred_at, usage_unit, quantity,
            verification_state, metadata)
         VALUES ($1,$2,$3,$4,'MESH_GATEWAY',$5,$6,$5,now(),'execution',1,'MESH_VERIFIED',$7)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id, metadata`,
        [
          input.runtime.id,
          input.runtime.agentId,
          input.runtime.creatorId,
          input.buyerId,
          input.correlationId,
          key,
          JSON.stringify({
            fingerprint,
            releaseId: input.releaseId,
            enforcement: 'mesh_gateway',
            policyId: policy?.id ?? null,
            platformCapPolicyId: platformCap?.id ?? null,
            inputBytes: input.inputBytes,
          }),
        ],
      );
      const event =
        rows[0] ??
        (
          await manager.query<UsageEventRow[]>(
            `SELECT id, metadata FROM usage_events WHERE idempotency_key=$1`,
            [key],
          )
        )[0];
      // An execution has no provider price/source observation at the gateway.
      // Preserve that fact as UNKNOWN — never as a synthetic zero cost.
      await this.insertCost(manager, {
        usageEventId: event.id,
        state: 'UNKNOWN',
        amountMinor: null,
        currency: null,
        priceReference: null,
        sourceReference: `mesh-gateway:${input.runtime.id}:${input.correlationId}`,
        basis: {
          source: 'mesh_gateway',
          reason: 'no_provider_cost_observation',
        },
        idempotencyKey: `gateway-cost:${input.runtime.id}:${input.correlationId}`,
        observedBy: null,
        supersedesId: null,
      });
      await this.audit.record(manager, {
        actor: { type: 'system', id: null, role: 'system' },
        action: 'finance.usage.gateway_reserved',
        targetType: 'usage_event',
        targetId: event.id,
        after: {
          runtimeId: input.runtime.id,
          agentId: input.runtime.agentId,
          releaseId: input.releaseId,
          verificationState: 'MESH_VERIFIED',
          costState: 'UNKNOWN',
          policyId: policy?.id ?? null,
          platformCapPolicyId: platformCap?.id ?? null,
        },

        reference: key,
      });
      return { usageEventId: event.id, policyId: policy?.id ?? null };
    });
  }

  /** Runtime credential reports are normalized, deduplicated and explicitly unverified. */
  async reportFromRuntime(
    runtime: RuntimeRegistration,
    input: {
      sourceEventId: string;
      occurredAt: Date;
      unit: UsageUnit;
      quantity: string;
      provider?: string | null;
      model?: string | null;
      reportedCostMinor?: string | null;
      reportedCostCurrency?: string | null;
    },
  ) {
    if (!['active', 'degraded'].includes(runtime.state)) {
      throw new ApiException(
        'CONFLICT',
        'Only an active or degraded Runtime may report consumption',
        HttpStatus.CONFLICT,
      );
    }
    if (!/^\d{1,18}$/.test(input.quantity) || BigInt(input.quantity) <= 0n) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'quantity must be a positive integer',
      );
    }
    const costPresent =
      input.reportedCostMinor !== undefined && input.reportedCostMinor !== null;
    if (costPresent !== Boolean(input.reportedCostCurrency)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'reportedCostMinor and reportedCostCurrency must be supplied together',
      );
    }
    if (costPresent && !/^\d{1,18}$/.test(input.reportedCostMinor as string)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'reportedCostMinor must be an integer minor-unit string',
      );
    }
    if (
      costPresent &&
      !isSupportedCurrency(
        (input.reportedCostCurrency as string).trim().toUpperCase(),
      )
    ) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'reportedCostCurrency is not supported',
      );
    }
    const payload = {
      sourceEventId: input.sourceEventId,
      occurredAt: input.occurredAt.toISOString(),
      unit: input.unit,
      quantity: input.quantity,
      provider: input.provider?.trim() || null,
      model: input.model?.trim() || null,
      reportedCostMinor: input.reportedCostMinor ?? null,
      reportedCostCurrency:
        input.reportedCostCurrency?.trim().toUpperCase() || null,
    };
    const fingerprint = sha256(payload);
    return this.dataSource.transaction(async (manager) => {
      const key = `runtime-usage:${runtime.id}:${input.sourceEventId}`;
      const existing = await manager.query<UsageEventRow[]>(
        `SELECT id, metadata FROM usage_events WHERE idempotency_key=$1 FOR UPDATE`,
        [key],
      );
      if (existing[0]) {
        if (existing[0].metadata?.fingerprint !== fingerprint) {
          throw new ApiException(
            'IDEMPOTENCY_CONFLICT',
            'The source event id was already used with different consumption data',
            HttpStatus.CONFLICT,
          );
        }
        return { usageEventId: existing[0].id, replayed: true };
      }
      const inserted = await manager.query<Array<{ id: string }>>(
        `INSERT INTO usage_events
           (runtime_id, agent_id, creator_id, buyer_id, source, source_event_id,
            idempotency_key, correlation_id, occurred_at, usage_unit, quantity,
            verification_state, metadata)
         VALUES ($1,$2,$3,NULL,'RUNTIME_REPORT',$4,$5,NULL,$6,$7,$8,'RUNTIME_REPORTED',$9)
         RETURNING id`,
        [
          runtime.id,
          runtime.agentId,
          runtime.creatorId,
          input.sourceEventId,
          key,
          input.occurredAt,
          input.unit,
          input.quantity,
          JSON.stringify({ ...payload, fingerprint }),
        ],
      );
      await this.insertCost(manager, {
        usageEventId: inserted[0].id,
        state: costPresent ? 'REPORTED_UNVERIFIED' : 'UNKNOWN',
        amountMinor: costPresent
          ? BigInt(input.reportedCostMinor as string)
          : null,
        currency: costPresent
          ? (input.reportedCostCurrency as string).trim().toUpperCase()
          : null,
        priceReference: null,
        sourceReference: `runtime:${runtime.id}:${input.sourceEventId}`,
        basis: {
          source: 'runtime_report',
          provider: payload.provider,
          model: payload.model,
          verification: 'unverified',
        },
        idempotencyKey: `runtime-cost:${runtime.id}:${input.sourceEventId}`,
        observedBy: null,
        supersedesId: null,
      });
      await this.audit.record(manager, {
        actor: { type: 'system', id: null, role: 'system' },
        action: 'finance.usage.runtime_reported',
        targetType: 'usage_event',
        targetId: inserted[0].id,
        amountMinor: costPresent
          ? BigInt(input.reportedCostMinor as string)
          : null,
        currency: costPresent
          ? (input.reportedCostCurrency as string).trim().toUpperCase()
          : null,
        after: {
          runtimeId: runtime.id,
          unit: input.unit,
          verificationState: 'RUNTIME_REPORTED',
          costState: costPresent ? 'REPORTED_UNVERIFIED' : 'UNKNOWN',
        },
        reference: key,
      });
      return { usageEventId: inserted[0].id, replayed: false };
    });
  }

  /** Permission-scoped manual provider observation/reconciliation. No provider API is implied. */
  async recordAdminCost(
    actor: FinanceActor,
    input: {
      usageEventId: string;
      state:
        | 'ESTIMATED'
        | 'RECONCILED_FINAL'
        | 'DISPUTED'
        | 'UNDER_INVESTIGATION'
        | 'UNKNOWN';
      amountMinor?: string | null;
      currency?: string | null;
      priceReference?: string | null;
      sourceReference?: string | null;
      idempotencyKey: string;
      note?: string | null;
    },
  ) {
    const hasAmount =
      input.amountMinor !== undefined && input.amountMinor !== null;
    if (input.state === 'UNKNOWN' && hasAmount) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Unknown cost cannot have an amount',
      );
    }
    if (hasAmount !== Boolean(input.currency)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'amountMinor and currency must be supplied together',
      );
    }
    if (hasAmount && !/^\d{1,18}$/.test(input.amountMinor as string)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'amountMinor must be an integer minor-unit string',
      );
    }
    if (
      hasAmount &&
      !isSupportedCurrency((input.currency as string).trim().toUpperCase())
    ) {
      throw new ApiException('VALIDATION_ERROR', 'currency is not supported');
    }
    return this.dataSource.transaction(async (manager) => {
      const event = await manager.query<Array<{ id: string }>>(
        `SELECT id FROM usage_events WHERE id=$1 FOR UPDATE`,
        [input.usageEventId],
      );
      if (!event[0]) {
        throw new ApiException(
          'NOT_FOUND',
          'Usage event not found',
          HttpStatus.NOT_FOUND,
        );
      }
      const previous = await manager.query<Array<{ id: string }>>(
        `SELECT c.id FROM usage_cost_records c
          WHERE c.usage_event_id=$1
            AND NOT EXISTS (
              SELECT 1 FROM usage_cost_records successor WHERE successor.supersedes_id=c.id
            )
          LIMIT 1`,
        [input.usageEventId],
      );
      const id = await this.insertCost(manager, {
        usageEventId: input.usageEventId,
        state: input.state,
        amountMinor: hasAmount ? BigInt(input.amountMinor as string) : null,
        currency: hasAmount
          ? (input.currency as string).trim().toUpperCase()
          : null,
        priceReference: input.priceReference?.trim() || null,
        sourceReference: input.sourceReference?.trim() || null,
        basis: {
          source: 'admin_manual_observation',
          note: input.note?.trim() || null,
        },
        idempotencyKey: input.idempotencyKey,
        observedBy: actor.id,
        supersedesId: previous[0]?.id ?? null,
      });
      await this.audit.record(manager, {
        actor,
        action: 'finance.usage_cost.recorded',
        targetType: 'usage_event',
        targetId: input.usageEventId,
        amountMinor: hasAmount ? BigInt(input.amountMinor as string) : null,
        currency: hasAmount
          ? (input.currency as string).trim().toUpperCase()
          : null,
        after: {
          state: input.state,
          costRecordId: id,
          sourceReference: input.sourceReference ?? null,
        },
        reason: input.note?.trim() || null,
        reference: input.idempotencyKey,
      });
      return { costRecordId: id };
    });
  }

  async creatorSummary(userId: string) {
    const creatorId = await this.creators.creatorIdOfUser(userId);
    return this.summaryForCreator(creatorId);
  }

  async adminSummary(creatorId?: string) {
    if (creatorId) return this.summaryForCreator(creatorId);
    const overview = await this.dataSource.query<
      Array<{
        events: string;
        unknown_costs: string;
        disputed_costs: string;
        investigating_costs: string;
      }>
    >(`SELECT count(*)::text AS events,
              count(*) FILTER (WHERE c.state='UNKNOWN')::text AS unknown_costs,
              count(*) FILTER (WHERE c.state='DISPUTED')::text AS disputed_costs,
              count(*) FILTER (WHERE c.state='UNDER_INVESTIGATION')::text AS investigating_costs
         FROM usage_events e
         LEFT JOIN LATERAL (
           SELECT c.state FROM usage_cost_records c
            WHERE c.usage_event_id=e.id
              AND NOT EXISTS (
                SELECT 1 FROM usage_cost_records successor WHERE successor.supersedes_id=c.id
              )
            LIMIT 1
         ) c ON true`);
    return { scope: 'platform', ...overview[0] };
  }

  private async summaryForCreator(creatorId: string) {
    const [usage, costs, calculations] = await Promise.all([
      this.dataSource.query<
        Array<{
          unit: string;
          verification_state: string;
          quantity: string;
          events: string;
        }>
      >(
        `SELECT usage_unit AS unit, verification_state, SUM(quantity)::text AS quantity, count(*)::text AS events
           FROM usage_events WHERE creator_id=$1
          GROUP BY usage_unit, verification_state ORDER BY usage_unit, verification_state`,
        [creatorId],
      ),
      this.dataSource.query<
        Array<{
          state: string;
          currency: string | null;
          amount_minor: string | null;
          records: string;
        }>
      >(
        `SELECT c.state, c.currency, SUM(c.amount_minor)::text AS amount_minor, count(*)::text AS records
           FROM usage_cost_records c JOIN usage_events e ON e.id=c.usage_event_id
          WHERE e.creator_id=$1
          GROUP BY c.state, c.currency ORDER BY c.state, c.currency`,
        [creatorId],
      ),
      this.dataSource.query<
        Array<{
          status: string;
          currency: string;
          gross_minor: string;
          net_sales_minor: string | null;
          commission_minor: string | null;
          creator_proceeds_minor: string | null;
          settlement_adjustment_minor: string;
          calculations: string;
        }>
      >(
        `SELECT status, currency, SUM(gross_minor)::text AS gross_minor,
                SUM(net_sales_minor)::text AS net_sales_minor,
                SUM(commission_minor)::text AS commission_minor,
                SUM(creator_proceeds_minor)::text AS creator_proceeds_minor,
                SUM(settlement_adjustment_minor)::text AS settlement_adjustment_minor,
                count(*)::text AS calculations
           FROM financial_calculations WHERE creator_id=$1
          GROUP BY status, currency ORDER BY status, currency`,
        [creatorId],
      ),
    ]);
    return {
      scope: 'creator',
      creatorId,
      usage: usage.map((row) => ({
        unit: row.unit,
        verificationState: row.verification_state,
        quantity: row.quantity,
        events: row.events,
      })),
      costs: costs.map((row) => ({
        state: row.state,
        currency: row.currency,
        amountMinor: row.amount_minor,
        records: row.records,
      })),
      calculations: calculations.map((row) => ({
        status: row.status,
        currency: row.currency,
        grossMinor: row.gross_minor,
        netSalesMinor: row.net_sales_minor,
        commissionMinor: row.commission_minor,
        creatorProceedsMinor: row.creator_proceeds_minor,
        settlementAdjustmentMinor: row.settlement_adjustment_minor,
        calculations: row.calculations,
      })),
      disclaimer:
        'Usage costs are attribution evidence only. They do not charge buyers or automatically deduct creator balances/payouts.',
    };
  }

  private async activePolicy(manager: EntityManager, agentId: string) {
    const rows = await manager.query<UsagePolicyRow[]>(
      `SELECT * FROM agent_usage_policies WHERE agent_id=$1 AND status='ACTIVE'`,
      [agentId],
    );
    return rows[0] ?? null;
  }

  private async insertCost(
    manager: EntityManager,
    input: {
      usageEventId: string;
      state:
        | 'ESTIMATED'
        | 'REPORTED_UNVERIFIED'
        | 'RECONCILED_FINAL'
        | 'DISPUTED'
        | 'UNDER_INVESTIGATION'
        | 'UNKNOWN';
      amountMinor: bigint | null;
      currency: string | null;
      priceReference: string | null;
      sourceReference: string | null;
      basis: Record<string, unknown>;
      idempotencyKey: string;
      observedBy: string | null;
      supersedesId: string | null;
    },
  ): Promise<string> {
    const rows = await manager.query<Array<{ id: string }>>(
      `INSERT INTO usage_cost_records
         (usage_event_id, state, amount_minor, currency, price_reference,
          source_reference, basis, idempotency_key, supersedes_id, observed_by,
          observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        input.usageEventId,
        input.state,
        input.amountMinor?.toString() ?? null,
        input.currency,
        input.priceReference,
        input.sourceReference,
        JSON.stringify(input.basis),
        input.idempotencyKey,
        input.supersedesId,
        input.observedBy,
      ],
    );
    if (rows[0]) return rows[0].id;
    const existing = await manager.query<Array<{ id: string }>>(
      `SELECT id FROM usage_cost_records WHERE idempotency_key=$1`,
      [input.idempotencyKey],
    );
    return existing[0].id;
  }

  private validatePolicyInput(input: UsagePolicyInput): void {
    if (!input.enabled) return;
    const executions = input.maxExecutionsPerBuyer ?? null;
    const period = input.periodDays ?? null;
    const maxInput = input.maxInputBytes ?? null;
    if (executions === null && maxInput === null) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'An enabled usage policy needs an execution or input-size limit',
      );
    }
    if (
      (executions === null) !== (period === null) ||
      (executions !== null && !asInt(executions, 1, 1_000_000)) ||
      (period !== null && !asInt(period, 1, 366)) ||
      (maxInput !== null && !asInt(maxInput, 1, 1_048_576))
    ) {
      throw new ApiException('VALIDATION_ERROR', 'Invalid usage policy limit');
    }
  }

  private policyView(row: UsagePolicyRow) {
    return {
      id: row.id,
      agentId: row.agent_id,
      creatorId: row.creator_id,
      version: row.version,
      enabled: row.enabled,
      maxExecutionsPerBuyer: row.max_executions_per_buyer,
      periodDays: row.period_days,
      maxInputBytes: row.max_input_bytes,
      enforcementNote: row.enforcement_note,
      enforcement: row.enabled
        ? 'MESH_GATEWAY_ENFORCED_ONLY'
        : 'NO_USAGE_LIMIT_DECLARED',
      createdAt: row.created_at,
    };
  }
}

export { USAGE_UNITS };
