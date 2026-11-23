/**
 * Share targets — pure URL builders for the ShareMenu (articles, products).
 *
 * Principles:
 *  - The shared link is the page's canonical URL, untouched: no UTM, no
 *    referrer ids, nothing that identifies the person who shared it.
 *  - Every network gets its official intent/share endpoint; the e-mail
 *    target is a plain `mailto:`.
 *  - Encoding is done once here so callers never concatenate by hand.
 */
export type ShareChannel = 'telegram' | 'whatsapp' | 'linkedin' | 'x' | 'email';

export const SHARE_CHANNELS: readonly ShareChannel[] = ['telegram', 'whatsapp', 'linkedin', 'x', 'email'];

export interface SharePayload {
  /** Absolute https URL of the page. */
  url: string;
  /** Page title (article title / product name). */
  title: string;
  /** Optional one-line summary, used where the network accepts text. */
  text?: string | null;
}

/** Brand names as the networks write them — not translated. */
export const SHARE_CHANNEL_LABELS: Record<ShareChannel, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
  x: 'X',
  email: 'Email',
};

const enc = encodeURIComponent;

function lineFor(payload: SharePayload): string {
  const summary = payload.text?.trim();
  return summary ? `${payload.title} — ${summary}` : payload.title;
}

export function shareHref(channel: ShareChannel, payload: SharePayload): string {
  switch (channel) {
    case 'telegram':
      return `https://t.me/share/url?url=${enc(payload.url)}&text=${enc(lineFor(payload))}`;
    case 'whatsapp':
      return `https://wa.me/?text=${enc(`${lineFor(payload)}\n${payload.url}`)}`;
    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?url=${enc(payload.url)}`;
    case 'x':
      return `https://x.com/intent/post?url=${enc(payload.url)}&text=${enc(payload.title)}`;
    case 'email':
      return `mailto:?subject=${enc(payload.title)}&body=${enc(`${lineFor(payload)}\n\n${payload.url}`)}`;
  }
}

/** True when the browser offers the native share sheet for this payload. */
export function canNativeShare(payload: SharePayload): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare === 'function') {
    try {
      return navigator.canShare({ url: payload.url, title: payload.title });
    } catch {
      return false;
    }
  }
  return true;
}

export interface ShareMenuLabels {
  /** Trigger text, e.g. «اشتراک‌گذاری». */
  button: string;
  /** Accessible name of the trigger when `compact` hides the text. */
  buttonAria?: string;
  menu: string;
  copy: string;
  copied: string;
  copyFailed: string;
  /** Native share sheet entry («بیشتر…»). */
  native: string;
}

export const SHARE_LABELS_FA: ShareMenuLabels = {
  button: 'اشتراک‌گذاری',
  menu: 'گزینه‌های اشتراک‌گذاری',
  copy: 'کپی لینک',
  copied: 'لینک کپی شد',
  copyFailed: 'کپی لینک ممکن نشد',
  native: 'بیشتر…',
};
