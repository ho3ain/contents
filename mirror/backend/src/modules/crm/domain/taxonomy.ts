/**
 * Phase C1 — closed vocabularies for the CRM.
 *
 * Every list here is extensible in the right direction:
 *   - TAGS are ROWS in `creator_crm_tags` (the growth team creates new ones);
 *     the constant below only seeds the starter set.
 *   - SOURCES / CREATOR TYPES are validated against these lists so the
 *     filters stay a closed, translatable set, while a new value only needs
 *     one entry added here.
 */

// ---------------------------------------------------------------------------
// Lead sources (spec §7) — the "where did this person come from" taxonomy.
// ---------------------------------------------------------------------------

export const CRM_SOURCES = [
  'organic_search',
  'creator_landing',
  'seo',
  'linkedin',
  'x',
  'youtube',
  'community',
  'referral',
  'partner',
  'direct_outreach',
  'event',
  'existing_creator',
  'other',
] as const;
export type CrmSource = (typeof CRM_SOURCES)[number];

export function isCrmSource(value: unknown): value is CrmSource {
  return (
    typeof value === 'string' &&
    (CRM_SOURCES as readonly string[]).includes(value)
  );
}

export function normalizeSource(value?: string | null): CrmSource {
  if (!value) return 'other';
  const candidate = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return isCrmSource(candidate) ? candidate : 'other';
}

/** Maps a raw UTM source onto the closed set so attribution still lands. */
export function sourceFromUtm(utmSource?: string | null): CrmSource {
  if (!utmSource) return 'other';
  const value = utmSource.trim().toLowerCase();
  const map: Record<string, CrmSource> = {
    google: 'organic_search',
    bing: 'organic_search',
    duckduckgo: 'organic_search',
    'organic search': 'organic_search',
    seo: 'seo',
    linkedin: 'linkedin',
    'x.com': 'x',
    twitter: 'x',
    youtube: 'youtube',
    yt: 'youtube',
    telegram: 'community',
    discord: 'community',
    referral: 'referral',
    partner: 'partner',
    event: 'event',
    outreach: 'direct_outreach',
    landing: 'creator_landing',
  };
  return map[value] ?? 'other';
}

// ---------------------------------------------------------------------------
// Creator types (spec §1 "بر اساس مدل فعلی پروژه، ولی سیستم باید
// extensible باشد") — stored as a free string on the lead, validated against
// this list at the API edge. Adding a type = adding one line here.
// ---------------------------------------------------------------------------

export const CRM_CREATOR_TYPES = [
  'ai_engineer',
  'automation_expert',
  'prompt_engineer',
  'developer',
  'no_code',
  'agency',
  'educator',
  'consultant',
  'creator',
  'other',
] as const;
export type CrmCreatorType = (typeof CRM_CREATOR_TYPES)[number];

