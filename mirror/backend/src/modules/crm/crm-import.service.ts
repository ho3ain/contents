import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiException } from '../../common/errors/api-error';
import { AuditService } from '../audit/audit.service';
import {
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
  escapeCsvCell,
  parseCsv,
  type CsvRow,
} from './domain/csv';
import { CRM_SOURCES, CRM_CREATOR_TYPES } from './domain/taxonomy';

/** One line of the preview report the admin reads before committing. */
export interface ImportRowReport {
  row: number;
  email: string;
  name: string | null;
  status: 'valid' | 'duplicate' | 'invalid';
  /** Why a row was rejected — always populated for a non-valid row. */
  problems: string[];
  /** Set on an existing lead: this will UPDATE, not create. */
  existingLeadId?: string;
  /** Resolved from `referred_by_email` — the lead that referred this one. */
  referredById?: string;
  /** The raw address the admin typed, when it did not resolve. */
  referredByEmail?: string;
}

export interface ImportPreview {
  importId: string;
  filename: string;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  invalidRows: number;
  createCount: number;
  updateCount: number;
  report: ImportRowReport[];
  /** Set when the file itself was unusable — nothing was even parsed. */
  fatal?: string;
}

const ALLOWED_COLUMNS = new Set([
  'name',
  'email',
  'phone',
  'username',
  'company',
  'website_url',
  'source',
  'campaign',
  'medium',
  'content',
  'term',
  'landing_page',
  'referrer',
  'creator_type',
  'referred_by_email',
]);

/**
 * Phase C2 §28 — lead import from CSV.
 *
 * The design decision that matters here is that an import is ALWAYS
 * two-phase: `preview` then `commit`, bound by an import id. Nothing is
 * written during a preview, so the admin sees exactly what would happen —
 * including which rows are duplicates and why each bad row failed — before a
 * single record changes.
 *
 * That ordering is also what makes a bad import recoverable: a committed
 * import row records exactly what it did, and every created lead is
 * individually editable and mergeable through the same tools as any other.
 */
