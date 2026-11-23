import { IsIn } from 'class-validator';
import { ENTITLEMENT_CAPABILITIES } from '../entitlement-domain';

/** A buyer may ask about a closed MESH capability, never submit a policy. */
export class AccessDecisionDto {
  @IsIn(ENTITLEMENT_CAPABILITIES)
  capability: (typeof ENTITLEMENT_CAPABILITIES)[number];
}
