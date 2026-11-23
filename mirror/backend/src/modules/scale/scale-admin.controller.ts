import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../../database/entities/identity/user.entity';
import { Ambassador } from '../../database/entities/scale/ambassador.entity';
import { Affiliate } from '../../database/entities/scale/affiliate.entity';
import { AffiliateCommission } from '../../database/entities/scale/affiliate-commission.entity';
import { GrowthRiskFlag } from '../../database/entities/scale/growth-risk-flag.entity';
import { GrowthReportsService } from './growth-reports.service';
import { Partnership } from '../../database/entities/scale/partnership.entity';
import { ReferralReward } from '../../database/entities/scale/referral-reward.entity';
import { CreatorProfile } from '../../database/entities/identity/creator-profile.entity';
import type { RequestWithUser } from '../../common/types/auth-user';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AmbassadorService } from './ambassador.service';
import { AffiliateService } from './affiliate.service';
import { CommunityService } from './community.service';
import { PartnershipService } from './partnership.service';
import { RewardService } from './reward.service';
import { nextRewardStatus } from './domain/money';
import {
  AffiliateDecisionDto,
  AmbassadorLevelDto,
  AmbassadorStatusDto,
  CreatePartnershipDto,
  AmbassadorListQueryDto,
  AffiliateListQueryDto,
  ListQueryDto,
  PartnershipListQueryDto,
  RiskFlagListQueryDto,
  ModerateCommunityDto,
  PartnershipTransitionDto,
  RewardTransitionDto,
  RiskFlagResolveDto,
} from './dto/scale.dto';

/**
 * Phase C5 — admin routes.
 *
 * Everything here is money or a status an outside party can see, so each
 * handler is deliberately boring: it takes a reason, it calls one domain
 * function, and it audits the result. There is no path in this controller
 * that writes a reward amount — §37's "never trust the frontend" is enforced
 * by the absence of the field, not by a check.
 */
@Controller('admin/scale')
@Roles(UserRole.ADMIN)
export class ScaleAdminController {
  constructor(
    private readonly rewards: RewardService,
    private readonly ambassadors: AmbassadorService,
    private readonly affiliates: AffiliateService,
    private readonly partnerships: PartnershipService,
    private readonly community: CommunityService,
    @InjectRepository(ReferralReward)
    private readonly rewardRows: Repository<ReferralReward>,
    @InjectRepository(AffiliateCommission)
    private readonly commissionRows: Repository<AffiliateCommission>,
    @InjectRepository(Affiliate)
    private readonly affiliateRows: Repository<Affiliate>,
    @InjectRepository(Ambassador)
    private readonly ambassadorRows: Repository<Ambassador>,
    @InjectRepository(Partnership)
    private readonly partnershipRows: Repository<Partnership>,
    @InjectRepository(GrowthRiskFlag)
    private readonly riskFlags: Repository<GrowthRiskFlag>,
    private readonly growthReports: GrowthReportsService,
    @InjectRepository(CreatorProfile)
    private readonly profiles: Repository<CreatorProfile>,
    private readonly dataSource: DataSource,
  ) {}

  // ---- §32 the C5 growth dashboard -----------------------------------

  /**
   * One screen for every channel. §32's five blocks, each computed from the
   * tables that own it.
   *
   * `null` is used for every rate that could not be measured, and the UI
   * renders it as "—". A dashboard that shows 0% for an unmeasured funnel
   * will have a channel shut down for a problem it does not have.
   */
  @Get('dashboard')
  async dashboard() {
    const [ambassador, partnership, community] = await Promise.all([
      this.ambassadors.analytics(),
      this.partnerships.analytics(),
      this.community.analytics(),
    ]);

    const referral = await this.referralStats();
    const affiliate = await this.affiliateStats();

    return {
      referral,
      ambassador,
      affiliate,
      partnership: {
        activePartners: partnership.active,
        totalPartners: partnership.total,
        leads: partnership.leads,
        conversions: null,
        revenueMinor: null,
        // §15's contradictions, surfaced rather than repaired.
        warnings: partnership.warnings,
      },
      community,
      // §44: the honest footer. There is no automatic payout and no external
      // calendar; the UI says so instead of implying otherwise.
      capabilities: {
        automaticPayout: false,
        externalCommunityProvider: false,
        socialPublishing: false,
      },
    };
  }

