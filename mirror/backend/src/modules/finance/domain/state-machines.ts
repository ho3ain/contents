/**
 * W0.2 — the financial state machines, as DATA.
 *
 * Each machine is a table of the legal edges plus, for every edge, the
 * documented actor, trigger, ledger effect, audit event and failure
 * behaviour. Code asks `assertTransition`, tests iterate every edge, and
 * `docs/finance/generated/state-machines.md` is generated from this file
 * (a unit test fails when the committed document drifts), so documentation
 * cannot disagree with the implementation.
 *
 * Nothing financial is a loose boolean: a state is a value of one of these.
 */
export interface TransitionSpec {
  to: string;
  actor: string;
  trigger: string;
  /** Ledger transaction type posted by this edge, or 'none'. */
  ledger: string;
  audit: string;
  onFailure: string;
}

export interface MachineSpec {
  name: string;
  description: string;
  initial: string;
  states: readonly string[];
  terminal: readonly string[];
  edges: Readonly<Record<string, readonly TransitionSpec[]>>;
}

const t = (
  to: string,
  actor: string,
  trigger: string,
  ledger: string,
  audit: string,
  onFailure: string,
): TransitionSpec => ({ to, actor, trigger, ledger, audit, onFailure });

export const PAYMENT_MACHINE: MachineSpec = {
  name: 'Payment',
  description:
    'Existing commerce state machine (payments.status). Phase 2 adds the ledger effect to the successful edge.',
  initial: 'initiated',
  states: [
    'initiated',
    'pending',
    'successful',
    'failed',
    'cancelled',
    'refunded',
  ],
  terminal: ['failed', 'cancelled', 'refunded'],
  edges: {
    initiated: [
      t(
        'pending',
        'system',
        'gateway session opened',
        'none',
        'payment.status_changed',
        'stays initiated; retry opens a new session',
      ),
      t(
        'failed',
        'system',
        'gateway rejected initiation',
        'none',
        'payment.status_changed',
        'terminal',
      ),
    ],
    pending: [
      t(
        'successful',
        'gateway webhook / verified callback',
        'provider confirms the exact persisted amount',
        'SALE (+ GATEWAY_FEE when the provider reports it)',
        'payment.status_changed',
        'whole transaction rolls back: no payment without ledger',
      ),
      t(
        'failed',
        'gateway / system',
        'provider rejects',
        'none',
        'payment.status_changed',
        'terminal',
      ),
      t(
        'cancelled',
        'buyer / system',
        'buyer abandons',
        'none',
        'payment.status_changed',
        'terminal',
      ),
    ],
    successful: [
      t(
        'refunded',
        'admin',
        'refund approved',
        'REFUND',
        'refund.decided',
        'whole transaction rolls back; refund stays under review',
      ),
    ],
  },
};

export const LEDGER_TX_MACHINE: MachineSpec = {
  name: 'Ledger transaction',
  description:
    'A ledger transaction is inserted already POSTED together with all its entries in one database transaction; it has no draft state and is never updated or deleted. A correction is a REVERSAL transaction (reverses_transaction_id) followed by a CORRECTION transaction.',
  initial: 'POSTED',
  states: ['POSTED'],
  terminal: ['POSTED'],
  edges: {},
};

export const ENTITLEMENT_MACHINE: MachineSpec = {
  name: 'Creator balance (sale entitlement)',
  description:
    'Lifecycle of one sale’s creator entitlement. The creator balance buckets (held / available / payout pending / paid / recovery) are projections of ledger entries; this machine says which bucket a sale’s remaining entitlement is in.',
  initial: 'HELD',
  states: ['HELD', 'RELEASED', 'REFUNDED'],
  terminal: ['REFUNDED'],
  edges: {
    HELD: [
      t(
        'RELEASED',
        'release job (system)',
        'held_until <= now',
        'RELEASE (HELD → AVAILABLE)',
        'finance.entitlement.released',
        'idempotent: a second run posts nothing',
      ),
      t(
        'REFUNDED',
        'refund engine',
        'full refund of the sale',
        'REFUND',
        'finance.refund.posted',
        'rolls back with the refund decision',
      ),
    ],
    RELEASED: [
      t(
        'REFUNDED',
        'refund engine',
        'full refund of the sale',
        'REFUND (AVAILABLE, shortfall → RECOVERY)',
        'finance.refund.posted',
        'rolls back with the refund decision',
      ),
    ],
  },
};

