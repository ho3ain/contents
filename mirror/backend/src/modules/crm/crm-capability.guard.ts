import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {} from 'express';
import { ApiException } from '../../common/errors/api-error';
import type { AuthUser } from '../../common/types/auth-user';
import { can, type CrmCapability } from './domain/crm-permissions';

/** Metadata key for the capability a handler requires. */
export const CRM_CAPABILITY_KEY = 'crm_capability';

/**
 * Declares the acquisition capability a route needs.
 *
 * Applied per-handler rather than at the controller, because the sensitive
 * operations (export, revenue, convert) live among ordinary read routes and
 * a controller-wide requirement would be too coarse to be useful.
 */
export const RequireCrmCapability = (capability: CrmCapability) =>
  SetMetadata(CRM_CAPABILITY_KEY, capability);

/**
 * Enforces `@RequireCrmCapability(...)`.
 *
 * Authentication has already run (RolesGuard is the global guard and extends
 * JwtAuthGuard), so `request.user` is the verified principal — the check
 * below is a ROLE check on an already-authenticated user, never a
 * substitute for authenticating them.
 */
@Injectable()
export class CrmCapabilityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<
      CrmCapability | undefined
    >(CRM_CAPABILITY_KEY, [context.getHandler(), context.getClass()]);
    // No requirement declared: the route keeps C1's existing admin-only
    // policy, which the global RolesGuard already enforces.
    if (!required) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new ApiException(
        'UNAUTHORIZED',
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (can(user.role, required)) return true;
    throw new ApiException(
      'FORBIDDEN',
      `You do not have permission to ${required}`,
      HttpStatus.FORBIDDEN,
    );
  }
}
