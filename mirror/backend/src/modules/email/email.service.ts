import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import {
  EmailMessage,
  EmailStatus,
} from '../../database/entities/platform/email-message.entity';
import { User } from '../../database/entities/identity/user.entity';
import { businessEvent } from '../../common/logging/app-logger';
import {
  EmailTransport,
  EmailTransportError,
} from './transports/email-transport';
import { ConsoleEmailTransport } from './transports/console-email.transport';
import { SmtpEmailTransport } from './transports/smtp-email.transport';
import {
  EmailTemplateData,
  EmailTemplateId,
  renderEmail,
} from './templates/email-templates';

export interface EnqueueEmailInput<T extends EmailTemplateId> {
  template: T;
  data: EmailTemplateData[T];
  /** Owner of the mailbox (locale resolved from the user record). */
  userId?: string;
  /** Explicit recipient (overrides the user's address; e.g. unverified). */
  to?: string;
  /** Explicit locale override (falls back to the user's preference). */
  locale?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

/**
 * Transactional email service (Batch 10 — Phase 19).
 *
 * Delivery state is fully decoupled from business state (§21): enqueueing
 * and sending NEVER throw into the business flow — every failure is
 * recorded on the email_messages row, logged as a structured event, and
 * retried on a bounded schedule (§22). Permanent failures
 * (5xx/auth rejections) are not retried forever.
 *
 * Idempotency (§44): a second enqueue for the same (template, user,
 * related entity) while one is already recorded is skipped — a duplicate
 * business event cannot spam the mailbox.
 */
@Injectable()
export class EmailService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(EmailService.name);
  private readonly transport: EmailTransport;
  private readonly maxAttempts: number;
  private readonly retryIntervalMs: number;
  private retryTimer: NodeJS.Timeout | null = null;
  private readonly inFlight = new Set<string>();
  /** In-flight delivery promises — awaited on graceful shutdown. */
  private readonly deliveryWaiters = new Set<Promise<void>>();

  constructor(
    @InjectRepository(EmailMessage)
    private readonly emailsRepository: Repository<EmailMessage>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    config: ConfigService,
    private readonly jobs: JobsService,
  ) {
    const transportName = config.getOrThrow<string>('emailTransport');
    this.transport =
      transportName === 'smtp'
        ? new SmtpEmailTransport(config)
        : new ConsoleEmailTransport();
    this.maxAttempts = config.getOrThrow<number>('emailMaxAttempts');
    this.retryIntervalMs = config.getOrThrow<number>('emailRetryIntervalMs');
  }

  /** The active transport name (for the detailed health endpoint). */
  get transportName(): string {
    return this.transport.name;
  }

  async verifyTransport(): Promise<{ ok: boolean; detail: string }> {
    return this.transport.verify();
  }

  onModuleInit(): void {
    // Bounded retry sweep — also drains rows whose inline send crashed.
    if (this.jobs.enabled) {
      // Durable queue: exactly one instance runs each tick, with retries.
      // The cron has minute granularity, so the interval rounds up.
      this.jobs.register({
        name: 'email.retry-sweep',
        everyMinutes: Math.max(1, Math.ceil(this.retryIntervalMs / 60_000)),
        handler: () => this.sweepRetries(),
      });
      return;
    }
    this.retryTimer = setInterval(
      () => void this.sweepRetries(),
      this.retryIntervalMs,
    );
    this.retryTimer.unref?.();
  }

  /**
   * Graceful shutdown: stop the sweep and give in-flight deliveries a
   * bounded window to finish their bookkeeping, so closing the app (or a
   * test) can never cut a delivery update mid-write.
   */
  async onApplicationShutdown(): Promise<void> {
    if (this.retryTimer) clearInterval(this.retryTimer);
    if (this.deliveryWaiters.size > 0) {
      await Promise.race([
        Promise.allSettled([...this.deliveryWaiters]),
        new Promise((resolve) => setTimeout(resolve, 5000).unref?.()),
      ]);
    }
  }

