import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../database/entities/identity/user.entity';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given roles. Admins always pass the check. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
