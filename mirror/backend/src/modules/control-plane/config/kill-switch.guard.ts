import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  FeatureFlagsService,
  type KillSwitchKey,
} from './feature-flags.service';

export const REQUIRES_CAPABILITY_KEY = 'platform:requires-capability';

/**
 * Declares that a route is unavailable while one of the protected emergency
 * switches is OFF. Applied to the money / content entry points
 * (checkout, payout creation and approval, reviews, uploads). Recording the
 * outcome of money that already moved (mark paid / failed, webhooks, refunds)
 * is deliberately NOT gated: a switch must never prevent the books from
 * reflecting reality.
 */
export const RequiresCapability = (...keys: KillSwitchKey[]) =>
  SetMetadata(REQUIRES_CAPABILITY_KEY, keys);

@Injectable()
export class KillSwitchGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: FeatureFlagsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const keys = this.reflector.getAllAndOverride<KillSwitchKey[] | undefined>(
      REQUIRES_CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (keys?.length) await this.flags.assertEnabled(...keys);
    return true;
  }
}
