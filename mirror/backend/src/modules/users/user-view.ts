import { User } from '../../database/entities/identity/user.entity';

export interface PublicUser {
  id: string;
  /** Optional — phone-primary accounts may have no email. */
  email: string | null;
  username: string | null;
  fullName: string | null;
  phone: string | null;
  country: string | null;
  role: string;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  /** Backend-authoritative onboarding state (AUTH upgrade). */
  onboardingCompleted: boolean;
  /** Marketplace category slugs the user is interested in. */
  interests: string[];
  createdAt: Date;
  /** Avatar system: DiceBear seed identifier. */
  avatarId: string | null;
  /** Avatar background color token (e.g. 'blue', 'rose'). */
  avatarBg: string | null;
  /** Legacy registration-gate record shown on the account page. */
  termsAcceptedAt: Date | null;
  /** Date-shaped bundle identifier; null = recorded before versions existed. */
  termsVersion: string | null;
}

/**
 * Never exposes passwordHash or internal columns. `interestSlugs` is only
 * resolved by callers that need it (GET /me, onboarding); elsewhere it
 * defaults to an empty list.
 */
export function toPublicUser(
  user: User,
  interestSlugs: string[] = [],
): PublicUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName ?? null,
    phone: user.phone ?? null,
    country: user.country ?? null,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerifiedAt !== null,
    phoneVerified: user.phoneVerifiedAt !== null,
    onboardingCompleted: user.onboardingCompletedAt !== null,
    interests: interestSlugs,
    createdAt: user.createdAt,
    avatarId: user.avatarId ?? null,
    avatarBg: user.avatarBg ?? null,
    termsAcceptedAt: user.termsAcceptedAt ?? null,
    termsVersion: user.termsVersion ?? null,
  };
}
