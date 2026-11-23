/**
 * Defence in depth for every link built from stored data.
 *
 * The API accepts only absolute http(s) URLs, but a link is rendered from
 * whatever is in the database (older rows, imported CSVs, admin-entered
 * values). `href="javascript:…"` would run script on click, so a value is
 * linkable only when it parses as an absolute http(s) URL.
 *
 * Returns the normalized URL, or `null` when the value must NOT become a
 * link (callers then show nothing or plain text).
 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || hasControlCharacter(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username !== '' || url.password !== '') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}
