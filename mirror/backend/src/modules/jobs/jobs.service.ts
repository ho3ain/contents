import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PgBoss from 'pg-boss';
import { buildDbSsl } from '../../database/ssl';
import {
  JobQueueStats,
  jobDuration,
  jobRunsTotal,
  setQueueSampler,
} from '../../common/observability/metrics';

export interface JobDefinition {
  /** Stable queue name, e.g. `email.retry-sweep`. */
  name: string;
  /**
   * Minutes between scheduled runs (>= 1). A durable cron: exactly ONE
   * instance runs each tick, however many app instances are up.
   */
  everyMinutes: number;
  /** The work. Must be idempotent — a run can be retried after a crash. */
  handler: () => Promise<unknown>;
  /** Seconds before the first retry (doubles each time). Default 30. */
  retryDelaySeconds?: number;
}

const POLL_SECONDS = 2;
const RETRY_LIMIT = 2;
const STOP_TIMEOUT_MS = 8000;

/** Whole-minute interval -> cron expression. */
export function cronForMinutes(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 1) {
    throw new Error(`Job interval must be a whole number of minutes >= 1`);
  }
  if (minutes === 1) return '* * * * *';
  if (minutes < 60) return `*/${minutes} * * * *`;
  if (minutes % 60 === 0 && minutes <= 24 * 60) {
    return minutes === 60 ? '0 * * * *' : `0 */${minutes / 60} * * *`;
  }
  throw new Error(
    `Job interval ${minutes} min cannot be expressed as a cron schedule; use 1–59 minutes or whole hours up to 24`,
  );
}

/**
 * Durable background jobs on Postgres (pg-boss).
 *
 * Off unless `JOBS_ENABLED=true` — then `enabled` is false, nothing connects,
 * and the callers keep using their in-process timers exactly as before. When
 * on, callers `register()` a job during their own init and this service
 * schedules and executes it with retries, a retained `failed` state (the
 * dead-letter backlog, observable via `stats()` and metrics) and exactly-one
 * execution across instances, and records run count/duration metrics.
 */
@Injectable()
export class JobsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(JobsService.name);
  private readonly definitions = new Map<string, JobDefinition>();
  private boss: PgBoss | null = null;
  readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.enabled = config.get<boolean>('jobsEnabled') === true;
  }

  /** Called by feature modules in `onModuleInit` (before bootstrap). */
  register(definition: JobDefinition): void {
    if (this.definitions.has(definition.name)) {
      throw new Error(`Job "${definition.name}" is already registered`);
    }
    cronForMinutes(definition.everyMinutes); // fail at boot, not at 3 a.m.
    this.definitions.set(definition.name, definition);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) return;
    const boss = new PgBoss({
      host: this.config.getOrThrow<string>('dbHost'),
      port: this.config.getOrThrow<number>('dbPort'),
      database: this.config.getOrThrow<string>('dbName'),
      user: this.config.getOrThrow<string>('dbUsername'),
      password: this.config.getOrThrow<string>('dbPassword'),
      ssl: buildDbSsl(
        {
          enabled: this.config.get<boolean>('dbSsl') ?? false,
          ca: this.config.get<string>('dbSslCa'),
          rejectUnauthorized:
            this.config.get<boolean>('dbSslRejectUnauthorized') ?? true,
        },
        (message) => this.logger.warn(message),
      ),
      schema: 'pgboss',
      application_name: 'mesh-jobs',
      max: 4,
    });
    boss.on('error', (error) =>
      this.logger.error(`pg-boss error: ${error.message}`),
    );
    await boss.start();
    this.boss = boss;

    for (const definition of this.definitions.values()) {
      await boss.createQueue(definition.name, {
        name: definition.name,
        retryLimit: RETRY_LIMIT,
        retryDelay: definition.retryDelaySeconds ?? 30,
        retryBackoff: true,
        expireInMinutes: 15,
        retentionDays: 7,
      });
      await boss.schedule(
        definition.name,
        cronForMinutes(definition.everyMinutes),
      );
      await boss.work(
        definition.name,
        { pollingIntervalSeconds: POLL_SECONDS, includeMetadata: true },
        async (jobs) => this.execute(definition, jobs[0]?.retryCount),
      );
      this.logger.log(
        `Job ${definition.name} scheduled every ${definition.everyMinutes} min`,
      );
    }

    setQueueSampler(async () => this.stats());
  }

  /**
   * Per-queue health straight from the job store: waiting, active, failed
   * (dead-letter backlog), failed in the last hour, and the age of the oldest
   * job that is due but not started. `[]` when jobs are off.
   */
  async stats(): Promise<JobQueueStats[]> {
    if (!this.boss || this.definitions.size === 0) return [];
    const names = [...this.definitions.keys()];
    const { rows } = await this.boss.getDb().executeSql(
      `SELECT name,
              count(*) FILTER (WHERE state IN ('created','retry'))::int AS queued,
              count(*) FILTER (WHERE state = 'active')::int AS active,
              count(*) FILTER (WHERE state = 'failed')::int AS failed,
              count(*) FILTER (WHERE state = 'failed'
                               AND completed_on > now() - interval '1 hour')::int AS failed_last_hour,
              COALESCE(floor(extract(epoch FROM now() - min(start_after)
                FILTER (WHERE state IN ('created','retry') AND start_after <= now())))::int, 0)
                AS oldest_queued_seconds
         FROM pgboss.job
        WHERE name = ANY($1)
        GROUP BY name`,
      [names],
    );
    const byName = new Map(
      (
        rows as Array<{
          name: string;
          queued: number;
          active: number;
          failed: number;
          failed_last_hour: number;
          oldest_queued_seconds: number;
        }>
      ).map((r) => [r.name, r]),
    );
    return names.map((job) => {
      const r = byName.get(job);
      return {
        job,
        queued: r?.queued ?? 0,
        active: r?.active ?? 0,
        failed: r?.failed ?? 0,
        failedLastHour: r?.failed_last_hour ?? 0,
        oldestQueuedSeconds: r?.oldest_queued_seconds ?? 0,
      };
    });
  }

  /** Enqueues one immediate run (operations / tests). */
  async runNow(name: string): Promise<void> {
    if (!this.boss) throw new Error('Jobs are not enabled');
    if (!this.definitions.has(name)) throw new Error(`Unknown job "${name}"`);
    await this.boss.send(name, {});
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.boss) return;
    // Let a running job finish its bookkeeping; don't wait forever.
    setQueueSampler(null);
    await this.boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS });
    this.boss = null;
  }

  private async execute(
    definition: JobDefinition,
    retryCount?: number,
  ): Promise<void> {
    const stop = jobDuration.startTimer({ job: definition.name });
    try {
      await definition.handler();
      jobRunsTotal.inc({ job: definition.name, outcome: 'succeeded' });
    } catch (error) {
      jobRunsTotal.inc({ job: definition.name, outcome: 'failed' });
      // The last allowed attempt: pg-boss will not retry, the job lands in the
      // `failed` state (dead-letter backlog). Say so loudly, once.
      const exhausted = retryCount !== undefined && retryCount >= RETRY_LIMIT;
      if (exhausted) {
        jobRunsTotal.inc({ job: definition.name, outcome: 'exhausted' });
      }
      this.logger.error(
        exhausted
          ? `Job ${definition.name} failed on its last attempt (${(retryCount ?? 0) + 1} of ${RETRY_LIMIT + 1}) — moved to the failed state, no more retries`
          : `Job ${definition.name} failed`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error; // lets pg-boss retry it with backoff
    } finally {
      stop();
    }
  }
}
