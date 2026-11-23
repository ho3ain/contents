import { useMemo } from 'react';
import { avatarDataUri, avatarForIdentity, findBgColor } from '../../lib/avatar';

export interface UserAvatarProps {
  /** Persisted Multiavatar ID; previous IDs remain supported. */
  avatarId?: string | null;
  /** Background color token from the user profile. */
  avatarBg?: string | null;
  /** Stable identity fallback when no avatar has been selected yet. */
  username?: string | null;
  /** Size in pixels (default 36). */
  size?: number;
  /** Additional CSS class. */
  className?: string;
  /** Accessibility label. */
  ariaLabel?: string;
}

export function UserAvatar({
  avatarId,
  avatarBg,
  username,
  size = 36,
  className,
  ariaLabel,
}: UserAvatarProps) {
  const avatar = useMemo(
    () => avatarForIdentity(avatarId, username),
    [avatarId, username],
  );
  const background = findBgColor(avatarBg);
  const src = useMemo(() => avatarDataUri(avatar, size * 2), [avatar, size]);

  return (
    <span
      className={`user-avatar${className ? ` ${className}` : ''}`}
      data-avatar-option={avatar.id}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: background,
        overflow: 'hidden',
        flexShrink: 0,
        border: '2px solid var(--border)',
      }}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
    >
      <img
        src={src}
        alt=""
        aria-hidden="true"
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </span>
  );
}
