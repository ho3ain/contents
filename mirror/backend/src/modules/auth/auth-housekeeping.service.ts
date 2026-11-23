import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { AuthSessionsService } from './auth-sessions.service';
import { LoginAttemptsService } from './login-attempts.service';

export const AUTH_HOUSEKEEPING_JOB = 'auth.housekeeping';
const EVERY_MINUTES = 60;

/**
 * Keeps the two unbounded auth tables small: idle login-lockout counters and
 * sessions that can never be used again. Both deletes are idempotent, so a
 * second instance (or a retried job) is harmless.
 *
 * Runs on the durable job queue when `JOBS_ENABLED=true`, otherwise on an
 * hourly in-process timer — never not at all.
 */
@Injectable()
export class AuthHousekeepingService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(AuthHousekeepingService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly attempts: LoginAttemptsService,
    private readonly sessions: AuthSessionsService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit(): void {
    if (this.jobs.enabled) {
      this.jobs.register({
        name: AUTH_HOUSEKEEPING_JOB,
        everyMinutes: EVERY_MINUTES,
        handler: () => this.runOnce(),
      });
      return;
    }
    this.timer = setInterval(() => {
      this.runOnce().catch((error: unknown) =>
        this.logger.error(
          'Auth housekeeping failed',
          error instanceof Error ? error.stack : String(error),
        ),
      );
    }, EVERY_MINUTES * 60_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<{ attempts: number; sessions: number }> {
    const attempts = await this.attempts.purgeStale();
    const sessions = await this.sessions.purgeDead();
    if (attempts || sessions) {
      this.logger.log(
        `Auth housekeeping removed ${attempts} idle lockout counters and ${sessions} dead sessions`,
      );
    }
    return { attempts, sessions };
  }
}
