import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ReferralReward,
  Ambassador,
  AmbassadorLevel,
  Partnership,
  Affiliate,
  AffiliateCommission,
  GrowthRiskFlag,
  CommunityMembership,
  CommunityPost,
  CommunityComment,
  CommunityReaction,
} from '../../database/entities';
import { CreatorProfile } from '../../database/entities/identity/creator-profile.entity';
import { CreatorLead } from '../../database/entities/crm/creator-lead.entity';
import { CreatorReferral } from '../../database/entities/success/creator-referral.entity';
import { CreatorReferralEvent } from '../../database/entities/success/creator-referral-event.entity';
import { AuditModule } from '../audit/audit.module';
import { CrmModule } from '../crm/crm.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { ScaleCreatorController } from './scale-creator.controller';
import { ScaleAdminController } from './scale-admin.controller';
import { ScalePublicController } from './scale-public.controller';
import { ScaleReferralService } from './referral.service';
import { RewardService } from './reward.service';
import { AmbassadorService } from './ambassador.service';
import { AffiliateService } from './affiliate.service';
import { GrowthLoopService } from './growth-loop.service';
import { GrowthReportsService } from './growth-reports.service';
import { PartnershipService } from './partnership.service';
import { CommunityService } from './community.service';

/**
 * Phase C5 — SCALE.
 *
 * Five subsystems in one module, mirroring how `success/` held C4's five
 * parts. They share attribution, the money state machine, the audit trail and
 * the notification path; splitting them into five modules would mean five
 * copies of that shared code and five chances for the reward lifecycle to
 * drift from the commission lifecycle.
 *
 * `TypeOrmModule.forFeature` lists entities that are ALREADY registered in a
 * C1–C4 module's `forFeature` (CreatorProfile, CreatorLead, CreatorReferral).
 * That is safe — a second `forFeature` for the same entity gives the same
 * singleton repository — whereas re-declaring a module's `providers` would
 * give a second instance of that module's services.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      // C5's own tables
      ReferralReward,
      Ambassador,
      AmbassadorLevel,
      Partnership,
      Affiliate,
      AffiliateCommission,
      GrowthRiskFlag,
      CommunityMembership,
      CommunityPost,
      CommunityComment,
      CommunityReaction,
      // Owned by earlier phases; read here, not re-declared.
      CreatorProfile,
      CreatorLead,
      CreatorReferral,
      CreatorReferralEvent,
    ]),
    AuditModule,
    CrmModule,
    NotificationsModule,
    // §35 — C5 enqueues its six meaningful events through the existing
    // transactional outbox rather than a parallel mailer.
    EmailModule,
  ],
  controllers: [
    ScaleCreatorController,
    ScaleAdminController,
    ScalePublicController,
  ],
  providers: [
    ScaleReferralService,
    RewardService,
    AmbassadorService,
    AffiliateService,
    PartnershipService,
    CommunityService,
    GrowthLoopService,
    GrowthReportsService,
  ],
  // GrowthLoopService is exported so the commerce module can run the loop at
  // payment confirmation. Without that wiring the funnel has no entry point.
  exports: [
    RewardService,
    ScaleReferralService,
    AmbassadorService,
    GrowthLoopService,
  ],
})
export class ScaleModule {}
