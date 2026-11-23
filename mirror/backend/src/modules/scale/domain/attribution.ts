/**
 * Phase C5 §5, §6, §49 — attribution.
 *
 * Attribution is the part of a growth system that is easiest to get subtly
 * wrong, so the rules live here as pure functions with no database access and
 * no clock of their own. Everything time-dependent is passed in.
 *
 * The two rules that matter:
 *
 * 1. **One user, one referrer.** A buyer who clicks three creators' links
 *    before buying is attributed to exactly one of them. Which one is a
 *    business decision, and it is made once, here, rather than implicitly
 *    wherever a row happens to be written.
 *
 * 2. **First touch wins inside the window.** C2's `creator_attributions`
 *    already records a first touch. Strict last-click would let a creator
 *    lose an attribution they genuinely earned, because the buyer browsed
 *    MESH for a week before buying. So: the earliest valid touch within
 *    `windowDays` wins; outside that window, the most recent touch wins.
 *    This is a deliberate business rule, not an accident of implementation,
 *    and it is why the function takes the whole touch list rather than one.
 */

export const ATTRIBUTION_CHANNELS = [
  'organic',
  'referral',
  'ambassador',
  'affiliate',
  'partnership',
  'direct',
] as const;

export type AttributionChannel = (typeof ATTRIBUTION_CHANNELS)[number];

/** The default number of days a first touch keeps its claim on a user. */
export const DEFAULT_TOUCH_WINDOW_DAYS = 30;

export interface AttributionTouch {
  /** The subsystem that owns this touch: referral, affiliate, ... */
  channel: AttributionChannel;
  /** The referrer/partner/affiliate id, or null for `organic`/`direct`. */
  sourceId: string | null;
  occurredAt: Date;
}

/**
 * Pick the winning attribution for a user, or `null` when they should be
 * attributed to nobody.
 *
 * `null` is a real, common answer — a visitor who arrived through a campaign
 * nobody owns, or one whose touch has aged out — and the caller must handle it
 * as a first-class case rather than defaulting to somebody. Attributing an
 * organic visit to whichever referrer happens to be handy is exactly how
 * payout fraud starts.
 */
export function resolveAttribution(
  touches: AttributionTouch[],
  options: { windowDays?: number; now?: Date } = {},
): AttributionTouch | null {
  if (touches.length === 0) return null;

  const now = options.now ?? new Date();
  const windowDays = options.windowDays ?? DEFAULT_TOUCH_WINDOW_DAYS;
  const cutoff = new Date(now.getTime() - windowDays * 86400000);

  // A touch with no source cannot win: there is nobody to credit. Organic
  // and direct both have no referrer by definition.
  const claimable = touches.filter(
    (touch) =>
      touch.sourceId !== null &&
      touch.channel !== 'organic' &&
      touch.channel !== 'direct',
  );
  if (claimable.length === 0) return null;

  const inWindow = claimable
    .filter((touch) => touch.occurredAt >= cutoff)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  // First touch inside the window wins.
  if (inWindow.length > 0) return inWindow[0];

  // Everything has aged out. Rather than credit a stale claim forever, fall
  // back to the most recent one so a genuine late conversion is not lost —
  // but it is the LAST resort, not the default.
  return [...claimable].sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  )[0];
}

/**
 * Should this touch be allowed to claim the user at all?
 *
 * A creator's own click on their own link must never create an attribution:
 * it would be a free reward for a link they already own. The referrer id and
 * the visitor are compared here rather than in the controller so the rule
 * cannot be bypassed by a new call site.
 */
export function isSelfAttribution(
  referrerId: string | null,
  attributedUserId: string | null,
): boolean {
  if (referrerId === null || attributedUserId === null) return false;
  return referrerId === attributedUserId;
}

/**
 * §47 — the fraud signals this phase can detect with certainty.
 *
 * Each returns a flag or `null`. A flag is a prompt for a human, never an
 * automatic block: a false positive that silently destroyed a real payout
 * would be worse than the fraud it prevented, and §47 says the same thing.
 */
export const RISK_FLAGS = [
  'self_referral',
  'duplicate_identity',
  'suspicious_conversion',
  'excessive_referrals',
  'refund_pattern',
  'abnormal_activity',
] as const;

export type RiskFlagKind = (typeof RISK_FLAGS)[number];

export interface RiskSignal {
  kind: RiskFlagKind;
  detail: string;
  /** How strong the signal is. Deliberately coarse — a real model is a
   *  later phase, and a fabricated score would be worse than a clear one. */
  severity: 'low' | 'medium' | 'high';
}

export interface RiskAssessmentInput {
  selfReferral: boolean;
  /** Fingerprints (email hash, phone, IP) shared with other referred users. */
  sharedIdentityFingerprints: number;
  /** Clicks the user made before the account existed. */
  clickCount: number;
  /** Seconds between the account being created and the conversion. */
  secondsToConversion: number | null;
  referralsFromThisSource: number;
  /** Referenced orders that were later refunded. */
  refundedOrderCount: number;
  attributedOrderCount: number;
  /** Distinct devices/IPs seen across the referred accounts. */
  distinctNetworkFingerprints: number;
  thresholds: {
    excessiveReferrals: number;
    suspiciousConversionSeconds: number;
    refundPatternRatio: number;
    abnormalDistinctNetworks: number;
  };
}

/**
 * Every signal that fires, in a fixed order so the admin console and the
 * tests see the same list for the same input.
 */
export function assessRisk(input: RiskAssessmentInput): RiskSignal[] {
  const signals: RiskSignal[] = [];

  if (input.selfReferral) {
    signals.push({
      kind: 'self_referral',
      severity: 'high',
      detail: 'referrer == referred',
    });
  }

  if (input.sharedIdentityFingerprints > 0) {
    signals.push({
      kind: 'duplicate_identity',
      severity: 'high',
      detail: `${input.sharedIdentityFingerprints} shared identity fingerprint(s)`,
    });
  }

  if (
    input.secondsToConversion !== null &&
    input.secondsToConversion >= 0 &&
    input.secondsToConversion < input.thresholds.suspiciousConversionSeconds
  ) {
    signals.push({
      kind: 'suspicious_conversion',
      severity: 'medium',
      detail: `converted ${input.secondsToConversion}s after signup`,
    });
  }

  if (input.referralsFromThisSource > input.thresholds.excessiveReferrals) {
    signals.push({
      kind: 'excessive_referrals',
      severity: 'medium',
      detail: `${input.referralsFromThisSource} referrals from one source`,
    });
  }

  const refundRatio =
    input.attributedOrderCount > 0
      ? input.refundedOrderCount / input.attributedOrderCount
      : 0;
  if (
    refundRatio >= input.thresholds.refundPatternRatio &&
    input.refundedOrderCount > 0
  ) {
    signals.push({
      kind: 'refund_pattern',
      severity: 'medium',
      detail: `${input.refundedOrderCount}/${input.attributedOrderCount} attributed orders refunded`,
    });
  }

  if (
    input.distinctNetworkFingerprints >
    input.thresholds.abnormalDistinctNetworks
  ) {
    signals.push({
      kind: 'abnormal_activity',
      severity: 'low',
      detail: `${input.distinctNetworkFingerprints} distinct networks across referred accounts`,
    });
  }

  return signals;
}
