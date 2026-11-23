import {
  BLOG_POST_STATUSES,
  BLOG_TRANSITIONS,
  BLOG_WORKFLOW_ACTIONS,
  DELETABLE_STATUSES,
  PRIVATE_STATUSES,
  availableActions,
  canTransition,
} from './blog-status';

describe('blog workflow state machine', () => {
  it('only published is public; a live article can never be deleted directly', () => {
    expect(PRIVATE_STATUSES).toEqual([
      'draft',
      'in_review',
      'scheduled',
      'unpublished',
      'archived',
    ]);
    expect(DELETABLE_STATUSES).not.toContain('published');
  });

  it('every action has at least one source and a target different from every source', () => {
    for (const action of BLOG_WORKFLOW_ACTIONS) {
      const def = BLOG_TRANSITIONS[action];
      expect(def.from.length).toBeGreaterThan(0);
      // re-scheduling a scheduled article is the one legitimate self-transition
      if (action !== 'schedule') expect(def.from).not.toContain(def.to);
      expect(BLOG_POST_STATUSES).toContain(def.to);
    }
  });

  it('publish/schedule/unpublish/request_changes need editorial sign-off (blog:publish)', () => {
    for (const a of [
      'publish',
      'schedule',
      'unpublish',
      'request_changes',
      'cancel_schedule',
    ] as const) {
      expect(BLOG_TRANSITIONS[a].permission).toBe('blog:publish');
    }
    for (const a of ['submit_review', 'archive', 'restore'] as const) {
      expect(BLOG_TRANSITIONS[a].permission).toBe('blog:manage');
    }
  });

  it('exposes the expected actions per status', () => {
    expect(availableActions('draft')).toEqual([
      'submit_review',
      'publish',
      'schedule',
      'archive',
    ]);
    expect(availableActions('in_review')).toEqual([
      'request_changes',
      'publish',
      'schedule',
      'archive',
    ]);
    expect(availableActions('scheduled')).toEqual([
      'request_changes',
      'publish',
      'schedule',
      'cancel_schedule',
    ]);
    expect(availableActions('published')).toEqual(['unpublish']);
    expect(availableActions('unpublished')).toEqual([
      'publish',
      'schedule',
      'archive',
    ]);
    expect(availableActions('archived')).toEqual(['restore']);
    expect(canTransition('published', 'archive')).toBe(false);
    expect(canTransition('archived', 'publish')).toBe(false);
  });

  it('every status can eventually reach published and archived (no dead ends)', () => {
    const reach = (start: string, goal: string): boolean => {
      const seen = new Set<string>([start]);
      const queue = [start];
      while (queue.length) {
        const s = queue.shift() as string;
        if (s === goal) return true;
        for (const a of BLOG_WORKFLOW_ACTIONS) {
          const def = BLOG_TRANSITIONS[a];
          if (def.from.includes(s as never) && !seen.has(def.to)) {
            seen.add(def.to);
            queue.push(def.to);
          }
        }
      }
      return false;
    };
    for (const s of BLOG_POST_STATUSES) {
      expect(reach(s, 'published')).toBe(true);
      expect(reach(s, 'archived')).toBe(true);
    }
  });
});
