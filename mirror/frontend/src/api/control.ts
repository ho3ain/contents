/**
 * Phase 3 — Admin Control Plane API client.
 *
 * Every call here targets a route of the backend control plane
 * (`docs/admin/generated/admin-routes.md`). The UI never computes money:
 * payout amounts, balances and revenue are displayed exactly as the Phase 2
 * financial core and the admin read models return them. The server re-checks
 * every permission; the UI only hides what a role cannot do.
 */
import { http } from './client';
import type { PublicUser } from './types';

export interface Page<T> {
  items: T[];
  meta: { page: number; pageSize: number; total: number } & Record<string, unknown>;
}

/* ---------------------------------------------------------------- sign-in */

export interface MfaChallenge {
  mfaRequired: true;
  challengeToken: string;
  expiresInSeconds: number;
}

export interface AdminSelf {
  userId: string;
  roles: string[];
  permissions: string[];
  legacy: boolean;
  mfa: { enabled: boolean };
  stepUp: { active: boolean; expiresAt: string | null };
}

/* ---------------------------------------------------------- impersonation */

export interface ImpersonationStart {
  session: { id: string; expiresAt: string; status: string };
  accessToken: string;
  actingAs: { id: string; name: string; role: string };
  expiresInSeconds: number;
}

export type ImpersonationBanner =
  | { active: false }
  | {
      active: true;
      sessionId: string;
      impersonatedUser: string;
      actingAdmin: string;
      expiresAt: string;
      remainingSeconds: number;
    };

/* ----------------------------------------------------------- command centre */

export type AttentionSeverity = 'info' | 'warning' | 'critical';

export interface AttentionItem {
  key: string;
  label: string;
  count: number;
  severity: AttentionSeverity;
  href: string | null;
}

export interface MetricValue {
  key: string;
  name: string;
  unit: string;
  currency: string | null;
  value: string | number | null;
  previous?: string | number | null;
  nullReason?: string;
  definition: { key: string; version: string; href: string };
}

export interface CommandCenter {
  generatedAt: string;
  attention: AttentionItem[];
  business: {
    window: { from: string; to: string };
    timezone: string;
    currency: string;
    metrics: MetricValue[];
  } | null;
  trust: {
    moderationQueue: {
      open: number;
      unassigned: number;
      escalated: number;
      slaBreaches: number;
    } | null;
    support: { open: number; breached: number; atRisk: number; unassigned: number } | null;
    highRiskUsers: number | null;
    openReports: number | null;
  } | null;
  financial: Record<string, unknown> | null;
  security: Record<string, unknown> | null;
  system: {
    killSwitchesEngaged: number;
    outbox: { pending: number; failed: number; dead: number };
    notificationsFailed: number;
  } | null;
  access: { roles: string[]; withheld: Array<{ section: string; requires: string }> };
}

export interface AnalyticsDefinition {
  key: string;
  name: string;
  unit: 'count' | 'money' | 'percent';
  definition: string;
  formula: string;
  sources: readonly string[];
  timezone: 'analytics.timezone';
  currency: 'per-currency' | 'not-applicable';
  filters: string;
  inclusion: string;
  exclusion: string;
  refundTreatment: string;
  dateAttribution: string;
  owner: 'data' | 'finance' | 'trust';
  version: string;
  comparable: boolean;
}

export interface AnalyticsMetricsResponse {
  window: { from: string; to: string; days: number };
  previousWindow: { from: string; to: string; days: number };
  timezone: string;
  currency: string;
  version: string;
  computedAt: string;
  metrics: MetricValue[];
}

/* --------------------------------------------------------- payout operations */

export type PayoutStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REJECTED';

export interface PayoutOpsItem {
  id: string;
  creator: { id: string; userId: string; displayName: string };
  currency: string;
  /** Canonical amount, formatted by the finance core. Never recomputed here. */
  amount: string;
  amountMinor: string;
  kind: string;
  status: PayoutStatus;
  ibanLast4: string;
  settlementDate: string;
  scheduledFor: string | null;
  version: number;
  requestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  processingAt: string | null;
  paidAt: string | null;
  bankReference: string | null;
  recordedReference: string | null;
  statusReason: string | null;
  reviewed: boolean;
  openHolds: number;
  openExceptions: number;
  hasEvidence: boolean;
  notificationStatus: string | null;
  stale: boolean;
}

