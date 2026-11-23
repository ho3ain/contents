/**
 * Phase C1 — activity / inactivity classification (spec §14).
 *
 * "Thresholdها را Hard-code نکن؛ Configurable طراحی کن." The defaults live
 * in one exported object, the service overrides them from environment
 * variables (CRM_INACTIVITY_DAYS), and the ladder itself is data — adding a
 * bucket is one entry, not one branch.
 */

export const DEFAULT_ACTIVITY_THRESHOLDS = {
  /** Within this many days the record counts as freshly active. */
  activeDays: 7,
  /** Beyond `activeDays` but within this → inactive. */
  inactiveDays: 14,
  /** Beyond `inactiveDays` but within this → dormant. */
  dormantDays: 30,
} as const;

export type ActivityStatus = 'active' | 'inactive' | 'dormant' | 'unknown';

export interface ActivityThresholds {
  activeDays: number;
  inactiveDays: number;
  dormantDays: number;
}

export interface ActivityClassification {
  status: ActivityStatus;
  daysSinceActivity: number | null;
  /** i18n key so the UI explains WHY, not just the bucket. */
  reasonKey: string;
}

/**
 * Classify one record. `lastActivityAt === null` is honestly `unknown`
 * ("no activity yet"), never silently counted as active.
 *
 * The ladder is evaluated from the widest bucket inwards so a custom
 * threshold set (e.g. 3/10/45) behaves exactly like the default one.
 */
export function classifyActivity(
  lastActivityAt: Date | string | null | undefined,
  thresholds: ActivityThresholds = DEFAULT_ACTIVITY_THRESHOLDS,
  now: Date = new Date(),
): ActivityClassification {
  if (!lastActivityAt) {
    return {
      status: 'unknown',
      daysSinceActivity: null,
      reasonKey: 'crm.activity.reason.unknown',
    };
  }
  const last =
    lastActivityAt instanceof Date ? lastActivityAt : new Date(lastActivityAt);
  const ms = now.getTime() - last.getTime();
  if (Number.isNaN(ms)) {
    return {
      status: 'unknown',
      daysSinceActivity: null,
      reasonKey: 'crm.activity.reason.unknown',
    };
  }
  const days = Math.floor(ms / 86_400_000);
  if (days <= thresholds.activeDays) {
    return {
      status: 'active',
      daysSinceActivity: days,
      reasonKey: 'crm.activity.reason.active',
    };
  }
  if (days <= thresholds.inactiveDays) {
    return {
      status: 'inactive',
      daysSinceActivity: days,
      reasonKey: 'crm.activity.reason.inactive',
    };
  }
  if (days <= thresholds.dormantDays) {
    return {
      status: 'dormant',
      daysSinceActivity: days,
      reasonKey: 'crm.activity.reason.dormant',
    };
  }
  return {
    status: 'dormant',
    daysSinceActivity: days,
    reasonKey: 'crm.activity.reason.dormant',
  };
}

/** The "needs a reactivation push" filter: past `dormantDays`. */
export function isCold(
  lastActivityAt: Date | string | null | undefined,
  thresholds: ActivityThresholds = DEFAULT_ACTIVITY_THRESHOLDS,
  now: Date = new Date(),
): boolean {
  return classifyActivity(lastActivityAt, thresholds, now).status === 'dormant';
}

/** Reads the thresholds from env, falling back to the documented defaults. */
export function thresholdsFromEnv(
  env: Record<string, string | undefined>,
): ActivityThresholds {
  const read = (key: string, fallback: number): number => {
    const parsed = Number.parseInt(env[key] ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const activeDays = read(
    'CRM_ACTIVE_DAYS',
    DEFAULT_ACTIVITY_THRESHOLDS.activeDays,
  );
  const inactiveDays = Math.max(
    activeDays + 1,
    read('CRM_INACTIVE_DAYS', DEFAULT_ACTIVITY_THRESHOLDS.inactiveDays),
  );
  const dormantDays = Math.max(
    inactiveDays + 1,
    read('CRM_DORMANT_DAYS', DEFAULT_ACTIVITY_THRESHOLDS.dormantDays),
  );
  return { activeDays, inactiveDays, dormantDays };
}
