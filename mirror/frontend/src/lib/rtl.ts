/** Direction helpers for RTL-first (Persian) layouts. */

export type TextDirection = 'rtl' | 'ltr';

export function setDocumentDirection(dir: TextDirection): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dir = dir;
  }
}

export function getDocumentDirection(): TextDirection {
  if (typeof document === 'undefined') return 'ltr';
  return document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
}

export function isRtl(): boolean {
  return getDocumentDirection() === 'rtl';
}