export const REFUND_MACHINE: MachineSpec = {
  name: 'Refund',
  description:
    'Existing commerce refund workflow (refunds.status). On approval the finance engine posts the REFUND ledger transaction inside the same database transaction. The legacy enum value `approved` exists in the database but no code path sets it (approval goes straight to processed), so it is not modelled.',
  initial: 'requested',
  states: ['requested', 'under_review', 'processed', 'rejected'],
  terminal: ['processed', 'rejected'],
  edges: {
    requested: [
      t(
        'under_review',
        'admin',
        'review started',
        'none',
        'refund.review_started',
        'unchanged',
      ),
      t(
        'processed',
        'admin',
        'approve',
        'REFUND',
        'refund.decided',
        'rolls back; stays requested',
      ),
      t('rejected', 'admin', 'reject', 'none', 'refund.decided', 'unchanged'),
    ],
    under_review: [
      t(
        'processed',
        'admin',
        'approve',
        'REFUND',
        'refund.decided',
        'rolls back; stays under_review',
      ),
      t('rejected', 'admin', 'reject', 'none', 'refund.decided', 'unchanged'),
    ],
  },
};

export const PAYOUT_MACHINE: MachineSpec = {
  name: 'Payout',
  description:
    'Funds are reserved (AVAILABLE → PAYOUT_PENDING) atomically when the payout row is created, so REQUESTED already owns its money. Terminal states give the money back (REJECTED/CANCELLED/FAILED) or settle it (PAID). There is deliberately no ELIGIBILITY_CHECK state: eligibility is checked synchronously, inside the creating transaction, and re-checked at approval and at settlement.',
  initial: 'REQUESTED',
  states: [
    'REQUESTED',
    'APPROVED',
    'PROCESSING',
    'PAID',
    'FAILED',
    'CANCELLED',
    'REJECTED',
  ],
  terminal: ['PAID', 'FAILED', 'CANCELLED', 'REJECTED'],
  edges: {
    REQUESTED: [
      t(
        'APPROVED',
        'admin (not the creator)',
        'review passed; KYC + bank re-verified',
        'none',
        'finance.payout.approved',
        'stays REQUESTED; funds stay reserved',
      ),
      t(
        'REJECTED',
        'admin',
        'review failed',
        'PAYOUT_RELEASE (PENDING → AVAILABLE)',
        'finance.payout.rejected',
        'rolls back; stays REQUESTED',
      ),
      t(
        'CANCELLED',
        'creator / admin',
        'cancel before approval',
        'PAYOUT_RELEASE (PENDING → AVAILABLE)',
        'finance.payout.cancelled',
        'rolls back; stays REQUESTED',
      ),
    ],
    APPROVED: [
      t(
        'PROCESSING',
        'admin',
        'manual bank transfer started',
        'none',
        'finance.payout.processing',
        'stays APPROVED',
      ),
      t(
        'CANCELLED',
        'admin',
        'cancel before transfer',
        'PAYOUT_RELEASE (PENDING → AVAILABLE)',
        'finance.payout.cancelled',
        'rolls back; stays APPROVED',
      ),
    ],
    PROCESSING: [
      t(
        'PAID',
        'admin',
        'bank reference recorded; KYC + bank re-verified',
        'PAYOUT_PAID (PENDING → cash out)',
        'finance.payout.paid',
        'rolls back; stays PROCESSING (never PAID without a ledger posting)',
      ),
      t(
        'FAILED',
        'admin / provider',
        'transfer failed',
        'PAYOUT_RELEASE (PENDING → AVAILABLE)',
        'finance.payout.failed',
        'rolls back; stays PROCESSING',
      ),
    ],
  },
};

export const KYC_MACHINE: MachineSpec = {
  name: 'KYC',
  description:
    'Creator identity verification. Authority today: an admin (NOT an external identity provider — the data model records the authority so a provider can be added without touching payouts).',
  initial: 'NOT_STARTED',
  states: [
    'NOT_STARTED',
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'REJECTED',
    'SUSPENDED',
  ],
  terminal: [],
  edges: {
    NOT_STARTED: [
      t(
        'SUBMITTED',
        'creator',
        'submits identity data',
        'none',
        'finance.kyc.submitted',
        'unchanged',
      ),
    ],
    SUBMITTED: [
      t(
        'UNDER_REVIEW',
        'admin',
        'review started',
        'none',
        'finance.kyc.review_started',
        'unchanged',
      ),
      t(
        'SUBMITTED',
        'creator',
        'resubmits (replaces unreviewed data)',
        'none',
        'finance.kyc.submitted',
        'unchanged',
      ),
    ],
    UNDER_REVIEW: [
      t(
        'APPROVED',
        'admin (not the creator)',
        'documents verified',
        'none',
        'finance.kyc.approved',
        'unchanged',
      ),
      t(
        'REJECTED',
        'admin',
        'documents refused (reason required)',
        'none',
        'finance.kyc.rejected',
        'unchanged',
      ),
    ],
    APPROVED: [
      t(
        'SUSPENDED',
        'admin',
        'risk / compliance hold (reason required)',
        'none',
        'finance.kyc.suspended',
        'unchanged',
      ),
    ],
    REJECTED: [
      t(
        'SUBMITTED',
        'creator',
        'resubmits after rejection',
        'none',
        'finance.kyc.submitted',
        'unchanged',
      ),
    ],
    SUSPENDED: [
      t(
        'UNDER_REVIEW',
        'admin',
        'reinstatement review (reason required)',
        'none',
        'finance.kyc.review_started',
        'unchanged',
      ),
    ],
  },
};

