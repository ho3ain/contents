import { FieldKeyRing, parseKeyRing } from '../common/crypto/field-crypto';
/**
 * Environment configuration.
 *
 * Every value the application reads from the environment is declared here and
 * validated at bootstrap, so misconfiguration fails fast instead of surfacing
 * as a runtime mystery.
 */

export interface Environment {
  nodeEnv: string;
  port: number;
  apiPrefix: string;

  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUsername: string;
  dbPassword: string;
  /** pg pool size per instance (default 10). */
  dbPoolMax: number;
  /** Fail a query waiting for a free connection after this long (0 = wait forever). Default 5000 in production. */
  dbConnectionTimeoutMs: number;
  /** Server-side per-statement ceiling (0 = none). Default 30000 in production. */
  dbStatementTimeoutMs: number;
  /** Queries slower than this are logged (text only, never parameters). 0 = off. */
  dbSlowQueryMs: number;
  dbSsl: boolean;
  /** PEM text or file path of the CA that signed the database certificate. */
  dbSslCa?: string;
  /** Verify the database certificate (default true; false is an explicit opt-out). */
  dbSslRejectUnauthorized: boolean;

  jwtAccessSecret: string;
  jwtAccessTtlSeconds: number;
  jwtRefreshTtlSeconds: number;
  jwtIssuer: string;
  /** Separate short-lived Connector gateway assertion signer; null disables connected dispatch. */
  runtimeGatewaySigningSecret: string | null;

  paymentWebhookSecret: string;

  authCookieName: string;
  authCookieSecure: boolean;

  corsOrigins: string[];

  rateLimitTtlSeconds: number;
  rateLimitMax: number;

  bcryptRounds: number;
  /** Failed sign-ins for ONE (account, ip) pair before a temporary lock. */
  loginLockPairThreshold: number;
  /** Failed sign-ins for ONE account (any ip) before a temporary lock. */
  loginLockAccountThreshold: number;
  /** First lock duration; doubles for every further failure. */
  loginLockBaseSeconds: number;
  /** Ceiling of the progressive lock. */
  loginLockMaxSeconds: number;
  /** Idle time after which the failure counter starts again. */
  loginAttemptWindowSeconds: number;
  /**
   * Express `trust proxy` value: false (default) | number of hops | 'loopback'.
   * Must be set when the API runs behind a reverse proxy, otherwise every
   * client shares the proxy's IP in rate limiting and audit logs.
   */
  trustProxy: boolean | number | string;

  /**
   * Key ring for application-level column encryption (FieldCrypto). `null`
   * until a feature needs it; when set it is validated at startup so a
   * malformed key fails the deploy, not the first write.
   */
  fieldEncryption: FieldKeyRing | null;

  /**
   * Background jobs on a durable Postgres queue (pg-boss). Off by default:
   * the in-process schedulers keep running exactly as before until this is
   * switched on, so the change is reversible by one variable.
   */
  jobsEnabled: boolean;
  /**
   * Bearer token required by `GET /api/v1/metrics`. Unset → the endpoint does
   * not exist (404). At least 24 characters when set.
   */
  metricsToken: string | null;
  /** Milliseconds in-flight requests get to finish on SIGTERM. */
  shutdownGraceMs: number;
  /**
   * Time the instance keeps SERVING after readiness flips to 503 on SIGTERM, so
   * the load balancer notices before the listener closes. Must be shorter than
   * `shutdownGraceMs`. Default 5000 in production, 0 elsewhere.
   */
  shutdownDrainDelayMs: number;
  /** TTL of the in-process cache for anonymous catalogue reads; 0 = off. */
  publicQueryCacheTtlMs: number;
  /**
   * What the API does at boot when the database is missing migrations:
   * `auto` runs them (development default), `warn` logs an error and keeps
   * `/health/ready` at 503 until they are applied (production/test default),
   * `strict` refuses to start, `off` skips the check entirely.
   */
  dbMigrationsOnBoot: 'auto' | 'warn' | 'strict' | 'off';

  emailTransport: string;

  // ---- Batch 10: observability ---------------------------------------
  logLevel: string;