  /**
   * Queues a transactional email and starts its delivery. NEVER throws —
   * a notification problem must not fail the business operation (§21).
   */
  async enqueue<T extends EmailTemplateId>(
    input: EnqueueEmailInput<T>,
  ): Promise<EmailMessage | null> {
    try {
      let to = input.to ?? null;
      let locale = input.locale ?? null;
      const payload = { ...(input.data as Record<string, unknown>) };
      if (input.userId) {
        const user = await this.usersRepository.findOne({
          where: { id: input.userId },
          select: {
            id: true,
            email: true,
            preferredLocale: true,
            fullName: true,
            username: true,
          },
        });
        if (user) {
          to = to ?? user.email;
          locale = locale ?? user.preferredLocale;
          // Personalized greeting (§20): enrich the payload with a display
          // name unless the caller provided one. Full name wins, then the
          // username, then the email local-part.
          if (payload.recipientName === undefined) {
            payload.recipientName =
              user.fullName?.trim() ||
              user.username?.trim() ||
              user.email?.split('@')[0] ||
              '';
          }
        }
      }
      if (!to) {
        this.logger.warn(
          `Email ${input.template} skipped: no recipient resolvable`,
        );
        return null;
      }
      locale = locale ?? 'fa';

      // Duplicate-event guard: one recorded delivery per logical event.
      if (input.userId && input.relatedEntityId) {
        const existing = await this.emailsRepository.findOneBy({
          template: input.template,
          userId: input.userId,
          relatedEntityId: input.relatedEntityId,
        });
        if (existing) {
          businessEvent.info(
            'email.enqueue.duplicate_skipped',
            'Duplicate email event skipped',
            {
              template: input.template,
              emailMessageId: existing.id,
              relatedEntityId: input.relatedEntityId,
            },
          );
          return existing;
        }
      }

      let row: EmailMessage | null = null;
      try {
        row = await this.emailsRepository.save(
          this.emailsRepository.create({
            userId: input.userId ?? null,
            toEmail: to,
            template: input.template,
            locale,
            status: EmailStatus.PENDING,
            maxAttempts: this.maxAttempts,
            payload,
            relatedEntityType: input.relatedEntityType ?? null,
            relatedEntityId: input.relatedEntityId ?? null,
          }),
        );
      } catch (error) {
        // Unique-violation race on (template, user_id, related_entity_id):
        // two concurrent finalizations both passed the SELECT above — the
        // partial unique index (migration 1756300000000) is the last line
        // of defence. Losing the race is a SUCCESS (idempotent enqueue).
        if (
          error &&
          typeof error === 'object' &&
          (error as { code?: string }).code === '23505'
        ) {
          const existing = input.userId
            ? await this.emailsRepository.findOneBy({
                template: input.template,
                userId: input.userId,
                relatedEntityId: input.relatedEntityId ?? '',
              })
            : null;
          if (existing) {
            businessEvent.info(
              'email.enqueue.duplicate_race_resolved',
              'Concurrent duplicate email event resolved by unique index',
              {
                template: input.template,
                emailMessageId: existing.id,
                relatedEntityId: input.relatedEntityId,
              },
            );
            return existing;
          }
        }
        throw error;
      }

      businessEvent.info('email.queued', 'Transactional email queued', {
        emailMessageId: row.id,
        template: row.template,
        locale: row.locale,
        userId: row.userId ?? undefined,
        relatedEntityId: row.relatedEntityId ?? undefined,
      });

      // Fire-and-forget first attempt (bounded by the retry sweep too);
      // tracked so shutdown can wait for it.
      void this.trackDelivery(row.id);
      return row;
    } catch (error) {
      this.logger.error(
        `Failed to queue ${input.template} email`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  /**
   * Starts a delivery and remembers its promise so graceful shutdown can
   * await outstanding attempts.
   */
  private trackDelivery(emailMessageId: string): Promise<void> {
    const promise = this.deliver(emailMessageId).catch(() => undefined);
    this.deliveryWaiters.add(promise);
    void promise.then(() => this.deliveryWaiters.delete(promise));
    return promise;
  }

  /** Processes one delivery attempt for a row (by id, crash-safe). */
  private async deliver(emailMessageId: string): Promise<void> {
    if (this.inFlight.has(emailMessageId)) return;
    this.inFlight.add(emailMessageId);
    try {
      const row = await this.emailsRepository.findOneBy({
        id: emailMessageId,
      });
      if (!row || row.status === EmailStatus.SENT) return;
      if (
        row.status === EmailStatus.PERMANENTLY_FAILED ||
        row.attempts >= row.maxAttempts
      ) {
        return;
      }

      const rendered = renderEmail(
        row.template as EmailTemplateId,
        row.locale,
        row.payload,
      );

      const attempt = row.attempts + 1;
      businessEvent.info('email.send.started', 'Email delivery started', {
        emailMessageId: row.id,
        template: row.template,
        locale: row.locale,
        attempt,
        provider: this.transport.name,
        userId: row.userId ?? undefined,
      });

      // The staleness marker makes crash recovery possible: a row stuck in
      // SENDING (process died mid-send) becomes sweep-eligible again after
      // one retry interval. In-process, the inFlight guard still prevents
      // a double delivery while the original attempt is alive.
      await this.emailsRepository.update(row.id, {
        status: EmailStatus.SENDING,
        nextAttemptAt: new Date(Date.now() + this.retryIntervalMs),
      });

      try {
        const result = await this.transport.send({
          to: row.toEmail,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        });
        await this.emailsRepository.update(row.id, {
          status: EmailStatus.SENT,
          sentAt: new Date(),
          providerMessageId: result.messageId,
          attempts: attempt,
          nextAttemptAt: null,
          lastErrorCode: null,
          lastError: null,
          // Terminal state: the render payload (which for verification /
          // reset templates contains the code/token) is purged — it is not
          // needed after delivery and must not sit in the database forever.
          payload: {},
        });
        // SMTP acceptance only confirms hand-off to the configured transport.
        // Do not represent this as mailbox delivery without provider evidence.
        businessEvent.info(
          'email.send.succeeded',
          'Email accepted by transport',
          {
            emailMessageId: row.id,
            template: row.template,
            locale: row.locale,
            attempt,
            provider: this.transport.name,
            userId: row.userId ?? undefined,
          },
        );
      } catch (error) {
        const transportError =
          error instanceof EmailTransportError
            ? error
            : new EmailTransportError(
                error instanceof Error ? error.message : String(error),
                false,
                'UNKNOWN',
              );
        const exhausted = attempt >= row.maxAttempts;
        const permanent = transportError.permanent || exhausted;
        await this.emailsRepository.update(row.id, {
          status: permanent
            ? EmailStatus.PERMANENTLY_FAILED
            : EmailStatus.FAILED,
          attempts: attempt,
          lastErrorCode: transportError.code.slice(0, 128),
          lastError: transportError.message.slice(0, 500),
          nextAttemptAt: permanent ? null : this.backoff(attempt),
          // Terminal state: no retry will re-render this message, so the
          // payload (codes/tokens for sensitive templates) is purged.
          ...(permanent ? { payload: {} } : {}),
        });
        if (permanent) {
          businessEvent.error(
            'email.send.failed',
            'Email delivery failed permanently',
            {
              emailMessageId: row.id,
              template: row.template,
              locale: row.locale,
              attempt,
              maxAttempts: row.maxAttempts,
              provider: this.transport.name,
              errorCode: transportError.code,
              userId: row.userId ?? undefined,
            },
          );
        } else {
          businessEvent.warn(
            'email.send.retry',
            'Email delivery failed — scheduled retry',
            {
              emailMessageId: row.id,
              template: row.template,
              locale: row.locale,
              attempt,
              maxAttempts: row.maxAttempts,
              provider: this.transport.name,
              errorCode: transportError.code,
              userId: row.userId ?? undefined,
            },
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Email delivery bookkeeping failed for ${emailMessageId}`,
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.inFlight.delete(emailMessageId);
    }
  }

  /** Retry sweep: due failed/pending rows, claimed with SKIP LOCKED. */
  private async sweepRetries(): Promise<void> {
    try {
      // 'sending' rows are only eligible once their staleness marker
      // (set when delivery started) is past — that recovers rows whose
      // process died mid-send without double-delivering live attempts.
      const due = await this.emailsRepository.query<Array<{ id: string }>>(
        `SELECT id FROM email_messages
         WHERE status IN ('pending', 'failed', 'sending')
           AND attempts < max_attempts
           AND (next_attempt_at IS NULL OR next_attempt_at <= now())
         ORDER BY created_at ASC
         LIMIT 10
         FOR UPDATE SKIP LOCKED`,
      );
      for (const row of due) {
        void this.trackDelivery(row.id);
      }
    } catch {
      // The sweep must never crash the process (e.g. during shutdown).
    }
  }

  /** Exponential-ish backoff: 30s, 2m, 4m30s, 8m … capped at 15m. */
  /**
   * Exponential-ish backoff: base·attempt² capped at 15m. The base is the
   * configured retry interval (default 30s → 30s, 2m, 4m30s, 8m …), so the
   * whole retry pipeline is drivable in tests via EMAIL_RETRY_INTERVAL_MS.
   */
  private backoff(attempt: number): Date {
    const baseSeconds = Math.max(this.retryIntervalMs / 1000, 0.001);
    const seconds = Math.min(baseSeconds * attempt * attempt, 900);
    return new Date(Date.now() + seconds * 1000);
  }
}