export function isCrmCreatorType(value: unknown): value is CrmCreatorType {
  return (
    typeof value === 'string' &&
    (CRM_CREATOR_TYPES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Mediums (UTM) — stored verbatim (bounded), filtered as a text facet.
// ---------------------------------------------------------------------------

export const CRM_MEDIUMS = [
  'cpc',
  'social',
  'email',
  'referral',
  'organic',
  'paid',
  'direct',
  'campaign',
  'other',
] as const;
export type CrmMedium = (typeof CRM_MEDIUMS)[number];

export function isCrmMedium(value: unknown): value is CrmMedium {
  return (
    typeof value === 'string' &&
    (CRM_MEDIUMS as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Starter tags (spec §9). These are INSERTED by the seed, not hard-wired:
// the CRM reads its tag list from `creator_crm_tags`, so the growth team can
// add "AI Agent" or "Strategic" — or anything else — at runtime.
// ---------------------------------------------------------------------------

export const STARTER_TAGS: ReadonlyArray<{
  slug: string;
  label: string;
  group: string;
}> = [
  { slug: 'ai-agent', label: 'AI Agent', group: 'domain' },
  { slug: 'automation', label: 'Automation', group: 'domain' },
  { slug: 'developer', label: 'Developer', group: 'domain' },
  { slug: 'no-code', label: 'No-Code', group: 'domain' },
  { slug: 'agency', label: 'Agency', group: 'domain' },
  { slug: 'educator', label: 'Educator', group: 'domain' },
  { slug: 'high-potential', label: 'High Potential', group: 'qualification' },
  { slug: 'strategic', label: 'Strategic', group: 'qualification' },
  {
    slug: 'first-time-creator',
    label: 'First-Time Creator',
    group: 'lifecycle',
  },
  {
    slug: 'experienced-creator',
    label: 'Experienced Creator',
    group: 'lifecycle',
  },
];

/**
 * The saved views the admin CRM opens with (spec §1). Each one is a
 * pre-built filter set the growth team uses daily; they are seeded, not
 * hard-coded in the UI, so a team can add its own without a release.
 *
 * `filters` uses the SAME query keys as GET /admin/crm/creators — that is
 * what makes a saved view round-trip through the list endpoint unchanged.
 */
export const SYSTEM_SAVED_VIEWS: ReadonlyArray<{
  slug: string;
  name: string;
  description: string;
  filters: Record<string, unknown>;
  position: number;
}> = [
  {
    slug: 'all-creators',
    name: 'All creators',
    description: 'Every person the growth team knows, newest first.',
    filters: { sort: 'created_at', pageSize: 50 },
    position: 0,
  },
  {
    slug: 'my-creators',
    name: 'Owned by me',
    description: 'The records assigned to the signed-in growth owner.',
    filters: { ownerId: '@me', sort: 'last_activity', pageSize: 50 },
    position: 1,
  },
  {
    slug: 'new-leads',
    name: 'New leads',
    description: 'Captured but not yet engaged.',
    filters: { stage: 'new_lead', sort: 'created_at', pageSize: 50 },
    position: 2,
  },
  {
    slug: 'high-potential',
    name: 'High potential',
    description: 'Score 70+ — the qualified pool.',
    filters: { scoreBand: 'high', sort: 'score', pageSize: 50 },
    position: 3,
  },
  {
    slug: 'needs-follow-up',
    name: 'Needs a next action',
    description: 'Open or snoozed tasks are still attached.',
    filters: { hasNextAction: 'true', sort: 'last_activity', pageSize: 50 },
    position: 4,
  },
  {
    slug: 'inactive-high-score',
    name: 'Inactive, high score',
    description: 'Went quiet after showing real promise — the win-back list.',
    filters: {
      activity: 'inactive',
      scoreBand: 'high',
      sort: 'last_activity',
      pageSize: 50,
    },
    position: 5,
  },
  {
    slug: 'published-no-sale',
    name: 'Published, no sale',
    description: 'Live products that have never sold.',
    filters: { productStatus: 'published', sort: 'created_at', pageSize: 50 },
    position: 6,
  },
];

export const CRM_TAG_GROUPS = [
  'domain',
  'qualification',
  'lifecycle',
  'custom',
] as const;
export type CrmTagGroup = (typeof CRM_TAG_GROUPS)[number];

export function isCrmTagGroup(value: unknown): value is CrmTagGroup {
  return (
    typeof value === 'string' &&
    (CRM_TAG_GROUPS as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Next actions (spec §4) — the closed list the growth team picks from.
// ---------------------------------------------------------------------------

export const CRM_ACTION_TYPES = [
  'send_onboarding_email',
  'follow_up',
  'ask_for_product_idea',
  'help_with_product_creation',
  'review_submission',
  'help_with_pricing',
  'promote_first_product',
  'reactivate_creator',
  'invite_to_campaign',
] as const;
export type CrmActionType = (typeof CRM_ACTION_TYPES)[number];

export function isCrmActionType(value: unknown): value is CrmActionType {
  return (
    typeof value === 'string' &&
    (CRM_ACTION_TYPES as readonly string[]).includes(value)
  );
}

export const CRM_ACTION_STATUSES = [
  'open',
  'completed',
  'snoozed',
  'cancelled',
] as const;
export type CrmActionStatus = (typeof CRM_ACTION_STATUSES)[number];

export function isCrmActionStatus(value: unknown): value is CrmActionStatus {
  return (
    typeof value === 'string' &&
    (CRM_ACTION_STATUSES as readonly string[]).includes(value)
  );
}

export const CRM_ACTION_PRIORITIES = [
  'low',
  'normal',
  'high',
  'urgent',
] as const;
export type CrmActionPriority = (typeof CRM_ACTION_PRIORITIES)[number];

export function isCrmActionPriority(
  value: unknown,
): value is CrmActionPriority {
  return (
    typeof value === 'string' &&
    (CRM_ACTION_PRIORITIES as readonly string[]).includes(value)
  );
}

/** Statuses that still need somebody's attention (drives the "overdue" KPI). */
export const OPEN_ACTION_STATUSES: CrmActionStatus[] = ['open', 'snoozed'];

// ---------------------------------------------------------------------------
// Identity normalization — the backbone of duplicate prevention (spec §19).
// ---------------------------------------------------------------------------

/** Lowercase, trimmed, and stripped of surrounding <> — one person, one key. */
export function normalizeEmail(email?: string | null): string | null {
  if (!email) return null;
  const value = email.trim().toLowerCase().replace(/^<|>$/g, '').trim();
  if (!value || !value.includes('@')) return null;
  return value;
}

/** Registrable-ish domain of a website/email, used for a weaker match. */
export function normalizeDomain(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    const host = new URL(withScheme).hostname.replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

/** `https://acme.com/pricing` → `acme.com` (never the full URL). */
export function websiteDomain(website?: string | null): string | null {
  return normalizeDomain(website);
}

/** Tag slugs are lowercase, hyphenated and bounded — one tag, one row. */
export function normalizeTagSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
