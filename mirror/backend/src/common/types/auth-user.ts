import { UserRole } from '../../database/entities/identity/user.entity';

/**
 * The verified principal attached to every authenticated request by the
 * JwtAuthGuard. Roles/status are always read fresh from the database so a
 * suspension or role change takes effect on the next request.
 */
export interface AuthUser {
  id: string;
  /** Optional — phone-primary accounts may have no email. */
  email: string | null;
  role: UserRole;
  /** Login (session family) the access token belongs to, when known. */
  sid?: string;
  /**
   * Present ONLY while an admin is acting as this user (Phase 3). `id` is the
   * impersonated user; the admin is `actingAdminId`. Every audit event and
   * every restriction check keys off this.
   */
  impersonation?: {
    sessionId: string;
    actingAdminId: string;
    expiresAt: Date;
  };
}

export interface RequestWithUser {
  user: AuthUser;
}
