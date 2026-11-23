/**
 * Pure composition of the public Trust & Verification disclosure.
 *
 * The single rule this module exists to enforce: a buyer must be able to tell
 * the difference between "MESH observed this" and "the creator said this".
 * Anything that was not actually observed is reported as not observed - never
 * softened, never omitted, never rolled up into a reassuring badge.
 */

export type DisclosedClaimStatus =
  | 'VerifiedWithinScope'
  | 'Contradicted'
  | 'Inconclusive'
  | 'NotTested'
  | 'NotApplicable';

export interface DisclosedClaim {
  claimKey: string;
  claimType: string;
  status: DisclosedClaimStatus;
  /** True only when MESH recorded its own observation for this claim. */
  independentlyObserved: boolean;
  scope: string;
  limitation: string | null;
}

export interface TrustDisclosure {
  /** `unpublished` and `not_evaluated` are first-class, honest outcomes. */
  state: 'unpublished' | 'not_evaluated' | 'evaluated';
  evaluatedAt: string | null;
  profile: string | null;
  /** Aggregate only. Individual control reasons are never public. */
  controlSummary: {
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    inconclusive: number;
    notApplicable: number;
    /** Mandatory/Conditional controls that are not in an acceptable state. */
    unresolvedRequired: number;
  };
  claims: DisclosedClaim[];
  /** Plain-language limits a buyer must read before trusting the above. */
  limitations: string[];
}

interface ControlRow {
  requirement: string;
  outcome: string;
}

interface ClaimRow {
  claimKey: string;
  claimType: string;
  status: string;
  scope: string;
  limitation: string | null;
  observedValue: Record<string, unknown> | null;
}

interface RunRow {
  profile: string;
  finishedAt: Date | null;
  createdAt: Date;
}

const ACCEPTABLE_OUTCOMES = new Set(['Passed', 'NotApplicable']);
const REQUIRED_REQUIREMENTS = new Set(['Mandatory', 'Conditional']);

const count = (rows: ControlRow[], outcome: string) =>
  rows.filter((row) => row.outcome === outcome).length;

export function buildTrustDisclosure(input: {
  published: boolean;
  run: RunRow | null;
  controls: ControlRow[];
  claims: ClaimRow[];
}): TrustDisclosure {
  if (!input.published) {
    return {
      state: 'unpublished',
      evaluatedAt: null,
      profile: null,
      controlSummary: emptySummary(),
      claims: [],
      limitations: [
        'This product is not published, so MESH publishes no verification result for it.',
      ],
    };
  }

  if (!input.run) {
    return {
      state: 'not_evaluated',
      evaluatedAt: null,
      profile: null,
      controlSummary: emptySummary(),
      claims: [],
      limitations: [
        'No completed MESH evaluation is bound to the published version of this product.',
      ],
    };
  }

  const claims: DisclosedClaim[] = input.claims.map((claim) => ({
    claimKey: claim.claimKey,
    claimType: claim.claimType,
    status: claim.status as DisclosedClaimStatus,
    independentlyObserved: claim.observedValue !== null,
    scope: claim.scope,
    limitation: claim.limitation,
  }));

  const limitations = deriveLimitations(claims);

  return {
    state: 'evaluated',
    evaluatedAt: (input.run.finishedAt ?? input.run.createdAt).toISOString(),
    profile: input.run.profile,
    controlSummary: {
      total: input.controls.length,
      passed: count(input.controls, 'Passed'),
      failed: count(input.controls, 'Failed'),
      blocked: count(input.controls, 'Blocked'),
      inconclusive: count(input.controls, 'Inconclusive'),
      notApplicable: count(input.controls, 'NotApplicable'),
      unresolvedRequired: input.controls.filter(
        (control) =>
          REQUIRED_REQUIREMENTS.has(control.requirement) &&
          !ACCEPTABLE_OUTCOMES.has(control.outcome),
      ).length,
    },
    claims,
    limitations,
  };
}

function emptySummary(): TrustDisclosure['controlSummary'] {
  return {
    total: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    inconclusive: 0,
    notApplicable: 0,
    unresolvedRequired: 0,
  };
}

/**
 * Turns the machine statuses into the handful of sentences a buyer actually
 * needs. Every sentence is derived from data; none is marketing copy.
 */
function deriveLimitations(claims: DisclosedClaim[]): string[] {
  const limitations: string[] = [];

  const untested = claims.filter(
    (claim) => claim.status === 'NotTested' || !claim.independentlyObserved,
  );
  if (untested.length) {
    limitations.push(
      `${untested.length} of ${claims.length} declared claims were not independently tested by MESH and remain creator statements.`,
    );
  }

  if (claims.some((claim) => claim.status === 'Contradicted')) {
    limitations.push(
      'At least one declared claim was contradicted by observed technical evidence.',
    );
  }

  if (claims.some((claim) => claim.claimKey === 'product.capabilities')) {
    limitations.push(
      'MESH did not execute this product to confirm its advertised capabilities.',
    );
  }

  limitations.push(
    'A MESH evaluation checks declared records and recorded runtime evidence. It is not a security certification, a quality guarantee, or a warranty of fitness for a particular purpose.',
  );

  return limitations;
}
