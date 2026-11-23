/**
 * Phase C5 §19–§21 — the affiliate lifecycle.
 *
 * §19 is emphatic that affiliate must stay separate from referral even though
 * they share attribution infrastructure. They are separate here in the two
 * ways that matter commercially:
 *
 *  - an affiliate is an **identity** with its own status and its own
 *    application, whereas a referral is a *link* a creator already had;
 *  - an affiliate earns a **commission**, a creator earns a **reward**, and
 *    they are different ledgers with different approval flows.
 *
 * They share `attribution.ts` and `money.ts` deliberately — that is the
 * "shared attribution infrastructure" §19 permits.
 */

export const AFFILIATE_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'suspended',
] as const;

export type AffiliateStatus = (typeof AFFILIATE_STATUSES)[number];

const AFFILIATE_TRANSITIONS: Record<
  AffiliateStatus,
  readonly AffiliateStatus[]
> = {
  // `rejected` and `suspended` both return to `pending` because a person who
  // was turned down or shut off can apply again. Refusing a re-application
  // forever would mean one admin decision in March is permanent, with no way
  // to record that the situation changed.
  pending: ['approved', 'rejected'],
  approved: ['suspended'],
  rejected: ['pending'],
  suspended: ['pending', 'rejected'],
};

export function canTransitionAffiliate(
  from: AffiliateStatus,
  to: AffiliateStatus,
): boolean {
  return AFFILIATE_TRANSITIONS[from].includes(to);
}

export function nextAffiliateStatus(
  from: AffiliateStatus,
  to: AffiliateStatus,
): AffiliateStatus | null {
  if (from === to) return from;
  return canTransitionAffiliate(from, to) ? to : null;
}

/** §20 — the channels an affiliate says they will promote on. */
export const PROMOTION_CHANNELS = [
  'blog',
  'newsletter',
  'youtube',
  'x',
  'linkedin',
  'instagram',
  'telegram',
  'discord',
  'community',
  'other',
] as const;

export type PromotionChannel = (typeof PROMOTION_CHANNELS)[number];

/** §20 — who the affiliate's audience is. */
export const AUDIENCE_TYPES = [
  'developers',
  'business_owners',
  'creators',
  'ai_enthusiasts',
  'agencies',
  'general',
] as const;

export type AudienceType = (typeof AUDIENCE_TYPES)[number];

/**
 * §20 — a website or at least one social link is required.
 *
 * An affiliate application with no way to reach the applicant cannot be
 * approved, so it is refused at the DTO/validation layer with a field-level
 * message rather than accepted and then silently ignored. The reason is
 * returned so the form can put it on the right field.
 */
export function validateAffiliateContact(input: {
  website: string | null;
  socialLinks: string[];
}): { ok: true } | { ok: false; field: 'website' | 'socialLinks' } {
  const website = (input.website ?? '').trim();
  if (website.length > 0) return { ok: true };
  if (input.socialLinks.filter((link) => link.trim().length > 0).length > 0) {
    return { ok: true };
  }
  return { ok: false, field: 'website' };
}

/**
 * A URL is only "real" if it parses as http(s). Accepting `javascript:alert(1)`
 * as a website would store a value the admin UI would later render as a link,
 * and the admin who clicks it is the one who gets hit. Checked here so the
 * rule cannot be bypassed by a second write path.
 */
export function isSafeExternalUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 500) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
