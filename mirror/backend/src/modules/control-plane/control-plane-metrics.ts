import { Counter, Gauge, Histogram } from 'prom-client';
import { registry } from '../../common/observability/metrics';

/**
 * Phase 3 / W10 — control-plane observability. Label sets are CLOSED and low
 * cardinality: never a user id, resource id, IP or amount.
 */
export const adminAuthzDenialsTotal = new Counter({
  name: 'mesh_admin_authz_denials_total',
  help: 'Admin requests refused by the control-plane authorizer, by reason',
  labelNames: ['reason'] as const,
  registers: [registry],
});
export const adminRequestsTotal = new Counter({
  name: 'mesh_admin_requests_total',
  help: 'Admin API requests by method class and status class',
  labelNames: ['method', 'status'] as const,
  registers: [registry],
});
export const adminRequestSeconds = new Histogram({
  name: 'mesh_admin_request_seconds',
  help: 'Admin API latency',
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});
export const adminAuditEventsTotal = new Counter({
  name: 'mesh_admin_audit_events_total',
  help: 'Audit events written, by category and result',
  labelNames: ['category', 'result'] as const,
  registers: [registry],
});
export const adminAuditWriteFailuresTotal = new Counter({
  name: 'mesh_admin_audit_write_failures_total',
  help: 'Audit events that could not be written (always an incident)',
  labelNames: ['mode'] as const,
  registers: [registry],
});
export const impersonationEventsTotal = new Counter({
  name: 'mesh_admin_impersonation_events_total',
  help: 'Impersonation sessions started / ended / expired / blocked',
  labelNames: ['event'] as const,
  registers: [registry],
});
export const featureFlagChangesTotal = new Counter({
  name: 'mesh_admin_feature_flag_changes_total',
  help: 'Feature flag / kill switch changes',
  labelNames: ['kind'] as const,
  registers: [registry],
});
export const adminExportsTotal = new Counter({
  name: 'mesh_admin_exports_total',
  help: 'Export jobs by resulting status',
  labelNames: ['status'] as const,
  registers: [registry],
});
export const adminPayoutOpsTotal = new Counter({
  name: 'mesh_admin_payout_operations_total',
  help: 'Payout operations by action and outcome',
  labelNames: ['action', 'outcome'] as const,
  registers: [registry],
});
export const payoutNotificationFailuresTotal = new Counter({
  name: 'mesh_admin_payout_notification_failures_total',
  help: 'Recipient payout notifications that failed (the payout stays PAID)',
  registers: [registry],
});
export const adminBulkActionsTotal = new Counter({
  name: 'mesh_admin_bulk_actions_total',
  help: 'Bulk moderation executions by outcome',
  labelNames: ['outcome'] as const,
  registers: [registry],
});
export const controlPlaneQueueDepth = new Gauge({
  name: 'mesh_admin_queue_depth',
  help: 'Operational queue depth (moderation, risk, support, payouts, outbox)',
  labelNames: ['queue'] as const,
  registers: [registry],
});
export const analyticsQuerySeconds = new Histogram({
  name: 'mesh_admin_analytics_query_seconds',
  help: 'Analytics metric computation latency',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});
export const slaBreachesGauge = new Gauge({
  name: 'mesh_admin_sla_breaches',
  help: 'Open items past their SLA, by queue',
  labelNames: ['queue'] as const,
  registers: [registry],
});
export const analyticsQualityFailuresGauge = new Gauge({
  name: 'mesh_admin_analytics_quality_failures',
  help: 'Analytics / risk data-quality checks currently failing (0 = healthy)',
  labelNames: ['domain'] as const,
  registers: [registry],
});
