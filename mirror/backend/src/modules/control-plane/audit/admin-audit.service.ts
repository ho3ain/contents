import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { getRequestContext } from '../../../common/logging/request-context';
import { ApiException } from '../../../common/errors/api-error';
import type { AuthUser } from '../../../common/types/auth-user';
import {
  adminAuditEventsTotal,
  adminAuditWriteFailuresTotal,
} from '../control-plane-metrics';

export const AUDIT_CATEGORIES = [
  'AUTHENTICATION',
  'AUTHORIZATION',
  'ADMIN_ACTION',
  'USER_CHANGE',
  'ROLE_CHANGE',
  'SECURITY_CHANGE',
  'CONFIG_CHANGE',
  'FEATURE_FLAG_CHANGE',
  'FINANCIAL_ADMIN_ACTION',
  'MODERATION_ACTION',
  'RISK_ACTION',
  'EXPORT',
  'IMPERSONATION',
  'KYC_ACTION',
  'SUPPORT_ACTION',
  'PAYOUT_ACTION',
  'PAYOUT_EVIDENCE_UPLOAD',
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];
export type AuditResult = 'SUCCESS' | 'DENIED' | 'FAILURE';
export type AuditSeverity = 'info' | 'notice' | 'warning' | 'critical';

/** Who did it, with the request metadata every event must carry. */
export interface AdminActor {
  id: string | null;
  role: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  /** Acting identity while impersonating (the actor is then the ADMIN). */
  impersonatedUserId?: string | null;
  impersonationSessionId?: string | null;
}

export interface AdminAuditInput {
  category: AuditCategory;
  action: string;
  result?: AuditResult;
  severity?: AuditSeverity;
  actor: AdminActor;
  resourceType?: string;
  resourceId?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

interface RequestLike {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/** Builds the actor of an authenticated admin request. */
export function adminActorFromRequest(
  user: AuthUser,
  req?: RequestLike,
  adminRole?: string | null,
): AdminActor {
  const ua = req?.headers?.['user-agent'];
  return {
    id: user.impersonation?.actingAdminId ?? user.id,
    role: adminRole ?? String(user.role),
    ip: req?.ip ?? null,
    userAgent: Array.isArray(ua) ? ua[0] : (ua ?? null),
    requestId: getRequestContext()?.requestId ?? null,
    impersonatedUserId: user.impersonation ? user.id : null,
    impersonationSessionId: user.impersonation?.sessionId ?? null,
  };
}

const SECRET_KEY =
  /pass(word)?|token|secret|authorization|cookie|otp|recovery|private|credential|iban|national_?id/i;

/**
 * PostgreSQL `jsonb` cannot store U+0000 or an unpaired UTF-16 surrogate: the
 * INSERT fails. Request bodies are attacker-controlled, so without this an
 * invalid body (`"name": "a\u0000b"`) would make the strict audit write fail
 * and turn a 400 into a 503. Both are replaced before anything is stored.
 */
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
export function jsonbSafe(text: string): string {
  return text.split('\u0000').join('\uFFFD').replace(LONE_SURROGATE, '\uFFFD');
}

/** Recursively removes secret-looking keys; bounds depth and size; makes every string storable. */
export function scrubForAudit(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (depth > 6) return '[depth-limit]';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value))
    return value.slice(0, 100).map((v) => scrubForAudit(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = jsonbSafe(k);
      out[key] = SECRET_KEY.test(key)
        ? '[redacted]'
        : scrubForAudit(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string')
    return jsonbSafe(value.length > 2000 ? `${value.slice(0, 2000)}…` : value);
  return value;
}

export interface WrittenAuditEvent {
  id: string;
  seq: string;
  hash: string;
}

/**
 * Phase 3 / W8 — the audit writer.
 *
 * Two modes, chosen by the CALLER according to the risk of the operation:
 *  - `record(input, manager)`  — inside the domain transaction: if the audit
 *    row cannot be written the whole operation rolls back, so a privileged
 *    action can never succeed silently without its audit event (§63).
 *  - `recordBestEffort(input)` — for denials / authentication noise where
 *    refusing the request on an audit failure would only help an attacker;
 *    failures are logged and counted (alert: audit write failures).
 *
 * The hash chain is computed by the database (see the migration), so neither
 * mode can write an event that is not linked.
 */
@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async record(
    input: AdminAuditInput,
    manager?: EntityManager,
  ): Promise<WrittenAuditEvent> {
    const run = manager ?? this.dataSource.manager;
    try {
      const rows = await run.query<WrittenAuditEvent[]>(
        `INSERT INTO admin_audit_events
           (category, action, result, severity, actor_id, actor_role,
            impersonated_user_id, impersonation_session_id,
            resource_type, resource_id, reason, request_id, ip, user_agent,
            before_state, after_state, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17::jsonb)
         RETURNING id, seq::text AS seq, hash`,
        [
          input.category,
          input.action,
          input.result ?? 'SUCCESS',
          input.severity ?? 'info',
          input.actor.id,
          input.actor.role,
          input.actor.impersonatedUserId ?? null,
          input.actor.impersonationSessionId ?? null,
          input.resourceType ?? null,
          input.resourceId ?? null,
          input.reason ?? null,
          input.actor.requestId ?? getRequestContext()?.requestId ?? null,
          sanitizeIp(input.actor.ip),
          input.actor.userAgent?.slice(0, 400) ?? null,
          input.before === undefined
            ? null
            : JSON.stringify(scrubForAudit(input.before)),
          input.after === undefined
            ? null
            : JSON.stringify(scrubForAudit(input.after)),
          JSON.stringify(scrubForAudit(input.metadata ?? {})),
        ],
      );
      adminAuditEventsTotal.inc({
        category: input.category,
        result: input.result ?? 'SUCCESS',
      });
      return rows[0];
    } catch (error) {
      adminAuditWriteFailuresTotal.inc({ mode: manager ? 'tx' : 'direct' });
      this.logger.error(
        `audit write failed (${input.category}/${input.action}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // Inside a transaction the error aborts the surrounding operation
      // (rethrown). Outside, the caller decides: record() on a high-risk path
      // must fail the request.
      throw error instanceof ApiException
        ? error
        : new ApiException(
            'SERVICE_UNAVAILABLE',
            'The action was not performed because it could not be audited',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
    }
  }

  async recordBestEffort(input: AdminAuditInput): Promise<void> {
    try {
      await this.record(input);
    } catch {
      /* already logged and counted in record() */
    }
  }
}

function sanitizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v = ip.replace(/^::ffff:/, '');
  return /^[0-9a-fA-F:.]+$/.test(v) ? v : null;
}
