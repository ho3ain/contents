import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { sanitizeMetadata } from './domain/privacy';
import {
  CREATOR_EVENTS,
  CreatorEventName,
  eventSource,
  timelineKind,
  type CreatorEventSource,
  type TimelineKind,
} from './domain/events';

export interface RecordCreatorEventInput {
  /**
   * The event vocabulary is OPEN by design (a new integration can add its
   * own signal without a migration), so the type is a string; the named
   * union is exported for callers that want the checklist.
   */
  eventName: CreatorEventName | (string & Record<never, never>);
  leadId?: string | null;
  creatorProfileId?: string | null;
  userId?: string | null;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /**
   * The idempotency key required by §29. The SAME logical event always
   * produces the SAME key, so a replayed webhook or a retried transaction
   * inserts exactly one row.
   */
  dedupKey: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

/**
 * Phase C1 — the ONE writer of creator lifecycle events.
 *
 * Three invariants, enforced here rather than at ~15 call sites:
 *   1. IDEMPOTENT — `ON CONFLICT (dedup_key) DO NOTHING` (spec §29).
 *   2. PRIVATE — metadata always passes through `sanitizeMetadata()`, so no
 *      card, token, password or secret can reach the table (spec §11).
 *   3. NON-FATAL — `recordSafe()` logs instead of throwing: analytics must
 *      never break a purchase, a publish or a signup.
 */
@Injectable()
export class CrmEventsService {
  private readonly logger = new Logger(CrmEventsService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Inserts the event once. Returns true only when a NEW row was written. */
  async record(
    input: RecordCreatorEventInput,
    manager?: EntityManager,
  ): Promise<boolean> {
    const runner = manager ?? this.dataSource.manager;
    const rows = await runner.query<Array<{ id: string }>>(
      `INSERT INTO creator_growth_events
         (lead_id, creator_profile_id, user_id, event_name, actor_id, source,
          entity_type, entity_id, dedup_key, metadata, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
               COALESCE($11, now()))
       ON CONFLICT (dedup_key) DO NOTHING
       RETURNING id`,
      [
        input.leadId ?? null,
        input.creatorProfileId ?? null,
        input.userId ?? null,
        input.eventName,
        input.actorId ?? null,
        eventSource(input.eventName) satisfies CreatorEventSource,
        input.entityType ?? null,
        input.entityId ?? null,
        input.dedupKey.slice(0, 200),
        JSON.stringify(sanitizeMetadata(input.metadata)),
        input.occurredAt ?? null,
      ],
    );
    return rows.length > 0;
  }

  /** record() that logs instead of throwing (non-critical call sites). */
  async recordSafe(
    input: RecordCreatorEventInput,
    manager?: EntityManager,
  ): Promise<boolean> {
    try {
      return await this.record(input, manager);
    } catch (error) {
      this.logger.error(
        `Failed to record creator event ${input.eventName}`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  /**
   * Convenience: the dedup key a system transition should use. Keeping the
   * format in one place means two call sites can never disagree about what
   * "the same" event means.
   */
  static dedupKey(
    eventName: string,
    ...parts: Array<string | number | null>
  ): string {
    return [
      eventName,
      ...parts.map((part) => (part === null ? 'x' : String(part))),
    ].join(':');
  }

  /**
   * The MAX occurred_at of a set of events for one lead — what the CRM shows
   * as "Last Activity". Kept here so the definition lives next to the writer.
   */
  async lastActivityAt(
    leadId: string,
    manager?: EntityManager,
  ): Promise<Date | null> {
    const runner = manager ?? this.dataSource.manager;
    const rows = await runner.query<Array<{ last: Date | null }>>(
      `SELECT MAX(occurred_at) AS last
         FROM creator_growth_events
        WHERE lead_id = $1`,
      [leadId],
    );
    return rows[0]?.last ?? null;
  }

  /**
   * The funnel timestamps the dashboard needs (spec §12 "Time to Next
   * Stage"). One grouped query per stage rather than N round-trips.
   */
  async stageTimestamps(
    creatorProfileIds: string[],
  ): Promise<Map<string, Record<string, Date>>> {
    const map = new Map<string, Record<string, Date>>();
    if (!creatorProfileIds.length) return map;
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT creator_profile_id,
              MIN(occurred_at) FILTER (WHERE event_name = $2) AS registered,
              MIN(occurred_at) FILTER (WHERE event_name = $3) AS activated,
              MIN(occurred_at) FILTER (WHERE event_name = $4) AS product_started,
              MIN(occurred_at) FILTER (WHERE event_name = $5) AS product_submitted,
              MIN(occurred_at) FILTER (WHERE event_name = $6) AS approved,
              MIN(occurred_at) FILTER (WHERE event_name = $7) AS published,
              MIN(occurred_at) FILTER (WHERE event_name = $8) AS first_sale
         FROM creator_growth_events
        WHERE creator_profile_id = ANY($1::uuid[])
          AND event_name IN ($2, $3, $4, $5, $6, $7, $8)
        GROUP BY creator_profile_id`,
      // One bound parameter per event name. The previous shape bound the
      // names as ONE array in $2 while the FILTER clauses read $2..$8 as
      // scalars — Postgres rejected the statement, so stage timestamps were
      // never computed. Caught by `raw-sql-hygiene.spec.ts`.
      [
        creatorProfileIds,
        CREATOR_EVENTS.SIGNUP,
        CREATOR_EVENTS.ONBOARDING_COMPLETED,
        CREATOR_EVENTS.PRODUCT_STARTED,
        CREATOR_EVENTS.PRODUCT_SUBMITTED,
        CREATOR_EVENTS.PRODUCT_APPROVED,
        CREATOR_EVENTS.PRODUCT_PUBLISHED,
        CREATOR_EVENTS.FIRST_SALE,
      ],
    );
    for (const row of rows) {
      const key = String(row.creator_profile_id);
      const stamps: Record<string, Date> = {};
      for (const [name, value] of Object.entries(row)) {
        if (
          name === 'creator_profile_id' ||
          value === null ||
          value === undefined
        )
          continue;
        stamps[name] =
          value instanceof Date ? value : new Date(value as string | number);
      }
      map.set(key, stamps);
    }
    return map;
  }

  /** Latest N events for one lead, newest first (spec §2 Timeline). */
  async timeline(
    leadId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT e.id, e.event_name, e.source, e.entity_type, e.entity_id,
              e.metadata, e.occurred_at, e.actor_id,
              u.username AS actor_username, u.full_name AS actor_name
         FROM creator_growth_events e
         LEFT JOIN users u ON u.id = e.actor_id
        WHERE e.lead_id = $1
        ORDER BY e.occurred_at DESC, e.created_at DESC
        LIMIT $2 OFFSET $3`,
      [leadId, limit, offset],
    );
    const countRows = await this.dataSource.query<Array<{ total: string }>>(
      `SELECT COUNT(*)::text AS total FROM creator_growth_events WHERE lead_id = $1`,
      [leadId],
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        eventName: row.event_name,
        source: row.source,
        kind: timelineKind(String(row.event_name)),
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadata: row.metadata ?? {},
        occurredAt: row.occurred_at,
        actor: row.actor_id
          ? {
              id: row.actor_id,
              username: row.actor_username,
              name: row.actor_name,
            }
          : null,
      })),
      total: Number.parseInt(countRows[0]?.total ?? '0', 10),
    };
  }

