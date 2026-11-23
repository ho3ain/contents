import { Injectable } from '@nestjs/common';

/**
 * The single source of "now" for every time-based financial rule (holding
 * release, refund window, payout cool-down, automatic settlement).
 *
 * Production uses the system clock. It is an injectable class — not
 * `new Date()` scattered through the code — so a test can move time forward
 * deterministically instead of sleeping (the work plan forbids sleep-based
 * tests). `FinanceClock` has no setter: only the test subclass can move it.
 */
@Injectable()
export class FinanceClock {
  now(): Date {
    return new Date();
  }
}

/** Test double: a clock that only moves when told to. */
export class ManualFinanceClock extends FinanceClock {
  private current: Date;

  constructor(start: Date = new Date()) {
    super();
    this.current = new Date(start.getTime());
  }

  override now(): Date {
    return new Date(this.current.getTime());
  }

  set(at: Date): void {
    this.current = new Date(at.getTime());
  }

  advanceDays(days: number): void {
    this.current = new Date(this.current.getTime() + days * 86_400_000);
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}
