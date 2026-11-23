import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { ApiException } from '../../../common/errors/api-error';
import {
  AdminAuditService,
  type AdminActor,
} from '../audit/admin-audit.service';
import { featureFlagChangesTotal } from '../control-plane-metrics';

/** The only rollout percentages the platform offers (spec W1). */
export const ROLLOUT_BUCKETS = [0, 1, 5, 10, 25, 50, 100] as const;

export const KILL_SWITCHES = [
  'PAYMENTS_ENABLED',
  'CHECKOUT_ENABLED',
  'PAYOUTS_ENABLED',
  'REVIEWS_ENABLED',
  'UPLOADS_ENABLED',
] as const;
export type KillSwitchKey = (typeof KILL_SWITCHES)[number];

export interface FlagRow {
  key: string;
  environment: string;
  kind: 'boolean' | 'percentage';
  enabled: boolean;
  rollout_percent: number;
  default_value: boolean;
  owner: string;
  description: string;
  kill_switch: boolean;
  scheduled_activation_at: Date | null;
  user_targets: string[];
  creator_targets: string[];
  version: number;
  updated_at: Date;
  updated_by: string | null;
}

export interface FlagView {
  key: string;
  environment: string;
  kind: 'boolean' | 'percentage';
  enabled: boolean;
  rolloutPercent: number;
  defaultValue: boolean;
  owner: string;
  description: string;
  killSwitch: boolean;
  scheduledActivationAt: string | null;
  userTargets: string[];
  creatorTargets: string[];
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

/** Stable 0–99 bucket: the same subject always lands in the same bucket for a flag. */
export function bucketFor(flagKey: string, subjectId: string): number {
  const digest = createHash('sha256')
    .update(`${flagKey}:${subjectId}`)
    .digest();
  return digest.readUInt32BE(0) % 100;
}

export interface EvaluationContext {
  userId?: string;
  creatorId?: string;
  now?: Date;
}

/** Pure evaluation (unit-testable): precedence is documented in docs/admin/FEATURE_FLAGS.md. */
export function evaluateFlag(
  row: Pick<
    FlagRow,
    | 'key'
    | 'kind'
    | 'enabled'
    | 'rollout_percent'
    | 'default_value'
    | 'scheduled_activation_at'
    | 'user_targets'
    | 'creator_targets'
  >,
  ctx: EvaluationContext = {},
): boolean {
  const now = ctx.now ?? new Date();
  // 1. explicit targets win over everything except the master switch
  if (!row.enabled) return false;
  if (ctx.userId && row.user_targets.includes(ctx.userId)) return true;
  if (ctx.creatorId && row.creator_targets.includes(ctx.creatorId)) return true;
  // 2. scheduled activation: not before its time
  if (row.scheduled_activation_at && row.scheduled_activation_at > now) {
    return row.default_value;
  }
  // 3. percentage rollout, deterministic per subject
  if (row.kind === 'percentage') {
    const subject = ctx.userId ?? ctx.creatorId;
    if (!subject) return row.rollout_percent >= 100;
    return bucketFor(row.key, subject) < row.rollout_percent;
  }
  return true;
}

function environmentName(): string {
  return process.env.FLAGS_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development';
}
const CACHE_MS = 1_000;

function view(r: FlagRow): FlagView {
  return {
    key: r.key,
    environment: r.environment,
    kind: r.kind,
    enabled: r.enabled,
    rolloutPercent: r.rollout_percent,
    defaultValue: r.default_value,
    owner: r.owner,
    description: r.description,
    killSwitch: r.kill_switch,
    scheduledActivationAt: r.scheduled_activation_at?.toISOString() ?? null,
    userTargets: r.user_targets,
    creatorTargets: r.creator_targets,
    version: r.version,
    updatedAt: r.updated_at.toISOString(),
    updatedBy: r.updated_by,
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class FeatureFlagsService {
  private cache: { at: number; rows: FlagRow[] } | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AdminAuditService,
  ) {}

  private async rows(): Promise<FlagRow[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS)
      return this.cache.rows;
    const rows = await this.dataSource.query<FlagRow[]>(
      `SELECT key, environment, kind, enabled, rollout_percent, default_value, owner, description,
              kill_switch, scheduled_activation_at, user_targets::text[] AS user_targets,
              creator_targets::text[] AS creator_targets, version, updated_at, updated_by::text AS updated_by
         FROM feature_flags ORDER BY key, environment`,
    );
    this.cache = { at: Date.now(), rows };
    return rows;
  }

  invalidate(): void {
    this.cache = null;
  }

  /** The row that applies in this environment: env-specific beats 'all'. */
  private effective(rows: FlagRow[], key: string): FlagRow | undefined {
    const env = environmentName();
    return (
      rows.find((r) => r.key === key && r.environment === env) ??
      rows.find((r) => r.key === key && r.environment === 'all')
    );
  }

  async isEnabled(key: string, ctx: EvaluationContext = {}): Promise<boolean> {
    const row = this.effective(await this.rows(), key);
    if (!row) return false;
    return evaluateFlag(row, ctx);
  }

  /**
   * Guard used on the payment / checkout / payout / review / upload paths.
   * A switch whose row is missing counts as "never engaged" (capability stays
   * available) — the five rows are created by the migration and cannot be
   * deleted through the API. A database error propagates (the request would
   * fail on the database anyway), it is never swallowed into "allowed".
   */
  async assertEnabled(...keys: KillSwitchKey[]): Promise<void> {
    const rows = await this.rows();
    for (const key of keys) {
      const row = this.effective(rows, key);
      if (row && !evaluateFlag(row)) {
        throw new ApiException(
          'FEATURE_DISABLED',
          'This capability is temporarily unavailable',
          HttpStatus.SERVICE_UNAVAILABLE,
          { capability: key },
        );
      }
    }
  }

  async list(): Promise<FlagView[]> {
    return (await this.rows()).map(view);
  }

  private async lock(
    manager: import('typeorm').EntityManager,
    key: string,
    environment: string,
  ) {
    const rows = await manager.query<FlagRow[]>(
      `SELECT key, environment, kind, enabled, rollout_percent, default_value, owner, description,
              kill_switch, scheduled_activation_at, user_targets::text[] AS user_targets,
              creator_targets::text[] AS creator_targets, version, updated_at, updated_by::text AS updated_by
         FROM feature_flags WHERE key = $1 AND environment = $2 FOR UPDATE`,
      [key, environment],
    );
    if (!rows[0]) {
      throw new ApiException(
        'NOT_FOUND',
        'Feature flag not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return rows[0];
  }

  private requireReason(reason: string | undefined): string {
    const r = (reason ?? '').trim();
    if (r.length < 8) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'A reason of at least 8 characters is required',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return r.slice(0, 1000);
  }

  async create(
    actor: AdminActor,
    input: {
      key: string;
      environment?: string;
      kind?: 'boolean' | 'percentage';
      owner: string;
      description: string;
      reason: string;
    },
  ): Promise<FlagView> {
    const reason = this.requireReason(input.reason);
    if (!/^[a-z][a-z0-9_.]{2,62}$/.test(input.key)) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'key must be lower-case letters, digits, "." or "_" (3-63 chars, starts with a letter)',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (!input.owner?.trim() || !input.description?.trim()) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'owner and description are required',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const env = (input.environment ?? 'all').trim();
    await this.dataSource.transaction(async (manager) => {
      const exists = await manager.query<unknown[]>(
        `SELECT 1 FROM feature_flags WHERE key = $1 AND environment = $2`,
        [input.key, env],
      );
      if (exists.length) {
        throw new ApiException(
          'CONFLICT',
          'A flag with this key already exists',
          HttpStatus.CONFLICT,
        );
      }
      await manager.query(
        `INSERT INTO feature_flags (key, environment, kind, enabled, default_value, owner, description, updated_by)
         VALUES ($1,$2,$3,false,false,$4,$5,$6)`,
        [
          input.key,
          env,
          input.kind ?? 'boolean',
          input.owner.trim().slice(0, 80),
          input.description.trim(),
          actor.id,
        ],
      );
      await this.audit.record(
        {
          category: 'FEATURE_FLAG_CHANGE',
          action: 'feature_flag.created',
          actor,
          resourceType: 'feature_flag',
          resourceId: input.key,
          reason,
          after: {
            environment: env,
            kind: input.kind ?? 'boolean',
            owner: input.owner,
          },
        },
        manager,
      );
    });
    featureFlagChangesTotal.inc({ kind: 'flag' });
    this.invalidate();
    return (await this.list()).find(
      (f) => f.key === input.key && f.environment === env,
    ) as FlagView;
  }

  /** Changes a normal (non kill-switch) flag. Kill switches have their own, stricter operation. */
  async update(
    actor: AdminActor,
    input: {
      key: string;
      environment?: string;
      expectedVersion: number;
      reason: string;
      enabled?: boolean;
      rolloutPercent?: number;
      scheduledActivationAt?: string | null;
      userTargets?: string[];
      creatorTargets?: string[];
    },
  ): Promise<FlagView> {
    const reason = this.requireReason(input.reason);
    const env = input.environment ?? 'all';
    if (
      input.rolloutPercent !== undefined &&
      !(ROLLOUT_BUCKETS as readonly number[]).includes(input.rolloutPercent)
    ) {
      throw new ApiException(
        'VALIDATION_ERROR',
        `rolloutPercent must be one of ${ROLLOUT_BUCKETS.join(', ')}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    for (const list of [input.userTargets, input.creatorTargets]) {
      if (list && (list.length > 500 || list.some((id) => !UUID_RE.test(id)))) {
        throw new ApiException(
          'VALIDATION_ERROR',
          'Targets must be at most 500 valid ids',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    }
    let scheduled: Date | null | undefined;
    if (input.scheduledActivationAt !== undefined) {
      if (input.scheduledActivationAt === null) scheduled = null;
      else {
        scheduled = new Date(input.scheduledActivationAt);
        if (Number.isNaN(scheduled.getTime())) {
          throw new ApiException(
            'VALIDATION_ERROR',
            'Invalid scheduledActivationAt',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
      }
    }
    await this.dataSource.transaction(async (manager) => {
      const cur = await this.lock(manager, input.key, env);
      if (cur.kill_switch) {
        throw new ApiException(
          'FORBIDDEN',
          'Kill switches are changed through the kill-switch operation only',
          HttpStatus.FORBIDDEN,
        );
      }
      if (cur.version !== input.expectedVersion) {
        throw new ApiException(
          'STALE_STATE',
          'The flag was changed by someone else; reload and try again',
          HttpStatus.CONFLICT,
          { currentVersion: cur.version },
        );
      }
      if (input.rolloutPercent !== undefined && cur.kind !== 'percentage') {
        throw new ApiException(
          'INVALID_STATE',
          'Only percentage flags have a rollout',
          HttpStatus.CONFLICT,
        );
      }
      const next = {
        enabled: input.enabled ?? cur.enabled,
        rollout_percent: input.rolloutPercent ?? cur.rollout_percent,
        scheduled_activation_at:
          scheduled === undefined ? cur.scheduled_activation_at : scheduled,
        user_targets: input.userTargets ?? cur.user_targets,
        creator_targets: input.creatorTargets ?? cur.creator_targets,
      };
      await manager.query(
        `UPDATE feature_flags
            SET enabled = $3, rollout_percent = $4, scheduled_activation_at = $5,
                user_targets = $6::uuid[], creator_targets = $7::uuid[],
                version = version + 1, updated_at = now(), updated_by = $8
          WHERE key = $1 AND environment = $2`,
        [
          input.key,
          env,
          next.enabled,
          next.rollout_percent,
          next.scheduled_activation_at,
          next.user_targets,
          next.creator_targets,
          actor.id,
        ],
      );
      await this.audit.record(
        {
          category: 'FEATURE_FLAG_CHANGE',
          action: 'feature_flag.updated',
          severity: 'notice',
          actor,
          resourceType: 'feature_flag',
          resourceId: input.key,
          reason,
          before: {
            enabled: cur.enabled,
            rolloutPercent: cur.rollout_percent,
            scheduledActivationAt: cur.scheduled_activation_at,
            userTargets: cur.user_targets.length,
            creatorTargets: cur.creator_targets.length,
            version: cur.version,
          },
          after: {
            enabled: next.enabled,
            rolloutPercent: next.rollout_percent,
            scheduledActivationAt: next.scheduled_activation_at,
            userTargets: next.user_targets.length,
            creatorTargets: next.creator_targets.length,
            version: cur.version + 1,
          },
          metadata: { environment: env },
        },
        manager,
      );
    });
    featureFlagChangesTotal.inc({ kind: 'flag' });
    this.invalidate();
    return (await this.list()).find(
      (f) => f.key === input.key && f.environment === env,
    ) as FlagView;
  }

  /**
   * Flips a protected emergency switch. Requires: SUPER_ADMIN-grade permission
   * (route table), step-up, an explicit confirmation of the switch name, a
   * reason, and the version the admin saw. Always audited at critical severity.
   */
  async setKillSwitch(
    actor: AdminActor,
    input: {
      key: string;
      enabled: boolean;
      confirm: string;
      reason: string;
      expectedVersion: number;
      environment?: string;
    },
  ): Promise<FlagView> {
    const reason = this.requireReason(input.reason);
    const env = input.environment ?? 'all';
    if (!(KILL_SWITCHES as readonly string[]).includes(input.key)) {
      throw new ApiException(
        'NOT_FOUND',
        'Unknown kill switch',
        HttpStatus.NOT_FOUND,
      );
    }
    if (input.confirm !== input.key) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Type the switch name exactly to confirm',
        HttpStatus.UNPROCESSABLE_ENTITY,
        { expected: input.key },
      );
    }
    await this.dataSource.transaction(async (manager) => {
      const cur = await this.lock(manager, input.key, env);
      if (cur.version !== input.expectedVersion) {
        throw new ApiException(
          'STALE_STATE',
          'The switch was changed by someone else; reload and try again',
          HttpStatus.CONFLICT,
          { currentVersion: cur.version },
        );
      }
      if (cur.enabled === input.enabled) {
        throw new ApiException(
          'INVALID_STATE',
          `The switch is already ${cur.enabled ? 'ON' : 'OFF'}`,
          HttpStatus.CONFLICT,
        );
      }
      await manager.query(
        `UPDATE feature_flags SET enabled = $3, version = version + 1, updated_at = now(), updated_by = $4
          WHERE key = $1 AND environment = $2`,
        [input.key, env, input.enabled, actor.id],
      );
      await this.audit.record(
        {
          category: 'FEATURE_FLAG_CHANGE',
          action: input.enabled
            ? 'kill_switch.restored'
            : 'kill_switch.engaged',
          severity: 'critical',
          actor,
          resourceType: 'kill_switch',
          resourceId: input.key,
          reason,
          before: { enabled: cur.enabled, version: cur.version },
          after: { enabled: input.enabled, version: cur.version + 1 },
          metadata: { environment: env, owner: cur.owner },
        },
        manager,
      );
    });
    featureFlagChangesTotal.inc({ kind: 'kill_switch' });
    this.invalidate();
    return (await this.list()).find(
      (f) => f.key === input.key && f.environment === env,
    ) as FlagView;
  }
}