export interface PayoutOpsSummary {
  requested: number;
  approved: number;
  processing: number;
  dueToday: number;
  dueTomorrow: number;
  overdue: number;
  stale: number;
  paidLast24h: number;
  openHolds: number;
  openExceptions: number;
  notificationsFailed: number;
  notificationsPending: number;
}

export interface PayoutAllowedAction {
  action: string;
  allowed: boolean;
  reason: string | null;
}

export interface PayoutOpsDetail extends PayoutOpsItem {
  creatorChecks: {
    kycState: string;
    financialHold: boolean;
    bankOwnershipStatus: string | null;
    bankAccountActive: boolean | null;
  };
  flags: Array<{
    id: string;
    kind: 'HOLD' | 'EXCEPTION';
    code: string;
    note: string;
    raisedAt: string;
    resolvedAt: string | null;
    resolutionNote: string | null;
    open: boolean;
  }>;
  evidence: Array<{
    id: string;
    kind: string;
    mime: string;
    sizeBytes: number;
    sha256: string;
    displayName: string;
    uploadedAt: string;
    active: boolean;
    supersededAt: string | null;
    supersedeReason: string | null;
  }>;
  notification: {
    status: string;
    attempts: number;
    lastError: string | null;
    sentAt: string | null;
    lastAttemptAt: string | null;
    delivery: {
      status: string;
      attempts: number;
      lastError: string | null;
      nextAttemptAt: string;
    } | null;
  } | null;
  timeline: Array<{ at: string; action: string; result: string; actorId: string | null; reason: string | null }>;
  policy: { evidenceRequired: boolean; dualControl: boolean; reviewBeforeApprove: boolean; staleHours: number };
  actions: PayoutAllowedAction[];
}

export interface PayoutOpsQuery {
  settlement?: string;
  from?: string;
  to?: string;
  status?: string;
  exception?: boolean;
  hold?: boolean;
  page?: number;
  pageSize?: number;
}

/* --------------------------------------------------------------- moderation */

