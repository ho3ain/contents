/**
 * Multiavatar avatar system — deterministic, local SVG generation.
 *
 * The public Multiavatar HTTP API has been retired, so generation runs in the
 * browser through the official Multiavatar library (no external request and no
 * user name/email sent to a third party). The old persisted avatar IDs remain
 * valid; they now map to a curated set of friendly, human character designs.
 */
// Import from the package root rather than the "/esm" subpath: the subpath
// only exists in >=1.0.6 of @multiavatar/multiavatar, and stale node_modules
// (or a missing install) made Vite fail with "Failed to resolve import".
// The root entry resolves for every published version and Vite/Vitest handle
// the CJS interop transparently.
import multiavatar from '@multiavatar/multiavatar';

export type AvatarTheme = 'A' | 'B' | 'C';

export interface AvatarOption {
  /** Stable ID stored by the backend; keep existing IDs for compatibility. */
  id: string;
  label: string;
  /** Stable input string used by Multiavatar. */
  seed: string;
  /** Curated Multiavatar human character, 01–15. */
  part: string;
  theme: AvatarTheme;
}

export interface BackgroundOption {
  id: string;
  label: string;
  color: string;
}

/**
 * The set intentionally excludes robots, monsters, masks and abstract styles.
 * Multiavatar's curated human characters and three color themes are used to
 * keep every selectable face friendly, expressive and recognisably human.
 */
export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'av-1', label: 'آواتار ۱', seed: 'mesh-human-01-A', part: '01', theme: 'A' },
  { id: 'av-2', label: 'آواتار ۲', seed: 'mesh-human-01-B', part: '01', theme: 'B' },
  { id: 'av-3', label: 'آواتار ۳', seed: 'mesh-human-01-C', part: '01', theme: 'C' },
  { id: 'av-4', label: 'آواتار ۴', seed: 'mesh-human-02-A', part: '02', theme: 'A' },
  { id: 'av-5', label: 'آواتار ۵', seed: 'mesh-human-02-B', part: '02', theme: 'B' },
  { id: 'av-6', label: 'آواتار ۶', seed: 'mesh-human-02-C', part: '02', theme: 'C' },
  { id: 'lo-1', label: 'آواتار ۷', seed: 'mesh-human-04-A', part: '04', theme: 'A' },
  { id: 'lo-2', label: 'آواتار ۸', seed: 'mesh-human-04-B', part: '04', theme: 'B' },
  { id: 'lo-3', label: 'آواتار ۹', seed: 'mesh-human-04-C', part: '04', theme: 'C' },
  { id: 'lo-4', label: 'آواتار ۱۰', seed: 'mesh-human-05-A', part: '05', theme: 'A' },
  { id: 'lo-5', label: 'آواتار ۱۱', seed: 'mesh-human-05-B', part: '05', theme: 'B' },
  { id: 'lo-6', label: 'آواتار ۱۲', seed: 'mesh-human-05-C', part: '05', theme: 'C' },
  { id: 'bo-1', label: 'آواتار ۱۳', seed: 'mesh-human-06-A', part: '06', theme: 'A' },
  { id: 'bo-2', label: 'آواتار ۱۴', seed: 'mesh-human-06-B', part: '06', theme: 'B' },
  { id: 'bo-3', label: 'آواتار ۱۵', seed: 'mesh-human-06-C', part: '06', theme: 'C' },
  { id: 'bo-4', label: 'آواتار ۱۶', seed: 'mesh-human-08-A', part: '08', theme: 'A' },
  { id: 'bo-5', label: 'آواتار ۱۷', seed: 'mesh-human-08-B', part: '08', theme: 'B' },
  { id: 'bo-6', label: 'آواتار ۱۸', seed: 'mesh-human-08-C', part: '08', theme: 'C' },
  { id: 'px-1', label: 'آواتار ۱۹', seed: 'mesh-human-11-A', part: '11', theme: 'A' },
  { id: 'px-2', label: 'آواتار ۲۰', seed: 'mesh-human-11-B', part: '11', theme: 'B' },
  { id: 'px-3', label: 'آواتار ۲۱', seed: 'mesh-human-11-C', part: '11', theme: 'C' },
  { id: 'px-4', label: 'آواتار ۲۲', seed: 'mesh-human-12-A', part: '12', theme: 'A' },
  { id: 'px-5', label: 'آواتار ۲۳', seed: 'mesh-human-12-B', part: '12', theme: 'B' },
  { id: 'th-1', label: 'آواتار ۲۴', seed: 'mesh-human-12-C', part: '12', theme: 'C' },
  { id: 'th-2', label: 'آواتار ۲۵', seed: 'mesh-human-13-A', part: '13', theme: 'A' },
  { id: 'th-3', label: 'آواتار ۲۶', seed: 'mesh-human-13-B', part: '13', theme: 'B' },
  { id: 'ic-1', label: 'آواتار ۲۷', seed: 'mesh-human-13-C', part: '13', theme: 'C' },
  { id: 'ic-2', label: 'آواتار ۲۸', seed: 'mesh-human-14-A', part: '14', theme: 'A' },
  { id: 'ic-3', label: 'آواتار ۲۹', seed: 'mesh-human-14-B', part: '14', theme: 'B' },
  { id: 'ic-4', label: 'آواتار ۳۰', seed: 'mesh-human-14-C', part: '14', theme: 'C' },
];

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { id: 'bg-blue', label: 'آبی', color: '#dbeafe' },
  { id: 'bg-rose', label: 'صورتی', color: '#ffe4e6' },
  { id: 'bg-emerald', label: 'سبز', color: '#d1fae5' },
  { id: 'bg-amber', label: 'نارنجی', color: '#fef3c7' },
  { id: 'bg-violet', label: 'بنفش', color: '#ede9fe' },
  { id: 'bg-cyan', label: 'فیروزه‌ای', color: '#cffafe' },
  { id: 'bg-slate', label: 'خاکستری', color: '#e2e8f0' },
  { id: 'bg-fuchsia', label: 'ارغوانی', color: '#fae8ff' },
  { id: 'bg-lime', label: 'لیمویی', color: '#ecfccb' },
  { id: 'bg-sky', label: 'آسمانی', color: '#e0f2fe' },
];

