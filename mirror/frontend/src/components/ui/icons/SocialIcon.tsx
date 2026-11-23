import type { CSSProperties } from 'react';
import type { IconType } from 'react-icons';
import { SiAparat, SiInstagram, SiTelegram, SiWhatsapp, SiYoutube } from 'react-icons/si';
import type { SocialNetwork } from '../../../content/social-links';

/**
 * Brand marks for the website footer. Third-party logos are the one place
 * the MESH icon system does not draw its own glyph: a social network is
 * recognised by its official mark, not by a reinterpretation. The marks come
 * from Simple Icons (CC0) through the already-installed `react-icons/si`
 * pack — no new dependency. LinkedIn is not distributed by Simple Icons, so
 * its "in" wordmark is drawn here on the same 24-px grid.
 *
 * Decorative by default: the accessible name belongs to the link.
 */
const BRAND_MARKS: Record<Exclude<SocialNetwork, 'linkedin'>, IconType> = {
  telegram: SiTelegram,
  instagram: SiInstagram,
  whatsapp: SiWhatsapp,
  youtube: SiYoutube,
  aparat: SiAparat,
};

function LinkedInMark({ size, className, style }: { size: number; className?: string; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM2.9 9.75h4.15V21H2.9zM9.35 9.75h3.98v1.54h.06c.55-1.05 1.9-2.15 3.92-2.15 4.19 0 4.96 2.76 4.96 6.35V21h-4.14v-4.88c0-1.17-.02-2.66-1.62-2.66-1.63 0-1.88 1.27-1.88 2.58V21H9.35z" />
    </svg>
  );
}

export interface SocialIconProps {
  network: SocialNetwork;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function SocialIcon({ network, size = 18, className, style }: SocialIconProps) {
  const cls = ['social-icon', `social-icon--${network}`, className].filter(Boolean).join(' ');
  if (network === 'linkedin') return <LinkedInMark size={size} className={cls} style={style} />;
  const Mark = BRAND_MARKS[network];
  return <Mark size={size} className={cls} style={style} aria-hidden="true" focusable="false" data-icon={network} />;
}
