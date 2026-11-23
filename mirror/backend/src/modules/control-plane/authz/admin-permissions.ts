/**
 * Phase 3 / W0 — the capability model of the Admin Control Plane.
 *
 * SINGLE SOURCE OF TRUTH for: the permission catalogue, the roles and the
 * permissions each role holds, which permissions need recent authentication
 * (step-up), which are sensitive, and which fields each permission unlocks.
 * Everything else (guards, the route table, the generated authorization
 * matrix, the UI capability list) is derived from this file.
 *
 * Naming: `<domain>:<resource?>:<action>` — the same style the CRM and the
 * Scale modules already use for their own capability sets.
 */

export const ADMIN_ROLES = [
  'SUPER_ADMIN',
  'PLATFORM_ADMIN',
  'FINANCE_ADMIN',
  'SUPPORT_AGENT',
  'CONTENT_MODERATOR',
  'RISK_ANALYST',
  'READ_ONLY_ADMIN',
  // Phase 7 Epic 2: narrow specialist technical governance roles.
  'TECHNICAL_REVIEWER',
  'SECURITY_REVIEWER',
  'TECHNICAL_REVIEW_MANAGER',
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

interface PermissionDef {
  description: string;
  /** Exposes data that is personal / financial / security-relevant. */
  sensitive?: boolean;
  /** Needs a recent second-factor proof (admin_step_ups). */
  stepUp?: boolean;
}

export const PERMISSIONS = {
  // ---- platform -----------------------------------------------------
  'platform:settings:view': { description: 'View platform settings' },
  'platform:settings:update': {
    description: 'Change platform settings',
  },
  'platform:settings:update_security': {
    description: 'Change security-relevant platform settings',
    sensitive: true,
    stepUp: true,
  },
  'platform:feature_flags:view': { description: 'View feature flags' },
  'platform:feature_flags:update': {
    description: 'Change feature flags and rollouts',
    stepUp: true,
  },
  'platform:kill_switch:update': {
    description: 'Flip a protected emergency switch',
    sensitive: true,
    stepUp: true,
  },
  'system:health:view': { description: 'View system health and queues' },
  'command_center:view': {
    description:
      'Open the Command Center (each section still needs its own permission)',
  },
  // ---- analytics / search / export ----------------------------------
  'analytics:view': { description: 'View canonical business metrics' },
  'analytics:export': { description: 'Export analytics', sensitive: true },
  'search:use': { description: 'Use global search' },
  'exports:create': { description: 'Create a data export' },
  'exports:download_sensitive': {
    description: 'Create / download exports containing personal data',
    sensitive: true,
    stepUp: true,
  },
  // ---- users ----------------------------------------------------------
  'users:view': { description: 'View users (masked contact data)' },
  'users:view_sensitive': {
    description: 'See unmasked contact data and security metadata',
    sensitive: true,
  },
  'users:edit': { description: 'Edit a user through explicit domain actions' },
  'users:suspend': { description: 'Suspend / reinstate a user', stepUp: true },
  'users:impersonate': {
    description: 'Start a controlled impersonation session',
    sensitive: true,
    stepUp: true,
  },
  // ---- finance (consumes Phase 2; never re-implements it) -------------
  'finance:view': {
    description: 'View the finance dashboard and ledger reads',
  },
  'finance:payout:view': { description: 'View the payout queue and payouts' },
  'finance:payout:review': { description: 'Review a payout / place on hold' },
  'finance:payout:approve': {
    description: 'Approve a payout for manual payment',
    sensitive: true,
    stepUp: true,
  },
  'finance:payout:mark_paid': {
    description: 'Confirm a manual payment (marks the payout PAID)',
    sensitive: true,
    stepUp: true,
  },
  'finance:payout:upload_evidence': {
    description: 'Upload / replace payment evidence',
    sensitive: true,
  },
  'finance:payout:view_sensitive': {
    description: 'See the payment destination and evidence',
    sensitive: true,
    stepUp: true,
  },
  'finance:payout:exception': {
    description: 'Record a failure or exception on a payout',
    stepUp: true,
  },
  'finance:refund:view': { description: 'View refunds and refund settlements' },
  'finance:refund:decide': {
    description: 'Approve / reject a refund',
    stepUp: true,
  },
  'finance:reconciliation:view': {
    description: 'View reconciliation batches and exceptions',
  },
  'finance:reconciliation:manage': {
    description: 'Import statements, resolve reconciliation items',
    stepUp: true,
  },
  'finance:exception:view': { description: 'View financial exceptions' },
  'finance:exception:resolve': { description: 'Resolve financial exceptions' },
  'finance:kyc:view': {
    description: 'View creator KYC status',
    sensitive: true,
  },
  'finance:kyc:review': {
    description: 'Move a creator KYC through its state machine',
    sensitive: true,
    stepUp: true,
  },
  'finance:bank:verify': {
    description: 'Verify / disable a creator bank account',
    sensitive: true,
    stepUp: true,
  },
  'finance:hold:manage': {
    description: 'Place / release a financial hold',
    stepUp: true,
  },
  'finance:policy:manage': {
    description: 'Publish a financial policy version',
    stepUp: true,
  },
  'finance:ledger:reverse': {
    description: 'Reverse a ledger transaction (mirror entry)',
    sensitive: true,
    stepUp: true,
  },
  'finance:jobs:run': { description: 'Trigger a financial job manually' },
  'finance:balance:rebuild': {
    description: 'Rebuild a creator balance projection from the ledger',
    stepUp: true,
  },
  // ---- trust & safety --------------------------------------------------
  'moderation:view': { description: 'View moderation cases' },
  'moderation:assign': { description: 'Assign / reassign cases' },
  'moderation:resolve': { description: 'Act on and resolve cases' },
  'moderation:bulk_action': {
    description: 'Preview and execute bulk moderation',
    stepUp: true,
  },
  'content:review': {
    description: 'Review queue, agents and creators moderation',
  },
  'creators:manage': { description: 'Creator approvals and verification' },
  // ---- blog platform ------------------------------------------------
  'blog:view': {
    description: 'Open the blog CMS: posts, drafts, revisions, taxonomy',
  },
  'blog:manage': {
    description:
      'Create and edit articles, upload article media, manage blog categories and tags',
  },
  'blog:publish': {
    description:
      'Editorial sign-off: publish, schedule, unpublish, request changes',
  },
  'risk:view': { description: 'View risk scores, signals and cases' },
  'risk:review': { description: 'Review risk cases' },
  'risk:action': { description: 'Take an action on a risk case', stepUp: true },
  'risk:rules:manage': {
    description: 'Publish risk rule versions',
    stepUp: true,
  },
  // ---- support ---------------------------------------------------------
  'support:view': { description: 'View support tickets' },
  'support:assign': { description: 'Assign / escalate tickets' },
  'support:respond': { description: 'Respond to customers' },
  'support:internal_note': { description: 'Write / read internal notes' },
  // ---- commerce / growth ------------------------------------------------
  'commerce:view': { description: 'View orders and payments' },
  'growth:view': { description: 'View growth, CRM and discovery data' },
  'growth:manage': { description: 'Operate growth, CRM and promotions' },
  // ---- technical human review (Phase 7 Epic 2) --------------------------
  // These govern the human overlay only. None grants product publication,
  // evaluation mutation, Runtime execution, entitlement, or release authority.
  'technical_review:view': {
    description: 'View technical review queue metadata',
    sensitive: true,
  },
  'technical_review:view_sensitive': {
    description: 'Read bounded technical evidence and internal findings',
    sensitive: true,
  },
  'technical_review:claim': {
    description: 'Claim a technical case assigned to self',
    sensitive: true,
  },
  'technical_review:review': {
    description: 'Record scoped human control and finding review',
    sensitive: true,
  },
  'technical_review:decide': {
    description: 'Make a gated first technical decision',
    sensitive: true,
    stepUp: true,
  },
  'technical_review:second_approve': {
    description: 'Provide an independent high-risk second approval',
    sensitive: true,
    stepUp: true,
  },
  'technical_review:security_review': {
    description:
      'Resolve assigned security escalations and record security findings',
    sensitive: true,
  },
  'technical_review:manage': {
    description:
      'Assign/reassign and reopen technical review cases without evidence override',
    sensitive: true,
    stepUp: true,
  },
  // ---- release gate (Phase 7 Epic 3) -------------------------------------
  // View-only specialist capability. Publication remains in the existing
  // workflow, but that workflow now invokes the server-side gate.
  'release_gate:view': {
    description:
      'Read exact release eligibility anchors and blocker explanations',
    sensitive: true,
  },
  // ---- governance --------------------------------------------------------
  'audit:view': { description: 'Search and read the audit trail' },
  'audit:export': {
    description: 'Export the audit trail',
    sensitive: true,
    stepUp: true,
  },
  'audit:verify': { description: 'Verify the audit chain / seal archives' },
  'admin:roles:view': { description: 'View admin roles and assignments' },
  'admin:roles:update': {
    description: 'Grant / revoke admin roles',
    sensitive: true,
    stepUp: true,
  },
  'admin:security:self': {
    description: 'Manage own second factor and step-up',
  },
} as const satisfies Record<string, PermissionDef>;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}
export function permissionNeedsStepUp(p: Permission): boolean {
  const def: PermissionDef = PERMISSIONS[p];
  return def.stepUp === true;
}
export function permissionIsSensitive(p: Permission): boolean {
  return (PERMISSIONS[p] as PermissionDef).sensitive === true;
}

