import { readFileSync } from 'fs';

/** The subset of node `tls` options both `pg` and `pg-boss` understand. */
export interface DbTlsOptions {
  rejectUnauthorized: boolean;
  ca?: string;
}

export interface DbSslSettings {
  /** DB_SSL — turn TLS on. */
  enabled: boolean;
  /** DB_SSL_CA — PEM text (\n escapes allowed) or a path to a PEM file. */
  ca?: string;
  /**
   * DB_SSL_REJECT_UNAUTHORIZED — certificate verification, ON unless explicitly
   * set to false. Turning it off keeps the connection encrypted but lets anyone
   * on the network path impersonate the database.
   */
  rejectUnauthorized: boolean;
}

/** Reads the three variables from a plain env object (CLI/data-source path). */
export function dbSslFromEnv(
  env: Record<string, string | undefined>,
): DbSslSettings {
  return {
    enabled: env.DB_SSL === 'true',
    ca: env.DB_SSL_CA?.trim() ? env.DB_SSL_CA : undefined,
    rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
  };
}

/** PEM text → as is; otherwise treat the value as a file path. */
function resolveCa(ca: string): string {
  const text = ca.replace(/\\n/g, '\n');
  return text.includes('-----BEGIN') ? text : readFileSync(ca, 'utf8');
}

/**
 * The ONE place that decides how the database link is secured; the app, the
 * migration CLI and the job queue all use it, so they cannot drift apart.
 *
 *   - disabled                      → `false`
 *   - enabled                       → certificate AND host name are verified
 *                                     (public CAs work out of the box; a
 *                                      private CA is supplied via DB_SSL_CA)
 *   - enabled + explicit opt-out    → encrypted but unverified; `warn` is told
 *                                     so the choice is visible in the logs.
 */
export function buildDbSsl(
  settings: DbSslSettings,
  warn: (message: string) => void = () => undefined,
): false | DbTlsOptions {
  if (!settings.enabled) return false;
  if (!settings.rejectUnauthorized) {
    warn(
      'DB_SSL_REJECT_UNAUTHORIZED=false: the database certificate is NOT verified (encrypted, but open to impersonation). Provide DB_SSL_CA instead.',
    );
    return { rejectUnauthorized: false };
  }
  return {
    rejectUnauthorized: true,
    ...(settings.ca ? { ca: resolveCa(settings.ca) } : {}),
  };
}