export interface ModerationCase {
  id: string;
  caseNumber: string;
  type: string;
  subjectType: string;
  subjectId: string;
  status: string;
  priority: string;
  reasonCode: string;
  summary: string;
  details: string | null;
  assignee: { id: string; name: string | null } | null;
  duplicateOf: string | null;
  resolution: string | null;
  resolutionNote: string | null;
  dueAt: string | null;
  overdue: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ModerationCaseDetail extends ModerationCase {
  events: Array<{
    id: string;
    kind: string;
    actor: { id: string; name: string | null } | null;
    from: string | null;
    to: string | null;
    note: string | null;
    at: string;
  }>;
  allowedTransitions: string[];
}

export interface ModerationSummary {
  open: number;
  overdue: number;
  unassignedOpen: number;
  byStatus: Record<string, number>;
  openByPriority: Record<string, number>;
}

/* ------------------------------------------------------------ support ops */

export interface SupportOpsRequest {
  id: string;
  subject: string;
  status: string;
  category: string | null;
  priority: string;
  requester: { id: string; name: string | null };
  assignee: { id: string; name: string | null } | null;
  escalated: boolean;
  escalationReason: string | null;
  sla: { state: string; firstResponseDueAt: string | null; firstResponseAt: string | null };
  messageCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupportOpsDetail extends SupportOpsRequest {
  messages: Array<{ id: string; senderId: string; senderRole: string; body: string; createdAt: string }>;
  /** `null` when the caller lacks `support:internal_note` (field-level security). */
  internalNotes: Array<{ id: string; author: { id: string; name: string | null } | null; body: string; createdAt: string }> | null;
}

export interface SupportOpsSummary {
  open: number;
  breached: number;
  atRisk: number;
  unassigned: number;
}

/* ------------------------------------------------- contact inbox (Sprint 1) */

export const CONTACT_TOPICS = ['general', 'purchase', 'creator', 'partnership', 'privacy', 'bug'] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];
export const CONTACT_MESSAGE_STATUSES = ['new', 'in_progress', 'replied', 'closed', 'spam'] as const;
export type ContactMessageStatus = (typeof CONTACT_MESSAGE_STATUSES)[number];

/** Mirrors `ContactMessageView` (agentHub_backend/src/modules/support/contact.service.ts). */
export interface ContactMessageView {
  id: string;
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  locale: 'fa' | 'en';
  status: ContactMessageStatus;
  internalNote: string | null;
  replyBody: string | null;
  repliedAt: string | null;
  replyEmailId: string | null;
  handledBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactInboxSummary {
  counts: Record<ContactMessageStatus, number>;
  open: number;
}

/* --------------------------------------------------------------- user 360 */

/** Each section is `null` when the caller lacks its permission (listed in `access.denied`). */
export interface User360 {
  user: {
    id: string;
    username: string | null;
    fullName: string | null;
    role: string;
    status: string;
    country: string | null;
    createdAt: string;
    lastActivityAt: string | null;
    email: string | null;
    phone: string | null;
    contactMasked: boolean;
    emailVerified: boolean;
    phoneVerified: boolean;
    /** `null` when the caller lacks `admin:roles:view`. */
    adminRoles: Array<{ role: string; grantedAt: string }> | null;
  } | null;
  commerce: Record<string, unknown> | null;
  financial: Record<string, unknown> | null;
  security: Record<string, unknown> | null;
  support: Record<string, unknown> | null;
  risk: { level?: string; score?: number } | Record<string, unknown> | null;
  moderation: Record<string, unknown> | null;
  access: { granted: string[]; denied: Array<{ section: string; requires: string }> };
}

export interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  href: string | null;
}


/* ------------------------------------------------- platform configuration */

export interface PlatformSetting {
  key: string;
  type: 'boolean' | 'integer' | 'number' | 'string' | 'enum' | string;
  description: string;
  owner: string;
  security: boolean;
  value: boolean | number | string;
  default: boolean | number | string;
  overridden: boolean;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  constraints: { min?: number; max?: number; values?: readonly string[]; maxLength?: number };
}

export interface FeatureFlag {
  key: string;
  environment: string;
  kind: 'boolean' | 'percentage';
  enabled: boolean;
  rolloutPercent: number;
  defaultValue: boolean;
  owner: string;
  description: string;
  killSwitch: boolean;
  scheduledActivationAt: string | null;
  userTargets: string[];
  creatorTargets: string[];
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

/* --------------------------------------------------------------------- risk */

export interface RiskSignal {
  ruleId: string;
  ruleVersion: number;
  category?: 'ACCOUNT' | 'PAYMENT' | 'REFUND' | 'CREATOR' | 'CONTENT' | 'BEHAVIOR' | 'SECURITY';
  source?: string;
  effectiveAt?: string;
  title: string;
  explanation: string;
  signal: string;
  measured: number;
  unit: string;
  windowHours: number;
  threshold: number;
  severity: string;
  weight: number;
  evidence: { refs: string[] };
}

export interface RiskRulesResponse {
  rulesetVersion: string;
  externalIntegrations: Array<{
    id: string;
    status: 'NOT_CONFIGURED' | string;
    description: string;
  }>;
  bands: Record<string, number | string[]>;
  rules: Array<{
    id: string;
    version: number;
    category: string;
    source: string;
    title: string;
    effectiveFrom: string;
    effectiveAt: string;
    explanation: string;
    signal: string;
    windowHours: number;
    unit: string;
    tiers: Array<{ threshold: number; severity: string; weight: number }>;
  }>;
}

export interface RiskAssessmentItem {
  id: string;
  subjectUserId: string;
  subject: { id: string; name: string | null };
  score: number;
  level: string;
  rulesetVersion: string | number;
  computedAt: string;
  caseId: string | null;
  reviewed: boolean;
  signalCount: number;
  rules: string[];
}

export interface RiskAssessmentDetail {
  id: string;
  subjectUserId: string;
  score: number;
  level: string;
  rulesetVersion: string | number;
  signals: RiskSignal[];
  computedAt: string;
  subject: { id: string; name: string | null; status: string };
  reviews: Array<{ id: string; reviewer: { id: string; name: string | null } | null; decision: string; note: string; createdAt: string }>;
  case: { id: string; status: string; caseNumber: string } | null;
}

/* -------------------------------------------------------------------- audit */

export interface AuditEvent {
  id: string;
  seq: string;
  occurredAt: string;
  category: string;
  action: string;
  result: string;
  severity: string;
  actorId: string | null;
  actorRole: string | null;
  impersonatedUserId: string | null;
  impersonationSessionId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  reason: string | null;
  requestId: string | null;
}

export interface AuditVerification {
  ok: boolean;
  checked: number;
  firstSeq: string | null;
  lastSeq: string | null;
  headHash: string | null;
  brokenAtSeq: string | null;
  brokenReason: string | null;
}

export interface AuditArchive {
  id: string;
  fromSeq: string;
  toSeq: string;
  rows: number;
  firstHash: string;
  lastHash: string;
  fileSha256: string;
  createdAt: string;
}

export interface AuditArchiveVerification {
  id: string;
  fromSeq: string;
  toSeq: string;
  rows: number;
  createdAt: string;
  expectedSha256: string;
  actualSha256: string | null;
  checksumMatches: boolean;
  contentValid: boolean;
  contentError: string | null;
  chain: AuditVerification;
  ok: boolean;
}

export interface AuditQuery {
  category?: string;
  action?: string;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  result?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

/* ------------------------------------------------------------------ exports */

export interface ExportKindInfo {
  kind: string;
  columns: string[];
  statuses: string[] | null;
  allowed: boolean;
  canIncludeSensitive: boolean;
  containsPersonalData: boolean;
}

export interface ExportJob {
  id: string;
  kind: string;
  status: 'QUEUED' | 'RUNNING' | 'READY' | 'FAILED' | 'EXPIRED' | string;
  filters: { from?: string; to?: string; status?: string } | null;
  includeSensitive: boolean;
  reason: string;
  rowCount: number | null;
  fileBytes: number | null;
  error: string | null;
  downloads: number;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
  downloadable: boolean;
  progress: number;
}


/* ----------------------------------------------------- timeline, bulk, roles */

export interface TimelineEvent {
  at: string;
  type: string;
  title: string;
  status: string | null;
  source: { type: string; id: string; href: string | null };
}

export interface TimelinePage {
  items: TimelineEvent[];
  nextCursor: string | null;
  hiddenTypes: string[];
}

export interface BulkPreview {
  operationId: string;
  confirmHash: string;
  expiresInMinutes: number;
  summary: { total: number; willApply: number; willSkip: number };
  items: Array<{ caseId: string; caseNumber: string | null; outcome: 'WILL_APPLY' | 'WILL_SKIP'; reason: string | null; from: string | null }>;
}

export interface BulkResult {
  operationId: string;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | string;
  summary: { total: number; applied: number; skipped: number; failed: number };
  items: Array<{ caseId: string; outcome: 'APPLIED' | 'SKIPPED' | 'FAILED'; reason: string | null }>;
}

export interface AdminListItem {
  userId: string;
  username: string | null;
  email: string | null;
  status: string;
  legacy: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  roles: Array<{
    assignmentId: string;
    role: string;
    deniedPermissions: string[];
    grantedBy: string | null;
    grantedAt: string;
    reason: string;
  }>;
}

export interface RoleCatalog {
  roles: Array<{ role: string; permissions: string[] }>;
  permissions: Array<{ key: string; description: string; sensitive: boolean; stepUp: boolean }>;
}

/* ------------------------------------------------------------------- calls */

export const controlApi = {
  /* sign-in + step-up */
  loginMfa: (body: { challengeToken: string; code: string }) =>
    http.post<{ user: PublicUser; accessToken: string }>('/auth/login/mfa', body, { skipAuth: true }),
  adminSelf: () => http.get<AdminSelf>('/admin/security/me'),
  stepUp: (code: string) => http.post<{ expiresAt: string; method: string }>('/admin/security/step-up', { code }),

  /* impersonation */
  startImpersonation: (body: { targetUserId: string; reason: string }) =>
    http.post<ImpersonationStart>('/admin/impersonation/sessions', body),
  impersonationBanner: () => http.get<ImpersonationBanner>('/me/impersonation'),
  leaveImpersonation: () => http.post<unknown>('/me/impersonation/end'),

  /* command centre */
  commandCenter: () => http.get<CommandCenter>('/admin/command-center'),
  analyticsDefinitions: () =>
    http.get<{ version: string; metrics: AnalyticsDefinition[]; unsupported: Array<{ name: string; reason: string }> }>(
      '/admin/analytics/definitions',
    ),
  analyticsMetrics: (query: { from?: string; to?: string; currency?: string }) =>
    http.get<AnalyticsMetricsResponse>('/admin/analytics/metrics', query as never),
  analyticsSeries: (query: { from?: string; to?: string; currency?: string }) =>
    http.get<{ window: { from: string; to: string; days: number }; timezone: string; currency: string; series: Array<{ date: string; metrics: Record<string, string | number | null> }> }>('/admin/analytics/series', query as never),
  analyticsCohorts: (query: { currency?: string; months?: number }) =>
    http.get<unknown>('/admin/analytics/cohorts', query as never),
  analyticsDataQuality: () => http.get<unknown>('/admin/analytics/data-quality'),

  /* payout operations */
  payoutSummary: () => http.get<PayoutOpsSummary>('/admin/payout-operations/summary'),
  payouts: (query: PayoutOpsQuery) => http.get<Page<PayoutOpsItem>>('/admin/payout-operations', query as never),
  payout: (id: string) => http.get<PayoutOpsDetail>(`/admin/payout-operations/${id}`),
  payoutDestination: (id: string) =>
    http.get<{ payoutId: string; amount: string; currency: string; holderName: string; iban: string }>(
      `/admin/payout-operations/${id}/destination`,
    ),
  payoutAction: (id: string, action: PayoutActionRoute, body: Record<string, unknown>) => {
    switch (action) {
      case 'review':
        return http.post<unknown>(`/admin/payout-operations/${id}/review`, body);
      case 'approve':
        return http.post<unknown>(`/admin/payout-operations/${id}/approve`, body);
      case 'start-processing':
        return http.post<unknown>(`/admin/payout-operations/${id}/start-processing`, body);
      case 'reference':
        return http.post<unknown>(`/admin/payout-operations/${id}/reference`, body);
      case 'schedule':
        return http.post<unknown>(`/admin/payout-operations/${id}/schedule`, body);
      case 'mark-paid':
        return http.post<unknown>(`/admin/payout-operations/${id}/mark-paid`, body);
      case 'record-failure':
        return http.post<unknown>(`/admin/payout-operations/${id}/record-failure`, body);
      case 'reject':
        return http.post<unknown>(`/admin/payout-operations/${id}/reject`, body);
      case 'cancel':
        return http.post<unknown>(`/admin/payout-operations/${id}/cancel`, body);
      case 'hold':
        return http.post<unknown>(`/admin/payout-operations/${id}/hold`, body);
      case 'hold/release':
        return http.post<unknown>(`/admin/payout-operations/${id}/hold/release`, body);
      case 'exceptions':
        return http.post<unknown>(`/admin/payout-operations/${id}/exceptions`, body);
      case 'exceptions/resolve':
        return http.post<unknown>(`/admin/payout-operations/${id}/exceptions/resolve`, body);
      case 'notification/retry':
        return http.post<unknown>(`/admin/payout-operations/${id}/notification/retry`, body);
    }
  },
  uploadPayoutEvidence: (id: string, file: File, reason?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (reason) form.append('reason', reason);
    return http.post<unknown>(`/admin/payout-operations/${id}/evidence`, form);
  },

  /* moderation */
  moderationSummary: () => http.get<ModerationSummary>('/admin/moderation/cases/summary'),
  moderationCases: (query: { status?: string; priority?: string; overdue?: string; page?: number; pageSize?: number }) =>
    http.get<Page<ModerationCase>>('/admin/moderation/cases', query),
  moderationCase: (id: string) => http.get<ModerationCaseDetail>(`/admin/moderation/cases/${id}`),
  moderationAction: (id: string, action: ModerationActionRoute, body: Record<string, unknown>) => {
    switch (action) {
      case 'triage':
        return http.post<unknown>(`/admin/moderation/cases/${id}/triage`, body);
      case 'claim':
        return http.post<unknown>(`/admin/moderation/cases/${id}/claim`, body);
      case 'start':
        return http.post<unknown>(`/admin/moderation/cases/${id}/start`, body);
      case 'require-action':
        return http.post<unknown>(`/admin/moderation/cases/${id}/require-action`, body);
      case 'escalate':
        return http.post<unknown>(`/admin/moderation/cases/${id}/escalate`, body);
      case 'resolve':
        return http.post<unknown>(`/admin/moderation/cases/${id}/resolve`, body);
      case 'reject':
        return http.post<unknown>(`/admin/moderation/cases/${id}/reject`, body);
      case 'duplicate':
        return http.post<unknown>(`/admin/moderation/cases/${id}/duplicate`, body);
      case 'priority':
        return http.post<unknown>(`/admin/moderation/cases/${id}/priority`, body);
    }
  },
  moderationNote: (id: string, note: string) => http.post<unknown>(`/admin/moderation/cases/${id}/notes`, { note }),

  /* support operations */
  supportSummary: () => http.get<SupportOpsSummary>('/admin/support/requests/summary'),
  supportRequests: (query: { status?: string; priority?: string; sla?: string; q?: string; page?: number; pageSize?: number }) =>
    http.get<Page<SupportOpsRequest>>('/admin/support/requests', query),
  supportRequest: (id: string) => http.get<SupportOpsDetail>(`/admin/support/requests/${id}`),
  supportAction: (id: string, action: SupportActionRoute, body: Record<string, unknown>) => {
    switch (action) {
      case 'claim':
        return http.post<unknown>(`/admin/support/requests/${id}/claim`, body);
      case 'priority':
        return http.post<unknown>(`/admin/support/requests/${id}/priority`, body);
      case 'escalate':
        return http.post<unknown>(`/admin/support/requests/${id}/escalate`, body);
      case 'de-escalate':
        return http.post<unknown>(`/admin/support/requests/${id}/de-escalate`, body);
      case 'pending':
        return http.post<unknown>(`/admin/support/requests/${id}/pending`, body);
      case 'resolve':
        return http.post<unknown>(`/admin/support/requests/${id}/resolve`, body);
      case 'close':
        return http.post<unknown>(`/admin/support/requests/${id}/close`, body);
      case 'reopen':
        return http.post<unknown>(`/admin/support/requests/${id}/reopen`, body);
    }
  },
  supportReply: (id: string, message: string) =>
    http.post<unknown>(`/admin/support/requests/${id}/reply`, { message }),
  supportInternalNote: (id: string, body: string) =>
    http.post<unknown>(`/admin/support/requests/${id}/notes`, { body }),

  /* public contact-form inbox (Sprint 1 — anonymous messages, same admin page) */
  contactMessages: {
    summary: () => http.get<ContactInboxSummary>('/admin/support/contact-messages/summary'),
    list: (query: { status?: ContactMessageStatus | 'open'; topic?: ContactTopic; q?: string; page?: number; pageSize?: number }) =>
      http.get<Page<ContactMessageView>>('/admin/support/contact-messages', query),
    detail: (id: string) => http.get<ContactMessageView>(`/admin/support/contact-messages/${id}`),
    setStatus: (id: string, body: { status: ContactMessageStatus; note?: string }) =>
      http.post<ContactMessageView>(`/admin/support/contact-messages/${id}/status`, body),
    reply: (id: string, message: string) => http.post<ContactMessageView>(`/admin/support/contact-messages/${id}/reply`, { message }),
  },


  /* platform configuration */
  settings: () => http.get<PlatformSetting[]>('/admin/platform/settings'),
  updateSetting: (key: string, body: { value: unknown; expectedVersion: number; reason: string }) =>
    http.patch<unknown>(`/admin/platform/settings/${encodeURIComponent(key)}`, body),
  flags: () => http.get<FeatureFlag[]>('/admin/platform/feature-flags'),
  createFlag: (body: { key: string; kind: 'boolean' | 'percentage'; owner: string; description: string; reason: string }) =>
    http.post<FeatureFlag>('/admin/platform/feature-flags', body),
  updateFlag: (key: string, body: Record<string, unknown>) =>
    http.patch<FeatureFlag>(`/admin/platform/feature-flags/${encodeURIComponent(key)}`, body),
  killSwitches: () => http.get<FeatureFlag[]>('/admin/platform/kill-switches'),
  flipKillSwitch: (key: string, body: { enabled: boolean; confirm: string; expectedVersion: number; reason: string }) =>
    http.post<unknown>(`/admin/platform/kill-switches/${encodeURIComponent(key)}`, body),

  /* risk */
  riskAssessments: (query: { level?: string; reviewed?: string; page?: number; pageSize?: number }) =>
    http.get<Page<RiskAssessmentItem>>('/admin/risk/assessments', query),
  riskRules: () => http.get<RiskRulesResponse>('/admin/risk/rules'),
  riskAssessment: (id: string) => http.get<RiskAssessmentDetail>(`/admin/risk/assessments/${id}`),
  riskAssess: (userId: string) => http.post<unknown>(`/admin/risk/users/${userId}/assess`),
  riskReview: (id: string, body: { decision: string; note: string }) =>
    http.post<unknown>(`/admin/risk/assessments/${id}/reviews`, body),

  /* audit */
  auditEvents: (query: AuditQuery) =>
    http.get<{ items: AuditEvent[]; meta: { nextCursor: string | null } }>('/admin/governance/audit/events', query as never),
  auditVerify: () => http.post<AuditVerification>('/admin/governance/audit/verify'),
  auditArchives: () => http.get<AuditArchive[]>('/admin/governance/audit/archives'),
  sealAuditArchive: () => http.post<{ sealed: boolean; archiveId?: string; rows?: number }>('/admin/governance/audit/seal'),
  verifyAuditArchive: (id: string) =>
    http.post<AuditArchiveVerification>(`/admin/governance/audit/archives/${id}/verify`),

  /* exports */
  exportKinds: () => http.get<ExportKindInfo[]>('/admin/exports/kinds'),
  exports: () => http.get<{ items: ExportJob[]; nextCursor: string | null }>('/admin/exports'),
  createExport: (body: { kind: string; filters?: Record<string, string>; includeSensitive?: boolean; reason: string }) =>
    http.post<ExportJob>('/admin/exports', body),

  /* user timeline, bulk moderation, role governance */
  userTimeline: (id: string, query: { types?: string; cursor?: string; limit?: number }) =>
    http.get<TimelinePage>(`/admin/users/${id}/timeline`, query),
  bulkPreview: (body: { action: string; caseIds: string[]; params?: Record<string, string>; reason: string }) =>
    http.post<BulkPreview>('/admin/moderation/bulk/preview', body),
  bulkConfirm: (operationId: string, confirmHash: string) =>
    http.post<BulkResult>(`/admin/moderation/bulk/${operationId}/confirm`, { confirmHash }),
  roleCatalog: () => http.get<RoleCatalog>('/admin/governance/roles'),
  admins: () => http.get<AdminListItem[]>('/admin/governance/roles/admins'),
  assignRole: (body: { userId: string; role: string; reason: string; deniedPermissions?: string[] }) =>
    http.post<unknown>('/admin/governance/roles/assign', body),
  updateRoleDeniedPermissions: (
    assignmentId: string,
    body: { deniedPermissions: string[]; reason: string },
  ) =>
    http.post<unknown>(
      `/admin/governance/roles/assignments/${assignmentId}/denied-permissions`,
      body,
    ),
  revokeRole: (assignmentId: string, reason: string) =>
    http.post<unknown>(`/admin/governance/roles/assignments/${assignmentId}/revoke`, { reason }),

  /* user 360 + search */
  user360: (id: string) => http.get<User360>(`/admin/users/${id}/360`),
  search: (q: string) => http.get<{ hits: SearchHit[] }>('/admin/search', { q }),
};

export type PayoutActionRoute =
  | 'review'
  | 'approve'
  | 'start-processing'
  | 'reference'
  | 'schedule'
  | 'mark-paid'
  | 'record-failure'
  | 'reject'
  | 'cancel'
  | 'hold'
  | 'hold/release'
  | 'exceptions'
  | 'exceptions/resolve'
  | 'notification/retry';

export type ModerationActionRoute =
  | 'triage'
  | 'claim'
  | 'start'
  | 'require-action'
  | 'escalate'
  | 'resolve'
  | 'reject'
  | 'duplicate'
  | 'priority';

export type SupportActionRoute = 'claim' | 'priority' | 'escalate' | 'de-escalate' | 'pending' | 'resolve' | 'close' | 'reopen';
