/**
 * Blog platform — editorial lifecycle (single source of truth).
 *
 *   draft ──submit──▶ in_review ──approve/publish──▶ published
 *     │                  │  └──request_changes──▶ draft
 *     ├──publish────────▶ published            (needs blog:publish)
 *     ├──schedule───────▶ scheduled ──(time)──▶ published
 *     └──archive────────▶ archived ──restore──▶ draft
 *   published ──unpublish──▶ unpublished ──republish──▶ published
 *   unpublished ──archive──▶ archived
 *
 * Only PUBLISHED posts are ever visible publicly; `scheduled` posts are
 * promoted to `published` by {@link BlogService.promoteDue} once their
 * `scheduledFor` instant has passed (never before). Editing a published post
 * never changes `publishedAt` — only `contentUpdatedAt` moves.
 */
export const BLOG_POST_STATUSES = [
  'draft',
  'in_review',
  'scheduled',
  'published',
  'unpublished',
  'archived',
] as const;
export type BlogPostStatus = (typeof BLOG_POST_STATUSES)[number];

export const BLOG_WORKFLOW_ACTIONS = [
  'submit_review',
  'request_changes',
  'publish',
  'schedule',
  'cancel_schedule',
  'unpublish',
  'archive',
  'restore',
] as const;
export type BlogWorkflowAction = (typeof BLOG_WORKFLOW_ACTIONS)[number];

interface TransitionDef {
  from: readonly BlogPostStatus[];
  to: BlogPostStatus;
  /** `blog:publish` is the editorial sign-off; everything else is `blog:manage`. */
  permission: 'blog:manage' | 'blog:publish';
}

export const BLOG_TRANSITIONS: Record<BlogWorkflowAction, TransitionDef> = {
  submit_review: {
    from: ['draft'],
    to: 'in_review',
    permission: 'blog:manage',
  },
  request_changes: {
    from: ['in_review', 'scheduled'],
    to: 'draft',
    permission: 'blog:publish',
  },
  publish: {
    from: ['draft', 'in_review', 'scheduled', 'unpublished'],
    to: 'published',
    permission: 'blog:publish',
  },
  schedule: {
    from: ['draft', 'in_review', 'scheduled', 'unpublished'],
    to: 'scheduled',
    permission: 'blog:publish',
  },
  cancel_schedule: {
    from: ['scheduled'],
    to: 'draft',
    permission: 'blog:publish',
  },
  unpublish: {
    from: ['published'],
    to: 'unpublished',
    permission: 'blog:publish',
  },
  archive: {
    from: ['draft', 'in_review', 'unpublished'],
    to: 'archived',
    permission: 'blog:manage',
  },
  restore: { from: ['archived'], to: 'draft', permission: 'blog:manage' },
};

export function canTransition(
  from: BlogPostStatus,
  action: BlogWorkflowAction,
): boolean {
  return BLOG_TRANSITIONS[action].from.includes(from);
}

/** Actions available from a status (what the editor UI may offer). */
export function availableActions(from: BlogPostStatus): BlogWorkflowAction[] {
  return BLOG_WORKFLOW_ACTIONS.filter((a) => canTransition(from, a));
}

/** Statuses a post may be hard-deleted from. A live post must be unpublished first. */
export const DELETABLE_STATUSES: readonly BlogPostStatus[] = [
  'draft',
  'in_review',
  'scheduled',
  'unpublished',
  'archived',
];

/** Statuses whose content is only reachable through the authorised preview. */
export const PRIVATE_STATUSES: readonly BlogPostStatus[] =
  BLOG_POST_STATUSES.filter((s) => s !== 'published');
