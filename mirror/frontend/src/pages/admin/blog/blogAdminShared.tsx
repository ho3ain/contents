/* eslint-disable react-refresh/only-export-components -- shared admin helpers + StatusBadge */
import { useEffect, useState } from 'react';
import { ApiError } from '../../../api/client';
import { blogAdminApi, type BlogAccess, type BlogPostStatus, type BlogReadinessIssue, type BlogWorkflowAction } from '../../../api/blog';
import { Badge, type BadgeTone } from '../../../components/ui';
import { errorMessage } from '../../../lib/error';
import { t } from '../../../i18n';

/** Blog platform — CMS-side helpers shared by the list, editor and taxonomy pages. */

export const STATUS_TONE: Record<BlogPostStatus, BadgeTone> = {
  draft: 'neutral',
  in_review: 'info',
  scheduled: 'accent',
  published: 'success',
  unpublished: 'warning',
  archived: 'neutral',
};

export const statusLabel = (status: BlogPostStatus): string => t(`blog.status.${status}`);

export function StatusBadge({ status }: { status: BlogPostStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} data-testid={`blog-status-${status}`}>
      {statusLabel(status)}
    </Badge>
  );
}

export const actionLabel = (action: BlogWorkflowAction): string => t(`blog.action.${action}`);

/** Actions that irreversibly change what the public sees get a confirmation step. */
export const CONFIRMED_ACTIONS: ReadonlySet<BlogWorkflowAction> = new Set(['publish', 'unpublish', 'archive']);
/** Actions that accept an editorial note. */
export const NOTE_ACTIONS: ReadonlySet<BlogWorkflowAction> = new Set(['request_changes', 'unpublish', 'archive']);
/** Actions that need `blog:publish` (mirrors the server's transition table). */
export const PUBLISH_ACTIONS: ReadonlySet<BlogWorkflowAction> = new Set([
  'publish',
  'schedule',
  'cancel_schedule',
  'unpublish',
  'request_changes',
]);

export const readinessLabel = (issue: BlogReadinessIssue): string => t(`blog.readiness.${issue.code}`);

/** Access flags from `GET /admin/blog/me`; `null` while loading. */
export function useBlogAccess(): { access: BlogAccess | null; error: string | null } {
  const [access, setAccess] = useState<BlogAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    blogAdminApi
      .me()
      .then((a) => !cancelled && setAccess(a))
      .catch((e: unknown) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, []);
  return { access, error };
}

/**
 * Persian copy for the CMS API's error codes. The server messages are
 * English and deliberately specific; the mapping keeps the UI honest about
 * WHY something was refused instead of a generic failure toast.
 */
export function blogErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const msg = error.message;
    if (error.code === 'STALE_STATE') return t('blog.err.stale');
    if (error.code === 'PUBLISH_CHECKLIST_FAILED') return t('blog.err.checklist');
    if (error.code === 'INVALID_TRANSITION') return t('blog.err.transition');
    if (error.code === 'INVALID_STATE') return t('blog.err.deletePublished');
    if (error.code === 'STORAGE_DISABLED') return t('blog.err.storageDisabled');
    if (error.status === 403) return t('blog.err.forbidden');
    if (error.status === 404) return t('blog.err.notFound');
    if (/slug .* already used|is already used/i.test(msg)) return t('blog.err.slugTaken');
    if (/category named .* already exists/i.test(msg)) return t('blog.err.categoryNameTaken');
    if (/tag named .* already exists/i.test(msg)) return t('blog.err.tagNameTaken');
    if (/own parent|one level deep|parentId does not exist/i.test(msg)) return t('blog.err.parent');
    if (/own pillar|supporting article cannot be a pillar|pillarPostId/i.test(msg)) return t('blog.err.pillar');
    if (/scheduledFor/i.test(msg)) return t('blog.err.schedule');
    if (/reassignToId/i.test(msg)) return t('blog.err.reassign');
    if (/autosave/i.test(msg)) return t('blog.err.autosaveLive');
    if (error.status === 413 || /too large|file size/i.test(msg)) return t('blog.err.fileTooLarge');
    if (error.status === 415) return t('blog.err.fileType');
    if (error.status === 422 && /too_small|dimension/i.test(JSON.stringify(error.details ?? ''))) return t('blog.err.imageTooSmall');
  }
  return errorMessage(error);
}

/** Readiness issues returned inside a 422 `PUBLISH_CHECKLIST_FAILED`. */
export function checklistIssues(error: unknown): BlogReadinessIssue[] {
  if (error instanceof ApiError && error.code === 'PUBLISH_CHECKLIST_FAILED') {
    const details = error.details as { issues?: BlogReadinessIssue[] } | undefined;
    return details?.issues ?? [];
  }
  return [];
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `datetime-local` value (local time) → ISO string, or null when invalid. */
export function localToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO → `datetime-local` value in the viewer's zone. */
export function isoToLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
