import type { NextFunction, Request, Response } from 'express';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

/**
 * Process-wide Prometheus registry.
 *
 * Module-level on purpose (like `appLogger`): the exception filter, the
 * request middleware and the job runner all record into it without needing
 * dependency injection, and a second app instance created by a test shares the
 * same registry instead of registering duplicate collectors.
 *
 * Label policy: every label is low-cardinality by construction — route
 * TEMPLATES (`/api/v1/agents/:slug`, never the concrete URL), status CLASSES,
 * fixed outcome names. User ids, emails and raw URLs never become labels.
 */
export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: 'mesh_http_requests_total',
  help: 'HTTP requests handled, by method, route template and status class',
  labelNames: ['method', 'route', 'status_class'] as const,
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'mesh_http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_class'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const serverErrorsTotal = new Counter({
  name: 'mesh_server_errors_total',
  help: 'Unhandled server-side failures (HTTP 5xx), by machine error code',
  labelNames: ['code'] as const,
  registers: [registry],
});

/**
 * Security-relevant authentication events. The label set is CLOSED (see
 * AuthEvent) so cardinality is bounded; no identifier of any kind is a label.
 * Alert on: rate(login_locked) spikes (credential stuffing), any
 * refresh_reuse (stolen refresh token), code_exhausted bursts (code guessing).
 */
export type AuthEvent =
  | 'login_success'
  | 'login_failure'
  | 'login_locked'
  | 'login_blocked'
  | 'refresh_reuse'
  | 'logout_all'
  | 'code_exhausted'
  | 'password_reset_completed';

export const authEventsTotal = new Counter({
  name: 'mesh_auth_events_total',
  help: 'Authentication security events, by closed event name',
  labelNames: ['event'] as const,
  registers: [registry],
});

export const recordAuthEvent = (event: AuthEvent): void => {
  authEventsTotal.inc({ event });
};

/**
 * Entitlement authority outcomes. Values are closed enums from
 * `entitlement-domain.ts`; scope names and outcomes never contain user,
 * entitlement, product, order, token or runtime identifiers.
 */
export const entitlementAccessDecisionsTotal = new Counter({
  name: 'mesh_entitlement_access_decisions_total',
  help: 'Authoritative entitlement access decisions by scope and closed outcome',
  labelNames: ['capability', 'outcome'] as const,
  registers: [registry],
});

export const entitlementLifecycleTransitionsTotal = new Counter({
  name: 'mesh_entitlement_lifecycle_transitions_total',
  help: 'Committed-intent entitlement lifecycle transition attempts by type',
  labelNames: ['event_type', 'next_state'] as const,
  registers: [registry],
});

export const recordEntitlementDecision = (
  capability: string,
  outcome: string,
): void => {
  entitlementAccessDecisionsTotal.inc({ capability, outcome });
};

export const recordEntitlementLifecycleTransition = (
  eventType: string,
  nextState: string,
): void => {
  entitlementLifecycleTransitionsTotal.inc({
    event_type: eventType,
    next_state: nextState,
  });
};

/** Runtime control-plane observations. Labels are closed protocol/event outcomes only. */
export const runtimeEventsTotal = new Counter({
  name: 'mesh_runtime_events_total',
  help: 'Runtime control-plane events by closed event category and outcome',
  labelNames: ['event', 'outcome'] as const,
  registers: [registry],
});

