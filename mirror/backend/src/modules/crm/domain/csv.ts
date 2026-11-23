/**
 * Phase C2 §28 — CSV parsing for lead import.
 *
 * Hand-written rather than pulled in as a dependency, and deliberately
 * boring: an RFC-4180 subset is all an admin upload needs, and a third-party
 * parser would be another thing to audit for a one-shot admin tool.
 *
 * The parser is a PURE function of the input text. It never sees a database,
 * a request or a user — everything security-relevant (size, row count, column
 * names) is decided by the caller — which makes it exhaustively testable.
 */

/** Parsed cell values keep their raw string form; typing is the caller's job. */
export type CsvRow = Record<string, string>;

export interface CsvParseResult {
  header: string[];
  rows: CsvRow[];
  /** Row numbers (1-based, header excluded) that could not be parsed. */
  errors: Array<{ row: number; message: string }>;
  /** True when a cell count did not match the header. */
  ragged: boolean;
}

/** Hard ceiling so a "CSV" that is really a 2GB binary cannot exhaust memory. */
export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 5_000;

/**
 * Splits CSV text into a header and row objects.
 *
 * Handles quoted fields, escaped quotes (`""`), embedded newlines and CRLF —
 * the cases that break a naive `split(',')` and turn a real export into
 * garbage. `delimiter` is caller-chosen so semicolon-separated European
 * exports work too.
 */
export function parseCsv(input: string, delimiter = ','): CsvParseResult {
  const errors: Array<{ row: number; message: string }> = [];
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  // A single pass character scanner: quote state has to be tracked across
  // lines, so splitting the text into lines first would corrupt any cell
  // containing a newline.
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1; // consume the escaped pair
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  // Drop a trailing blank line — every spreadsheet export ends with one and
  // counting it as a data row would show the admin a phantom error.
  const cleaned = records.filter(
    (row) => !(row.length === 1 && row[0].trim() === ''),
  );
  if (cleaned.length === 0) {
    return { header: [], rows: [], errors: [], ragged: false };
  }

  const header = cleaned[0].map((column) => column.trim().toLowerCase());
  const body = cleaned.slice(1);
  const rows: CsvRow[] = [];
  let ragged = false;

  body.forEach((cells, index) => {
    const rowNumber = index + 2; // +1 for header, +1 for 1-based
    if (cells.length !== header.length) {
      ragged = true;
      errors.push({
        row: rowNumber,
        message: `expected ${header.length} columns, found ${cells.length}`,
      });
      return;
    }
    const row: CsvRow = {};
    header.forEach((column, position) => {
      row[column] = (cells[position] ?? '').trim();
    });
    rows.push(row);
  });

  return { header, rows, errors, ragged };
}

/**
 * Escapes one cell. Needed on the way OUT too, so a lead whose company name
 * contains a comma can never corrupt a later export.
 */
export function escapeCsvCell(value: string | null | undefined): string {
  const text = value ?? '';
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
