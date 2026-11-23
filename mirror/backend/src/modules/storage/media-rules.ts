import type { MediaKind } from '../../database/entities/platform/media-asset.entity';

/**
 * Gap closure — per-kind upload rules (single source of truth, also served
 * to the frontend through GET storage/capabilities).
 */
export interface MediaRule {
  maxBytes: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  /** Allowed width ÷ height range. */
  minRatio: number;
  maxRatio: number;
}

export const MEDIA_RULES: Record<MediaKind, MediaRule> = {
  logo: {
    maxBytes: 1024 * 1024,
    minWidth: 128,
    minHeight: 128,
    maxWidth: 2048,
    maxHeight: 2048,
    minRatio: 0.8,
    maxRatio: 1.25,
  },
  cover: {
    maxBytes: 3 * 1024 * 1024,
    minWidth: 800,
    minHeight: 400,
    maxWidth: 4096,
    maxHeight: 4096,
    minRatio: 1.3,
    maxRatio: 3,
  },
  screenshot: {
    maxBytes: 3 * 1024 * 1024,
    minWidth: 640,
    minHeight: 360,
    maxWidth: 4096,
    maxHeight: 4096,
    minRatio: 0.4,
    maxRatio: 3,
  },
  /**
   * A profile picture is rendered as a circle/square at 40–96px, so the floor
   * is low enough that a real photo passes, and the ratio band keeps it
   * square-ish — a 5:1 banner would be cropped to a sliver.
   */
  avatar: {
    maxBytes: 1024 * 1024,
    minWidth: 96,
    minHeight: 96,
    maxWidth: 2048,
    maxHeight: 2048,
    minRatio: 0.8,
    maxRatio: 1.25,
  },
  /**
   * Blog article images: featured images are rendered ~1200px wide (16:9 to
   * 3:1 hero band) and inline figures at content width, so the floor is a
   * readable 480×270 and the ratio band spans portrait charts to wide banners.
   */
  blog: {
    maxBytes: 3 * 1024 * 1024,
    minWidth: 480,
    minHeight: 270,
    maxWidth: 4096,
    maxHeight: 4096,
    minRatio: 0.5,
    maxRatio: 3.2,
  },
};

export const MEDIA_MAX_BYTES = Math.max(
  ...Object.values(MEDIA_RULES).map((rule) => rule.maxBytes),
);

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export type MediaViolation =
  | { code: 'too_large'; maxBytes: number }
  | { code: 'too_small'; minWidth: number; minHeight: number }
  | { code: 'too_big_dimensions'; maxWidth: number; maxHeight: number }
  | { code: 'bad_ratio'; minRatio: number; maxRatio: number };

/** First violated rule for an already-sniffed image, or null. */
export function checkMedia(
  kind: MediaKind,
  size: number,
  width: number,
  height: number,
): MediaViolation | null {
  const rule = MEDIA_RULES[kind];
  if (size > rule.maxBytes)
    return { code: 'too_large', maxBytes: rule.maxBytes };
  if (width < rule.minWidth || height < rule.minHeight) {
    return {
      code: 'too_small',
      minWidth: rule.minWidth,
      minHeight: rule.minHeight,
    };
  }
  if (width > rule.maxWidth || height > rule.maxHeight) {
    return {
      code: 'too_big_dimensions',
      maxWidth: rule.maxWidth,
      maxHeight: rule.maxHeight,
    };
  }
  const ratio = width / height;
  if (ratio < rule.minRatio || ratio > rule.maxRatio) {
    return {
      code: 'bad_ratio',
      minRatio: rule.minRatio,
      maxRatio: rule.maxRatio,
    };
  }
  return null;
}
