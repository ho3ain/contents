import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  AFFILIATE_STATUSES,
  PROMOTION_CHANNELS,
  AUDIENCE_TYPES,
} from '../domain/affiliate';
import { PARTNERSHIP_STAGES, PARTNERSHIP_TYPES } from '../domain/partnership';
import { AMBASSADOR_STATUSES } from '../domain/ambassador';
import { REWARD_STATUSES } from '../domain/money';
import { COMMUNITY_CATEGORIES } from '../../../database/entities/scale/community.entity';

/**
 * Phase C5 request bodies.
 *
 * The pattern throughout: **money and status never arrive from the client.**
 * There is no `amount` field on any reward or commission DTO, and no
 * `rateBps` on the affiliate DTO — §37 says all reward and commission logic
 * is server-side, and a DTO that accepted an amount would make that a lie
 * with a text box in front of it.
 *
 * The one thing a client DOES send is a `reason` on every admin action, which
 * is §46's "every manual adjustment must have a reason".
 */

/** Trim strings so `  affiliate  ` is not a distinct name. */
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ApplyAffiliateDto {
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  displayName: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 500)
  website?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  socialLinks?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  audienceSize?: number;

  @IsArray()
  @IsIn(PROMOTION_CHANNELS, { each: true })
  @ArrayMaxSize(10)
  channels: string[];

  @IsOptional()
  @IsIn(AUDIENCE_TYPES)
  audienceType?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 2000)
  reason?: string;
}

export class AffiliateDecisionDto {
  @IsIn(['approved', 'rejected', 'suspended'])
  decision: 'approved' | 'rejected' | 'suspended';

  /** §21 — required for a rejection; validated in the service, not here,
   *  because the requirement is conditional on `decision`. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 240)
  reason?: string;
}

export class AmbassadorRespondDto {
  @IsIn(['accept', 'decline'])
  answer: 'accept' | 'decline';
}

export class AmbassadorStatusDto {
  @IsIn(['active', 'suspended', 'completed'])
  status: 'active' | 'suspended' | 'completed';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 240)
  reason?: string;
}

export class AmbassadorLevelDto {
  @IsOptional()
  @IsString()
  id?: string;

  @Transform(trim)
  @IsString()
  @Length(2, 48)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 1000)
  description?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  rank: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSales: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  minReferralConversions: number;

  /**
   * The ONLY place a rate enters the system from outside, and it is an
   * admin setting a commercial term, not a claimant asking for a rate.
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  rewardRateBps: number;
}

export class CreatePartnershipDto {
  @IsString()
  @IsNotEmpty()
  leadId: string;

  @Transform(trim)
  @IsString()
  @Length(2, 160)
  name: string;

  @IsIn(PARTNERSHIP_TYPES)
  type: (typeof PARTNERSHIP_TYPES)[number];

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  attributionMethod?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 2000)
  notes?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 4000)
  internalNotes?: string;

  @IsOptional()
  @IsIn(['creators', 'buyers', 'both'])
  brings?: string;
}

export class PartnershipTransitionDto {
  @IsIn(PARTNERSHIP_STAGES)
  stage: (typeof PARTNERSHIP_STAGES)[number];

  @IsOptional()
  @IsString()
  agreementStatus?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class RewardTransitionDto {
  @IsIn(REWARD_STATUSES)
  status: (typeof REWARD_STATUSES)[number];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 240)
  reason?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 120)
  paidReference?: string;
}

export class RiskFlagResolveDto {
  @IsIn(['cleared', 'confirmed'])
  status: 'cleared' | 'confirmed';

  @Transform(trim)
  @IsString()
  @Length(1, 240)
  note: string;
}

export class CommunityPostDto {
  @Transform(trim)
  @IsString()
  @Length(4, 200)
  title: string;

  @Transform(trim)
  @IsString()
  @Length(4, 20_000)
  body: string;

  @IsIn(COMMUNITY_CATEGORIES)
  category: (typeof COMMUNITY_CATEGORIES)[number];
}

export class CommunityCommentDto {
  @Transform(trim)
  @IsString()
  @Length(2, 10_000)
  body: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isAnswer?: boolean;
}

export class ModerateCommunityDto {
  @IsBoolean()
  @Type(() => Boolean)
  hidden: boolean;
}

/**
 * §29 — a member's report on a post.
 *
 * `reason` is free text rather than an enum because the eleven community
 * categories are not the same thing as the reasons a post can be wrong, and
 * forcing the second list to match the first would produce reports that say
 * the wrong thing. It is audited verbatim, never rendered as HTML.
 */
export class CommunityReportDto {
  @IsUUID()
  postId: string;

  @Transform(trim)
  @IsString()
  @Length(2, 80)
  reason: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 500)
  description?: string;
}

export class ReportCommunityDto {
  @Transform(trim)
  @IsString()
  @Length(4, 500)
  reason: string;
}

/**
 * The public referral-link click.
 *
 * §43: a creator shares from a phone. The DTO has no required fields at all
 * so a link opened in any browser — including one that blocks cookies — still
 * records the click and still lands on the page. A 422 here would mean the
 * share silently did nothing.
 */
export class ReferralClickDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 64)
  visitorKey?: string;
}

/** Admin listing filters, all optional. */
export class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /**
   * A list filter. Constrained to the tokens the list endpoints actually
   * accept, rather than to "any lowercase word": a permissive pattern would
   * let `?filter=anything` reach the repository, where a typo becomes an
   * empty result set that looks like "no records" rather than a bad request.
   */
  @IsOptional()
  @IsIn(REWARD_STATUSES, {
    message: `filter must be one of: ${REWARD_STATUSES.join(', ')}`,
  })
  filter?: (typeof REWARD_STATUSES)[number];
}

/**
 * The ambassador list has its OWN status enum. It used to share the reward
 * filter, which meant `?filter=approved` was accepted here and then matched
 * nothing — a silent empty list for a request that looked successful.
 *
 * The same was true of partnerships and affiliates, so each list gets the DTO
 * that matches its own column rather than sharing a generic one.
 */
export class AmbassadorListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(AMBASSADOR_STATUSES, {
    message: `filter must be one of: ${AMBASSADOR_STATUSES.join(', ')}`,
  })
  filter?: (typeof AMBASSADOR_STATUSES)[number];
}

export class PartnershipListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(PARTNERSHIP_STAGES, {
    message: `filter must be one of: ${PARTNERSHIP_STAGES.join(', ')}`,
  })
  filter?: (typeof PARTNERSHIP_STAGES)[number];
}

export class RiskFlagListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(['open', 'cleared', 'confirmed'], {
    message: 'filter must be one of: open, cleared, confirmed',
  })
  filter?: 'open' | 'cleared' | 'confirmed';
}

export class AffiliateListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(AFFILIATE_STATUSES, {
    message: `filter must be one of: ${AFFILIATE_STATUSES.join(', ')}`,
  })
  filter?: (typeof AFFILIATE_STATUSES)[number];
}
