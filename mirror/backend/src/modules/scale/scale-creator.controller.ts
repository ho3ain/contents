import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../../database/entities/identity/user.entity';
import { CreatorProfile } from '../../database/entities/identity/creator-profile.entity';
import { Ambassador } from '../../database/entities/scale/ambassador.entity';
import { Affiliate } from '../../database/entities/scale/affiliate.entity';
import { CommunityMembership } from '../../database/entities/scale/community.entity';
import type { RequestWithUser } from '../../common/types/auth-user';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotFoundException } from '@nestjs/common';
import { AmbassadorService } from './ambassador.service';
import { AffiliateService } from './affiliate.service';
import { CommunityService } from './community.service';
import { PartnershipService } from './partnership.service';
import { RewardService } from './reward.service';
import { ScaleReferralService } from './referral.service';
import {
  AmbassadorRespondDto,
  ApplyAffiliateDto,
  CommunityCommentDto,
  CommunityPostDto,
  CommunityReportDto,
} from './dto/scale.dto';

/**
 * Phase C5 — creator-facing routes.
 *
 * §36/§37, and the reason this controller is shaped the way it is: every
 * handler resolves the caller's OWN creator profile from their authenticated
 * user id. No handler takes a creator id from the client, and no handler
 * accepts an amount, a rate or a status from the client. There is therefore
 * no request a client can construct that earns somebody money.
 */
@Controller('creator/scale')
@Roles(UserRole.CREATOR)
export class ScaleCreatorController {
  constructor(
    private readonly ambassador: AmbassadorService,
    private readonly affiliate: AffiliateService,
    private readonly community: CommunityService,
    private readonly partnerships: PartnershipService,
    private readonly rewards: RewardService,
    private readonly referrals: ScaleReferralService,
    @InjectRepository(CreatorProfile)
    private readonly profiles: Repository<CreatorProfile>,
    @InjectRepository(Ambassador)
    private readonly ambassadors: Repository<Ambassador>,
    @InjectRepository(Affiliate)
    private readonly affiliates: Repository<Affiliate>,
    @InjectRepository(CommunityMembership)
    private readonly memberships: Repository<CommunityMembership>,
  ) {}

  // ---- C5.1 referral -------------------------------------------------

  /**
   * §4/§8 — the referral dashboard, with §8's actionable advice.
   *
   * The payload is assembled by `ScaleReferralService` against the contract
   * in `api/types.ts` rather than by spreading a raw aggregate into an
   * object literal here. It was the spread that broke the page: the handler
   * returned `clicks`/`revenueMinor`/`byStage` at the top level and a list
   * of advice KEYS, the page read `stats.revenue.amountMinor` and
   * `advice[].title`, and every one of those was `undefined`.
   */
  @Get('referral')
  async referralDashboard(@CurrentUser() user: RequestWithUser['user']) {
    const profile = await this.requireProfile(user.id);
    return this.referrals.creatorReferralView(profile.id, user.id);
  }

  // ---- C5.2 ambassador -----------------------------------------------

  /** §10 — eligibility, every criterion, and the invitation state. */
  @Get('ambassador')
  async ambassadorInvitation(@CurrentUser() user: RequestWithUser['user']) {
    const profile = await this.requireProfile(user.id);
    return this.ambassador.invitationView(profile.id);
  }

  /** §10 — accept or decline. */
  @Post('ambassador/respond')
  @HttpCode(200)
  async respond(
    @CurrentUser() user: RequestWithUser['user'],
    @Body() dto: AmbassadorRespondDto,
  ) {
    const profile = await this.requireProfile(user.id);
    const result = await this.ambassador.respond(profile.id, dto.answer);
    if (result.blocked === 'not_invited') {
      throw new NotFoundException('دعوتی برای شما ثبت نشده است');
    }
    if (result.blocked) {
      throw new NotFoundException('این درخواست در وضعیت فعلی ممکن نیست');
    }
    return { status: result.ambassador?.status };
  }

  /**
   * §40 / §43 — "the creator shared their ambassador link".
   *
   * A real endpoint rather than a client-side event, because §37 requires the
   * server to own this: a share is the single most important action an
   * ambassador can take, and it is the number the programme is judged on. If
   * it were tracked in the browser it could be forged and would vanish with
   * an ad blocker.
   */
  @Post('ambassador/share')
  @HttpCode(200)
  async shareAmbassador(@CurrentUser() user: RequestWithUser['user']) {
    const profile = await this.requireProfile(user.id);
    const recorded = await this.ambassador.recordShare(profile.id);
    return { recorded };
  }

  // ---- C5.4 affiliate -------------------------------------------------

