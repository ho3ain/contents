import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWithUser } from '../types/auth-user';

/**
 * Injects the authenticated user. Use `@CurrentUser('id')` for a single
 * property or `@CurrentUser()` for the whole principal.
 */
export const CurrentUser = createParamDecorator(
  (
    property: keyof RequestWithUser['user'] | undefined,
    ctx: ExecutionContext,
  ) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    return property ? user?.[property] : user;
  },
);
