import type { IconName } from '../ui/AppIcon';

/** Iconography for the toast system, keyed by toast kind (typed icon names, rendered by `<Toast>`). */
export const toastIcons = {
  success: 'checkCircle',
  error: 'alertCircle',
  info: 'info',
} as const satisfies Record<string, IconName>;

export type ToastKind = keyof typeof toastIcons;
