import { spacing } from '../constants/spacing';
import type { SpacingToken } from '../constants/spacing';

/**
 * Display density presets. Components can read `displayPresets.comfortable`
 * vs `displayPresets.compact` to tighten vertical rhythm on dense screens.
 */
export const displayPresets = {
  comfortable: {
    gap: spacing[4],
    sectionGap: spacing[6],
    controlHeight: '38px',
  },
  compact: {
    gap: spacing[2],
    sectionGap: spacing[4],
    controlHeight: '34px',
  },
} as const;

export type DisplayPreset = keyof typeof displayPresets;
export type DisplayPresetGap = SpacingToken;
