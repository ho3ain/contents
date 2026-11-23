import { createHash } from 'node:crypto';
import { buildSearchPlan } from '../agents/search/query-plan';
import {
  INTEREST_HALF_LIFE_DAYS,
  INTEREST_SIGNAL_WEIGHTS,
} from './interest.constants';
import type { BuyerEventInput } from './buyer-events';

/** Anything with a pg-style `query()` — DataSource or a transaction manager. */
export interface SqlRunner {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T>;
}

/** Stable, fixed-length dedup key (fits varchar(64)). */
export function buyerDedupKey(
  ...parts: Array<string | number | null | undefined>
): string {
  return createHash('sha1')
    .update(parts.map((part) => String(part ?? '')).join('|'))
    .digest('hex');
}

export const SCORE_CAP = 100;

/**
 * The categories a behaviour says something about:
 *  - a category event → that category;
 *  - a product event → the product's categories;
 *  - a creator event → the categories the creator's live products sit in;
 *  - a search → the categories of its best-matching live products.
 */
export async function interestCategories(
  runner: SqlRunner,
  input: Pick<
    BuyerEventInput,
    'agentId' | 'categoryId' | 'creatorId' | 'query'
  >,
): Promise<string[]> {
  if (input.categoryId) return [input.categoryId];
  if (input.agentId) {
    const rows = await runner.query<Array<{ category_id: string }>>(
      `SELECT category_id FROM agent_categories WHERE agent_id = $1 LIMIT 3`,
      [input.agentId],
    );
    return rows.map((row) => row.category_id);
  }
  if (input.creatorId) {
    const rows = await runner.query<Array<{ category_id: string }>>(
      `SELECT ac.category_id
         FROM agents a
         JOIN agent_categories ac ON ac.agent_id = a.id
        WHERE a.creator_id = $1 AND a.status = 'published'
        GROUP BY ac.category_id
        ORDER BY COUNT(*) DESC
        LIMIT 3`,
      [input.creatorId],
    );
    return rows.map((row) => row.category_id);
  }
  if (input.query) {
    const plan = buildSearchPlan(input.query);
    if (!plan.anyExpression) return [];
    const rows = await runner.query<Array<{ category_id: string }>>(
      `SELECT ac.category_id
         FROM agents a
         JOIN agent_categories ac ON ac.agent_id = a.id
        WHERE a.status = 'published'
          AND a.search_vector @@ to_tsquery('simple', $1::text)
        GROUP BY ac.category_id
        ORDER BY COUNT(*) DESC
        LIMIT 2`,
      [plan.anyExpression],
    );
    return rows.map((row) => row.category_id);
  }
  return [];
}

/**
 * Adds one behaviour to the buyer's interest profile. Stored scores decay
 * with INTEREST_HALF_LIFE_DAYS (applied here, on write, and again on read).
 * Negative signals (unsave / unfollow) never push a score below zero.
 */
export async function applyInterest(
  runner: SqlRunner,
  userId: string,
  input: BuyerEventInput,
): Promise<void> {
  const weight = INTEREST_SIGNAL_WEIGHTS[input.type];
  if (!weight) return;
  const categories = await interestCategories(runner, input);
  if (categories.length === 0) return;
  const share = weight / categories.length;
  for (const categoryId of categories) {
    await runner.query(
      `INSERT INTO buyer_interest_scores (user_id, category_id, score, signals, last_signal_at)
       VALUES ($1, $2, GREATEST($3::float8, 0), jsonb_build_object($4::text, 1), now())
       ON CONFLICT (user_id, category_id) DO UPDATE SET
         score = LEAST($6::float8, GREATEST(0,
           buyer_interest_scores.score
             * POWER(0.5, EXTRACT(EPOCH FROM (now() - buyer_interest_scores.last_signal_at)) / 86400.0 / $5::float8)
             + $3::float8)),
         signals = jsonb_set(
           buyer_interest_scores.signals,
           ARRAY[$4::text],
           to_jsonb(COALESCE((buyer_interest_scores.signals ->> $4::text)::int, 0) + 1)
         ),
         last_signal_at = now()`,
      [
        userId,
        categoryId,
        share,
        input.type,
        INTEREST_HALF_LIFE_DAYS,
        SCORE_CAP,
      ],
    );
  }
}

/**
 * The ONE writer of buyer_events. Idempotent on `dedupKey`; returns true
 * only when a NEW row was stored (so the profile is updated exactly once).
 * A signed-in actor's behaviour also feeds their interest profile.
 */
export async function insertBuyerEvent(
  runner: SqlRunner,
  input: BuyerEventInput,
): Promise<boolean> {
  const rows = await runner.query<Array<{ id: string }>>(
    `INSERT INTO buyer_events
       (event_type, user_id, visitor_key, agent_id, category_id, creator_id,
        query, result_count, source, dedup_key, metadata, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, COALESCE($12::timestamptz, now()))
     ON CONFLICT (dedup_key) DO NOTHING
     RETURNING id`,
    [
      input.type,
      input.userId ?? null,
      input.visitorKey ?? null,
      input.agentId ?? null,
      input.categoryId ?? null,
      input.creatorId ?? null,
      input.query ? input.query.slice(0, 120) : null,
      input.resultCount ?? null,
      input.source ? input.source.slice(0, 32) : null,
      input.dedupKey ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.occurredAt ?? null,
    ],
  );
  if (rows.length === 0) return false;
  if (input.userId) await applyInterest(runner, input.userId, input);
  return true;
}