  /**
   * System events for a creator who has NO lead row (registered before C1).
   * Anchoring on creator_profile_id keeps their timeline and funnel real
   * instead of pretending they never existed.
   */
  async timelineByCreator(
    creatorProfileId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `SELECT id, event_name, source, entity_type, entity_id, metadata,
              occurred_at, actor_id
         FROM creator_growth_events
        WHERE creator_profile_id = $1 AND lead_id IS NULL
        ORDER BY occurred_at DESC, created_at DESC
        LIMIT $2 OFFSET $3`,
      [creatorProfileId, limit, offset],
    );
    const countRows = await this.dataSource.query<Array<{ total: string }>>(
      `SELECT COUNT(*)::text AS total
         FROM creator_growth_events
        WHERE creator_profile_id = $1 AND lead_id IS NULL`,
      [creatorProfileId],
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        eventName: row.event_name,
        source: row.source,
        kind: timelineKind(String(row.event_name)),
        entityType: row.entity_type,
        entityId: row.entity_id,
        metadata: row.metadata ?? {},
        occurredAt: row.occurred_at,
        actor: null,
      })),
      total: Number.parseInt(countRows[0]?.total ?? '0', 10),
    };
  }

  /** Everything the §15 readiness report needs, in one query. */
  async eventCountsByName(): Promise<Record<string, number>> {
    const rows = await this.dataSource.query<
      Array<{ event_name: string; count: string }>
    >(
      `SELECT event_name, COUNT(*)::text AS count
         FROM creator_growth_events
        GROUP BY event_name`,
    );
    const out: Record<string, number> = {};
    for (const row of rows)
      out[row.event_name] = Number.parseInt(row.count, 10);
    return out;
  }

  /** Distinct event names present for a lead — used by the detail view. */
  async hasEvent(leadId: string, eventName: string): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM creator_growth_events
          WHERE lead_id = $1 AND event_name = $2
       ) AS exists`,
      [leadId, eventName],
    );
    return rows[0]?.exists === true;
  }

  /** Re-points every event of a merged lead at the surviving lead. */
  async moveLeadEvents(
    fromLeadId: string,
    toLeadId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const runner = manager ?? this.dataSource.manager;
    await runner.query(
      `UPDATE creator_growth_events SET lead_id = $2 WHERE lead_id = $1`,
      [fromLeadId, toLeadId],
    );
  }

  /** Moves attribution rows to the surviving lead so attribution survives. */
  async moveAttributions(
    fromLeadId: string,
    toLeadId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const runner = manager ?? this.dataSource.manager;
    await runner.query(
      `UPDATE creator_attributions SET lead_id = $2 WHERE lead_id = $1`,
      [fromLeadId, toLeadId],
    );
  }
}

export { CREATOR_EVENTS, eventSource, timelineKind };
export type { TimelineKind };
