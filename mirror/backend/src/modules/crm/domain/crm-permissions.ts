import { UserRole } from '../../../database/entities/identity/user.entity';

/**
 * Phase C2 §30 — the acquisition permission matrix.
 *
 * The project has exactly three roles (buyer / creator / admin), so a
 * capabilities file is the honest way to express "who may see revenue" and
 * "who may export" without inventing a role model the auth system does not
 * have. Every CRM endpoint declares the capability it needs; the guard checks
 * it against this table.
 *
 * The mapping is deliberately CLOSED and total: a capability that is not
 * listed for a role is denied, rather than allowed by default. A permission
 * added to the list in future therefore fails closed until someone decides
 * who gets it — which is the right direction for acquisition data.
 */
export const CRM_CAPABILITIES = [
  'crm.leads.view',
  'crm.leads.create',
  'crm.leads.edit',
  'crm.leads.assign',
  /** Recording replies/interest, and sending a conversion invite. */
  'crm.leads.convert',
  'crm.leads.import',
  /** Money figures: revenue attribution, sales, order values. */
  'crm.revenue.view',
  'crm.analytics.view',
  /** Bulk CSV export of lead data. */
  'crm.data.export',
] as const;

export type CrmCapability = (typeof CRM_CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<UserRole, readonly CrmCapability[]> = {
  // Admins run the growth team, so they hold every capability today.
  [UserRole.ADMIN]: CRM_CAPABILITIES,
  // A creator and a buyer have no legitimate access to ANY other person's
  // acquisition data — not even a read-only view. They are denied outright
  // rather than shown an empty list, so the endpoints do not become a probe
  // for what exists.
  [UserRole.CREATOR]: [],
  [UserRole.BUYER]: [],
};

export function can(role: UserRole, capability: CrmCapability): boolean {
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

/** The matrix itself, for the admin UI to render and for documentation. */
export function capabilityMatrix(): Record<string, string[]> {
  const matrix: Record<string, string[]> = {};
  for (const role of Object.values(UserRole)) {
    matrix[role] = ROLE_CAPABILITIES[role].filter((capability) =>
      can(role, capability),
    );
  }
  return matrix;
}