export const RECONCILIATION_MACHINE: MachineSpec = {
  name: 'Reconciliation exception',
  description:
    'Every mismatch becomes an explicit exception. Resolving it never edits financial history: a correction, if one is needed, is a normal financial flow whose ledger transaction is referenced by the resolution.',
  initial: 'DETECTED',
  states: ['DETECTED', 'CLASSIFIED', 'INVESTIGATING', 'RESOLVED'],
  terminal: ['RESOLVED'],
  edges: {
    DETECTED: [
      t(
        'CLASSIFIED',
        'admin / system',
        'category and severity assigned',
        'none',
        'finance.recon.classified',
        'unchanged',
      ),
    ],
    CLASSIFIED: [
      t(
        'INVESTIGATING',
        'admin',
        'owner picks it up',
        'none',
        'finance.recon.investigating',
        'unchanged',
      ),
    ],
    INVESTIGATING: [
      t(
        'RESOLVED',
        'admin',
        'resolution recorded (note + optional ledger reference)',
        'none (a correction is a separate normal flow)',
        'finance.recon.resolved',
        'unchanged',
      ),
    ],
  },
};

export const MACHINES = {
  payment: PAYMENT_MACHINE,
  ledgerTransaction: LEDGER_TX_MACHINE,
  creatorBalance: ENTITLEMENT_MACHINE,
  refund: REFUND_MACHINE,
  payout: PAYOUT_MACHINE,
  kyc: KYC_MACHINE,
  reconciliation: RECONCILIATION_MACHINE,
} as const;

export function canTransition(
  machine: MachineSpec,
  from: string,
  to: string,
): boolean {
  return (machine.edges[from] ?? []).some((edge) => edge.to === to);
}

export class IllegalTransitionError extends Error {
  constructor(
    readonly machine: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`${machine}: transition ${from} → ${to} is not allowed`);
    this.name = 'IllegalTransitionError';
  }
}

export function assertTransition(
  machine: MachineSpec,
  from: string,
  to: string,
): void {
  if (!canTransition(machine, from, to)) {
    throw new IllegalTransitionError(machine.name, from, to);
  }
}

/** Renders every machine as Markdown (committed as generated/state-machines.md). */
export function renderStateMachinesMarkdown(): string {
  const lines: string[] = [
    '# Financial state machines (generated)',
    '',
    '> Generated from `src/modules/finance/domain/state-machines.ts` by `scripts/finance/generate-state-machine-docs.ts`.',
    '> Do not edit by hand: a unit test fails when this file differs from the code.',
    '',
  ];
  for (const machine of Object.values(MACHINES)) {
    lines.push(`## ${machine.name}`, '', machine.description, '');
    lines.push(
      `Initial state: \`${machine.initial}\` · States: ${machine.states
        .map((s) => `\`${s}\``)
        .join(', ')} · Terminal: ${
        machine.terminal.length
          ? machine.terminal.map((s) => `\`${s}\``).join(', ')
          : 'none'
      }`,
      '',
    );
    const edges = Object.entries(machine.edges).flatMap(([from, list]) =>
      list.map((edge) => ({ from, ...edge })),
    );
    if (edges.length === 0) {
      lines.push('_No transitions: the state is final on creation._', '');
    } else {
      lines.push(
        '| From | To | Actor | Trigger | Ledger effect | Audit event | On failure |',
        '|---|---|---|---|---|---|---|',
      );
      for (const edge of edges) {
        lines.push(
          `| \`${edge.from}\` | \`${edge.to}\` | ${edge.actor} | ${edge.trigger} | ${edge.ledger} | \`${edge.audit}\` | ${edge.onFailure} |`,
        );
      }
      lines.push('');
      const forbidden: string[] = [];
      for (const from of machine.states) {
        for (const to of machine.states) {
          if (from !== to && !canTransition(machine, from, to)) {
            forbidden.push(`${from} → ${to}`);
          }
        }
      }
      lines.push(
        `Forbidden (every other pair, including any exit from a terminal state): ${
          forbidden.length
            ? forbidden.map((f) => `\`${f}\``).join(', ')
            : 'none'
        }`,
        '',
      );
    }
  }
  return lines.join('\n');
}
