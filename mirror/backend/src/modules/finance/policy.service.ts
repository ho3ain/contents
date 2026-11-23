import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import {
  POLICY_KINDS,
  PolicyKind,
  PolicyParamsByKind,
  PolicyRow,
  PolicyValidationError,
  resolvePolicy,
  validatePolicyParams,
} from './domain/policy';
import type { FinanceActor } from './finance-actor';
import { FinanceClock } from './finance-clock';
import { FinancialAuditService } from './financial-audit.service';

interface PolicyDbRow {
  id: string;
  kind: PolicyKind;
  version: number;
  scope_currency: string | null;
  params: PolicyParamsByKind[PolicyKind];
  priority: number;
  effective_from: Date;
  effective_until: Date | null;
  status: 'ACTIVE' | 'RETIRED';
  note: string | null;
  created_by: string | null;
  created_at: Date;
}

const toPolicy = (row: PolicyDbRow): PolicyRow => ({
  id: row.id,
  kind: row.kind,
  version: row.version,
  scopeCurrency: row.scope_currency,
  params: row.params,
  priority: row.priority,
  effectiveFrom: new Date(row.effective_from),
  effectiveUntil: row.effective_until ? new Date(row.effective_until) : null,
  status: row.status,
});

export class PolicyMissingError extends Error {
  constructor(kind: PolicyKind, at: Date) {
    super(`No ${kind} policy is in force at ${at.toISOString()}`);
    this.name = 'PolicyMissingError';
  }
}

export interface PublishPolicyInput {
  kind: PolicyKind;
  params: unknown;
  effectiveFrom: Date;
  priority?: number;
  scopeCurrency?: string | null;
  note?: string | null;
  /** Needed for an effectiveFrom more than 5 minutes in the past. */
  allowBackdate?: boolean;
  reason: string;
}

/**
 * W2.1 / §29 — reads and publishes versioned financial policy.
 * Resolution is a pure function over the rows (domain/policy.ts); nothing is
 * cached, so a newly published version applies to the very next posting.
 */
@Injectable()
export class PolicyService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clock: FinanceClock,
    private readonly audit: FinancialAuditService,
  ) {}

  async rows(manager?: EntityManager, kind?: PolicyKind): Promise<PolicyRow[]> {
    const runner = manager ?? this.dataSource.manager;
    const result = await runner.query<PolicyDbRow[]>(
      `SELECT * FROM finance_policies
        WHERE ($1::text IS NULL OR kind = $1)
        ORDER BY kind, version`,
      [kind ?? null],
    );
    return result.map(toPolicy);
  }

  /** The policy version in force at `at`; throws PolicyMissingError otherwise. */
  async resolve<K extends PolicyKind>(
    kind: K,
    at: Date,
    options: { manager?: EntityManager; currency?: string } = {},
  ): Promise<PolicyRow<K>> {
    const rows = await this.rows(options.manager, kind);
    const found = resolvePolicy(rows, kind, at, options.currency);
    if (!found) throw new PolicyMissingError(kind, at);
    return found;
  }

  async current<K extends PolicyKind>(
    kind: K,
    options: { manager?: EntityManager; currency?: string } = {},
  ): Promise<PolicyRow<K>> {
    return this.resolve(kind, this.clock.now(), options);
  }

  /** Publishes a NEW immutable version (never edits an old one). */
  async publish(
    actor: FinanceActor,
    input: PublishPolicyInput,
  ): Promise<PolicyRow> {
    if (!POLICY_KINDS.includes(input.kind)) {
      throw new ApiException('VALIDATION_ERROR', 'Unknown policy kind');
    }
    if (!input.reason || input.reason.trim().length < 5) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'A reason of at least 5 characters is required to change financial policy',
      );
    }
    let params: PolicyParamsByKind[PolicyKind];
    try {
      params = validatePolicyParams(input.kind, input.params);
    } catch (error) {
      if (error instanceof PolicyValidationError) {
        throw new ApiException('VALIDATION_ERROR', error.message);
      }
      throw error;
    }
    const now = this.clock.now();
    if (
      !input.allowBackdate &&
      input.effectiveFrom.getTime() < now.getTime() - 5 * 60_000
    ) {
      throw new ApiException(
        'FINANCE_RULE_VIOLATION',
        'effectiveFrom is in the past; a backdated policy changes how history is read and needs allowBackdate',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return this.dataSource.transaction(async (manager) => {
      // Serialise publishers of the same kind so versions are gap-free.
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `finance_policy:${input.kind}`,
      ]);
      const next = await manager.query<Array<{ v: number }>>(
        `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM finance_policies WHERE kind = $1`,
        [input.kind],
      );
      const inserted = await manager.query<PolicyDbRow[]>(
        `INSERT INTO finance_policies
           (kind, version, scope_currency, params, priority, effective_from, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          input.kind,
          next[0].v,
          input.scopeCurrency ?? null,
          JSON.stringify(params),
          input.priority ?? 0,
          input.effectiveFrom,
          input.note ?? null,
          actor.id,
        ],
      );
      // Close the window of the version this one supersedes (same kind,
      // scope and priority) so exactly one is in force at any instant.
      await manager.query(
        `UPDATE finance_policies
            SET effective_until = $1
          WHERE kind = $2 AND id <> $3 AND status = 'ACTIVE'
            AND scope_currency IS NOT DISTINCT FROM $4
            AND priority = $5
            AND effective_until IS NULL
            AND effective_from < $1`,
        [
          input.effectiveFrom,
          input.kind,
          inserted[0].id,
          input.scopeCurrency ?? null,
          input.priority ?? 0,
        ],
      );
      await this.audit.record(manager, {
        actor,
        action: 'finance.policy.published',
        targetType: 'finance_policy',
        targetId: inserted[0].id,
        after: {
          kind: input.kind,
          version: inserted[0].version,
          params,
          effectiveFrom: input.effectiveFrom.toISOString(),
        },
        reason: input.reason,
        reference: `${input.kind}:v${inserted[0].version}`,
      });
      return toPolicy(inserted[0]);
    });
  }
}