const DEFAULT_BACKGROUND = '#d1fae5';

/** Generate one curated Multiavatar SVG from an avatar option. */
export function avatarSvg(option: AvatarOption): string {
  return multiavatar(option.seed, true, { part: option.part, theme: option.theme });
}

/** SVG data URI for use in <img src>. */
export function avatarDataUri(option: AvatarOption, size = 64): string {
  // SVGs scale to their rendered box; retain the old parameter for API
  // compatibility with picker/avatar call sites without raster sizing.
  void size;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(option))}`;
}

/** Look up an avatar option by its persisted ID. */
export function findAvatar(avatarId: string | null | undefined): AvatarOption | null {
  if (!avatarId) return null;
  return AVATAR_OPTIONS.find((avatar) => avatar.id === avatarId) ?? null;
}

/** Return a stable, human-only avatar for a user with no saved selection. */
export function avatarForIdentity(avatarId?: string | null, identity?: string | null): AvatarOption {
  const saved = findAvatar(avatarId);
  if (saved) return saved;

  const normalized = (identity ?? 'mesh-member').trim().toLowerCase() || 'mesh-member';
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return AVATAR_OPTIONS[(hash >>> 0) % AVATAR_OPTIONS.length];
}

export function avatarDataUriForIdentity(
  avatarId?: string | null,
  identity?: string | null,
  size = 64,
): string {
  return avatarDataUri(avatarForIdentity(avatarId, identity), size);
}

/** Look up a stored background color, falling back to a success-green wash. */
export function findBgColor(bgId: string | null | undefined): string {
  if (!bgId) return DEFAULT_BACKGROUND;
  return BACKGROUND_OPTIONS.find((background) => background.id === bgId)?.color ?? DEFAULT_BACKGROUND;
}

/** Default avatar/background used by newly created account settings. */
export const DEFAULT_AVATAR_ID = 'av-1';
export const DEFAULT_BG_ID = 'bg-emerald';
