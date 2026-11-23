/**
 * Sprint 2 — refund eligibility + the buyer-facing refund timeline (PURE).
 *
 * ONE source of truth: RefundsService.request enforces exactly this, and the
 * buyer workspace shows exactly this (so the UI can never offer a button the
 * server would refuse, nor hide one it would accept).
 *
 * The refund WINDOW comes from the versioned REFUND finance policy
 * (`finance_policies`, kind REFUND). RefundsService and the buyer journey pass
 * its `windowDays` in; this function reads no environment variable (the old
 * `REFUND_WINDOW_DAYS` setting was retired). `windowDays: 0` means no window.
 */
export type RefundStatusValue =
  'requested' | 'under_review' | 'approved' | 'processed' | 'rejected';

export type RefundIneligibleReason =
  | 'no_order' // free product — nothing was paid
  | 'not_paid'
  | 'already_refunded'
  | 'pending' // a request is already open
  | 'window_expired';

export interface RefundEligibilityInput {
  /** null = the entitlement has no order (free acquisition). */
  order: { status: string; paidAt: Date | null } | null;
  refunds: Array<{ status: RefundStatusValue }>;
  windowDays: number;
  now?: Date;
}

export interface RefundEligibility {
  eligible: boolean;
  reason: RefundIneligibleReason | null;
  /** end of the window, when a window applies to an eligible order */
  windowEndsAt: Date | null;
}

const OPEN: RefundStatusValue[] = ['requested', 'under_review', 'approved'];

export function refundEligibility(
  input: RefundEligibilityInput,
): RefundEligibility {
  const no = (reason: RefundIneligibleReason): RefundEligibility => ({
    eligible: false,
    reason,
    windowEndsAt: null,
  });
  if (!input.order) return no('no_order');
  if (input.order.status === 'refunded') return no('already_refunded');
  if (input.order.status !== 'paid' && input.order.status !== 'fulfilled') {
    return no('not_paid');
  }
  if (input.refunds.some((refund) => OPEN.includes(refund.status))) {
    return no('pending');
  }
  let windowEndsAt: Date | null = null;
  if (input.windowDays > 0) {
    const paidAt = input.order.paidAt;
    if (paidAt) {
      windowEndsAt = new Date(paidAt.getTime() + input.windowDays * 86_400_000);
      if ((input.now ?? new Date()).getTime() > windowEndsAt.getTime()) {
        return no('window_expired');
      }
    }
  }
  return { eligible: true, reason: null, windowEndsAt };
}

export type RefundTimelineStep =
  'submitted' | 'under_review' | 'decision' | 'completed';

export interface RefundTimeline {
  /** the step the request is at right now */
  current: RefundTimelineStep;
  outcome: 'pending' | 'approved' | 'rejected';
  steps: Array<{
    step: RefundTimelineStep;
    state: 'done' | 'current' | 'todo' | 'rejected';
  }>;
}

/** Submitted → Under review → Approved / Rejected → Completed. */
export function refundTimeline(status: RefundStatusValue): RefundTimeline {
  const order: RefundTimelineStep[] = [
    'submitted',
    'under_review',
    'decision',
    'completed',
  ];
  const at: Record<RefundStatusValue, number> = {
    requested: 0,
    under_review: 1,
    approved: 2,
    processed: 3,
    rejected: 2,
  };
  const index = at[status];
  const rejected = status === 'rejected';
  const finished = status === 'processed' || rejected;
  return {
    current: order[index],
    outcome: rejected
      ? 'rejected'
      : status === 'processed' || status === 'approved'
        ? 'approved'
        : 'pending',
    steps: order.map((step, i) => ({
      step,
      state:
        rejected && i === 2
          ? 'rejected'
          : i < index || (finished && i === index && !rejected)
            ? 'done'
            : i === index
              ? 'current'
              : 'todo',
    })),
  };
}