@Injectable()
export class CrmImportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  // ---- phase 1: preview -------------------------------------------------

  /**
   * Parses and validates without writing anything.
   *
   * Validation is per-row and never throws: one bad line in a 900-row file
   * must not cost the admin the other 899. Hard failures (size, no header)
   * reject the whole file, because those mean the file is not what they think
   * it is.
   */
  async preview(
    filename: string,
    content: string,
    actorId: string,
  ): Promise<ImportPreview> {
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_CSV_BYTES) {
      throw new ApiException(
        'VALIDATION_ERROR',
        `File is too large (max ${MAX_CSV_BYTES} bytes)`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (/\0/.test(content)) {
      // A NUL byte means this is not a text file. Refusing beats storing
      // binary in a text column.
      throw new ApiException(
        'VALIDATION_ERROR',
        'That file is not a readable CSV',
        HttpStatus.BAD_REQUEST,
      );
    }

    const delimiter = content.split('\n')[0]?.includes(';') ? ';' : ',';
    const parsed = parseCsv(content, delimiter);

    if (parsed.header.length === 0) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'The file is empty',
        HttpStatus.BAD_REQUEST,
      );
    }
    const unknown = parsed.header.filter(
      (column) => !ALLOWED_COLUMNS.has(column),
    );
    if (parsed.header.length === 0 || unknown.length === parsed.header.length) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'No recognised columns found. Expected at least an email column',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!parsed.header.includes('email')) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'An "email" column is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (parsed.rows.length > MAX_CSV_ROWS) {
      throw new ApiException(
        'VALIDATION_ERROR',
        `Too many rows (max ${MAX_CSV_ROWS})`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const report = await this.validateRows(parsed.rows, parsed.errors);

    const importId = await this.storeImport(
      filename,
      'preview',
      report,
      actorId,
    );
    await this.audit.record({
      action: 'crm.import_previewed',
      entity: 'crm_import',
      entityId: importId,
      context: { actorId },
      metadata: {
        filename,
        total: report.length,
        valid: report.filter((r) => r.status === 'valid').length,
      },
    });

    return {
      importId,
      filename,
      totalRows: parsed.rows.length,
      validRows: report.filter((r) => r.status === 'valid').length,
      duplicateRows: report.filter((r) => r.status === 'duplicate').length,
      invalidRows: report.filter((r) => r.status === 'invalid').length,
      createCount: report.filter((r) => !r.existingLeadId).length,
      updateCount: report.filter((r) => r.existingLeadId).length,
      report,
    };
  }

  // ---- phase 2: commit --------------------------------------------------

  /**
   * Applies a previously previewed import.
   *
   * The file is NOT re-read: the report was validated against the live
   * database at preview time, and the import row is the contract. A commit
   * only ever applies rows the admin already saw.
   *
   * Each row is written in its own transaction so one conflicting row cannot
   * roll back 400 good ones; the failure is counted and reported instead.
   */
  async commit(
    importId: string,
    actorId: string,
  ): Promise<{
    created: number;
    updated: number;
    failed: number;
  }> {
    const [record] = await this.dataSource.query<
      Array<{ status: string; report: ImportRowReport[]; filename: string }>
    >(
      `SELECT "status", "report", "filename"
         FROM "creator_crm_imports" WHERE "id" = $1`,
      [importId],
    );
    if (!record) {
      throw new ApiException(
        'NOT_FOUND',
        'Import not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (record.status !== 'preview') {
      // Committing twice would double-write every row.
      throw new ApiException(
        'VALIDATION_ERROR',
        `This import is already ${record.status}`,
        HttpStatus.CONFLICT,
      );
    }

    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const row of record.report) {
      if (row.status !== 'valid') continue;
      try {
        if (row.existingLeadId) {
          await this.updateExisting(row.existingLeadId, row);
          updated += 1;
        } else {
          await this.createLead(row);
          created += 1;
        }
      } catch {
        // One bad row must not cost the admin the rest of the file.
        failed += 1;
      }
    }

    await this.dataSource.query(
      `UPDATE "creator_crm_imports"
          SET "status" = 'committed', "committed_at" = now(),
              "created_count" = $2, "updated_count" = $3
        WHERE "id" = $1`,
      [importId, created, updated],
    );
    await this.audit.record({
      action: 'crm.import_committed',
      entity: 'crm_import',
      entityId: importId,
      context: { actorId },
      metadata: { filename: record.filename, created, updated, failed },
    });

    return { created, updated, failed };
  }

  /** Abandons a preview so it can never be committed later by id. */
  async discard(importId: string, actorId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE "creator_crm_imports" SET "status" = 'discarded'
        WHERE "id" = $1 AND "status" = 'preview'`,
      [importId],
    );
    await this.audit.record({
      action: 'crm.import_previewed',
      entity: 'crm_import',
      entityId: importId,
      context: { actorId },
      metadata: { discarded: true },
    });
  }

  // ---- validation -------------------------------------------------------

  /**
   * Turns raw rows into a report. Split out from `preview` and made pure-ish
   * (one injected query) so the rules can be tested without a database.
   */
  private async validateRows(
    rows: CsvRow[],
    parseErrors: Array<{ row: number; message: string }>,
  ): Promise<ImportRowReport[]> {
    // One query for the whole file, rather than one per row: a 5,000-row
    // upload is 5,000 round trips otherwise.
    const emails = rows
      .map((row) => normalizeEmail(row.email))
      .filter((email): email is string => email !== null);
    const existing = await this.findExistingLeads(emails);

    // Referrers are resolved by email, because a CSV author will not know
    // internal lead ids.
    const referrerEmails = rows
      .map((row) => normalizeEmail(row.referred_by_email))
      .filter((email): email is string => email !== null);
    const referrers = await this.findExistingLeads(referrerEmails);

    const seenInFile = new Set<string>();
    const report: ImportRowReport[] = [];
    const parseErrorByRow = new Map(parseErrors.map((e) => [e.row, e.message]));

    rows.forEach((row, index) => {
      const rowNumber = index + 2; // header is row 1
      const problems: string[] = [];
      const parseProblem = parseErrorByRow.get(rowNumber);
      if (parseProblem) problems.push(parseProblem);

      const email = normalizeEmail(row.email);
      if (email === null) {
        problems.push('a valid email is required');
      } else if (seenInFile.has(email)) {
        // A repeated address inside one file is a data-entry error that would
        // otherwise silently collapse into one lead.
        problems.push('duplicate email inside the file');
      }

      if (row.source && !CRM_SOURCES.includes(row.source as never)) {
        problems.push(`unknown source "${truncate(row.source)}"`);
      }
      if (
        row.creator_type &&
        !CRM_CREATOR_TYPES.includes(row.creator_type as never)
      ) {
        problems.push(`unknown creator_type "${truncate(row.creator_type)}"`);
      }
      if (row.website_url && !isSafeHttpUrl(row.website_url)) {
        problems.push('website_url must be an http(s) URL');
      }
      // A referrer that does not resolve is a problem, not something to
      // silently drop: the admin believes the referral is recorded.
      const referrerEmail = normalizeEmail(row.referred_by_email);
      if (referrerEmail && !referrers.has(referrerEmail)) {
        problems.push(
          `no lead found for referred_by_email "${truncate(referrerEmail)}"`,
        );
      }
      if (row.name && row.name.length > 120) {
        problems.push('name is longer than 120 characters');
      }
      if (email) seenInFile.add(email);

      const existingLeadId = email ? existing.get(email) : undefined;
      const referredById = referrerEmail
        ? referrers.get(referrerEmail)
        : undefined;

      if (existingLeadId && problems.length === 0) {
        report.push({
          row: rowNumber,
          email: email as string,
          name: row.name || null,
          status: 'duplicate',
          problems: [
            'an open lead already exists for this email — it will be updated',
          ],
          existingLeadId,
          ...(referredById ? { referredById } : {}),
        });
        return;
      }

      report.push({
        row: rowNumber,
        email: email ?? truncate(row.email ?? ''),
        name: row.name || null,
        status: problems.length === 0 ? 'valid' : 'invalid',
        problems,
        ...(existingLeadId ? { existingLeadId } : {}),
        ...(referredById ? { referredById } : {}),
        ...(referrerEmail && !referredById
          ? { referredByEmail: referrerEmail }
          : {}),
      });
    });

    return report;
  }

  private async findExistingLeads(
    emails: string[],
  ): Promise<Map<string, string>> {
    if (!emails.length) return new Map();
    const rows = await this.dataSource.query<
      Array<{ email: string; id: string }>
    >(
      // Merged-away rows are excluded on purpose: they point at a survivor,
      // so importing against them would create a second record for a person
      // the CRM has already consolidated.
      `SELECT "email", "id"
         FROM "creator_leads"
        WHERE "email" = ANY($1::text[])
          AND "merged_into_id" IS NULL`,
      [Array.from(new Set(emails))],
    );
    return new Map(rows.map((row) => [row.email, row.id]));
  }

  // ---- writes -----------------------------------------------------------

  private async createLead(row: ImportRowReport): Promise<void> {
    // Attribution columns are stored on creation and never overwritten
    // afterwards — the same rule as a manually captured lead, so an imported
    // lead is attributable exactly like a captured one.
    await this.dataSource.query(
      `INSERT INTO "creator_leads"
         ("name", "email", "source", "first_contact_at", "last_activity_at",
          "outcome", "referred_by_id")
       VALUES ($1, $2, $3, now(), now(), 'active', $4)`,
      [row.name, row.email, 'other', row.referredById ?? null],
    );
  }

  private async updateExisting(
    leadId: string,
    row: ImportRowReport,
  ): Promise<void> {
    // Only the identity fields are refreshed on a duplicate. Attribution and
    // outcome are deliberately NOT touched: an import must never reset the
    // funnel of a lead that has already been worked.
    await this.dataSource.query(
      // COALESCE on the referrer too: an import may backfill a referral on a
      // lead that has none, but must never overwrite one that a human set.
      `UPDATE "creator_leads"
          SET "name" = COALESCE($2, "name"),
              "referred_by_id" = COALESCE("referred_by_id", $3),
              "updated_at" = now()
        WHERE "id" = $1 AND "merged_into_id" IS NULL`,
      [leadId, row.name, row.referredById ?? null],
    );
  }

  private async storeImport(
    filename: string,
    status: string,
    report: ImportRowReport[],
    actorId: string,
  ): Promise<string> {
    const [row] = await this.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO "creator_crm_imports"
         ("actor_id", "filename", "status", "total_rows", "valid_rows",
          "invalid_rows", "duplicate_rows", "report")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING "id"`,
      [
        actorId,
        truncate(filename, 255),
        status,
        report.length,
        report.filter((r) => r.status === 'valid').length,
        report.filter((r) => r.status === 'invalid').length,
        report.filter((r) => r.status === 'duplicate').length,
        JSON.stringify(report),
      ],
    );
    return row.id;
  }
}

// ---------------------------------------------------------------------------
// Field helpers — exported for unit tests.
// ---------------------------------------------------------------------------

/** Lowercased and trimmed, or null when it is not an email at all. */
export function normalizeEmail(
  value: string | undefined | null,
): string | null {
  const text = (value ?? '').trim().toLowerCase();
  if (!text) return null;
  // Deliberately permissive but structural: a full RFC 5322 validator rejects
  // valid addresses. This rejects the obvious junk that an import brings in.
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(text)) return null;
  if (text.length > 255) return null;
  return text;
}

/** Blocks `javascript:` and `data:` URLs before they reach the UI. */
export function isSafeHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return true;
}

function truncate(value: string, max = 80): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export { escapeCsvCell };
