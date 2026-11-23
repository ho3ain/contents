import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * API error codes — the stable machine-readable identifiers of the public
 * error contract (PLAYBOOK Chapter 9.18):
 *
 *   { "success": false, "error": { "code": "AGENT_NOT_FOUND", "message": "..." } }
 */

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'DRAFT_CONFLICT',
  // Phase A3 — review workflow
  'INVALID_TRANSITION',
  'REVIEW_GATE_FAILED',
  // Reviewer trial access refused: never an entitlement failure, so it must
  // not be reported to the client as NOT_ENTITLED.
  'REVIEW_ACCESS_NOT_PERMITTED',
  'FEEDBACK_REQUIRED',
  'FEEDBACK_UNRESOLVED',
  'NO_CHANGES',
  'TOO_MANY_REQUESTS',
  'PAYMENT_FAILED',
  'PAYMENT_PROVIDER_UNAVAILABLE',
  'AGENT_NOT_FOUND',
  'AGENT_NOT_PUBLISHED',
  'ALREADY_PURCHASED',
  'PRICE_CHANGED',
  // Phase 1 — declared recurring/metered payment cannot enter one-time checkout.
  'PAYMENT_MODEL_NOT_SUPPORTED',
  'INVALID_REFUND',
  'INVALID_CREDENTIALS',
  'INVALID_MFA_CODE',
  'EMAIL_TAKEN',
  'USERNAME_TAKEN',
  'PHONE_TAKEN',
  'TOKEN_EXPIRED',
  'TOKEN_INVALID',
  'ACCOUNT_SUSPENDED',
  'NOT_VERIFIED',
  'NOT_IMPLEMENTED',
  'SERVICE_UNAVAILABLE',
  // Phase A4 — Launch & Growth
  'PUBLISH_NOT_ALLOWED',
  'PUBLISH_CHECKLIST_FAILED',
  // Phase 7 Epic 3 — server-enforced exact-anchor release authorization.
  'RELEASE_GATE_BLOCKED',
  'RELEASE_OPERATION_IN_PROGRESS',
  'INVALID_STATE',
  'PROMOTION_NOT_ALLOWED',
  // Gap closure
  'CHANGELOG_LOCKED',
  'NOT_ENTITLED',
  'STORAGE_DISABLED',
  'INVALID_FILE',
  'FILE_TOO_LARGE',
  // Phase 6 — bounded Runtime execution envelope, separate from file upload.
  'PAYLOAD_TOO_LARGE',
  'INTERNAL_ERROR',
  // Phase 2 — financial core
  'KYC_REQUIRED',
  'PAYOUT_NOT_ELIGIBLE',
  'INSUFFICIENT_FUNDS',
  'IDEMPOTENCY_CONFLICT',
  'FINANCE_RULE_VIOLATION',
  'USAGE_LIMIT_EXCEEDED',
  // Phase 3 — admin control plane
  'STEP_UP_REQUIRED',
  'MFA_ENROLLMENT_REQUIRED',
  'IMPERSONATION_RESTRICTED',
  'IMPERSONATION_ENDED',
  'STALE_STATE',
  'FEATURE_DISABLED',
  'EVIDENCE_REQUIRED',
  'BLOCKING_EXCEPTION',
  'UNPROCESSABLE',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export class ApiException extends HttpException {
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: unknown,
  ) {
    super(message, status);
    this.code = code;
    this.details = details;
  }

  static from(
    code: ApiErrorCode,
    message: string,
    status?: HttpStatus,
    details?: unknown,
  ): ApiException {
    return new ApiException(
      code,
      message,
      status ?? HttpStatus.BAD_REQUEST,
      details,
    );
  }
}
