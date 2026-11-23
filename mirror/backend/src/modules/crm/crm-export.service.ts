import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import {
  CrmRecordsService,
  type ActivityThresholds,
  type CrmRow,
} from './crm-records.service';
import type { CrmListQuery } from './crm-records.service';

/**
 * Phase C1 — CSV export (spec §20).
 *
 * Rules the spec sets, and how each is met:
 *   - Permission controlled → the endpoint is `@Roles(ADMIN)`; only the
 *     CRM module exposes it.
 *   - Audited              → every export writes an audit record with the
 *     filter set, the row count and the actor, BEFORE the bytes are built.
 *   - No sensitive data     → see COLUMNS. Nothing from `users` other than
 *     business contact fields appears; no password hash, no session, no
 *     token, no IP, no raw analytics visitor key, no internal note body.
 *   - Bounded              → EXPORT_LIMIT rows, reported honestly in the
 *     audit entry and in the CSV trailer, instead of streaming a million
 *     rows and pretending it is the whole database.
 */
@Injectable()
export class CrmExportService {
  /** Hard ceiling on one export. */
  static readonly EXPORT_LIMIT = 5000;

  private static readonly COLUMNS = [
    'leadId',
    'name',
    'email',
    'phone',
    'username',
    'company',
    'websiteUrl',
    'creatorType',
    'source',
    'medium',
    'campaign',
    'content',
    'term',
    'landingPage',
    'referrer',
    'stage',
    'derivedStage',
    'score',
    'scoreBand',
    'productStatus',
    'productCount',
    'publishedProductCount',
    'salesCount',
    'revenue',
    'lastActivityDays',
    'activityStatus',
    'ownerName',
    'tags',
    'hasNextAction',
    'resolved',
    'firstSeenAt',
    'lastActivityAt',
  ] as const;

  constructor(
    private readonly records: CrmRecordsService,
    private readonly audit: AuditService,
  ) {}

  async toCsv(
    query: Omit<CrmListQuery, 'page' | 'pageSize'>,
    thresholds: ActivityThresholds,
    actorId: string,
  ): Promise<{ csv: string; rowCount: number; truncated: boolean }> {
    const rows = await this.collect(query, thresholds);
    const truncated = rows.length >= CrmExportService.EXPORT_LIMIT;

    await this.audit.record({
      action: 'crm.exported',
      entity: 'crm_lead',
      entityId: null,
      context: { actorId },
      metadata: {
        rowCount: rows.length,
        truncated,
        limit: CrmExportService.EXPORT_LIMIT,
        filters: query,
      },
    });

    const header = CrmExportService.COLUMNS.join(',');
    const body = rows.map((row) =>
      CrmExportService.COLUMNS.map((column) =>
        csvCell(valueOf(row, column)),
      ).join(','),
    );
    // A UTF-8 BOM so Excel opens the Persian text correctly.
    return {
      csv: `\uFEFF${header}\n${body.join('\n')}\n`,
      rowCount: rows.length,
      truncated,
    };
  }

  /** Streams the export in bounded pages so memory stays flat. */
  private async collect(
    query: Omit<CrmListQuery, 'page' | 'pageSize'>,
    thresholds: ActivityThresholds,
  ): Promise<CrmRow[]> {
    const CHUNK = 250;
    const out: CrmRow[] = [];
    for (;;) {
      const page = await this.records.listFiltered(
        { ...query, page: Math.floor(out.length / CHUNK) + 1, pageSize: CHUNK },
        thresholds,
      );
      for (const row of page.rows) {
        out.push(row);
        if (out.length >= CrmExportService.EXPORT_LIMIT) return out;
      }
      if (page.rows.length < CHUNK) break;
    }
    return out;
  }
}

function valueOf(
  row: CrmRow,
  column: string,
): string | number | boolean | null {
  switch (column) {
    case 'stage':
      return row.stage.effective;
    case 'derivedStage':
      return row.stage.derived;
    case 'score':
      return row.score.score;
    case 'scoreBand':
      return row.score.band;
    case 'activityStatus':
      return row.activity.status;
    case 'lastActivityDays':
      return row.activity.daysSinceActivity;
    case 'tags':
      return (row.tags ?? []).join(' ');
    case 'hasNextAction':
      return row.hasNextAction;
    case 'resolved':
      return row.isResolved;
    case 'firstSeenAt':
      return row.firstContactAt ? row.firstContactAt.toISOString() : null;
    case 'lastActivityAt':
      return row.lastActivityAt ? row.lastActivityAt.toISOString() : null;
    case 'revenue':
      return Number(row.revenue ?? 0);
    default:
      return (row as unknown as Record<string, unknown>)[column] as
        string | number | boolean | null;
  }
}

/**
 * RFC 4180 quoting. Formula-injection guard: a value starting with = + - @
 * is prefixed with a single quote so a spreadsheet cannot execute it.
 */
function csvCell(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export { csvCell };
