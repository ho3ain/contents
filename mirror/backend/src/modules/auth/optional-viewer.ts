import type {
  AccessTokenPayload,
  AuthTokensService,
} from './auth-tokens.service';

/**
 * Best-effort identification of a signed-in viewer on a PUBLIC route: a
 * missing / invalid / expired token simply means "visitor" (never an error).
 */
export function optionalViewer(
  tokens: AuthTokensService,
  authorization?: string,
): AccessTokenPayload | undefined {
  if (!authorization) return undefined;
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) return undefined;
  try {
    const claims = tokens.verifyAccessToken(token);
    return { sub: claims.sub, role: claims.role };
  } catch {
    return undefined;
  }
}