  private async referralStats() {
    const rows = await this.dataSource.query<
      Array<{
        total: number;
        creator_refs: number;
        buyer_refs: number;
        revenue: string;
        rewards: number;
        paid_out: string;
      }>
    >(`
      SELECT
        (SELECT COUNT(*) FROM creator_referrals)::int AS total,
        (SELECT COUNT(*) FROM creator_referrals WHERE referral_kind = 'creator')::int AS creator_refs,
        (SELECT COUNT(*) FROM creator_referrals WHERE referral_kind = 'buyer')::int AS buyer_refs,
        (SELECT COALESCE(SUM(attributed_revenue_minor), 0)::bigint FROM creator_referrals)::text AS revenue,
        (SELECT COUNT(*) FROM referral_rewards)::int AS rewards,
        (SELECT COALESCE(SUM(amount_minor), 0)::bigint FROM referral_rewards
          WHERE status IN ('available','paid'))::text AS paid_out
    `);
    const row = rows[0] ?? {};
    const total = row.total ?? 0;
    const converted = await this.dataSource.query<Array<{ n: number }>>(
      `SELECT COUNT(*)::int AS n FROM creator_referrals WHERE stage IN ('first_sale','rewarded')`,
    );
    const conversions = converted[0]?.n ?? 0;
    return {
      totalReferrals: total,
      creatorReferrals: row.creator_refs ?? 0,
      buyerReferrals: row.buyer_refs ?? 0,
      conversions,
      conversionRate: total > 0 ? conversions / total : null,
      revenueMinor: Number.parseInt(String(row.revenue ?? '0'), 10),
      rewardsCreated: row.rewards ?? 0,
      paidOutMinor: Number.parseInt(String(row.paid_out ?? '0'), 10),
    };
  }

  private async affiliateStats() {
    const rows = await this.dataSource.query<
      Array<{
        active: number;
        total: number;
        conversions: number;
        clicks: number;
        commission: string;
        gross: string;
      }>
    >(`
      SELECT
        (SELECT COUNT(*) FROM affiliates WHERE status = 'approved')::int AS active,
        (SELECT COUNT(*) FROM affiliates)::int AS total,
        (SELECT COUNT(*) FROM affiliate_commissions)::int AS conversions,
        (SELECT COALESCE(SUM(click_count), 0)::int FROM affiliates)::int AS clicks,
        (SELECT COALESCE(SUM(amount_minor), 0)::bigint FROM affiliate_commissions
          WHERE status IN ('available','paid'))::text AS commission,
        (SELECT COALESCE(SUM(amount_minor), 0)::bigint FROM affiliate_commissions)::text AS gross
    `);
    const row = rows[0] ?? {};
    const clicks = row.clicks ?? 0;
    const conversions = row.conversions ?? 0;
    return {
      activeAffiliates: row.active ?? 0,
      totalAffiliates: row.total ?? 0,
      clicks,
      conversions,
      conversionRate: clicks > 0 ? conversions / clicks : null,
      commissionMinor: Number.parseInt(String(row.commission ?? '0'), 10),
      grossCommissionMinor: Number.parseInt(String(row.gross ?? '0'), 10),
      payoutMode: 'manual_admin_confirmed' as const,
    };
  }

  // ---- C5.1 rewards (§46) --------------------------------------------

