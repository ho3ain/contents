import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { ApiException } from '../../../common/errors/api-error';
import type { AuthUser } from '../../../common/types/auth-user';
import {
  AdminAuditService,
  adminActorFromRequest,
} from '../audit/admin-audit.service';
import { adminAuthzDenialsTotal } from '../control-plane-metrics';
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  effectivePermissions,
  permissionNeedsStepUp,
  type AdminRole,
  type Permission,
} from './admin-permissions';
import { permissionForRoute } from './route-permissions';
import { decideImpersonatedRequest } from '../impersonation/impersonation-policy';

export interface AdminPrincipal {
  userId: string;
  roles: AdminRole[];
  permissions: Set<Permission>;
  /** role = 'admin' with no assignment: pre-Phase-3 behaviour (see below). */
  legacy: boolean;
}

interface RequestLike {
  method: string;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  route?: { path?: string };
  path?: string;
  adminPrincipal?: AdminPrincipal;
}

/**
 * Permissions a LEGACY admin (users.role = 'admin' with no explicit role
 * assignment) never receives: impersonation and the emergency switches must
 * be granted deliberately, never inherited from a generic admin flag (§15).
 */
const LEGACY_EXCLUDED: ReadonlySet<Permission> = new Set([
  'users:impersonate',
  'platform:kill_switch:update',
]);

function legacyMode(): 'full' | 'deny' {
  return process.env.ADMIN_LEGACY_ACCESS === 'deny' ? 'deny' : 'full';
}
function stepUpEnforced(): boolean {
  return process.env.ADMIN_STEP_UP_ENFORCEMENT !== 'off';
}

/**
 * Phase 3 / W0 — resource-independent admin authorization.
 *
 * Authentication has already run (JwtAuthGuard); the legacy role check has
 * already established `role = admin`. This service answers the next
 * questions, always from the DATABASE (never from token claims, so a revoked
 * role stops working on the next request):
 *   1. which capabilities does this admin hold?
 *   2. does this route require one they lack?
 *   3. does it require a recent second factor they have not given?
 */
