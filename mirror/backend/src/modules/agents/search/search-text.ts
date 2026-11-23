/**
 * Pure text helpers for marketplace search (M2). The normalization mirrors
 * the SQL function `mesh_normalize_text()` used to build the indexed
 * document, so a query and a document are always folded the same way:
 *   - Arabic ya / kaf / teh-marbuta / heh-yeh  → Persian ی ک ه ه
 *   - Persian + Arabic-Indic digits            → ASCII digits
 *   - ZWNJ (نیم‌فاصله)                          → space
 *   - tatweel + diacritics                      → removed
 *   - lower-case
 */

const FROM = 'يكةۀ\u200C٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹ـ';
const TO = 'یکهه 01234567890123456789';
const DIACRITICS = /[\u064B-\u0652\u0670]/g;

/** NUL and other control characters crash Postgres text params — drop them. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
export function stripControlChars(input: string): string {
  return input.replace(CONTROL_CHARS, ' ');
}

export function normalizeText(input: string | null | undefined): string {
  if (!input) return '';
  let out = '';
  for (const ch of stripControlChars(input)) {
    const index = FROM.indexOf(ch);
    if (index === -1) out += ch;
    else if (index < TO.length) out += TO[index];
  }
  return out.replace(DIACRITICS, '').toLowerCase();
}

/** Letters / digits only — everything else separates tokens. */
export function tokenize(input: string | null | undefined): string[] {
  return normalizeText(input)
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.replace(/\p{M}/gu, ''))
    .filter((token) => token.length > 0);
}

const EN_STOPWORDS = new Set(
  (
    'a an the to of for and or in on with without my me i we you your our want wants wanted ' +
    'need needs looking look find get getting that this these those is are be been can could ' +
    'should would will do does how it its from by at as into about some any please help using ' +
    'use via so if but not no yes all up out over under new best top good great'
  ).split(' '),
);

const FA_STOPWORDS = new Set(
  (
    'و در به از که را با این آن برای تا یا هم من ما شما است هست می خواهم خواهیم خواهید خوام ' +
    'میخوام میخواهم میخواهیم بتوانم بتونم کنم کنیم کنید کردن کردم شود بشه باشد باید رو ای هایی ' +
    'یک چه چی چطور چگونه بهترین خوب بهتر همه هر اگر ولی اما نه بله لطفا لطفاً کمک نیاز دارم ' +
    'دارد دارید میشه می‌شه بدون روی زیر مثل مانند'
  )
    .split(' ')
    .map((word) => normalizeText(word)),
);

export function isStopword(token: string): boolean {
  return EN_STOPWORDS.has(token) || FA_STOPWORDS.has(token);
}

const isPersian = (token: string) => /[\u0600-\u06FF]/.test(token);

const EN_SUFFIXES = [
  'ations',
  'ation',
  'izing',
  'ising',
  'ings',
  'ing',
  'ies',
  'ied',
  'ed',
  'es',
  's',
  'ly',
  'e',
];
const FA_SUFFIXES = ['های', 'ها', 'ات', 'ان', 'ی'];

/**
 * A deliberately light stemmer: strips one inflectional suffix so that the
 * stem can be used as a PREFIX (`stem:*`) — "automate", "automated",
 * "automation" all share "automat"; "پشتیبانی" / "پشتیبان" share "پشتیبان".
 * Tokens that are too short are left untouched.
 */
export function stemToken(token: string): string {
  if (/^\d+$/.test(token)) return token;
  if (isPersian(token)) {
    for (const suffix of FA_SUFFIXES) {
      if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
        return token.slice(0, -suffix.length);
      }
    }
    return token;
  }
  for (const suffix of EN_SUFFIXES) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 4) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

export interface QueryToken {
  /** Normalized token as typed. */
  raw: string;
  /** Stem used for prefix matching. */
  stem: string;
  stopword: boolean;
}

export function analyzeQuery(input: string | null | undefined): QueryToken[] {
  return tokenize(input)
    .slice(0, 16)
    .map((raw) => ({ raw, stem: stemToken(raw), stopword: isStopword(raw) }));
}