  @Get('rewards')
  async listRewards(@Query() query: ListQueryDto) {
    const page = query.page ?? 0;
    const limit = query.limit ?? 50;
    const [rows, total] = await this.rewardRows.findAndCount({
      where: query.filter ? { status: query.filter } : {},
      order: { createdAt: 'DESC' },
      skip: page * limit,
      take: limit,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        referrerId: row.referrerId,
        reason: row.reason,
        amountMinor: row.amountMinor,
        currency: row.currency,
        status: row.status,
        riskFlag: row.riskFlag,
        // The next legal action, computed from the state machine so the admin
        // is never offered a button that would be refused.
        next: this.nextActions(row.status),
        createdAt: row.createdAt,
      })),
      total,
      page,
      hasMore: page * limit + rows.length < total,
    };
  }

  private nextActions(status: string): string[] {
    return (['approved', 'available', 'paid', 'reversed'] as const).filter(
      (target) => nextRewardStatus(status as never, target),
    );
  }

  @Post('rewards/:id/transition')
  @HttpCode(200)
  async transitionReward(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id') id: string,
    @Body() dto: RewardTransitionDto,
  ) {
    const result = await this.rewards.transition(id, dto.status, user.id, {
      reason: dto.reason,
      paidReference: dto.paidReference,
    });
    return result;
  }

  // ---- C5.2 ambassadors (§46) ----------------------------------------

  @Get('ambassadors')
  async listAmbassadors(@Query() query: AmbassadorListQueryDto) {
    const [rows, total] = await this.ambassadorRows.findAndCount({
      where: query.filter ? { status: query.filter } : {},
      order: { createdAt: 'DESC' },
      skip: (query.page ?? 0) * (query.limit ?? 50),
      take: query.limit ?? 50,
    });
    return {
      items: rows,
      total,
      analytics: await this.ambassadors.analytics(),
    };
  }

  @Post('ambassadors/invite')
  async inviteAmbassador(
    @CurrentUser() user: RequestWithUser['user'],
    @Body() body: { creatorProfileId: string },
  ) {
    return this.ambassadors.invite(body.creatorProfileId, user.id);
  }

  @Post('ambassadors/:id/status')
  @HttpCode(200)
  async setAmbassadorStatus(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id') id: string,
    @Body() dto: AmbassadorStatusDto,
  ) {
    return this.ambassadors.setStatus(
      id,
      dto.status,
      user.id,
      dto.reason ?? null,
    );
  }

  /** §12 — tiers are admin-managed data, not code. */
  @Post('ambassador-levels')
  async upsertLevel(
    @CurrentUser() user: RequestWithUser['user'],
    @Body() dto: AmbassadorLevelDto,
  ) {
    return this.ambassadors.upsertLevel(dto, user.id);
  }

  /**
   * §12 — the ladder the admin page edits has to be readable, not just
   * writable: a POST-only API forces the admin to trust that the write
   * landed. Active levels only, ordered by rank.
   */
  @Get('ambassador-levels')
  async listLevels() {
    const levels = await this.ambassadors.listLevels();
    return { levels };
  }

  /**
   * Deactivation (the service keeps the row). 200, not 204: the body carries
   * the outcome the admin UI confirms on.
   */
  @Delete('ambassador-levels/:id')
  @HttpCode(200)
  async removeLevel(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id') id: string,
  ) {
    await this.ambassadors.removeLevel(id, user.id);
    return { deleted: true };
  }

  // ---- C5.3 partnerships (§46) ---------------------------------------

  @Get('partnerships')
  async listPartnerships(@Query() query: PartnershipListQueryDto) {
    const [rows, total] = await this.partnershipRows.findAndCount({
      where: query.filter ? { stage: query.filter } : {},
      order: { createdAt: 'DESC' },
      skip: (query.page ?? 0) * (query.limit ?? 50),
      take: query.limit ?? 50,
    });
    return {
      items: rows,
      total,
      analytics: await this.partnerships.analytics(),
    };
  }

  @Post('partnerships')
  async createPartnership(
    @CurrentUser() user: RequestWithUser['user'],
    @Body() dto: CreatePartnershipDto,
  ) {
    return this.partnerships.create(
      dto.leadId,
      {
        name: dto.name,
        type: dto.type,
        ownerId: dto.ownerId ?? null,
        attributionMethod: dto.attributionMethod as never,
        notes: dto.notes ?? null,
        internalNotes: dto.internalNotes ?? null,
        brings: dto.brings ?? 'both',
      },
      user.id,
    );
  }

  @Post('partnerships/:id/transition')
  @HttpCode(200)
  async transitionPartnership(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id') id: string,
    @Body() dto: PartnershipTransitionDto,
  ) {
    return this.partnerships.transition(id, dto.stage, user.id, {
      agreementStatus: dto.agreementStatus as never,
      endDate: dto.endDate,
    });
  }

  @Get('partnerships/:id/performance')
  async partnershipPerformance(@Param('id') id: string) {
    return this.partnerships.performance(id);
  }

  // ---- C5.4 affiliates (§46) -----------------------------------------

  @Get('affiliates')
  async listAffiliates(@Query() query: AffiliateListQueryDto) {
    const [rows, total] = await this.affiliateRows.findAndCount({
      where: query.filter ? { status: query.filter } : {},
      order: { createdAt: 'DESC' },
      skip: (query.page ?? 0) * (query.limit ?? 50),
      take: query.limit ?? 50,
    });
    return { items: rows, total };
  }

  @Post('affiliates/:id/decision')
  @HttpCode(200)
  async decideAffiliate(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id') id: string,
    @Body() dto: AffiliateDecisionDto,
  ) {
    return this.affiliates.decide(
      id,
      dto.decision,
      user.id,
      dto.reason ?? null,
    );
  }

  @Get('commissions')
  async listCommissions(@Query() query: ListQueryDto) {
    const [rows, total] = await this.commissionRows.findAndCount({
      where: query.filter ? { status: query.filter } : {},
      order: { createdAt: 'DESC' },
      skip: (query.page ?? 0) * (query.limit ?? 50),
      take: query.limit ?? 50,
    });
    return { items: rows, total };
  }

  @Post('commissions/:id/transition')
  @HttpCode(200)
  async transitionCommission(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id') id: string,
    @Body() dto: RewardTransitionDto,
  ) {
    // Commissions and rewards share ONE state machine (`domain/money.ts`).
    // The transition itself is applied to the commission table with the same
    // FOR UPDATE + validate + audit sequence, so a bug fixed for one is fixed
    // for both.
    return this.rewards.transitionCommission(id, dto.status, user.id, {
      reason: dto.reason,
      paidReference: dto.paidReference,
    });
  }

  /**
   * §48 — the admin reporting suite.
   *
   * One endpoint for the whole set rather than eight: the Reports screen
   * loads them together, and splitting them would mean eight round trips to
   * draw one page. Each section is also available on its own for the drill-down.
   */
  @Get('reports')
  async reports() {
    return this.growthReports.all();
  }

  @Get('reports/top-creators')
  async topCreators() {
    return this.growthReports.topCreatorsByReferral();
  }

  @Get('reports/top-ambassadors')
  async topAmbassadors() {
    return this.growthReports.topAmbassadors();
  }

  @Get('reports/top-affiliates')
  async topAffiliates() {
    return this.growthReports.topAffiliates();
  }

  @Get('reports/top-partners')
  async topPartners() {
    return this.growthReports.topPartners();
  }

  @Get('reports/cost-of-acquisition')
  async costOfAcquisition() {
    return this.growthReports.costOfAcquisition();
  }

  @Get('reports/conversion-rates')
  async conversionRates() {
    return this.growthReports.conversionRates();
  }

  // ---- §47 risk flags ------------------------------------------------

  @Get('risk-flags')
  async listRiskFlags(@Query() query: RiskFlagListQueryDto) {
    const [rows, total] = await this.riskFlags.findAndCount({
      where: query.filter ? { status: query.filter } : {},
      order: { createdAt: 'DESC' },
      skip: (query.page ?? 0) * (query.limit ?? 50),
      take: query.limit ?? 50,
    });
    return { items: rows, total };
  }

  @Post('risk-flags/:id/resolve')
  @HttpCode(200)
  async resolveRiskFlag(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id') id: string,
    @Body() dto: RiskFlagResolveDto,
  ) {
    const flag = await this.riskFlags.findOneBy({ id });
    if (!flag) return { changed: false, blocked: 'not_found' };
    flag.status = dto.status;
    flag.resolvedBy = user.id;
    flag.resolvedAt = new Date();
    flag.resolutionNote = dto.note;
    await this.riskFlags.save(flag);
    return { changed: true, blocked: null };
  }

  // ---- §29 community moderation --------------------------------------

  @Patch('community/moderate')
  @HttpCode(200)
  async moderate(
    @CurrentUser() user: RequestWithUser['user'],
    @Body()
    body: { postId?: string; commentId?: string } & ModerateCommunityDto,
  ) {
    return this.community.moderate(body, body.hidden, user.id);
  }
}
