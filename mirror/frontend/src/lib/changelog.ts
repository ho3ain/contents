/**
 * Gap closure (P8) — buyer-facing release notes + freshness helpers.
 *
 * The server decides what is true (versions, publish dates, freshness —
 * backend `agents/product-freshness.ts`); this module only turns those facts
 * into copy and converts the editor's textarea lines to/from the API shape.
 */
import type { AgentChangelog, ReleaseInfo } from '../api/types';
import { CHANGELOG_LIMITS } from '../api/types';
import { t } from '../i18n';
import { formatCount } from './format';

export const CHANGELOG_SECTIONS = ['major', 'improvements', 'fixes'] as const;
export type ChangelogSection = (typeof CHANGELOG_SECTIONS)[number];

/** True when a changelog carries at least one visible line. */
export function hasChangelog(changelog: AgentChangelog | null | undefined): changelog is AgentChangelog {
  if (!changelog) return false;
  return Boolean(
    changelog.whatsNew?.trim() ||
      changelog.major?.length ||
      changelog.improvements?.length ||
      changelog.fixes?.length ||
      changelog.actionRequired?.trim(),
  );
}

/**
 * «تازه منتشر شده» / «به‌روزرسانی شده X روز پیش» — only when the server
 * says the product is fresh; null otherwise (no badge, never invented).
 */
export function freshnessText(release: ReleaseInfo | null | undefined): string | null {
  const freshness = release?.freshness;
  if (!freshness) return null;
  if (freshness.kind === 'new') return t('changelog.fresh.new');
  if (freshness.days <= 0) return t('changelog.fresh.updatedToday');
  return t('changelog.fresh.updated', { days: formatCount(freshness.days) });
}

/** Editor form: one textarea per list, one item per line. */
export interface ChangelogForm {
  whatsNew: string;
  major: string;
  improvements: string;
  fixes: string;
  /** what the buyer must DO after updating (Sprint 2). */
  actionRequired: string;
}

export function changelogToForm(changelog: AgentChangelog | null | undefined): ChangelogForm {
  return {
    whatsNew: changelog?.whatsNew ?? '',
    major: (changelog?.major ?? []).join('\n'),
    improvements: (changelog?.improvements ?? []).join('\n'),
    fixes: (changelog?.fixes ?? []).join('\n'),
    actionRequired: changelog?.actionRequired ?? '',
  };
}

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean);
}

export function formToChangelog(form: ChangelogForm): AgentChangelog {
  const actionRequired = form.actionRequired.trim();
  return {
    whatsNew: form.whatsNew.trim(),
    major: lines(form.major),
    improvements: lines(form.improvements),
    fixes: lines(form.fixes),
    ...(actionRequired ? { actionRequired } : {}),
  };
}

/** Client-side mirror of the server limits (the server re-validates). */
export function changelogErrors(form: ChangelogForm): Partial<Record<keyof ChangelogForm, string>> {
  const errors: Partial<Record<keyof ChangelogForm, string>> = {};
  if (form.whatsNew.trim().length > CHANGELOG_LIMITS.whatsNew) {
    errors.whatsNew = t('changelog.error.tooLong', { max: formatCount(CHANGELOG_LIMITS.whatsNew) });
  }
  if (form.actionRequired.trim().length > CHANGELOG_LIMITS.actionRequired) {
    errors.actionRequired = t('changelog.error.tooLong', { max: formatCount(CHANGELOG_LIMITS.actionRequired) });
  }
  for (const section of CHANGELOG_SECTIONS) {
    const items = lines(form[section]);
    if (items.length > CHANGELOG_LIMITS[section]) {
      errors[section] = t('changelog.error.tooMany', { max: formatCount(CHANGELOG_LIMITS[section]) });
    } else if (items.some((item) => item.length > CHANGELOG_LIMITS.item)) {
      errors[section] = t('changelog.error.itemTooLong', { max: formatCount(CHANGELOG_LIMITS.item) });
    }
  }
  return errors;
}
