import { SetMetadata } from '@nestjs/common';
import type { Permission } from './admin-permissions';

export const ADMIN_PERMISSION_KEY = 'admin:permission';
export const ADMIN_STEP_UP_KEY = 'admin:step-up';

/**
 * Declares the permission a handler needs. Takes precedence over the central
 * route table (which remains the safety net).
 */
export const AdminPermission = (permission: Permission) =>
  SetMetadata(ADMIN_PERMISSION_KEY, permission);

/** Forces step-up on a handler even if its permission does not require it. */
export const RequireStepUp = () => SetMetadata(ADMIN_STEP_UP_KEY, true);