const ALL_VIEW = ALL_PERMISSIONS.filter(
  (p) => p.endsWith(':view') && !permissionIsSensitive(p),
);

/** Everything except what only a SUPER_ADMIN may do is listed per role. */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  PLATFORM_ADMIN: [
    'platform:settings:view',
    'platform:settings:update',
    'platform:feature_flags:view',
    'platform:feature_flags:update',
    'system:health:view',
    'analytics:view',
    'analytics:export',
    'search:use',
    'exports:create',
    'users:view',
    'users:view_sensitive',
    'users:edit',
    'users:suspend',
    'users:impersonate',
    'finance:view',
    'finance:refund:view',
    'finance:payout:view',
    'commerce:view',
    'moderation:view',
    'moderation:assign',
    'moderation:resolve',
    'moderation:bulk_action',
    'content:review',
    'creators:manage',
    'blog:view',
    'blog:manage',
    'blog:publish',
    'risk:view',
    'support:view',
    'support:assign',
    'support:respond',
    'support:internal_note',
    'growth:view',
    'growth:manage',
    'release_gate:view',
    'audit:view',
    'admin:roles:view',
    'admin:security:self',
    'command_center:view',
  ],
  FINANCE_ADMIN: [
    'finance:view',
    'finance:payout:view',
    'finance:payout:review',
    'finance:payout:approve',
    'finance:payout:mark_paid',
    'finance:payout:upload_evidence',
    'finance:payout:view_sensitive',
    'finance:payout:exception',
    'finance:refund:view',
    'finance:refund:decide',
    'finance:reconciliation:view',
    'finance:reconciliation:manage',
    'finance:exception:view',
    'finance:exception:resolve',
    'finance:kyc:view',
    'finance:kyc:review',
    'finance:bank:verify',
    'finance:hold:manage',
    'finance:policy:manage',
    'finance:ledger:reverse',
    'finance:jobs:run',
    'finance:balance:rebuild',
    'commerce:view',
    'analytics:view',
    'search:use',
    'exports:create',
    'users:view',
    'audit:view',
    'admin:security:self',
    'command_center:view',
  ],
  SUPPORT_AGENT: [
    'support:view',
    'support:assign',
    'support:respond',
    'support:internal_note',
    'users:view',
    'users:impersonate',
    'commerce:view',
    'search:use',
    'moderation:view',
    'admin:security:self',
    'command_center:view',
  ],
  CONTENT_MODERATOR: [
    'moderation:view',
    'moderation:assign',
    'moderation:resolve',
    'moderation:bulk_action',
    'content:review',
    'creators:manage',
    'blog:view',
    'blog:manage',
    'blog:publish',
    'users:view',
    'search:use',
    'support:view',
    'admin:security:self',
    'command_center:view',
  ],
  RISK_ANALYST: [
    'risk:view',
    'risk:review',
    'risk:action',
    'risk:rules:manage',
    'moderation:view',
    'moderation:assign',
    'moderation:resolve',
    'users:view',
    'finance:view',
    'commerce:view',
    'analytics:view',
    'search:use',
    'admin:security:self',
    'command_center:view',
  ],
  READ_ONLY_ADMIN: [...ALL_VIEW, 'search:use', 'admin:security:self'],
  TECHNICAL_REVIEWER: [
    'technical_review:view',
    'technical_review:view_sensitive',
    'release_gate:view',
    'technical_review:claim',
    'technical_review:review',
    'technical_review:decide',
    'admin:security:self',
  ],
  SECURITY_REVIEWER: [
    'technical_review:view',
    'technical_review:view_sensitive',
    'release_gate:view',
    // May record a scoped human control review/finding but cannot make the
    // first technical decision. A distinct security reviewer confirms High risk.
    'technical_review:review',
    'technical_review:security_review',
    'technical_review:second_approve',
    'admin:security:self',
  ],
  TECHNICAL_REVIEW_MANAGER: [
    'technical_review:view',
    'technical_review:view_sensitive',
    'technical_review:manage',
    'release_gate:view',
    'admin:security:self',
  ],
};

