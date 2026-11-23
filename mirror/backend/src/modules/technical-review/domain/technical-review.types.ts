/**
 * Phase 7 Epic 2: a human technical-review overlay. These values deliberately
 * do not mirror evaluation status or legacy publication/review states.
 */
export const TECHNICAL_REVIEW_CASE_STATES = [
  'PendingReview',
  'InReview',
  'ChangesRequested',
  'AwaitingCreatorResponse',
  'AwaitingRetest',
  'Escalated',
  'TechnicallyApproved',
  'Rejected',
  'Superseded',
] as const;
export type TechnicalReviewCaseState =
  (typeof TECHNICAL_REVIEW_CASE_STATES)[number];

export const HUMAN_CONTROL_OUTCOMES = [
  'EvidenceSupportsControl',
  'FindingConfirmed',
  'FindingNotConfirmed',
  'Inconclusive',
  'AdditionalEvidenceRequired',
  'SecurityEscalated',
] as const;
export type HumanControlOutcome = (typeof HUMAN_CONTROL_OUTCOMES)[number];

export const TECHNICAL_FINDING_SEVERITIES = [
  'Low',
  'Medium',
  'High',
  'Critical',
] as const;
export type TechnicalFindingSeverity =
  (typeof TECHNICAL_FINDING_SEVERITIES)[number];

export const TECHNICAL_DECISIONS = [
  'ChangesRequested',
  'SecurityEscalated',
  'TechnicalApprovalProposed',
  'TechnicallyApproved',
  'Rejected',
  'Reopened',
  'Superseded',
] as const;
export type TechnicalDecisionType = (typeof TECHNICAL_DECISIONS)[number];

export const TECHNICAL_ASSIGNMENT_TYPES = ['Technical', 'Security'] as const;
export type TechnicalAssignmentType =
  (typeof TECHNICAL_ASSIGNMENT_TYPES)[number];

export const MUTABLE_TECHNICAL_STATES = new Set<TechnicalReviewCaseState>([
  'PendingReview',
  'InReview',
  'ChangesRequested',
  'AwaitingCreatorResponse',
  'AwaitingRetest',
  'Escalated',
]);

export function requiresIndependentSecondApproval(riskLevel: string): boolean {
  return riskLevel === 'High';
}
