import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { FeatureFlagsService } from '../control-plane/config/feature-flags.service';
import { JobsService } from '../jobs/jobs.service';
import { IntegrityService } from './integrity.service';
import { PayoutsService } from './payouts.service';
import { ReleaseService } from './release.service';

export const FINANCE_RELEASE_JOB = 'finance.release-due';
export const FINANCE_AUTO_PAYOUT_JOB = 'finance.auto-payouts';
export const FINANCE_INTEGRITY_JOB = 'finance.integrity';

interface JobSpec {
  name: string;
  everyMinutes: number;
  run: () => Promise<unknown>;
}

/**
 * W3.2 / W5.3 — the scheduled financial jobs. Durable (pg-boss) when
 * `JOBS_ENABLED=true`, otherwise an in-process timer so they are never
 * silently absent. Each job is idempotent by construction (ledger keys,
 * row locks), so a second instance or a retry is harmless.
 */
@Injectable()
export class FinanceJobsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(FinanceJobsService.name);
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly jobs: JobsService,
    private readonly release: ReleaseService,
    private readonly payouts: PayoutsService,
    private readonly integrity: IntegrityService,
    private readonly flags: FeatureFlagsService,
  ) {}

  private specs(): JobSpec[] {
    return [
      {
        name: FINANCE_RELEASE_JOB,
        everyMinutes: 60,
        run: () => this.release.releaseDue(),
      },
      {
        name: FINANCE_AUTO_PAYOUT_JOB,
        everyMinutes: 24 * 60,
        run: async () => {
          // Emergency switch: while PAYOUTS_ENABLED is OFF no new payout is
          // created. The next daily run picks the creators up again.
          try {
            await this.flags.assertEnabled('PAYOUTS_ENABLED');
          } catch {
            this.logger.warn(
              `${FINANCE_AUTO_PAYOUT_JOB} skipped: PAYOUTS_ENABLED is OFF`,
            );
            return { skipped: true };
          }
          return this.payouts.runAutomatic();
        },
      },
      {
        name: FINANCE_INTEGRITY_JOB,
        everyMinutes: 60,
        run: () => this.integrity.run(),
      },
    ];
  }

  onModuleInit(): void {
    // Tests drive the services directly with a controllable clock.
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.FINANCE_JOBS_IN_TEST !== 'true'
    )
      return;
    for (const spec of this.specs()) {
      if (this.jobs.enabled) {
        this.jobs.register({
          name: spec.name,
          everyMinutes: spec.everyMinutes,
          handler: () => spec.run(),
        });
      } else {
        const timer = setInterval(() => {
          spec
            .run()
            .catch((error: unknown) =>
              this.logger.error(
                `${spec.name} failed`,
                error instanceof Error ? error.stack : String(error),
              ),
            );
        }, spec.everyMinutes * 60_000);
        timer.unref();
        this.timers.push(timer);
      }
    }
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers.length = 0;
  }
}