  // ---- Batch 10 — Phase 18: payment provider -------------------------
  paymentProvider: string;
  zarinpalMerchantId: string | null;
  zarinpalBaseUrl: string;
  zarinpalTimeoutMs: number;
  paymentCallbackBase: string;

  // ---- Batch 10 — Phase 19: transactional email -----------------------
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPassword: string | null;
  emailFrom: string | null;
  emailFromName: string;
  emailMaxAttempts: number;
  emailRetryIntervalMs: number;
  /**
   * Sprint 1 (C2) — operator mailbox notified of each public contact-form
   * message and printed as the support channel in e-mails. Optional: when
   * unset, messages are still persisted and reviewed in the admin inbox and
   * e-mails point to the public contact page instead.
   */
  supportInboxEmail: string | null;
  /** Phase C3 — hours of silence before a creator counts as stalled (§16). */
  activationStalledHours: number;
  activationIdeaCooldownHours: number;
  activationProductCooldownHours: number;
  activationReadyCooldownHours: number;
  activationOnboardingCooldownHours: number;

  /** Phase C4 — every §10/§21 threshold is configurable, never hard-coded. */
  caseStudyMinSales: number;
  caseStudyMinReviews: number;
  caseStudyMinRating: number;
  caseStudyMinProductAgeDays: number;
  /** §5.1 — a buyer is asked only after they have had the product this long. */
  reviewRequestDelayDays: number;
  /** Referral code prefix shown to creators and in share links. */
  referralCodePrefix: string;
  /** §30 — a referral is a real acquisition only past this stage. */
  referralRewardStage: string;
  emailResendRateLimitMax: number;

  // ---- Phase C5: SCALE (§7, §9 — nothing below is hard-coded) ----
  scaleAttributionWindowDays: number;
  scaleCommissionMinimum: number;
  /**
   * §21/§23 — the affiliate share of a referred order, in basis points.
   * Default 0 for the same reason the referral rewards default to 0: an
   * unpriced programme must pay nothing rather than invent a number. 2500
   * would be 25%.
   */
  scaleCommissionRateBps: number;
  scaleRewardCreatorPublished: number;
  scaleRewardCreatorFirstSale: number;
  scaleRewardBuyerPurchase: number;
  scaleAmbassadorMinSales: number;
  scaleAmbassadorMinProducts: number;
  scaleAmbassadorMinRating: number;
  scaleAmbassadorMinReviews: number;
  scaleAmbassadorMinReferralConversions: number;
  scaleAmbassadorMaxIdleDays: number;

  // ---- Phase A4: launch & growth --------------------------------------
  /** Canonical public site origin (share links, OG pages). */
  publicSiteUrl: string;
  /**
   * Path of the built SPA `index.html` used by `GET /seo/render` to serve
   * crawler/link-preview HTML with real per-page head tags. Unset → the
   * renderer fetches `PUBLIC_SITE_URL/` once per 5 minutes; when neither
   * works the endpoint answers 503 (it never fabricates a shell).
   */
  seoShellTemplatePath: string | null;
  /** Secret salt for one-way visitor hashing (analytics). */
  analyticsSalt: string;

  // ---- Gap closure: media storage abstraction ---------------------------
  /** 'none' (uploads disabled, URL fields only) | 'local' (disk). */
  storageDriver: 'none' | 'local';
  storageLocalDir: string;
  /** Public base of served files (…/media); key is appended. */
  storagePublicBaseUrl: string;
}

/**
 * Where environment values come from: @nestjs/config passes the parsed `.env`
 * file merged with `process.env` to the `validate` hook. Reading `process.env`
 * directly here (the old behaviour) silently ignored every `.env` value,
 * because dotenv's parsed result is only assigned to `process.env` *after*
 * validation completes.
 */
export type EnvSource = Record<string, string | undefined>;

const boolFromEnv = (
  env: EnvSource,
  key: string,
  fallback = false,
): boolean => {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
};

const intFromEnv = (env: EnvSource, key: string, fallback: number): number => {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(
      `Invalid value for ${key}: expected an integer, got "${raw}"`,
    );
  }
  return value;
};

