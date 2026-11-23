import { getRequestContext } from '../../common/logging/request-context';
import type { AuthUser } from '../../common/types/auth-user';
import type { ActorType } from './domain/ledger';

/** Who is performing a financial action, with request metadata for the audit trail. */
export interface FinanceActor {
  type: ActorType;
  /** users.id — null for the system / a signed webhook. */
  id: string | null;
  role: 'admin' | 'creator' | 'buyer' | 'system' | 'webhook';
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export const SYSTEM_ACTOR: FinanceActor = {
  type: 'system',
  id: null,
  role: 'system',
};

export const WEBHOOK_ACTOR: FinanceActor = {
  type: 'webhook',
  id: null,
  role: 'webhook',
};

interface RequestLike {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/** Builds the audit actor of an authenticated request (who, role, ip, UA, requestId). */
export function actorFromUser(user: AuthUser, req?: RequestLike): FinanceActor {
  const ua = req?.headers?.['user-agent'];
  const role = String(user.role) as FinanceActor['role'];
  return {
    type: role === 'admin' ? 'admin' : 'user',
    id: user.id,
    role,
    ip: req?.ip ?? null,
    userAgent: Array.isArray(ua) ? ua[0] : (ua ?? null),
    requestId: getRequestContext()?.requestId ?? null,
  };
}
