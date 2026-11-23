/**
 * MESH social profiles shown in the website footer.
 *
 * Operator-owned content: fill `href` with the real public profile URL of
 * each network (https://… or https://wa.me/…). An entry whose `href` is
 * empty is still shown — the brand decided which networks exist — but its
 * icon routes to the contact page instead of a dead link, and its accessible
 * name says so. Order here is display order.
 */
export type SocialNetwork = 'telegram' | 'instagram' | 'whatsapp' | 'linkedin' | 'youtube' | 'aparat';

export interface SocialLink {
  readonly id: SocialNetwork;
  /** Brand name as written by the network itself (not translated). */
  readonly label: string;
  /** Public profile URL; empty until the account is published. */
  readonly href: string;
}

export const SOCIAL_LINKS: readonly SocialLink[] = [
  { id: 'telegram', label: 'Telegram', href: '' },
  { id: 'instagram', label: 'Instagram', href: '' },
  { id: 'whatsapp', label: 'WhatsApp', href: '' },
  { id: 'linkedin', label: 'LinkedIn', href: '' },
  { id: 'youtube', label: 'YouTube', href: '' },
  { id: 'aparat', label: 'Aparat', href: '' },
];

/** Only absolute https URLs are accepted as a published profile. */
export function publishedSocialHref(link: SocialLink): string | null {
  const href = link.href.trim();
  return /^https:\/\/[^\s]+$/i.test(href) ? href : null;
}
