/**
 * Sprint 1 — the operational facts quoted by the legal documents and the
 * documentation center. ONE place, so the Refund policy, the buyer guide and
 * the creator guide can never disagree about a number.
 *
 * Every value is the behaviour the backend actually enforces today, with its
 * source. Values marked `configured` are versioned platform policies the
 * operator can change (`finance_policies`); the documents therefore say
 * "currently" and point here. Nothing in this file is a promise of a future
 * policy — when a value changes, bump the related document version.
 */
export const PLATFORM_FACTS = {
  brand: 'MESH',
  /** agentHub_backend/src/database/migrations/1770000000000-finance-ledger-and-policy.ts (COMMISSION rateBps 1500) */
  commissionPercent: 15,
  creatorSharePercent: 85,
  /** HOLDING policy: creator funds held before they become payable. */
  holdingDays: 14,
  /** REFUND policy: window (from payment) in which a buyer may request a refund. */
  refundWindowDays: 14,
  /** PAYOUT policy: creator may request a payout at most once per cooldown. */
  payoutCooldownDays: 7,
  /** PAYOUT policy: automatic settlement cadence (admin approval required). */
  payoutAutoIntervalDays: 14,
  /** Only IRR orders exist (Zarinpal gateway; sandbox gateway outside production). */
  currency: 'IRR',
  /** Global API throttle (RATE_LIMIT_TTL_SECONDS=60, RATE_LIMIT_MAX=120). */
  apiRateLimitPerMinute: 120,
  /** Login attempts per minute per IP (LOGIN_RATE_LIMIT_MAX). */
  loginRateLimitPerMinute: 10,
  /** Registrations per minute per IP (REGISTER_RATE_LIMIT_MAX). */
  registerRateLimitPerMinute: 5,
  /** Public contact form: per IP per 10 minutes / per address per day. */
  contactRateLimit: { perIpPer10Min: 5, perEmailPerDay: 5, duplicateWindowHours: 24 },
  contactMessageMax: 4000,
  contactMessageMin: 20,
  /** JWT_ACCESS_TTL_SECONDS=900, JWT_REFRESH_TTL_SECONDS=1209600 */
  accessTokenMinutes: 15,
  refreshSessionDays: 14,
  passwordMinLength: 8,
  /** Verification / reset codes expire after 30 minutes (email templates). */
  codeExpiryMinutes: 30,
  /** Refund request reason: 5–1000 characters (purchase.dto.ts). */
  refundReasonMax: 1000,
  /** Review workflow: only creators with an APPROVED profile can submit / publish. */
  creatorApprovalRequired: true,
  /** Payout requires KYC APPROVED + verified bank account (KYC_ELIGIBILITY policy). */
  payoutRequiresKyc: true,
} as const;

/** Public API base path used in developer examples (synthetic host). */
export const API_EXAMPLE_ORIGIN = 'https://api.example.com';
export const API_PREFIX = '/api/v1';
