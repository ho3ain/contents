import { Logger, LoggerService } from '@nestjs/common';
import { getRequestContext, RequestContext } from './request-context';
import { redactForLog } from './redact';

/**
 * Production structured logger (Batch 10 — Workstream C).
 *
 * - One JSON object per line in production/test (aggregator-friendly),
 *   human-readable lines in development.
 * - Every entry is timestamped, severity- and environment-aware, and carries
 *   the current request context (requestId / userId) when one is active.
 * - All fields pass through the centralized redactor — sensitive keys can
 *   never reach the output.
 * - A bounded in-memory ring buffer keeps the most recent entries so tests
 *   (and an operator with a debugger) can assert on what was emitted without
 *   shipping a log vendor.
 */
export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogFields {
  [key: string]: unknown;
}

const LEVEL_WEIGHT: Record<AppLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const RING_BUFFER_SIZE = 500;

export interface LogEntry {
  timestamp: string;
  level: AppLogLevel;
  service: string;
  environment: string;
  event: string;
  message: string;
  requestId?: string;
  userId?: string;
  traceId?: string;
  spanId?: string;
  fields: Record<string, unknown>;
}

export class AppLogger implements LoggerService {
  private environment = 'development';
  private minLevel: AppLogLevel = 'info';
  private service = 'agenthub-api';
  private readonly ring: LogEntry[] = [];

  configure(options: {
    environment: string;
    minLevel: AppLogLevel;
    service?: string;
  }): void {
    this.environment = options.environment;
    this.minLevel = options.minLevel;
    if (options.service) this.service = options.service;
  }

  // ---- Nest LoggerService bridge -------------------------------------
  log(message: unknown, context?: string): void {
    this.emit('info', 'app.log', String(message), undefined, {
      service: context,
    });
  }

  verbose(message: unknown, context?: string): void {
    this.emit('debug', 'app.debug', String(message), undefined, {
      service: context,
    });
  }

  debug(message: unknown, context?: string): void {
    this.emit('debug', 'app.debug', String(message), undefined, {
      service: context,
    });
  }

  warn(message: unknown, context?: string): void {
    this.emit('warn', 'app.warn', String(message), undefined, {
      service: context,
    });
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.emit('error', 'app.error', String(message), undefined, {
      service: context,
      ...(stack ? { stack } : {}),
    });
  }

  fatal(message: unknown, stack?: string, context?: string): void {
    this.emit('fatal', 'app.fatal', String(message), undefined, {
      service: context,
      ...(stack ? { stack } : {}),
    });
  }

  // ---- Structured business API ---------------------------------------
  debugEvent(event: string, message: string, fields?: LogFields): void {
    this.emit('debug', event, message, fields);
  }

  infoEvent(event: string, message: string, fields?: LogFields): void {
    this.emit('info', event, message, fields);
  }

  warnEvent(event: string, message: string, fields?: LogFields): void {
    this.emit('warn', event, message, fields);
  }

  errorEvent(event: string, message: string, fields?: LogFields): void {
    this.emit('error', event, message, fields);
  }

  /** The most recent emitted entries (already redacted), oldest first. */
  recentEntries(): LogEntry[] {
    return [...this.ring];
  }

  /** Test/diagnostic helper: entries matching an event name. */
  entriesFor(event: string): LogEntry[] {
    return this.ring.filter((entry) => entry.event === event);
  }

  private emit(
    level: AppLogLevel,
    event: string,
    message: string,
    fields?: LogFields,
    extra?: LogFields,
  ): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.minLevel]) return;

    const context: RequestContext | undefined = getRequestContext();
    const allFields = {
      ...(extra ?? {}),
      ...(fields ?? {}),
    } as Record<string, unknown>;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: (allFields.service as string) ?? this.service,
      environment: this.environment,
      event,
      message,
      ...(context?.requestId ? { requestId: context.requestId } : {}),
      ...(context?.userId ? { userId: context.userId } : {}),
      ...(context?.traceId ? { traceId: context.traceId } : {}),
      ...(context?.spanId ? { spanId: context.spanId } : {}),
      fields: (redactForLog(allFields) ?? {}) as Record<string, unknown>,
    };

    this.ring.push(entry);
    if (this.ring.length > RING_BUFFER_SIZE) this.ring.shift();

    this.write(level, entry);
  }

  private write(level: AppLogLevel, entry: LogEntry): void {
    const line =
      this.environment === 'development'
        ? this.pretty(entry)
        : JSON.stringify({
            timestamp: entry.timestamp,
            level: entry.level,
            service: entry.service,
            environment: entry.environment,
            event: entry.event,
            message: entry.message,
            ...(entry.requestId ? { requestId: entry.requestId } : {}),
            ...(entry.userId ? { userId: entry.userId } : {}),
            ...(entry.traceId ? { traceId: entry.traceId } : {}),
            ...(entry.spanId ? { spanId: entry.spanId } : {}),
            ...entry.fields,
          });

    // The process-level writer — stderr for warn and above keeps stdout
    // reserved for the machine-readable info stream where aggregators
    // usually attach.
    if (level === 'error' || level === 'fatal') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }

  private pretty(entry: LogEntry): string {
    const request = entry.requestId
      ? ` [req:${entry.requestId.slice(0, 8)}]`
      : '';
    const extras = Object.entries(entry.fields)
      .filter(([key]) => key !== 'service' && key !== 'stack')
      .map(([key, value]) => `${key}=${formatValue(value)}`)
      .join(' ');
    const stack =
      typeof entry.fields.stack === 'string' ? `\n${entry.fields.stack}` : '';
    return `${entry.timestamp} ${entry.level.toUpperCase().padEnd(5)} [${entry.service}]${request} ${entry.message}${extras ? ` ${extras}` : ''}${stack}`;
  }
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? String(value);
}

/**
 * The singleton used by both the Nest override
 * (`Logger.overrideLogger(appLogger)`) and direct structured calls.
 */
export const appLogger = new AppLogger();

/**
 * Convenience wrapper for business-event logging from services that do not
 * want to import the singleton directly.
 */
export const businessEvent = {
  debug: (event: string, message: string, fields?: LogFields) =>
    appLogger.debugEvent(event, message, fields),
  info: (event: string, message: string, fields?: LogFields) =>
    appLogger.infoEvent(event, message, fields),
  warn: (event: string, message: string, fields?: LogFields) =>
    appLogger.warnEvent(event, message, fields),
  error: (event: string, message: string, fields?: LogFields) =>
    appLogger.errorEvent(event, message, fields),
};

export { Logger };
