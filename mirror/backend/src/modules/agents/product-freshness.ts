import type { AgentChangelog } from '../../database/entities/agents/agent-version.entity';

/**
 * Gap closure — honest "freshness" of a live product, from REAL publish
 * dates of its versions (never from edits that buyers cannot see):
 *
 *   new      — first published ≤ NEW_DAYS ago and no later version yet
 *   updated  — a version after the first went live ≤ UPDATED_DAYS ago
 *   null     — neither (no badge)
 */
export const FRESHNESS = { newDays: 14, updatedDays: 30 } as const;

const DAY_MS = 86_400_000;

export interface PublicVersionRow {
  versionNumber: string;
  status: string;
  publishedAt: Date | null;
  changelog: AgentChangelog | null;
}

export interface ReleaseInfo {
  firstPublishedAt: Date | null;
  lastUpdatedAt: Date | null;
  versionCount: number;
  latest: {
    versionNumber: string;
    publishedAt: Date | null;
    changelog: AgentChangelog | null;
  } | null;
  freshness: { kind: 'new' | 'updated'; days: number } | null;
}

/** `versions` = published/deprecated versions, any order. */
export function releaseInfo(
  versions: PublicVersionRow[],
  now: Date = new Date(),
): ReleaseInfo {
  const dated = versions
    .filter((v) => v.publishedAt)
    .sort(
      (a, b) =>
        new Date(a.publishedAt!).getTime() - new Date(b.publishedAt!).getTime(),
    );
  if (!dated.length) {
    return {
      firstPublishedAt: null,
      lastUpdatedAt: null,
      versionCount: 0,
      latest: null,
      freshness: null,
    };
  }
  const first = dated[0];
  const latest = dated[dated.length - 1];
  const ageDays = (date: Date | null) =>
    date
      ? Math.max(
          0,
          Math.floor((now.getTime() - new Date(date).getTime()) / DAY_MS),
        )
      : Infinity;
  let freshness: ReleaseInfo['freshness'] = null;
  if (dated.length === 1 && ageDays(first.publishedAt) <= FRESHNESS.newDays) {
    freshness = { kind: 'new', days: ageDays(first.publishedAt) };
  } else if (
    dated.length > 1 &&
    ageDays(latest.publishedAt) <= FRESHNESS.updatedDays
  ) {
    freshness = { kind: 'updated', days: ageDays(latest.publishedAt) };
  }
  return {
    firstPublishedAt: first.publishedAt,
    lastUpdatedAt: latest.publishedAt,
    versionCount: dated.length,
    latest: {
      versionNumber: latest.versionNumber,
      publishedAt: latest.publishedAt,
      changelog: latest.changelog,
    },
    freshness,
  };
}