@Injectable()
export class AdminAccessService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AdminAuditService,
  ) {}

  async principal(userId: string): Promise<AdminPrincipal> {
    const rows = await this.dataSource.query<
      Array<{ admin_role: AdminRole; denied_permissions: string[] }>
    >(
      `SELECT admin_role, denied_permissions
         FROM admin_role_assignments
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    if (rows.length === 0) {
      if (legacyMode() === 'deny') {
        return { userId, roles: [], permissions: new Set(), legacy: true };
      }
      const perms = new Set(
        ALL_PERMISSIONS.filter((p) => !LEGACY_EXCLUDED.has(p)),
      );
      return { userId, roles: [], permissions: perms, legacy: true };
    }
    const roles = rows.map((r) => r.admin_role);
    return {
      userId,
      roles,
      permissions: effectivePermissions(
        rows.map((r) => ({
          role: r.admin_role,
          deniedPermissions: r.denied_permissions ?? [],
        })),
      ),
      legacy: false,
    };
  }

  has(principal: AdminPrincipal, permission: Permission): boolean {
    return principal.permissions.has(permission);
  }

  /** Throws 403 unless the principal holds `permission` (and, if needed, step-up). */
  async require(
    user: AuthUser,
    permission: Permission,
    req?: RequestLike,
    forceStepUp = false,
  ): Promise<AdminPrincipal> {
    const principal = req?.adminPrincipal ?? (await this.principal(user.id));
    if (req) req.adminPrincipal = principal;
    if (!principal.permissions.has(permission)) {
      await this.deny(user, req, permission, principal, 'missing_permission');
    }
    if (forceStepUp || permissionNeedsStepUp(permission)) {
      await this.requireStepUp(user, req, permission, principal);
    }
    return principal;
  }

  /** The route-level decision used by the global RolesGuard. */
  async authorizeRoute(
    user: AuthUser,
    req: RequestLike,
    explicit?: Permission,
    forceStepUp = false,
  ): Promise<void> {
    const pattern = req.route?.path ?? req.path ?? '';
    const permission = explicit ?? permissionForRoute(req.method, pattern);
    const principal = await this.principal(user.id);
    req.adminPrincipal = principal;
    if (!permission) {
      // No rule: only a SUPER_ADMIN may pass (deny by default).
      if (
        principal.roles.includes('SUPER_ADMIN') ||
        (principal.legacy && legacyMode() === 'full')
      )
        return;
      await this.deny(user, req, null, principal, 'unmapped_route');
      return;
    }
    await this.require(user, permission, req, forceStepUp);
  }

  /** Enforces the impersonation policy (called for every impersonated request). */
  async assertImpersonationAllowed(
    user: AuthUser,
    req: RequestLike,
  ): Promise<void> {
    const pattern = req.route?.path ?? req.path ?? '';
    const decision = decideImpersonatedRequest(req.method, pattern);
    if (decision.allowed) {
      // Audited BEFORE the request runs. A failed audit write refuses the
      // request: impersonated activity must never be invisible (§63).
      await this.audit.record({
        category: 'IMPERSONATION',
        action: 'impersonation.request',
        severity: 'info',
        actor: adminActorFromRequest(user, req, 'admin'),
        resourceType: 'route',
        resourceId: `${req.method} ${pattern}`.slice(0, 80),
      });
      return;
    }
    adminAuthzDenialsTotal.inc({ reason: 'impersonation_restricted' });
    await this.audit.recordBestEffort({
      category: 'IMPERSONATION',
      action: 'impersonation.blocked_action',
      result: 'DENIED',
      severity: 'warning',
      actor: adminActorFromRequest(user, req, 'admin'),
      resourceType: 'route',
      resourceId: `${req.method} ${pattern}`.slice(0, 80),
      metadata: { reason: decision.reason },
    });
    throw new ApiException(
      'IMPERSONATION_RESTRICTED',
      'This action is not available while impersonating a user',
      HttpStatus.FORBIDDEN,
    );
  }

  // ------------------------------------------------------------------
  // Step-up
  // ------------------------------------------------------------------
  async hasRecentStepUp(userId: string, sid?: string): Promise<boolean> {
    const rows = await this.dataSource.query<unknown[]>(
      `SELECT 1 FROM admin_step_ups
        WHERE user_id = $1
          AND session_family IS NOT DISTINCT FROM $2::uuid
          AND expires_at > now()
        LIMIT 1`,
      [userId, sid ?? null],
    );
    return rows.length > 0;
  }

  private async requireStepUp(
    user: AuthUser,
    req: RequestLike | undefined,
    permission: Permission,
    principal: AdminPrincipal,
  ): Promise<void> {
    if (!stepUpEnforced()) return;
    if (await this.hasRecentStepUp(user.id, user.sid)) return;
    const enrolled = await this.dataSource.query<unknown[]>(
      `SELECT 1 FROM user_totp WHERE user_id = $1 AND confirmed_at IS NOT NULL`,
      [user.id],
    );
    const code =
      enrolled.length > 0 ? 'STEP_UP_REQUIRED' : 'MFA_ENROLLMENT_REQUIRED';
    adminAuthzDenialsTotal.inc({ reason: code.toLowerCase() });
    await this.audit.recordBestEffort({
      category: 'AUTHORIZATION',
      action: 'authorization.step_up_required',
      result: 'DENIED',
      severity: 'notice',
      actor: adminActorFromRequest(user, req, principal.roles[0] ?? 'admin'),
      resourceType: 'permission',
      resourceId: permission,
      metadata: { code },
    });
    throw new ApiException(
      code,
      code === 'STEP_UP_REQUIRED'
        ? 'Confirm your second factor to perform this action'
        : 'Enable two-factor authentication to perform this action',
      HttpStatus.FORBIDDEN,
      { permission },
    );
  }

  private async deny(
    user: AuthUser,
    req: RequestLike | undefined,
    permission: Permission | null,
    principal: AdminPrincipal,
    reason: 'missing_permission' | 'unmapped_route',
  ): Promise<never> {
    adminAuthzDenialsTotal.inc({ reason });
    await this.audit.recordBestEffort({
      category: 'AUTHORIZATION',
      action: 'authorization.denied',
      result: 'DENIED',
      severity: 'notice',
      actor: adminActorFromRequest(user, req, principal.roles[0] ?? 'admin'),
      resourceType: 'route',
      resourceId: req
        ? `${req.method} ${req.route?.path ?? req.path ?? ''}`.slice(0, 80)
        : null,
      metadata: { permission, reason, roles: principal.roles },
    });
    throw new ApiException(
      'FORBIDDEN',
      'You do not have permission to do this',
      HttpStatus.FORBIDDEN,
    );
  }

  /** Roles → permissions, for the UI and the generated matrix. */
  static matrix(): Record<AdminRole, readonly Permission[]> {
    return ROLE_PERMISSIONS;
  }
}