export const runtimeGatewayRequestsTotal = new Counter({
  name: 'mesh_runtime_gateway_requests_total',
  help: 'Protected Runtime gateway requests by closed outcome',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

export type RuntimeMetricEvent = 'heartbeat' | 'conformance' | 'lifecycle';
export type RuntimeMetricOutcome = 'success' | 'failure' | 'blocked';
export type RuntimeGatewayOutcome =
  'allowed' | 'denied_entitlement' | 'unsupported_model' | 'execution_failed';

export const recordRuntimeEvent = (
  event: RuntimeMetricEvent,
  outcome: RuntimeMetricOutcome,
): void => {
  runtimeEventsTotal.inc({ event, outcome });
};

export const recordRuntimeGatewayOutcome = (
  outcome: RuntimeGatewayOutcome,
): void => {
  runtimeGatewayRequestsTotal.inc({ outcome });
};

export const queryCacheTotal = new Counter({
  name: 'mesh_query_cache_total',
  help: 'In-process read cache outcomes, by cache name and result (hit|miss|coalesced|bypass)',
  labelNames: ['cache', 'result'] as const,
  registers: [registry],
});

export const clientErrorsTotal = new Counter({
  name: 'mesh_client_errors_total',
  help: 'Browser-side errors reported through POST /client-errors',
  labelNames: ['kind'] as const,
  registers: [registry],
});

export const jobRunsTotal = new Counter({
  name: 'mesh_job_runs_total',
  help: 'Background job runs, by job and outcome',
  labelNames: ['job', 'outcome'] as const,
  registers: [registry],
});

export const jobDuration = new Histogram({
  name: 'mesh_job_duration_seconds',
  help: 'Background job run time in seconds',
  labelNames: ['job'] as const,
  buckets: [0.05, 0.25, 1, 5, 15, 60, 300],
  registers: [registry],
});

/** One queue's health, as read from the job store. */
export interface JobQueueStats {
  job: string;
  /** Waiting to run (created + retry). */
  queued: number;
  active: number;
  /** Failed after the last retry — the dead-letter backlog (still retained). */
  failed: number;
  /** Failed within the last hour: what an alert should key on. */
  failedLastHour: number;
  /** Age of the oldest job that is due but not started; 0 when none. */
  oldestQueuedSeconds: number;
}

type QueueSampler = () => Promise<JobQueueStats[]>;
let queueSampler: QueueSampler | null = null;

/** The job runner registers how queue health is read; scrapes pull it lazily. */
export const setQueueSampler = (sampler: QueueSampler | null): void => {
  queueSampler = sampler;
};

const jobGauge = (
  name: string,
  help: string,
  pick: (stats: JobQueueStats) => number,
): Gauge<'job'> =>
  new Gauge({
    name,
    help,
    labelNames: ['job'] as const,
    registers: [registry],
    async collect() {
      this.reset();
      if (!queueSampler) return;
      for (const stats of await queueSampler().catch(() => [])) {
        this.set({ job: stats.job }, pick(stats));
      }
    },
  });

export const jobQueueSize = jobGauge(
  'mesh_job_queue_size',
  'Jobs waiting in a queue (created + retry)',
  (stats) => stats.queued,
);
export const jobFailedRetained = jobGauge(
  'mesh_job_failed_retained',
  'Jobs that failed after their last retry and are still retained (dead-letter backlog)',
  (stats) => stats.failed,
);
export const jobFailedLastHour = jobGauge(
  'mesh_job_failed_last_hour',
  'Jobs that exhausted their retries within the last hour',
  (stats) => stats.failedLastHour,
);
export const jobOldestQueuedAge = jobGauge(
  'mesh_job_oldest_queued_age_seconds',
  'Age of the oldest due-but-unstarted job (a growing value means the worker is stuck or down)',
  (stats) => stats.oldestQueuedSeconds,
);

export interface PoolStats {
  total: number;
  idle: number;
  waiting: number;
  max: number;
}
let poolSampler: (() => PoolStats | null) | null = null;

/** The database layer registers how pool state is read; scrapes pull it lazily. */
export const setPoolSampler = (
  sampler: (() => PoolStats | null) | null,
): void => {
  poolSampler = sampler;
};

export const dbPoolConnections = new Gauge({
  name: 'mesh_db_pool_connections',
  help: 'Database pool connections by state (total, idle, waiting clients) and the configured max',
  labelNames: ['state'] as const,
  registers: [registry],
  collect() {
    this.reset();
    const stats = poolSampler?.();
    if (!stats) return;
    this.set({ state: 'total' }, stats.total);
    this.set({ state: 'idle' }, stats.idle);
    this.set({ state: 'waiting' }, stats.waiting);
    this.set({ state: 'max' }, stats.max);
  },
});

export const appInfo = new Gauge({
  name: 'mesh_app_info',
  help: 'Static application facts (value is always 1)',
  labelNames: ['version', 'node_env'] as const,
  registers: [registry],
});

const statusClass = (status: number) => `${Math.floor(status / 100)}xx`;

/**
 * Route label: the matched route TEMPLATE. A request that matched no route
 * (404 scanners, malformed URLs) collapses into one `unmatched` series so an
 * attacker cannot mint unbounded label values.
 */
export function routeLabel(request: Request): string {
  const template = (request.route as { path?: unknown } | undefined)?.path;
  return typeof template === 'string'
    ? `${request.baseUrl ?? ''}${template}`
    : 'unmatched';
}

export function metricsMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const started = process.hrtime.bigint();
  response.on('finish', () => {
    const route = routeLabel(request);
    // Scraping the metrics endpoint must not pollute the metrics.
    if (route.endsWith('/metrics')) return;
    const labels = {
      method: request.method,
      route,
      status_class: statusClass(response.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(
      labels,
      Number(process.hrtime.bigint() - started) / 1e9,
    );
  });
  next();
}