/** false | hop count | named range ("loopback", "10.0.0.0/8", …). */
function parseTrustProxy(raw: string | undefined): boolean | number | string {
  if (raw === undefined || raw === '' || raw === 'false' || raw === '0') {
    return false;
  }
  if (raw === 'true') {
    throw new Error(
      'TRUST_PROXY=true would trust any X-Forwarded-For header (spoofable). Use a hop count (e.g. 1) or a proxy address range.',
    );
  }
  const hops = Number.parseInt(raw, 10);
  return String(hops) === raw && hops > 0 ? hops : raw;
}

const required = (env: EnvSource, key: string): string => {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const MIGRATIONS_ON_BOOT = ['auto', 'warn', 'strict', 'off'] as const;

function parseMigrationsOnBoot(
  raw: string | undefined,
  nodeEnv: string,
): Environment['dbMigrationsOnBoot'] {
  const value = raw?.trim().toLowerCase();
  if (!value) return nodeEnv === 'development' ? 'auto' : 'warn';
  const match = MIGRATIONS_ON_BOOT.find((option) => option === value);
  if (!match) {
    throw new Error(
      `DB_MIGRATIONS_ON_BOOT must be one of ${MIGRATIONS_ON_BOOT.join(', ')} (got "${raw}")`,
    );
  }
  return match;
}

export function loadEnvironment(config: EnvSource = {}): Environment {
  // Merge order keeps real process variables winning over file values — the
  // same precedence @nestjs/config applies before calling validate.
  const values: EnvSource = { ...config, ...process.env };
  const nodeEnv = values.NODE_ENV ?? 'development';

  const env: Environment = {
    nodeEnv,
    port: intFromEnv(values, 'PORT', 3000),
    apiPrefix: values.API_PREFIX ?? 'api/v1',

    dbHost: values.DB_HOST ?? 'localhost',
    dbPort: intFromEnv(values, 'DB_PORT', 5432),
    dbName: values.DB_NAME ?? 'agenthub',
    dbUsername: values.DB_USERNAME ?? 'agenthub',
    dbPassword: values.DB_PASSWORD ?? 'agenthub',
    dbPoolMax: intFromEnv(values, 'DB_POOL_MAX', 10),
    dbConnectionTimeoutMs: intFromEnv(
      values,
      'DB_CONNECTION_TIMEOUT_MS',
      nodeEnv === 'production' ? 5_000 : 0,
    ),
    dbStatementTimeoutMs: intFromEnv(
      values,
      'DB_STATEMENT_TIMEOUT_MS',
      nodeEnv === 'production' ? 30_000 : 0,
    ),
    dbSlowQueryMs: intFromEnv(values, 'DB_SLOW_QUERY_MS', 500),
    dbSsl: boolFromEnv(values, 'DB_SSL', false),
    dbSslCa: values.DB_SSL_CA?.trim() ? values.DB_SSL_CA : undefined,
    dbSslRejectUnauthorized: boolFromEnv(
      values,
      'DB_SSL_REJECT_UNAUTHORIZED',
      true,
    ),

    // Development falls back to a clearly non-production secret so a fresh
    // clone boots without setup; production refuses to start without one.
    jwtAccessSecret:
      nodeEnv === 'production'
        ? required(values, 'JWT_ACCESS_SECRET')
        : (values.JWT_ACCESS_SECRET ?? 'dev-only-insecure-access-secret'),

    // Same contract for the payment webhook HMAC secret: development gets an
    // obvious non-production default, production refuses to start without one.
    paymentWebhookSecret:
      nodeEnv === 'production'
        ? required(values, 'PAYMENT_WEBHOOK_SECRET')
        : (values.PAYMENT_WEBHOOK_SECRET ?? 'dev-only-insecure-webhook-secret'),
    jwtAccessTtlSeconds: intFromEnv(values, 'JWT_ACCESS_TTL_SECONDS', 900),
    jwtRefreshTtlSeconds: intFromEnv(
      values,
      'JWT_REFRESH_TTL_SECONDS',
      1209600,
    ),
    jwtIssuer: values.JWT_ISSUER ?? 'agent-hub',
    // Optional by design: without a separately managed secret, connected
    // dispatch fails closed rather than reusing the browser access-token key.
    runtimeGatewaySigningSecret: parseRuntimeGatewaySigningSecret(
      values.RUNTIME_GATEWAY_SIGNING_SECRET,
    ),

    authCookieName: values.AUTH_COOKIE_NAME ?? 'agenthub_refresh',
    authCookieSecure: boolFromEnv(
      values,
      'AUTH_COOKIE_SECURE',
      nodeEnv === 'production',
    ),

    corsOrigins: (values.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),

    rateLimitTtlSeconds: intFromEnv(values, 'RATE_LIMIT_TTL_SECONDS', 60),
    rateLimitMax: intFromEnv(values, 'RATE_LIMIT_MAX', 120),

    bcryptRounds: intFromEnv(values, 'BCRYPT_ROUNDS', 12),
    loginLockPairThreshold: intFromEnv(values, 'LOGIN_LOCK_PAIR_THRESHOLD', 5),
    loginLockAccountThreshold: intFromEnv(
      values,
      'LOGIN_LOCK_ACCOUNT_THRESHOLD',
      10,
    ),
    loginLockBaseSeconds: intFromEnv(values, 'LOGIN_LOCK_BASE_SECONDS', 30),
    loginLockMaxSeconds: intFromEnv(values, 'LOGIN_LOCK_MAX_SECONDS', 900),
    loginAttemptWindowSeconds: intFromEnv(
      values,
      'LOGIN_ATTEMPT_WINDOW_SECONDS',
      900,
    ),
    trustProxy: parseTrustProxy(values.TRUST_PROXY),
    fieldEncryption: values.FIELD_ENCRYPTION_KEYS
      ? parseKeyRing(
          values.FIELD_ENCRYPTION_KEYS,
          values.FIELD_ENCRYPTION_CURRENT ?? '',
        )
      : null,

    jobsEnabled: boolFromEnv(values, 'JOBS_ENABLED', false),
    metricsToken: parseMetricsToken(values.METRICS_TOKEN),
    shutdownGraceMs: intFromEnv(values, 'SHUTDOWN_GRACE_MS', 10_000),
    dbMigrationsOnBoot: parseMigrationsOnBoot(
      values.DB_MIGRATIONS_ON_BOOT,
      nodeEnv,
    ),
    publicQueryCacheTtlMs: intFromEnv(
      values,
      'PUBLIC_QUERY_CACHE_TTL_MS',
      nodeEnv === 'production' ? 15_000 : 0,
    ),
    shutdownDrainDelayMs: intFromEnv(
      values,
      'SHUTDOWN_DRAIN_DELAY_MS',
      nodeEnv === 'production' ? 5_000 : 0,
    ),

    // ---- Batch 10: structured logging level (debug|info|warn|error) ----
    logLevel:
      values.LOG_LEVEL ?? (nodeEnv === 'development' ? 'debug' : 'info'),

    // ---- Batch 10 — Phase 18: payment provider selection ---------------
    // Production must run a REAL gateway: the sandbox provider is refused
    // at startup (§49/§51 — no fake payment success in production).
    paymentProvider:
      nodeEnv === 'production'
        ? (() => {
            const provider = values.PAYMENT_PROVIDER ?? 'zarinpal';
            if (provider !== 'zarinpal') {
              throw new Error(
                `Invalid PAYMENT_PROVIDER "${provider}" for production: only "zarinpal" is allowed (the sandbox gateway is development/test only)`,
              );
            }
            return provider;
          })()
        : (values.PAYMENT_PROVIDER ?? 'sandbox'),

    // Required whenever the zarinpal gateway is active — in production the
    // app refuses to start without it (fail fast, no fake gateway).
    zarinpalMerchantId:
      nodeEnv === 'production'
        ? required(values, 'ZARINPAL_MERCHANT_ID')
        : (values.ZARINPAL_MERCHANT_ID ?? null),

    zarinpalBaseUrl: values.ZARINPAL_BASE_URL ?? 'https://payment.zarinpal.com',
    zarinpalTimeoutMs: intFromEnv(values, 'ZARINPAL_TIMEOUT_MS', 15000),
    // Where the gateway should send the buyer back to (the frontend payment
    // callback page). Server-side value — never client-supplied.
    paymentCallbackBase:
      values.PAYMENT_CALLBACK_BASE ?? 'http://localhost:5173',

    // ---- Phase A4: public site origin for share links / OG pages --------
    // Defaults to the payment callback base (the same frontend origin).
    publicSiteUrl: (
      values.PUBLIC_SITE_URL ||
      values.PAYMENT_CALLBACK_BASE ||
      'http://localhost:5173'
    ).replace(/\/+$/, ''),
    seoShellTemplatePath: values.SEO_SHELL_TEMPLATE?.trim() || null,
    // Visitor identities are stored only as salted SHA-256 hashes. Falls
    // back to a value derived from the JWT secret so it is never a public
    // constant; set ANALYTICS_SALT explicitly in production.
    analyticsSalt:
      values.ANALYTICS_SALT ||
      `analytics:${values.JWT_ACCESS_SECRET ?? 'dev-only-insecure-access-secret'}`,

    // ---- Gap closure: media storage --------------------------------------
    // Default 'none' keeps today's behaviour (URL fields). 'local' stores
    // files on this host (single node only). An S3-compatible driver is an
    // infrastructure dependency and is refused rather than faked.
    storageDriver: (() => {
      const driver = (values.STORAGE_DRIVER || 'none').toLowerCase();
      if (driver !== 'none' && driver !== 'local') {
        throw new Error(
          `Invalid STORAGE_DRIVER "${driver}": expected "none" or "local" (S3 is not implemented — infrastructure dependency)`,
        );
      }
      return driver;
    })(),
    storageLocalDir: values.STORAGE_LOCAL_DIR || './var/uploads',
    storagePublicBaseUrl: (
      values.STORAGE_PUBLIC_BASE_URL ||
      `${(
        values.PUBLIC_SITE_URL ||
        values.PAYMENT_CALLBACK_BASE ||
        'http://localhost:5173'
      ).replace(/\/+$/, '')}/${values.API_PREFIX ?? 'api/v1'}/media`
    ).replace(/\/+$/, ''),

    // ---- Batch 10 — Phase 19: transactional email ----------------------
    // Production must use a real SMTP transport: console delivery is
    // refused at startup outside development/test (§49/§51).
    emailTransport: (() => {
      const transport =
        values.EMAIL_TRANSPORT ??
        (nodeEnv === 'production' ? 'smtp' : 'console');
      if (transport !== 'console' && transport !== 'smtp') {
        throw new Error(
          `Invalid EMAIL_TRANSPORT "${transport}": expected "console" or "smtp"`,
        );
      }
      if (nodeEnv === 'production' && transport !== 'smtp') {
        throw new Error(
          'Invalid EMAIL_TRANSPORT for production: only "smtp" is allowed (console delivery is development/test only)',
        );
      }
      return transport;
    })(),

    smtpHost: values.SMTP_HOST ?? null,
    smtpPort: intFromEnv(values, 'SMTP_PORT', 587),
    smtpSecure: boolFromEnv(values, 'SMTP_SECURE', false),
    smtpUser: values.SMTP_USER ?? null,
    smtpPassword: values.SMTP_PASSWORD ?? null,
    emailFrom: values.EMAIL_FROM ?? null,
    emailFromName: values.EMAIL_FROM_NAME ?? 'MESH',
    emailMaxAttempts: intFromEnv(values, 'EMAIL_MAX_ATTEMPTS', 5),
    emailRetryIntervalMs: intFromEnv(values, 'EMAIL_RETRY_INTERVAL_MS', 30000),
    supportInboxEmail: (() => {
      const raw = values.SUPPORT_INBOX_EMAIL?.trim();
      if (!raw) return null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
        throw new Error(
          'Invalid SUPPORT_INBOX_EMAIL: expected a single e-mail address',
        );
      }
      return raw.toLowerCase();
    })(),

    // ---- Phase C3: Creator Activation ---------------------------------
    // C3 §16 is explicit: "این Threshold نباید hard-code شود." Every
    // activation threshold is configurable so Operations can tune what
    // "stalled" means without a code change or a deploy.
    activationStalledHours: intFromEnv(values, 'ACTIVATION_STALLED_HOURS', 72),
    activationIdeaCooldownHours: intFromEnv(
      values,
      'ACTIVATION_IDEA_COOLDOWN_HOURS',
      72,
    ),
    activationProductCooldownHours: intFromEnv(
      values,
      'ACTIVATION_PRODUCT_COOLDOWN_HOURS',
      120,
    ),
    activationReadyCooldownHours: intFromEnv(
      values,
      'ACTIVATION_READY_COOLDOWN_HOURS',
      48,
    ),
    activationOnboardingCooldownHours: intFromEnv(
      values,
      'ACTIVATION_ONBOARDING_COOLDOWN_HOURS',
      72,
    ),

    // ---- Phase C4: Creator Success --------------------------------------
    // C4 §10 is explicit: "Thresholdها باید Configurable باشند و Hard-code
    // نشوند." So the whole case-study gate is config, and the defaults below
    // are only a starting point Operations can move without a release.
    caseStudyMinSales: intFromEnv(values, 'CASE_STUDY_MIN_SALES', 3),
    caseStudyMinReviews: intFromEnv(values, 'CASE_STUDY_MIN_REVIEWS', 1),
    caseStudyMinRating: intFromEnv(values, 'CASE_STUDY_MIN_RATING', 4),
    caseStudyMinProductAgeDays: intFromEnv(
      values,
      'CASE_STUDY_MIN_PRODUCT_AGE_DAYS',
      7,
    ),
    // The verification-resend cap was a hard-coded 5/minute inside the
    // controller decorator, which made it the one auth throttle Operations
    // could not move without a release — and the one that produced 429s in
    // legitimate test runs. Config for the same reason as the C5 thresholds.
    emailResendRateLimitMax: intFromEnv(
      values,
      'EMAIL_RESEND_RATE_LIMIT_MAX',
      5,
    ),
    // §5.1 "Review نباید بلافاصله بعد از خرید کورکورانه درخواست شود" —
    // a buyer who has just paid has not used anything yet.
    reviewRequestDelayDays: intFromEnv(values, 'REVIEW_REQUEST_DELAY_DAYS', 3),
    referralCodePrefix: (values.REFERRAL_CODE_PREFIX ?? 'MESH').trim(),
    referralRewardStage:
      values.REFERRAL_REWARD_STAGE?.trim() || 'reward_eligible',

    // ---- Phase C5: SCALE ----------------------------------------------
    // §9: ambassador rules must be controllable in the backend, and §7:
    // reward amounts are config, never hard-coded. The DEFAULTS below are
    // deliberately ZERO for every reward amount — a programme whose
    // commercial terms have not been decided must pay nothing rather than
    // invent a number. §44: no fake capability.
    scaleAttributionWindowDays: intFromEnv(
      values,
      'SCALE_ATTRIBUTION_WINDOW_DAYS',
      30,
    ),
    scaleCommissionMinimum: intFromEnv(values, 'SCALE_COMMISSION_MINIMUM', 0),
    scaleCommissionRateBps: intFromEnv(values, 'SCALE_COMMISSION_RATE_BPS', 0),
    scaleRewardCreatorPublished: intFromEnv(
      values,
      'SCALE_REWARD_CREATOR_PUBLISHED',
      0,
    ),
    scaleRewardCreatorFirstSale: intFromEnv(
      values,
      'SCALE_REWARD_CREATOR_FIRST_SALE',
      0,
    ),
    scaleRewardBuyerPurchase: intFromEnv(
      values,
      'SCALE_REWARD_BUYER_PURCHASE',
      0,
    ),
    // §9 ambassador eligibility.
    scaleAmbassadorMinSales: intFromEnv(
      values,
      'SCALE_AMBASSADOR_MIN_SALES',
      10,
    ),
    scaleAmbassadorMinProducts: intFromEnv(
      values,
      'SCALE_AMBASSADOR_MIN_PRODUCTS',
      1,
    ),
    scaleAmbassadorMinRating: intFromEnv(
      values,
      'SCALE_AMBASSADOR_MIN_RATING',
      4,
    ),
    scaleAmbassadorMinReviews: intFromEnv(
      values,
      'SCALE_AMBASSADOR_MIN_REVIEWS',
      3,
    ),
    scaleAmbassadorMinReferralConversions: intFromEnv(
      values,
      'SCALE_AMBASSADOR_MIN_REFERRAL_CONVERSIONS',
      1,
    ),
    scaleAmbassadorMaxIdleDays: intFromEnv(
      values,
      'SCALE_AMBASSADOR_MAX_IDLE_DAYS',
      90,
    ),
  };

  // ---- Cross-field validation ------------------------------------------
  if (env.dbPoolMax < 1 || env.dbPoolMax > 200) {
    throw new Error(`DB_POOL_MAX (${env.dbPoolMax}) must be between 1 and 200`);
  }
  for (const [key, value] of [
    ['DB_CONNECTION_TIMEOUT_MS', env.dbConnectionTimeoutMs],
    ['DB_STATEMENT_TIMEOUT_MS', env.dbStatementTimeoutMs],
    ['DB_SLOW_QUERY_MS', env.dbSlowQueryMs],
    ['PUBLIC_QUERY_CACHE_TTL_MS', env.publicQueryCacheTtlMs],
  ] as const) {
    if (value < 0) throw new Error(`${key} must be >= 0`);
  }
  if (env.publicQueryCacheTtlMs > 300_000) {
    throw new Error(
      'PUBLIC_QUERY_CACHE_TTL_MS must be at most 300000 (5 minutes): a longer TTL would show unpublished listings for too long',
    );
  }
  // The drain delay is spent INSIDE the shutdown deadline: if it were equal or
  // longer, every shutdown would hit the forced-exit timer.
  if (
    env.shutdownDrainDelayMs < 0 ||
    env.shutdownDrainDelayMs >= env.shutdownGraceMs
  ) {
    throw new Error(
      `SHUTDOWN_DRAIN_DELAY_MS (${env.shutdownDrainDelayMs}) must be >= 0 and shorter than SHUTDOWN_GRACE_MS (${env.shutdownGraceMs})`,
    );
  }
  // A configured SMTP transport must be complete: partial configuration is
  // a startup error, never a silent fallback to console delivery.
  if (env.emailTransport === 'smtp') {
    const missing: string[] = [];
    if (!env.smtpHost) missing.push('SMTP_HOST');
    if (!env.smtpUser) missing.push('SMTP_USER');
    if (!env.smtpPassword) missing.push('SMTP_PASSWORD');
    if (!env.emailFrom) missing.push('EMAIL_FROM');
    if (missing.length > 0) {
      throw new Error(
        `EMAIL_TRANSPORT=smtp requires ${missing.join(', ')} to be set`,
      );
    }
  }
  // Sprint 3 (S3-01 F-05): `ADMIN_STEP_UP_ENFORCEMENT=off` is a QA/browser-
  // E2E convenience documented as "non-production only"
  // (docs/admin/OPERATIONS.md). Nothing enforced that: a QA env file copied
  // to production would silently remove the MFA step-up from every sensitive
  // admin permission. Production now refuses to boot with it, exactly like
  // the sandbox gateway and the console e-mail transport.
  if (
    nodeEnv === 'production' &&
    (values.ADMIN_STEP_UP_ENFORCEMENT ?? '').trim().toLowerCase() === 'off'
  ) {
    throw new Error(
      'Invalid ADMIN_STEP_UP_ENFORCEMENT=off for production: admin step-up (MFA) cannot be disabled outside development/test',
    );
  }
  if (env.paymentProvider === 'zarinpal' && !env.zarinpalMerchantId) {
    // Allowed to boot only outside production (a staging box may come up
    // before keys are provisioned) — but the gateway itself will refuse to
    // create payments, so misconfiguration is loud, not silent.
    if (nodeEnv === 'production') {
      throw new Error(
        'PAYMENT_PROVIDER=zarinpal requires ZARINPAL_MERCHANT_ID to be set',
      );
    }
  }

  return env;
}

function parseRuntimeGatewaySigningSecret(
  raw: string | undefined,
): string | null {
  if (raw === undefined || raw.trim() === '') return null;
  if (raw.trim().length < 32) {
    throw new Error(
      'RUNTIME_GATEWAY_SIGNING_SECRET must be at least 32 characters (or unset to disable connected Runtime dispatch)',
    );
  }
  return raw.trim();
}

function parseMetricsToken(raw: string | undefined): string | null {
  if (raw === undefined || raw.trim() === '') return null;
  if (raw.trim().length < 24) {
    throw new Error(
      'METRICS_TOKEN must be at least 24 characters (or unset to disable /metrics)',
    );
  }
  return raw.trim();
}
