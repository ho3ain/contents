/**
 * W6 — how money actually leaves Mesh. NO automatic transfer exists: the
 * only provider is a manual bank transfer performed by an operator, who then
 * records the bank's reference. A future PSP/bank API implements this port;
 * nothing in the payout engine assumes more than this.
 */
export interface PayoutProviderPort {
  readonly name: string;
  /** False: an operator moves the money and records the reference. */
  readonly automatic: boolean;
  validateReference(reference: string): string | null;
}

export class ManualBankTransferProvider implements PayoutProviderPort {
  readonly name = 'MANUAL_BANK_TRANSFER';
  readonly automatic = false;

  validateReference(reference: string): string | null {
    const value = (reference ?? '').trim();
    return /^[A-Za-z0-9][A-Za-z0-9\-_/.]{5,63}$/.test(value) ? value : null;
  }
}

export const PAYOUT_PROVIDER = Symbol('PAYOUT_PROVIDER');