  /** §20 — apply. No payment details are collected (owner decision). */
  @Post('affiliate/apply')
  async apply(
    @CurrentUser() user: RequestWithUser['user'],
    @Body() dto: ApplyAffiliateDto,
  ) {
    const result = await this.affiliate
      .apply({
        userId: user.id,
        displayName: dto.displayName,
        website: dto.website ?? null,
        socialLinks: dto.socialLinks ?? [],
        audienceSize: dto.audienceSize ?? null,
        channels: dto.channels,
        audienceType: dto.audienceType ?? null,
        reason: dto.reason ?? null,
      })
      .catch((error: Error & { field?: string }) => {
        throw new NotFoundException(
          error.field === 'website'
            ? 'وب‌سایت یا حداقل یک لینک شبکه اجتماعی لازم است'
            : 'اطلاعات وارد شده معتبر نیست',
        );
      });

    return {
      id: result.affiliate.id,
      code: result.affiliate.code,
      // §44: the creator is told the truth — an application is not an
      // approval, and showing "approved" here would be a lie the dashboard
      // then contradicts three days later.
      status: result.affiliate.status,
      rateBps: result.affiliate.commissionRateBps,
      payoutMode: 'manual_admin_confirmed',
    };
  }

  /** §22 — the creator's own affiliate numbers. */
  @Get('affiliate')
  async myAffiliate(@CurrentUser() user: RequestWithUser['user']) {
    const affiliate = await this.affiliates.findOneBy({ userId: user.id });
    // Not applied yet is a VIEW (the apply form), not an absence — see
    // `AffiliateService.emptyDashboard`.
    if (!affiliate) return this.affiliate.emptyDashboard();
    return this.affiliate.dashboard(affiliate.id);
  }

  // ---- C5.5 community -------------------------------------------------

  /**
   * §30 — the community entry point inside the creator dashboard.
   *
   * `user.id` is passed through so the feed can answer "did *you* react to
   * this?" — a fact about the viewer that the profile id alone cannot
   * supply.
   */
  @Get('community')
  async communityEntry(@CurrentUser() user: RequestWithUser['user']) {
    const profile = await this.requireProfile(user.id);
    return this.community.entryView(profile.id, user.id);
  }

  /**
   * §29 — report a post. Recorded and routed to an admin; it never hides
   * the post by itself (§47 — a flag is not a block).
   */
  @Post('community/report')
  @HttpCode(200)
  async reportCommunityPost(
    @CurrentUser() user: RequestWithUser['user'],
    @Body() dto: CommunityReportDto,
  ) {
    const profile = await this.requireProfile(user.id);
    return this.community.reportPost({
      postId: dto.postId,
      userId: user.id,
      creatorProfileId: profile.id,
      reason: dto.reason,
      description: dto.description?.trim() ?? null,
    });
  }

  /** §27 — accept the invitation. Idempotent. */
  @Post('community/join')
  @HttpCode(200)
  async joinCommunity(@CurrentUser() user: RequestWithUser['user']) {
    const profile = await this.requireProfile(user.id);
    const result = await this.community.join(profile.id, user.id);
    if (result.blocked === 'not_invited') {
      throw new NotFoundException('هنوز دعوتی برای شما ارسال نشده است');
    }
    return result;
  }

  /** §29 — post. Requires an active membership. */
  @Post('community/posts')
  async createPost(
    @CurrentUser() user: RequestWithUser['user'],
    @Body() dto: CommunityPostDto,
  ) {
    const profile = await this.requireProfile(user.id);
    const result = await this.community.createPost(user.id, profile.id, dto);
    if (result.blocked)
      throw new NotFoundException('برای ارسال پست باید عضو جامعه باشید');
    return {
      id: result.post.id,
      title: result.post.title,
      category: result.post.category,
      createdAt: result.post.createdAt,
    };
  }

  /** §29 — comment or reply. */
  @Post('community/posts/:postId/comments')
  @HttpCode(201)
  async createComment(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('postId') postId: string,
    @Body() dto: CommunityCommentDto,
  ) {
    const profile = await this.requireProfile(user.id);
    const result = await this.community.createComment(
      postId,
      user.id,
      profile.id,
      {
        body: dto.body,
        parentId: dto.parentId ?? null,
        isAnswer: dto.isAnswer ?? false,
      },
    );
    if (result.blocked) throw new NotFoundException('ارسال پیام ممکن نیست');
    return { id: result.comment.id, createdAt: result.comment.createdAt };
  }

  /** §29 — toggle a reaction. Idempotent by design. */
  @Post('community/react')
  @HttpCode(200)
  async react(
    @CurrentUser() user: RequestWithUser['user'],
    @Body() body: { postId?: string; commentId?: string },
  ) {
    if (!body.postId && !body.commentId) {
      throw new NotFoundException('هدف واکنش مشخص نیست');
    }
    return this.community.toggleReaction(user.id, body);
  }

  // ---- internals ------------------------------------------------------

  /**
   * §41 (C4's rule, still C5's): the profile comes from the token. This is
   * the entire IDOR defence, and it works because there is no id in the path
   * to tamper with.
   */
  private async requireProfile(userId: string): Promise<CreatorProfile> {
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) throw new NotFoundException('پروفایل سازنده یافت نشد');
    return profile;
  }
}
