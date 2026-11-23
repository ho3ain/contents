import { Counter, Gauge } from 'prom-client';
import { registry } from '../../common/observability/metrics';

/**
 * W9 / §18 — financial observability. Label sets are CLOSED (low
 * cardinality); no creator id, order id, amount or any personal data is ever
 * a label. Alert rules that use these names are in
 * docs/finance/alerts/finance.rules.yml (thresholds are configurable there).
 */
export const ledgerPostsTotal = new Counter({
  name: 'mesh_finance_ledger_posts_total',
  help: 'Ledger postings by transaction type and outcome (posted|replayed|rejected)',
  labelNames: ['type', 'outcome'] as const,
  registers: [registry],
});

export const ledgerPostFailuresTotal = new Counter({
  name: 'mesh_finance_ledger_post_failures_total',
  help: 'Ledger postings that failed, by closed reason',
  labelNames: ['reason'] as const,
  registers: [registry],
});

export const duplicateFinancialEventsTotal = new Counter({
  name: 'mesh_finance_duplicate_events_total',
  help: 'Financial events replayed with an existing idempotency key (absorbed, no second effect)',
  labelNames: ['type'] as const,
  registers: [registry],
});

export const idempotencyConflictsTotal = new Counter({
  name: 'mesh_finance_idempotency_conflicts_total',
  help: 'Same idempotency key presented with DIFFERENT content — always an incident',
  registers: [registry],
});

export const paymentsTotal = new Counter({
  name: 'mesh_finance_payments_total',
  help: 'Payments confirmed into the ledger / failed to confirm',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

export const refundsTotal = new Counter({
  name: 'mesh_finance_refunds_total',
  help: 'Refund postings by outcome (posted|duplicate|failed) and kind (held|available|recovery)',
  labelNames: ['outcome', 'kind'] as const,
  registers: [registry],
});

export const payoutsTotal = new Counter({
  name: 'mesh_finance_payouts_total',
  help: 'Payout state transitions by resulting status',
  labelNames: ['status', 'kind'] as const,
  registers: [registry],
});

export const kycPayoutBlocksTotal = new Counter({
  name: 'mesh_finance_kyc_payout_blocks_total',
  help: 'Payout attempts refused because KYC did not satisfy the eligibility policy',
  registers: [registry],
});

export const releaseRunsTotal = new Counter({
  name: 'mesh_finance_release_runs_total',
  help: 'Holding-release job runs by outcome',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

export const releasedEntitlementsTotal = new Counter({
  name: 'mesh_finance_released_entitlements_total',
  help: 'Entitlements moved HELD to AVAILABLE',
  registers: [registry],
});

export const jobRetriesTotal = new Counter({
  name: 'mesh_finance_job_retries_total',
  help: 'Finance job items retried after a transient failure',
  labelNames: ['job'] as const,
  registers: [registry],
});

export const reconciliationMismatchesTotal = new Counter({
  name: 'mesh_finance_reconciliation_mismatches_total',
  help: 'Reconciliation exceptions detected, by status',
  labelNames: ['status'] as const,
  registers: [registry],
});

export const integrityViolationsGauge = new Gauge({
  name: 'mesh_finance_integrity_violations',
  help: 'Violations found by the last ledger integrity run, by check',
  labelNames: ['check'] as const,
  registers: [registry],
});

export const negativeCreatorBalances = new Gauge({
  name: 'mesh_finance_negative_creator_balances',
  help: 'Creators with an outstanding recovery payable (explicit negative state)',
  registers: [registry],
});

export const openReconciliationExceptions = new Gauge({
  name: 'mesh_finance_open_reconciliation_exceptions',
  help: 'Reconciliation exceptions not yet RESOLVED',
  registers: [registry],
});

export const pendingPayouts = new Gauge({
  name: 'mesh_finance_pending_payouts',
  help: 'Payouts in REQUESTED/APPROVED/PROCESSING',
  registers: [registry],
});