/** Roles that may ever hold the permission (used by docs and tests). */
export function rolesHolding(p: Permission): AdminRole[] {
  return ADMIN_ROLES.filter((r) => ROLE_PERMISSIONS[r].includes(p));
}

/** Roles initially allowed to impersonate (spec §15). */
export const IMPERSONATION_ROLES: readonly AdminRole[] = [
  'SUPER_ADMIN',
  'PLATFORM_ADMIN',
  'SUPPORT_AGENT',
];

/** The effective permission set: union of roles minus per-assignment denials. */
export function effectivePermissions(
  assignments: ReadonlyArray<{
    role: AdminRole;
    deniedPermissions: readonly string[];
  }>,
): Set<Permission> {
  const out = new Set<Permission>();
  for (const a of assignments) {
    const denied = new Set(a.deniedPermissions);
    for (const p of ROLE_PERMISSIONS[a.role]) {
      if (!denied.has(p)) out.add(p);
    }
  }
  return out;
}

/** Fields (by dotted name) and the permission that unlocks them. */
export const FIELD_POLICY: Record<string, Permission> = {
  'user.email': 'users:view_sensitive',
  'user.phone': 'users:view_sensitive',
  'user.security': 'users:view_sensitive',
  'user.kyc': 'finance:kyc:view',
  'user.financial': 'finance:view',
  'user.risk': 'risk:view',
  'payout.destination': 'finance:payout:view_sensitive',
  'payout.evidence': 'finance:payout:view_sensitive',
  'ticket.internal_notes': 'support:internal_note',
  'case.internal_notes': 'moderation:view',
};

export function maskEmail(email: string | null): string | null {
  if (!email) return email;
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

export function maskPhone(phone: string | null): string | null {
  if (!phone) return phone;
  return phone.length <= 4
    ? '***'
    : `${phone.slice(0, 3)}${'*'.repeat(Math.max(phone.length - 5, 3))}${phone.slice(-2)}`;
}
